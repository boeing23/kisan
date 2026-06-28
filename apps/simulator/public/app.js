/**
 * Kisan Alert — farmer app (front-end). A phone-framed, trilingual, voice-and-
 * tap UI that drives the live gateway API. Design from the reference mockup:
 * earthy palette, Material Symbols, bilingual labels, big tap targets, SMS
 * fallback messaging. Pure ES modules, no framework.
 */
const API = new URLSearchParams(location.search).get("api") || "http://localhost:8080";
const vp = document.getElementById("viewport");
const statusbar = document.getElementById("statusbar");

/* ---------- bilingual strings (English primary + Indic subtitle) ---------- */
const T = {
  "en-IN": { hi: "Namaste", speak: "Tap to speak", speakSub: "Ask in your language",
    cropAdvice: "Crop Advice", irrigation: "Irrigation", alerts: "Alerts", health: "Crop Health",
    sub: { cropAdvice: "", irrigation: "", alerts: "", health: "" } },
  "hi-IN": { hi: "नमस्ते", speak: "बोलकर पूछें", speakSub: "अपनी भाषा में पूछें",
    cropAdvice: "Crop Advice", irrigation: "Irrigation", alerts: "Alerts", health: "Crop Health",
    sub: { cropAdvice: "फसल सलाह", irrigation: "सिंचाई", alerts: "चेतावनी", health: "फसल स्वास्थ्य" } },
  "te-IN": { hi: "నమస్తే", speak: "మాట్లాడి అడగండి", speakSub: "మీ భాషలో అడగండి",
    cropAdvice: "Crop Advice", irrigation: "Irrigation", alerts: "Alerts", health: "Crop Health",
    sub: { cropAdvice: "పంట సలహా", irrigation: "నీటిపారుదల", alerts: "హెచ్చరికలు", health: "పంట ఆరోగ్యం" } },
};

/* ---------- state ---------- */
const state = { language: "en-IN", farmer: null, tab: "home" };

/* ---------- helpers ---------- */
const mi = (name, cls = "", style = "") => `<span class="mi ${cls}" style="${style}">${name}</span>`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const t = () => T[state.language] ?? T["en-IN"];

async function api(path, opts) {
  const res = await fetch(API + path, opts);
  if (!res.ok) throw new Error((await res.text()) || res.status);
  return res.json();
}
function render(html, redStatus = false) {
  statusbar.classList.toggle("on-red", redStatus);
  vp.innerHTML = html;
}
function toast(msg, ms = 3200) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = msg;
  vp.appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}

/* ================= SCREEN: language select ================= */
function screenLang() {
  const opt = (code, label, tag, sel) =>
    `<button class="opt ${sel ? "sel" : ""}" data-lang="${code}">
      ${sel ? mi("check_circle", "fill", "font-size:22px") : ""}
      <span style="flex:1">${label}</span><span class="tag">${tag}</span>
    </button>`;
  render(`<div class="screen pad center" style="gap:0">
    <div style="margin:14px auto 0"><div class="app-icon" style="margin:0 auto">${mi("eco", "fill")}</div></div>
    <div class="h1" style="margin-top:14px">Kisan Alert</div>
    <div class="sub" style="margin-top:2px">Smart Water · Crop · Advisory</div>
    <div style="font-size:13px;font-weight:600;color:#3f4f46;margin-top:26px;line-height:1.5">
      Choose your language<br><span style="font-weight:500;color:#7c8a80">भाषा चुनें · భాష ఎంచుకోండి</span></div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:18px;width:100%">
      ${opt("en-IN", "English", "Aa", state.language === "en-IN")}
      ${opt("hi-IN", "हिंदी", "Hindi", state.language === "hi-IN")}
      ${opt("te-IN", "తెలుగు", "Telugu", state.language === "te-IN")}
    </div>
    <div class="row" style="justify-content:center;margin-top:18px;color:var(--green)">
      ${mi("volume_up", "", "font-size:20px")}<span style="font-size:12.5px;font-weight:600">Or say your language</span>${mi("mic", "", "font-size:20px")}</div>
    <div class="spacer"></div>
    <div class="note-sms" style="margin-top:18px">${mi("sms")}No internet? Works on SMS too</div>
    <button class="btn" style="margin-top:12px" id="lang-next">Continue ${mi("arrow_forward")}</button>
  </div>`);
  vp.querySelectorAll("[data-lang]").forEach((b) =>
    b.onclick = () => { state.language = b.dataset.lang; screenLang(); });
  vp.querySelector("#lang-next").onclick = screenRegister;
}

