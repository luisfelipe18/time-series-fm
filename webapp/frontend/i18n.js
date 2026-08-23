"use strict";

/* Meridian — bilingual copy.
   Spanish is the house language; English is the alternate.
   Placeholders use {name} and are filled by t(key, params). */

const I18N = {
  es: {
    "lang.code": "es",
    "meta.title": "Meridian — Demostración privada",
    "meta.description":
      "Meridian es un motor de proyección propietario, desarrollado internamente. Envíe una serie y reciba una proyección calibrada con la incertidumbre declarada.",

    "brand.suffix": "Proyecciones",
    "lang.switch": "Cambiar a inglés",

    "engine.live": "Motor · Núcleo · operativo",
    "engine.reduced": "Motor · capacidad reducida",
    "engine.standby": "Motor · en espera",
    "engine.unavailable": "Motor · no disponible",

    "hero.eyebrow": "Demostración privada",
    "hero.title": "El trimestre que viene,<br /><em>cuantificado.</em>",
    "hero.deck":
      "Meridian es un motor de proyección propietario, desarrollado y entrenado internamente por nuestro equipo de investigación. Envíe una serie propia y reciba una proyección calibrada — con la incertidumbre declarada de forma explícita, no oculta — en segundos.",

    "cred.method.t": "Método",
    "cred.method.d": "Probabilístico, atento a la distribución",
    "cred.prep.t": "Preparación",
    "cred.prep.d": "Ninguna. No requiere entrenamiento",
    "cred.deliver.t": "Entrega",
    "cred.deliver.d": "Proyección con confianza declarada",

    "p1.title": "Seleccione una serie",
    "p1.limits":
      "Esta demostración admite hasta {rows} períodos y {cols} columnas por archivo, con un horizonte de {horizon} períodos.",
    "p1.prepared": "Conjuntos preparados",
    "p1.own": "O envíe el suyo",
    "p1.dz.title": "Deposite un archivo CSV",
    "p1.dz.sub": "Arrástrelo aquí, o <u>selecciónelo desde su dispositivo</u>",
    "p1.hint":
      "Valores separados por comas · no más de {mb} MB · los archivos más largos se recortan a los períodos más recientes.",
    "p1.none": "No hay conjuntos preparados disponibles.",

    "status.file": "Archivo",
    "status.periods": "Períodos",
    "status.columns": "Columnas",
    "status.numeric": "Series numéricas",
    "status.rowsTrimmed": "Recortado a los {kept} períodos más recientes de {total}",
    "status.colsTrimmed": "Reducido a las primeras {cols} columnas",
    "status.reordered": "Archivo en orden inverso: reordenado del m\u00e1s antiguo al m\u00e1s reciente",
    "status.reading": "Leyendo y validando el archivo…",

    "p2.title": "Especifique la proyección",
    "p2.note": "Elija la serie a proyectar y hasta dónde mirar hacia adelante.",
    "p2.target": "Serie a proyectar",
    "p2.period": "Columna de período",
    "p2.optional": "opcional",
    "p2.periodNone": "Usar número de período",
    "p2.horizon": "Horizonte &nbsp;·&nbsp; <b id=\"horizon-val\">{h}</b> períodos adelante",
    "p2.method": "Método de inspección",
    "p2.mode.future": "Proyección",
    "p2.mode.futureSub": "Extender la serie hacia adelante",
    "p2.mode.backtest": "Validación",
    "p2.mode.backtestSub": "Retener historia reciente y puntuarla",
    "p2.nonneg":
      "Esta serie no puede caer por debajo de cero <i>(volúmenes, ingresos, recuentos)</i>",
    "p2.run": "Calcular proyección",
    "p2.computing": "Calculando",
    "p2.hint.future":
      "La proyección se extiende más allá del registro. Los intervalos se ensanchan con la distancia, como corresponde.",
    "p2.hint.backtest":
      "La validación es la prueba honesta: el motor nunca ve los períodos retenidos antes de proyectarlos.",

    "p3.title": "La proyección",
    "p3.note.future":
      "Proyectado desde la serie completa. La región sombreada indica el rango dentro del cual se espera que caiga la cifra.",
    "p3.note.backtest":
      "Se retuvo historia reciente del motor, se proyectó, y luego se puntuó contra lo que realmente ocurrió.",
    "p3.download": "Descargar proyección · CSV",

    "m.mape": "Error % abs. medio",
    "m.mae": "Error abs. medio",
    "m.rmse": "Raíz del error cuad. medio",
    "m.coverage": "Cobertura del intervalo 80%",
    "m.periods": "Períodos proyectados",
    "m.series": "Serie",
    "m.interval": "Intervalo declarado",

    "lg.observed": "Observado",
    "lg.projection": "Proyección",
    "lg.i60": "Intervalo 60%",
    "lg.i80": "Intervalo 80%",
    "lg.actual": "Real, retenido",
    "chart.origin": "ORIGEN",
    "chart.present": "PRESENTE",
    "chart.explain":
      "La banda interior recoge el 60% de los desenlaces probables; la exterior, el 80%. Ambas se ensanchan con la distancia: cuanto más lejos el período, menos certeza sobre la cifra.",
    "chart.interact":
      "Pase el cursor para leer cada período · arrastre sobre el gráfico para ampliar, o use los controles de la esquina superior · descargue el gráfico con los botones inferiores.",
    "chart.zoomIn": "Ampliar",
    "chart.zoomReset": "Restablecer la vista",
    "chart.savePng": "Descargar PNG",
    "chart.saveSvg": "Descargar SVG",

    // Tarifas. Las viñetas de cada plan van en una sola clave, separadas por "|".
    "pricing.title": "Tarifas",
    "pricing.note":
      "El servicio se presta por API. Se cobra por proyección entregada, sin costo de instalación ni de puesta en marcha.",

    "pr.trial.name": "Evaluación",
    "pr.trial.price": "Sin costo",
    "pr.trial.unit": "14 días",
    "pr.trial.f":
      "500 proyecciones|Una clave de API|Contexto de 512 períodos, horizonte 30|Documentación y ejemplos de integración|Sin datos de tarjeta",
    "pr.trial.cta": "Solicitar acceso",

    "pr.portfolio.name": "Cartera",
    "pr.portfolio.price": "US$ 250",
    "pr.portfolio.unit": "al mes",
    "pr.portfolio.f":
      "5.000 proyecciones al mes|Tres claves de API|Contexto de 2.048 períodos, horizonte 128|Excedente a US$ 0,04 por proyección|Atención por correo, dos días hábiles",
    "pr.portfolio.cta": "Contratar",

    "pr.institutional.name": "Institucional",
    "pr.institutional.price": "US$ 1.000",
    "pr.institutional.unit": "al mes",
    "pr.institutional.f":
      "50.000 proyecciones al mes|Claves ilimitadas|Contexto de 16.384 períodos, horizonte 512|Variables explicativas: precio, promoción, festivos|Vigilancia con aviso por webhook|Excedente a US$ 0,02 por proyección|Disponibilidad 99,5% · atención en 8 horas hábiles",
    "pr.institutional.cta": "Contratar",

    "pr.bespoke.name": "A medida",
    "pr.bespoke.price": "Desde US$ 4.000",
    "pr.bespoke.unit": "al mes",
    "pr.bespoke.f":
      "Volumen acordado por contrato|Calibración dedicada sobre su propia historia|Analista designado y revisión trimestral|Disponibilidad 99,9% con penalización|Residencia de datos y anexos contractuales",
    "pr.bespoke.cta": "Conversemos",

    "pr.featured": "Más contratado",
    "pricing.fine":
      "Se cobra una proyección por cada serie devuelta: una llamada con 300 series consume 300 proyecciones.|Al contratar por año se abonan diez meses.|Precios en dólares estadounidenses, sin impuestos.|El servicio se entrega exclusivamente por API. El motor no se licencia, no se exporta y no se instala en infraestructura del cliente.",
    "pr.mailSubject": "Consulta — plan {plan}",

    "eng.title": "Contratación",
    "eng.note":
      "Esta demostración está deliberadamente limitada. Un encargo para cliente no lo está.",
    "eng.scale.t": "Escala de cartera",
    "eng.scale.d": "Miles de series proyectadas en una sola instrucción, según calendario.",
    "eng.vars.t": "Variables explicativas",
    "eng.vars.d":
      "Precio, promoción, festivos y clima incorporados directamente al modelo.",
    "eng.watch.t": "Vigilancia permanente",
    "eng.watch.d":
      "Aviso en el momento en que una cifra se aparta de su intervalo esperado.",
    "eng.integr.t": "Integración de sistemas",
    "eng.integr.d":
      "Un punto de acceso privado a su almacén de datos, contabilidad o plataforma de comercio.",
    "eng.calib.t": "Calibración dedicada",
    "eng.calib.d":
      "El motor ajustado sobre su propia historia, reservado privadamente a su cuenta.",
    "eng.advisory.t": "Asesoría",
    "eng.advisory.d":
      "Un analista designado, responsable de las cifras que usted presenta a su directorio.",
    "eng.cta": "Solicitar una presentación",
    "eng.ctaNote": "Las consultas se responden personalmente, dentro de un día hábil.",
    "eng.mailSubject": "Consulta — encargo con {brand}",

    "footer.legal":
      "Meridian opera un motor de proyección propietario. Las cifras producidas en esta demostración son ilustrativas y no constituyen asesoría de inversión, contable ni actuarial. Todos los derechos reservados.",

    "rate.remaining":
      "Quedan {remaining} de {limit} cálculos de demostración en esta hora.",

    // Notices
    "err.sampleFetch": "No se pudo recuperar el conjunto preparado.",
    "err.transmit": "No se pudo transmitir el archivo. Inténtelo de nuevo.",
    "err.read": "No se pudo leer el archivo.",
    "err.request": "No se pudo completar la solicitud. Inténtelo de nuevo.",
    "err.projection": "No se pudo producir la proyección.",
    "err.tooLargeClient":
      "El archivo excede el límite de {mb} MB de esta demostración.",
    "err.insufficient":
      "Esta {mode} requiere al menos {need} períodos; la serie tiene {have}. Acorte el horizonte.",
    "err.mode.future": "proyección",
    "err.mode.backtest": "validación",

    // Server error codes
    "srv.FILE_TOO_LARGE": "El archivo excede el límite de {mb} MB de esta demostración.",
    "srv.EMPTY_FILE": "El archivo está vacío.",
    "srv.CSV_PARSE": "No se pudo interpretar el CSV. Verifique el formato.",
    "srv.CSV_EMPTY": "El archivo no contiene filas ni columnas.",
    "srv.NO_NUMERIC": "No se encontraron columnas numéricas para proyectar.",
    "srv.HORIZON_TOO_LARGE":
      "El horizonte excede el máximo de {max} períodos de esta demostración.",
    "srv.TOO_MANY_POINTS":
      "La serie excede el máximo de {max} períodos de esta demostración.",
    "srv.TOO_FEW_POINTS":
      "Se requieren al menos {min} períodos válidos; se recibieron {got}.",
    "srv.BACKTEST_TOO_SHORT":
      "La validación requiere al menos {need} períodos para un horizonte de {horizon}. Acorte el horizonte o use una serie más larga.",
    "srv.RATE_LIMITED":
      "Se alcanzó el límite de la demostración ({limit} cálculos por {minutes} min). Reintente en {retry} s, o escríbanos para obtener acceso.",
  },

  en: {
    "lang.code": "en",
    "meta.title": "Meridian — Private Demonstration",
    "meta.description":
      "Meridian is a proprietary forecasting engine developed in-house. Submit a series and receive a calibrated projection with quantified uncertainty.",

    "brand.suffix": "Forecasting",
    "lang.switch": "Switch to Spanish",

    "engine.live": "Engine · Core · operational",
    "engine.reduced": "Engine · reduced capacity",
    "engine.standby": "Engine · on standby",
    "engine.unavailable": "Engine · unavailable",

    "hero.eyebrow": "Private demonstration",
    "hero.title": "The quarter ahead,<br /><em>quantified.</em>",
    "hero.deck":
      "Meridian is a proprietary forecasting engine developed and trained in-house by our research team. Submit a series of your own and receive a calibrated projection — with the uncertainty stated explicitly, not hidden — in seconds.",

    "cred.method.t": "Method",
    "cred.method.d": "Probabilistic, distribution-aware",
    "cred.prep.t": "Preparation",
    "cred.prep.d": "None. No model training required",
    "cred.deliver.t": "Deliverable",
    "cred.deliver.d": "Projection with stated confidence",

    "p1.title": "Select a series",
    "p1.limits":
      "This demonstration accepts up to {rows} periods and {cols} columns per file, with a horizon of {horizon} periods.",
    "p1.prepared": "Prepared datasets",
    "p1.own": "Or submit your own",
    "p1.dz.title": "Deposit a CSV file",
    "p1.dz.sub": "Drag it here, or <u>select from your device</u>",
    "p1.hint":
      "Comma-separated values · not exceeding {mb} MB · longer files are trimmed to the most recent periods.",
    "p1.none": "No prepared datasets are available.",

    "status.file": "File",
    "status.periods": "Periods",
    "status.columns": "Columns",
    "status.numeric": "Numeric series",
    "status.rowsTrimmed": "Trimmed to the most recent {kept} of {total}",
    "status.colsTrimmed": "Reduced to the first {cols} columns",
    "status.reordered": "File was newest-first: reordered from oldest to most recent",
    "status.reading": "Reading and validating the file…",

    "p2.title": "Specify the projection",
    "p2.note": "Choose the series to project and how far ahead to look.",
    "p2.target": "Series to project",
    "p2.period": "Period column",
    "p2.optional": "optional",
    "p2.periodNone": "Use period number",
    "p2.horizon": "Horizon &nbsp;·&nbsp; <b id=\"horizon-val\">{h}</b> periods ahead",
    "p2.method": "Method of inspection",
    "p2.mode.future": "Projection",
    "p2.mode.futureSub": "Extend the series forward",
    "p2.mode.backtest": "Validation",
    "p2.mode.backtestSub": "Withhold recent history and score it",
    "p2.nonneg":
      "This series cannot fall below zero <i>(volumes, revenue, counts)</i>",
    "p2.run": "Compute projection",
    "p2.computing": "Computing",
    "p2.hint.future":
      "The projection extends beyond the record. Intervals widen with distance, as they should.",
    "p2.hint.backtest":
      "Validation is the honest test: the engine never sees the withheld periods before projecting them.",

    "p3.title": "The projection",
    "p3.note.future":
      "Projected forward from the full series. The shaded region states the range within which the figure is expected to fall.",
    "p3.note.backtest":
      "Recent history was withheld from the engine, projected, then scored against what actually occurred.",
    "p3.download": "Download projection · CSV",

    "m.mape": "Mean abs. % error",
    "m.mae": "Mean abs. error",
    "m.rmse": "Root mean sq. error",
    "m.coverage": "80% interval coverage",
    "m.periods": "Periods projected",
    "m.series": "Series",
    "m.interval": "Interval reported",

    "lg.observed": "Observed",
    "lg.projection": "Projection",
    "lg.i60": "60% interval",
    "lg.i80": "80% interval",
    "lg.actual": "Actual, withheld",
    "chart.origin": "ORIGIN",
    "chart.present": "PRESENT",
    "chart.explain":
      "The inner band holds 60% of likely outcomes; the outer one, 80%. Both widen with distance: the further the period, the less certain the figure.",
    "chart.interact":
      "Hover to read any period · drag across the chart to zoom, or use the controls in the top corner · download the chart with the buttons below.",
    "chart.zoomIn": "Zoom",
    "chart.zoomReset": "Reset the view",
    "chart.savePng": "Download PNG",
    "chart.saveSvg": "Download SVG",

    // Pricing. Each plan's bullets live in one key, separated by "|".
    "pricing.title": "Terms",
    "pricing.note":
      "The service is delivered through our API. You are billed per projection returned — no installation fee, no onboarding charge.",

    "pr.trial.name": "Evaluation",
    "pr.trial.price": "No charge",
    "pr.trial.unit": "14 days",
    "pr.trial.f":
      "500 projections|One API key|512-period context, horizon 30|Documentation and integration examples|No card details required",
    "pr.trial.cta": "Request access",

    "pr.portfolio.name": "Portfolio",
    "pr.portfolio.price": "US$ 250",
    "pr.portfolio.unit": "per month",
    "pr.portfolio.f":
      "5,000 projections per month|Three API keys|2,048-period context, horizon 128|Overage at US$ 0.04 per projection|Email support, two business days",
    "pr.portfolio.cta": "Engage",

    "pr.institutional.name": "Institutional",
    "pr.institutional.price": "US$ 1,000",
    "pr.institutional.unit": "per month",
    "pr.institutional.f":
      "50,000 projections per month|Unlimited keys|16,384-period context, horizon 512|Explanatory variables: price, promotion, holidays|Surveillance with webhook notice|Overage at US$ 0.02 per projection|99.5% availability · 8 business-hour response",
    "pr.institutional.cta": "Engage",

    "pr.bespoke.name": "Bespoke",
    "pr.bespoke.price": "From US$ 4,000",
    "pr.bespoke.unit": "per month",
    "pr.bespoke.f":
      "Volume agreed by contract|Dedicated calibration on your own history|Named analyst and quarterly review|99.9% availability with remedy|Data residency and contractual schedules",
    "pr.bespoke.cta": "Let us talk",

    "pr.featured": "Most engaged",
    "pricing.fine":
      "One projection is billed for each series returned: a call carrying 300 series consumes 300 projections.|Engage annually and ten months are payable.|Prices in United States dollars, exclusive of tax.|The service is delivered exclusively through the API. The engine is not licensed, not exported, and not installed on client infrastructure.",
    "pr.mailSubject": "Enquiry — {plan} terms",

    "eng.title": "Engagement",
    "eng.note":
      "This demonstration is deliberately constrained. A client engagement is not.",
    "eng.scale.t": "Portfolio scale",
    "eng.scale.d": "Thousands of series projected in a single instruction, on schedule.",
    "eng.vars.t": "Explanatory variables",
    "eng.vars.d":
      "Price, promotion, holiday and weather effects entered directly into the model.",
    "eng.watch.t": "Standing surveillance",
    "eng.watch.d": "Notification the moment a figure departs its expected interval.",
    "eng.integr.t": "Systems integration",
    "eng.integr.d":
      "A private endpoint into your warehouse, ledger or commerce platform.",
    "eng.calib.t": "Dedicated calibration",
    "eng.calib.d":
      "The engine tuned against your own history, held privately to your account.",
    "eng.advisory.t": "Advisory",
    "eng.advisory.d":
      "A named analyst accountable for the figures you present to your board.",
    "eng.cta": "Request an introduction",
    "eng.ctaNote": "Enquiries are answered personally, within one business day.",
    "eng.mailSubject": "Enquiry — {brand} engagement",

    "footer.legal":
      "Meridian operates a proprietary forecasting engine. Figures produced in this demonstration are illustrative and are not investment, accounting or actuarial advice. All rights reserved.",

    "rate.remaining":
      "{remaining} of {limit} demonstration computations remain this hour.",

    "err.sampleFetch": "The prepared dataset could not be retrieved.",
    "err.transmit": "The file could not be transmitted. Please try again.",
    "err.read": "The file could not be read.",
    "err.request": "The request could not be completed. Please try again.",
    "err.projection": "The projection could not be produced.",
    "err.tooLargeClient":
      "The file exceeds the {mb} MB limit of this demonstration.",
    "err.insufficient":
      "This {mode} requires at least {need} periods; the series holds {have}. Please shorten the horizon.",
    "err.mode.future": "projection",
    "err.mode.backtest": "validation",

    "srv.FILE_TOO_LARGE": "The file exceeds the {mb} MB limit of this demonstration.",
    "srv.EMPTY_FILE": "The file is empty.",
    "srv.CSV_PARSE": "The CSV could not be parsed. Please check its format.",
    "srv.CSV_EMPTY": "The file contains no rows or columns.",
    "srv.NO_NUMERIC": "No numeric columns were found to project.",
    "srv.HORIZON_TOO_LARGE":
      "The horizon exceeds this demonstration's maximum of {max} periods.",
    "srv.TOO_MANY_POINTS":
      "The series exceeds this demonstration's maximum of {max} periods.",
    "srv.TOO_FEW_POINTS":
      "At least {min} valid periods are required; {got} were received.",
    "srv.BACKTEST_TOO_SHORT":
      "Validation requires at least {need} periods for a horizon of {horizon}. Shorten the horizon or use a longer series.",
    "srv.RATE_LIMITED":
      "The demonstration limit was reached ({limit} computations per {minutes} min). Retry in {retry}s, or write to us for access.",
  },
};

