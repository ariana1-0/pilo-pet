// philo-pet 桌宠主进程（Electron）
// 透明无边框悬浮窗 + 系统托盘 + 定时弹语。连接本地或 Render 引擎。
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, screen } =
  require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { deepChatUrl } = require("./deep-link");

function loadReleaseConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "release-config.json"), "utf8"));
  } catch (_e) {
    return {};
  }
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

const releaseConfig = loadReleaseConfig();
const SERVICE_URL = normalizeBaseUrl(
  process.env.PHILO_SERVICE_URL || releaseConfig.serviceUrl,
);
const ENGINE = normalizeBaseUrl(
  process.env.PHILO_ENGINE || SERVICE_URL || "http://127.0.0.1:8848",
);
const WEB = normalizeBaseUrl(
  process.env.PHILO_WEB || SERVICE_URL || "http://127.0.0.1:8790",
);
const QUOTE_INTERVAL_MS = Number(process.env.PHILO_QUOTE_MS || 45 * 60 * 1000); // 默认 45 分钟
const USER_ID_OVERRIDE = process.env.PHILO_USER || "";
const SMOKE = process.argv.includes("--smoke"); // 冒烟：ready 后自动退出
const PET_SIZES = { small: 0.76, medium: 1, large: 1.3 };
const PET_WINDOW_BASE_WIDTH = 440;
const ENGINE_IS_REMOTE = !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(ENGINE);
const ENGINE_WAKE_TIMEOUT_MS = ENGINE_IS_REMOTE ? 75_000 : 5_000;

let petWin = null;
let tray = null;
let quoteTimer = null;
let dragState = null;
let visiblePhilosopher = "marcus-aurelius";
let engineReady = false;
let engineWakePromise = null;
let settings = { petSize: "medium", position: null, userId: null };

function settingsFile() {
  return path.join(app.getPath("userData"), "pet-settings.json");
}

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
    if (PET_SIZES[saved.petSize]) settings.petSize = saved.petSize;
    if (saved.position && Number.isFinite(saved.position.x) && Number.isFinite(saved.position.y)) {
      settings.position = { x: saved.position.x, y: saved.position.y };
    }
    if (typeof saved.userId === "string" && saved.userId.length >= 16) {
      settings.userId = saved.userId;
    }
  } catch (_e) {
    // 首次启动或设置文件损坏时使用默认值。
  }
  if (!settings.userId) {
    settings.userId = `pet-${crypto.randomUUID()}`;
    saveSettings();
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (e) {
    console.warn("pet settings save failed:", e.message);
  }
}

function clampPosition(x, y, windowBounds, point = null) {
  const display = point
    ? screen.getDisplayNearestPoint(point)
    : screen.getDisplayMatching({ x, y, width: windowBounds.width, height: windowBounds.height });
  const area = display.workArea;
  return {
    x: Math.round(Math.min(Math.max(x, area.x), area.x + area.width - windowBounds.width)),
    y: Math.round(Math.min(Math.max(y, area.y), area.y + area.height - windowBounds.height)),
  };
}

function petWindowWidth(scale = PET_SIZES[settings.petSize]) {
  return Math.round(PET_WINDOW_BASE_WIDTH * scale);
}

function currentUserId() {
  return USER_ID_OVERRIDE || settings.userId;
}

// ── 悬浮桌宠窗 ────────────────────────────────────────
function createPetWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const scale = PET_SIZES[settings.petSize];
  const windowWidth = petWindowWidth(scale);
  const initial = settings.position || {
    x: workArea.x + workArea.width - windowWidth - 40,
    y: workArea.y + 80,
  };
  const position = clampPosition(
    initial.x, initial.y, { width: windowWidth, height: Math.round(380 * scale) },
  );
  petWin = new BrowserWindow({
    width: windowWidth,
    height: Math.round(380 * scale),
    x: position.x,
    y: position.y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.platform === "darwin") {
    petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  petWin.loadFile(path.join(__dirname, "renderer", "pet.html"));
  petWin.on("closed", () => { petWin = null; });
}

// ── 托盘 ──────────────────────────────────────────────
function createTray() {
  const sprite = nativeImage.createFromPath(
    path.join(__dirname, "assets", "spritesheet-extended.png"),
  );
  let img = sprite.isEmpty()
    ? nativeImage.createEmpty()
    : sprite.crop({ x: 0, y: 0, width: 192, height: 208 }).resize({
      width: process.platform === "darwin" ? 18 : 32,
      height: process.platform === "darwin" ? 20 : 35,
    });
  if (process.platform === "darwin" && !img.isEmpty()) img.setTemplateImage(true);
  tray = new Tray(img);
  if (process.platform === "darwin" && img.isEmpty()) tray.setTitle("🏛");
  tray.setToolTip("philo-pet 桌宠");
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: "换一句弹语", click: () => pushQuote() },
    { label: "换个动作", click: () => petWin?.webContents.send("ambient-action") },
    { label: "显示 / 隐藏桌宠", click: () => togglePet() },
    {
      label: "整体大小",
      submenu: [
        { label: "小", type: "radio", checked: settings.petSize === "small", click: () => setPetSize("small") },
        { label: "标准", type: "radio", checked: settings.petSize === "medium", click: () => setPetSize("medium") },
        { label: "大", type: "radio", checked: settings.petSize === "large", click: () => setPetSize("large") },
      ],
    },
    { label: "恢复默认位置", click: () => resetPetPosition() },
    { type: "separator" },
    { label: "去网页端深聊", click: () => shell.openExternal(deepChatUrl(WEB, visiblePhilosopher)) },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function setPetSize(size) {
  if (!PET_SIZES[size]) return;
  settings.petSize = size;
  saveSettings();
  if (petWin) {
    const scale = PET_SIZES[size];
    const previous = petWin.getBounds();
    const width = petWindowWidth(scale);
    const next = {
      ...previous,
      x: previous.x + previous.width - width,
      width,
    };
    const position = clampPosition(next.x, next.y, next);
    petWin.setBounds({ ...next, ...position });
    settings.position = position;
    saveSettings();
    petWin.webContents.send("pet-size", scale);
  }
  refreshTrayMenu();
}

function resetPetPosition() {
  if (!petWin) return;
  const area = screen.getPrimaryDisplay().workArea;
  const bounds = petWin.getBounds();
  const position = clampPosition(
    area.x + area.width - bounds.width - 40,
    area.y + 80,
    bounds,
  );
  petWin.setPosition(position.x, position.y);
  settings.position = position;
  saveSettings();
}

function togglePet() {
  if (!petWin) return createPetWindow();
  petWin.isVisible() ? petWin.hide() : petWin.show();
}

// ── Render/本地引擎唤醒 + 弹语拉取 ─────────────────────
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, timeoutMs) {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
}

