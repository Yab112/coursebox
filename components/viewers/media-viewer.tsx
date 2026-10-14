"use client";
import { useEffect, useRef, useState } from "react";
import { getFile } from "@/lib/files";
import { cn } from "@/lib/utils";

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

function srtToVtt(srt: string) {
  return "WEBVTT\n\n" + srt.replace(/\r/g, "").replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2");
}

function useCaptionTracks(courseId: string, paths: string[]) {
  const [tracks, setTracks] = useState<{ src: string; label: string; lang: string }[]>([]);
  const key = paths.join("|");
  useEffect(() => {
    let urls: string[] = [];
    let cancelled = false;
    (async () => {
      const out: { src: string; label: string; lang: string }[] = [];
      for (const p of paths) {
        const blob = await getFile(courseId, p);
        if (!blob) continue;
        let text = await blob.text();
        if (p.toLowerCase().endsWith(".srt") || !text.startsWith("WEBVTT")) text = srtToVtt(text);
        const src = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
        urls.push(src);
        const lang = p.match(/\.([a-z]{2}(?:-[A-Za-z]{2})?)\.(srt|vtt)$/i)?.[1] ?? "en";
        out.push({ src, lang, label: lang.toUpperCase() });
      }
      if (!cancelled) setTracks(out);
    })();
    return () => {
      cancelled = true;
      urls.forEach(URL.revokeObjectURL);
      urls = [];
    };
  }, [courseId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return tracks;
}

export function MediaViewer({
  kind,
  src,
  courseId,
  captionPaths = [],
  initialPosition = 0,
  onPosition,
  onEnded,
}: {
  kind: "video" | "audio";
  src: string;
  courseId: string;
  captionPaths?: string[];
  initialPosition?: number;
  onPosition?: (seconds: number, duration: number) => void;
  onEnded?: () => void;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const lastSaved = useRef(0);
  const [speed, setSpeed] = useState(1);
  const tracks = useCaptionTracks(courseId, captionPaths);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);

  const props = {
    ref,
    src,
    controls: true,
    preload: "metadata" as const,
    onLoadedMetadata: () => {
      const el = ref.current;
      if (el && initialPosition > 0 && initialPosition < el.duration - 5) el.currentTime = initialPosition;
      if (el) el.playbackRate = speed;
    },
    onTimeUpdate: () => {
      const el = ref.current;
      if (!el || Math.abs(el.currentTime - lastSaved.current) < 5) return;
      lastSaved.current = el.currentTime;
      onPosition?.(el.currentTime, el.duration);
    },
    onPause: () => ref.current && onPosition?.(ref.current.currentTime, ref.current.duration),
    onEnded,
  };

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex min-h-0 flex-1 items-center justify-center", kind === "video" ? "bg-black" : "bg-viewer p-8")}>
        {kind === "video" ? (
          <video {...props} className="max-h-full w-full">
            {tracks.map((t, i) => (
              <track key={t.src} src={t.src} kind="subtitles" srcLang={t.lang} label={t.label} default={i === 0} />
            ))}
          </video>
        ) : (
          <div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-8 shadow-card">
            <audio {...props} className="w-full" />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-border bg-surface px-3 py-2 text-sm">
        <span className="mr-1 text-muted">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={cn(
              "rounded-md px-2 py-1 tabular-nums transition-colors",
              s === speed ? "bg-primary-soft font-semibold text-primary" : "text-muted hover:bg-surface-2",
            )}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

export function YouTubeViewer({
  id,
  start = 0,
  remoteUrl,
  courseId,
  captionPaths,
}: {
  id: string;
  start?: number;
  remoteUrl?: string;
  courseId: string;
  captionPaths?: string[];
}) {
  const [mp4, setMp4] = useState(false);
  if (mp4 && remoteUrl)
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <MediaViewer kind="video" src={remoteUrl} courseId={courseId} captionPaths={captionPaths} initialPosition={start} />
        </div>
        <button onClick={() => setMp4(false)} className="shrink-0 bg-surface px-4 py-2 text-left text-xs text-primary hover:underline">
          Switch back to YouTube
        </button>
      </div>
    );
  return (
    <div className="flex h-full flex-col bg-black">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="aspect-video max-h-full w-full">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&start=${Math.floor(start)}`}
            title="Lecture video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
      <p className="shrink-0 bg-surface px-4 py-2 text-xs text-muted">
        Streaming from YouTube (the zip doesn&apos;t include the video, so this needs internet).
        {remoteUrl && (
          <>
            {" "}
            <button onClick={() => setMp4(true)} className="font-medium text-primary hover:underline">
              Play the MP4 instead
            </button>{" "}
            for speed control and the course&apos;s captions.
          </>
        )}
      </p>
    </div>
  );
}