const LANG_KEY = "meridian.lang";
let LANG = "es";

function getLang() { return LANG; }

function setLang(lang) {
  LANG = I18N[lang] ? lang : "es";
  try { localStorage.setItem(LANG_KEY, LANG); } catch (e) { /* private mode */ }
  document.documentElement.lang = LANG;
}

/**
 * Resolve the starting language, in order of authority:
 *   1. what this visitor last chose (their toggle is remembered)
 *   2. the site default from DEMO_DEFAULT_LANG
 *   3. the browser language — only when the site opts in with
 *      DEMO_RESPECT_BROWSER_LANG=1, since an explicitly configured
 *      default should not be overridden by the visitor's locale
 */
function initLang(siteDefault, respectBrowser) {
  let stored = null;
  try { stored = localStorage.getItem(LANG_KEY); } catch (e) {}
  if (stored && I18N[stored]) { setLang(stored); return; }

  if (respectBrowser) {
    const nav = (navigator.language || "").slice(0, 2).toLowerCase();
    if (I18N[nav]) { setLang(nav); return; }
  }
  setLang(I18N[siteDefault] ? siteDefault : "es");
}

function t(key, params) {
  let s = (I18N[LANG] && I18N[LANG][key]) ?? (I18N.en[key] ?? key);
  if (params) {
    for (const k of Object.keys(params)) {
      s = s.split("{" + k + "}").join(String(params[k]));
    }
  }
  return s;
}

/** Apply translations to every [data-i18n] / [data-i18n-html] node. */
function applyStaticTranslations(root) {
  (root || document).querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  (root || document).querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });
  document.title = t("meta.title");
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", t("meta.description"));
}
