import { apiUrl } from "./api";

/** Mirrors the API's GET /status (server/src/services/health.ts). */
export type ComponentStatus = "operational" | "degraded" | "outage";
export type ComponentHealth = { id: "api" | "database" | "storage" | "email"; name: string; status: ComponentStatus; latencyMs?: number; detail: string };
export type HealthSample = { at: string; status: ComponentStatus; apiMs: number; dbMs?: number; storageMs?: number };
export type StatusReport = {
  status: ComponentStatus;
  checkedAt: string;
  components: ComponentHealth[];
  service: { version: string; commit: string | null; region: string | null; node: string; startedAt: string; uptimeSeconds: number };
  history: HealthSample[];
};

/** Reads the report even when the API answers 503 (database down): the body still explains what's wrong. */
export async function fetchStatus(signal?: AbortSignal): Promise<StatusReport> {
  const res = await fetch(`${apiUrl()}/status`, { cache: "no-store", signal });
  const body = await res.json().catch(() => null);
  if (!body?.components) throw new Error(`The API answered ${res.status}`);
  return body as StatusReport;
}

/** Share of samples that were fully or partly working (degraded still serves requests). */
export function uptimePercent(history: HealthSample[]) {
  if (!history.length) return null;
  return (history.filter((s) => s.status !== "outage").length / history.length) * 100;
}
