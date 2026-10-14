# CourseBox API

Accounts, course storage and progress sync for CourseBox. Node + Express 5 + **TypeORM** + PostgreSQL,
with files on **S3** (or local disk for development).

```bash
cp .env.example .env      # point DATABASE_URL at any Postgres
npm install
npm run dev               # http://localhost:4000 (runs migrations on start)
npm test                  # starts a throwaway Postgres 17 in Docker, or uses TEST_DATABASE_URL
```

## API

All routes except `/auth/*` and `/health` need `Authorization: Bearer <token>`.

| Method | Path | |
| --- | --- | --- |
| POST | `/auth/signup` | `{ email, username, password }` → `{ user, token }`. Email and username are unique, case-insensitively. No email verification. |
| POST | `/auth/login` | `{ identifier, password }`. Identifier is the email or the username. |
| POST | `/auth/logout` | Revokes this session only |
| GET | `/me` | User + usage (`courses`, `courseLimit`, `bytes`) |
| GET | `/courses` | The account's courses (summary, lesson and completed counts) |
| POST | `/courses` | Create from a client-side manifest + file list → `needUpload`. Idempotent per `clientRef`. 409 `course_limit` when full |
| GET | `/courses/:id` | Manifest + file list |
| PATCH | `/courses/:id` | Save a re-analyzed manifest |
| PUT | `/courses/:id/files` | New version of the course: only changed files need uploading |
| POST | `/courses/:id/uploads` | Presigned PUT URLs (≤ 500 per call); size and type are part of the signature |
| POST | `/courses/:id/complete` | Verifies every file is in storage with the right size → `ready` |
| POST | `/courses/:id/file-urls` | Presigned GET URLs (≤ 200 per call, 1 h) |
| DELETE | `/courses/:id` | Frees the slot, deletes the S3 objects, then the rows |
| GET/POST | `/courses/:id/progress` | Read / merge progress |

## Data model (schema `coursebox`)

| Table | Notes |
| --- | --- |
| `users` | unique `lower(email)`, unique `lower(username)`, format CHECKs, `course_limit` (default 2), scrypt password hash |
| `sessions` | only the SHA-256 of the bearer token is stored; 30-day sliding expiry; revocable |
| `courses` | `status` enum `uploading → ready → deleting`, manifest `jsonb`, `client_ref` unique per user |
| `course_files` | unique `(course_id, path)`; `storage_key` built from server ids only |
| `progress` | PK `(course_id, path)`; completion is last-write-wins by `completed_changed_at`, study seconds are additive |
| `study_days` | seconds per user, course and day |

Every foreign key cascades on delete. Row-level security is on for all tables, and Supabase's API roles
have no access to the schema.

## Design decisions

- **Limits under concurrency**: course creation locks the user row (`SELECT … FOR UPDATE`), so parallel
  uploads can't exceed the limit. Tests fire 5 at once.
- **Idempotent creates**: a create retried after a lost response (page reload mid-request) returns the same
  course (`client_ref`), even when two retries race.
- **Storage is verified, not trusted**: `complete` lists the S3 prefix and compares sizes before a course is ready.
- **Browser uploads go straight to S3**: the API never proxies file bytes.
- **No secrets in logs**: authorization headers and signed-URL signatures are redacted.
