/**
 * ORIGINS VTT — stable engine (no giant canvases)
 * Camera pan/zoom · viewport grid · map upload · tokens · orbs · ruler · dice · init
 */
function initVTT() {
  const board = document.getElementById("vttBoard");
  if (!board) return;

  const CELL = 50;
  const FEET = 5;

  /** Izgara boyut kademeleri (kare sayısı). Küçük = yarım kare */
  const TOKEN_SIZE_STEPS = [0.5, 1, 2, 3, 4, 6];
  const TOKEN_SIZE_LABELS = {
    0.5: "Küçük (½)",
    1: "Orta (1×1)",
    2: "Büyük (2×2)",
    3: "Çok büyük (3×3)",
    4: "Devasa (4×4)",
    6: "Titan (6×6)",
  };
  function normalizeTokenSize(s) {
    const n = +s;
    if (!isFinite(n) || n <= 0) return 1;
    // eski sürekli ölçek (0.4–3) → en yakın kademe
    let best = 1, bestD = 1e9;
    TOKEN_SIZE_STEPS.forEach((step) => {
      const d = Math.abs(step - n);
      if (d < bestD) { bestD = d; best = step; }
    });
    return best;
  }
  function tokenFootprint(t) {
    return normalizeTokenSize(t && t.size != null ? t.size : 1);
  }
  function getTokenSpeed(tok) {
    if (!tok) return 0;
    if (tok.speed != null && isFinite(+tok.speed)) return Math.max(0, Math.min(20, +tok.speed | 0));
    try {
      if (tok.refId != null) {
        const roster = typeof loadRoster === "function" ? loadRoster() : [];
        const ch = roster.find((c) => String(c.id) === String(tok.refId));
        if (ch) {
          if (tok.form === "ally" && ch.creature && ch.creature.spd != null)
            return Math.max(0, +ch.creature.spd || 0);
          const hu = ch.human || ch;
          if (hu.spd != null) return Math.max(0, +hu.spd || 0);
          if (ch.spd != null) return Math.max(0, +ch.spd || 0);
        }
        const en = typeof loadEnemies === "function" ? loadEnemies() : [];
        const e = en.find((x) => String(x.id) === String(tok.refId));
        if (e && (e.spd != null || e.speed != null)) return Math.max(0, +(e.spd != null ? e.spd : e.speed) || 0);
        const dm = typeof loadDmChars === "function" ? loadDmChars() : [];
        const d = dm.find((x) => String(x.id) === String(tok.refId));
        if (d && (d.spd != null || d.speed != null)) return Math.max(0, +(d.spd != null ? d.spd : d.speed) || 0);
      }
    } catch (_) {}
    return 0;
  }
  function rollInitiativeScore(tok) {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const spd = getTokenSpeed(tok);
    return { d20: d20, speed: spd, total: d20 + spd };
  }
  /** cx,cy = sol-üst kare; merkez world px */
  function tokenCenterWorld(t) {
    const fp = tokenFootprint(t);
    return {
      x: t.cx * CELL + (fp * CELL) / 2,
      y: t.cy * CELL + (fp * CELL) / 2,
    };
  }

  // Camera (screen = world * scale + pan)
  let scale = 1;
  let panX = 0;
  let panY = 0;

  let tool = "select";
  let tokens = [];
  try { tokens = load(S.tokens, []); } catch (_) { tokens = []; }
  let selectedId = null;

  let drag = null; // { type, ... }
  const localDragging = new Set(); // token ids being moved locally
  const tokenMoveMeta = Object.create(null); // id -> { t, seq, from }
  let rulerA = null;

  // Map image transform in world space
  let mapScale = 1;
  let mapOX = 0;
  let mapOY = 0;
  let mapLocked = true;

  let advMode = "normal";
  let rolling = false;
  let initiative = [];
  let turnIdx = 0;
  let atkFromId = null;
  const STATUS_DEFS = [
    { id: "bleeding", icon: "🩸", label: "Kanıyor" },
    { id: "exhausted", icon: "😓", label: "Yorgun" },
    { id: "poisoned", icon: "☠", label: "Zehirli" },
    { id: "burning", icon: "🔥", label: "Yanıyor" },
    { id: "frozen", icon: "❄", label: "Donmuş" },
    { id: "stunned", icon: "💫", label: "Sersem" },
    { id: "frightened", icon: "😨", label: "Korkmuş" },
    { id: "blessed", icon: "✨", label: "Kutsanmış" },
    { id: "blinded", icon: "🙈", label: "Kör" },
    { id: "prone", icon: "⬇", label: "Yerde" },
    { id: "baygin", icon: "💤", label: "Baygın" },
  ];

  function normalizeStatuses(list) {
    if (!Array.isArray(list)) return [];
    return list.map((s) => {
      if (typeof s === "string") {
        return { id: s, turns: 3, dmg: 0, heal: 0, adv: "", skip: s === "stunned" || s === "frozen" || s === "baygin", skipN: s === "baygin" ? 99 : 1 };
      }
      return {
        id: s.id,
        turns: s.turns != null ? +s.turns : 3,
        dmg: +s.dmg || 0,
        heal: +s.heal || 0,
        adv: s.adv || "",
        skip: !!s.skip,
        skipN: +s.skipN || 1,
      };
    });
  }

  let statusEdit = null;

  function openStatusModal(tokenId, statusId) {
    const tok = tokens.find((x) => x.id === tokenId);
    if (!tok) return;
    tok.statuses = normalizeStatuses(tok.statuses);
    const st = tok.statuses.find((s) => s.id === statusId);
    if (!st) return;
    statusEdit = { tokenId, statusId };
    const d = STATUS_DEFS.find((x) => x.id === statusId);
    const title = document.getElementById("stModalTitle");
    if (title) title.textContent = (d ? d.icon + " " + d.label : statusId) + " ayarı";
    document.getElementById("stTurns").value = st.turns;
    document.getElementById("stDmg").value = st.dmg || 0;
    document.getElementById("stHeal").value = st.heal || 0;
    document.getElementById("stAdv").value = st.adv || "";
    document.getElementById("stSkip").checked = !!st.skip;
    document.getElementById("stSkipN").value = st.skipN || 1;
    document.getElementById("statusModal")?.classList.add("on");
  }

  function chatAdd(text, cls, opts) {
    opts = opts || {};
    const el = document.getElementById("chatLog");
    if (!el) return;
    const line = document.createElement("div");
    if (cls) line.className = cls;
    const time = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    line.innerHTML = "<span style=\"color:#6b665c\">" + time + "</span> " + text;
    el.prepend(line);
    try {
      const log = load("origins_chat_v1", []);
      log.unshift({ t: time, text, cls: cls || "" });
      save("origins_chat_v1", log.slice(0, 100));
    } catch (_) {}
    if (!opts.skipSync) {
      try { window.OriginsSync && OriginsSync.pushChat({ text, cls: cls || "", t: time }); } catch (_) {}
    }
  }

  function tokenDistFt(a, b) {
    if (!a || !b) return 0;
    return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy)) * FEET;
  }

  let atkToId = null;
  let activePlayerId = sessionStorage.getItem('origins_active_player') || '';
  let vfxList = load('origins_vfx_v1', []);
  let vfxSelected = null;
  let vfxType = 'fire';
  let vfxPlaceMode = false;
  let vfxScale = 1.2;
  const VFX_BASE = 100; // px base size
  let undoStack = [];
  const UNDO_MAX = 30;

  function pushUndo() {
    undoStack.push(JSON.stringify({ tokens, vfxList, selectedId, vfxSelected }));
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  }
  function doUndo() {
    if (!undoStack.length) return;
    const snap = JSON.parse(undoStack.pop());
    tokens = snap.tokens || [];
    vfxList = snap.vfxList || [];
    selectedId = snap.selectedId || null;
    vfxSelected = snap.vfxSelected || null;
    saveTokens();
    saveVfx();
    renderTokens();
    renderVfx();
    renderInspector();
    renderHP();
  }


  // DOM
  const world = document.getElementById("vttWorld");
  const bgImg = document.getElementById("vttBg");
  const tokLayer = document.getElementById("vttTokens");
  const gridCv = document.getElementById("vttGrid");
  const drawCv = document.getElementById("vttDraw");
  const gctx = gridCv.getContext("2d");
  const dctx = drawCv.getContext("2d");

  // ── Camera ──
  function applyCamera() {
    world.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    redrawGrid();
  }

  function worldFromClient(cx, cy) {
    const r = board.getBoundingClientRect();
    return {
      x: (cx - r.left - panX) / scale,
      y: (cy - r.top - panY) / scale,
    };
  }

  function sizeCanvases() {
    const w = board.clientWidth || 800;
    const h = board.clientHeight || 600;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    [gridCv, drawCv].forEach((c) => {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.width = w + "px";
      c.style.height = h + "px";
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    redrawGrid();
    try { if (typeof sizeFog === "function") sizeFog(); } catch (_) {}
  }

  function redrawGrid() {
    const w = board.clientWidth;
    const h = board.clientHeight;
    if (!w || !h) return;
    gctx.clearRect(0, 0, w, h);

    // World-space visible bounds
    const x0 = -panX / scale;
    const y0 = -panY / scale;
    const x1 = (w - panX) / scale;
    const y1 = (h - panY) / scale;

    const startX = Math.floor(x0 / CELL) * CELL;
    const startY = Math.floor(y0 / CELL) * CELL;

    gctx.save();
    gctx.translate(panX, panY);
    gctx.scale(scale, scale);

    gctx.strokeStyle = "rgba(212,175,55,0.12)";
    gctx.lineWidth = 1 / scale;
    for (let x = startX; x <= x1; x += CELL) {
      gctx.beginPath();
      gctx.moveTo(x, y0);
      gctx.lineTo(x, y1);
      gctx.stroke();
    }
    for (let y = startY; y <= y1; y += CELL) {
      gctx.beginPath();
      gctx.moveTo(x0, y);
      gctx.lineTo(x1, y);
      gctx.stroke();
    }

    // Major every 5 cells
    const major = CELL * 5;
    const sx = Math.floor(x0 / major) * major;
    const sy = Math.floor(y0 / major) * major;
    gctx.strokeStyle = "rgba(212,175,55,0.22)";
    gctx.lineWidth = 1.5 / scale;
    for (let x = sx; x <= x1; x += major) {
      gctx.beginPath();
      gctx.moveTo(x, y0);
      gctx.lineTo(x, y1);
      gctx.stroke();
    }
    for (let y = sy; y <= y1; y += major) {
      gctx.beginPath();
      gctx.moveTo(x0, y);
      gctx.lineTo(x1, y);
      gctx.stroke();
    }
    gctx.restore();
  }

  function zoomAt(sx, sy, delta) {
    const wx = (sx - panX) / scale;
    const wy = (sy - panY) / scale;
    const next = Math.min(3, Math.max(0.25, scale + delta));
    panX = sx - wx * next;
    panY = sy - wy * next;
    scale = next;
    applyCamera();
  }

  function centerCamera() {
    scale = 1;
    panX = (board.clientWidth || 800) / 2;
    panY = (board.clientHeight || 600) / 2;
    applyCamera();
  }

  // ── Map image ──
  function applyMapXF() {
    if (!bgImg) return;
    bgImg.style.transformOrigin = "0 0";
    bgImg.style.transform = `translate(${mapOX}px, ${mapOY}px) scale(${mapScale})`;
  }

  function syncMapUI() {
    const btn = document.getElementById("mapLockBtn");
    if (btn) {
      btn.textContent = mapLocked ? "🔒 Map kilitli" : "🔓 Map açık";
      btn.classList.toggle("active", !mapLocked);
    }
    const sl = document.getElementById("mapScaleSlider");
    if (sl) {
      sl.disabled = mapLocked;
      sl.value = String(mapScale);
    }
  }

  function loadMapDataUrl(dataUrl, opts) {
    if (!dataUrl) return;
    opts = opts || {};
    const preserve = !!opts.preserve;
    const savedScale = mapScale;
    const savedOX = mapOX;
    const savedOY = mapOY;
    bgImg.onload = () => {
      bgImg.style.display = "block";
      bgImg.style.width = bgImg.naturalWidth + "px";
      bgImg.style.height = bgImg.naturalHeight + "px";
      if (preserve) {
        mapScale = savedScale || 1;
        mapOX = savedOX;
        mapOY = savedOY;
      } else {
        mapScale = 1;
        mapOX = -bgImg.naturalWidth / 2;
        mapOY = -bgImg.naturalHeight / 2;
      }
      applyMapXF();
      syncMapUI();
    };
    bgImg.onerror = () => {
      console.error("Map image failed to load");
      alert("Map yüklenemedi. Farklı bir görsel dene (PNG/JPG).");
    };
    bgImg.src = dataUrl;
  }

  // ── Multi-scene system ──
  let scenes = typeof loadScenes === "function" ? loadScenes() : [];
  let activeSceneId = typeof getActiveSceneId === "function" ? getActiveSceneId() : (scenes[0] && scenes[0].id);

  function currentScene() {
    return scenes.find((s) => s.id === activeSceneId) || scenes[0];
  }

  function snapshotScene() {
    const sc = currentScene();
    if (!sc) return;
    sc.tokens = JSON.parse(JSON.stringify(tokens));
    sc.mapOX = mapOX;
    sc.mapOY = mapOY;
    sc.mapScale = mapScale;
    // Map görseli: önce mevcut bg, sonra sahne kaydı
    if (bgImg && bgImg.src && bgImg.style.display !== "none") {
      const src = bgImg.getAttribute("src") || bgImg.src || "";
      if (src.indexOf("data:") === 0) sc.mapBg = src;
    }
    if (!sc.mapBg) {
      try {
        const legacy = localStorage.getItem(S.mapBg);
        if (legacy) sc.mapBg = legacy;
      } catch (_) {}
    }
    // full package: fog / darkness / walls / doors
    try {
      sc.fogRects = JSON.parse(JSON.stringify(fogRects || []));
      sc.darknessRects = JSON.parse(JSON.stringify(darknessRects || []));
      sc.walls = JSON.parse(JSON.stringify(walls || []));
      sc.doors = JSON.parse(JSON.stringify(doors || []));
    } catch (_) {}
  }

  function persistScenes() {
    snapshotScene();
    if (typeof saveScenes === "function") saveScenes(scenes);
    if (typeof setActiveSceneId === "function") setActiveSceneId(activeSceneId);
    // legacy mirrors
    try { save(S.tokens, tokens); } catch (_) {}
    // Map yedeği ayrı anahtarda (yeniden girişte garanti)
    try {
      const sc = currentScene();
      if (sc && sc.mapBg && String(sc.mapBg).indexOf("data:") === 0) {
        localStorage.setItem(S.mapBg, sc.mapBg);
      }
      localStorage.setItem("origins_map_xf_v1", JSON.stringify({
        mapOX: mapOX,
        mapOY: mapOY,
        mapScale: mapScale,
        sceneId: activeSceneId || null,
        t: Date.now(),
      }));
    } catch (_) {}
  }

  // Sayfa kapanınca / gizlenince mutlaka kaydet
  function bindMapPersistLifecycle() {
    const saveNow = () => { try { persistScenes(); } catch (_) {} };
    window.addEventListener("beforeunload", saveNow);
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveNow();
    });
    // periyodik yedek (30 sn)
    setInterval(saveNow, 30000);
  }
  try { bindMapPersistLifecycle(); } catch (_) {}


  function applyScene(sc) {
    if (!sc) return;
    activeSceneId = sc.id;
    tokens = Array.isArray(sc.tokens) ? JSON.parse(JSON.stringify(sc.tokens)) : [];
    selectedId = null;
    mapOX = sc.mapOX || 0;
    mapOY = sc.mapOY || 0;
    mapScale = sc.mapScale || 1;
    if (sc.mapBg) {
      const keepScale = sc.mapScale || 1;
      const keepOX = sc.mapOX || 0;
      const keepOY = sc.mapOY || 0;
      bgImg.onload = () => {
        bgImg.style.display = "block";
        bgImg.style.width = bgImg.naturalWidth + "px";
        bgImg.style.height = bgImg.naturalHeight + "px";
        mapScale = keepScale;
        mapOX = keepOX;
        mapOY = keepOY;
        applyMapXF();
        syncMapUI();
      };
      bgImg.src = sc.mapBg;
    } else {
      bgImg.removeAttribute("src");
      bgImg.style.display = "none";
      applyMapXF();
      syncMapUI();
    }
    const sl = document.getElementById("mapScaleSlider");
    if (sl) sl.value = String(mapScale);
    if (typeof setActiveSceneId === "function") setActiveSceneId(activeSceneId);
    // restore vision package
    try {
      if (Array.isArray(sc.fogRects)) fogRects = JSON.parse(JSON.stringify(sc.fogRects));
      if (Array.isArray(sc.darknessRects)) darknessRects = JSON.parse(JSON.stringify(sc.darknessRects));
      if (Array.isArray(sc.walls)) walls = JSON.parse(JSON.stringify(sc.walls));
      if (Array.isArray(sc.doors)) doors = JSON.parse(JSON.stringify(sc.doors));
      persistVision();
      scheduleVision();
      renderDoors();
    } catch (_) {}
    renderTokens();
    renderInspector();
    renderHP();
    renderSceneList();
    try { updateActionBar(); } catch (_) {}
  }

  function renderSceneList() {
    const el = document.getElementById("sceneList");
    if (!el) return;
    el.innerHTML = scenes.map((s) =>
      `<div class="scene-item${s.id === activeSceneId ? " active" : ""}" data-sc="${s.id}">
        <span class="sn">${esc(s.name)}</span>
        <button type="button" data-del-sc="${s.id}" title="Sil">×</button>
      </div>`
    ).join("");
    el.querySelectorAll("[data-sc]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.dataset.delSc) return;
        if (row.dataset.sc === activeSceneId) return;
        persistScenes();
        const sc = scenes.find((x) => x.id === row.dataset.sc);
        if (sc) applyScene(sc);
      });
    });
    el.querySelectorAll("[data-del-sc]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (scenes.length <= 1) return alert("En az bir sahne kalmalı.");
        if (!confirm("Sahne silinsin mi?")) return;
        const id = btn.dataset.delSc;
        scenes = scenes.filter((s) => s.id !== id);
        if (activeSceneId === id) {
          activeSceneId = scenes[0].id;
          applyScene(scenes[0]);
        }
        persistScenes();
        renderSceneList();
      });
    });
  }

  document.getElementById("sceneAdd")?.addEventListener("click", () => {
    if (!isDm()) return;
    persistScenes();
    const name = (document.getElementById("sceneNameInput")?.value || "").trim() || ("Sahne " + (scenes.length + 1));
    const sc = {
      id: uid(),
      name,
      mapBg: null,
      mapOX: 0,
      mapOY: 0,
      mapScale: 1,
      tokens: [],
    };
    scenes.push(sc);
    document.getElementById("sceneNameInput").value = "";
    applyScene(sc);
    persistScenes();
  });

  document.getElementById("sceneSave")?.addEventListener("click", () => {
    if (!isDm()) return;
    persistScenes();
    alert("Sahne kaydedildi.");
  });

  document.getElementById("sceneReset")?.addEventListener("click", () => {
    if (!isDm()) return;
    if (!confirm("Bu sahnedeki tüm tokenlar silinsin mi? Map kalır.")) return;
    tokens = [];
    selectedId = null;
    persistScenes();
    renderTokens();
    renderInspector();
    renderHP();
  });

  document.getElementById("exportState")?.addEventListener("click", () => {
    persistScenes();
    const data = typeof exportFullState === "function" ? exportFullState() : { scenes, tokens };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "origins-save-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById("importState")?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (typeof importFullState === "function") importFullState(data);
        scenes = typeof loadScenes === "function" ? loadScenes() : (data.scenes || []);
        activeSceneId = typeof getActiveSceneId === "function" ? getActiveSceneId() : scenes[0]?.id;
        applyScene(currentScene());
        alert("İçe aktarıldı. Sayfa yenilenirse de kalır.");
      } catch (err) {
        alert("Dosya okunamadı: " + err.message);
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  });

  // Load active scene map/tokens
  (function initScenes() {
    const sc = currentScene();
    if (sc) {
      tokens = Array.isArray(sc.tokens) ? JSON.parse(JSON.stringify(sc.tokens)) : tokens;
      mapOX = sc.mapOX || 0;
      mapOY = sc.mapOY || 0;
      mapScale = sc.mapScale || 1;
      // Ayrı kayıttan konum (daha güncel olabilir)
      try {
        const xf = JSON.parse(localStorage.getItem("origins_map_xf_v1") || "null");
        if (xf && (xf.sceneId == null || xf.sceneId === activeSceneId || xf.sceneId === sc.id)) {
          if (xf.mapOX != null) mapOX = xf.mapOX;
          if (xf.mapOY != null) mapOY = xf.mapOY;
          if (xf.mapScale != null) mapScale = xf.mapScale;
        }
      } catch (_) {}
      let bg = sc.mapBg;
      if (!bg) {
        try { bg = localStorage.getItem(S.mapBg); } catch (_) {}
      }
      if (bg) {
        sc.mapBg = bg;
        loadMapDataUrl(bg, { preserve: true });
      }
      applyMapXF();
      syncMapUI();
    }
    renderSceneList();
  })();

  document.getElementById("mapUpload")?.addEventListener("change", (e) => {
    if (!isDm()) { alert("Sadece DM map yükleyebilir."); return; }
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      alert("Sadece görsel dosyası seç.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = reader.result;
      function finishMap(dataUrl) {
        const sc = currentScene();
        if (sc) sc.mapBg = dataUrl;
        try { localStorage.setItem(S.mapBg, dataUrl); } catch (err) {
          console.warn("Map localStorage büyük", err);
        }
        bgImg.onload = () => {
          bgImg.style.display = "block";
          bgImg.style.width = bgImg.naturalWidth + "px";
          bgImg.style.height = bgImg.naturalHeight + "px";
          mapScale = mapScale || 1;
          mapOX = Math.round((-bgImg.naturalWidth / 2) / CELL) * CELL;
          mapOY = Math.round((-bgImg.naturalHeight / 2) / CELL) * CELL;
          applyMapXF();
          syncMapUI();
          persistScenes();
          // Herkese map gönder (chunk)
          try {
            if (window.OriginsSync && OriginsSync.pushMapImage) {
              OriginsSync.pushMapImage(dataUrl, { mapOX: mapOX, mapOY: mapOY, mapScale: mapScale });
            }
          } catch (_) {}
          scheduleSync();
          setTimeout(() => {
            try {
              if (window.OriginsSync && OriginsSync.pushMapImage) {
                OriginsSync.pushMapImage(dataUrl, { mapOX: mapOX, mapOY: mapOY, mapScale: mapScale });
              }
              scheduleSync();
            } catch (_) {}
          }, 500);
          chatAdd("Map yüklendi — odaya gönderiliyor…", "sys");
        };
        bgImg.onerror = () => alert("Map görseli yüklenemedi");
        bgImg.src = dataUrl;
      }
      // Yüksek çözünürlük tut (büyütünce daha az pikselleşsin) + yumuşak ölçek
      try {
        const img = new Image();
        img.onload = () => {
          const maxEdge = 4096;
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > maxEdge || h > maxEdge) {
            const r = Math.min(maxEdge / w, maxEdge / h);
            w = Math.round(w * r);
            h = Math.round(h * r);
          }
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          const ctx = c.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, w, h);
          let out = c.toDataURL("image/jpeg", 0.92);
          if (out.length > 5e6) out = c.toDataURL("image/jpeg", 0.82);
          if (out.length > 6.5e6) out = c.toDataURL("image/jpeg", 0.7);
          finishMap(out);
        };
        img.onerror = () => finishMap(rawUrl);
        img.src = rawUrl;
      } catch (_) {
        finishMap(rawUrl);
      }
    };
    reader.onerror = () => alert("Dosya okunamadı.");
    reader.readAsDataURL(f);
    e.target.value = "";
  });

  
  document.getElementById("portraitSyncBtn")?.addEventListener("click", () => {
    try {
      pushAllTokenPortraits();
      if (window.OriginsSync && OriginsSync.requestAllPortraits) OriginsSync.requestAllPortraits();
      chatAdd("🖼 Token resimleri odaya gönderiliyor / isteniyor…", "sys");
    } catch (e) {
      alert("Gönderilemedi");
    }
  });
  document.getElementById("mapResendBtn")?.addEventListener("click", () => {
    if (!isDm()) return;
    let dataUrl = null;
    try {
      const sc = currentScene();
      dataUrl = (sc && sc.mapBg) || localStorage.getItem(S.mapBg) || null;
    } catch (_) {}
    if (!dataUrl && bgImg && bgImg.src && bgImg.src.startsWith("data:")) dataUrl = bgImg.src;
    if (!dataUrl) {
      alert("Gönderilecek map yok — önce map yükle.");
      return;
    }
    if (!window.OriginsSync || !OriginsSync.isConnected || !OriginsSync.isConnected()) {
      alert("Önce çevrimiçi ol (Masada bağlan).");
      return;
    }
    try {
      OriginsSync.pushMapImage(dataUrl, { mapOX: mapOX, mapOY: mapOY, mapScale: mapScale });
      chatAdd("Map odaya tekrar gönderiliyor…", "sys");
    } catch (e) {
      alert("Gönderilemedi: " + (e.message || e));
    }
  });

  document.getElementById("mapClearBg")?.addEventListener("click", () => {
    if (!isDm()) return;
    if (!confirm("Map herkes için silinsin mi?")) return;
    const sc = currentScene();
    if (sc) sc.mapBg = null;
    try { localStorage.removeItem(S.mapBg); } catch (_) {}
    bgImg.removeAttribute("src");
    bgImg.style.display = "none";
    bgImg.style.width = "";
    bgImg.style.height = "";
    persistScenes();
    try {
      if (window.OriginsSync && OriginsSync.pushState) {
        // özel silme işareti
        OriginsSync.pushChat({ text: "Map kaldırıldı", cls: "sys", t: Date.now() });
      }
      if (window.OriginsSync && typeof OriginsSync._publish === "function") {}
    } catch (_) {}
    // map_clear mesajı
    try {
      if (window.OriginsSync && OriginsSync.pushMapClear) OriginsSync.pushMapClear();
    } catch (_) {}
    scheduleSync();
  });

  document.getElementById("mapLockBtn")?.addEventListener("click", () => {
    if (!isDm()) return;
    mapLocked = !mapLocked;
    syncMapUI();
  });
  document.getElementById("mapScaleSlider")?.addEventListener("input", (e) => {
    if (!isDm() || mapLocked) return;
    mapScale = parseFloat(e.target.value) || 1;
    applyMapXF();
  });
  document.getElementById("mapScaleSlider")?.addEventListener("change", () => {
    try { persistScenes(); } catch (_) {}
  });
  document.getElementById("mapScaleReset")?.addEventListener("click", () => {
    if (!isDm() || mapLocked) return;
    mapScale = 1;
    if (bgImg.naturalWidth) {
      mapOX = -bgImg.naturalWidth / 2;
      mapOY = -bgImg.naturalHeight / 2;
    } else {
      mapOX = 0;
      mapOY = 0;
    }
    const sl = document.getElementById("mapScaleSlider");
    if (sl) sl.value = "1";
    applyMapXF();
  });

  // ── Tools ──
  function setTool(t) {
    const prevTool = tool;
    tool = t;
    if (prevTool === "ruler" && t !== "ruler") { try { clearRuler(); } catch (_) {} }
    document.querySelectorAll("[data-tool]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === t);
    });
    board.classList.remove("cursor-pan", "cursor-ruler", "cursor-token", "cursor-attack", "dragging");
    if (t === "pan") board.classList.add("cursor-pan");
    if (t === "ruler") board.classList.add("cursor-ruler");
    if (t === "token") board.classList.add("cursor-token");
    if (t === "attack") board.classList.add("cursor-attack");
    // Cetvel / kaydır: tokenlara hiç dokunma
    if (tokLayer) {
      tokLayer.style.pointerEvents = (t === "ruler" || t === "pan") ? "none" : "auto";
    }
    const fl = document.getElementById("vttFx");
    if (fl) fl.style.pointerEvents = (t === "ruler" || t === "pan") ? "none" : "auto";
  }
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.addEventListener("click", () => setTool(b.dataset.tool));
  });
  setTool("select");

  document.getElementById("zoomIn")?.addEventListener("click", () => {
    zoomAt(board.clientWidth / 2, board.clientHeight / 2, 0.15);
  });
  document.getElementById("zoomOut")?.addEventListener("click", () => {
    zoomAt(board.clientWidth / 2, board.clientHeight / 2, -0.15);
  });
  document.getElementById("zoomReset")?.addEventListener("click", centerCamera);

  board.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      // Alt+wheel scales selected effect
      if (e.altKey && vfxSelected) {
        const fx = vfxList.find((x) => x.id === vfxSelected);
        if (fx) {
          fx.scale = Math.min(4, Math.max(0.3, (fx.scale || 1) + (e.deltaY > 0 ? -0.1 : 0.1)));
          vfxScale = fx.scale;
          const sl = document.getElementById("fxScale");
          if (sl) sl.value = String(fx.scale);
          const sv = document.getElementById("fxScaleVal");
          if (sv) sv.textContent = fx.scale.toFixed(1) + "×";
          saveVfx();
          renderVfx();
        }
        return;
      }
      const r = board.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? -0.12 : 0.12);
    },
    { passive: false }
  );

  // ── Actors dropdown ──
  function loadDmChars() {
    try { return JSON.parse(localStorage.getItem("origins_dm_chars_v1") || "[]"); }
    catch { return []; }
  }

  function refreshActors() {
    const sel = document.getElementById("placeActor");
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Token seç —</option>';
    loadRoster().forEach((c) => {
      const o = document.createElement("option");
      o.value = "p:" + c.id;
      o.textContent = "👤 " + c.name;
      sel.appendChild(o);
    });
    loadDmChars().forEach((d) => {
      const o = document.createElement("option");
      o.value = "d:" + d.id;
      o.textContent = (d.role === "dusman" ? "☠ " : (d.role === "notr" ? "○ " : "🛡 ")) + d.name + " (DM)";
      sel.appendChild(o);
    });
    loadEnemies().forEach((en) => {
      // skip if already linked from dm chars
      if (en.dmId) return;
      const o = document.createElement("option");
      o.value = "e:" + en.id;
      o.textContent = "☠ " + en.name;
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  }
  refreshActors();

  function renderLibDrawer() {
    const el = document.getElementById("libDrawerList");
    if (!el) return;
    if (!isDm()) {
      el.innerHTML = '<p style="color:#6b665c;font-size:0.8rem;padding:0.5rem">Sadece DM kütüphaneyi kullanır.</p>';
      return;
    }
    const list = typeof loadDmChars === "function" ? loadDmChars() : [];
    if (!list.length) {
      el.innerHTML = '<p style="color:#6b665c;font-size:0.8rem;padding:0.5rem">Kütüphane boş. DM kanalından (dm.html) NPC/düşman ekle.</p>';
      return;
    }
    el.innerHTML = list.map((c) => {
      const role = c.role === "dusman" ? "enemy" : (c.role === "notr" ? "neutral" : "npc");
      const tag = c.role === "dusman" ? "Düşman" : (c.role === "notr" ? "Nötr" : "Dost");
      return `<div class="lib-card ${role}" data-lib-id="${c.id}">
        ${c.portrait ? `<img src="${c.portrait}" alt="" draggable="false" />` : `<div style="width:44px;height:44px;border-radius:6px;background:#1a1a22;flex-shrink:0"></div>`}
        <div class="meta">
          <strong>${esc(c.name)}</strong>
          <span>${tag}${c.creature ? " · 🐉" : ""} · ${c.hp}/${c.hpMax}</span>
        </div>
      </div>`;
    }).join("");

    el.querySelectorAll(".lib-card").forEach((card) => {
      card.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const id = card.dataset.libId;
        if (!id) return;
        const ghost = card.cloneNode(true);
        ghost.classList.add("lib-ghost");
        ghost.style.position = "fixed";
        ghost.style.left = e.clientX - 40 + "px";
        ghost.style.top = e.clientY - 24 + "px";
        ghost.style.zIndex = "9999";
        ghost.style.pointerEvents = "none";
        ghost.style.width = "160px";
        ghost.style.opacity = "0.9";
        ghost.style.boxShadow = "0 8px 24px rgba(0,0,0,0.5)";
        document.body.appendChild(ghost);
        card.classList.add("dragging");
        document.getElementById("libDropHint")?.classList.add("on");
        const bar = document.getElementById("libBar");
        if (bar) bar.style.pointerEvents = "none";

        const onMove = (ev) => {
          ghost.style.left = ev.clientX - 40 + "px";
          ghost.style.top = ev.clientY - 24 + "px";
        };
        const onUp = (ev) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          ghost.remove();
          card.classList.remove("dragging");
          if (bar) bar.style.pointerEvents = "";
          document.getElementById("libDropHint")?.classList.remove("on");
          // Drop only if over board
          const r = board.getBoundingClientRect();
          if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
            dropLibAtClient(ev.clientX, ev.clientY, "d:" + id);
          }
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
    });
  }

  function syncLibButton() {
    const btn = document.getElementById("openLibBtn");
    if (!btn) return;
    btn.style.display = isDm() ? "" : "none";
    if (!isDm()) document.getElementById("libBar")?.classList.remove("open");
  }

  document.getElementById("openLibBtn")?.addEventListener("click", () => {
    if (!isDm()) return alert("Kütüphane sadece DM içindir.");
    const bar = document.getElementById("libBar");
    if (!bar) return;
    bar.classList.toggle("open");
    if (bar.classList.contains("open")) renderLibDrawer();
  });
  document.getElementById("libClose")?.addEventListener("click", () => {
    document.getElementById("libBar")?.classList.remove("open");
  });

  function dropLibAtClient(clientX, clientY, val) {
    if (!isDm()) return;
    if (!val || !val.startsWith("d:")) return;
    const place = document.getElementById("placeActor");
    if (place) {
      refreshActors();
      if (![...place.options].some((o) => o.value === val)) {
        const o = document.createElement("option");
        o.value = val;
        o.textContent = "DM";
        place.appendChild(o);
      }
      place.value = val;
    }
    const r = board.getBoundingClientRect();
    const w = {
      x: (clientX - r.left - panX) / scale,
      y: (clientY - r.top - panY) / scale,
    };
    placeToken(Math.floor(w.x / CELL), Math.floor(w.y / CELL));
    const bar = document.getElementById("libBar");
    if (bar) {
      bar.classList.remove("open");
      bar.style.pointerEvents = "";
    }
    document.getElementById("libDropHint")?.classList.remove("on");
  }

  function refreshActivePlayer() {
    const sel = document.getElementById("activePlayer");
    if (!sel) return;
    const cur = activePlayerId;
    sel.innerHTML = '<option value="">— Seç (DM tümü) —</option>';
    loadRoster().forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  }
  refreshActivePlayer();
  document.getElementById("activePlayer")?.addEventListener("change", (e) => {
    activePlayerId = e.target.value || "";
    sessionStorage.setItem("origins_active_player", activePlayerId);
    refreshAtkSelects();
    if (typeof renderAbilityList === "function") renderAbilityList();
  });

  function canControlToken(tok) {
    if (!tok) return false;
    if (isDm()) return true;
    // Oyuncu: üstten "Ben" ile karakter seç
    if (!activePlayerId) return false;
    const me = loadRoster().find((c) => c.id === activePlayerId);
    if (!me) return false;
    const myId = String(activePlayerId);
    const myName = String(me.name || "").trim();
    // Kendi karakter token’ı
    if (tok.refId != null && String(tok.refId) === myId) return true;
    // Yoldaş (ally) — aynı refId veya sahip adı
    if (tok.form === "ally") {
      if (tok.refId != null && String(tok.refId) === myId) return true;
      if (tok.owner && myName && String(tok.owner) === myName) return true;
      // isim "X · Yoldaş" ise
      if (myName && tok.name && String(tok.name).indexOf(myName) === 0) return true;
    }
    // Sahip alanı
    if (tok.owner && myName && String(tok.owner) === myName) return true;
    // İsim birebir (tek karakter token)
    if (myName && tok.name && String(tok.name) === myName && tok.form !== "ally") return true;
    return false;
  }

  function canEditToken(tok) {
    return canControlToken(tok);
  }

  /** Oyuncu kendi token / yoldaşını silebilir; DM hepsini */
  function canDeleteToken(tok) {
    if (!tok) return false;
    if (isDm()) return true;
    return canControlToken(tok);
  }

  function deleteTokenById(id, opts) {
    opts = opts || {};
    const tok = tokens.find((x) => x.id === id);
    if (!tok) return false;
    if (!canDeleteToken(tok)) {
      if (!opts.silent) alert("Sadece kendi token’ını veya yoldaşını silebilirsin. Üstten “Ben” ile karakterini seç.");
      return false;
    }
    // Yoldaş silinirken sadece o; karakter silinirken isteğe bağlı yoldaşı da
    const alsoAlly = !!opts.withAlly && tok.form !== "ally";
    tokens = tokens.filter((x) => {
      if (x.id === tok.id) return false;
      if (alsoAlly && x.form === "ally" && String(x.refId) === String(tok.refId)) return false;
      return true;
    });
    if (selectedId === id) selectedId = null;
    if (atkFromId === id) atkFromId = null;
    if (atkToId === id) atkToId = null;
    initiative = (initiative || []).filter((r) => r.id !== id);
    saveTokens();
    renderTokens();
    renderInspector();
    renderHP();
    try { renderInit(); } catch (_) {}
    try { scheduleSync(); } catch (_) {}
    return true;
  }


  // ── Tokens ──
  const TITLE_HEX = {
    Büyücü: "#b07ce8", Kâhin: "#7b6cf0", Cadı: "#e85a5a", Kafir: "#b03030",
    Seçilmiş: "#d4af37", Kutsanmış: "#f0e0a0", Keşiş: "#c4a574", Şaman: "#4caf7a",
    Diğer: "#8a8898", Yaratık: "#8a8898",
  };

  function saveTokens() {
    try { save(S.tokens, tokens); } catch (_) {}
    if (typeof persistScenes === "function") {
      try { persistScenes(); } catch (_) {}
    }
  }


  function animateToken(id, cls, ms) {
    const el = tokLayer.querySelector('.tok[data-id="' + id + '"]');
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms || 500);
  }

  function renderTokens() {
    try { /* action bar after */ } catch (_) {}

    tokLayer.innerHTML = "";
    tokens.forEach((t) => {
      const el = document.createElement("div");
      const stList = normalizeStatuses(t.statuses);
      const isTurn = !!(initiative.length && initiative[turnIdx] && (
        initiative[turnIdx].id === t.id ||
        (initiative[turnIdx].name && initiative[turnIdx].name === t.name)
      ));
      // Hidden tokens: only DM sees fully; players skip render
      if (t.hidden && !isDm()) return;
      // Gece / Kanlı Ay: oyuncu sadece kendi 60 ft görüşündeki tokenları görür
      if (!isDm() && typeof isNightVision === "function" && isNightVision()) {
        const viewers = tokens.filter((tk) => canControlToken(tk));
        const R = (typeof feetToWorld === "function" ? feetToWorld(60) : 600);
        const pos = { x: t.cx * CELL + CELL / 2, y: t.cy * CELL + CELL / 2 };
        const seen = viewers.some((v) => {
          const vx = v.cx * CELL + CELL / 2;
          const vy = v.cy * CELL + CELL / 2;
          return Math.hypot(pos.x - vx, pos.y - vy) <= R + CELL * 0.6;
        });
        if (!seen && !canControlToken(t)) return;
      }
      const faction = t.faction || (t.enemy ? "enemy" : (t.role === "notr" ? "neutral" : (t.role === "dost" ? "ally" : "")));
      el.className = "tok"
        + (faction === "enemy" || t.enemy ? " enemy" : "")
        + (faction === "ally" ? " ally" : "")
        + (faction === "neutral" ? " neutral" : "")
        + (selectedId === t.id ? " sel" : "")
        + (atkFromId === t.id ? " attacker" : "")
        + (atkToId === t.id ? " target" : "")
        + ((t.hp ?? 1) <= 0 ? " downed" : "")
        + (t._spawn ? " spawn" : "")
        + (t._moving ? " moving" : "")
        + (isTurn ? " turn-now" : "")
        + (t.hidden ? " hidden-tok" : "")
        + (t.lightOn ? " lit" : "")
        + stList.map((s) => " st-" + s.id).join("");
      // world coords: cell center
      {
        const fp = tokenFootprint(t);
        const ctr = tokenCenterWorld(t);
        const px = Math.max(8, fp * CELL);
        el.style.left = ctr.x + "px";
        el.style.top = ctr.y + "px";
        el.style.width = px + "px";
        el.style.height = px + "px";
        el.style.setProperty("--tok-scale", "1");
        el.dataset.size = String(fp);
      }
      el.dataset.id = t.id;

      // Faction borders override title colors (dost mavi, düşman kırmızı, nötr beyaz)
      if (faction === "enemy" || t.enemy) {
        el.style.borderColor = "#e05a5a";
        el.style.color = "#e05a5a";
      } else if (faction === "ally") {
        el.style.borderColor = "#5b8def";
        el.style.color = "#5b8def";
      } else if (faction === "neutral") {
        el.style.borderColor = "#f0f0f0";
        el.style.color = "#f0f0f0";
      } else if (TITLE_HEX[t.title]) {
        el.style.borderColor = TITLE_HEX[t.title];
        el.style.color = TITLE_HEX[t.title];
      }

      const ini = (t.name || "?").slice(0, 2).toUpperCase();
      const low = (t.hp / (t.hpMax || 1)) <= 0.3;
      const hasPort = !!(t.portrait && String(t.portrait).indexOf("data:") === 0);
      if (hasPort) {
        el.classList.add("has-img");
        el.style.backgroundImage = "url(" + t.portrait + ")";
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
      }
      const canResize = selectedId === t.id && (canControlToken(t) || isDm());
      el.innerHTML =
        (hasPort ? "" : `<span class="tok-initial">${esc(ini)}</span>`) +
        ((t.hp ?? 1) <= 0 ? (t.deathSaves && t.deathSaves.dead
          ? `<span class="tok-downed" title="Ölü">☠</span>`
          : t.deathSaves && t.deathSaves.stable
            ? `<span class="tok-downed" title="Stabil">💤</span>`
            : `<span class="tok-downed" title="Ölüm zarı">💀</span>`) : "") +
        ((t.hp ?? 1) <= 0 && t.deathSaves && !t.deathSaves.dead
          ? `<span class="tok-ds" title="Ölüm zarı">✓${t.deathSaves.success || 0} ✗${t.deathSaves.fail || 0}</span>`
          : "") +
        `<div class="tok-orbs"><span class="r" title="Can">${t.hp ?? 0}</span><span class="g" title="Max">${t.hpMax ?? 0}</span>` +
        (isDm() ? `<span class="b" title="AC (DM)">${t.ac ?? 10}</span>` : "") +
        `</div>` +
        (stList.length
          ? `<div class="tok-statuses">${stList.map((st) => {
              const d = STATUS_DEFS.find((x) => x.id === st.id);
              const turns = st.turns != null ? st.turns : "?";
              const tip = (d ? d.label : st.id) + " · " + turns + " tur";
              return `<span class="tok-st" data-st-id="${st.id}" title="${tip}">${d ? d.icon : "•"}<span class="st-turns">${turns}</span></span>`;
            }).join("")}</div>`
          : "") +
        (t.owner ? `<span class="tok-owner">${esc(t.owner)}</span>` : "") +
        (t.form === "ally" ? `<span class="tok-owner" style="top:auto;bottom:-28px;background:#e05a5a;color:#fff">Yoldaş</span>` : "") +
        `<span class="tok-hp ${low ? "low" : ""}">${t.hp}/${t.hpMax}</span>` +
        (canResize ? `<span class="tok-resize" title="Sürükle: boyut"></span>` : "");

      tokLayer.appendChild(el);

      // Köşeden boyut (Roll20 tarzı)
      const resizeEl = el.querySelector(".tok-resize");
      if (resizeEl) {
        resizeEl.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!canControlToken(t) && !isDm()) return;
          selectedId = t.id;
          const rect = board.getBoundingClientRect();
          const ctr = tokenCenterWorld(t);
          const cx = rect.left + ctr.x * scale + panX;
          const cy = rect.top + ctr.y * scale + panY;
          drag = {
            type: "resize",
            id: t.id,
            startSize: tokenFootprint(t),
            cx: cx,
            cy: cy,
            ox: e.clientX,
            oy: e.clientY,
          };
          try { resizeEl.setPointerCapture(e.pointerId); } catch (_) {}
        });
      }

      el.querySelectorAll("[data-st-id]").forEach((stEl) => {
        stEl.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectedId = t.id;
          renderTokens();
          renderInspector();
          if (!canControlToken(t) && !isDm()) return;
          openStatusModal(t.id, stEl.dataset.stId);
        });
      });

      el.addEventListener("pointerdown", (e) => {
        if (e.target.closest("[data-st-id]")) return;
        // Saldırı hedef seçimi (crosshair)
        if (tool === "attack") {
          e.preventDefault();
          e.stopPropagation();
          if (!atkFromId) {
            alert("Önce saldıran token’ı seç");
            setTool("select");
            return;
          }
          if (t.id === atkFromId) {
            chatAdd("⚔ Kendine saldıramazsın — hedef seç", "sys");
            return;
          }
          setAttackPair(atkFromId, t.id);
          setTool("select");
          try { openAtkRoll(); } catch (_) {}
          try { updateActionBar(); } catch (_) {}
          return;
        }
        if (tool !== "select" && tool !== "token") return;
        e.preventDefault();
        setTimeout(() => { try { updateActionBar(); } catch (_) {} }, 0);
        e.stopPropagation();
        // Herkes seçebilir (bakmak); hareket/düzen sadece kontrol yetkisiyle
        selectedId = t.id;
        renderTokens();
        renderInspector();
        renderHP();
        if (!canControlToken(t)) return;
        pushUndo();
        if (e.altKey) {
          if (!isDm()) return; // inisiyatife ekleme DM
          addTokenToInitiative(t);
          return;
        }
        localDragging.add(t.id);
        drag = {
          type: "token",
          id: t.id,
          scx: t.cx,
          scy: t.cy,
          ox: e.clientX,
          oy: e.clientY,
        };
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      });
    });
  }


  /** Portreyi küçült (oda senkronu için) */
  function compressPortrait(dataUrl, maxEdge, quality) {
    maxEdge = maxEdge || 80;
    quality = quality || 0.45;
    return new Promise((resolve) => {
      if (!dataUrl || String(dataUrl).indexOf("data:image") !== 0) {
        resolve("");
        return;
      }
      // Zaten küçük jpeg ise dokunma
      if (dataUrl.indexOf("image/jpeg") > 0 && dataUrl.length < 10000) {
        resolve(dataUrl);
        return;
      }
      try {
        const img = new Image();
        img.onload = () => {
          try {
            let w = img.naturalWidth || img.width || 1;
            let h = img.naturalHeight || img.height || 1;
            const r = Math.min(maxEdge / w, maxEdge / h, 1);
            w = Math.max(1, Math.round(w * r));
            h = Math.max(1, Math.round(h * r));
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#1a1a22";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            let q = quality;
            let out = c.toDataURL("image/jpeg", q);
            while (out.length > 12000 && q > 0.2) {
              q -= 0.08;
              out = c.toDataURL("image/jpeg", q);
            }
            // Hâlâ büyükse daha küçük boyut
            if (out.length > 12000) {
              const c2 = document.createElement("canvas");
              c2.width = 48;
              c2.height = 48;
              c2.getContext("2d").drawImage(c, 0, 0, 48, 48);
              out = c2.toDataURL("image/jpeg", 0.4);
            }
            resolve(out);
          } catch (err) {
            console.warn("compress", err);
            resolve("");
          }
        };
        img.onerror = () => resolve("");
        img.src = dataUrl;
      } catch (_) {
        resolve("");
      }
    });
  }

  function broadcastTokenPortrait(tokenId, dataUrl) {
    if (!tokenId || !dataUrl) return;
    if (String(dataUrl).indexOf("data:image") !== 0) return;
    const tk0 = tokens.find((x) => x.id === tokenId);
    const formKey = (tk0 && tk0.form === "ally") ? "ally" : "char";
    const meta = {
      refId: tk0 ? (tk0.refId || "") : "",
      name: tk0 ? (tk0.name || "") : "",
      form: formKey,
    };
    compressPortrait(dataUrl, 80, 0.45).then((small) => {
      if (!small || small.length < 50) {
        console.warn("portrait compress failed", tokenId);
        return;
      }
      const tk = tokens.find((x) => x.id === tokenId);
      if (tk) {
        tk.portrait = small;
        try { saveTokens(); } catch (_) {}
        try { renderTokens(); } catch (_) {}
      }
      try {
        const cache = JSON.parse(localStorage.getItem("origins_portrait_cache_v1") || "{}");
        if (meta.refId) {
          delete cache[String(meta.refId)];
          delete cache["name:" + (meta.name || "")];
          cache[String(meta.refId) + ":" + formKey] = small;
        }
        cache["id:" + tokenId] = small;
        localStorage.setItem("origins_portrait_cache_v1", JSON.stringify(cache));
      } catch (_) {}
      const trySend = (attempt) => {
        try {
          if (!window.OriginsSync || !OriginsSync.pushTokenPortrait) {
            if (attempt < 10) setTimeout(() => trySend(attempt + 1), 800);
            return;
          }
          if (!OriginsSync.isConnected || !OriginsSync.isConnected()) {
            if (attempt < 10) setTimeout(() => trySend(attempt + 1), 800);
            return;
          }
          const ok = OriginsSync.pushTokenPortrait(tokenId, small, meta);
          if (!ok && attempt < 10) setTimeout(() => trySend(attempt + 1), 1000);
        } catch (_) {
          if (attempt < 10) setTimeout(() => trySend(attempt + 1), 1000);
        }
      };
      trySend(0);
    });
  }

  function pushAllTokenPortraits() {
    let delay = 0;
    tokens.forEach((tk) => {
      if (!tk || !tk.portrait || String(tk.portrait).indexOf("data:image") !== 0) return;
      delay += 300;
      setTimeout(() => {
        try { broadcastTokenPortrait(tk.id, tk.portrait); } catch (_) {}
      }, delay);
    });
  }
  window.__originsPushAllPortraits = pushAllTokenPortraits;

  function placeToken(cx, cy) {
    const val = document.getElementById("placeActor")?.value;
    if (!val) {
      alert("Üst menüden karakter veya düşman seç, sonra kareye tıkla.");
      return;
    }
    const [kind, id] = val.split(":");
    if (!isDm()) {
      if (kind !== "p" || String(id) !== String(activePlayerId)) {
        alert("Sadece kendi karakterini koyabilirsin. Üstten “Ben” ile seç.");
        return;
      }
    }
    let data = null;
    if (kind === "p") data = loadRoster().find((c) => c.id === id);
    else if (kind === "e") data = loadEnemies().find((e) => String(e.id) === id);
    else if (kind === "d") data = loadDmChars().find((d) => d.id === id);
    if (!data) {
      alert("Kayıt yok. Karakter veya DM kanalından kaydet.");
      return;
    }
    let portrait = data.portrait || "";
    let title = data.title || "";
    let hp = data.hp ?? 10;
    let hpMax = data.hpMax ?? data.hp ?? 10;
    let form = "char";
    let enemy = kind === "e" || data.enemy === true || data.role === "dusman";
    let faction = data.faction || "";
    if (!faction) {
      if (enemy || data.role === "dusman") faction = "enemy";
      else if (data.role === "notr") faction = "neutral";
      else if (data.role === "dost" || kind === "d") faction = "ally";
      else faction = ""; // player chars keep default gold unless set
    }
    if (kind === "e") faction = "enemy";
    enemy = faction === "enemy";
    if (kind === "p" && data.human) {
      portrait = data.human.portrait || data.portrait || "";
      title = data.human.title || title;
      hp = data.human.hp ?? hp;
      hpMax = data.human.hpMax ?? hpMax;
    }
    if (kind === "d") {
      title = faction === "enemy" ? "Düşman" : (faction === "neutral" ? "Nötr" : "Dost");
      form = "char";
      hp = data.hp ?? hp;
      hpMax = data.hpMax ?? hpMax;
      portrait = data.portrait || portrait;
    }
    let ownerName = "";
    if (kind === "p") {
      ownerName = data.name || "";
    } else if (kind === "p" && activePlayerId && String(data.id) === String(activePlayerId)) {
      ownerName = data.name || "";
    } else if (activePlayerId) {
      const me = loadRoster().find((c) => c.id === activePlayerId);
      if (me && kind === "p" && String(data.id) === String(me.id)) ownerName = me.name;
    }
    const newId = uid();
    tokens.push({
      id: newId,
      refId: data.id,
      name: data.name,
      title,
      enemy,
      faction,
      role: data.role || (faction === "enemy" ? "dusman" : (faction === "neutral" ? "notr" : (faction === "ally" ? "dost" : ""))),
      form,
      cx,
      cy,
      hp,
      hpMax,
      _spawn: true,
      statuses: [],
      ac: (kind === "p" && data.human) ? (data.human.ac ?? data.ac ?? 12)
        : (data.ac ?? 12),
      damage: (kind === "p" && data.human) ? (data.human.damage || data.damage || "1d6")
        : (data.damage || "1d6"),
      hasCreature: !!(data.creature || (data.human && data.creature) || (kind === "d" && data.creature)),
      creatureData: data.creature || null,
      owner: ownerName,
      portrait,
      size: 1,
      speed: (kind === "p" && data.human && data.human.spd != null)
        ? (+data.human.spd || 0)
        : (data.spd != null ? (+data.spd || 0) : (data.speed != null ? (+data.speed || 0) : 0)),
      atkSfx: "",
      atkSfxName: data.atkSfxName || "",
      atkYt: data.atkYt || "",
    });
    selectedId = newId;
    saveTokens();
    renderTokens();
    renderInspector();
    renderHP();
    try { scheduleSync(); } catch (_) {}
    // Portreyi odaya gönder
    try {
      const tk = tokens.find((x) => x.id === newId);
      if (tk && tk.portrait) broadcastTokenPortrait(tk.id, tk.portrait);
    } catch (_) {}
    setTimeout(() => {
      const tk = tokens.find((x) => x.id === newId);
      if (tk) delete tk._spawn;
      renderTokens();
    }, 500);
  }

  // ── Pointer ──
  board.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".call-ally-btn, button, a, input, select, textarea, label")) return;
    // Cetvel açıkken token/vfx tıklamayı engellemez
    if (tool !== "ruler" && e.target.closest(".tok, .vfx")) return;
    const w = worldFromClient(e.clientX, e.clientY);

    // Map move: DM only + unlocked
    if (isDm() && !mapLocked && e.button === 0 && tool !== "token" && tool !== "ruler") {
      drag = { type: "map", ox: e.clientX, oy: e.clientY, sox: mapOX, soy: mapOY };
      board.classList.add("dragging");
      e.preventDefault();
      return;
    }

    // Camera pan: pan tool, middle mouse, or right mouse
    if (tool === "pan" || e.button === 1 || e.button === 2) {
      drag = { type: "pan", ox: e.clientX, oy: e.clientY, spx: panX, spy: panY };
      board.classList.add("dragging");
      e.preventDefault();
      return;
    }
    if (tool === "ruler") {
      const cx = Math.floor(w.x / CELL);
      const cy = Math.floor(w.y / CELL);
      rulerA = { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2, cx, cy };
      drag = { type: "ruler" };
      e.preventDefault();
      return;
    }
    if (tool === "token") {
      placeToken(Math.floor(w.x / CELL), Math.floor(w.y / CELL));
      return;
    }
    selectedId = null;
    vfxSelected = null;
    renderTokens();
    renderInspector();
    renderVfx();
  });

  board.addEventListener("contextmenu", (e) => e.preventDefault());

  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (drag.type === "pan") {
      panX = drag.spx + (e.clientX - drag.ox);
      panY = drag.spy + (e.clientY - drag.oy);
      applyCamera();
      return;
    }
    if (drag.type === "map") {
      // Snap to grid cells (like ruler)
      const rawX = drag.sox + (e.clientX - drag.ox) / scale;
      const rawY = drag.soy + (e.clientY - drag.oy) / scale;
      mapOX = Math.round(rawX / CELL) * CELL;
      mapOY = Math.round(rawY / CELL) * CELL;
      applyMapXF();
      return;
    }
    if (drag.type === "resize") {
      const tk = tokens.find((x) => x.id === drag.id);
      if (!tk) return;
      // Merkezden köşeye mesafe → kare sayısı (yarıçap ≈ fp*CELL/2)
      const dist = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) / Math.max(0.001, scale);
      const rawFp = (dist * 2) / CELL; // çap / CELL
      let ns = normalizeTokenSize(rawFp);
      tk.size = ns;
      const el = tokLayer.querySelector('.tok[data-id="' + tk.id + '"]');
      if (el) {
        const ctr = tokenCenterWorld(tk);
        const px = Math.max(8, ns * CELL);
        el.style.left = ctr.x + "px";
        el.style.top = ctr.y + "px";
        el.style.width = px + "px";
        el.style.height = px + "px";
        el.dataset.size = String(ns);
      }
      return;
    }
    if (drag.type === "token") {
      const tk = tokens.find((x) => x.id === drag.id);
      if (!tk) return;
      const dx = (e.clientX - drag.ox) / scale;
      const dy = (e.clientY - drag.oy) / scale;
      const ncx = drag.scx + Math.round(dx / CELL);
      const ncy = drag.scy + Math.round(dy / CELL);
      if (ncx !== tk.cx || ncy !== tk.cy) {
        const blocked = window.__originsPathBlocked
          ? window.__originsPathBlocked(tk.cx, tk.cy, ncx, ncy)
          : false;
        if (blocked) return;
        tk.cx = ncx;
        tk.cy = ncy;
        const el = tokLayer.querySelector('.tok[data-id="' + tk.id + '"]');
        if (el) {
          const ctr = tokenCenterWorld(tk);
          el.style.left = ctr.x + "px";
          el.style.top = ctr.y + "px";
          el.classList.add("moving");
        }
        if (typeof window.__originsRedrawVision === "function") {
          try { window.__originsRedrawVision(); } catch (_) {}
        } else if (window.__originsScheduleVision) {
          window.__originsScheduleVision();
        }
        try { if (typeof drawAttackLine === "function") drawAttackLine(); } catch (_) {}
        const now = Date.now();
        if (!drag._lastSync || now - drag._lastSync > 80) {
          drag._lastSync = now;
          if (window.OriginsSync) {
            try { OriginsSync.pushTokenMove(tk.id, tk.cx, tk.cy); } catch (_) {}
          }
        }
      }
      return;
    }
    if (drag.type === "vfx") {
      const fx = vfxList.find((x) => x.id === drag.id);
      if (!fx) return;
      fx.x = drag.sx + (e.clientX - drag.ox) / scale;
      fx.y = drag.sy + (e.clientY - drag.oy) / scale;
      renderVfx();
      return;
    }
    if (drag.type === "ruler" && rulerA) {
      const wp = worldFromClient(e.clientX, e.clientY);
      drag.rulerEnd = wp;
      endPointerDrag._lastX = e.clientX;
      endPointerDrag._lastY = e.clientY;
      drawRuler(rulerA, wp);
      // canlı göster (bırakınca silinecek)
      const ecx = Math.floor(wp.x / CELL);
      const ecy = Math.floor(wp.y / CELL);
      const now = Date.now();
      if (!drag._lastRulerSync || now - drag._lastRulerSync > 80) {
        drag._lastRulerSync = now;
        try {
          publishRuler({
            scx: rulerA.cx, scy: rulerA.cy, ecx, ecy,
            name: currentDisplayName(),
          });
        } catch (_) {}
      }
    }
  });

  function endPointerDrag() {
    if (!drag) return;
    if (drag.type === "token") {
      const id = drag.id;
      const tk = tokens.find((x) => x.id === id);
      try { save(S.tokens, tokens); } catch (_) {}
      if (typeof persistScenes === "function") {
        try { persistScenes(); } catch (_) {}
      }
      if (tk && window.OriginsSync) {
        try {
          OriginsSync.pushTokenMove(tk.id, tk.cx, tk.cy);
          tokenMoveMeta[tk.id] = {
            t: Date.now(),
            seq: (tokenMoveMeta[tk.id]?.seq || 0) + 1,
            from: OriginsSync.clientId(),
          };
        } catch (_) {}
      }
      const el = tokLayer.querySelector('.tok[data-id="' + id + '"]');
      if (el) el.classList.remove("moving");
      setTimeout(() => localDragging.delete(id), 80);
      if (typeof window.__originsRedrawVision === "function") {
        try { window.__originsRedrawVision(); } catch (_) {}
      }
      try { drawAttackLine(); } catch (_) {}
    }
    if (drag.type === "vfx") { saveVfx(); }
    if (drag.type === "pan" || drag.type === "map") {
      board.classList.remove("dragging");
      if (drag.type === "map" && typeof persistScenes === "function") {
        persistScenes();
        scheduleSync();
      }
      if (drag.type === "resize") {
        try { saveTokens(); } catch (_) {}
        try { scheduleSync(); } catch (_) {}
        try { renderTokens(); } catch (_) {}
        try { renderInspector(); } catch (_) {}
      }
    }
    if (drag.type === "ruler") {
      // Bırakınca cetvel otomatik silinsin (takılı kalmasın)
      localRuler = null;
      rulerA = null;
      document.querySelectorAll(".ruler-label").forEach((n) => {
        if (n.id === "rulerTag_local" || n.id === "rulerTag_preview" || n.id === "rulerTag") n.remove();
      });
      try { publishRuler(null); } catch (_) {}
      try { redrawOverlays(); } catch (_) {}
    }
    drag = null;
  }
  window.addEventListener("pointerup", endPointerDrag);
  window.addEventListener("pointercancel", endPointerDrag);

  // Local + remote rulers (world cell coords)
  let localRuler = null;
  const remoteRulers = Object.create(null); // fromId -> {scx,scy,ecx,ecy,name}

  function clearRuler() {
    localRuler = null;
    rulerA = null;
    document.querySelectorAll(".ruler-label").forEach((n) => n.remove());
    redrawOverlays();
    publishRuler(null);
  }

  function publishRuler(r) {
    if (!window.OriginsSync || !OriginsSync.pushRuler) return;
    try {
      if (!r) OriginsSync.pushRuler({ clear: true });
      else OriginsSync.pushRuler({
        scx: r.scx, scy: r.scy, ecx: r.ecx, ecy: r.ecy,
        name: r.name || currentDisplayName(),
      });
    } catch (_) {}
  }

  function drawOneRuler(scx, scy, ecx, ecy, color, label, tagId) {
    const ax = (scx * CELL + CELL / 2) * scale + panX;
    const ay = (scy * CELL + CELL / 2) * scale + panY;
    const bx = (ecx * CELL + CELL / 2) * scale + panX;
    const by = (ecy * CELL + CELL / 2) * scale + panY;
    dctx.strokeStyle = color;
    dctx.lineWidth = 2.5;
    dctx.setLineDash([8, 5]);
    dctx.beginPath();
    dctx.moveTo(ax, ay);
    dctx.lineTo(bx, by);
    dctx.stroke();
    dctx.setLineDash([]);
    const cellScreen = CELL * scale;
    dctx.strokeStyle = color.replace("1)", "0.45)").replace("0.95)", "0.4)");
    dctx.lineWidth = 1.5;
    dctx.strokeRect(ecx * CELL * scale + panX, ecy * CELL * scale + panY, cellScreen, cellScreen);
    const squares = Math.max(Math.abs(ecx - scx), Math.abs(ecy - scy));
    const feet = squares * FEET;
    let tag = document.getElementById(tagId);
    if (!tag) {
      tag = document.createElement("div");
      tag.id = tagId;
      tag.className = "ruler-label";
      board.appendChild(tag);
    }
    tag.textContent = (label ? label + " · " : "") + (squares ? feet + " ft (" + squares + " kare)" : "0 ft");
    tag.style.left = bx + 10 + "px";
    tag.style.top = by - 12 + "px";
  }

  function redrawOverlays() {
    const w = board.clientWidth || 0;
    const h = board.clientHeight || 0;
    dctx.clearRect(0, 0, w, h);
    // remote rulers
    Object.keys(remoteRulers).forEach((id) => {
      const r = remoteRulers[id];
      if (!r) return;
      drawOneRuler(r.scx, r.scy, r.ecx, r.ecy, "rgba(90,180,255,0.95)", r.name || "?", "rulerTag_" + id);
    });
    // local sticky
    if (localRuler) {
      drawOneRuler(localRuler.scx, localRuler.scy, localRuler.ecx, localRuler.ecy, "rgba(212,175,55,0.95)", "Sen", "rulerTag_local");
    }
    // live drag preview
    if (drag && drag.type === "ruler" && rulerA && drag.rulerEnd) {
      const ecx = Math.floor(drag.rulerEnd.x / CELL);
      const ecy = Math.floor(drag.rulerEnd.y / CELL);
      drawOneRuler(rulerA.cx, rulerA.cy, ecx, ecy, "rgba(212,175,55,0.95)", "", "rulerTag_preview");
    }
    // attack line on top
    try { drawAttackLine(true); } catch (_) {}
  }

  function drawRuler(a, b) {
    if (drag && drag.type === "ruler") drag.rulerEnd = b;
    redrawOverlays();
  }

  
  // Klavye: Delete / Backspace — kendi token/yoldaş
  document.addEventListener("keydown", (e) => { /* keydown-token-del */
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
    if (!selectedId) return;
    const tok = tokens.find((x) => x.id === selectedId);
    if (!tok || !canDeleteToken(tok)) return;
    e.preventDefault();
    if (!confirm((tok.form === "ally" ? "Yoldaş" : "Token") + " silinsin mi?")) return;
    deleteTokenById(tok.id, { silent: true });
  });

