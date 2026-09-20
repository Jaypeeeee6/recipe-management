import { statusBadgeClass, expiryLabel, statusLabel, verdictLabel } from "../utils/format";

export default function StatusBadge({ value, kind = "status" }) {
  const label =
    kind === "expiry"
      ? expiryLabel(value)
      : kind === "verdict"
        ? verdictLabel(value)
        : statusLabel(value);
  return <span className={statusBadgeClass(value)}>{label}</span>;
}
