// =======================
// Paths (4 fichiers de données)
// =======================
const GEO_PATH = "./data/europe.geojson";
const PROD_PATH = "./data/electricity-prod-source-stacked.csv";
const TRADE_PATH = "./data/energy-imports-and-exports-energy-use.csv";
const CONSO_PATH = "./data/primary-energy-cons.csv";
const POP_PATH   = "./data/population-with-un-projections.csv";

// =======================
// Dictionnaire de traduction (ISO3 -> Français)
// =======================

const ISO_TO_FR = {
  "ALB": "Albanie", 
  "ARM": "Arménie",
  "AUT": "Autriche", 
  "AZE": "Azerbaïdjan",
  "BEL": "Belgique", 
  "BGR": "Bulgarie",
  "BIH": "Bosnie-Herzégovine", 
  "BLR": "Biélorussie",
  "CHE": "Suisse", 
  "CYP": "Chypre", 
  "CZE": "République Tchèque",
  "DEU": "Allemagne", 
  "DNK": "Danemark", 
  "ESP": "Espagne", 
  "EST": "Estonie",
  "FIN": "Finlande", 
  "FRA": "France", 
  "FRO": "Îles Féroé",
  "GBR": "Royaume-Uni", 
  "GEO": "Géorgie",
  "GRC": "Grèce",
  "HRV": "Croatie", 
  "HUN": "Hongrie", 
  "IRL": "Irlande", 
  "ISL": "Islande",
  "ISR": "Israël",
  "ITA": "Italie", 
  "LTU": "Lituanie", 
  "LUX": "Luxembourg", 
  "LVA": "Lettonie",
  "MDA": "Moldavie", 
  "MKD": "Macédoine du Nord", 
  "MLT": "Malte", 
  "MNE": "Monténégro",
  "NLD": "Pays-Bas", 
  "NOR": "Norvège", 
  "POL": "Pologne", 
  "PRT": "Portugal",
  "ROU": "Roumanie", 
  "RUS": "Russie",
  "SRB": "Serbie", 
  "SVK": "Slovaquie", 
  "SVN": "Slovénie",
  "SWE": "Suède", 
  "TUR": "Turquie", 
  "UKR": "Ukraine", 
  "XKX": "Kosovo"
};

// =======================
// Configuration des Facteurs (Pour référence future ou infobulles)
// =======================
const EMISSION_FACTORS = {
    "Charbon": 820, "Gaz": 490, "Pétrole": 650,
    "Nucléaire": 12, "Éolien": 11, "Solaire": 45, 
    "Hydraulique": 24, "Bioénergie": 230, "Autres renouvelables": 38
};

// =======================
// DOM Elements
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
let metricsIndex = new Map();
let triMetricsIndex = new Map();
let triYears = [];
let currentTriIndex = 0;
let currentMetric = metricSelect.property("value");

let hoveredFeature = null;

// Domaines fixes
let globalDomains = {
  ratio: [0, 1],       
  trade: [-80, 80],  
  conso: [5000, 50000] 
};

const projection = d3.geoMercator();
const path = d3.geoPath(projection);
const g = svg.append("g");

// =======================
// Initialization & Pattern
// =======================
function ensureHatchPattern() {
  const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
  if (!defs.select("#hatch").empty()) return;

  const hatch = defs.append("pattern")
    .attr("id", "hatch")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 8)
    .attr("height", 8)
    .attr("patternTransform", "rotate(45)");

  hatch.append("rect").attr("width", 8).attr("height", 8).attr("fill", "#e2e8f0"); 
  hatch.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 8).attr("stroke", "#94a3b8").attr("stroke-width", 2);
}

function enableZoom() {
  const wrap = d3.select(".viz-wrap");
  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[-200, -200], [2000, 2000]])
    .on("start", () => wrap.classed("is-dragging", true))
    .on("zoom", (event) => g.attr("transform", event.transform))
    .on("end", () => wrap.classed("is-dragging", false));
  svg.call(zoom);
}

// =======================
// Data Processing Helpers
// =======================
const keyOf = (iso3, year) => `${iso3}_${year}`;
const getIso3 = (feature) => feature?.properties?.ISO3;

function triStartYearFromMin(year, minYear) {
  return year - ((year - minYear) % 3);
}

