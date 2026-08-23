"use strict";

/* Meridian — demonstration client.
   No frameworks, no build step. Chart drawn directly on canvas.
   Copy is bilingual; see i18n.js. */

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
  // Las dos bandas se distinguen por TONO, no solo por opacidad: antes ambas
  // eran clarete y se leian como una sola mancha.
  band80:     "#DBCFB6",   // arena palida: el intervalo ancho, 80%
  band60:     "#C29A9C",   // rosa clarete: el intervalo estrecho, 60%
  withheld:   "#1E3A30",
  rule:       "#D5CEBD",
  ink3:       "#6B6559",
  green:      "#1E3A30",
  sans: '600 10px "Helvetica Neue", Helvetica, Arial, sans-serif',
};

const FONT_SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const FONT_SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

const ENGINE_PRIMARY = "meridian-core";
const ENGINE_BASELINE = "meridian-baseline";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// ---------------------------------------------------------------- state
const S = {
  cfg: null,
  data: null,          // parsed upload/sample from /api/inspect
  samples: [],
  fileName: null,
  sampleMeta: null,
  lastResult: null,
  engine: null,
  rate: null,          // {remaining, limit}
};

const $ = (id) => document.getElementById(id);

function notify(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(notify._t);
  notify._t = setTimeout(() => (el.hidden = true), 6000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

/** Render an error returned by the API in the active language. */
function apiMessage(body) {
  if (body && body.code) {
    const key = "srv." + body.code;
    const localized = t(key, body.params || {});
    if (localized !== key) return localized;
  }
  return (body && body.error) || t("err.request");
}

// ---------------------------------------------------------------- boot
async function boot() {
  try {
    S.cfg = await fetch("/api/config").then((r) => r.json());
  } catch (e) {
    S.cfg = {
      max_rows: 2000, max_columns: 20, max_horizon: 128, default_horizon: 24,
      min_points: 32, max_file_size_bytes: 2097152, rate_limit_forecasts: 40,
      rate_limit_window_sec: 3600, contact_email: "sales@vilcongroup.com",
      brand: "Meridian", brand_suffix: null, established: "MMXXVI", default_lang: "es",
    };
  }
  const c = S.cfg;

  initLang(c.default_lang || "es", !!c.respect_browser_lang);

  $("brand").textContent = c.brand;
  $("footer-brand").textContent = c.brand;
  $("footer-est").textContent = c.established || "";
  document.querySelector(".wordmark-mark").textContent = (c.brand || "M").charAt(0);

  $("horizon").max = c.max_horizon;
  $("horizon").value = c.default_horizon;

  applyLanguage();
  refreshEngine();
  loadSamples();
  wireEvents();
}

/** Everything whose text depends on the active language. */
function applyLanguage() {
  const c = S.cfg;

  applyStaticTranslations();

  // Wordmark suffix: an explicit DEMO_BRAND_SUFFIX pins one wording.
  $("brand-suffix").textContent = c.brand_suffix || t("brand.suffix");

  $("limits-line").textContent = t("p1.limits", {
    rows: c.max_rows.toLocaleString(getLang()),
    cols: c.max_columns,
    horizon: c.max_horizon,
  });
  $("upload-hint").textContent = t("p1.hint", {
    mb: (c.max_file_size_bytes / 1048576).toFixed(0),
  });

  setHorizonLabel();
  updateModeHint();
  renderEngineBadge();
  renderRateInfo();

  $("contact-cta").href =
    `mailto:${c.contact_email}?subject=` +
    encodeURIComponent(t("eng.mailSubject", { brand: c.brand }));

  // Language-dependent content that is already on screen
  renderPricing();
  renderSampleList();
  if (S.data) {
    renderDataStatus();
    renderDateOptions();
  }
  if (S.lastResult) renderResult(S.lastResult);

  document.querySelectorAll("#lang-toggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.lang === getLang()));
}

function setHorizonLabel() {
  $("horizon-label").innerHTML = t("p2.horizon", { h: $("horizon").value });
}

function renderRateInfo() {
  if (!S.rate) { $("rate-info").textContent = ""; return; }
  $("rate-info").textContent = t("rate.remaining", S.rate);
}

// ---------------------------------------------------------------- pricing
// Order matters: it is the order shown on the page.
const PLANS = ["trial", "portfolio", "institutional", "bespoke"];
const FEATURED_PLAN = "institutional";

function renderPricing() {
  const grid = $("pricing-grid");
  grid.innerHTML = PLANS.map((id) => {
    const featured = id === FEATURED_PLAN;
    const name = t(`pr.${id}.name`);
    const features = t(`pr.${id}.f`)
      .split("|")
      .map((f) => `<li>${escapeHtml(f.trim())}</li>`)
      .join("");
    const mail =
      `mailto:${S.cfg.contact_email}?subject=` +
      encodeURIComponent(t("pr.mailSubject", { plan: name }));
    return `
      <div class="plan${featured ? " featured" : ""}">
        <p class="plan-flag">${featured ? escapeHtml(t("pr.featured")) : "&nbsp;"}</p>
        <p class="plan-name">${escapeHtml(name)}</p>
        <p class="plan-price">
          <b>${escapeHtml(t(`pr.${id}.price`))}</b>
          <span>${escapeHtml(t(`pr.${id}.unit`))}</span>
        </p>
        <ul class="plan-features">${features}</ul>
        <a class="plan-cta${featured ? " primary" : ""}" href="${mail}">${escapeHtml(t(`pr.${id}.cta`))}</a>
      </div>`;
  }).join("");

  $("pricing-fine").innerHTML = t("pricing.fine")
    .split("|")
    .map((n) => `<li>${escapeHtml(n.trim())}</li>`)
    .join("");
}

// ---------------------------------------------------------------- engine
async function refreshEngine() {
  try {
    const h = await fetch("/api/health").then((r) => r.json());
    S.engine = h.engine;
  } catch (e) {
    S.engine = null;
  }
  renderEngineBadge();
}

function renderEngineBadge() {
  const el = $("engine-badge");
  if (S.engine === ENGINE_PRIMARY) {
    el.className = "engine-badge live";
    el.textContent = t("engine.live");
  } else if (S.engine === ENGINE_BASELINE) {
    el.className = "engine-badge reduced";
    el.textContent = t("engine.reduced");
  } else if (S.engine) {
    el.className = "engine-badge";
    el.textContent = t("engine.standby");
  } else {
    el.className = "engine-badge";
    el.textContent = t("engine.unavailable");
  }
}

// ---------------------------------------------------------------- samples
async function loadSamples() {
  try { S.samples = await fetch("/api/samples").then((r) => r.json()); }
  catch (e) { S.samples = []; }
  renderSampleList();
}

function sampleText(s, field) {
  // manifest.json carries `title` / `title_es` (and the same for description)
  const localized = s[field + "_" + getLang()];
  return localized || s[field] || "";
}

function renderSampleList() {
  const list = $("sample-list");
  if (!S.samples.length) {
    list.innerHTML = `<p class="panel-note">${t("p1.none")}</p>`;
    return;
  }
  list.innerHTML = "";
  S.samples.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "sample-btn" + (S.sampleMeta && S.sampleMeta.file === s.file ? " chosen" : "");
    b.type = "button";
    b.innerHTML =
      `<span class="sb-idx">${ROMAN[i] || i + 1}</span>` +
      `<span><b>${escapeHtml(sampleText(s, "title"))}</b>` +
      `<span>${escapeHtml(sampleText(s, "description"))}</span></span>`;
    b.onclick = () => {
      document.querySelectorAll(".sample-btn").forEach((x) => x.classList.remove("chosen"));
      b.classList.add("chosen");
      loadSample(s);
    };
    list.appendChild(b);
  });
}

async function loadSample(meta) {
  try {
    const text = await fetch(meta.url).then((r) => r.text());
    const file = new File([text], meta.file, { type: "text/csv" });
    await inspectFile(file, meta);
  } catch (e) {
    notify(t("err.sampleFetch"));
  }
}

// ---------------------------------------------------------------- load data
async function inspectFile(file, meta) {
  const status = $("data-status");
  status.innerHTML = `<p class="panel-note"><span class="spinner dark"></span>${t("status.reading")}</p>`;

  const fd = new FormData();
  fd.append("file", file);

  let res, body;
  try {
    res = await fetch("/api/inspect", { method: "POST", body: fd });
    body = await res.json();
  } catch (e) {
    status.innerHTML = "";
    notify(t("err.transmit"));
    return;
  }
  if (!res.ok) {
    status.innerHTML = "";
    notify(apiMessage(body));
    return;
  }

  S.data = body;
  S.fileName = file.name;
  S.sampleMeta = meta;

  renderDataStatus();
  populateControls(body, meta);
  $("config-card").hidden = false;
  $("config-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderDataStatus() {
  const b = S.data;
  const lang = getLang();
  const bits = [
    `<span>${t("status.file")} <b>${escapeHtml(S.fileName || "")}</b></span>`,
    `<span>${t("status.periods")} <b>${b.n_rows.toLocaleString(lang)}</b></span>`,
    `<span>${t("status.columns")} <b>${b.n_cols}</b></span>`,
    `<span>${t("status.numeric")} <b>${b.numeric_columns.length}</b></span>`,
  ];
  if (b.row_truncated) {
    bits.push(`<span class="flag">${t("status.rowsTrimmed", {
      kept: b.n_rows.toLocaleString(lang),
      total: b.original_rows.toLocaleString(lang),
    })}</span>`);
  }
  if (b.col_truncated) {
    bits.push(`<span class="flag">${t("status.colsTrimmed", { cols: S.cfg.max_columns })}</span>`);
  }
  if (b.reordered) {
    bits.push(`<span class="flag">${t("status.reordered")}</span>`);
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
      else if (typeof v === "number") v = v.toLocaleString(lang, { maximumFractionDigits: 3 });
      else v = escapeHtml(v);
      table += `<td>${v}</td>`;
    }
    table += "</tr>";
  }
  table += "</tbody></table></div>";

  $("data-status").innerHTML = `<div class="status-line">${bits.join("")}</div>${table}`;
}

function renderDateOptions() {
  const dc = $("date-col");
  const current = dc.value;
  dc.innerHTML = `<option value="">${t("p2.periodNone")}</option>`;
  for (const c of S.data.date_candidates) {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    dc.appendChild(o);
  }
  dc.value = current;
}

function populateControls(b, meta) {
  const tgt = $("target-col");
  tgt.innerHTML = "";
  for (const c of b.numeric_columns) {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    tgt.appendChild(o);
  }

  renderDateOptions();

  if (meta) {
    if (meta.target_col && b.numeric_columns.includes(meta.target_col)) tgt.value = meta.target_col;
    if (meta.date_col && b.date_candidates.includes(meta.date_col)) $("date-col").value = meta.date_col;
    if (meta.suggested_horizon) {
      $("horizon").value = Math.min(meta.suggested_horizon, S.cfg.max_horizon);
      setHorizonLabel();
    }
  }

  // Series that legitimately go below zero must not be clamped.
  const name = (meta && meta.target_col) || tgt.value || "";
  $("nonneg").checked = !isSignedSeries(name);

  updateModeHint();
}

function isSignedSeries(name) {
  return /temp|celsius|fahrenheit|return|delta|change|balance|margin|net|saldo|variac|rendim|resultado/i.test(name);
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
    notify(t("err.insufficient", { mode: t("err.mode." + mode), need, have: valid }));
    return;
  }

  const btn = $("run-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${t("p2.computing")}`;

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
    btn.disabled = false; btn.textContent = t("p2.run");
    notify(t("err.request"));
    return;
  }
  btn.disabled = false; btn.textContent = t("p2.run");

  if (!res.ok) { notify(apiMessage(body)); return; }

  const rem = res.headers.get("X-RateLimit-Remaining");
  if (rem !== null) {
    S.rate = { remaining: rem, limit: S.cfg.rate_limit_forecasts };
    renderRateInfo();
  }

  S.lastResult = { ...body, target, dateCol };
  renderResult(S.lastResult);
  refreshEngine();
}

