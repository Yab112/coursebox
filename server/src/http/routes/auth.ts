import { Router, type RequestHandler } from "express";
import { changePasswordSchema, forgotSchema, loginSchema, resetSchema, signupSchema, toPublicUser } from "../../services/auth";
import { h, type Services } from "../app";

export function authRoutes(s: Services, requireUser: RequestHandler, resetLimiter: RequestHandler) {
  const r = Router();

  r.post(
    "/signup",
    h(async (req, res) => {
      const { user, token } = await s.auth.signup(signupSchema.parse(req.body), req.get("user-agent"));
      res.status(201).json({ user: toPublicUser(user), token });
    }),
  );

  r.post(
    "/login",
    h(async (req, res) => {
      const { user, token } = await s.auth.login(loginSchema.parse(req.body), req.get("user-agent"));
      res.json({ user: toPublicUser(user), token });
    }),
  );

  r.post(
    "/logout",
    requireUser,
    h(async (req, res) => {
      await s.auth.logout(req.sessionId!);
      res.status(204).end();
    }),
  );

  // Same answer whether or not the account exists.
  r.post(
    "/password/forgot",
    resetLimiter,
    h(async (req, res) => {
      await s.auth.requestPasswordReset(forgotSchema.parse(req.body));
      res.status(202).json({ ok: true, message: "If an account matches, we've emailed it a 6-digit code." });
    }),
  );

  r.post(
    "/password/reset",
    resetLimiter,
    h(async (req, res) => {
      const { user, token } = await s.auth.resetPassword(resetSchema.parse(req.body), req.get("user-agent"));
      res.json({ user: toPublicUser(user), token });
    }),
  );

  r.post(
    "/password/change",
    requireUser,
    h(async (req, res) => {
      await s.auth.changePassword(req.userId!, req.sessionId!, changePasswordSchema.parse(req.body));
      res.status(204).end();
    }),
  );

  return r;
}
