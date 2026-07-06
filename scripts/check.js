const fs = require("fs");

const STATE_PATH = "state.json";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function loadState() {
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

async function send(text) {
await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });
}

async function main() {
const state = loadState();

const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
const day = now.getDay();
if (day === 0 || day === 6) {
console.log("Weekend, skipping.");
return;
}

const nowMinutes = now.getHours() * 60 + now.getMinutes();
const [startH, startM] = state.startTime.split(":").map(Number);
const [endH, endM] = state.endTime.split(":").map(Number);
const startMinutes = startH * 60 + startM;
const endMinutes = endH * 60 + endM;
const inWindow = startMinutes <= endMinutes
? nowMinutes >= startMinutes && nowMinutes <= endMinutes
: nowMinutes >= startMinutes || nowMinutes <= endMinutes;

if (!inWindow) {
console.log(`Outside window (${state.startTime}-${state.endTime}). Skipping.`);
return;
}

const res = await fetch("https://api.gold-api.com/price/XAU");
const data = await res.json();
const price = data.price;

if (state.referencePrice === null || state.referencePrice === undefined) {
state.referencePrice = price;
saveState(state);
await send(`Started tracking gold from $${price.toFixed(2)} (Asia/Dubai ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}). Will alert on $${state.thresholdUp} up or $${state.thresholdDown} down from here.`);
console.log(`First run, reference set to ${price}`);
return;
}

const ref = state.referencePrice;
const diff = price - ref;
const movedUp = diff > 0 && diff >= state.thresholdUp;
const movedDown = diff < 0 && Math.abs(diff) >= state.thresholdDown;

if (movedUp || movedDown) {
const direction = diff > 0 ? "up" : "down";
const usedThreshold = diff > 0 ? state.thresholdUp : state.thresholdDown;
const message = `Gold Alert: XAU/USD is now $${price.toFixed(2)}, moved ${direction} $${Math.abs(diff).toFixed(2)} from $${ref.toFixed(2)} (threshold: $${usedThreshold} ${direction}).`;
await send(message);
state.referencePrice = price;
saveState(state);
console.log(message);
} else {
console.log(`No alert. Current $${price.toFixed(2)}, ref $${ref.toFixed(2)}, diff $${diff.toFixed(2)}`);
}
}

main().catch((err) => {
console.error(err);
process.exit(1);
});
