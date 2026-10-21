import type { DataSource } from "typeorm";
import type { Config } from "../config";
import type { Storage } from "../storage/Storage";

export type ComponentStatus = "operational" | "degraded" | "outage";

export type ComponentHealth = {
  id: "api" | "database" | "storage" | "email";
  name: string;
  status: ComponentStatus;
  latencyMs?: number;
  detail: string;
};

export type HealthSample = { at: string; status: ComponentStatus; apiMs: number; dbMs?: number; storageMs?: number };

export type StatusReport = {
  status: ComponentStatus;
  checkedAt: string;
  components: ComponentHealth[];
  service: { version: string; commit: string | null; region: string | null; node: string; startedAt: string; uptimeSeconds: number };
  history: HealthSample[];
};

const CACHE_MS = 15_000;
const HISTORY = 240;
const TIMEOUT_MS = 5_000;

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: true; ms: number; value: T } | { ok: false; ms: number; error: string }> {
  const t0 = performance.now();
  try {
    const value = await Promise.race([
      fn(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS).unref()),
    ]);
    return { ok: true, ms: Math.round(performance.now() - t0), value };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Live health of the API and what it depends on, for the public status page. Checks are cached briefly so the
 * endpoint can't be used to load the database, and a rolling history (in memory) gives uptime and latency.
 * Error details are kept generic: nothing about credentials or hosts is exposed.
 */
export class HealthService {
  private cached?: { at: number; report: Promise<StatusReport> };
  private readonly history: HealthSample[] = [];
  private readonly startedAt = new Date();

  constructor(
    private readonly ds: DataSource,
    private readonly storage: Storage,
    private readonly config: Pick<Config, "STORAGE_DRIVER" | "AWS_REGION" | "MAIL_DRIVER" | "DATABASE_SCHEMA" | "NODE_ENV">,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  report(): Promise<StatusReport> {
    const now = Date.now();
    if (!this.cached || now - this.cached.at > CACHE_MS) this.cached = { at: now, report: this.check() };
    return this.cached.report;
  }

  /** Runs the checks and records a history sample (also called on a timer). */
  async check(): Promise<StatusReport> {
    const t0 = performance.now();
    const [db, storage] = await Promise.all([this.checkDatabase(), this.checkStorage()]);
    const email = this.checkEmail();
    const apiMs = Math.round(performance.now() - t0);
    const api: ComponentHealth = { id: "api", name: "API", status: "operational", latencyMs: apiMs, detail: "Accepting requests" };
    const components = [api, db, storage, email];

    // The database or storage being down breaks the product; email only affects password resets.
    const status: ComponentStatus =
      db.status === "outage" || storage.status === "outage" ? "outage" : components.some((c) => c.status !== "operational") ? "degraded" : "operational";

    const checkedAt = new Date().toISOString();
    this.history.push({ at: checkedAt, status, apiMs, dbMs: db.latencyMs, storageMs: storage.latencyMs });
    if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY);

    return {
      status,
      checkedAt,
      components,
      service: {
        version: this.env.npm_package_version ?? "0.1.0",
        commit: this.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? this.env.GIT_COMMIT?.slice(0, 7) ?? null,
        region: this.env.RENDER_REGION ?? null,
        node: process.version,
        startedAt: this.startedAt.toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
      },
      history: [...this.history],
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    const s = this.config.DATABASE_SCHEMA;
    const r = await timed(async () => {
      const [[{ version }], migrations] = await Promise.all([
        this.ds.query(`SELECT current_setting('server_version') AS version`),
        this.ds.query(`SELECT name FROM "${s}".migrations ORDER BY id DESC`),
      ]);
      return { version: String(version).split(" ")[0], migrations: migrations as { name: string }[] };
    });
    if (!r.ok) return { id: "database", name: "Database", status: "outage", latencyMs: r.ms, detail: "Can't reach Postgres" };
    const pending = this.ds.migrations.length - r.value.migrations.length;
    const latest = r.value.migrations[0]?.name.replace(/\d{13}$/, "") ?? "none";
    return {
      id: "database",
      name: "Database",
      status: pending > 0 || r.ms > 1500 ? "degraded" : "operational",
      latencyMs: r.ms,
      detail: `Postgres ${r.value.version} · ${r.value.migrations.length} migrations applied (latest: ${latest})${pending > 0 ? ` · ${pending} pending` : ""}`,
    };
  }

  private async checkStorage(): Promise<ComponentHealth> {
    const kind = this.config.STORAGE_DRIVER === "s3" ? `Amazon S3${this.config.AWS_REGION ? ` (${this.config.AWS_REGION})` : ""}` : "Local disk";
    const r = await timed(() => this.storage.list("health-check/"));
    if (!r.ok) return { id: "storage", name: "File storage", status: "outage", latencyMs: r.ms, detail: `${kind} · not responding` };
    return { id: "storage", name: "File storage", status: r.ms > 2500 ? "degraded" : "operational", latencyMs: r.ms, detail: `${kind} · reachable` };
  }

  private checkEmail(): ComponentHealth {
    const provider = { resend: "Resend", brevo: "Brevo", log: null }[this.config.MAIL_DRIVER];
    return provider
      ? { id: "email", name: "Email", status: "operational", detail: `${provider} · sends password reset codes` }
      : { id: "email", name: "Email", status: "degraded", detail: "No provider set up yet · reset codes go to the server log" };
  }
}
