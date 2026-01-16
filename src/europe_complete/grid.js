// =======================
// CONFIG GRID
// =======================
// Mise à jour de la palette pour les 5 catégories + Autre
const PIE_COLORS = { 
    'Renouvelables': '#37db3f', // Vert clair
    'Nucléaire': '#0e9240',     // Vert foncé
    'Gaz': '#f53a0b',           // Orange vif
    'Pétrole': '#e63636',       // Rouge
    'Charbon': '#991b1b',       // Rouge sombre
    'Autre': '#94a3b8'          // Gris (réservé)
};
const CURVE_COLORS = { 
    'decarb': '#22c55e',    // Vert pour décarboné
    'fossil': '#ef4444',    // Rouge pour fossile
    'export': '#3b82f6',    // Bleu pour exportateur
    'import': '#dc2626',    // Rouge pour importateur
    'conso': '#8b5cf6'      // Violet pour conso/hab
};

let gridCategory = 'mix';  // 'mix', 'evolution', 'independence', 'conso'
let gridYear = 2023;

const tooltipGrid = d3.select("body").select("#tooltip-grid").empty() 
    ? d3.select("body").append("div").attr("id", "tooltip-grid")
        .style("position", "absolute").style("z-index", "1000").style("visibility", "hidden")
        .style("background", "rgba(30, 41, 59, 0.95)").style("color", "white")
        .style("padding", "8px 12px").style("border-radius", "6px")
        .style("font-size", "0.9rem").style("pointer-events", "none")
    : d3.select("#tooltip-grid");

// =======================
// INITIALISATION
// =======================
window.initGrid = function() {
    console.log("Grid Init");
    const shared = window.sharedData;
    if (!shared || !shared.years) return;

    const years = shared.years;
    const maxYear = years[years.length - 1];
    gridYear = Math.min(2023, maxYear);

    const slider = document.getElementById("yearSliderGrid");
    if(slider) {
        slider.min = 1990;
        slider.max = Math.min(2023, maxYear);
        slider.value = gridYear;
        document.getElementById("gridYearDisplay").innerText = gridYear;
        
        slider.addEventListener("input", function() {
            gridYear = this.value;
            document.getElementById("gridYearDisplay").innerText = gridYear;
            if (gridCategory === 'mix') drawGrid();
        });
    }

    setupGridListeners();
    updateTexts();
};

window.updateGridView = function() {
    drawGrid();
};

function setupGridListeners() {
    window.switchGridCategory = function(category) {
        gridCategory = category;
        document.getElementById('btn-mix').className = category === 'mix' ? 'view-btn active' : 'view-btn';
        document.getElementById('btn-evolution').className = category === 'evolution' ? 'view-btn active' : 'view-btn';
        document.getElementById('btn-independence').className = category === 'independence' ? 'view-btn active' : 'view-btn';
        document.getElementById('btn-conso').className = category === 'conso' ? 'view-btn active' : 'view-btn';
        
        const slider = document.getElementById('grid-slider-wrapper');
        
        if(category === 'mix') {
            slider.classList.remove('hidden');
        } else {
            slider.classList.add('hidden');
        }
        updateTexts();
        drawGrid();
    };
}

function updateTexts() {
    const title = document.getElementById('grid-title');
    const desc = document.getElementById('grid-desc');
    
    switch(gridCategory) {
        case 'mix':
            title.innerText = `Composition du Mix`;
            desc.innerHTML = `Identifiez les piliers de la production électrique :<br><b>Bas-carbonne</b> (Renouvelables et Nucléaire) ou <b>Fossiles</b> (Charbon, Gaz et Pétrole).`;
            break;
        case 'evolution':
            title.innerText = "Trajectoires de Transition";
            desc.innerHTML = `Comparaison historique.<br>Observez la vitesse de remplacement du <b>Fossile</b> par le <b>Bas-Carbone</b>.`;
            break;
        case 'independence':
            title.innerText = "Balance Commerciale";
            desc.innerHTML = `Solde des échanges (% de la production locale).<br>Une valeur <b>négative</b> signifie que le pays exporte (il vend).`;
            break;
        case 'conso':
            title.innerText = "Intensité Énergétique";
            desc.innerHTML = `Consommation par habitant (kWh/an).<br>Permet de comparer les besoins réels, <b>indépendamment de la taille du pays</b>.`;
            break;
    }
}

