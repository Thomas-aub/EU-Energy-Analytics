// =======================
// CONFIGURATION & DONNÉES
// =======================
const GEO_PATH = "./data/europe.geojson";
const PROD_PATH = "./data/electricity-prod-source-stacked.csv";
const TRADE_PATH = "./data/energy-imports-and-exports-energy-use.csv";
const CONSO_PATH = "./data/primary-energy-cons.csv";
const POP_PATH = "./data/population-with-un-projections.csv";

window.ISO_TO_FR = {
    "ALB": "Albanie", "ARM": "Arménie", "AUT": "Autriche", "AZE": "Azerbaïdjan",
    "BEL": "Belgique", "BGR": "Bulgarie", "BIH": "Bosnie-Herzégovine", "BLR": "Biélorussie",
    "CHE": "Suisse", "CYP": "Chypre", "CZE": "République Tchèque", "DEU": "Allemagne",
    "DNK": "Danemark", "ESP": "Espagne", "EST": "Estonie", "FIN": "Finlande",
    "FRA": "France", "FRO": "Îles Féroé", "GBR": "Royaume-Uni", "GEO": "Géorgie",
    "GRC": "Grèce", "HRV": "Croatie", "HUN": "Hongrie", "IRL": "Irlande",
    "ISL": "Islande", "ISR": "Israël", "ITA": "Italie", "LTU": "Lituanie",
    "LUX": "Luxembourg", "LVA": "Lettonie", "MDA": "Moldavie", "MKD": "Macédoine du Nord",
    "MLT": "Malte", "MNE": "Monténégro", "NLD": "Pays-Bas", "NOR": "Norvège",
    "POL": "Pologne", "PRT": "Portugal", "ROU": "Roumanie", "RUS": "Russie",
    "SRB": "Serbie", "SVK": "Slovaquie", "SVN": "Slovénie", "SWE": "Suède",
    "TUR": "Turquie", "UKR": "Ukraine"
};

// UI CONFIG
// Gradient Trade inversé : Rouge (Import) -> Vert (Export)
const METRIC_DEFINITIONS = {
    ratio: { definition: "Part d'électricité décarbonée (Nucléaire + EnR).", readingKey: "🔴 Fossile ↔ 🟢 Décarboné", gradient: "linear-gradient(90deg, #ef4444, #eab308, #22c55e)", min: "0%", max: "100%" },
    trade: { 
        definition: "Solde import/export (% production).", 
        readingKey: "🟢 Exportateur ↔ 🔴 Importateur", 
        gradient: "linear-gradient(90deg, #16a34a, #ffffff, #dc2626)", 
        min: "Export", max: "Import"},
    conso: { definition: "Conso primaire par habitant.", readingKey: "⚪ Faible ↔ 🔵 Forte", gradient: "linear-gradient(90deg, #f1f5f9, #1e40af)", min: "Faible", max: "Forte" }
};

// VARIABLES GLOBALES
let geo = null;
let metricsIndex = new Map();
let triMetricsIndex = new Map();
let triYears = [];
let currentTriIndex = 0;
let currentMetric = "ratio";

// DOM Elements
const svg = d3.select("#map");
const statusEl = d3.select("#status");
const metricSelect = d3.select("#metric");
const yearSlider = d3.select("#year");
const yearLabel = d3.select("#yearLabel");

// --- CORRECTION : Création du Tooltip avec styles forcés ---
// On supprime l'ancien s'il existe pour éviter les doublons
d3.select("#tooltip-map").remove();

const tooltip = d3.select("body").append("div")
    .attr("id", "tooltip-map")
    .style("position", "absolute")
    .style("z-index", "10000")        /* Toujours au-dessus */
    .style("visibility", "hidden")    /* Caché par défaut */
    .style("background", "rgba(15, 23, 42, 0.95)")
    .style("color", "white")
    .style("padding", "8px 12px")
    .style("border-radius", "6px")
    .style("font-size", "0.9rem")
    .style("pointer-events", "none")  /* La souris passe au travers */
    .style("box-shadow", "0 4px 6px rgba(0,0,0,0.3)")
    .style("white-space", "nowrap");
