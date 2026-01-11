// =======================
// Paths
// =======================
const GEO_PATH = "https://raw.githubusercontent.com/leakyMirror/map-of-europe/master/GeoJSON/europe.geojson";
const PROD_PATH = "./data/electricity-prod-source-stacked.csv";
const TRADE_PATH = "./data/energy-imports-and-exports-energy-use.csv";
const CONSO_PATH = "./data/primary-energy-cons.csv";
const POP_PATH   = "./data/population-with-un-projections.csv";



// const CONSO_PATH = "./data/conso.csv"; // country_iso3,year,conso

// =======================
// DOM
// =======================
const svg = d3.select("#map");
const tooltip = d3.select("#tooltip");
const statusEl = d3.select("#status");

const metricSelect = d3.select("#metric");
const yearSlider = d3.select("#year");
const yearLabel = d3.select("#yearLabel");
const legendEl = d3.select("#legend");
const metricDescEl = d3.select("#metricDesc");



// =======================
// Globals
// =======================
let geo = null;

// Annual data: key = `${ISO3}_${year}` -> row
let metricsIndex = new Map();

// Triennial data: key = `${ISO3}_${startYear}` -> row
let triMetricsIndex = new Map();
let triYears = [];            // list of startYears sorted
let currentTriIndex = 0;      // slider index (0..triYears.length-1)

let currentMetric = metricSelect.property("value");

let hoveredFeature = null;
let lastMouseEvent = null;

let hasShownPanHint = false;


// Domains (fixes scaling across time)
let globalDomains = {
  ratio: [0, 1], // ratio = % décarbonné (0..1)
  trade: [-100, 100], // net imports (export<0 / import>0) borné pour comparabilité

  conso: null
};

// Projection
const projection = d3.geoMercator();
const path = d3.geoPath(projection);
const g = svg.append("g");

function ensureHatchPattern() {
  const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");

  if (!defs.select("#hatch").empty()) return; // déjà présent

  const hatch = defs.append("pattern")
    .attr("id", "hatch")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 8)
    .attr("height", 8)
    .attr("patternTransform", "rotate(45)");

  hatch.append("rect")
    .attr("width", 8)
    .attr("height", 8)
    .attr("fill", "#efefef");

  hatch.append("line")
    .attr("x1", 0).attr("y1", 0)
    .attr("x2", 0).attr("y2", 8)
    .attr("stroke", "#c7c7c7")
    .attr("stroke-width", 3);
}


function enableZoom() {
  const wrap = d3.select(".viz-wrap");

  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[-200, -200], [2000, 2000]])
    .on("start", () => {
      // Petit feedback visuel : curseur "grabbing"
      wrap.classed("is-dragging", true);
    })
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    })
    .on("end", () => {
      wrap.classed("is-dragging", false);
    });

  svg.call(zoom);

  // Optionnel : désactiver le double-clic qui zoom
  // svg.on("dblclick.zoom", null);
}
  

// =======================
// Helpers
// =======================
function keyOf(iso3, yearOrStart) {
  return `${iso3}_${yearOrStart}`;
}

// Europe GeoJSON fourni : feature.properties.ISO3
function getIso3(feature) {
  return feature?.properties?.ISO3;
}

function formatNumber(x) {
  if (x == null || Number.isNaN(x)) return "N/A";
  return d3.format(",.2f")(x);
}

function formatTrade(x) {
  if (x == null || Number.isNaN(x)) return "N/A";
  return d3.format("+.1f")(x) + " %";
}


function metricTitle(metric) {
  if (metric === "ratio") return "Ratio décarbonné / décarbonné + carbonné";
  if (metric === "trade") return "Importations nettes (export<0 / import>0)";
  if (metric === "conso") return "Consommation / habitant";
  return metric;
}

