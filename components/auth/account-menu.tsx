"use client";
import { LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/utils";
import { Button } from "../ui/button";
import { useAuth } from "./auth-provider";

/** Top-right account area: sign in / create account, or the signed-in user's menu. */
export function AccountMenu({ compact }: { compact?: boolean }) {
  const { status, user, usage, openAuth, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (status === "loading") return <div className="h-8 w-24" />;

  if (status === "anon")
    return (
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={() => openAuth("signin")}>
          Sign in
        </Button>
        {!compact && (
          <Button size="sm" onClick={() => openAuth("signup")}>
            Create account
          </Button>
        )}
      </div>
    );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-surface-2"
        aria-label="Account menu"
      >
        <span className="grid size-7 place-items-center rounded-full bg-primary-soft text-primary">
          <UserRound className="size-4" />
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{user?.username}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-60 rounded-xl border border-border bg-surface p-2 shadow-pop">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-semibold">{user?.username}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
          {usage && (
            <div className="mx-2 my-1 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              <span className="font-semibold text-foreground">
                {usage.courses} of {usage.courseLimit}
              </span>{" "}
              courses saved · {formatBytes(usage.bytes)}
            </div>
          )}
          <button
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
