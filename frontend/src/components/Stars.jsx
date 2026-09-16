export default function Stars({ value = 0, onChange, size = 18 }) {
  const n = Number(value) || 0;
  if (!onChange) {
    return (
      <span className="stars" title={`${n} stars`} style={{ fontSize: size }}>
        {"★".repeat(Math.round(n))}
        {"☆".repeat(Math.max(0, 5 - Math.round(n)))}
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
