# CourseBox

A personal course reader for downloaded course zips. Drop in a `.zip` (for example an MIT OpenCourseWare download, or a folder of videos, PDFs and notes) and it becomes a Udemy/Coursera-style course: a header, a sidebar of sections and lessons, a viewer, and progress tracking.

Phase 1 is local-first. Everything (files, progress, study time) lives in your browser's IndexedDB. There is no backend and no account.

## Run it

```bash
npm install        # also copies the pdf.js worker, wasm decoders, cmaps and fonts into public/
npm run dev        # http://localhost:3000
npm test           # Vitest unit tests for the structure analyzers
npm run build && npm start
```

Requires Node 20+.

## How it works

1. **Import** (`hooks/use-importer.ts`, `lib/import.worker.ts`). A Web Worker unzips the archive with JSZip, strips a single wrapping folder, runs the analyzers to preview the course, then writes each file blob to IndexedDB in batches. If a course with the same `sourceKey` already exists, you can update it (progress is kept) or add a copy.
2. **Structure analyzers** (`lib/analyzers/`). A list of adapters. The first whose `detect()` returns true produces a `CourseManifest`.
   - `ocw.ts`: MIT OCW new-style export (root `data.json` with `course_title`). It groups `resources/*/data.json` by `parent_title`, natural-sorts them, renames lectures with topics from `pages/lecture-notes` (for example "L2 · Binary Classification"), pairs assignments with their solutions (shown behind a "Reveal solution" step), turns `pages/*` into header tabs, and supports YouTube or archive videos with captions and transcripts.
   - `generic.ts`: fallback. Folders become sections and files become lessons. It strips "01 - " prefixes and uses them for ordering, flattens nested folders into "Folder / Subfolder", groups root-only files by type, attaches `.srt`/`.vtt` files next to videos as captions, and picks up `cover.jpg`/`thumbnail.png`.
3. **Storage** (`lib/db.ts`, Dexie). Tables are `courses`, `files` (`[courseId+path]`), `progress` (`[courseId+path]`), `state` (last lesson) and `activity` (seconds per day). Progress is keyed by file **path**, so "Re-analyze structure" and course updates keep it.
4. **Viewers** (`components/viewers/`). PDF (react-pdf, lazy pages, page nav, zoom, resumes the last page), video and audio (resume, speed, captions), YouTube, image, Markdown, sanitized HTML (DOMPurify, with in-course links and images resolved), text/code with line numbers, Jupyter notebooks, and a download fallback for everything else.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `j` / `k` | next / previous lesson |
| `m` | toggle lesson complete |
| `/` | search lessons |
| `Esc` | close the mobile drawer |

## Adding an analyzer

Create `lib/analyzers/<name>.ts` that implements `Analyzer` (`detect` and `analyze`), then add it to the list in `lib/analyzers/index.ts` before `genericAnalyzer`. Lesson ids come from `stableId(path)`, so they stay stable across re-analysis.

## Environment variables

None are needed for Phase 1. `.env.example` lists the ones Phase 2 (Supabase / R2 sync) will use.

## Deploy

Push to GitHub and import the repo in Vercel (framework: Next.js, default settings), or run `npx vercel` from this folder. Data stays in each browser, so a deployed copy is still private to whoever uses it.

## Limits (Phase 1)

- JSZip reads the whole archive into the worker's memory. Very large zips (several GB) may need a streaming unzipper.
- Data is per browser. Clearing site data removes your courses. The app asks the browser for persistent storage on the first import.
