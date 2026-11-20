# Afridetect EMR

Electronic Medical Records for hospitals and clinics in Nigeria.

A closed clinical workspace: email + password sign-in, staff accounts created by
a super admin, role-based access, and an append-only audit trail.

## Stack

| Piece    | Technology                                    |
| -------- | --------------------------------------------- |
| Frontend | React 18 + Vite + Tailwind CSS                |
| Backend  | FastAPI + SQLAlchemy 2                        |
| Database | PostgreSQL 16                                 |
| Auth     | Email + password (PBKDF2-SHA256) → httpOnly session cookie |

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

Staff sign in with the email and password on their staff account. There is no
public sign-up: a super admin creates the account with a first password, and the
staff member can change it from Settings.

Passwords are stored as salted PBKDF2-SHA256 hashes (`backend/app/security.py`).
Resetting someone's password ends their other sessions.

The first super admin is seeded by the `setup` service from `SUPER_ADMIN_EMAIL`
and `SUPER_ADMIN_PASSWORD`. When no password is configured, a random one is
generated and printed once by setup:

```bash
docker compose -f docker-compose.base44.yml logs setup
```

When `BASE44_PREVIEW_MODE=1` (sandbox previews only) the login screen also
offers a **preview sign-in** picker with seeded staff accounts, one per role, so
each role's workspace can be reviewed without typing a password. Those seeded
accounts share the first password `Afridetect2026!` (printed by setup), so the
normal form can be exercised too. The picker endpoints return 404 whenever the
flag is not exactly `1`.

Seeded accounts:

| Role            | Email                  |
| --------------- | ---------------------- |
| Super admin     | `SUPER_ADMIN_EMAIL` (default `admin@afridetect.ng`) |
| Doctor          | `doctor@afridetect.ng` |
| Nurse           | `nurse@afridetect.ng`  |
| Records officer | `records@afridetect.ng`|
| Pharmacist      | `pharmacy@afridetect.ng` |
| Lab scientist   | `lab@afridetect.ng`    |
| Admin staff     | `frontdesk@afridetect.ng` |

An email that is not on the staff list cannot sign in; the form always answers
"Email or password is incorrect."

## Security model

- Passwords are salted PBKDF2-SHA256 hashes; only a super admin can reset
  someone else's password, and every staff member can change their own.
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
- **Consultations** (`/consultations`) — today's consultation room: the queue
  (Hospital / Telemed, Waiting / Completed today) on the left and the selected
  patient on the right with their complaint, latest vitals, allergies and recent
  notes. Vitals, clinical notes, diagnoses, prescriptions and lab requests open
  from the same panel (role-gated), and "Mark attended" completes the visit.
  Super admin, doctor and nurse.
- **Records** (`/records`) — the records desk: every patient file with clinic,
  sex/age, registration date and latest visit status, searchable by card number,
  name, NHIS number or phone, filterable by clinic and sortable by recent
  activity, newest file or name. Opening a row goes to the full medical record.
  Super admin, doctor, nurse, records officer and admin staff.
- **Patient medical record** (`/patients/:id`) — header with age/sex, patient ID,
  visit type, clinic and a red allergies badge; filter tabs (View All, Vital
  Signs, Treatment Plan, Prescription, Investigations, Lab, Others); newest-first
  clinical timeline; right-hand menu to record vitals, clinical notes,
  diagnoses, prescriptions (with line items), lab requests, allergies and
  attachments. Notes can be edited (each edit is stored as a new version, older
  versions are kept) and deleted (hidden from the record, kept for audit).
  Attachments (JPG, PNG, WEBP or PDF up to 10 MB) upload to the record and
  download from the timeline.
- **Orders** (`/orders`) — the laboratory and pharmacy queues. Lab requests show
  the patient, test, requesting doctor and status; a lab scientist (or super
  admin) enters and releases the result, which completes the request. Open
  prescriptions list their medicines; a pharmacist (or super admin) marks them
  dispensed. Doctors and nurses can follow both queues.
- **Messages** (`/messages`) — secure staff-to-staff messaging with inbox and
  sent folders, threads, unread counts in the top bar and read receipts on your
  own messages. A message can be linked to a patient.
- **Reports** (`/reports`) — patients seen per day, patients per clinic and top
  diagnoses for the last 7, 30 or 90 days, each with a CSV download that works
  even when there is no data (headings only). Super admin, doctor and admin
  staff only.
- **Data types** — Patient, Visit, VitalSigns, ClinicalNote, Diagnosis,
  Prescription + PrescriptionItem, LabRequest + LabResult, Allergy, Attachment,
  Clinic, Message, Staff, AuditEvent.

Registration is limited to super admin, doctor, nurse and records officer.
Clinical entries are written by doctors and nurses; diagnoses, prescriptions and
lab requests are doctor-only. Every registration, check-in, record opening and
clinical entry is appended to the audit log.

## Patient card scanning

"Scan card" appears on the New Patient form, the patient record and the worklist
check-in flow. Doctors, records officers and the super admin can use it.

1. Photograph the card (phone or laptop camera) or upload a JPG, PNG, WEBP or PDF
   up to 10 MB. The photo can be rotated before scanning.
2. The API reads the image with a **local Tesseract OCR engine** — no external AI
   provider and no API key. PDFs are rasterised first.
3. Extracted fields come back with a high / medium / low confidence. Low
   confidence fields are amber, empty fields are grey, and every field is
   editable before anything is saved.
4. A duplicate check matches the same name plus date of birth, phone number or
   card number and offers to open the existing patient instead.
5. Nothing is saved until the user confirms; confirming fills the registration
   form (or updates the open record).

Printed cards read well. Handwriting is read much less reliably — expect correct
names, dates and phone numbers on printed cards and expect to correct several
fields on a handwritten form. A photo the engine cannot read returns "We
couldn't read this card. Try a clearer photo or enter details manually." rather
than filling the form with guesses. Scans are limited to 20 per user per hour and
each one is written to the audit log.

In preview mode the setup service seeds five clinics and **15 fictional demo
patients** with visits, vitals, notes, diagnoses, prescriptions and lab requests,
so every page has something to show. Every demo patient carries
`is_demo = true` and is labelled "Demo" in the worklist and patient register.
Nothing about a demo record is real patient data. Remove all of it with:

```bash
docker compose -f docker-compose.base44.yml run --rm setup python -m app.setup --remove-demo
```

Demo data is seeded only when `BASE44_PREVIEW_MODE=1`; a production database is
never populated by the setup service.

## Status

Every page in the sidebar is built and working: home dashboard, worklist,
patient register and medical record, consultations room, orders (lab and
pharmacy), records desk, secure messages, reports with CSV export, staff
management and the audit log. Patient-card scanning is available from the
registration form, the worklist and the patient record. No placeholder pages
remain.
