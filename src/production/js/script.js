const EUROPE_COUNTRIES = [
    "Austria", "Belgium", "Czech Republic", "Denmark", "Estonia", "Finland",
    "France", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy",
    "Latvia", "Lithuania", "Luxembourg", "Netherlands", "Norway", "Poland",
    "Portugal", "Slovak Republic", "Slovenia", "Spain", "Sweden", "Switzerland",
    "Republic of Turkiye", "United Kingdom"
];

const AGGREGATES = [
    "Electricity",
    "Total Combustible Fuels",
    "Total Renewables (Hydro, Geo, Solar, Wind, Other)",
    "Renewable Combustible Fuels"
];

const tooltip = d3.select("body").append("div").attr("id", "tooltip");

let globalData = [];
let colorScale;

async function start() {
    try {
        // Chemin relatif au fichier production.html
        const response = await fetch("./data/MES_0925.csv");
        const rawText = await response.text();
        
        const lines = rawText.trim().split(/\r?\n/);
        // Recherche robuste de l'entête
        const headerIndex = lines.findIndex(line => line.includes("Country") && line.includes("Balance"));

        if (headerIndex === -1) throw new Error("Entête 'Country' non trouvée");

        const cleanCsvContent = lines.slice(headerIndex).join("\n");
        const rawData = d3.csvParse(cleanCsvContent);
        const parseDate = d3.timeParse("%B %Y");

        // Importation filtrée : Production et Consommation uniquement
        globalData = rawData
            .filter(d => 
                EUROPE_COUNTRIES.includes(d.Country) && 
                (d.Balance === "Net Electricity Production" || d.Balance === "Final Consumption (Calculated)")
            )
            .map(d => ({
                country: d.Country.trim(),
                date: parseDate(d.Time.trim()),
                balance: d.Balance.trim(),
                product: d.Product.trim(),
                value: (d.Value && d.Value.trim() !== "") ? +d.Value : 0
            }))
            .filter(d => d.date && !isNaN(d.value));

        const allUniqueProducts = [...new Set(globalData.map(d => d.product))].sort();
        colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(allUniqueProducts);

        hideLoader();
        populateCountries();
        
        d3.select("#finalConsumptionChk").on("change", updateChart);
        d3.select("#selectAllBtn").on("click", toggleAll);
        d3.select("#countrySelect").on("change", render);

        render(); 
    } catch (err) {
        d3.select("#loader").text("Erreur: " + err.message);
        console.error(err);
    }
}

function populateCountries() {
    const countries = [...new Set(globalData.map(d => d.country))].sort();
    const sel = d3.select("#countrySelect");
    sel.selectAll("option").remove();
    countries.forEach(c => sel.append("option").text(c).property("value", c));
}

function render() {
    const country = d3.select("#countrySelect").property("value");
    const prodData = globalData.filter(d => 
        d.country === country && 
        d.balance === "Net Electricity Production" &&
        !AGGREGATES.includes(d.product) &&
        d.value !== 0
    );

    const activeProducts = [...new Set(prodData.map(d => d.product))];
    activeProducts.sort((a, b) => {
        const maxA = d3.max(prodData.filter(d => d.product === a), d => d.value) || 0;
        const maxB = d3.max(prodData.filter(d => d.product === b), d => d.value) || 0;
        return maxB - maxA;
    });

    const topTwo = activeProducts.slice(0, 2);
    updateChecklistUI(activeProducts, topTwo);
    updateChart();
}

function updateChecklistUI(products, defaultChecked) {
    const checklist = d3.select("#source-checklist");
    checklist.selectAll("*").remove();

    products.forEach(p => {
        const container = checklist.append("label").attr("class", "checklist-item");
        container.append("input")
            .attr("type", "checkbox")
            .attr("value", p)
            .attr("id", `chk-${p.replace(/\s+/g, '-')}`)
            .property("checked", defaultChecked.includes(p))
            .on("change", updateChart);
        container.append("span").text(` ${p}`);
    });
}

