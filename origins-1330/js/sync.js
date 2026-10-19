/**
 * Origins live room — PeerJS + host relay + presence
 */
(function (global) {
  let peer = null;
  let conn = null;
  let connections = [];
  let isHost = false;
  let roomId = "";
  let clientId = "";
  let displayName = "Oyuncu";
  let wantAlive = false; // sekme değişse bile odayı tut
  let reconnectTimer = null;
  let keepAliveTimer = null;
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
  let heartbeatTimer = null;

  function setStatus(msg) {
    const el = document.getElementById("roomStatus");
    if (el) el.textContent = msg || "";
    if (onStatus) onStatus(msg);
  }

  function randomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  /** PeerJS cloud + public STUN — NAT arkasında bağlantı şansı artar */
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

  function peerRoomId(code) {
    return "origins1330-" + String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function persistRoom(code, asHost) {
    if (!code) return;
    try {
      localStorage.setItem("origins_room_code", code);
      localStorage.setItem("origins_was_host", asHost ? "1" : "0");
      sessionStorage.setItem("origins_last_room", code);
      sessionStorage.setItem("origins_was_host", asHost ? "1" : "0");
    } catch (_) {}
  }

  function loadSavedRoom() {
    try {
      return (
        localStorage.getItem("origins_room_code") ||
        sessionStorage.getItem("origins_last_room") ||
        ""
      ).toUpperCase();
    } catch (_) {
      return "";
    }
  }

  function loadWasHost() {
    try {
      const ls = localStorage.getItem("origins_was_host");
      if (ls != null) return ls === "1";
      return sessionStorage.getItem("origins_was_host") === "1";
    } catch (_) {
      return false;
    }
  }

  function fillRoomInput(code) {
    const input = document.getElementById("roomCode");
    if (input && code) input.value = code;
  }

  function ensureClientId() {
    if (clientId) return clientId;
    try { clientId = sessionStorage.getItem("origins_client_id") || ""; } catch (_) {}
    if (!clientId) {
      clientId = "c" + Math.random().toString(36).slice(2, 9);
      try { sessionStorage.setItem("origins_client_id", clientId); } catch (_) {}
    }
    return clientId;
  }

  function nextSeq() {
    seq += 1;
    return seq;
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
  }

  function upsertPresence(p) {
    if (!p || !p.id) return;
    presenceMap[p.id] = {
      id: p.id,
      name: p.name || "Oyuncu",
      host: !!p.host,
      ready: !!p.ready,
      t: Date.now(),
    };
    publishPresence();
    if (roomId) {
      const n = Object.keys(presenceMap).length;
      setStatus("Oda " + roomId + " · " + n + " çevrimiçi");
    }
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
      msg.list.forEach((p) => {
        if (!p || !p.id) return;
        presenceMap[p.id] = {
          id: p.id,
          name: p.name || "Oyuncu",
          host: !!p.host,
          ready: !!p.ready,
          t: Date.now(),
        };
      });
      publishPresence();
      if (roomId) setStatus("Oda " + roomId + " · " + Object.keys(presenceMap).length + " çevrimiçi");
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
      // also send presence roster
      try {
        const pl = {
          type: "presence_list",
          list: Object.values(presenceMap),
          from: ensureClientId(),
        };
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
        if (onHost) onHost({ type: "host_lost" });
        if (wantAlive) scheduleReconnect("Host bağlantısı koptu");
      } else {
        const n = Object.keys(presenceMap).length || (connections.length + 1);
        setStatus("Oda " + roomId + " · " + n + " çevrimiçi");
        if (onPresence) onPresence(Object.values(presenceMap));
      }
    });
    c.on("open", () => {
      if (isHost) {
        if (connections.indexOf(c) < 0) connections.push(c);
        const n = Object.keys(presenceMap).length || (connections.length + 1);
        setStatus("Oda " + roomId + " · " + n + " çevrimiçi");
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
        // host announces self again
        sendPresence(false);
      } else {
        setStatus("Odaya bağlandı: " + roomId);
        try { c.send(JSON.stringify({ type: "request_state", from: ensureClientId() })); } catch (_) {}
        sendPresence(false);
      }
    });
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => sendPresence(!!presenceMap[ensureClientId()]?.ready), 3000);
  }

  function sendPresence(ready) {
    const payload = {
      type: "presence",
      id: ensureClientId(),
      name: displayName || "Oyuncu",
      host: isHost,
      ready: !!ready,
      t: Date.now(),
    };
    upsertPresence(payload);
    broadcast(payload);
    // Host rebroadcast full list so everyone sees all names
    if (isHost) {
      try {
        broadcast({
          type: "presence_list",
          list: Object.values(presenceMap),
          from: ensureClientId(),
        });
      } catch (_) {}
    }
    const n = Object.keys(presenceMap).length;
    if (roomId) setStatus("Oda " + roomId + " · " + n + " çevrimiçi");
  }

  /**
   * hostRoom(code, name, opts)
   * opts.forceNew = true → her "Oda aç"ta yeni rastgele kod (varsayılan true if no code)
   */
  function hostRoom(code, name, opts) {
    opts = opts || {};
    if (name) displayName = name;
    ensureClientId();

    const explicit = (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
    const forceNew = opts.forceNew !== false && !explicit;
    // Sadece kullanıcı bilinçli kod yazdıysa onu kullan; boşsa HER SEFERİNDE yeni kod
    let next = explicit;
    if (!next) next = randomCode();

    // Aynı kodla zaten host ve peer canlıysa yeniden kurma
    if (!forceNew && isHost && peer && roomId === next && !peer.destroyed && peer.open) {
      wantAlive = true;
      fillRoomInput(roomId);
      persistRoom(roomId, true);
      const n = Object.keys(presenceMap).length || 1;
      setStatus("Oda " + roomId + " · " + n + " çevrimiçi");
      publishPresence();
      sendPresence(false);
      return roomId;
    }

    wantAlive = false;
    destroy(true);
    wantAlive = true;
    isHost = true;
    roomId = next;
    presenceMap = Object.create(null);
    persistRoom(roomId, true);
    fillRoomInput(roomId);

    setStatus("Oda açılıyor… " + roomId);
    startHostPeer(roomId, 0);
    return roomId;
  }

  function startHostPeer(code, attempt) {
    if (!wantAlive || !isHost) return;
    try { if (peer) peer.destroy(); } catch (_) {}
    peer = null;
    const pid = peerRoomId(code);
    try {
      peer = new Peer(pid, peerOptions());
    } catch (err) {
      setStatus("Peer oluşturulamadı");
      return;
    }
    wirePeerKeepAlive(peer);
    peer.on("open", () => {
      fillRoomInput(roomId);
      persistRoom(roomId, true);
      upsertPresence({ id: ensureClientId(), name: displayName || "DM", host: true, ready: false });
      setStatus("Oda " + roomId + " · 1 çevrimiçi — kodu paylaş");
      publishPresence();
      startHeartbeat();
      startKeepAlive();
      sendPresence(false);
    });
    peer.on("connection", (c) => {
      if (connections.indexOf(c) < 0) connections.push(c);
      wireConn(c);
      setStatus("Oda " + roomId + " · " + (connections.length + 1) + " bağlantı");
    });
    peer.on("error", (e) => {
      const tip = String(e.type || e.message || "peer");
      if (tip.indexOf("unavailable-id") >= 0 || tip.indexOf("taken") >= 0) {
        // Kod dolu → yeni kod üret, tekrar dene
        if (attempt < 5) {
          roomId = randomCode();
          persistRoom(roomId, true);
          fillRoomInput(roomId);
          setStatus("Kod doluydu → yeni: " + roomId);
          setTimeout(() => startHostPeer(roomId, attempt + 1), 200);
        } else {
          setStatus("Oda açılamadı (kod çakışması)");
        }
      } else if (tip.indexOf("network") >= 0 || tip.indexOf("disconnected") >= 0) {
        setStatus("Ağ hatası — ↻ ile dene");
      } else {
        setStatus("Hata: " + tip);
      }
    });
  }

  function joinRoom(code, name) {
    ensureClientId();
    if (name) displayName = name;
    const next = (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim()
      || (loadSavedRoom() || "").replace(/[^A-Z0-9]/g, "");
    if (!next) return setStatus("Oda kodu gir");
    // Already joined this room
    if (!isHost && peer && conn && conn.open && roomId === next) {
      wantAlive = true;
      fillRoomInput(roomId);
      persistRoom(roomId, false);
      setStatus("Odaya bağlı: " + roomId);
      sendPresence(false);
      return roomId;
    }
    wantAlive = false;
    destroy(true);
    wantAlive = true;
    isHost = false;
    roomId = next;
    presenceMap = Object.create(null);
    persistRoom(roomId, false);
    fillRoomInput(roomId);
    setStatus("Katılınıyor: " + roomId + "…");
    startJoinPeer(roomId, 0);
    return roomId;
  }

  function startJoinPeer(code, attempt) {
    if (!wantAlive || isHost) return;
    try { if (peer) peer.destroy(); } catch (_) {}
    peer = null;
    conn = null;
    try {
      peer = new Peer(peerOptions());
    } catch (err) {
      setStatus("Peer oluşturulamadı");
      return;
    }
    wirePeerKeepAlive(peer);
    peer.on("open", () => {
      const target = peerRoomId(code);
      setStatus("Bağlanıyor: " + code + "…");
      try {
        conn = peer.connect(target, { reliable: true });
      } catch (err) {
        setStatus("Bağlantı kurulamadı");
        return;
      }
      wireConn(conn);
      let opened = false;
      const failTimer = setTimeout(() => {
        if (opened || !wantAlive) return;
        if (attempt < 3) {
          setStatus("Yanıt yok — tekrar " + (attempt + 2) + "/4…");
          startJoinPeer(code, attempt + 1);
        } else {
          setStatus("Katılınamadı — host açık mı? Kod: " + code);
        }
      }, 8000);
      conn.on("open", () => {
        opened = true;
        clearTimeout(failTimer);
        setStatus("Odaya bağlandı: " + code);
        try {
          conn.send(JSON.stringify({ type: "request_state", from: ensureClientId(), t: Date.now() }));
        } catch (_) {}
        sendPresence(false);
        setTimeout(() => sendPresence(false), 400);
        setTimeout(() => sendPresence(false), 1200);
      });
      conn.on("close", () => {
        clearTimeout(failTimer);
        if (wantAlive) scheduleReconnect("Misafir bağlantısı koptu");
      });
      conn.on("error", () => {
        if (!opened && attempt < 3 && wantAlive) {
          clearTimeout(failTimer);
          setTimeout(() => startJoinPeer(code, attempt + 1), 600);
        }
      });
      startHeartbeat();
      startKeepAlive();
    });
    peer.on("error", (e) => {
      const tip = String(e.type || e.message || "peer");
      if (attempt < 3 && wantAlive) {
        setStatus("Hata, yeniden… (" + tip + ")");
        setTimeout(() => startJoinPeer(code, attempt + 1), 700);
      } else {
        setStatus("Hata: " + tip);
      }
    });
  }

  /** Try reopen last room (reconnect helper) — aynı kodu korur */
  function reconnect(name) {
    const code = (loadSavedRoom() || roomId || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const wasHost = loadWasHost() || isHost;
    if (!code) return setStatus("Kayıtlı oda yok");
    if (name) displayName = name;
    wantAlive = true;
    fillRoomInput(code);
    // soft: if still up, just presence
    try {
      if (peer && !peer.destroyed && roomId === code) {
        if (peer.disconnected) {
          try { peer.reconnect(); return; } catch (_) {}
        }
        if (isHost || (conn && conn.open)) {
          sendPresence(false);
          setStatus("Oda " + code + " · bağlı");
          return;
        }
      }
    } catch (_) {}
    if (wasHost) {
      // Aynı kodla host olarak yeniden aç (yeni kod üretme)
      wantAlive = false;
      destroy(true);
      wantAlive = true;
      isHost = true;
      roomId = code;
      presenceMap = Object.create(null);
      persistRoom(roomId, true);
      fillRoomInput(roomId);
      setStatus("Oda yeniden açılıyor… " + roomId);
      startHostPeer(roomId, 0);
    } else {
      joinRoom(code, name);
    }
  }

  function destroy(force) {
    if (!force && wantAlive) {
      // Sekme değişimi / arka plan: peer'ı öldürme
      return;
    }
    wantAlive = false;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    try { connections.forEach((c) => c.close()); } catch (_) {}
    try { if (conn) conn.close(); } catch (_) {}
    try { if (peer) peer.destroy(); } catch (_) {}
    peer = null;
    conn = null;
    connections = [];
    isHost = false;
  }

  function scheduleReconnect(reason) {
    if (!wantAlive || !roomId) return;
    clearTimeout(reconnectTimer);
    setStatus((reason || "Bağlantı koptu") + " — yeniden bağlanılıyor…");
    reconnectTimer = setTimeout(() => {
      if (!wantAlive) return;
      const name = displayName;
      const code = roomId || loadSavedRoom();
      const wasHost = isHost || loadWasHost();
      // force teardown then rejoin
      wantAlive = true;
      try {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        try { connections.forEach((c) => c.close()); } catch (_) {}
        try { if (conn) conn.close(); } catch (_) {}
        try { if (peer) peer.destroy(); } catch (_) {}
        peer = null;
        conn = null;
        connections = [];
      } catch (_) {}
      if (wasHost) hostRoom(code, name);
      else joinRoom(code, name);
    }, 800);
  }

  function wirePeerKeepAlive(p) {
    if (!p) return;
    p.on("disconnected", () => {
      if (!wantAlive) return;
      setStatus("Peer koptu — reconnect…");
      try { p.reconnect(); } catch (_) {
        scheduleReconnect("Peer disconnected");
      }
    });
    p.on("close", () => {
      if (!wantAlive) return;
      scheduleReconnect("Peer kapandı");
    });
  }

  function startKeepAlive() {
    clearInterval(keepAliveTimer);
    // Arka planda tarayıcı throttle etse bile periyodik presence
    keepAliveTimer = setInterval(() => {
      if (!wantAlive) return;
      try { sendPresence(!!presenceMap[ensureClientId()]?.ready); } catch (_) {}
    }, 5000);
  }

  function pushState(state) {
    broadcast({ type: "state", state, from: ensureClientId(), t: Date.now(), seq: nextSeq() });
  }
  function pushTokenMove(id, cx, cy) {
    broadcast({ type: "token_move", id, cx, cy, from: ensureClientId(), t: Date.now(), seq: nextSeq() });
  }
  function pushFx(payload) {
    broadcast({ type: "fx", ...payload, from: ensureClientId(), t: Date.now(), seq: nextSeq() });
  }
  function pushDice(payload) {
    broadcast({ type: "dice", ...payload, from: ensureClientId(), t: Date.now(), seq: nextSeq() });
  }
  function pushChat(entry) {
    broadcast({ type: "chat", ...entry, from: ensureClientId(), t: entry.t || Date.now() });
  }
  function pushRuler(payload) {
    broadcast({ type: "ruler", ...payload, from: ensureClientId(), t: Date.now(), seq: nextSeq() });
  }
  function pushMusic(payload) {
    broadcast({ type: "music", ...payload, from: ensureClientId(), t: Date.now(), seq: nextSeq() });
  }

  global.OriginsSync = {
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
    setDisplayName(n) { displayName = n || "Oyuncu"; },
    setHandlers(h) {
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
        if (isHost) return peer.open || peer.disconnected === false;
        return !!(conn && conn.open);
      } catch (_) { return false; }
    },
    leaveRoom: () => { wantAlive = false; destroy(true); },
    setWantAlive: (v) => { wantAlive = !!v; },
    roomId: () => roomId || loadSavedRoom(),
    clientId: () => ensureClientId(),
    getPresence: () => Object.values(presenceMap),
    loadSavedRoom,
    fillRoomInput,
    persistRoom,
  };
})(window);
