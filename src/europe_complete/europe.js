// =======================
// Paths
// =======================
const GEO_PATH = "./data/europe.geojson";
const TIMESERIES_PATH = "./data/TimeSeries.csv";
const POP_PATH = "./data/population-with-un-projections.csv";

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

// =======================
// Globals
// =======================
let geo = null;
let metricsIndex = new Map();
let currentYear = 2024;
let currentMetric = metricSelect.property("value");

let hoveredFeature = null;
let lastMouseEvent = null;

const projection = d3.geoMercator()
  .center([10, 52])
  .scale(100)
  .translate([0, 0]);

const pathGenerator = d3.geoPath().projection(projection);

// =======================
// MAPPING NAVIGATION
// ISO3 -> Nom attendu par script.js (Production)
// =======================
const ISO_TO_PROD_NAME = {
    "AUT": "Austria", "BEL": "Belgium", "CZE": "Czechia", "DNK": "Denmark",
    "EST": "Estonia", "FIN": "Finland", "FRA": "France", "DEU": "Germany",
    "GRC": "Greece", "HUN": "Hungary", "ISL": "Iceland", "IRL": "Ireland",
    "ITA": "Italy", "LVA": "Latvia", "LTU": "Lithuania", "LUX": "Luxembourg",
    "NLD": "Netherlands", "NOR": "Norway", "POL": "Poland", "PRT": "Portugal",
    "SVK": "Slovakia", "SVN": "Slovenia", "ESP": "Spain", "SWE": "Sweden",
    "CHE": "Switzerland", "TUR": "Republic of Turkiye", "GBR": "United Kingdom"
};

const COUNTRY_NAME_TO_ISO = {
    "Czech Republic": "CZE", "Slovak Republic": "SVK", "Bosnia and Herzegovina": "BIH",
    "North Macedonia": "MKD", "Moldova": "MDA", "Republic of Moldova": "MDA", "United Kingdom": "GBR",
    "Republic of Turkiye": "TUR", "France": "FRA", "Germany": "DEU", "Italy": "ITA", "Spain": "ESP",
    "Poland": "POL", "Sweden": "SWE", "Norway": "NOR", "Finland": "FIN", "Denmark": "DNK",
    "Netherlands": "NLD", "Belgium": "BEL", "Austria": "AUT", "Switzerland": "CHE",
    "Portugal": "PRT", "Greece": "GRC", "Ireland": "IRL", "Iceland": "ISL",
    "Hungary": "HUN", "Romania": "ROU", "Bulgaria": "BGR", "Croatia": "HRV",
    "Slovenia": "SVN", "Serbia": "SRB", "Montenegro": "MNE", "Kosovo": "XKX",
    "Albania": "ALB", "Latvia": "LVA", "Lithuania": "LTU", "Estonia": "EST",
    "Ukraine": "UKR", "Malta": "MLT", "Cyprus": "CYP", "Luxembourg": "LUX"
};

const ISO_TO_FR = {
    "ALB": "Albanie", "AUT": "Autriche", "BEL": "Belgique", "BGR": "Bulgarie",
    "BIH": "Bosnie-Herzégovine", "CHE": "Suisse", "CYP": "Chypre", "CZE": "République Tchèque",
    "DEU": "Allemagne", "DNK": "Danemark", "ESP": "Espagne", "EST": "Estonie",
    "FIN": "Finlande", "FRA": "France", "GBR": "Royaume-Uni", "GRC": "Grèce",
    "HRV": "Croatie", "HUN": "Hongrie", "IRL": "Irlande", "ISL": "Islande",
    "ITA": "Italie", "LTU": "Lituanie", "LUX": "Luxembourg", "LVA": "Lettonie",
    "MDA": "Moldavie", "MKD": "Macédoine du Nord", "MLT": "Malte", "MNE": "Monténégro",
    "NLD": "Pays-Bas", "NOR": "Norvège", "POL": "Pologne", "PRT": "Portugal",
    "ROU": "Roumanie", "SRB": "Serbie", "SVK": "Slovaquie", "SVN": "Slovénie",
    "SWE": "Suède", "TUR": "Turquie", "UKR": "Ukraine", "XKX": "Kosovo"
};

const CATEGORY_MAP_JS = {
    'Coal, peat and oil shale': 'Fossil', 'Crude, NGL and feedstocks': 'Fossil',
    'Oil products': 'Fossil', 'Natural gas': 'Fossil', 'Nuclear': 'LowCarbon',
    'Renewables and waste': 'LowCarbon', 'Hydro': 'LowCarbon',
    'Geothermal': 'LowCarbon', 'Solar/wind/other': 'LowCarbon',
    'Biofuels and waste': 'LowCarbon'
};

function init() {
  resizeMap();
  statusEl.text("Chargement des données...");

  Promise.all([
    d3.json(GEO_PATH),
    d3.csv(TIMESERIES_PATH),
    d3.csv(POP_PATH)
  ]).then(([geoData, timeData, popData]) => {
    geo = geoData;
    processData(timeData, popData);
    statusEl.text(""); 
    setupMap();
    update();
  }).catch(err => {
    console.error(err);
    statusEl.text("Erreur de chargement.");
  });
}

