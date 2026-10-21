/** Thin client for the CourseBox API (server/). The token lives in localStorage. */
const DEFAULT_API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

/** API base URL. `localStorage["coursebox.apiUrl"]` overrides the build-time value (tests, self-hosting). */
export function apiUrl() {
  try {
    return (localStorage.getItem("coursebox.apiUrl") ?? DEFAULT_API).replace(/\/$/, "");
  } catch {
    return DEFAULT_API;
  }
}
const TOKEN_KEY = "coursebox.token";

export type ApiUser = { id: string; email: string; username: string; courseLimit: number; createdAt: string };
export type Usage = { courses: number; courseLimit: number; bytes: number };
export type RemoteCourse = {
  id: string;
  title: string;
  status: "uploading" | "ready" | "deleting";
  sourceKey: string | null;
  analyzer: string;
  fileCount: number;
  totalBytes: number;
  lessonCount: number;
  completedCount: number;
  coverPath: string | null;
  instructor: string | null;
  source: string | null;
  courseNumber: string | null;
  lastLessonPath: string | null;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type RemoteCourseDetail = RemoteCourse & {
  manifest: Record<string, unknown>;
  manifestVersion: number;
  archiveName: string | null;
  files: { path: string; size: number; mime: string; uploaded: boolean }[];
};
export type RemoteProgress = {
  path: string;
  completed: boolean;
  completedAt: string | null;
  changedAt: string | null;
  lastPage: number | null;
  position: number | null;
  seconds: number;
  lastOpenedAt: string | null;
};
export type ProgressItem = {
  path: string;
  completed?: boolean;
  changedAt?: string;
  lastPage?: number;
  position?: number;
  secondsDelta?: number;
  lastOpenedAt?: string;
};
export type CourseUpload = {
  title: string;
  sourceKey?: string | null;
  analyzer: string;
  archiveName?: string | null;
  clientRef?: string;
  manifestVersion: number;
  manifest: unknown;
  files: { path: string; size: number; mime: string }[];
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

async function call<T>(method: string, path: string, body?: unknown, opts: { keepalive?: boolean } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${apiUrl()}${path}`, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive: opts.keepalive,
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach the CourseBox server. Check your connection.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error ?? {};
    if (res.status === 401 && token) setToken(null);
    throw new ApiError(res.status, e.code ?? "error", e.message ?? `Request failed (${res.status})`, e.details);
  }
  return data as T;
}

export const api = {
  signup: (b: { email: string; username: string; password: string }) => call<{ user: ApiUser; token: string }>("POST", "/auth/signup", b),
  login: (b: { identifier: string; password: string }) => call<{ user: ApiUser; token: string }>("POST", "/auth/login", b),
  logout: () => call<void>("POST", "/auth/logout"),
  forgotPassword: (identifier: string) => call<{ ok: true; message: string }>("POST", "/auth/password/forgot", { identifier }),
  resetPassword: (b: { identifier: string; code: string; password: string }) =>
    call<{ user: ApiUser; token: string }>("POST", "/auth/password/reset", b),
  changePassword: (b: { currentPassword: string; newPassword: string }) => call<void>("POST", "/auth/password/change", b),
  me: () => call<{ user: ApiUser; usage: Usage }>("GET", "/me"),
  listCourses: () => call<{ courses: RemoteCourse[] }>("GET", "/courses"),
  getCourse: (id: string) => call<RemoteCourseDetail>("GET", `/courses/${id}`),
  createCourse: (b: CourseUpload) => call<{ course: RemoteCourse; needUpload: string[] }>("POST", "/courses", b),
  reviseCourse: (id: string, b: CourseUpload) => call<{ course: RemoteCourse; needUpload: string[] }>("PUT", `/courses/${id}/files`, b),
  patchCourse: (id: string, b: { manifest?: unknown; manifestVersion?: number; analyzer?: string; title?: string }) =>
    call<{ course: RemoteCourse }>("PATCH", `/courses/${id}`, b),
  uploadUrls: (id: string, paths: string[]) =>
    call<{ uploads: { path: string; url: string; headers: Record<string, string> }[] }>("POST", `/courses/${id}/uploads`, { paths }),
  complete: (id: string) => call<{ course: RemoteCourse }>("POST", `/courses/${id}/complete`),
  fileUrls: (id: string, paths: string[]) => call<{ urls: Record<string, string> }>("POST", `/courses/${id}/file-urls`, { paths }),
  deleteCourse: (id: string) => call<void>("DELETE", `/courses/${id}`),
  getProgress: (id: string) => call<{ lastLessonPath: string | null; items: RemoteProgress[] }>("GET", `/courses/${id}/progress`),
  syncProgress: (id: string, b: { items: ProgressItem[]; lastLessonPath?: string; day?: string }, keepalive = false) =>
    call<{ lastLessonPath: string | null; items: RemoteProgress[] }>("POST", `/courses/${id}/progress`, b, { keepalive }),
};