// --- MISE À JOUR : Calcul strict basé sur vos catégories ---
function parseProdRow(d) {
    const year = +d.Year;
    const iso3 = d.Code;
    if (!iso3 || isNaN(year)) return null;

    const getVal = (keyword) => {
        const key = Object.keys(d).find(k => k.toLowerCase().includes(keyword.toLowerCase()));
        return key ? (+d[key] || 0) : 0;
    };

    // 1. Récupération des sources bas-carbone (Low Carbon)
    const nuclear = getVal("from nuclear");
    const wind    = getVal("from wind");
    const solar   = getVal("from solar");
    const hydro   = getVal("from hydro");
    const bio     = getVal("from bioenergy");
    const other   = getVal("other renewables");

    // Somme Bas-Carbone
    const lowCarbonProd = nuclear + wind + solar + hydro + bio + other;

    // 2. Récupération des sources fossiles
    const coal = getVal("from coal");
    const gas  = getVal("from gas");
    const oil  = getVal("from oil");

    // Somme Fossile
    const fossilProd = coal + gas + oil;

    // 3. Calcul du Total et du Ratio
    const totalProd = lowCarbonProd + fossilProd;
    
    // Ratio (0 à 1 pour D3, on multipliera par 100 pour l'affichage)
    const ratio = totalProd > 0 ? (lowCarbonProd / totalProd) : null;

    return { 
        iso3, 
        year, 
        decarb: lowCarbonProd, 
        carb: fossilProd, 
        total: totalProd,
        ratio: ratio 
    };
}

function parseTradeRow(d) {
    const iso3 = d.Code;
    const year = +d.Year;
    const key = Object.keys(d).find(k => k.includes("Energy imports"));
    const val = key ? +d[key] : NaN;
    if (!iso3 || isNaN(year) || isNaN(val)) return null;
    return { iso3, year, trade: val };
}

function parseConsoRow(d) {
    const iso3 = d.Code;
    const year = +d.Year;
    const key = Object.keys(d).find(k => k.includes("Primary energy consumption"));
    const val = key ? +d[key] : NaN;
    if (!iso3 || isNaN(year) || isNaN(val)) return null;
    return { iso3, year, consoTWh: val };
}

function parsePopRow(d) {
    const iso3 = d.Code;
    const year = +d.Year;
    const key = Object.keys(d).find(k => k.includes("Population") && (k.includes("estimates") || k.includes("medium")));
    const val = key ? +d[key] : NaN;
    if (!iso3 || isNaN(year) || isNaN(val)) return null;
    return { iso3, year, pop: val };
}

