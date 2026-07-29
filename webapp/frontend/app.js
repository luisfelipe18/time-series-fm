"use strict";

/* Meridian Forecasting — demonstration client.
   No frameworks, no build step. Chart drawn directly on canvas. */

// ---------------------------------------------------------------- palette
// Mirrors style.css. Canvas cannot read CSS custom properties cheaply, so the
// few values the chart needs are declared once here.
const C = {
  ink:        "#26241F",
  inkFaint:   "#918A7B",
  grid:       "rgba(27, 26, 23, 0.085)",
  axis:       "rgba(27, 26, 23, 0.22)",
  divider:    "rgba(27, 26, 23, 0.30)",
  projection: "#6A2029",
  band80:     "rgba(106, 32, 41, 0.095)",
  band60:     "rgba(106, 32, 41, 0.155)",
  withheld:   "#1E3A30",
  sans: '600 10px "Helvetica Neue", Helvetica, Arial, sans-serif',
};

const ENGINE_PRIMARY = "meridian-core";
const ENGINE_BASELINE = "meridian-baseline";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// ---------------------------------------------------------------- state
const S = { cfg: null, data: null, lastResult: null };

const $ = (id) => document.getElementById(id);

function notify(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(notify._t);
  notify._t = setTimeout(() => (t.hidden = true), 6000);
}

// ---------------------------------------------------------------- boot
async function boot() {
  try {
    S.cfg = await fetch("/api/config").then((r) => r.json());
  } catch (e) {
    S.cfg = {
      max_rows: 2000, max_columns: 20, max_horizon: 128, default_horizon: 24,
      min_points: 32, max_file_size_bytes: 2097152, rate_limit_forecasts: 40,
      rate_limit_window_sec: 3600, contact_email: "advisory@example.com",
      brand: "Meridian", brand_suffix: "Forecasting", established: "MMXXVI",
    };
  }
  const c = S.cfg;

  $("brand").textContent = c.brand;
  $("brand-suffix").textContent = c.brand_suffix || "Forecasting";
  $("footer-brand").textContent = c.brand;
  $("footer-est").textContent = c.established || "";
  document.querySelector(".wordmark-mark").textContent = (c.brand || "M").charAt(0);

  $("limits-line").textContent =
    `This demonstration accepts up to ${c.max_rows.toLocaleString()} periods and ` +
    `${c.max_columns} columns per file, with a horizon of ${c.max_horizon} periods.`;
  $("upload-hint").textContent =
    `Comma-separated values · not exceeding ${(c.max_file_size_bytes / 1048576).toFixed(0)} MB · ` +
    `longer files are trimmed to the most recent periods.`;

  $("horizon").max = c.max_horizon;
  $("horizon").value = c.default_horizon;
  $("horizon-val").textContent = c.default_horizon;

  $("contact-cta").href =
    `mailto:${c.contact_email}?subject=${encodeURIComponent("Enquiry — " + c.brand + " engagement")}`;

  refreshEngine();
  loadSamples();
  wireEvents();
  updateModeHint();
}

async function refreshEngine() {
  const el = $("engine-badge");
  try {
    const h = await fetch("/api/health").then((r) => r.json());
    if (h.engine === ENGINE_PRIMARY) {
      el.className = "engine-badge live";
      el.textContent = "Engine · Core · operational";
    } else if (h.engine === ENGINE_BASELINE) {
      el.className = "engine-badge reduced";
      el.textContent = "Engine · reduced capacity";
    } else {
      el.className = "engine-badge";
      el.textContent = "Engine · on standby";
    }
  } catch (e) {
    el.className = "engine-badge";
    el.textContent = "Engine · unavailable";
  }
}

