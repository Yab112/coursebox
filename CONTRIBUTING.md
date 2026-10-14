# Contributing to CourseBox

Thanks for helping! The most valuable contributions are **new course layouts**: every zip that
CourseBox organizes badly is a bug worth fixing.

## Setup

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # unit tests (Vitest)
npm run build && npm run test:e2e   # end-to-end tests (Playwright)
```

The e2e suite uses Playwright's Chromium (`npx playwright install chromium`). To reuse an
installed Chrome instead: `PW_CHANNEL=chrome npm run test:e2e`.

## "My course isn't organized well"

1. Run the analyzer on your zip or folder. It prints the detected structure:

   ```bash
   npm run analyze -- path/to/course.zip
   ```

2. Open an issue with the **Course structure** template. Paste that output, plus a file listing
   (`unzip -l course.zip | head -200`). Please don't attach copyrighted course files.

## Fixing a layout

Analyzers live in `lib/analyzers/`:

| File | Handles |
| --- | --- |
| `ocw.ts` | MIT OpenCourseWare exports (`data.json` + `resources/` + `pages/`), including unit/session courses |
| `generic.ts` | Any folder tree (Udemy-style numbering, one folder per lesson, flat dumps) |
| `index.ts` | Adapter chain plus the coverage safety net (no content file is ever dropped) |

To add support for a new platform, write an `Analyzer` (`detect` + `analyze`, and optionally
`isAsset`), then register it in `lib/analyzers/index.ts` before `genericAnalyzer`.

Every fix needs a test:

- **Unit tests** (`tests/*.test.ts`): plain file lists for folder layouts. For platform exports,
  add a metadata-only fixture under `tests/fixtures/<name>/` with a `files.txt` that lists the
  binary files, and load it with `loadFixture()`.
- **E2E tests** (`e2e/*.spec.ts`): zips are generated in `e2e/fixtures.ts`.

Keep lesson ids stable (`stableId(path)`) so learners' progress survives re-analysis.

## Pull requests

- `npm run lint && npx tsc --noEmit && npm test` must pass. CI also runs the build and Playwright.
- Keep PRs focused and describe the course layout you tested with.