function updateDescription(metric) {
  if (metric === "ratio") {
    metricDescEl.html(`
      <div><b>Part de production décarbonée</b> dans la production totale (décarbonné + carbonné) des pays européens.</div>
      <div class="muted">
        <span class="swatch hatch"></span> pays sans renseignement pour la période choisie.
      </div>
    `);
    return;
  }

  if (metric === "trade") {
    metricDescEl.html(`
      <div><b>Dépendance énergétique</b> (importations nettes, valeur signée).</div>
      <div class="muted">
        Vert = exportateur net (&lt;0) • Bleu = autosuffisant (0) • Rouge = dépendant des importations (&gt;0) •
        <span class="swatch hatch"></span> données manquantes.
      </div>
    `);
    return;
  }

  if (metric === "conso") {
    metricDescEl.html(`
      <div><b>Consommation d’énergie primaire par habitant</b>.</div>
      <div class="muted">
        Exprimée en kWh par habitant et par an • 
        <span class="swatch hatch"></span> données manquantes.
      </div>
    `);
    return;
  }

  metricDescEl.html(`
    <div>Indicateur sélectionné : <b>${metric}</b></div>
    <div class="muted"><span class="swatch hatch"></span> données manquantes.</div>
  `);
}

  




// Triennal helpers
function triLabel(startYear) {
  return `${startYear}–${startYear + 2}`;
}

// aligne les périodes sur la première année du dataset (ex: 1985 => 1985–1987)
function triStartYearFromMin(year, minYear) {
  return year - ((year - minYear) % 3);
}

// =======================
// Color scales
// =======================
function buildColorScale(metric, values, forcedDomain = null) {
  const clean = values.filter(v => v != null && !Number.isNaN(v));

  if (clean.length === 0) {
    return { color: () => "#eee", domain: [0, 1], legend: { type: "none" } };
  }

  if (metric === "trade") {
    const maxAbs = forcedDomain
      ? Math.max(Math.abs(forcedDomain[0]), Math.abs(forcedDomain[1]))
      : d3.max(clean, v => Math.abs(v));

      const color = d3.scaleDiverging()
      .domain([-maxAbs, 0, maxAbs])
      .interpolator(t => {
        // t ∈ [0,1] : 0 = -maxAbs, 0.5 = 0, 1 = +maxAbs
        if (t < 0.5) {
          // exportateur (négatif) : vert -> bleu
          return d3.interpolateRgb("#2ca02c", "#1f77b4")(t / 0.5);
        }
        // importateur (positif) : bleu -> rouge
        return d3.interpolateRgb("#1f77b4", "#cf0a1d")((t - 0.5) / 0.5);
      });
    

    return { color, domain: [-maxAbs, maxAbs], legend: { type: "tri-diverging" } };
  }
  

  const domain = forcedDomain || d3.extent(clean);

  const interpolator =
    (metric === "conso")
      ? (t => d3.interpolateRgb("#5a9d47", "#cf0a1d")(t))  // vert -> rouge (conso)
      : (t => d3.interpolateRgb("#cf0a1d", "#5a9d47")(t)); // rouge -> vert (ratio)

  const color = d3.scaleSequential()
    .domain(domain)
    .interpolator(interpolator);

  return { color, domain, legend: { type: "sequential" } };
}

// =======================
// Legend
// =======================
function updateLegend(metric, scaleInfo) {
  const [dmin, dmax] = scaleInfo.domain;
  legendEl.html("");

  legendEl.append("div")
    .attr("class", "legend-title")
    .text(metricTitle(metric));

  const bar = legendEl.append("div")
    .attr("class", "legend-row")
    .append("div")
    .attr("class", "legend-bar");

  if (scaleInfo.legend.type === "diverging") {
    bar.style("background", "linear-gradient(90deg, #c0392b, #f7f7f7, #2980b9)");
  } else if (scaleInfo.legend.type === "tri-diverging") {
    bar.style("background", "linear-gradient(90deg, #cf0a1d, #1f77b4, #2ca02c)");
  } else if (scaleInfo.legend.type === "sequential") {
    if (metric === "conso") {
      bar.style("background", "linear-gradient(90deg, #1a9850, #d73027)"); // vert -> rouge
    } else {
      bar.style("background", "linear-gradient(90deg, #d73027, #1a9850)"); // rouge -> vert
    }
  } else {
    bar.style("background", "#eee");
  }

  const fmt = (metric === "ratio")
    ? d3.format(".0%")
    : (metric === "trade")
      ? (x => (x == null || Number.isNaN(x) ? "N/A" : (d3.format("+.0f")(x) + " %")))
      : formatNumber;

  const mm = legendEl.append("div").attr("class", "legend-minmax");
  mm.append("span").text(fmt(dmin));
  mm.append("span").text(fmt(dmax));

  legendEl.append("div")
    .style("margin-top", "0.5rem")
    .style("color", "var(--text-muted, #666)")
    .style("font-size", "0.85rem")
    .text("Hachuré = données manquantes pour la période");

  if (metric === "trade") {
    legendEl.append("div")
      .style("margin-top", "0.35rem")
      .style("color", "var(--text-muted, #666)")
      .style("font-size", "0.85rem")
      .text("Vert = exportateur net • Bleu = autosuffisant • Rouge = dépendant des importations");
  }
}