// =======================
// SORTING & SCALES
// =======================
function getSortedCountries(dataMap, years) {
    const countries = Object.keys(window.ISO_TO_FR).filter(iso => iso !== 'MLT'); // Exclure Malte
    const startYear = 1990;
    const endYear = 2023;
    const relevantYears = years.filter(y => y >= startYear && y <= endYear);
    
    const countryScores = countries.map(iso => {
        let score = 0;
        let count = 0;
        
        relevantYears.forEach(y => {
            const rec = dataMap.get(`${iso}_${y}`);
            if(!rec) return;
            
            // Utiliser toujours la production totale pour le tri
            if(rec.totalProd > 0) {
                score += rec.totalProd;
                count++;
            }
        });
        
        return {
            iso,
            avgScore: count > 0 ? score / count : 0,
            count
        };
    });
    
    return countryScores
        .filter(c => c.count > 0)
        .sort((a, b) => b.avgScore - a.avgScore)
        .map(c => c.iso);
}

function getGlobalScales(dataMap, years, countries) {
    const startYear = 1990;
    const relevantYears = years.filter(y => y >= startYear);
    
    let scales = {
        evolution: { maxDecarb: 0, maxFossil: 0 },
        independence: { min: 0, max: 0 },
        conso: { max: 0 }
    };
    
    countries.forEach(iso => {
        relevantYears.forEach(y => {
            const rec = dataMap.get(`${iso}_${y}`);
            if(!rec) return;
            
            if(rec.decarb !== null) scales.evolution.maxDecarb = Math.max(scales.evolution.maxDecarb, rec.decarb);
            if(rec.carb !== null) scales.evolution.maxFossil = Math.max(scales.evolution.maxFossil, rec.carb);
            if(rec.trade !== null) {
                scales.independence.min = Math.min(scales.independence.min, rec.trade);
                scales.independence.max = Math.max(scales.independence.max, rec.trade);
            }
            if(rec.conso !== null) scales.conso.max = Math.max(scales.conso.max, rec.conso);
        });
    });
    
    return scales;
}

