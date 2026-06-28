/**
 * Farmer phone simulator. Pure browser JS — talks to the gateway HTTP API so
 * you can demo the whole flow (registration, reco, dry-spell, diagnosis)
 * without real telephony. Mirrors what an Exotel/Gupshup webhook would send.
 */
const $ = (id) => document.getElementById(id);
const api = () => $("api").value.replace(/\/$/, "");
const phone = () => $("phone").value.trim();
const farmerId = () => "farmer-" + phone().replace(/\D/g, "");

function bubble(text, cls = "in") {
  const el = document.createElement("div");
  el.className = `bubble ${cls}`;
  el.textContent = text;
  $("log").appendChild(el);
  $("log").scrollTop = $("log").scrollHeight;
  return el;
}
function sys(t) { bubble(t, "sys"); }

async function post(path, body) {
  const res = await fetch(api() + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
async function get(path) {
  const res = await fetch(api() + path);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function start() {
  $("who").textContent = phone();
  try {
    const r = await post("/webhook/sms", { from: phone() });
    bubble(r.reply, "in");
  } catch (e) { sys("⚠️ " + e.message); }
}

async function send() {
  const text = $("reply").value.trim();
  if (!text) return;
  bubble(text, "out");
  $("reply").value = "";
  try {
    const r = await post("/webhook/sms", { from: phone(), text });
    bubble(r.reply, "in");
  } catch (e) { sys("⚠️ " + e.message); }
}

async function reco() {
  sys("Fetching crop recommendation…");
  try {
    const r = await get(`/reco/${farmerId()}`);
    const card = document.createElement("div");
    card.className = "bubble card";
    card.innerHTML =
      `<div class="t">🌱 Recommended crops (${r.signals.season})</div>` +
      r.ranked.map((c) => `<div>${c.crop} — <b>${Math.round(c.score * 100)}%</b><br><span class="m">${c.reason}</span></div>`).join("<hr style='margin:.3rem 0'>");
    $("log").appendChild(card);
    $("log").scrollTop = $("log").scrollHeight;
  } catch (e) { sys("⚠️ " + e.message + " (register the farmer first)"); }
}

async function dryspell() {
  sys("Running dry-spell check for all farmers…");
  try {
    const r = await post("/jobs/dry-spell", {});
    sys(`Checked ${r.fieldsChecked} field(s) · ${r.alertsCreated} alert(s) created · ${r.alertsSkipped} skipped. (Alerts dispatch as mock SMS — see gateway console.)`);
  } catch (e) { sys("⚠️ " + e.message); }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function diagnose() {
  const voice = $("voice").value.trim();
  const file = $("photo").files[0];
  if (!voice && !file) return sys("Add a description or a photo first.");

  const body = { farmerId: farmerId() };
  if (voice) { bubble(voice, "out"); body.voiceTranscript = voice; }
  if (file) {
    body.imageBase64 = await fileToBase64(file);
    body.imageMimeType = file.type;
    const img = document.createElement("div");
    img.className = "bubble out";
    img.innerHTML = `<img src="${URL.createObjectURL(file)}" />`;
    $("log").appendChild(img);
  }
  sys("Diagnosing with Gemini…");
  try {
    const d = await post("/diagnose", body);
    const card = document.createElement("div");
    card.className = "bubble card";
    card.innerHTML =
      `<div class="t">🔬 ${d.label} · ${Math.round(d.confidence * 100)}%</div>` +
      `<div class="m">${d.severity}${d.escalated ? ` · escalated to ${d.officerTarget}` : ""}</div>` +
      `<div style="margin-top:.4rem">${d.advice}</div>`;
    $("log").appendChild(card);
    $("log").scrollTop = $("log").scrollHeight;
    $("voice").value = ""; $("photo").value = "";
  } catch (e) { sys("⚠️ " + e.message + " (register the farmer first)"); }
}

function reset() { $("log").innerHTML = ""; sys("Session reset. Press Start to call."); }

$("start").onclick = start;
$("send").onclick = send;
$("reply").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
$("reco").onclick = reco;
$("dryspell").onclick = dryspell;
$("diagnose").onclick = diagnose;
$("reset").onclick = reset;
$("dash").onclick = (e) => { e.preventDefault(); sys("Run the dashboard separately: npx serve apps/dashboard/public"); };

sys("Press 📞 Start / Call to begin. Then reply 1 (Marathi), give a name, 1 (Maharashtra), a crop.");