function renderResult(r) {
  $("result-card").hidden = false;

  const tiles = (r.mode === "backtest" && r.metrics)
    ? [
        { v: r.metrics.mape != null ? r.metrics.mape.toFixed(2) + "%" : "—", k: t("m.mape"), accent: true },
        { v: fmtNum(r.metrics.mae), k: t("m.mae") },
        { v: fmtNum(r.metrics.rmse), k: t("m.rmse") },
        { v: r.metrics.coverage_80 + "%", k: t("m.coverage"), accent: true },
      ]
    : [
        { v: r.horizon, k: t("m.periods"), accent: true },
        { v: escapeHtml(r.target || "—"), k: t("m.series") },
        { v: "80%", k: t("m.interval") },
      ];

  const m = $("metrics");
  m.style.gridTemplateColumns = `repeat(${tiles.length}, 1fr)`;
  m.innerHTML = tiles
    .map((x) => `<div class="metric${x.accent ? " accent" : ""}"><div class="v">${x.v}</div><span class="k">${x.k}</span></div>`)
    .join("");

  renderChart(r);

  $("result-engine").textContent = t("p3.note." + r.mode);
}

// ---------------------------------------------------------------- chart
let chartInst = null;

/** Build the ECharts option object for a result. */
function chartOption(r) {
  setTipDigits(r);
  const H0 = r.history.length;
  const Hz = r.horizon;
  const total = H0 + Hz;
  const join = H0 - 1;                     // last observed point
  const joinY = r.history[H0 - 1];
  const labels = buildXLabels(r, total);

  const nulls = () => new Array(total).fill(null);

  // Bands are drawn as two stacked series each: an invisible floor plus the
  // span above it. Both start pinched at the last observed point so the fan
  // opens from the series rather than floating beside it.
  const lo80 = nulls(), sp80 = nulls(), lo60 = nulls(), sp60 = nulls();
  lo80[join] = joinY; sp80[join] = 0;
  lo60[join] = joinY; sp60[join] = 0;
  for (let h = 0; h < Hz; h++) {
    const i = H0 + h;
    lo80[i] = r.lower_80[h]; sp80[i] = r.upper_80[h] - r.lower_80[h];
    lo60[i] = r.lower_60[h]; sp60[i] = r.upper_60[h] - r.lower_60[h];
  }

  const observed = nulls();
  for (let i = 0; i < H0; i++) observed[i] = r.history[i];

  const projection = nulls();
  projection[join] = joinY;
  for (let h = 0; h < Hz; h++) projection[H0 + h] = r.point[h];

  let actual = null;
  if (r.actual) {
    actual = nulls();
    actual[join] = joinY;
    for (let h = 0; h < Hz; h++) actual[H0 + h] = r.actual[h];
  }

  const floor = (data, stack) => ({
    name: "__floor_" + stack, type: "line", stack, data,
    lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 },
    symbol: "none", silent: true, z: 1,
    tooltip: { show: false }, legendHoverLink: false,
  });
  const span = (data, stack, colour, z) => ({
    name: "__span_" + stack, type: "line", stack, data,
    lineStyle: { opacity: 0 }, areaStyle: { color: colour, opacity: 0.55 },
    symbol: "none", silent: true, z,
    tooltip: { show: false }, legendHoverLink: false,
  });

  const series = [
    floor(lo80, "b80"), span(sp80, "b80", C.band80, 1),
    floor(lo60, "b60"), span(sp60, "b60", C.band60, 2),
    {
      name: t("lg.observed"), type: "line", data: observed, z: 6,
      showSymbol: false, symbolSize: 7,
      lineStyle: { color: C.ink, width: 1.4 },
      itemStyle: { color: C.ink },
    },
    {
      name: t("lg.projection"), type: "line", data: projection, z: 7,
      showSymbol: false, symbolSize: 7,
      lineStyle: { color: C.projection, width: 1.9, type: "dashed" },
      itemStyle: { color: C.projection },
      markLine: {
        symbol: "none", silent: true, animation: false,
        lineStyle: { color: C.divider, type: [2, 4], width: 1 },
        label: {
          formatter: t(r.mode === "backtest" ? "chart.origin" : "chart.present"),
          position: "insideEndTop", color: C.inkFaint,
          fontFamily: FONT_SANS, fontSize: 10, fontWeight: 600,
        },
        data: [{ xAxis: join }],
      },
    },
  ];
  if (actual) {
    series.push({
      name: t("lg.actual"), type: "line", data: actual, z: 8,
      showSymbol: false, symbolSize: 7,
      lineStyle: { color: C.withheld, width: 1.9 },
      itemStyle: { color: C.withheld },
    });
  }

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { fontFamily: FONT_SANS },
    grid: { left: 68, right: 26, top: 40, bottom: 58, containLabel: false },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#FBF9F4",
      borderColor: C.rule,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: C.ink, fontFamily: FONT_SERIF, fontSize: 13 },
      axisPointer: { type: "line", lineStyle: { color: C.divider, width: 1, type: "dashed" } },
      formatter: (params) => {
        const shown = params.filter((p) => !String(p.seriesName).startsWith("__")
                                        && p.value !== null && p.value !== undefined);
        if (!shown.length) return "";
        const head = `<div style="font-family:${FONT_SANS};font-size:10px;letter-spacing:.12em;
                     text-transform:uppercase;color:${C.inkFaint};margin-bottom:6px">
                     ${shown[0].axisValueLabel}</div>`;
        const rows = shown.map((p) =>
          `<div style="display:flex;gap:14px;justify-content:space-between">
             <span>${p.marker} ${p.seriesName}</span>
             <b style="font-variant-numeric:tabular-nums">${fmtTooltip(p.value)}</b>
           </div>`).join("");
        // Interval bounds for the projected periods, read straight off the result.
        const h = params[0].dataIndex - H0;
        let band = "";
        if (h >= 0 && h < Hz) {
          band = `<div style="margin-top:7px;padding-top:7px;border-top:1px solid ${C.rule};
                   font-size:12px;color:${C.inkFaint}">
                   ${t("lg.i60")}: ${fmtTooltip(r.lower_60[h])} – ${fmtTooltip(r.upper_60[h])}<br/>
                   ${t("lg.i80")}: ${fmtTooltip(r.lower_80[h])} – ${fmtTooltip(r.upper_80[h])}
                 </div>`;
        }
        return head + rows + band;
      },
    },
    legend: {
      data: series.filter((x) => !x.name.startsWith("__")).map((x) => x.name),
      bottom: 0, icon: "roundRect", itemWidth: 14, itemHeight: 4, itemGap: 22,
      textStyle: {
        color: C.ink3, fontFamily: FONT_SANS, fontSize: 10,
        fontWeight: 600, padding: [0, 0, 0, 4],
      },
    },
    toolbox: {
      right: 8, top: 0, itemGap: 12,
      iconStyle: { borderColor: C.inkFaint, borderWidth: 1.2 },
      emphasis: { iconStyle: { borderColor: C.green } },
      feature: {
        dataZoom: {
          yAxisIndex: "none",
          title: { zoom: t("chart.zoomIn"), back: t("chart.zoomReset") },
        },
        restore: { title: t("chart.zoomReset") },
      },
    },
    dataZoom: [
      { type: "inside", xAxisIndex: 0, zoomOnMouseWheel: true, moveOnMouseMove: false },
    ],
    xAxis: {
      type: "category", data: labels, boundaryGap: false,
      axisLine: { lineStyle: { color: C.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: C.inkFaint, fontFamily: FONT_SANS, fontSize: 10,
        fontWeight: 600, hideOverlap: true,
      },
    },
    yAxis: {
      type: "value", scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: C.grid } },
      axisLabel: {
        color: C.inkFaint, fontFamily: FONT_SANS, fontSize: 10,
        fontWeight: 600, formatter: (v) => fmtNum(v),
      },
    },
    series,
  };
}