// =======================
// DRAW
// =======================
function drawGrid() {
    const container = d3.select("#charts-grid");
    container.html("");
    
    const shared = window.sharedData;
    if(!shared) return;
    
    const allCountries = Object.keys(window.ISO_TO_FR).filter(iso => iso !== 'MLT'); // Exclure Malte
    const sortedCountries = getSortedCountries(shared.annualData, shared.years);
    const globalScales = getGlobalScales(shared.annualData, shared.years, allCountries);

    drawLegend();

    sortedCountries.forEach(iso => {
        const frName = window.ISO_TO_FR[iso];
        const card = container.append("div").attr("class", "country-card ui-card");
        card.on("click", () => {
            if (window.isoToEn) {
                const enName = window.isoToEn.get(iso);
                if (enName && window.updateProductionChart) {
                    window.updateProductionChart(enName);

                    const targetElement = document.getElementById('production-section');
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            }
        });
        card.append("div").attr("class", "country-title").text(frName);
        
        const svg = card.append("svg").attr("class", "responsive-svg").attr("viewBox", "0 0 200 120");
        
        switch(gridCategory) {
            case 'mix':
                drawPie(svg, iso, shared.annualData);
                break;
            case 'evolution':
                drawEvolution(svg, iso, shared.annualData, shared.years, globalScales.evolution);
                break;
            case 'independence':
                drawIndependence(svg, iso, shared.annualData, shared.years, globalScales.independence);
                break;
            case 'conso':
                drawConsoPerCapita(svg, iso, shared.annualData, shared.years, globalScales.conso);
                break;
        }
    });
}

function drawLegend() {
    const el = d3.select("#legend-content");
    el.html("");
    
    switch(gridCategory) {
        case 'mix':
            const keysToShow = ['Renouvelables', 'Nucléaire', 'Gaz', 'Pétrole', 'Charbon'];
            const items = keysToShow.map(k => 
                `<div class="legend-item"><div class="legend-color" style="background:${PIE_COLORS[k]}"></div>${k}</div>`
            ).join("");
            el.html(items);
            break;
        case 'evolution':
            el.html(`
                <div class="legend-item"><div class="legend-color" style="background:${CURVE_COLORS.decarb};height:3px"></div>Décarbonée</div>
                <div class="legend-item"><div class="legend-color" style="background:${CURVE_COLORS.fossil};height:3px"></div>Fossile</div>
            `);
            break;
        case 'independence':
            el.html(`
                <div class="legend-item"><div class="legend-color" style="background:${CURVE_COLORS.export};height:3px"></div>Exportateur</div>
                <div class="legend-item"><div class="legend-color" style="background:${CURVE_COLORS.import};height:3px"></div>Importateur</div>
            `);
            break;
        case 'conso':
            el.html(`<div class="legend-item"><div class="legend-color" style="background:${CURVE_COLORS.conso};height:3px"></div>Conso/hab</div>`);
            break;
    }
}

function drawPie(svg, iso, dataMap) {
    const rec = dataMap.get(`${iso}_${gridYear}`);
    if(!rec || rec.totalProd === 0) {
        svg.append("text").attr("x",100).attr("y",60).attr("text-anchor","middle").style("fill","#999").style("font-size","10px").text("N/A");
        return;
    }
    
    // Construction des données pour les 5 catégories
    const data = [
        { l:"Renouvelables", v: rec.renewables, c: PIE_COLORS.Renouvelables },
        { l:"Nucléaire", v: rec.nuclear, c: PIE_COLORS.Nucléaire },
        { l:"Gaz", v: rec.gas, c: PIE_COLORS.Gaz },
        { l:"Pétrole", v: rec.oil, c: PIE_COLORS.Pétrole },
        { l:"Charbon", v: rec.coal, c: PIE_COLORS.Charbon }
    ].filter(d => d.v > 0);

    if(data.length === 0) {
        svg.append("text").attr("x",100).attr("y",60).attr("text-anchor","middle").style("fill","#999").style("font-size","10px").text("0 TWh");
        return;
    }

    const pie = d3.pie().value(d => d.v).sort(null);
    const arc = d3.arc().innerRadius(0).outerRadius(50);
    const g = svg.append("g").attr("transform", "translate(100,60)");
    
    g.selectAll("path").data(pie(data)).enter().append("path")
        .attr("d", arc).attr("fill", d=>d.data.c).attr("stroke","white").attr("stroke-width", 0.5)
        .on("mouseover", (e,d)=>{
            const pct = d.data.v / rec.totalProd;
            tooltipGrid.style("visibility","visible").style("opacity",1)
                .html(`<b>${d.data.l}</b><br>${d3.format(".1f")(d.data.v)} TWh (${d3.format(".0%")(pct)})`)
                .style("left",(e.pageX+10)+"px").style("top",(e.pageY-10)+"px");
        })
        .on("mouseout", ()=>tooltipGrid.style("opacity",0));
}

function drawEvolution(svg, iso, dataMap, years, scales) {
    const startYear = 1990;
    const relevantYears = years.filter(y => y >= startYear);
    const data = relevantYears.map(y => {
        const rec = dataMap.get(`${iso}_${y}`);
        if(!rec) return null;
        return { y, decarb: rec.decarb, fossil: rec.carb };
    }).filter(d => d && (d.decarb !== null || d.fossil !== null));

    if(data.length === 0) {
        svg.append("text").attr("x",100).attr("y",60).attr("text-anchor","middle").style("fill","#999").style("font-size","10px").text("N/A");
        return;
    }

    const margin = {top:10, right:10, bottom:20, left:35};
    const width = 200 - margin.left - margin.right;
    const height = 120 - margin.top - margin.bottom;
    
    const x = d3.scaleLinear().domain([startYear, Math.max(...relevantYears)]).range([0, width]);
    const maxVal = Math.max(scales.maxDecarb, scales.maxFossil);
    const y = d3.scaleLinear().domain([0, maxVal * 1.1]).range([height, 0]);

    const lineDecarb = d3.line().x(d => x(d.y)).y(d => y(d.decarb || 0));
    const lineFossil = d3.line().x(d => x(d.y)).y(d => y(d.fossil || 0));
    
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Courbe décarbonée
    g.append("path").datum(data).attr("fill","none")
        .attr("stroke", CURVE_COLORS.decarb).attr("stroke-width", 2).attr("d", lineDecarb);
    
    // Courbe fossile
    g.append("path").datum(data).attr("fill","none")
        .attr("stroke", CURVE_COLORS.fossil).attr("stroke-width", 2).attr("d", lineFossil);
    
    g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(3).tickFormat(d3.format("d")));
    g.append("g").call(d3.axisLeft(y).ticks(3).tickFormat(d3.format(".2s")));
    
    // Hover line
    const hoverLine = g.append("line")
        .attr("y1", 0).attr("y2", height)
        .attr("stroke", "#94a3b8").attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3")
        .style("opacity", 0);
    
    const yearLabel = g.append("text")
        .attr("y", height + 15)
        .attr("text-anchor", "middle")
        .style("font-size", "9px")
        .style("fill", "#64748b")
        .style("opacity", 0);
    
    const rect = g.append("rect").attr("width", width).attr("height", height).style("fill","transparent");
    rect.on("mousemove", function(e) {
        const mx = d3.pointer(e)[0];
        const year = Math.round(x.invert(mx));
        const d = data.find(i => i.y === year);
        if(d) {
            hoverLine.attr("x1", x(year)).attr("x2", x(year)).style("opacity", 1);
            yearLabel.attr("x", x(year)).text(year).style("opacity", 1);
            tooltipGrid.style("visibility","visible").style("opacity",1)
                .html(`<b>${year}</b><br>Décarbonée: ${d3.format(",.0f")(d.decarb || 0)} TWh<br>Fossile: ${d3.format(",.0f")(d.fossil || 0)} TWh`)
                .style("left",(e.pageX+10)+"px").style("top",(e.pageY-10)+"px");
        }
    }).on("mouseout", () => {
        hoverLine.style("opacity", 0);
        yearLabel.style("opacity", 0);
        tooltipGrid.style("opacity",0);
    });
}