// =======================
// Tooltip
// =======================
function showTooltip(event, feature) {
  const iso3 = getIso3(feature);
  const startYear = triYears[currentTriIndex];
  //const periodText = `${startYear}–${startYear + 2}`;
  
  const row = triMetricsIndex.get(keyOf(iso3, startYear));

  const name = feature?.properties?.NAME || iso3 || "N/A";

  if (!row) {
    tooltip.style("display", "block")
      .html(`
        <div style="font-weight:700; margin-bottom:6px;">${name} (${iso3 ?? "?"})</div>
        <div><b>Période</b> : ${triLabel(startYear)}</div>
        <div style="margin-top:8px;">Aucune donnée disponible.</div>
      `);
    moveTooltip(event);
    return;
  }

  const ratio = row.ratio;
  const trade = row.trade;
  const conso = row.conso;

  const decarb = row.decarb;
  const carb = row.carb;

  tooltip.style("display", "block")
    .html(`
      <div style="font-weight:700; margin-bottom:6px;">${name} (${iso3})</div>
      <div><b>Période</b> : ${triLabel(startYear)} <span style="opacity:0.8;"></span></div>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.2);margin:8px 0;">
      <div><b>% décarbonné</b> : ${ratio == null ? "N/A" : d3.format(".1%")(ratio)}</div>
      <div style="opacity:0.9;">Décarbonné (TWh) : ${formatNumber(decarb)}</div>
      <div style="opacity:0.9;">Carbonné (TWh) : ${formatNumber(carb)}</div>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.2);margin:8px 0;">
      <div><b>Dépendance énergétique</b> : ${formatTrade(trade)}</div>
<div class="tooltip-note">
  ${trade > 0
    ? "Part de l’énergie utilisée provenant des importations."
    : "Le pays exporte plus d’énergie qu’il n’en consomme."}
</div>
      <div><b>Consommation / habitant</b> : ${conso == null || Number.isNaN(conso) ? "N/A" : d3.format(",.0f")(conso) + " kWh/hab"}</div>


    `);

  moveTooltip(event);
}

function moveTooltip(event) {
  const wrap = document.querySelector(".viz-wrap") || document.body;
  const rect = wrap.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  tooltip.style("left", `${x + 12}px`).style("top", `${y + 12}px`);
}

function hideTooltip() {
  tooltip.style("display", "none");
}

// =======================
// Layout / Resize
// =======================
function resize() {
  const width = svg.node().getBoundingClientRect().width || 900;
  const height = 520;

  svg.attr("viewBox", `0 0 ${width} ${height}`);
  projection.fitSize([width, height], geo);
  g.selectAll("path").attr("d", path);
}

