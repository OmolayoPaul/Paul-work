"""Read a patient card with Gemini and return structured, confidence-tagged fields.

The image is sent to Gemini from the API only: the browser uploads it to this
backend, the backend calls Gemini with GEMINI_API_KEY, and the image is never
written to disk or to the database.
"""

from __future__ import annotations

import base64
import json
import logging
import time

import requests

from .config import settings

logger = logging.getLogger("afridetect.ocr")

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Order matters: the review form shows the fields in this order.
SCAN_FIELDS: list[tuple[str, str]] = [
    ("first_name", "First name"),
    ("last_name", "Last name"),
    ("other_names", "Other names"),
    ("sex", "Sex"),
    ("date_of_birth", "Date of birth"),
    ("age", "Age"),
    ("phone", "Phone"),
    ("email", "Email"),
    ("address", "Address"),
    ("next_of_kin_name", "Next of kin"),
    ("next_of_kin_phone", "Next of kin phone"),
    ("card_number", "Card number"),
    ("nhis_number", "NHIS number"),
    ("blood_group", "Blood group"),
    ("genotype", "Genotype"),
    ("allergies", "Allergies"),
    ("occupation", "Occupation"),
    ("marital_status", "Marital status"),
]

FIELD_KEYS = [key for key, _ in SCAN_FIELDS]

SUPPORTED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
}

MAX_UPLOAD_BYTES = 8 * 1024 * 1024

PROMPT = """You are reading a patient's card for a hospital records officer in Nigeria.
The document may be a hospital patient card, a folder page, an ID card, a
referral letter or a handwritten registration form.

Extract only what is clearly printed or written on the document. Never guess,
never complete a partial value, and never invent a plausible Nigerian name,
phone number or date. If a field is missing, unreadable or ambiguous, return
null for its value and confidence "low".

Rules:
- first_name / last_name / other_names: split the patient's name as printed.
  Use other_names for middle or additional names. Do not swap first and last.
- sex: exactly "male" or "female", otherwise null.
- date_of_birth: ISO format YYYY-MM-DD. Convert a written date only when the
  day, month and year are all legible.
- age: whole years as digits, only when written on the document.
- phone: keep the digits as written, including spacing.
- email: lower-case as printed.
- address: the full address on one line.
- next_of_kin_name / next_of_kin_phone: the emergency contact, not the patient.
- card_number: the hospital card or folder number.
- nhis_number: the NHIS / health insurance number.
- blood_group: one of A+, A-, B+, B-, AB+, AB-, O+, O-.
- genotype: one of AA, AS, SS, AC, SC.
- allergies: a comma-separated list as written, otherwise null.
- occupation and marital_status: as written on the document.
- confidence: "high" when the value is printed and unmistakable, "medium" when
  it is legible but could be misread (handwriting, poor print, a cropped edge),
  "low" when it is faint, partial, inferred from layout or missing.

Return JSON only, in this shape:
{"fields": {"<field>": {"value": <string or null>, "confidence": "high|medium|low"}}}
Include every field listed below, even when its value is null.
Fields: %s
""" % ", ".join(FIELD_KEYS)


class ScanError(Exception):
    """Raised when the card could not be read. The message is shown to staff."""

    def __init__(self, message: str, *, status: int = 502, code: str = "scan_failed"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def _response_schema() -> dict:
    field_schema = {
        "type": "OBJECT",
        "properties": {
            "value": {"type": "STRING"},
            "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]},
        },
        "required": ["value", "confidence"],
    }
    return {
        "type": "OBJECT",
        "properties": {
            "fields": {
                "type": "OBJECT",
                "properties": {key: field_schema for key in FIELD_KEYS},
                "required": FIELD_KEYS,
            }
        },
        "required": ["fields"],
    }


def _clean(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"null", "none", "unknown", "n/a", "-"}:
        return None
    return text


def _normalise(raw: dict) -> dict:
    """Keep only known fields, coerce values to text and validate confidence."""
    fields = raw.get("fields") if isinstance(raw, dict) else None
    if not isinstance(fields, dict):
        raise ScanError(
            "The scan did not return readable details. Try a clearer photo, or type the details manually."
        )

    cleaned: dict[str, dict] = {}
    for key in FIELD_KEYS:
        entry = fields.get(key)
        if isinstance(entry, dict):
            value = _clean(entry.get("value"))
            confidence = str(entry.get("confidence") or "").strip().lower()
        else:
            value = _clean(entry)
            confidence = ""
        if confidence not in ("high", "medium", "low"):
            confidence = "high" if value else "low"
        cleaned[key] = {"value": value, "confidence": confidence}
    return cleaned


def scan_patient_card(*, data: bytes, mime_type: str, file_name: str) -> dict:
    """Send the document to Gemini and return the normalised field map."""
    if not settings.gemini_api_key:
        raise ScanError(
            "AI card scanning is not set up yet. Type the patient's details manually, or ask your administrator to add the GEMINI_API_KEY secret.",
            status=503,
            code="scan_unavailable",
        )

    if mime_type not in SUPPORTED_MIME_TYPES:
        raise ScanError(
            "That file type cannot be scanned. Use a photo (JPG, PNG, WEBP) or a PDF.",
            status=415,
            code="unsupported_file",
        )

    if not data:
        raise ScanError("That file is empty. Choose another image or PDF.", status=400, code="empty_file")

    if len(data) > MAX_UPLOAD_BYTES:
        raise ScanError("That file is too large. Use an image or PDF under 8 MB.", status=413, code="file_too_large")

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": PROMPT},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64.b64encode(data).decode("ascii"),
                        }
                    },
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "response_mime_type": "application/json",
            "response_schema": _response_schema(),
        },
    }

    started = time.monotonic()
    url = GEMINI_ENDPOINT.format(model=settings.gemini_model)
    headers = {
        "x-goog-api-key": settings.gemini_api_key,
        "Content-Type": "application/json",
    }

    # Gemini occasionally returns 503 under heavy load; retry once after a
    # brief pause before surfacing the error to the user.
    for attempt in range(2):
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)
        except requests.RequestException:
            logger.exception("Gemini request failed for %s", file_name)
            raise ScanError(
                "The scan service could not be reached. Check the connection and try again, or type the details manually."
            ) from None

        if response.status_code != 503 or attempt == 1:
            break
        time.sleep(2)

    if response.status_code == 503:
        logger.warning("Gemini returned 503 for %s after retry", file_name)
        raise ScanError(
            "The scan service is busy right now. Wait a moment and try again, or type the details manually.",
            status=503,
            code="scan_busy",
        )

    if response.status_code >= 400:
        logger.warning("Gemini returned %s for %s: %s", response.status_code, file_name, response.text[:400])
        raise ScanError(
            "The card could not be read. Check the photo is clear and try again, or type the details manually."
        )

    try:
        body = response.json()
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
    except (ValueError, KeyError, IndexError, TypeError):
        logger.warning("Gemini returned an unreadable payload for %s", file_name)
        raise ScanError(
            "The scan did not return readable details. Try a clearer photo, or type the details manually."
        ) from None

    fields = _normalise(parsed)
    return {
        "fields": fields,
        "model": settings.gemini_model,
        "elapsed_ms": int((time.monotonic() - started) * 1000),
        "fields_read": sum(1 for entry in fields.values() if entry["value"]),
        "fields_total": len(FIELD_KEYS),
    }
