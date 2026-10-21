/// <reference lib="webworker" />
import JSZip from "jszip";
import { analyzeCourse, analyzers, stripCommonRoot } from "./analyzers";
import { isJunk } from "./analyzers/utils";
import { buildXray, type Xray } from "./xray";

/** Reads a zip's file list (and the few text files the analyzer asks for) without storing anything. */
export type XrayResponse = { type: "done"; xray: Xray } | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<File>) => {
  try {
    const file = ev.data;
    const zip = await JSZip.loadAsync(file);
    const all = Object.values(zip.files).filter((f) => !f.dir);
    const content = all.filter((f) => !isJunk(f.name));
    const { root, strip } = stripCommonRoot(content.map((f) => f.name));
    const byPath = new Map(content.map((f) => [strip(f.name), f]));
    const files = [...byPath.keys()];
    const archive = root ?? file.name.replace(/\.zip$/i, "");

    const read = (p: string) => {
      const f = byPath.get(p);
      if (!f) throw new Error(`missing ${p}`);
      return f.async("string");
    };
    const { manifest, analyzer } = await analyzeCourse(files, read, { courseId: "xray", archiveName: archive });
    // Junk is shown too (crossed out), so people can see it was set aside on purpose.
    // (Only strip the course's root folder from junk that actually sits inside it, e.g. not from __MACOSX/.)
    const first = content[0]?.name ?? "";
    const prefix = first.slice(0, first.length - strip(first).length);
    const junk = all.filter((f) => isJunk(f.name)).map((f) => (prefix && f.name.startsWith(prefix) ? f.name.slice(prefix.length) : f.name));
    const xray = buildXray(archive, analyzer, [...files, ...junk], manifest, analyzers.find((a) => a.name === analyzer)?.isAsset);
    ctx.postMessage({ type: "done", xray } satisfies XrayResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({
      type: "error",
      message: /end of central directory|corrupted zip|is this a zip/i.test(message) ? "That file isn't a readable .zip." : message,
    } satisfies XrayResponse);
  }
};
