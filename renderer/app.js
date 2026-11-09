/* global Crosshair */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const GAMES = { cs2: 'Counter-Strike 2', valorant: 'Valorant', fortnite: 'Fortnite', rust: 'Rust', apex: 'Apex Legends', overwatch: 'Overwatch 2', other: 'Otros' };
const TAGS = { pro: 'Top Pro', tactical: 'Táctico', 'bullet-drop': 'Bullet Drop', minimal: 'Minimalista', image: 'Imagen', fun: 'Divertido' };

let S = null; // estado de la app (espejo del main process)

// ---------- utilidades ----------
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
async function setState(patch) { S = await window.af.setState(patch); renderChrome(); return S; }
const activeX = () => S.profiles[S.active];

function drawThumb(canvas, c) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 170, h = canvas.clientHeight || 110;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const n = Crosshair.normalize(c);
  // Zoom automático: las miras pequeñas se agrandan para que se vean en la miniatura.
  const extent = (n.gap + n.length + n.outlineThickness + (n.circle ? n.circleRadius : 0) + 4) * n.scale;
  const zoom = n.image ? 1 : Math.max(1, Math.min(4, Math.floor((h * dpr * 0.42) / Math.max(extent, 1))));
  Crosshair.draw(ctx, n, canvas.width / 2, canvas.height / 2, { zoom, fit: { w: canvas.width * 0.9, h: canvas.height * 0.9 }, redraw: () => drawThumb(canvas, c) });
}

function modal(html, onMount) {
  $('#modalBox').innerHTML = html;
  $('#modal').classList.add('open');
  onMount && onMount($('#modalBox'));
}
function closeModal() { $('#modal').classList.remove('open'); }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });

// ---------- navegación ----------
function go(page) {
  $$('nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
  if (page === 'discover') loadDiscover();
  if (page === 'browse') loadBrowse(true);
  if (page === 'saved') renderSaved();
  if (page === 'profiles') renderProfiles();
  if (page === 'designer') buildDesigner();
  if (page === 'settings') renderSettings();
}
$$('nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.page)));
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));

// ---------- barra superior ----------
function renderChrome() {
  const sel = $('#profileSelect');
  sel.innerHTML = S.profiles.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
  sel.value = S.active;
  $('#visibleToggle').checked = S.visible;
  $('#visibleLabel').textContent = S.visible ? 'Visible' : 'Oculto';
  const hc = $('#heroCanvas'); if (hc) drawThumb(hc, activeX());
}
$('#profileSelect').addEventListener('change', async (e) => {
  await setState({ active: +e.target.value });
  if ($('#page-designer').classList.contains('active')) buildDesigner();
  if ($('#page-profiles').classList.contains('active')) renderProfiles();
});
$('#visibleToggle').addEventListener('change', (e) => setState({ visible: e.target.checked }));

$('#btnShare').addEventListener('click', () => {
  const code = Crosshair.toCode(activeX());
  modal(`<h3>Compartir "${esc(activeX().name)}"</h3>
    <p class="muted">Copia este código y pásalo a quien quieras. Lo importa con el botón Importar.</p>
    <textarea rows="5" readonly>${esc(code)}</textarea>
    <div class="row"><button id="mCopy">Copiar código</button><button class="ghost" id="mClose">Cerrar</button></div>`, (b) => {
    $('#mCopy', b).onclick = async () => { await navigator.clipboard.writeText(code); toast('Código copiado'); };
    $('#mClose', b).onclick = closeModal;
  });
});
$('#btnImport').addEventListener('click', () => {
  modal(`<h3>Importar crosshair</h3>
    <textarea rows="5" id="mCode" placeholder="Pega aquí un código AF1-…"></textarea>
    <div class="row"><button id="mOk">Importar como perfil nuevo</button><button class="ghost" id="mClose">Cancelar</button></div>`, (b) => {
    $('#mClose', b).onclick = closeModal;
    $('#mOk', b).onclick = async () => {
      try {
        const c = Crosshair.fromCode($('#mCode', b).value);
        await addProfile(c);
        closeModal(); toast('Crosshair importado y aplicado');
      } catch { toast('Código inválido'); }
    };
  });
});

