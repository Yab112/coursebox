import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { safePath } from "../src/services/courses";
import { hashPassword, verifyPassword } from "../src/services/passwords";
import { LocalStorage } from "../src/storage/LocalStorage";
import { S3Storage } from "../src/storage/S3Storage";
import { courseKeyPrefix, fileKey } from "../src/storage/Storage";

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("s3cret-password");
    const b = await hashPassword("s3cret-password");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword("s3cret-password", a)).toBe(true);
    expect(await verifyPassword("s3cret-passwordX", a)).toBe(false);
  });

  it("rejects malformed hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$foo")).toBe(false);
  });

  it("normalizes unicode so the same password typed differently still matches", async () => {
    const h = await hashPassword("café-password"); // é precomposed
    expect(await verifyPassword("café-password", h)).toBe(true); // e + combining accent
  });
});

describe("safe course paths", () => {
  it.each(["a.pdf", "Week 1/Lecture 2/video.mp4", "static_resources/abc_L1.pdf", "非英文/文件.pdf"])("accepts %s", (p) => {
    expect(safePath.safeParse(p).success).toBe(true);
  });
  it.each(["", "/etc/passwd", "../secret", "a/../../b", "a//b", "a\\b", "bad\u0000name", "x".repeat(1025)])("rejects %j", (p) => {
    expect(safePath.safeParse(p).success).toBe(false);
  });
});

describe("storage keys", () => {
  it("are built only from server ids", () => {
    expect(fileKey("u1", "c1", "f1")).toBe("users/u1/courses/c1/f1");
    expect(courseKeyPrefix("u1", "c1")).toBe("users/u1/courses/c1/");
  });
});

describe("LocalStorage signed URLs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cb-local-"));
  const s = new LocalStorage(dir, "http://api.test", "secret-secret-secret");
  const query = (url: string) => Object.fromEntries(new URL(url).searchParams);

  it("verifies its own signatures and binds them to key, size and type", async () => {
    const { url } = await s.presignUpload("users/u/courses/c/f", { contentType: "application/pdf", size: 10 });
    const q = query(url);
    expect(s.verify("users/u/courses/c/f", q)).toMatchObject({ op: "put", size: "10", type: "application/pdf" });
    expect(() => s.verify("users/u/courses/c/OTHER", q)).toThrow(/signature/);
    expect(() => s.verify("users/u/courses/c/f", { ...q, size: "999" })).toThrow(/signature/);
  });

  it("rejects expired URLs", async () => {
    const url = await s.presignDownload("users/u/courses/c/f", { expiresIn: -10 });
    expect(() => s.verify("users/u/courses/c/f", query(url))).toThrow(/expired/);
  });

  it("refuses keys that escape the storage root", () => {
    expect(() => s.filePath("../../etc/passwd")).toThrow();
  });
});

describe("S3Storage", () => {
  const s3 = mockClient(S3Client);
  const client = new S3Client({ region: "eu-west-1", credentials: { accessKeyId: "AKIATEST", secretAccessKey: "secret" } });
  const storage = new S3Storage(client, "bucket");

  it("presigns uploads that pin the content type and exact size", async () => {
    const { url, headers } = await storage.presignUpload("users/u/courses/c/f", { contentType: "application/pdf", size: 1234 });
    const u = new URL(url);
    expect(u.hostname).toBe("bucket.s3.eu-west-1.amazonaws.com");
    expect(u.pathname).toBe("/users/u/courses/c/f");
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(Number(u.searchParams.get("X-Amz-Expires"))).toBe(3600);
    expect(headers).toEqual({ "Content-Type": "application/pdf" });
  });

  it("presigns downloads", async () => {
    const url = await storage.presignDownload("users/u/courses/c/f", { contentType: "video/mp4" });
    expect(url).toContain("response-content-type=video%2Fmp4");
    expect(url).toContain("X-Amz-Signature=");
  });

  it("lists across pages", async () => {
    s3.reset();
    s3.on(ListObjectsV2Command)
      .resolvesOnce({ Contents: [{ Key: "p/a", Size: 1 }], IsTruncated: true, NextContinuationToken: "t" })
      .resolvesOnce({ Contents: [{ Key: "p/b", Size: 2 }], IsTruncated: false });
    const list = await storage.list("p/");
    expect([...list]).toEqual([
      ["p/a", 1],
      ["p/b", 2],
    ]);
    expect(s3.commandCalls(ListObjectsV2Command)[1].args[0].input.ContinuationToken).toBe("t");
  });

  it("deletes in batches of 1000 and surfaces errors", async () => {
    s3.reset();
    s3.on(DeleteObjectsCommand).resolves({});
    const keys = Array.from({ length: 2500 }, (_, i) => `users/u/courses/c/${i}`);
    expect(await storage.deleteKeys(keys)).toBe(2500);
    expect(s3.commandCalls(DeleteObjectsCommand).map((c) => c.args[0].input.Delete!.Objects!.length)).toEqual([1000, 1000, 500]);

    s3.reset();
    s3.on(DeleteObjectsCommand).resolves({ Errors: [{ Key: "k", Message: "AccessDenied" }] });
    await expect(storage.deleteKeys(["k"])).rejects.toThrow(/AccessDenied/);
  });

  it("refuses to delete a suspicious prefix", async () => {
    await expect(storage.deletePrefix("")).rejects.toThrow(/suspicious/);
    await expect(storage.deletePrefix("users/")).rejects.toThrow(/suspicious/);
  });
});

describe("config", () => {
  const base = { DATABASE_URL: "postgres://x" };
  it("has safe defaults", () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({ STORAGE_DRIVER: "local", COURSE_LIMIT: 2, DATABASE_SCHEMA: "coursebox", PORT: 4000 });
  });
  it("requires bucket and region for S3", () => {
    expect(() => loadConfig({ ...base, STORAGE_DRIVER: "s3" })).toThrow(/S3_BUCKET[\s\S]*AWS_REGION/);
  });
  it("requires a real signing secret for local storage in production", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(/SIGNING_SECRET/);
  });
  it("requires DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
