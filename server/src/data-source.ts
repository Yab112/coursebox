import "reflect-metadata";
import { DataSource } from "typeorm";
import type { Config } from "./config";
import { Course, CourseFile, Progress, Session, StudyDay, User } from "./entities";
import { Init1760400000000 } from "./migrations/1760400000000-Init";
import { CourseClientRef1760500000000 } from "./migrations/1760500000000-CourseClientRef";

export function createDataSource(config: Pick<Config, "DATABASE_URL" | "DATABASE_SSL" | "DATABASE_SCHEMA" | "NODE_ENV">) {
  return new DataSource({
    type: "postgres",
    url: config.DATABASE_URL,
    schema: config.DATABASE_SCHEMA,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : false,
    entities: [User, Session, Course, CourseFile, Progress, StudyDay],
    migrations: [Init1760400000000, CourseClientRef1760500000000],
    migrationsTableName: "migrations",
    synchronize: false,
    logging: config.NODE_ENV === "development" ? ["error", "warn", "migration"] : ["error", "migration"],
    extra: { max: 10, idleTimeoutMillis: 30_000 },
  });
}

/** Creates the schema that holds the migrations table before TypeORM looks for it. */
export async function ensureSchema(ds: DataSource, schema: string) {
  await ds.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
}
