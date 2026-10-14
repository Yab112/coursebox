import { loadConfig } from "./config";
import { createDataSource, ensureSchema } from "./data-source";
import { createApp, createServices } from "./http/app";
import { LocalStorage } from "./storage/LocalStorage";
import { S3Storage } from "./storage/S3Storage";
import type { Storage } from "./storage/Storage";

export function createStorage(config: ReturnType<typeof loadConfig>): Storage {
  if (config.STORAGE_DRIVER === "s3")
    return S3Storage.fromConfig({
      bucket: config.S3_BUCKET!,
      region: config.AWS_REGION!,
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      endpoint: config.S3_ENDPOINT,
    });
  return new LocalStorage(config.LOCAL_STORAGE_DIR, config.PUBLIC_API_URL, config.SIGNING_SECRET);
}

async function main() {
  const config = loadConfig();
  const ds = createDataSource(config);
  await ds.initialize();
  if (config.RUN_MIGRATIONS) {
    await ensureSchema(ds, config.DATABASE_SCHEMA);
    const ran = await ds.runMigrations({ transaction: "each" });
    if (ran.length) console.log(`applied migrations: ${ran.map((m) => m.name).join(", ")}`);
  }
  const storage = createStorage(config);
  if (storage instanceof LocalStorage) await storage.ensureRoot();
  const services = createServices(ds, storage, config);
  const app = createApp(ds, services, config);

  const server = app.listen(config.PORT, () => console.log(`CourseBox API on :${config.PORT} (storage: ${config.STORAGE_DRIVER})`));

  // Housekeeping: abandoned uploads and half-deleted courses.
  const sweep = () => services.courses.cleanup().catch((e) => console.error("cleanup failed", e));
  const timer = setInterval(sweep, 30 * 60_000);
  setTimeout(sweep, 10_000);

  const shutdown = () => {
    clearInterval(timer);
    server.close(() => ds.destroy().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
