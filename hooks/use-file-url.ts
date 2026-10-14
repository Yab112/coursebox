"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";

/** Object URL for a stored course file; revoked automatically. undefined while loading, null if missing. */
export function useFileUrl(courseId: string | undefined, path: string | undefined) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!courseId || !path) {
      setUrl(null);
      return;
    }
    let u: string | undefined;
    let cancelled = false;
    setUrl(undefined);
    db.files.get([courseId, path]).then((f) => {
      if (cancelled) return;
      if (!f) return setUrl(null);
      u = URL.createObjectURL(f.blob);
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [courseId, path]);
  return url;
}

export async function getFileBlob(courseId: string, path: string) {
  return (await db.files.get([courseId, path]))?.blob;
}