// =======================
// Main Logic
// =======================
async function main() {
  try {
    statusEl.text("Chargement...");
    ensureHatchPattern();
    svg.style("background-color", "#cbd5e1"); // Fond Océan

    const [geoData, prodRows, tradeRows, consoRows, popRows] = await Promise.all([
        d3.json(GEO_PATH),
        d3.csv(PROD_PATH),
        d3.csv(TRADE_PATH),
        d3.csv(CONSO_PATH),
        d3.csv(POP_PATH)
    ]);

    geo = geoData;

    // Consolidation
    const metricsIndex = new Map(); 
    const yearsSet = new Set();
    const getRecord = (iso, y) => {
        const k = keyOf(iso, y);
        if(!metricsIndex.has(k)) {
            metricsIndex.set(k, { iso3: iso, year: y, ratio: null, trade: null, conso: null, decarb: 0, carb: 0 });
            yearsSet.add(y);
        }
        return metricsIndex.get(k);
    };

    prodRows.forEach(row => { 
        const p = parseProdRow(row); 
        if(p) { 
            const r = getRecord(p.iso3, p.year); 
            r.ratio = p.ratio; 
            r.decarb = p.decarb; 
            r.carb = p.carb; 
        }
    });

    tradeRows.forEach(row => { const t = parseTradeRow(row); if(t) getRecord(t.iso3, t.year).trade = t.trade; });
    
    const popMap = new Map();
    popRows.forEach(row => { const p = parsePopRow(row); if(p) popMap.set(keyOf(p.iso3, p.year), p.pop); });
    
    consoRows.forEach(row => {
        const c = parseConsoRow(row);
        if(c) {
            const pop = popMap.get(keyOf(c.iso3, c.year));
            if(pop > 0) getRecord(c.iso3, c.year).conso = (c.consoTWh * 1e9) / pop;
        }
    });

    // Agrégation Triennale
    const sortedYears = Array.from(yearsSet).sort((a,b)=>a-b);
    const minYear = sortedYears[0];
    const triMap = new Map();

    metricsIndex.forEach(rec => {
        const start = triStartYearFromMin(rec.year, minYear);
        const k = keyOf(rec.iso3, start);
        if(!triMap.has(k)) triMap.set(k, { iso3: rec.iso3, start, rSum:0, rCnt:0, tSum:0, tCnt:0, cSum:0, cCnt:0, dSum:0, bSum:0 });
        
        const t = triMap.get(k);
        if(rec.ratio !== null) { t.rSum += rec.ratio; t.rCnt++; }
        if(rec.trade !== null) { t.tSum += rec.trade; t.tCnt++; }
        if(rec.conso !== null) { t.cSum += rec.conso; t.cCnt++; }
        t.dSum += rec.decarb; t.bSum += rec.carb;
    });

    triMetricsIndex = new Map();
    const triYearsSet = new Set();

    triMap.forEach(t => {
        triYearsSet.add(t.start);
        triMetricsIndex.set(keyOf(t.iso3, t.start), {
            ratio: t.rCnt > 0 ? t.rSum / t.rCnt : null,
            trade: t.tCnt > 0 ? t.tSum / t.tCnt : null,
            conso: t.cCnt > 0 ? t.cSum / t.cCnt : null,
            decarb: t.dSum / 3, carb: t.bSum / 3
        });
    });

    triYears = Array.from(triYearsSet).sort((a,b)=>a-b);
    
    // --- Initialisation du slider ---
    updateSliderRange();
    
    metricSelect.on("change", () => { 
        currentMetric = metricSelect.property("value"); 
        updateSliderRange(); 
        updateDescription(currentMetric); 
        update(); 
    });

    yearSlider.on("input", () => { currentTriIndex = +yearSlider.property("value"); update(); });
    window.addEventListener("resize", resizeMap);

    resizeMap();
    updateDescription(currentMetric);
    update();
    statusEl.text("");

  } catch (err) {
    console.error(err);
    statusEl.text("Erreur chargement.");
  }
}

// =======================
// Logic: Update Slider Range
// =======================
function updateSliderRange() {
    let minIndex = 0;

    // Trouver la première année où il y a des données pour cette métrique
    for (let i = 0; i < triYears.length; i++) {
        const year = triYears[i];
        const hasData = geo.features.some(f => {
            const iso = getIso3(f);
            const rec = triMetricsIndex.get(keyOf(iso, year));
            return rec && rec[currentMetric] != null && !isNaN(rec[currentMetric]);
        });
        if (hasData) {
            minIndex = i;
            break;
        }
    }

    yearSlider.attr("min", minIndex);
    yearSlider.attr("max", triYears.length - 1);
    
    // Toujours mettre le slider à la fin par défaut
    currentTriIndex = triYears.length - 1;
    yearSlider.property("value", currentTriIndex);
}

// =======================
// Update & Draw
// =======================
function update() {
    const startYear = triYears[currentTriIndex];
    yearLabel.text(`${startYear}–${startYear + 2}`);

    let colorScale;
    const domain = globalDomains[currentMetric];

    if(currentMetric === "ratio") {
        colorScale = d3.scaleLinear()
            .domain([0, 0.5, 1])
            .range(["#ef4444", "#eab308", "#22c55e"]);
    } else if(currentMetric === "trade") {
        const maxBound = 80; 
        colorScale = d3.scaleDiverging()
            .domain([-maxBound, 0, maxBound])
            .interpolator(t => {
                if (t < 0.5) return d3.interpolateRgb("#16a34a", "#ffffff")(t * 2);
                else return d3.interpolateRgb("#ffffff", "#dc2626")((t - 0.5) * 2);
            })
            .clamp(true);
    } else {
        colorScale = d3.scaleSequential(d3.interpolateBlues).domain(domain);
    }

    updateLegend(currentMetric);

    g.selectAll("path")
        .data(geo.features)
        .join("path")
        .attr("d", path)
        .attr("stroke", "#64748b") 
        .attr("stroke-width", 0.5)
        .attr("fill", d => {
            const iso = getIso3(d);
            const rec = triMetricsIndex.get(keyOf(iso, startYear));
            const val = rec ? rec[currentMetric] : null;
            if (val == null || isNaN(val)) return "url(#hatch)";
            return colorScale(val);
        })
        .on("mouseover", (e, d) => {
            d3.select(e.currentTarget).attr("stroke", "#1e293b").attr("stroke-width", 1.5).raise();
            showTooltip(e, d);
        })
        .on("mouseout", (e) => {
            d3.select(e.currentTarget).attr("stroke", "#64748b").attr("stroke-width", 0.5);
            hideTooltip();
        })
        .on("mousemove", moveTooltip)
        .on("click", (e, d) => {
            const iso = getIso3(d);
            const frName = ISO_TO_FR[iso] || d.properties.NAME;
            if (frName) {
                window.location.href = `../production/production.html?country=${encodeURIComponent(frName)}`;
            }
        });
}

