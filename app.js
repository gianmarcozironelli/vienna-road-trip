const DATA_URL = "data/stops.json";
const STORAGE_KEY = "vienna-road-trip-stops-v4";
const LEGEND_KEY = "vienna-road-trip-legend-v1";
const GUIDE_KEY = "vienna-road-trip-guide-dismissed-v2";
const PLAYLIST_URL =
  "https://open.spotify.com/playlist/3aDwtOxLvqSjrEVLenWUTg?si=UMosfO4GRpW6rfa2GFBNrw&pt=5ca0c8100c1923b78c7246e723f77dfa&pi=uhKMQ7mxQ_6Hn";

const DEFAULT_LEGEND = [
  { id: "hike", label: "Escursione", icon: "🥾" },
  { id: "bar", label: "Bar", icon: "☕" },
  { id: "restaurant", label: "Ristorante", icon: "🍽️" },
  { id: "cakes", label: "Dolci", icon: "🍰" },
  { id: "museum", label: "Museo", icon: "🏛️" },
  { id: "viewpoint", label: "Panorama", icon: "🌇" }
];

const addStopBtn = document.getElementById("addStopBtn");
const addFromTimelineBtn = document.getElementById("addFromTimelineBtn");
const mapStatus = document.getElementById("mapStatus");
const timelineEl = document.getElementById("timeline");
const backdrop = document.getElementById("backdrop");
const toastStack = document.getElementById("toastStack");
const guideCard = document.getElementById("guideCard");
const dismissGuideBtn = document.getElementById("dismissGuideBtn");
const editLegendBtn = document.getElementById("editLegendBtn");
const legendList = document.getElementById("legendList");

const stopSheet = document.getElementById("stopSheet");
const closeStopSheet = document.getElementById("closeStopSheet");
const stopSheetTitle = document.getElementById("stopSheetTitle");
const stopNote = document.getElementById("stopNote");
const stopIconPanel = document.getElementById("stopIconPanel");
const stopLinks = document.getElementById("stopLinks");
const editStopBtn = document.getElementById("editStopBtn");
const removeStopBtn = document.getElementById("removeStopBtn");

const formSheet = document.getElementById("formSheet");
const closeFormSheet = document.getElementById("closeFormSheet");
const stopForm = document.getElementById("stopForm");
const formSheetTitle = document.getElementById("formSheetTitle");
const coordPreview = document.getElementById("coordPreview");
const cancelFormBtn = document.getElementById("cancelFormBtn");
const titleInput = document.getElementById("titleInput");
const noteInput = document.getElementById("noteInput");
const categoryInput = document.getElementById("categoryInput");
const includeRouteInput = document.getElementById("includeRouteInput");
const linksInput = document.getElementById("linksInput");

const legendSheet = document.getElementById("legendSheet");
const closeLegendSheet = document.getElementById("closeLegendSheet");
const legendForm = document.getElementById("legendForm");
const legendRows = document.getElementById("legendRows");
const addLegendRowBtn = document.getElementById("addLegendRowBtn");
const cancelLegendBtn = document.getElementById("cancelLegendBtn");

const confirmModal = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmOkBtn = document.getElementById("confirmOkBtn");

let map;
let routeLine;
let markerLayer;
let sortable = null;
let revealObserver;

let legend = [];
let stops = [];
let activeStopId = null;
let editingStopId = null;
let pendingLatLng = null;
let pendingInsertIndex = null;
let addModeArmed = false;
let didInitialFit = false;
let confirmResolver = null;

init();

async function init() {
  legend = loadLegend();
  stops = await loadStops();
  stops = stops.map((stop) => ({ ...stop, category: normalizeCategory(stop.category) }));

  initMap();
  bindUI();
  setupGuideCard();
  populateCategoryOptions();
  renderLegend();
  renderExperience();
  showToast("Aggiungi una tappa e rendi unico il tuo viaggio.");
}

function loadLegend() {
  const raw = localStorage.getItem(LEGEND_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeLegend(parsed);
      if (normalized.length) return normalized;
    } catch {
      localStorage.removeItem(LEGEND_KEY);
    }
  }
  return DEFAULT_LEGEND.map((item) => ({ ...item }));
}