// =======================
// Update map
// =======================
function update() {
  const startYear = triYears[currentTriIndex];
  yearLabel.text(triLabel(startYear));

  const values = geo.features.map(f => {
    const iso3 = getIso3(f);
    const row = triMetricsIndex.get(keyOf(iso3, startYear));
    return row ? row[currentMetric] : null;
  });

  const domain = globalDomains[currentMetric] || d3.extent(values.filter(v => v != null && !Number.isNaN(v)));
  const scaleInfo = buildColorScale(currentMetric, values, domain);

  updateLegend(currentMetric, scaleInfo);

  g.selectAll("path.country")
  .attr("fill", d => {
    const iso3 = getIso3(d);
    const startYear = triYears[currentTriIndex];
    const row = triMetricsIndex.get(`${iso3}_${startYear}`);
    const v = row ? row[currentMetric] : null;
    const hasData = (v != null && !Number.isNaN(v));
    return hasData ? scaleInfo.color(v) : "url(#hatch)";
  });



    if (hoveredFeature && lastMouseEvent) {
        showTooltip(lastMouseEvent, hoveredFeature);
    }
  
}

// =======================
// Parse + Compute annual metrics from CSV
// =======================
function computeMetricsFromProdRow(d) {
  // On récupère les colonnes via "includes" pour être robuste.
  // On ignore les colonnes dupliquées ".1" (elles sont identiques).
  const year = +d.Year;
  const iso3 = d.Code; // ISO3

  if (!iso3 || iso3.length !== 3 || Number.isNaN(year)) return null;

  function valContains(substr) {
    const key = Object.keys(d).find(k => k.includes(substr) && !k.endsWith(".1"));
    // IMPORTANT: si la colonne est vide, +"" => 0 (on préfère 0 ici)
    return key ? (+d[key] || 0) : 0;
  }

  // Décarbonné = nucléaire + hydro + wind + solar + bioenergy + other renewables
  const nuclear = valContains("Electricity from nuclear");
  const hydro   = valContains("Electricity from hydro");
  const wind    = valContains("Electricity from wind");
  const solar   = valContains("Electricity from solar");
  const bio     = valContains("Electricity from bioenergy");
  const otherR  = valContains("Other renewables excluding bioenergy");

  const decarb = nuclear + hydro + wind + solar + bio + otherR;

  // Carbonné = coal + gas + oil
  const coal = valContains("Electricity from coal");
  const gas  = valContains("Electricity from gas");
  const oil  = valContains("Electricity from oil");

  const carb = coal + gas + oil;

  // Ratio sous forme de % décarbonné (0..1)
  const total = decarb + carb;
  const ratio = (total > 0) ? (decarb / total) : null;

  return {
    country_iso3: iso3,
    year,
    ratio,
    decarb,
    carb,
    // placeholders
    trade: null, // net imports (export<0 / import>0) borné pour comparabilité

    conso: null
  };
}



// =======================
// Parse annual trade (net imports, signed) from CSV
// =======================
function parseTradeRow(d) {
  const iso3 = d.Code;
  const year = +d.Year;
  const trade = +d["Energy imports, net (% of energy use)"]; // signé: >0 import net, <0 export net

  if (!iso3 || iso3.length !== 3 || Number.isNaN(year) || Number.isNaN(trade)) return null;
  return { iso3, year, trade };
}


// =======================
// Parse annual conso per capita from CSV
// =======================

function parseConsoRow(d) {
  const iso3 = d.Code;
  const year = +d.Year;

  // Dataset: Primary energy consumption (TWh) (total, not per-capita)
  const twh = +d["Primary energy consumption (TWh)"];

  if (!iso3 || iso3.length !== 3 || Number.isNaN(year) || Number.isNaN(twh)) return null;
  return { iso3, year, twh };
}

// =======================
// Parse annual population from CSV
// =======================

function parsePopRow(d) {
  const iso3 = d.Code;
  const year = +d.Year;

  // Dataset: population columns (estimates preferred, fallback to medium)
  const pop = +(
    d["Population - Sex: all - Age: all - Variant: estimates"] ||
    d["Population - Sex: all - Age: all - Variant: medium"] ||
    NaN
  );

  if (!iso3 || iso3.length !== 3 || Number.isNaN(year) || Number.isNaN(pop)) return null;
  return { iso3, year, pop };
}


