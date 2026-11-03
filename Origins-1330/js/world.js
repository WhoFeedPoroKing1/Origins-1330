function initWorldMap() {
  const frame = document.getElementById("worldFrame");
  const cv = document.getElementById("worldDraw");
  if (!frame || !cv) return;

  const ctx = cv.getContext("2d");
  let drawing = false;
  let last = null;
  let mode = "draw"; // draw | erase
  let color = "#d4af37";
  let size = 3;

  function resize() {
    const r = frame.getBoundingClientRect();
    const saved = localStorage.getItem(S.worldDraw);
    cv.width = r.width * (window.devicePixelRatio || 1);
    cv.height = r.height * (window.devicePixelRatio || 1);
    cv.style.width = r.width + "px";
    cv.style.height = r.height + "px";
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    if (saved) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
      img.src = saved;
    }
  }
  resize();
  window.addEventListener("resize", resize);

  function pos(e) {
    const r = cv.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }
  function start(e) {
    e.preventDefault();
    drawing = true;
    last = pos(e);
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.strokeStyle = mode === "erase" ? "rgba(0,0,0,1)" : color;
    ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
    ctx.lineWidth = mode === "erase" ? size * 4 : size;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  }
  function end() {
    if (!drawing) return;
    drawing = false;
    ctx.globalCompositeOperation = "source-over";
    try {
      // save at display size
      const tmp = document.createElement("canvas");
      const r = frame.getBoundingClientRect();
      tmp.width = r.width; tmp.height = r.height;
      tmp.getContext("2d").drawImage(cv, 0, 0, r.width, r.height);
      localStorage.setItem(S.worldDraw, tmp.toDataURL("image/png"));
    } catch (_) {}
  }

  cv.addEventListener("pointerdown", start);
  cv.addEventListener("pointermove", move);
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointerleave", end);

  document.querySelectorAll("[data-wtool]").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("[data-wtool]").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      mode = b.dataset.wtool;
      frame.classList.toggle("erase", mode === "erase");
    });
  });
  document.getElementById("worldColor")?.addEventListener("input", (e) => { color = e.target.value; });
  document.getElementById("worldSize")?.addEventListener("input", (e) => { size = +e.target.value; });
  document.getElementById("worldClear")?.addEventListener("click", () => {
    if (!confirm("Çizimler silinsin mi? (Harita kalır)")) return;
    const r = frame.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    localStorage.removeItem(S.worldDraw);
  });
}