async function addProfile(c, name) {
  const p = Crosshair.normalize({ ...c, name: name || c.name });
  await setState({ profiles: [...S.profiles, p], active: S.profiles.length });
}
async function applyCrosshair(c) {
  // Reemplaza el perfil activo (como en la app original: "aplicar" = usar ya mismo).
  const profiles = S.profiles.slice();
  profiles[S.active] = Crosshair.normalize(c);
  await setState({ profiles });
  toast(`Aplicado: ${c.name}`);
}

// ---------- tarjetas de la comunidad ----------
function isSaved(id) { return S.saved.some((s) => s.id === id); }
async function toggleSave(item) {
  const saved = isSaved(item.id) ? S.saved.filter((s) => s.id !== item.id) : [...S.saved, { id: item.id, name: item.name, author: item.author, crosshair: item.crosshair }];
  await setState({ saved });
}

function communityCard(item, onChange) {
  const el = document.createElement('div');
  el.className = 'card xcard';
  el.innerHTML = `<canvas title="Clic para aplicar"></canvas>
    <div class="meta"><div style="min-width:0"><div class="name">${esc(item.name)}</div>
      <div class="by">${esc(item.author || 'Anónimo')}${item.game ? ' · ' + esc(GAMES[item.game] || item.game) : ''}</div></div>
      ${item.score !== undefined ? `<span class="score">${item.score > 0 ? '+' : ''}${item.score}</span>` : ''}</div>
    <div class="actions">
      <button class="apply">Aplicar</button>
      ${item.score !== undefined ? `<button class="icon up ${item.myVote === 1 ? 'on' : ''}" title="Me gusta">▲</button>
      <button class="icon down ${item.myVote === -1 ? 'on' : ''}" title="No me gusta">▼</button>` : ''}
      <button class="icon save ${isSaved(item.id) ? 'on' : ''}" title="Guardar">★</button>
      <button class="icon more" title="Más">⋯</button>
    </div>`;
  requestAnimationFrame(() => drawThumb($('canvas', el), item.crosshair));
  const apply = () => applyCrosshair({ ...item.crosshair, name: item.name });
  $('canvas', el).onclick = apply;
  $('.apply', el).onclick = apply;
  $('.save', el).onclick = async (e) => { await toggleSave(item); e.target.classList.toggle('on', isSaved(item.id)); toast(isSaved(item.id) ? 'Guardado' : 'Quitado de guardados'); };
  const vote = async (v) => {
    try {
      const r = await window.af.community('POST', `/api/crosshairs/${item.id}/vote`, { value: item.myVote === v ? 0 : v });
      Object.assign(item, r); onChange ? onChange() : el.replaceWith(communityCard(item));
    } catch (err) { toast(err.message); }
  };
  if ($('.up', el)) { $('.up', el).onclick = () => vote(1); $('.down', el).onclick = () => vote(-1); }
  $('.more', el).onclick = () => moreMenu(item, el);
  return el;
}

function moreMenu(item, el) {
  modal(`<h3>${esc(item.name)}</h3>
    <div class="row">
      <button class="ghost" id="mAdd">Añadir como perfil nuevo</button>
      <button class="ghost" id="mCode">Copiar código</button>
      ${item.mine ? '<button class="ghost" id="mDel">Eliminar (es tuyo)</button>' : '<button class="ghost" id="mRep">Reportar</button>'}
      <button class="ghost" id="mClose">Cerrar</button>
    </div>`, (b) => {
    $('#mClose', b).onclick = closeModal;
    $('#mAdd', b).onclick = async () => { await addProfile(item.crosshair, item.name); closeModal(); toast('Perfil creado'); };
    $('#mCode', b).onclick = async () => { await navigator.clipboard.writeText(Crosshair.toCode({ ...item.crosshair, name: item.name })); toast('Código copiado'); };
    if ($('#mDel', b)) $('#mDel', b).onclick = async () => {
      try { await window.af.community('DELETE', `/api/crosshairs/${item.id}`); el.remove(); closeModal(); toast('Eliminado'); } catch (e) { toast(e.message); }
    };
    if ($('#mRep', b)) $('#mRep', b).onclick = async () => {
      try { await window.af.community('POST', `/api/crosshairs/${item.id}/report`, { reason: 'inapropiado' }); closeModal(); toast('Reporte enviado, gracias'); } catch (e) { toast(e.message); }
    };
  });
}