// =======================
// Init
// =======================
async function main() {
  try {
    statusEl.text("Chargement…");

    // Charger GeoJSON
    geo = await d3.json(GEO_PATH);
    ensureHatchPattern();

    // Charger CSV production
    const prodRows = await d3.csv(PROD_PATH);

    // Construire l'index annuel (ISO3_year -> row)
    metricsIndex = new Map();
    const years = new Set();

    for (const d of prodRows) {
      const m = computeMetricsFromProdRow(d);
      if (!m) continue;
      years.add(m.year);
      metricsIndex.set(keyOf(m.country_iso3, m.year), m);
    }


    // Charger CSV trade (importations nettes, signé)
    let tradeRows = [];
    try {
      tradeRows = await d3.csv(TRADE_PATH);
    } catch (e) {
      console.warn("Impossible de charger TRADE_PATH:", TRADE_PATH, e);
      tradeRows = [];
    }

    // =======================
// Charger consommation & population
// =======================
const consoRows = await d3.csv(CONSO_PATH);
const popRows   = await d3.csv(POP_PATH);

const consoIndex = new Map(); // ISO3_year -> TWh (total)
for (const d of consoRows) {
  const r = parseConsoRow(d);
  if (!r) continue;
  consoIndex.set(keyOf(r.iso3, r.year), r.twh);
  years.add(r.year);
}

const popIndex = new Map(); // ISO3_year -> population
for (const d of popRows) {
  const r = parsePopRow(d);
  if (!r) continue;
  popIndex.set(keyOf(r.iso3, r.year), r.pop);
  years.add(r.year);
}

// Merge : conso/habitant en kWh/hab
// conso est en TWh => 1 TWh = 1e9 kWh
for (const [k, twh] of consoIndex.entries()) {
  const pop = popIndex.get(k);
  if (pop == null || pop <= 0) continue;

  const kwhPerHab = (twh * 1e9) / pop;

  if (metricsIndex.has(k)) {
    metricsIndex.get(k).conso = kwhPerHab;
  } else {
    const [iso3, yearStr] = k.split("_");
    metricsIndex.set(k, {
      country_iso3: iso3,
      year: +yearStr,
      ratio: null,
      decarb: null,
      carb: null,
      trade: null,
      conso: kwhPerHab
    });
  }
}


const tradeIndex = new Map(); // ISO3_year -> trade
    for (const d of tradeRows) {
      const t = parseTradeRow(d);
      if (!t) continue;
      tradeIndex.set(keyOf(t.iso3, t.year), t.trade);
      years.add(t.year); // pour inclure ces années dans la timeline/périodes
    }

    // Merge trade dans metricsIndex (même si la prod est absente)
    for (const [k, tradeVal] of tradeIndex.entries()) {
      if (metricsIndex.has(k)) {
        metricsIndex.get(k).trade = tradeVal;
      } else {
        const [iso3, yearStr] = k.split("_");
        metricsIndex.set(k, {
          country_iso3: iso3,
          year: +yearStr,
          ratio: null,
          decarb: null,
          carb: null,
          trade: tradeVal,
          conso: null
        });
      }
    }


    // --- Agrégation triennale robuste (avec années manquantes) ---
    const allYears = Array.from(years).sort((a, b) => a - b);
    const minYear = allYears[0];

    function triStartYearFromMin(year, minYear) {
      return year - ((year - minYear) % 3);
    }
    function triLabel(startYear) {
      return `${startYear}–${startYear + 2}`;
    }

    const accMap = new Map();
    const triYearsSet = new Set();

    for (const row of metricsIndex.values()) {
      const start = triStartYearFromMin(row.year, minYear);
      const key = `${row.country_iso3}_${start}`;
      triYearsSet.add(start);

      if (!accMap.has(key)) {
        accMap.set(key, {
          country_iso3: row.country_iso3,
          startYear: start,
          sumDecarb: 0,
          sumCarb: 0,
          yearsEnergyCount: 0,
          sumTrade: 0,
          tradeCount: 0,
          sumConso: 0,
          consoCount: 0
        });
      }

      const acc = accMap.get(key);

      const hasEnergy =
        (row.decarb != null && !Number.isNaN(row.decarb)) ||
        (row.carb != null && !Number.isNaN(row.carb));

      if (hasEnergy) {
        acc.sumDecarb += (row.decarb ?? 0);
        acc.sumCarb += (row.carb ?? 0);
        acc.yearsEnergyCount += 1;
      }

      // (trade/conso seront null tant que vous n'avez pas ces datasets)
      if (row.trade != null && !Number.isNaN(row.trade)) {
        acc.sumTrade += row.trade;
        acc.tradeCount += 1;
      }
      if (row.conso != null && !Number.isNaN(row.conso)) {
        acc.sumConso += row.conso;
        acc.consoCount += 1;
      }
    }

    triMetricsIndex = new Map();
    for (const acc of accMap.values()) {
      const total = acc.sumDecarb + acc.sumCarb;
      triMetricsIndex.set(`${acc.country_iso3}_${acc.startYear}`, {
        country_iso3: acc.country_iso3,
        startYear: acc.startYear,
        ratio: total > 0 ? acc.sumDecarb / total : null, // 0..1
        decarb: acc.yearsEnergyCount > 0 ? acc.sumDecarb / acc.yearsEnergyCount : null,
        carb: acc.yearsEnergyCount > 0 ? acc.sumCarb / acc.yearsEnergyCount : null,
        nYears: acc.yearsEnergyCount,
        trade: acc.tradeCount > 0 ? acc.sumTrade / acc.tradeCount : null,
        conso: acc.consoCount > 0 ? acc.sumConso / acc.consoCount : null
      });
    }

    triYears = Array.from(triYearsSet).sort((a, b) => a - b);

    // --- Slider = index de période (0..N-1) ---
    currentTriIndex = triYears.length - 1;
    yearSlider.attr("min", 0).attr("max", triYears.length - 1).attr("step", 1);
    yearSlider.property("value", currentTriIndex);
    yearLabel.text(triLabel(triYears[currentTriIndex]));

    // --- Domaine global fixe pour ratio (0..1) ---
    globalDomains = globalDomains || {};
    globalDomains.ratio = [0, 1];
    globalDomains.conso = [10000, 100000];


    // ✅ MODIF 1 : init du descriptif (au chargement)
    updateDescription(currentMetric);

    // Dessiner les pays
    g.selectAll("path")
      .data(geo.features)
      .join("path")
      .attr("class", "country")
      .attr("d", path)
      .attr("fill", "url(#hatch)")
      .on("mousemove", (event) => {
        lastMouseEvent = event;
        moveTooltip(event);
      })
      .on("mouseover", (event, d) => {
        hoveredFeature = d;
        lastMouseEvent = event;
        showTooltip(event, d);
      })
      .on("mouseout", () => {
        hoveredFeature = null;
        lastMouseEvent = null;
        hideTooltip();
      });

      enableZoom();


    // UI events
    metricSelect.on("change", () => {
      currentMetric = metricSelect.property("value");

      // ✅ MODIF 2 : update du descriptif au changement d’indicateur
      updateDescription(currentMetric);

      update();
    });

    yearSlider.on("input", () => {
      currentTriIndex = +yearSlider.property("value");
      yearLabel.text(triLabel(triYears[currentTriIndex]));
      update();
    });


    // Lier le datalist au range
yearSlider.attr("list", "yearTicks");

const yearTicks = d3.select("#yearTicks");
yearTicks.selectAll("*").remove();

// Pour ne pas surcharger visuellement, on affiche 1 tick sur 2 ou 1 sur 3 si besoin
// Ici : on met tous les starts (1985, 1988, 1991...)
for (let i = 0; i < triYears.length; i++) {
  yearTicks.append("option")
    .attr("value", i) // IMPORTANT: le slider est un index de période
    .attr("label", triYears[i]); // texte affiché
}


    window.addEventListener("resize", () => {
      if (!geo) return;
      resize();
    });

    resize();
    update();

    statusEl.text("");
  } catch (err) {
    console.error(err);
    statusEl.text("❌ Erreur (voir console)");
  }
}

main();
