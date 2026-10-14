import { formatDate, formatMoney, formatQuantity } from "./format";

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
  return "approved";
}

function priceLabel(item) {
  if (item.price_per_unit == null || item.price_per_unit === "") return "—";
  return `${formatMoney(item.price_per_unit)}${item.unit ? ` / ${item.unit}` : ""}`;
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read letterhead."));
    reader.readAsDataURL(blob);
  });
}

/** Load a letterhead asset as a data URL so print does not race image loading. */
async function resolveLetterheadDataUrl(filename) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const candidates = [
    `${origin}/static/${filename}`,
    `${origin}/${filename}`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob || !blob.size) continue;
      return await blobToDataUrl(blob);
    } catch {
      // try next candidate
    }
  }
  return "";
}

function waitForImages(doc, timeoutMs = 4000) {
  const images = [...doc.images];
  if (!images.length) return Promise.resolve();
  return Promise.race([
    Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
              resolve();
              return;
            }
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
      )
    ),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Print/export all ingredients for the active tab + filters
 * (not limited to the current table page).
 */
export async function exportIngredientsPdf({ items, grouped, filters = {} }) {
  const list = items || [];
  if (!list.length) {
    throw new Error("No ingredients to export with the current filters.");
  }

  const sections = grouped?.length
    ? grouped
    : [{ name: "Ingredients", items: list }];

  const reportTitle = filters.tabLabel
    ? `${filters.tabLabel} Report`
    : "Ingredients Report";
  const preparedOn = formatDate(new Date().toISOString());
  const [letterheadLeft, letterheadRight] = await Promise.all([
    resolveLetterheadDataUrl("letterhead-1.png"),
    resolveLetterheadDataUrl("letterhead-2.png"),
  ]);

  const metaRows = [];
  if (filters.search) metaRows.push(["Search", filters.search]);
  if (filters.categoryLabel) metaRows.push(["Category", filters.categoryLabel]);
  if (filters.supplierLabel) metaRows.push(["Supplier", filters.supplierLabel]);
  if (filters.sortLabel) metaRows.push(["Sort by", filters.sortLabel]);

  const sectionHtml = sections
    .map((section) => {
      const rows = section.items
        .map(
          (i) => `<tr>
          <td>${escapeHtml(i.code || "—")}</td>
          <td>${escapeHtml(i.name || "—")}${i.is_secret ? " ★" : ""}${i.is_low_stock ? " (Low Stock)" : ""}</td>
          <td>${escapeHtml(i.supplier_name || "—")}</td>
          <td>${escapeHtml(i.batch_number || "—")}</td>
          <td>${escapeHtml(`${i.quantity == null || i.quantity === "" ? "—" : formatQuantity(i.quantity)} ${i.unit || ""}`.trim())}</td>
          <td>${escapeHtml(priceLabel(i))}</td>
          <td>${escapeHtml(i.created_at ? formatDate(i.created_at) : "—")}</td>
          <td>${escapeHtml(statusLabel(i))}</td>
        </tr>`
        )
        .join("");
      return `
        <section class="category-block">
          <h2>
            <span class="category-title">${escapeHtml(section.name)}</span>
            <span class="chip">${section.items.length}</span>
          </h2>
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    })
    .join("");

  const letterheadHtml = (letterheadLeft || letterheadRight)
    ? `<div class="letterhead-row">
        ${letterheadLeft ? `<img class="letterhead-left" src="${letterheadLeft}" alt="" />` : ""}
        ${letterheadRight ? `<img class="letterhead-right" src="${letterheadRight}" alt="MAA Group" />` : ""}
      </div>`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(reportTitle)}</title>
    <style>
      @page { margin: 16mm 14mm; }
      body {
        font-family: "Times New Roman", Times, Georgia, serif;
        padding: 0;
        margin: 0 auto;
        color: #1a1a1a;
        max-width: 1100px;
        font-size: 12pt;
        line-height: 1.45;
      }
      .letterhead-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        margin: 0 0 22px;
        gap: 24px;
      }
      .letterhead-left,
      .letterhead-right {
        display: block;
        height: 58px;
        width: auto;
        object-fit: contain;
      }
      .letterhead-left {
        width: 70%;
        max-width: 70%;
        height: 58px;
        object-fit: fill;
        object-position: left center;
        margin-right: auto;
        flex: 0 0 auto;
      }
      .letterhead-right {
        max-width: 36%;
        object-position: right center;
        margin-left: auto;
      }
      .doc-header {
        text-align: center;
        margin: 0 0 22px;
        padding-bottom: 16px;
        border-bottom: 1.5px solid #1a1a1a;
      }
      .doc-header h1 {
        margin: 0;
        font-size: 20pt;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .doc-header .subtitle {
        margin: 8px 0 0;
        font-size: 11pt;
        font-style: italic;
        color: #374151;
      }
      .meta-block {
        margin: 0 0 28px;
        width: 100%;
        border-collapse: collapse;
        font-family: "Segoe UI", Helvetica, Arial, sans-serif;
        font-size: 10pt;
      }
      .meta-block th,
      .meta-block td {
        padding: 5px 10px 5px 0;
        text-align: left;
        vertical-align: top;
        border: none;
      }
      .meta-block th {
        width: 140px;
        font-weight: 600;
        color: #374151;
        text-transform: none;
        letter-spacing: 0;
        font-size: 10pt;
      }
      .meta-block td { color: #111; }
      .category-block { margin: 0 0 26px; }
      h2 {
        margin: 0 0 10px;
        padding-bottom: 6px;
        border-bottom: 1px solid #d1d5db;
        font-size: 13pt;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 10px;
        letter-spacing: 0.01em;
      }
      .category-title { flex: 0 1 auto; }
      .chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.6em;
        padding: 2px 9px;
        border-radius: 999px;
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        color: #374151;
        font-family: "Segoe UI", Helvetica, Arial, sans-serif;
        font-size: 9pt;
        font-weight: 700;
        line-height: 1.3;
        letter-spacing: 0.02em;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 2px;
        font-family: "Segoe UI", Helvetica, Arial, sans-serif;
        font-size: 9.5pt;
      }
      th, td {
        border-bottom: 1px solid #e5e7eb;
        padding: 7px 6px;
        text-align: left;
        vertical-align: top;
      }
      thead th {
        font-size: 8.5pt;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #4b5563;
        font-weight: 700;
        border-bottom: 1.5px solid #9ca3af;
        background: #fafafa;
      }
      @media print {
        body { padding: 0; max-width: none; }
        .letterhead-row { margin-bottom: 16px; }
        .letterhead-left,
        .letterhead-right {
          height: 52px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .letterhead-left { width: 70%; max-width: 70%; }
        .chip { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        h2 { break-after: avoid; }
        .category-block { break-inside: avoid; }
        table { break-inside: auto; }
        tr { break-inside: avoid; }
        thead th { background: #fafafa; }
      }
    </style></head><body>
    ${letterheadHtml}
    <header class="doc-header">
      <h1>${escapeHtml(reportTitle)}</h1>
      <p class="subtitle">Official listing as of ${escapeHtml(preparedOn)}</p>
    </header>
    ${
      metaRows.length
        ? `<table class="meta-block">
      <tbody>
        ${metaRows
          .map(
            ([label, value]) =>
              `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>`
        : ""
    }
    ${sectionHtml}
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    throw new Error("Please allow pop-ups to export the PDF.");
  }
  w.document.write(html);
  w.document.close();
  await waitForImages(w.document);
  w.focus();
  w.print();
}
