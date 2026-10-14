"use client";
import { useEffect, useState } from "react";
import { getFile, getPlayableUrl } from "@/lib/files";

/**
 * URL for a course file; revoked automatically. undefined while loading, null if missing.
 * With `stream`, media of account courses plays straight from storage instead of downloading first.
 */
export function useFileUrl(courseId: string | undefined, path: string | undefined, stream = false) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!courseId || !path) {
      setUrl(null);
      return;
    }
    let revoke: (() => void) | undefined;
    let cancelled = false;
    setUrl(undefined);
    getPlayableUrl(courseId, path, stream).then((r) => {
      if (cancelled) return r?.revoke?.();
      revoke = r?.revoke;
      setUrl(r?.url ?? null);
    });
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [courseId, path, stream]);
  return url;
}

export const getFileBlob = getFile;
