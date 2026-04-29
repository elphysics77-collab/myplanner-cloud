/**
 * Weekly pin — sends a notification every Sunday with next week's bookings (Mon-Fri).
 */

const axios = require("axios");
const fs = require("fs");
const https = require("https");

const NTFY_TOPIC = process.env.NTFY_TOPIC || "myplanner-pkontog";
const BASE_URL = "https://myplanner.netcompany-intrasoft.com";
const DAYS_GR = ["Κυρ", "Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ"];
const MONTHS_GR = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαι", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];

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
  add(10, 28, "28 Οκτωβρίου"); add(12, 25, "Χριστούγεννα"); add(12, 26, "Σύναξη Θεοτόκου");
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
      headers: { Title: title, Priority: "5", Tags: "pushpin" },
    }, () => { log(`NTFY sent: ${title}`); resolve(); });
    req.on("error", (e) => { log(`NTFY error: ${e.message}`); resolve(); });
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

  // Sunday → next week's Monday-Friday
  const nowGreek = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Athens" }));
  const dayOfWeek = nowGreek.getDay(); // 0=Sun
  const daysToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  const monday = new Date(nowGreek);
  monday.setDate(nowGreek.getDate() + daysToMonday);
  monday.setHours(0, 0, 0, 0);
  const friday = new Date(monday); friday.setDate(monday.getDate() + 4);

  const r = await client.get("/deskbooking/api/v1/deskbooking/calendar", {
    params: { fromDate: formatDate(monday), toDate: formatDate(friday) },
  });
  if (r.status !== 200) {
    await sendNtfy("MyPlanner Session Expired!", "Refresh browser-state.json secret.");
    process.exit(1);
  }
  const entries = Array.isArray(r.data) ? r.data : [];

  const holidays = { ...getGreekHolidays(monday.getFullYear()), ...getGreekHolidays(monday.getFullYear() + 1) };

  const lines = [];
  const mondayDM = `${monday.getDate()}/${monday.getMonth() + 1}`;
  const fridayDM = `${friday.getDate()}/${friday.getMonth() + 1}`;
  lines.push(`📅 Εβδομάδα ${mondayDM} - ${fridayDM}`);
  lines.push("");

  for (let i = 0; i < 5; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const ds = formatDate(d);
    const dayName = DAYS_GR[d.getDay()];
    const fullDate = `${d.getDate()} ${MONTHS_GR[d.getMonth()]}`;
    const entry = entries.find(e => e.date === ds);
    const type = entry?.datesAndType?.type;

    if (type === "0036") {
      try {
        const dr = await client.get(`/deskbooking/api/v1/deskbooking/${entry.deskBookingId}`);
        const det = dr.data;
        lines.push(`✅ ${dayName} ${fullDate}`);
        lines.push(`   🏢 ${det.facilitySectorName} → ${det.facilityFloor.trim()} → 💺 ${det.code}`);
      } catch {
        lines.push(`✅ ${dayName} ${fullDate}: Γραφείο`);
      }
    } else if (type === "0035") {
      lines.push(`🏠 ${dayName} ${fullDate}: Τηλεργασία`);
    } else if (holidays[ds]) {
      lines.push(`🏖️ ${dayName} ${fullDate}: ${holidays[ds]}`);
    } else {
      lines.push(`❌ ${dayName} ${fullDate}: Χωρίς κράτηση`);
    }
  }

  await sendNtfy("Kratiseis Evdomadas", lines.join("\n"));
}

main().catch(e => { log(`Error: ${e.message}`); process.exit(1); });
