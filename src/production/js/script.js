const EUROPE_COUNTRIES = [
    "Austria", "Belgium", "Czechia", "Denmark", "Estonia", "Finland",
    "France", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy",
    "Latvia", "Lithuania", "Luxembourg", "Netherlands", "Norway", "Poland",
    "Portugal", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland",
    "Turkey", "United Kingdom"
];

const TRANSLATIONS = {
    // Énergies
    "Nuclear": "Nucléaire", "Gas": "Gaz", "Coal": "Charbon", "Solar": "Solaire",
    "Wind": "Éolien", "Hydro": "Hydraulique", "Oil": "Pétrole", "Bioenergy": "Bioénergie",
    "Other Renewables Excluding Bioenergy": "Autres renouvelables",
    
    // Pays
    "Austria": "Autriche", "Belgium": "Belgique", "Czechia": "Tchéquie", 
    "Denmark": "Danemark", "Estonia": "Estonie", "Finland": "Finlande",
    "France": "France", "Germany": "Allemagne", "Greece": "Grèce", 
    "Hungary": "Hongrie", "Iceland": "Islande", "Ireland": "Irlande", 
    "Italy": "Italie", "Latvia": "Lettonie", "Lithuania": "Lituanie", 
    "Luxembourg": "Luxembourg", "Netherlands": "Pays-Bas", "Norway": "Norvège", 
    "Poland": "Pologne", "Portugal": "Portugal", "Slovakia": "Slovaquie", 
    "Slovenia": "Slovénie", "Spain": "Espagne", "Sweden": "Suède", 
    "Switzerland": "Suisse", "Turkey": "Turquie", "United Kingdom": "Royaume-Uni"
};

const t = (word) => TRANSLATIONS[word] || word;

let x, y;
const tooltip = d3.select("body").append("div").attr("id", "tooltip");
let globalData = [];
let colorScale;
let userHasManuallyChanged = false;

async function start() {
    try {
        const response = await fetch("./data/electricity-prod-source-stacked.csv");
        const rawText = await response.text();
        const rawData = d3.csvParse(rawText);
        const parseDate = d3.timeParse("%Y");
        d3.select("#finalConsumptionContainer").style("display", "flex"); 

        const sourceColumns = rawData.columns.filter(c => 
            !["Entity", "Code", "Year"].includes(c)
        );

        globalData = [];
        rawData.forEach(d => {
            if (!EUROPE_COUNTRIES.includes(d.Entity)) return;
            const seenInRow = new Set();

            sourceColumns.forEach(col => {
                let cleanName = col.replace("Electricity from ", "")
                                   .replace(" - TWh (adapted for visualization of chart electricity-prod-source-stacked)", "")
                                   .replace(" - TWh", "")
                                   .trim()
                                   .replace(/\b\w/g, c => c.toUpperCase());

                let translatedName = t(cleanName);

                if (!seenInRow.has(translatedName)) {
                    globalData.push({
                        country: d.Entity,
                        date: parseDate(d.Year),
                        product: translatedName,
                        value: +d[col] || 0
                    });
                    seenInRow.add(translatedName);
                }
            });
        });

        const allUniqueProducts = [...new Set(globalData.map(d => d.product))].sort();
        colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(allUniqueProducts);

        d3.select("#loader").style("display", "none");
        d3.select("#finalConsumptionContainer").style("display", "block");
        
        populateCountries();

        d3.select("#selectAllBtn").on("click", () => {
            userHasManuallyChanged = true;
            toggleAll();
        });
        
        d3.select("#countrySelect").on("change", render);
        d3.select("#finalConsumptionChk").on("change", updateChart);

        render();
    } catch (err) {
        d3.select("#loader").text("Erreur : " + err.message);
    }
}

function populateCountries() {
    const countries = [...new Set(globalData.map(d => d.country))].sort((a, b) => t(a).localeCompare(t(b)));
    const sel = d3.select("#countrySelect");
    sel.selectAll("option").remove();
    countries.forEach(c => sel.append("option").text(t(c)).property("value", c));
}

function render() {
    const country = d3.select("#countrySelect").property("value");
    const countryData = globalData.filter(d => d.country === country);
    
    const availableProducts = [...new Set(countryData.filter(d => d.value > 0).map(d => d.product))];
    availableProducts.sort((a, b) => {
        const sumA = d3.sum(countryData.filter(d => d.product === a), d => d.value);
        const sumB = d3.sum(countryData.filter(d => d.product === b), d => d.value);
        return sumB - sumA;
    });

    let toCheck;
    if (!userHasManuallyChanged) {
        toCheck = availableProducts.slice(0, 3);
    } else {
        toCheck = [];
        d3.selectAll("#source-checklist input:checked").each(function() {
            toCheck.push(this.value);
        });
    }
    
    updateChecklistUI(availableProducts, toCheck);
    updateChart();
}

function updateChecklistUI(products, checkedList) {
    const checklist = d3.select("#source-checklist");
    checklist.selectAll("*").remove();

    products.forEach(p => {
        const container = checklist.append("label").attr("class", "checklist-item");
        container.append("input")
            .attr("type", "checkbox")
            .attr("value", p)
            .property("checked", checkedList.includes(p))
            .on("change", function() {
                userHasManuallyChanged = true;
                updateChart();
            });
        container.append("span").text(` ${p}`);
    });
}

