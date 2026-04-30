/**
 * Next-week pin — sends compact pin after Wed booking with week+1 bookings.
 * Run after Wed booking task completes.
 */

const axios = require("axios");
const fs = require("fs");
const https = require("https");

const NTFY_TOPIC = process.env.NTFY_TOPIC || "myplanner-pkontog";
const BASE_URL = "https://myplanner.netcompany-intrasoft.com";
const DAYS_GR = ["Κυρ", "Δε", "Τρ", "Τε", "Πε", "Πα", "Σα"];

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function pad(n) { return String(n).padStart(2, "0"); }
function formatDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

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
  add(1, 1, "Πρωτοχρονιά"); add(1, 6, "Θεοφάνεια"); add(3, 25, "25 Μαρτίου");
  add(5, 1, "Πρωτομαγιά"); add(8, 15, "15 Αυγούστου");
  add(10, 28, "28 Οκτωβρίου"); add(12, 25, "Χριστούγεννα"); add(12, 26, "Σύναξη");
  const e = orthodoxEaster(year);
  for (const [off, name] of [[-48, "Καθαρά Δευτέρα"], [-2, "Μ. Παρασκευή"], [0, "Πάσχα"], [1, "Δευτέρα Πάσχα"], [50, "Αγ. Πνεύματος"]]) {
    const d = new Date(e); d.setDate(d.getDate() + off);
    h[formatDate(d)] = name;
  }
  return h;
}

function sendNtfy(title, message) {
  return new Promise((resolve) => {
    const req = https.request(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: { Title: title, Priority: "5", Tags: "calendar" },
    }, () => { log(`NTFY sent: ${title}`); resolve(); });
    req.on("error", (e) => { log(`Error: ${e.message}`); resolve(); });
    req.write(message);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync("./browser-state.json")) { log("No browser-state.json"); process.exit(1); }
  const state = JSON.parse(fs.readFileSync("./browser-state.json", "utf-8"));
  const cookieString = state.cookies.map(c => `${c.name}=${c.value}`).join("; ");

  const client = axios.create({
    baseURL: BASE_URL,
    headers: { Cookie: cookieString, Accept: "application/json" },
    timeout: 15000,
    validateStatus: () => true,
  });

  // Next week's Monday-Friday (the week just booked)
  const nowGreek = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Athens" }));
  const dayOfWeek = nowGreek.getDay() || 7; // Mon=1..Sun=7
  const daysToTargetMonday = 8 - dayOfWeek; // next Monday
  const monday = new Date(nowGreek);
  monday.setDate(nowGreek.getDate() + daysToTargetMonday);
  monday.setHours(0, 0, 0, 0);
  const friday = new Date(monday); friday.setDate(monday.getDate() + 4);

  const r = await client.get("/deskbooking/api/v1/deskbooking/calendar", {
    params: { fromDate: formatDate(monday), toDate: formatDate(friday) },
  });
  if (r.status !== 200) {
    await sendNtfy("MyPlanner Session Expired!", "Refresh secret.");
    process.exit(1);
  }
  const entries = Array.isArray(r.data) ? r.data : [];

  const holidays = { ...getGreekHolidays(monday.getFullYear()), ...getGreekHolidays(monday.getFullYear() + 1) };

  // Compact format: 1 line per day
  const lines = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const ds = formatDate(d);
    const dayName = DAYS_GR[d.getDay()];
    const dayNum = `${d.getDate()}/${d.getMonth() + 1}`;
    const entry = entries.find(e => e.date === ds);
    const type = entry?.datesAndType?.type;

    if (type === "0036") {
      try {
        const dr = await client.get(`/deskbooking/api/v1/deskbooking/${entry.deskBookingId}`);
        const det = dr.data;
        const sectorShort = det.facilitySectorName === "AMALIAS" ? "Αμ" : (det.facilitySectorName === "MAROUSSI" ? "Μα" : det.facilitySectorName);
        const floorShort = det.facilityFloor.trim().replace(" Floor", "").replace("Mezzazine", "Mez").replace("Ground", "G");
        lines.push(`${dayName} ${dayNum} ✅ ${sectorShort}/${floorShort}/${det.code}`);
      } catch {
        lines.push(`${dayName} ${dayNum} ✅`);
      }
    } else if (type === "0035") {
      lines.push(`${dayName} ${dayNum} 🏠`);
    } else if (holidays[ds]) {
      lines.push(`${dayName} ${dayNum} 🏖️`);
    } else {
      lines.push(`${dayName} ${dayNum} ❌`);
    }
  }

  const range = `${monday.getDate()}/${monday.getMonth() + 1}-${friday.getDate()}/${friday.getMonth() + 1}`;
  const message = lines.join("\n");
  await sendNtfy(`📅 Επόμενη βδομάδα ${range}`, message);
}

main().catch(e => { log(`Error: ${e.message}`); process.exit(1); });