// =======================
// Utilities
// =======================
function updateLegend(metric) {
    legendEl.html("");
    legendEl.append("div").attr("class", "legend-title").text(
        metric === "ratio" ? "% Décarboné" : (metric === "trade" ? "Dépendance (%)" : "kWh / hab")
    );
    const bar = legendEl.append("div").attr("class", "legend-row").append("div").attr("class", "legend-bar");
    const mm = legendEl.append("div").attr("class", "legend-minmax");

    if (metric === "ratio") {
        bar.style("background", "linear-gradient(90deg, #ef4444, #eab308, #22c55e)");
        mm.html("<span>0%</span><span>100%</span>");
    } else if (metric === "trade") {
        bar.style("background", "linear-gradient(90deg, #16a34a, #ffffff 50%, #dc2626)");
        mm.html("<span>Export</span><span>Import</span>");
    } else {
        bar.style("background", "linear-gradient(90deg, #eff6ff, #1e3a8a)");
        mm.html("<span>Faible</span><span>Forte</span>");
    }
}

function updateDescription(metric) {
    if(metric === "ratio") metricDescEl.html("Part d'électricité décarbonée (Nucléaire + EnR).");
    else if(metric === "trade") metricDescEl.html("Dépendance énergétique (Vert = Exportateur, Blanc = Autonome, Rouge = Importateur).");
    else metricDescEl.html("Consommation d'énergie primaire par habitant.");
}

function showTooltip(event, d) {
    const iso = getIso3(d);
    const frName = ISO_TO_FR[iso] || d.properties.NAME || iso;
    const startYear = triYears[currentTriIndex];
    const rec = triMetricsIndex.get(keyOf(iso, startYear));
    
    let content = `<div style="color:#64748b; font-style:italic">Pas de données</div>`;
    if(rec && rec[currentMetric] != null) {
        if(currentMetric === "ratio") {
            content = `<div><b>${d3.format(".1%")(rec.ratio)}</b> Décarboné</div>
                       <div style="font-size:0.8rem;opacity:0.8">Bas-Carbone: ${d3.format(",.0f")(rec.decarb)} TWh</div>`;
        } else if(currentMetric === "trade") {
            const label = rec.trade > 0 ? "Importateur" : "Exportateur";
            const color = rec.trade > 0 ? "#dc2626" : "#16a34a";
            content = `<div style="color:${color};font-weight:bold">${label}</div>
                       <div>${d3.format("+.1f")(rec.trade)}% Dépendance</div>`;
        } else {
            content = `<div><b>${d3.format(",.0f")(rec.conso)}</b> kWh/hab</div>`;
        }
    }
    
    tooltip.style("display", "block").html(
        `<div style="font-weight:700; margin-bottom:5px; border-bottom:1px solid #ffffff30">${frName}</div>${content}`
    );
    moveTooltip(event);
}

function moveTooltip(event) {
    const box = document.querySelector(".viz-wrap").getBoundingClientRect();
    tooltip.style("left", (event.clientX - box.left + 15) + "px").style("top", (event.clientY - box.top - 15) + "px");
}
function hideTooltip() { tooltip.style("display", "none"); }

function resizeMap() {
    const container = d3.select(".viz-wrap").node();
    if (!container) return;
    const w = container.getBoundingClientRect().width || 800;
    const h = 600; 
    svg.attr("width", w).attr("height", h);
    projection.fitExtent([[20, 20], [w - 20, h - 20]], geo);
    g.selectAll("path").attr("d", path);
}

enableZoom();
main();