function toggleAll() {
    const checkboxes = d3.selectAll("#source-checklist input");
    const anyUnchecked = checkboxes.filter(function() { return !this.checked; }).size() > 0;
    checkboxes.property("checked", anyUnchecked);
    updateChart();
}

function updateChart() {
    const country = d3.select("#countrySelect").property("value");
    const isTotalEnabled = d3.select("#finalConsumptionChk").property("checked");
    
    let selectedSources = [];
    d3.selectAll("#source-checklist input:checked").each(function() { selectedSources.push(this.value); });

    if (selectedSources.length === 0 && userHasManuallyChanged) {
        userHasManuallyChanged = false;
        render();
        return;
    }

    d3.select("#chartTitle").text(`Production d'électricité (TWh) - ${t(country)}`);

    // On récupère TOUTES les sources du pays pour calculer le vrai total
    const allCountryData = globalData.filter(d => d.country === country);
    
    const groupedByDate = d3.groups(allCountryData, d => d.date.getTime());
    
    const chartData = groupedByDate.map(([time, entries]) => {
        const row = { date: new Date(time) };
        
        // 1. Calcul du total réel (somme de TOUTES les sources du pays)
        let realTotal = d3.sum(entries, d => d.value);
        if (isTotalEnabled) row["Total"] = realTotal;

        // 2. Ajout des valeurs seulement pour les sources sélectionnées par l'utilisateur
        entries.forEach(e => {
            if (selectedSources.includes(e.product)) {
                row[e.product] = e.value;
            }
        });
        
        return row;
    }).sort((a, b) => a.date - b.date);

    const activeKeys = isTotalEnabled ? ["Total", ...selectedSources] : selectedSources;
    
    let yMax = 0;
    if (chartData.length > 0) {
        yMax = d3.max(chartData, d => {
            const vals = activeKeys.map(k => d[k] || 0);
            return d3.max(vals);
        });
    }

    drawLineChart(chartData, activeKeys, yMax || 10);
}

function drawLineChart(data, keys, yMax) {
    const container = document.getElementById("chart");
    d3.select("#chart").selectAll("*").remove();
    if (data.length === 0) return;

    const margin = { top: 30, right: 160, bottom: 40, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    const svg = d3.select("#chart").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    x = d3.scaleTime().domain(d3.extent(data, d => d.date)).range([0, width]);
    y = d3.scaleLinear().domain([0, yMax * 1.1]).nice().range([height, 0]);

    const hoverLine = svg.append("line")
        .attr("y1", 0).attr("y2", height)
        .style("stroke", "#4e4a4aff").style("stroke-width", "2px").style("stroke-dasharray", "4,4")
        .style("display", "none").style("pointer-events", "none");

    keys.forEach(key => {
        const points = data.map(d => ({ date: d.date, value: d[key] || 0 }));
        const isTotal = key === "Total";
        const color = isTotal ? "#333" : colorScale(key);
        const g = svg.append("g");

        g.append("path")
            .datum(points)
            .attr("fill", color)
            .attr("fill-opacity", isTotal ? 0 : 0.1)
            .attr("d", d3.area().x(d => x(d.date)).y0(y(0)).y1(d => y(d.value)).curve(d3.curveMonotoneX))
            .on("mouseover", function() { 
                hoverLine.style("display", "block");
                if(!isTotal) d3.select(this).attr("fill-opacity", 0.3); 
            })
            .on("mousemove", function(event) {
                const [mouseX] = d3.pointer(event);
                hoverLine.attr("x1", mouseX).attr("x2", mouseX);
                showTooltip(event, key, points, color);
            })
            .on("mouseleave", function() {
                hoverLine.style("display", "none");
                if(!isTotal) d3.select(this).attr("fill-opacity", 0.1);
                tooltip.style("display", "none");
            });

        g.append("path")
            .datum(points)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", isTotal ? 3 : 2)
            .attr("stroke-dasharray", isTotal ? "6,4" : "0")
            .attr("d", d3.line().x(d => x(d.date)).y(d => y(d.value)).curve(d3.curveMonotoneX))
            .style("pointer-events", "none");
    });

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(y));

    const legend = svg.append("g").attr("transform", `translate(${width + 20}, 0)`);
    keys.forEach((key, i) => {
        const row = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
        row.append("rect").attr("width", 12).attr("height", 12).attr("fill", key === "Total" ? "#333" : colorScale(key));
        row.append("text").attr("x", 18).attr("y", 10).text(key === "Total" ? "Production totale" : key).style("font-size", "12px").style("font-weight", key === "Total" ? "bold" : "normal");
    });
}

function showTooltip(event, key, points, color) {
    const [mouseX] = d3.pointer(event);
    const xDate = x.invert(mouseX);
    const i = d3.bisector(d => d.date).left(points, xDate);
    const d = points[Math.max(0, i - 1)];

    if (d) {
        const label = key === "Total" ? "Production Totale (Toutes sources)" : key;
        tooltip.style("display", "block")
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 35) + "px")
            .html(`<div style="border-left: 4px solid ${color}; background: white; padding: 8px; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <strong style="color: ${color}">${label}</strong><br>
                Année : ${d.date.getFullYear()}<br>
                <strong>${d.value.toFixed(2)} TWh</strong>
            </div>`);
    }
}

start();