// Définitions D3 (Projection en haut pour éviter ReferenceError)
const projection = d3.geoMercator();
const path = d3.geoPath(projection);

// Helpers
const keyOf = (iso3, year) => `${iso3}_${year}`;
const getIso3 = (feature) => feature?.properties?.ISO3;
function triStartYearFromMin(year, minYear) { return year - ((year - minYear) % 3); }

// =======================
// PARSER
// =======================
function parseProdRow(d) {
    const year = +d.Year;
    const iso3 = d.Code;
    if (!iso3 || isNaN(year)) return null;
    const getVal = (k) => { const key = Object.keys(d).find(c => c.toLowerCase().includes(k.toLowerCase())); return key ? (+d[key] || 0) : 0; };
    const lowCarbon = getVal("from nuclear") + getVal("from wind") + getVal("from solar") + getVal("from hydro") + getVal("from bioenergy") + getVal("other renewables");
    const fossil = getVal("from coal") + getVal("from gas") + getVal("from oil");
    const total = lowCarbon + fossil;
    const ratio = total > 0 ? (lowCarbon / total) : null;
    return { iso3, year, decarb: lowCarbon, carb: fossil, total, ratio };
}

// =======================
// MAIN LOGIC
// =======================
async function main() {
    try {
        statusEl.text("Chargement...");
        ensureHatchPattern();

        // --- CORRECTION FOND BLEU ---
        svg.style("background-color", "#cbd5e1"); // Couleur de l'océan

        // Setup Zoom
        const wrap = d3.select(".viz-wrap");
        // On s'assure qu'un groupe <g> existe pour appliquer le zoom
        let gZoom = svg.select("g.map-layer");
        if (gZoom.empty()) gZoom = svg.append("g").attr("class", "map-layer");

        const zoom = d3.zoom().scaleExtent([1, 8]).translateExtent([[-200, -200], [2000, 2000]])
            .on("zoom", (e) => gZoom.attr("transform", e.transform));
        svg.call(zoom);

        // Chargement
        const [geoData, prodRows, tradeRows, consoRows, popRows] = await Promise.all([
            d3.json(GEO_PATH),
            d3.csv(PROD_PATH),
            d3.csv(TRADE_PATH),
            d3.csv(CONSO_PATH),
            d3.csv(POP_PATH)
        ]);

        geo = geoData;

        // 1. CONSOLIDATION ANNUELLE
        metricsIndex = new Map();
        const yearsSet = new Set();
        const getRecord = (iso, y) => {
            const k = keyOf(iso, y);
            if (!metricsIndex.has(k)) {
                metricsIndex.set(k, { iso3: iso, year: y, ratio: null, trade: null, conso: null, decarb: 0, carb: 0, pop: 0, totalProd: 0 });
                yearsSet.add(y);
            }
            return metricsIndex.get(k);
        };

        prodRows.forEach(row => {
            const p = parseProdRow(row);
            if (p && window.ISO_TO_FR[p.iso3]) {
                const r = getRecord(p.iso3, p.year);
                r.ratio = p.ratio; r.decarb = p.decarb; r.carb = p.carb; r.totalProd = p.total;
            }
        });

        tradeRows.forEach(d => {
            const iso = d.Code; const y = +d.Year;
            const k = Object.keys(d).find(key => key.includes("Energy imports"));
            if (k && iso && window.ISO_TO_FR[iso]) getRecord(iso, y).trade = +d[k];
        });

        const popMap = new Map();
        popRows.forEach(d => {
            const k = Object.keys(d).find(key => key.includes("Population") && (key.includes("estimates") || key.includes("medium")));
            if (k) popMap.set(keyOf(d.Code, +d.Year), +d[k]);
        });

        consoRows.forEach(d => {
            const k = Object.keys(d).find(key => key.includes("Primary energy consumption"));
            if (k && window.ISO_TO_FR[d.Code]) {
                const r = getRecord(d.Code, +d.Year);
                r.consoTWh = +d[k];
                const p = popMap.get(keyOf(d.Code, +d.Year));
                if (p > 0) { r.conso = (+d[k] * 1e9) / p; r.pop = p; }
            }
        });

        const sortedYears = Array.from(yearsSet).sort((a, b) => a - b);

        // 2. AGRÉGATION TRIENNALE
        const minYear = sortedYears[0];
        const triMap = new Map();

        metricsIndex.forEach(rec => {
            const start = triStartYearFromMin(rec.year, minYear);
            const k = keyOf(rec.iso3, start);
            if (!triMap.has(k)) triMap.set(k, { iso3: rec.iso3, start, rSum: 0, rCnt: 0, tSum: 0, tCnt: 0, cSum: 0, cCnt: 0, dSum: 0, bSum: 0 });
            const t = triMap.get(k);
            if (rec.ratio !== null) { t.rSum += rec.ratio; t.rCnt++; }
            if (rec.trade !== null) { t.tSum += rec.trade; t.tCnt++; }
            if (rec.conso !== null) { t.cSum += rec.conso; t.cCnt++; }
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

        triYears = Array.from(triYearsSet).sort((a, b) => a - b);
        window.sharedData = { annualData: metricsIndex, years: sortedYears };

        // UI INIT
        updateSliderRange();

        metricSelect.on("change", () => {
            currentMetric = metricSelect.property("value");
            updateSliderRange();
            updateUI(currentMetric);
            updateMap();
        });

        yearSlider.on("input", () => { currentTriIndex = +yearSlider.property("value"); updateMap(); });
        window.addEventListener("resize", resizeMap);

        resizeMap();
        updateUI(currentMetric);
        updateMap();
        statusEl.text("");

        if (typeof window.initGrid === 'function') window.initGrid();

    } catch (err) {
        console.error(err);
        statusEl.text("Erreur chargement.");
    }
}

// =======================
// UI & DESSIN
// =======================
function updateSliderRange() {
    let minIndex = 0;
    for (let i = 0; i < triYears.length; i++) {
        const year = triYears[i];
        const hasData = geo.features.some(f => {
            const rec = triMetricsIndex.get(keyOf(getIso3(f), year));
            return rec && rec[currentMetric] != null;
        });
        if (hasData) { minIndex = i; break; }
    }
    yearSlider.attr("min", minIndex).attr("max", triYears.length - 1);
    currentTriIndex = triYears.length - 1;
    yearSlider.property("value", currentTriIndex);
}

function updateMap() {
    const startYear = triYears[currentTriIndex];
    yearLabel.text(`${startYear}–${startYear + 2}`);

    let colorScale;
    if (currentMetric === "ratio") {
        colorScale = d3.scaleLinear().domain([0, 0.5, 1]).range(["#ef4444", "#eab308", "#22c55e"]);
    } else if(currentMetric === "trade") {
        // Trade : Vert (Export -50%) -> Blanc (0%) -> Rouge (Import +50%)
        colorScale = d3.scaleLinear()
            .domain([-50, 0, 50])
            .range(["#16a34a", "#ffffff", "#dc2626"])
            .clamp(true); // Empêche les couleurs bizarres si > 50%
            
     } else {
        colorScale = d3.scaleSequential(d3.interpolateBlues).domain([5000, 50000]);
    }

    const gLayer = svg.select("g.map-layer");
    gLayer.selectAll("path")
        .data(geo.features)
        .join("path")
        .attr("d", path)
        .attr("stroke", "#64748b").attr("stroke-width", 0.5)
        .attr("fill", d => {
            const iso = getIso3(d);
            const rec = triMetricsIndex.get(keyOf(iso, startYear));
            if (!rec || rec[currentMetric] == null || isNaN(rec[currentMetric])) return "url(#hatch)";
            return colorScale(rec[currentMetric]);
        })
        .on("mouseover", (e, d) => {
            d3.select(e.currentTarget).attr("stroke", "#1e293b").attr("stroke-width", 1.5).raise();
            showTooltip(e, d);
        })
        .on("mouseout", (e) => {
            d3.select(e.currentTarget).attr("stroke", "#64748b").attr("stroke-width", 0.5);
            tooltip.style("visibility", "hidden");
        })
        .on("mousemove", moveTooltip)
        .on("click", (e, d) => {
            const frName = window.ISO_TO_FR[getIso3(d)];
            if (frName) window.location.href = `../production/production.html?country=${encodeURIComponent(frName)}`;
        });
}

function updateUI(metric) {
    const conf = METRIC_DEFINITIONS[metric];
    if (!conf) return;
    d3.select(".legend-container").html(`
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:0.85rem; color:#475569;">Échelle de lecture</label>
        <div class="legend-gradient" style="background:${conf.gradient}"></div>
        <div class="legend-labels"><span>${conf.min}</span><span>${conf.max}</span></div>
    `);
    d3.select("#metricInfoBox .info-content").text(conf.definition);
    d3.select("#metricInfoBox .info-reading-key").text(conf.readingKey);
}

function showTooltip(event, d) {
    const iso = getIso3(d);
    const frName = window.ISO_TO_FR[iso] || d.properties.NAME || iso;
    const startYear = triYears[currentTriIndex];
    const rec = triMetricsIndex.get(keyOf(iso, startYear));

    let content = `<div style="color:#cbd5e1; font-style:italic">Pas de données</div>`;

    if (rec && rec[currentMetric] != null) {
        if (currentMetric === "ratio") {
            content = `<div><b>${d3.format(".1%")(rec.ratio)}</b> Décarboné</div>
                       <div style="font-size:0.8em; opacity:0.8">Bas-Carbone: ${d3.format(",.0f")(rec.decarb)} TWh</div>`;
        } else if (currentMetric === "trade") {
            // Logique inversée : Vert = Exportateur (négatif dans le CSV souvent, mais ici on affiche le statut)
            // Si trade > 0 => Importateur. Si trade < 0 => Exportateur.
            const isImport = rec.trade > 0;
            const label = isImport ? "Importateur" : "Exportateur";
            const color = isImport ? "#ef4444" : "#22c55e"; // Rouge vs Vert
            content = `<div style="color:${color};font-weight:bold">${label}</div>
                       <div>${d3.format("+.1f")(rec.trade)}% du mix</div>`;
        } else {
            content = `<div><b>${d3.format(",.0f")(rec.conso)}</b> kWh/hab</div>`;
        }
    }

    tooltip
        .style("visibility", "visible") // On affiche
        .html(`<div style="font-weight:700; margin-bottom:5px; border-bottom:1px solid #ffffff30; padding-bottom:3px;">${frName}</div>${content}`);

    moveTooltip(event);
}

function moveTooltip(event) {
    // Calcul de la position par rapport à la page entière
    // On ajoute 15px pour décaler le tooltip du curseur
    const x = event.pageX + 15;
    const y = event.pageY - 15;

    tooltip
        .style("left", x + "px")
        .style("top", y + "px");
}

function ensureHatchPattern() {
    const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
    if (!defs.select("#hatch").empty()) return;
    const h = defs.append("pattern").attr("id", "hatch").attr("patternUnits", "userSpaceOnUse").attr("width", 8).attr("height", 8).attr("patternTransform", "rotate(45)");
    h.append("rect").attr("width", 8).attr("height", 8).attr("fill", "#e2e8f0");
    h.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 8).attr("stroke", "#94a3b8").attr("stroke-width", 2);
}

function resizeMap() {
    const wrap = d3.select(".viz-wrap").node();
    if (!wrap) return;
    const w = wrap.getBoundingClientRect().width || 800;
    const h = 600;
    svg.attr("width", w).attr("height", h);
    if (geo) {
        projection.fitExtent([[20, 20], [w - 20, h - 20]], geo);
        svg.select("g.map-layer").selectAll("path").attr("d", path);
    }
}

// Global Toggle
window.toggleMainView = function (view) {
    const map = document.getElementById('view-map-container');
    const grid = document.getElementById('view-grid-container');
    document.getElementById('btn-show-map').className = view === 'map' ? 'view-btn active' : 'view-btn';
    document.getElementById('btn-show-grid').className = view === 'grid' ? 'view-btn active' : 'view-btn';
    if (view === 'map') { map.classList.remove('hidden'); grid.classList.add('hidden'); resizeMap(); }
    else { map.classList.add('hidden'); grid.classList.remove('hidden'); if (window.updateGridView) window.updateGridView(); }
};

main();