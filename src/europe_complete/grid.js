// =======================
// CONFIGURATION & CONSTANTES
// =======================

const PROD_PATH = "./data/electricity-prod-source-stacked.csv";
const TRADE_PATH = "./data/energy-imports-and-exports-energy-use.csv";
const CONSO_PATH = "./data/primary-energy-cons.csv";
const POP_PATH   = "./data/population-with-un-projections.csv";

const ISO_TO_FR = {
  "ALB": "Albanie", "ARM": "Arménie", "AUT": "Autriche", "AZE": "Azerbaïdjan",
  "BEL": "Belgique", "BGR": "Bulgarie", "BIH": "Bosnie-Herzégovine", "BLR": "Biélorussie",
  "CHE": "Suisse", "CYP": "Chypre", "CZE": "République Tchèque",
  "DEU": "Allemagne", "DNK": "Danemark", "ESP": "Espagne", "EST": "Estonie",
  "FIN": "Finlande", "FRA": "France", "FRO": "Îles Féroé", "GBR": "Royaume-Uni",
  "GEO": "Géorgie", "GRC": "Grèce", "HRV": "Croatie", "HUN": "Hongrie",
  "IRL": "Irlande", "ISL": "Islande", "ISR": "Israël", "ITA": "Italie",
  "LTU": "Lituanie", "LUX": "Luxembourg", "LVA": "Lettonie", "MDA": "Moldavie",
  "MKD": "Macédoine du Nord", "MLT": "Malte", "MNE": "Monténégro", "NLD": "Pays-Bas",
  "NOR": "Norvège", "POL": "Pologne", "PRT": "Portugal", "ROU": "Roumanie",
  "RUS": "Russie", "SRB": "Serbie", "SVK": "Slovaquie", "SVN": "Slovénie",
  "SWE": "Suède", "TUR": "Turquie", "UKR": "Ukraine", "XKX": "Kosovo"
};

// Couleurs pour les graphiques
const PIE_COLORS = { 
    'Décarboné': '#22c55e', 
    'Fossile': '#ef4444' 
};
const CURVE_COLORS = { 
    'conso': '#1e3a8a', 
    'import': '#dc2626', // Rouge pour dépendance
    'export': '#16a34a'  // Vert pour autonomie/export
};

// =======================
// ETAT GLOBAL
// =======================
let globalData = new Map(); // Stocke { iso_year: { decarb, fossil, trade, conso, pop } }
let availableYears = [];
let currentGridViewMode = 'pie'; // 'pie' ou 'curve'
let currentGridFlow = 'conso';   // 'conso', 'import', 'export'
let currentGridYear = 2023;
let globalMaxY = 0;

// Elements DOM
const tooltipGrid = d3.select("#tooltip-grid");
if (tooltipGrid.empty()) {
    d3.select("body").append("div").attr("id", "tooltip-grid")
        .style("position", "absolute").style("z-index", "1000")
        .style("visibility", "hidden").style("opacity", "0")
        .style("background", "rgba(30, 41, 59, 0.95)").style("color", "white")
        .style("padding", "8px 12px").style("border-radius", "6px")
        .style("font-size", "0.9rem").style("pointer-events", "none")
        .style("box-shadow", "0 2px 5px rgba(0,0,0,0.3)").style("transition", "opacity 0.2s");
}

// =======================
// INITIALISATION & CHARGEMENT
// =======================

function initGrid() {
    Promise.all([
        d3.csv(PROD_PATH),
        d3.csv(TRADE_PATH),
        d3.csv(CONSO_PATH),
        d3.csv(POP_PATH)
    ]).then(([prod, trade, conso, pop]) => {
        processAllData(prod, trade, conso, pop);
        
        // Initialiser le slider
        const slider = document.getElementById("yearSliderGrid");
        if(availableYears.length > 0) {
            const min = availableYears[0];
            const max = availableYears[availableYears.length - 1];
            slider.min = min;
            slider.max = max;
            slider.value = max;
            currentGridYear = max;
            document.getElementById("gridYearDisplay").innerText = max;
        }

        // Ecouteurs d'événements
        slider.addEventListener("input", function() {
            currentGridYear = +this.value;
            document.getElementById("gridYearDisplay").innerText = currentGridYear;
            if (currentGridViewMode === 'pie') updateGridView();
        });

        // Premier rendu
        updateTexts();
        updateGridView();

    }).catch(err => console.error("Erreur chargement Grid:", err));
}

// =======================
// TRAITEMENT DES DONNÉES
// =======================

