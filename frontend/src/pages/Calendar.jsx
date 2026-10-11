import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import api from "../api/client";
import Skeleton from "../components/Skeleton";
import { useAuth } from "../auth/AuthContext";
import { apiErrorMessage, useDialogs } from "../dialogs/DialogsContext";
import { canViewCalendar } from "../utils/roles";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toIso(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function mondayOf(d) {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

function addDays(d, n) {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + n);
  return next;
}

function eventTone(event) {
  if (event.type === "trial") return "trial";
  if (event.status === "expired") return "expired";
  if (event.status === "expiring_soon") return "soon";
  if (event.type === "trial_expiry") return "trial-expiry";
  return "ingredient";
}

function eventLabel(type) {
  if (type === "trial") return "Meal trial";
  if (type === "trial_expiry") return "Trial shelf life";
  if (type === "ingredient_expiry") return "Ingredient expiry";
  return type;
}

function eventLink(event) {
  if (event.entity_type === "trial") return `/trials/${event.entity_id}`;
  if (event.entity_type === "ingredient") return `/ingredients/${event.entity_id}`;
  return "#";
}

export default function Calendar() {
  const { user } = useAuth();
  const { showError } = useDialogs();
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [filters, setFilters] = useState({
    trial: true,
    trial_expiry: true,
    ingredient_expiry: true,
  });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(() => toIso(new Date()));

  const range = useMemo(() => {
    if (view === "week") {
      const start = mondayOf(cursor);
      const end = addDays(start, 6);
      return { from: toIso(start), to: toIso(end), start, end };
    }
    const start = startOfMonth(cursor);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    // Fetch full grid weeks so neighbouring-month days can show chips
    const gridStart = mondayOf(start);
    const gridEnd = addDays(mondayOf(end), 6);
    return { from: toIso(gridStart), to: toIso(gridEnd), start, end, gridStart, gridEnd };
  }, [view, cursor]);

  const typesParam = useMemo(
    () => Object.entries(filters).filter(([, on]) => on).map(([k]) => k).join(","),
    [filters]
  );

  useEffect(() => {
    if (!canViewCalendar(user)) return undefined;
    if (!typesParam) {
      setEvents([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get(`/calendar/?from=${range.from}&to=${range.to}&types=${typesParam}`)
      .then((r) => {
        if (!cancelled) setEvents(r.data.events || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setEvents([]);
          showError(apiErrorMessage(err, "Could not load calendar."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, range.from, range.to, typesParam, showError]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const event of events) {
      if (!map.has(event.date)) map.set(event.date, []);
      map.get(event.date).push(event);
    }
    return map;
  }, [events]);

  const monthCells = useMemo(() => {
    if (view !== "month") return [];
    const start = mondayOf(startOfMonth(cursor));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view, cursor]);

  const weekDays = useMemo(() => {
    if (view !== "week") return [];
    const start = mondayOf(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [view, cursor]);

  const selectedEvents = byDate.get(selectedDay) || [];
  const todayIso = toIso(new Date());

  if (!canViewCalendar(user)) {
    return <Navigate to="/" replace />;
  }

  const title =
    view === "week"
      ? (() => {
          const start = mondayOf(cursor);
          const end = addDays(start, 6);
          if (start.getMonth() === end.getMonth()) {
            return `${MONTHS[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
          }
          return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
        })()
      : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  const goPrev = () => {
    if (view === "week") setCursor((d) => addDays(mondayOf(d), -7));
    else setCursor((d) => addMonths(d, -1));
  };
  const goNext = () => {
    if (view === "week") setCursor((d) => addDays(mondayOf(d), 7));
    else setCursor((d) => addMonths(d, 1));
  };
  const goToday = () => {
    const now = new Date();
    setCursor(view === "week" ? mondayOf(now) : startOfMonth(now));
    setSelectedDay(toIso(now));
  };

  const toggleFilter = (key) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderDayEvents = (iso, limit = 3) => {
    const dayEvents = byDate.get(iso) || [];
    const shown = dayEvents.slice(0, limit);
    const extra = dayEvents.length - shown.length;
    return (
      <>
        {shown.map((event) => (
          <Link
            key={event.id}
            to={eventLink(event)}
            className={`cal-chip cal-chip-${eventTone(event)}`}
            title={`${eventLabel(event.type)}: ${event.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            {event.title}
          </Link>
        ))}
        {extra > 0 && <div className="cal-more">+{extra} more</div>}
      </>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p>Meal trial days and expiry dates for the lab</p>
        </div>
        <div className="page-header-actions">
          <div className="tabs" style={{ margin: 0 }}>
            <button type="button" className={`tab ${view === "month" ? "active" : ""}`} onClick={() => { setView("month"); setCursor(startOfMonth(cursor)); }}>
              Month
            </button>
            <button type="button" className={`tab ${view === "week" ? "active" : ""}`} onClick={() => { setView("week"); setCursor(mondayOf(cursor)); }}>
              Week
            </button>
          </div>
        </div>
      </div>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <button type="button" className="btn btn-ghost" onClick={goPrev}>←</button>
          <button type="button" className="btn btn-ghost" onClick={goToday}>Today</button>
          <button type="button" className="btn btn-ghost" onClick={goNext}>→</button>
          <h2 className="cal-title">{title}</h2>
        </div>
        <div className="cal-filters">
          <label className="cal-filter">
            <input type="checkbox" checked={filters.trial} onChange={() => toggleFilter("trial")} />
            <span className="cal-legend cal-chip-trial">Meal trials</span>
          </label>
          <label className="cal-filter">
            <input type="checkbox" checked={filters.trial_expiry} onChange={() => toggleFilter("trial_expiry")} />
            <span className="cal-legend cal-chip-trial-expiry">Trial shelf life</span>
          </label>
          <label className="cal-filter">
            <input type="checkbox" checked={filters.ingredient_expiry} onChange={() => toggleFilter("ingredient_expiry")} />
            <span className="cal-legend cal-chip-ingredient">Ingredient expiry</span>
          </label>
        </div>
      </div>

      {loading ? (
        <Skeleton height={420} />
      ) : view === "month" ? (
        <div className="cal-month card">
          <div className="cal-weekdays">
            {WEEKDAYS.map((d) => (
              <div key={d} className="cal-weekday">{d}</div>
            ))}
          </div>
          <div className="cal-grid">
            {monthCells.map((day) => {
              const iso = toIso(day);
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = iso === todayIso;
              const isSelected = iso === selectedDay;
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    "cal-cell",
                    inMonth ? "" : "cal-cell-muted",
                    isToday ? "cal-cell-today" : "",
                    isSelected ? "cal-cell-selected" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => setSelectedDay(iso)}
                >
                  <div className="cal-daynum">{day.getDate()}</div>
                  <div className="cal-cell-events">{renderDayEvents(iso, 3)}</div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="cal-week card">
          <div className="cal-week-grid">
            {weekDays.map((day) => {
              const iso = toIso(day);
              const isToday = iso === todayIso;
              const isSelected = iso === selectedDay;
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    "cal-week-col",
                    isToday ? "cal-cell-today" : "",
                    isSelected ? "cal-cell-selected" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => setSelectedDay(iso)}
                >
                  <div className="cal-week-head">
                    <span>{WEEKDAYS[(day.getDay() + 6) % 7]}</span>
                    <strong>{day.getDate()}</strong>
                  </div>
                  <div className="cal-cell-events">{renderDayEvents(iso, 12)}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="card cal-day-panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>
          {selectedDay === todayIso ? "Today" : selectedDay}
        </h3>
        {selectedEvents.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>No events on this day.</p>
        ) : (
          <ul className="cal-day-list">
            {selectedEvents.map((event) => (
              <li key={event.id}>
                <Link to={eventLink(event)} className={`cal-day-item cal-chip-${eventTone(event)}`}>
                  <span className="cal-day-type">{eventLabel(event.type)}</span>
                  <span className="cal-day-title">{event.title}</span>
                  {event.status === "expired" && <span className="cal-tag">Expired</span>}
                  {event.status === "expiring_soon" && <span className="cal-tag cal-tag-soon">Expiring soon</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
