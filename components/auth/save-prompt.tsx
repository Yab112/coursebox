"use client";
import { CloudUpload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { useAuth } from "./auth-provider";

const key = (courseId: string) => `coursebox.savePrompt.${courseId}`;

/**
 * Shown once per course to visitors who aren't signed in: reading works without an account,
 * an account just keeps the course and progress so they never have to upload it again.
 */
export function SavePrompt({ courseId, title }: { courseId: string; title: string }) {
  const { status, openAuth } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (status !== "anon") return;
    let seen = false;
    try {
      seen = !!localStorage.getItem(key(courseId));
    } catch {}
    if (seen) return;
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, [status, courseId]);

  const dismiss = () => {
    try {
      localStorage.setItem(key(courseId), "1");
    } catch {}
    setShow(false);
  };

  if (!show || status !== "anon") return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div role="dialog" aria-modal="true" aria-labelledby="save-title" className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-pop">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <CloudUpload className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="save-title" className="text-lg font-semibold">
              Keep this course?
            </h2>
            <p className="mt-1 text-sm text-muted">
              You can start learning <span className="font-medium text-foreground">{title}</span> right now, no account needed.
              Create a free account to save it and your progress, so you never have to upload it again and can continue on any device.
            </p>
          </div>
          <button onClick={dismiss} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            className="flex-1"
            onClick={() => {
              dismiss();
              openAuth("signup", { saveCourseId: courseId, reason: "Your course and progress will be saved to your account." });
            }}
          >
            Create free account
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              dismiss();
              openAuth("signin", { saveCourseId: courseId, reason: "Sign in to save this course to your account." });
            }}
          >
            Sign in
          </Button>
          <Button variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
        <p className="mt-3 text-center text-xs text-subtle">Free accounts hold 2 courses. Delete one when you finish it to add another.</p>
      </div>
    </div>
  );
}