function processAllData(prodRows, tradeRows, consoRows, popRows) {
    const yearsSet = new Set();
    const tempStore = new Map(); // Key: "ISO_YEAR"

    const getRecord = (iso, year) => {
        const k = `${iso}_${year}`;
        if (!tempStore.has(k)) {
            tempStore.set(k, { iso, year, decarb: 0, fossil: 0, totalProd: 0, trade: null, conso: 0, pop: 0 });
            yearsSet.add(year);
        }
        return tempStore.get(k);
    };

    // 1. Production (Mix Décarboné vs Fossile)
    prodRows.forEach(d => {
        if (!ISO_TO_FR[d.Code]) return;
        const y = +d.Year;
        const val = (keyword) => {
            const key = Object.keys(d).find(k => k.toLowerCase().includes(keyword.toLowerCase()));
            return key ? (+d[key] || 0) : 0;
        };

        const lowC = val("nuclear") + val("wind") + val("solar") + val("hydro") + val("bioenergy") + val("other renewables");
        const foss = val("coal") + val("gas") + val("oil");
        
        const rec = getRecord(d.Code, y);
        rec.decarb = lowC;
        rec.fossil = foss;
        rec.totalProd = lowC + foss;
    });

    // 2. Trade (Net Imports)
    tradeRows.forEach(d => {
        if (!ISO_TO_FR[d.Code]) return;
        const key = Object.keys(d).find(k => k.includes("Energy imports") || k.includes("Net imports"));
        if (key) getRecord(d.Code, +d.Year).trade = +d[key]; // % du mix ou TWh selon le fichier, ici on assume % dependance pour simplicité ou Net Energy
    });

    // 3. Population
    const popMap = new Map();
    popRows.forEach(d => {
        const keyVal = Object.keys(d).find(k => k.includes("Population") && (k.includes("estimates") || k.includes("medium")));
        if (keyVal) popMap.set(`${d.Code}_${+d.Year}`, +d[keyVal]);
    });

    // 4. Consommation
    consoRows.forEach(d => {
        if (!ISO_TO_FR[d.Code]) return;
        const y = +d.Year;
        const k = Object.keys(d).find(key => key.includes("Primary energy consumption"));
        if (k) {
            const rec = getRecord(d.Code, y);
            rec.conso = +d[k]; // TWh
            const p = popMap.get(`${d.Code}_${y}`);
            if (p > 0) rec.pop = p;
        }
    });

    globalData = tempStore;
    availableYears = Array.from(yearsSet).sort((a, b) => a - b);
}

// =======================
// LOGIQUE D'AFFICHAGE & NAVIGATION
// =======================

// Fonctions appelées depuis le HTML (onclick)
window.switchGridView = function(view) {
    currentGridViewMode = view;
    document.getElementById('btn-pie').className = view === 'pie' ? 'view-btn active' : 'view-btn';
    document.getElementById('btn-curve').className = view === 'curve' ? 'view-btn active' : 'view-btn';
    
    const slider = document.getElementById('grid-slider-wrapper');
    if (view === 'curve') slider.classList.add('hidden'); 
    else slider.classList.remove('hidden');
    
    updateTexts(); 
    updateGridView();
};

window.switchGridFlow = function(flow) {
    currentGridFlow = flow;
    document.getElementById('btn-flow-conso').className = flow === 'conso' ? 'view-btn active' : 'view-btn';
    document.getElementById('btn-flow-import').className = flow === 'import' ? 'view-btn active' : 'view-btn';
    document.getElementById('btn-flow-export').className = flow === 'export' ? 'view-btn active' : 'view-btn';
    
    updateTexts(); 
    updateGridView();
};

function updateTexts() {
    const titleEl = document.getElementById('grid-title');
    const descEl = document.getElementById('grid-desc');
    
    if (currentGridViewMode === 'pie') {
        titleEl.textContent = `Structure de la Production (${currentGridYear})`;
        descEl.innerHTML = `Comparaison du mix électrique : part <span style="color:${PIE_COLORS['Décarboné']}"><strong>Décarbonée</strong></span> vs <span style="color:${PIE_COLORS['Fossile']}"><strong>Fossile</strong></span>.`;
    } else {
        if (currentGridFlow === 'conso') {
            titleEl.textContent = "Trajectoires : Consommation par Habitant";
            descEl.innerHTML = "Évolution de l'énergie primaire consommée par habitant (kWh/hab).";
        } else if (currentGridFlow === 'import') {
            titleEl.textContent = "Trajectoires : Dépendance (Imports)";
            descEl.innerHTML = "Évolution de la dépendance aux importations énergétiques.";
        } else {
            titleEl.textContent = "Trajectoires : Production Décarbonée";
            descEl.innerHTML = "Évolution de la production d'électricité propre (TWh).";
        }
    }
}

