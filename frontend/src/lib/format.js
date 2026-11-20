export function initials(name = "") {
  return name
    .replace(/\b(dr|mr|mrs|ms|miss|prof|nurse|pharm)\.?\s/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const GENERIC_FIRST_WORDS = new Set(["system", "hospital", "admin", "administrator"]);

export function firstName(fullName = "") {
  const cleaned = fullName
    .replace(/\b(dr|mr|mrs|ms|miss|prof)\.?\s/gi, "")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  // "System Administrator" is a role-style name, not a person called System.
  if (parts.length > 1 && GENERIC_FIRST_WORDS.has(parts[0].toLowerCase())) return cleaned;
  return parts[0] || fullName;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function formatDate(value, options) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(
    "en-NG",
    options || { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  ).format(date);
}

export function formatDateTime(value) {
  return formatDate(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateTime(value);
}
