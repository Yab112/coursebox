/** Applies pending migrations: `npm run migrate` (prod build) or `npm run migrate:dev`. Pass `--revert` to undo the last one. */
import { loadConfig } from "../config";
import { createDataSource, ensureSchema } from "../data-source";

async function run() {
  const config = loadConfig();
  const ds = await createDataSource(config).initialize();
  await ensureSchema(ds, config.DATABASE_SCHEMA);
  if (process.argv.includes("--revert")) {
    await ds.undoLastMigration({ transaction: "each" });
    console.log("reverted last migration");
  } else {
    const ran = await ds.runMigrations({ transaction: "each" });
    console.log(ran.length ? `applied: ${ran.map((m) => m.name).join(", ")}` : "database is up to date");
  }
  await ds.destroy();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
