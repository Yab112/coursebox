import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { IsNull, MoreThan, Not, type DataSource } from "typeorm";
import { z } from "zod";
import type { Config } from "../config";
import { PasswordReset, Session, User } from "../entities";
import { AppError, conflict, unauthorized } from "../errors";
import type { Mailer } from "../mail/Mailer";
import { passwordChangedEmail, resetCodeEmail } from "../mail/templates";
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

const newPassword = z.string().min(8, "Password must be at least 8 characters").max(200);

export const forgotSchema = z.object({
  /** Email or username. */
  identifier: z.string().trim().min(1).max(254),
});

export const resetSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "The code is 6 digits"),
  password: newPassword,
});

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword })
  .refine((b) => b.currentPassword !== b.newPassword, { path: ["newPassword"], message: "Choose a password different from the current one" });

/** Wrong guesses allowed per code. */
export const MAX_RESET_ATTEMPTS = 5;
/** Minimum gap between two codes for the same account. */
export const RESET_COOLDOWN_MS = 60_000;
/** Codes per account per hour. */
export const RESET_HOURLY_LIMIT = 5;

const invalidCode = () => new AppError(400, "invalid_code", "That code is wrong or has expired. Request a new one.");

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
    private readonly config: Pick<Config, "SESSION_TTL_DAYS" | "COURSE_LIMIT" | "SIGNING_SECRET" | "RESET_CODE_TTL_MINUTES">,
    private readonly mailer: Mailer,
    private readonly log: (msg: string, err?: unknown) => void = (msg, err) => console.error(msg, err),
  ) {}

  private users = () => this.ds.getRepository(User);
  private sessions = () => this.ds.getRepository(Session);
  private resets = () => this.ds.getRepository(PasswordReset);

  /** Bound to the user, so a code can't be replayed against another account even if the hashes leak. */
  private codeHash = (userId: string, code: string) => createHmac("sha256", this.config.SIGNING_SECRET).update(`${userId}:${code}`).digest("hex");

  private findByIdentifier(identifier: string, withPassword = false) {
    const q = this.users().createQueryBuilder("u");
    if (withPassword) q.addSelect("u.passwordHash");
    return q
      .where(identifier.includes("@") ? "lower(u.email) = lower(:id)" : "lower(u.username) = lower(:id)", { id: identifier })
      .getOne();
  }

  /** Sends an email without making the caller wait (and without revealing, by timing, that the account exists). */
  private sendLater(email: Parameters<Mailer["send"]>[0]) {
    void this.mailer.send(email).catch((e) => this.log(`email "${email.subject}" to user failed`, e));
  }

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
    const user = await this.findByIdentifier(input.identifier, true);
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

  /**
   * Emails a 6-digit code if the account exists. Callers always get the same answer, so the endpoint
   * can't be used to find out which emails or usernames are registered.
   */
  async requestPasswordReset(input: z.infer<typeof forgotSchema>) {
    const user = await this.findByIdentifier(input.identifier);
    if (!user) return;

    const now = Date.now();
    const recent = await this.resets().find({
      where: { userId: user.id, createdAt: MoreThan(new Date(now - 3600_000)) },
      order: { createdAt: "DESC" },
    });
    if (recent.length >= RESET_HOURLY_LIMIT) return;
    if (recent[0] && now - recent[0].createdAt.getTime() < RESET_COOLDOWN_MS) return;

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.ds.transaction(async (m) => {
      // Only the newest code works.
      await m.update(PasswordReset, { userId: user.id, usedAt: IsNull() }, { usedAt: new Date(now) });
      await m.insert(PasswordReset, {
        userId: user.id,
        codeHash: this.codeHash(user.id, code),
        expiresAt: new Date(now + this.config.RESET_CODE_TTL_MINUTES * 60_000),
      });
    });
    this.sendLater(resetCodeEmail(user.email, user.username, code, this.config.RESET_CODE_TTL_MINUTES));
  }

  /** Checks the code, sets the new password, signs out every session and returns a fresh one. */
  async resetPassword(input: z.infer<typeof resetSchema>, userAgent?: string) {
    const user = await this.findByIdentifier(input.identifier);
    if (!user) throw invalidCode();
    const reset = await this.resets().findOne({
      where: { userId: user.id, usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: "DESC" },
    });
    if (!reset || reset.attempts >= MAX_RESET_ATTEMPTS) throw invalidCode();

    const given = Buffer.from(this.codeHash(user.id, input.code));
    if (!timingSafeEqual(given, Buffer.from(reset.codeHash))) {
      // Atomic, so parallel guesses can't exceed the limit.
      const result = await this.ds.query(
        `UPDATE "${this.resets().metadata.schema}".password_resets SET attempts = attempts + 1,
           used_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE used_at END
         WHERE id = $1 RETURNING attempts`,
        [reset.id, MAX_RESET_ATTEMPTS],
      );
      // TypeORM returns [rows, rowCount] for UPDATE ... RETURNING.
      const rows = (Array.isArray(result[0]) ? result[0] : result) as { attempts: number }[];
      const left = MAX_RESET_ATTEMPTS - (rows[0]?.attempts ?? MAX_RESET_ATTEMPTS);
      if (left <= 0) throw new AppError(400, "invalid_code", "Too many wrong codes. Request a new one.");
      throw new AppError(400, "invalid_code", `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`);
    }

    const passwordHash = await hashPassword(input.password);
    const claimed = await this.ds.transaction(async (m) => {
      // Claim the code first so it can only ever be used once, even by two requests at the same moment.
      const res = await m.update(PasswordReset, { id: reset.id, usedAt: IsNull() }, { usedAt: new Date() });
      if (!res.affected) return false;
      await m.update(User, user.id, { passwordHash, lastLoginAt: new Date() });
      await m.update(Session, { userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
      return true;
    });
    if (!claimed) throw invalidCode();

    this.sendLater(passwordChangedEmail(user.email, user.username, "reset"));
    return { user, token: await this.createSession(user.id, userAgent) };
  }

  /** Signed-in password change. Other devices are signed out; this one stays signed in. */
  async changePassword(userId: string, sessionId: string, input: z.infer<typeof changePasswordSchema>) {
    const user = await this.users().createQueryBuilder("u").addSelect("u.passwordHash").where("u.id = :userId", { userId }).getOneOrFail();
    if (!(await verifyPassword(input.currentPassword, user.passwordHash)))
      throw new AppError(400, "wrong_password", "Your current password isn't right");
    const passwordHash = await hashPassword(input.newPassword);
    await this.ds.transaction(async (m) => {
      await m.update(User, user.id, { passwordHash });
      await m.update(Session, { userId: user.id, revokedAt: IsNull(), id: Not(sessionId) }, { revokedAt: new Date() });
      await m.update(PasswordReset, { userId: user.id, usedAt: IsNull() }, { usedAt: new Date() });
    });
    this.sendLater(passwordChangedEmail(user.email, user.username, "change"));
  }
}