function processData(timeSeries, popData) {
  let popMap = new Map();
  let nameToCode = new Map();

  popData.forEach(d => {
    const iso = d.Code;
    const name = d.Entity;
    if (iso && name) nameToCode.set(name, iso);
    if (!iso) return;
    const y = +d.Year;
    let val = d["Population - Sex: all - Age: all - Variant: estimates"] || d["Population - Sex: all - Age: all - Variant: medium"];
    if (val) {
      if (!popMap.has(iso)) popMap.set(iso, new Map());
      popMap.get(iso).set(y, +val);
    }
  });

  let aggregated = new Map();

  timeSeries.forEach(r => {
    const countryName = r.Country;
    const product = r.Product;
    const flow = r.Flow;

    let iso = COUNTRY_NAME_TO_ISO[countryName];
    if (!iso && nameToCode.has(countryName)) iso = nameToCode.get(countryName);
    if (!iso) return;

    if (!aggregated.has(iso)) aggregated.set(iso, new Map());
    const countryMap = aggregated.get(iso);

    for (let y = 1971; y <= 2024; y++) {
        let valStr = r[y] || r["2024 Provisional"];
        let val = parseFloat(valStr);
        if (isNaN(val)) continue;

        if (!countryMap.has(y)) countryMap.set(y, { lowC: 0, fossil: 0, imports: 0, exports: 0, supply: 0 });
        let rec = countryMap.get(y);

        if (flow === "Total energy supply (PJ)") {
            if (product === "Total") rec.supply = val;
            else {
                const cat = CATEGORY_MAP_JS[product];
                if (cat === 'LowCarbon') rec.lowC += val;
                else if (cat === 'Fossil') rec.fossil += val;
            }
        }
        if (flow === "Imports (PJ)" && product === "Total") rec.imports = val;
        if (flow === "Exports (PJ)" && product === "Total") rec.exports = Math.abs(val);
    }
  });

  aggregated.forEach((yearsMap, iso) => {
      yearsMap.forEach((data, y) => {
          const key = `${iso}_${y}`;
          const totalMix = data.lowC + data.fossil;
          let ratio = 0; if (totalMix > 0) ratio = (data.lowC / totalMix) * 100;
          let trade = 0; if (data.supply > 0) trade = ((data.imports - data.exports) / data.supply) * 100;
          let conso = 0; const popVal = popMap.has(iso) ? popMap.get(iso).get(y) : 0;
          if (data.supply > 0 && popVal > 0) conso = (data.supply * 1000000) / popVal;
          metricsIndex.set(key, { ratio, trade, conso });
      });
  });
}

function setupMap() {
  resizeMap();

  svg.append("g")
    .selectAll("path")
    .data(geo.features)
    .enter()
    .append("path")
    .attr("d", pathGenerator)
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.5)
    .attr("fill", "#e2e8f0")
    .style("cursor", "pointer") // Curseur main
    .on("mousemove", (event, d) => {
        showTooltip(event, d);
        d3.select(event.currentTarget).attr("stroke", "#64748b").attr("stroke-width", 1.5).raise();
    })
    .on("mouseout", (event, d) => {
        hideTooltip();
        d3.select(event.currentTarget).attr("stroke", "#fff").attr("stroke-width", 0.5);
    })
    // --- NOUVEAU : CLICK EVENT ---
    .on("click", (event, d) => {
        const iso = d.properties.ISO3;
        const targetName = ISO_TO_PROD_NAME[iso];
        if (targetName) {
            // Redirection vers la page Production avec le paramètre
            window.location.href = `../production/production.html?country=${encodeURIComponent(targetName)}`;
        } else {
            console.warn("Pas de correspondance pour le pays:", iso);
        }
    });

  metricSelect.on("change", () => { currentMetric = metricSelect.property("value"); update(); });
  yearSlider.on("input", function() { currentYear = +this.value; yearLabel.text(currentYear); update(); });
}

function update() {
  const metric = currentMetric;
  let colorScale;
  if (metric === "ratio") colorScale = d3.scaleLinear().domain([0, 50, 100]).range(["#ef4444", "#fef0d9", "#22c55e"]);
  else if (metric === "trade") colorScale = d3.scaleLinear().domain([80, 0, -80]).range(["#ef4444", "#f8fafc", "#22c55e"]).clamp(true);
  else if (metric === "conso") colorScale = d3.scaleSequential(d3.interpolateBlues).domain([50, 300]); 

  svg.selectAll("path")
    .transition().duration(200)
    .attr("fill", d => {
      const iso = d.properties.ISO3;
      const data = metricsIndex.get(`${iso}_${currentYear}`);
      if (!data || data[metric] === undefined) return "#e2e8f0"; 
      return colorScale(data[metric]);
    });
}

function resizeMap() {
  const container = d3.select(".viz-wrap").node();
  if (!container) return;
  const width = container.getBoundingClientRect().width;
  const height = 650;
  svg.attr("width", width).attr("height", height);
  projection.center([10, 52]); 
  projection.scale(width * 0.45); 
  projection.translate([width / 2, height / 2]);
  svg.selectAll("path").attr("d", pathGenerator);
}

function showTooltip(event, d) {
  const iso = d.properties.ISO3;
  const name = ISO_TO_FR[iso] || d.properties.NAME; 
  const data = metricsIndex.get(`${iso}_${currentYear}`);
  let valStr = "Pas de données";

  if (data) {
    if (currentMetric === "ratio" && !isNaN(data.ratio)) valStr = Math.round(data.ratio) + "% Bas-Carbone";
    else if (currentMetric === "trade" && !isNaN(data.trade)) valStr = Math.round(Math.abs(data.trade)) + "% " + (data.trade > 0 ? "Import" : "Export");
    else if (currentMetric === "conso" && !isNaN(data.conso)) valStr = Math.round(data.conso) + " GJ/hab";
  }

  const [x, y] = d3.pointer(event, svg.node());
  tooltip.style("display", "block").style("left", (x + 15) + "px").style("top", (y - 15) + "px")
    .html(`<div style="font-weight:700; margin-bottom:4px;">${name}</div>${valStr}`);
}

function hideTooltip() { tooltip.style("display", "none"); }
window.addEventListener("resize", () => { resizeMap(); });
init();