# Deploying CourseBox

```
Browser ──► Vercel (Next.js web app) ──► Render (CourseBox API, Node + TypeORM) ──► Supabase Postgres
   │                                         │
   └──────── presigned PUT/GET ─────────────► Amazon S3 (course files)
```

Reading courses never needs the backend: files live in the browser's IndexedDB. The API is only used by
people who create an account, so their courses and progress follow them across devices.

## 1. Amazon S3 (file storage)

Region **eu-west-1** (same as the database).

1. **Create bucket** e.g. `coursebox-files-<you>`:
   - Object Ownership: *ACLs disabled*
   - **Block all public access: ON**. Files are only reachable through signed URLs that expire after 1 hour.
   - Default encryption: SSE-S3. Versioning: off.
2. **CORS** (bucket → Permissions → CORS):
   ```json
   [{
     "AllowedOrigins": ["http://localhost:3000", "https://YOUR-APP.vercel.app"],
     "AllowedMethods": ["GET", "PUT", "HEAD"],
     "AllowedHeaders": ["*"],
     "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
     "MaxAgeSeconds": 3600
   }]
   ```
3. **IAM user** `coursebox-api` (no console access) with this inline policy (replace `BUCKET`):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::BUCKET" },
       { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::BUCKET/*" }
     ]
   }
   ```
   The API needs: `PutObject` to issue upload URLs, `GetObject` for download URLs, `ListBucket` to verify uploads
   and find leftovers, and `DeleteObject` when a course is deleted.
4. **Access key**: user → Security credentials → Create access key → "Application running outside AWS".

Objects are stored as `users/<userId>/courses/<courseId>/<fileId>`. Keys never contain user-supplied names.

## 2. Supabase (database)

Use the **session pooler** connection string (Project → Connect). URL-encode special characters in the
password (`>` → `%3E`, `%` → `%25`, `;` → `%3B`, `@` → `%40`, …).

The API creates its own schema `coursebox` with row-level security on every table, and the `anon` and
`authenticated` roles get no access, so Supabase's auto-generated REST API can't read it. Only the
Postgres connection string is needed; the anon and service-role keys are not used.

Migrations run automatically on API start (`RUN_MIGRATIONS=true`), or manually with
`cd server && npm run build && npm run migrate`.

## 3. Render (API)

1. Render → **New → Blueprint** → pick this repository. `render.yaml` defines the `coursebox-api` service
   (root `server/`, health check `/health`).
2. Fill in the secret env vars:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Supabase session-pooler URL (password URL-encoded) |
   | `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | from step 1 |
   | `CORS_ORIGINS` | `https://YOUR-APP.vercel.app` (comma-separate more origins) |
   | `PUBLIC_API_URL` | `https://coursebox-api.onrender.com` (your Render URL) |

   `SIGNING_SECRET` is generated automatically. `COURSE_LIMIT` (default 2) and `MAX_COURSE_BYTES`
   (default 2 GB) bound storage per account.
3. Deploy. Check `https://<service>.onrender.com/health` → `{"ok":true}`.

On Render's free plan the service sleeps after 15 minutes idle; the first request then takes ~30–60 s.

## 4. Vercel (web app)

1. Vercel → **Add New Project** → import this repository (framework: Next.js, root: repository root).
2. Environment variable: `NEXT_PUBLIC_API_URL = https://<service>.onrender.com`.
3. Deploy, then add the Vercel URL to the S3 CORS rules (step 1.2) and to `CORS_ORIGINS` on Render.

## Limits & housekeeping

- 2 courses per account (per-user override: `UPDATE coursebox.users SET course_limit = 5 WHERE username = '…'`).
- Deleting a course removes its S3 objects first; the slot is free immediately.
- Uploads not completed within 24 h and half-deleted courses are cleaned up every 30 minutes.
