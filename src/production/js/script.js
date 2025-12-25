const EUROPE_COUNTRIES = [
    "Austria", "Belgium", "Czechia", "Denmark", "Estonia", "Finland",
    "France", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy",
    "Latvia", "Lithuania", "Luxembourg", "Netherlands", "Norway", "Poland",
    "Portugal", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland",
    "Turkey", "United Kingdom"
];

let x, y;
const tooltip = d3.select("body").append("div").attr("id", "tooltip");
let globalData = [];
let colorScale;

async function start() {
    try {
        const response = await fetch("./data/electricity-prod-source-stacked.csv");
        const rawText = await response.text();
        
        const rawData = d3.csvParse(rawText);
        const parseDate = d3.timeParse("%Y");

        // 1. Identify source columns (everything except Entity, Code, Year)
        const sourceColumns = rawData.columns.filter(c => 
            !["Entity", "Code", "Year"].includes(c)
        );

        // 2. Unpivot Wide data to Long data
        globalData = [];
        rawData.forEach(d => {
            if (!EUROPE_COUNTRIES.includes(d.Entity)) return;

            // Use a Set to handle duplicate source names if they exist in headers
            const seenInRow = new Set();

            sourceColumns.forEach(col => {
                // Clean the header: "Electricity from solar - TWh (...)" -> "Solar"
                let cleanName = col.replace("Electricity from ", "")
                                   .replace(" - TWh", "")
                                   .split(" (")[0]
                                   .trim()
                                   .replace(/\b\w/g, c => c.toUpperCase()); 

                // Prevent duplicate processing if same name appears twice in columns
                const uniqueKey = `${d.Entity}-${d.Year}-${cleanName}`;
                if (!seenInRow.has(cleanName)) {
                    globalData.push({
                        country: d.Entity,
                        date: parseDate(d.Year),
                        product: cleanName,
                        value: +d[col] || 0
                    });
                    seenInRow.add(cleanName);
                }
            });
        });

        // 3. Setup scales and UI
        const allUniqueProducts = [...new Set(globalData.map(d => d.product))].sort();
        colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(allUniqueProducts);

        d3.select("#loader").style("display", "none");
        populateCountries();

        d3.select("#selectAllBtn").on("click", toggleAll);
        d3.select("#countrySelect").on("change", render);

        render();
    } catch (err) {
        d3.select("#loader").text("Error loading CSV: " + err.message);
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
    // Filter products that have at least some data for this country
    const countryData = globalData.filter(d => d.country === country);
    const activeProducts = [...new Set(countryData.filter(d => d.value > 0).map(d => d.product))];
    
    // Sort products by their peak production to set logical defaults
    activeProducts.sort((a, b) => {
        const maxA = d3.max(countryData.filter(d => d.product === a), d => d.value) || 0;
        const maxB = d3.max(countryData.filter(d => d.product === b), d => d.value) || 0;
        return maxB - maxA;
    });

    updateChecklistUI(activeProducts, activeProducts.slice(0, 5));
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
            .property("checked", defaultChecked.includes(p))
            .on("change", updateChart);
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
    const selectedSources = [];
    d3.selectAll("#source-checklist input:checked").each(function() { selectedSources.push(this.value); });

    d3.select("#chartTitle").text(`Electricity Production (TWh) - ${country}`);

    const filtered = globalData.filter(d => 
        d.country === country && selectedSources.includes(d.product)
    );

    // Group by timestamp for the line chart
    const grouped = d3.groups(filtered, d => d.date.getTime());
    const chartData = grouped.map(([time, entries]) => {
        const row = { date: new Date(time) };
        entries.forEach(e => { row[e.product] = e.value; });
        return row;
    }).sort((a, b) => a.date - b.date);

    // Calculate Y-axis max based on selected visible lines
    const yMax = d3.max(filtered, d => d.value) || 10;
    drawLineChart(chartData, selectedSources, yMax);
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

    keys.forEach(key => {
        const points = data.map(d => ({ date: d.date, value: d[key] || 0 }));
        const color = colorScale(key);

        const g = svg.append("g");

        // Hoverable Area
        g.append("path")
            .datum(points)
            .attr("fill", color)
            .attr("fill-opacity", 0.3)
            .attr("d", d3.area().x(d => x(d.date)).y0(y(0)).y1(d => y(d.value)).curve(d3.curveMonotoneX))
            .style("cursor", "pointer")
            .on("mouseover", function() { d3.select(this).attr("fill-opacity", 0.7); })
            .on("mousemove", (event) => showTooltip(event, key, points, color))
            .on("mouseleave", function() {
                d3.select(this).attr("fill-opacity", 0.1);
                tooltip.style("display", "none");
            });

        // Visible Line
        g.append("path")
            .datum(points)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 2.5)
            .attr("d", d3.line().x(d => x(d.date)).y(d => y(d.value)).curve(d3.curveMonotoneX))
            .style("pointer-events", "none");
    });

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(y));

    // Right-side Legend
    const legend = svg.append("g").attr("transform", `translate(${width + 20}, 0)`);
    keys.forEach((key, i) => {
        const row = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
        row.append("rect").attr("width", 12).attr("height", 12).attr("fill", colorScale(key));
        row.append("text").attr("x", 18).attr("y", 10).text(key).style("font-size", "12px");
    });
}

function showTooltip(event, key, points, color) {
    const [mouseX] = d3.pointer(event);
    const xDate = x.invert(mouseX);
    const bisect = d3.bisector(d => d.date).left;
    const i = bisect(points, xDate);
    const d = points[Math.max(0, i - 1)];

    if (d) {
        tooltip
            .style("display", "block")
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 35) + "px")
            .html(`
                <div style="border-left: 4px solid ${color}; padding-left: 8px; background: white; padding: 5px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <strong>${key}</strong><br>
                    Year: ${d.date.getFullYear()}<br>
                    <strong>${d.value.toFixed(2)} TWh</strong>
                </div>
            `);
    }
}

start();