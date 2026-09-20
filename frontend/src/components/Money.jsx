import { moneyAmount } from "../utils/format";

/** Currency display. Use `exponent` in stat cards for a small leading OMR. */
export default function Money({ value, exponent = false }) {
  const amount = moneyAmount(value);
  if (!exponent) return <>OMR {amount}</>;
  return (
    <span className="money-exponent">
      <span className="money-currency">OMR</span>
      <span className="money-amount">{amount}</span>
    </span>
  );
}
