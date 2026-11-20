"""Patient card scanning.

Runs the local Tesseract OCR engine (no third-party API key) over a photo or
PDF of a patient card, then maps the recognised text onto patient fields with a
per-field confidence of high / medium / low. Anything not visibly written is
left empty — the parser never guesses.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from datetime import date
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

FIELD_KEYS = [
    "first_name",
    "last_name",
    "other_name",
    "sex",
    "date_of_birth",
    "age",
    "phone",
    "email",
    "address",
    "next_of_kin",
    "next_of_kin_phone",
    "card_number",
    "nhis_no",
    "blood_group",
    "genotype",
    "allergies",
    "occupation",
    "marital_status",
]

MAX_BYTES = 10 * 1024 * 1024
ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


class ScanError(Exception):
    """Raised when a scan cannot be read; the message is safe to show."""

    def __init__(self, message: str, code: str = "unreadable"):
        super().__init__(message)
        self.message = message
        self.code = code


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _prepare_image(source: Path, workdir: Path) -> Path:
    """Flatten, upscale and sharpen the page so printed text reads reliably."""
    with Image.open(source) as raw:
        image = ImageOps.exif_transpose(raw)
        if image.mode not in ("L", "RGB"):
            image = image.convert("RGB")
        image = image.convert("L")
        width, height = image.size
        if width < 1400:
            scale = 1400 / max(width, 1)
            image = image.resize((int(width * scale), int(height * scale)), Image.LANCZOS)
        image = ImageOps.autocontrast(image)
        image = image.filter(ImageFilter.UnsharpMask(radius=2, percent=140, threshold=3))
        target = workdir / "page.png"
        image.save(target, format="PNG")
        return target


def _pdf_to_image(source: Path, workdir: Path) -> Path:
    binary = shutil.which("pdftoppm")
    if not binary:
        raise ScanError(
            "PDF scanning is not available on this server. Upload a photo of the card instead.",
            code="unsupported",
        )
    target = workdir / "page"
    result = subprocess.run(
        [binary, "-r", "300", "-png", "-f", "1", "-l", "1", str(source), str(target)],
        capture_output=True,
        text=True,
        timeout=60,
    )
    pages = sorted(workdir.glob("page*.png"))
    if result.returncode != 0 or not pages:
        raise ScanError(
            "We couldn't read this PDF. Try a clearer photo or enter details manually.",
            code="unreadable",
        )
    return pages[0]


def _run_tesseract(image: Path, workdir: Path, page_segmentation: int) -> tuple[str, list[tuple[str, float]]]:
    binary = shutil.which("tesseract")
    if not binary:
        raise ScanError(
            "Card scanning is not available on this server. Enter the details manually.",
            code="unsupported",
        )
    out_base = workdir / f"out{page_segmentation}"
    result = subprocess.run(
        [binary, str(image), str(out_base), "--psm", str(page_segmentation), "tsv"],
        capture_output=True,
        text=True,
        timeout=90,
    )
    if result.returncode != 0:
        return "", []

    tsv_path = Path(f"{out_base}.tsv")
    if not tsv_path.exists():
        return "", []

    words: list[tuple[str, float]] = []
    lines: dict[tuple[int, int, int, int], list[str]] = {}
    for index, line in enumerate(tsv_path.read_text(errors="ignore").splitlines()):
        if index == 0:
            continue
        parts = line.split("\t")
        if len(parts) < 12:
            continue
        token = parts[11].strip()
        if not token:
            continue
        try:
            confidence = float(parts[10])
        except ValueError:
            continue
        if confidence >= 0:
            words.append((token, confidence))
        try:
            key = (int(parts[1]), int(parts[2]), int(parts[3]), int(parts[4]))
        except ValueError:
            key = (0, 0, 0, 0)
        lines.setdefault(key, []).append(token)

    text = "\n".join(" ".join(tokens) for _, tokens in sorted(lines.items()))
    return text, words


def _read_text(data: bytes, filename: str) -> tuple[str, list[tuple[str, float]]]:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ScanError("Upload a JPG, PNG, WEBP or PDF file.", code="unsupported")
    if len(data) > MAX_BYTES:
        raise ScanError("That file is larger than 10 MB. Try a smaller photo.", code="too_large")

    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        source = workdir / f"upload{suffix}"
        source.write_bytes(data)
        try:
            page = _pdf_to_image(source, workdir) if suffix == ".pdf" else _prepare_image(source, workdir)
        except ScanError:
            raise
        except Exception:
            raise ScanError(
                "We couldn't open that file. Try a JPG, PNG, WEBP or PDF photo of the card.",
                code="unreadable",
            )

        text, words = _run_tesseract(page, workdir, 3)
        if len(_clean(text)) < 40:
            # One automatic retry with a layout-agnostic segmentation before
            # telling the user the card could not be read.
            retry_text, retry_words = _run_tesseract(page, workdir, 6)
            if len(_clean(retry_text)) > len(_clean(text)):
                text, words = retry_text, retry_words
        return text, words


# --------------------------------------------------------------------------- #
# Field parsing
# --------------------------------------------------------------------------- #

LABELS: dict[str, tuple[str, ...]] = {
    "first_name": ("first name", "firstname", "given name", "forename"),
    "last_name": ("last name", "lastname", "surname", "family name"),
    "other_name": ("other name", "other names", "middle name", "middlename"),
    "sex": ("sex", "gender"),
    "date_of_birth": ("date of birth", "dob", "birth date", "birthdate", "d.o.b"),
    "age": ("age",),
    "phone": ("phone", "phone number", "mobile", "telephone", "tel", "gsm"),
    "email": ("email", "e-mail", "email address"),
    "address": ("address", "residential address", "home address"),
    "next_of_kin": ("next of kin", "next-of-kin", "nok", "next kin"),
    "next_of_kin_phone": (
        "next of kin phone",
        "nok phone",
        "next of kin telephone",
        "kin phone",
    ),
    "card_number": ("card no", "card number", "folder no", "hospital no", "patient no", "file no", "id no"),
    "nhis_no": ("nhis no", "nhis number", "nhis"),
    "blood_group": ("blood group", "blood grp", "blood"),
    "genotype": ("genotype", "geno type"),
    "allergies": ("allergies", "allergy", "allergic to"),
    "occupation": ("occupation", "job", "profession"),
    "marital_status": ("marital status", "marital"),
}

_LABEL_LOOKUP: list[tuple[str, str]] = sorted(
    ((label, key) for key, labels in LABELS.items() for label in labels),
    key=lambda item: len(item[0]),
    reverse=True,
)

_DATE_PATTERNS = [
    (re.compile(r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b"), "ymd"),
    (re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b"), "dmy"),
    (
        re.compile(
            r"\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{2,4})\b",
            re.IGNORECASE,
        ),
        "dmy_text",
    ),
]

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

_PHONE_RE = re.compile(r"(?:\+?234|0)[\s-]?[789][\s-]?[01][\d\s-]{7,10}")
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_BLOOD_RE = re.compile(r"\b(AB|A|B|O)\s*(?:\+|positive\b|negative\b|-(?=\s|$))", re.IGNORECASE)
_GENOTYPE_RE = re.compile(r"\b(AA|AS|AC|SS|SC)\b")


def _words_for(value: str, word_scores: dict[str, float]) -> list[float]:
    scores = []
    for token in re.findall(r"[A-Za-z0-9+/@.-]+", value or ""):
        score = word_scores.get(token.lower())
        if score is not None:
            scores.append(score)
    return scores


def _confidence(value: str, word_scores: dict[str, float]) -> str:
    scores = _words_for(value, word_scores)
    if not scores:
        return "medium"
    mean = sum(scores) / len(scores)
    if mean >= 82:
        return "high"
    if mean >= 55:
        return "medium"
    return "low"


def _normalise_phone(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("234") and len(digits) == 13:
        return "0" + digits[3:]
    if digits.startswith("0") and len(digits) == 11:
        return digits
    return None


def _normalise_date(raw: str) -> str | None:
    text = _clean(raw)
    for pattern, kind in _DATE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        try:
            if kind == "ymd":
                year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
            elif kind == "dmy":
                day, month = int(match.group(1)), int(match.group(2))
                year = int(match.group(3))
                if year < 100:
                    year += 2000 if year < 30 else 1900
            else:
                day = int(match.group(1))
                month = _MONTHS[match.group(2)[:3].lower()]
                year = int(match.group(3))
                if year < 100:
                    year += 2000 if year < 30 else 1900
            parsed = date(year, month, day)
        except (ValueError, KeyError):
            continue
        if parsed > date.today() or parsed.year < 1900:
            continue
        return parsed.isoformat()
    return None


def _split_label(line: str) -> tuple[str | None, str]:
    """Return (field key, value) when the line starts with a known label."""
    lowered = line.lower()
    for label, key in _LABEL_LOOKUP:
        if not lowered.startswith(label):
            continue
        rest = line[len(label):]
        rest = re.sub(r"^[\s.:#=-]+", "", rest).strip()
        # Guard against "Name" matching inside "Names of ..." style words.
        if rest == line:
            continue
        return key, rest
    # "Label: value" anywhere in the line (e.g. "SEX: F  DOB: 12/03/1990").
    if ":" in line:
        head, _, tail = line.partition(":")
        for label, key in _LABEL_LOOKUP:
            if head.strip().lower() == label:
                return key, tail.strip()
    return None, ""


def _name_from_line(value: str) -> tuple[str, str, str] | None:
    cleaned = re.sub(r"[^A-Za-z' -]", " ", value or "")
    parts = [part for part in cleaned.split() if len(part) >= 2]
    if len(parts) < 2:
        return None
    if len(parts) == 2:
        return parts[0], parts[1], ""
    return parts[0], parts[1], " ".join(parts[2:])


def parse_fields(text: str, words: list[tuple[str, float]]) -> dict[str, dict]:
    word_scores: dict[str, float] = {}
    for token, confidence in words:
        key = re.sub(r"[^a-z0-9+/@.-]", "", token.lower())
        if not key:
            continue
        word_scores[key] = max(word_scores.get(key, 0.0), confidence)

    values: dict[str, str] = {}
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]

    for line in lines:
        key, value = _split_label(line)
        if not key or not value or key in values:
            continue
        values[key] = value

    # Full-name fallback: "Name: Adebayo Ogunlana" / "Patient Name: ...".
    for line in lines:
        match = re.match(r"^(?:patient\s*)?name\s*[:\-]?\s*(.+)$", line, re.IGNORECASE)
        if not match:
            continue
        parsed = _name_from_line(match.group(1))
        if parsed:
            first, last, other = parsed
            values.setdefault("first_name", first)
            values.setdefault("last_name", last)
            if other:
                values.setdefault("other_name", other)
        break
    if "first_name" not in values or "last_name" not in values:
        for line in lines[:6]:
            if re.search(r"\d", line) or ":" in line:
                continue
            parsed = _name_from_line(line)
            if parsed:
                first, last, other = parsed
                values.setdefault("first_name", first)
                values.setdefault("last_name", last)
                if other:
                    values.setdefault("other_name", other)
                break

    full_text = "\n".join(lines)

    # Sex
    sex_value = None
    sex_source = values.get("sex", "")
    if re.search(r"\bfemale\b", sex_source or full_text, re.IGNORECASE):
        sex_value = "female"
    elif re.search(r"\bmale\b", sex_source or full_text, re.IGNORECASE):
        sex_value = "male"
    elif re.fullmatch(r"[MF]", (sex_source or "").strip().upper()):
        sex_value = "female" if sex_source.strip().upper() == "F" else "male"
    if sex_value:
        values["sex"] = sex_value

    # Dates
    dob = _normalise_date(values.get("date_of_birth", "")) or _normalise_date(full_text)
    if dob:
        values["date_of_birth"] = dob
    else:
        values.pop("date_of_birth", None)

    # Age
    age_match = re.search(r"\b(\d{1,3})\s*(?:yrs?|years?)\b", values.get("age", "") or full_text, re.IGNORECASE)
    if age_match and 0 < int(age_match.group(1)) < 130:
        values["age"] = age_match.group(1)
    elif values.get("age") and not values["age"].strip().isdigit():
        values.pop("age", None)

    # Phones
    phone = _normalise_phone(values.get("phone", "")) or _normalise_phone(full_text)
    if phone:
        values["phone"] = phone
    else:
        values.pop("phone", None)

    kin_phone = _normalise_phone(values.get("next_of_kin_phone", ""))
    if not kin_phone:
        matches = [_normalise_phone(match.group(0)) for match in _PHONE_RE.finditer(full_text)]
        matches = [match for match in matches if match and match != phone]
        kin_phone = matches[0] if matches else None
    if kin_phone:
        values["next_of_kin_phone"] = kin_phone
    else:
        values.pop("next_of_kin_phone", None)

    # Email
    email = _EMAIL_RE.search(values.get("email", "") or full_text)
    if email:
        values["email"] = email.group(0)
    else:
        values.pop("email", None)

    # Blood group / genotype
    blood = _BLOOD_RE.search(values.get("blood_group", ""))
    if blood:
        sign = "+" if re.search(r"\+|positive", blood.group(0), re.IGNORECASE) else "-"
        values["blood_group"] = f"{blood.group(1).upper()}{sign}"
    else:
        values.pop("blood_group", None)

    genotype = _GENOTYPE_RE.search(values.get("genotype", "").upper())
    if genotype:
        values["genotype"] = genotype.group(1)
    else:
        values.pop("genotype", None)

    # Marital status
    marital = None
    source = values.get("marital_status", "") or full_text
    for option in ("single", "married", "divorced", "widowed", "widow"):
        if re.search(rf"\b{option}\b", source, re.IGNORECASE):
            marital = "widowed" if option == "widow" else option
            break
    if marital:
        values["marital_status"] = marital
    else:
        values.pop("marital_status", None)

    # Card number / NHIS: keep digits, letters, slashes and dashes only.
    for key in ("card_number", "nhis_no"):
        raw = values.get(key)
        if not raw:
            values.pop(key, None)
            continue
        cleaned = re.sub(r"[^A-Za-z0-9/-]", "", raw)
        if len(cleaned) < 3:
            values.pop(key, None)
        else:
            values[key] = cleaned

    # Trim whitespace and drop empties.
    for key in list(values):
        values[key] = _clean(values[key])
        if not values[key]:
            values.pop(key)

    fields: dict[str, dict] = {}
    for key in FIELD_KEYS:
        value = values.get(key)
        if value is None:
            fields[key] = {"value": None, "confidence": "low"}
        else:
            fields[key] = {"value": value, "confidence": _confidence(value, word_scores)}
    return fields


def scan_document(data: bytes, filename: str) -> dict:
    text, words = _read_text(data, filename)
    cleaned = _clean(text)
    if len(cleaned) < 12:
        raise ScanError(
            "We couldn't read this card. Try a clearer photo or enter details manually.",
            code="unreadable",
        )

    fields = parse_fields(text, words)
    # A field only counts when the engine was at least reasonably sure of it,
    # so a blurry photo full of noise is reported as unreadable rather than
    # filling the form with garbage.
    strong = [
        key
        for key, field in fields.items()
        if field["value"] and field["confidence"] in ("high", "medium")
    ]
    if len(strong) < 2:
        raise ScanError(
            "We couldn't read this card. Try a clearer photo or enter details manually.",
            code="unreadable",
        )

    warnings: list[str] = []
    if any(field["confidence"] == "low" for field in fields.values() if field["value"]):
        warnings.append(
            "Some fields were read with low confidence — check them against the card. "
            "Handwriting is read much less reliably than printed text."
        )
    return {
        "fields": fields,
        "raw_text": text.strip(),
        "engine": "tesseract-local",
        "warnings": warnings,
    }