function fillGrid(grid, items, emptyMsg) {
  grid.innerHTML = '';
  if (!items.length) { grid.innerHTML = `<div class="empty">${emptyMsg}</div>`; return; }
  items.forEach((it) => grid.appendChild(communityCard(it)));
}
const offlineMsg = (e) => `No se pudo conectar con el servidor de comunidad (${esc(e.message)}). Revisa la URL en Ajustes.`;

// ---------- Descubrir ----------
async function loadDiscover() {
  renderChrome();
  try {
    const [pick, top, fresh] = await Promise.all([
      window.af.community('GET', '/api/crosshairs/pick'),
      window.af.community('GET', '/api/crosshairs?sort=top&limit=10'),
      window.af.community('GET', '/api/crosshairs?sort=new&limit=10')
    ]);
    fillGrid($('#pickGrid'), pick.items, 'Aún no hay crosshairs.');
    fillGrid($('#topGrid'), top.items, 'Aún no hay crosshairs.');
    fillGrid($('#newGrid'), fresh.items, '¡Sé el primero en subir uno desde el Diseñador!');
  } catch (e) {
    $('#pickGrid').innerHTML = `<div class="empty">${offlineMsg(e)}</div>`;
    $('#topGrid').innerHTML = ''; $('#newGrid').innerHTML = '';
  }
}
$('#btnSurprise').addEventListener('click', async () => {
  try {
    const r = await window.af.community('GET', '/api/crosshairs?sort=random&limit=1');
    if (r.items[0]) applyCrosshair({ ...r.items[0].crosshair, name: r.items[0].name });
  } catch (e) { toast(e.message); }
});

// ---------- Explorar ----------
const browse = { game: '', tag: '', q: '', sort: 'top', offset: 0 };
function renderFilters() {
  const mk = (map, key) => [['', 'Todos'], ...Object.entries(map)].map(([k, v]) =>
    `<button data-k="${key}" data-v="${k}" class="${browse[key] === k ? 'active' : ''}">${v}</button>`).join('');
  $('#gameFilters').innerHTML = mk(GAMES, 'game');
  $('#tagFilters').innerHTML = mk(TAGS, 'tag');
  $$('.filters button').forEach((b) => b.onclick = () => { browse[b.dataset.k] = b.dataset.v; renderFilters(); loadBrowse(true); });
}
async function loadBrowse(reset) {
  if (reset) { browse.offset = 0; $('#browseGrid').innerHTML = ''; renderFilters(); }
  const p = new URLSearchParams({ sort: browse.sort, game: browse.game, tag: browse.tag, q: browse.q, offset: browse.offset, limit: 24 });
  try {
    const r = await window.af.community('GET', '/api/crosshairs?' + p);
    if (reset && !r.items.length) $('#browseGrid').innerHTML = '<div class="empty">No hay resultados con esos filtros.</div>';
    r.items.forEach((it) => $('#browseGrid').appendChild(communityCard(it)));
    browse.offset += r.items.length;
    $('#btnMore').style.display = browse.offset < r.total ? '' : 'none';
  } catch (e) {
    $('#browseGrid').innerHTML = `<div class="empty">${offlineMsg(e)}</div>`;
    $('#btnMore').style.display = 'none';
  }
}
let searchT;
$('#searchInput').addEventListener('input', (e) => { clearTimeout(searchT); searchT = setTimeout(() => { browse.q = e.target.value; loadBrowse(true); }, 300); });
$('#sortSelect').addEventListener('change', (e) => { browse.sort = e.target.value; loadBrowse(true); });
$('#btnMore').addEventListener('click', () => loadBrowse(false));

// ---------- Guardados ----------
function renderSaved() {
  const grid = $('#savedGrid'); grid.innerHTML = '';
  if (!S.saved.length) { grid.innerHTML = '<div class="empty">Pulsa ★ en cualquier crosshair para guardarlo aquí.</div>'; return; }
  S.saved.forEach((s) => grid.appendChild(communityCard({ ...s }, renderSaved)));
  // al quitar de guardados, refrescar la lista
  $$('.save', grid).forEach((b) => b.addEventListener('click', () => setTimeout(renderSaved, 50)));
}

