// =======================
// CONFIG GRID
// =======================
const PIE_COLORS = { 'Décarboné': '#22c55e', 'Fossile': '#ef4444' };
const CURVE_COLORS = { 'conso': '#1e3a8a', 'import': '#dc2626', 'export': '#16a34a' };

let gridMode = 'pie';
let gridSubMetric = 'conso';
let gridYear = 2023; // Valeur par défaut avant chargement

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
    gridYear = maxYear;

    const slider = document.getElementById("yearSliderGrid");
    if(slider) {
        slider.min = years[0];
        slider.max = maxYear;
        slider.value = maxYear;
        document.getElementById("gridYearDisplay").innerText = maxYear;
        
        slider.addEventListener("input", function() {
            gridYear = this.value;
            document.getElementById("gridYearDisplay").innerText = gridYear;
            if (gridMode === 'pie') drawGrid();
        });
    }

    setupGridListeners();
    updateTexts();
    // On ne dessine pas tout de suite si la vue est cachée, mais c'est prêt.
};

window.updateGridView = function() {
    drawGrid();
};

function setupGridListeners() {
    window.switchGridView = function(view) {
        gridMode = view;
        document.getElementById('btn-pie').className = view === 'pie' ? 'view-btn active' : 'view-btn';
        document.getElementById('btn-curve').className = view === 'curve' ? 'view-btn active' : 'view-btn';
        
        const slider = document.getElementById('grid-slider-wrapper');
        const metricSwitch = document.querySelector('.internal-view-switch:nth-child(3)');
        
        if(view === 'pie') {
            slider.classList.remove('hidden');
            // Gérer visibilité switch si besoin
        } else {
            slider.classList.add('hidden');
        }
        updateTexts();
        drawGrid();
    };

    window.switchGridFlow = function(flow) {
        gridSubMetric = flow;
        document.getElementById('btn-flow-conso').className = flow === 'conso' ? 'view-btn active' : 'view-btn';
        document.getElementById('btn-flow-import').className = flow === 'import' ? 'view-btn active' : 'view-btn';
        document.getElementById('btn-flow-export').className = flow === 'export' ? 'view-btn active' : 'view-btn';
        updateTexts();
        drawGrid();
    };
}

function updateTexts() {
    const title = document.getElementById('grid-title');
    const desc = document.getElementById('grid-desc');
    if(gridMode === 'pie') {
        title.innerText = `Mix Électrique (${gridYear})`;
        desc.innerHTML = `Comparaison Décarboné vs Fossile.`;
    } else {
        title.innerText = "Trajectoires Historiques";
        desc.innerText = "Évolution temporelle.";
    }
}

// =======================
// DRAW
// =======================
function drawGrid() {
    const container = d3.select("#charts-grid");
    container.html("");
    
    // Récupérer données partagées
    const shared = window.sharedData;
    if(!shared) return;
    
    const countries = Object.keys(window.ISO_TO_FR).sort((a,b) => window.ISO_TO_FR[a].localeCompare(window.ISO_TO_FR[b]));

    drawLegend();

    countries.forEach(iso => {
        const frName = window.ISO_TO_FR[iso];
        const card = container.append("div").attr("class", "country-card ui-card");
        card.on("click", () => window.location.href = `../production/production.html?country=${encodeURIComponent(frName)}`);
        card.append("div").attr("class", "country-title").text(frName);
        
        const svg = card.append("svg").attr("class", "responsive-svg").attr("viewBox", "0 0 200 120");
        
        if(gridMode === 'pie') drawPie(svg, iso, shared.annualData);
        else drawCurve(svg, iso, shared.annualData, shared.years);
    });
}

function drawLegend() {
    const el = d3.select("#legend-content");
    el.html("");
    if(gridMode === 'pie') {
        el.html(`<div class="legend-item"><div class="legend-color" style="background:${PIE_COLORS.Décarboné}"></div>Décarboné</div><div class="legend-item"><div class="legend-color" style="background:${PIE_COLORS.Fossile}"></div>Fossile</div>`);
    } else {
        const c = CURVE_COLORS[gridSubMetric];
        el.html(`<div class="legend-item"><div class="legend-color" style="background:${c};height:3px"></div>Courbe</div>`);
    }
}

