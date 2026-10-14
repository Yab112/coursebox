# CourseBox

**Turn a downloaded course zip into your own Coursera/Udemy-style learning space.**
Drop in an MIT OpenCourseWare export, a Udemy-style download or any folder of videos, PDFs and notes.
CourseBox works out the structure (units, sessions, lectures, problem sets with solutions) and gives you a
clean course player with progress tracking. Everything stays in your browser.

![Lecture video with its notes attached](docs/screenshots/lecture-with-notes.png)

## Features

- **Drag and drop a zip.** It's unzipped in a Web Worker and stored in IndexedDB. No server, no account.
- **Smart structure detection:**
  - **MIT OCW:** units → sessions (18.06SC style), lecture videos with their notes attached, captions
    and transcripts linked to videos, problem sets and exams paired with locked solutions and starter
    templates, in-class multiple-choice questions you can answer, and syllabus/calendar as tabs.
  - **Any folder:** numbered sections and lessons, Udemy `1.1 resource` files, one-folder-per-lesson
    layouts, subtitles as captions, README as the course overview, and website/tooling junk ignored.
  - **Nothing is lost:** files no rule recognizes land in *Additional Materials*, and the
    **All files** tab shows where every file went.
- **Viewers:** PDF (page nav, zoom, resumes where you left off), video/audio (speed, captions, resume),
  YouTube with an MP4 fallback, Markdown, sanitized HTML, code, Jupyter notebooks, images, and zips
  you can browse inside the app.
- **Learning flow:** sidebar with progress, "Continue where you left off", mark complete,
  study time (counted only while the tab is visible), `j`/`k`/`m`/`/` shortcuts, dark mode, mobile drawer.
- **Re-analyze** a course or **re-import a newer version** without losing progress.

| Units and sessions (MIT 18.06SC) | In-class questions (MIT 6.0001) |
| --- | --- |
| ![](docs/screenshots/units-sessions.png) | ![](docs/screenshots/in-class-questions.png) |
| **Every file accounted for** | **Library** |
| ![](docs/screenshots/all-files.png) | ![](docs/screenshots/library-dark.png) |

## Quick start

```bash
git clone https://github.com/Yab112/coursebox && cd coursebox
npm install
npm run dev     # open http://localhost:3000 and drop a course zip
```

Requires Node 20+. To get an MIT course, open it on [ocw.mit.edu](https://ocw.mit.edu) and choose
**Download course**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run build && npm start` | Run the app |
| `npm test` | Unit tests for the analyzers (Vitest, real OCW metadata fixtures) |
| `npm run test:e2e` | End-to-end tests (Playwright). Add `PW_CHANNEL=chrome` to use an installed Chrome |
| `npm run analyze -- course.zip` | Print the structure CourseBox detects for a zip or folder |

## How it works

```
zip ──► Web Worker (JSZip) ──► IndexedDB files ──► analyzers ──► CourseManifest ──► course player
                                                     │
                       ocw.ts → generic.ts → coverage safety net (Additional Materials)
```

- `lib/analyzers/`: pluggable adapters. The first whose `detect()` matches builds a `CourseManifest`
  (sections → lessons, with attachments and solutions).
- `lib/db.ts`: Dexie tables for courses, files, progress, last-opened state and daily study time.
  Progress is keyed by file **path**, so re-analysis and updates keep it.
- `components/viewers/`: one viewer per file type.

See [CONTRIBUTING.md](CONTRIBUTING.md) to teach CourseBox a new course layout.

## Deploy

It's a standard Next.js app: import the repo on Vercel (or run `npx vercel`). Courses live in each
visitor's own browser, so a deployed copy is still private to whoever uses it.

## Roadmap

- Cloud sync across devices (Supabase / Cloudflare R2), optional
- Notes and highlights pinned to PDF pages, with markdown export
- Study heatmap, streaks and weekly goals
- "Ask about this lesson" with an LLM

## License

MIT for the code. The test fixtures contain MIT OpenCourseWare metadata under CC BY-NC-SA 4.0
(see [tests/fixtures/NOTICE.md](tests/fixtures/NOTICE.md)). CourseBox is not affiliated with MIT.