// ---------- Perfiles ----------
function renderProfiles() {
  const grid = $('#profilesGrid'); grid.innerHTML = '';
  S.profiles.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'card xcard' + (i === S.active ? ' active-profile' : '');
    el.innerHTML = `<canvas></canvas>
      <div class="meta"><div class="name">${esc(p.name)}</div><span class="score">${i === S.active ? 'ACTIVO' : ''}</span></div>
      <div class="actions">
        <button class="apply">${i === S.active ? 'Editar' : 'Usar'}</button>
        <button class="icon ren" title="Renombrar">✎</button>
        <button class="icon dup" title="Duplicar">⧉</button>
        <button class="icon del" title="Eliminar">✕</button>
      </div>`;
    requestAnimationFrame(() => drawThumb($('canvas', el), p));
    $('.apply', el).onclick = async () => { if (i === S.active) go('designer'); else { await setState({ active: i }); renderProfiles(); } };
    $('.ren', el).onclick = () => modal(`<h3>Renombrar perfil</h3><input id="mName" maxlength="40" value="${esc(p.name)}">
        <div class="row"><button id="mOk">Guardar</button><button class="ghost" id="mClose">Cancelar</button></div>`, (b) => {
      $('#mClose', b).onclick = closeModal;
      $('#mOk', b).onclick = async () => { const profiles = S.profiles.slice(); profiles[i] = { ...p, name: $('#mName', b).value || p.name }; await setState({ profiles }); closeModal(); renderProfiles(); };
    });
    $('.dup', el).onclick = async () => { await addProfile(p, p.name + ' (copia)'); renderProfiles(); };
    $('.del', el).onclick = async () => {
      if (S.profiles.length === 1) return toast('Debe quedar al menos un perfil');
      const profiles = S.profiles.filter((_, j) => j !== i);
      await setState({ profiles, active: S.active >= i ? Math.max(0, S.active - 1) : S.active });
      renderProfiles();
    };
    grid.appendChild(el);
  });
}
$('#btnNewProfile').addEventListener('click', async () => { await addProfile(Crosshair.DEFAULT, 'Perfil ' + (S.profiles.length + 1)); go('designer'); });

// ---------- Diseñador ----------
const BG = {
  dark: '#1b1d22', light: '#d9dde3',
  sky: () => { const g = dctx().createLinearGradient(0, 0, 0, dcv().height); g.addColorStop(0, '#6aa7e8'); g.addColorStop(1, '#cfe3f5'); return g; },
  grass: () => { const g = dctx().createLinearGradient(0, 0, 0, dcv().height); g.addColorStop(0, '#9cc3e6'); g.addColorStop(.5, '#7aa35a'); g.addColorStop(1, '#3f6b2a'); return g; }
};
const dcv = () => $('#designCanvas');
const dctx = () => dcv().getContext('2d');
function drawDesign() {
  const cv = dcv(); const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
  const ctx = dctx(); const bg = $('#bgSelect').value;
  if (bg === 'check') {
    for (let y = 0; y < cv.height; y += 24) for (let x = 0; x < cv.width; x += 24) {
      ctx.fillStyle = ((x + y) / 24) % 2 ? '#3a3a42' : '#9a9aa4'; ctx.fillRect(x, y, 24, 24);
    }
  } else { const f = BG[bg]; ctx.fillStyle = typeof f === 'function' ? f() : f; ctx.fillRect(0, 0, cv.width, cv.height); }
  const zoom = +$('#zoomRange').value;
  Crosshair.draw(ctx, activeX(), Math.floor(cv.width / 2), Math.floor(cv.height / 2), { zoom, redraw: drawDesign });
  // Vista 1:1 en la esquina = tamaño real que verás en el juego
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(10, 10, 90, 90);
  Crosshair.draw(ctx, activeX(), 55, 55, { zoom: 1, redraw: drawDesign });
  ctx.fillStyle = '#fff'; ctx.font = `${11 * dpr}px Segoe UI`; ctx.fillText('1:1', 14, 22 * dpr);
}
$('#bgSelect').addEventListener('change', drawDesign);
$('#zoomRange').addEventListener('input', drawDesign);
window.addEventListener('resize', () => { if ($('#page-designer').classList.contains('active')) drawDesign(); });