function renderChart(r) {
  const el = $("chart");
  if (!chartInst) chartInst = echarts.init(el, null, { renderer: "canvas" });
  chartInst.setOption(chartOption(r), true);
  chartInst.resize();
  $("chart-explain").textContent = t("chart.explain");
  $("chart-interact").textContent = t("chart.interact");
}

/** Save the current chart as a raster or vector file. */
function exportChart(kind) {
  if (!chartInst || !S.lastResult) return;
  const name = `meridian_${(S.lastResult.target || "series").replace(/\W+/g, "_")}`;
  if (kind === "png") {
    triggerDownload(
      chartInst.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#FBF9F4" }),
      name + ".png");
    return;
  }
  // SVG: render the same option through an off-screen SVG instance, so the
  // export is true vector rather than a rasterised canvas.
  const holder = document.createElement("div");
  holder.style.cssText = "position:absolute;left:-99999px;top:0;width:1200px;height:460px";
  document.body.appendChild(holder);
  try {
    const tmp = echarts.init(holder, null, { renderer: "svg", width: 1200, height: 460 });
    const opt = chartOption(S.lastResult);
    opt.toolbox = { show: false };
    opt.backgroundColor = "#FBF9F4";
    tmp.setOption(opt, true);
    const svg = tmp.renderToSVGString();
    tmp.dispose();
    triggerDownload("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), name + ".svg");
  } finally {
    holder.remove();
  }
}

function triggerDownload(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
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

function fmtNum(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e4) return (v / 1e3).toFixed(1) + "k";
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

/** Decimals to show, decided once per series so a tooltip never mixes
 *  "1052" with "857,99" — which reads as a data error, not a rounding rule. */
let tipDigits = 2;
function setTipDigits(r) {
  let max = 0;
  for (const v of r.history) if (Math.abs(v) > max) max = Math.abs(v);
  for (const v of r.point) if (Math.abs(v) > max) max = Math.abs(v);
  tipDigits = max >= 1000 ? 0 : max >= 10 ? 2 : 4;
}

/** Tooltips show the figure in full, not an axis abbreviation. */
function fmtTooltip(v) {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString(getLang(), {
    minimumFractionDigits: tipDigits, maximumFractionDigits: tipDigits,
  });
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
  $("mode-hint").textContent = t("p2.hint." + mode);
}

function wireEvents() {
  $("horizon").addEventListener("input", setHorizonLabel);
  $("run-btn").addEventListener("click", run);
  $("download-btn").addEventListener("click", downloadCSV);
  $("png-btn").addEventListener("click", () => exportChart("png"));
  $("svg-btn").addEventListener("click", () => exportChart("svg"));
  $("target-col").addEventListener("change", (e) => {
    $("nonneg").checked = !isSignedSeries(e.target.value);
  });

  document.querySelectorAll("#lang-toggle button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.lang === getLang()) return;
      setLang(b.dataset.lang);
      applyLanguage();
    })
  );

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
    rt = setTimeout(() => { if (chartInst) chartInst.resize(); }, 120);
  });
}

function checkAndInspect(file) {
  if (file.size > S.cfg.max_file_size_bytes) {
    notify(t("err.tooLargeClient", { mb: (S.cfg.max_file_size_bytes / 1048576).toFixed(0) }));
    return;
  }
  document.querySelectorAll(".sample-btn").forEach((x) => x.classList.remove("chosen"));
  inspectFile(file, null);
}

boot();
