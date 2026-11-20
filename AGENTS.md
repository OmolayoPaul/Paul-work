# Afridetect EMR — working notes

## How the stack runs

- `docker-compose.base44.yml` runs everything from the cloned source:
  - `web` = Vite dev server on host port 3000, proxying `/api` → `http://api:8000`.
  - `api` = uvicorn with `--reload` on the bind-mounted `backend/`.
  - `setup` = one-shot `python -m app.setup` (creates tables, seeds accounts,
    clinics and preview demo patients); `api` waits for it with
    `service_completed_successfully`.
  - `db` = PostgreSQL 16 with a named volume.
- Because the frontend and API share one origin, session cookies are first-party.
  Do not expose the API on its own public port.

## Environment

- `.env.base44-defaults` holds committed placeholders (super admin email and
  first password, session timings). `/run/base44/app.env` is listed last in
  `env_file:` so dashboard values override the placeholders.
- `BASE44_PREVIEW_MODE` is passed through to `api` and `web`; only the exact
  string `1` enables preview-only behaviour:
  - `POST /api/auth/dev-login` and `GET /api/auth/dev-accounts`
  - seeded demo staff accounts in `app/setup.py`
  - the non-secure session cookie (so preview sign-in works over http)
  - the Vite host allowlist for the sandbox hostname

## Things that are easy to get wrong

- Tables are created by the `setup` service, not by the API. After changing
  `backend/app/models.py`, re-run it:
  `docker compose -f docker-compose.base44.yml run --rm setup`
  (`create_all` only creates new tables; new columns on an existing table come
  from the `COLUMN_MIGRATIONS` list in `app/setup.py`, which runs idempotent
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements — add a line there for
  every new column).
- Demo data: `app/setup.py` seeds 15 fictional patients (`is_demo = true`), each
  with a visit today when relevant plus a completed visit in the past month so
  the reports have numbers. Seeding is idempotent by `patient_no` and only runs
  when `BASE44_PREVIEW_MODE=1`. Remove all of it with
  `run --rm setup python -m app.setup --remove-demo`.
- `is_demo` is surfaced as a "Demo" chip in the worklist and patient register.
  Never present demo records as real patient data.
- Card scanning (`routers/ocr.py` + `app/ocr.py`) runs the **local** Tesseract
  engine via subprocess — there is no external AI provider or API key. The image
  needs `tesseract-ocr`, `tesseract-ocr-eng` and `poppler-utils`, plus
  `python-multipart` and `Pillow` from `requirements.txt`. `POST /api/ocr/scan`
  (multipart `file`) returns per-field `{value, confidence}`; unreadable images
  return 422 with a friendly message. Scans are rate-limited in-process to 20 per
  user per hour, so a restart clears the counter. Fields come from a rule-based
  parser (`app/ocr.py`), not a language model — extend `LABELS` there when a new
  card layout needs a label.
- Clinical notes are versioned: an edit inserts a **new row** sharing `thread_id`
  with a higher `version`; a delete sets `is_deleted` on every row of the thread.
  The record only shows the latest, undeleted version. `GET
  /api/patients/{id}/notes/{note_id}/versions` returns the history.
- Attachments are stored as bytes in the `attachments` table (`content`,
  `mime_type`, `size_bytes`), so there is no upload volume to manage. Upload with
  multipart `file` + optional `description`, `kind`, `visit_id`; download from
  `/api/patients/{id}/attachments/{attachment_id}/download`.
- Order status vocabulary: lab requests are `pending` → `completed`
  (`POST /api/patients/{id}/lab-requests/{lab_id}/results`, lab scientist or
  super admin); prescriptions are `open` → `dispensed`
  (`POST /api/patients/{id}/prescriptions/{id}/dispense`, pharmacist or super
  admin). `/api/orders` feeds the Orders page for both queues.
- Messages (`routers/messages.py`) use one row per message with a shared
  `thread_id`; unread = recipient rows with `read_at` null. `/api/messages`
  (inbox/sent), `/{thread_id}`, `/{thread_id}/reply`, `/{thread_id}/read`,
  `/unread-count`, `/recipients`.
