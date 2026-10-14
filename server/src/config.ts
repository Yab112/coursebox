import "dotenv/config";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DATABASE_SSL: bool,
    DATABASE_SCHEMA: z.string().regex(/^[a-z_][a-z0-9_]*$/).default("coursebox"),
    RUN_MIGRATIONS: bool,
    /** Comma separated list of allowed browser origins. */
    CORS_ORIGINS: z.string().default("http://localhost:3000"),

    STORAGE_DRIVER: z.enum(["s3", "local"]).default("local"),
    S3_BUCKET: z.string().optional(),
    AWS_REGION: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    /** Optional custom endpoint (MinIO, R2...). */
    S3_ENDPOINT: z.string().url().optional(),
    LOCAL_STORAGE_DIR: z.string().default(".storage"),
    /** Public URL of this API (used by the local storage driver to build upload/download URLs). */
    PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
    SIGNING_SECRET: z.string().min(16).default("dev-only-signing-secret-change-me"),

    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
    COURSE_LIMIT: z.coerce.number().int().min(0).default(2),
    MAX_COURSE_BYTES: z.coerce.number().int().positive().default(2 * 1024 ** 3),
    MAX_FILE_BYTES: z.coerce.number().int().positive().default(5 * 1024 ** 3),
    MAX_FILES_PER_COURSE: z.coerce.number().int().positive().default(5000),
    /** Uploads not completed within this many hours are cleaned up. */
    STALE_UPLOAD_HOURS: z.coerce.number().positive().default(24),
  })
  .superRefine((c, ctx) => {
    if (c.STORAGE_DRIVER === "s3") {
      for (const k of ["S3_BUCKET", "AWS_REGION"] as const)
        if (!c[k]) ctx.addIssue({ code: "custom", path: [k], message: `${k} is required when STORAGE_DRIVER=s3` });
    }
    if (c.NODE_ENV === "production" && c.SIGNING_SECRET.startsWith("dev-only") && c.STORAGE_DRIVER === "local")
      ctx.addIssue({ code: "custom", path: ["SIGNING_SECRET"], message: "set SIGNING_SECRET in production" });
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${msg}`);
  }
  return parsed.data;
}
