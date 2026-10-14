"use client";
import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type ApiUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

export type AuthMode = "signin" | "signup";

export function AuthDialog({
  initialMode,
  reason,
  onClose,
  onAuthed,
}: {
  initialMode: AuthMode;
  reason?: string;
  onClose: () => void;
  onAuthed: (token: string, user: ApiUser) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [form, setForm] = useState({ identifier: "", email: "", username: "", password: "" });
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    setError(undefined);
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res =
        mode === "signup"
          ? await api.signup({ email: form.email, username: form.username, password: form.password })
          : await api.login({ identifier: form.identifier, password: form.password });
      onAuthed(res.token, res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const input = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-pop">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="auth-title" className="text-lg font-semibold">
              {mode === "signup" ? "Create your account" : "Sign in"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {reason ?? "Save your courses and progress to your account so they're here on every device. No reuploading."}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" ? (
            <>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Email</span>
                <input ref={first} type="email" autoComplete="email" required value={form.email} onChange={set("email")} className={input} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Username</span>
                <input
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9_.\-]+"
                  title="Letters, numbers, dot, dash or underscore"
                  value={form.username}
                  onChange={set("username")}
                  className={input}
                />
              </label>
            </>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Email or username</span>
              <input ref={first} autoComplete="username" required value={form.identifier} onChange={set("identifier")} className={input} />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={mode === "signup" ? 8 : 1}
              value={form.password}
              onChange={set("password")}
              className={input}
            />
            {mode === "signup" && <span className="mt-1 block text-xs text-subtle">At least 8 characters</span>}
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} {mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
          <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className={cn("font-medium text-primary hover:underline")}>
            {mode === "signup" ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </div>
  );
}