document.getElementById("clearRuler")?.addEventListener("click", clearRuler);
  document.getElementById("clearTokens")?.addEventListener("click", () => {
    if (isDm()) {
      if (!confirm("Tüm tokenlar silinsin mi?")) return;
      tokens = [];
      selectedId = null;
      atkFromId = null;
      atkToId = null;
      saveTokens();
      renderTokens();
      renderInspector();
      renderHP();
      try { scheduleSync(); } catch (_) {}
      return;
    }
    // Oyuncu: sadece kendi token + yoldaşlarını sil
    if (!activePlayerId) {
      alert("Önce üstten “Ben” ile kendi karakterini seç.");
      return;
    }
    const mine = tokens.filter((t) => canDeleteToken(t));
    if (!mine.length) {
      alert("Masada senin token’ın yok.");
      return;
    }
    if (!confirm("Kendi token’ların ve yoldaşların silinsin mi? (" + mine.length + " adet)")) return;
    const ids = new Set(mine.map((t) => t.id));
    tokens = tokens.filter((t) => !ids.has(t.id));
    if (selectedId && ids.has(selectedId)) selectedId = null;
    saveTokens();
    renderTokens();
    renderInspector();
    renderHP();
    try { scheduleSync(); } catch (_) {}
  });

  // ── Inspector ──
  function renderInspector() {
    try { updateActionBar(); } catch (_) {}

    const box = document.getElementById("tokenInspector");
    if (!box) return;
    const t = tokens.find((x) => x.id === selectedId);
    if (!t) {
      box.innerHTML = '<p style="font-size:0.72rem;color:#6b665c;margin:0">Token seç veya yerleştir</p>';
      return;
    }
    const opts = ['<option value="">— Sahipsiz —</option>']
      .concat(
        loadRoster().map(
          (c) =>
            `<option value="${esc(c.name)}"${t.owner === c.name ? " selected" : ""}>${esc(c.name)}</option>`
        )
      )
      .join("");
    box.innerHTML = `<div class="insp">
      <div style="font-weight:600;margin-bottom:0.4rem;font-size:0.85rem">${esc(t.name)}</div>
      <label>Bu token senin</label>
      <select id="tokOwner">${opts}</select>
      <div class="orb-row">
        <label style="color:#e05a5a">Can<input type="number" id="tokHp" min="0" value="${t.hp ?? 0}"/></label>
        <label style="color:#3d9e6f">Max<input type="number" id="tokHpMax" min="1" value="${t.hpMax ?? 1}"/></label>
        ${isDm() ? `<label style="color:#5b8def">AC (gizli)<input type="number" id="tokAc" min="0" value="${t.ac ?? 10}"/></label>` : `<span style="font-size:0.65rem;color:#6b665c;align-self:center">AC gizli</span>`}
      </div>
      <label style="font-size:0.65rem;color:#6b665c">Hasar</label>
      <input type="text" id="tokDmg" value="${esc(t.damage || "1d6")}" style="width:100%;margin-bottom:0.4rem;background:#050507;border:1px solid #252532;color:#f2efe6;padding:0.3rem;border-radius:4px;font-size:0.75rem" />
      <div style="font-size:0.65rem;color:#6b665c;margin:0 0 0.2rem">Saldırı sesi (YouTube — herkes duyar)</div>
      <input type="text" id="tokAtkYt" class="yt-sfx-input" placeholder="YouTube linki yapıştır" value="${esc(t.atkYt || "")}" style="width:100%;margin-bottom:0.35rem;font-size:0.72rem;background:#050507;border:1px solid #252532;color:#f2efe6;padding:0.3rem;border-radius:4px" />
      ${t.atkYt ? '<button type="button" class="tbtn" id="tokAtkSfxClear" style="width:100%;margin-bottom:0.4rem;font-size:0.68rem">Saldırı sesini sil</button>' : ""}
      ${isDm() ? `<label class="chk" style="display:flex;align-items:center;gap:0.35rem;font-size:0.68rem;color:#a8a396;margin-bottom:0.4rem"><input type="checkbox" id="tokHidden" ${t.hidden ? "checked" : ""}/> Gizli (sadece DM)</label>` : ""}
      <div style="font-size:0.65rem;color:#d4af37;margin:0.45rem 0 0.25rem">Görüş / ışık</div>
      <label style="font-size:0.62rem;color:#6b665c">Karanlıkta görüş (ft)</label>
      <input type="number" id="tokVision" min="0" step="5" value="${t.visionFt != null ? t.visionFt : 10}" style="width:100%;margin-bottom:0.3rem;background:#050507;border:1px solid #252532;color:#f2efe6;padding:0.3rem;border-radius:4px;font-size:0.75rem" />
      <label class="chk" style="display:flex;align-items:center;gap:0.35rem;font-size:0.68rem;color:#a8a396;margin-bottom:0.25rem"><input type="checkbox" id="tokLight" ${t.lightOn ? "checked" : ""}/> Işık / parlama</label>
      <label style="font-size:0.62rem;color:#6b665c">Işık menzili (ft)</label>
      <input type="number" id="tokLightFt" min="0" step="5" value="${t.lightFt != null ? t.lightFt : 30}" style="width:100%;margin-bottom:0.4rem;background:#050507;border:1px solid #252532;color:#f2efe6;padding:0.3rem;border-radius:4px;font-size:0.75rem" />
      ${(t.hp ?? 0) <= 0 ? `
      <div style="font-size:0.65rem;color:#e05a5a;margin:0.45rem 0 0.25rem">Ölüm kurtarma (D&D)</div>
      <div style="font-size:0.72rem;margin-bottom:0.35rem;color:#c8c2b4">
        ✓ ${(t.deathSaves && t.deathSaves.success) || 0}/3 &nbsp; ✗ ${(t.deathSaves && t.deathSaves.fail) || 0}/3
        ${t.deathSaves && t.deathSaves.stable ? " · <span style=color:#3d9e6f>STABİL</span>" : ""}
        ${t.deathSaves && t.deathSaves.dead ? " · <span style=color:#e05a5a>ÖLÜ</span>" : ""}
      </div>
      <button type="button" class="btn btn-gold btn-sm" id="tokDeathSave" style="width:100%;margin-bottom:0.35rem">Ölüm zarı at (d20)</button>
      ` : ""}
      <div style="font-size:0.65rem;color:#6b665c;margin:0.35rem 0 0.2rem">Durum efektleri</div>
      <div class="status-grid" id="tokStatusGrid"></div>
      <label style="font-size:0.62rem;color:#6b665c">Hız (inisiyatif +)</label>
      <input type="number" id="tokSpeed" min="0" max="20" value="${getTokenSpeed(t)}" style="width:100%;margin-bottom:0.35rem;background:#050507;border:1px solid #252532;color:#f2efe6;padding:0.3rem;border-radius:4px;font-size:0.75rem" />
      <div style="font-size:0.65rem;color:#6b665c;margin:0.4rem 0 0.15rem">Token boyutu (ızgara)</div>
      <select id="tokSize" style="width:100%;margin-bottom:0.35rem;background:#050507;border:1px solid #252532;color:#f2efe6;padding:0.3rem;border-radius:4px;font-size:0.75rem">
        ${TOKEN_SIZE_STEPS.map((s) => `<option value="${s}" ${normalizeTokenSize(t.size) === s ? "selected" : ""}>${TOKEN_SIZE_LABELS[s] || s}</option>`).join("")}
      </select>
      <button type="button" class="tbtn" id="tokDel" style="width:100%;margin-top:0.4rem;color:#e05a5a;border-color:rgba(224,90,90,0.4)">Token sil</button>
    </div>`;
    const allowEdit = canEditToken(t) || isDm();
    const allowDel = canDeleteToken(t);
    if (!allowEdit) {
      box.querySelectorAll("input, select, button").forEach((node) => {
        if (node.id === "tokDel" && allowDel) return; // silme kendi tokenunda açık
        node.disabled = true;
        node.title = "Bu token senin kontrolünde değil";
      });
    }
    const delBtn = document.getElementById("tokDel");
    if (delBtn) {
      delBtn.disabled = !allowDel;
      delBtn.style.display = allowDel ? "" : "none";
      delBtn.textContent = t.form === "ally" ? "Yoldaşı sil" : "Token’ı sil";
    }
    document.getElementById("tokOwner")?.addEventListener("change", (e) => {
      if (!isDm()) return;
      t.owner = e.target.value;
      saveTokens();
      renderTokens();
    });
    document.getElementById("tokHp")?.addEventListener("change", (e) => {
      if (!canEditToken(t) && !isDm()) return;
      const prev = t.hp ?? 0;
      t.hp = parseInt(e.target.value, 10) || 0;
      if (prev > 0 && t.hp <= 0) enterDying(t);
      if (t.hp > 0) reviveFromZero(t);
      saveTokens(); renderTokens(); renderHP(); scheduleSync();
    });
    document.getElementById("tokHpMax")?.addEventListener("change", (e) => {
      if (!allowEdit) return;
      t.hpMax = parseInt(e.target.value, 10) || 1;
      saveTokens(); renderTokens(); renderHP();
    });
    document.getElementById("tokAc")?.addEventListener("change", (e) => {
      if (!isDm()) return;
      t.ac = parseInt(e.target.value, 10) || 10;
      saveTokens(); renderTokens();
    });
    document.getElementById("tokDmg")?.addEventListener("change", (e) => {
      if (!allowEdit) return;
      t.damage = e.target.value || "1d6";
      saveTokens();
    });
    document.getElementById("tokAtkYt")?.addEventListener("change", (e) => {
      if (!allowEdit) return;
      const raw = (e.target.value || "").trim();
      if (!raw) {
        t.atkYt = "";
        t.atkSfxName = "";
        t.atkSfx = "";
        saveTokens();
        scheduleSync();
        return;
      }
      const id = extractYtIdLocal(raw);
      if (!id) { alert("Geçerli YouTube linki değil"); return; }
      t.atkYt = raw.indexOf("http") === 0 ? raw : ("https://www.youtube.com/watch?v=" + id);
      t.atkSfxName = t.atkYt;
      t.atkSfx = ""; // mp3 yok
      saveTokens();
      renderInspector();
      scheduleSync();
      chatAdd("🔊 " + esc(t.name) + " saldırı sesi (YT) kaydedildi", "sys");
    });
    document.getElementById("tokAtkSfxClear")?.addEventListener("click", () => {
      if (!allowEdit) return;
      t.atkSfx = "";
      t.atkSfxName = "";
      t.atkYt = "";
      saveTokens();
      renderInspector();
      scheduleSync();
    });
    document.getElementById("tokHidden")?.addEventListener("change", (e) => {
      t.hidden = !!e.target.checked;
      // keep initiative row in sync
      initiative.forEach((row) => {
        if (row.id === t.id) row.hidden = t.hidden;
      });
      saveTokens();
      renderTokens();
      renderInit();
      if (typeof window.__originsRedrawVision === "function") {
        try { window.__originsRedrawVision(); } catch (_) {}
      }
      scheduleSync();
    });
    document.getElementById("tokVision")?.addEventListener("change", (e) => {
      if (!allowEdit) return;
      t.visionFt = Math.max(0, +e.target.value || 10);
      saveTokens();
      try { redrawVision(); } catch (_) {}
      scheduleSync();
    });
    document.getElementById("tokLight")?.addEventListener("change", (e) => {
      if (!allowEdit) return;
      t.lightOn = !!e.target.checked;
      saveTokens();
      renderTokens();
      try { redrawVision(); } catch (_) {}
      scheduleSync();
    });
    document.getElementById("tokLightFt")?.addEventListener("change", (e) => {
      if (!allowEdit) return;
      t.lightFt = Math.max(0, +e.target.value || 30);
      saveTokens();
      try { redrawVision(); } catch (_) {}
      scheduleSync();
    });
    const stGrid = document.getElementById("tokStatusGrid");
    if (stGrid) {
      const curIds = normalizeStatuses(t.statuses).map((s) => s.id);
      stGrid.innerHTML = STATUS_DEFS.map((d) =>
        `<button type="button" class="${curIds.includes(d.id) ? "on" : ""}" data-st="${d.id}" ${allowEdit ? "" : "disabled"}> ${d.icon} ${d.label}</button>`
      ).join("");
      stGrid.querySelectorAll("[data-st]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!allowEdit) return;
          t.statuses = normalizeStatuses(t.statuses);
          const id = btn.dataset.st;
          const i = t.statuses.findIndex((s) => s.id === id);
          if (i >= 0) t.statuses.splice(i, 1);
          else t.statuses.push({ id, turns: 3, dmg: id === "bleeding" || id === "poisoned" || id === "burning" ? 1 : 0, heal: 0, adv: id === "blessed" ? "adv" : id === "frightened" || id === "exhausted" ? "disadv" : "", skip: id === "stunned" || id === "frozen", skipN: 1 });
          saveTokens();
          renderTokens();
          renderInspector();
          scheduleSync();
        });
      });
    }
    document.getElementById("tokSpeed")?.addEventListener("change", (e) => {
      if (!allowEdit) return;
      t.speed = Math.max(0, Math.min(20, +e.target.value || 0));
      saveTokens();
      scheduleSync();
    });
    document.getElementById("tokSize")?.addEventListener("change", (e) => {
      if (!allowEdit) return;
      t.size = normalizeTokenSize(e.target.value);
      saveTokens();
      renderTokens();
      scheduleSync();
    });
    document.getElementById("tokDel")?.addEventListener("click", () => {
      if (!canDeleteToken(t)) {
        alert("Sadece kendi token’ını veya yoldaşını silebilirsin. Üstten “Ben” ile karakterini seç.");
        return;
      }
      const label = t.form === "ally" ? "Yoldaş" : "Token";
      if (!confirm(label + " silinsin mi? (" + (t.name || "?") + ")")) return;
      deleteTokenById(t.id, { silent: true });
    });
    document.getElementById("tokDeathSave")?.addEventListener("click", () => {
      rollDeathSave(t);
    });
  }

  // ── HP ──
  function patchEntity(from, id, patch) {
    if (from === "roster") {
      const list = loadRoster();
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) { Object.assign(list[i], patch); saveRoster(list); }
    } else {
      const list = loadEnemies();
      const i = list.findIndex((x) => String(x.id) === id);
      if (i >= 0) { Object.assign(list[i], patch); saveEnemies(list); }
    }
  }

  function renderHP() {
    const el = document.getElementById("hpList");
    if (!el) return;
    const all = [
      ...loadRoster().map((c) => ({ ...c, enemy: false, from: "roster" })),
      ...loadEnemies().map((e) => ({
        ...e, enemy: true, from: "enemy",
        hp: e.hp ?? 10, hpMax: e.hpMax ?? e.hp ?? 10,
      })),
    ];
    if (!all.length) {
      el.innerHTML = '<div style="font-size:0.72rem;color:#6b665c">Karakter yok</div>';
      return;
    }
    el.innerHTML = all.map((c) => {
      const tok = tokens.find((t) => String(t.refId) === String(c.id));
      const hp = tok ? tok.hp : (c.hp ?? 10);
      const hpMax = tok ? tok.hpMax : (c.hpMax ?? 10);
      const pct = Math.max(0, Math.min(100, (hp / hpMax) * 100));
      const cls = pct <= 30 ? "low" : pct <= 60 ? "mid" : "";
      return `<div class="hp-row ${c.enemy ? "enemy" : ""}">
        <div class="nm"><span class="${titleClass(c.title)}">${esc(c.name)}</span><span>${hp}/${hpMax}</span></div>
        <div class="brs">
          <div class="bar-bg"><div class="bar-fg ${cls}" style="width:${pct}%"></div></div>
          <input type="number" data-hp="${c.id}" data-from="${c.from}" value="${hp}" min="0"/>
          <span style="color:#6b665c">/</span>
          <input type="number" data-max="${c.id}" data-from="${c.from}" value="${hpMax}" min="1"/>
        </div></div>`;
    }).join("");

    el.querySelectorAll("[data-hp]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const id = inp.dataset.hp;
        const val = +inp.value;
        patchEntity(inp.dataset.from, id, { hp: val });
        tokens.forEach((t) => { if (String(t.refId) === id) t.hp = val; });
        saveTokens();
        renderTokens();
        renderHP();
      });
    });
    el.querySelectorAll("[data-max]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const id = inp.dataset.max;
        const val = +inp.value;
        patchEntity(inp.dataset.from, id, { hpMax: val });
        tokens.forEach((t) => { if (String(t.refId) === id) t.hpMax = val; });
        saveTokens();
        renderTokens();
        renderHP();
      });
    });
  }

  // ── DM ──
  function isDm() {
    return sessionStorage.getItem(S.dm) === "1";
  }

  function syncDmBodyClass() {
    try {
      document.body.classList.toggle("is-dm", !!isDm());
      if (typeof applyAudioPermissions === "function") applyAudioPermissions();
    } catch (_) {}
  }
  setInterval(syncDmBodyClass, 2000);
  document.addEventListener("DOMContentLoaded", syncDmBodyClass);
  setTimeout(syncDmBodyClass, 300);


  function showDm(on) {
    const lock = document.getElementById("dmLock");
    const panel = document.getElementById("dmPanel");
    if (lock) lock.style.display = on ? "none" : "block";
    if (panel) panel.style.display = on ? "block" : "none";
    // Map controls only for DM
    const mapCtrl = document.getElementById("mapDmControls");
    const mapGate = document.getElementById("mapDmGate");
    if (mapCtrl) mapCtrl.style.display = on ? "block" : "none";
    if (mapGate) mapGate.style.display = on ? "none" : "block";
    document.querySelectorAll(".dm-only").forEach((el) => {
      el.style.display = on ? "" : "none";
    });
    if (!on) {
      mapLocked = true; // non-DM cannot move map
      syncMapUI();
    }
  }
  if (sessionStorage.getItem(S.dm) === "1") showDm(true);
  else showDm(false);
  document.getElementById("dmUnlock")?.addEventListener("click", () => {
    if ((document.getElementById("dmPass")?.value || "") === DM_PASS) {
      sessionStorage.setItem(S.dm, "1");
    if (typeof syncLibButton === "function") syncLibButton();
      showDm(true);
    } else alert("Yanlış şifre");
  });
  document.getElementById("dmLockBtn")?.addEventListener("click", () => {
    sessionStorage.removeItem(S.dm);
    showDm(false);
  });

  function renderEnemies() {
    const el = document.getElementById("enemyList");
    if (!el) return;
    const list = loadEnemies();
    el.innerHTML = list.length
      ? list.map((e, i) =>
          `<div class="en-chip"><span><strong>${esc(e.name)}</strong> ${e.hp}/${e.hpMax ?? e.hp}</span>
           <button type="button" data-i="${i}">×</button></div>`
        ).join("")
      : '<div style="font-size:0.7rem;color:#6b665c">Yok</div>';
    el.querySelectorAll("[data-i]").forEach((b) => {
      b.addEventListener("click", () => {
        const L = loadEnemies();
        L.splice(+b.dataset.i, 1);
        saveEnemies(L);
        renderEnemies();
        refreshActors();
        renderHP();
      });
    });
  }
  document.getElementById("enemyForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("enName").value.trim();
    if (!name) return;
    const hp = +document.getElementById("enHp").value || 20;
    const list = loadEnemies();
    list.push({
      id: uid(),
      name,
      hp,
      hpMax: hp,
      note: document.getElementById("enNote").value.trim(),
    });
    saveEnemies(list);
    e.target.reset();
    document.getElementById("enHp").value = 20;
    renderEnemies();
    refreshActors();
    renderHP();
  });
  renderEnemies();

  // ── Dice ──
  document.querySelectorAll(".adv-row button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".adv-row button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      advMode = b.dataset.adv;
    });
  });
  const rollerSel = document.getElementById("rollerSelect");
  loadRoster().forEach((c) => {
    const o = document.createElement("option");
    o.value = c.name;
    o.textContent = c.name;
    rollerSel?.appendChild(o);
  });

  function rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  function resolveDiceStyle(who, explicit) {
    if (explicit && typeof explicit === "object") return normalizeDiceStyle(explicit);
    const name = (who || "").trim();
    if (!name || name === "GM") return normalizeDiceStyle(null);
    try {
      const roster = loadRoster();
      const hit = roster.find((c) => String(c.name).toLowerCase() === name.toLowerCase());
      if (hit && hit.diceStyle) return normalizeDiceStyle(hit.diceStyle);
      // active player id match
      if (activePlayerId) {
        const me = roster.find((c) => String(c.id) === String(activePlayerId));
        if (me && String(me.name).toLowerCase() === name.toLowerCase() && me.diceStyle) {
          return normalizeDiceStyle(me.diceStyle);
        }
      }
    } catch (_) {}
    return normalizeDiceStyle(null);
  }

  function normalizeDiceStyle(ds) {
    ds = ds || {};
    const shape = ["classic", "rounded", "sharp", "crystal", "rune", "bone"].includes(ds.shape)
      ? ds.shape : "classic";
    const anim = ["tumble", "bounce", "whirl", "soft", "chaotic"].includes(ds.anim)
      ? ds.anim : "tumble";
    return {
      color: ds.color || "#d4af37",
      color2: ds.color2 || "#1a1520",
      shape,
      anim,
    };
  }

  function applyDiceStyleToCube(cube, style) {
    const st = normalizeDiceStyle(style);
    const animClass = "spin-" + st.anim;
    cube.className = "cube shape-" + st.shape + " " + animClass;
    cube.style.setProperty("--die-text", st.color);
    cube.style.setProperty("--die-border", st.color);
    cube.style.setProperty("--die-c1", st.color2);
    cube.style.setProperty("--die-c2", st.color2);
    if (st.shape === "bone") {
      // bone uses fixed ivory palette in CSS
      cube.style.removeProperty("--die-text");
      cube.style.removeProperty("--die-border");
      cube.style.removeProperty("--die-c1");
      cube.style.removeProperty("--die-c2");
    } else {
      // slightly lighten body for gradient
      try {
        let h = String(st.color2).replace("#", "");
        if (h.length === 3) h = h.split("").map((x) => x + x).join("");
        const n = parseInt(h, 16);
        let r = Math.min(255, ((n >> 16) & 255) + 28);
        let g = Math.min(255, ((n >> 8) & 255) + 28);
        let b = Math.min(255, (n & 255) + 28);
        const light = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        cube.style.setProperty("--die-c1", light);
        cube.style.setProperty("--die-c2", st.color2);
      } catch (_) {}
    }
    return st;
  }

  function showDiceOverlay(who, label, faces, total, detail, opts) {
    opts = opts || {};
    const isRemote = !!opts.remote;
    const dmOnly = !!opts.dmOnly;
    const diceStyle = resolveDiceStyle(who, opts.diceStyle);
    // Gizli zar: oyuncu kendi ekranında gösterme (remote veya local DM-only)
    if (dmOnly && !isDm()) {
      return Promise.resolve();
    }
    if (!isRemote) {
      try { playSound("dice"); } catch (_) {}
    }
    return new Promise((resolve) => {
      rolling = false;
      const ov = document.getElementById("diceOv");
      const row = document.getElementById("diceCubes");
      const tot = document.getElementById("diceTotal");
      const whoEl = document.getElementById("diceWho");
      const close = document.getElementById("diceClose");
      if (!ov) { resolve(); return; }
      if (whoEl) whoEl.textContent = who + (label ? " · " + label : "");
      if (row) row.innerHTML = "";
      if (tot) { tot.classList.remove("show"); tot.innerHTML = ""; }
      if (close) close.classList.remove("show");
      ov.classList.add("on");

      const list = Array.isArray(faces) ? faces : [total];
      const cubes = list.map((v) => {
        const cube = document.createElement("div");
        applyDiceStyleToCube(cube, diceStyle);
        ["f", "bk", "r", "l", "t", "bo"].forEach((cls, i) => {
          const face = document.createElement("div");
          face.className = "face " + cls;
          face.textContent = i === 0 ? v : rollDie(20);
          cube.appendChild(face);
        });
        row.appendChild(cube);
        return cube;
      });

      // Match land timing to animation roughly
      const landMs = diceStyle.anim === "soft" ? 1050 : diceStyle.anim === "whirl" ? 800 : 900;
      setTimeout(() => {
        cubes.forEach((c, i) => {
          c.classList.remove("spin-tumble", "spin-bounce", "spin-whirl", "spin-soft", "spin-chaotic");
          c.classList.add("land");
          const f = c.querySelector(".face.f");
          if (f) f.textContent = list[i];
        });
        if (tot) {
          tot.style.color = diceStyle.color || "";
          tot.innerHTML =
            String(total) + (detail ? `<span class="sub">${esc(detail)}</span>` : "");
          tot.classList.add("show");
        }
      }, landMs);

      // Auto-dismiss — does not block clicks
      setTimeout(() => {
        ov.classList.remove("on");
        resolve();
      }, landMs + 1300);

      // Broadcast to peers (local rolls only)
      if (!isRemote && window.OriginsSync) {
        try {
          OriginsSync.pushDice({
            who, label, faces: list, total, detail: detail || "",
            dmOnly: dmOnly,
            diceStyle: diceStyle,
          });
        } catch (_) {}
      }
    });
  }

  document.getElementById("rollBtn")?.addEventListener("click", async () => {
    if (rolling) return;
    const sides = +document.getElementById("diceSides").value || 20;
    const count = Math.min(8, Math.max(1, +document.getElementById("diceCount").value || 1));
    const who = rollerSel?.value || "GM";
    let faces = [];
    let total = 0;
    let detail = "";
    let label = `${count}d${sides}`;

    if (advMode === "adv" || advMode === "disadv") {
      if (count === 1) {
        const a = rollDie(sides), b = rollDie(sides);
        faces = [a, b];
        total = advMode === "adv" ? Math.max(a, b) : Math.min(a, b);
        detail = `${advMode === "adv" ? "Avantaj" : "Dezavantaj"} (${a} / ${b})`;
        label = `d${sides} ${advMode === "adv" ? "adv" : "dis"}`;
      } else {
        for (let i = 0; i < count; i++) {
          const a = rollDie(sides), b = rollDie(sides);
          faces.push(a, b);
          total += advMode === "adv" ? Math.max(a, b) : Math.min(a, b);
        }
        detail = advMode === "adv" ? "Avantaj" : "Dezavantaj";
      }
    } else {
      for (let i = 0; i < count; i++) faces.push(rollDie(sides));
      total = faces.reduce((s, n) => s + n, 0);
      if (count > 1) detail = faces.join(" + ");
    }

    await showDiceOverlay(who, label, faces.slice(0, 8), total, detail);
    const log = document.getElementById("diceLog");
    if (log) {
      const line = document.createElement("div");
      line.innerHTML = `<strong>${esc(who)}</strong> ${esc(label)} → ${total}`;
      log.prepend(line);
    }
  });

  // ── Initiative ──
  function renderCombatHp() {
    const el = document.getElementById("combatHpList");
    if (!el) return;
    if (!initiative.length) { el.innerHTML = ""; return; }
    el.innerHTML = initiative.map((row, i) => {
      const tok = tokens.find((x) => x.id === row.id) || tokens.find((x) => x.name === row.name);
      const hid = !!(row.hidden || (tok && tok.hidden));
      if (hid && !isDm()) return "";
      const hp = tok ? (tok.hp ?? "?") : "?";
      const max = tok ? (tok.hpMax ?? "?") : "?";
      return `<div class="combat-hp-row ${row.enemy ? "en" : ""} ${i === turnIdx ? "cur" : ""}">
        <span>${esc(row.name)}${hid ? " 👁" : ""} <small style="color:#6b665c">(${row.score})</small></span>
        <span class="hp">${hp}/${max}</span>
      </div>`;
    }).join("");
  }

  function renderInit() {
    const el = document.getElementById("initList");
    if (!el) return;
    // Ekle select doldur
    const addSel = document.getElementById("initAddSelect");
    if (addSel) {
      const inIds = new Set(initiative.map((r) => r.id));
      const opts = tokens
        .filter((tk) => !inIds.has(tk.id))
        .filter((tk) => isDm() || !tk.hidden)
        .map((tk) => `<option value="${esc(tk.id)}">${esc(tk.name || "?")}${tk.hidden ? " 👁" : ""}${tk.enemy ? " (düşman)" : ""}</option>`)
        .join("");
      addSel.innerHTML = '<option value="">— Token seç —</option>' + opts;
    }
    if (!initiative.length) {
      el.innerHTML = '<div style="font-size:0.7rem;color:#6b665c">Savaş yok — Savaş veya Ekle kullan</div>';
      return;
    }
    el.innerHTML = initiative
      .map((r, i) => {
        if (r.hidden && !isDm()) return "";
        const hid = r.hidden ? " 👁" : "";
        const spdTip = (r.speed ? (" · Hız +" + r.speed) : "") + (r.d20 != null ? (" · d20 " + r.d20) : "");
        return `<div class="init-row ${r.enemy ? "en" : ""} ${i === turnIdx ? "cur" : ""} ${r.hidden ? "hidden-init" : ""}" data-init-idx="${i}" data-init-id="${esc(r.id)}" draggable="${isDm() ? "true" : "false"}">
            <span class="init-sc" title="${esc(String(r.score) + spdTip)}">${r.score}</span>
            <span class="init-name">${i === turnIdx ? "▶ " : ""}${esc(r.name)}${hid}${i === turnIdx ? " · SIRA" : ""}</span>
            ${isDm() ? `<button type="button" class="init-rm" data-rm-id="${esc(r.id)}" title="Çıkar">×</button>` : ""}
          </div>`;
      })
      .join("");
    el.querySelectorAll(".init-rm").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDm()) return;
        removeFromInitiative(btn.dataset.rmId);
      });
    });