/* ================= SCREEN: register / farm setup ================= */
function screenRegister() {
  render(`<div class="screen">
    <div class="appbar">${mi("arrow_back", "", "font-size:24px")}
      <div><div class="title">Register</div><div class="titles">Set up your farm</div></div></div>
    <div class="pad" style="display:flex;flex-direction:column;gap:14px;flex:1">
      <div><div class="label">Mobile number</div>
        <input class="input" id="r-phone" inputmode="numeric" placeholder="+91 98XXXXXXXX" value="+9198" /></div>
      <div><div class="label">Your name</div>
        <input class="input" id="r-name" placeholder="e.g. Ramesh" /></div>
      <div><div class="label">State</div>
        <div style="display:flex;gap:10px">
          <button class="opt sel" data-state="MH" style="justify-content:center;font-size:15px">Maharashtra</button>
          <button class="opt" data-state="TG" style="justify-content:center;font-size:15px">Telangana</button>
        </div></div>
      <div><div class="label">Current crop</div>
        <input class="input" id="r-crop" placeholder="e.g. cotton" value="cotton" /></div>
      <div class="spacer"></div>
      <button class="btn" id="r-go">Get started ${mi("arrow_forward")}</button>
    </div>
  </div>`);
  let st = "MH";
  vp.querySelectorAll("[data-state]").forEach((b) => b.onclick = () => {
    st = b.dataset.state;
    vp.querySelectorAll("[data-state]").forEach((x) => x.classList.toggle("sel", x === b));
  });
  vp.querySelector(".appbar .mi").onclick = screenLang;
  vp.querySelector("#r-go").onclick = async () => {
    const phone = vp.querySelector("#r-phone").value.trim();
    const name = vp.querySelector("#r-name").value.trim();
    const crop = vp.querySelector("#r-crop").value.trim();
    if (phone.replace(/\D/g, "").length < 10) return toast("Enter a valid mobile number.");
    const tl = toast(`<span class="spin"></span> Registering…`, 0);
    try {
      state.farmer = await api("/register", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, name, language: state.language, state: st, crop }),
      });
      tl.remove(); go("home");
    } catch (e) { tl.remove(); toast("⚠️ " + e.message); }
  };
}

/* ================= SCREEN: home ================= */
async function screenHome() {
  const f = state.farmer, tr = t();
  const field = f.fields[0] || {};
  render(`<div class="screen">
    <div class="pad" style="flex:1;display:flex;flex-direction:column;gap:11px">
      <div class="row" style="align-items:flex-start">
        <div><div class="row" style="gap:4px;color:var(--muted)">${mi("location_on", "", "font-size:15px")}
          <span style="font-size:11.5px;font-weight:600">${esc(field.district)}, ${f.state === "MH" ? "Maharashtra" : "Telangana"}</span></div>
          <div style="font-size:17px;font-weight:700;color:var(--ink);margin-top:2px">${tr.hi}, ${esc(f.name || "Farmer")}</div></div>
        <div class="spacer"></div><span class="pill">${f.language === "te-IN" ? "EN · తె" : f.language === "hi-IN" ? "EN · हिं" : "EN"}</span>
      </div>

      <div class="voice" id="voice">
        <span class="orb">${mi("mic", "fill")}</span>
        <div style="flex:1"><div class="t">${tr.speak}</div><div class="s">${tr.speakSub}</div></div>
        <span class="chip">SMS</span>
      </div>

      <div id="home-banner"></div>

      <div class="grid">
        ${feature("eco", "var(--green)", "var(--tint-green)", tr.cropAdvice, tr.sub.cropAdvice, "crops")}
        ${feature("water_drop", "var(--teal)", "var(--tint-teal)", tr.irrigation, tr.sub.irrigation, "irrigation")}
        ${feature("notifications_active", "var(--earth)", "var(--tint-earth)", tr.alerts, tr.sub.alerts, "alerts")}
        ${feature("photo_camera", "var(--purple)", "var(--tint-purple)", tr.health, tr.sub.health, "health")}
      </div>

      <div id="home-weather" class="weather">${mi("partly_cloudy_day", "fill")}
        <div class="info"><span class="muted">Loading weather…</span></div></div>
    </div>
    ${nav("home")}
  </div>`);
  bindFeatures(); bindNav(); vp.querySelector("#voice").onclick = () => toast("🎙️ Voice input would record here, then call the same APIs.");

  // weather strip
  api(`/weather/${f.id}`).then((w) => {
    const el = vp.querySelector("#home-weather .info");
    if (el) el.innerHTML = `<b>${w.tempC}°C</b> · Rain ${w.rainProb}% · Wind ${w.windKmh}km/h`;
  }).catch(() => {});

  // dry-spell banner from advisory
  api(`/advisory/${f.id}`).then((a) => {
    const b = vp.querySelector("#home-banner");
    if (!b) return;
    if (a.drySpell?.detected) {
      b.innerHTML = `<div class="banner" data-go="alerts">${mi("warning", "fill")}
        <div style="flex:1"><div class="t">Dry spell · ${a.drySpell.dryRunDays} days no rain</div>
        <div class="s">${esc(a.messages.drySpell || "")}</div></div>${mi("chevron_right", "", "color:var(--alert)")}</div>`;
      b.querySelector("[data-go]").onclick = () => go("alerts");
    } else if (a.irrigation?.irrigate) {
      b.innerHTML = `<div class="banner" style="background:var(--tint-teal);border-color:#bcdfe4" data-go="irrigation">
        ${mi("water_drop", "fill", "color:var(--teal)")}<div style="flex:1">
        <div class="t" style="color:#16454d">Irrigation needed soon</div>
        <div class="s" style="color:#3f7a83">${esc(a.messages.irrigation || "")}</div></div>
        ${mi("chevron_right", "", "color:var(--teal)")}</div>`;
      b.querySelector("[data-go]").onclick = () => go("irrigation");
    }
  }).catch(() => {});
}