function normalizeLegend(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const normalized = [];

  items.forEach((item, index) => {
    const label = String(item?.label ?? "").trim();
    if (!label) return;

    let id = String(item?.id ?? "").trim();
    if (!id) id = slugify(label);
    id = uniqueLegendId(id, seen, index);

    const rawIcon = String(item?.icon ?? item?.emoji ?? "").trim();
    const icon = rawIcon || "📍";
    normalized.push({ id, label, icon });
  });

  return normalized;
}

function persistLegend() {
  localStorage.setItem(LEGEND_KEY, JSON.stringify(legend));
}

async function loadStops() {
  const localRaw = localStorage.getItem(STORAGE_KEY);
  if (localRaw) {
    try {
      const parsed = JSON.parse(localRaw);
      if (Array.isArray(parsed) && parsed.length) return normalizeStops(parsed);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Errore caricamento tappe");
    const payload = await response.json();
    return normalizeStops(payload);
  } catch {
    return [
      {
        id: self.crypto?.randomUUID?.() ?? String(Date.now()),
        title: "Partenza da Stephansplatz",
        note: "Primo caffè e si parte con il percorso nel centro storico.",
        category: "bar",
        includeInRoute: true,
        links: [{ label: "Google Maps", url: "https://maps.google.com/?q=Stephansplatz+Vienna" }],
        lat: 48.2084,
        lng: 16.3731
      }
    ];
  }
}

function normalizeStops(data) {
  return data
    .map((stop, index) => ({
      id: String(stop.id ?? `stop-${index + 1}`),
      title: String(stop.title ?? "Tappa senza titolo").trim(),
      note: String(stop.note ?? "").trim(),
      category: normalizeCategory(stop.category),
      includeInRoute: stop.includeInRoute !== false,
      links: normalizeLinks(stop.links, stop.link),
      lat: Number(stop.lat),
      lng: Number(stop.lng)
    }))
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
}

function normalizeCategory(category) {
  const key = String(category ?? "").trim();
  if (legend.some((item) => item.id === key)) return key;
  return legend[0]?.id ?? "category";
}

function normalizeLinks(items, legacyLink) {
  const result = [];
  const source = [];
  if (Array.isArray(items)) source.push(...items);
  if (legacyLink) source.push({ label: "Link esterno", url: legacyLink });

  source.forEach((entry, index) => {
    if (typeof entry === "string") {
      const url = parseHttpUrl(entry.trim());
      if (!url) return;
      result.push({ label: `Link ${index + 1}`, url });
      return;
    }
    const url = parseHttpUrl(String(entry?.url ?? "").trim());
    if (!url) return;
    const label = String(entry?.label ?? "").trim() || `Link ${index + 1}`;
    result.push({ label, url });
  });

  return result;
}

function saveStops() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stops));
}

