import { expiryLabel, formatDate, formatMoney } from "./format";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusLabel(item) {
  if (item.is_trial) {
    return String(item.trial_status || "").replaceAll("_", " ") || "—";
  }
  return expiryLabel(item.expiry_status) || "—";
}

function priceLabel(item) {
  if (item.price_per_unit == null || item.price_per_unit === "") return "—";
  return `${formatMoney(item.price_per_unit)}${item.unit ? ` / ${item.unit}` : ""}`;
}

/**
 * Print/export the ingredients currently shown in the table
 * (respects active tab + filters).
 */
export function exportIngredientsPdf({ items, grouped, filters = {} }) {
  const list = items || [];
  if (!list.length) {
    alert("No ingredients to export with the current filters.");
    return;
  }

  const sections = grouped?.length
    ? grouped
    : [{ name: "Ingredients", items: list }];

  const filterLines = [];
  if (filters.tabLabel) filterLines.push(`List: ${filters.tabLabel}`);
  if (filters.search) filterLines.push(`Search: ${filters.search}`);
  if (filters.categoryLabel) filterLines.push(`Category: ${filters.categoryLabel}`);
  if (filters.supplierLabel) filterLines.push(`Supplier: ${filters.supplierLabel}`);
  if (filters.statusLabel) filterLines.push(`Status: ${filters.statusLabel}`);
  filterLines.push(`Exported: ${formatDate(new Date().toISOString())}`);
  filterLines.push(`Total: ${list.length} ingredient${list.length === 1 ? "" : "s"}`);

  const sectionHtml = sections
    .map((section) => {
      const rows = section.items
        .map(
          (i) => `<tr>
          <td>${escapeHtml(i.code || "—")}</td>
          <td>${escapeHtml(i.name || "—")}${i.is_secret ? " ★" : ""}${i.is_low_stock ? " (Low Stock)" : ""}</td>
          <td>${escapeHtml(i.supplier_name || "—")}</td>
          <td>${escapeHtml(i.batch_number || "—")}</td>
          <td>${escapeHtml(`${i.quantity ?? "—"} ${i.unit || ""}`.trim())}</td>
          <td>${escapeHtml(priceLabel(i))}</td>
          <td>${escapeHtml(i.created_at ? formatDate(i.created_at) : "—")}</td>
          <td>${escapeHtml(i.expiry_date ? formatDate(i.expiry_date) : "—")}</td>
          <td>${escapeHtml(statusLabel(i))}</td>
        </tr>`
        )
        .join("");
      return `
        <h2>${escapeHtml(section.name)} <span class="count">${section.items.length}</span></h2>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Supplier</th>
              <th>Batch / Lot</th>
              <th>Qty</th>
              <th>Price / Unit</th>
              <th>Date Added</th>
              <th>Expiry</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ingredients Export</title>
    <style>
      body{font-family:Segoe UI,sans-serif;padding:28px;color:#111;max-width:1100px;margin:0 auto}
      h1{margin:0 0 6px;font-size:24px}
      h2{margin:28px 0 10px;font-size:15px;display:flex;align-items:baseline;gap:8px}
      h2 .count{font-size:12px;font-weight:600;color:#6b7280}
      .meta{color:#555;font-size:13px;margin:2px 0;line-height:1.45}
      table{width:100%;border-collapse:collapse;margin-top:4px;font-size:12px}
      th,td{border-bottom:1px solid #e5e7eb;padding:8px 6px;text-align:left;vertical-align:top}
      th{font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#6b7280;font-weight:700}
      @media print{
        body{padding:12px;max-width:none}
        h2{break-after:avoid}
        table{break-inside:auto}
        tr{break-inside:avoid}
      }
    </style></head><body>
    <h1>Ingredients</h1>
    ${filterLines.map((line) => `<p class="meta">${escapeHtml(line)}</p>`).join("")}
    ${sectionHtml}
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Please allow pop-ups to export the PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
