import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

export default function Icon({ name }) {
  const icons = {
    plus: <path d="M5 12h14M12 5v14" />,
    compare: (
      <>
        <rect x="2" y="4" width="9" height="16" rx="2" />
        <rect x="13" y="4" width="9" height="16" rx="2" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    reject: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m4.9 4.9 14.2 14.2" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m7 10 5 5 5-5" />
        <path d="M12 15V3" />
      </>
    ),
    printer: (
      <>
        <path d="M6 9V2h12v7" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v8H6z" />
      </>
    ),
    refresh: (
      <>
        <path d="M21 12a9 9 0 1 1-2.6-6.3" />
        <path d="M21 3v6h-6" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 16v-6" />
        <path d="M12 16V8" />
        <path d="M17 16v-9" />
      </>
    ),
    clipboard: (
      <>
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      </>
    ),
    layout: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    back: <path d="M19 12H5M12 19l-7-7 7-7" />,
    save: (
      <>
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <path d="M17 21v-8H7v8" />
        <path d="M7 3v5h8" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}

function ActionTooltip({ title, anchor }) {
  if (!title || !anchor) return null;
  const rect = anchor.getBoundingClientRect();
  return createPortal(
    <span
      className="btn-floating-tip"
      role="tooltip"
      style={{ top: rect.bottom + 8, left: rect.left + rect.width / 2 }}
    >
      {title}
    </span>,
    document.body
  );
}

export function IconAction({ name, title, to, onClick, tone }) {
  const ref = useRef(null);
  const [tip, setTip] = useState(false);
  const className = `btn-icon${tone ? ` btn-icon-${tone}` : ""}`;
  const content = <Icon name={name} />;
  const tipEvents = {
    ref,
    onMouseEnter: () => setTip(true),
    onMouseLeave: () => setTip(false),
    onFocus: () => setTip(true),
    onBlur: () => setTip(false),
  };
  const tooltip = tip ? <ActionTooltip title={title} anchor={ref.current} /> : null;
  if (to) {
    return (
      <>
        <Link className={className} to={to} aria-label={title} {...tipEvents}>
          {content}
        </Link>
        {tooltip}
      </>
    );
  }
  return (
    <>
      <button type="button" className={className} onClick={onClick} aria-label={title} {...tipEvents}>
        {content}
      </button>
      {tooltip}
    </>
  );
}
