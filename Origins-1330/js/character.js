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

  const ITEM_TEMPLATES = [
    { name: "Uzun kılıç", kind: "weapon", slot: "bag", damage: "1d8", damageBonus: 0, weaponType: "slashing", twoHand: false },
    { name: "Büyük balta", kind: "weapon", slot: "bag", damage: "1d12", damageBonus: 0, weaponType: "slashing", twoHand: true },
    { name: "Mızrak", kind: "weapon", slot: "bag", damage: "1d6", damageBonus: 0, weaponType: "piercing", twoHand: false },
    { name: "Savaş çekici", kind: "weapon", slot: "bag", damage: "1d8", damageBonus: 0, weaponType: "bludgeoning", twoHand: false },
    { name: "Hançer", kind: "weapon", slot: "bag", damage: "1d4", damageBonus: 0, weaponType: "piercing", twoHand: false },
    { name: "Kalkan", kind: "gear", slot: "bag", notes: "AC+2 (sol el)", acBonus: 2 },
    { name: "Hafif zırh", kind: "armor", slot: "bag", armorType: "light", armorValue: 1, acBonus: 1, speedPenalty: 0 },
    { name: "Zincir zırh", kind: "armor", slot: "bag", armorType: "chain", armorValue: 3, acBonus: 2, speedPenalty: 1 },
    { name: "Plate zırh", kind: "armor", slot: "bag", armorType: "plate", armorValue: 5, acBonus: 3, speedPenalty: 2 },
  ];

  function invUid() {
    return "i_" + Math.random().toString(36).slice(2, 9);
  }


  function readInventoryFromDom() {
    const box = document.getElementById("invList");
    if (box && typeof box._readInv === "function") {
      try { return box._readInv().filter(function (x) { return x && x.name; }); } catch (_) {}
    }
    const list = [];
    document.querySelectorAll("#invList .eq-item, #invList .inv-card").forEach((row) => {
      const name = (row.querySelector("[data-inv=name]")?.value || "").trim();
      if (!name) return;
      const qty = Math.max(1, parseInt(row.querySelector("[data-inv=qty]")?.value, 10) || 1);
      const notes = (row.querySelector("[data-inv=notes]")?.value || "").trim();
      const id = row.dataset.invId || invUid();
      const slot = row.querySelector("[data-inv=slot]")?.value || "bag";
      const kind = row.querySelector("[data-inv=kind]")?.value || "gear";
      const item = {
        id: id,
        name: name,
        qty: qty,
        notes: notes,
        slot: slot,
        kind: kind,
        weaponType: "",
        damage: "",
        damageBonus: 0,
        armorType: "",
        armorValue: 0,
        acBonus: 0,
        speedPenalty: 0,
        twoHand: false,
        equipped: slot === "mainhand" || slot === "offhand" || slot === "armor",
      };
      if (kind === "weapon") {
        item.weaponType = row.querySelector("[data-inv=wtype]")?.value || "slashing";
        item.damage = (row.querySelector("[data-inv=dmg]")?.value || "1d6").trim() || "1d6";
        item.damageBonus = parseInt(row.querySelector("[data-inv=dbon]")?.value, 10) || 0;
        item.twoHand = !!row.querySelector("[data-inv=2h]")?.checked;
      }
      if (kind === "armor") {
        item.armorType = row.querySelector("[data-inv=atype]")?.value || "light";
        item.armorValue = parseInt(row.querySelector("[data-inv=aval]")?.value, 10) || 0;
        item.acBonus = parseInt(row.querySelector("[data-inv=ac]")?.value, 10) || 0;
        item.speedPenalty = parseInt(row.querySelector("[data-inv=spd]")?.value, 10) || 0;
      }
      if (kind === "gear" && name.toLowerCase().indexOf("kalkan") >= 0) {
        item.acBonus = parseInt(row.querySelector("[data-inv=ac]")?.value, 10) || item.acBonus || 0;
      }
      list.push(item);
    });
    return list;
  }

  function invOpt(val, cur, label) {
    return "<option value=\"" + val + "\"" + (cur === val ? " selected" : "") + ">" + label + "</option>";
  }



  function renderInventoryEditor(items) {
    const box = document.getElementById("invList");
    if (!box) return;
    items = Array.isArray(items) ? items.map(function (x) { return Object.assign({}, x); }) : [];

    function escAttr(s) {
      return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    }
    function metaLine(it) {
      if (!it) return "";
      if (it.kind === "weapon") {
        return (it.damage || "1d6") + (it.damageBonus ? " +" + it.damageBonus : "") +
          " · " + ({ slashing: "Kesici", piercing: "Saplama", bludgeoning: "Ezici" }[it.weaponType] || "Silah") +
          (it.twoHand ? " · 2 el" : "");
      }
      if (it.kind === "armor") {
        return ({ light: "Hafif", chain: "Zincir", plate: "Plate" }[it.armorType] || "Zırh") +
          " · koruma " + (it.armorValue || 0) + " · AC+" + (it.acBonus || 0) +
          (it.speedPenalty ? " · hız −" + it.speedPenalty : "");
      }
      return it.notes ? String(it.notes).slice(0, 60) : "Eşya";
    }
    function findSlot(slot) {
      for (let i = 0; i < items.length; i++) {
        if ((items[i].slot || "bag") === slot) return { it: items[i], i: i };
      }
      return null;
    }

    const mh = findSlot("mainhand");
    const oh = findSlot("offhand");
    const ar = findSlot("armor");
    const bagIdx = [];
    items.forEach(function (it, i) {
      const s = it.slot || "bag";
      if (s !== "mainhand" && s !== "offhand" && s !== "armor") bagIdx.push(i);
      // if duplicate equipped slots, extras treated as bag in list below
    });
    // All items appear in the editable list; equipped ones marked
    let html = "";
    html += '<div class="inv2">';
    html += '<div class="inv2-equip">';
    [
      ["mainhand", "⚔ Sağ el", mh],
      ["offhand", "🛡 Sol el", oh],
      ["armor", "🧥 Zırh", ar],
    ].forEach(function (row) {
      const slot = row[0], lab = row[1], hit = row[2];
      html += '<div class="inv2-slot" data-slot="' + slot + '">';
      html += '<div class="inv2-slot-lab">' + lab + '</div>';
      if (hit) {
        html += '<div class="inv2-slot-name">' + escAttr(hit.it.name) + '</div>';
        html += '<div class="inv2-slot-meta">' + escAttr(metaLine(hit.it)) + '</div>';
        html += '<button type="button" class="inv2-unequip" data-uneq="' + hit.i + '">Çıkar → çanta</button>';
      } else {
        html += '<div class="inv2-slot-empty">Boş</div>';
      }
      html += '</div>';
    });
    html += '</div>';

    html += '<div class="inv2-bag-title"><span>Çanta</span><span class="inv2-count">' + items.length + ' kayıt</span></div>';
    html += '<div class="inv2-bag">';

    if (!items.length) {
      html += '<div class="inv2-empty">Çanta boş. Aşağıdan eşya ekle veya şablon seç.</div>';
    }

    items.forEach(function (it, idx) {
      const kind = it.kind || "gear";
      const open = it._open ? " open" : "";
      html += '<div class="inv2-row' + open + '" data-id="' + escAttr(it.id || "") + '" data-idx="' + idx + '">';
      html += '<button type="button" class="inv2-row-head" data-toggle="' + idx + '">';
      html += '<span class="inv2-row-name">' + escAttr(it.name || "İsimsiz") + '</span>';
      html += '<span class="inv2-row-tag">' + escAttr({ bag: "Çanta", mainhand: "Sağ el", offhand: "Sol el", armor: "Zırh" }[it.slot || "bag"] || "Çanta") + '</span>';
      html += '<span class="inv2-row-meta">' + escAttr(metaLine(it)) + '</span>';
      html += '<span class="inv2-chev">▾</span>';
      html += '</button>';
      html += '<div class="inv2-row-body">';
      html += '<div class="inv2-grid">';
      html += '<label>Ad<input type="text" data-f="name" maxlength="48" value="' + escAttr(it.name) + '"/></label>';
      html += '<label>Adet<input type="number" data-f="qty" min="1" max="99" value="' + (it.qty || 1) + '"/></label>';
      html += '<label>Tür<select data-f="kind">' +
        invOpt("gear", kind, "Eşya") + invOpt("weapon", kind, "Silah") + invOpt("armor", kind, "Zırh") +
        '</select></label>';
      html += '<label>Slot<select data-f="slot">' +
        invOpt("bag", it.slot || "bag", "Çanta") +
        invOpt("mainhand", it.slot, "Sağ el") +
        invOpt("offhand", it.slot, "Sol el") +
        invOpt("armor", it.slot, "Zırh") +
        '</select></label>';
      html += '</div>';
      if (kind === "weapon") {
        html += '<div class="inv2-grid">';
        html += '<label>Hasar zarı<input type="text" data-f="damage" placeholder="1d8" value="' + escAttr(it.damage || "1d6") + '"/></label>';
        html += '<label>+Hasar<input type="number" data-f="damageBonus" value="' + (it.damageBonus || 0) + '"/></label>';
        html += '<label>Silah türü<select data-f="weaponType">' +
          invOpt("slashing", it.weaponType || "slashing", "Kesici") +
          invOpt("piercing", it.weaponType, "Saplama") +
          invOpt("bludgeoning", it.weaponType, "Ezici") +
          '</select></label>';
        html += '<label class="inv2-check"><input type="checkbox" data-f="twoHand"' + (it.twoHand ? " checked" : "") + '/> İki el</label>';
        html += '</div>';
      }
      if (kind === "armor") {
        html += '<div class="inv2-grid">';
        html += '<label>Zırh türü<select data-f="armorType">' +
          invOpt("light", it.armorType || "light", "Hafif") +
          invOpt("chain", it.armorType, "Zincir") +
          invOpt("plate", it.armorType, "Plate") +
          '</select></label>';
        html += '<label>Zırh puanı<input type="number" data-f="armorValue" min="0" value="' + (it.armorValue || 0) + '"/></label>';
        html += '<label>AC artışı<input type="number" data-f="acBonus" value="' + (it.acBonus || 0) + '"/></label>';
        html += '<label>Hız cezası<input type="number" data-f="speedPenalty" min="0" value="' + (it.speedPenalty || 0) + '"/></label>';
        html += '</div>';
      }
      html += '<label class="inv2-desc">Açıklama<textarea data-f="notes" rows="2" maxlength="200" placeholder="Eşya açıklaması…">' + escAttr(it.notes || "") + '</textarea></label>';
      html += '<div class="inv2-row-actions">';
      html += '<button type="button" class="btn btn-ghost btn-sm" data-del="' + idx + '">Sil</button>';
      html += '</div>';
      html += '</div></div>';
    });

    html += '</div></div>';
    box.innerHTML = html;

    function readAll() {
      const list = [];
      box.querySelectorAll(".inv2-row").forEach(function (row) {
        const g = function (f) { return row.querySelector("[data-f=\"" + f + "\"]"); };
        const kind = (g("kind") && g("kind").value) || "gear";
        const slot = (g("slot") && g("slot").value) || "bag";
        const item = {
          id: row.getAttribute("data-id") || invUid(),
          name: ((g("name") && g("name").value) || "").trim() || "Eşya",
          qty: Math.max(1, parseInt(g("qty") && g("qty").value, 10) || 1),
          notes: (g("notes") && g("notes").value) || "",
          slot: slot,
          kind: kind,
          weaponType: "",
          damage: "",
          damageBonus: 0,
          armorType: "",
          armorValue: 0,
          acBonus: 0,
          speedPenalty: 0,
          twoHand: false,
          equipped: slot === "mainhand" || slot === "offhand" || slot === "armor",
          _open: row.classList.contains("open"),
        };
        if (kind === "weapon") {
          item.damage = ((g("damage") && g("damage").value) || "1d6").trim() || "1d6";
          item.damageBonus = parseInt(g("damageBonus") && g("damageBonus").value, 10) || 0;
          item.weaponType = (g("weaponType") && g("weaponType").value) || "slashing";
          item.twoHand = !!(g("twoHand") && g("twoHand").checked);
        }
        if (kind === "armor") {
          item.armorType = (g("armorType") && g("armorType").value) || "light";
          item.armorValue = parseInt(g("armorValue") && g("armorValue").value, 10) || 0;
          item.acBonus = parseInt(g("acBonus") && g("acBonus").value, 10) || 0;
          item.speedPenalty = parseInt(g("speedPenalty") && g("speedPenalty").value, 10) || 0;
        }
        list.push(item);
      });
      // unique slots
      const used = Object.create(null);
      list.forEach(function (it) {
        if (it.slot === "bag") return;
        if (used[it.slot]) {
          it.slot = "bag";
          it.equipped = false;
        } else used[it.slot] = true;
      });
      return list;
    }

    box._readInv = readAll;

    box.querySelectorAll("[data-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const row = btn.closest(".inv2-row");
        if (!row) return;
        row.classList.toggle("open");
      });
    });
    box.querySelectorAll("[data-del]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const list = readAll();
        list.splice(+btn.getAttribute("data-del"), 1);
        renderInventoryEditor(list);
      });
    });
    box.querySelectorAll("[data-uneq]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const list = readAll();
        const i = +btn.getAttribute("data-uneq");
        if (list[i]) {
          list[i].slot = "bag";
          list[i].equipped = false;
        }
        renderInventoryEditor(list);
      });
    });
    box.querySelectorAll("[data-f=kind], [data-f=slot]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        const list = readAll();
        // two-hand clear offhand
        list.forEach(function (it) {
          if (it.slot === "mainhand" && it.twoHand) {
            list.forEach(function (o) {
              if (o !== it && o.slot === "offhand") {
                o.slot = "bag";
                o.equipped = false;
              }
            });
          }
        });
        renderInventoryEditor(list.map(function (x, i) {
          // keep the edited row open
          if (sel.closest(".inv2-row") && +sel.closest(".inv2-row").getAttribute("data-idx") === i) x._open = true;
          return x;
        }));
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
    const box = document.getElementById("invList");
    let cur = [];
    try {
      if (box && typeof box._readInv === "function") cur = box._readInv();
      else cur = readInventoryFromDom();
    } catch (_) { cur = readInventoryFromDom(); }
    cur.push({
      id: invUid(),
      name: "Yeni eşya",
      qty: 1,
      notes: "",
      slot: "bag",
      kind: "gear",
      equipped: false,
      _open: true,
    });
    renderInventoryEditor(cur);
  });
  document.getElementById("invTemplates")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tpl]");
    if (!btn) return;
    const i = +btn.dataset.tpl;
    const tpl = ITEM_TEMPLATES[i];
    if (!tpl) return;
    const cur = readInventoryFromDom();
    cur.push(Object.assign({ id: invUid(), qty: 1, notes: tpl.notes || "", equipped: false }, tpl));
    renderInventoryEditor(cur);
  });
  try {
    if (document.getElementById("invList") && !document.querySelector("#invList .inv2-row, #invList .inv2-empty")) {
      renderInventoryEditor([]);
    }
  } catch (_) {}

  renderList();
}


