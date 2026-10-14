import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PresignedUpload, Storage } from "./Storage";

export class S3Storage implements Storage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  static fromConfig(cfg: { bucket: string; region: string; accessKeyId?: string; secretAccessKey?: string; endpoint?: string }) {
    const opts: S3ClientConfig = { region: cfg.region };
    if (cfg.accessKeyId && cfg.secretAccessKey)
      opts.credentials = { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey };
    if (cfg.endpoint) {
      opts.endpoint = cfg.endpoint;
      opts.forcePathStyle = true;
    }
    // Only add checksums when the operation requires them, so presigned PUTs stay simple for browsers.
    opts.requestChecksumCalculation = "WHEN_REQUIRED";
    opts.responseChecksumValidation = "WHEN_REQUIRED";
    return new S3Storage(new S3Client(opts), cfg.bucket);
  }

  async presignUpload(key: string, { contentType, size, expiresIn = 3600 }: { contentType: string; size: number; expiresIn?: number }): Promise<PresignedUpload> {
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: size });
    // content-type and content-length are signed: S3 rejects a different type or size.
    const url = await getSignedUrl(this.client, cmd, {
      expiresIn,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
    return { url, method: "PUT", headers: { "Content-Type": contentType } };
  }

  async presignDownload(key: string, opts: { contentType?: string; filename?: string; expiresIn?: number } = {}): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: opts.filename ? `inline; filename*=UTF-8''${encodeURIComponent(opts.filename)}` : undefined,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: opts.expiresIn ?? 3600 });
  }

  async list(prefix: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }),
      );
      for (const o of res.Contents ?? []) if (o.Key) out.set(o.Key, o.Size ?? 0);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async deleteKeys(keys: string[]): Promise<number> {
    let deleted = 0;
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      const res = await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }),
      );
      if (res.Errors?.length) throw new Error(`S3 delete failed for ${res.Errors.length} objects: ${res.Errors[0].Message}`);
      deleted += chunk.length;
    }
    return deleted;
  }

  async deletePrefix(prefix: string): Promise<number> {
    if (!prefix.endsWith("/") || prefix.length < 10) throw new Error(`refusing to delete suspicious prefix "${prefix}"`);
    return this.deleteKeys([...(await this.list(prefix)).keys()]);
  }
}
