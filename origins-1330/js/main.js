/* Shared nav + character form helpers */
document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menuBtn");
  const nav = document.getElementById("nav");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", () => nav.classList.toggle("open"));
    nav.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => nav.classList.remove("open"))
    );
  }

  // Highlight current page in nav
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (href === path || (path === "" && href === "index.html")) {
      a.classList.add("active");
    }
  });
});

const STORAGE_KEY = "origins_roster";
const DANGEROUS = ["Cadı", "Kafir"];

function loadRoster() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRoster(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

/** Wire character form + live preview (used on pages 4 & 5) */
function initCharacterForm(opts = {}) {
  const prefix = opts.prefix || "";
  const fields = {
    name: document.getElementById(prefix + "fName"),
    title: document.getElementById(prefix + "fTitle"),
    region: document.getElementById(prefix + "fRegion"),
    type: document.getElementById(prefix + "fType"),
    magicName: document.getElementById(prefix + "fMagicName"),
    magicDesc: document.getElementById(prefix + "fMagicDesc"),
    look: document.getElementById(prefix + "fLook"),
    story: document.getElementById(prefix + "fStory"),
    pow: document.getElementById(prefix + "fPow"),
    spd: document.getElementById(prefix + "fSpd"),
    end: document.getElementById(prefix + "fEnd"),
    mind: document.getElementById(prefix + "fMind"),
    ctrl: document.getElementById(prefix + "fCtrl"),
  };
  if (!fields.name) return;

  const preview = {
    name: document.getElementById(prefix + "pName"),
    title: document.getElementById(prefix + "pTitle"),
    region: document.getElementById(prefix + "pRegion"),
    type: document.getElementById(prefix + "pType"),
    magicName: document.getElementById(prefix + "pMagicName"),
    magicDesc: document.getElementById(prefix + "pMagicDesc"),
    look: document.getElementById(prefix + "pLook"),
    pow: document.getElementById(prefix + "pPow"),
    spd: document.getElementById(prefix + "pSpd"),
    end: document.getElementById(prefix + "pEnd"),
    mind: document.getElementById(prefix + "pMind"),
    ctrl: document.getElementById(prefix + "pCtrl"),
    card: document.getElementById(prefix + "previewCard"),
  };

  function updatePreview() {
    if (!preview.name) return;
    preview.name.textContent = fields.name.value.trim() || "İsimsiz";
    if (preview.title) preview.title.textContent = fields.title.value;
    if (preview.region) preview.region.textContent = fields.region.value.trim() || "—";
    if (preview.type) preview.type.textContent = fields.type.value;
    if (preview.magicName)
      preview.magicName.textContent = fields.magicName.value.trim() || "Büyü Adı";
    if (preview.magicDesc)
      preview.magicDesc.textContent =
        fields.magicDesc?.value.trim() || "Büyü açıklaması...";
    if (preview.look)
      preview.look.textContent = fields.look?.value.trim() || "Görünüm...";
    if (preview.pow) preview.pow.textContent = fields.pow.value;
    if (preview.spd) preview.spd.textContent = fields.spd.value;
    if (preview.end) preview.end.textContent = fields.end.value;
    if (preview.mind) preview.mind.textContent = fields.mind.value;
    if (preview.ctrl) preview.ctrl.textContent = fields.ctrl.value;
    if (preview.card) {
      if (DANGEROUS.includes(fields.title.value)) preview.card.classList.add("danger");
      else preview.card.classList.remove("danger");
    }
  }

  Object.values(fields).forEach((el) => {
    if (!el) return;
    el.addEventListener("input", updatePreview);
    el.addEventListener("change", updatePreview);
  });
  updatePreview();

  const form = document.getElementById(prefix + "charForm");
  const resetBtn = document.getElementById(prefix + "resetForm");

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = fields.name.value.trim();
      if (!name) return;
      const char = {
        name,
        title: fields.title.value,
        region: fields.region.value.trim(),
        type: fields.type.value,
        magicName: fields.magicName.value.trim(),
        magicDesc: fields.magicDesc?.value.trim() || "",
        look: fields.look?.value.trim() || "",
        story: fields.story?.value.trim() || "",
        pow: fields.pow.value,
        spd: fields.spd.value,
        end: fields.end.value,
        mind: fields.mind.value,
        ctrl: fields.ctrl.value,
        created: Date.now(),
      };
      const list = loadRoster();
      list.push(char);
      saveRoster(list);
      renderRoster(prefix + "rosterGrid", prefix + "rosterEmpty");
      alert("Karakter kaydedildi.");
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      form.reset();
      ["pow", "spd", "end", "mind", "ctrl"].forEach((k) => {
        if (fields[k]) fields[k].value = 3;
      });
      updatePreview();
    });
  }

  renderRoster(prefix + "rosterGrid", prefix + "rosterEmpty");

  const clearBtn = document.getElementById(prefix + "clearRoster");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("Tüm karakterler silinecek. Emin misin?")) {
        saveRoster([]);
        renderRoster(prefix + "rosterGrid", prefix + "rosterEmpty");
      }
    });
  }
}

