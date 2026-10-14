import { execFileSync } from "node:child_process";
import { createDataSource, ensureSchema } from "../src/data-source";

/**
 * Uses TEST_DATABASE_URL when set (CI service container); otherwise starts a throwaway
 * Postgres 17 container with Docker and removes it afterwards.
 */
let container: string | undefined;

export async function setup() {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const name = `coursebox-test-${process.pid}`;
    execFileSync("docker", ["run", "-d", "--rm", "--name", name, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:17-alpine"], {
      stdio: "pipe",
    });
    container = name;
    const port = execFileSync("docker", ["port", name, "5432/tcp"]).toString().trim().split(":").pop();
    url = `postgres://postgres:test@127.0.0.1:${port}/postgres`;
    for (let i = 0; ; i++) {
      try {
        execFileSync("docker", ["exec", name, "pg_isready", "-U", "postgres", "-h", "127.0.0.1"], { stdio: "pipe" });
        break;
      } catch {
        if (i > 60) throw new Error("test postgres did not start");
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  process.env.TEST_DATABASE_URL = url;

  // Fresh schema + migrations once for the whole run.
  const ds = createDataSource({ DATABASE_URL: url, DATABASE_SSL: false, DATABASE_SCHEMA: "coursebox_test", NODE_ENV: "test" });
  for (let i = 0; ; i++) {
    try {
      await ds.initialize();
      break;
    } catch (e) {
      if (i > 20) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await ds.query(`DROP SCHEMA IF EXISTS coursebox_test CASCADE`);
  await ensureSchema(ds, "coursebox_test");
  await ds.runMigrations({ transaction: "each" });
  await ds.destroy();
}

export async function teardown() {
  if (container) execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
}
