# Build "CourseBox": a personal course reader for downloaded course zips

You are building a web app where I upload a course ZIP (for example an MIT OpenCourseWare download) and it turns into a polished course page, like Udemy or Coursera: a course header, a sidebar of sections and lessons on the left, a content viewer on the right, and progress tracking.

Work in PHASES. Finish Phase 1 completely, so it runs locally and is deployed, before you start Phase 2. Commit after each phase. Ask me before adding any paid service.

## Tech stack (do not add a separate Python backend)
- Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- `jszip` to unzip in the browser, `react-pdf` (pdf.js) for PDFs, native `<video>`/`<audio>`, `react-markdown` for .md, sanitized HTML (DOMPurify) for .html
- Phase 1 storage: IndexedDB through `idb` or `dexie`, so everything is local with no backend
- Phase 2 storage: Supabase (Postgres + Auth + Storage) OR Cloudflare R2 (S3-compatible) through presigned uploads from Next.js route handlers
- Deploy: Vercel

## Phase 1: MVP, local-first (target about 40 minutes)
1. **Library page (`/`)**: a grid of course cards (thumbnail, title, instructor, progress %). Has an "Add course" dropzone for a .zip file.
2. **Import pipeline (client side, in a Web Worker if possible)**:
   - Unzip with JSZip and store every file blob in IndexedDB under `courseId/path`.
   - Run the **structure analyzer** (below) to produce a `CourseManifest` JSON and save it.
   - Show a progress bar while importing.
3. **Course page (`/course/[id]`)**:
   - Header: title, instructor, level, term, description, cover image, "Continue where you left off" button.
   - **Left sidebar**: collapsible sections, each with ordered lessons. Each lesson shows a file-type icon and a checkmark when done. Has a search box that filters lessons.
   - **Right pane**: viewer for the selected lesson. PDF with page nav and zoom, video, image, markdown, sanitized HTML, plain-text or code fallback, and a download button.
   - Prev / Next lesson buttons and a "Mark complete" button.
4. **Progress tracking (IndexedDB)**: completed lessons, last opened lesson, last PDF page per lesson, and time spent per lesson (count only while the tab is visible). Show a progress bar per course.
5. Dark/light mode, responsive layout (sidebar becomes a drawer on mobile), keyboard shortcuts (j/k = next/prev lesson).
6. Deploy to Vercel and give me the URL.

## The structure analyzer (most important part, must be pluggable)
Define this interface and implement it as a list of **adapters**. The first adapter whose `detect()` returns true is used. Put them in `lib/analyzers/`.

```ts
type Lesson = { id: string; title: string; order: number; type: 'pdf'|'video'|'audio'|'image'|'html'|'markdown'|'text'|'other'; path: string; meta?: Record<string, unknown> };
type Section = { id: string; title: string; order: number; lessons: Lesson[] };
type CourseManifest = { id: string; title: string; instructor?: string; description?: string; coverPath?: string; level?: string; term?: string; source: string; sections: Section[]; extraPages?: { title: string; html: string }[] };
interface Analyzer { name: string; detect(files: string[], read: (p: string) => Promise<string>): Promise<boolean>; analyze(...): Promise<CourseManifest>; }
```

