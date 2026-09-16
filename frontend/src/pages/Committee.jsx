import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import Stars from "../components/Stars";

const emptyRatings = { taste: 0, texture: 0, cost: 0, consistency: 0, overall: 0 };
const LABELS = { taste: "Taste", texture: "Texture", cost: "Value", consistency: "Consistency", overall: "Overall" };

export default function Committee() {
  const { trialId } = useParams();
  const storageKey = `committee_submitted_${trialId}`;
  const [trial, setTrial] = useState(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(localStorage.getItem(storageKey) ? "done" : "welcome");
  const [name, setName] = useState("");
  const [ratings, setRatings] = useState(emptyRatings);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    axios
      .get(`/api/public/trials/${trialId}/`)
      .then((r) => setTrial(r.data))
      .catch(() => {
        setError("Trial not found. Please check the link or QR code.");
        setStep("error");
      });
  }, [trialId]);

  const remaining = Object.values(ratings).filter((v) => v === 0).length;

  const submit = async () => {
    if (remaining > 0) return;
    setSubmitting(true);
    try {
      await axios.post(`/api/public/trials/${trialId}/committee-ratings/`, {
        member_name: name.trim(),
        ...ratings,
        notes,
      });
      localStorage.setItem(storageKey, "1");
      setStep("done");
    } catch {
      setError("Could not submit rating. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="committee-page">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, maxWidth: 420, width: "100%" }}>
        <img src="/maa-logo.png" alt="" style={{ height: 40 }} />
        <div>
          <strong>Ingredient & Meal Trial Lab</strong>
          <div className="hint">Central Kitchen — R&D Lab</div>
        </div>
      </div>

      {step === "error" && (
        <div className="committee-card" style={{ padding: 32, textAlign: "center" }}>
          <h2>Invalid Link</h2>
          <p>{error}</p>
        </div>
      )}

      {step === "welcome" && trial && (
        <div className="committee-card">
          {trial.final_dish_photo ? (
            <img src={trial.final_dish_photo} alt="" style={{ width: "100%", height: 200, objectFit: "cover" }} />
          ) : (
            <div className="committee-hero">
              <h2 style={{ margin: 0 }}>{trial.title}</h2>
              <p style={{ opacity: 0.7, margin: "6px 0 0" }}>{trial.conducted_by} · {trial.trial_date}</p>
            </div>
          )}
          <div style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>{trial.title}</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {trial.cooking_temperature && <span className="badge badge-emergency">{trial.cooking_temperature}°C</span>}
              {trial.cooking_duration && <span className="badge badge-completed">{trial.cooking_duration} min</span>}
              {trial.repetition_number && <span className="badge badge-gold">Trial #{trial.repetition_number}</span>}
              {trial.expiry_status === "expired" && <span className="badge badge-expired">Expired</span>}
              {trial.expiry_status === "expiring_soon" && <span className="badge badge-soon">Expiring soon</span>}
              {trial.expiry_remaining_label && <span className="badge badge-gold">{trial.expiry_remaining_label}</span>}
            </div>
            <div style={{ background: "var(--accent)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <strong>Welcome to the Tasting Committee</strong>
              <p className="hint" style={{ margin: "6px 0 0", color: "#7c5c1e" }}>
                Your feedback helps us develop our products and ensure quality.
              </p>
            </div>
            <label className="field">
              <span style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Your Full Name</span>
              <input className="input" placeholder="e.g. John Smith" value={name} onChange={(e) => { setName(e.target.value); setNameError(""); }} />
              {nameError && <div className="hint" style={{ color: "#ef4444" }}>{nameError}</div>}
            </label>
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 16, height: 44 }}
              onClick={() => {
                if (!name.trim()) setNameError("Please enter your full name.");
                else setStep("rating");
              }}
            >
              Start Evaluation →
            </button>
          </div>
        </div>
      )}

      {step === "rating" && trial && (
        <div className="committee-card" style={{ padding: 24 }}>
          <p className="hint">Hello, {name}</p>
          <h2 style={{ marginTop: 0 }}>Rate this dish</h2>
          {Object.keys(LABELS).map((k) => (
            <div className="list-row" key={k}>
              <strong>{LABELS[k]}</strong>
              <Stars value={ratings[k]} onChange={(v) => setRatings({ ...ratings, [k]: v })} />
            </div>
          ))}
          <p className="hint">{remaining} categories left to rate</p>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Additional Notes (optional)</label>
            <textarea className="textarea" placeholder="Any comments or suggestions for improvement…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 16, height: 44 }} disabled={remaining > 0 || submitting} onClick={submit}>
            {submitting ? "Submitting…" : "Submit Rating"}
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="committee-card" style={{ padding: 36, textAlign: "center" }}>
          <h2>Thank You!</h2>
          <p>Your rating has been recorded successfully. We appreciate your valuable contribution.</p>
          <p>🌟 Your opinion makes a difference</p>
          <p className="hint">Ingredient Lab — MAA Group</p>
        </div>
      )}
    </div>
  );
}
