// --- 1. CONFIGURATION ---
const FLOW = "Total energy supply (PJ)";

// 1. Liste technique (Doit rester en ANGLAIS pour lire le fichier CSV correctement)
const EUROPE_COUNTRIES = [
    "Austria", "Belgium", "Czech Republic", "Denmark", "Estonia", "Finland",
    "France", "Germany", "Greece", "Hungary", "Ireland", "Italy",
    "Latvia", "Lithuania", "Luxembourg", "Netherlands", "Norway", "Poland",
    "Portugal", "Slovak Republic", "Slovenia", "Spain", "Sweden", "Switzerland",
    "United Kingdom"
];

// 2. Traduction pour l'affichage (Anglais -> Français)
const COUNTRY_TRANSLATIONS = {
    "Austria": "Autriche",
    "Belgium": "Belgique",
    "Czech Republic": "République Tchèque",
    "Denmark": "Danemark",
    "Estonia": "Estonie",
    "Finland": "Finlande",
    "France": "France",
    "Germany": "Allemagne",
    "Greece": "Grèce",
    "Hungary": "Hongrie",
    "Ireland": "Irlande",
    "Italy": "Italie",
    "Latvia": "Lettonie",
    "Lithuania": "Lituanie",
    "Luxembourg": "Luxembourg",
    "Netherlands": "Pays-Bas",
    "Norway": "Norvège",
    "Poland": "Pologne",
    "Portugal": "Portugal",
    "Slovak Republic": "Slovaquie",
    "Slovenia": "Slovénie",
    "Spain": "Espagne",
    "Sweden": "Suède",
    "Switzerland": "Suisse",
    "United Kingdom": "Royaume-Uni"
};

// 3. Configuration des Énergies (Clé CSV -> Nom affiché en Français)
const CATEGORY_MAP = {
    'Coal, peat and oil shale': 'Charbon',
    'Crude, NGL and feedstocks': 'Pétrole',
    'Oil products': 'Pétrole',
    'Natural gas': 'Gaz',
    'Nuclear': 'Nucléaire',
    'Renewables and waste': 'Renouvelables',
    'Hydro': 'Renouvelables',
    'Geothermal': 'Renouvelables',
    'Solar/wind/other': 'Renouvelables',
    'Biofuels and waste': 'Renouvelables',
    'Electricity': 'Électricité',
    'Heat': 'Chaleur'
};

// 4. Couleurs (Les clés doivent être en FRANÇAIS pour correspondre au mapping ci-dessus)
const COLORS = {
    'Charbon': '#991b1b',      
    'Pétrole': '#e63636',       
    'Gaz': '#f53a0b',       
    'Nucléaire': '#0e9240',   
    'Renouvelables': '#37db3f',
    'Autre': '#94a3b8' 
};

// 5. Ordre d'affichage (En FRANÇAIS)
const CATEGORY_ORDER = ['Renouvelables', 'Nucléaire', 'Gaz', 'Pétrole', 'Charbon', 'Autre'];

// --- 2. LOGIQUE ---
let loadedData = [];

// Création de l'infobulle
const tooltip = d3.select("body").append("div")
    .attr("id", "tooltip")
    .style("position", "absolute")
    .style("z-index", "1000")
    .style("visibility", "hidden")
    .style("opacity", "0")
    .style("background", "rgba(30, 41, 59, 0.95)")
    .style("color", "white")
    .style("padding", "8px 12px")
    .style("border-radius", "6px")
    .style("font-size", "0.9rem")
    .style("pointer-events", "none")
    .style("box-shadow", "0 2px 5px rgba(0,0,0,0.3)")
    .style("transition", "opacity 0.2s");

d3.csv("TimeSeries.csv").then(data => {
    loadedData = data;
    drawLegend();
    updateYear("2003");
    
    const slider = document.getElementById("yearSlider");
    if(slider) {
        slider.addEventListener("input", function() {
            updateYear(this.value);
        });
    }
}).catch(err => { console.error(err); });

function updateYear(selectedYear) {
    const display = document.getElementById("yearDisplay");
    if(display) display.innerText = selectedYear;
    drawGrid(loadedData, selectedYear);
}

