export function formatExpiryUnit(amount, unit) {
  const n = Number(amount);
  if (Number.isNaN(n)) return "";
  if (unit === "hours") return `${n} hour${n === 1 ? "" : "s"}`;
  return `${n} day${n === 1 ? "" : "s"}`;
}

export function formatMoney(value) {
  const n = Number(value || 0);
  return `OMR ${n.toFixed(3)}`;
}

export function moneyAmount(value) {
  return Number(value || 0).toFixed(3);
}

/** Keep user-typed OMR decimals intact while editing (e.g. 1, 1.2, 1.200). */
export function sanitizeOmrDecimalInput(raw) {
  if (raw == null) return "";
  let value = String(raw).replace(/,/g, ".").replace(/[^0-9.]/g, "");
  if (value === "") return "";
  const dot = value.indexOf(".");
  if (dot !== -1) {
    const whole = value.slice(0, dot);
    const fraction = value.slice(dot + 1).replace(/\./g, "").slice(0, 3);
    value = `${whole || "0"}.${fraction}`;
  }
  return value;
}

/** Preserve API decimal strings for form fields without rounding 1.200 down to 1.2. */
export function omrFieldValue(value) {
  if (value == null || value === "") return "";
  return String(value);
}

export function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const part = String(value).slice(0, 10);
  const [year, month, day] = part.split("-");
  if (!year || !month || !day) return part;
  return `${day}/${month}/${year}`;
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function verdictLabel(v) {
  return {
    pending: "Pending",
    suitable: "Approved",
    not_suitable: "Rejected",
    emergency_substitute: "Emergency Substitute",
  }[v] || v;
}

export function statusBadgeClass(status) {
  const map = {
    valid: "badge-valid",
    expiring_soon: "badge-soon",
    expired: "badge-expired",
    suitable: "badge-approved",
    not_suitable: "badge-rejected",
    pending: "badge-draft",
    emergency_substitute: "badge-emergency",
    testing: "badge-testing",
    approved: "badge-approved",
    rejected: "badge-rejected",
    backup_only: "badge-emergency",
  };
  return `badge ${map[status] || "badge-draft"}`;
}

export function expiryLabel(status) {
  return { valid: "Valid", expiring_soon: "Expiring Soon", expired: "Expired" }[status] || status;
}

export function statusLabel(status) {
  return {
    testing: "Under Testing",
    approved: "Approved",
    rejected: "Rejected",
    backup_only: "Backup Only",
    pending: "Pending",
  }[status] || String(status || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function foodCostTone(pct) {
  if (pct == null) return "";
  if (pct < 25) return "food-excellent";
  if (pct < 30) return "food-good";
  if (pct < 35) return "food-warn";
  return "food-danger";
}

/** Status for ingredient cost as % of selling price vs typical kitchen target (~30%). */
export function foodCostLabel(pct) {
  if (pct == null) return "";
  if (pct < 25) return "Excellent";
  if (pct < 30) return "Good";
  if (pct < 35) return "A bit high";
  return "Too high vs 30% target";
}