let pushT;
function updateActive(patch) {
  const profiles = S.profiles.slice();
  profiles[S.active] = Crosshair.normalize({ ...activeX(), ...patch });
  S.profiles = profiles;
  drawDesign();
  clearTimeout(pushT); pushT = setTimeout(() => setState({ profiles: S.profiles }), 40); // overlay casi en tiempo real
}

const PRESETS = {
  'Clásica': { length: 7, gap: 3, thickness: 2, dot: false, circle: false, rotation: 0, image: null },
  'Punto': { length: 0, dot: true, dotSize: 4, circle: false, image: null },
  'X': { length: 6, gap: 3, thickness: 2, rotation: 45, image: null },
  'Círculo': { length: 0, dot: true, dotSize: 2, circle: true, circleRadius: 12, image: null },
  'T': { arms: { top: false, bottom: true, left: true, right: true }, rotation: 0, image: null }
};

function buildDesigner() {
  const c = activeX();
  const slider = (key, label, min, max, step = 1) => `<div class="ctl"><span>${label}</span>
      <input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${c[key]}">
      <input type="number" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${c[key]}"></div>`;
  const color = (key, label) => `<div class="ctl"><span>${label}</span><input type="color" data-k="${key}" value="${c[key]}"><span></span></div>`;
  const check = (key, label) => `<label class="chk"><input type="checkbox" data-k="${key}" ${c[key] ? 'checked' : ''}> ${label}</label>`;
  $('#controls').innerHTML = `
    <div class="group"><h3>Perfil</h3>
      <input data-k="name" maxlength="40" value="${esc(c.name)}">
      <div class="row">${Object.keys(PRESETS).map((p) => `<button class="ghost preset" data-p="${p}">${p}</button>`).join('')}</div>
    </div>
    <div class="group"><h3>Líneas</h3>
      ${color('color', 'Color')}
      ${slider('opacity', 'Opacidad', 0.05, 1, 0.05)}
      ${slider('length', 'Largo', 0, 60)}
      ${slider('thickness', 'Grosor', 1, 20)}
      ${slider('gap', 'Separación', -10, 40)}
      ${slider('rotation', 'Rotación', 0, 359)}
      ${slider('scale', 'Escala', 0.25, 6, 0.25)}
      <div class="arms">${['top', 'bottom', 'left', 'right'].map((a) =>
        `<label class="chk"><input type="checkbox" data-arm="${a}" ${c.arms[a] ? 'checked' : ''}> ${{ top: '↑', bottom: '↓', left: '←', right: '→' }[a]}</label>`).join('')}</div>
    </div>
    <div class="group"><h3>Contorno</h3>
      ${check('outline', 'Activar contorno')}
      ${color('outlineColor', 'Color')}
      ${slider('outlineThickness', 'Grosor', 1, 5)}
    </div>
    <div class="group"><h3>Punto central</h3>
      ${check('dot', 'Mostrar punto')}
      ${slider('dotSize', 'Tamaño', 1, 20)}
    </div>
    <div class="group"><h3>Círculo</h3>
      ${check('circle', 'Mostrar círculo')}
      ${slider('circleRadius', 'Radio', 2, 80)}
      ${slider('circleThickness', 'Grosor', 1, 10)}
    </div>
    <div class="group"><h3>Imagen (PNG/GIF)</h3>
      <p class="muted" style="margin:0">Usa una imagen propia como mira. Máx. 250 KB.</p>
      <div class="row"><button class="ghost" id="btnImg">Elegir imagen…</button>${c.image ? '<button class="ghost" id="btnImgClear">Quitar</button>' : ''}</div>
      <input type="file" id="imgFile" accept="image/png,image/gif,image/webp" hidden>
    </div>
    <button id="btnPublish">Publicar en la comunidad</button>`;

  const ctl = $('#controls');
  $$('input[data-k]', ctl).forEach((inp) => {
    inp.addEventListener('input', () => {
      const k = inp.dataset.k;
      let v = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' || inp.type === 'number' ? +inp.value : inp.value;
      $$(`input[data-k="${k}"]`, ctl).forEach((o) => { if (o !== inp && o.type !== 'checkbox') o.value = v; });
      updateActive({ [k]: v });
      if (k === 'name') renderChromeSoon();
    });
  });
  $$('input[data-arm]', ctl).forEach((inp) => inp.addEventListener('change', () => {
    updateActive({ arms: { ...activeX().arms, [inp.dataset.arm]: inp.checked } });
  }));
  $$('.preset', ctl).forEach((b) => b.onclick = () => {
    const p = PRESETS[b.dataset.p];
    updateActive({ arms: { top: true, bottom: true, left: true, right: true }, ...p });
    buildDesigner();
  });
  $('#btnImg').onclick = () => $('#imgFile').click();
  $('#imgFile').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 250 * 1024) return toast('La imagen pesa más de 250 KB');
    const r = new FileReader();
    r.onload = () => { updateActive({ image: r.result }); buildDesigner(); };
    r.readAsDataURL(f);
  };
  if ($('#btnImgClear')) $('#btnImgClear').onclick = () => { updateActive({ image: null }); buildDesigner(); };
  $('#btnPublish').onclick = publishDialog;
  requestAnimationFrame(drawDesign);
}
let chromeT;
function renderChromeSoon() { clearTimeout(chromeT); chromeT = setTimeout(renderChrome, 300); }

