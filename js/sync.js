/**
 * Origins live — tek ortak oda, otomatik bağlan
 * Dayanıklı: backoff, TURN, sık ağ-hatası döngüsü yok
 */
(function (global) {
  const FIXED_ROOM = "ORIGINS1330";
  // Host peer id — kısa ve sabit (cloud üzerinde)
  const PEER_HOST_ID = "origins1330live";

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
  let connecting = false;
  let failCount = 0;
  let mode = ""; // "host" | "guest"
  let lastStatus = "";

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
    if (msg === lastStatus) return;
    lastStatus = msg || "";
    const el = document.getElementById("roomStatus");
    if (el) el.textContent = lastStatus;
    if (onStatus) {
      try { onStatus(lastStatus); } catch (_) {}
    }
  }

  function peerOptions(withId) {
    // Açık bulut + STUN/TURN (NAT arkasında şans artırır)
    return {
      host: "0.peerjs.com",
      port: 443,
      path: "/",
      secure: true,
      debug: 0,
      pingInterval: 10000,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
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
    const n = Math.max(1, list.length);
    if (isHost) setStatus("Çevrimiçi · " + n + " kişi");
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
      return location.pathname.split("/").pop() || "index.html";
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
        setStatus("Bağlantı koptu");
        if (onHost) {
          try { onHost({ type: "host_lost" }); } catch (_) {}
        }
        if (wantAlive) scheduleReconnect(true);
      } else {
        publishPresence();
      }
    });
    c.on("open", () => {
      failCount = 0;
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
        setStatus("Çevrimiçi");
        startKeepAlive();
        sendPresence();
        try {
          c.send(JSON.stringify({ type: "request_state", from: ensureClientId(), t: Date.now() }));
        } catch (_) {}
      }
    });
    c.on("error", () => {
      if (!isHost && wantAlive) scheduleReconnect(false);
    });
  }

  function hardDestroy() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    connecting = false;
    try { connections.forEach((c) => { try { c.close(); } catch (_) {} }); } catch (_) {}
    try { if (conn) conn.close(); } catch (_) {}
    try { if (peer) peer.destroy(); } catch (_) {}
    peer = null;
    conn = null;
    connections = [];
    isHost = false;
    mode = "";
  }

  function startKeepAlive() {
    clearInterval(keepAliveTimer);
    keepAliveTimer = setInterval(() => {
      if (!wantAlive) return;
      try { sendPresence(); } catch (_) {}
    }, 6000);
  }

  function backoffMs() {
    // 1.5s, 3s, 6s, 10s, 15s tavan — sürekli spam yok
    const steps = [1500, 3000, 6000, 10000, 15000];
    return steps[Math.min(failCount, steps.length - 1)];
  }

  function scheduleReconnect(resetFails) {
    if (!wantAlive) return;
    if (resetFails) failCount = 0;
    else failCount += 1;

    // Çok fazla deneme: dur, kullanıcı ↻ bassın
    if (failCount >= 8) {
      connecting = false;
      setStatus("Bağlanamadı — ↻ dene veya sayfayı yenile");
      return;
    }

    clearTimeout(reconnectTimer);
    const wait = backoffMs();
    setStatus("Yeniden bağlanılacak (" + Math.round(wait / 1000) + "s)…");
    reconnectTimer = setTimeout(() => {
      if (!wantAlive) return;
      autoConnect(true);
    }, wait);
  }

  function tryBecomeHost() {
    hardDestroy();
    connecting = true;
    isHost = true;
    mode = "host";
    roomId = FIXED_ROOM;
    presenceMap = Object.create(null);
    setStatus("Ağa bağlanıyor…");

    if (typeof Peer === "undefined") {
      connecting = false;
      scheduleReconnect(false);
      return;
    }

    try {
      peer = new Peer(PEER_HOST_ID, peerOptions());
    } catch (e) {
      connecting = false;
      scheduleReconnect(false);
      return;
    }

    const openTimer = setTimeout(() => {
      if (peer && !peer.open && wantAlive && mode === "host") {
        // Host id açılmadı → misafir dene
        tryBecomeGuest();
      }
    }, 8000);

    peer.on("open", () => {
      clearTimeout(openTimer);
      connecting = false;
      failCount = 0;
      isHost = true;
      upsertPresence({
        id: ensureClientId(),
        name: displayName || "Oyuncu",
        host: true,
        page: currentPage(),
      });
      setStatus("Çevrimiçi · 1 kişi");
      startKeepAlive();
      sendPresence();
    });

    peer.on("connection", (c) => {
      if (connections.indexOf(c) < 0) connections.push(c);
      wireConn(c);
    });

    peer.on("error", (e) => {
      clearTimeout(openTimer);
      const tip = String((e && (e.type || e.message)) || "");
      if (tip.indexOf("unavailable-id") >= 0 || tip.indexOf("taken") >= 0) {
        // Host dolu → katıl
        tryBecomeGuest();
        return;
      }
      // network / server-error / socket-error
      connecting = false;
      if (wantAlive) scheduleReconnect(false);
    });

    peer.on("disconnected", () => {
      if (!wantAlive) return;
      setStatus("Kopuk — toparlanıyor…");
      try {
        peer.reconnect();
      } catch (_) {
        scheduleReconnect(false);
      }
    });

    peer.on("close", () => {
      if (wantAlive && mode === "host") scheduleReconnect(false);
    });
  }

  function tryBecomeGuest() {
    hardDestroy();
    connecting = true;
    isHost = false;
    mode = "guest";
    roomId = FIXED_ROOM;
    presenceMap = Object.create(null);
    setStatus("Masaya bağlanıyor…");

    if (typeof Peer === "undefined") {
      connecting = false;
      scheduleReconnect(false);
      return;
    }

    try {
      peer = new Peer(peerOptions());
    } catch (e) {
      connecting = false;
      scheduleReconnect(false);
      return;
    }

    peer.on("open", () => {
      try {
        conn = peer.connect(PEER_HOST_ID, { reliable: true });
      } catch (err) {
        connecting = false;
        // Host yok gibi — host ol
        setTimeout(() => { if (wantAlive) tryBecomeHost(); }, 400);
        return;
      }
      wireConn(conn);

      const failTimer = setTimeout(() => {
        if (conn && conn.open) return;
        connecting = false;
        // Host yanıt vermedi → host olmayı dene
        if (wantAlive) tryBecomeHost();
      }, 9000);

      conn.on("open", () => {
        clearTimeout(failTimer);
        connecting = false;
        failCount = 0;
        setStatus("Çevrimiçi");
        startKeepAlive();
        sendPresence();
        try {
          conn.send(JSON.stringify({ type: "request_state", from: ensureClientId(), t: Date.now() }));
        } catch (_) {}
      });

      conn.on("error", () => {
        clearTimeout(failTimer);
      });
    });

    peer.on("error", () => {
      connecting = false;
      if (wantAlive) scheduleReconnect(false);
    });

    peer.on("disconnected", () => {
      if (wantAlive) scheduleReconnect(false);
    });

    peer.on("close", () => {
      if (wantAlive && mode === "guest") scheduleReconnect(false);
    });
  }

  function autoConnect(force) {
    wantAlive = true;
    roomId = FIXED_ROOM;
    if (!displayName || displayName === "Oyuncu") {
      const saved = loadDisplayName();
      if (saved) displayName = saved;
    }
    ensureClientId();

    if (typeof Peer === "undefined") {
      setStatus("Bağlantı yükleniyor…");
      let tries = 0;
      const wait = setInterval(() => {
        tries += 1;
        if (typeof Peer !== "undefined") {
          clearInterval(wait);
          autoConnect(force);
        } else if (tries > 30) {
          clearInterval(wait);
          setStatus("Bağlantı yüklenemedi — sayfayı yenile");
        }
      }, 300);
      return;
    }

    // Zaten bağlıysa dokunma
    if (!force && peer && !peer.destroyed) {
      if (isHost && peer.open) {
        sendPresence();
        publishPresence();
        setStatus("Çevrimiçi · " + Math.max(1, Object.keys(presenceMap).length) + " kişi");
        return;
      }
      if (!isHost && conn && conn.open) {
        sendPresence();
        setStatus("Çevrimiçi");
        return;
      }
    }

    if (connecting && !force) return;

    if (force) {
      failCount = 0;
      lastStatus = "";
    }

    // Önce host dene; doluysa guest
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

  function hostRoom() { autoConnect(true); return FIXED_ROOM; }
  function joinRoom() { autoConnect(true); return FIXED_ROOM; }
  function reconnect() { failCount = 0; autoConnect(true); }
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
    setDisplayName(n) { saveDisplayName(n); },
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
      } catch (_) { return false; }
    },
    leaveRoom: () => {
      wantAlive = false;
      hardDestroy();
      setStatus("Çevrimdışı");
    },
    setWantAlive: (v) => { wantAlive = !!v; },
    roomId: () => FIXED_ROOM,
    clientId: () => ensureClientId(),
    getPresence: () => Object.values(presenceMap),
    loadSavedRoom: () => FIXED_ROOM,
    fillRoomInput: () => {},
    persistRoom: () => {},
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wantAlive) {
      if (!global.OriginsSync.isConnected()) {
        failCount = 0;
        autoConnect(true);
      } else {
        sendPresence();
      }
    }
  });
})(window);
