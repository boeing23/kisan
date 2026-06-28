/**
 * Officer console — reads from the Kisan Alert gateway (service-account backed),
 * not Firestore directly. This avoids browser security rules/indexes and keeps
 * data access server-side. Polls every few seconds for near-realtime updates.
 *
 * Shows escalated crop diagnoses (photo + AI advice) with claim/respond/resolve
 * actions, and plots registered farmers on Google Maps.
 */
import { MAPS_API_KEY, GATEWAY_URL, OFFICER_TARGET } from "./config.js";

const SEVERITY_CLASS = { critical: "critical", warning: "warning", advisory: "", info: "" };
const POLL_MS = 5000;
let map;

async function getJSON(path) {
  const res = await fetch(GATEWAY_URL + path);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
async function officerPost(path, body) {
  const res = await fetch(GATEWAY_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) return alert("Action failed: " + (await res.text()));
  refreshCases();
}

async function refreshCases() {
  let cases;
  try {
    cases = await getJSON(`/officer/cases?target=${encodeURIComponent(OFFICER_TARGET)}`);
  } catch (e) {
    document.getElementById("escalations").innerHTML =
      `<p class="empty">Cannot reach gateway (${esc(GATEWAY_URL)}). Is it running?</p>`;
    return;
  }
  document.getElementById("esc-count").textContent = String(cases.length);
  const el = document.getElementById("escalations");
  if (cases.length === 0) {
    el.innerHTML = '<p class="empty">No open escalations.</p>';
    return;
  }
  el.innerHTML = cases.map(renderCase).join("");
}

function renderCase(x) {
  const cls = SEVERITY_CLASS[x.severity] ?? "";
  const photo = x.photoUrl ? `<img class="case-photo" src="${esc(x.photoUrl)}" alt="crop photo" />` : "";
  const transcript = x.voiceTranscript ? `<div class="meta">“${esc(x.voiceTranscript)}”</div>` : "";
  const status = x.status ?? "open";
  const officer = x.assignedOfficer ? ` · ${esc(x.assignedOfficer)}` : "";
  const response = x.officerResponse ? `<div class="response">↩ ${esc(x.officerResponse)}</div>` : "";
  return `<div class="card ${cls}">
    <div class="label">${esc(x.label)} · ${pct(x.confidence)} <span class="status ${esc(status)}">${esc(status)}</span></div>
    <div class="meta">${esc(x.officerTarget ?? "")} · ${esc(x.severity)}${officer} · ${fmt(x.createdAt)}</div>
    ${transcript}
    ${photo}
    <div class="advice">🤖 ${esc(x.advice ?? "")}</div>
    ${response}
    ${renderActions(x.id, status)}
  </div>`;
}

function renderActions(id, status) {
  if (status === "resolved") return "";
  const claim = `<button onclick="kisanClaim('${id}')">Claim</button>`;
  const respond = `<button onclick="kisanRespond('${id}')">Respond</button>`;
  const resolve = `<button class="ghost" onclick="kisanResolve('${id}')">Resolve</button>`;
  return status === "open"
    ? `<div class="actions">${claim} ${respond}</div>`
    : `<div class="actions">${respond} ${resolve}</div>`;
}

window.kisanClaim = (id) => {
  const officer = prompt("Officer id:", "officer-01");
  if (officer) officerPost(`/officer/cases/${id}/claim`, { officer });
};
window.kisanRespond = (id) => {
  const response = prompt("Expert advice for the farmer (English — auto-translated):");
  if (response) officerPost(`/officer/cases/${id}/respond`, { officer: "officer-01", response });
};
window.kisanResolve = (id) => officerPost(`/officer/cases/${id}/resolve`, {});

async function refreshFarmers() {
  let farmers;
  try { farmers = await getJSON("/farmers"); } catch { return; }
  const listEl = document.getElementById("farmer-list");
  listEl.innerHTML =
    farmers.map((f) => `<div class="card"><div class="label">${esc(f.name)}</div>
      <div class="meta">${esc(f.state)} · ${esc(f.language)} · ${f.fields.length} field(s)</div></div>`).join("") ||
    '<p class="empty">No farmers yet.</p>';
  if (!map || !window.google) return;
  for (const f of farmers) for (const field of f.fields) {
    if (!field.location) continue;
    new google.maps.Marker({
      position: { lat: field.location.lat, lng: field.location.lng },
      map,
      title: `${f.name} — ${field.currentCrop ?? "?"} (${field.district})`,
    });
  }
}

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 17.9, lng: 77.6 },
    zoom: 6,
    mapTypeId: "terrain",
  });
  refreshFarmers();
}
function loadMapsScript() {
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&callback=__initMap`;
  s.async = true;
  window.__initMap = initMap;
  document.head.appendChild(s);
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (n) => `${Math.round((n ?? 0) * 100)}%`;
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN") : "");

refreshCases();
refreshFarmers();
loadMapsScript();
setInterval(() => { refreshCases(); refreshFarmers(); }, POLL_MS);
