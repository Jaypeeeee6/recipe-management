export default function SecretBadge({ className = "" }) {
  return (
    <span className={`badge badge-secret ${className}`.trim()}>
      <svg
        className="badge-secret-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      Secret
    </span>
  );
}
