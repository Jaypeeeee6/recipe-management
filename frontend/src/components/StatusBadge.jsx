import { statusBadgeClass, expiryLabel, verdictLabel } from "../utils/format";

export default function StatusBadge({ value, kind = "status" }) {
  const label =
    kind === "expiry"
      ? expiryLabel(value)
      : kind === "verdict"
        ? verdictLabel(value)
        : String(value || "").replaceAll("_", " ");
  return <span className={statusBadgeClass(value)}>{label}</span>;
}
