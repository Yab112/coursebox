import cors from "cors";
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import type { DataSource } from "typeorm";
import { ZodError } from "zod";
import type { Config } from "../config";
import { AppError, unauthorized } from "../errors";
import { createMailer, type Mailer } from "../mail/Mailer";
import { AuthService } from "../services/auth";
import { CourseService } from "../services/courses";
import { HealthService } from "../services/health";
import { ProgressService } from "../services/progress";
import { LocalStorage } from "../storage/LocalStorage";
import type { Storage } from "../storage/Storage";
import { authRoutes } from "./routes/auth";
import { courseRoutes } from "./routes/courses";
import { localStorageRoutes } from "./routes/storage";

export type Services = { auth: AuthService; courses: CourseService; progress: ProgressService; storage: Storage; mailer: Mailer; health: HealthService };

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
    sessionId?: string;
  }
}

export function createServices(ds: DataSource, storage: Storage, config: Config, mailer: Mailer = createMailer(config)): Services {
  const courses = new CourseService(ds, storage, config);
  return {
    mailer,
    auth: new AuthService(ds, config, mailer),
    courses,
    progress: new ProgressService(ds, courses, config.DATABASE_SCHEMA),
    storage,
    health: new HealthService(ds, storage, config),
  };
}

/** Wraps async handlers so rejections reach the error middleware. */
export const h =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

export function createApp(ds: DataSource, services: Services, config: Config) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render / Vercel sit behind one proxy hop

  if (config.NODE_ENV !== "test")
    app.use(
      pinoHttp({
        autoLogging: { ignore: (req) => req.url === "/health" },
        // Never write credentials or signed URLs to the logs.
        redact: { paths: ["req.headers.authorization", "req.headers.cookie", "req.query.sig", "res.headers[\"set-cookie\"]"], censor: "[redacted]" },
        serializers: { req: (req: { method: string; url: string; id: unknown }) => ({ id: req.id, method: req.method, url: req.url.split("?")[0] }) },
      }),
    );
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  const origins = config.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.includes("*") || origins.includes(origin)),
      allowedHeaders: ["Authorization", "Content-Type"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
      maxAge: 3600,
    }),
  );

  // Local storage routes stream raw bodies, so they go before the JSON parser.
  if (services.storage instanceof LocalStorage) app.use("/storage", localStorageRoutes(services.storage));

  app.use(express.json({ limit: "10mb" }));

  const requireUser = h(async (req, _res, next) => {
    const header = req.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) throw unauthorized();
    const { user, sessionId } = await services.auth.authenticate(token);
    req.userId = user.id;
    req.sessionId = sessionId;
    next();
  });

  app.get(
    "/health",
    h(async (_req, res) => {
      await ds.query("SELECT 1");
      res.json({ ok: true });
    }),
  );

  // Public, for the status page. Cached in the service, so polling it doesn't touch the database each time.
  app.get(
    "/status",
    rateLimit({ windowMs: 60_000, limit: config.NODE_ENV === "test" ? 1000 : 60, standardHeaders: "draft-8", legacyHeaders: false }),
    h(async (_req, res) => {
      const report = await services.health.report();
      res.set("Cache-Control", "no-store").status(report.components.find((c) => c.id === "database")?.status === "outage" ? 503 : 200).json(report);
    }),
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: config.NODE_ENV === "test" ? 1000 : 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "rate_limited", message: "Too many attempts, try again in a few minutes" } },
  });

  // Codes are 6 digits: keep guessing and email sending well below anything useful to an attacker.
  const resetLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: config.NODE_ENV === "test" ? 1000 : 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "rate_limited", message: "Too many attempts, try again in a few minutes" } },
  });

  app.use("/auth", authLimiter, authRoutes(services, requireUser, resetLimiter));
  app.use("/", courseRoutes(services, requireUser));

  app.use((_req, res) => res.status(404).json({ error: { code: "not_found", message: "Route not found" } }));

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return res.status(400).json({
        error: { code: "validation", message: first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid input", issues: err.issues },
      });
    }
    if (err instanceof AppError)
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    if ((err as { type?: string }).type === "entity.too.large")
      return res.status(413).json({ error: { code: "too_large", message: "Request body too large" } });
    if ((err as { type?: string }).type === "entity.parse.failed")
      return res.status(400).json({ error: { code: "bad_json", message: "Malformed JSON" } });
    (req as { log?: { error: (e: unknown) => void } }).log?.error(err);
    if (config.NODE_ENV === "test") console.error(err);
    return res.status(500).json({ error: { code: "internal", message: "Something went wrong" } });
  };
  app.use(onError);
  return app;
}
