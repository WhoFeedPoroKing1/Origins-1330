/**
 * Origins storage — tarayıcıya özel, site güncellemesi silmez
 * Anahtar isimleri SABİT tutulur (v2/v1 değişince migration yapılır)
 */
const S = {
  roster: "origins_roster_v2",
  enemies: "origins_enemies_v2",
  notes: "origins_notes_v2",
  mapBg: "origins_vtt_bg_v2",
  tokens: "origins_vtt_tokens_v2",
  dm: "origins_dm_v2",
  dmChars: "origins_dm_chars_v1",
  worldDraw: "origins_world_draw_v2",
  scenes: "origins_scenes_v1",
  activeScene: "origins_active_scene_v1",
  lore: "origins_lore_v1",
  sessionLog: "origins_session_log_v1",
  sfx: "origins_sfx_v1",
  amb: "origins_amb_custom_v1",
  displayName: "origins_display_name",
};

const DM_PASS = "1";
const TITLE_COLOR = {
  Büyücü: "var(--c-buyucu)", Kâhin: "var(--c-kahin)", Cadı: "var(--c-cadi)",
  Kafir: "var(--c-kafir)", Seçilmiş: "var(--c-secilmis)", Kutsanmış: "var(--c-kutsanmis)",
  Keşiş: "var(--c-kesis)", Şaman: "var(--c-saman)", Diğer: "var(--c-diger)", Yaratık: "var(--c-diger)",
};

/** Eski anahtarlardan bir kerelik taşı */
(function migrateStorage() {
  const pairs = [
    ["origins_roster", S.roster],
    ["origins_roster_v1", S.roster],
    ["origins_enemies", S.enemies],
    ["origins_enemies_v1", S.enemies],
    ["origins_dm_chars", S.dmChars],
  ];
  pairs.forEach(([from, to]) => {
    try {
      if (localStorage.getItem(to) != null) return;
      const raw = localStorage.getItem(from);
      if (raw != null) localStorage.setItem(to, raw);
    } catch (_) {}
  });
})();

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
    try { localStorage.setItem("origins_last_save_at", String(Date.now())); } catch (_) {}
    return true;
  } catch (err) {
    console.warn("save failed", k, err);
    try {
      alert("Kayıt alanı doldu. Yedek al (Dışa aktar), sonra gereksiz sahneleri/map’leri sil.");
    } catch (_) {}
    return false;
  }
}

function loadRoster() { return load(S.roster, []); }
function saveRoster(l) { return save(S.roster, l); }
function loadEnemies() { return load(S.enemies, []); }
function saveEnemies(l) { return save(S.enemies, l); }
function loadDmChars() { return load(S.dmChars, []); }
function saveDmChars(l) { return save(S.dmChars, l); }

function loadScenes() {
  const list = load(S.scenes, null);
  if (Array.isArray(list) && list.length) return list;
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

/** Tüm kişisel kayıt (site güncellemesi bunlara dokunmaz) */
function exportFullState() {
  let mapBg = null;
  try { mapBg = localStorage.getItem(S.mapBg); } catch (_) {}
  return {
    version: 2,
    app: "origins-1330",
    exportedAt: new Date().toISOString(),
    roster: loadRoster(),
    enemies: loadEnemies(),
    dmChars: loadDmChars(),
    scenes: loadScenes(),
    activeScene: getActiveSceneId(),
    notes: load(S.notes, ""),
    lore: load(S.lore, { regions: "", npcs: "", summary: "" }),
    sessionLog: load(S.sessionLog, []),
    mapBg: mapBg,
    sfx: load(S.sfx, {}),
    amb: load(S.amb, {}),
    displayName: (function () {
      try { return localStorage.getItem(S.displayName) || ""; } catch (_) { return ""; }
    })(),
  };
}

function importFullState(data) {
  if (!data || typeof data !== "object") throw new Error("Geçersiz dosya");
  if (data.roster) saveRoster(data.roster);
  if (data.enemies) saveEnemies(data.enemies);
  if (data.dmChars) saveDmChars(data.dmChars);
  if (Array.isArray(data.scenes)) saveScenes(data.scenes);
  if (data.activeScene) setActiveSceneId(data.activeScene);
  if (data.notes != null) save(S.notes, data.notes);
  if (data.lore) save(S.lore, data.lore);
  if (data.sessionLog) save(S.sessionLog, data.sessionLog);
  if (data.mapBg) {
    try { localStorage.setItem(S.mapBg, data.mapBg); } catch (_) {}
  }
  if (data.sfx) save(S.sfx, data.sfx);
  if (data.amb) save(S.amb, data.amb);
  if (data.displayName) {
    try {
      localStorage.setItem(S.displayName, data.displayName);
      sessionStorage.setItem(S.displayName, data.displayName);
    } catch (_) {}
  }
}

function downloadBackup() {
  const data = exportFullState();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "origins-yedek-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function importBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        importFullState(data);
        resolve(data);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Debounced auto-save helper */
function createAutoSaver(fn, ms) {
  let t = null;
  return function () {
    clearTimeout(t);
    const args = arguments;
    t = setTimeout(() => {
      try { fn.apply(null, args); } catch (e) { console.warn("autosave", e); }
    }, ms == null ? 600 : ms);
  };
}

function flashSaveStatus(el, ok) {
  if (!el) return;
  el.textContent = ok ? "Kaydedildi" : "Kayıt hatası";
  el.classList.toggle("save-ok", !!ok);
  el.classList.toggle("save-err", !ok);
  clearTimeout(el._saveTimer);
  el._saveTimer = setTimeout(() => {
    el.textContent = "Otomatik kayıt açık";
    el.classList.remove("save-ok", "save-err");
  }, 1600);
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

  // Global yedek butonları (sayfada varsa)
  document.getElementById("backupExport")?.addEventListener("click", () => {
    try { downloadBackup(); } catch (e) { alert("Yedek alınamadı"); }
  });
  document.getElementById("backupImport")?.addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      await importBackupFile(f);
      alert("Yedek yüklendi. Sayfa yenileniyor.");
      location.reload();
    } catch (err) {
      alert("Yedek okunamadı: " + (err.message || err));
    }
    e.target.value = "";
  });
});

// Global erişim (DM sayfası vb.)
try {
  window.S = S;
  window.loadRoster = loadRoster;
  window.saveRoster = saveRoster;
  window.loadDmChars = loadDmChars;
  window.saveDmChars = saveDmChars;
  window.exportFullState = exportFullState;
  window.importFullState = importFullState;
  window.downloadBackup = downloadBackup;
  window.importBackupFile = importBackupFile;
  window.createAutoSaver = createAutoSaver;
  window.flashSaveStatus = flashSaveStatus;
  window.uid = uid;
  window.esc = esc;
  window.load = load;
  window.save = save;
} catch (_) {}