function feature(icon, color, tint, title, sub, dest) {
  return `<div class="feature" data-go="${dest}">
    <span class="chip" style="background:${tint}">${mi(icon, "", `color:${color}`)}</span>
    <div class="t">${esc(title)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ""}</div>`;
}
function bindFeatures() { vp.querySelectorAll(".feature[data-go]").forEach((c) => c.onclick = () => go(c.dataset.go)); }

/* ================= SCREEN: crop advice (reco) ================= */
async function screenCrops() {
  render(appShell("Crop Advice", t().sub.cropAdvice, `<div id="body" class="pad list"><div class="muted">Loading…</div></div>`, "crops"));
  bindNav(); bindBack();
  try {
    const rec = await api(`/reco/${state.farmer.id}`);
    const medal = ["#1f6b4a", "#2a7e8c", "#c97a36", "#97a39a"];
    vp.querySelector("#body").innerHTML =
      `<div class="sub" style="margin-bottom:2px">Best for your field this ${esc(rec.signals.season)} · based on soil, water & satellite</div>` +
      rec.ranked.map((c, i) => `<div class="card l-green" style="border-left-color:${medal[i] || "#97a39a"}">
        <div class="row"><div style="flex:1"><div class="ct">${i + 1}. ${esc(c.crop)}</div>
        <div class="cs">${esc(c.reason)}</div></div>
        <div style="text-align:right"><div style="font-size:18px;font-weight:800;color:${medal[i] || "#97a39a"}">${Math.round(c.score * 100)}%</div>
        <div style="font-size:9px;color:var(--muted-2)">${c.waterNeedMm ?? "?"}mm water</div></div></div></div>`).join("");
  } catch (e) { vp.querySelector("#body").innerHTML = `<div class="muted">⚠️ ${esc(e.message)}</div>`; }
}

/* ================= SCREEN: irrigation / advisory ================= */
async function screenIrrigation() {
  render(appShell("Irrigation & Fertiliser", t().sub.irrigation, `<div id="body" class="pad list"><div class="muted">Loading…</div></div>`, "irrigation"));
  bindNav(); bindBack();
  await loadAdvisoryInto("#body", { sensor: true, kinds: ["irrigation", "fertilization"] });
}

/* ================= SCREEN: alerts feed ================= */
async function screenAlerts() {
  render(appShell("Alerts & Advisory", t().sub.alerts, `<div id="body" class="pad list"><div class="muted">Loading…</div></div>`, "alerts"), true);
  bindNav(); bindBack();
  await loadAdvisoryInto("#body", { kinds: ["dry_spell", "irrigation", "fertilization"] });
}