function initMap() {
  const start = stops[0] ?? { lat: 48.2082, lng: 16.3738 };
  map = L.map("map", { zoomControl: true, tap: true }).setView([start.lat, start.lng], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
  routeLine = L.polyline([], {
    color: "#e6774b",
    weight: 6,
    opacity: 0.86,
    lineJoin: "round"
  }).addTo(map);

  map.on("click", handleMapTap);
}

function bindUI() {
  addStopBtn.addEventListener("click", toggleAddMode);
  addFromTimelineBtn.addEventListener("click", () => {
    openFormSheet({
      mode: "add",
      latlng: map.getCenter(),
      insertIndex: stops.length,
      source: "timeline-end"
    });
  });

  editLegendBtn.addEventListener("click", openLegendSheet);
  closeLegendSheet.addEventListener("click", closeAllSheets);
  cancelLegendBtn.addEventListener("click", closeAllSheets);
  addLegendRowBtn.addEventListener("click", () => addLegendRow());
  legendForm.addEventListener("submit", handleLegendSubmit);

  dismissGuideBtn.addEventListener("click", () => {
    guideCard.hidden = true;
    localStorage.setItem(GUIDE_KEY, "1");
  });

  closeStopSheet.addEventListener("click", closeAllSheets);
  closeFormSheet.addEventListener("click", closeAllSheets);
  cancelFormBtn.addEventListener("click", closeAllSheets);

  backdrop.addEventListener("click", () => {
    if (confirmModal.classList.contains("open")) {
      closeConfirm(false);
      return;
    }
    closeAllSheets();
  });

  editStopBtn.addEventListener("click", () => {
    const stop = stops.find((item) => item.id === activeStopId);
    if (!stop) return;
    openFormSheet({
      mode: "edit",
      stop,
      latlng: { lat: stop.lat, lng: stop.lng },
      source: "edit"
    });
  });

  removeStopBtn.addEventListener("click", async () => {
    if (!activeStopId) return;
    const stop = stops.find((item) => item.id === activeStopId);
    if (!stop) return;

    const confirmed = await openConfirm({
      title: "Rimuovere tappa?",
      message: `La tappa "${stop.title}" verrà rimossa da mappa e timeline.`,
      okLabel: "Rimuovi"
    });
    if (!confirmed) return;

    stops = stops.filter((item) => item.id !== activeStopId);
    saveStops();
    closeAllSheets();
    renderExperience();
    showToast("Tappa rimossa.");
  });

  confirmCancelBtn.addEventListener("click", () => closeConfirm(false));
  confirmOkBtn.addEventListener("click", () => closeConfirm(true));

  stopForm.addEventListener("submit", handleFormSubmit);
}

function setupGuideCard() {
  if (localStorage.getItem(GUIDE_KEY) === "1") guideCard.hidden = true;
}

function populateCategoryOptions() {
  categoryInput.innerHTML = "";
  legend.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.icon} ${item.label}`;
    categoryInput.append(option);
  });
}

function renderLegend() {
  legendList.innerHTML = "";
  legend.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "legend-chip";
    chip.textContent = `${item.icon} ${item.label}`;
    legendList.append(chip);
  });
}

function openLegendSheet() {
  legendRows.innerHTML = "";
  legend.forEach((item) => addLegendRow(item));
  openSheet(legendSheet);
}

function addLegendRow(item = null) {
  const row = document.createElement("div");
  row.className = "legend-row";
  if (item?.id) row.dataset.id = item.id;
  row.innerHTML = `
    <input class="legend-emoji-input" type="text" maxlength="4" placeholder="😀" value="${escapeAttr(item?.icon ?? "📍")}" />
    <input class="legend-label-input" type="text" maxlength="24" placeholder="Nome categoria" value="${escapeAttr(item?.label ?? "")}" />
    <button class="legend-remove-btn" type="button" aria-label="Rimuovi categoria">−</button>
  `;

  row.querySelector(".legend-remove-btn").addEventListener("click", () => {
    if (legendRows.querySelectorAll(".legend-row").length <= 1) {
      showToast("Serve almeno una categoria.");
      return;
    }
    row.remove();
  });

  legendRows.append(row);
}

function handleLegendSubmit(event) {
  event.preventDefault();
  const rows = [...legendRows.querySelectorAll(".legend-row")];
  const next = [];
  const usedIds = new Set();

  rows.forEach((row, index) => {
    const emoji = row.querySelector(".legend-emoji-input").value.trim() || "📍";
    const label = row.querySelector(".legend-label-input").value.trim();
    if (!label) return;

    const existingId = row.dataset.id ? slugify(row.dataset.id) : slugify(label);
    const id = uniqueLegendId(existingId || `cat-${index + 1}`, usedIds, index);
    next.push({ id, label, icon: emoji });
  });

  if (!next.length) {
    showToast("Inserisci almeno una categoria valida.");
    return;
  }

  legend = next;
  persistLegend();
  populateCategoryOptions();
  renderLegend();

  stops = stops.map((stop) => ({
    ...stop,
    category: normalizeCategory(stop.category)
  }));
  saveStops();

  closeAllSheets();
  renderExperience();
  showToast("Legenda aggiornata.");
}

function toggleAddMode() {
  addModeArmed = !addModeArmed;
  pendingInsertIndex = null;
  addStopBtn.classList.toggle("is-armed", addModeArmed);
  mapStatus.textContent = addModeArmed
    ? "Tocca un punto sulla mappa per posizionare la nuova tappa."
    : "Tocca marker o card timeline per vedere i dettagli.";
  if (addModeArmed) closeAllSheets();
}

function handleMapTap(event) {
  if (!addModeArmed) return;
  addModeArmed = false;
  addStopBtn.classList.remove("is-armed");
  openFormSheet({ mode: "add", latlng: event.latlng, source: "map" });
}

function handleFormSubmit(event) {
  event.preventDefault();
  const title = titleInput.value.trim();
  const note = noteInput.value.trim();
  const category = normalizeCategory(categoryInput.value);
  const includeInRoute = includeRouteInput.checked;
  if (!title || !note || !pendingLatLng) return;

  const links = parseLinksInput(linksInput.value);

  if (editingStopId) {
    stops = stops.map((stop) =>
      stop.id === editingStopId
        ? {
            ...stop,
            title,
            note,
            category,
            includeInRoute,
            links,
            lat: pendingLatLng.lat,
            lng: pendingLatLng.lng
          }
        : stop
    );
    showToast("Tappa aggiornata.");
  } else {
    const newStop = {
      id: self.crypto?.randomUUID?.() ?? String(Date.now()),
      title,
      note,
      category,
      includeInRoute,
      links,
      lat: pendingLatLng.lat,
      lng: pendingLatLng.lng
    };
    const insertAt = Number.isInteger(pendingInsertIndex)
      ? clamp(pendingInsertIndex, 0, stops.length)
      : stops.length;
    stops.splice(insertAt, 0, newStop);
    showToast(includeInRoute ? "Tappa aggiunta al percorso." : "Spot aggiunto (non collegato).");
  }

  saveStops();
  closeAllSheets();
  renderExperience();
}

function renderExperience() {
  renderMarkersAndRoute();
  renderTimeline();
}

function renderMarkersAndRoute() {
  markerLayer.clearLayers();
  const allLatLngs = [];
  const routeLatLngs = [];

  stops.forEach((stop) => {
    const latlng = [stop.lat, stop.lng];
    allLatLngs.push(latlng);
    if (stop.includeInRoute) routeLatLngs.push(latlng);

    const marker = L.marker(latlng, { icon: createPinIcon(stop) });
    marker.on("click", () => openStopSheet(stop.id));
    marker.addTo(markerLayer);
  });

  routeLine.setLatLngs(routeLatLngs);

  const fitTarget = routeLatLngs.length ? routeLatLngs : allLatLngs;
  if (!didInitialFit && fitTarget.length > 1) {
    map.fitBounds(L.latLngBounds(fitTarget), { padding: [30, 30] });
    didInitialFit = true;
  } else if (!didInitialFit && fitTarget.length === 1) {
    map.setView(fitTarget[0], 14);
    didInitialFit = true;
  }
}

function createPinIcon(stop) {
  const meta = getCategoryMeta(stop.category);
  return L.divIcon({
    className: "stop-marker-wrap",
    html: `<div class="stop-pin ${stop.includeInRoute ? "" : "is-spot"}"><span>${escapeHtml(meta.icon)}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -34]
  });
}