function updateGridView() {
    drawGridLegend();
    
    const container = d3.select("#charts-grid");
    container.html("");

    // Trier les pays par nom Français
    const sortedIsos = Object.keys(ISO_TO_FR).sort((a, b) => ISO_TO_FR[a].localeCompare(ISO_TO_FR[b]));

    // Calculer le Max Y global pour les courbes afin qu'elles soient comparables
    if (currentGridViewMode === 'curve') calculateGlobalMax(sortedIsos);

    sortedIsos.forEach(iso => {
        const frName = ISO_TO_FR[iso];
        const card = container.append("div").attr("class", "country-card ui-card");
        
        card.on("click", () => {
            window.location.href = `../production/production.html?country=${encodeURIComponent(frName)}`;
        });

        card.append("div").attr("class", "country-title")
            .attr("title", frName).text(frName);

        const svg = card.append("svg")
            .attr("class", "responsive-svg")
            .attr("viewBox", "0 0 240 180");

        if (currentGridViewMode === 'pie') {
            drawOnePie(svg, iso);
        } else {
            drawOneCurve(svg, iso);
        }
    });
}

function drawGridLegend() {
    const container = d3.select("#legend-content"); 
    container.html("");
    
    if (currentGridViewMode === 'pie') {
        container.html(`
            <div class="legend-item"><div class="legend-color" style="background:${PIE_COLORS['Décarboné']}"></div><span>Décarboné</span></div>
            <div class="legend-item"><div class="legend-color" style="background:${PIE_COLORS['Fossile']}"></div><span>Fossile</span></div>
        `);
    } else {
        let color, label, unit;
        if(currentGridFlow === 'conso') { color = CURVE_COLORS.conso; label = "Conso/Hab"; unit = "kWh"; }
        else if(currentGridFlow === 'import') { color = CURVE_COLORS.import; label = "Dépendance"; unit = "%"; }
        else { color = CURVE_COLORS.export; label = "Prod. Verte"; unit = "TWh"; }

        container.html(`
            <div class="legend-item"><div class="legend-color" style="background:${color}; height:3px;"></div><span>${label} (${unit})</span></div>
        `);
    }
}

// =======================
// DESSIN DES GRAPHIQUES
// =======================

function drawOnePie(svg, iso) {
    const rec = globalData.get(`${iso}_${currentGridYear}`);
    
    // Cas sans données
    if (!rec || rec.totalProd === 0) {
        svg.append("text").attr("x", 120).attr("y", 90).attr("text-anchor", "middle")
           .style("fill", "#94a3b8").style("font-style", "italic").text("Pas de données");
        return;
    }

    const data = [
        { label: "Décarboné", val: rec.decarb, color: PIE_COLORS['Décarboné'] },
        { label: "Fossile", val: rec.fossil, color: PIE_COLORS['Fossile'] }
    ];

    const pie = d3.pie().value(d => d.val).sort(null);
    const arc = d3.arc().innerRadius(0).outerRadius(70);
    const arcHover = d3.arc().innerRadius(0).outerRadius(75);

    const g = svg.append("g").attr("transform", "translate(120,90)");

    g.selectAll("path")
        .data(pie(data))
        .enter().append("path")
        .attr("d", arc)
        .attr("fill", d => d.data.color)
        .attr("stroke", "white").style("stroke-width", "2px")
        .on("mouseover", function(event, d) {
            d3.select(this).transition().duration(200).attr("d", arcHover);
            const pct = rec.totalProd > 0 ? (d.data.val / rec.totalProd) : 0;
            const tooltip = d3.select("#tooltip-grid");
            tooltip.style("visibility", "visible").style("opacity", "1")
                .html(`<b>${d.data.label}</b><br>${d3.format(",.0f")(d.data.val)} TWh<br>(${d3.format(".0%")(pct)})`);
        })
        .on("mousemove", (e) => d3.select("#tooltip-grid").style("left", (e.pageX+10)+"px").style("top", (e.pageY-10)+"px"))
        .on("mouseout", function() {
            d3.select(this).transition().duration(200).attr("d", arc);
            d3.select("#tooltip-grid").style("opacity", "0").style("visibility", "hidden");
        });
}

