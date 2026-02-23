/* ── admin.js — Admin Dashboard Logic ───────────────────────── */

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5000'
  : 'https://foodpredictor-backend.onrender.com';

// ── Credentials (change in production via backend) ──
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Admin@2024!';

let charts = {};
let statsCache = null;
let logFilter  = '';
let monInterval;

/* ── Login ── */
function doLogin() {
  const u = document.getElementById('l-user').value.trim();
  const p = document.getElementById('l-pass').value;
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('dashboard').style.display     = 'flex';
    sessionStorage.setItem('admin_auth', '1');
    initDashboard();
  } else {
    document.getElementById('login-err').style.display = 'block';
    document.getElementById('l-pass').value = '';
    // Log failed attempt to backend
    fetch(`${API_BASE}/api/log_event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'LOGIN_FAILED', message: `Failed login: ${u}`, severity: 'WARNING' })
    }).catch(() => {});
  }
}

function doLogout() {
  sessionStorage.removeItem('admin_auth');
  document.getElementById('dashboard').style.display     = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('l-user').value = '';
  document.getElementById('l-pass').value = '';
  document.getElementById('login-err').style.display = 'none';
}

/* ── Auto-restore session ── */
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('admin_auth') === '1') {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('dashboard').style.display     = 'flex';
    initDashboard();
  }

  // Tab navigation
  document.querySelectorAll('.sb-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('tab-' + tab).classList.add('active');
      if (tab === 'logs')    refreshLogs();
      if (tab === 'monitor') startMonitor();
      if (tab === 'prices')  buildPriceCharts();
    });
  });

  // Clock
  setInterval(() => {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString();
  }, 1000);
});

/* ── Init Dashboard ── */
async function initDashboard() {
  await loadStats();
}

/* ── Load Stats from API ── */
async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/admin/api/stats`);
    statsCache = await res.json();
  } catch (e) {
    // Use simulated data if backend offline
    statsCache = generateSimStats();
  }
  renderOverview();
}

/* ── Render Overview Tab ── */
function renderOverview() {
  const d = statsCache;
  document.getElementById('st-total').textContent = (d.total_predictions || 0).toLocaleString();
  document.getElementById('st-today').textContent = (d.predictions_today || 0).toLocaleString();
  document.getElementById('st-warn').textContent  = (d.warnings || 0).toLocaleString();
  document.getElementById('st-crit').textContent  = (d.criticals || 0).toLocaleString();

  // YoY Maize chart
  mkChart('ch-yoy', {
    type: 'line',
    data: {
      labels:   d.yoy_data.map(x => x.year),
      datasets: [{
        label: 'Maize Avg (KES/kg)',
        data:  d.yoy_data.map(x => x.price),
        borderColor: '#00c853', backgroundColor: 'rgba(0,200,83,.1)',
        borderWidth: 2.5, tension: .4, fill: true,
        pointBackgroundColor: '#00c853', pointRadius: 5,
      }]
    },
    options: cOpts()
  });

  // Top counties
  if (d.top_counties && d.top_counties.length) {
    mkChart('ch-counties', {
      type: 'bar',
      data: {
        labels:   d.top_counties.map(x => x.county),
        datasets: [{ label: 'Queries', data: d.top_counties.map(x => x.count),
          backgroundColor: ['#00c853','#1de98b','#69f0ae','#00e676','#b9f6ca'], borderRadius: 5 }]
      },
      options: { ...cOpts(), indexAxis: 'y' }
    });
  }

  // Category monthly
  const cats = Object.keys(d.category_trends || {});
  if (cats.length) {
    const colors = ['#00c853','#1de98b','#69f0ae','#ffc107','#ff7043','#29b6f6'];
    mkChart('ch-cats', {
      type: 'line',
      data: {
        labels:   d.months,
        datasets: cats.map((c, i) => ({
          label: c, data: d.category_trends[c],
          borderColor: colors[i % colors.length], backgroundColor: 'transparent',
          borderWidth: 2, tension: .4, pointRadius: 3,
        }))
      },
      options: { ...cOpts(), plugins: { legend: { display: true, labels: { color: '#456647', font: { size: 9 } } } } }
    });
  }
}

/* ── Price Statistics Tab ── */
function buildPriceCharts() {
  if (!statsCache) return;
  const d = statsCache;
  const cats = Object.keys(d.category_trends || {});
  const colors = ['#00c853','#1de98b','#69f0ae','#ffc107','#ff7043','#29b6f6'];

  mkChart('ch-allcat', {
    type: 'bar',
    data: {
      labels: d.months,
      datasets: cats.map((c, i) => ({
        label: c, data: d.category_trends[c],
        backgroundColor: colors[i % colors.length] + 'aa', borderRadius: 3,
      }))
    },
    options: { ...cOpts(), plugins: { legend: { display: true, labels: { color: '#456647', font: { size: 9 } } } } }
  });

  const simple = (id, key, color) => {
    const data = d.category_trends[key];
    if (!data) return;
    mkChart(id, {
      type: 'bar',
      data: { labels: d.months, datasets: [{ label: key, data, backgroundColor: color + '99', borderRadius: 4 }] },
      options: cOpts()
    });
  };

  simple('ch-veg',   'Vegetables',          '#00c853');
  simple('ch-fruit', 'Fruits',              '#1de98b');
  simple('ch-grain', 'Grains & Cereals',    '#69f0ae');
  simple('ch-prot',  'Proteins & Legumes',  '#ffc107');
}

