/** Messages between lib/python.ts and public/python-worker.mjs. */
export type PyRequest =
  | { type: "init"; indexURL: string; packageBaseUrl: string }
  | { type: "files"; files: { name: string; data: ArrayBuffer }[] }
  | { type: "run"; id: number; code: string };

export type PyResponse =
  | { type: "status"; message: string }
  | { type: "ready"; version: string }
  | { type: "stream"; id: number; name: "stdout" | "stderr"; text: string }
  | { type: "result"; id: number; html?: string; text?: string; images: string[] }
  | { type: "error"; id: number; traceback: string }
  | { type: "done"; id: number }
  | { type: "fatal"; message: string };