function drawIndependence(svg, iso, dataMap, years, scales) {
    const startYear = 1990;
    const relevantYears = years.filter(y => y >= startYear);
    const data = relevantYears.map(y => {
        const rec = dataMap.get(`${iso}_${y}`);
        if(!rec || rec.trade === null) return null;
        return { y, v: rec.trade };
    }).filter(d => d);

    if(data.length === 0) {
        svg.append("text").attr("x",100).attr("y",60).attr("text-anchor","middle").style("fill","#999").style("font-size","10px").text("N/A");
        return;
    }

    const margin = {top:10, right:10, bottom:20, left:35};
    const width = 200 - margin.left - margin.right;
    const height = 120 - margin.top - margin.bottom;
    
    const x = d3.scaleLinear().domain([startYear, Math.max(...relevantYears)]).range([0, width]);
    
    // Échelle logarithmique symétrique
    const absMax = Math.max(Math.abs(scales.min), Math.abs(scales.max), 1);
    const y = d3.scaleSymlog().domain([-absMax * 1.1, absMax * 1.1]).range([height, 0]);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Ligne zéro
    g.append("line").attr("x1", 0).attr("x2", width).attr("y1", y(0)).attr("y2", y(0))
        .attr("stroke","#cbd5e1").attr("stroke-width", 1.5);

    // Segments colorés selon export/import
    for(let i = 0; i < data.length - 1; i++) {
        const d1 = data[i];
        const d2 = data[i + 1];
        const color = d1.v < 0 ? CURVE_COLORS.export : CURVE_COLORS.import;
        
        g.append("line")
            .attr("x1", x(d1.y)).attr("y1", y(d1.v))
            .attr("x2", x(d2.y)).attr("y2", y(d2.v))
            .attr("stroke", color).attr("stroke-width", 2);
    }
    
    g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(3).tickFormat(d3.format("d")));
    g.append("g").call(d3.axisLeft(y).ticks(3).tickFormat(d3.format(".0f")));
    
    // Hover line
    const hoverLine = g.append("line")
        .attr("y1", 0).attr("y2", height)
        .attr("stroke", "#94a3b8").attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3")
        .style("opacity", 0);
    
    const yearLabel = g.append("text")
        .attr("y", height + 15)
        .attr("text-anchor", "middle")
        .style("font-size", "9px")
        .style("fill", "#64748b")
        .style("opacity", 0);
    
    const rect = g.append("rect").attr("width", width).attr("height", height).style("fill","transparent");
    rect.on("mousemove", function(e) {
        const mx = d3.pointer(e)[0];
        const year = Math.round(x.invert(mx));
        const d = data.find(i => i.y === year);
        if(d) {
            hoverLine.attr("x1", x(year)).attr("x2", x(year)).style("opacity", 1);
            yearLabel.attr("x", x(year)).text(year).style("opacity", 1);
            const status = d.v < 0 ? "Exportateur" : "Importateur";
            tooltipGrid.style("visibility","visible").style("opacity",1)
                .html(`<b>${year}</b><br>${status}: ${d3.format("+.1f")(d.v)}%`)
                .style("left",(e.pageX+10)+"px").style("top",(e.pageY-10)+"px");
        }
    }).on("mouseout", () => {
        hoverLine.style("opacity", 0);
        yearLabel.style("opacity", 0);
        tooltipGrid.style("opacity",0);
    });
}

