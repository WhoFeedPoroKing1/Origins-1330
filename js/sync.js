/**
 * Origins live — tek ortak oda, otomatik bağlan
 * Oda kodu yok: siteye giren herkes aynı ağa düşer.
 * Sayfa değişince yeniden bağlanır (host seçimi otomatik).
 */
(function (global) {
  const FIXED_ROOM = "ORIGINS1330";
  const PEER_HOST_ID = "origins1330-live-v2";

  let peer = null;
  let conn = null;
  let connections = [];
  let isHost = false;
  let roomId = FIXED_ROOM;
  let clientId = "";
  let displayName = "Oyuncu";
  let wantAlive = false;
  let reconnectTimer = null;
  let keepAliveTimer = null;
  let hostClaimTimer = null;
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
  let seq = 0;
  let presenceMap = Object.create(null);

  function setStatus(msg) {
    const el = document.getElementById("roomStatus");
    if (el) el.textContent = msg || "";
    if (onStatus) {
      try { onStatus(msg); } catch (_) {}
    }
  }

  function peerOptions() {
    return {
      debug: 0,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
        ],
      },
    };
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

  function sendRaw(payload, exceptConn) {
    const str = typeof payload === "string" ? payload : JSON.stringify(payload);
    if (isHost) {
      connections.forEach((c) => {
        if (exceptConn && c === exceptConn) return;
        try { if (c.open) c.send(str); } catch (_) {}
      });
    } else if (conn && conn.open) {
      try { conn.send(str); } catch (_) {}
    }
  }

  function broadcast(data) {
    sendRaw(data, null);
  }

  function publishPresence() {
    const list = Object.values(presenceMap).sort((a, b) => {
      if (a.host && !b.host) return -1;
      if (!a.host && b.host) return 1;
      return String(a.name).localeCompare(String(b.name), "tr");
    });
    try {
      if (typeof global.__originsRenderPresence === "function") {
        global.__originsRenderPresence(list);
      }
    } catch (_) {}
    if (onPresence) {
      try { onPresence(list); } catch (_) {}
    }
    const n = list.length || 1;
    if (isHost) setStatus("Çevrimiçi · " + n + " kişi · host");
    else if (conn && conn.open) setStatus("Çevrimiçi · " + n + " kişi");
  }

  function upsertPresence(p) {
    if (!p || !p.id) return;
    presenceMap[p.id] = {
      id: p.id,
      name: p.name || "Oyuncu",
      host: !!p.host,
      ready: !!p.ready,
      page: p.page || "",
      t: Date.now(),
    };
    publishPresence();
  }

  function currentPage() {
    try {
      return (location.pathname.split("/").pop() || "index.html") || "index.html";
    } catch (_) {
      return "index.html";
    }
  }

  function sendPresence() {
    const body = {
      type: "presence",
      id: ensureClientId(),
      name: displayName || "Oyuncu",
      host: isHost,
      ready: false,
      page: currentPage(),
      t: Date.now(),
    };
    upsertPresence(body);
    broadcast(body);
  }

  function handleData(raw, fromConn) {
    let msg;
    try { msg = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
    if (!msg || !msg.type) return;

    if (isHost && fromConn) sendRaw(msg, fromConn);

    if (msg.type === "state" && onState) onState(msg.state, msg);
    if (msg.type === "token_move" && onTokenMove) onTokenMove(msg);
    if (msg.type === "fx" && onFx) onFx(msg);
    if (msg.type === "dice" && onDice) onDice(msg);
    if (msg.type === "chat" && onChat) onChat(msg);
    if (msg.type === "presence") upsertPresence(msg);
    if (msg.type === "presence_list" && Array.isArray(msg.list)) {
      presenceMap = Object.create(null);
      msg.list.forEach((p) => upsertPresence(p));
    }
    if (msg.type === "host_offer" && onHost) onHost(msg);
    if (msg.type === "ruler" && onRuler) onRuler(msg);
    if (msg.type === "music" && onMusic) onMusic(msg);
    if (msg.type === "request_state" && isHost && typeof global.__originsGetState === "function") {
      const body = {
        type: "state",
        state: global.__originsGetState(),
        from: ensureClientId(),
        t: Date.now(),
      };
      try {
        if (fromConn && fromConn.open) fromConn.send(JSON.stringify(body));
        else broadcast(body);
      } catch (_) {}
      try {
        const pl = { type: "presence_list", list: Object.values(presenceMap), from: ensureClientId() };
        if (fromConn && fromConn.open) fromConn.send(JSON.stringify(pl));
      } catch (_) {}
    }
  }

  function wireConn(c) {
    if (isHost && connections.indexOf(c) < 0) connections.push(c);
    c.on("data", (raw) => handleData(raw, c));
    c.on("close", () => {
      connections = connections.filter((x) => x !== c);
      if (!isHost) {
        setStatus("Bağlantı koptu — yeniden…");
        if (onHost) {
          try { onHost({ type: "host_lost" }); } catch (_) {}
        }
        if (wantAlive) scheduleReconnect(400);
      } else {
        publishPresence();
      }
    });
    c.on("open", () => {
      if (isHost) {
        if (connections.indexOf(c) < 0) connections.push(c);
        if (typeof global.__originsGetState === "function") {
          try {
            c.send(JSON.stringify({
              type: "state",
              state: global.__originsGetState(),
              from: ensureClientId(),
              t: Date.now(),
            }));
          } catch (_) {}
        }
        try {
          c.send(JSON.stringify({
            type: "presence_list",
            list: Object.values(presenceMap),
            from: ensureClientId(),
          }));
        } catch (_) {}
        sendPresence();
        publishPresence();
      } else {
        setStatus("Çevrimiçi · bağlı");
        try {
          c.send(JSON.stringify({ type: "request_state", from: ensureClientId(), t: Date.now() }));
        } catch (_) {}
        sendPresence();
      }
    });
    c.on("error", () => {
      if (!isHost && wantAlive) scheduleReconnect(800);
    });
  }

  function hardDestroy() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    clearTimeout(hostClaimTimer);
    hostClaimTimer = null;
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    try { connections.forEach((c) => c.close()); } catch (_) {}
    try { if (conn) conn.close(); } catch (_) {}
    try { if (peer) peer.destroy(); } catch (_) {}
    peer = null;
    conn = null;
    connections = [];
    isHost = false;
    connecting = false;
  }

  function startKeepAlive() {
    clearInterval(keepAliveTimer);
    keepAliveTimer = setInterval(() => {
      if (!wantAlive) return;
      try { sendPresence(); } catch (_) {}
    }, 4000);
  }

  function scheduleReconnect(ms) {
    if (!wantAlive) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (!wantAlive) return;
      autoConnect(true);
    }, ms || 600);
  }

  /** Host olmayı dene; ID doluysa misafir olarak katıl */
  function tryBecomeHost() {
    hardDestroy();
    connecting = true;
    isHost = true;
    roomId = FIXED_ROOM;
    presenceMap = Object.create(null);
    setStatus("Ağa bağlanıyor…");

    try {
      peer = new Peer(PEER_HOST_ID, peerOptions());
    } catch (e) {
      connecting = false;
      setStatus("Peer yok");
      scheduleReconnect(1500);
      return;
    }

    peer.on("open", () => {
      connecting = false;
      isHost = true;
      upsertPresence({
        id: ensureClientId(),
        name: displayName || "Oyuncu",
        host: true,
        page: currentPage(),
      });
      setStatus("Çevrimiçi · host sensin");
      startKeepAlive();
      sendPresence();
      if (typeof global.__originsGetState === "function") {
        try {
          broadcast({
            type: "state",
            state: global.__originsGetState(),
            from: ensureClientId(),
            t: Date.now(),
          });
        } catch (_) {}
      }
    });

    peer.on("connection", (c) => {
      if (connections.indexOf(c) < 0) connections.push(c);
      wireConn(c);
    });

    peer.on("error", (e) => {
      const tip = String(e.type || e.message || "");
      if (tip.indexOf("unavailable-id") >= 0 || tip.indexOf("taken") >= 0) {
        // Host zaten var → katıl
        tryBecomeGuest();
      } else if (tip.indexOf("network") >= 0) {
        setStatus("Ağ hatası — yeniden…");
        scheduleReconnect(1200);
      } else {
        setStatus("Hata: " + tip);
        scheduleReconnect(1500);
      }
    });

    peer.on("disconnected", () => {
      if (!wantAlive) return;
      try { peer.reconnect(); } catch (_) { scheduleReconnect(1000); }
    });

    peer.on("close", () => {
      if (wantAlive) scheduleReconnect(800);
    });
  }

  function tryBecomeGuest() {
    hardDestroy();
    connecting = true;
    isHost = false;
    roomId = FIXED_ROOM;
    presenceMap = Object.create(null);
    setStatus("Masaya bağlanıyor…");

    try {
      peer = new Peer(peerOptions());
    } catch (e) {
      connecting = false;
      scheduleReconnect(1500);
      return;
    }

    peer.on("open", () => {
      connecting = false;
      try {
        conn = peer.connect(PEER_HOST_ID, { reliable: true });
      } catch (err) {
        scheduleReconnect(1000);
        return;
      }
      wireConn(conn);

      const failTimer = setTimeout(() => {
        if (conn && conn.open) return;
        // Host yok / yanıt yok → host olmayı dene
        setStatus("Host yok — üstleniliyor…");
        tryBecomeHost();
      }, 7000);

      conn.on("open", () => {
        clearTimeout(failTimer);
        setStatus("Çevrimiçi · bağlı");
        startKeepAlive();
        sendPresence();
        try {
          conn.send(JSON.stringify({ type: "request_state", from: ensureClientId(), t: Date.now() }));
        } catch (_) {}
      });
    });

    peer.on("error", (e) => {
      const tip = String(e.type || e.message || "");
      setStatus("Bağlantı…");
      scheduleReconnect(1200);
    });

    peer.on("disconnected", () => {
      if (wantAlive) scheduleReconnect(1000);
    });

    peer.on("close", () => {
      if (wantAlive) scheduleReconnect(800);
    });
  }

  /**
   * Otomatik bağlan — oda kodu yok.
   * force=true ise mevcut bağlantıyı kırıp yeniden dener.
   */
  function autoConnect(force) {
    wantAlive = true;
    roomId = FIXED_ROOM;
    if (!displayName || displayName === "Oyuncu") {
      const saved = loadDisplayName();
      if (saved) displayName = saved;
    }
    ensureClientId();

    // PeerJS henüz yüklenmediyse bekle
    if (typeof Peer === "undefined") {
      setStatus("Bağlantı kütüphanesi yükleniyor…");
      let tries = 0;
      const wait = setInterval(() => {
        tries += 1;
        if (typeof Peer !== "undefined") {
          clearInterval(wait);
          autoConnect(force);
        } else if (tries > 40) {
          clearInterval(wait);
          setStatus("Bağlantı yüklenemedi — sayfayı yenile");
        }
      }, 250);
      return;
    }

    if (!force && peer && !peer.destroyed) {
      if (isHost && peer.open) {
        sendPresence();
        publishPresence();
        return;
      }
      if (!isHost && conn && conn.open) {
        sendPresence();
        return;
      }
    }

    if (connecting && !force) return;
    // Önce host olmayı dene; doluysa misafir
    tryBecomeHost();
  }

  function pushState(state) {
    broadcast({ type: "state", state, from: ensureClientId(), t: Date.now(), seq: nextSeq() });
  }
  function pushTokenMove(id, cx, cy) {
    broadcast({ type: "token_move", id, cx, cy, from: ensureClientId(), t: Date.now(), seq: nextSeq() });
  }
  function pushFx(payload) {
    broadcast(Object.assign({ type: "fx", from: ensureClientId(), t: Date.now(), seq: nextSeq() }, payload));
  }
  function pushDice(payload) {
    broadcast(Object.assign({ type: "dice", from: ensureClientId(), t: Date.now(), seq: nextSeq() }, payload));
  }
  function pushChat(entry) {
    broadcast(Object.assign({ type: "chat", from: ensureClientId(), t: (entry && entry.t) || Date.now() }, entry));
  }
  function pushRuler(payload) {
    broadcast(Object.assign({ type: "ruler", from: ensureClientId(), t: Date.now(), seq: nextSeq() }, payload));
  }
  function pushMusic(payload) {
    broadcast(Object.assign({ type: "music", from: ensureClientId(), t: Date.now(), seq: nextSeq() }, payload));
  }

  // Eski API uyumu
  function hostRoom() {
    autoConnect(true);
    return FIXED_ROOM;
  }
  function joinRoom() {
    autoConnect(true);
    return FIXED_ROOM;
  }
  function reconnect() {
    autoConnect(true);
  }
  function destroy(force) {
    if (!force && wantAlive) return;
    wantAlive = false;
    hardDestroy();
  }

  global.OriginsSync = {
    autoConnect,
    hostRoom,
    joinRoom,
    reconnect,
    destroy,
    pushState,
    pushChat,
    pushTokenMove,
    pushFx,
    pushDice,
    pushRuler,
    pushMusic,
    sendPresence,
    setDisplayName(n) {
      saveDisplayName(n);
    },
    setHandlers(h) {
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
    isHost: () => isHost,
    isConnected: () => {
      try {
        if (!peer || peer.destroyed) return false;
        if (isHost) return !!peer.open;
        return !!(conn && conn.open);
      } catch (_) {
        return false;
      }
    },
    leaveRoom: () => {
      wantAlive = false;
      hardDestroy();
      setStatus("Çevrimdışı");
    },
    setWantAlive: (v) => {
      wantAlive = !!v;
    },
    roomId: () => FIXED_ROOM,
    clientId: () => ensureClientId(),
    getPresence: () => Object.values(presenceMap),
    loadSavedRoom: () => FIXED_ROOM,
    fillRoomInput: () => {},
    persistRoom: () => {},
  };

  // Sayfa görünür olunca canlı tut
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wantAlive) {
      if (!global.OriginsSync.isConnected()) autoConnect(true);
      else sendPresence();
    }
  });
})(window);
