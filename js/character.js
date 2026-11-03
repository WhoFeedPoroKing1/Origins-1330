function initCharacters() {
  const form = document.getElementById("charForm");
  if (!form) return;

  let editId = null;
  let hPortrait = "";
  let vPortrait = "";

  function compressImage(file, maxSide, cb) {
    if (!file || !file.type.startsWith("image/")) {
      alert("Sadece görsel dosyası.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxSide || h > maxSide) {
          const r = Math.min(maxSide / w, maxSide / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(cv.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function bindPortrait(fileId, clearId, previewId, setter) {
    const preview = document.getElementById(previewId);
    document.getElementById(fileId)?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      compressImage(f, 256, (data) => {
        setter(data);
        preview.src = data;
        preview.classList.add("show");
      });
      e.target.value = "";
    });
    document.getElementById(clearId)?.addEventListener("click", () => {
      setter("");
      preview.removeAttribute("src");
      preview.classList.remove("show");
    });
  }

  bindPortrait("hPortraitFile", "hPortraitClear", "hPortrait", (d) => { hPortrait = d; });
  bindPortrait("vPortraitFile", "vPortraitClear", "vPortrait", (d) => { vPortrait = d; });

  function val(id, fb) {
    const el = document.getElementById(id);
    return el ? el.value : fb;
  }
  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v;
  }
  function setPortrait(previewId, data, assign) {
    const preview = document.getElementById(previewId);
    assign(data || "");
    if (data) {
      preview.src = data;
      preview.classList.add("show");
    } else {
      preview.removeAttribute("src");
      preview.classList.remove("show");
    }
  }

  function invUid() {
    return "i_" + Math.random().toString(36).slice(2, 9);
  }

  function readInventoryFromDom() {
    const list = [];
    document.querySelectorAll("#invList .inv-row").forEach((row) => {
      const name = (row.querySelector("[data-inv=name]")?.value || "").trim();
      if (!name) return;
      const qty = Math.max(1, parseInt(row.querySelector("[data-inv=qty]")?.value, 10) || 1);
      const notes = (row.querySelector("[data-inv=notes]")?.value || "").trim();
      const id = row.dataset.invId || invUid();
      const slot = row.querySelector("[data-inv=slot]")?.value || "bag";
      const kind = row.querySelector("[data-inv=kind]")?.value || "gear";
      const weaponType = row.querySelector("[data-inv=wtype]")?.value || "";
      const damage = (row.querySelector("[data-inv=dmg]")?.value || "").trim();
      const damageBonus = parseInt(row.querySelector("[data-inv=dbon]")?.value, 10) || 0;
      const armorType = row.querySelector("[data-inv=atype]")?.value || "";
      const armorValue = parseInt(row.querySelector("[data-inv=aval]")?.value, 10) || 0;
      const acBonus = parseInt(row.querySelector("[data-inv=ac]")?.value, 10) || 0;
      const speedPenalty = parseInt(row.querySelector("[data-inv=spd]")?.value, 10) || 0;
      const twoHand = !!row.querySelector("[data-inv=2h]")?.checked;
      list.push({
        id, name, qty, notes, slot, kind,
        weaponType: kind === "weapon" ? weaponType : "",
        damage: kind === "weapon" ? (damage || "1d6") : "",
        damageBonus: kind === "weapon" ? damageBonus : 0,
        armorType: kind === "armor" ? armorType : "",
        armorValue: kind === "armor" ? armorValue : 0,
        acBonus: kind === "armor" ? acBonus : 0,
        speedPenalty: kind === "armor" ? speedPenalty : 0,
        twoHand: kind === "weapon" ? twoHand : false,
        equipped: slot === "mainhand" || slot === "offhand" || slot === "armor",
      });
    });
    return list;
  }

  function invSel(opts, cur) {
    return opts.map(function (o) {
      return "<option value=\"" + o[0] + "\"" + (cur === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
    }).join("");
  }

  function renderInventoryEditor(items) {
    const box = document.getElementById("invList");
    if (!box) return;
    items = Array.isArray(items) ? items : [];
    if (!items.length) {
      items = [{ id: invUid(), name: "", qty: 1, notes: "", slot: "bag", kind: "gear" }];
    }
    box.innerHTML = items.map(function (it) {
      const kind = it.kind || "gear";
      return "<div class=\"inv-row inv-row-full\" data-inv-id=\"" + (it.id || invUid()) + "\">" +
        "<input type=\"text\" data-inv=\"name\" placeholder=\"Eşya adı\" maxlength=\"48\" value=\"" + String(it.name || "").replace(/"/g, "&quot;") + "\" />" +
        "<input type=\"number\" data-inv=\"qty\" min=\"1\" max=\"99\" value=\"" + (it.qty || 1) + "\" title=\"Adet\" />" +
        "<select data-inv=\"kind\" title=\"Tür\">" + invSel([["gear","Eşya"],["weapon","Silah"],["armor","Zırh"]], kind) + "</select>" +
        "<select data-inv=\"slot\" title=\"Slot\">" + invSel([["bag","Çanta"],["mainhand","Sağ el"],["offhand","Sol el"],["armor","Zırh"]], it.slot || "bag") + "</select>" +
        "<input type=\"text\" data-inv=\"dmg\" placeholder=\"1d6\" value=\"" + String(it.damage || "").replace(/"/g, "&quot;") + "\" title=\"Silah hasarı\" style=\"" + (kind !== "weapon" ? "opacity:0.35" : "") + "\" />" +
        "<input type=\"number\" data-inv=\"dbon\" placeholder=\"+hasar\" value=\"" + (it.damageBonus || 0) + "\" title=\"Hasar artışı\" style=\"" + (kind !== "weapon" ? "opacity:0.35" : "") + "\" />" +
        "<select data-inv=\"wtype\" title=\"Silah türü\" style=\"" + (kind !== "weapon" ? "opacity:0.35" : "") + "\">" + invSel([["","—"],["slashing","Kesici"],["piercing","Saplamalı"],["bludgeoning","Ezici"]], it.weaponType || "") + "</select>" +
        "<label class=\"inv-eq\" style=\"" + (kind !== "weapon" ? "opacity:0.35" : "") + "\"><input type=\"checkbox\" data-inv=\"2h\" " + (it.twoHand ? "checked" : "") + "/> 2El</label>" +
        "<select data-inv=\"atype\" title=\"Zırh türü\" style=\"" + (kind !== "armor" ? "opacity:0.35" : "") + "\">" + invSel([["","—"],["light","Hafif"],["chain","Zincir"],["plate","Plate"]], it.armorType || "") + "</select>" +
        "<input type=\"number\" data-inv=\"aval\" placeholder=\"Zırh\" value=\"" + (it.armorValue || 0) + "\" title=\"Hasar azaltma\" style=\"" + (kind !== "armor" ? "opacity:0.35" : "") + "\" />" +
        "<input type=\"number\" data-inv=\"ac\" placeholder=\"AC+\" value=\"" + (it.acBonus || 0) + "\" title=\"AC artışı\" style=\"" + (kind !== "armor" ? "opacity:0.35" : "") + "\" />" +
        "<input type=\"number\" data-inv=\"spd\" placeholder=\"Hız ceza\" value=\"" + (it.speedPenalty || 0) + "\" title=\"AC azaltır\" style=\"" + (kind !== "armor" ? "opacity:0.35" : "") + "\" />" +
        "<input type=\"text\" data-inv=\"notes\" placeholder=\"Not\" maxlength=\"80\" value=\"" + String(it.notes || "").replace(/"/g, "&quot;") + "\" />" +
        "<button type=\"button\" class=\"inv-del\" title=\"Sil\">×</button>" +
      "</div>";
    }).join("");
    box.querySelectorAll(".inv-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.closest(".inv-row")?.remove();
        if (!box.querySelector(".inv-row")) renderInventoryEditor([]);
      });
    });
    box.querySelectorAll("[data-inv=kind]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        const items = readInventoryFromDom();
        renderInventoryEditor(items.length ? items : []);
      });
    });
  }

  function readForm() {
    return {
      id: editId || uid(),
      // unified character: both forms
      kind: "dual",
      name: (val("cName", "") || "").trim(),
      region: (val("cRegion", "") || "").trim(),
      // human form
      human: {
        title: val("hTitle", "Büyücü"),
        type: val("hType", ""),
        magicName: (val("hMagic", "") || "").trim(),
        magicDesc: (val("hDesc", "") || "").trim(),
        look: (val("hLook", "") || "").trim(),
        story: (val("hStory", "") || "").trim(),
        hp: parseInt(val("hHp", "10"), 10) || 10,
        hpMax: parseInt(val("hHpMax", "10"), 10) || 10,
        ac: parseInt(val("hAc", "12"), 10) || 12,
        damage: (val("hDmg", "1d6") || "1d6").trim(),
        pow: val("hPow", "3"),
        spd: val("hSpd", "3"),
        end: val("hEnd", "3"),
        mind: val("hMind", "3"),
        ctrl: val("hCtrl", "3"),
        portrait: hPortrait || "",
        tokenColor: val("hTokColor", "#d4af37") || "#d4af37",
        tokenShape: val("hTokShape", "circle") || "circle",
      },
      // creature form
      creature: {
        size: val("vSize", "Orta"),
        threat: val("vThreat", "1"),
        type: val("vType", ""),
        magicName: (val("vMagic", "") || "").trim(),
        magicDesc: (val("vDesc", "") || "").trim(),
        traits: (val("vTraits", "") || "").trim(),
        look: (val("vLook", "") || "").trim(),
        story: (val("vStory", "") || "").trim(),
        hp: parseInt(val("vHp", "20"), 10) || 20,
        hpMax: parseInt(val("vHpMax", "20"), 10) || 20,
        ac: parseInt(val("vAc", "13"), 10) || 13,
        damage: (val("vDmg", "1d8") || "1d8").trim(),
        pow: val("vPow", "4"),
        spd: val("vSpd", "3"),
        end: val("vEnd", "4"),
        mind: val("vMind", "2"),
        ctrl: val("vCtrl", "2"),
        portrait: vPortrait || "",
      },
      // convenience for VTT / roster display (active form defaults to human)
      title: val("hTitle", "Büyücü"),
      hp: parseInt(val("hHp", "10"), 10) || 10,
      hpMax: parseInt(val("hHpMax", "10"), 10) || 10,
      portrait: hPortrait || "", // yoldaş resmi kök portrait'a karışmasın
      magicName: (val("hMagic", "") || "").trim(),
      type: val("hType", ""),
      tokenColor: val("hTokColor", "#d4af37") || "#d4af37",
      tokenShape: val("hTokShape", "circle") || "circle",
      inventory: readInventoryFromDom(),
      diceStyle: {
        color: val("dColor", "#d4af37") || "#d4af37",
        color2: val("dColor2", "#1a1520") || "#1a1520",
        shape: val("dShape", "classic") || "classic",
        anim: val("dAnim", "tumble") || "tumble",
      },
    };
  }

  function fillForm(c) {
    editId = c.id;
    setVal("cName", c.name || "");
    setVal("cRegion", c.region || "");

    // migrate old single-form chars
    const hu = c.human || {
      title: c.title,
      type: c.type,
      magicName: c.magicName,
      magicDesc: c.magicDesc,
      look: c.look,
      story: c.story,
      hp: c.hp,
      hpMax: c.hpMax,
      pow: c.pow,
      spd: c.spd,
      end: c.end,
      mind: c.mind,
      ctrl: c.ctrl,
      portrait: c.kind !== "creature" ? c.portrait : "",
    };
    const cr = c.creature || {
      size: c.size || "Orta",
      threat: c.threat || "1",
      type: c.type || "Savaş Büyüsü",
      magicName: c.kind === "creature" ? c.magicName : "",
      magicDesc: c.kind === "creature" ? c.magicDesc : "",
      traits: c.traits || "",
      look: c.kind === "creature" ? c.look : "",
      story: c.kind === "creature" ? c.story : "",
      hp: c.kind === "creature" ? c.hp : 20,
      hpMax: c.kind === "creature" ? c.hpMax : 20,
      pow: c.kind === "creature" ? c.pow : 4,
      spd: c.kind === "creature" ? c.spd : 3,
      end: c.kind === "creature" ? c.end : 4,
      mind: c.kind === "creature" ? c.mind : 2,
      ctrl: c.kind === "creature" ? c.ctrl : 2,
      portrait: c.kind === "creature" ? c.portrait : "",
    };

    setVal("hTitle", hu.title || "Büyücü");
    setVal("hType", hu.type || "Savaş Büyüsü");
    setVal("hMagic", hu.magicName || "");
    setVal("hDesc", hu.magicDesc || "");
    setVal("hLook", hu.look || "");
    setVal("hStory", hu.story || "");
    setVal("hHp", hu.hp ?? 10);
    setVal("hHpMax", hu.hpMax ?? 10);
    setVal("hAc", hu.ac ?? 12);
    setVal("hDmg", hu.damage || "1d6");
    setVal("hPow", hu.pow || 3);
    setVal("hSpd", hu.spd || 3);
    setVal("hEnd", hu.end || 3);
    setVal("hMind", hu.mind || 3);
    setVal("hTokColor", hu.tokenColor || c.tokenColor || "#d4af37");
    try {
      renderInventoryEditor(c.inventory || hu.inventory || []);
    } catch (_) {}
    if (document.getElementById("hTokShape")) document.getElementById("hTokShape").value = hu.tokenShape || c.tokenShape || "circle";
    setVal("hCtrl", hu.ctrl || 3);
    setVal("hFx", hu.fx || "");
    setPortrait("hPortrait", hu.portrait, (d) => { hPortrait = d; });

    setVal("vSize", cr.size || "Orta");
    setVal("vThreat", cr.threat || "1");
    setVal("vType", cr.type || "Savaş Büyüsü");
    setVal("vMagic", cr.magicName || "");
    setVal("vDesc", cr.magicDesc || "");
    setVal("vTraits", cr.traits || "");
    setVal("vLook", cr.look || "");
    setVal("vStory", cr.story || "");
    setVal("vHp", cr.hp ?? 20);
    setVal("vHpMax", cr.hpMax ?? 20);
    setVal("vAc", cr.ac ?? 13);
    setVal("vDmg", cr.damage || "1d8");
    setVal("vPow", cr.pow || 4);
    setVal("vSpd", cr.spd || 3);
    setVal("vEnd", cr.end || 4);
    setVal("vMind", cr.mind || 2);
    setVal("vCtrl", cr.ctrl || 2);
    setVal("vFx", cr.fx || "");
    setPortrait("vPortrait", cr.portrait, (d) => { vPortrait = d; });

    const ds = c.diceStyle || {};
    setVal("dColor", ds.color || "#d4af37");
    setVal("dColor2", ds.color2 || "#1a1520");
    setVal("dShape", ds.shape || "classic");
    setVal("dAnim", ds.anim || "tumble");
    updateDicePreview();

    document.getElementById("saveBtn").textContent = "Güncelle";
  }

  function resetForm() {
    editId = null;
    form.reset();
    hPortrait = "";
    vPortrait = "";
    setPortrait("hPortrait", "", () => {});
    setPortrait("vPortrait", "", () => {});
    ["hPow", "hSpd", "hEnd", "hMind", "hCtrl"].forEach((id) => setVal(id, 3));
    setVal("hTokColor", "#d4af37");
    if (document.getElementById("hTokShape")) document.getElementById("hTokShape").value = "circle";
    setVal("hHp", 10);
    setVal("hHpMax", 10);
    setVal("vPow", 4);
    setVal("vSpd", 3);
    setVal("vEnd", 4);
    setVal("vMind", 2);
    setVal("vCtrl", 2);
    setVal("vHp", 20);
    setVal("vHpMax", 20);
    setVal("dColor", "#d4af37");
    setVal("dColor2", "#1a1520");
    setVal("dShape", "classic");
    setVal("dAnim", "tumble");
    updateDicePreview();
    document.getElementById("saveBtn").textContent = "Karakteri kaydet";
  }

  function updateDicePreview() {
    const cube = document.getElementById("dicePreviewCube");
    if (!cube) return;
    const c1 = val("dColor", "#d4af37");
    const c2 = val("dColor2", "#1a1520");
    const shape = val("dShape", "classic") || "classic";
    // Text color = brighter mix toward gold/white of primary
    cube.style.setProperty("--die-text", c1);
    cube.style.setProperty("--die-border", c1);
    cube.style.setProperty("--die-c1", c2);
    cube.style.setProperty("--die-c2", c2);
    if (shape === "bone") {
      cube.style.removeProperty("--die-text");
      cube.style.removeProperty("--die-border");
      cube.style.removeProperty("--die-c1");
      cube.style.removeProperty("--die-c2");
    } else {
      // face uses c2 as body, c1 as accent/text
      cube.style.setProperty("--die-c1", lightenHex(c2, 18));
      cube.style.setProperty("--die-c2", c2);
    }
    cube.className = "dice-preview-cube shape-" + shape;
    const num = document.getElementById("dicePreviewNum");
    if (num) num.textContent = String(Math.floor(Math.random() * 20) + 1);
  }

  function lightenHex(hex, amt) {
    try {
      let h = (hex || "#222").replace("#", "");
      if (h.length === 3) h = h.split("").map((x) => x + x).join("");
      const n = parseInt(h, 16);
      let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
      return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    } catch (_) {
      return hex || "#333";
    }
  }

  function playDicePreviewAnim() {
    const cube = document.getElementById("dicePreviewCube");
    if (!cube) return;
    updateDicePreview();
    const anim = val("dAnim", "tumble") || "tumble";
    cube.classList.remove("anim-tumble", "anim-bounce", "anim-whirl", "anim-soft", "anim-chaotic");
    // force reflow
    void cube.offsetWidth;
    cube.classList.add("anim-" + anim);
    setTimeout(() => {
      cube.classList.remove("anim-" + anim);
      const num = document.getElementById("dicePreviewNum");
      if (num) num.textContent = String(Math.floor(Math.random() * 20) + 1);
    }, 950);
  }

  function persistCharacter(quiet) {
    const char = readForm();
    if (!char.name || !char.name.trim()) {
      if (!quiet) alert("Karakter adı gerekli.");
      return false;
    }
    let list = loadRoster();
    if (editId) {
      const i = list.findIndex((x) => x.id === editId);
      if (i >= 0) list[i] = { ...list[i], ...char, id: editId };
      else {
        char.id = editId;
        list.push(char);
      }
    } else {
      // yeni karakter: ilk kayıtta id üret, sonra autosave aynı id'ye yazar
      list.push(char);
      editId = char.id;
    }
    const ok = saveRoster(list);
    if (!ok) {
      if (!quiet) alert("Kayıt başarısız (resimler çok büyük olabilir).");
      return false;
    }
    renderList();
    flashSaveStatus(document.getElementById("saveStatus"), true);
    return true;
  }

  const autoSaveChar = typeof createAutoSaver === "function"
    ? createAutoSaver(() => {
        if (!editId && !(document.getElementById("cName")?.value || "").trim()) return;
        persistCharacter(true);
      }, 700)
    : () => {};

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!persistCharacter(false)) return;
    // form açık kalsın (düzenlemeye devam); istersen reset
    // resetForm();
    renderList();
  });

  form.addEventListener("input", () => autoSaveChar());
  form.addEventListener("change", () => autoSaveChar());

  document.getElementById("resetBtn")?.addEventListener("click", resetForm);

  function renderList() {
    const grid = document.getElementById("rosterGrid");
    const empty = document.getElementById("rosterEmpty");
    if (!grid) return;
    const list = loadRoster();
    grid.innerHTML = "";
    if (!list.length) {
      if (empty) empty.style.display = "";
      return;
    }
    if (empty) empty.style.display = "none";

    list.forEach((c) => {
      const hu = c.human || c;
      const cr = c.creature || {};
      const title = hu.title || c.title || "Büyücü";
      const card = document.createElement("div");
      card.className = "roster-card";
      card.style.borderColor = TITLE_COLOR[title] || TITLE_COLOR.Diğer;
      const pics = [];
      if (hu.portrait || (c.portrait && c.kind !== "creature"))
        pics.push(`<img src="${hu.portrait || c.portrait}" alt="İnsan" title="Karakter" />`);
      if (cr.portrait)
        pics.push(`<img src="${cr.portrait}" alt="Yaratık" title="Yoldaş" />`);
      card.innerHTML = `
        ${pics.length ? `<div class="rc-pics">${pics.join("")}</div>` : ""}
        <div class="rc-title ${titleClass(title)}">${esc(title)} · Karakter + Yoldaş</div>
        <div class="rc-name">${esc(c.name)}</div>
        <div class="rc-magic">${esc(hu.magicName || c.magicName || "—")} / ${esc(cr.magicName || "—")}</div>
        <div class="rc-meta">${esc(c.region || "—")} · Yoldaş: ${esc(cr.size || "—")}</div>
        <div class="rc-hp">Karakter <strong>${hu.hp ?? c.hp ?? "—"}/${hu.hpMax ?? c.hpMax ?? "—"}</strong>
          · Yoldaş <strong>${cr.hp ?? "—"}/${cr.hpMax ?? "—"}</strong></div>
        ${c.diceStyle ? `<div class="rc-meta" style="display:flex;align-items:center;gap:0.35rem;margin-top:0.2rem">
          <span style="width:12px;height:12px;border-radius:3px;background:${esc(c.diceStyle.color || "#d4af37")};border:1px solid ${esc(c.diceStyle.color2 || "#333")}"></span>
          Zar: ${esc(c.diceStyle.shape || "classic")} · ${esc(c.diceStyle.anim || "tumble")}
        </div>` : ""}
        <div class="rc-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-edit="${c.id}">Düzenle</button>
          <button type="button" class="btn btn-danger btn-sm" data-del="${c.id}">Sil</button>
        </div>`;
      grid.appendChild(card);
    });

    grid.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = loadRoster().find((x) => x.id === btn.dataset.edit);
        if (!c) return;
        fillForm(c);
        form.scrollIntoView({ behavior: "smooth" });
      });
    });
    grid.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("Sil?")) return;
        saveRoster(loadRoster().filter((x) => x.id !== btn.dataset.del));
        renderList();
      });
    });
  }

  document.getElementById("clearRoster")?.addEventListener("click", () => {
    if (confirm("Tümü silinsin mi?")) {
      saveRoster([]);
      renderList();
    }
  });

  ["dColor", "dColor2", "dShape", "dAnim"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateDicePreview);
    document.getElementById(id)?.addEventListener("change", updateDicePreview);
  });
  document.getElementById("dicePreviewBtn")?.addEventListener("click", playDicePreviewAnim);
  document.getElementById("dicePreviewCube")?.addEventListener("click", playDicePreviewAnim);
  updateDicePreview();

  document.getElementById("invAdd")?.addEventListener("click", () => {
    const cur = readInventoryFromDom();
    cur.push({ id: invUid(), name: "", qty: 1, notes: "", equipped: false });
    renderInventoryEditor(cur);
  });
  try {
    if (document.getElementById("invList") && !document.querySelector("#invList .inv-row")) {
      renderInventoryEditor([]);
    }
  } catch (_) {}

  renderList();
}