function drawConsoPerCapita(svg, iso, dataMap, years, scales) {
    const startYear = 1990;
    const relevantYears = years.filter(y => y >= startYear);
    const data = relevantYears.map(y => {
        const rec = dataMap.get(`${iso}_${y}`);
        if(!rec || rec.conso === null) return null;
        return { y, v: rec.conso };
    }).filter(d => d);

    if(data.length === 0) {
        svg.append("text").attr("x",100).attr("y",60).attr("text-anchor","middle").style("fill","#999").style("font-size","10px").text("N/A");
        return;
    }

    const margin = {top:10, right:10, bottom:20, left:35};
    const width = 200 - margin.left - margin.right;
    const height = 120 - margin.top - margin.bottom;
    
    const x = d3.scaleLinear().domain([startYear, Math.max(...relevantYears)]).range([0, width]);
    const y = d3.scaleLinear().domain([0, scales.max * 1.1]).range([height, 0]);

    const line = d3.line().x(d => x(d.y)).y(d => y(d.v));
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    
    g.append("path").datum(data).attr("fill","none")
        .attr("stroke", CURVE_COLORS.conso).attr("stroke-width", 2).attr("d", line);
    
    g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(3).tickFormat(d3.format("d")));
    g.append("g").call(d3.axisLeft(y).ticks(3).tickFormat(d3.format(".2s")));
    
    // Hover line
    const hoverLine = g.append("line")
        .attr("y1", 0).attr("y2", height)
        .attr("stroke", "#94a3b8").attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3")
        .style("opacity", 0);
    
    const yearLabel = g.append("text")
        .attr("y", height + 15)
        .attr("text-anchor", "middle")
        .style("font-size", "9px")
        .style("fill", "#64748b")
        .style("opacity", 0);
    
    const rect = g.append("rect").attr("width", width).attr("height", height).style("fill","transparent");
    rect.on("mousemove", function(e) {
        const mx = d3.pointer(e)[0];
        const year = Math.round(x.invert(mx));
        const d = data.find(i => i.y === year);
        if(d) {
            hoverLine.attr("x1", x(year)).attr("x2", x(year)).style("opacity", 1);
            yearLabel.attr("x", x(year)).text(year).style("opacity", 1);
            tooltipGrid.style("visibility","visible").style("opacity",1)
                .html(`<b>${year}</b><br>${d3.format(",.0f")(d.v)} kWh/hab`)
                .style("left",(e.pageX+10)+"px").style("top",(e.pageY-10)+"px");
        }
    }).on("mouseout", () => {
        hoverLine.style("opacity", 0);
        yearLabel.style("opacity", 0);
        tooltipGrid.style("opacity",0);
    });
}