async function loadSamples() {
  const list = $("sample-list");
  let samples = [];
  try { samples = await fetch("/api/samples").then((r) => r.json()); } catch (e) {}
  if (!samples.length) {
    list.innerHTML = '<p class="panel-note">No prepared datasets are available.</p>';
    return;
  }
  list.innerHTML = "";
  samples.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "sample-btn";
    b.type = "button";
    b.innerHTML =
      `<span class="sb-idx">${ROMAN[i] || i + 1}</span>` +
      `<span><b>${escapeHtml(s.title)}</b><span>${escapeHtml(s.description)}</span></span>`;
    b.onclick = () => {
      document.querySelectorAll(".sample-btn").forEach((x) => x.classList.remove("chosen"));
      b.classList.add("chosen");
      loadSample(s);
    };
    list.appendChild(b);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// ---------------------------------------------------------------- load data
async function loadSample(meta) {
  try {
    const text = await fetch(meta.url).then((r) => r.text());
    const file = new File([text], meta.file, { type: "text/csv" });
    await inspectFile(file, meta);
  } catch (e) {
    notify("The prepared dataset could not be retrieved.");
  }
}

async function inspectFile(file, meta) {
  const status = $("data-status");
  status.innerHTML = '<p class="panel-note"><span class="spinner dark"></span>Reading and validating the file…</p>';

  const fd = new FormData();
  fd.append("file", file);

  let res, body;
  try {
    res = await fetch("/api/inspect", { method: "POST", body: fd });
    body = await res.json();
  } catch (e) {
    status.innerHTML = "";
    notify("The file could not be transmitted. Please try again.");
    return;
  }
  if (!res.ok) {
    status.innerHTML = "";
    notify(body.error || "The file could not be read.");
    return;
  }

  S.data = body;
  renderDataStatus(body, file.name);
  populateControls(body, meta);
  $("config-card").hidden = false;
  $("config-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderDataStatus(b, fname) {
  const bits = [
    `<span>File <b>${escapeHtml(fname)}</b></span>`,
    `<span>Periods <b>${b.n_rows.toLocaleString()}</b></span>`,
    `<span>Columns <b>${b.n_cols}</b></span>`,
    `<span>Numeric series <b>${b.numeric_columns.length}</b></span>`,
  ];
  if (b.row_truncated) {
    bits.push(`<span class="flag">Trimmed to the most recent ${b.n_rows.toLocaleString()} of ${b.original_rows.toLocaleString()}</span>`);
  }
  if (b.col_truncated) {
    bits.push(`<span class="flag">Reduced to the first ${S.cfg.max_columns} columns</span>`);
  }

  const cols = b.columns.map((c) => c.name);
  let table = '<div class="preview-wrap"><table class="preview-table"><thead><tr>';
  for (const c of cols) table += `<th>${escapeHtml(c)}</th>`;
  table += "</tr></thead><tbody>";
  for (const row of b.preview) {
    table += "<tr>";
    for (const c of cols) {
      let v = row[c];
      if (v === null || v === undefined) v = "—";
      else if (typeof v === "number") v = v.toLocaleString(undefined, { maximumFractionDigits: 3 });
      else v = escapeHtml(v);
      table += `<td>${v}</td>`;
    }
    table += "</tr>";
  }
  table += "</tbody></table></div>";

  $("data-status").innerHTML = `<div class="status-line">${bits.join("")}</div>${table}`;
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
  dc.innerHTML = '<option value="">Use period number</option>';
  for (const c of b.date_candidates) {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    dc.appendChild(o);
  }

  if (meta) {
    if (meta.target_col && b.numeric_columns.includes(meta.target_col)) tgt.value = meta.target_col;
    if (meta.date_col && b.date_candidates.includes(meta.date_col)) dc.value = meta.date_col;
    if (meta.suggested_horizon) {
      const h = Math.min(meta.suggested_horizon, S.cfg.max_horizon);
      $("horizon").value = h;
      $("horizon-val").textContent = h;
    }
  }

  // Series that legitimately go below zero should not be clamped.
  const name = (meta && meta.target_col) || tgt.value || "";
  $("nonneg").checked = !/temp|celsius|fahrenheit|return|delta|change|balance|margin|net/i.test(name);

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
    notify(`This ${mode === "backtest" ? "validation" : "projection"} requires at least ${need} periods; the series holds ${valid}. Please shorten the horizon.`);
    return;
  }

  const btn = $("run-btn");
  const label = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Computing';

  let res, body;
  try {
    res = await fetch("/api/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        values, dates, horizon, mode,
        force_nonneg: $("nonneg").checked,
        target_name: target,
      }),
    });
    body = await res.json();
  } catch (e) {
    btn.disabled = false; btn.textContent = label;
    notify("The request could not be completed. Please try again.");
    return;
  }
  btn.disabled = false; btn.textContent = label;

  if (!res.ok) { notify(body.error || "The projection could not be produced."); return; }

  const rem = res.headers.get("X-RateLimit-Remaining");
  if (rem !== null) {
    $("rate-info").textContent =
      `${rem} of ${S.cfg.rate_limit_forecasts} demonstration computations remain this hour.`;
  }

  S.lastResult = { ...body, target, dateCol };
  renderResult(S.lastResult);
  refreshEngine();
}

