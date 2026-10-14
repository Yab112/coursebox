"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, getToken, setToken, type ApiUser, type Usage } from "@/lib/api";
import { forgetAccountCourses, saveCourseToAccount, syncLibrary } from "@/lib/cloud";
import { db } from "@/lib/db";
import { flush, startProgressSync } from "@/lib/sync";
import { AuthDialog, type AuthMode } from "./auth-dialog";

type AuthContextValue = {
  status: "loading" | "anon" | "authed";
  user?: ApiUser;
  usage?: Usage;
  /** Opens the sign-in / sign-up dialog. `saveCourseId` is saved to the account after success. */
  openAuth: (mode: AuthMode, opts?: { reason?: string; saveCourseId?: string }) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  saveCourse: (courseId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [user, setUser] = useState<ApiUser>();
  const [usage, setUsage] = useState<Usage>();
  const [dialog, setDialog] = useState<{ mode: AuthMode; reason?: string; saveCourseId?: string } | null>(null);
  const userRef = useRef<ApiUser | undefined>(undefined);
  userRef.current = user;

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setStatus("anon");
      setUser(undefined);
      return;
    }
    try {
      const me = await api.me();
      setUser(me.user);
      setUsage(me.usage);
      setStatus("authed");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setStatus("anon");
        setUser(undefined);
      } else setStatus(getToken() ? "authed" : "anon"); // offline: keep the session, retry later
    }
  }, []);

  const saveCourse = useCallback(
    async (courseId: string) => {
      const u = userRef.current;
      if (!u) return;
      try {
        await saveCourseToAccount(courseId, u.id);
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  useEffect(() => {
    startProgressSync();
    refresh();
  }, [refresh]);

  // Mirror the account library on this device and resume unfinished uploads.
  useEffect(() => {
    if (status !== "authed" || !user) return;
    (async () => {
      await syncLibrary(user.id).catch(() => undefined);
      const stuck = await db.courses.filter((c) => c.ownerId === user.id && (c.syncState === "uploading" || c.syncState === "error")).toArray();
      for (const c of stuck) await saveCourseToAccount(c.id, user.id).catch(() => undefined);
      refresh();
    })();
  }, [status, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(async () => {
    await flush().catch(() => undefined);
    const u = userRef.current;
    await api.logout().catch(() => undefined);
    setToken(null);
    if (u) await forgetAccountCourses(u.id);
    setUser(undefined);
    setUsage(undefined);
    setStatus("anon");
  }, []);

  const onAuthed = useCallback(
    async (token: string, u: ApiUser, saveCourseId?: string) => {
      setToken(token);
      setUser(u);
      userRef.current = u;
      setStatus("authed");
      setDialog(null);
      // Start the save first: its first step records the intent locally, so a reload resumes it.
      const saving = saveCourseId ? saveCourse(saveCourseId).catch(() => undefined) : undefined;
      await refresh();
      await saving;
    },
    [refresh, saveCourse],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, usage, openAuth: (mode, opts) => setDialog({ mode, ...opts }), signOut, refresh, saveCourse }),
    [status, user, usage, signOut, refresh, saveCourse],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {dialog && (
        <AuthDialog
          initialMode={dialog.mode}
          reason={dialog.reason}
          onClose={() => setDialog(null)}
          onAuthed={(token, u) => onAuthed(token, u, dialog.saveCourseId)}
        />
      )}
    </AuthContext.Provider>
  );
}