function toggleAll() {
    const checkboxes = d3.selectAll("#source-checklist input");
    const allChecked = checkboxes.filter(":checked").size() === checkboxes.size();
    checkboxes.property("checked", !allChecked);
    updateChart();
}

function updateChart() {
    const country = d3.select("#countrySelect").property("value");
    const showFinalConsumption = d3.select("#finalConsumptionChk").property("checked");
    const selectedSources = [];
    d3.selectAll("#source-checklist input:checked").each(function() { selectedSources.push(this.value); });

    d3.select("#chartTitle").text(`Total Net Electricity Production - ${country}`);

    let filtered = globalData.filter(d => 
        d.country === country && 
        d.balance === "Net Electricity Production" && 
        selectedSources.includes(d.product)
    );

    if (showFinalConsumption) {
        filtered = filtered.concat(globalData.filter(d => d.country === country && d.balance === "Final Consumption (Calculated)"));
    }

    const grouped = d3.groups(filtered, d => d.date.getTime());
    const chartData = grouped.map(([time, entries]) => {
        const row = { date: new Date(time) };
        entries.forEach(e => {
            const keyName = e.balance === "Final Consumption (Calculated)" ? "Final Consumption" : e.product;
            row[keyName] = e.value;
        });
        return row;
    }).sort((a, b) => a.date - b.date);

    let keys = [...selectedSources];
    if (showFinalConsumption) keys.push("Final Consumption");
    keys.sort((a, b) => d3.max(chartData, d => d[b] || 0) - d3.max(chartData, d => d[a] || 0));

    drawLineChart(chartData, keys, d3.max(chartData, d => d3.max(keys, k => d[k] || 0)) || 100);
}

function drawLineChart(data, keys, yMax) {
    const container = document.getElementById("chart");
    d3.select("#chart").selectAll("*").remove(); // Nettoyage du graphique précédent
    
    const margin = { top: 20, right: 200, bottom: 40, left: 70 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    const svg = d3.select("#chart").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime().domain(d3.extent(data, d => d.date)).range([0, width]);
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);

    keys.forEach(key => {
        const isCons = key === "Final Consumption";
        const points = data.map(d => ({ date: d.date, value: d[key] || 0 }));

        svg.append("path")
            .datum(points)
            .attr("fill", "none")
            .attr("stroke", isCons ? "#000" : colorScale(key))
            .attr("stroke-width", isCons ? 3 : 2.5)
            .attr("stroke-dasharray", isCons ? "5,5" : "0")
            .attr("d", d3.line().x(d => x(d.date)).y(d => y(d.value)).curve(d3.curveMonotoneX))
            // LOGIQUE DE L'INFOBULLE
            .on("mousemove", function(event) {
                const [mouseX] = d3.pointer(event);
                const xDate = x.invert(mouseX);
                
                // Trouver la donnée la plus proche
                const bisect = d3.bisector(d => d.date).left;
                const i = bisect(points, xDate);
                const d = points[i];

                if (d) {
                    tooltip.style("display", "block")
                        .style("left", (event.pageX + 15) + "px")
                        .style("top", (event.pageY - 35) + "px")
                        .html(`<strong>${key}</strong><br>
                               Date: ${d3.timeFormat("%b %Y")(d.date)}<br>
                               Valeur: ${d3.format(",.0f")(d.value)} GWh`);
                }
            })
            .on("mouseout", () => tooltip.style("display", "none"));
    });
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(y).tickFormat(d => d3.format(",.0f")(d)));

    const legend = svg.append("g").attr("transform", `translate(${width + 20}, 0)`);
    keys.forEach((key, i) => {
        const row = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
        row.append("rect").attr("width", 12).attr("height", 12).attr("fill", key === "Final Consumption" ? "#000" : colorScale(key));
        row.append("text").attr("x", 18).attr("y", 10).text(key).style("font-size", "11px");
    });
}

function hideLoader() { d3.select("#loader").style("display", "none"); }
start();