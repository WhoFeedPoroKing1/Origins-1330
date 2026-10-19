const S = {
  roster: "origins_roster_v2",
  enemies: "origins_enemies_v2",
  notes: "origins_notes_v2",
  mapBg: "origins_vtt_bg_v2",
  tokens: "origins_vtt_tokens_v2",
  dm: "origins_dm_v2",
  worldDraw: "origins_world_draw_v2",
  scenes: "origins_scenes_v1",
  activeScene: "origins_active_scene_v1",
  lore: "origins_lore_v1",
  sessionLog: "origins_session_log_v1",
};
const DM_PASS = "1";
const TITLE_COLOR = {
  Büyücü: "var(--c-buyucu)", Kâhin: "var(--c-kahin)", Cadı: "var(--c-cadi)",
  Kafir: "var(--c-kafir)", Seçilmiş: "var(--c-secilmis)", Kutsanmış: "var(--c-kutsanmis)",
  Keşiş: "var(--c-kesis)", Şaman: "var(--c-saman)", Diğer: "var(--c-diger)", Yaratık: "var(--c-diger)",
};

function load(k, fb) {
  try {
    const raw = localStorage.getItem(k);
    if (raw == null) return fb;
    return JSON.parse(raw);
  } catch {
    return fb;
  }
}

function save(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch (err) {
    console.warn("save failed", k, err);
    try {
      alert("Kayıt alanı doldu. Bir map’i sil veya Dışa aktar ile yedekle, sonra gereksiz sahneleri temizle.");
    } catch (_) {}
    return false;
  }
}

function loadRoster() { return load(S.roster, []); }
function saveRoster(l) { return save(S.roster, l); }
function loadEnemies() { return load(S.enemies, []); }
function saveEnemies(l) { return save(S.enemies, l); }

function loadScenes() {
  const list = load(S.scenes, null);
  if (Array.isArray(list) && list.length) return list;
  // migrate single map/tokens into first scene
  const tokens = load(S.tokens, []);
  let mapBg = null;
  try { mapBg = localStorage.getItem(S.mapBg); } catch (_) {}
  const scene = {
    id: uid(),
    name: "Sahne 1",
    mapBg: mapBg || null,
    mapOX: 0,
    mapOY: 0,
    mapScale: 1,
    tokens: tokens || [],
  };
  save(S.scenes, [scene]);
  save(S.activeScene, scene.id);
  return [scene];
}

function saveScenes(list) { return save(S.scenes, list); }
function getActiveSceneId() {
  return localStorage.getItem(S.activeScene) || (loadScenes()[0] && loadScenes()[0].id) || "";
}
function setActiveSceneId(id) {
  try { localStorage.setItem(S.activeScene, id); } catch (_) {}
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}
function uid() {
  let prefix = "";
  try {
    prefix = (window.OriginsSync && OriginsSync.clientId()) || sessionStorage.getItem("origins_client_id") || "";
  } catch (_) {}
  if (!prefix) {
    prefix = "c" + Math.random().toString(36).slice(2, 7);
    try { sessionStorage.setItem("origins_client_id", prefix); } catch (_) {}
  }
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function titleClass(t) {
  return "title-" + (t || "Diğer");
}

function exportFullState() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    roster: loadRoster(),
    enemies: loadEnemies(),
    scenes: loadScenes(),
    activeScene: getActiveSceneId(),
    notes: load(S.notes, ""),
    lore: load(S.lore, { regions: "", npcs: "", summary: "" }),
    sessionLog: load(S.sessionLog, []),
  };
}

function importFullState(data) {
  if (!data || typeof data !== "object") throw new Error("Geçersiz dosya");
  if (data.roster) saveRoster(data.roster);
  if (data.enemies) saveEnemies(data.enemies);
  if (Array.isArray(data.scenes)) saveScenes(data.scenes);
  if (data.activeScene) setActiveSceneId(data.activeScene);
  if (data.notes != null) save(S.notes, data.notes);
  if (data.lore) save(S.lore, data.lore);
  if (data.sessionLog) save(S.sessionLog, data.sessionLog);
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("menuBtn");
  const nav = document.getElementById("nav");
  if (btn && nav) {
    btn.addEventListener("click", () => nav.classList.toggle("open"));
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));
  }
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((a) => {
    if ((a.getAttribute("href") || "") === path) a.classList.add("active");
  });
});