function calculateGlobalMax(isos) {
    // Calcul du Y max pour que toutes les courbes aient la même échelle
    let max = 0;
    isos.forEach(iso => {
        availableYears.forEach(y => {
            const rec = globalData.get(`${iso}_${y}`);
            if (rec) {
                let val = 0;
                if(currentGridFlow === 'conso' && rec.pop > 0) val = (rec.conso * 1e9) / rec.pop;
                else if(currentGridFlow === 'import' && rec.trade !== null) val = rec.trade; // %
                else if(currentGridFlow === 'export') val = rec.decarb; // TWh
                
                // On ignore les valeurs absurdes ou négatives extrêmes pour l'échelle auto
                if (!isNaN(val) && Math.abs(val) > max) max = Math.abs(val);
            }
        });
    });
    // Pour les % (trade), on cape souvent à 100 ou on laisse libre
    if(currentGridFlow === 'import') globalMaxY = 100; 
    else globalMaxY = max > 0 ? max * 1.1 : 100;
}

function drawOneCurve(svg, iso) {
    // Préparer les données temporelles
    const data = availableYears.map(y => {
        const rec = globalData.get(`${iso}_${y}`);
        if(!rec) return null;
        
        let val = null;
        if (currentGridFlow === 'conso') {
            val = (rec.pop > 0) ? (rec.conso * 1e9) / rec.pop : null;
        } else if (currentGridFlow === 'import') {
            val = rec.trade; // Peut être négatif
        } else if (currentGridFlow === 'export') {
            // Ici, j'utilise "Export" pour montrer la production décarbonée (choix éditorial)
            // ou on pourrait mettre les Exports si la colonne existait distinctement
            val = rec.decarb; 
        }
        return { year: y, val };
    }).filter(d => d && d.val !== null);

    if (data.length === 0) {
        svg.append("text").attr("x", 120).attr("y", 90).attr("text-anchor", "middle").style("fill", "#94a3b8").text("N/A");
        return;
    }

    const margin = { top: 20, right: 10, bottom: 30, left: 40 };
    const width = 240 - margin.left - margin.right;
    const height = 180 - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Echelles
    const x = d3.scaleLinear().domain(d3.extent(availableYears)).range([0, width]);
    
    let yDomain = [0, globalMaxY];
    if(currentGridFlow === 'import') yDomain = [-100, 100]; // Pour voir import/export
    const y = d3.scaleLinear().domain(yDomain).range([height, 0]);

    // Ligne
    const line = d3.line()
        .defined(d => !isNaN(d.val))
        .x(d => x(d.year))
        .y(d => y(d.val));

    // Ligne zéro si nécessaire
    if (currentGridFlow === 'import') {
        g.append("line").attr("x1", 0).attr("x2", width).attr("y1", y(0)).attr("y2", y(0))
         .attr("stroke", "#cbd5e1").attr("stroke-dasharray", "4");
    }

    // Tracer la courbe
    let color = CURVE_COLORS[currentGridFlow];
    g.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2)
        .attr("d", line);

    // Axes simplifiés
    g.append("g").attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(3).tickFormat(d3.format("d"))).select(".domain").remove();
    g.append("g")
        .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".2s"))).select(".domain").remove();

    // Interaction Hover
    const rect = g.append("rect").attr("width", width).attr("height", height).style("fill", "transparent");
    const hoverLine = g.append("line").attr("y1", 0).attr("y2", height).attr("stroke", "#64748b").style("opacity", 0);

    rect.on("mousemove", function(event) {
        const [mx] = d3.pointer(event);
        const year = Math.round(x.invert(mx));
        const d = data.find(i => i.year === year);
        
        if(d) {
            hoverLine.attr("x1", x(year)).attr("x2", x(year)).style("opacity", 1);
            const tooltip = d3.select("#tooltip-grid");
            let valStr = d3.format(",.0f")(d.val);
            let unit = currentGridFlow==='conso'?"kWh": (currentGridFlow==='import'?"%":"TWh");
            
            tooltip.style("visibility", "visible").style("opacity", "1")
                .html(`<b>${year}</b><br>${valStr} ${unit}`)
                .style("left", (event.pageX+15)+"px").style("top", (event.pageY-15)+"px");
        }
    }).on("mouseout", () => {
        hoverLine.style("opacity", 0);
        d3.select("#tooltip-grid").style("opacity", "0");
    });
}

// Lancer l'initialisation
initGrid();