function renderResult(r) {
  $("result-card").hidden = false;

  const m = $("metrics");
  let tiles = [];

  if (r.mode === "backtest" && r.metrics) {
    const t = r.metrics;
    tiles = [
      { v: t.mape != null ? t.mape.toFixed(2) + "%" : "—", k: "Mean abs. % error", accent: true },
      { v: fmtNum(t.mae), k: "Mean abs. error" },
      { v: fmtNum(t.rmse), k: "Root mean sq. error" },
      { v: t.coverage_80 + "%", k: "80% interval coverage", accent: true },
    ];
  } else {
    tiles = [
      { v: r.horizon, k: "Periods projected", accent: true },
      { v: escapeHtml(r.target || "—"), k: "Series" },
      { v: "80%", k: "Interval reported" },
    ];
  }

  m.style.gridTemplateColumns = `repeat(${tiles.length}, 1fr)`;
  m.innerHTML = tiles
    .map((t) => `<div class="metric${t.accent ? " accent" : ""}"><div class="v">${t.v}</div><span class="k">${t.k}</span></div>`)
    .join("");

  drawChart($("chart"), r);
  renderLegend(r);

  $("result-engine").textContent =
    r.mode === "backtest"
      ? "Recent history was withheld from the engine, projected, then scored against what actually occurred."
      : "Projected forward from the full series. The shaded region states the range within which the figure is expected to fall.";

  $("result-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderLegend(r) {
  const parts = [
    `<span><i class="swatch" style="border-top-color:${C.ink}"></i>Observed</span>`,
    `<span><i class="swatch" style="border-top-color:${C.projection};border-top-style:dashed"></i>Projection</span>`,
    `<span><i class="swatch band" style="background:${C.band60}"></i>60% interval</span>`,
    `<span><i class="swatch band" style="background:${C.band80}"></i>80% interval</span>`,
  ];
  if (r.mode === "backtest") {
    parts.push(`<span><i class="swatch" style="border-top-color:${C.withheld}"></i>Actual, withheld</span>`);
  }
  $("chart-legend").innerHTML = parts.join("");
}

// ---------------------------------------------------------------- chart
function drawChart(canvas, r) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 1000;
  const cssH = 440;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 68, padR = 24, padT = 26, padB = 40;
  const W = cssW - padL - padR;
  const H = cssH - padT - padB;

  const hist = r.history;
  const H0 = hist.length;
  const Hz = r.horizon;
  const total = H0 + Hz;

  let lo = Infinity, hi = -Infinity;
  const consider = (a) => { for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; } };
  consider(hist); consider(r.point); consider(r.lower_80); consider(r.upper_80);
  if (r.actual) consider(r.actual);
  if (lo === hi) { lo -= 1; hi += 1; }
  const margin = (hi - lo) * 0.1;
  const scale = niceScale(lo - margin, hi + margin, 5);
  lo = scale.lo; hi = scale.hi;

  const xAt = (i) => padL + (total <= 1 ? 0 : (i / (total - 1)) * W);
  const yAt = (v) => padT + H - ((v - lo) / (hi - lo)) * H;

  // horizontal rules + y labels, on round figures
  ctx.font = C.sans;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let v = lo; v <= hi + scale.step * 1e-6; v += scale.step) {
    const y = Math.round(yAt(v)) + 0.5;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke();
    ctx.fillStyle = C.inkFaint;
    ctx.fillText(fmtNum(v), padL - 12, y);
  }

  // axes
  ctx.strokeStyle = C.axis;
  ctx.beginPath();
  ctx.moveTo(padL + 0.5, padT); ctx.lineTo(padL + 0.5, padT + H);
  ctx.moveTo(padL, padT + H + 0.5); ctx.lineTo(padL + W, padT + H + 0.5);
  ctx.stroke();

  const joinX = H0 - 1;
  const joinY = hist[hist.length - 1];

  // intervals — widest first
  ctx.fillStyle = C.band80;
  ctx.beginPath();
  ctx.moveTo(xAt(joinX), yAt(joinY));
  for (let h = 0; h < Hz; h++) ctx.lineTo(xAt(H0 + h), yAt(r.upper_80[h]));
  for (let h = Hz - 1; h >= 0; h--) ctx.lineTo(xAt(H0 + h), yAt(r.lower_80[h]));
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = C.band60;
  ctx.beginPath();
  ctx.moveTo(xAt(joinX), yAt(joinY));
  for (let h = 0; h < Hz; h++) ctx.lineTo(xAt(H0 + h), yAt(r.upper_60[h]));
  for (let h = Hz - 1; h >= 0; h--) ctx.lineTo(xAt(H0 + h), yAt(r.lower_60[h]));
  ctx.closePath(); ctx.fill();

  // observed history
  drawLine(ctx, hist.map((v, i) => [xAt(i), yAt(v)]), C.ink, 1.4);

  // withheld actuals (validation mode)
  if (r.actual) {
    const pts = r.actual.map((v, h) => [xAt(H0 + h), yAt(v)]);
    pts.unshift([xAt(joinX), yAt(joinY)]);
    drawLine(ctx, pts, C.withheld, 1.9);
  }

  // projection — dashed, per the convention that projected figures are never
  // drawn as though they were observed
  const fpts = r.point.map((v, h) => [xAt(H0 + h), yAt(v)]);
  fpts.unshift([xAt(joinX), yAt(joinY)]);
  drawLine(ctx, fpts, C.projection, 1.9, [5, 3]);

  // origin divider
  ctx.strokeStyle = C.divider;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(Math.round(xAt(joinX)) + 0.5, padT);
  ctx.lineTo(Math.round(xAt(joinX)) + 0.5, padT + H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = C.inkFaint;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(r.mode === "backtest" ? "ORIGIN" : "PRESENT", xAt(joinX), padT - 16);

  // x labels
  const labels = buildXLabels(r, total);
  const step = Math.max(1, Math.floor(total / 7));
  for (let i = 0; i < total; i += step) {
    ctx.textAlign = i === 0 ? "left" : "center";
    ctx.fillText(labels[i], xAt(i), padT + H + 12);
  }
}

