/**
 * Origins live — MQTT ortak kanal (PeerJS YOK)
 * Herkes aynı topic'e bağlanır; host/katıl yok.
 * Broker: genel ücretsiz WSS (EMQX / HiveMQ yedek)
 */
(function (global) {
  const TOPIC = "origins/1330/live/table/v3";
  const PRESENCE_TOPIC = "origins/1330/live/presence/v3";
  const BROKERS = [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://test.mosquitto.org:8081/mqtt",
    "wss://broker.hivemq.com:8884/mqtt",
  ];

  let client = null;
  let brokerIndex = 0;
  let wantAlive = false;
  let connected = false;
  let clientId = "";
  let displayName = "Oyuncu";
  let reconnectTimer = null;
  let presenceTimer = null;
  let failCount = 0;
  let lastStatus = "";
  let presenceMap = Object.create(null);
  let seq = 0;
  let connecting = false;

  let onState = null;
  let onTokenMove = null;
  let onFx = null;
  let onDice = null;
  let onChat = null;
  let onStatus = null;
  let onPresence = null;
  let onHost = null;
  let onRuler = null;
  let onMusic = null;

  function setStatus(msg) {
    if (msg === lastStatus) return;
    lastStatus = msg || "";
    const el = document.getElementById("roomStatus");
    if (el) el.textContent = lastStatus;
    if (onStatus) {
      try { onStatus(lastStatus); } catch (_) {}
    }
  }

  function ensureClientId() {
    if (clientId) return clientId;
    try { clientId = sessionStorage.getItem("origins_client_id") || ""; } catch (_) {}
    if (!clientId) {
      clientId = "c" + Math.random().toString(36).slice(2, 10);
      try { sessionStorage.setItem("origins_client_id", clientId); } catch (_) {}
    }
    return clientId;
  }

  function nextSeq() {
    seq += 1;
    return seq;
  }

  function loadDisplayName() {
    try {
      return (
        sessionStorage.getItem("origins_display_name") ||
        localStorage.getItem("origins_display_name") ||
        ""
      );
    } catch (_) {
      return "";
    }
  }

  function saveDisplayName(n) {
    displayName = (n || "Oyuncu").trim() || "Oyuncu";
    try {
      sessionStorage.setItem("origins_display_name", displayName);
      localStorage.setItem("origins_display_name", displayName);
    } catch (_) {}
  }

  function currentPage() {
    try {
      return location.pathname.split("/").pop() || "index.html";
    } catch (_) {
      return "index.html";
    }
  }

  function publishPresenceList() {
    const list = Object.values(presenceMap).sort((a, b) =>
      String(a.name).localeCompare(String(b.name), "tr")
    );
    try {
      if (typeof global.__originsRenderPresence === "function") {
        global.__originsRenderPresence(list);
      }
    } catch (_) {}
    if (onPresence) {
      try { onPresence(list); } catch (_) {}
    }
    if (connected) {
      const n = Math.max(1, list.length);
      setStatus("Çevrimiçi · " + n + " kişi");
    }
  }

  function upsertPresence(p) {
    if (!p || !p.id) return;
    // eski presence temizle (20 sn)
    presenceMap[p.id] = {
      id: p.id,
      name: p.name || "Oyuncu",
      host: false,
      ready: !!p.ready,
      page: p.page || "",
      t: Date.now(),
    };
    const now = Date.now();
    Object.keys(presenceMap).forEach((k) => {
      if (now - (presenceMap[k].t || 0) > 25000) delete presenceMap[k];
    });
    publishPresenceList();
  }

  function leanState(state) {
    if (!state || typeof state !== "object") return state;
    const out = Object.assign({}, state);
    if (Array.isArray(out.tokens)) {
      out.tokens = out.tokens.map((tk) => {
        const t = Object.assign({}, tk);
        // dataURL portreleri MQTT limitini aşar — lokal kalsın
        if (t.portrait && String(t.portrait).length > 200) t.portrait = "";
        if (t.atkSfx && String(t.atkSfx).length > 200) t.atkSfx = "";
        return t;
      });
    }
    // mapBg dataURL gönderme
    if (out.mapBg && String(out.mapBg).length > 500) out.mapBg = null;
    return out;
  }

  function publish(topic, obj) {
    if (!client || !connected) return false;
    try {
      const payload = JSON.stringify(obj);
      // ~200KB üstü gönderme
      if (payload.length > 200000) {
        console.warn("OriginsSync: mesaj çok büyük, atlandı", obj.type);
        return false;
      }
      client.publish(topic, payload, { qos: 0, retain: false });
      return true;
    } catch (e) {
      console.warn("publish", e);
      return false;
    }
  }

  function handleMessage(topic, raw) {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || !msg.type) return;
    // kendi mesajını yok say (state hariç echo kontrolü handler'da)
    const my = ensureClientId();
    if (msg.from && msg.from === my && msg.type !== "presence") {
      // presence kendi listemize de yazılır
      if (msg.type !== "presence") return;
    }
    if (msg.from && msg.from === my && msg.type === "presence") {
      upsertPresence(msg);
      return;
    }
    if (msg.from && msg.from === my) return;

    if (msg.type === "state" && onState) onState(msg.state, msg);
    if (msg.type === "token_move" && onTokenMove) onTokenMove(msg);
    if (msg.type === "fx" && onFx) onFx(msg);
    if (msg.type === "dice" && onDice) onDice(msg);
    if (msg.type === "chat" && onChat) onChat(msg);
    if (msg.type === "presence") upsertPresence(msg);
    if (msg.type === "ruler" && onRuler) onRuler(msg);
    if (msg.type === "music" && onMusic) {
      // büyük dataUrl'leri alma
      if (msg.dataUrl && String(msg.dataUrl).length > 5000) {
        msg = Object.assign({}, msg, { dataUrl: null });
      }
      onMusic(msg);
    }
    if (msg.type === "request_state" && typeof global.__originsGetState === "function") {
      // herkes cevap verebilir; küçük gecikme ile çakışmayı azalt
      setTimeout(() => {
        try {
          const st = leanState(global.__originsGetState());
          publish(TOPIC, {
            type: "state",
            state: st,
            from: ensureClientId(),
            t: Date.now(),
            seq: nextSeq(),
          });
        } catch (_) {}
      }, 150 + Math.random() * 400);
    }
  }

  function sendPresence() {
    const body = {
      type: "presence",
      id: ensureClientId(),
      name: displayName || "Oyuncu",
      host: false,
      page: currentPage(),
      t: Date.now(),
    };
    upsertPresence(body);
    publish(PRESENCE_TOPIC, body);
    publish(TOPIC, body);
  }

  function startPresencePulse() {
    clearInterval(presenceTimer);
    presenceTimer = setInterval(() => {
      if (wantAlive && connected) sendPresence();
    }, 5000);
  }

  function hardClose() {
    clearTimeout(reconnectTimer);
    clearInterval(presenceTimer);
    connecting = false;
    connected = false;
    try {
      if (client) {
        try { client.removeAllListeners(); } catch (_) {}
        try { client.end(true); } catch (_) {}
      }
    } catch (_) {}
    client = null;
  }

  function scheduleReconnect() {
    if (!wantAlive) return;
    failCount += 1;
    if (failCount >= 10) {
      setStatus("Bağlanamadı — ↻ veya sayfa yenile");
      return;
    }
    const wait = Math.min(15000, 1000 * failCount);
    setStatus("Yeniden denenecek (" + Math.round(wait / 1000) + "s)…");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (wantAlive) autoConnect(true);
    }, wait);
  }

  function connectBroker() {
    if (typeof mqtt === "undefined") {
      setStatus("Bağlantı kütüphanesi yok — yenile");
      return;
    }
    hardClose();
    connecting = true;
    const url = BROKERS[brokerIndex % BROKERS.length];
    setStatus("Ağa bağlanıyor…");

    const cid = "orig_" + ensureClientId().slice(0, 12) + "_" + Math.random().toString(36).slice(2, 6);
    try {
      client = mqtt.connect(url, {
        clientId: cid,
        clean: true,
        connectTimeout: 12000,
        reconnectPeriod: 0, // biz yönetiyoruz
        keepalive: 20,
        protocolVersion: 4,
      });
    } catch (e) {
      connecting = false;
      brokerIndex += 1;
      scheduleReconnect();
      return;
    }

    client.on("connect", () => {
      connecting = false;
      connected = true;
      failCount = 0;
      setStatus("Çevrimiçi");
      try {
        client.subscribe([TOPIC, PRESENCE_TOPIC], { qos: 0 });
      } catch (_) {}
      startPresencePulse();
      sendPresence();
      // masa state iste
      publish(TOPIC, {
        type: "request_state",
        from: ensureClientId(),
        t: Date.now(),
      });
    });

    client.on("message", (topic, buf) => {
      try {
        handleMessage(topic, buf.toString());
      } catch (e) {
        console.warn("msg", e);
      }
    });

    client.on("error", (err) => {
      console.warn("mqtt error", err && err.message);
      connected = false;
    });

    client.on("close", () => {
      connected = false;
      if (wantAlive) {
        brokerIndex += 1;
        scheduleReconnect();
      }
    });

    client.on("offline", () => {
      connected = false;
      setStatus("Kopuk…");
    });
  }

  function autoConnect(force) {
    wantAlive = true;
    if (!displayName || displayName === "Oyuncu") {
      const s = loadDisplayName();
      if (s) displayName = s;
    }
    ensureClientId();

    if (typeof mqtt === "undefined") {
      setStatus("Bağlantı yükleniyor…");
      let tries = 0;
      const t = setInterval(() => {
        tries += 1;
        if (typeof mqtt !== "undefined") {
          clearInterval(t);
          autoConnect(force);
        } else if (tries > 40) {
          clearInterval(t);
          setStatus("MQTT yüklenemedi — sayfayı yenile");
        }
      }, 250);
      return;
    }

    if (!force && connected && client) {
      sendPresence();
      return;
    }

    if (connecting && !force) return;
    if (force) failCount = 0;
    connectBroker();
  }

  function pushState(state) {
    publish(TOPIC, {
      type: "state",
      state: leanState(state),
      from: ensureClientId(),
      t: Date.now(),
      seq: nextSeq(),
    });
  }
  function pushTokenMove(id, cx, cy) {
    publish(TOPIC, {
      type: "token_move",
      id: id,
      cx: cx,
      cy: cy,
      from: ensureClientId(),
      t: Date.now(),
      seq: nextSeq(),
    });
  }
  function pushFx(payload) {
    publish(TOPIC, Object.assign({ type: "fx", from: ensureClientId(), t: Date.now(), seq: nextSeq() }, payload));
  }
  function pushDice(payload) {
    // zar stili büyük olabilir — sadeleştir
    const p = Object.assign({}, payload);
    if (p.diceStyle && p.diceStyle.color) {
      p.diceStyle = {
        color: p.diceStyle.color,
        color2: p.diceStyle.color2,
        shape: p.diceStyle.shape,
        anim: p.diceStyle.anim,
      };
    }
    publish(TOPIC, Object.assign({ type: "dice", from: ensureClientId(), t: Date.now(), seq: nextSeq() }, p));
  }
  function pushChat(entry) {
    publish(TOPIC, Object.assign({ type: "chat", from: ensureClientId(), t: (entry && entry.t) || Date.now() }, entry));
  }
  function pushRuler(payload) {
    publish(TOPIC, Object.assign({ type: "ruler", from: ensureClientId(), t: Date.now(), seq: nextSeq() }, payload));
  }
  function pushMusic(payload) {
    // mp3 dataUrl paylaşma — sadece kontrol mesajı
    const p = Object.assign({}, payload);
    if (p.dataUrl) delete p.dataUrl;
    publish(TOPIC, Object.assign({ type: "music", from: ensureClientId(), t: Date.now(), seq: nextSeq() }, p));
  }

  global.OriginsSync = {
    autoConnect: autoConnect,
    hostRoom: function () { autoConnect(true); return "LIVE"; },
    joinRoom: function () { autoConnect(true); return "LIVE"; },
    reconnect: function () { failCount = 0; autoConnect(true); },
    destroy: function () {
      wantAlive = false;
      hardClose();
      setStatus("Çevrimdışı");
    },
    pushState: pushState,
    pushChat: pushChat,
    pushTokenMove: pushTokenMove,
    pushFx: pushFx,
    pushDice: pushDice,
    pushRuler: pushRuler,
    pushMusic: pushMusic,
    sendPresence: sendPresence,
    setDisplayName: function (n) { saveDisplayName(n); },
    setHandlers: function (h) {
      h = h || {};
      onState = h.onState || null;
      onTokenMove = h.onTokenMove || null;
      onFx = h.onFx || null;
      onDice = h.onDice || null;
      onChat = h.onChat || null;
      onStatus = h.onStatus || null;
      onPresence = h.onPresence || null;
      onHost = h.onHost || null;
      onRuler = h.onRuler || null;
      onMusic = h.onMusic || null;
    },
    isHost: function () { return false; },
    isConnected: function () { return !!connected; },
    leaveRoom: function () {
      wantAlive = false;
      hardClose();
      setStatus("Çevrimdışı");
    },
    setWantAlive: function (v) { wantAlive = !!v; },
    roomId: function () { return "LIVE"; },
    clientId: function () { return ensureClientId(); },
    getPresence: function () { return Object.values(presenceMap); },
    loadSavedRoom: function () { return "LIVE"; },
    fillRoomInput: function () {},
    persistRoom: function () {},
  };

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && wantAlive) {
      if (!connected) autoConnect(true);
      else sendPresence();
    }
  });
})(window);