async function ensureEngineReady() {
  if (engineReady) return;
  if (engineWakePromise) return engineWakePromise;
  engineWakePromise = (async () => {
    const deadline = Date.now() + ENGINE_WAKE_TIMEOUT_MS;
    let lastError = new Error("engine unavailable");
    do {
      try {
        const response = await fetchWithTimeout(`${ENGINE}/health`, 10_000);
        if (response.ok) {
          engineReady = true;
          return;
        }
        lastError = new Error(`engine health returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      if (Date.now() < deadline) await wait(2_500);
    } while (Date.now() < deadline);
    throw lastError;
  })();
  try {
    await engineWakePromise;
  } finally {
    engineWakePromise = null;
  }
}

async function fetchQuote() {
  await ensureEngineReady();
  let r;
  try {
    r = await fetchWithTimeout(
      `${ENGINE}/quote?user_id=${encodeURIComponent(currentUserId())}`,
      ENGINE_IS_REMOTE ? 75_000 : 10_000,
    );
  } catch (error) {
    engineReady = false;
    throw error;
  }
  if (!r.ok) {
    engineReady = false;
    throw new Error(`quote engine returned ${r.status}`);
  }
  const j = await r.json();
  return j.quote || null; // 安全规则过滤后仍可能为 null（宁可少弹）
}

async function pushQuote() {
  try {
    const q = await fetchQuote();
    if (q && petWin) petWin.webContents.send("quote", q);
    return q;
  } catch (_e) {
    // 定时推送失败时保持安静；主动点击会通过 IPC 把错误交给渲染层显示。
    return null;
  }
}

// ── IPC：渲染进程 → 主进程 ─────────────────────────────
ipcMain.handle("engine", () => ({
  engine: ENGINE,
  web: WEB,
  userId: currentUserId(),
  engineIsRemote: ENGINE_IS_REMOTE,
  petScale: PET_SIZES[settings.petSize],
}));
ipcMain.handle("get-quote", () => fetchQuote());
ipcMain.on("quote-visible", (event, slug) => {
  if (petWin && event.sender === petWin.webContents && typeof slug === "string") {
    visiblePhilosopher = slug;
  }
});
ipcMain.on("open-web", (event, slug) => {
  if (!petWin || event.sender !== petWin.webContents) return;
  shell.openExternal(deepChatUrl(WEB, slug || visiblePhilosopher));
});
ipcMain.on("resize", (_e, h) => {
  if (!petWin || !h) return;
  const previous = petWin.getBounds();
  const nextHeight = Math.max(120, Math.round(h));
  // 气泡出现/消失时固定桌宠底边，避免角色在桌面上上下跳。
  const bounds = {
    ...previous,
    y: previous.y + previous.height - nextHeight,
    height: nextHeight,
  };
  const position = clampPosition(bounds.x, bounds.y, bounds);
  petWin.setBounds({ ...bounds, ...position });
});
ipcMain.on("pet-drag-start", (event, point) => {
  if (!petWin || event.sender !== petWin.webContents || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const [x, y] = petWin.getPosition();
  dragState = { mouseX: point.x, mouseY: point.y, windowX: x, windowY: y };
});
ipcMain.on("pet-drag-move", (event, point) => {
  if (!petWin || !dragState || event.sender !== petWin.webContents || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const bounds = petWin.getBounds();
  const position = clampPosition(
    dragState.windowX + point.x - dragState.mouseX,
    dragState.windowY + point.y - dragState.mouseY,
    bounds,
    { x: Math.round(point.x), y: Math.round(point.y) },
  );
  petWin.setPosition(position.x, position.y);
});
ipcMain.on("pet-drag-end", (event) => {
  if (!petWin || event.sender !== petWin.webContents) return;
  dragState = null;
  const [x, y] = petWin.getPosition();
  settings.position = { x, y };
  saveSettings();
});

// ── 生命周期 ──────────────────────────────────────────
app.whenReady().then(() => {
  if (process.platform === "win32") app.setAppUserModelId("com.philopet.preview");
  loadSettings();
  createTray();
  createPetWindow();
  quoteTimer = setInterval(pushQuote, QUOTE_INTERVAL_MS);
  setTimeout(pushQuote, 3000); // 启动几秒后来第一句

  if (SMOKE) {
    // 冒烟：确认能起窗、能建托盘后退出
    setTimeout(() => { console.log("SMOKE_OK pet+tray ready"); app.quit(); }, 1500);
  }
});

app.on("window-all-closed", (e) => {
  // 桌宠是常驻应用：关窗不退出（除非托盘退出）
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => { if (!petWin) createPetWindow(); });
app.on("before-quit", () => { if (quoteTimer) clearInterval(quoteTimer); });