function renderRoster(gridId, emptyId) {
  const grid = document.getElementById(gridId);
  const empty = document.getElementById(emptyId);
  if (!grid) return;
  const list = loadRoster();
  grid.innerHTML = "";
  if (list.length === 0) {
    if (empty) empty.classList.remove("hidden");
    return;
  }
  if (empty) empty.classList.add("hidden");
  list.forEach((c, i) => {
    const isDanger = DANGEROUS.includes(c.title);
    const card = document.createElement("div");
    card.className = "roster-card" + (isDanger ? " danger" : "");
    card.innerHTML = `
      <button type="button" class="rc-delete" data-i="${i}" title="Sil">×</button>
      <div class="rc-title">${escapeHtml(c.title)}</div>
      <div class="rc-name">${escapeHtml(c.name)}</div>
      <div class="rc-magic">${escapeHtml(c.magicName || "—")}</div>
      <div class="rc-meta">${escapeHtml(c.type)} · ${escapeHtml(c.region || "—")}</div>
      <div class="rc-desc">${escapeHtml(c.magicDesc || c.story || "")}</div>
    `;
    grid.appendChild(card);
  });
  grid.querySelectorAll(".rc-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = loadRoster();
      list.splice(parseInt(btn.dataset.i, 10), 1);
      saveRoster(list);
      renderRoster(gridId, emptyId);
    });
  });
}

/** Dice + map for oyun.html */