### Adapter 1: MIT OCW (new-style export). Detect it by a root `data.json` that contains `course_title`.
The real layout I have (18.657 Fall 2015) looks like this:
```
data.json                       -> course_title, course_description, instructors[{title}], level, term, year, image_src, primary_course_number
index.html, sitemap.xml
pages/<section>/data.json       -> syllabus, calendar, lecture-notes, assignments, readings  (fields: title, content = HTML, description)
resources/<slug>/data.json      -> one per file. fields: title ("Lecture 4 Notes"), file ("/courses/.../<hash>_MIT18_657F15_L4.pdf"),
                                   file_type, learning_resource_types (e.g. "['Lecture Notes']"), parent_title ("Lecture Notes"), resourcetype
static_resources/<hash>_<name>.pdf / .jpg  -> the actual files
```
Rules:
- Course metadata comes from root `data.json`. Note that some list fields are Python-repr strings like `"['Graduate']"`, so parse them leniently.
- Each `resources/*/data.json` becomes a lesson. Map its `file` to `static_resources/<basename of file>`.
- Group lessons into sections by `parent_title` (fallback: `learning_resource_types[0]`). Order sections: Lecture Notes, Assignments/Problem Sets, Solutions, Readings, Other.
- Sort lessons with **natural sort** on numbers in the title (Lecture 2 before Lecture 10). Put a "full lecture notes" item first in its section.
- Use the topic names in `pages/lecture-notes/data.json` (an HTML table that links `../../resources/<slug>/index.html` to a topic name like "Binary Classification") to rename lessons, for example "L2 · Binary Classification".
- Turn `pages/*` (syllabus, calendar) into `extraPages` shown as tabs in the course header (render the HTML sanitized).
- Pair problem sets with their solutions: link `assignment-1` with `assignment-1-solution` and show the solution as a locked "Reveal solution" button.
- Skip the site chrome: js/css/fonts/svg/map files, favicon, thumbnails ending in `-th.jpg`.

### Adapter 2: Generic folder structure (fallback, always matches)
- Top-level folders become sections, files inside become lessons. Nested folders deeper than 2 levels get flattened into "Folder / Subfolder" section titles.
- If everything is at the root, group files by type (Videos, PDFs, Documents).
- Clean titles: strip leading numbers/separators ("01 - intro_video.mp4" → "Intro Video"), but use the numbers for ordering. Natural sort.
- Course title = zip name or the single root folder name. Cover = first image named cover/thumbnail/poster, else a generated gradient.
- Ignore junk: `__MACOSX`, `.DS_Store`, `Thumbs.db`, hidden files.

### Adapter 3 (Phase 2): a `course.json` / `manifest.json` that I write myself overrides everything.

**Re-analysis**: add a "Re-analyze structure" button on the course page. It re-runs the analyzers on the stored files and **keeps progress** by matching lessons on `path`. When I upload a new version of the same course (same title or source id), offer "update existing course" and run the same merge.

Write unit tests (Vitest) for both adapters. For the OCW adapter, use a small fixture copied from the layout above.

## Phase 2: cloud + accounts (after Phase 1 is deployed)
- Supabase Auth (email magic link + Google).
- After unzipping in the browser, upload each file directly to storage with presigned URLs. Don't upload the raw zip, because free tiers have small per-file limits. Recommended: Cloudflare R2 (10 GB free, no egress fees) or Supabase Storage (1 GB free). Avoid Cloudinary for this, because it's built for images/video and is awkward for PDFs and zips.
- Postgres tables: `courses(id, user_id, manifest jsonb, created_at)`, `files(course_id, path, storage_key, size, mime)`, `progress(user_id, lesson_id, course_id, completed_at, last_position jsonb, seconds_spent)`, `notes(user_id, lesson_id, body, page, created_at)`.
- Sync IndexedDB progress to the server so it works across devices.

## Phase 3: learning features
- Notes and highlights per lesson (pinned to a PDF page), plus a notes export to markdown.
- Analytics dashboard: study time per day (heatmap), streak, completion % per section, estimated time to finish at the current pace.
- Weekly goals ("2 lectures/week") with reminders.
- Optional: "Ask about this lesson". Send the extracted PDF text to an LLM API to get explanations and quiz questions.

## Quality bar
- It should look like a premium course site: clean typography (Inter), generous spacing, subtle shadows, smooth sidebar transitions, skeleton loaders, empty states.
- No crashes on unknown file types. Show a download fallback.
- Big zips (500 MB+) must not freeze the UI: use a Web Worker and stream file writes.
- README with setup and env vars, and a `.env.example`.

Start now with Phase 1. First show me the folder structure you plan, then build it.
