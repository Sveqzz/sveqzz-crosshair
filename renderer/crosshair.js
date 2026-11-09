// Modelo y renderizador de crosshair compartido (app, overlay y servidor usan el mismo formato).
(function (root) {
  const DEFAULT = {
    v: 1,
    name: 'Mi crosshair',
    color: '#00ff66',
    opacity: 1,
    thickness: 2,
    length: 7,
    gap: 3,
    arms: { top: true, bottom: true, left: true, right: true },
    outline: true,
    outlineThickness: 1,
    outlineColor: '#000000',
    dot: false,
    dotSize: 2,
    circle: false,
    circleRadius: 10,
    circleThickness: 1,
    rotation: 0,
    scale: 1,
    image: null // dataURL PNG/GIF opcional (crosshairs de imagen)
  };

  const clamp = (n, a, b, d) => {
    n = Number(n);
    if (!Number.isFinite(n)) return d;
    return Math.min(b, Math.max(a, n));
  };
  const isHex = (s) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);

  function normalize(c) {
    c = c || {};
    const a = c.arms || {};
    const img = typeof c.image === 'string' && /^data:image\/(png|gif|webp|jpeg);base64,/.test(c.image) && c.image.length < 400000 ? c.image : null;
    return {
      v: 1,
      name: String(c.name || DEFAULT.name).slice(0, 40),
      color: isHex(c.color) ? c.color : DEFAULT.color,
      opacity: clamp(c.opacity, 0.05, 1, 1),
      thickness: clamp(c.thickness, 1, 20, DEFAULT.thickness),
      length: clamp(c.length, 0, 60, DEFAULT.length),
      gap: clamp(c.gap, -10, 40, DEFAULT.gap),
      arms: {
        top: a.top !== false, bottom: a.bottom !== false,
        left: a.left !== false, right: a.right !== false
      },
      outline: !!c.outline,
      outlineThickness: clamp(c.outlineThickness, 1, 5, 1),
      outlineColor: isHex(c.outlineColor) ? c.outlineColor : '#000000',
      dot: !!c.dot,
      dotSize: clamp(c.dotSize, 1, 20, 2),
      circle: !!c.circle,
      circleRadius: clamp(c.circleRadius, 2, 80, 10),
      circleThickness: clamp(c.circleThickness, 1, 10, 1),
      rotation: clamp(c.rotation, 0, 359, 0),
      scale: clamp(c.scale, 0.25, 6, 1),
      image: img
    };
  }

  const imgCache = new Map();
  function getImage(src, onload) {
    let im = imgCache.get(src);
    if (!im) {
      im = new Image();
      im.onload = () => onload && onload();
      im.src = src;
      imgCache.set(src, im);
    }
    return im;
  }

  // Dibuja el crosshair centrado en (cx, cy). Usa coordenadas enteras para que quede nítido.
  function draw(ctx, c, cx, cy, opts) {
    c = normalize(c);
    const s = c.scale * ((opts && opts.zoom) || 1);
    ctx.save();
    ctx.globalAlpha = c.opacity;
    ctx.translate(Math.round(cx), Math.round(cy));
    if (c.rotation) ctx.rotate((c.rotation * Math.PI) / 180);
    ctx.scale(s, s);

    if (c.image) {
      const im = getImage(c.image, opts && opts.redraw);
      if (im.complete && im.naturalWidth) {
        let iw = im.naturalWidth, ih = im.naturalHeight;
        const fit = opts && opts.fit;
        if (fit) { const k = Math.min(1, fit.w / (iw * s), fit.h / (ih * s)); iw *= k; ih *= k; }
        ctx.imageSmoothingEnabled = !!fit;
        ctx.drawImage(im, Math.round(-iw / 2), Math.round(-ih / 2), iw, ih);
      }
      ctx.restore();
      return;
    }

    const t = c.thickness, L = c.length, g = c.gap;
    const half = t / 2;
    const rects = [];
    if (L > 0) {
      if (c.arms.top) rects.push([-half, -g - L, t, L]);
      if (c.arms.bottom) rects.push([-half, g, t, L]);
      if (c.arms.left) rects.push([-g - L, -half, L, t]);
      if (c.arms.right) rects.push([g, -half, L, t]);
    }
    const d = c.dot ? c.dotSize : 0;
    const o = c.outlineThickness;

    if (c.outline) {
      ctx.fillStyle = c.outlineColor;
      for (const [x, y, w, h] of rects) ctx.fillRect(x - o, y - o, w + o * 2, h + o * 2);
      if (d) ctx.fillRect(-d / 2 - o, -d / 2 - o, d + o * 2, d + o * 2);
      if (c.circle) {
        ctx.strokeStyle = c.outlineColor;
        ctx.lineWidth = c.circleThickness + o * 2;
        ctx.beginPath(); ctx.arc(0, 0, c.circleRadius, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.fillStyle = c.color;
    for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
    if (d) ctx.fillRect(-d / 2, -d / 2, d, d);
    if (c.circle) {
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.circleThickness;
      ctx.beginPath(); ctx.arc(0, 0, c.circleRadius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // Código para compartir: "AF1-" + base64url(JSON sin la imagen si es muy grande)
  function toCode(c) {
    const json = JSON.stringify(normalize(c));
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return 'AF1-' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromCode(code) {
    code = String(code || '').trim();
    if (!code.startsWith('AF1-')) throw new Error('Código inválido');
    let b64 = code.slice(4).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return normalize(JSON.parse(decodeURIComponent(escape(atob(b64)))));
  }

  const api = { DEFAULT, normalize, draw, toCode, fromCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Crosshair = api;
})(typeof window !== 'undefined' ? window : globalThis);
