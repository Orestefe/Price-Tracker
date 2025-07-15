const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.resolve(__dirname, '../output/price-chart.html');
const HISTORY_PATH = path.resolve(__dirname, '../data/price-history.json');
const raw = fs.readFileSync(HISTORY_PATH, 'utf-8');
const history = JSON.parse(raw);
const datasets = [];

function getRandomColor() {
  const r = () => Math.floor(Math.random() * 200);
  return `rgb(${r()}, ${r()}, ${r()})`;
}

for (const [name, entries] of Object.entries(history)) {
  const sorted = entries
    .filter(e => e.timestamp && typeof e.price === 'number')
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const data = sorted.map(e => ({ x: e.timestamp, y: e.price }));

  if (data.length > 0) {
    datasets.push({
      label: name,
      data,
      borderColor: getRandomColor(),
      tension: 0.3
    });
  }
}

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>📈 Price History</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns"></script>
</head>
<body class="bg-gray-100 text-gray-900 min-h-screen flex flex-col items-center p-6">
  <div class="w-full max-w-5xl bg-white p-6 rounded-2xl shadow-lg">
    <header class="text-center mb-6">
      <h1 class="text-4xl font-bold text-blue-600 mb-2">💸 Price Tracker</h1>
      <p class="text-sm text-gray-500">Visualize price trends of tracked items</p>
    </header>

    <div class="mb-4">
      <label for="datasetSelect" class="block mb-2 text-sm font-medium">Filter by item</label>
      <select id="datasetSelect" class="w-full p-2 border border-gray-300 rounded-md">
        <option value="All">All</option>
        ${datasets.map(ds => `<option value="${ds.label}">${ds.label}</option>`).join('\n')}
      </select>
    </div>

    <canvas id="chart" class="w-full h-[100px]"></canvas>
    <p class="text-sm text-right text-gray-400 mt-2">Last updated: <span id="lastUpdated"></span></p>
  </div>

  <script>
    const allDatasets = ${JSON.stringify(datasets, null, 2)};
    const ctx = document.getElementById('chart').getContext('2d');

    function formatDate(ts) {
      const d = new Date(ts);
      return d.toLocaleString("en-US", { timeZone: "America/New_York" });
    }

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: allDatasets
      },
      options: {
        parsing: { xAxisKey: 'x', yAxisKey: 'y' },
        responsive: true,
        plugins: {
          legend: { position: 'top'},
          title: {
            display: true,
            text: 'Tracked Item Prices Over Time'
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              tooltipFormat: 'PPpp',
              displayFormats: { hour: 'MMM d, h a', day: 'MMM d' }
            },
            title: { display: true, text: 'Time' }
          },
          y: {
            title: { display: true, text: 'Price ($)' },
            ticks: {
              callback: val => '$' + val
            }
          }
        }
      }
    });

    document.getElementById('datasetSelect').addEventListener('change', (e) => {
      const selected = e.target.value;
      chart.data.datasets = selected === 'All'
        ? allDatasets
        : allDatasets.filter(ds => ds.label === selected);
      chart.update();
    });

    // Set last updated
    const latestTimestamp = allDatasets.flatMap(d => d.data).reduce((latest, point) => {
      return new Date(point.x) > new Date(latest) ? point.x : latest;
    }, "");
    if (latestTimestamp) {
      document.getElementById('lastUpdated').textContent = formatDate(latestTimestamp);
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(OUTPUT_PATH, html);
console.log(`✅ Chart with dropdown filter generated at ${OUTPUT_PATH}`);