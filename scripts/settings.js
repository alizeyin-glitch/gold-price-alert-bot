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

function menuText(state) {
  return `Gold bot settings - reply with a number:
1) Time window (currently ${state.startTime}-${state.endTime})
2) Alert thresholds (currently up ${state.thresholdUp} / down ${state.thresholdDown})
3) Check interval (fixed at 1 min on this setup)`;
}

async function main() {
  const state = loadState();
  const offset = (state.lastUpdateId || 0) + 1;

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=0`);
  const data = await res.json();
  if (!data.ok || !data.result || data.result.length === 0) {
    console.log("No new updates.");
    return;
  }

  for (const update of data.result) {
    state.lastUpdateId = update.update_id;

    const message = update.message;
    if (!message || !message.text) continue;
    const text = message.text.trim();

    if (text === "/settings" || text === "/start") {
      state.awaitingSince = "menu";
      await send(menuText(state));
      continue;
    }

    if (text === "/status") {
      await send(`Current settings:\nWindow: ${state.startTime}-${state.endTime} (Asia/Dubai)\nThreshold up: ${state.thresholdUp}\nThreshold down: ${state.thresholdDown}\nInterval: 1 min\nReference price: ${state.referencePrice ?? "not set yet"}`);
      continue;
    }

    const awaiting = state.awaitingSince;

    if (awaiting === "menu") {
      if (text === "1") {
        state.awaitingSince = "window";
        await send(`Send the time window like 03:00-10:00 (24h, Asia/Dubai time).`);
      } else if (text === "2") {
        state.awaitingSince = "threshold";
        await send(`Send two numbers separated by a space: <up> <down>\nExample: 50 100`);
      } else if (text === "3") {
        state.awaitingSince = null;
        await send(`Check interval is fixed at 1 minute on this setup.`);
      } else {
        await send(`Please reply with 1, 2, or 3.\n\n${menuText(state)}`);
      }
      saveState(state);
      continue;
    }

    if (awaiting === "window") {
      const match = text.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
      if (!match) {
        await send(`Didn't understand that. Send it like 03:00-10:00.`);
        saveState(state);
        continue;
      }
      state.startTime = match[1];
      state.endTime = match[2];
      state.awaitingSince = null;
      await send(`Done - tracking window set to ${state.startTime}-${state.endTime} (Asia/Dubai).`);
      saveState(state);
      continue;
    }

    if (awaiting === "threshold") {
      const parts = text.split(/[\s,]+/).map(Number);
      if (parts.length !== 2 || parts.some((n) => !n || n <= 0)) {
        await send(`Send two positive numbers separated by a space: <up> <down>, e.g. 50 100`);
        saveState(state);
        continue;
      }
      const [up, down] = parts;
      state.thresholdUp = up;
      state.thresholdDown = down;
      state.awaitingSince = null;
      await send(`Done - alert threshold set to up ${up} / down ${down}.`);
      saveState(state);
      continue;
    }

    await send(`Not sure what you mean. Send /settings to configure, or /status to see current settings.`);
  }

  saveState(state);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
