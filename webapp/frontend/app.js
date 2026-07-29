"use strict";

// ---------------------------------------------------------------- state
const S = {
  cfg: null,
  data: null,        // {columns, numeric_columns, date_candidates, data, dates, ...}
  lastResult: null,
};

const $ = (id) => document.getElementById(id);
const toast = (msg) => {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 5000);
};

// ---------------------------------------------------------------- boot
async function boot() {
  try {
    S.cfg = await fetch("/api/config").then((r) => r.json());
  } catch (e) {
    S.cfg = { max_rows: 2000, max_columns: 20, max_horizon: 128, default_horizon: 24,
              max_file_size_bytes: 2097152, rate_limit_forecasts: 40,
              rate_limit_window_sec: 3600, contact_email: "sales@example.com", brand: "ForecastLab" };
  }
  const c = S.cfg;
  $("brand").textContent = c.brand;
  $("limits-line").textContent =
    `Demo limits: up to ${c.max_rows.toLocaleString()} rows and ${c.max_columns} columns per file, ` +
    `horizon ≤ ${c.max_horizon}, ${c.rate_limit_forecasts} forecasts / ${Math.round(c.rate_limit_window_sec/60)} min.`;
  $("upload-hint").textContent =
    `CSV only · max ${(c.max_file_size_bytes/1048576).toFixed(0)} MB · extra rows/columns are trimmed automatically.`;
  $("horizon").max = c.max_horizon;
  $("horizon").value = c.default_horizon;
  $("horizon-val").textContent = c.default_horizon;
  const mail = `mailto:${c.contact_email}?subject=TimesFM%20API%20access`;
  $("contact-cta").href = mail;

  refreshEngine();
  loadSamples();
  wireEvents();
}

async function refreshEngine() {
  try {
    const h = await fetch("/api/health").then((r) => r.json());
    const el = $("engine-badge");
    if (h.engine === "timesfm-2.5-200m") {
      el.className = "engine-badge timesfm";
      el.textContent = "● TimesFM 2.5 (200M) — live model";
    } else if (h.engine === "statistical-fallback") {
      el.className = "engine-badge fallback";
      el.textContent = "● Statistical fallback (install timesfm for the full model)";
    } else {
      el.className = "engine-badge loading";
      el.textContent = "● model loads on first forecast";
    }
    $("rate-info").textContent = "";
  } catch (e) { /* ignore */ }
}

async function loadSamples() {
  const list = $("sample-list");
  let samples = [];
  try { samples = await fetch("/api/samples").then((r) => r.json()); } catch (e) {}
  if (!samples.length) { list.innerHTML = '<p class="muted small">No samples available.</p>'; return; }
  list.innerHTML = "";
  for (const s of samples) {
    const b = document.createElement("button");
    b.className = "sample-btn";
    b.innerHTML = `<b>${s.title}</b><span>${s.description}</span>`;
    b.onclick = () => loadSample(s);
    list.appendChild(b);
  }
}

// ---------------------------------------------------------------- CSV parse
function parseCSV(text) {
  // Minimal RFC-4180-ish parser (handles quotes, commas, CRLF).
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length && !(r.length === 1 && r[0] === ""));
}

// ---------------------------------------------------------------- load data
async function loadSample(meta) {
  try {
    const text = await fetch(meta.url).then((r) => r.text());
    const file = new File([text], meta.file, { type: "text/csv" });
    await inspectFile(file, meta);
  } catch (e) { toast("Could not load sample: " + e.message); }
}

