# Afridetect EMR — working notes

## How the stack runs

- `docker-compose.base44.yml` runs everything from the cloned source:
  - `web` = Vite dev server on host port 3000, proxying `/api` → `http://api:8000`.
  - `api` = uvicorn with `--reload` on the bind-mounted `backend/`.
  - `setup` = one-shot `python -m app.setup` (creates tables, seeds accounts);
    `api` waits for it with `service_completed_successfully`.
  - `db` = PostgreSQL 16 with a named volume.
- Because the frontend and API share one origin, session cookies are first-party.
  Do not expose the API on its own public port.

## Environment

- `.env.base44-defaults` holds committed placeholders (super admin email,
  session timings, empty `GOOGLE_CLIENT_ID`). `/run/base44/app.env` is listed
  last in `env_file:` so dashboard values override the placeholders.
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
  (there is no migration tool yet; `create_all` only adds new tables).
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
```

Sign-in is Google-only, so automated checks can use the preview account picker
when `BASE44_PREVIEW_MODE=1`; production behaviour must be verified with a real
Google account on the staff list.