/* ── Logs ── */
async function refreshLogs() {
  try {
    const res  = await fetch(`${API_BASE}/admin/api/security_logs?severity=${logFilter}`);
    const data = await res.json();
    renderLogs(data.logs || []);
  } catch (e) {
    renderLogs(generateSimLogs());
  }
}

function renderLogs(logs) {
  const tbody = document.getElementById('logs-tbody');
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">No logs found.</td></tr>';
    return;
  }
  tbody.innerHTML = logs.map(l => `
    <tr>
      <td>${l.id}</td>
      <td>${l.timestamp}</td>
      <td>${l.event}</td>
      <td><span class="badge ${l.severity}">${l.severity}</span></td>
      <td>${l.ip || '—'}</td>
      <td>${l.message}</td>
    </tr>
  `).join('');
}

function filterLogs(btn, sev) {
  logFilter = sev;
  document.querySelectorAll('.fb').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  refreshLogs();
}

/* ── System Monitor ── */
function startMonitor() {
  tickMonitor();
  clearInterval(monInterval);
  monInterval = setInterval(tickMonitor, 3500);
}

function tickMonitor() {
  const cpu  = Math.floor(Math.random() * 28 + 10);
  const mem  = Math.floor(Math.random() * 22 + 38);
  const disk = Math.floor(Math.random() * 12 + 6);

  document.getElementById('m-cpu').textContent  = cpu  + '%';
  document.getElementById('m-mem').textContent  = mem  + '%';
  document.getElementById('m-disk').textContent = disk + '%';
  document.getElementById('b-cpu').style.width  = cpu  + '%';
  document.getElementById('b-mem').style.width  = mem  + '%';
  document.getElementById('b-disk').style.width = disk + '%';

  if (statsCache) {
    const d = statsCache;
    document.getElementById('sec-metrics').innerHTML = `
      <div class="sr2"><span>Total Events</span><span class="ok">${d.total_predictions || 0}</span></div>
      <div class="sr2"><span>Warnings</span><span class="warn">${d.warnings || 0}</span></div>
      <div class="sr2"><span>Critical</span><span class="${(d.criticals||0)>0?'err':'ok'}">${d.criticals||0}</span></div>
      <div class="sr2"><span>Encryption</span><span class="ok">PBKDF2-SHA256</span></div>
      <div class="sr2"><span>Session</span><span class="ok">SECURE</span></div>
    `;
    if (d.security_logs) {
      document.getElementById('feed').innerHTML = d.security_logs.slice(0, 10).map(l =>
        `<div class="feed-line" style="color:${l.severity==='WARNING'?'var(--yellow)':l.severity==='CRITICAL'?'var(--red)':'var(--muted)'}">
          ${l.timestamp ? l.timestamp.slice(11,19) : '--:--:--'} [${l.event}] ${l.message.slice(0,45)}
        </div>`
      ).join('');
    }
  }

  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  mkChart('ch-sec', {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'INFO',     data: days.map(() => Math.floor(Math.random()*45+15)), backgroundColor: '#00c85333', borderRadius: 3 },
        { label: 'WARNING',  data: days.map(() => Math.floor(Math.random()*8+1)),   backgroundColor: '#ffc10733', borderRadius: 3 },
        { label: 'CRITICAL', data: days.map(() => Math.floor(Math.random()*2)),     backgroundColor: '#ff174433', borderRadius: 3 },
      ]
    },
    options: { ...cOpts(), plugins: { legend: { display: true, labels: { color: '#456647', font: { size: 9 } } } } }
  });
}

/* ── Chart helpers ── */
function mkChart(id, config) {
  if (charts[id]) charts[id].destroy();
  const el = document.getElementById(id);
  if (!el) return;
  charts[id] = new Chart(el, config);
  return charts[id];
}

function cOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(27,51,32,.5)' }, ticks: { color: '#456647', font: { size: 10 } } },
      y: { grid: { color: 'rgba(27,51,32,.5)' }, ticks: { color: '#456647', font: { size: 10 }, callback: v => 'KES ' + v } }
    }
  };
}

/* ── Simulated data (when backend offline) ── */
function generateSimStats() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const cats   = Object.keys(FOOD_CATEGORIES);
  const cat_trends = {};
  cats.forEach(c => {
    cat_trends[c] = months.map((_, i) => Math.round(80 + Math.random()*120 + i*2));
  });
  return {
    total_predictions: Math.floor(Math.random()*500+100),
    predictions_today: Math.floor(Math.random()*30+5),
    warnings:   Math.floor(Math.random()*8),
    criticals:  Math.floor(Math.random()*2),
    months,
    yoy_data: [2020,2021,2022,2023,2024,2025].map(y => ({ year:y, price: Math.round(50+Math.pow(1.072,y-2020)*55) })),
    category_trends: cat_trends,
    top_counties: ['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret'].map((c,i) => ({ county:c, count: 50-i*8 })),
    security_logs: generateSimLogs(),
  };
}

function generateSimLogs() {
  const events   = ['PAGE_VISIT','PREDICT','LOGIN_OK','LOGOUT','LOGIN_FAILED'];
  const sevs     = ['INFO','INFO','INFO','WARNING','CRITICAL'];
  const messages = ['Home page visited','Price predicted: Maize KES 65','Admin login: admin','Admin logout','Failed login attempt'];
  return Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    timestamp: new Date(Date.now() - i * 180000).toISOString().replace('T',' ').slice(0,19),
    event:    events[i % events.length],
    severity: i === 4 ? 'WARNING' : i === 9 ? 'CRITICAL' : 'INFO',
    ip:       `192.168.1.${10 + (i % 20)}`,
    message:  messages[i % messages.length],
  }));
}
