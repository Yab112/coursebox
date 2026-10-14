import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { toPublicUser } from "../../services/auth";
import { courseInput, manifestPatch, safePath } from "../../services/courses";
import { progressSync } from "../../services/progress";
import { h, type Services } from "../app";

const paths = z.object({ paths: z.array(safePath).min(1).max(500) });

export function courseRoutes(s: Services, requireUser: RequestHandler) {
  const r = Router();
  r.use(["/me", "/courses"], requireUser);

  r.get(
    "/me",
    h(async (req, res) => {
      const user = await s.auth.getUser(req.userId!);
      res.json({ user: toPublicUser(user), usage: await s.courses.usage(req.userId!) });
    }),
  );

  r.get("/courses", h(async (req, res) => res.json({ courses: await s.courses.list(req.userId!) })));

  r.post(
    "/courses",
    h(async (req, res) => {
      res.status(201).json(await s.courses.create(req.userId!, courseInput.parse(req.body)));
    }),
  );

  r.get("/courses/:id", h(async (req, res) => res.json(await s.courses.get(req.userId!, String(req.params.id)))));

  r.patch(
    "/courses/:id",
    h(async (req, res) => res.json({ course: await s.courses.patchManifest(req.userId!, String(req.params.id), manifestPatch.parse(req.body)) })),
  );

  /** New version of the same course: only changed files need uploading. */
  r.put(
    "/courses/:id/files",
    h(async (req, res) => res.json(await s.courses.revise(req.userId!, String(req.params.id), courseInput.parse(req.body)))),
  );

  r.post(
    "/courses/:id/uploads",
    h(async (req, res) => res.json({ uploads: await s.courses.uploadUrls(req.userId!, String(req.params.id), paths.parse(req.body).paths) })),
  );

  r.post(
    "/courses/:id/complete",
    h(async (req, res) => res.json({ course: await s.courses.complete(req.userId!, String(req.params.id)) })),
  );

  r.post(
    "/courses/:id/file-urls",
    h(async (req, res) => res.json({ urls: await s.courses.downloadUrls(req.userId!, String(req.params.id), paths.parse(req.body).paths) })),
  );

  r.delete(
    "/courses/:id",
    h(async (req, res) => {
      await s.courses.delete(req.userId!, String(req.params.id));
      res.status(204).end();
    }),
  );

  r.get("/courses/:id/progress", h(async (req, res) => res.json(await s.progress.get(req.userId!, String(req.params.id)))));

  r.post(
    "/courses/:id/progress",
    h(async (req, res) => res.json(await s.progress.sync(req.userId!, String(req.params.id), progressSync.parse(req.body)))),
  );

  return r;
}