/** ========== OYUN ALANI ========== */
function initGameArea() {
  if (!document.getElementById("rollBtn")) return;

  const roster = loadRoster();
  const ENEMY_KEY = "origins_enemies";
  const DM_KEY = "origins_dm";
  const DM_PASS = "1";

  let selectedRoller = "";
  let advMode = "normal"; // normal | adv | disadv
  let initiative = [];
  let currentTurn = 0;
  let rolling = false;

  // --- DM unlock ---
  const dmLock = document.getElementById("dmLock");
  const dmPanel = document.getElementById("dmPanel");
  if (sessionStorage.getItem(DM_KEY) === "1") {
    showDm(true);
  }
  document.getElementById("dmUnlock")?.addEventListener("click", () => {
    const pass = document.getElementById("dmPass")?.value || "";
    if (pass === DM_PASS) {
      sessionStorage.setItem(DM_KEY, "1");
      showDm(true);
    } else {
      alert("Yanlış şifre.");
    }
  });
  document.getElementById("dmLockBtn")?.addEventListener("click", () => {
    sessionStorage.removeItem(DM_KEY);
    showDm(false);
  });
  function showDm(on) {
    if (dmLock) dmLock.style.display = on ? "none" : "block";
    if (dmPanel) dmPanel.style.display = on ? "block" : "none";
  }

  // --- Enemies ---
  function loadEnemies() {
    try {
      return JSON.parse(localStorage.getItem(ENEMY_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function saveEnemies(list) {
    localStorage.setItem(ENEMY_KEY, JSON.stringify(list));
  }
  function renderEnemies() {
    const el = document.getElementById("enemyList");
    if (!el) return;
    const list = loadEnemies();
    if (list.length === 0) {
      el.innerHTML = "<div style='font-size:0.75rem;color:var(--text-dim);'>Düşman yok</div>";
      return;
    }
    el.innerHTML = list
      .map(
        (e, i) => `
      <div class="enemy-chip">
        <span><strong>${escapeHtml(e.name)}</strong> · HP ${e.hp}${e.note ? " · " + escapeHtml(e.note) : ""}</span>
        <button type="button" data-del="${i}" title="Sil">×</button>
      </div>`
      )
      .join("");
    el.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const list = loadEnemies();
        list.splice(parseInt(btn.dataset.del, 10), 1);
        saveEnemies(list);
        renderEnemies();
      });
    });
  }
  document.getElementById("enemyForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("enName").value.trim();
    if (!name) return;
    const list = loadEnemies();
    list.push({
      name,
      hp: parseInt(document.getElementById("enHp").value, 10) || 10,
      note: document.getElementById("enNote").value.trim(),
      id: Date.now(),
    });
    saveEnemies(list);
    renderEnemies();
    e.target.reset();
    document.getElementById("enHp").value = 20;
  });
  renderEnemies();

  // --- Roller + party ---
  const rollerSelect = document.getElementById("rollerSelect");
  roster.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = c.name;
    rollerSelect?.appendChild(opt);
  });
  rollerSelect?.addEventListener("change", () => {
    selectedRoller = rollerSelect.value;
    highlightRoller(selectedRoller);
  });

  function highlightRoller(name) {
    document.querySelectorAll(".party-item").forEach((el) => {
      el.classList.toggle("active-roller", el.dataset.name === name && name !== "");
    });
  }

  const partyEl = document.getElementById("partyList");
  if (partyEl) {
    if (roster.length === 0) {
      partyEl.innerHTML =
        "<div class='party-item'>Karakter yok — Hızlı Karakter sayfasından ekle</div>";
    } else {
      partyEl.innerHTML = roster
        .map(
          (c, i) => `
        <div class="party-item" data-name="${escapeHtml(c.name)}" data-index="${i}">
          <strong>${escapeHtml(c.name)}</strong>
          ${escapeHtml(c.title)} · ${escapeHtml(c.magicName || "—")}
          <div class="party-hint">tıkla: profil · çift tık: zar atan</div>
        </div>`
        )
        .join("");
      partyEl.querySelectorAll(".party-item").forEach((el) => {
        el.addEventListener("click", () => openProfile(roster[parseInt(el.dataset.index, 10)]));
        el.addEventListener("dblclick", (ev) => {
          ev.preventDefault();
          selectedRoller = el.dataset.name;
          if (rollerSelect) rollerSelect.value = selectedRoller;
          highlightRoller(selectedRoller);
        });
      });
    }
  }

  // Profile modal
  const modal = document.getElementById("profileModal");
  function openProfile(c) {
    if (!c || !modal) return;
    document.getElementById("mTitle").textContent = c.title || "—";
    document.getElementById("mRegion").textContent = c.region || "—";
    document.getElementById("mName").textContent = c.name || "—";
    document.getElementById("mMagicName").textContent = c.magicName || "—";
    document.getElementById("mType").textContent = c.type || "—";
    document.getElementById("mMagicDesc").textContent = c.magicDesc || "—";
    document.getElementById("mLook").textContent = c.look || "—";
    document.getElementById("mPow").textContent = c.pow ?? "—";
    document.getElementById("mSpd").textContent = c.spd ?? "—";
    document.getElementById("mEnd").textContent = c.end ?? "—";
    document.getElementById("mMind").textContent = c.mind ?? "—";
    document.getElementById("mCtrl").textContent = c.ctrl ?? "—";
    document.getElementById("mStory").textContent = c.story || "Hikâye girilmemiş.";
    const card = document.getElementById("modalCard");
    if (card) {
      card.classList.toggle("danger", DANGEROUS.includes(c.title));
    }
    modal.classList.remove("hidden");
  }
  document.getElementById("modalClose")?.addEventListener("click", () =>
    modal?.classList.add("hidden")
  );
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  // Adv buttons
  document.querySelectorAll(".adv-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".adv-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      advMode = btn.dataset.adv;
    });
  });

  // --- 3D Dice system ---
  const overlay = document.getElementById("diceOverlay");
  const wrap3d = document.getElementById("dice3dWrap");
  const finalEl = document.getElementById("diceFinal");
  const whoEl = document.getElementById("diceWho");
  const logEl = document.getElementById("diceLog");
  const closeBtn = document.getElementById("diceClose");

  function rollOne(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  function createDieEl(value) {
    const die = document.createElement("div");
    die.className = "die rolling";
    const faces = ["front", "back", "right", "left", "top", "bottom"];
    faces.forEach((f, i) => {
      const face = document.createElement("div");
      face.className = "die-face " + f;
      // show result on front after settle; during roll random-looking
      face.textContent = i === 0 ? value : rollOne(20);
      die.appendChild(face);
    });
    return die;
  }

  function showDiceOverlay(who, label, results, total, detail) {
    return new Promise((resolve) => {
      rolling = true;
      whoEl.textContent = who + (label ? " · " + label : "");
      wrap3d.innerHTML = "";
      finalEl.classList.remove("visible");
      finalEl.innerHTML = "";
      closeBtn.classList.remove("visible");
      overlay.classList.add("active");

      const diceEls = results.map((v) => {
        const d = createDieEl(v);
        wrap3d.appendChild(d);
        return d;
      });

      // After tumble animation, settle and show result
      setTimeout(() => {
        diceEls.forEach((d, i) => {
          d.classList.remove("rolling");
          d.classList.add("settled");
          const front = d.querySelector(".die-face.front");
          if (front) front.textContent = results[i];
        });
        let html = String(total);
        if (detail) html += `<span class="sub">${escapeHtml(detail)}</span>`;
        finalEl.innerHTML = html;
        finalEl.classList.add("visible");
        closeBtn.classList.add("visible");
        rolling = false;
      }, 1150);

      const onClose = () => {
        overlay.classList.remove("active");
        closeBtn.removeEventListener("click", onClose);
        resolve();
      };
      closeBtn.addEventListener("click", onClose);
      // auto close after long wait optional — user closes
    });
  }

  async function doRoll() {
    if (rolling) return;
    const sides = parseInt(document.getElementById("diceSides").value, 10) || 20;
    let count = parseInt(document.getElementById("diceCount").value, 10) || 1;
    count = Math.min(8, Math.max(1, count));

    const who = selectedRoller || rollerSelect?.value || "GM";
    let results = [];
    let total = 0;
    let detail = "";
    let label = `${count}d${sides}`;

    if (advMode === "adv" || advMode === "disadv") {
      // Advantage/disadvantage: 2 rolls of same die, take high/low (classic = 1 die type, 2 rolls)
      // If count > 1, apply per die
      const picks = [];
      for (let i = 0; i < count; i++) {
        const a = rollOne(sides);
        const b = rollOne(sides);
        const chosen = advMode === "adv" ? Math.max(a, b) : Math.min(a, b);
        picks.push(chosen);
        results.push(a, b); // show both dice visually? Or just chosen?
        // Better UX: show 2 dice per slot for adv — for simplicity show all raw then note
      }
      // Visual: show 2 * count dice, but total uses chosen
      if (count === 1) {
        results = [rollOne(sides), rollOne(sides)];
        // re-roll for consistency - actually use the loop results
        results = [];
        const a = rollOne(sides);
        const b = rollOne(sides);
        results = [a, b];
        total = advMode === "adv" ? Math.max(a, b) : Math.min(a, b);
        detail =
          (advMode === "adv" ? "Avantaj" : "Dezavantaj") +
          ` (${a} / ${b}) → ${total}`;
        label = `d${sides} ${advMode === "adv" ? "avantaj" : "dezavantaj"}`;
      } else {
        results = [];
        total = 0;
        const parts = [];
        for (let i = 0; i < count; i++) {
          const a = rollOne(sides);
          const b = rollOne(sides);
          const c = advMode === "adv" ? Math.max(a, b) : Math.min(a, b);
          results.push(a, b);
          total += c;
          parts.push(`${c}`);
        }
        detail =
          (advMode === "adv" ? "Avantaj" : "Dezavantaj") +
          ` seçilen: ${parts.join("+")} = ${total}`;
        label = `${count}d${sides} ${advMode === "adv" ? "adv" : "dis"}`;
      }
    } else {
      results = [];
      for (let i = 0; i < count; i++) results.push(rollOne(sides));
      total = results.reduce((s, n) => s + n, 0);
      detail = count > 1 ? results.join(" + ") + " = " + total : "";
    }

    await showDiceOverlay(who, label, results.slice(0, 8), total, detail);

    if (logEl) {
      const line = document.createElement("div");
      line.innerHTML = `<span class="log-name">${escapeHtml(who)}</span> · ${escapeHtml(label)} → <strong>${total}</strong>${detail ? " <span style='color:var(--text-dim)'>(" + escapeHtml(detail) + ")</span>" : ""}`;
      logEl.prepend(line);
      while (logEl.children.length > 20) logEl.lastChild.remove();
    }
  }

  document.getElementById("rollBtn")?.addEventListener("click", doRoll);

  // --- Initiative / Battle ---
  function renderInit() {
    const board = document.getElementById("initBoard");
    if (!board) return;
    if (initiative.length === 0) {
      board.innerHTML =
        '<div style="font-size:0.75rem;color:var(--text-dim);padding:0.4rem;">Savaş başlamadı</div>';
      return;
    }
    board.innerHTML = initiative
      .map(
        (row, i) => `
      <div class="init-row ${row.type === "enemy" ? "enemy" : ""} ${i === currentTurn ? "current" : ""}">
        <span class="init-score">${row.score}</span>
        <span class="init-name">${escapeHtml(row.name)}</span>
        <span class="init-tag">${row.type === "enemy" ? "Düşman" : "Oyuncu"}</span>
      </div>`
      )
      .join("");
  }

  async function startBattle() {
    if (rolling) return;
    const players = roster.map((c) => ({ name: c.name, type: "player" }));
    const enemies = loadEnemies().map((e) => ({ name: e.name, type: "enemy" }));
    if (players.length === 0 && enemies.length === 0) {
      alert("Ne oyuncu ne düşman var.");
      return;
    }

    const combatants = [...players, ...enemies];
    initiative = [];
    currentTurn = 0;

    // Sequential initiative rolls with overlay for each (or batch faster)
    // User asked: everyone's dice auto roll and enter queue
    // We'll roll d20 for each with short overlay, or one combined - better sequential quick

    for (const c of combatants) {
      selectedRoller = c.name;
      if (rollerSelect) rollerSelect.value = c.type === "player" ? c.name : "";
      const score = rollOne(20);
      // Mini overlay feel - use full overlay but faster path
      await showDiceOverlay(c.name, "İnisiyatif d20", [score], score, null);
      initiative.push({ name: c.name, type: c.type, score });
    }

    initiative.sort((a, b) => b.score - a.score);
    currentTurn = 0;
    renderInit();
    selectedRoller = initiative[0]?.name || "";
    if (rollerSelect && roster.some((r) => r.name === selectedRoller)) {
      rollerSelect.value = selectedRoller;
    }
    highlightRoller(selectedRoller);
  }

  document.getElementById("startBattle")?.addEventListener("click", startBattle);
  document.getElementById("nextTurn")?.addEventListener("click", () => {
    if (initiative.length === 0) return;
    currentTurn = (currentTurn + 1) % initiative.length;
    renderInit();
    selectedRoller = initiative[currentTurn].name;
    if (rollerSelect && roster.some((r) => r.name === selectedRoller)) {
      rollerSelect.value = selectedRoller;
    } else if (rollerSelect) rollerSelect.value = "";
    highlightRoller(
      roster.some((r) => r.name === selectedRoller) ? selectedRoller : ""
    );
  });
  document.getElementById("clearBattle")?.addEventListener("click", () => {
    initiative = [];
    currentTurn = 0;
    renderInit();
  });

  // Notes
  const notes = document.getElementById("sessionNotes");
  if (notes) {
    notes.value = localStorage.getItem("origins_notes") || "";
    notes.addEventListener("input", () =>
      localStorage.setItem("origins_notes", notes.value)
    );
  }

  // Map canvas
  const canvas = document.getElementById("mapCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let lastX = 0,
    lastY = 0;

  function resizeFixed() {
    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    const toolbar = parent.querySelector(".map-toolbar");
    const th = toolbar ? toolbar.offsetHeight : 0;
    canvas.width = rect.width;
    canvas.height = Math.max(360, window.innerHeight - 220 - th);
    const saved = localStorage.getItem("origins_map");
    if (saved) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = saved;
    } else {
      ctx.fillStyle = "#0a0a0e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  resizeFixed();
  window.addEventListener("resize", resizeFixed);

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }
  function start(e) {
    e.preventDefault();
    drawing = true;
    const p = pos(e);
    lastX = p.x;
    lastY = p.y;
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    const color = document.getElementById("brushColor")?.value || "#c9a227";
    const size = parseInt(document.getElementById("brushSize")?.value || "3", 10);
    const erase = document.getElementById("brushErase")?.checked;
    ctx.strokeStyle = erase ? "#0a0a0e" : color;
    ctx.lineWidth = erase ? size * 3 : size;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x;
    lastY = p.y;
  }
  function end() {
    if (!drawing) return;
    drawing = false;
    try {
      localStorage.setItem("origins_map", canvas.toDataURL("image/png"));
    } catch (_) {}
  }
  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", end);
  canvas.addEventListener("mouseleave", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
  document.getElementById("mapClear")?.addEventListener("click", () => {
    if (!confirm("Harita temizlensin mi?")) return;
    ctx.fillStyle = "#0a0a0e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    localStorage.removeItem("origins_map");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      modal?.classList.add("hidden");
      if (overlay?.classList.contains("active") && !rolling) {
        overlay.classList.remove("active");
      }
    }
  });
}
