/**
 * Officer console — reads escalated diagnoses and registered farmers from
 * Firestore (named DB `kisan-db`) and plots farmers on Google Maps. Realtime:
 * escalations update live via onSnapshot.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, FIRESTORE_DB_ID, MAPS_API_KEY } from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, FIRESTORE_DB_ID);

const SEVERITY_CLASS = { critical: "critical", warning: "warning", advisory: "", info: "" };

/** Live-stream escalated diagnoses into the left panel. */
function watchEscalations() {
  const q = query(
    collection(db, "diagnoses"),
    where("escalated", "==", true),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  onSnapshot(q, (snap) => {
    const el = document.getElementById("escalations");
    document.getElementById("esc-count").textContent = String(snap.size);
    if (snap.empty) {
      el.innerHTML = '<p class="empty">No open escalations.</p>';
      return;
    }
    el.innerHTML = snap.docs
      .map((d) => {
        const x = d.data();
        const cls = SEVERITY_CLASS[x.severity] ?? "";
        return `<div class="card ${cls}">
          <div class="label">${esc(x.label)} · ${pct(x.confidence)}</div>
          <div class="meta">${esc(x.officerTarget ?? "")} · ${esc(x.severity)} · ${fmt(x.createdAt)}</div>
          <div class="advice">${esc(x.advice ?? "")}</div>
        </div>`;
      })
      .join("");
  });
}

/** Load farmers once and plot them + list them. */
async function loadFarmers(map) {
  const snap = await getDocs(collection(db, "farmers"));
  const listEl = document.getElementById("farmer-list");
  const cards = [];
  snap.forEach((doc) => {
    const f = doc.data();
    cards.push(`<div class="card">
      <div class="label">${esc(f.name ?? f.phone)}</div>
      <div class="meta">${esc(f.state)} · ${esc(f.language)} · ${f.fields?.length ?? 0} field(s)</div>
    </div>`);
    for (const field of f.fields ?? []) {
      if (!field.location) continue;
      new google.maps.Marker({
        position: { lat: field.location.lat, lng: field.location.lng },
        map,
        title: `${f.name ?? f.phone} — ${field.currentCrop ?? "?"} (${field.district})`,
      });
    }
  });
  listEl.innerHTML = cards.join("") || '<p class="empty">No farmers yet.</p>';
}

/** Bootstrap Google Maps, then load data. */
function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 17.9, lng: 77.6 }, // between Marathwada & Telangana
    zoom: 6,
    mapTypeId: "terrain",
  });
  loadFarmers(map);
}

function loadMapsScript() {
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&callback=__initMap`;
  s.async = true;
  window.__initMap = initMap;
  document.head.appendChild(s);
}

// --- helpers ---
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (n) => `${Math.round((n ?? 0) * 100)}%`;
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN") : "");

watchEscalations();
loadMapsScript();
