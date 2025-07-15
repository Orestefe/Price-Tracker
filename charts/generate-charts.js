const fs = require('fs');

const historyPath = './price-history.json';
const outputPath = './price-chart.html';

const raw = fs.readFileSync(historyPath, 'utf-8');
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
<html>
<head>
  <title>Price History Chart</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns"></script>
  <style>
    body { font-family: sans-serif; padding: 2rem; background: #f4f4f4; }
    canvas { background: #fff; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
    select { font-size: 1rem; padding: 0.5rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>📈 Price History</h1>
  <label for="datasetSelect">Filter by Item:</label>
  <select id="datasetSelect">
    <option value="All">All</option>
    ${datasets.map(ds => `<option value="${ds.label}">${ds.label}</option>`).join('\n')}
  </select>

  <canvas id="chart" width="1200" height="600"></canvas>

  <script>
    const allDatasets = ${JSON.stringify(datasets, null, 2)};
    const ctx = document.getElementById('chart').getContext('2d');

    let chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: allDatasets
      },
      options: {
        parsing: {
          xAxisKey: 'x',
          yAxisKey: 'y'
        },
        scales: {
          x: {
            type: 'time',
            time: {
              tooltipFormat: 'PPpp',
              displayFormats: {
                hour: 'MMM d, h a',
                day: 'MMM d'
              }
            },
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Price ($)'
            }
          }
        },
        plugins: {
          legend: { position: 'top' },
          title: {
            display: true,
            text: 'Tracked Item Prices Over Time'
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
  </script>
</body>
</html>
`;

fs.writeFileSync(outputPath, html);
console.log(`✅ Chart with dropdown filter generated at ${outputPath}`);