import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { PresignedUpload, Storage } from "./Storage";

/**
 * Disk-backed storage for development, tests and self-hosting without S3.
 * Mimics presigned URLs: `/storage/<key>?op=put&exp=…&size=…&type=…&sig=…` signed with HMAC.
 * The matching HTTP routes live in http/routes/storage.ts.
 */
export class LocalStorage implements Storage {
  constructor(
    readonly root: string,
    private readonly publicUrl: string,
    private readonly secret: string,
  ) {}

  filePath(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("invalid key");
    return p;
  }

  sign(parts: Record<string, string>) {
    const canonical = Object.keys(parts)
      .sort()
      .map((k) => `${k}=${parts[k]}`)
      .join("&");
    return createHmac("sha256", this.secret).update(canonical).digest("hex");
  }

  /** Validates a signed URL's query; returns the params or throws. */
  verify(key: string, query: Record<string, unknown>) {
    const { sig, ...rest } = Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)]));
    if (!sig || !rest.exp) throw new Error("missing signature");
    if (Number(rest.exp) < Date.now() / 1000) throw new Error("expired");
    const expected = this.sign({ ...rest, key });
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error("bad signature");
    return rest;
  }

  private url(key: string, params: Record<string, string>) {
    const sig = this.sign({ ...params, key });
    const qs = new URLSearchParams({ ...params, sig });
    return `${this.publicUrl.replace(/\/$/, "")}/storage/${key.split("/").map(encodeURIComponent).join("/")}?${qs}`;
  }

  async presignUpload(key: string, { contentType, size, expiresIn = 3600 }: { contentType: string; size: number; expiresIn?: number }): Promise<PresignedUpload> {
    const exp = String(Math.floor(Date.now() / 1000) + expiresIn);
    return {
      url: this.url(key, { op: "put", exp, size: String(size), type: contentType }),
      method: "PUT",
      headers: { "Content-Type": contentType },
    };
  }

  async presignDownload(key: string, opts: { contentType?: string; expiresIn?: number } = {}) {
    const exp = String(Math.floor(Date.now() / 1000) + (opts.expiresIn ?? 3600));
    return this.url(key, { op: "get", exp, ...(opts.contentType ? { type: opts.contentType } : {}) });
  }

  async list(prefix: string) {
    const out = new Map<string, number>();
    const dir = this.filePath(prefix.replace(/\/$/, "") + "/x").slice(0, -2);
    const walk = async (d: string, rel: string) => {
      let entries;
      try {
        entries = await readdir(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p, `${rel}${e.name}/`);
        else if (!e.name.endsWith(".part")) out.set(`${rel}${e.name}`, (await stat(p)).size);
      }
    };
    await walk(dir, prefix.endsWith("/") ? prefix : `${prefix}/`);
    return out;
  }

  async deleteKeys(keys: string[]) {
    for (const k of keys) await rm(this.filePath(k), { force: true });
    return keys.length;
  }

  async deletePrefix(prefix: string) {
    if (!prefix.endsWith("/") || prefix.length < 10) throw new Error(`refusing to delete suspicious prefix "${prefix}"`);
    const n = (await this.list(prefix)).size;
    await rm(this.filePath(prefix + "x").slice(0, -1), { recursive: true, force: true });
    return n;
  }

  async ensureRoot() {
    await mkdir(this.root, { recursive: true });
  }
}
