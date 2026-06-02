/**
 * Cloud office alert (GitHub Actions).
 * Env: TARGET=today|tomorrow, NTFY_TOPIC=...
 * Reads ./browser-state.json for authentication cookies.
 */

const axios = require("axios");
const fs = require("fs");
const https = require("https");

const NTFY_TOPIC = process.env.NTFY_TOPIC || "myplanner-pkontog";
const BASE_URL = "https://deskbooking.netcompany.com";
const DAYS_GR = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];
const MONTHS_GR = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαι", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sendNtfy(title, message, tags) {
  return new Promise((resolve) => {
    const req = https.request(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: { Title: title, Priority: "5", Tags: tags },
    }, () => { log(`NTFY sent: ${title}`); resolve(); });
    req.on("error", (e) => { log(`NTFY error: ${e.message}`); resolve(); });
    req.write(message);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync("./browser-state.json")) {
    log("No browser-state.json — secret missing?");
    process.exit(1);
  }

  const state = JSON.parse(fs.readFileSync("./browser-state.json", "utf-8"));
  const cookieString = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const client = axios.create({
    baseURL: BASE_URL,
    headers: { Cookie: cookieString, Accept: "application/json" },
    timeout: 15000,
    validateStatus: () => true,
  });

  // In Greek timezone
  const nowGreek = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Athens" }));
  const target = (process.env.TARGET || "today").toLowerCase();
  const targetDate = new Date(nowGreek);
  if (target === "tomorrow") targetDate.setDate(targetDate.getDate() + 1);
  const targetStr = formatDate(targetDate);

  const resp = await client.get(`/deskbooking/api/v1/deskbooking/calendar`, {
    params: { fromDate: targetStr, toDate: targetStr },
  });

  if (resp.status === 401 || resp.status === 403) {
    await sendNtfy("MyPlanner Session Expired!", "Τρέξε το refresh.ts τοπικά και ανέβασε νέο cookies.", "warning");
    process.exit(1);
  }

  if (resp.status !== 200) {
    log(`Calendar HTTP ${resp.status}`);
    process.exit(1);
  }

  const entries = Array.isArray(resp.data) ? resp.data : [];
  const entry = entries.find((e) => e.date === targetStr);

  if (!entry || entry.datesAndType?.type !== "0036") {
    log(`${target} (${targetStr}) is not office — skipping`);
    return;
  }

  const details = await client.get(`/deskbooking/api/v1/deskbooking/${entry.deskBookingId}`);
  if (details.status !== 200) {
    log(`Details HTTP ${details.status}`);
    process.exit(1);
  }

  const d = details.data;
  const dayName = DAYS_GR[targetDate.getDay()];
  const fullDate = `${targetDate.getDate()} ${MONTHS_GR[targetDate.getMonth()]}`;
  const label = target === "tomorrow" ? "ΑΥΡΙΟ" : "ΣΗΜΕΡΑ";

  const message = [
    `🚨 ${label} ΓΡΑΦΕΙΟ`,
    `${dayName} ${fullDate}`,
    "",
    `🏢 ${d.facilitySectorName}`,
    `🏬 ${d.facilityFloor.trim()}`,
    `💺 Γραφείο ${d.code}`,
  ].join("\n");

  const title = target === "tomorrow" ? "Avrio Grafeio!" : "Simera Grafeio!";
  await sendNtfy(title, message, "rotating_light,office");
}

main().catch((e) => { log(`Error: ${e.message}`); process.exit(1); });
