import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Router, type Request, type Response } from "express";
import type { LocalStorage } from "../../storage/LocalStorage";

/** Serves the local storage driver's signed URLs (dev/test/self-hosting only). */
export function localStorageRoutes(storage: LocalStorage) {
  const r = Router();
  const keyOf = (req: Request) => decodeURIComponent(req.path.replace(/^\//, ""));
  const deny = (res: Response, status: number, message: string) => res.status(status).json({ error: { code: "storage", message } });

  r.put(/.*/, async (req, res) => {
    const key = keyOf(req);
    let params: Record<string, string>;
    try {
      params = storage.verify(key, req.query);
    } catch (e) {
      return deny(res, 403, (e as Error).message);
    }
    if (params.op !== "put") return deny(res, 403, "wrong operation");
    if (req.get("content-type")?.split(";")[0] !== params.type) return deny(res, 403, "content-type mismatch");
    const expected = Number(params.size);
    if (Number(req.get("content-length")) !== expected) return deny(res, 403, "content-length mismatch");

    const file = storage.filePath(key);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${Date.now()}.part`;
    try {
      await pipeline(req, createWriteStream(tmp));
      if ((await stat(tmp)).size !== expected) throw new Error("size mismatch");
      await rename(tmp, file);
      res.status(200).set("ETag", `"${expected}"`).end();
    } catch (e) {
      await rm(tmp, { force: true });
      deny(res, 400, (e as Error).message);
    }
  });

  r.get(/.*/, async (req, res) => {
    const key = keyOf(req);
    let params: Record<string, string>;
    try {
      params = storage.verify(key, req.query);
    } catch (e) {
      return deny(res, 403, (e as Error).message);
    }
    if (params.op !== "get") return deny(res, 403, "wrong operation");
    const file = storage.filePath(key);
    try {
      await stat(file);
    } catch {
      return deny(res, 404, "not found");
    }
    // sendFile handles Range requests, so videos can seek.
    res.sendFile(file, { headers: params.type ? { "Content-Type": params.type } : {}, dotfiles: "allow" }, (err) => {
      if (err && !res.headersSent) deny(res, 500, "read failed");
    });
  });

  return r;
}