function drawPie(svg, iso, dataMap) {
    // dataMap utilise la clé "ISO_YEAR"
    const rec = dataMap.get(`${iso}_${gridYear}`);
    if(!rec || rec.totalProd === 0) {
        svg.append("text").attr("x",100).attr("y",60).attr("text-anchor","middle").style("fill","#999").style("font-size","10px").text("N/A");
        return;
    }
    const data = [
        { l:"Décarboné", v: rec.decarb, c: PIE_COLORS.Décarboné },
        { l:"Fossile", v: rec.carb, c: PIE_COLORS.Fossile }
    ];
    const pie = d3.pie().value(d => d.v).sort(null);
    const arc = d3.arc().innerRadius(0).outerRadius(50);
    const g = svg.append("g").attr("transform", "translate(100,60)");
    
    g.selectAll("path").data(pie(data)).enter().append("path")
        .attr("d", arc).attr("fill", d=>d.data.c).attr("stroke","white")
        .on("mouseover", (e,d)=>{
            const pct = d.data.v / rec.totalProd;
            tooltipGrid.style("visibility","visible").style("opacity",1)
                .html(`<b>${d.data.l}</b><br>${d3.format(".1f")(d.data.v)} TWh (${d3.format(".0%")(pct)})`)
                .style("left",(e.pageX+10)+"px").style("top",(e.pageY-10)+"px");
        })
        .on("mouseout", ()=>tooltipGrid.style("opacity",0));
}

function drawCurve(svg, iso, dataMap, years) {
    const data = years.map(y => {
        const rec = dataMap.get(`${iso}_${y}`);
        if(!rec) return null;
        let v = null;
        if(gridSubMetric==='conso') v = rec.conso; // Déjà calculé en kWh/hab dans europe.js
        else if(gridSubMetric==='import') v = rec.trade; // %
        else v = rec.decarb; // TWh
        return { y, v };
    }).filter(d => d && d.v !== null);

    if(data.length===0) {
        svg.append("text").attr("x",100).attr("y",60).attr("text-anchor","middle").style("fill","#999").style("font-size","10px").text("N/A");
        return;
    }

    const margin={top:10, right:10, bottom:20, left:35};
    const width=200-margin.left-margin.right, height=120-margin.top-margin.bottom;
    
    const x = d3.scaleLinear().domain(d3.extent(years)).range([0, width]);
    let yDom = [0, d3.max(data, d=>d.v)*1.1];
    if(gridSubMetric==='import') yDom = [-100, 100]; // Fixe pour import
    const y = d3.scaleLinear().domain(yDom).range([height, 0]);

    const line = d3.line().x(d=>x(d.y)).y(d=>y(d.v));
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Ligne zéro
    if(gridSubMetric==='import') g.append("line").attr("x1",0).attr("x2",width).attr("y1",y(0)).attr("y2",y(0)).attr("stroke","#ccc").attr("stroke-dasharray","3");

    g.append("path").datum(data).attr("fill","none").attr("stroke", CURVE_COLORS[gridSubMetric]).attr("stroke-width",2).attr("d", line);
    g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(3).tickFormat(d3.format("d")));
    g.append("g").call(d3.axisLeft(y).ticks(3).tickFormat(d3.format(".2s")));
    
    // Overlay interactif
    const rect = g.append("rect").attr("width",width).attr("height",height).style("fill","transparent");
    rect.on("mousemove", function(e) {
        const mx = d3.pointer(e)[0];
        const year = Math.round(x.invert(mx));
        const d = data.find(i=>i.y===year);
        if(d) {
            tooltipGrid.style("visibility","visible").style("opacity",1)
                .html(`<b>${year}</b>: ${d3.format(",.0f")(d.v)}`)
                .style("left",(e.pageX+10)+"px").style("top",(e.pageY-10)+"px");
        }
    }).on("mouseout", ()=>tooltipGrid.style("opacity",0));
}   