function drawLegend() {
    const container = d3.select("#legend-content");
    container.html(""); 
    
    CATEGORY_ORDER.forEach(cat => {
        if(!COLORS[cat] || cat === 'Autre' || cat === 'Électricité' || cat === 'Chaleur') return;
        const row = container.append("div").attr("class", "legend-item");
        row.append("div").attr("class", "legend-color").style("background", COLORS[cat]);
        row.append("span").text(cat);
    });
}

function drawGrid(data, year) {
    const container = d3.select("#charts-grid");
    container.html(""); 

    EUROPE_COUNTRIES.forEach(country => {
        const countryData = processData(data, country, year);
        
        // On crée la carte MÊME si total === 0
        const card = container.append("div").attr("class", "country-card");
        
        // Titre traduit
        const frenchName = COUNTRY_TRANSLATIONS[country] || country;
        card.append("div").attr("class", "country-title").text(frenchName);

        // --- CONDITION D'AFFICHAGE ---
        if (countryData.total === 0) {
            // CAS 1 : PAS DE DONNÉES
            // On affiche un message à la place du SVG
            card.append("div")
                .style("height", "120px") // Même hauteur que le graphique pour alignement
                .style("display", "flex")
                .style("align-items", "center")
                .style("justify-content", "center")
                .style("text-align", "center")
                .style("color", "#94a3b8") // Gris clair
                .style("font-size", "0.8rem")
                .style("font-style", "italic")
                .text("Pas de données pour cette année");
        
        } else {
            // CAS 2 : ON A DES DONNÉES -> DESSIN DU CAMEMBERT
            const width = 120, height = 120, radius = 60;
            const svg = card.append("svg")
                .attr("width", width).attr("height", height)
                .append("g").attr("transform", `translate(${width/2},${height/2})`);

            const pie = d3.pie().value(d => d.value).sort(null);
            const arc = d3.arc().innerRadius(0).outerRadius(radius);
            const arcHover = d3.arc().innerRadius(0).outerRadius(radius + 2);

            svg.selectAll('path')
                .data(pie(countryData.items))
                .enter().append('path')
                .attr('class', 'pie-slice')
                .attr('d', arc)
                .attr('fill', d => COLORS[d.data.key] || COLORS['Autre'])
                .attr('stroke', 'white').style('stroke-width', '1px')
                
                // --- SURVOL ---
                .on("mouseover", function(event, d) {
                    d3.select(this)
                      .transition().duration(200)
                      .attr('d', arcHover)
                      .style("opacity", "0.8");
                    
                    tooltip.html(`
                                <div style="font-weight:bold; margin-bottom:4px;">${d.data.key}</div>
                                <div>${Math.round(d.data.value)} PJ</div>
                                <div style="font-size:0.8em; opacity:0.8">(${Math.round((d.data.value/countryData.total)*100)}%)</div>
                            `)
                           .style("visibility", "visible")
                           .style("opacity", "1");
                })
                .on("mousemove", function(event) {
                    tooltip.style("left", (event.pageX + 15) + "px")
                           .style("top", (event.pageY - 15) + "px");
                })
                .on("mouseout", function() {
                    d3.select(this)
                      .transition().duration(200)
                      .attr('d', arc)
                      .style("opacity", "1");
                    
                    tooltip.style("opacity", "0").style("visibility", "hidden");
                });
        }
    });
}

function processData(allData, country, year) {
    let grouped = {};
    let total = 0;

    const rows = allData.filter(d => d.Country === country && d.Flow === FLOW);
    
    rows.forEach(r => {
        if (r.Product === 'Total' || r.Product === 'Electricity' || r.Product === 'Heat') return;

        let val = parseFloat(r[year]);
        if (isNaN(val) && year === "2024") val = parseFloat(r["2024 Provisional"]);
        if(isNaN(val) || val <= 0) return;
        
        const cat = CATEGORY_MAP[r.Product] || 'Autre';
        
        if(!grouped[cat]) grouped[cat] = 0;
        grouped[cat] += val;
        total += val;
    });

    let items = Object.entries(grouped).map(([key, value]) => ({key, value}));

    items.sort((a, b) => {
        let indexA = CATEGORY_ORDER.indexOf(a.key);
        let indexB = CATEGORY_ORDER.indexOf(b.key);
        if (indexA === -1) indexA = 999;
        if (indexB === -1) indexB = 999;
        return indexA - indexB;
    });

    return { items, total };
}