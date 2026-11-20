# Afridetect EMR

Electronic Medical Records for hospitals and clinics in Nigeria.

A closed clinical workspace: Google-only sign-in, staff accounts created by a
super admin, role-based access, and an append-only audit trail.

## Stack

| Piece    | Technology                                    |
| -------- | --------------------------------------------- |
| Frontend | React 18 + Vite + Tailwind CSS                |
| Backend  | FastAPI + SQLAlchemy 2                        |
| Database | PostgreSQL 16                                 |
| Auth     | Google Identity Services → httpOnly session cookie |

Single origin: the Vite dev server serves the app on port 3000 and proxies
`/api` to the FastAPI service, so session cookies stay first-party.

## Running locally (sandbox / development)

```bash
docker compose -f docker-compose.base44.yml up -d --build
```

That brings up `db`, a one-shot `setup` service (creates tables and seeds the
first super admin), `api` (uvicorn with reload) and `web` (Vite dev server on
<http://localhost:3000>).

Run backend commands inside the container:

```bash
docker compose -f docker-compose.base44.yml exec -T api python -m app.setup
```

## Sign-in

Production sign-in is **Google only**. Set `GOOGLE_CLIENT_ID` to a Google OAuth
Web Client ID whose authorised JavaScript origins include the app origin.

When `BASE44_PREVIEW_MODE=1` (sandbox previews only) the login screen also
offers a **preview sign-in** picker with seeded staff accounts, one per role, so
each role's workspace can be reviewed without a Google client. That endpoint
returns 404 whenever the flag is not exactly `1`.

Seeded accounts:

| Role            | Email                  |
| --------------- | ---------------------- |
| Super admin     | `SUPER_ADMIN_EMAIL` (default `admin@afridetect.ng`) |
| Doctor          | `doctor@afridetect.ng` |
| Nurse           | `nurse@afridetect.ng`  |
| Records officer | `records@afridetect.ng`|
| Pharmacist      | `pharmacy@afridetect.ng` |
| Lab scientist   | `lab@afridetect.ng`    |
| Admin staff     | `admin@afridetect.ng`  |

Any Google account that is not in the staff list is refused with
"Your account has not been created. Contact your administrator."

## Security model

- Opaque session tokens stored as SHA-256 hashes; httpOnly, SameSite=Lax cookie.
- 15 minutes of inactivity ends the session on the server, and the browser shows
  a 60-second warning first.
- Roles: `super_admin`, `doctor`, `nurse`, `records_officer`, `pharmacist`,
  `lab_scientist`, `admin_staff`. Only the super admin can manage staff.
- Audit events are append-only; the API exposes no update or delete path.

## Clinical modules

- **Worklist** (`/worklist`) — checked-in patients with patient number, name,
  clinic, bill type, assigned doctor and check-in time. Pending / Attended To
  toggle, Hospital Visit / Telemed Visit tabs, and search by card number, name,
  NHIS number or phone. Records officers, nurses and doctors can register and
  check patients in; doctors see their own patients plus unassigned arrivals.
- **Patient register** (`/patients`) — every registered patient, searchable by
  patient number, name, NHIS number or phone.
- **Patient medical record** (`/patients/:id`) — header with age/sex, patient ID,
  visit type, clinic and a red allergies badge; filter tabs (View All, Vital
  Signs, Treatment Plan, Prescription, Investigations, Lab, Others); newest-first
  clinical timeline; right-hand menu to record vitals, clinical notes,
  diagnoses, prescriptions (with line items), lab requests and allergies.
- **Data types** — Patient, Visit, VitalSigns, ClinicalNote, Diagnosis,
  Prescription + PrescriptionItem, LabRequest, Allergy, Attachment, Clinic.

Registration is limited to super admin, doctor, nurse and records officer.
Clinical entries are written by doctors and nurses; diagnoses, prescriptions and
lab requests are doctor-only. Every registration, check-in, record opening and
clinical entry is appended to the audit log.

In preview mode the setup service seeds five clinics and six demo patients with
visits, vitals, a clinical note, a diagnosis, a prescription and lab requests so
the worklist and record can be reviewed without typing data.

## Status

Prompts 1–3 of the build plan are in place: shell, branding, sign-in and roles;
staff management and audit log; worklist, patient register and the patient
medical record. OCR patient capture, orders, reports and dashboard analytics are
next.