function publishDialog() {
  const c = activeX();
  modal(`<h3>Publicar "${esc(c.name)}"</h3>
    <div class="form">
      <label>Nombre <input id="pName" maxlength="40" value="${esc(c.name)}"></label>
      <label>Autor <input id="pAuthor" maxlength="24" value="${esc(S.authorName)}" placeholder="Tu nombre de creador"></label>
      <label>Juego <select id="pGame">${Object.entries(GAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <div class="chips">${Object.entries(TAGS).map(([k, v]) => `<label><input type="checkbox" value="${k}" ${k === 'image' && c.image ? 'checked' : ''}> ${v}</label>`).join('')}</div>
    </div>
    <div class="row"><button id="mOk">Publicar</button><button class="ghost" id="mClose">Cancelar</button></div>`, (b) => {
    $('#mClose', b).onclick = closeModal;
    $('#mOk', b).onclick = async () => {
      const author = $('#pAuthor', b).value.trim();
      if (!author) return toast('Escribe tu nombre de creador');
      if (author !== S.authorName) await setState({ authorName: author });
      try {
        await window.af.community('POST', '/api/crosshairs', {
          name: $('#pName', b).value.trim() || c.name, author, game: $('#pGame', b).value,
          tags: $$('.chips input:checked', b).map((i) => i.value), crosshair: c
        });
        closeModal(); toast('¡Publicado! Ya aparece en Explorar');
      } catch (e) { toast(e.message); }
    };
  });
}

// ---------- Ajustes ----------
function renderSettings() {
  $('#authorInput').value = S.authorName;
  $('#serverInput').value = S.serverUrl;
  $('#displaySelect').innerHTML = S.displays.map((d) => `<option value="${d.i}">${esc(d.label)}</option>`).join('');
  $('#displaySelect').value = S.display;
  $('#offX').value = S.offsetX; $('#offY').value = S.offsetY;
  $('#hkToggle').value = S.hotkeys.toggle; $('#hkNext').value = S.hotkeys.next; $('#hkPrev').value = S.hotkeys.prev;
}
$('#btnSaveSettings').addEventListener('click', async () => {
  await setState({
    authorName: $('#authorInput').value.trim(), serverUrl: $('#serverInput').value.trim(),
    display: +$('#displaySelect').value, offsetX: +$('#offX').value || 0, offsetY: +$('#offY').value || 0,
    hotkeys: { toggle: $('#hkToggle').value.trim(), next: $('#hkNext').value.trim(), prev: $('#hkPrev').value.trim() }
  });
  toast('Ajustes guardados');
});
$('#btnTestServer').addEventListener('click', async () => {
  await setState({ serverUrl: $('#serverInput').value.trim() });
  try { const r = await window.af.community('GET', '/api/health'); $('#serverStatus').textContent = `✔ Conectado (${r.count} crosshairs)`; }
  catch (e) { $('#serverStatus').textContent = '✖ ' + e.message; }
});

// ---------- inicio ----------
window.af.onState((s) => {
  S = s; renderChrome();
  if ($('#page-designer').classList.contains('active')) buildDesigner();
});
(async () => {
  S = await window.af.getState();
  renderChrome();
  loadDiscover();
})();