async function loadAdvisoryInto(sel, { sensor = false, kinds }) {
  const body = vp.querySelector(sel);
  try {
    const a = await api(`/advisory/${state.farmer.id}`);
    const cards = [];
    if (kinds.includes("dry_spell") && a.drySpell?.detected)
      cards.push(feedCard("warning", "l-red", "#b13c2c", "Dry spell warning", a.messages.drySpell));
    if (kinds.includes("irrigation"))
      cards.push(feedCard("water_drop", "l-teal", "#2a7e8c", "Irrigation guidance",
        a.irrigation?.irrigate ? a.messages.irrigation : "Enough soil moisture — no irrigation needed."));
    if (kinds.includes("fertilization") && a.fertilization?.due)
      cards.push(feedCard("science", "l-amber", "#c97a36", "Fertiliser advice", a.messages.fertilization));
    const srcNote = `<div class="row" style="gap:7px;color:var(--muted-2);margin-top:2px">${mi("sensors", "", "font-size:15px")}
      <span style="font-size:10px;line-height:1.4">From IMD forecast + ${a.moistureSource === "sensor" ? "ground soil-moisture sensor" : "satellite soil moisture"} near you.</span></div>`;
    body.innerHTML = (cards.length ? cards.join("") : `<div class="muted">No advisories right now. 🌱</div>`) + srcNote +
      (sensor ? sensorBox() : "");
    if (sensor) bindSensor();
  } catch (e) { body.innerHTML = `<div class="muted">⚠️ ${esc(e.message)}</div>`; }
}

function feedCard(icon, line, color, title, sub) {
  return `<div class="card ${line}"><div class="row">${mi(icon, "fill", `font-size:22px;color:${color}`)}
    <div style="flex:1"><div class="ct">${esc(title)}</div><div class="cs">${esc(sub || "")}</div></div>
    ${mi("volume_up", "", "font-size:18px;color:var(--green)")}</div>
    <div class="row" style="gap:4px;margin-top:8px;color:var(--muted-2);font-size:10px">${mi("sms", "", "font-size:14px")}Also sent by SMS</div></div>`;
}

function sensorBox() {
  return `<div class="card" style="margin-top:4px"><div class="ct" style="margin-bottom:8px">${mi("sensors", "", "font-size:18px;color:var(--teal)")} Ground sensor (demo)</div>
    <div class="cs" style="margin-bottom:8px">Push a soil-moisture reading — advisory prefers a fresh sensor over satellite.</div>
    <div class="row"><input class="input" id="sm" type="number" min="0" max="1" step="0.01" value="0.10" style="height:42px">
    <button class="btn" id="sm-go" style="width:auto;height:42px;padding:0 14px">Send</button></div></div>`;
}
function bindSensor() {
  vp.querySelector("#sm-go").onclick = async () => {
    const v = parseFloat(vp.querySelector("#sm").value);
    if (Number.isNaN(v)) return toast("Enter 0–1.");
    try {
      await api("/sensors/ingest", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fieldId: state.farmer.fields[0].id, deviceId: "app-sim", soilMoisture: v }) });
      toast("📡 Sensor reading saved. Refreshing advisory…", 1500);
      setTimeout(screenIrrigation, 700);
    } catch (e) { toast("⚠️ " + e.message); }
  };
}

/* ================= SCREEN: crop health (diagnose) ================= */
function screenHealth() {
  render(appShell("Crop Health", t().sub.health, `
    <div class="pad" style="flex:1;display:flex;flex-direction:column;gap:0">
      <label class="dropzone" id="drop">${mi("add_a_photo")}
        <span style="font-size:13px;font-weight:700;color:#5a6b60">Photo of affected crop</span>
        <span style="font-family:monospace;font-size:10px;color:#9aa79d">[ leaf / stem / fruit ]</span>
        <input id="photo" type="file" accept="image/*" hidden></label>
      <div class="divider"><span></span><em>or describe it</em><span></span></div>
      <div class="card row" style="gap:12px"><span class="chip" style="width:42px;height:42px;border-radius:50%;background:var(--tint-earth)">${mi("mic", "fill", "color:var(--earth)")}</span>
        <input class="input" id="voice" placeholder="e.g. yellow spots on leaves" style="border:none;height:auto;padding:0"></div>
      <div class="spacer"></div>
      <button class="btn" id="diag-go" style="margin-top:12px">${mi("biotech", "fill")} Diagnose</button>
    </div>`, "health"));
  bindNav(); bindBack();
  let file = null;
  vp.querySelector("#photo").onchange = (e) => {
    file = e.target.files[0];
    if (file) vp.querySelector("#drop").innerHTML = `<img src="${URL.createObjectURL(file)}">`;
  };
  vp.querySelector("#diag-go").onclick = () => runDiagnose(file, vp.querySelector("#voice").value.trim());
}

