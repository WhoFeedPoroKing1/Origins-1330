/**
 * Origins 1330 — Professional Inventory System
 * Foundry / Roll20 / BG3 inspired
 */
(function (global) {
  "use strict";

  const CATEGORIES = [
    { id: "weapon", label: "Silahlar", icon: "⚔" },
    { id: "armor", label: "Zırhlar", icon: "🛡" },
    { id: "clothing", label: "Kıyafetler", icon: "👕" },
    { id: "consumable", label: "Tüketilebilir", icon: "⚗" },
    { id: "material", label: "Malzemeler", icon: "⛏" },
    { id: "quest", label: "Görev", icon: "📜" },
    { id: "accessory", label: "Aksesuarlar", icon: "💍" },
    { id: "other", label: "Diğer", icon: "📦" },
  ];

  const RARITIES = [
    { id: "common", label: "Yaygın", color: "#9a9588" },
    { id: "uncommon", label: "Sıradışı", color: "#3d9e6f" },
    { id: "rare", label: "Nadir", color: "#5b8def" },
    { id: "epic", label: "Destansı", color: "#b07ce8" },
    { id: "legendary", label: "Efsanevi", color: "#d4af37" },
  ];

  const EQUIP_SLOTS = [
    { id: "mainhand", label: "Ana el", accepts: ["weapon", "other"] },
    { id: "offhand", label: "İkinci el", accepts: ["weapon", "armor", "accessory", "other"] },
    { id: "head", label: "Baş", accepts: ["armor", "clothing", "accessory"] },
    { id: "body", label: "Gövde", accepts: ["armor", "clothing"] },
    { id: "legs", label: "Bacak", accepts: ["armor", "clothing"] },
    { id: "feet", label: "Ayak", accepts: ["armor", "clothing"] },
    { id: "gloves", label: "Eldiven", accepts: ["armor", "clothing", "accessory"] },
    { id: "accessory1", label: "Aksesuar 1", accepts: ["accessory", "other"] },
    { id: "accessory2", label: "Aksesuar 2", accepts: ["accessory", "other"] },
  ];

  const CAT_ICONS = {
    weapon: "⚔", armor: "🛡", clothing: "👕", consumable: "⚗",
    material: "⛏", quest: "📜", accessory: "💍", other: "📦",
  };

  function uid() {
    return "it_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function emptyEquipment() {
    const e = {};
    EQUIP_SLOTS.forEach((s) => { e[s.id] = null; });
    return e;
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    // migrate old schema
    let category = raw.category || raw.kind || "other";
    if (category === "gear") category = "other";
    if (raw.slot === "armor" && !raw.category) category = "armor";
    if (raw.slot === "mainhand" || raw.slot === "offhand") {
      if (!raw.category && raw.kind === "weapon") category = "weapon";
    }
    return {
      id: raw.id || uid(),
      name: (raw.name || "Eşya").trim() || "Eşya",
      icon: raw.icon || "",
      description: raw.description || raw.notes || "",
      category: CATEGORIES.some((c) => c.id === category) ? category : "other",
      qty: Math.max(1, parseInt(raw.qty, 10) || 1),
      weight: Math.max(0, parseFloat(raw.weight) || 0),
      value: Math.max(0, parseFloat(raw.value) || 0),
      rarity: RARITIES.some((r) => r.id === raw.rarity) ? raw.rarity : "common",
      usage: raw.usage || "",
      properties: raw.properties || "",
      stackable: raw.stackable !== false,
      // combat
      damage: raw.damage || "",
      damageBonus: parseInt(raw.damageBonus, 10) || 0,
      weaponType: raw.weaponType || "",
      twoHand: !!raw.twoHand,
      armorType: raw.armorType || "",
      armorValue: parseInt(raw.armorValue, 10) || 0,
      acBonus: parseInt(raw.acBonus, 10) || 0,
      speedPenalty: parseInt(raw.speedPenalty, 10) || 0,
    };
  }

  function normalizeInv(data) {
    data = data || {};
    const items = Array.isArray(data.items)
      ? data.items.map(normalizeItem).filter(Boolean)
      : (Array.isArray(data) ? data.map(normalizeItem).filter(Boolean) : []);
    // migrate flat list with slot field
    let equipment = data.equipment && typeof data.equipment === "object"
      ? Object.assign(emptyEquipment(), data.equipment)
      : emptyEquipment();
    if (!data.equipment && Array.isArray(data)) {
      data.forEach((raw) => {
        const it = normalizeItem(raw);
        if (!it) return;
        const slotMap = { mainhand: "mainhand", offhand: "offhand", armor: "body" };
        if (raw.slot && slotMap[raw.slot] && !equipment[slotMap[raw.slot]]) {
          equipment[slotMap[raw.slot]] = it.id;
        }
      });
    }
    // ensure equipped ids exist
    Object.keys(equipment).forEach((k) => {
      if (equipment[k] && !items.find((i) => i.id === equipment[k])) equipment[k] = null;
    });
    return {
      items: items,
      equipment: equipment,
      carryCapacity: Math.max(1, parseFloat(data.carryCapacity) || 50),
      personalStorage: Array.isArray(data.personalStorage)
        ? data.personalStorage.map(normalizeItem).filter(Boolean)
        : [],
    };
  }

  function rarityColor(r) {
    const f = RARITIES.find((x) => x.id === r);
    return f ? f.color : "#9a9588";
  }

  function catLabel(id) {
    const c = CATEGORIES.find((x) => x.id === id);
    return c ? c.label : "Diğer";
  }

  function totalWeight(inv) {
    inv = normalizeInv(inv);
    return inv.items.reduce((s, it) => s + (it.weight || 0) * (it.qty || 1), 0);
  }

  function findItem(inv, id) {
    return (inv.items || []).find((x) => x.id === id) || null;
  }

  function isEquipped(inv, itemId) {
    return Object.values(inv.equipment || {}).includes(itemId);
  }

  function stackKey(it) {
    return [it.name, it.category, it.rarity, it.damage || "", it.armorValue || "", it.description || ""].join("|");
  }

  function tryStack(inv, item) {
    if (!item.stackable) return false;
    const key = stackKey(item);
    const exist = inv.items.find((x) => x.id !== item.id && x.stackable && stackKey(x) === key && !isEquipped(inv, x.id));
    if (!exist) return false;
    exist.qty += item.qty || 1;
    return true;
  }

  // ── Templates ──
  const TEMPLATES = [
    { name: "Uzun Kılıç", category: "weapon", damage: "1d8", weaponType: "slashing", weight: 3, value: 15, rarity: "common", description: "Standart çelik uzun kılıç." },
    { name: "Büyük Balta", category: "weapon", damage: "1d12", weaponType: "slashing", twoHand: true, weight: 7, value: 25, rarity: "uncommon", description: "İki elle savrulan ağır balta." },
    { name: "Mızrak", category: "weapon", damage: "1d6", weaponType: "piercing", weight: 3, value: 5, rarity: "common" },
    { name: "Savaş Çekici", category: "weapon", damage: "1d8", weaponType: "bludgeoning", weight: 4, value: 12, rarity: "common" },
    { name: "Hançer", category: "weapon", damage: "1d4", weaponType: "piercing", weight: 1, value: 2, rarity: "common" },
    { name: "Zincir Zırh", category: "armor", armorType: "chain", armorValue: 3, acBonus: 2, speedPenalty: 1, weight: 20, value: 50, rarity: "uncommon", description: "Halka örgü zırh." },
    { name: "Plate Zırh", category: "armor", armorType: "plate", armorValue: 5, acBonus: 3, speedPenalty: 2, weight: 35, value: 200, rarity: "rare", description: "Tam plaka zırh." },
    { name: "Deri Zırh", category: "armor", armorType: "light", armorValue: 1, acBonus: 1, weight: 8, value: 10, rarity: "common" },
    { name: "Kalkan", category: "armor", acBonus: 2, weight: 5, value: 10, rarity: "common", description: "Ahşap-çelik kalkan. İkinci ele takılır." },
    { name: "Sağlık İksiri", category: "consumable", weight: 0.5, value: 25, rarity: "uncommon", usage: "Aksiyon: 2d4+2 can yenile.", stackable: true },
    { name: "Halat (15m)", category: "material", weight: 5, value: 1, rarity: "common", stackable: true },
    { name: "Meşale", category: "material", weight: 1, value: 0.1, rarity: "common", stackable: true },
    { name: "Gümüş Yüzük", category: "accessory", weight: 0.1, value: 30, rarity: "uncommon", description: "Sade gümüş yüzük." },
    { name: "Seyahat Pelerini", category: "clothing", weight: 2, value: 5, rarity: "common" },
  ];

  // ── UI state ──
  let mountEl = null;
  let state = normalizeInv({});
  let onChange = null;
  let filterCat = "all";
  let searchQ = "";
  let viewTab = "inventory"; // inventory | storage | party
  let dragItemId = null;
  let detailId = null;

  function notify() {
    if (typeof onChange === "function") onChange(getData());
  }

  function getData() {
    return JSON.parse(JSON.stringify(normalizeInv(state)));
  }

  function setData(data) {
    state = normalizeInv(data);
    render();
  }

  function filteredItems() {
    let list = state.items.slice();
    if (filterCat !== "all") list = list.filter((i) => i.category === filterCat);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      list = list.filter((i) =>
        (i.name || "").toLowerCase().indexOf(q) >= 0 ||
        (i.description || "").toLowerCase().indexOf(q) >= 0 ||
        (i.properties || "").toLowerCase().indexOf(q) >= 0
      );
    }
    return list;
  }

  function equipItem(itemId, slotId) {
    const it = findItem(state, itemId);
    if (!it) return false;
    const slot = EQUIP_SLOTS.find((s) => s.id === slotId);
    if (!slot) return false;
    if (slot.accepts.indexOf(it.category) < 0 && it.category !== "other") {
      // soft allow other always for flexibility except strict armor slots
    }
    // unequip previous
    if (state.equipment[slotId]) {
      // stays in items
    }
    // remove from other slots
    Object.keys(state.equipment).forEach((k) => {
      if (state.equipment[k] === itemId) state.equipment[k] = null;
    });
    // two-hand
    if (slotId === "mainhand" && it.twoHand) {
      state.equipment.offhand = null;
    }
    if (slotId === "offhand") {
      const main = state.equipment.mainhand ? findItem(state, state.equipment.mainhand) : null;
      if (main && main.twoHand) {
        alert("Ana elde iki elli silah var — ikinci el kilitli.");
        return false;
      }
    }
    state.equipment[slotId] = itemId;
    notify();
    render();
    return true;
  }

  function unequipSlot(slotId) {
    if (state.equipment[slotId]) {
      state.equipment[slotId] = null;
      notify();
      render();
    }
  }

  function addItem(partial) {
    const it = normalizeItem(Object.assign({ id: uid() }, partial));
    if (tryStack(state, it)) {
      notify();
      render();
      return;
    }
    state.items.push(it);
    notify();
    render();
    return it.id;
  }

  function removeItem(itemId) {
    Object.keys(state.equipment).forEach((k) => {
      if (state.equipment[k] === itemId) state.equipment[k] = null;
    });
    state.items = state.items.filter((x) => x.id !== itemId);
    notify();
    render();
  }

  function updateItem(itemId, patch) {
    const it = findItem(state, itemId);
    if (!it) return;
    Object.assign(it, normalizeItem(Object.assign({}, it, patch, { id: itemId })));
    notify();
    render();
  }

  function transferQty(itemId, qty) {
    // placeholder for future player-to-player
    const it = findItem(state, itemId);
    if (!it) return null;
    qty = Math.min(it.qty, Math.max(1, qty || 1));
    if (qty >= it.qty) {
      const copy = normalizeItem(Object.assign({}, it, { id: uid() }));
      removeItem(itemId);
      return copy;
    }
    it.qty -= qty;
    notify();
    render();
    return normalizeItem(Object.assign({}, it, { id: uid(), qty: qty }));
  }

  function moveToStorage(itemId) {
    const it = findItem(state, itemId);
    if (!it) return;
    if (isEquipped(state, itemId)) {
      Object.keys(state.equipment).forEach((k) => {
        if (state.equipment[k] === itemId) state.equipment[k] = null;
      });
    }
    state.items = state.items.filter((x) => x.id !== itemId);
    state.personalStorage.push(it);
    notify();
    render();
  }

  function moveFromStorage(itemId) {
    const it = state.personalStorage.find((x) => x.id === itemId);
    if (!it) return;
    state.personalStorage = state.personalStorage.filter((x) => x.id !== itemId);
    if (!tryStack(state, it)) state.items.push(it);
    notify();
    render();
  }

  // ── Render ──
  function iconHtml(it) {
    if (it.icon && String(it.icon).indexOf("data:") === 0) {
      return '<img class="oi-icon-img" src="' + it.icon + '" alt="" />';
    }
    return '<span class="oi-icon-emoji">' + (CAT_ICONS[it.category] || "📦") + "</span>";
  }

  function renderWeightBar() {
    const w = totalWeight(state);
    const max = state.carryCapacity || 50;
    const pct = Math.min(100, Math.round((w / max) * 100));
    const over = w > max;
    return (
      '<div class="oi-weight' + (over ? " over" : "") + '">' +
      '<div class="oi-weight-top"><span>Taşınan ağırlık</span><span>' +
      w.toFixed(1) + " / " + max + " birim" + (over ? " ⚠ AŞILDI" : "") +
      "</span></div>" +
      '<div class="oi-weight-bar"><span style="width:' + pct + '%"></span></div></div>'
    );
  }

  function renderEquip() {
    let html = '<div class="oi-equip">';
    html += '<div class="oi-equip-title">Ekipman</div>';
    html += '<div class="oi-equip-grid">';
    EQUIP_SLOTS.forEach((slot) => {
      const id = state.equipment[slot.id];
      const it = id ? findItem(state, id) : null;
      html += '<div class="oi-equip-slot" data-slot="' + slot.id + '" data-drop-slot="' + slot.id + '">';
      html += '<div class="oi-equip-lab">' + esc(slot.label) + "</div>";
      if (it) {
        html +=
          '<div class="oi-equip-item" draggable="true" data-item-id="' + it.id + '" style="border-color:' + rarityColor(it.rarity) + '">' +
          iconHtml(it) +
          '<div class="oi-equip-name">' + esc(it.name) + "</div>" +
          '<button type="button" class="oi-uneq" data-uneq="' + slot.id + '" title="Çıkar">×</button>' +
          "</div>";
      } else {
        html += '<div class="oi-equip-empty">—</div>';
      }
      html += "</div>";
    });
    html += "</div></div>";
    return html;
  }

  function renderItemCard(it) {
    const eq = isEquipped(state, it.id);
    return (
      '<div class="oi-card" draggable="true" data-item-id="' + it.id + '" style="--rarity:' + rarityColor(it.rarity) + '">' +
      '<div class="oi-card-icon">' + iconHtml(it) + (it.qty > 1 ? '<span class="oi-qty">×' + it.qty + "</span>" : "") + "</div>" +
      '<div class="oi-card-body">' +
      '<div class="oi-card-name">' + esc(it.name) + (eq ? ' <span class="oi-eq-badge">Kuşanlı</span>' : "") + "</div>" +
      '<div class="oi-card-sub">' + esc(catLabel(it.category)) + " · " + esc((RARITIES.find((r) => r.id === it.rarity) || {}).label || "") +
      (it.weight ? " · " + it.weight + " br" : "") + "</div>" +
      "</div></div>"
    );
  }

  function renderGrid() {
    const list = filteredItems();
    if (!list.length) {
      return '<div class="oi-empty">Bu filtrede eşya yok. Şablon ekle veya “Yeni eşya” oluştur.</div>';
    }
    return '<div class="oi-grid">' + list.map(renderItemCard).join("") + "</div>";
  }

  function renderStorage() {
    const list = state.personalStorage || [];
    let html = '<div class="oi-storage-note">Kişisel depo — envanterden taşı, oturumlar arası saklanır.</div>';
    if (!list.length) html += '<div class="oi-empty">Depo boş.</div>';
    else {
      html += '<div class="oi-grid">';
      list.forEach((it) => {
        html +=
          '<div class="oi-card" data-storage-id="' + it.id + '" style="--rarity:' + rarityColor(it.rarity) + '">' +
          '<div class="oi-card-icon">' + iconHtml(it) + "</div>" +
          '<div class="oi-card-body"><div class="oi-card-name">' + esc(it.name) + '</div>' +
          '<button type="button" class="oi-btn-mini" data-from-store="' + it.id + '">Envantere al</button></div></div>';
      });
      html += "</div>";
    }
    return html;
  }

  function renderParty() {
    let party = [];
    try {
      party = JSON.parse(localStorage.getItem("origins_party_stash_v1") || "[]") || [];
    } catch (_) {}
    party = party.map(normalizeItem).filter(Boolean);
    let html = '<div class="oi-storage-note">Ortak grup deposu — aynı tarayıcıdaki tüm karakterler görür (DM paylaşımı yerel).</div>';
    html += '<div class="oi-party-actions"><button type="button" class="oi-btn" id="oiPartyDeposit">Seçili eşyayı gruba koy (detaydan)</button></div>';
    if (!party.length) html += '<div class="oi-empty">Grup deposu boş.</div>';
    else {
      html += '<div class="oi-grid">';
      party.forEach((it, i) => {
        html +=
          '<div class="oi-card" style="--rarity:' + rarityColor(it.rarity) + '">' +
          '<div class="oi-card-icon">' + iconHtml(it) + "</div>" +
          '<div class="oi-card-body"><div class="oi-card-name">' + esc(it.name) + " ×" + (it.qty || 1) + "</div>" +
          '<button type="button" class="oi-btn-mini" data-party-take="' + i + '">Al</button></div></div>';
      });
      html += "</div>";
    }
    return html;
  }

  function renderDetail() {
    if (!detailId) return "";
    const it = findItem(state, detailId) || (state.personalStorage || []).find((x) => x.id === detailId);
    if (!it) return "";
    const eqSlot = Object.keys(state.equipment).find((k) => state.equipment[k] === it.id);
    let html = '<div class="oi-detail-ov" id="oiDetailOv"><div class="oi-detail">';
    html += '<button type="button" class="oi-detail-x" id="oiDetailClose">×</button>';
    html += '<div class="oi-detail-top">';
    html += '<div class="oi-detail-icon" style="border-color:' + rarityColor(it.rarity) + '">' + iconHtml(it) + "</div>";
    html += '<div><h3 style="color:' + rarityColor(it.rarity) + '">' + esc(it.name) + "</h3>";
    html += '<div class="oi-detail-tags">' + esc(catLabel(it.category)) + " · " +
      esc((RARITIES.find((r) => r.id === it.rarity) || {}).label || "") +
      (eqSlot ? " · Kuşanlı (" + esc((EQUIP_SLOTS.find((s) => s.id === eqSlot) || {}).label || "") + ")" : "") +
      "</div></div></div>";
    html += '<div class="oi-detail-form">';
    const fields = [
      ["name", "Ad", "text"],
      ["qty", "Adet", "number"],
      ["weight", "Ağırlık", "number"],
      ["value", "Değer", "number"],
      ["category", "Kategori", "select-cat"],
      ["rarity", "Nadirlik", "select-rar"],
      ["usage", "Kullanım", "text"],
      ["properties", "Özel özellikler", "text"],
    ];
    fields.forEach((f) => {
      html += '<label class="oi-fl">' + f[1];
      if (f[2] === "select-cat") {
        html += '<select data-df="' + f[0] + '">' + CATEGORIES.map((c) =>
          '<option value="' + c.id + '"' + (it.category === c.id ? " selected" : "") + ">" + c.label + "</option>"
        ).join("") + "</select>";
      } else if (f[2] === "select-rar") {
        html += '<select data-df="' + f[0] + '">' + RARITIES.map((c) =>
          '<option value="' + c.id + '"' + (it.rarity === c.id ? " selected" : "") + ">" + c.label + "</option>"
        ).join("") + "</select>";
      } else {
        html += '<input type="' + f[2] + '" data-df="' + f[0] + '" value="' + esc(it[f[0]]) + '"/>';
      }
      html += "</label>";
    });
    html += '<label class="oi-fl full">Açıklama<textarea data-df="description" rows="3">' + esc(it.description) + "</textarea></label>";
    if (it.category === "weapon") {
      html += '<label class="oi-fl">Hasar<input data-df="damage" value="' + esc(it.damage || "1d6") + '"/></label>';
      html += '<label class="oi-fl">+Hasar<input type="number" data-df="damageBonus" value="' + (it.damageBonus || 0) + '"/></label>';
      html += '<label class="oi-fl">Silah türü<select data-df="weaponType">' +
        ["slashing|Kesici", "piercing|Saplama", "bludgeoning|Ezici"].map((p) => {
          const a = p.split("|");
          return '<option value="' + a[0] + '"' + (it.weaponType === a[0] ? " selected" : "") + ">" + a[1] + "</option>";
        }).join("") + "</select></label>";
      html += '<label class="oi-fl check"><input type="checkbox" data-df="twoHand"' + (it.twoHand ? " checked" : "") + '/> İki elli</label>';
    }
    if (it.category === "armor") {
      html += '<label class="oi-fl">Zırh türü<select data-df="armorType">' +
        ["light|Hafif", "chain|Zincir", "plate|Plate"].map((p) => {
          const a = p.split("|");
          return '<option value="' + a[0] + '"' + (it.armorType === a[0] ? " selected" : "") + ">" + a[1] + "</option>";
        }).join("") + "</select></label>";
      html += '<label class="oi-fl">Zırh puanı<input type="number" data-df="armorValue" value="' + (it.armorValue || 0) + '"/></label>';
      html += '<label class="oi-fl">AC+<input type="number" data-df="acBonus" value="' + (it.acBonus || 0) + '"/></label>';
      html += '<label class="oi-fl">Hız cezası<input type="number" data-df="speedPenalty" value="' + (it.speedPenalty || 0) + '"/></label>';
    }
    html += '<label class="oi-fl full">Görsel (ikon)<input type="file" id="oiIconFile" accept="image/*"/></label>';
    html += "</div>";
    html += '<div class="oi-detail-actions">';
    html += '<select id="oiEquipTo"><option value="">Kuşan → slot seç</option>' +
      EQUIP_SLOTS.map((s) => '<option value="' + s.id + '">' + s.label + "</option>").join("") + "</select>";
    html += '<button type="button" class="oi-btn gold" id="oiDoEquip">Kuşan</button>';
    if (eqSlot) html += '<button type="button" class="oi-btn" data-uneq="' + eqSlot + '">Çıkar</button>';
    html += '<button type="button" class="oi-btn" id="oiToStore">Depoya koy</button>';
    html += '<button type="button" class="oi-btn danger" id="oiDelete">Sil</button>';
    html += '<button type="button" class="oi-btn gold" id="oiSaveDetail">Kaydet</button>';
    html += "</div></div></div>";
    return html;
  }

  function render() {
    if (!mountEl) return;
    const tw = totalWeight(state);
    let html = '<div class="oi-root">';
    html += '<div class="oi-header">';
    html += '<div class="oi-title">Envanter</div>';
    html += '<div class="oi-tabs">';
    [["inventory", "Çanta"], ["storage", "Depo"], ["party", "Grup"]].forEach((t) => {
      html += '<button type="button" class="oi-tab' + (viewTab === t[0] ? " on" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
    });
    html += "</div></div>";
    html += renderWeightBar();
    html += '<div class="oi-main">';
    html += renderEquip();
    html += '<div class="oi-bag">';
    if (viewTab === "inventory") {
      html += '<div class="oi-toolbar">';
      html += '<input type="search" class="oi-search" id="oiSearch" placeholder="Eşya ara…" value="' + esc(searchQ) + '"/>';
      html += '<div class="oi-cats">';
      html += '<button type="button" class="oi-cat' + (filterCat === "all" ? " on" : "") + '" data-cat="all">Tümü</button>';
      CATEGORIES.forEach((c) => {
        html += '<button type="button" class="oi-cat' + (filterCat === c.id ? " on" : "") + '" data-cat="' + c.id + '">' + c.icon + " " + c.label + "</button>";
      });
      html += "</div></div>";
      html += renderGrid();
      html += '<div class="oi-footer">';
      html += '<button type="button" class="oi-btn gold" id="oiNew">+ Yeni eşya</button>';
      html += '<div class="oi-tpls">' + TEMPLATES.map((tpl, i) =>
        '<button type="button" class="oi-btn-mini" data-tpl="' + i + '">' + esc(tpl.name) + "</button>"
      ).join("") + "</div>";
      html += '<label class="oi-cap">Kapasite <input type="number" id="oiCap" min="1" value="' + state.carryCapacity + '"/></label>';
      html += "</div>";
    } else if (viewTab === "storage") {
      html += renderStorage();
    } else {
      html += renderParty();
    }
    html += "</div></div>";
    html += renderDetail();
    html += "</div>";
    mountEl.innerHTML = html;
    bind();
  }

  function bind() {
    mountEl.querySelectorAll("[data-tab]").forEach((b) => {
      b.addEventListener("click", () => { viewTab = b.dataset.tab; render(); });
    });
    mountEl.querySelectorAll("[data-cat]").forEach((b) => {
      b.addEventListener("click", () => { filterCat = b.dataset.cat; render(); });
    });
    const search = mountEl.querySelector("#oiSearch");
    if (search) {
      search.addEventListener("input", () => {
        searchQ = search.value || "";
        // soft re-filter without losing focus: just update grid
        filterCat = filterCat;
        const bag = mountEl.querySelector(".oi-bag .oi-grid, .oi-bag .oi-empty");
        // full render is ok with caret restore
        const pos = search.selectionStart;
        render();
        const s2 = mountEl.querySelector("#oiSearch");
        if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (_) {} }
      });
    }
    mountEl.querySelectorAll("[data-item-id]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".oi-uneq")) return;
        detailId = el.getAttribute("data-item-id");
        render();
      });
      el.addEventListener("dragstart", (e) => {
        dragItemId = el.getAttribute("data-item-id");
        e.dataTransfer.setData("text/oi-item", dragItemId);
        e.dataTransfer.effectAllowed = "move";
      });
    });
    mountEl.querySelectorAll("[data-drop-slot]").forEach((slot) => {
      slot.addEventListener("dragover", (e) => { e.preventDefault(); slot.classList.add("drag-over"); });
      slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        slot.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/oi-item") || dragItemId;
        if (id) equipItem(id, slot.getAttribute("data-drop-slot"));
      });
    });
    mountEl.querySelectorAll("[data-uneq]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        unequipSlot(b.getAttribute("data-uneq"));
      });
    });
    mountEl.querySelector("#oiNew")?.addEventListener("click", () => {
      const id = addItem({ name: "Yeni eşya", category: "other", rarity: "common", qty: 1, weight: 1, _open: true });
      detailId = id;
      render();
    });
    mountEl.querySelectorAll("[data-tpl]").forEach((b) => {
      b.addEventListener("click", () => {
        const tpl = TEMPLATES[+b.dataset.tpl];
        if (tpl) addItem(Object.assign({}, tpl));
      });
    });
    mountEl.querySelector("#oiCap")?.addEventListener("change", (e) => {
      state.carryCapacity = Math.max(1, +e.target.value || 50);
      notify();
      render();
    });
    mountEl.querySelector("#oiDetailClose")?.addEventListener("click", () => {
      detailId = null;
      render();
    });
    mountEl.querySelector("#oiDetailOv")?.addEventListener("click", (e) => {
      if (e.target.id === "oiDetailOv") { detailId = null; render(); }
    });
    mountEl.querySelector("#oiSaveDetail")?.addEventListener("click", () => {
      if (!detailId) return;
      const patch = {};
      mountEl.querySelectorAll("[data-df]").forEach((el) => {
        const k = el.getAttribute("data-df");
        if (el.type === "checkbox") patch[k] = el.checked;
        else patch[k] = el.value;
      });
      updateItem(detailId, patch);
      detailId = null;
    });
    mountEl.querySelector("#oiDelete")?.addEventListener("click", () => {
      if (!detailId) return;
      if (!confirm("Eşya silinsin mi?")) return;
      removeItem(detailId);
      detailId = null;
    });
    mountEl.querySelector("#oiDoEquip")?.addEventListener("click", () => {
      const slot = mountEl.querySelector("#oiEquipTo")?.value;
      if (!slot || !detailId) return alert("Slot seç.");
      equipItem(detailId, slot);
    });
    mountEl.querySelector("#oiToStore")?.addEventListener("click", () => {
      if (!detailId) return;
      moveToStorage(detailId);
      detailId = null;
    });
    mountEl.querySelector("#oiIconFile")?.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f || !detailId) return;
      const reader = new FileReader();
      reader.onload = () => {
        // compress
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          const max = 96;
          let w = img.width, h = img.height;
          const r = Math.min(max / w, max / h, 1);
          c.width = Math.round(w * r);
          c.height = Math.round(h * r);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          updateItem(detailId, { icon: c.toDataURL("image/jpeg", 0.7) });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
    mountEl.querySelectorAll("[data-from-store]").forEach((b) => {
      b.addEventListener("click", () => moveFromStorage(b.getAttribute("data-from-store")));
    });
    mountEl.querySelectorAll("[data-party-take]").forEach((b) => {
      b.addEventListener("click", () => {
        let party = [];
        try { party = JSON.parse(localStorage.getItem("origins_party_stash_v1") || "[]") || []; } catch (_) {}
        const i = +b.getAttribute("data-party-take");
        const it = party[i];
        if (!it) return;
        party.splice(i, 1);
        try { localStorage.setItem("origins_party_stash_v1", JSON.stringify(party)); } catch (_) {}
        if (!tryStack(state, normalizeItem(it))) state.items.push(normalizeItem(it));
        notify();
        render();
      });
    });
  }

  function mount(el, data, changeCb) {
    mountEl = typeof el === "string" ? document.querySelector(el) : el;
    onChange = changeCb || null;
    state = normalizeInv(data);
    filterCat = "all";
    searchQ = "";
    viewTab = "inventory";
    detailId = null;
    render();
  }

  function unmount() {
    if (mountEl) mountEl.innerHTML = "";
    mountEl = null;
  }

  // Combat helpers for VTT
  function getEquippedWeapon(inv) {
    inv = normalizeInv(inv);
    const id = inv.equipment.mainhand || inv.equipment.offhand;
    return id ? findItem(inv, id) : null;
  }
  function getEquippedArmor(inv) {
    inv = normalizeInv(inv);
    // body first, then any armor in slots
    const order = ["body", "head", "legs", "feet", "gloves", "offhand"];
    for (let i = 0; i < order.length; i++) {
      const id = inv.equipment[order[i]];
      const it = id ? findItem(inv, id) : null;
      if (it && (it.category === "armor" || it.armorValue || it.acBonus)) return it;
    }
    return null;
  }

  global.OriginsInventory = {
    CATEGORIES,
    RARITIES,
    EQUIP_SLOTS,
    TEMPLATES,
    normalizeInv,
    normalizeItem,
    totalWeight,
    mount,
    unmount,
    getData,
    setData,
    getEquippedWeapon,
    getEquippedArmor,
    addItem,
    emptyEquipment,
  };
})(typeof window !== "undefined" ? window : this);
