/* ── app.js — Frontend prediction logic ─────────────────────────── */

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5000'
  : 'https://foodpredictor-backend.onrender.com';   // ← update after deploy

let chartMonthly = null;
let chartYoy     = null;

/* ── Init on page load ── */
document.addEventListener('DOMContentLoaded', () => {
  initDropdowns();   // loads counties + fetches categories from backend

  // Pre-select current year and month
  const now = new Date();
  const yrSel = document.getElementById('sel-year');
  const moSel = document.getElementById('sel-month');
  if (yrSel) yrSel.value = now.getFullYear();
  if (moSel) moSel.value = now.getMonth() + 1;
});

/* ── Run prediction ── */
async function runPrediction() {
  const year      = document.getElementById('sel-year').value;
  const month     = document.getElementById('sel-month').value;
  const county    = document.getElementById('sel-county').value;
  const subcounty = document.getElementById('sel-subcounty').value;
  const category  = document.getElementById('sel-category').value;
  const foodtype  = document.getElementById('sel-foodtype').value;

  if (!year || !month || !county || !category || !foodtype) {
    shakeForm();
    alert('Please fill in all fields before predicting.');
    return;
  }

  const btn = document.getElementById('btn-predict');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Predicting…';

  try {
    const res = await fetch(`${API_BASE}/api/predict`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year, month, county, subcounty,
        category, food_type: foodtype
      }),
    });
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    displayResults(data);

  } catch (err) {
    console.error('Prediction error:', err.message);
    // Show friendly error in result area
    showError(`Could not get prediction: ${err.message}. Make sure the backend is running.`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🧮</span> Predict Price';
  }
}

/* ── Display results ── */
function displayResults(d) {
  document.getElementById('empty-state').style.display    = 'none';
  document.getElementById('result-content').style.display = 'block';

  // Price banner
  document.getElementById('out-price').textContent =
    Number(d.price).toLocaleString('en-KE', { minimumFractionDigits:2, maximumFractionDigits:2 });
  document.getElementById('out-context').textContent =
    `${d.food_type} · ${d.county}${d.subcounty ? ' / '+d.subcounty : ''} · ${d.month} ${d.year}`;

  // Range cards
  document.getElementById('out-low').textContent  = fmt(d.low);
  document.getElementById('out-mid').textContent  = fmt(d.price);
  document.getElementById('out-high').textContent = fmt(d.high);

  // Insight cards
  document.getElementById('ins-trend').textContent  = d.year_change  || '—';
  document.getElementById('ins-season').textContent = d.season_note  || '—';
  document.getElementById('ins-county').textContent = d.county_index || '—';

  // Data source tag (show which years the data covers)
  const sub = document.getElementById('out-context');
  if (d.data_years) sub.textContent += ` · Data: ${d.data_years}`;

  // Stats strip
  document.getElementById('sp-county').textContent = d.county;
  document.getElementById('sp-month').textContent  = d.month;
  document.getElementById('sp-food').textContent   = d.food_type;
  document.getElementById('stats-strip').style.display = 'grid';

  // Monthly chart
  if (chartMonthly) chartMonthly.destroy();
  const selectedMonth = parseInt(document.getElementById('sel-month').value);
  chartMonthly = new Chart(document.getElementById('ch-monthly'), {
    type: 'line',
    data: {
      labels:   d.monthly.map(x => x.month),
      datasets: [{
        label: 'KES',
        data:  d.monthly.map(x => x.price),
        borderColor: '#2d7a4f', backgroundColor: 'rgba(76,175,80,.1)',
        borderWidth: 2.5, tension: .4, fill: true,
        pointBackgroundColor: d.monthly.map((_, i) =>
          i + 1 === selectedMonth ? '#1a5c32' : 'rgba(45,122,79,.5)'),
        pointRadius: d.monthly.map((_, i) => i + 1 === selectedMonth ? 7 : 4),
      }]
    },
    options: chartOpts()
  });

  // Year-over-year chart
  if (chartYoy) chartYoy.destroy();
  const selectedYear = parseInt(document.getElementById('sel-year').value);
  chartYoy = new Chart(document.getElementById('ch-yoy'), {
    type: 'bar',
    data: {
      labels:   d.trend.map(x => x.year),
      datasets: [{
        label: 'Avg KES',
        data:  d.trend.map(x => x.avg),
        backgroundColor: d.trend.map(x =>
          x.year === selectedYear ? '#1a5c32' : 'rgba(45,122,79,.5)'),
        borderRadius: 5,
      }]
    },
    options: chartOpts()
  });
}

function fmt(v) {
  return 'KES ' + Number(v).toLocaleString('en-KE', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function chartOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display:false }, ticks: { font:{ size:10 } } },
      y: { grid: { color:'rgba(0,0,0,.05)' },
           ticks: { font:{ size:10 }, callback: v => 'KES ' + v } }
    }
  };
}

function showError(msg) {
  document.getElementById('empty-state').style.display    = 'block';
  document.getElementById('result-content').style.display = 'none';
  document.getElementById('empty-state').innerHTML =
    `<div class="empty-icon">⚠️</div><h3>Prediction Failed</h3><p>${msg}</p>`;
}

function shakeForm() {
  const card = document.querySelector('.form-card');
  card.style.animation = 'none';
  void card.offsetHeight;
  card.style.animation = 'shake .4s ease';
}
const s = document.createElement('style');
s.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`;
document.head.appendChild(s);