async function runDiagnose(file, voice) {
  if (!file && !voice) return toast("Add a photo or describe the problem.");
  const tl = toast(`<span class="spin"></span> ${mi("auto_awesome")} Diagnosing with AI…`, 0);
  try {
    const body = { farmerId: state.farmer.id };
    if (voice) body.voiceTranscript = voice;
    if (file) { body.imageBase64 = await fileB64(file); body.imageMimeType = file.type; }
    const d = await api("/diagnose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    tl.remove(); screenDiagnosis(d);
  } catch (e) { tl.remove(); toast("⚠️ " + e.message); }
}

function screenDiagnosis(d) {
  const target = d.officerTarget === "RSK" ? "Rythu Seva Kendra" : "Krishi Vigyan Kendra";
  render(`<div class="screen">
    <div class="appbar" data-back>${mi("arrow_back")}<div class="title">Diagnosis</div></div>
    <div class="pad list" style="flex:1">
      <div class="ai-badge">${mi("auto_awesome", "fill")}<span>AI PRELIMINARY</span></div>
      <div class="h2" style="font-size:18px;font-weight:800">${esc(d.label)}</div>
      <div>
        <div class="row" style="justify-content:space-between;font-size:10px;color:var(--muted-2);margin-bottom:4px"><span>Confidence</span><b style="color:var(--ink)">${Math.round(d.confidence * 100)}%</b></div>
        <div class="confbar"><div style="width:${Math.round(d.confidence * 100)}%"></div></div>
      </div>
      <div class="warnnote">${mi("info", "fill")}<span>Preliminary AI result. Confirm with an expert before spraying.</span></div>
      <div class="h2" style="font-size:13px">Advice</div>
      <div class="card"><div class="cs" style="font-size:12.5px;color:#3f4f46;line-height:1.5">${esc(d.advice)}</div></div>
      ${d.escalated ? `<div class="expert">
        <div class="k">CONNECT TO EXPERT</div>
        <div class="row" style="margin-top:9px;gap:11px">
          <span style="width:42px;height:42px;border-radius:50%;background:#26443c;display:flex;align-items:center;justify-content:center">${mi("support_agent", "", "color:#9fe0c0")}</span>
          <div style="flex:1"><div style="font-size:13.5px;font-weight:700">${target}</div>
          <div style="font-size:10.5px;color:rgba(255,255,255,.75)">Your case has been escalated to ${d.officerTarget}</div></div></div>
        <div class="row2"><div class="ebtn solid">${mi("call", "fill")} Call</div>
          <div class="ebtn faint">${mi("event")} Book visit</div></div></div>` : ""}
    </div>
    ${nav("health")}
  </div>`);
  bindNav(); vp.querySelector("[data-back]").onclick = () => go("health");
}

/* ================= shell / nav ================= */
function appShell(title, sub, inner, tab) {
  return `<div class="screen">
    <div class="appbar" data-back>${mi("arrow_back")}
      <div><div class="title">${esc(title)}</div>${sub ? `<div class="titles">${esc(sub)}</div>` : ""}</div></div>
    ${inner}
    ${nav(tab)}
  </div>`;
}
function nav(active) {
  const item = (icon, label, tab) => `<div class="tab ${active === tab ? "on" : ""}" data-tab="${tab}">
    ${mi(icon, active === tab ? "fill" : "")}<span>${label}</span></div>`;
  return `<div class="nav">
    ${item("home", "Home", "home")}${item("grass", "Crops", "crops")}
    ${item("notifications", "Alerts", "alerts")}${item("photo_camera", "Health", "health")}
    ${item("grid_view", "More", "more")}</div>`;
}
function bindNav() {
  vp.querySelectorAll(".nav .tab").forEach((tabEl) => tabEl.onclick = () => {
    const tab = tabEl.dataset.tab;
    if (tab === "more") return toast("More services plug in here — built to grow.");
    go(tab);
  });
}
function bindBack() { const b = vp.querySelector("[data-back]"); if (b) b.onclick = () => go("home"); }

/* ================= router ================= */
const SCREENS = { home: screenHome, crops: screenCrops, irrigation: screenIrrigation, alerts: screenAlerts, health: screenHealth };
function go(tab) {
  state.tab = tab;
  (SCREENS[tab] || screenHome)();
}

/* ---------- utils ---------- */
function fileB64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
}

/* ---------- boot ---------- */
screenLang();