function renderTimeline() {
  timelineEl.innerHTML = "";

  if (!stops.length) {
    timelineEl.innerHTML = `
      <article class="timeline-card revealed">
        <div class="timeline-icon">🗺️</div>
        <div class="timeline-content">
          <p class="timeline-title">Nessuna tappa</p>
          <p class="timeline-note">Premi "+ Aggiungi tappa" o "+ Aggiungi qui" per iniziare.</p>
        </div>
      </article>
    `;
    if (sortable) sortable.destroy();
    sortable = null;
    return;
  }

  const fragment = document.createDocumentFragment();

  stops.forEach((stop, index) => {
    const meta = getCategoryMeta(stop.category);
    const statusLabel = stop.includeInRoute ? "🟠 Percorso" : "⚪ Spot";

    const card = document.createElement("article");
    card.className = "timeline-card";
    card.dataset.stopId = stop.id;
    card.tabIndex = 0;

    const icon = document.createElement("div");
    icon.className = "timeline-icon";
    icon.textContent = meta.icon;
    icon.setAttribute("aria-hidden", "true");
    card.append(icon);

    const content = document.createElement("div");
    content.className = "timeline-content";
    content.innerHTML = `
      <p class="timeline-title">${escapeHtml(stop.title)}</p>
      <p class="timeline-note">${escapeHtml(stop.note)}</p>
      <span class="timeline-badge ${stop.includeInRoute ? "" : "spot"}">${statusLabel}</span>
    `;
    card.append(content);

    const actions = document.createElement("div");
    actions.className = "timeline-actions";

    const addAfterBtn = document.createElement("button");
    addAfterBtn.type = "button";
    addAfterBtn.className = "timeline-action-btn";
    addAfterBtn.title = "Aggiungi una tappa dopo questa";
    addAfterBtn.setAttribute("aria-label", `Aggiungi tappa dopo ${stop.title}`);
    addAfterBtn.textContent = "+";
    addAfterBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      openFormSheet({
        mode: "add",
        latlng: map.getCenter(),
        insertIndex: index + 1,
        source: "timeline-after",
        afterTitle: stop.title
      });
    });
    actions.append(addAfterBtn);

    const dragBtn = document.createElement("button");
    dragBtn.type = "button";
    dragBtn.className = "drag-handle";
    dragBtn.title = "Trascina per riordinare";
    dragBtn.setAttribute("aria-label", `Trascina ${stop.title}`);
    dragBtn.textContent = "☰";
    actions.append(dragBtn);
    card.append(actions);

    const focusStop = () => {
      map.flyTo([stop.lat, stop.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
      openStopSheet(stop.id);
      highlightTimelineCard(stop.id);
    };

    card.addEventListener("click", (evt) => {
      if (evt.target.closest(".timeline-action-btn") || evt.target.closest(".drag-handle")) return;
      focusStop();
    });
    card.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        focusStop();
      }
    });

    fragment.append(card);
  });

  timelineEl.append(fragment);
  setupRevealObserver();
  setupTimelineSort();
}