async function inspectFile(file, meta) {
  const status = $("data-status");
  status.innerHTML = '<span class="spinner"></span>Reading & validating…';
  const fd = new FormData();
  fd.append("file", file);
  let res;
  try {
    res = await fetch("/api/inspect", { method: "POST", body: fd });
  } catch (e) { status.textContent = ""; toast("Network error."); return; }
  const body = await res.json();
  if (!res.ok) { status.textContent = ""; toast(body.error || "Could not read file."); return; }

  S.data = body;
  renderDataStatus(body, file.name);
  populateControls(body, meta);
  $("config-card").hidden = false;
  $("config-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderDataStatus(b, fname) {
  const pills = [];
  pills.push(`<span class="pill ok">✓ ${fname}</span>`);
  pills.push(`<span class="pill ok">${b.n_rows.toLocaleString()} rows × ${b.n_cols} cols</span>`);
  pills.push(`<span class="pill ok">${b.numeric_columns.length} numeric</span>`);
  if (b.row_truncated) pills.push(`<span class="pill warn">trimmed to last ${b.n_rows.toLocaleString()} of ${b.original_rows.toLocaleString()} rows</span>`);
  if (b.col_truncated) pills.push(`<span class="pill warn">columns trimmed to ${S.cfg.max_columns}</span>`);

  let table = '<table class="preview-table"><thead><tr>';
  const cols = b.columns.map((c) => c.name);
  for (const c of cols) table += `<th>${c}</th>`;
  table += "</tr></thead><tbody>";
  for (const row of b.preview) {
    table += "<tr>";
    for (const c of cols) {
      let v = row[c];
      if (v === null || v === undefined) v = "";
      else if (typeof v === "number") v = (+v).toLocaleString(undefined, { maximumFractionDigits: 3 });
      table += `<td>${v}</td>`;
    }
    table += "</tr>";
  }
  table += "</tbody></table>";
  $("data-status").innerHTML = pills.join(" ") + table;
}

function populateControls(b, meta) {
  const tgt = $("target-col");
  tgt.innerHTML = "";
  for (const c of b.numeric_columns) {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    tgt.appendChild(o);
  }
  const dc = $("date-col");
  dc.innerHTML = '<option value="">(none — use step index)</option>';
  for (const c of b.date_candidates) {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    dc.appendChild(o);
  }
  // Apply sample suggestions when available
  if (meta) {
    if (meta.target_col && b.numeric_columns.includes(meta.target_col)) tgt.value = meta.target_col;
    if (meta.date_col && b.date_candidates.includes(meta.date_col)) dc.value = meta.date_col;
    if (meta.suggested_horizon) {
      const h = Math.min(meta.suggested_horizon, S.cfg.max_horizon);
      $("horizon").value = h; $("horizon-val").textContent = h;
    }
    // Temperature-like data can be negative → uncheck non-negative.
    $("nonneg").checked = !/temp|celsius|fahrenheit|return|delta|change|balance/i.test(meta.target_col || "");
  } else {
    // Heuristic for uploads
    $("nonneg").checked = true;
  }
  updateModeHint();
}

// ---------------------------------------------------------------- run
async function run() {
  if (!S.data) return;
  const target = $("target-col").value;
  const dateCol = $("date-col").value;
  const horizon = +$("horizon").value;
  const mode = document.querySelector("#mode-seg button.active").dataset.mode;
  const values = S.data.data[target];
  const dates = dateCol ? S.data.dates[dateCol] : null;

  const valid = values.filter((v) => v !== null && Number.isFinite(v)).length;
  const need = S.cfg.min_points + (mode === "backtest" ? horizon : 0);
  if (valid < need) {
    toast(`Need at least ${need} valid points for this ${mode} (have ${valid}). Try a smaller horizon.`);
    return;
  }

  const btn = $("run-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Forecasting… (first run may download the model)';

  let res, body;
  try {
    res = await fetch("/api/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, dates, horizon, mode, force_nonneg: $("nonneg").checked, target_name: target }),
    });
    body = await res.json();
  } catch (e) {
    btn.disabled = false; btn.textContent = "Run forecast →";
    toast("Network error while forecasting."); return;
  }
  btn.disabled = false; btn.textContent = "Run forecast →";

  if (!res.ok) { toast(body.error || "Forecast failed."); return; }

  const rem = res.headers.get("X-RateLimit-Remaining");
  if (rem !== null) $("rate-info").textContent = `${rem} demo forecasts left this hour`;

  S.lastResult = { ...body, target, dateCol };
  renderResult(S.lastResult);
}

function renderResult(r) {
  $("result-card").hidden = false;
  // metrics
  const m = $("metrics");
  if (r.mode === "backtest" && r.metrics) {
    const mt = r.metrics;
    m.innerHTML = `
      <div class="metric good"><div class="v">${mt.mape != null ? mt.mape + "%" : "—"}</div><div class="k">MAPE (lower is better)</div></div>
      <div class="metric"><div class="v">${mt.mae.toLocaleString(undefined,{maximumFractionDigits:2})}</div><div class="k">MAE</div></div>
      <div class="metric"><div class="v">${mt.rmse.toLocaleString(undefined,{maximumFractionDigits:2})}</div><div class="k">RMSE</div></div>
      <div class="metric good"><div class="v">${mt.coverage_80}%</div><div class="k">80% band coverage</div></div>`;
    m.hidden = false;
  } else {
    m.innerHTML = `<div class="metric"><div class="v">${r.horizon}</div><div class="k">steps forecast</div></div>`;
    m.hidden = false;
  }
  drawChart($("chart"), r);
  renderLegend(r);
  $("result-engine").textContent =
    "engine: " + (r.engine === "timesfm-2.5-200m" ? "TimesFM 2.5 (200M)" : "statistical fallback");
  $("result-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderLegend(r) {
  const parts = [
    `<span><i class="swatch" style="background:#6c8cff"></i>History</span>`,
    `<span><i class="swatch" style="background:#ff9d4d"></i>Forecast</span>`,
    `<span><i class="swatch" style="background:rgba(255,157,77,.35)"></i>80% interval</span>`,
  ];
  if (r.mode === "backtest") parts.push(`<span><i class="swatch" style="background:#e7ecff"></i>Actual (held out)</span>`);
  $("chart-legend").innerHTML = parts.join("");
}

// ---------------------------------------------------------------- chart
function drawChart(canvas, r) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 1000;
  const cssH = 460;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 62, padR = 18, padT = 18, padB = 34;
  const W = cssW - padL - padR, H = cssH - padT - padB;

  const hist = r.history;
  const H0 = hist.length;
  const Hz = r.horizon;
  const total = H0 + Hz;

  // y range across everything
  let lo = Infinity, hi = -Infinity;
  const consider = (a) => { for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; } };
  consider(hist); consider(r.point); consider(r.lower_80); consider(r.upper_80);
  if (r.actual) consider(r.actual);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;

  const xAt = (i) => padL + (total <= 1 ? 0 : (i / (total - 1)) * W);
  const yAt = (v) => padT + H - ((v - lo) / (hi - lo)) * H;

  // grid + y ticks
  ctx.strokeStyle = "rgba(255,255,255,.07)";
  ctx.fillStyle = "#97a3c7";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const v = lo + (hi - lo) * (t / ticks);
    const y = yAt(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke();
    ctx.fillText(fmtNum(v), padL - 8, y);
  }

  // forecast x offset (forecast starts right after last history point)
  const fStart = H0 - 1; // connect from last history point

  // 80% band
  ctx.fillStyle = "rgba(255,157,77,.28)";
  ctx.beginPath();
  for (let h = 0; h < Hz; h++) ctx.lineTo(xAt(H0 + h), yAt(r.upper_80[h]));
  for (let h = Hz - 1; h >= 0; h--) ctx.lineTo(xAt(H0 + h), yAt(r.lower_80[h]));
  ctx.closePath(); ctx.fill();

  // 60% band
  ctx.fillStyle = "rgba(255,157,77,.22)";
  ctx.beginPath();
  for (let h = 0; h < Hz; h++) ctx.lineTo(xAt(H0 + h), yAt(r.upper_60[h]));
  for (let h = Hz - 1; h >= 0; h--) ctx.lineTo(xAt(H0 + h), yAt(r.lower_60[h]));
  ctx.closePath(); ctx.fill();

  // history line
  drawLine(ctx, hist.map((v, i) => [xAt(i), yAt(v)]), "#6c8cff", 1.8);

  // actual (backtest) over the forecast region
  if (r.actual) {
    const pts = r.actual.map((v, h) => [xAt(H0 + h), yAt(v)]);
    pts.unshift([xAt(fStart), yAt(hist[hist.length - 1])]);
    drawLine(ctx, pts, "#e7ecff", 2.2);
  }

  // forecast line (connect from last history point)
  const fpts = r.point.map((v, h) => [xAt(H0 + h), yAt(v)]);
  fpts.unshift([xAt(fStart), yAt(hist[hist.length - 1])]);
  drawLine(ctx, fpts, "#ff9d4d", 2.2);

  // vertical separator "now"
  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(xAt(fStart), padT); ctx.lineTo(xAt(fStart), padT + H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#97a3c7"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText(r.mode === "backtest" ? "forecast origin" : "now", xAt(fStart), padT + 2);

  // x labels (a few dates or step indices)
  ctx.fillStyle = "#97a3c7"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  const labels = buildXLabels(r, total);
  const step = Math.max(1, Math.floor(total / 7));
  for (let i = 0; i < total; i += step) {
    ctx.fillText(labels[i], xAt(i), padT + H + 8);
  }
}

function buildXLabels(r, total) {
  const out = new Array(total);
  const H0 = r.history.length;
  const hd = r.history_dates, fd = r.future_dates;
  for (let i = 0; i < total; i++) {
    if (i < H0 && hd && hd[i]) out[i] = shortDate(hd[i]);
    else if (i >= H0 && fd && fd[i - H0]) out[i] = shortDate(fd[i - H0]);
    else out[i] = (i < H0 ? "-" + (H0 - i) : "+" + (i - H0 + 1));
  }
  return out;
}

function shortDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function drawLine(ctx, pts, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.stroke();
}

function fmtNum(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "k";
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

// ---------------------------------------------------------------- download
function downloadCSV() {
  const r = S.lastResult;
  if (!r) return;
  const rows = [["step", "date", "forecast", "lower_80", "upper_80", "lower_60", "upper_60"]];
  for (let h = 0; h < r.horizon; h++) {
    const date = r.future_dates && r.future_dates[h] ? shortDate(r.future_dates[h]) : "";
    rows.push([h + 1, date, r.point[h], r.lower_80[h], r.upper_80[h], r.lower_60[h], r.upper_60[h]]);
  }
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `forecast_${r.target || "series"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------- events
function updateModeHint() {
  const mode = document.querySelector("#mode-seg button.active").dataset.mode;
  $("mode-hint").textContent = mode === "backtest"
    ? "Backtest hides the last N points, forecasts them, and scores the result against reality — the honest proof of accuracy."
    : "Forecast projects the horizon into the (unknown) future with calibrated confidence bands.";
}

function wireEvents() {
  $("horizon").addEventListener("input", (e) => ($("horizon-val").textContent = e.target.value));
  $("run-btn").addEventListener("click", run);
  $("download-btn").addEventListener("click", downloadCSV);

  document.querySelectorAll("#mode-seg button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#mode-seg button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      updateModeHint();
    })
  );

  const fi = $("file-input"), dz = $("dropzone");
  fi.addEventListener("change", () => { if (fi.files[0]) checkAndInspect(fi.files[0]); });
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault(); dz.classList.remove("drag");
    if (e.dataTransfer.files[0]) checkAndInspect(e.dataTransfer.files[0]);
  });

  window.addEventListener("resize", () => { if (S.lastResult) drawChart($("chart"), S.lastResult); });
}

function checkAndInspect(file) {
  if (file.size > S.cfg.max_file_size_bytes) {
    toast(`File too large (max ${(S.cfg.max_file_size_bytes/1048576).toFixed(0)} MB).`);
    return;
  }
  inspectFile(file, null);
}

boot();
