/* global Crosshair */
// Dibuja la mira en la ventana transparente que cubre la pantalla.
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let state = null;

function render() {
  // Tamaño en píxeles físicos para que cada línea caiga exacta en el píxel central.
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (cv.width !== w || cv.height !== h) {
    cv.width = w; cv.height = h;
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  }
  ctx.clearRect(0, 0, w, h);
  if (!state) return;
  // centerX/Y vienen del proceso principal (centro real de la pantalla, aunque Windows recorte la ventana).
  const mx = state.centerX != null ? state.centerX : innerWidth / 2;
  const my = state.centerY != null ? state.centerY : innerHeight / 2;
  const cx = Math.floor(mx * dpr) + (state.offsetX || 0);
  const cy = Math.floor(my * dpr) + (state.offsetY || 0);
  Crosshair.draw(ctx, state.crosshair, cx, cy, { redraw: render });
}

window.af.onOverlay((d) => { state = d; render(); });
window.addEventListener('resize', render);
// Pide el estado al cargar, por si el primer envío llegó antes de que el script estuviera listo.
window.af.getState().then((s) => {
  if (!state) { state = { crosshair: s.profiles[s.active], offsetX: s.offsetX, offsetY: s.offsetY }; render(); }
});