// Snap an axis to round figures (1 / 2 / 2.5 / 5 × 10^n), as a printed report would.
function niceScale(lo, hi, ticks) {
  const range = hi - lo || 1;
  const raw = range / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw)) || 0));
  const norm = raw / mag;
  let step;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 2.5) step = 2.5;
  else if (norm <= 5) step = 5;
  else step = 10;
  step *= mag;
  return {
    lo: Math.floor(lo / step) * step,
    hi: Math.ceil(hi / step) * step,
    step,
  };
}

function buildXLabels(r, total) {
  const out = new Array(total);
  const H0 = r.history.length;
  const hd = r.history_dates, fd = r.future_dates;
  for (let i = 0; i < total; i++) {
    if (i < H0 && hd && hd[i]) out[i] = shortDate(hd[i]);
    else if (i >= H0 && fd && fd[i - H0]) out[i] = shortDate(fd[i - H0]);
    else out[i] = i < H0 ? "−" + (H0 - i) : "+" + (i - H0 + 1);
  }
  return out;
}

function shortDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function drawLine(ctx, pts, color, width, dash) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = dash ? "butt" : "round";
  ctx.setLineDash(dash || []);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.stroke();
  ctx.setLineDash([]);
}

function fmtNum(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e4) return (v / 1e3).toFixed(1) + "k";
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

// ---------------------------------------------------------------- download
function downloadCSV() {
  const r = S.lastResult;
  if (!r) return;
  const rows = [["period", "date", "projection", "lower_80", "upper_80", "lower_60", "upper_60"]];
  for (let h = 0; h < r.horizon; h++) {
    const date = r.future_dates && r.future_dates[h] ? shortDate(r.future_dates[h]) : "";
    rows.push([h + 1, date, r.point[h], r.lower_80[h], r.upper_80[h], r.lower_60[h], r.upper_60[h]]);
  }
  const csv = rows.map((x) => x.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `projection_${(r.target || "series").replace(/\W+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------- events
function updateModeHint() {
  const mode = document.querySelector("#mode-seg button.active").dataset.mode;
  $("mode-hint").textContent = mode === "backtest"
    ? "Validation is the honest test: the engine never sees the withheld periods before projecting them."
    : "The projection extends beyond the record. Intervals widen with distance, as they should.";
}

function wireEvents() {
  $("horizon").addEventListener("input", (e) => ($("horizon-val").textContent = e.target.value));
  $("run-btn").addEventListener("click", run);
  $("download-btn").addEventListener("click", downloadCSV);
  $("target-col").addEventListener("change", (e) => {
    $("nonneg").checked = !/temp|celsius|fahrenheit|return|delta|change|balance|margin|net/i.test(e.target.value);
  });

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

  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (S.lastResult) drawChart($("chart"), S.lastResult); }, 120);
  });
}

function checkAndInspect(file) {
  if (file.size > S.cfg.max_file_size_bytes) {
    notify(`The file exceeds the ${(S.cfg.max_file_size_bytes / 1048576).toFixed(0)} MB limit of this demonstration.`);
    return;
  }
  document.querySelectorAll(".sample-btn").forEach((x) => x.classList.remove("chosen"));
  inspectFile(file, null);
}

boot();
