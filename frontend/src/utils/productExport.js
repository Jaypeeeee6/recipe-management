import api from "../api/client";
import { formatExpiryUnit } from "./format";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadRecipeTrial(trialTitles) {
  if (!trialTitles?.length) return null;
  const trials = await Promise.all(
    trialTitles.map((t) =>
      api.get(`/trials/${t.id}/`).then((r) => r.data).catch(() => null)
    )
  );
  const valid = trials.filter(Boolean);
  if (!valid.length) return null;
  return valid.sort((a, b) => (b.recipe_lines?.length || 0) - (a.recipe_lines?.length || 0))[0];
}

export async function exportProductPdf(product) {
  const trial = await loadRecipeTrial(product.trial_titles);
  const ingredientNames = trial?.recipe_lines?.length
    ? [...new Set(trial.recipe_lines.map((l) => l.name).filter(Boolean))]
    : [...new Set((product.ingredient_titles || []).map((i) => i.name).filter(Boolean))];
  const prepSteps = trial?.prep_steps || [];
  const productName = product.product_name || "Product";
  const trialRef = trial ? `${trial.code} · ${trial.title}` : null;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(productName)}</title>
    <style>
      body{font-family:Segoe UI,sans-serif;padding:32px;color:#111;max-width:720px;margin:0 auto}
      h1{margin:0 0 8px;font-size:28px}
      h2{margin:28px 0 12px;font-size:16px;text-transform:uppercase;letter-spacing:.04em;color:#444}
      p{margin:4px 0 0;line-height:1.5}
      ul,ol{margin:0;padding-left:20px;line-height:1.6}
      li{margin-bottom:6px}
      .meta{color:#555;font-size:14px}
      .notes{white-space:pre-wrap}
      @media print{body{padding:16px}}
    </style></head><body>
    <h1>${escapeHtml(productName)}</h1>
    ${trialRef ? `<p class="meta">${escapeHtml(trialRef)}</p>` : ""}
    ${trial?.cooking_temperature ? `<p class="meta">Temperature: ${escapeHtml(trial.cooking_temperature)}°C</p>` : ""}
    ${trial?.cooking_duration ? `<p class="meta">Duration: ${escapeHtml(trial.cooking_duration)} min</p>` : ""}
    ${trial?.expiry_amount ? `<p class="meta">Shelf life: ${escapeHtml(formatExpiryUnit(trial.expiry_amount, trial.expiry_unit))}</p>` : ""}
    <h2>Ingredients</h2>
    ${ingredientNames.length
      ? `<ul>${ingredientNames.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>`
      : "<p class=\"meta\">No ingredients listed.</p>"}
    <h2>Preparation Steps</h2>
    ${prepSteps.length
      ? `<ol>${prepSteps.map((s) => `<li>${escapeHtml(s.text)}</li>`).join("")}</ol>`
      : "<p class=\"meta\">No preparation steps listed.</p>"}
    ${product.notes ? `<h2>Notes</h2><p class="notes">${escapeHtml(product.notes)}</p>` : ""}
    ${trial?.notes && trial.notes !== product.notes ? `<h2>Recipe Notes</h2><p class="notes">${escapeHtml(trial.notes)}</p>` : ""}
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
