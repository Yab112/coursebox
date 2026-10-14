import { Router, type RequestHandler } from "express";
import { loginSchema, signupSchema, toPublicUser } from "../../services/auth";
import { h, type Services } from "../app";

export function authRoutes(s: Services, requireUser: RequestHandler) {
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

  return r;
}
