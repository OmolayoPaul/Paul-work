# Afridetect EMR — working notes

## How the stack runs

- `docker-compose.base44.yml` runs everything from the cloned source:
  - `web` = Vite dev server on host port 3000, proxying `/api` → `http://api:8000`.
  - `api` = FastAPI + uvicorn with `--reload` on the bind-mounted `backend/`.
  - `setup` = one-shot `python -m app.setup` (creates tables, seeds accounts,
    clinics and preview demo patients); `api` waits for it with
    `service_completed_successfully`.
  - `db` = PostgreSQL 16 with a named volume.
- Because the frontend and API share one origin, session cookies are first-party.
  Do not expose the API on its own public port.

## Authentication

- Staff sign in with **email + password** (POST `/api/auth/login`). Passwords
  are hashed with PBKDF2-HMAC-SHA256 (`backend/app/security.py`).
- The super admin is seeded by `setup` with `SUPER_ADMIN_PASSWORD` (default
  `admin1234`). Demo staff are seeded with `demo1234` (preview mode only).
- Admins create new staff accounts via the staff management page; a password
  is required at creation and can be reset on edit.
- `BASE44_PREVIEW_MODE=1` enables a preview account picker
  (`POST /api/auth/dev-login`, `GET /api/auth/dev-accounts`) that signs in
  without a password, for sandbox testing only.
- `.env.base44-defaults` holds committed placeholders (super admin email,
  password, session timings). `/run/base44/app.env` is listed last in
  `env_file:` so dashboard values override the placeholders.

## Things that are easy to get wrong

- Tables are created by the `setup` service, not by the API. After changing
  `backend/app/models.py`, re-run it:
  `docker compose -f docker-compose.base44.yml run --rm setup`
  (there is no migration tool yet; `create_all` only adds new tables;
  `ensure_columns` adds new columns to existing tables).
- Demo patients are seeded only when `patients` is empty and
  `BASE44_PREVIEW_MODE=1`. To reseed the demo worklist, delete the demo
  `patients` rows (cascades are not configured; remove their visits and clinical
  entries too) and re-run `setup`.
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
- `google-auth` was removed from `requirements.txt` — the app no longer uses
  Google OAuth. The `backend/app/ocr.py` file is no longer imported (Gemini OCR
  was removed); the `/api/capture/duplicates` endpoint remains for duplicate
  patient checking during registration.

## Verifying a change

```bash
curl -s localhost:3000/ | head -5           # Vite serves index.html
curl -s localhost:3000/api/health           # API through the Vite proxy
curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@afridetect.ng","password":"admin1234"}'
docker compose -f docker-compose.base44.yml ps
```

In preview mode the login screen lists seeded staff accounts. Use the preview
picker or sign in with email + password (`demo1234` for demo staff,
`admin1234` for the super admin).

Clinical flows to check after touching the patient modules: worklist pending /
attended toggle, opening a row into the record, adding a vital sign and a
clinical note (both should appear in the timeline and in the audit log), and
registering + checking in a patient from `/worklist`.
