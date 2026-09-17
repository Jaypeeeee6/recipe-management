export default function Skeleton({ count = 4, height = 44, className = "" }) {
  return (
    <div className={`skeleton-stack ${className}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}