- Reports live in `routers/reports.py`: `/api/reports/summary?days=7|30|90` and
  `/api/reports/export/{patients-per-day|patients-per-clinic|top-diagnoses}.csv`.
  Only super admin, doctor and admin staff may call them. CSV export always
  returns a file — headings only when the period is empty.
- Sign-in is email + password: `POST /api/auth/login` verifies the PBKDF2 hash
  in `app/security.py`. A staff account needs a password before it can sign in —
  `POST /api/staff` requires one, `PATCH /api/staff/{id}` accepts `password` for
  a reset (which revokes that person's sessions), and `POST /api/auth/password`
  changes your own. `setup.py` sets a first password only when the account has
  none, so a changed password survives restarts.
- Route permissions are defined once in `frontend/src/lib/nav.js`
  (`NAV_SECTIONS[].items[].roles`); `App.jsx` wraps every page in `RoleGuard`,
  which reads the same table, so a direct URL cannot reach a page the sidebar
  hides. Keep the backend role lists in step with it.
- Clinical writes are role-gated in `backend/app/routers/patients.py`:
  registration = super admin / doctor / nurse / records officer; vitals, notes
  and allergies = super admin / doctor / nurse; diagnoses, prescriptions and lab
  requests = super admin / doctor. Doctors only see visits assigned to them or
  unassigned ones on the worklist (`routers/worklist.py`).
- The preview host arrives as `<port>-<sandbox id>.$BASE44_SANDBOX_HOST_DOMAIN`;
  `frontend/vite.config.js` adds `.<BASE44_SANDBOX_HOST_DOMAIN>` to
  `allowedHosts` only when `BASE44_PREVIEW_MODE === "1"`.
- `npm ci` runs on web start-up only when `node_modules` is missing or the
  lockfile is newer, so dependency changes need the container restarted.

## Verifying a change

```bash
curl -s localhost:3000/ | head -5           # Vite serves index.html
curl -s localhost:3000/api/health           # API through the Vite proxy
docker compose -f docker-compose.base44.yml ps

# Signed-in checks: keep the cookie jar from the preview sign-in call
curl -s -c /tmp/jar -X POST localhost:3000/api/auth/dev-login \
  -H 'Content-Type: application/json' -d '{"email":"admin@afridetect.ng"}'
curl -s -b /tmp/jar "localhost:3000/api/reports/summary?days=30"
curl -s -b /tmp/jar -D - "localhost:3000/api/reports/export/top-diagnoses?days=30"
```

Sign-in is email + password. The seeded super admin uses `SUPER_ADMIN_EMAIL`
with `SUPER_ADMIN_PASSWORD` from `.env.base44-defaults` (the setup service only
applies it while the account has no password). Automated checks can also use the
preview account picker when `BASE44_PREVIEW_MODE=1`; the seeded preview staff
share the first password `Afridetect2026!`.

Clinical flows to check after touching the patient modules: worklist pending /
attended toggle, opening a row into the record, adding a vital sign and a
clinical note (both should appear in the timeline and in the audit log), and
registering + checking in a patient from `/worklist`.

End-to-end checks worth repeating after changes to the clinical modules:

```bash
# scan a printed card (expect 200 + fields; a blurry photo should be 422)
curl -s -b /tmp/jar -F "file=@/tmp/card.png" localhost:3000/api/ocr/scan | head -c 400

# note versions: edit, then list versions
curl -s -b /tmp/jar -X PATCH localhost:3000/api/patients/<id>/notes/<note> \
  -H 'Content-Type: application/json' -d '{"assessment":"Updated"}'
curl -s -b /tmp/jar localhost:3000/api/patients/<id>/notes/<note>/versions

# lab result and dispensing
curl -s -b /tmp/jar -X POST localhost:3000/api/patients/<id>/lab-requests/<lab>/results \
  -H 'Content-Type: application/json' -d '{"analyte":"Malaria RDT","result_value":"Positive"}'
curl -s -b /tmp/jar -X POST localhost:3000/api/patients/<id>/prescriptions/<rx>/dispense -d '{}'
```

Role gates on the backend must match `frontend/src/lib/nav.js`: the worklist now
requires super admin, doctor, nurse or records officer (it previously allowed any
signed-in role), orders require super admin, doctor, nurse, pharmacist or lab
scientist, and card scanning requires super admin, doctor or records officer.