function setupRevealObserver() {
  if (revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.24 }
  );
  timelineEl.querySelectorAll(".timeline-card").forEach((card) => revealObserver.observe(card));
}

function setupTimelineSort() {
  if (!window.Sortable || !stops.length) return;
  if (sortable) sortable.destroy();

  sortable = window.Sortable.create(timelineEl, {
    animation: 180,
    draggable: ".timeline-card",
    handle: ".drag-handle",
    ghostClass: "timeline-sort-ghost",
    chosenClass: "timeline-sort-chosen",
    onEnd: ({ oldIndex, newIndex }) => {
      if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex) || oldIndex === newIndex) return;
      stops = arrayMove(stops, oldIndex, newIndex);
      saveStops();
      renderExperience();
      mapStatus.textContent = "Timeline riordinata. Percorso aggiornato in mappa.";
      showToast("Ordine percorso aggiornato.");
    }
  });
}

function openStopSheet(stopId) {
  const stop = stops.find((item) => item.id === stopId);
  if (!stop) return;

  addModeArmed = false;
  addStopBtn.classList.remove("is-armed");
  activeStopId = stopId;
  editingStopId = null;
  pendingLatLng = { lat: stop.lat, lng: stop.lng };
  pendingInsertIndex = null;

  stopSheetTitle.textContent = stop.title;
  stopNote.textContent = stop.note || "Nessuna descrizione disponibile.";
  renderStopIconPanel(stop);
  renderStopLinks(stop);
  openSheet(stopSheet);
}

function renderStopIconPanel(stop) {
  const meta = getCategoryMeta(stop.category);
  const routeText = stop.includeInRoute ? "🟠 Percorso" : "⚪ Spot";
  stopIconPanel.innerHTML = `
    <div class="sheet-main-icon">${meta.icon}</div>
    <div class="sheet-category">${escapeHtml(meta.label)}</div>
    <div class="sheet-route-badge ${stop.includeInRoute ? "" : "spot"}">${routeText}</div>
  `;
}

function renderStopLinks(stop) {
  stopLinks.innerHTML = "";

  const spotifyLink = document.createElement("a");
  spotifyLink.className = "sheet-link-chip";
  spotifyLink.href = PLAYLIST_URL;
  spotifyLink.target = "_blank";
  spotifyLink.rel = "noopener";
  spotifyLink.textContent = "↗ Aggiungi brano su Spotify";
  stopLinks.append(spotifyLink);

  stop.links.forEach((link) => {
    const anchor = document.createElement("a");
    anchor.className = "sheet-link-chip";
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.textContent = `↗ ${link.label}`;
    stopLinks.append(anchor);
  });
}