el.querySelectorAll(".init-row").forEach((row) => {
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/init-idx", row.dataset.initIdx);
      });
      row.addEventListener("dragover", (e) => e.preventDefault());
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = +e.dataTransfer.getData("text/init-idx");
        const to = +row.dataset.initIdx;
        if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
        const item = initiative.splice(from, 1)[0];
        initiative.splice(to, 0, item);
        if (turnIdx === from) turnIdx = to;
        else if (from < turnIdx && to >= turnIdx) turnIdx--;
        else if (from > turnIdx && to <= turnIdx) turnIdx++;
        renderInit();
        renderTokens();
        scheduleSync();
      });
    });
  }

  document.getElementById("initAddBtn")?.addEventListener("click", () => {
    if (!isDm()) return alert("Sadece DM inisiyatife ekleyebilir.");
    const sel = document.getElementById("initAddSelect");
    const id = sel && sel.value;
    if (!id) return alert("Token seç.");
    const tk = tokens.find((x) => x.id === id);
    if (!tk) return;
    addTokenToInitiative(tk);
    // Gizli ise zar gösterimi sadece DM
    if (tk.hidden) {
      const row = initiative.find((r) => r.id === tk.id);
      if (row) {
        void showDiceOverlay("???", "İnisiyatif (gizli)", [row.d20 || row.score], row.score,
          row.speed ? ("d20 " + (row.d20 || "?") + " + Hız " + row.speed) : null,
          { dmOnly: true });
      }
    } else {
      const row = initiative.find((r) => r.id === tk.id);
      if (row) {
        void showDiceOverlay(tk.name, "İnisiyatif", [row.d20 || row.score], row.score,
          row.speed ? ("d20 " + (row.d20 || "?") + " + Hız " + row.speed) : null);
      }
    }
  });
  document.getElementById("startBattle")?.addEventListener("click", async () => {
    if (!isDm()) return alert("Savaş zarını sadece DM atabilir.");
    if (initiative.length) {
      if (!confirm("Savaş zaten açık (" + initiative.length + " sıra). Yeniden zar atılsın mı?\nİptal = mevcut sırayı koru.")) {
        return;
      }
    }
    if (!tokens.length) return alert("Masada token yok. Önce token koy.");
    const combatants = tokens.map((tk) => ({
      id: tk.id,
      refId: tk.refId,
      name: tk.name || "?",
      enemy: !!tk.enemy,
      form: tk.form || "char",
      hidden: !!tk.hidden,
      speed: getTokenSpeed(tk),
    }));
    initiative = [];
    for (const c of combatants) {
      const tk = tokens.find((x) => x.id === c.id);
      const roll = rollInitiativeScore(tk || c);
      const detail = roll.speed ? ("d20 " + roll.d20 + " + Hız " + roll.speed) : ("d20 " + roll.d20);
      await showDiceOverlay(
        c.hidden ? "???" : c.name,
        "İnisiyatif" + (c.hidden ? " (gizli)" : ""),
        [roll.d20],
        roll.total,
        detail,
        { dmOnly: !!c.hidden }
      );
      initiative.push({
        id: c.id, refId: c.refId, name: c.name, enemy: c.enemy, form: c.form,
        hidden: c.hidden, speed: roll.speed, score: roll.total, d20: roll.d20,
      });
    }
    initiative.sort((a, b) => b.score - a.score);
    turnIdx = 0;
    renderInit();
    renderTokens();
    const vis = combatants.filter((c) => !c.hidden).length;
    const hidN = combatants.length - vis;
    chatAdd("Savaş başladı · " + vis + " görünür" + (hidN && isDm() ? " · " + hidN + " gizli (DM)" : ""), "sys");
    scheduleSync();
  });
  document.getElementById("nextTurn")?.addEventListener("click", () => {
    if (!initiative.length) return;
    if (!isDm()) {
      // sadece kendi turundaysa geçebilir
      const cur = initiative[turnIdx];
      const tok = cur && tokens.find((x) => x.id === cur.id);
      if (!tok || !canControlToken(tok) || !isTokenTurn(tok)) {
        alert("Sıra sende değil. Sadece kendi turunda veya DM sıra geçebilir.");
        return;
      }
    }
    void processTurnStart();
  });


  function addTokenToInitiative(tok, score, opts) {
    if (!tok) return;
    opts = opts || {};
    if (initiative.some((x) => x.id === tok.id)) {
      if (!opts.silent) chatAdd(esc(tok.name) + " zaten sırada", "sys");
      return;
    }
    const spd = getTokenSpeed(tok);
    let d20, sc;
    if (score != null && opts.rawScore) {
      d20 = score; sc = score;
    } else if (score != null) {
      d20 = score; sc = score + spd;
    } else {
      const roll = rollInitiativeScore(tok);
      d20 = roll.d20; sc = roll.total;
    }
    initiative.push({
      id: tok.id, refId: tok.refId, name: tok.name || "?",
      enemy: !!tok.enemy, form: tok.form || "char",
      score: sc, d20: d20, speed: spd, hidden: !!tok.hidden,
    });
    initiative.sort((a, b) => b.score - a.score);
    renderInit();
    renderTokens();
    scheduleSync();
    if (opts.silent) return;
    if (tok.hidden && !isDm()) return;
    const label = tok.hidden ? "Gizli token" : esc(tok.name);
    chatAdd(label + " inisiyatife eklendi (" + sc + (spd ? " · Hız +" + spd : "") + ")", "sys");
  }

  function removeFromInitiative(id) {
    const idx = initiative.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const row = initiative[idx];
    initiative.splice(idx, 1);
    if (!initiative.length) turnIdx = 0;
    else if (turnIdx >= initiative.length) turnIdx = initiative.length - 1;
    else if (idx < turnIdx) turnIdx--;
    renderInit();
    renderTokens();
    scheduleSync();
    if (row && !(row.hidden && !isDm())) {
      chatAdd((row.hidden ? "Gizli token" : esc(row.name)) + " inisiyatiften çıkarıldı", "sys");
    }
  }


  function ensureDeathState(tok) {
    if (!tok) return;
    if (!tok.deathSaves) tok.deathSaves = { success: 0, fail: 0, stable: false, dead: false };
    return tok.deathSaves;
  }

  function clearDeathState(tok) {
    if (!tok) return;
    tok.deathSaves = { success: 0, fail: 0, stable: false, dead: false };
  }

  function applyBaygin(tok) {
    if (!tok) return;
    tok.statuses = normalizeStatuses(tok.statuses);
    if (tok.statuses.some((s) => s.id === "baygin")) return;
    tok.statuses.push({
      id: "baygin",
      turns: 99,
      dmg: 0,
      heal: 0,
      adv: "disadv",
      skip: true,
      skipN: 99,
    });
  }

  function clearBaygin(tok) {
    if (!tok || !tok.statuses) return;
    tok.statuses = normalizeStatuses(tok.statuses).filter((s) => s.id !== "baygin");
  }

  /** HP 0'a düşünce ölüm zarlarına gir */
  function enterDying(tok) {
    if (!tok) return;
    const ds = ensureDeathState(tok);
    if (ds.dead) return;
    if ((tok.hp ?? 0) > 0) return;
    if (!ds.stable && (ds.success > 0 || ds.fail > 0)) return; // already tracking
    ds.success = 0;
    ds.fail = 0;
    ds.stable = false;
    ds.dead = false;
    chatAdd("<span class=\"fx\">💀 " + esc(tok.name) + "</span> bayıldı — ölüm kurtarma zarları başlıyor (3 başarı = stabil, 3 başarısızlık = ölüm)", "sys");
    floatText(tok, "ÖLÜM ZARI", "miss");
  }

  /** Can yenilenince kurtar */
  function reviveFromZero(tok) {
    if (!tok) return;
    if ((tok.hp ?? 0) > 0) {
      const wasDying = tok.deathSaves && (tok.deathSaves.success || tok.deathSaves.fail || tok.deathSaves.stable || tok.deathSaves.dead);
      const wasBaygin = (tok.statuses || []).some((s) => s.id === "baygin" || (s === "baygin"));
      clearDeathState(tok);
      clearBaygin(tok);
      if (wasDying || wasBaygin) {
        chatAdd(esc(tok.name) + " can aldı — baygın kalktı, normal savaşabilir", "sys");
      }
    }
  }

  /** 0 HP iken hasar = başarısızlık (kritik = 2) */
  function deathSaveFailFromDamage(tok, isCrit) {
    if (!tok || (tok.hp ?? 0) > 0) return;
    const ds = ensureDeathState(tok);
    if (ds.dead || ds.stable) {
      if (ds.stable) {
        ds.stable = false;
        ds.fail = isCrit ? 2 : 1;
        ds.success = 0;
        chatAdd(esc(tok.name) + " stabil iken hasar aldı — tekrar ölüm zarında", "fx");
      } else return;
    } else {
      ds.fail = Math.min(3, (ds.fail || 0) + (isCrit ? 2 : 1));
    }
    if (ds.fail >= 3) {
      ds.dead = true;
      ds.fail = 3;
      chatAdd("<span class=\"fx\">☠ " + esc(tok.name) + " öldü</span> (3 başarısız ölüm zarı / hasar)", "fx");
      floatText(tok, "ÖLDÜ", "miss");
    } else {
      chatAdd(esc(tok.name) + " ölüm zarı başarısızlığı: " + ds.fail + "/3" + (isCrit ? " (krit hasar ×2)" : " (0 HP hasar)"), "fx");
      floatText(tok, "DS ✗ " + ds.fail + "/3", "miss");
    }
  }

  async function rollDeathSave(tok) {
    if (!tok) return;
    if ((tok.hp ?? 0) > 0) return alert("Canı 0 değil.");
    const ds = ensureDeathState(tok);
    if (ds.dead) return alert("Bu karakter öldü.");
    if (ds.stable) return alert("Zaten stabil (3 başarı). Hasar alana kadar zar atılmaz.");
    if (!canControlToken(tok) && !isDm()) return alert("Sadece kendi token’ın veya DM.");

    const roll = Math.floor(Math.random() * 20) + 1;
    await showDiceOverlay(tok.name, "Ölüm zarı", [roll], roll, "d20 ölüm kurtarma");

    let note = "";
    if (roll === 1) {
      ds.fail = Math.min(3, (ds.fail || 0) + 2);
      note = "NAT 1 → 2 başarısızlık";
      floatText(tok, "NAT1 ✗✗", "miss");
    } else if (roll === 20) {
      tok.hp = 1;
      clearDeathState(tok);
      note = "NAT 20 → 1 can, ayağa kalkar!";
      floatText(tok, "NAT20 +1", "heal");
      playFx("heal", tok.id, null);
    } else if (roll >= 10) {
      ds.success = Math.min(3, (ds.success || 0) + 1);
      note = "Başarı " + ds.success + "/3";
      floatText(tok, "DS ✓ " + ds.success + "/3", "heal");
    } else {
      ds.fail = Math.min(3, (ds.fail || 0) + 1);
      note = "Başarısız " + ds.fail + "/3";
      floatText(tok, "DS ✗ " + ds.fail + "/3", "miss");
    }

    if ((tok.hp ?? 0) <= 0) {
      if (ds.success >= 3 && !ds.dead) {
        ds.success = 3;
        ds.stable = true;
        note += " → STABİL (bilinçsiz, ölmiyor)";
        chatAdd("<span class=\"fx\">" + esc(tok.name) + "</span> stabil (3 başarı). Can 0, ölüm zarı durdu.", "sys");
      }
      if (ds.fail >= 3) {
        ds.dead = true;
        ds.fail = 3;
        note += " → ÖLÜM";
        chatAdd("<span class=\"fx\">☠ " + esc(tok.name) + " öldü</span> (3 başarısız ölüm zarı)", "fx");
        floatText(tok, "ÖLDÜ", "miss");
      }
    }

    chatAdd(
      "<span class=\"dice\">💀 " + esc(tok.name) + "</span> ölüm zarı <strong>" + roll + "</strong> — " + note +
      " <span style=\"color:#6b665c\">[✓" + (ds.success || 0) + " ✗" + (ds.fail || 0) + "]</span>",
      "dice"
    );
    saveTokens();
    renderTokens();
    renderHP();
    renderInspector();
    scheduleSync();
  }

  async function processTurnStart() {
    // Advance first, then apply effects for the new current combatant
    turnIdx = (turnIdx + 1) % initiative.length;
    let guard = 0;
    while (guard++ < initiative.length + 1) {
      const cur = initiative[turnIdx];
      if (!cur) break;
      const tok = tokens.find((x) => x.id === cur.id)
        || tokens.find((x) => String(x.refId) === String(cur.refId) || String(x.refId) === String(cur.id))
        || tokens.find((x) => x.name === cur.name);
      if (!tok) {
        renderInit();
        scheduleSync();
        return;
      }
      tok.statuses = normalizeStatuses(tok.statuses);
      let skipThis = false;
      const remaining = [];
      for (const st of tok.statuses) {
        const def = STATUS_DEFS.find((d) => d.id === st.id);
        const label = def ? def.icon + " " + def.label : st.id;
        // tick damage/heal
        if (st.dmg > 0) {
          tok.hp = Math.max(0, (tok.hp || 0) - st.dmg);
          floatText(tok, "-" + st.dmg + " " + (def?.icon || ""), "hit");
          playFxOnToken(tok, "hit");
          chatAdd("<span class=\"fx\">" + esc(tok.name) + "</span> " + label + " → −" + st.dmg, "fx");
        }
        if (st.heal > 0) {
          tok.hp = Math.min(tok.hpMax || 999, (tok.hp || 0) + st.heal);
          floatText(tok, "+" + st.heal, "heal");
          playFxOnToken(tok, "heal");
          chatAdd(esc(tok.name) + " " + label + " → +" + st.heal, "fx");
        }
        if (st.skip && (st.skipN || 1) > 0) {
          skipThis = true;
          st.skipN = (st.skipN || 1) - 1;
          floatText(tok, "TUR ATLANDI", "miss");
          chatAdd("<span class=\"fx\">" + esc(tok.name) + "</span> sersem/atlat — tur geçti", "fx");
          if (st.skipN <= 0) st.skip = false;
        }
        st.turns = (st.turns || 0) - 1;
        if (st.turns > 0 || (st.skip && st.skipN > 0)) remaining.push(st);
        else chatAdd(esc(tok.name) + " · " + label + " bitti", "sys");
      }
      tok.statuses = remaining;
      saveTokens();
      renderTokens();
      renderHP();
      if (skipThis) {
        turnIdx = (turnIdx + 1) % initiative.length;
        continue;
      }
      // 0 HP: otomatik ölüm zarı (herkes görür)
      if ((tok.hp ?? 0) <= 0) {
        const ds = ensureDeathState(tok);
        if (ds.dead) {
          chatAdd("☠ " + esc(tok.name) + " ölü — tur atlanır", "sys");
          turnIdx = (turnIdx + 1) % initiative.length;
          continue;
        }
        if (ds.stable) {
          applyBaygin(tok);
          chatAdd("💤 " + esc(tok.name) + " baygın/stabil — tur atlanır (can veya savaş sonu)", "sys");
          // skip handled by baygin status on next loop if needed
          floatText(tok, "BAYGIN", "miss");
          break;
        }
        // otomatik d20 — odadaki herkes görür
        chatAdd("💀 Sıra <strong>" + esc(tok.name) + "</strong> — ölüm zarı otomatik atılıyor…", "sys");
        await rollDeathSave(tok);
        const ds2 = ensureDeathState(tok);
        if (ds2.dead) {
          turnIdx = (turnIdx + 1) % initiative.length;
          continue;
        }
        if (ds2.stable) {
          applyBaygin(tok);
        }
      }
      break;
    }
    renderInit();
    renderTokens();
    scheduleSync();
  }

  /* playFxOnToken defined with playFx */
  document.getElementById("clearBattle")?.addEventListener("click", () => {
    if (!isDm()) return alert("İnisiyatifi sadece DM silebilir.");
    if (!confirm("Savaş / inisiyatif temizlensin mi?")) return;
    initiative = [];
    turnIdx = 0;
    // Savaş bitince baygın (ölüm zarından stabil) kalkar
    tokens.forEach((tok) => {
      const had = (tok.statuses || []).some((s) => s.id === "baygin");
      clearBaygin(tok);
      if (tok.deathSaves && tok.deathSaves.stable && (tok.hp ?? 0) <= 0) {
        // stabil kalır ama baygın savaş sonu biter — istersen ölüm sayaçlarını da sıfırla
        clearDeathState(tok);
      }
      if (had) chatAdd(esc(tok.name) + " — savaş bitti, baygın kalktı", "sys");
    });
    saveTokens();
    renderInit();
    renderTokens();
    scheduleSync();
  });

  // Notes
  const notes = document.getElementById("sessionNotes");
  if (notes) {
    notes.value = localStorage.getItem(S.notes) || "";
    notes.addEventListener("input", () => localStorage.setItem(S.notes, notes.value));
  }

  const info = document.getElementById("gridInfo");
  if (info) info.textContent = "1 kare = 5 ft · sonsuz grid";

  // ── Saldırı hedefi + görsel efektler ──
  function refreshAtkSelects() {
    const from = document.getElementById("atkFrom");
    const to = document.getElementById("atkTo");
    if (!from || !to) return;

    from.innerHTML = '<option value="">— Saldıran —</option>';
    let controllable = 0;
    tokens.forEach((tk) => {
      const ok = canControlToken(tk);
      if (!ok) return;
      controllable++;
      const o = document.createElement("option");
      o.value = tk.id;
      o.textContent = (tk.enemy ? "☠ " : "⚔ ") + (tk.name || "?");
      from.appendChild(o);
    });
    if (!tokens.length) {
      from.innerHTML = '<option value="">— Önce token koy —</option>';
    } else if (!controllable) {
      from.innerHTML = '<option value="">— “Ben” ile karakter seç —</option>';
    }
    if (atkFromId && [...from.options].some((o) => o.value === atkFromId)) from.value = atkFromId;
    else if (controllable === 1 && from.options.length === 2) {
      from.selectedIndex = 1;
      atkFromId = from.value;
    } else {
      atkFromId = from.value || null;
    }

    to.innerHTML = '<option value="">— Hedef —</option>';
    tokens.forEach((tk) => {
      const o = document.createElement("option");
      o.value = tk.id;
      o.textContent = (tk.enemy ? "☠ " : "") + (tk.name || "?");
      to.appendChild(o);
    });
    if (atkToId && [...to.options].some((o) => o.value === atkToId)) to.value = atkToId;
    else atkToId = to.value || null;
  }

  function drawAttackLine(skipClear) {
    if (!skipClear) {
      // full redraw path includes rulers via redrawOverlays
      try {
        if (typeof redrawOverlays === "function") {
          redrawOverlays();
          return;
        }
      } catch (_) {}
      const w = board.clientWidth || 0;
      const h = board.clientHeight || 0;
      dctx.clearRect(0, 0, w, h);
    }
    document.getElementById("atkRangeTag")?.remove();
    if (!atkFromId || !atkToId) return;
    const a = tokens.find((x) => x.id === atkFromId);
    const b = tokens.find((x) => x.id === atkToId);
    if (!a || !b) return;
    const ax = (a.cx * CELL + CELL / 2) * scale + panX;
    const ay = (a.cy * CELL + CELL / 2) * scale + panY;
    const bx = (b.cx * CELL + CELL / 2) * scale + panX;
    const by = (b.cy * CELL + CELL / 2) * scale + panY;
    const dist = tokenDistFt(a, b);
    dctx.save();
    dctx.strokeStyle = "rgba(224,90,90,0.85)";
    dctx.lineWidth = 2.5;
    dctx.setLineDash([8, 5]);
    dctx.beginPath();
    dctx.moveTo(ax, ay);
    dctx.lineTo(bx, by);
    dctx.stroke();
    dctx.setLineDash([]);
    const ang = Math.atan2(by - ay, bx - ax);
    dctx.fillStyle = "rgba(224,90,90,0.9)";
    dctx.beginPath();
    dctx.moveTo(bx, by);
    dctx.lineTo(bx - 12 * Math.cos(ang - 0.4), by - 12 * Math.sin(ang - 0.4));
    dctx.lineTo(bx - 12 * Math.cos(ang + 0.4), by - 12 * Math.sin(ang + 0.4));
    dctx.closePath();
    dctx.fill();
    dctx.restore();
    // Range label on the arrow
    const tag = document.createElement("div");
    tag.id = "atkRangeTag";
    tag.className = "atk-range-tag";
    tag.textContent = dist + " ft";
    tag.style.left = (ax + bx) / 2 + "px";
    tag.style.top = (ay + by) / 2 - 14 + "px";
    board.appendChild(tag);
  }


  function isCombatActive() {
    return Array.isArray(initiative) && initiative.length > 0;
  }
  function isTokenTurn(tok) {
    if (!tok) return false;
    if (!isCombatActive()) return true; // savaş yoksa serbest
    if (isDm()) return true; // DM her zaman
    const cur = initiative[turnIdx];
    if (!cur) return true;
    if (cur.id && tok.id && String(cur.id) === String(tok.id)) return true;
    if (cur.refId && tok.refId && String(cur.refId) === String(tok.refId)) return true;
    if (cur.name && tok.name && cur.name === tok.name) return true;
    return false;
  }
  function assertCanAttack(attacker) {
    if (!attacker) return "Saldıran yok.";
    if (!canControlToken(attacker) && !isDm()) return "Bu token senin kontrolünde değil.";
    if (isCombatActive() && !isTokenTurn(attacker) && !isDm()) {
      const cur = initiative[turnIdx];
      return "Sıra sende değil. Şu an: " + (cur && cur.name ? cur.name : "?");
    }
    return null;
  }

  function setAttackPair(fromId, toId) {
    if (fromId) {
      const ft = tokens.find((x) => x.id === fromId);
      if (ft && !canControlToken(ft) && !isDm()) {
        alert("Bu token senin kontrolünde değil. Üstten “Ben” ile karakterini seç veya DM gir.");
        fromId = null;
      } else if (ft) {
        const err = assertCanAttack(ft);
        if (err && toId) {
          // hedef seçilirken de kontrol
          alert(err);
          // allow selecting attacker but block target pair if not turn
          if (!isTokenTurn(ft) && !isDm() && isCombatActive()) {
            toId = null;
          }
        }
      }
    }
    atkFromId = fromId || null;
    atkToId = toId || null;
    refreshAtkSelects();
    renderTokens();
    clearRuler();
    drawAttackLine();
    if (typeof window.__originsRedrawVision === "function") {
      try { window.__originsRedrawVision(); } catch (_) {}
    } else if (window.__originsScheduleVision) {
      window.__originsScheduleVision();
    }
  }

  document.getElementById("atkFrom")?.addEventListener("change", (e) => {
    setAttackPair(e.target.value || null, atkToId);
  });
  document.getElementById("atkTo")?.addEventListener("change", (e) => {
    setAttackPair(atkFromId, e.target.value || null);
  });
  document.getElementById("clearAtk")?.addEventListener("click", () => setAttackPair(null, null));

  // ── SFX: YouTube linkleri (kalıcı) + sentez yedek; odaya yayın ──
  let _audioCtx = null;
  const SFX_KEYS = ["hit", "crit", "miss", "heal", "dice", "critmiss", "downed"];
  const SFX_STORE = "origins_sfx_yt_v1";
  const sfxCache = Object.create(null); // kind -> HTMLAudioElement or null
  const sfxObjectUrl = Object.create(null);

  function getAudio() {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
    return _audioCtx;
  }

  function loadSfxMap() {
    try { return load(SFX_STORE, {}) || {}; } catch (_) { return {}; }
  }
  function saveSfxMap(map) {
    try { save(SFX_STORE, map); } catch (_) {}
  }

  function sfxPaths(kind) {
    const base = "assets/sounds/" + kind;
    return [base + ".mp3", base + ".ogg", base + ".wav"];
  }

  function getMasterVol() {
    const el = document.getElementById("sfxVolume");
    if (el) return Math.min(1, Math.max(0, (+el.value || 0) / 100));
    try {
      const v = localStorage.getItem("origins_sfx_vol");
      if (v != null) return Math.min(1, Math.max(0, +v / 100));
    } catch (_) {}
    return 0.55;
  }

  function playHtmlAudio(src, vol) {
    return new Promise((resolve) => {
      try {
        const a = new Audio(src);
        const base = vol == null ? 0.7 : vol;
        a.volume = Math.min(1, Math.max(0, base * getMasterVol()));
        a.onended = () => resolve(true);
        a.onerror = () => resolve(false);
        const p = a.play();
        if (p && p.then) p.then(() => {}).catch(() => resolve(false));
        else resolve(true);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function playFileSfx(kind) {
    const map = loadSfxMap();
    if (map[kind]) {
      const ok = await playHtmlAudio(map[kind], 0.85);
      if (ok) return true;
    }
    for (const path of sfxPaths(kind)) {
      const ok = await playHtmlAudio(path, 0.85);
      if (ok) return true;
    }
    if (kind === "critmiss") {
      if (await playFileSfx("miss")) return true;
    }
    return false;
  }

  function playSynthSfx(kind) {
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const MV = Math.max(0, getMasterVol());
    if (MV <= 0.001) return;

    function tone(type, freq, dur, vol, freqEnd, delay, attack) {
      try {
        const t0 = now + (delay || 0);
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const v = Math.max(0.0001, vol * MV);
        const atk = attack != null ? attack : 0.008;
        o.type = type;
        o.frequency.setValueAtTime(freq, t0);
        if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(v, t0 + atk);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.04);
      } catch (_) {}
    }

    function noiseBurst(dur, vol, freq, delay, q, type) {
      try {
        const t0 = now + (delay || 0);
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const env = Math.pow(1 - i / len, 1.35);
          data[i] = (Math.random() * 2 - 1) * env;
        }
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        f.type = type || "bandpass";
        f.frequency.value = freq || 1200;
        f.Q.value = q || 1.1;
        src.buffer = buf;
        src.connect(f);
        f.connect(g);
        g.connect(ctx.destination);
        const v = Math.max(0.0001, vol * MV);
        g.gain.setValueAtTime(v, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.start(t0);
        src.stop(t0 + dur + 0.03);
      } catch (_) {}
    }

    if (kind === "hit") {
      // Kılıç çarpışması: metal tıkırtı + gövde vuruşu
      noiseBurst(0.07, 0.11, 2800, 0, 2.2, "bandpass");
      noiseBurst(0.09, 0.07, 900, 0.015, 0.8, "bandpass");
      tone("triangle", 920, 0.09, 0.045, 180, 0.02);
      tone("sine", 140, 0.14, 0.06, 55, 0, 0.004);
      noiseBurst(0.04, 0.04, 4200, 0.05, 4, "highpass");
    } else if (kind === "crit") {
      // Ağır isabet + parıltı
      noiseBurst(0.09, 0.14, 2400, 0, 1.8, "bandpass");
      noiseBurst(0.12, 0.09, 700, 0.02, 0.7, "lowpass");
      tone("sawtooth", 220, 0.12, 0.035, 80, 0);
      tone("triangle", 1320, 0.16, 0.05, 440, 0.04);
      tone("sine", 1760, 0.18, 0.04, 880, 0.08);
      tone("sine", 2200, 0.1, 0.025, 1100, 0.14);
      noiseBurst(0.05, 0.06, 5500, 0.06, 5, "highpass");
    } else if (kind === "miss" || kind === "critmiss") {
      // Havada kesen ıslık / boş salınım
      noiseBurst(0.16, kind === "critmiss" ? 0.08 : 0.055, 1800, 0, 0.55, "bandpass");
      noiseBurst(0.12, 0.04, 3200, 0.02, 1.2, "highpass");
      tone("sine", 380, 0.14, 0.03, 90, 0.03);
      if (kind === "critmiss") {
        tone("triangle", 160, 0.2, 0.04, 50, 0.08);
        noiseBurst(0.08, 0.05, 400, 0.12, 0.5, "lowpass");
      }
    } else if (kind === "heal") {
      // Yumuşak çan / şifa arpeji
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        tone("sine", f, 0.28, 0.04 - i * 0.005, f * 1.02, i * 0.07, 0.02);
        tone("triangle", f * 2, 0.18, 0.012, f, i * 0.07 + 0.02, 0.03);
      });
      noiseBurst(0.2, 0.02, 4000, 0.05, 0.8, "highpass");
    } else if (kind === "dice") {
      // Zar tıkırtısı (mevcut iyi his korunuyor, biraz netleştirildi)
      for (let i = 0; i < 7; i++) {
        const d = i * 0.042;
        noiseBurst(0.028, 0.038 - i * 0.003, 950 + i * 110, d, 3.2, "bandpass");
        tone("triangle", 620 + i * 35, 0.028, 0.016, 260, d);
      }
      noiseBurst(0.05, 0.045, 1250, 0.3, 2.2, "bandpass");
      tone("sine", 180, 0.06, 0.02, 90, 0.32);
    } else if (kind === "downed") {
      // Yere düşüş / bayılma
      noiseBurst(0.2, 0.08, 220, 0, 0.6, "lowpass");
      tone("sine", 110, 0.35, 0.07, 40, 0, 0.01);
      tone("triangle", 80, 0.4, 0.05, 35, 0.05);
      noiseBurst(0.12, 0.04, 600, 0.1, 0.8, "lowpass");
    } else {
      tone("sine", 220, 0.08, 0.03, 140, 0);
    }
  }

  function extractYtIdLocal(input) {
    if (!input) return null;
    const s = String(input).trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    try {
      const u = new URL(s);
      if (u.hostname.indexOf("youtu.be") >= 0) {
        const id = u.pathname.replace(/^\//, "").slice(0, 11);
        return /^[\w-]{11}$/.test(id) ? id : null;
      }
      if (u.hostname.indexOf("youtube") >= 0) {
        const v = u.searchParams.get("v");
        if (v && /^[\w-]{11}$/.test(v)) return v;
        const parts = u.pathname.split("/").filter(Boolean);
        for (let i = 0; i < parts.length - 1; i++) {
          if (["embed", "shorts", "live", "v"].indexOf(parts[i]) >= 0 && /^[\w-]{11}$/.test(parts[i + 1]))
            return parts[i + 1];
        }
      }
    } catch (_) {
      const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
      if (m) return m[1];
    }
    return null;
  }

  // Gizli YouTube SFX oynatıcı havuzu
  const _ytSfxPlayers = [];
  function ensureYtApiSfx(cb) {
    if (window.YT && window.YT.Player) { cb(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === "function") try { prev(); } catch (_) {}
      cb();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
    // API geç gelirse tekrar dene
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (window.YT && window.YT.Player) { clearInterval(t); cb(); }
      else if (n > 40) clearInterval(t);
    }, 250);
  }

  function playYoutubeSfx(videoId, opts) {
    opts = opts || {};
    if (!videoId) return;
    const vol = Math.round(getMasterVol() * 100);
    ensureYtApiSfx(() => {
      const pool = document.getElementById("ytSfxPool") || document.body;
      const div = document.createElement("div");
      div.id = "ytSfx_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      pool.appendChild(div);
      let player = null;
      const kill = () => {
        try { if (player && player.destroy) player.destroy(); } catch (_) {}
        try { div.remove(); } catch (_) {}
      };
      try {
        player = new YT.Player(div.id, {
          height: "1",
          width: "1",
          videoId: videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            start: opts.start || 0,
          },
          events: {
            onReady: (e) => {
              try {
                e.target.setVolume(vol);
                e.target.playVideo();
              } catch (_) {}
              // max 12 sn SFX
              setTimeout(kill, opts.maxMs || 12000);
            },
            onStateChange: (e) => {
              if (e.data === 0) kill(); // ended
            },
            onError: () => kill(),
          },
        });
      } catch (err) {
        console.warn("yt sfx", err);
        kill();
      }
    });
  }

  function getSfxVideoId(kind) {
    const map = loadSfxMap();
    const raw = map[kind];
    if (!raw) return null;
    // eski dataURL kayıtlarını yok say
    if (typeof raw === "string" && raw.indexOf("data:") === 0) return null;
    return extractYtIdLocal(raw) || (typeof raw === "string" && /^[\w-]{11}$/.test(raw) ? raw : null);
  }

  function playSound(kind, opts) {
    opts = opts || {};
    const k = kind || "hit";
    const vid = opts.videoId || getSfxVideoId(k);
    if (vid) {
      playYoutubeSfx(vid, opts);
    } else {
      playSynthSfx(k);
    }
    // odaya yayın (kendi echo'su handleRemote'da kesilir)
    if (!opts.remote && !opts.silent) {
      try {
        if (window.OriginsSync && OriginsSync.pushMusic && OriginsSync.isConnected && OriginsSync.isConnected()) {
          OriginsSync.pushMusic({
            action: "sfx_yt",
            kind: k,
            videoId: vid || "",
            name: opts.name || k,
          });
        }
      } catch (_) {}
    }
  }

  function refreshSfxPanel() {
    const map = loadSfxMap();
    document.querySelectorAll("#sfxPanel [data-sfx-yt]").forEach((inp) => {
      const kind = inp.getAttribute("data-sfx-yt");
      const val = map[kind] || "";
      // dataURL eski kayıt gösterme
      if (val && String(val).indexOf("data:") === 0) {
        inp.value = "";
      } else if (!inp.value || inp.dataset.loaded !== "1") {
        inp.value = val && String(val).indexOf("http") === 0 ? val : (val || "");
        inp.dataset.loaded = "1";
      }
      const row = inp.closest(".sfx-row");
      if (row) row.classList.toggle("has-file", !!(val && String(val).indexOf("data:") !== 0));
    });
  }

  function bindSfxYtInputs() {
    document.querySelectorAll("#sfxPanel [data-sfx-yt]").forEach((inp) => {
      const saveOne = () => {
        const kind = inp.getAttribute("data-sfx-yt");
        if (!kind) return;
        const raw = (inp.value || "").trim();
        const map = loadSfxMap();
        if (!raw) {
          delete map[kind];
          saveSfxMap(map);
          refreshSfxPanel();
          return;
        }
        const id = extractYtIdLocal(raw);
        if (!id) {
          alert("Geçerli YouTube linki değil");
          return;
        }
        // tam link sakla (kalıcı)
        map[kind] = raw.indexOf("http") === 0 ? raw : ("https://www.youtube.com/watch?v=" + id);
        saveSfxMap(map);
        refreshSfxPanel();
        setMusicLabel && null;
        try { chatAdd("🔊 " + kind + " sesi kaydedildi", "sys"); } catch (_) {}
      };
      inp.addEventListener("change", saveOne);
      inp.addEventListener("blur", saveOne);
    });
  }
  bindSfxYtInputs();

  document.getElementById("sfxVolume")?.addEventListener("input", (e) => {
    try { localStorage.setItem("origins_sfx_vol", e.target.value); } catch (_) {}
  });
  (function initVol() {
    const el = document.getElementById("sfxVolume");
    if (!el) return;
    try {
      const v = localStorage.getItem("origins_sfx_vol");
      if (v != null) el.value = v;
    } catch (_) {}
  })();
  document.getElementById("sfxTest")?.addEventListener("click", () => playSound("dice"));
  document.querySelectorAll("[data-sfx-test]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.getAttribute("data-sfx-test");
      if (k) playSound(k); // yayınlı test
    });
  });


  // ── Music: YouTube (birincil) + MP3 dosya (yedek) ──
  let musicAudio = null;
  let musicObjectUrl = null;
  let musicDataUrl = null;
  let musicFileName = "";
  let musicRemote = false;
  let musicMode = null; // "yt" | "file"
  let ytPlayer = null;
  let ytReady = false;
  let ytVideoId = null;
  let ytWantPlay = false;
  const MUSIC_MAX_FILE = 30 * 1024 * 1024;
  const _musicChunks = Object.create(null);

  function setMusicLabel(text) {
    const nameEl = document.getElementById("musicName");
    if (nameEl) nameEl.textContent = text || "";
  }
  function getMusicVol() {
    const el = document.getElementById("musicVolume");
    let v = 40;
    if (el) v = +el.value;
    else {
      try { const s = localStorage.getItem("origins_music_vol"); if (s != null) v = +s; } catch (_) {}
    }
    if (!isFinite(v)) v = 40;
    return Math.min(1, Math.max(0, v / 100));
  }
  function applyMusicVol() {
    const vol = getMusicVol();
    if (musicAudio) {
      try { musicAudio.volume = vol; } catch (_) {}
    }
    document.querySelectorAll("audio[data-origins-music]").forEach((a) => {
      try { a.volume = vol; } catch (_) {}
    });
    if (ytPlayer && typeof ytPlayer.setVolume === "function") {
      try { ytPlayer.setVolume(Math.round(vol * 100)); } catch (_) {}
    }
  }
  function extractYoutubeId(input) {
    if (!input) return null;
    const s = String(input).trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    try {
      const u = new URL(s);
      if (u.hostname.indexOf("youtu.be") >= 0) {
        const id = u.pathname.replace(/^\//, "").slice(0, 11);
        return /^[\w-]{11}$/.test(id) ? id : null;
      }
      if (u.hostname.indexOf("youtube.com") >= 0 || u.hostname.indexOf("youtube-nocookie.com") >= 0) {
        const v = u.searchParams.get("v");
        if (v && /^[\w-]{11}$/.test(v)) return v;
        const parts = u.pathname.split("/").filter(Boolean);
        // /embed/ID /shorts/ID /live/ID /v/ID
        for (let i = 0; i < parts.length - 1; i++) {
          if (["embed", "shorts", "live", "v"].indexOf(parts[i]) >= 0 && /^[\w-]{11}$/.test(parts[i + 1])) {
            return parts[i + 1];
          }
        }
        if (parts[0] && /^[\w-]{11}$/.test(parts[0])) return parts[0];
      }
    } catch (_) {
      const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
      if (m) return m[1];
    }
    return null;
  }
  function ensureYtApi(cb) {
    if (window.YT && window.YT.Player) {
      cb();
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === "function") try { prev(); } catch (_) {}
      cb();
    };
    // script may already be loading from oyun.html
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  }
  function destroyYtPlayer() {
    ytWantPlay = false;
    try {
      if (ytPlayer && typeof ytPlayer.destroy === "function") ytPlayer.destroy();
    } catch (_) {}
    ytPlayer = null;
    ytReady = false;
    const wrap = document.getElementById("ytPlayerWrap");
    if (wrap) {
      wrap.style.display = "none";
      wrap.innerHTML = '<div id="ytPlayer"></div>';
    }
  }
  function stopMusicLocal() {
    if (musicAudio) {
      try { musicAudio.pause(); } catch (_) {}
      try { musicAudio.currentTime = 0; } catch (_) {}
    }
    try {
      if (ytPlayer && typeof ytPlayer.pauseVideo === "function") ytPlayer.pauseVideo();
      if (ytPlayer && typeof ytPlayer.stopVideo === "function") ytPlayer.stopVideo();
    } catch (_) {}
  }
  function createYtPlayer(videoId, autoplay) {
    const wrap = document.getElementById("ytPlayerWrap");
    if (wrap) {
      wrap.style.display = "block";
      wrap.innerHTML = '<div id="ytPlayer"></div>';
    }
    ytReady = false;
    ytVideoId = videoId;
    ytWantPlay = !!autoplay;
    ensureYtApi(() => {
      try {
        if (ytPlayer && typeof ytPlayer.destroy === "function") {
          try { ytPlayer.destroy(); } catch (_) {}
        }
      } catch (_) {}
      ytPlayer = new YT.Player("ytPlayer", {
        height: "120",
        width: "100%",
        videoId: videoId,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: location.origin || undefined,
        },
        events: {
          onReady: (e) => {
            ytReady = true;
            applyMusicVol();
            if (ytWantPlay) {
              try {
                e.target.setVolume(Math.round(getMusicVol() * 100));
                e.target.playVideo();
              } catch (_) {}
            }
          },
          onError: (e) => {
            console.warn("YT error", e && e.data);
            setMusicLabel("YouTube açılamadı (engelli / bölgesel)");
            chatAdd("♫ YouTube video açılamadı — başka link dene", "sys");
          },
        },
      });
    });
  }
  function playYoutube(videoId, fromRemote) {
    musicMode = "yt";
    musicRemote = !!fromRemote;
    // MP3'ü kes
    if (musicAudio) {
      try { musicAudio.pause(); } catch (_) {}
    }
    createYtPlayer(videoId, true);
    setMusicLabel("▶ YouTube " + videoId + (fromRemote ? " · odadan" : " · çalıyor"));
  }
  async function playMusicFromSrc(src, name, fromRemote) {
    stopMusicLocal();
    musicMode = "file";
    musicRemote = !!fromRemote;
    try {
      destroyYtPlayer();
    } catch (_) {}
    try {
      musicAudio = new Audio(src);
      musicAudio.loop = true;
      musicAudio.setAttribute("data-origins-music", "1");
      musicAudio.volume = getMusicVol();
      applyMusicVol();
      await musicAudio.play();
      musicAudio.volume = getMusicVol();
      setMusicLabel("▶ " + (name || "Müzik") + (fromRemote ? " · odadan çalıyor" : " · çalıyor"));
    } catch (err) {
      console.warn("music play", err);
    }
  }
  function broadcastYt(action, videoId) {
    if (!window.OriginsSync || !OriginsSync.pushMusic) {
      chatAdd("Oda bağlı değil — YouTube sadece sende", "sys");
      return;
    }
    if (!OriginsSync.isConnected || !OriginsSync.isConnected()) {
      chatAdd("Çevrimiçi değil — önce ağa bağlan", "sys");
      return;
    }
    try {
      if (action === "play") {
        OriginsSync.pushMusic({
          action: "yt_play",
          videoId: videoId,
          name: "YouTube",
        });
        chatAdd("♫ YouTube odaya gönderildi", "sys");
      } else {
        OriginsSync.pushMusic({ action: "yt_stop" });
      }
    } catch (e) {
      chatAdd("YouTube paylaşım hata: " + (e.message || e), "sys");
    }
  }
  function broadcastMusic(action) {
    // Eski MP3 yolu
    if (!window.OriginsSync || !OriginsSync.pushMusic) {
      chatAdd("Oda bağlı değil — müzik sadece sende çalıyor", "sys");
      return;
    }
    if (!OriginsSync.isConnected || !OriginsSync.isConnected()) {
      chatAdd("Çevrimiçi değil — önce ağa bağlan", "sys");
      return;
    }
    try {
      if (action === "play") {
        if (!musicDataUrl) {
          chatAdd("MP3 henüz yüklenmedi", "sys");
          return;
        }
        const id = "m" + Date.now().toString(36);
        const CHUNK = 12000;
        const total = Math.ceil(musicDataUrl.length / CHUNK) || 1;
        OriginsSync.pushMusic({
          action: "play_begin",
          id: id,
          name: musicFileName || "Müzik",
          total: total,
          len: musicDataUrl.length,
        });
        for (let i = 0; i < total; i++) {
          OriginsSync.pushMusic({
            action: "play_chunk",
            id: id,
            i: i,
            total: total,
            data: musicDataUrl.slice(i * CHUNK, (i + 1) * CHUNK),
          });
        }
        OriginsSync.pushMusic({ action: "play_end", id: id, total: total, len: musicDataUrl.length });
        chatAdd("♫ MP3 odaya gönderiliyor (" + total + " parça)…", "sys");
      } else {
        OriginsSync.pushMusic({ action: "stop" });
        OriginsSync.pushMusic({ action: "yt_stop" });
      }
    } catch (e) {
      chatAdd("Müzik paylaşımı hata: " + (e.message || e), "sys");
    }
  }

  document.getElementById("musicFile")?.addEventListener("change_disabled", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > MUSIC_MAX_FILE) {
      alert("MP3 en fazla 30 MB. YouTube linki kullanırsan sınır yok.");
      e.target.value = "";
      return;
    }
    musicFileName = file.name || "Müzik";
    musicDataUrl = null;
    musicMode = "file";
    ytVideoId = null;
    if (musicObjectUrl) {
      try { URL.revokeObjectURL(musicObjectUrl); } catch (_) {}
    }
    stopMusicLocal();
    setMusicLabel(musicFileName + " · yükleniyor…");
    musicObjectUrl = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => {
      musicDataUrl = reader.result;
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setMusicLabel(musicFileName + " · hazır (" + mb + " MB)");
    };
    reader.onerror = () => {
      musicDataUrl = null;
      setMusicLabel("Yükleme başarısız");
    };
    reader.readAsDataURL(file);
    musicAudio = new Audio(musicObjectUrl);
    musicAudio.loop = true;
    musicAudio.setAttribute("data-origins-music", "1");
    applyMusicVol();
  });

  document.getElementById("musicVolume")?.addEventListener("input", (e) => {
    try { localStorage.setItem("origins_music_vol", e.target.value); } catch (_) {}
    applyMusicVol();
  });
  (function initMusicVol() {
    const el = document.getElementById("musicVolume");
    if (!el) return;
    try {
      const v = localStorage.getItem("origins_music_vol");
      if (v != null) el.value = v;
    } catch (_) {}
    applyMusicVol();
  })();
  setInterval(() => { try { applyMusicVol(); } catch (_) {} }, 1000);

  document.getElementById("musicPlay")?.addEventListener("click", async () => {
    if (!isDm()) { alert("Oda müziğini sadece DM başlatır."); return; }
    const urlInput = document.getElementById("musicYoutubeUrl");
    const url = (urlInput && urlInput.value || "").trim();
    const vid = extractYoutubeId(url);
    getAudio();
    applyMusicVol();

    // YouTube öncelikli
    if (vid) {
      ytVideoId = vid;
      musicMode = "yt";
      playYoutube(vid, false);
      broadcastYt("play", vid);
      return;
    }
    if (url && !vid) {
      alert("Geçerli bir YouTube linki değil.\nÖrnek: https://www.youtube.com/watch?v=…");
      return;
    }
    // MP3 yedek
    if (!musicDataUrl && !musicAudio) {
      alert("YouTube linki yapıştır veya MP3 seç.");
      return;
    }
    if (!musicDataUrl) {
      alert("MP3 hâlâ yükleniyor — biraz bekle");
      return;
    }
    try {
      if (musicAudio) {
        musicAudio.volume = getMusicVol();
        await musicAudio.play();
      } else {
        await playMusicFromSrc(musicDataUrl, musicFileName, false);
      }
      setMusicLabel("▶ " + (musicFileName || "Müzik") + " · çalıyor");
      broadcastMusic("play");
    } catch (err) {
      alert("Çalınamadı — tarayıcı engellemiş olabilir");
    }
  });

  document.getElementById("musicStop")?.addEventListener("click", () => {
    stopMusicLocal();
    try { destroyYtPlayer(); } catch (_) {}
    broadcastMusic("stop");
    setMusicLabel((ytVideoId ? "YouTube" : (musicFileName || "Müzik")) + " · durdu");
    chatAdd("♫ Müzik durdu (oda)", "sys");
  });

  // ── Kişisel 2 ses paneli (YouTube, kalıcı, odaya yayın) ──
  const PLAYER_SFX_KEY = "origins_player_sfx_yt_v1";
  let _sfxEditSlot = 1;

  function loadPlayerSfx() {
    try {
      const d = JSON.parse(localStorage.getItem(PLAYER_SFX_KEY) || "{}");
      return {
        1: d[1] || d.s1 || { name: "Ses 1", yt: "" },
        2: d[2] || d.s2 || { name: "Ses 2", yt: "" },
      };
    } catch (_) {
      return { 1: { name: "Ses 1", yt: "" }, 2: { name: "Ses 2", yt: "" } };
    }
  }
  function savePlayerSfx(data) {
    try { localStorage.setItem(PLAYER_SFX_KEY, JSON.stringify(data)); } catch (e) {
      alert("Kayıt başarısız");
    }
  }
  function refreshSfxButtons() {
    const data = loadPlayerSfx();
    [1, 2].forEach((n) => {
      const btn = document.getElementById("abSfx" + n);
      if (!btn) return;
      const slot = data[n] || {};
      const label = (slot.name || ("Ses " + n)).slice(0, 18);
      btn.textContent = "🔊 " + label;
      const has = !!(slot.yt && extractYtIdLocal(slot.yt));
      btn.classList.toggle("has-sound", has);
      btn.title = "Sol tık: çal (oda) · sağ tık: YouTube linki ayarla";
    });
  }
  function playPlayerSfx(slot) {
    const data = loadPlayerSfx();
    const s = data[slot];
    if (!s || !s.yt) {
      openSfxEditor(slot);
      return;
    }
    const vid = extractYtIdLocal(s.yt);
    if (!vid) {
      openSfxEditor(slot);
      return;
    }
    playSound("player" + slot, { videoId: vid, name: s.name || ("Ses " + slot) });
  }
  function openSfxEditor(slot) {
    _sfxEditSlot = slot;
    const data = loadPlayerSfx();
    const s = data[slot] || {};
    const modal = document.getElementById("sfxEditModal");
    const title = document.getElementById("sfxEditTitle");
    const nameIn = document.getElementById("sfxEditName");
    const ytIn = document.getElementById("sfxEditYt");
    if (title) title.textContent = "Ses paneli " + slot;
    if (nameIn) nameIn.value = s.name || ("Ses " + slot);
    if (ytIn) ytIn.value = s.yt || "";
    if (modal) {
      modal.style.display = "flex";
      modal.setAttribute("aria-hidden", "false");
    }
  }
  function closeSfxEditor() {
    const modal = document.getElementById("sfxEditModal");
    if (modal) {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
    }
  }
  document.getElementById("sfxEditSave")?.addEventListener("click", () => {
    const data = loadPlayerSfx();
    const nameIn = document.getElementById("sfxEditName");
    const ytIn = document.getElementById("sfxEditYt");
    const name = (nameIn && nameIn.value.trim()) || ("Ses " + _sfxEditSlot);
    const raw = (ytIn && ytIn.value.trim()) || "";
    if (raw && !extractYtIdLocal(raw)) {
      alert("Geçerli YouTube linki gir");
      return;
    }
    data[_sfxEditSlot] = {
      name: name.slice(0, 24),
      yt: raw,
    };
    savePlayerSfx(data);
    refreshSfxButtons();
    closeSfxEditor();
  });
  document.getElementById("sfxEditClear")?.addEventListener("click", () => {
    const data = loadPlayerSfx();
    data[_sfxEditSlot] = { name: "Ses " + _sfxEditSlot, yt: "" };
    savePlayerSfx(data);
    refreshSfxButtons();
    closeSfxEditor();
  });
  document.getElementById("sfxEditCancel")?.addEventListener("click", closeSfxEditor);
  document.getElementById("sfxEditModal")?.addEventListener("click", (e) => {
    if (e.target.id === "sfxEditModal") closeSfxEditor();
  });
  [1, 2].forEach((n) => {
    const btn = document.getElementById("abSfx" + n);
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      playPlayerSfx(n);
    });
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSfxEditor(n);
    });
  });
  try { refreshSfxButtons(); } catch (_) {}

  function applyAudioPermissions() {
    const dm = typeof isDm === "function" ? isDm() : false;
    // Ambiyans: sadece DM
    const ambRoot = document.getElementById("ambPanel") || document.getElementById("ambientPanel");
    document.querySelectorAll(".amb-btn, #ambStop, #ambIntensity, #ambShareRoom, #ambClearCustom").forEach((el) => {
      if (!el) return;
      el.disabled = !dm;
      if (!dm) el.title = "Sadece DM ambiyans başlatır/durdurur";
    });
    // Ses seviyesi herkese açık
    const ambVolEl = document.getElementById("ambVolume");
    if (ambVolEl) { ambVolEl.disabled = false; ambVolEl.title = "Kendi duyduğun ambiyans sesi"; }
    document.querySelectorAll("[data-amb-file]").forEach((el) => {
      el.disabled = !dm;
    });
    // ambient open button: oyuncu sadece kendi ses panellerini kullanır; ambiyans paneli DM
    const ambBtn = document.getElementById("ambientBtn");
    if (ambBtn && !dm) {
      ambBtn.title = "Ambiyans sadece DM";
    }
    // Müzik çal/durdur/dosya — DM (oda müziği)
    ["musicPlay", "musicStop", "musicYoutubeUrl"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.disabled = !dm;
        if (!dm) el.title = "Oda müziğini sadece DM yönetir";
      }
    });
    // Ses seviyesi herkes ayarlayabilir
    const mv = document.getElementById("musicVolume");
    if (mv) { mv.disabled = false; mv.title = "Kendi duyduğun müzik sesi"; }
    const sv = document.getElementById("sfxVolume");
    if (sv) { sv.disabled = false; sv.title = "Efekt / zar / kişisel ses seviyesi"; }
  }
  try { applyAudioPermissions(); } catch (_) {}
  // DM giriş/çıkış sonrası
  document.getElementById("dmLockBtn")?.addEventListener("click", () => setTimeout(() => { try { applyAudioPermissions(); } catch (_) {} }, 100));
  document.getElementById("dmUnlockBtn")?.addEventListener("click", () => setTimeout(() => { try { applyAudioPermissions(); } catch (_) {} }, 100));

  function handleRemoteMusic(msg) {
    if (!msg) return;
    try {
      if (window.OriginsSync && OriginsSync.clientId && msg.from === OriginsSync.clientId()) return;
    } catch (_) {}

    // YouTube oda senkronu
    if (msg.action === "yt_play" && msg.videoId) {
      try {
        getAudio();
        playYoutube(msg.videoId, true);
        chatAdd("♫ Odadan YouTube: " + esc(msg.videoId), "sys");
      } catch (e) {
        console.warn(e);
      }
      return;
    }
    if (msg.action === "yt_stop") {
      try {
        stopMusicLocal();
        destroyYtPlayer();
        setMusicLabel("Oda müziği durdu");
      } catch (_) {}
      return;
    }

    // Chunked music assemble (begin / chunk / end)
    if (msg.action === "play_begin") {
      _musicChunks[msg.id] = { parts: [], total: msg.total || 1, name: msg.name || "Müzik", got: 0 };
      try { chatAdd("♫ Müzik alınıyor… 0/" + (msg.total || "?"), "sys"); } catch (_) {}
      return;
    }
    if (msg.action === "play_chunk") {
      let b = _musicChunks[msg.id];
      if (!b) {
        b = _musicChunks[msg.id] = { parts: [], total: msg.total || 1, name: msg.name || "Müzik", got: 0 };
      }
      if (typeof msg.i === "number" && typeof b.parts[msg.i] !== "string") {
        b.parts[msg.i] = msg.data || "";
        b.got = (b.got || 0) + 1;
      } else if (typeof msg.i === "number") {
        b.parts[msg.i] = msg.data || "";
      }
      return;
    }
    if (msg.action === "play_end") {
      const b = _musicChunks[msg.id];
      if (!b) return;
      const total = b.total || 0;
      let missing = 0;
      for (let i = 0; i < total; i++) {
        if (typeof b.parts[i] !== "string") missing++;
      }
      if (missing > 0) {
        try { chatAdd("♫ Müzik eksik parça (" + missing + ") — DM tekrar çalsın", "sys"); } catch (_) {}
        delete _musicChunks[msg.id];
        return;
      }
      const dataUrl = b.parts.join("");
      const name = b.name || "Müzik";
      delete _musicChunks[msg.id];
      if (!dataUrl || dataUrl.length < 100) return;
      window.__pendingRoomMusic = { dataUrl: dataUrl, name: name };
      getAudio();
      playMusicFromSrc(dataUrl, name, true).then(() => {
        applyMusicVol();
        chatAdd("♫ Odadan müzik: " + esc(name) + " — ses: Müzik kaydırıcısı", "sys");
      }).catch(() => {
        chatAdd("♫ Müzik geldi — seste tıkla / Müzik panelinden ses aç", "sys");
        // tek tıkla başlat
        const once = () => {
          playMusicFromSrc(dataUrl, name, true).then(() => applyMusicVol()).catch(() => {});
          document.removeEventListener("click", once);
        };
        document.addEventListener("click", once);
      });
      return;
    }

    if (msg.action === "stop") {
      stopMusicLocal();
      const nameEl = document.getElementById("musicName");
      if (nameEl) nameEl.textContent = "Oda müziği durdu";
      return;
    }
    if (msg.action === "play" && msg.dataUrl) {
      getAudio();
      playMusicFromSrc(msg.dataUrl, msg.name || "Oda müziği", true);
      chatAdd("♫ Odadan müzik: " + esc(msg.name || "track"), "sys");
      return;
    }
    if (msg.action === "amb_stop") {
      try { stopAmbient(true); } catch (_) {}
      return;
    }
    if (msg.action === "amb_play" && msg.kind) {
      try {
        getAudio();
        if (msg.vol != null) {
          const el = document.getElementById("ambVolume");
          if (el) el.value = String(Math.round(+msg.vol * 100));
        }
        if (msg.intensity != null) {
          const el = document.getElementById("ambIntensity");
          if (el) el.value = String(Math.round(+msg.intensity * 100));
        }
        if (msg.dataUrl) {
          // chunked amb optional: single message for small files
          if (typeof stopAmbient === "function") stopAmbient(true);
          ambientHtmlAudio = new Audio(msg.dataUrl);
          ambientHtmlAudio.loop = true;
          ambientHtmlAudio.volume = typeof getAmbVol === "function" ? getAmbVol() : 0.35;
          ambientHtmlAudio.play().catch(() => {});
          ambientOn = true;
          ambientKind = msg.kind;
          document.querySelectorAll(".amb-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.amb === msg.kind);
          });
        } else if (typeof startAmbient === "function") {
          startAmbient(msg.kind, { remote: true });
        }
        chatAdd("♫ Odadan ambıyans: " + esc(msg.kind), "sys");
      } catch (e) {
        console.warn("amb remote", e);
      }
    }
  }


  document.getElementById("sfxClear")?.addEventListener("click", () => {
    if (!confirm("Tüm ses linkleri silinsin mi?")) return;
    saveSfxMap({});
    document.querySelectorAll("#sfxPanel [data-sfx-yt]").forEach((inp) => {
      inp.value = "";
      inp.dataset.loaded = "0";
    });
    refreshSfxPanel();
  });

  // Ambiyans YouTube linkleri (kalıcı)
  (function bindAmbYt() {
    const KEY = "origins_amb_yt_v1";
    function loadA() { try { return JSON.parse(localStorage.getItem(KEY)||"{}"); } catch(_){ return {}; } }
    function saveA(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch(_){} }
    const map = loadA();
    document.querySelectorAll("[data-amb-yt]").forEach((inp) => {
      const k = inp.getAttribute("data-amb-yt");
      if (map[k]) inp.value = map[k];
      const save = () => {
        const m = loadA();
        const v = (inp.value||"").trim();
        if (!v) { delete m[k]; saveA(m); return; }
        if (!extractYtIdLocal(v)) { alert("Geçerli YouTube linki değil"); return; }
        m[k] = v; saveA(m);
      };
      inp.addEventListener("change", save);
      inp.addEventListener("blur", save);
    });
    // startAmbient: if custom yt for kind, play yt as ambient loop via music player? skip for now - use synth
  })();
  refreshSfxPanel();

  function floatText(tok, text, cls) {
    if (!tok) return;
    const el = document.createElement("div");
    el.className = "combat-float " + (cls || "hit");
    el.textContent = text;
    el.style.left = (tok.cx * CELL + CELL / 2) * scale + panX + "px";
    el.style.top = (tok.cy * CELL + CELL / 2) * scale + panY - 28 + "px";
    el.style.transform = "translateX(-50%)";
    board.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  /** Saldırı sesi: token YouTube / global YT / sentez — herkese yayın */
  function playCombatSound(type, attacker, opts) {
    opts = opts || {};
    const kind = type === "critmiss" ? "miss" : type;
    // Token özel YouTube saldırı sesi
    if (attacker && (attacker.atkYt || attacker.atkSfxName) && (kind === "hit" || kind === "crit")) {
      const vid = extractYtIdLocal(attacker.atkYt || attacker.atkSfxName);
      if (vid) {
        playSound(kind, { videoId: vid, name: attacker.name + " saldırı", remote: !!opts.remote });
        return;
      }
    }
    // Uzaktan videoId
    if (opts.videoId) {
      playSound(kind, { videoId: opts.videoId, remote: true });
      return;
    }
    playSound(kind, { remote: !!opts.remote });
  }

  /** Play combat FX on specific tokens (not global atk pair only) */
  function playFx(type, targetId, attackerId, opts) {
    opts = opts || {};
    const tid = targetId != null ? targetId : atkToId;
    const aid = attackerId != null ? attackerId : atkFromId;
    const target = tokens.find((x) => x.id === tid);
    const attacker = tokens.find((x) => x.id === aid);
    if (!target && !attacker) return;

    if (!opts.remote && window.OriginsSync) {
      try {
        OriginsSync.pushFx({
          fxType: type,
          targetId: tid,
          attackerId: aid,
          videoId: (attacker && extractYtIdLocal(attacker.atkYt || attacker.atkSfxName || "")) || "",
        });
      } catch (_) {}
    }
    // Herkes duysun (local + remote)
    playCombatSound(type, attacker, opts);

    // Attacker lunge
    if (attacker) {
      const ael = tokLayer.querySelector('.tok[data-id="' + attacker.id + '"]');
      if (ael) {
        ael.classList.remove("fx-lunge");
        void ael.offsetWidth;
        ael.classList.add("fx-lunge");
        setTimeout(() => ael.classList.remove("fx-lunge"), 450);
      }
    }

    if (target) {
      const el = tokLayer.querySelector('.tok[data-id="' + target.id + '"]');
      if (el) {
        el.classList.remove("fx-hit", "fx-crit", "fx-miss", "fx-heal", "dmg-flash", "heal-flash");
        void el.offsetWidth;
        const fxClass = "fx-" + (type === "critmiss" ? "miss" : type);
        el.classList.add(fxClass);
        if (type === "hit" || type === "crit") el.classList.add("dmg-flash");
        if (type === "heal") el.classList.add("heal-flash");
        setTimeout(() => {
          el.classList.remove(fxClass, "dmg-flash", "heal-flash");
        }, 700);
      }

      const ix = (target.cx * CELL + CELL / 2) * scale + panX;
      const iy = (target.cy * CELL + CELL / 2) * scale + panY;
      const burst = document.createElement("div");
      burst.className = "atk-impact " + (type === "crit" ? "crit" : type === "miss" || type === "critmiss" ? "miss" : type === "heal" ? "heal" : "");
      burst.style.left = ix + "px";
      burst.style.top = iy + "px";
      board.appendChild(burst);
      setTimeout(() => burst.remove(), 520);

      if (attacker && type !== "heal") {
        const ax = (attacker.cx * CELL + CELL / 2) * scale + panX;
        const ay = (attacker.cy * CELL + CELL / 2) * scale + panY;
        const slash = document.createElement("div");
        slash.className = "atk-slash" + (type === "crit" ? " crit" : "");
        slash.textContent = type === "miss" || type === "critmiss" ? "✦" : type === "crit" ? "⚔" : "🗡";
        slash.style.left = (ax + ix) / 2 + "px";
        slash.style.top = (ay + iy) / 2 + "px";
        board.appendChild(slash);
        setTimeout(() => slash.remove(), 480);
      }

      const labels = {
        hit: ["VURUŞ", "hit"], crit: ["KRİTİK!", "crit"],
        miss: ["ISKA", "miss"], critmiss: ["KRİT İSKA", "miss"], heal: ["İYİLEŞ", "heal"]
      };
      const L = labels[type] || ["!", "hit"];
      floatText(target, L[0], L[1]);
    }
  }

  function playFxOnToken(tok, type) {
    if (!tok) return;
    playFx(type, tok.id, null);
  }


  document.querySelectorAll("[data-fx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!atkToId) { alert("Önce hedef seç."); return; }
      const atk = tokens.find((x) => x.id === atkFromId);
      const err = typeof assertCanAttack === "function" ? assertCanAttack(atk) : null;
      if (err) { alert(err); return; }
      playFx(btn.dataset.fx, atkToId, atkFromId);
    });
  });

  // Attack roll overlay
  function openAtkRoll() {
    if (!atkFromId || !atkToId) {
      alert("Saldıran ve hedef seç.");
      return;
    }
    const ft = tokens.find((x) => x.id === atkFromId);
    const err = assertCanAttack(ft);
    if (err) {
      alert(err);
      return;
    }
    const ov = document.getElementById("atkRollOv");
    if (!ov) return;
    const a = tokens.find((x) => x.id === atkFromId);
    const b = tokens.find((x) => x.id === atkToId);
    const tac = b?.ac ?? 10;
    document.getElementById("atkRollLabel").textContent =
      (a?.name || "?") + " → " + (b?.name || "?");
    const dcEl = document.getElementById("atkDC");
    if (dcEl) dcEl.value = String(tac);
    const rules = document.getElementById("atkRulesText") || document.querySelector(".atk-rules");
    if (rules) {
      rules.textContent = isDm()
        ? ("DM: hedef AC " + tac + " · avantaj seçilebilir · tutturunca hasar/can")
        : "AC gizli · avantaj/dezavantaj seç · sadece isabet veya ıska görürsün";
    }
    document.getElementById("atkRollResult").textContent = "";
    document.getElementById("atkRollResult").className = "atk-roll-result";
    window._lastAtkOutcome = null;
    window._atkAdv = "normal";
    window._atkIntent = "damage";
    document.querySelectorAll("[data-atk-adv]").forEach((b) => {
      b.classList.toggle("on", b.dataset.atkAdv === "normal");
    });
    document.querySelectorAll("[data-atk-intent]").forEach((b) => {
      b.classList.toggle("on", b.dataset.atkIntent === "damage");
    });
    const ho = document.getElementById("healOpts");
    if (ho) ho.style.display = "none";
    const go = document.getElementById("atkRollGo");
    if (go) go.textContent = "Saldırı zarı at";
    ov.classList.add("on");
  }

  document.getElementById("atkRollBtn")?.addEventListener("click", openAtkRoll);
  document.querySelectorAll("[data-atk-adv]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window._atkAdv = btn.dataset.atkAdv || "normal";
      document.querySelectorAll("[data-atk-adv]").forEach((b) => b.classList.toggle("on", b === btn));
    });
  });
  document.querySelectorAll("[data-atk-intent]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window._atkIntent = btn.dataset.atkIntent || "damage";
      document.querySelectorAll("[data-atk-intent]").forEach((b) => b.classList.toggle("on", b === btn));
      const heal = window._atkIntent === "heal";
      const ho = document.getElementById("healOpts");
      if (ho) ho.style.display = heal ? "block" : "none";
      const go = document.getElementById("atkRollGo");
      if (go) {
        if (!heal) go.textContent = "Saldırı zarı at";
        else {
          const useDice = document.getElementById("healUseDice")?.checked;
          go.textContent = useDice ? "Şifa zarı at" : "Can ver (zarsız)";
        }
      }
    });
  });
  document.getElementById("healUseDice")?.addEventListener("change", (e) => {
    if (window._atkIntent !== "heal") return;
    const go = document.getElementById("atkRollGo");
    if (go) go.textContent = e.target.checked ? "Şifa zarı at" : "Can ver (zarsız)";
  });
  function syncDcBar() {
    const dc = +document.getElementById("atkDC")?.value || 10;
    const fill = document.getElementById("atkDcFill");
    const val = document.getElementById("atkDcVal");
    if (val) val.textContent = String(dc);
    if (fill) fill.style.width = Math.min(100, (dc / 40) * 100) + "%";
  }
  // optional UI (hidden DC for players)
  if (document.getElementById("atkDcFill")) {
    document.getElementById("atkDC")?.addEventListener("input", syncDcBar);
    syncDcBar();
  }
  document.getElementById("atkRollClose")?.addEventListener("click", () => {
    document.getElementById("atkRollOv")?.classList.remove("on");
  });

  document.getElementById("atkRollGo")?.addEventListener("click", async () => {
    if (!atkFromId || !atkToId) return alert("Saldıran ve hedef seç.");
    {
      const _atk = tokens.find((x) => x.id === atkFromId);
      const _err = typeof assertCanAttack === "function" ? assertCanAttack(_atk) : null;
      if (_err) { alert(_err); return; }
    }
    // Heal without dice: no attack roll, just apply flat heal
    if (window._atkIntent === "heal" && document.getElementById("healUseDice")?.checked !== true) {
      if (!atkFromId || !atkToId) return alert("Saldıran ve hedef seç.");
      window._lastAtkOutcome = {
        outcome: "hit", targetId: atkToId, attackerId: atkFromId,
        dmgFormula: "0", isCrit: false,
      };
      document.getElementById("atkRollOv")?.classList.remove("on");
      await applyHealFromIntent(window._lastAtkOutcome);
      return;
    }
    // Heal with dice: skip AC attack, just roll heal formula
    if (window._atkIntent === "heal" && document.getElementById("healUseDice")?.checked === true) {
      if (!atkFromId || !atkToId) return alert("Saldıran ve hedef seç.");
      window._lastAtkOutcome = {
        outcome: "hit", targetId: atkToId, attackerId: atkFromId,
        dmgFormula: document.getElementById("healFormula")?.value || "1d8", isCrit: false,
      };
      document.getElementById("atkRollOv")?.classList.remove("on");
      await applyHealFromIntent(window._lastAtkOutcome);
      return;
    }

    if (rolling) return;
    const sides = +document.getElementById("atkDieSides")?.value || 20;
    let count = Math.min(4, Math.max(1, +document.getElementById("atkDieCount")?.value || 1));
    const mod = parseInt(document.getElementById("atkMod")?.value, 10) || 0;
    const dc = Math.max(1, +document.getElementById("atkDC")?.value || 10);
    const attacker = tokens.find((x) => x.id === atkFromId);
    const who = attacker?.name || "Saldırı";

    let atkAdv = window._atkAdv || "normal";
    // status-driven adv/disadv on attacker
    const atkTok = tokens.find((x) => x.id === atkFromId);
    if (atkTok) {
      const sts = normalizeStatuses(atkTok.statuses);
      if (sts.some((s) => s.adv === "disadv")) atkAdv = "disadv";
      else if (sts.some((s) => s.adv === "adv") && atkAdv === "normal") atkAdv = "adv";
    }
    const faces = [];
    let raw = 0;
    if (count === 1 && (atkAdv === "adv" || atkAdv === "disadv")) {
      const a = Math.floor(Math.random() * sides) + 1;
      const b = Math.floor(Math.random() * sides) + 1;
      const kept = atkAdv === "adv" ? Math.max(a, b) : Math.min(a, b);
      faces.push(a, b);
      raw = kept;
      window._atkAdvDetail = (atkAdv === "adv" ? "Avantaj" : "Dezavantaj") + " (" + a + "/" + b + ") → " + kept;
    } else {
      for (let i = 0; i < count; i++) {
        if (atkAdv === "adv" || atkAdv === "disadv") {
          const a = Math.floor(Math.random() * sides) + 1;
          const b = Math.floor(Math.random() * sides) + 1;
          faces.push(atkAdv === "adv" ? Math.max(a, b) : Math.min(a, b));
        } else {
          faces.push(Math.floor(Math.random() * sides) + 1);
        }
      }
      raw = faces.reduce((s, n) => s + n, 0);
      window._atkAdvDetail = atkAdv === "adv" ? "Avantaj" : atkAdv === "disadv" ? "Dezavantaj" : "";
    }
    const total = raw + mod;
    const hasNat1 = faces.includes(1) && atkAdv !== "adv"; // nat1 on kept die handled below
    const keptForCrit = (count === 1 && (atkAdv === "adv" || atkAdv === "disadv")) ? raw : Math.max(...faces);
    const hasNatMax = keptForCrit === sides || (atkAdv !== "disadv" && faces.includes(sides));
    const hasNat1Final = (count === 1 && (atkAdv === "adv" || atkAdv === "disadv"))
      ? (raw === 1)
      : faces.includes(1);

    const target = tokens.find((x) => x.id === atkToId);
    const targetAC = target?.ac ?? dc;
    const dmgFormula = attacker?.damage || "1d6";

    function rollFormula(formula) {
      const s = String(formula).replace(/\s/g, "");
      const m = s.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
      if (m) {
        const n = +m[1], sidesN = +m[2], modN = m[3] ? +m[3] : 0;
        let sum = 0;
        for (let i = 0; i < n; i++) sum += Math.floor(Math.random() * sidesN) + 1;
        return sum + modN;
      }
      const num = parseInt(s, 10);
      return Number.isFinite(num) ? num : 1;
    }

    let outcome = "miss";
    let label = "ISKA";
    if (hasNat1Final) {
      outcome = "critmiss";
      label = "KRİT İSKA";
    } else if (hasNatMax && total >= targetAC) {
      outcome = "crit";
      label = "KRİTİK — hasar/can seç";
    } else if (total >= targetAC) {
      outcome = "hit";
      label = "İSABET — hasar/can seç";
    } else {
      outcome = "miss";
      label = "ISKA";
    }

    window._lastAtkOutcome = {
      outcome, targetId: atkToId, attackerId: atkFromId,
      dmgFormula, isCrit: outcome === "crit",
    };

    const modStr = mod === 0 ? "" : (mod > 0 ? " +" + mod : " " + mod);
    const advPart = window._atkAdvDetail ? window._atkAdvDetail + " · " : "";
    const detail = isDm()
      ? (advPart + faces.join("+") + modStr + " = " + total + " vs AC " + targetAC + " → " + label)
      : (advPart + faces.join("+") + modStr + " = " + total + " → " + label);

    document.getElementById("atkRollOv")?.classList.remove("on");

    const labelDie = count + "d" + sides + (mod ? (mod > 0 ? "+" + mod : String(mod)) : "");
    const hideRoll = !!(attacker?.hidden || target?.hidden);
    await showDiceOverlay(who, labelDie, faces.slice(0, 8), total, detail, { dmOnly: hideRoll });

    const fxMap = { hit: "hit", crit: "crit", miss: "miss", critmiss: "critmiss" };
    playFx(fxMap[outcome] || "miss", target?.id, attacker?.id);
    // labels already shown by playFx

    // Hit → damage panel OR heal (pre-selected intent)
    if (outcome === "hit" || outcome === "crit") {
      if (window._atkIntent === "heal") {
        setTimeout(() => applyHealFromIntent(window._lastAtkOutcome), 350);
      } else {
        setTimeout(() => openDmgRoll(), 400);
      }
    }

    const log = document.getElementById("diceLog");
    if (log) {
      const line = document.createElement("div");
      line.innerHTML = "<strong>" + esc(who) + "</strong> " + esc(labelDie) + " → " + total +
        (isDm() ? (" vs AC " + targetAC) : "") + " (" + label + ")";
      log.prepend(line);
    }
    chatAdd("<span class=\"dice\">" + esc(who) + "</span> " + esc(labelDie) + " → " + total + " (" + label + ")", "dice");
  });

  async function applyHealFromIntent(last) {
    if (!last) return;
    const target = tokens.find((x) => x.id === last.targetId);
    const attacker = tokens.find((x) => x.id === last.attackerId);
    if (!target) return;
    const useDice = document.getElementById("healUseDice")?.checked === true;
    let amount = 0;
    let faces = [];
    let detail = "";
    if (useDice) {
      const f = document.getElementById("healFormula")?.value || "1d8";
      const s = String(f).replace(/\s/g, "");
      const m = s.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
      let raw = 0, modN = 0;
      if (m) {
        const n = +m[1], sidesN = +m[2];
        modN = m[3] ? +m[3] : 0;
        for (let i = 0; i < n; i++) {
          const v = Math.floor(Math.random() * sidesN) + 1;
          faces.push(v);
          raw += v;
        }
      } else {
        raw = parseInt(s, 10) || 1;
        faces = [raw];
      }
      amount = raw + modN;
      detail = faces.join("+") + (modN ? (modN > 0 ? "+" + modN : modN) : "") + " = " + amount + " can";
      await showDiceOverlay(attacker?.name || "Şifa", "Şifa " + f, faces.slice(0, 8), amount, detail);
    } else {
      amount = Math.max(1, parseInt(document.getElementById("healFlat")?.value, 10) || 5);
      detail = "Sabit +" + amount + " can";
      // No dice animation for flat heal
    }
    const max = target.hpMax ?? 999;
    target.hp = Math.min(max, (target.hp ?? 0) + amount);
    reviveFromZero(target);
    saveTokens();
    renderTokens();
    renderHP();
    playFx("heal", target.id, attacker?.id);
    floatText(target, "+" + amount, "heal");
    const log = document.getElementById("diceLog");
    if (log) {
      const line = document.createElement("div");
      line.innerHTML = "<strong>" + esc(attacker?.name || "Şifa") + "</strong> şifa → +" + amount;
      log.prepend(line);
    }
    window._lastAtkOutcome = null;
  }

  function openDmgRoll() {
    const last = window._lastAtkOutcome;
    if (!last || (last.outcome !== "hit" && last.outcome !== "crit")) return;
    const attacker = tokens.find((x) => x.id === last.attackerId);
    const target = tokens.find((x) => x.id === last.targetId);
    if (!target) return;
    const formula = last.dmgFormula || attacker?.damage || "1d6";
    const ov = document.getElementById("dmgRollOv");
    if (!ov) {
      // fallback immediate
      rollAndApplyDamage(last, formula);
      return;
    }
    document.getElementById("dmgRollLabel").textContent =
      (attacker?.name || "?") + " → " + (target.name || "?") +
      (last.isCrit ? " (KRİT ×2)" : "") + " · hasar veya can";
    document.getElementById("dmgFormulaInput").value = formula;
    ov.classList.add("on");
  }

  async function rollAndApplyDamage(last, formula, isHeal) {
    if (!last) last = window._lastAtkOutcome;
    if (!last) return;
    const target = tokens.find((x) => x.id === last.targetId);
    const attacker = tokens.find((x) => x.id === last.attackerId);
    if (!target) return;
    const f = formula || last.dmgFormula || "1d6";
    isHeal = !!isHeal;
    function rollFormula(formula) {
      const s = String(formula).replace(/\s/g, "");
      const m = s.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
      if (m) {
        const n = +m[1], sidesN = +m[2], modN = m[3] ? +m[3] : 0;
        let sum = 0;
        for (let i = 0; i < n; i++) sum += Math.floor(Math.random() * sidesN) + 1;
        return { sum: sum + modN, faces: null };
      }
      const num = parseInt(s, 10);
      return { sum: Number.isFinite(num) ? num : 1, faces: null };
    }
    // expand faces for dice overlay
    const s = String(f).replace(/\s/g, "");
    const m = s.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    let faces = [];
    let raw = 0;
    let modN = 0;
    if (m) {
      const n = +m[1], sidesN = +m[2];
      modN = m[3] ? +m[3] : 0;
      for (let i = 0; i < n; i++) {
        const v = Math.floor(Math.random() * sidesN) + 1;
        faces.push(v);
        raw += v;
      }
    } else {
      raw = parseInt(s, 10) || 1;
      faces = [raw];
    }
    let dmgDone = raw + modN;
    if (!isHeal && last.isCrit) dmgDone *= 2;

    document.getElementById("dmgRollOv")?.classList.remove("on");
    const who = attacker?.name || (isHeal ? "Şifa" : "Hasar");
    const detail = faces.join("+") + (modN ? (modN > 0 ? "+" + modN : modN) : "") +
      (!isHeal && last.isCrit ? " ×2" : "") + " = " + dmgDone + (isHeal ? " can" : " hasar");
    await showDiceOverlay(who, (isHeal ? "Şifa " : "Hasar ") + f + (!isHeal && last.isCrit ? " krit×2" : ""), faces.slice(0, 8), dmgDone, detail);

    if (isHeal) {
      const max = target.hpMax ?? 999;
      target.hp = Math.min(max, (target.hp ?? 0) + dmgDone);
    } else {
      const wasZero = (target.hp ?? 0) <= 0;
      target.hp = Math.max(0, (target.hp ?? 0) - dmgDone);
      if (wasZero && dmgDone > 0) {
        deathSaveFailFromDamage(target, !!last.isCrit);
      } else if (!wasZero && target.hp <= 0) {
        enterDying(target);
        floatText(target, "BAYILDI", "miss");
      }
    }
    if (isHeal) reviveFromZero(target);
    saveTokens();
    renderTokens();
    renderHP();
    if (isHeal) {
      playFx("heal", target.id, attacker?.id);
      floatText(target, "+" + dmgDone, "heal");
      reviveFromZero(target);
    } else {
      playFx(last.isCrit ? "crit" : "hit", target.id, attacker?.id);
      floatText(target, "-" + dmgDone, last.isCrit ? "crit" : "hit");
    }

    const log = document.getElementById("diceLog");
    if (log) {
      const line = document.createElement("div");
      line.innerHTML = "<strong>" + esc(who) + "</strong> " + (isHeal ? "şifa " : "hasar ") + esc(f) +
        (!isHeal && last.isCrit ? " ×2" : "") + " → " + (isHeal ? "+" : "−") + dmgDone +
        (!isHeal && target.hp <= 0 ? " 💀 bayıldı" : "");
      log.prepend(line);
    }
    window._lastAtkOutcome = null;
  }

  document.getElementById("dmgRollGo")?.addEventListener("click", () => {
    const f = document.getElementById("dmgFormulaInput")?.value || "1d6";
    rollAndApplyDamage(window._lastAtkOutcome, f, false);
  });
  document.getElementById("dmgRollClose")?.addEventListener("click", () => {
    document.getElementById("dmgRollOv")?.classList.remove("on");
  });

  tokLayer.addEventListener("click", (e) => {
    const tokEl = e.target.closest(".tok");
    if (!tokEl) return;
    const id = tokEl.dataset.id;
    if (e.shiftKey) setAttackPair(atkFromId || selectedId, id);
    else if (e.altKey) setAttackPair(id, atkToId);
  });

  // Keep attack line after camera change
  const _redrawGrid = redrawGrid;
  redrawGrid = function () {
    _redrawGrid();
    drawAttackLine(); // clears + redraws single arrow
  };

  // Refresh atk selects when tokens render
  const _renderTokens = renderTokens;
  renderTokens = function () {
    _renderTokens();
    refreshAtkSelects();
  };

    // ── Detailed SVG abilities / effects ──
  const fxLayer = document.getElementById("vttFx");
  let pendingAbility = null; // { name, style, color, color2, ownerId }

  function svgEl(tag, attrs, html) {
    const ns = "http://www.w3.org/2000/svg";
    const e = document.createElementNS(ns, tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (html) e.innerHTML = html;
    return e;
  }

  function buildSvgEffect(style, c1, c2) {
    const svg = svgEl("svg", { viewBox: "0 0 100 100" });
    const uid_ = "g" + Math.random().toString(36).slice(2, 7);

    if (style === "rune") {
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 42, fill: "none", stroke: c1, "stroke-width": 1.5, opacity: 0.85 }));
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 34, fill: "none", stroke: c2, "stroke-width": 1, "stroke-dasharray": "4 3", opacity: 0.7 }));
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 18, fill: c1, opacity: 0.15 }));
      // hex
      svg.appendChild(svgEl("polygon", {
        points: "50,12 78,28 78,62 50,78 22,62 22,28",
        fill: "none", stroke: c1, "stroke-width": 1.2, opacity: 0.9
      }));
      // inner star
      svg.appendChild(svgEl("path", {
        d: "M50 28 L56 44 L74 44 L60 54 L66 70 L50 60 L34 70 L40 54 L26 44 L44 44 Z",
        fill: c2, opacity: 0.35, stroke: c1, "stroke-width": 0.6
      }));
      svg.style.animation = "vfx-spin 8s linear infinite";
    } else if (style === "nova") {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x2 = 50 + Math.cos(a) * 46;
        const y2 = 50 + Math.sin(a) * 46;
        svg.appendChild(svgEl("line", {
          x1: 50, y1: 50, x2, y2, stroke: i % 2 ? c1 : c2,
          "stroke-width": i % 2 ? 2 : 1.2, opacity: 0.75, "stroke-linecap": "round"
        }));
      }
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 14, fill: c1, opacity: 0.5 }));
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 8, fill: "#fff", opacity: 0.7 }));
      svg.style.animation = "vfx-boom 1.2s ease-out infinite";
    } else if (style === "beam") {
      svg.appendChild(svgEl("defs", null,
        `<radialGradient id="${uid_}" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}" stop-opacity="0"/></radialGradient>`
      ));
      svg.appendChild(svgEl("ellipse", { cx: 50, cy: 50, rx: 48, ry: 16, fill: `url(#${uid_})`, opacity: 0.85 }));
      svg.appendChild(svgEl("ellipse", { cx: 50, cy: 50, rx: 36, ry: 8, fill: c1, opacity: 0.5 }));
      svg.appendChild(svgEl("line", { x1: 8, y1: 50, x2: 92, y2: 50, stroke: "#fff", "stroke-width": 2, opacity: 0.8 }));
      svg.style.animation = "vfx-pulse 0.8s ease-in-out infinite alternate";
    } else if (style === "vortex") {
      for (let i = 0; i < 5; i++) {
        const r = 12 + i * 7;
        svg.appendChild(svgEl("circle", {
          cx: 50, cy: 50, r, fill: "none",
          stroke: i % 2 ? c1 : c2, "stroke-width": 2 - i * 0.2,
          "stroke-dasharray": `${8 + i * 2} ${4 + i}`, opacity: 0.8 - i * 0.1
        }));
      }
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 6, fill: c1, opacity: 0.6 }));
      svg.style.animation = "vfx-spin 3s linear infinite";
    } else if (style === "sigil") {
      svg.appendChild(svgEl("rect", {
        x: 18, y: 18, width: 64, height: 64, rx: 4,
        fill: "none", stroke: c1, "stroke-width": 1.5, transform: "rotate(45 50 50)", opacity: 0.9
      }));
      svg.appendChild(svgEl("rect", {
        x: 26, y: 26, width: 48, height: 48, rx: 2,
        fill: c2, opacity: 0.12, stroke: c2, "stroke-width": 1, transform: "rotate(45 50 50)"
      }));
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 10, fill: "none", stroke: c1, "stroke-width": 1.5 }));
      svg.appendChild(svgEl("path", {
        d: "M50 30 L55 50 L50 70 L45 50 Z", fill: c1, opacity: 0.7
      }));
      svg.style.animation = "vfx-pulse 1.5s ease-in-out infinite alternate";
    } else if (style === "storm") {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x1 = 50 + Math.cos(a) * 10;
        const y1 = 50 + Math.sin(a) * 10;
        const x2 = 50 + Math.cos(a + 0.4) * 44;
        const y2 = 50 + Math.sin(a + 0.4) * 44;
        const x3 = 50 + Math.cos(a - 0.2) * 30;
        const y3 = 50 + Math.sin(a - 0.2) * 28;
        svg.appendChild(svgEl("path", {
          d: `M${x1} ${y1} L${x3} ${y3} L${x2} ${y2}`,
          fill: "none", stroke: i % 2 ? c1 : c2, "stroke-width": 1.4, opacity: 0.85
        }));
      }
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 12, fill: c1, opacity: 0.35 }));
      svg.style.animation = "vfx-flash 0.5s steps(2) infinite";
    } else if (style === "aura") {
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 44, fill: c1, opacity: 0.12 }));
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 44, fill: "none", stroke: c1, "stroke-width": 2, opacity: 0.7 }));
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 36, fill: "none", stroke: c2, "stroke-width": 1, "stroke-dasharray": "2 4", opacity: 0.6 }));
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 20, fill: c2, opacity: 0.15 }));
      // floating orbs
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        svg.appendChild(svgEl("circle", {
          cx: 50 + Math.cos(a) * 38, cy: 50 + Math.sin(a) * 38, r: 3,
          fill: c1, opacity: 0.9
        }));
      }
      svg.style.animation = "vfx-spin 10s linear infinite";
    } else if (style === "shatter") {
      const shards = [
        "M50 50 L30 20 L45 25 Z", "M50 50 L70 18 L65 32 Z",
        "M50 50 L82 45 L75 55 Z", "M50 50 L78 75 L68 70 Z",
        "M50 50 L50 88 L40 78 Z", "M50 50 L22 70 L28 58 Z",
        "M50 50 L15 40 L25 35 Z", "M50 50 L40 15 L50 22 Z"
      ];
      shards.forEach((d, i) => {
        svg.appendChild(svgEl("path", {
          d, fill: i % 2 ? c1 : c2, opacity: 0.55 + (i % 3) * 0.1, stroke: c1, "stroke-width": 0.4
        }));
      });
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 6, fill: "#fff", opacity: 0.8 }));
      svg.style.animation = "vfx-boom 1.4s ease-out infinite";
    } else if (style === "phoenix") {
      svg.appendChild(svgEl("defs", null,
        `<linearGradient id="${uid_}" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="${c2}" stop-opacity="0.25"/><stop offset="55%" stop-color="${c1}"/><stop offset="100%" stop-color="#fff"/></linearGradient>`
      ));
      svg.appendChild(svgEl("path", { d: "M50 80 Q15 58 12 30 Q28 48 50 22 Q72 48 88 30 Q85 58 50 80", fill: `url(#${uid_})`, opacity: "0.9" }));
      svg.appendChild(svgEl("path", { d: "M50 70 Q30 52 28 36 Q40 48 50 34 Q60 48 72 36 Q70 52 50 70", fill: c1, opacity: "0.55" }));
      svg.appendChild(svgEl("circle", { cx: "50", cy: "40", r: "6", fill: "#fff", opacity: "0.85" }));
      svg.appendChild(svgEl("path", { d: "M50 18 L53 32 L50 28 L47 32 Z", fill: c2, opacity: "0.9" }));
      svg.style.animation = "vfx-pulse 0.7s ease-in-out infinite alternate";
    } else if (style === "void") {
      svg.appendChild(svgEl("defs", null,
        `<radialGradient id="${uid_}"><stop offset="0%" stop-color="#000"/><stop offset="55%" stop-color="${c2}" stop-opacity="0.6"/><stop offset="100%" stop-color="${c1}" stop-opacity="0"/></radialGradient>`
      ));
      svg.appendChild(svgEl("circle", { cx: "50", cy: "50", r: "40", fill: `url(#${uid_})` }));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        svg.appendChild(svgEl("line", {
          x1: String(50 + Math.cos(a) * 18), y1: String(50 + Math.sin(a) * 18),
          x2: String(50 + Math.cos(a) * 46), y2: String(50 + Math.sin(a) * 46),
          stroke: i % 2 ? c1 : c2, "stroke-width": "1.2", opacity: "0.7"
        }));
      }
      svg.appendChild(svgEl("circle", { cx: "50", cy: "50", r: "10", fill: "#000", stroke: c1, "stroke-width": "1.5" }));
      svg.style.animation = "vfx-spin 6s linear infinite";
    } else {
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 40, fill: c1, opacity: 0.35 }));
      svg.appendChild(svgEl("circle", { cx: 50, cy: 50, r: 40, fill: "none", stroke: c2, "stroke-width": 2 }));
    }
    // soft outer glow filter attempt via style
    svg.style.filter = "drop-shadow(0 0 6px " + c1 + "88)";
    return svg;
  }

  function saveVfx() {
    try { save("origins_vfx_v1", vfxList); } catch (_) {}
  }

  function getMyAbilities() {
    if (!activePlayerId) return [];
    const char = loadRoster().find((c) => c.id === activePlayerId);
    if (!char) return [];
    return char.abilities || [];
  }

  function saveMyAbilities(list) {
    if (!activePlayerId) return;
    const roster = loadRoster();
    const i = roster.findIndex((c) => c.id === activePlayerId);
    if (i < 0) return;
    roster[i].abilities = list;
    saveRoster(roster);
  }

  function renderAbilityList() {
    const el = document.getElementById("abilityList");
    if (!el) return;
    if (!activePlayerId) {
      el.innerHTML = '<p style="font-size:0.68rem;color:#6b665c;margin:0;line-height:1.4">Üstten <strong>Ben</strong> ile karakterini seç. Yetenekler Karakter sayfasında tanımlanır.</p>';
      return;
    }
    const char = loadRoster().find((c) => c.id === activePlayerId);
    const list = (char && char.abilities) ? char.abilities : [];
    if (!list.length) {
      el.innerHTML = '<p style="font-size:0.68rem;color:#6b665c;margin:0;line-height:1.4"><strong>' + esc(char?.name || "") + '</strong>: yetenek yok. Karakter sayfasında ekle ve kaydet.</p>';
      return;
    }
    el.innerHTML = list.map((a, idx) =>
      `<div class="ability-chip" data-ab="${idx}">
        <span class="dot" style="background:${a.color || "#d4af37"}"></span>
        <span class="nm">${esc(a.name || "Yetenek")}</span>
      </div>`
    ).join("");
    el.querySelectorAll("[data-ab]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const a = list[+chip.dataset.ab];
        if (!a) return;
        pendingAbility = { ...a, ownerId: activePlayerId };
        vfxPlaceMode = true;
        vfxScale = parseFloat(document.getElementById("fxScale")?.value) || 1.5;
        const pm = document.getElementById("fxPlaceMode");
        if (pm) {
          pm.textContent = "Yerleştir: " + a.name + " (masaya tıkla)";
          pm.classList.add("active");
        }
        // highlight
        el.querySelectorAll(".ability-chip").forEach((c) => c.style.borderColor = "#252532");
        chip.style.borderColor = "#d4af37";
      });
    });
  }

  function renderVfx() {
    if (!fxLayer) return;
    fxLayer.innerHTML = "";
    vfxList.forEach((fx) => {
      const el = document.createElement("div");
      el.className = "vfx" + (vfxSelected === fx.id ? " sel" : "");
      const sz = VFX_BASE * (fx.scale || 1);
      el.style.width = sz + "px";
      el.style.height = sz + "px";
      el.style.left = fx.x + "px";
      el.style.top = fx.y + "px";
      el.dataset.id = fx.id;
      if (fx.media) {
        el.classList.add("vfx-media");
        if (fx.mediaType && fx.mediaType.startsWith("video")) {
          const v = document.createElement("video");
          v.src = fx.media;
          v.autoplay = true;
          v.loop = true;
          v.muted = true;
          v.playsInline = true;
          v.style.width = "100%";
          v.style.height = "100%";
          v.style.objectFit = "contain";
          v.style.pointerEvents = "none";
          el.appendChild(v);
          v.play().catch(() => {});
        } else {
          const img = document.createElement("img");
          img.src = fx.media;
          img.alt = fx.name || "";
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "contain";
          img.style.pointerEvents = "none";
          el.appendChild(img);
        }
      } else {
        const svg = buildSvgEffect(fx.style || "rune", fx.color || "#d4af37", fx.color2 || "#e05a5a");
        el.appendChild(svg);
      }
      const lab = document.createElement("span");
      lab.className = "vfx-label";
      lab.textContent = fx.name || fx.type || "Efekt";
      el.appendChild(lab);
      fxLayer.appendChild(el);

      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only owner or DM can move
        if (activePlayerId && !isDm() && fx.ownerId && fx.ownerId !== activePlayerId) {
          alert("Bu efekt senin yeteneğin değil.");
          return;
        }
        vfxSelected = fx.id;
        const sl = document.getElementById("fxScale");
        if (sl) {
          sl.value = String(fx.scale || 1);
          const sv = document.getElementById("fxScaleVal");
          if (sv) sv.textContent = (fx.scale || 1).toFixed(1) + "×";
        }
        pushUndo();
        drag = { type: "vfx", id: fx.id, sx: fx.x, sy: fx.y, ox: e.clientX, oy: e.clientY };
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        renderVfx();
      });
    });
  }

  document.getElementById("fxPlaceMode")?.addEventListener("click", () => {
    vfxPlaceMode = !vfxPlaceMode;
    const pm = document.getElementById("fxPlaceMode");
    if (pm) {
      pm.textContent = vfxPlaceMode
        ? ("Yerleştir: " + (pendingAbility?.name || "açık"))
        : "Yerleştir: kapalı";
      pm.classList.toggle("active", vfxPlaceMode);
    }
  });

  document.getElementById("fxScale")?.addEventListener("input", (e) => {
    vfxScale = parseFloat(e.target.value) || 1;
    document.getElementById("fxScaleVal").textContent = vfxScale.toFixed(1) + "×";
    if (vfxSelected) {
      const fx = vfxList.find((x) => x.id === vfxSelected);
      if (fx) {
        if (activePlayerId && !isDm() && fx.ownerId && fx.ownerId !== activePlayerId) return;
        fx.scale = vfxScale;
        saveVfx();
        renderVfx();
      }
    }
  });

  document.getElementById("fxDelete")?.addEventListener("click", () => {
    if (!vfxSelected) return alert("Önce efekt seç.");
    const fx = vfxList.find((x) => x.id === vfxSelected);
    if (fx && activePlayerId && !isDm() && fx.ownerId && fx.ownerId !== activePlayerId) {
      return alert("Bu efekt senin değil.");
    }
    vfxList = vfxList.filter((x) => x.id !== vfxSelected);
    vfxSelected = null;
    saveVfx();
    renderVfx();
  });

  document.getElementById("fxClearAll")?.addEventListener("click", () => {
    if (!isDm()) return alert("Tümünü silmek için DM olmalısın.");
    if (!confirm("Tüm efektler silinsin mi?")) return;
    vfxList = [];
    vfxSelected = null;
    saveVfx();
    renderVfx();
  });

  function placeVfxAt(wx, wy) {
    if (!pendingAbility) {
      alert("Önce bir yetenek seç veya oluştur.");
      return;
    }
    if (activePlayerId && !isDm() && pendingAbility.ownerId && pendingAbility.ownerId !== activePlayerId) {
      alert("Bu yetenek senin değil.");
      return;
    }
    vfxList.push({
      id: uid(),
      name: pendingAbility.name,
      style: pendingAbility.style || "rune",
      color: pendingAbility.color || "#d4af37",
      color2: pendingAbility.color2 || "#e05a5a",
      media: pendingAbility.media || "",
      mediaType: pendingAbility.mediaType || "",
      ownerId: pendingAbility.ownerId || activePlayerId || "",
      x: wx,
      y: wy,
      scale: vfxScale,
    });
    vfxSelected = vfxList[vfxList.length - 1].id;
    saveVfx();
    renderVfx();
  }

  // Refresh ability list when player changes
  document.getElementById("activePlayer")?.addEventListener("change", () => {
    renderAbilityList();
  });
  renderAbilityList();

  // ── Dostunu çağır (Yoldaş token next to selected character) ──
  // ── Dostunu çağır (Yoldaş token next to selected character) ──

  document.getElementById("callAllyBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Never treat as effect placement
    vfxPlaceMode = false;
    pendingAbility = null;
    const pm = document.getElementById("fxPlaceMode");
    if (pm) { pm.textContent = "Yerleştir: kapalı"; pm.classList.remove("active"); }

    let base = tokens.find((x) => x.id === selectedId && !x.enemy && x.form !== "ally");
    if (!base && activePlayerId) {
      base = tokens.find((x) => String(x.refId) === String(activePlayerId) && !x.enemy && x.form !== "ally");
    }
    if (!base) {
      alert("Önce kendi karakter token’ını seç veya koy. Üstten “Ben” ile karakterini seç.");
      return;
    }
    if (!canControlToken(base)) {
      alert("Sadece kendi karakterin için yoldaş çağırabilirsin.");
      return;
    }
    // Already has ally nearby?
    const existing = tokens.find(
      (x) => x.refId === base.refId && x.form === "ally"
    );
    if (existing) {
      selectedId = existing.id;
      renderTokens();
      renderInspector();
      alert("Yoldaş zaten masada.");
      return;
    }
    let char = loadRoster().find((c) => c.id === base.refId);
    let cr = char?.creature || {};
    if (!char) {
      // DM library entry
      const dm = (typeof loadDmChars === "function" ? loadDmChars() : []).find((c) => c.id === base.refId);
      if (dm && dm.creature) {
        char = { name: dm.name };
        cr = dm.creature;
      } else if (base.creatureData) {
        char = { name: base.name };
        cr = base.creatureData;
      } else {
        alert("Karakter kaydı veya yaratık formu yok.");
        return;
      }
    }
    if (!cr || (!cr.hp && !cr.hpMax && !base.creatureData && !char.creature)) {
      // allow empty creature defaults
      cr = cr || {};
    }
    const ally = {
      id: uid(),
      refId: base.refId,
      name: (char.name || "Yoldaş") + " · Yoldaş",
      title: "Yaratık",
      enemy: false,
      form: "ally",
      cx: base.cx + 1,
      cy: base.cy,
      hp: cr.hp ?? 20,
      hpMax: cr.hpMax ?? 20,
      ac: cr.ac ?? 13,
      damage: cr.damage || "1d8",
      statuses: [],
      owner: base.owner || (loadRoster().find((c) => String(c.id) === String(base.refId)) || {}).name || "",
      portrait: cr.portrait || "",
      size: 1,
      speed: cr.spd != null ? (+cr.spd || 0) : (base.speed || 0),
      faction: base.faction || "ally",
    };
    // Yoldaş her zaman çağıranın kontrolünde
    if (!ally.owner && activePlayerId) {
      const me = loadRoster().find((c) => c.id === activePlayerId);
      if (me) ally.owner = me.name;
    }
    ally._spawn = true;
    tokens.push(ally);
    selectedId = ally.id;
    saveTokens();
    renderTokens();
    renderInspector();
    renderHP();
    try { scheduleSync(); } catch (_) {}
    try {
      if (ally.portrait) broadcastTokenPortrait(ally.id, ally.portrait);
    } catch (_) {}
    setTimeout(() => {
      const tk = tokens.find((x) => x.id === ally.id);
      if (tk) delete tk._spawn;
      renderTokens();
    }, 500);
  });

  document.getElementById("shortcutHelp")?.addEventListener("click", () => {
    alert(
      "KISAYOLLAR\n\n" +
      "Del / Backspace  → seçili token veya efekti sil\n" +
      "Ctrl+Z           → geri al\n" +
      "Esc              → seçimi / yerleştirme iptal\n" +
      "V                → seç aracı\n" +
      "T                → token koy\n" +
      "R                → cetvel\n" +
      "H / Space        → kaydır\n" +
      "Ok tuşları       → token kaydır\n" +
      "Alt + tekerlek   → efekt boyutu\n" +
      "Ctrl+S           → kaydet"
    );
  });

  // ── Keyboard shortcuts ──
  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    // Ctrl+Z undo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      doUndo();
      return;
    }
    // Delete / Backspace — selected token or effect
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (vfxSelected) {
        pushUndo();
        vfxList = vfxList.filter((x) => x.id !== vfxSelected);
        vfxSelected = null;
        saveVfx();
        renderVfx();
        return;
      }
      if (selectedId) {
        pushUndo();
        tokens = tokens.filter((x) => x.id !== selectedId);
        selectedId = null;
        saveTokens();
        renderTokens();
        renderInspector();
        renderHP();
        return;
      }
    }
    // Escape — clear selection / place mode
    if (e.key === "Escape") {
      selectedId = null;
      vfxSelected = null;
      vfxPlaceMode = false;
      pendingAbility = null;
      const pm = document.getElementById("fxPlaceMode");
      if (pm) { pm.textContent = "Yerleştir: kapalı"; pm.classList.remove("active"); }
      renderTokens();
      renderVfx();
      renderInspector();
      return;
    }
    // Tools: V select, T token, R ruler, H pan
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "escape" || e.key === "Escape") {
        if (tool === "attack") {
          e.preventDefault();
          setTool("select");
          chatAdd("⚔ Saldırı iptal", "sys");
          return;
        }
      }
      if (k === "v") setTool("select");
      if (k === "t") setTool("token");
      if (k === "r") setTool("ruler");
      if (k === "h" || k === " ") { e.preventDefault(); setTool("pan"); }
    }
    // Ctrl+A select none (safety)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
    }
    // Ctrl+S prevent browser save
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveTokens();
      saveVfx();
    }
    // Arrow keys slide selected token one cell (blocked by walls)
    if (selectedId && ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
      e.preventDefault();
      const tk = tokens.find((x) => x.id === selectedId);
      if (!tk) return;
      if (!canControlToken(tk) && !isDm()) return;
      let ncx = tk.cx, ncy = tk.cy;
      if (e.key === "ArrowUp") ncy -= 1;
      if (e.key === "ArrowDown") ncy += 1;
      if (e.key === "ArrowLeft") ncx -= 1;
      if (e.key === "ArrowRight") ncx += 1;
      const blocked = window.__originsPathBlocked
        ? window.__originsPathBlocked(tk.cx, tk.cy, ncx, ncy)
        : false;
      if (blocked) return;
      pushUndo();
      tk.cx = ncx;
      tk.cy = ncy;
      saveTokens();
      renderTokens();
      if (typeof window.__originsRedrawVision === "function") {
        try { window.__originsRedrawVision(); } catch (_) {}
      } else if (window.__originsScheduleVision) {
        window.__originsScheduleVision();
      }
      try { drawAttackLine(); } catch (_) {}
      if (window.OriginsSync) {
        try { OriginsSync.pushTokenMove(tk.id, tk.cx, tk.cy); } catch (_) {}
      }
    }
  });

  // Push undo before destructive place
  const _placeVfxAt = placeVfxAt;
  placeVfxAt = function (wx, wy) {
    pushUndo();
    _placeVfxAt(wx, wy);
  };
  const _placeToken = placeToken;
  placeToken = function (cx, cy) {
    pushUndo();
    _placeToken(cx, cy);
  };

  document.getElementById("hideHowTo")?.addEventListener("click", () => {
    document.getElementById("howToBar")?.classList.add("hidden");
    try { sessionStorage.setItem("origins_hide_howto", "1"); } catch (_) {}
  });
  if (sessionStorage.getItem("origins_hide_howto") === "1") {
    document.getElementById("howToBar")?.classList.add("hidden");
  }

  // Session log
  function renderSessionLog() {
    const el = document.getElementById("sessionLogList");
    if (!el) return;
    const log = load(S.sessionLog, []);
    el.innerHTML = log.slice(0, 12).map((x) =>
      `<div style="margin-bottom:0.25rem;border-bottom:1px solid #1a1a22;padding-bottom:0.2rem"><span style="color:#6b665c">${esc(x.at || "")}</span> ${esc(x.text || "")}</div>`
    ).join("") || '<span style="color:#6b665c">Henüz log yok</span>';
  }
  document.getElementById("appendSessionLog")?.addEventListener("click", () => {
    const ta = document.getElementById("sessionNotes");
    const text = (ta?.value || "").trim();
    if (!text) return;
    const log = load(S.sessionLog, []);
    log.unshift({ at: new Date().toLocaleString("tr-TR"), text });
    save(S.sessionLog, log.slice(0, 50));
    ta.value = "";
    save(S.notes, "");
    renderSessionLog();
  });
  // load notes
  const notesEl = document.getElementById("sessionNotes");
  if (notesEl) notesEl.value = load(S.notes, "") || "";
  notesEl?.addEventListener("change", () => save(S.notes, notesEl.value));
  renderSessionLog();

  if (typeof syncLibButton === "function") syncLibButton();


  document.getElementById("stClose")?.addEventListener("click", () => {
    document.getElementById("statusModal")?.classList.remove("on");
    statusEdit = null;
  });
  document.getElementById("stSave")?.addEventListener("click", () => {
    if (!statusEdit) return;
    const tok = tokens.find((x) => x.id === statusEdit.tokenId);
    if (!tok) return;
    tok.statuses = normalizeStatuses(tok.statuses);
    const st = tok.statuses.find((s) => s.id === statusEdit.statusId);
    if (!st) return;
    st.turns = Math.max(0, +document.getElementById("stTurns").value || 0);
    st.dmg = Math.max(0, +document.getElementById("stDmg").value || 0);
    st.heal = Math.max(0, +document.getElementById("stHeal").value || 0);
    st.adv = document.getElementById("stAdv").value || "";
    st.skip = !!document.getElementById("stSkip").checked;
    st.skipN = Math.max(1, +document.getElementById("stSkipN").value || 1);
    saveTokens();
    renderTokens();
    document.getElementById("statusModal")?.classList.remove("on");
    statusEdit = null;
    scheduleSync();
  });
  document.getElementById("stRemove")?.addEventListener("click", () => {
    if (!statusEdit) return;
    const tok = tokens.find((x) => x.id === statusEdit.tokenId);
    if (!tok) return;
    tok.statuses = normalizeStatuses(tok.statuses).filter((s) => s.id !== statusEdit.statusId);
    saveTokens();
    renderTokens();
    renderInspector();
    document.getElementById("statusModal")?.classList.remove("on");
    statusEdit = null;
    scheduleSync();
  });

  // Chat
  (function loadChat() {
    const el = document.getElementById("chatLog");
    if (!el) return;
    const log = load("origins_chat_v1", []);
    log.slice(0, 40).forEach((x) => {
      const line = document.createElement("div");
      if (x.cls) line.className = x.cls;
      line.innerHTML = "<span style=\"color:#6b665c\">" + esc(x.t || "") + "</span> " + (x.text || "");
      el.appendChild(line);
    });
  })();
  document.getElementById("chatSend")?.addEventListener("click", sendChat);
  document.getElementById("chatInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });
  function sendChat() {
    const inp = document.getElementById("chatInput");
    const text = (inp?.value || "").trim();
    if (!text) return;
    const name = (loadRoster().find((c) => c.id === activePlayerId)?.name) || (isDm() ? "DM" : "Oyuncu");
    if (inp) inp.value = "";
    // /r 2d6+3  |  /r d20-1  |  /r 1d10
    const m = text.match(/^\/r\s*(.+)$/i);
    if (m) {
      parseAndRollChat(name, m[1].trim());
      return;
    }
    const w = text.match(/^\/w\s+(\S+)\s+(.+)$/i);
    if (w) {
      const target = w[1];
      const body = w[2];
      chatAdd("<span class=\"whisper\">[fısıltı → " + esc(target) + "] " + esc(name) + ": " + esc(body) + "</span>", "whisper", { skipSync: true });
      if (window.OriginsSync) {
        try {
          OriginsSync.pushChat({
            text: "<span class=\"whisper\">[fısıltı] " + esc(name) + " → " + esc(target) + ": " + esc(body) + "</span>",
            cls: "whisper",
            whisperTo: target,
            whisperFrom: name,
            t: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
          });
        } catch (_) {}
      }
      return;
    }
    chatAdd("<strong>" + esc(name) + ":</strong> " + esc(text));
  }

  async function parseAndRollChat(who, expr) {
    // supports: 1d20+3, 2d6-1, d10, 4d8+2
    const s = expr.replace(/\s/g, "").toLowerCase();
    const re = /^(\d*)d(\d+)([+-]\d+)?$/i;
    const match = s.match(re);
    if (!match) {
      chatAdd("Geçersiz zar: <code>/r 1d20+3</code> gibi yaz", "sys");
      return;
    }
    const count = Math.min(20, Math.max(1, parseInt(match[1] || "1", 10)));
    const sides = Math.max(2, parseInt(match[2], 10));
    const mod = match[3] ? parseInt(match[3], 10) : 0;
    const faces = [];
    for (let i = 0; i < count; i++) faces.push(Math.floor(Math.random() * sides) + 1);
    const raw = faces.reduce((a, b) => a + b, 0);
    const total = raw + mod;
    const modStr = mod === 0 ? "" : (mod > 0 ? "+" + mod : String(mod));
    const label = count + "d" + sides + modStr;
    const detail = faces.join("+") + modStr + " = " + total;
    await showDiceOverlay(who, label, faces.slice(0, 8), total, detail);
    chatAdd("<span class=\"dice\">" + esc(who) + "</span> /r " + esc(label) + " → <strong>" + total + "</strong> (" + faces.join(", ") + ")", "dice");
    const log = document.getElementById("diceLog");
    if (log) {
      const line = document.createElement("div");
      line.innerHTML = "<strong>" + esc(who) + "</strong> " + esc(label) + " → " + total;
      log.prepend(line);
    }
  }

  // Live sync
  let _syncTimer = null;
  function scheduleSync() {
    if (!window.OriginsSync) return;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
      try { OriginsSync.pushState(getSyncState()); } catch (_) {}
    }, 500);
  }
  function getSyncState() {
    // Lean token payload: keep portraits (needed for join) but strip ephemeral flags
    const leanTokens = tokens.map((tk) => ({
      id: tk.id,
      refId: tk.refId,
      name: tk.name,
      enemy: !!tk.enemy,
      form: tk.form,
      title: tk.title,
      owner: tk.owner,
      cx: tk.cx,
      cy: tk.cy,
      hp: tk.hp,
      hpMax: tk.hpMax,
      ac: tk.ac,
      damage: tk.damage,
      statuses: tk.statuses,
      portrait: "",
      size: normalizeTokenSize(tk.size),
      hasCreature: tk.hasCreature,
      creatureData: null,
      hidden: !!tk.hidden,
      visionFt: tk.visionFt != null ? tk.visionFt : 10,
      lightOn: !!tk.lightOn,
      lightFt: tk.lightFt != null ? tk.lightFt : 30,
      deathSaves: tk.deathSaves || { success: 0, fail: 0, stable: false, dead: false },
      atkSfx: "",
      atkSfxName: tk.atkSfxName || "",
      atkYt: tk.atkYt || "",
      faction: tk.faction || "",
      enemy: !!tk.enemy,
    }));
    let mapBg = null;
    try {
      const sc = typeof currentScene === "function" ? currentScene() : null;
      mapBg = (sc && sc.mapBg) || null;
      if (!mapBg && bgImg && bgImg.src && bgImg.style.display !== "none") {
        // only include data URLs (not blob: from remote that we didn't store)
        if (String(bgImg.src).startsWith("data:")) mapBg = bgImg.src;
      }
    } catch (_) {}
    return {
      tokens: leanTokens,
      initiative,
      turnIdx,
      atkFromId,
      atkToId,
      mapOX, mapOY, mapScale,
      mapBg,
      activeSceneId: typeof activeSceneId !== "undefined" ? activeSceneId : null,
      fogRects: fogRects || [],
      darknessRects: darknessRects || [],
      walls: walls || [],
      doors: doors || [],
      worldTime: typeof worldTime !== "undefined" ? worldTime : "day",
      bloodMoon: typeof bloodMoon !== "undefined" ? !!bloodMoon : false,
    };
  }
  window.__originsGetState = getSyncState;
  function applySyncState(st, meta) {
    if (!st) return;
    const myId = window.OriginsSync ? OriginsSync.clientId() : "";
    // Ignore our own state echo (host relay / self broadcast)
    if (meta && meta.from && myId && meta.from === myId) return;

    if (Array.isArray(st.tokens)) {
      const localPos = {};
      tokens.forEach((tk) => {
        if (localDragging.has(tk.id) || (drag && drag.type === "token" && drag.id === tk.id)) {
          localPos[tk.id] = { cx: tk.cx, cy: tk.cy };
        }
      });
      // Prefer newer move meta when merging positions
      const oldById = Object.create(null);
      tokens.forEach((tk) => { oldById[tk.id] = tk; });
      tokens = st.tokens.map((tk) => {
        const old = oldById[tk.id];
        let merged = { ...tk };
        if (merged.portrait && String(merged.portrait).length > 40) {
          /* gelen portre */
        } else if (old && old.portrait) {
          merged.portrait = old.portrait;
        }
        try {
          const pend = window.__pendingPortraits || Object.create(null);
          if ((!merged.portrait || String(merged.portrait).length < 40) && pend[merged.id]) {
            merged.portrait = pend[merged.id];
          }
          const fk = (merged.form === "ally") ? "ally" : "char";
          if ((!merged.portrait || String(merged.portrait).length < 40) && merged.refId) {
            const k = "ref:" + merged.refId + ":" + fk;
            if (pend[k]) merged.portrait = pend[k];
          }
          if ((!merged.portrait || String(merged.portrait).length < 40) && merged.refId) {
            const cache = JSON.parse(localStorage.getItem("origins_portrait_cache_v1") || "{}");
            if (cache[String(merged.refId) + ":" + fk]) merged.portrait = cache[String(merged.refId) + ":" + fk];
            else if (cache["id:" + merged.id]) merged.portrait = cache["id:" + merged.id];
          }
        } catch (_) {}
        if (old && !merged.atkSfx && old.atkSfx) {
          merged.atkSfx = old.atkSfx;
          merged.atkSfxName = old.atkSfxName || merged.atkSfxName;
        }
        if (localPos[tk.id]) {
          merged.cx = localPos[tk.id].cx;
          merged.cy = localPos[tk.id].cy;
        }
        return merged;
      });
    }
    if (Array.isArray(st.initiative)) initiative = st.initiative;
    if (st.turnIdx != null) turnIdx = st.turnIdx;
    if (st.atkFromId !== undefined) atkFromId = st.atkFromId;
    if (st.atkToId !== undefined) atkToId = st.atkToId;
    // Map konumu: sadece karşıdan map görseli geldiyse güncelle (yoksa yerel kaydı ezme)
    const _remoteHasMap = !!(st.mapBg && String(st.mapBg).length > 20);
    if (_remoteHasMap) {
      if (st.mapOX != null) mapOX = st.mapOX;
      if (st.mapOY != null) mapOY = st.mapOY;
      if (st.mapScale != null) mapScale = st.mapScale;
    }
    if (Array.isArray(st.fogRects)) fogRects = st.fogRects;
    if (Array.isArray(st.darknessRects)) darknessRects = st.darknessRects;
    if (Array.isArray(st.walls)) walls = st.walls;
    if (Array.isArray(st.doors)) doors = st.doors;
    if (st.worldTime === "day" || st.worldTime === "night") worldTime = st.worldTime;
    if (st.bloodMoon != null) bloodMoon = !!st.bloodMoon;
    try { applyAtmosphere(true); } catch (_) {}
    try { persistVision(); } catch (_) {}
    try { renderDoors(); } catch (_) {}

    // Map: dolu gelirse yükle; _forceClearMap ile bilinçli sil; aksi halde dokunma
    if (st._forceClearMap) {
      const sc = typeof currentScene === "function" ? currentScene() : null;
      if (sc) sc.mapBg = null;
      try { localStorage.removeItem(S.mapBg); } catch (_) {}
      if (bgImg) {
        bgImg.removeAttribute("src");
        bgImg.style.display = "none";
      }
      try { persistScenes(); } catch (_) {}
    } else if (st.mapBg && String(st.mapBg).length > 20) {
      const sc = typeof currentScene === "function" ? currentScene() : null;
      if (sc) sc.mapBg = st.mapBg;
      try { localStorage.setItem(S.mapBg, st.mapBg); } catch (_) {}
      const curSrc = bgImg && bgImg.getAttribute("src");
      if (curSrc !== st.mapBg) {
        if (st.mapOX != null) mapOX = st.mapOX;
        if (st.mapOY != null) mapOY = st.mapOY;
        if (st.mapScale != null) mapScale = st.mapScale;
        loadMapDataUrl(st.mapBg, { preserve: true });
        try { persistScenes(); } catch (_) {}
      } else {
        applyMapXF();
      }
    } else {
      applyMapXF();
    }
    applyCamera();
    try { redrawVision(); } catch (_) {}

    // Eksik portreleri cache / pending ile doldur
    try {
      const cache = JSON.parse(localStorage.getItem("origins_portrait_cache_v1") || "{}");
      const pend = window.__pendingPortraits || {};
      let filled = false;
      tokens.forEach((tk) => {
        if (!tk || (tk.portrait && String(tk.portrait).indexOf("data:image") === 0)) return;
        const fk = (tk.form === "ally") ? "ally" : "char";
        const cand = pend[tk.id]
          || pend["ref:" + tk.refId + ":" + fk]
          || cache["id:" + tk.id]
          || cache[String(tk.refId) + ":" + fk];
        if (cand && String(cand).indexOf("data:image") === 0) {
          tk.portrait = cand;
          filled = true;
        }
      });
      if (filled) {
        try { saveTokens(); } catch (_) {}
      }
    } catch (_) {}

    renderTokens();
    renderInit();
    renderHP();
    renderInspector();
    drawAttackLine();
    // Portre yoksa odadan iste
    try {
      const missing = tokens.some((tk) => !tk.portrait || String(tk.portrait).indexOf("data:image") !== 0);
      if (missing && window.OriginsSync && OriginsSync.requestAllPortraits && OriginsSync.isConnected && OriginsSync.isConnected()) {
        clearTimeout(window.__portraitReqTimer);
        window.__portraitReqTimer = setTimeout(() => {
          try { OriginsSync.requestAllPortraits(); } catch (_) {}
        }, 1500);
      }
    } catch (_) {}
  }

  function applyTokenMove(msg) {
    if (!msg || !msg.id) return;
    // Ignore echo of our own drag / in-progress local drag
    const myId = window.OriginsSync ? OriginsSync.clientId() : "";
    if (localDragging.has(msg.id) || (drag && drag.type === "token" && drag.id === msg.id)) return;
    if (msg.from && myId && msg.from === myId) return;

    const prev = tokenMoveMeta[msg.id];
    const incomingT = msg.t || 0;
    const incomingSeq = msg.seq || 0;
    if (prev) {
      if (incomingT < prev.t) return;
      if (incomingT === prev.t && incomingSeq < prev.seq) return;
      // same t+seq: deterministic tie-break by from id
      if (incomingT === prev.t && incomingSeq === prev.seq && (msg.from || "") < (prev.from || "")) return;
    }
    tokenMoveMeta[msg.id] = { t: incomingT, seq: incomingSeq, from: msg.from || "" };

    const tk = tokens.find((x) => x.id === msg.id);
    if (!tk) return;
    if (tk.cx === msg.cx && tk.cy === msg.cy) return;
    tk.cx = msg.cx;
    tk.cy = msg.cy;
    const el = tokLayer.querySelector('.tok[data-id="' + tk.id + '"]');
    if (el) {
      const ctr = tokenCenterWorld(tk);
      el.style.left = ctr.x + "px";
      el.style.top = ctr.y + "px";
    } else {
      renderTokens();
    }
    try { save(S.tokens, tokens); } catch (_) {}
    if (typeof window.__originsRedrawVision === "function") {
      try { window.__originsRedrawVision(); } catch (_) {}
    } else if (window.__originsScheduleVision) {
      window.__originsScheduleVision();
    }
    try { drawAttackLine(); } catch (_) {}
  }
  if (window.OriginsSync) {
    OriginsSync.setHandlers({
      onState: applySyncState,
      onTokenMove: applyTokenMove,
      onFx: (msg) => {
        if (!msg) return;
        const myId = OriginsSync.clientId();
        if (msg.from && msg.from === myId) return;
        playFx(msg.fxType || "hit", msg.targetId, msg.attackerId, {
          remote: true,
          sfxUrl: msg.sfxUrl || null,
        });
      },
      onMusic: (msg) => {
        try { handleRemoteMusic(msg); } catch (_) {}
      },
      onPortrait: (tokenId, dataUrl, meta) => {
        if (!dataUrl || String(dataUrl).indexOf("data:image") !== 0) return;
        meta = meta || {};
        const formKey = meta.form === "ally" ? "ally" : "char";
        window.__pendingPortraits = window.__pendingPortraits || Object.create(null);
        if (tokenId) window.__pendingPortraits[String(tokenId)] = dataUrl;
        if (meta.refId) window.__pendingPortraits["ref:" + meta.refId + ":" + formKey] = dataUrl;
        try {
          const cache = JSON.parse(localStorage.getItem("origins_portrait_cache_v1") || "{}");
          if (meta.refId) {
            delete cache[String(meta.refId)];
            delete cache["name:" + (meta.name || "")];
            cache[String(meta.refId) + ":" + formKey] = dataUrl;
          }
          if (tokenId) cache["id:" + tokenId] = dataUrl;
          localStorage.setItem("origins_portrait_cache_v1", JSON.stringify(cache));
        } catch (_) {}
        let applied = 0;
        tokens.forEach((tk) => {
          if (!tk) return;
          if (tokenId && String(tk.id) === String(tokenId)) {
            tk.portrait = dataUrl;
            applied++;
            return;
          }
          if (meta.refId && String(tk.refId) === String(meta.refId)) {
            const tkForm = tk.form === "ally" ? "ally" : "char";
            if (tkForm === formKey) {
              tk.portrait = dataUrl;
              applied++;
            }
          }
        });
        if (!applied) return;
        try { saveTokens(); } catch (_) {}
        try { renderTokens(); } catch (_) {}
        try { renderHP(); } catch (_) {}
        try { renderInspector(); } catch (_) {}
      },
      onDice: (msg) => {
        if (!msg) return;
        const myId = OriginsSync.clientId();
        if (msg.from && msg.from === myId) return;
        if (msg.dmOnly && !isDm()) return;
        showDiceOverlay(msg.who || "?", msg.label || "", msg.faces || [msg.total], msg.total, msg.detail || "", {
          remote: true,
          dmOnly: !!msg.dmOnly,
          diceStyle: msg.diceStyle || null,
        });
      },
      onChat: (msg) => {
        if (msg.dmOnly && !isDm()) return;
        if (msg.whisperTo) {
          const me = currentDisplayName();
          const myId = OriginsSync.clientId();
          if (msg.from === myId) return;
          const ok = msg.whisperTo.toLowerCase() === String(me).toLowerCase()
            || msg.whisperTo.toLowerCase() === "dm" && isDm()
            || isDm();
          if (!ok) return;
        }
        const el = document.getElementById("chatLog");
        if (!el) return;
        const line = document.createElement("div");
        if (msg.cls) line.className = msg.cls;
        line.innerHTML = "<span style=\"color:#6b665c\">" + esc(msg.t || "") + "</span> " + (msg.text || "");
        el.prepend(line);
      },
      onPresence: (list) => {
        window.__originsRenderPresence = renderPresence;
        renderPresence(list);
      },
      onRuler: (msg) => {
        if (!msg) return;
        const myId = OriginsSync.clientId();
        if (msg.from && msg.from === myId) return;
        if (msg.clear) {
          delete remoteRulers[msg.from];
          document.getElementById("rulerTag_" + msg.from)?.remove();
        } else if (msg.from != null) {
          remoteRulers[msg.from] = {
            scx: msg.scx, scy: msg.scy, ecx: msg.ecx, ecy: msg.ecy,
            name: msg.name || "?",
          };
        }
        try { redrawOverlays(); } catch (_) {}
      },
      onHost: (msg) => {
        if (msg && msg.type === "host_lost") {
          chatAdd("Bağlantı koptu — otomatik yeniden deneniyor (↻ ile elle de bağlanabilirsin).", "sys");
        }
      },
    });
    window.__originsRenderPresence = renderPresence;
    try { renderPresence(OriginsSync.getPresence && OriginsSync.getPresence()); } catch (_) {}
    setInterval(() => {
      try {
        if (OriginsSync.getPresence) renderPresence(OriginsSync.getPresence());
      } catch (_) {}
    }, 3000);

    // Sekme değişince oda AÇIK kalsın — peer destroy yok
    document.addEventListener("visibilitychange", () => {
      try {
        if (OriginsSync.setWantAlive) OriginsSync.setWantAlive(true);
        if (document.visibilityState === "hidden") {
          // arka planda presence gönder (throttle'a rağmen)
          try { OriginsSync.sendPresence(false); } catch (_) {}
          return;
        }
        // sekmeye geri dönüş
        const name = currentDisplayName();
        OriginsSync.setDisplayName(name);
        if (!OriginsSync.isConnected || !OriginsSync.isConnected()) {
          OriginsSync.reconnect(name);
          chatAdd("Sekmeye dönüldü — oda yeniden bağlanıyor…", "sys");
        } else {
          OriginsSync.sendPresence(false);
          if (OriginsSync.getPresence) renderPresence(OriginsSync.getPresence());
        }
      } catch (_) {}
    });
    window.addEventListener("pageshow", () => {
      try {
        if (OriginsSync.setWantAlive) OriginsSync.setWantAlive(true);
        const name = currentDisplayName();
        OriginsSync.setDisplayName(name);
        if (!OriginsSync.isConnected || !OriginsSync.isConnected()) {
          OriginsSync.reconnect(name);
        }
      } catch (_) {}
    });
    window.addEventListener("pagehide", (e) => {
      try {
        // bfcache / sekme: ASLA destroy etme
        if (OriginsSync.setWantAlive) OriginsSync.setWantAlive(true);
        const code = OriginsSync.roomId && OriginsSync.roomId();
        if (code) localStorage.setItem("origins_room_code", code);
      } catch (_) {}
    });
    window.addEventListener("beforeunload", () => {
      try {
        if (OriginsSync.setWantAlive) OriginsSync.setWantAlive(true);
        const code = OriginsSync.roomId && OriginsSync.roomId();
        if (code) localStorage.setItem("origins_room_code", code);
      } catch (_) {}
    });
  }
  // Otomatik ortak ağ — oda kodu yok
  function wireOnlineName() {
    const inp = document.getElementById("displayName");
    if (!inp) return;
    try {
      const saved = sessionStorage.getItem("origins_display_name") || localStorage.getItem("origins_display_name") || "";
      if (saved && !inp.value) inp.value = saved;
    } catch (_) {}
    const apply = () => {
      const name = (inp.value || "").trim() || "Oyuncu";
      try { OriginsSync?.setDisplayName(name); } catch (_) {}
      try { OriginsSync?.sendPresence && OriginsSync.sendPresence(); } catch (_) {}
    };
    inp.addEventListener("change", apply);
    inp.addEventListener("blur", apply);
    apply();
  }
  wireOnlineName();

  document.getElementById("roomReconnect")?.addEventListener("click", () => {
    const name = typeof currentDisplayName === "function" ? currentDisplayName() : (document.getElementById("displayName")?.value || "Oyuncu");
    OriginsSync?.setDisplayName(name);
    OriginsSync?.autoConnect(true);
    try { chatAdd("Yeniden bağlanılıyor…", "sys"); } catch (_) {}
  });

  try {
    const name = typeof currentDisplayName === "function" ? currentDisplayName() : "Oyuncu";
    OriginsSync?.setDisplayName(name);
    OriginsSync?.autoConnect(false);
  } catch (_) {}

  // Scene changes must never touch room — belt & suspenders
  // Sahne değişimi online bağlantıyı bozmaz
  const _applySceneRoomSafe = applyScene;
  applyScene = function (sc) {
    _applySceneRoomSafe(sc);
    try {
      if (window.OriginsSync && OriginsSync.sendPresence) OriginsSync.sendPresence();
    } catch (_) {}
  };

  // Hook saveTokens to sync
  const _saveTokens = saveTokens;
  saveTokens = function () {
    _saveTokens();
    if (drag && drag.type === "token") return; // end-of-drag uses token_move
    scheduleSync();
  };



  // Sidebar resize
  (function sideResize() {
    const main = document.querySelector(".vtt-main");
    const left = document.getElementById("sideLeft");
    const right = document.getElementById("sideRight");
    if (!main) return;
    let leftW = parseInt(localStorage.getItem("origins_side_l") || "220", 10);
    let rightW = parseInt(localStorage.getItem("origins_side_r") || "250", 10);
    main.style.setProperty("--side-left", leftW + "px");
    main.style.setProperty("--side-right", rightW + "px");

    function drag(handle, isLeft) {
      if (!handle) return;
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        handle.classList.add("dragging");
        const startX = e.clientX;
        const startW = isLeft ? leftW : rightW;
        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          let w = isLeft ? startW + dx : startW - dx;
          w = Math.max(140, Math.min(420, w));
          if (isLeft) {
            leftW = w;
            main.style.setProperty("--side-left", w + "px");
          } else {
            rightW = w;
            main.style.setProperty("--side-right", w + "px");
          }
          sizeCanvases();
        };
        const onUp = () => {
          handle.classList.remove("dragging");
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          try {
            localStorage.setItem("origins_side_l", String(leftW));
            localStorage.setItem("origins_side_r", String(rightW));
          } catch (_) {}
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
    }
    drag(document.getElementById("resizeLeft"), true);
    drag(document.getElementById("resizeRight"), false);
  })();


  // ── Presence UI ──
  function renderPresence(list) {
    const el = document.getElementById("presenceList");
    const cnt = document.getElementById("presenceCount");
    if (!el) return;
    list = Array.isArray(list) ? list : [];
    // Fallback: pull from sync if empty
    if (!list.length && window.OriginsSync && typeof OriginsSync.getPresence === "function") {
      try { list = OriginsSync.getPresence() || []; } catch (_) {}
    }
    if (!list.length) {
      el.innerHTML = '<div class="presence-row"><span class="dot" style="background:#6b665c"></span> Bağlı kimse yok — oda aç / katıl</div>';
      if (cnt) cnt.textContent = "(0)";
      return;
    }
    if (cnt) cnt.textContent = "(" + list.length + ")";
    el.innerHTML = list.map((p) => {
      return `<div class="presence-row ${p.host ? "host" : ""}">
        <span class="dot"></span>
        <span>${esc(p.name || "Oyuncu")}</span>
        <span class="tag">${p.host ? "HOST" : "oyuncu"}${p.ready ? " · HAZIR" : ""}</span>
      </div>`;
    }).join("");
  }
  window.__originsRenderPresence = renderPresence;

  function currentDisplayName() {
    const input = document.getElementById("displayName");
    if (input && input.value.trim()) return input.value.trim();
    try {
      const saved = localStorage.getItem("origins_display_name");
      if (saved) return saved;
    } catch (_) {}
    const me = loadRoster().find((c) => c.id === activePlayerId);
    if (me) return me.name;
    return isDm() ? "DM" : "Oyuncu";
  }

  (function initDisplayName() {
    const input = document.getElementById("displayName");
    if (!input) return;
    try {
      const saved = localStorage.getItem("origins_display_name");
      if (saved) input.value = saved;
    } catch (_) {}
    input.addEventListener("change", () => {
      const n = input.value.trim() || "Oyuncu";
      input.value = n;
      try { localStorage.setItem("origins_display_name", n); } catch (_) {}
      if (window.OriginsSync) {
        OriginsSync.setDisplayName(n);
        try { OriginsSync.sendPresence(false); } catch (_) {}
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
  })();


  // ── Action bar ──
  function updateActionBar() {
    const nameEl = document.getElementById("actionBarName");
    const tok = tokens.find((x) => x.id === selectedId);
    if (nameEl) nameEl.textContent = tok ? (tok.name || "Token") : "Token seç";
    const dead = tok && tok.deathSaves && tok.deathSaves.dead;
    const dying = tok && (tok.hp ?? 1) <= 0 && !dead;
    const can = tok && (canControlToken(tok) || isDm());
    const setDis = (id, on) => {
      const b = document.getElementById(id);
      if (b) b.disabled = !on;
    };
    setDis("abAttack", !!(can && tok && (tok.hp ?? 1) > 0));
    setDis("abDoor", !!can);
    setDis("abDeath", !!(can && dying));
    setDis("abAlly", !!(can && tok && tok.form !== "ally" && !tok.enemy));
    // Kişisel sesler her zaman açık
    setDis("abSfx1", true);
    setDis("abSfx2", true);
    try { refreshSfxButtons(); } catch (_) {}
  }

  document.getElementById("abAttack")?.addEventListener("click", () => {
    const tok = tokens.find((x) => x.id === selectedId);
    if (!tok) return alert("Token seç");
    if (!canControlToken(tok) && !isDm()) return;
    if ((tok.hp ?? 1) <= 0) return alert("Bu token saldıramaz");
    setAttackPair(tok.id, null);
    setTool("attack");
    chatAdd("⚔ Crosshair: saldırılacak token’a tıkla ( Esc = iptal )", "sys");
  });
  document.getElementById("abDoor")?.addEventListener("click", () => {
    const tok = tokens.find((x) => x.id === selectedId);
    if (!tok) return alert("Önce token seç");
    if (!canControlToken(tok) && !isDm()) return;
    const pos = tokenWorldPos(tok);
    const reach = feetToWorld(5); // tam 5 ft
    // Sadece bu token’ın 5 ft içindeki kapılar
    const near = (doors || []).filter((d) => {
      const m = doorMid(d);
      return Math.hypot(pos.x - m.x, pos.y - m.y) <= reach;
    });
    if (!near.length) return alert("5 feet içinde kapı yok");
    // En yakın TEK kapı
    let best = near[0], bestD = 1e9;
    near.forEach((d) => {
      const m = doorMid(d);
      const dist = Math.hypot(pos.x - m.x, pos.y - m.y);
      if (dist < bestD) { bestD = dist; best = d; }
    });
    toggleDoor(best.id, tok);
  });
  document.getElementById("abDeath")?.addEventListener("click", () => {
    const tok = tokens.find((x) => x.id === selectedId);
    if (!tok) return;
    try { rollDeathSave(tok); } catch (e) { alert(e.message || "Ölüm zarı"); }
  });
  document.getElementById("abAlly")?.addEventListener("click", () => {
    document.getElementById("callAllyBtn")?.click();
  });
  try { updateActionBar(); } catch (_) {}

  // ── Hava / ışık presetleri ──
  function applyWeatherPreset(kind) {
    if (!isDm()) return alert("Sadece DM");
    const cx = -mapOX + (board.clientWidth / 2) / scale;
    const cy = -mapOY + (board.clientHeight / 2) / scale;

    // clear previous weather presets
    darknessRects = (darknessRects || []).filter((r) => !r.preset);
    fogRects = (fogRects || []).filter((r) => !r.preset);
    tokens.forEach((tk) => {
      if (tk._presetLight) {
        tk.lightOn = false;
        delete tk._presetLight;
      }
    });

    if (kind === "clear") {
      chatAdd("🌤 Hava: açık", "sys");
    } else if (kind === "mist") {
      // Sis: gri, delikli (style mist)
      darknessRects.push({
        x: cx - 900, y: cy - 650, w: 1800, h: 1300,
        preset: true,
        style: "mist",
      });
      chatAdd("🌫 Sis — gri sis, rastgele boşluklar", "sys");
    } else if (kind === "moon") {
      // Dolunay: hafif karanlık, asla tam açılmaz
      darknessRects.push({
        x: cx - 900, y: cy - 650, w: 1800, h: 1300,
        preset: true,
        style: "moon",
      });
      tokens.forEach((tk) => {
        if (!tk.enemy) {
          tk.lightOn = true;
          tk.lightFt = 25;
          tk._presetLight = true;
        }
      });
      chatAdd("🌕 Dolunay — etraf hafif karanlık (tam açılmaz)", "sys");
    }
    persistVision();
    saveTokens();
    renderTokens();
    scheduleVision();
    scheduleSync();
  }
  document.getElementById("wxPresetClear")?.addEventListener("click", () => applyWeatherPreset("clear"));
  document.getElementById("wxPresetMist")?.addEventListener("click", () => applyWeatherPreset("mist"));
  document.getElementById("wxPresetMoon")?.addEventListener("click", () => applyWeatherPreset("moon"));

  // ── Sahne paketi export / import ──
  document.getElementById("scenePackExport")?.addEventListener("click", () => {
    if (!isDm()) return alert("Sadece DM");
    snapshotScene();
    const sc = currentScene();
    if (!sc) return;
    const pack = {
      type: "origins-scene-pack",
      v: 1,
      exported: new Date().toISOString(),
      scene: JSON.parse(JSON.stringify(sc)),
    };
    const blob = new Blob([JSON.stringify(pack)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "origins-sahne-" + (sc.name || "pack").replace(/\s+/g, "_") + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById("scenePackImport")?.addEventListener("change", (e) => {
    if (!isDm()) return alert("Sadece DM");
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const scData = data.scene || data;
        if (!scData || typeof scData !== "object") throw new Error("Geçersiz paket");
        const sc = {
          id: uid(),
          name: (scData.name || "Yüklenen sahne") + "",
          mapBg: scData.mapBg || null,
          mapOX: scData.mapOX || 0,
          mapOY: scData.mapOY || 0,
          mapScale: scData.mapScale || 1,
          tokens: Array.isArray(scData.tokens) ? scData.tokens : [],
          fogRects: scData.fogRects || [],
          darknessRects: scData.darknessRects || [],
          walls: scData.walls || [],
          doors: scData.doors || [],
        };
        scenes.push(sc);
        applyScene(sc);
        persistScenes();
        alert("Sahne yüklendi: " + sc.name);
      } catch (err) {
        alert("Yüklenemedi: " + (err.message || err));
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  });

  // ── Ambiyans (ayarlanabilir: ses, yoğunluk, özel mp3, oda paylaşımı) ──
  let ambientOn = false;
  let ambientNodes = null;
  let ambientKind = null;
  let ambientTimers = [];
  let ambientMasterGain = null;
  let ambientHtmlAudio = null;
  const AMB_STORE = "origins_amb_custom_v1";

  function loadAmbCustom() {
    try { return load(AMB_STORE, {}) || {}; } catch (_) { return {}; }
  }
  function saveAmbCustom(map) {
    try { save(AMB_STORE, map); } catch (_) {}
  }
  function getAmbVol() {
    const el = document.getElementById("ambVolume");
    if (el) return Math.min(1, Math.max(0, (+el.value || 0) / 100));
    try {
      const v = localStorage.getItem("origins_amb_vol");
      if (v != null) return Math.min(1, Math.max(0, +v / 100));
    } catch (_) {}
    return 0.35;
  }
  function getAmbIntensity() {
    const el = document.getElementById("ambIntensity");
    if (el) return Math.min(1, Math.max(0.1, (+el.value || 50) / 100));
    return 0.5;
  }
  function applyAmbVol() {
    const vol = getAmbVol();
    if (ambientMasterGain) {
      try { ambientMasterGain.gain.value = vol * 0.5; } catch (_) {}
    }
    if (ambientHtmlAudio) {
      try { ambientHtmlAudio.volume = vol; } catch (_) {}
    }
  }
  function stopAmbient(silent) {
    ambientOn = false;
    ambientKind = null;
    try { ambientNodes && ambientNodes.forEach((n) => { try { n.stop(); } catch (_) {} }); } catch (_) {}
    ambientNodes = null;
    ambientMasterGain = null;
    ambientTimers.forEach((id) => clearInterval(id));
    ambientTimers = [];
    if (ambientHtmlAudio) {
      try { ambientHtmlAudio.pause(); ambientHtmlAudio.currentTime = 0; } catch (_) {}
      ambientHtmlAudio = null;
    }
    document.querySelectorAll(".amb-btn").forEach((b) => b.classList.remove("active"));
    const btn = document.getElementById("ambientBtn");
    if (btn) btn.classList.remove("active");
    if (!silent && window.OriginsSync && OriginsSync.pushMusic) {
      const share = document.getElementById("ambShareRoom")?.checked;
      if (share) {
        try {
          OriginsSync.pushMusic({ action: "amb_stop" });
        } catch (_) {}
      }
    }
  }

  function makeLoopNoise(ctx, seconds, color) {
    // color: "white" | "pink" | "brown"
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === "brown") {
        b0 = (b0 + 0.02 * w) / 1.02;
        data[i] = b0 * 3.5;
      } else if (color === "pink") {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.296516;
        b2 = 0.99 * b2 + w * 1.0526;
        data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      } else {
        data[i] = w * 0.55;
      }
    }
    return buf;
  }

  function startAmbientSynth(kind, ctx, master) {
    const intensity = getAmbIntensity();
    ambientNodes = [];

    function startNoiseLoop(buf, filterType, freq, q, gainVal) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gainVal;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
      ambientNodes.push(src);
      return { src, f, g };
    }

    if (kind === "liman") {
      // Dalga + liman uğultusu
      const wave = makeLoopNoise(ctx, 3.2, "brown");
      startNoiseLoop(wave, "lowpass", 320 + intensity * 180, 0.65, 0.08 + intensity * 0.1);
      const splash = makeLoopNoise(ctx, 2.1, "pink");
      startNoiseLoop(splash, "bandpass", 900 + intensity * 400, 0.9, 0.035 + intensity * 0.05);
      // Uzak gemi tahtası tıkırtısı
      const interval = Math.max(1800, 4500 - intensity * 2200);
      const t = setInterval(() => {
        if (!ambientOn) return;
        try {
          const o = ctx.createOscillator();
          const gg = ctx.createGain();
          const fil = ctx.createBiquadFilter();
          fil.type = "bandpass";
          fil.frequency.value = 220 + Math.random() * 180;
          fil.Q.value = 2;
          o.type = "triangle";
          o.frequency.value = 90 + Math.random() * 40;
          gg.gain.setValueAtTime(0.0001, ctx.currentTime);
          gg.gain.exponentialRampToValueAtTime(0.025 + intensity * 0.03, ctx.currentTime + 0.04);
          gg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
          o.connect(fil); fil.connect(gg); gg.connect(master);
          o.start();
          o.stop(ctx.currentTime + 0.6);
        } catch (_) {}
      }, interval);
      ambientTimers.push(t);
    } else if (kind === "savas") {
      // Gerilim + uzak davul / metal
      const bed = makeLoopNoise(ctx, 2.5, "brown");
      startNoiseLoop(bed, "lowpass", 180 + intensity * 120, 0.8, 0.08 + intensity * 0.1);
      const clash = makeLoopNoise(ctx, 1.6, "pink");
      startNoiseLoop(clash, "bandpass", 550 + intensity * 350, 0.9, 0.012 + intensity * 0.025);
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      o1.type = "sawtooth"; o2.type = "square";
      o1.frequency.value = 48;
      o2.frequency.value = 72;
      g.gain.value = 0.008 + intensity * 0.018;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 220 + intensity * 280;
      o1.connect(filter); o2.connect(filter); filter.connect(g); g.connect(master);
      o1.start(); o2.start();
      ambientNodes.push(o1, o2);
      const interval = Math.max(500, 1400 - intensity * 800);
      const t = setInterval(() => {
        if (!ambientOn) return;
        try {
          // Davul vuruşu
          const o = ctx.createOscillator();
          const gg = ctx.createGain();
          o.type = "sine";
          o.frequency.setValueAtTime(120 + Math.random() * 40, ctx.currentTime);
          o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.28);
          gg.gain.setValueAtTime(0.0001, ctx.currentTime);
          gg.gain.exponentialRampToValueAtTime(0.07 + intensity * 0.06, ctx.currentTime + 0.01);
          gg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
          o.connect(gg); gg.connect(master);
          o.start();
          o.stop(ctx.currentTime + 0.4);
          // Kısa metal
          if (Math.random() < 0.45 + intensity * 0.3) {
            const nlen = Math.floor(ctx.sampleRate * 0.08);
            const buf = ctx.createBuffer(1, nlen, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < nlen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nlen, 2);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const fil = ctx.createBiquadFilter();
            fil.type = "highpass";
            fil.frequency.value = 2500;
            const ng = ctx.createGain();
            ng.gain.value = 0.04 + intensity * 0.04;
            src.connect(fil); fil.connect(ng); ng.connect(master);
            src.start();
          }
        } catch (_) {}
      }, interval);
      ambientTimers.push(t);
    } else if (kind === "fisilti") {
      // Rüzgar / fısıltı
      const wind = makeLoopNoise(ctx, 2.8, "pink");
      startNoiseLoop(wind, "bandpass", 1200 + intensity * 900, 0.6, 0.05 + intensity * 0.08);
      const soft = makeLoopNoise(ctx, 3.5, "brown");
      startNoiseLoop(soft, "lowpass", 260 + intensity * 100, 0.5, 0.04 + intensity * 0.05);
      const o1 = ctx.createOscillator();
      const g = ctx.createGain();
      o1.type = "sine";
      o1.frequency.value = 180 + intensity * 60;
      g.gain.value = 0.006 + intensity * 0.012;
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      lfo.frequency.value = 0.07 + intensity * 0.15;
      lfoG.gain.value = 0.004 + intensity * 0.008;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      o1.connect(g); g.connect(master);
      o1.start(); lfo.start();
      ambientNodes.push(o1, lfo);
    } else if (kind === "yagmur") {
      // Yumuşak yağmur: pembe gürültü + hafif damla (tiz cızırtı yok)
      const bed = makeLoopNoise(ctx, 3.5, "pink");
      startNoiseLoop(bed, "bandpass", 700 + intensity * 350, 0.45, 0.028 + intensity * 0.04);
      const soft = makeLoopNoise(ctx, 4.0, "brown");
      startNoiseLoop(soft, "lowpass", 320 + intensity * 120, 0.5, 0.022 + intensity * 0.03);
      // Çok hafif yüksek katman (keskin white yok)
      const air = makeLoopNoise(ctx, 2.8, "pink");
      startNoiseLoop(air, "highpass", 1400 + intensity * 400, 0.35, 0.012 + intensity * 0.018);
      // Seyrek yumuşak damlalar
      const interval = Math.max(420, 1100 - intensity * 500);
      const t = setInterval(() => {
        if (!ambientOn) return;
        try {
          const drops = 1 + Math.floor(Math.random() * 2);
          for (let i = 0; i < drops; i++) {
            const delay = Math.random() * 0.25;
            const nlen = Math.floor(ctx.sampleRate * (0.035 + Math.random() * 0.05));
            const buf = ctx.createBuffer(1, nlen, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let j = 0; j < nlen; j++) {
              const env = Math.pow(1 - j / nlen, 3.2);
              d[j] = (Math.random() * 2 - 1) * env * 0.55;
            }
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const fil = ctx.createBiquadFilter();
            fil.type = "bandpass";
            fil.frequency.value = 900 + Math.random() * 1600;
            fil.Q.value = 1.1;
            const gg = ctx.createGain();
            gg.gain.value = (0.008 + intensity * 0.014) * (0.6 + Math.random() * 0.5);
            src.connect(fil); fil.connect(gg); gg.connect(master);
            src.start(ctx.currentTime + delay);
          }
        } catch (_) {}
      }, interval);
      ambientTimers.push(t);
    }
  }

  async function startAmbient(kind, opts) {
    opts = opts || {};
    const ctx = getAudio();
    if (!ctx) return;
    stopAmbient(true);
    ambientOn = true;
    ambientKind = kind;

    const custom = loadAmbCustom();
    const dataUrl = custom[kind];

    if (dataUrl) {
      try {
        ambientHtmlAudio = new Audio(dataUrl);
        ambientHtmlAudio.loop = true;
        ambientHtmlAudio.volume = getAmbVol();
        await ambientHtmlAudio.play();
      } catch (e) {
        console.warn("amb custom", e);
        // fallback synth
        ambientMasterGain = ctx.createGain();
        ambientMasterGain.gain.value = getAmbVol() * 0.5;
        ambientMasterGain.connect(ctx.destination);
        startAmbientSynth(kind, ctx, ambientMasterGain);
      }
    } else {
      ambientMasterGain = ctx.createGain();
      ambientMasterGain.gain.value = getAmbVol() * 0.5;
      ambientMasterGain.connect(ctx.destination);
      startAmbientSynth(kind, ctx, ambientMasterGain);
    }

    document.querySelectorAll(".amb-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.amb === kind);
    });
    const btn = document.getElementById("ambientBtn");
    if (btn) btn.classList.add("active");
    if (!opts.remote) {
      chatAdd("♫ Ambiyans: " + kind + (dataUrl ? " (özel)" : ""), "sys");
      const share = document.getElementById("ambShareRoom")?.checked;
      if (share && window.OriginsSync && OriginsSync.pushMusic) {
        try {
          // özel dosya büyükse gönderme — sadece kind (sentez herkeste aynı)
          const sendUrl = dataUrl && dataUrl.length < 900000 ? dataUrl : null;
          if (dataUrl && !sendUrl) {
            chatAdd("Özel ambıyans dosyası büyük — odada sentez/kind paylaşılıyor", "sys");
          }
          OriginsSync.pushMusic({
            action: "amb_play",
            kind: kind,
            dataUrl: sendUrl,
            vol: getAmbVol(),
            intensity: getAmbIntensity(),
          });
        } catch (_) {}
      } else if (!opts.remote) {
        chatAdd("Oda yok veya paylaş kapalı — ambıyans sadece sende", "sys");
      }
    }
  }

  document.querySelectorAll(".amb-btn").forEach((b) => {
    b.addEventListener("click", () => startAmbient(b.dataset.amb));
  });
  document.getElementById("ambStop")?.addEventListener("click", () => {
    stopAmbient(false);
    chatAdd("♫ Ambiyans durdu", "sys");
  });
  document.getElementById("ambVolume")?.addEventListener("input", (e) => {
    /* local volume — herkes */
    try { localStorage.setItem("origins_amb_vol", e.target.value); } catch (_) {}
    applyAmbVol();
  });
  document.getElementById("ambIntensity")?.addEventListener("change", () => {
    // restart current with new intensity
    if (ambientOn && ambientKind) startAmbient(ambientKind);
  });
  document.querySelectorAll("[data-amb-file]").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const kind = inp.getAttribute("data-amb-file");
      const file = e.target.files && e.target.files[0];
      if (!file || !kind) return;
      if (file.size > 2e6) alert("2MB altı loop önerilir");
      const reader = new FileReader();
      reader.onload = () => {
        const map = loadAmbCustom();
        map[kind] = reader.result;
        saveAmbCustom(map);
        chatAdd("♫ " + kind + " özel loop yüklendi", "sys");
        if (ambientOn && ambientKind === kind) startAmbient(kind);
      };
      reader.readAsDataURL(file);
    });
  });
  document.getElementById("ambClearCustom")?.addEventListener("click", () => {
    saveAmbCustom({});
    document.querySelectorAll("[data-amb-file]").forEach((inp) => { inp.value = ""; });
    chatAdd("♫ Özel ambıyanslar silindi", "sys");
  });
  // amb volume: herkes yerel kısabilir
  document.getElementById("ambVolume")?.addEventListener("change", (e) => {
    try { localStorage.setItem("origins_amb_vol", e.target.value); } catch (_) {}
    applyAmbVol();
  });
  // restore volume slider
  try {
    const v = localStorage.getItem("origins_amb_vol");
    const el = document.getElementById("ambVolume");
    if (v != null && el) el.value = v;
  } catch (_) {}

  document.getElementById("ambientBtn")?.addEventListener("click", () => {
    if (ambientOn) stopAmbient(false);
    else startAmbient("liman");
  });



  // Session export
  document.getElementById("exportSession")?.addEventListener("click", () => {
    const chat = load("origins_chat_v1", []);
    const lines = [];
    lines.push("ORIGINS — Oturum özeti");
    lines.push(new Date().toLocaleString("tr-TR"));
    lines.push("");
    lines.push("=== Tokenlar ===");
    tokens.forEach((tk) => {
      lines.push(`${tk.name} | HP ${tk.hp}/${tk.hpMax} | AC ${tk.ac ?? "?"} | (${tk.cx},${tk.cy})${tk.enemy ? " [düşman]" : ""}${tk.hidden ? " [gizli]" : ""}`);
    });
    lines.push("");
    lines.push("=== İnisiyatif ===");
    initiative.forEach((r, i) => lines.push(`${i + 1}. ${r.name} (${r.score})`));
    lines.push("");
    lines.push("=== Sohbet / zar log ===");
    chat.slice(0, 80).forEach((c) => lines.push(`[${c.t || ""}] ${String(c.text || "").replace(/<[^>]+>/g, "")}`));
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "origins-oturum.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  });


  // Ready button
  document.getElementById("turnReadyBtn")?.addEventListener("click", () => {
    if (window.OriginsSync) {
      try {
        OriginsSync.setDisplayName(currentDisplayName());
        OriginsSync.sendPresence(true);
      } catch (_) {}
    }
    if (!initiative.length) {
      chatAdd("Savaş yok — önce Savaş başlat", "sys");
      return;
    }
    if (!isDm()) {
      const cur = initiative[turnIdx];
      const tok = cur && tokens.find((x) => x.id === cur.id);
      if (!tok || !canControlToken(tok)) {
        alert("Sıra sende değil. Sadece kendi turunda geçebilirsin.");
        return;
      }
    }
    chatAdd("<strong>" + esc(currentDisplayName()) + "</strong> turunu bitirdi → sıra ilerliyor", "sys");
    void processTurnStart();
  });

  // Whisper in sendChat


  // ── Atmosphere: day / night / blood moon (DM only) ──
  let worldTime = "day"; // "day" | "night"
  let bloodMoon = false;
  const NIGHT_VISION_FT = 60;

  function isNightVision() {
    return worldTime === "night" || bloodMoon;
  }

  function applyAtmosphere(silent) {
    const boardEl = document.getElementById("vttBoard");
    const badge = document.getElementById("atmBadge");
    if (boardEl) {
      boardEl.classList.toggle("atm-night", worldTime === "night" || bloodMoon);
      boardEl.classList.toggle("atm-blood", !!bloodMoon);
    }
    if (badge) {
      // Kanlı Ay'da rozet yok; sadece sade gece bilgisi
      if (!bloodMoon && worldTime === "night") {
        badge.style.display = "";
        badge.textContent = "Gece · 60 ft";
      } else {
        badge.style.display = "none";
        badge.textContent = "";
      }
    }
    document.getElementById("btnDay")?.classList.toggle("atm-on", worldTime === "day" && !bloodMoon);
    document.getElementById("btnNight")?.classList.toggle("atm-on", worldTime === "night" && !bloodMoon);
    document.getElementById("btnBloodMoon")?.classList.toggle("atm-blood-on", !!bloodMoon);
    try { scheduleVision(); } catch (_) {}
    try { renderTokens(); } catch (_) {}
    if (!silent) {
      try {
        if (bloodMoon) chatAdd("🔴 Kanlı Ay yükseldi…", "sys");
        else if (worldTime === "night") chatAdd("🌙 Gece — oyuncular 60 feet görür", "sys");
        else chatAdd("☀ Gündüz", "sys");
      } catch (_) {}
    }
  }

  function setWorldTime(mode) {
    if (!isDm()) return alert("Sadece DM gece/gündüz değiştirebilir.");
    worldTime = mode === "night" ? "night" : "day";
    if (mode === "day") bloodMoon = false;
    applyAtmosphere(false);
    try { scheduleSync(); } catch (_) {}
  }

  function toggleBloodMoon() {
    if (!isDm()) return alert("Sadece DM Kanlı Ay’ı açıp kapatabilir.");
    bloodMoon = !bloodMoon;
    if (bloodMoon) worldTime = "night";
    applyAtmosphere(false);
    try { scheduleSync(); } catch (_) {}
  }

  document.getElementById("btnDay")?.addEventListener("click", () => setWorldTime("day"));
  document.getElementById("btnNight")?.addEventListener("click", () => setWorldTime("night"));
  document.getElementById("btnBloodMoon")?.addEventListener("click", () => toggleBloodMoon());

  // ── Fog + darkness + walls + vision (world-space, realtime) ──
  const fogCanvas = document.getElementById("vttFog");
  const fogCtx = fogCanvas ? fogCanvas.getContext("2d") : null;
  let fogRects = load("origins_fog_rects", []) || [];
  let darknessRects = load("origins_dark_rects", []) || [];
  let walls = load("origins_walls", []) || [];
  let doors = load("origins_doors", []) || [];
  let mapDrawMode = null;
  let mapDrawDrag = null;
  let _visionRaf = 0;

  function persistVision() {
    try {
      save("origins_fog_rects", fogRects);
      save("origins_dark_rects", darknessRects);
      save("origins_walls", walls);
      save("origins_doors", doors);
    } catch (_) {}
  }

  function blockingSegs() {
    const segs = [];
    function addSeg(x1, y1, x2, y2, kind, id) {
      x1 = +x1; y1 = +y1; x2 = +x2; y2 = +y2;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (!(len > 1)) return;
      // uçları 0.5px uzat — bitişik duvar aralığını kapat
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      segs.push({
        x1: x1 - ux * 0.5,
        y1: y1 - uy * 0.5,
        x2: x2 + ux * 0.5,
        y2: y2 + uy * 0.5,
        kind: kind,
        id: id,
      });
    }
    (walls || []).forEach((w) => {
      if (w) addSeg(w.x1, w.y1, w.x2, w.y2, "wall");
    });
    (doors || []).forEach((d) => {
      if (d && !d.open) addSeg(d.x1, d.y1, d.x2, d.y2, "door", d.id);
    });
    return segs;
  }

  function feetToWorld(ft) {
    return (Math.max(0, +ft || 0) / FEET) * CELL;
  }
  function tokenWorldPos(tk) {
    return { x: tk.cx * CELL + CELL / 2, y: tk.cy * CELL + CELL / 2 };
  }
  function pointInRect(px, py, r) {
    return px >= r.x && py >= r.y && px <= r.x + r.w && py <= r.y + r.h;
  }
  function inDarkness(wx, wy) {
    return darknessRects.some((r) => pointInRect(wx, wy, r));
  }
  function inFog(wx, wy) {
    return fogRects.some((r) => pointInRect(wx, wy, r));
  }

  function segIntersect(a, b, c, d) {
    const ax = a.x, ay = a.y, bx = b.x, by = b.y;
    const cx = c.x, cy = c.y, dx = d.x, dy = d.y;
    const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(den) < 1e-12) return null;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
    const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { t: t, x: ax + t * (bx - ax), y: ay + t * (by - ay) };
  }

  function crossesWall(x0, y0, x1, y1) {
    const segs = blockingSegs();
    if (!segs.length) return false;
    const a = { x: x0, y: y0 }, b = { x: x1, y: y1 };
    return segs.some((w) => !!segIntersect(a, b, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }));
  }

  /** Bir açı yönünde en yakın engel mesafesi */
  function rayDist(ox, oy, angle, maxDist, segs) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const end = { x: ox + dx * maxDist, y: oy + dy * maxDist };
    const origin = { x: ox, y: oy };
    let best = maxDist;
    for (let i = 0; i < segs.length; i++) {
      const w = segs[i];
      const hit = segIntersect(origin, end, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      if (hit) {
        const dist = hit.t * maxDist;
        if (dist < best) best = dist;
      }
    }
    return best;
  }

  /**
   * Sızıntısız LOS:
   * Komşu iki ışının mesafesinin MIN’i ile üçgen çiz.
   * Böylece bir ışın kısa (duvar) diğer uzun olsa bile üçgen duvarın arkasına girmez.
   */
  function revealLos(ctx, ox, oy, maxDist) {
    if (maxDist <= 0) return;
    const segs = blockingSegs();
    const N = 720; // 0.5° adım
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";

    if (!segs.length) {
      ctx.beginPath();
      ctx.arc(ox, oy, maxDist, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // mesafeleri önceden hesapla
    const dists = new Array(N);
    for (let i = 0; i < N; i++) {
      dists[i] = rayDist(ox, oy, (i / N) * Math.PI * 2, maxDist, segs);
    }

    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const d = Math.min(dists[i], dists[j]);
      if (d < 0.75) continue;
      const a0 = (i / N) * Math.PI * 2;
      const a1 = (j / N) * Math.PI * 2;
      // muhafazakâr: her iki uç da min mesafe
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(a0) * d, oy + Math.sin(a0) * d);
      ctx.lineTo(ox + Math.cos(a1) * d, oy + Math.sin(a1) * d);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // eski isim uyumu
  function revealWithWallShadows(ctx, ox, oy, maxDist) {
    revealLos(ctx, ox, oy, maxDist);
  }
  function paintWallShadowsOnly(ctx, ox, oy, maxDist) {
    // Soft reveal sonrası: yeniden siyah boya + LOS aç
    // (sadece gölge basmak yerine tam LOS yeniden — tutarlı)
    // Bu fonksiyon softReveal içinde çağrılıyor: önce karanlık açıldı,
    // şimdi duvar arkası tekrar kapanmalı → viewport’ta siyah gölge değil,
    // LOS dışı bölgeleri source-over siyah yapamayız çünkü tüm map’i bozar.
    // Bunun yerine: soft reveal’ı LOS ile clip’leyerek yapıyoruz (aşağıda).
  }

  function visibilityPoly(ox, oy, maxDist) {
    const segs = blockingSegs();
    const N = 128;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const d = rayDist(ox, oy, a, maxDist, segs);
      pts.push({ x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d });
    }
    return pts;
  }

  function pathBlocked(cx0, cy0, cx1, cy1) {
    if (cx0 === cx1 && cy0 === cy1) return false;
    // step one cell at a time so diagonal jumps still check walls
    let x = cx0, y = cy0;
    const dx = Math.sign(cx1 - cx0);
    const dy = Math.sign(cy1 - cy0);
    const n = Math.max(Math.abs(cx1 - cx0), Math.abs(cy1 - cy0));
    for (let i = 0; i < n; i++) {
      const nx = x + (x !== cx1 ? dx : 0);
      const ny = y + (y !== cy1 ? dy : 0);
      const x0 = x * CELL + CELL / 2, y0 = y * CELL + CELL / 2;
      // if both axes change, require at least one orthogonal step free
      if (nx !== x && ny !== y) {
        const hBlock = crossesWall(x0, y0, nx * CELL + CELL / 2, y0);
        const vBlock = crossesWall(x0, y0, x0, ny * CELL + CELL / 2);
        if (hBlock && vBlock) return true;
        if (!hBlock && crossesWall(nx * CELL + CELL / 2, y0, nx * CELL + CELL / 2, ny * CELL + CELL / 2)) return true;
        if (!vBlock && crossesWall(x0, ny * CELL + CELL / 2, nx * CELL + CELL / 2, ny * CELL + CELL / 2)) return true;
        if (hBlock && vBlock) return true;
      } else {
        if (crossesWall(x0, y0, nx * CELL + CELL / 2, ny * CELL + CELL / 2)) return true;
      }
      x = nx; y = ny;
    }
    return false;
  }

  function sizeFog() {
    if (!fogCanvas || !board) return;
    const w = board.clientWidth || 800;
    const h = board.clientHeight || 600;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fogCanvas.width = Math.floor(w * dpr);
    fogCanvas.height = Math.floor(h * dpr);
    fogCanvas.style.width = w + "px";
    fogCanvas.style.height = h + "px";
    if (fogCtx) fogCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redrawVision();
  }

  /** Kapı çizgisi — herkese sarı (duvardan farklı) */
  function drawDoorStroke(ctx, d, sc) {
    if (!d) return;
    const open = !!d.open;
    ctx.save();
    ctx.strokeStyle = open ? "#f0d060" : "#d4af37";
    ctx.lineWidth = 5 / (sc || 1);
    ctx.lineCap = "round";
    ctx.setLineDash(open ? [8 / (sc || 1), 6 / (sc || 1)] : []);
    // dış parıltı
    ctx.shadowColor = "rgba(212, 175, 55, 0.65)";
    ctx.shadowBlur = 6 / (sc || 1);
    ctx.beginPath();
    ctx.moveTo(d.x1, d.y1);
    ctx.lineTo(d.x2, d.y2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    ctx.restore();
  }

  function redrawVision() {
    if (!fogCtx || !fogCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fogCtx.setTransform(1, 0, 0, 1, 0, 0);
    fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
    fogCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const dm = isDm();
    fogCanvas.style.display = "block";
    fogCanvas.style.pointerEvents = mapDrawMode && dm ? "auto" : "none";
    fogCanvas.classList.toggle("paint", !!(mapDrawMode && dm));

    fogCtx.save();
    fogCtx.translate(panX, panY);
    fogCtx.scale(scale, scale);

    function withPreview(list, modes) {
      const out = list.slice();
      if (mapDrawDrag && modes.includes(mapDrawMode)) {
        out.push({
          x: Math.min(mapDrawDrag.x0, mapDrawDrag.x1),
          y: Math.min(mapDrawDrag.y0, mapDrawDrag.y1),
          w: Math.abs(mapDrawDrag.x1 - mapDrawDrag.x0),
          h: Math.abs(mapDrawDrag.y1 - mapDrawDrag.y0),
          preview: true,
        });
      }
      return out;
    }

    const fogList = withPreview(fogRects, ["fog", "fogErase"]);
    const darkList = withPreview(darknessRects, ["dark", "darkErase"]);

    if (dm) {
      fogList.forEach((r) => {
        if (r.w < 1 || r.h < 1) return;
        fogCtx.fillStyle = r.preview ? "rgba(30,30,40,0.15)" : "rgba(0,0,0,0.2)";
        fogCtx.fillRect(r.x, r.y, r.w, r.h);
        fogCtx.strokeStyle = r.preview ? "rgba(180,180,200,0.9)" : "rgba(140,140,160,0.8)";
        fogCtx.lineWidth = 2 / scale;
        fogCtx.setLineDash(r.preview ? [5 / scale, 4 / scale] : []);
        fogCtx.strokeRect(r.x, r.y, r.w, r.h);
        fogCtx.setLineDash([]);
      });
      darkList.forEach((r) => {
        if (r.w < 1 || r.h < 1) return;
        fogCtx.fillStyle = r.preview ? "rgba(40,20,60,0.22)" : "rgba(20,0,40,0.32)";
        fogCtx.fillRect(r.x, r.y, r.w, r.h);
        fogCtx.strokeStyle = r.preview ? "rgba(155,126,220,0.95)" : "rgba(120,90,180,0.85)";
        fogCtx.lineWidth = 2 / scale;
        fogCtx.setLineDash(r.preview ? [6 / scale, 4 / scale] : []);
        fogCtx.strokeRect(r.x, r.y, r.w, r.h);
        fogCtx.setLineDash([]);
      });
      walls.forEach((w) => {
        fogCtx.strokeStyle = "rgba(160, 160, 170, 0.9)";
        fogCtx.lineWidth = 3 / scale;
        fogCtx.setLineDash([6 / scale, 4 / scale]);
        fogCtx.beginPath();
        fogCtx.moveTo(w.x1, w.y1);
        fogCtx.lineTo(w.x2, w.y2);
        fogCtx.stroke();
        fogCtx.setLineDash([]);
      });
      (doors || []).forEach((d) => drawDoorStroke(fogCtx, d, scale));
      if (mapDrawDrag && (mapDrawMode === "wall" || mapDrawMode === "door")) {
        fogCtx.strokeStyle = mapDrawMode === "door" ? "#d4af37" : "#d4af37";
        fogCtx.lineWidth = 3 / scale;
        fogCtx.setLineDash([4 / scale, 4 / scale]);
        fogCtx.beginPath();
        fogCtx.moveTo(mapDrawDrag.x0, mapDrawDrag.y0);
        fogCtx.lineTo(mapDrawDrag.x1, mapDrawDrag.y1);
        fogCtx.stroke();
        fogCtx.setLineDash([]);
      }
    } else {
      // PLAYERS — sade ve stabil görüş
      const hasDark = darknessRects.length > 0;
      const hasBlockers = blockingSegs().length > 0;
      const viewers = tokens.filter((tk) => canControlToken(tk));
      const bw = board.clientWidth || 800;
      const bh = board.clientHeight || 600;
      const viewX0 = -panX / scale - CELL * 8;
      const viewY0 = -panY / scale - CELL * 8;
      const viewW = bw / scale + CELL * 16;
      const viewH = bh / scale + CELL * 16;

      function losRadius(tk) {
        if (isNightVision()) {
          // Gece / Kanlı Ay: maksimum 60 feet
          if (tk.lightOn) return feetToWorld(Math.min(NIGHT_VISION_FT, Math.max(+(tk.lightFt || 30), 30)));
          return feetToWorld(NIGHT_VISION_FT);
        }
        if (tk.lightOn) return feetToWorld(Math.max(+(tk.lightFt || 30), 60));
        return feetToWorld(400);
      }
      function darkRadius(tk) {
        if (isNightVision()) {
          if (tk.lightOn) return feetToWorld(Math.min(NIGHT_VISION_FT, +(tk.lightFt != null ? tk.lightFt : 30)));
          return feetToWorld(NIGHT_VISION_FT);
        }
        if (tk.lightOn) return feetToWorld(+(tk.lightFt != null ? tk.lightFt : 30));
        return feetToWorld(+(tk.visionFt != null ? tk.visionFt : 25));
      }

      function paintDarkRect(r) {
        if (r.preview || r.w < 1 || r.h < 1) return;
        if (r.style === "mist") {
          fogCtx.fillStyle = "rgba(150, 155, 165, 0.78)";
          fogCtx.fillRect(r.x, r.y, r.w, r.h);
          fogCtx.save();
          fogCtx.globalCompositeOperation = "destination-out";
          let seed = (Math.abs(r.x * 12.9898 + r.y * 78.233) % 1000) / 1000;
          function rnd() { seed = (seed * 16807 + 0.1) % 1; return seed; }
          const n = Math.max(30, Math.floor((r.w * r.h) / 10000));
          for (let i = 0; i < n; i++) {
            const hx = r.x + rnd() * r.w, hy = r.y + rnd() * r.h, hr = 2 + rnd() * 6;
            fogCtx.beginPath();
            fogCtx.arc(hx, hy, hr, 0, Math.PI * 2);
            fogCtx.fillStyle = "rgba(0,0,0," + (0.4 + rnd() * 0.5) + ")";
            fogCtx.fill();
          }
          fogCtx.restore();
        } else if (r.style === "moon") {
          fogCtx.fillStyle = "rgba(12, 16, 32, 0.58)";
          fogCtx.fillRect(r.x, r.y, r.w, r.h);
        } else {
          fogCtx.fillStyle = "#000";
          fogCtx.fillRect(r.x, r.y, r.w, r.h);
        }
      }

      function softRevealDark(tk) {
        const pos = tokenWorldPos(tk);
        const R = darkRadius(tk);
        if (R <= 0) return;
        let maxAlpha = 1;
        let moon = false, mist = false;
        darkList.forEach((r) => {
          if (r.style === "moon") moon = true;
          if (r.style === "mist") mist = true;
        });
        if (moon && !mist) maxAlpha = 0.38;
        else if (mist) maxAlpha = 0.55;

        // Duvar varsa: sadece LOS kamaları içinde soft aç (sızıntı yok)
        fogCtx.save();
        if (hasBlockers) {
          const segs = blockingSegs();
          const N = 360;
          const dists = [];
          for (let i = 0; i < N; i++) {
            dists.push(rayDist(pos.x, pos.y, (i / N) * Math.PI * 2, R, segs));
          }
          fogCtx.beginPath();
          fogCtx.moveTo(pos.x, pos.y);
          let any = false;
          for (let i = 0; i < N; i++) {
            const j = (i + 1) % N;
            const d = Math.min(dists[i], dists[j]);
            if (d < 0.75) continue;
            const a0 = (i / N) * Math.PI * 2;
            // path: fan of conservative points
            fogCtx.lineTo(pos.x + Math.cos(a0) * d, pos.y + Math.sin(a0) * d);
            any = true;
          }
          if (!any) {
            fogCtx.restore();
            return;
          }
          fogCtx.closePath();
          fogCtx.clip();
        }
        fogCtx.globalCompositeOperation = "destination-out";
        const g = fogCtx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, R);
        g.addColorStop(0, "rgba(0,0,0," + maxAlpha + ")");
        g.addColorStop(0.45, "rgba(0,0,0," + (maxAlpha * 0.55) + ")");
        g.addColorStop(1, "rgba(0,0,0,0)");
        fogCtx.fillStyle = g;
        fogCtx.beginPath();
        fogCtx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
        fogCtx.fill();
        fogCtx.restore();
      }

      // 1) Kalıcı fog
      fogList.forEach((r) => {
        if (r.preview || r.w < 1 || r.h < 1) return;
        fogCtx.fillStyle = "#000";
        fogCtx.fillRect(r.x, r.y, r.w, r.h);
      });

      // 1b) Gece / Kanlı Ay — tüm harita karanlık, 60 ft soft görüş
      if (isNightVision()) {
        fogCtx.globalCompositeOperation = "source-over";
        fogCtx.fillStyle = bloodMoon ? "rgba(10, 2, 4, 0.9)" : "rgba(2, 4, 12, 0.94)";
        fogCtx.fillRect(viewX0, viewY0, viewW, viewH);
        if (viewers.length) {
          viewers.forEach((tk) => {
            const pos = tokenWorldPos(tk);
            const R = losRadius(tk);
            fogCtx.save();
            fogCtx.globalCompositeOperation = "destination-out";
            const g = fogCtx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, R);
            g.addColorStop(0, "rgba(0,0,0,1)");
            g.addColorStop(0.55, "rgba(0,0,0,0.75)");
            g.addColorStop(0.85, "rgba(0,0,0,0.25)");
            g.addColorStop(1, "rgba(0,0,0,0)");
            fogCtx.fillStyle = g;
            fogCtx.beginPath();
            fogCtx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
            fogCtx.fill();
            fogCtx.restore();
          });
        }
      }

      // 2) Duvar / kapalı kapı LOS
      if (hasBlockers && viewers.length) {
        fogCtx.globalCompositeOperation = "source-over";
        fogCtx.fillStyle = "#000";
        fogCtx.fillRect(viewX0, viewY0, viewW, viewH);
        viewers.forEach((tk) => {
          const pos = tokenWorldPos(tk);
          revealLos(fogCtx, pos.x, pos.y, losRadius(tk));
        });
      }

      // 3) Karanlık / sis / dolunay (manuel bölgeler)
      if (hasDark) {
        fogCtx.globalCompositeOperation = "source-over";
        darkList.forEach((r) => paintDarkRect(r));
        if (viewers.length) {
          viewers.forEach((tk) => softRevealDark(tk));
        }
      }

      // 4) Fog üstte
      fogCtx.globalCompositeOperation = "source-over";
      fogList.forEach((r) => {
        if (r.preview || r.w < 1 || r.h < 1) return;
        fogCtx.fillStyle = "#000";
        fogCtx.fillRect(r.x, r.y, r.w, r.h);
      });

      // 5) Kapılar oyuncuya SARI görünsün (duvar değil — açılabilir)
      fogCtx.globalCompositeOperation = "source-over";
      (doors || []).forEach((d) => drawDoorStroke(fogCtx, d, scale));
    }

    fogCtx.restore();
  }

  /** Schedule vision refresh next frame (realtime, cheap) */

  function doorMid(d) {
    return { x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 };
  }

  function doorReachFt() {
    return feetToWorld(5);
  }

  /** Bu kapıya 5 ft içinde kontrol edilen token var mı? */
  function canToggleDoor(d, preferTok) {
    if (!d) return false;
    const mid = doorMid(d);
    const reach = doorReachFt();
    if (preferTok) {
      const p = tokenWorldPos(preferTok);
      return Math.hypot(p.x - mid.x, p.y - mid.y) <= reach;
    }
    // Seçili token öncelikli
    if (selectedId) {
      const sel = tokens.find((x) => x.id === selectedId);
      if (sel && (canControlToken(sel) || isDm())) {
        const p = tokenWorldPos(sel);
        if (Math.hypot(p.x - mid.x, p.y - mid.y) <= reach) return true;
      }
    }
    return tokens.some((tk) => {
      if (!canControlToken(tk) && !isDm()) return false;
      if (isDm() && !canControlToken(tk) && tk.enemy) return false; // DM de token ile ölçsün
      const p = tokenWorldPos(tk);
      return Math.hypot(p.x - mid.x, p.y - mid.y) <= reach;
    });
  }

  function toggleDoor(id, preferTok) {
    const d = doors.find((x) => x.id === id);
    if (!d) return;
    // Sadece BU kapı; 5 ft şart (DM dahil — token yakın olmalı)
    if (!canToggleDoor(d, preferTok)) {
      alert("Bu kapıya 5 feet yaklaş. Sadece yakındaki kapı açılır.");
      return;
    }
    d.open = !d.open;
    persistVision();
    renderDoors();
    scheduleVision();
    scheduleSync();
    chatAdd((d.open ? "Kapı açıldı" : "Kapı kapandı") + ": " + (preferTok && preferTok.name ? preferTok.name : ""), "sys");
  }

  function renderDoors() {
    const layer = document.getElementById("doorLayer");
    if (!layer) return;
    layer.innerHTML = "";
    (doors || []).forEach((d) => {
      const mid = doorMid(d);
      const el = document.createElement("div");
      el.className = "door-icon" + (d.open ? " open" : "");
      el.dataset.doorId = d.id;
      el.title = d.open ? "Kapı açık — tıkla kapat" : "Kapı kapalı — tıkla aç";
      el.innerHTML = (d.open ? "🚪" : "🚪") + '<span class="door-label">' + (d.open ? "Açık" : "Kapı") + "</span>";
      el.style.left = (mid.x * scale + panX) + "px";
      el.style.top = (mid.y * scale + panY) + "px";
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isDm() && mapDrawMode === "doorErase") {
          doors = (doors || []).filter((x) => x.id !== d.id);
          persistVision();
          renderDoors();
          scheduleSync();
          return;
        }
        const sel = tokens.find((x) => x.id === selectedId);
        toggleDoor(d.id, sel || null);
      });
      // Sağ tık: DM tek kapı sil
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDm()) return;
        if (!confirm("Bu kapı silinsin mi?")) return;
        doors = (doors || []).filter((x) => x.id !== d.id);
        persistVision();
        renderDoors();
        scheduleSync();
      });
      layer.appendChild(el);
    });
  }

  function scheduleVision() {
    if (_visionRaf) return;
    _visionRaf = requestAnimationFrame(() => {
      _visionRaf = 0;
      try { redrawVision(); } catch (_) {}
      try { renderDoors(); } catch (_) {}
    });
  }
  window.__originsScheduleVision = scheduleVision;
  window.__originsRedrawVision = redrawVision;
  window.__originsPathBlocked = pathBlocked;
  window.__originsCrossesWall = crossesWall;

  function setMapDrawMode(mode) {
    if (mode && !isDm()) return;
    mapDrawMode = mode;
    const ids = {
      fogDraw: "fog", fogErase: "fogErase",
      darkDraw: "dark", darkErase: "darkErase",
      wallDraw: "wall", wallErase: "wallErase",
      doorDraw: "door",
    };
    Object.keys(ids).forEach((id) => {
      document.getElementById(id)?.classList.toggle("active", mapDrawMode === ids[id]);
    });
    scheduleVision();
  }

  document.getElementById("fogDraw")?.addEventListener("click", () => {
    if (!isDm()) return alert("Sadece DM");
    setMapDrawMode(mapDrawMode === "fog" ? null : "fog");
  });
  document.getElementById("fogErase")?.addEventListener("click", () => {
    if (!isDm()) return;
    setMapDrawMode(mapDrawMode === "fogErase" ? null : "fogErase");
  });
  document.getElementById("fogClear")?.addEventListener("click", () => {
    if (!isDm()) return;
    fogRects = [];
    persistVision();
    scheduleVision();
    scheduleSync();
  });
  document.getElementById("darkDraw")?.addEventListener("click", () => {
    if (!isDm()) return alert("Sadece DM");
    setMapDrawMode(mapDrawMode === "dark" ? null : "dark");
  });
  document.getElementById("darkErase")?.addEventListener("click", () => {
    if (!isDm()) return;
    setMapDrawMode(mapDrawMode === "darkErase" ? null : "darkErase");
  });
  document.getElementById("darkClear")?.addEventListener("click", () => {
    if (!isDm()) return;
    darknessRects = [];
    persistVision();
    scheduleVision();
    scheduleSync();
  });
  document.getElementById("wallDraw")?.addEventListener("click", () => {
    if (!isDm()) return;
    setMapDrawMode(mapDrawMode === "wall" ? null : "wall");
  });
  document.getElementById("wallErase")?.addEventListener("click", () => {
    if (!isDm()) return;
    setMapDrawMode(mapDrawMode === "wallErase" ? null : "wallErase");
  });
  document.getElementById("wallClear")?.addEventListener("click", () => {
    if (!isDm()) return;
    if (!confirm("Tüm duvarlar silinsin mi?")) return;
    walls = [];
    persistVision();
    scheduleVision();
    scheduleSync();
  });
  document.getElementById("doorDraw")?.addEventListener("click", () => {
    if (!isDm()) return alert("Sadece DM");
    setMapDrawMode(mapDrawMode === "door" ? null : "door");
  });
  document.getElementById("doorErase")?.addEventListener("click", () => {
    if (!isDm()) return alert("Sadece DM");
    setMapDrawMode(mapDrawMode === "doorErase" ? null : "doorErase");
  });
  document.getElementById("doorClear")?.addEventListener("click", () => {
    if (!isDm()) return;
    if (!confirm("Tüm kapılar silinsin mi?")) return;
    doors = [];
    persistVision();
    renderDoors();
    scheduleVision();
    scheduleSync();
  });

  if (fogCanvas) {
    fogCanvas.addEventListener("contextmenu", (e) => e.preventDefault());
    fogCanvas.addEventListener("pointerdown", (e) => {
      if (!isDm()) return;
      if (e.button === 2) {
        e.preventDefault();
        drag = { type: "pan", ox: e.clientX, oy: e.clientY, spx: panX, spy: panY };
        board.classList.add("dragging");
        return;
      }
      if (!mapDrawMode || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const w = worldFromClient(e.clientX, e.clientY);
      mapDrawDrag = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
      try { fogCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      scheduleVision();
    });
    fogCanvas.addEventListener("pointermove", (e) => {
      if (!mapDrawDrag) return;
      const w = worldFromClient(e.clientX, e.clientY);
      mapDrawDrag.x1 = w.x;
      mapDrawDrag.y1 = w.y;
      scheduleVision();
    });
    fogCanvas.addEventListener("pointerup", (e) => {
      if (!mapDrawDrag) return;
      const w = worldFromClient(e.clientX, e.clientY);
      const x0 = mapDrawDrag.x0, y0 = mapDrawDrag.y0;
      const x1 = w.x, y1 = w.y;
      const mode = mapDrawMode;
      mapDrawDrag = null;
      if (mode === "wall") {
        if (Math.hypot(x1 - x0, y1 - y0) >= 8) {
          walls.push({ x1: x0, y1: y0, x2: x1, y2: y1 });
          persistVision();
          scheduleSync();
        }
      } else if (mode === "door") {
        if (Math.hypot(x1 - x0, y1 - y0) >= 8) {
          doors.push({
            id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            x1: x0, y1: y0, x2: x1, y2: y1,
            open: false,
          });
          persistVision();
          renderDoors();
          scheduleSync();
        }
      } else if (mode === "wallErase") {
        // Click or small drag: remove walls that intersect selection (or near click)
        const rect = {
          x: Math.min(x0, x1) - 4, y: Math.min(y0, y1) - 4,
          w: Math.max(8, Math.abs(x1 - x0)) + 8,
          h: Math.max(8, Math.abs(y1 - y0)) + 8,
        };
        function wallHitsRect(w, r) {
          // segment vs AABB
          if (segIntersect(
            { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 },
            { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }
          )) return true;
          if (segIntersect(
            { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 },
            { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }
          )) return true;
          if (segIntersect(
            { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 },
            { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }
          )) return true;
          if (segIntersect(
            { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 },
            { x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }
          )) return true;
          // endpoints inside
          if (w.x1 >= r.x && w.x1 <= r.x + r.w && w.y1 >= r.y && w.y1 <= r.y + r.h) return true;
          if (w.x2 >= r.x && w.x2 <= r.x + r.w && w.y2 >= r.y && w.y2 <= r.y + r.h) return true;
          return false;
        }
        const before = walls.length;
        // If tiny click, delete nearest wall only
        if (Math.hypot(x1 - x0, y1 - y0) < 12) {
          let best = -1, bestD = 40;
          walls.forEach((w, i) => {
            const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
            const d = Math.hypot(mx - x0, my - y0);
            if (d < bestD) { bestD = d; best = i; }
          });
          if (best >= 0) walls.splice(best, 1);
        } else {
          walls = walls.filter((w) => !wallHitsRect(w, rect));
        }
        if (walls.length !== before) {
          persistVision();
          scheduleSync();
        }
      } else if (mode === "doorErase") {
        if (Math.hypot(x1 - x0, y1 - y0) < 40) {
          let best = -1, bestD = 50;
          (doors || []).forEach((d, i) => {
            const mx = (d.x1 + d.x2) / 2, my = (d.y1 + d.y2) / 2;
            const dist = Math.hypot(mx - x0, my - y0);
            if (dist < bestD) { bestD = dist; best = i; }
          });
          if (best >= 0) {
            doors.splice(best, 1);
            persistVision();
            renderDoors();
            scheduleSync();
          }
        }

      } else {
        const rect = {
          x: Math.min(x0, x1), y: Math.min(y0, y1),
          w: Math.abs(x1 - x0), h: Math.abs(y1 - y0),
        };
        function rectsOverlap(a, b) {
          return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
        }
        if (rect.w >= 8 && rect.h >= 8) {
          if (mode === "fog") fogRects.push(rect);
          else if (mode === "fogErase") {
            // KEEP only non-overlapping (delete selected)
            fogRects = fogRects.filter((r) => !rectsOverlap(r, rect));
          } else if (mode === "dark") darknessRects.push(rect);
          else if (mode === "darkErase") {
            darknessRects = darknessRects.filter((r) => !rectsOverlap(r, rect));
          }
          persistVision();
          scheduleSync();
        }
      }
      scheduleVision();
    });
    fogCanvas.addEventListener("pointercancel", () => {
      mapDrawDrag = null;
      scheduleVision();
    });
  }

  const _applyCameraVision = applyCamera;
  applyCamera = function () {
    _applyCameraVision();
    scheduleVision();
    try { if (typeof redrawOverlays === "function") redrawOverlays(); } catch (_) {}
  };

  // Hook renderTokens & attack line for realtime vision
  const _rt0 = renderTokens;
  renderTokens = function () {
    _rt0();
    scheduleVision();
  };
  const _sa0 = setAttackPair;
  if (typeof setAttackPair === "function") {
    setAttackPair = function (a, b) {
      _sa0(a, b);
      scheduleVision();
    };
  }

  setMapDrawMode(null);
  scheduleVision();

  // ── Token context menu ──

  let ctxTokId = null;
  const tokMenu = document.getElementById("tokMenu");
  function hideTokMenu() {
    if (tokMenu) tokMenu.style.display = "none";
    ctxTokId = null;
  }
  document.addEventListener("click", hideTokMenu);

  // Allow context menu on tokens — board still prevents default on empty
  // Override: token layer contextmenu
  tokLayer.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".tok");
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const id = el.dataset.id;
    const tk = tokens.find((x) => x.id === id);
    if (!tk) return;
    ctxTokId = id;
    if (!tokMenu) return;
    tokMenu.style.display = "flex";
    tokMenu.style.left = Math.min(e.clientX, window.innerWidth - 180) + "px";
    tokMenu.style.top = Math.min(e.clientY, window.innerHeight - 200) + "px";
    const hid = tokMenu.querySelector('[data-act="hidden"]');
    if (hid) hid.style.display = isDm() ? "block" : "none";
  });

  tokMenu?.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const act = btn.dataset.act;
      const tk = tokens.find((x) => x.id === ctxTokId);
      hideTokMenu();
      if (!tk) return;
      if (act === "select") {
        selectedId = tk.id;
        renderTokens();
        renderInspector();
      } else if (act === "delete") {
        if (!canDeleteToken(tk)) {
          alert("Sadece kendi token’ını veya yoldaşını silebilirsin. Üstten “Ben” ile karakterini seç.");
          return;
        }
        if (!confirm((tk.form === "ally" ? "Yoldaş" : "Token") + " silinsin mi?")) return;
        deleteTokenById(tk.id, { silent: true });
      } else if (act === "attack") {
        // Saldıran kendi token’ı olmalı; hedef herkes olabilir
        if (atkFromId && atkFromId !== tk.id) {
          const from = tokens.find((x) => x.id === atkFromId);
          if (from && !canControlToken(from)) {
            alert("Saldıran token senin değil.");
            return;
          }
          setAttackPair(atkFromId, tk.id);
        } else if (selectedId && selectedId !== tk.id) {
          const from = tokens.find((x) => x.id === selectedId);
          if (from && !canControlToken(from)) {
            alert("Sadece kendi token’ınla saldırabilirsin.");
            return;
          }
          setAttackPair(selectedId, tk.id);
        } else {
          if (!canControlToken(tk)) {
            alert("Saldıran olarak sadece kendi token’ını seçebilirsin.");
            return;
          }
          selectedId = tk.id;
          setAttackPair(tk.id, atkToId);
          chatAdd("Saldıran seçildi. Hedefe sağ tık → Saldır", "sys");
        }
      } else if (act === "status") {
        selectedId = tk.id;
        renderInspector();
        if (!canControlToken(tk) && !isDm()) {
          alert("Bu token’ın durumunu düzenleyemezsin.");
          return;
        }
        chatAdd("Durum için inspector panelini kullan", "sys");
      } else if (act === "hidden") {
        if (!isDm()) return;
        tk.hidden = !tk.hidden;
        saveTokens();
        renderTokens();
        scheduleSync();
      } else if (act === "init") {
        if (!isDm()) return alert("İnisiyatife ekleme sadece DM.");
        addTokenToInitiative(tk);
      }
    });
  });

  // Drag token → initiative list
  const initListEl = document.getElementById("initList");
  if (initListEl) {
    initListEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      initListEl.classList.add("drop-hover");
    });
    initListEl.addEventListener("dragleave", () => initListEl.classList.remove("drop-hover"));
    initListEl.addEventListener("drop", (e) => {
      e.preventDefault();
      initListEl.classList.remove("drop-hover");
      const id = e.dataTransfer.getData("text/token-id");
      if (!id) return;
      const tk = tokens.find((x) => x.id === id);
      if (tk) addTokenToInitiative(tk);
    });
  }

  // Make tokens draggable for init drop (HTML5 drag)
  // Also set data on pointer path — enable draggable in renderTokens via attribute


  // ── Boot ──
  sizeCanvases();
  centerCamera();
  applyMapXF();
  syncMapUI();
  renderTokens();
  renderInspector();
  renderHP();
  renderInit();
  renderVfx();

  window.addEventListener("resize", () => {
    sizeCanvases();
    applyCamera();
    try { sizeFog(); } catch (_) {}
  });
}

  try { applyAtmosphere(true); } catch (_) {} /* atm-init */
