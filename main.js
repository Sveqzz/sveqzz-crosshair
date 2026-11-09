const { app, BrowserWindow, ipcMain, globalShortcut, screen, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Crosshair = require('./renderer/crosshair.js');

// URL del servidor de comunidad que trae la app por defecto (se edita en config.json antes de compilar).
const CONFIG = (() => { try { return require('./config.json'); } catch { return {}; } })();
const DEFAULT_SERVER = CONFIG.defaultServerUrl || 'http://localhost:8787';

// Solo una instancia: si la abren otra vez, se muestra la ventana existente.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); } });

const STORE_FILE = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_STORE = {
  profiles: [Crosshair.normalize({ name: 'Default' })],
  active: 0,
  visible: true,
  offsetX: 0,
  offsetY: 0,
  display: 0,
  saved: [],            // crosshairs guardados de la comunidad (copias completas)
  serverUrl: DEFAULT_SERVER,
  authorName: '',
  deviceId: crypto.randomUUID(),
  hotkeys: {
    toggle: 'CommandOrControl+Shift+H',
    next: 'CommandOrControl+Shift+Right',
    prev: 'CommandOrControl+Shift+Left'
  }
};

let store;
function loadStore() {
  try {
    store = { ...DEFAULT_STORE, ...JSON.parse(fs.readFileSync(STORE_FILE(), 'utf8')) };
  } catch {
    store = { ...DEFAULT_STORE };
  }
  // Si el usuario seguía con el servidor local y la versión nueva trae uno público, pasar al público.
  if (/localhost|127\.0\.0\.1/.test(store.serverUrl) && !/localhost|127\.0\.0\.1/.test(DEFAULT_SERVER)) store.serverUrl = DEFAULT_SERVER;
  store.profiles = (store.profiles || []).map(Crosshair.normalize);
  if (!store.profiles.length) store.profiles = [Crosshair.normalize({ name: 'Default' })];
  store.active = Math.min(Math.max(0, store.active | 0), store.profiles.length - 1);
  saveStore();
}
let saveTimer;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(STORE_FILE()), { recursive: true });
    fs.writeFileSync(STORE_FILE(), JSON.stringify(store, null, 2));
  }, 150);
}

let mainWin, overlayWin;

function createMain() {
  mainWin = new BrowserWindow({
    width: 1180, height: 760, minWidth: 900, minHeight: 600,
    backgroundColor: '#141416',
    title: 'Sveqzz Crosshair',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // Cerrar la ventana la manda a la bandeja; la mira sigue funcionando.
  mainWin.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); mainWin.hide(); } });
}

let tray;
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Sveqzz Crosshair');
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Sveqzz Crosshair', click: () => { mainWin.show(); mainWin.focus(); } },
    { label: store.visible ? 'Ocultar mira' : 'Mostrar mira', click: () => { store.visible = !store.visible; applyVisibility(); saveStore(); broadcastState(); rebuild(); } },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  rebuild();
  tray.on('double-click', () => { mainWin.show(); mainWin.focus(); });
  createTray.rebuild = rebuild;
}

function targetDisplay() {
  const all = screen.getAllDisplays();
  return all[store.display] || screen.getPrimaryDisplay();
}

function createOverlay() {
  const b = targetDisplay().bounds;
  overlayWin = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true, frame: false, resizable: false, movable: false,
    focusable: false, skipTaskbar: true, hasShadow: false, show: false,
    alwaysOnTop: true, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  // Nivel más alto posible y la ventana deja pasar todos los clics: nunca interfiere con el juego.
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlayWin.webContents.on('did-finish-load', () => { pushOverlay(); applyVisibility(); });
  // Re-asegura que siga encima si otro programa le roba el "topmost".
  setInterval(() => { if (overlayWin && !overlayWin.isDestroyed() && store.visible) overlayWin.moveTop(); }, 2000);
}

function repositionOverlay() {
  if (!overlayWin) return;
  overlayWin.setBounds(targetDisplay().bounds);
  pushOverlay();
}

function pushOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.webContents.send('overlay:update', {
    crosshair: store.profiles[store.active],
    offsetX: store.offsetX, offsetY: store.offsetY
  });
}
function applyVisibility() {
  if (!overlayWin) return;
  if (store.visible) overlayWin.showInactive(); else overlayWin.hide();
}
function broadcastState() {
  if (createTray.rebuild) createTray.rebuild();
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('state:changed', publicState());
}
function publicState() {
  return { ...store, displays: screen.getAllDisplays().map((d, i) => ({ i, label: `Pantalla ${i + 1} (${d.size.width}x${d.size.height})` })) };
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const h = store.hotkeys;
  const safe = (acc, fn) => { try { if (acc) globalShortcut.register(acc, fn); } catch { /* acelerador inválido */ } };
  safe(h.toggle, () => { store.visible = !store.visible; applyVisibility(); saveStore(); broadcastState(); });
  safe(h.next, () => { store.active = (store.active + 1) % store.profiles.length; pushOverlay(); saveStore(); broadcastState(); });
  safe(h.prev, () => { store.active = (store.active - 1 + store.profiles.length) % store.profiles.length; pushOverlay(); saveStore(); broadcastState(); });
}

// ---------- IPC ----------
ipcMain.handle('state:get', () => publicState());

ipcMain.handle('state:set', (_e, patch) => {
  const allowed = ['active', 'visible', 'offsetX', 'offsetY', 'display', 'serverUrl', 'authorName', 'hotkeys', 'saved'];
  for (const k of allowed) if (k in patch) store[k] = patch[k];
  if ('profiles' in patch) store.profiles = patch.profiles.map(Crosshair.normalize);
  if (!store.profiles.length) store.profiles = [Crosshair.normalize({ name: 'Default' })];
  store.active = Math.min(Math.max(0, store.active | 0), store.profiles.length - 1);
  store.offsetX = Math.max(-500, Math.min(500, store.offsetX | 0));
  store.offsetY = Math.max(-500, Math.min(500, store.offsetY | 0));
  if ('display' in patch) repositionOverlay();
  if ('hotkeys' in patch) registerHotkeys();
  pushOverlay();
  applyVisibility();
  saveStore();
  return publicState();
});

// Proxy hacia el servidor de comunidad (evita CORS y centraliza el deviceId).
ipcMain.handle('community:request', async (_e, { method = 'GET', route, body }) => {
  const base = String(store.serverUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('URL del servidor inválida');
  if (typeof route !== 'string' || !route.startsWith('/api/')) throw new Error('Ruta inválida');
  const res = await fetch(base + route, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': store.deviceId },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000) // el plan gratis de Render tarda ~50 s en despertar
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
});

app.whenReady().then(() => {
  loadStore();
  createMain();
  createOverlay();
  createTray();
  registerHotkeys();
  screen.on('display-removed', repositionOverlay);
  screen.on('display-metrics-changed', repositionOverlay);
});
app.on('before-quit', () => { app.isQuitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
