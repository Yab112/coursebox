"use client";
import { ArrowLeft, Eye, EyeOff, Loader2, MailCheck, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { api, ApiError, type ApiUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

/** "forgot" asks for the account, "reset" takes the emailed code; "change" is for signed-in users. */
export type AuthMode = "signin" | "signup" | "forgot" | "reset" | "change";

const RESEND_AFTER = 60;

const TITLES: Record<AuthMode, string> = {
  signin: "Sign in",
  signup: "Create your account",
  forgot: "Reset your password",
  reset: "Check your email",
  change: "Change password",
};

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
  const [notice, setNotice] = useState<string>();
  const [form, setForm] = useState({ identifier: "", email: "", username: "", password: "", code: "", currentPassword: "" });
  const [show, setShow] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const first = useRef<HTMLInputElement>(null);
  const uid = useId();

  useEffect(() => {
    first.current?.focus();
    setError(undefined);
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === "code" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value }));

  const go = (m: AuthMode) => {
    setMode(m);
    setNotice(undefined);
    setForm((f) => ({ ...f, password: "", code: "", currentPassword: "" }));
  };

  const sendCode = async () => {
    await api.forgotPassword(form.identifier);
    setResendIn(RESEND_AFTER);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      if (mode === "signup") {
        const res = await api.signup({ email: form.email, username: form.username, password: form.password });
        onAuthed(res.token, res.user);
      } else if (mode === "signin") {
        const res = await api.login({ identifier: form.identifier, password: form.password });
        onAuthed(res.token, res.user);
      } else if (mode === "forgot") {
        await sendCode();
        go("reset");
      } else if (mode === "reset") {
        const res = await api.resetPassword({ identifier: form.identifier, code: form.code, password: form.password });
        onAuthed(res.token, res.user);
      } else if (mode === "change") {
        await api.changePassword({ currentPassword: form.currentPassword, newPassword: form.password });
        setForm((f) => ({ ...f, password: "", currentPassword: "" }));
        setNotice("Password changed. You've been signed out on your other devices.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(undefined);
    try {
      await sendCode();
      setNotice("We sent a new code. Only the newest one works.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send a new code");
    }
  };

  const input = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary";
  // Hints sit outside the <label> (linked with aria-describedby) so they don't become part of the field's name.
  const passwordField = (label: string, autoComplete: string, hint?: string) => (
    <div className="text-sm">
      <label htmlFor={`${uid}-pw`} className="mb-1 block font-medium">
        {label}
      </label>
      <span className="relative block">
        <input
          id={`${uid}-pw`}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={autoComplete === "new-password" ? 8 : 1}
          value={form.password}
          onChange={set("password")}
          aria-describedby={hint ? `${uid}-pw-hint` : undefined}
          className={cn(input, "pr-10")}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
      {hint && (
        <span id={`${uid}-pw-hint`} className="mt-1 block text-xs text-subtle">
          {hint}
        </span>
      )}
    </div>
  );

  const changed = mode === "change" && notice;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-pop">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {(mode === "forgot" || mode === "reset") && (
              <button
                type="button"
                onClick={() => go(mode === "reset" ? "forgot" : "signin")}
                className="mb-2 flex items-center gap-1 text-xs text-muted hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> {mode === "reset" ? "Use a different account" : "Back to sign in"}
              </button>
            )}
            <h2 id="auth-title" className="text-lg font-semibold">
              {TITLES[mode]}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {mode === "forgot"
                ? "Enter your email or username. We'll email a 6-digit code to the address on your account."
                : mode === "reset"
                  ? `If an account matches “${form.identifier}”, we emailed it a 6-digit code. It expires in 15 minutes. Check your spam folder too.`
                  : mode === "change"
                    ? "You'll stay signed in here. Other devices will be signed out."
                    : (reason ?? "Save your courses and progress to your account so they're here on every device. No reuploading.")}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {changed ? (
          <div className="space-y-4">
            <p role="status" className="flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
              <MailCheck className="mt-0.5 size-4 shrink-0" /> {notice}
            </p>
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <>
                <div className="text-sm">
                  <label className="block">
                    <span className="mb-1 block font-medium">Email</span>
                    <input
                      ref={first}
                      type="email"
                      autoComplete="email"
                      required
                      value={form.email}
                      onChange={set("email")}
                      aria-describedby={`${uid}-email-hint`}
                      className={input}
                    />
                  </label>
                  <span id={`${uid}-email-hint`} className="mt-1 block text-xs text-subtle">
                    Used only to reset your password if you forget it.
                  </span>
                </div>
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
                {passwordField("Password", "new-password", "At least 8 characters")}
              </>
            )}

            {(mode === "signin" || mode === "forgot") && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Email or username</span>
                <input ref={first} autoComplete="username" required value={form.identifier} onChange={set("identifier")} className={input} />
              </label>
            )}

            {mode === "signin" && (
              <div>
                {passwordField("Password", "current-password")}
                <button type="button" onClick={() => go("forgot")} className="mt-1.5 text-xs font-medium text-primary hover:underline">
                  Forgot password?
                </button>
              </div>
            )}

            {mode === "reset" && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">6-digit code</span>
                  <input
                    ref={first}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    pattern="\d{6}"
                    title="The 6-digit code from the email"
                    value={form.code}
                    onChange={set("code")}
                    className={cn(input, "h-12 text-center font-mono text-2xl tracking-[0.5em]")}
                    placeholder="••••••"
                  />
                </label>
                {passwordField("New password", "new-password", "At least 8 characters")}
              </>
            )}

            {mode === "change" && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Current password</span>
                  <input
                    ref={first}
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={form.currentPassword}
                    onChange={set("currentPassword")}
                    className={input}
                  />
                </label>
                {passwordField("New password", "new-password", "At least 8 characters")}
              </>
            )}

            {notice && mode === "reset" && (
              <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy || (mode === "reset" && form.code.length !== 6)}>
              {busy && <Loader2 className="animate-spin" />}{" "}
              {mode === "signup"
                ? "Create account"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "forgot"
                    ? "Email me a code"
                    : mode === "reset"
                      ? "Reset password and sign in"
                      : "Change password"}
            </Button>

            {mode === "reset" && (
              <p className="text-center text-xs text-muted">
                Didn&apos;t get it?{" "}
                {resendIn > 0 ? (
                  <span className="tabular-nums">Resend in {resendIn}s</span>
                ) : (
                  <button type="button" onClick={resend} className="font-medium text-primary hover:underline">
                    Send a new code
                  </button>
                )}
              </p>
            )}
          </form>
        )}

        {(mode === "signin" || mode === "signup") && (
          <p className="mt-4 text-center text-sm text-muted">
            {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
            <button onClick={() => go(mode === "signup" ? "signin" : "signup")} className="font-medium text-primary hover:underline">
              {mode === "signup" ? "Sign in" : "Create an account"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
