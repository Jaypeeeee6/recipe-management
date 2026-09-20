export default function Stars({ value = 0, onChange, size = 18 }) {
  const n = Number(value) || 0;
  const filled = Math.round(n);
  const empty = Math.max(0, 5 - filled);
  if (!onChange) {
    return (
      <span className="stars" title={`${n} stars`} style={{ fontSize: size }}>
        <span className="stars-filled">{"★".repeat(filled)}</span>
        <span className="stars-empty">{"☆".repeat(empty)}</span>
      </span>
    );
  }
  return (
    <span>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          className={`star-btn ${i <= n ? "on" : ""}`}
          onClick={() => onChange(i)}
          aria-label={`${i} stars`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
