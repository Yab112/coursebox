import { createHash, randomBytes } from "node:crypto";
import { IsNull, MoreThan, type DataSource } from "typeorm";
import { z } from "zod";
import type { Config } from "../config";
import { Session, User } from "../entities";
import { AppError, conflict, unauthorized } from "../errors";
import { dummyHash, hashPassword, verifyPassword } from "./passwords";

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email"),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[A-Za-z0-9_.-]+$/, "Use letters, numbers, dot, dash or underscore"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const loginSchema = z.object({
  /** Email or username. */
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

export type PublicUser = { id: string; email: string; username: string; courseLimit: number; createdAt: string };

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  username: u.username,
  courseLimit: u.courseLimit,
  createdAt: u.createdAt.toISOString(),
});

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export class AuthService {
  constructor(
    private readonly ds: DataSource,
    private readonly config: Pick<Config, "SESSION_TTL_DAYS" | "COURSE_LIMIT">,
  ) {}

  private users = () => this.ds.getRepository(User);
  private sessions = () => this.ds.getRepository(Session);

  async signup(input: z.infer<typeof signupSchema>, userAgent?: string) {
    const taken = await this.users()
      .createQueryBuilder("u")
      .select(["u.email", "u.username"])
      .where("lower(u.email) = lower(:email) OR lower(u.username) = lower(:username)", input)
      .getMany();
    if (taken.some((u) => u.email.toLowerCase() === input.email.toLowerCase()))
      throw conflict("email_taken", "An account with this email already exists");
    if (taken.some((u) => u.username.toLowerCase() === input.username.toLowerCase()))
      throw conflict("username_taken", "This username is taken");

    const user = this.users().create({
      email: input.email,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      courseLimit: this.config.COURSE_LIMIT,
      lastLoginAt: new Date(),
    });
    try {
      await this.users().save(user);
    } catch (e) {
      // Lost a race with a concurrent signup: the unique indexes are the source of truth.
      if ((e as { code?: string }).code === "23505") throw conflict("account_exists", "This email or username is already registered");
      throw e;
    }
    return { user, token: await this.createSession(user.id, userAgent) };
  }

  async login(input: z.infer<typeof loginSchema>, userAgent?: string) {
    const user = await this.users()
      .createQueryBuilder("u")
      .addSelect("u.passwordHash")
      .where(input.identifier.includes("@") ? "lower(u.email) = lower(:id)" : "lower(u.username) = lower(:id)", {
        id: input.identifier,
      })
      .getOne();
    const ok = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));
    if (!user || !ok) throw new AppError(401, "invalid_credentials", "Wrong email/username or password");
    await this.users().update(user.id, { lastLoginAt: new Date() });
    return { user, token: await this.createSession(user.id, userAgent) };
  }

  async createSession(userId: string, userAgent?: string) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await this.sessions().insert({
      userId,
      tokenHash: sha256(token),
      userAgent: userAgent?.slice(0, 256) ?? null,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + this.config.SESSION_TTL_DAYS * 86400_000),
    });
    return token;
  }

  /** Resolves a bearer token to its user; slides the expiry at most once an hour. */
  async authenticate(token: string): Promise<{ user: User; sessionId: string }> {
    const session = await this.sessions().findOne({
      where: { tokenHash: sha256(token), revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      relations: { user: true },
    });
    if (!session?.user) throw unauthorized("Your session has expired, please sign in again");
    const now = Date.now();
    if (now - session.lastUsedAt.getTime() > 3600_000) {
      await this.sessions().update(session.id, {
        lastUsedAt: new Date(now),
        expiresAt: new Date(now + this.config.SESSION_TTL_DAYS * 86400_000),
      });
    }
    return { user: session.user, sessionId: session.id };
  }

  getUser(id: string) {
    return this.users().findOneByOrFail({ id });
  }

  async logout(sessionId: string) {
    await this.sessions().update(sessionId, { revokedAt: new Date() });
  }
}
