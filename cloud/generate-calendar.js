/**
 * Generate calendar.html with real booking data.
 * Reads ./browser-state.json, calls MyPlanner API, writes ./public/index.html
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://deskbooking.netcompany.com";
const DAYS_GR = ["Κυρ", "Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ"];
const MONTHS_GR = ["Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος", "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος"];
const DOW_SHORT = ["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"];

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function pad(n) { return String(n).padStart(2, "0"); }
function formatDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function escapeHtml(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function orthodoxEaster(year) {
  const a = year % 4, b = year % 7, c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const julian = new Date(year, month - 1, day);
  julian.setDate(julian.getDate() + 13);
  return julian;
}

function getGreekHolidays(year) {
  const h = {};
  const add = (m, d, name) => { h[`${year}-${pad(m)}-${pad(d)}`] = name; };
  add(1, 1, "Πρωτοχρονιά"); add(1, 6, "Θεοφάνεια"); add(3, 25, "25η Μαρτίου");
  add(5, 1, "Πρωτομαγιά"); add(8, 15, "15 Αυγούστου");
  add(10, 28, "28 Οκτωβρίου"); add(12, 25, "Χριστούγεννα"); add(12, 26, "Σύναξη Θεοτόκου");
  const e = orthodoxEaster(year);
  const offsets = [[-48, "Καθαρά Δευτέρα"], [-2, "Μ. Παρασκευή"], [0, "Πάσχα"], [1, "Δευτέρα Πάσχα"], [50, "Αγ. Πνεύματος"]];
  for (const [off, name] of offsets) {
    const d = new Date(e); d.setDate(d.getDate() + off);
    h[formatDate(d)] = name;
  }
  return h;
}

function getWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function fetchBookings(client, fromDate, toDate) {
  const r = await client.get("/deskbooking/api/v1/deskbooking/calendar", { params: { fromDate, toDate } });
  if (r.status !== 200) throw new Error(`Calendar HTTP ${r.status}`);
  const entries = Array.isArray(r.data) ? r.data : [];
  const result = {};
  for (const e of entries) {
    const type = e.datesAndType?.type;
    if (type === "0036") {
      try {
        const dr = await client.get(`/deskbooking/api/v1/deskbooking/${e.deskBookingId}`);
        if (dr.status === 200) {
          result[e.date] = {
            type: "office",
            sector: dr.data.facilitySectorName || "?",
            floor: (dr.data.facilityFloor || "?").trim(),
            code: dr.data.code || "?",
          };
        }
      } catch {
        result[e.date] = { type: "office", sector: e.description || "Office" };
      }
    } else if (type === "0035") {
      result[e.date] = { type: "wfh" };
    }
  }
  return result;
}

function renderWeekTable(monday, bookings, holidays) {
  const todayStr = formatDate(new Date());
  const rows = [];
  const fri = new Date(monday); fri.setDate(monday.getDate() + 4);
  const range = `${monday.getDate()}/${monday.getMonth() + 1} - ${fri.getDate()}/${fri.getMonth() + 1}`;
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const ds = formatDate(d);
    const dayLabel = `${DOW_SHORT[i]} ${d.getDate()}/${d.getMonth() + 1}`;
    const isToday = ds === todayStr ? ' class="today-row"' : "";
    const b = bookings[ds];
    if (b?.type === "office") {
      rows.push(`<tr${isToday}><td>${dayLabel}</td><td>${escapeHtml(b.sector)}</td><td>${escapeHtml(b.floor || "")}</td><td>${escapeHtml(b.code || "")}</td></tr>`);
    } else if (b?.type === "wfh") {
      rows.push(`<tr${isToday}><td>${dayLabel}</td><td colspan="3" class="muted">🏠 Τηλεργασία</td></tr>`);
    } else if (holidays[ds]) {
      rows.push(`<tr${isToday}><td>${dayLabel}</td><td colspan="3" class="muted">🏖️ ${escapeHtml(holidays[ds])}</td></tr>`);
    } else {
      rows.push(`<tr${isToday}><td>${dayLabel}</td><td colspan="3" class="muted">—</td></tr>`);
    }
  }
  return { range, rowsHtml: rows.join("\n") };
}

function renderMonth(year, month, bookings, holidays) {
  const todayStr = formatDate(new Date());
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7; // 0=Mon
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(`<div class="day empty"></div>`);
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    const ds = formatDate(d);
    const isToday = ds === todayStr;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const b = bookings[ds];
    let cls = "day";
    let icon = "";
    let info = `${DAYS_GR[d.getDay()]} ${day}/${month + 1}`;
    if (b?.type === "office") {
      cls += " office"; icon = "🏢";
      info += `|🏢 ${escapeHtml(b.sector)}|🏬 ${escapeHtml(b.floor || "")}|💺 ${escapeHtml(b.code || "")}`;
    } else if (b?.type === "wfh") {
      cls += " wfh"; icon = "🏠";
      info += "|🏠 Τηλεργασία";
    } else if (holidays[ds]) {
      cls += " holiday"; icon = "🏖️";
      info += `|🏖️ ${escapeHtml(holidays[ds])}`;
    } else if (isWeekend) {
      cls += " weekend";
    }
    if (isToday) cls += " today";
    const dataInfo = b || holidays[ds] ? ` data-info="${info}"` : "";
    cells.push(`<div class="${cls}"${dataInfo}><span class="day-num">${day}</span>${icon ? `<span class="day-icon">${icon}</span>` : ""}</div>`);
  }
  return cells.join("\n");
}

function renderHtml({ weekTable, months, lastUpdated }) {
  const monthsHtml = months.map(m => `
    <div class="month">
      <div class="month-header">${m.title}</div>
      <div class="grid">
        <div class="dow">Δε</div><div class="dow">Τρ</div><div class="dow">Τε</div><div class="dow">Πε</div><div class="dow">Πα</div><div class="dow">Σα</div><div class="dow">Κυ</div>
        ${m.cells}
      </div>
    </div>`).join("\n");

  return `<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#2563eb">
<title>MyPlanner</title>
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icon-192.png">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f3f4f6; color: #111827; padding: 12px; max-width: 600px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
  .week-table, .month { background: white; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .week-header, .month-header { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #1f2937; }
  .week-table table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .week-table th { text-align: left; padding: 8px 6px; background: #f3f4f6; color: #6b7280; font-weight: 600; font-size: 12px; border-radius: 4px; }
  .week-table td { padding: 10px 6px; border-bottom: 1px solid #f3f4f6; }
  .week-table .muted { color: #9ca3af; font-style: italic; }
  .week-table .today-row { background: #eff6ff; font-weight: 600; }
  .week-table .today-row td:first-child { color: #2563eb; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .dow { text-align: center; font-size: 11px; color: #6b7280; font-weight: 600; padding: 4px 0; }
  .day { aspect-ratio: 1; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 12px; background: #f9fafb; color: #1f2937; position: relative; cursor: pointer; }
  .day:active { transform: scale(0.95); }
  .day.empty { background: transparent; cursor: default; }
  .day.weekend { color: #9ca3af; }
  .day.today { border: 2px solid #2563eb; font-weight: 700; }
  .day.office { background: linear-gradient(135deg, #10b981, #059669); color: white; font-weight: 600; }
  .day.wfh { background: #fef3c7; color: #92400e; }
  .day.holiday { background: #fee2e2; color: #991b1b; }
  .day-num { font-size: 14px; }
  .day-icon { font-size: 14px; line-height: 1; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; font-size: 12px; }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot { width: 14px; height: 14px; border-radius: 4px; }
  .modal { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-radius: 16px 16px 0 0; padding: 20px; box-shadow: 0 -4px 16px rgba(0,0,0,0.15); display: none; z-index: 100; }
  .modal.show { display: block; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: none; z-index: 99; }
  .modal-overlay.show { display: block; }
  .modal h3 { font-size: 16px; margin-bottom: 12px; }
  .modal .info-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 14px; }
  .updated { text-align: center; color: #9ca3af; font-size: 11px; margin-top: 16px; }
</style>
</head>
<body>

<h1>📅 Οι Κρατήσεις μου</h1>
<div class="subtitle">MyPlanner Calendar</div>

<div class="week-table">
  <div class="week-header">📋 Τρέχουσα Εβδομάδα (${weekTable.range})</div>
  <table>
    <thead><tr><th>Μέρα</th><th>Κτίριο</th><th>Όροφος</th><th>💺</th></tr></thead>
    <tbody>${weekTable.rowsHtml}</tbody>
  </table>
</div>

<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:linear-gradient(135deg,#10b981,#059669)"></div>Γραφείο</div>
  <div class="legend-item"><div class="legend-dot" style="background:#fef3c7"></div>Τηλεργασία</div>
  <div class="legend-item"><div class="legend-dot" style="background:#fee2e2"></div>Αργία</div>
  <div class="legend-item"><div class="legend-dot" style="border:2px solid #2563eb;background:white"></div>Σήμερα</div>
</div>

${monthsHtml}

<div class="updated">Ενημέρωση: ${lastUpdated}</div>

<div class="modal-overlay" id="overlay"></div>
<div class="modal" id="modal"><h3 id="modalTitle"></h3><div id="modalBody"></div></div>

<script>
  document.querySelectorAll('.day[data-info]').forEach(d => {
    d.addEventListener('click', () => {
      const parts = d.dataset.info.split('|');
      document.getElementById('modalTitle').textContent = parts[0];
      document.getElementById('modalBody').innerHTML = parts.slice(1).map(p => '<div class="info-row">' + p + '</div>').join('');
      document.getElementById('modal').classList.add('show');
      document.getElementById('overlay').classList.add('show');
    });
  });
  document.getElementById('overlay').addEventListener('click', () => {
    document.getElementById('modal').classList.remove('show');
    document.getElementById('overlay').classList.remove('show');
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
</script>

</body>
</html>`;
}

async function main() {
  if (!fs.existsSync("./browser-state.json")) {
    log("No browser-state.json");
    process.exit(1);
  }
  const state = JSON.parse(fs.readFileSync("./browser-state.json", "utf-8"));
  const cookieString = state.cookies.map(c => `${c.name}=${c.value}`).join("; ");

  const client = axios.create({
    baseURL: BASE_URL,
    headers: { Cookie: cookieString, Accept: "application/json" },
    timeout: 15000,
    validateStatus: () => true,
  });

  const today = new Date();
  // Range: from start of previous month to end of next month
  const fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const toDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);

  log(`Fetching ${formatDate(fromDate)} to ${formatDate(toDate)}`);
  const bookings = await fetchBookings(client, formatDate(fromDate), formatDate(toDate));
  log(`Found ${Object.keys(bookings).length} bookings`);

  const holidays = { ...getGreekHolidays(today.getFullYear() - 1), ...getGreekHolidays(today.getFullYear()), ...getGreekHolidays(today.getFullYear() + 1) };

  const monday = getWeekMonday(today);
  const weekTable = renderWeekTable(monday, bookings, holidays);

  const months = [];
  for (let offset = -1; offset <= 2; offset++) {
    const m = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    months.push({
      title: `${MONTHS_GR[m.getMonth()]} ${m.getFullYear()}`,
      cells: renderMonth(m.getFullYear(), m.getMonth(), bookings, holidays),
    });
  }

  const lastUpdated = new Date().toLocaleString("el-GR", { timeZone: "Europe/Athens" });
  const html = renderHtml({ weekTable, months, lastUpdated });

  if (!fs.existsSync("./public")) fs.mkdirSync("./public");
  fs.writeFileSync("./public/index.html", html, "utf-8");

  // Manifest
  fs.writeFileSync("./public/manifest.json", JSON.stringify({
    name: "MyPlanner Calendar",
    short_name: "MyPlanner",
    start_url: ".",
    display: "standalone",
    background_color: "#f3f4f6",
    theme_color: "#2563eb",
    icons: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }, null, 2), "utf-8");

  // Service worker (cache last version for offline)
  fs.writeFileSync("./public/sw.js", `
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open('v1').then(c => c.put(e.request, clone));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
`, "utf-8");

  log("Calendar HTML generated at ./public/index.html");
}

main().catch(e => { log(`Error: ${e.message}`); process.exit(1); });