function openFormSheet({ mode, latlng, stop = null, insertIndex = null, source = "map", afterTitle = "" }) {
  addModeArmed = false;
  addStopBtn.classList.remove("is-armed");
  editingStopId = mode === "edit" && stop ? stop.id : null;
  activeStopId = stop?.id ?? null;
  pendingLatLng = latlng;
  pendingInsertIndex = editingStopId ? null : insertIndex;

  formSheetTitle.textContent = editingStopId ? "Modifica tappa" : "Aggiungi tappa";
  titleInput.value = stop?.title ?? "";
  noteInput.value = stop?.note ?? "";
  categoryInput.value = normalizeCategory(stop?.category ?? legend[0]?.id);
  includeRouteInput.checked = stop?.includeInRoute ?? true;
  linksInput.value = (stop?.links ?? []).map((link) => `${link.label} | ${link.url}`).join("\n");

  const coords = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
  if (source === "timeline-after") {
    coordPreview.textContent = `Centro mappa: ${coords}. La tappa sarà inserita dopo "${afterTitle}".`;
    mapStatus.textContent = "Compila il form per aggiungere la nuova tappa.";
  } else if (source === "timeline-end") {
    coordPreview.textContent = `Centro mappa: ${coords}. La tappa sarà aggiunta in fondo alla timeline.`;
    mapStatus.textContent = "Compila il form per aggiungere la nuova tappa.";
  } else if (source === "edit") {
    coordPreview.textContent = `Coordinate tappa: ${coords}`;
    mapStatus.textContent = "Stai modificando i dettagli della tappa.";
  } else {
    coordPreview.textContent = `Punto mappa: ${coords}`;
    mapStatus.textContent = "Compila il form per salvare la tappa.";
  }

  openSheet(formSheet);
  titleInput.focus();
}

function openSheet(sheet) {
  stopSheet.classList.remove("open");
  stopSheet.setAttribute("aria-hidden", "true");
  formSheet.classList.remove("open");
  formSheet.setAttribute("aria-hidden", "true");
  legendSheet.classList.remove("open");
  legendSheet.setAttribute("aria-hidden", "true");

  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
  refreshOverlayState();
}

function closeAllSheets() {
  stopSheet.classList.remove("open");
  stopSheet.setAttribute("aria-hidden", "true");
  formSheet.classList.remove("open");
  formSheet.setAttribute("aria-hidden", "true");
  legendSheet.classList.remove("open");
  legendSheet.setAttribute("aria-hidden", "true");

  editingStopId = null;
  pendingLatLng = null;
  pendingInsertIndex = null;
  stopForm.reset();
  mapStatus.textContent = "Tocca marker o card timeline per vedere i dettagli.";
  refreshOverlayState();
}

function openConfirm({ title, message, okLabel }) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmOkBtn.textContent = okLabel;
  confirmModal.classList.add("open");
  confirmModal.setAttribute("aria-hidden", "false");
  refreshOverlayState();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function closeConfirm(result) {
  confirmModal.classList.remove("open");
  confirmModal.setAttribute("aria-hidden", "true");
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
  refreshOverlayState();
}

function refreshOverlayState() {
  const anyOpen =
    stopSheet.classList.contains("open") ||
    formSheet.classList.contains("open") ||
    legendSheet.classList.contains("open") ||
    confirmModal.classList.contains("open");
  backdrop.hidden = !anyOpen;
  document.body.style.overflow = anyOpen ? "hidden" : "";
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastStack.append(toast);

  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 260);
  }, 2400);
}

function highlightTimelineCard(stopId) {
  const cards = [...timelineEl.querySelectorAll(".timeline-card")];
  const card = cards.find((item) => item.dataset.stopId === stopId);
  if (!card) return;
  cards.forEach((item) => item.classList.remove("is-focus"));
  card.classList.add("is-focus");
  setTimeout(() => card.classList.remove("is-focus"), 950);
}

function parseLinksInput(value) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const links = [];
  lines.forEach((line, index) => {
    const separator = line.includes("|") ? "|" : ",";
    const parts = line.split(separator).map((part) => part.trim());
    let label = "";
    let url = "";

    if (parts.length >= 2 && parseHttpUrl(parts[1])) {
      label = parts[0];
      url = parts[1];
    } else {
      url = line;
    }

    const safeUrl = parseHttpUrl(url);
    if (!safeUrl) return;
    links.push({ label: label || `Link ${index + 1}`, url: safeUrl });
  });

  return links;
}

function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function getCategoryMeta(category) {
  const id = normalizeCategory(category);
  return legend.find((item) => item.id === id) ?? legend[0] ?? { id: "default", label: "Categoria", icon: "📍" };
}

function uniqueLegendId(base, seen, index) {
  const clean = slugify(base) || `cat-${index + 1}`;
  let candidate = clean;
  let n = 2;
  while (seen.has(candidate)) {
    candidate = `${clean}-${n}`;
    n += 1;
  }
  seen.add(candidate);
  return candidate;
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function arrayMove(items, from, to) {
  const clone = [...items];
  const [item] = clone.splice(from, 1);
  clone.splice(to, 0, item);
  return clone;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
