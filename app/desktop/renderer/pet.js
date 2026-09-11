/* 桌宠交互逻辑：弹语展示 / 说人话 / 点击换弹语 / 深聊跳转。
 * 直接 fetch 引擎（同 preload 暴露的 config）；深聊使用网页端。
 */
let CFG = {
  engine: "http://127.0.0.1:8848",
  web: "http://127.0.0.1:8790",
  userId: "pet-local",
  engineIsRemote: false,
  petScale: 1,
};
let currentQuote = null;

const $ = (s) => document.querySelector(s);
const pet = $("#pet"), bubble = $("#bubble"), bubbleBody = $("#bubble-body");
const bubbleSrc = $("#bubble-src"), bubbleActions = $("#bubble-actions");
const bubbleAttribution = $("#bubble-attribution");
const petSprite = $("#pet-sprite");

// ── 角色动画 ──────────────────────────────────────────
// spritesheet-extended.png：8 列 × 11 行，单格 192 × 208。
// CSS 将每格等比缩放为 132 × 143，JS 只切换背景坐标，不需要拆分图片。
const DISPLAY_FRAME = { width: 132, height: 143 };
const frame = (row, col) => ({ row, col });
const rowFrames = (row, count) => Array.from({ length: count }, (_, col) => frame(row, col));

const ANIMATIONS = {
  // 多停留几帧，让眨眼自然发生，而不是快速循环。
  idle: {
    fps: 7,
    loop: true,
    frames: [
      ...Array(12).fill(frame(0, 0)),
      frame(0, 1), frame(0, 2), frame(0, 3), frame(0, 4), frame(0, 5),
    ],
  },
  wave: { fps: 8, loop: false, frames: rowFrames(3, 4), next: "idle" },
  hop: {
    fps: 7,
    loop: false,
    frames: [...rowFrames(4, 5), ...rowFrames(4, 4).reverse()],
    next: "idle",
  },
  stretch: {
    fps: 5,
    loop: false,
    frames: [...rowFrames(5, 8), frame(5, 7), frame(5, 7), ...rowFrames(5, 7).reverse()],
    next: "idle",
  },
  reading: { fps: 6, loop: true, frames: rowFrames(7, 6) },
  talking: { fps: 8, loop: true, frames: rowFrames(6, 6) },
  curious: {
    fps: 6,
    loop: false,
    frames: [...rowFrames(8, 6), ...rowFrames(8, 5).reverse()],
    next: "idle",
  },
  ponder: {
    fps: 2,
    loop: true,
    frames: [...rowFrames(8, 6), ...rowFrames(8, 5).reverse()],
  },
  lookRight: { fps: 7, loop: false, frames: rowFrames(9, 8), next: "idle" },
  lookLeft: { fps: 7, loop: false, frames: rowFrames(10, 8), next: "idle" },
  runRight: { fps: 10, loop: true, frames: rowFrames(1, 8) },
  runLeft: { fps: 10, loop: true, frames: rowFrames(2, 8) },
  calm: {
    fps: 4,
    loop: true,
    frames: [frame(5, 0), frame(5, 1), frame(5, 2), frame(5, 1)],
  },
};

let animationTimer = null;
let animationName = "";
let animationIndex = 0;
let currentSpriteFrame = frame(0, 0);
let uiScale = 1;
let ambientTimer = null;
let bubbleDismissTimer = null;
let quoteRequestPending = false;
let lastAmbientAction = null;
const AMBIENT_INTERVAL_MS = 20 * 1000;
const BUBBLE_VISIBLE_MS = 60 * 1000;
const AMBIENT_ACTIONS = [
  "idle", "reading", "ponder", "stretch", "curious", "lookRight", "lookLeft", "hop",
];

function drawSpriteFrame(spriteFrame) {
  currentSpriteFrame = spriteFrame;
  const { row, col } = spriteFrame;
  petSprite.style.backgroundPosition =
    `${-col * DISPLAY_FRAME.width * uiScale}px ${-row * DISPLAY_FRAME.height * uiScale}px`;
}

function applyUiScale(scale) {
  const next = Number(scale);
  uiScale = Number.isFinite(next) ? Math.min(1.5, Math.max(0.65, next)) : 1;
  document.getElementById("pet-root").style.setProperty("--ui-scale", uiScale);
  drawSpriteFrame(currentSpriteFrame);
  fit();
}

function playAnimation(name, { restart = false } = {}) {
  const animation = ANIMATIONS[name] || ANIMATIONS.idle;
  if (animationName === name && !restart) return;

  if (animationTimer) clearInterval(animationTimer);
  animationName = name;
  animationIndex = 0;
  drawSpriteFrame(animation.frames[0]);

  animationTimer = setInterval(() => {
    animationIndex += 1;
    if (animationIndex >= animation.frames.length) {
      if (!animation.loop) {
        clearInterval(animationTimer);
        animationTimer = null;
        playAnimation(animation.next || "idle", { restart: true });
        return;
      }
      animationIndex = 0;
    }
    drawSpriteFrame(animation.frames[animationIndex]);
  }, 1000 / animation.fps);
}

function playAmbientAction() {
  // 正在拖动、读取内容或展示危机提示时不打断当前状态。
  if (dragging || bubbleBody.classList.contains("streaming")
      || (!bubble.hidden && bubble.classList.contains("crisis"))) {
    return scheduleAmbientAction();
  }
  const available = AMBIENT_ACTIONS.filter((name) =>
    name !== lastAmbientAction && name !== animationName);
  const name = available[Math.floor(Math.random() * available.length)];
  lastAmbientAction = name;
  playAnimation(name, { restart: true });
  scheduleAmbientAction();
}

function scheduleAmbientAction() {
  if (ambientTimer) clearTimeout(ambientTimer);
  ambientTimer = setTimeout(playAmbientAction, AMBIENT_INTERVAL_MS);
}

function noteInteraction() {
  scheduleAmbientAction();
}

function fit() {
  // 按可见内容计算自然高度，避免透明区域拦截桌面点击。
  requestAnimationFrame(() => {
    const root = document.getElementById("pet-root");
    const visible = [bubble, bubbleActions, pet].filter((el) =>
      !el.hidden && getComputedStyle(el).display !== "none");
    const styles = getComputedStyle(root);
    const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const gaps = Math.max(0, visible.length - 1) * parseFloat(styles.rowGap || styles.gap || 0);
    const contentHeight = visible.reduce((sum, el) => {
      const elStyles = getComputedStyle(el);
      return sum + el.getBoundingClientRect().height
        + parseFloat(elStyles.marginTop || 0) + parseFloat(elStyles.marginBottom || 0);
    }, 0);
    window.philo?.resizeTo(Math.ceil(padding + gaps + contentHeight));
  });
}
function armBubbleDismiss() {
  if (bubbleDismissTimer) clearTimeout(bubbleDismissTimer);
  bubbleDismissTimer = setTimeout(hideBubble, BUBBLE_VISIBLE_MS);
}

function showBubble() {
  bubble.hidden = false;
  bubbleActions.hidden = false;
  armBubbleDismiss();
  fit();
}

function hideBubble() {
  if (bubbleDismissTimer) clearTimeout(bubbleDismissTimer);
  bubbleDismissTimer = null;
  bubble.hidden = true;
  bubbleActions.hidden = true;
  bubbleSrc.hidden = true;
  bubbleAttribution.hidden = true;
  playAnimation("idle");
  fit();
}

function setBubbleMode(mode) {
  bubble.classList.remove("quote", "plain", "chat", "crisis");
  if (mode) bubble.classList.add(mode);
  bubbleAttribution.hidden = true;
}

function formatQuoteText(text) {
  const value = String(text || "");
  if (value.length < 12 || value.length > 32) return value;
  const candidates = [];
  for (let i = 1; i < value.length - 2; i += 1) {
    if ("，。！？；：".includes(value[i])) candidates.push(i + 1);
    if (value[i] === "—" && value[i - 1] !== "—") candidates.push(i);
  }
  const usable = candidates.filter((i) => i >= value.length * .3 && i <= value.length * .72);
  if (!usable.length) return value;
  const target = value.length * .54;
  const split = usable.reduce((best, i) =>
    Math.abs(i - target) < Math.abs(best - target) ? i : best);
  return `${value.slice(0, split)}\n${value.slice(split)}`;
}

function shortenPlain(text, maxChars = 64) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  const sentences = value.match(/[^。！？!?]+[。！？!?]?/g) || [value];
  let out = "";
  for (const sentence of sentences.slice(0, 2)) {
    if (out.length + sentence.length > maxChars) break;
    out += sentence;
  }
  if (!out) out = value.slice(0, Math.max(1, maxChars - 1));
  if (out.length < value.length && !/[。！？!?]$/.test(out)) {
    out = out.replace(/[，、；：\s]+$/, "") + "…";
  }
  return out;
}

// ── 弹语展示（忠实直译 + 来源 + 动作）──────────────────
function renderQuote(q) {
  currentQuote = q;
  window.philo?.quoteVisible?.(q.slug);
  playAnimation("reading");
  setBubbleMode("quote");
  bubbleBody.classList.remove("streaming");
  bubbleBody.textContent = formatQuoteText(q.text); // 尽量在语义标点处自然断行
  bubbleAttribution.textContent = `— ${q.author || "哲学家"}`;
  bubbleAttribution.hidden = false;
  bubbleSrc.hidden = true;
  // 来源：locus + 逐字校验原文，展示不改写（契约 §4）
  if (q.quote) {
    bubbleSrc.innerHTML = `<span class="locus">${esc(q.locus || "")}</span>　“${esc(q.quote)}”`;
    bubbleSrc.scrollTop = 0;
  }
  bubbleActions.innerHTML = "";
  addAction("说人话", () => explainPlain(q));
  if (q.quote) addAction("看出处", () => {
    const opening = bubbleSrc.hidden;
    bubbleSrc.hidden = !opening;
    if (opening) bubbleSrc.scrollTop = 0;
    fit();
  });
  addAction("深度聊 →", () => window.philo?.openWeb(q.slug));
  showBubble();
}

function addAction(label, fn) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = (...args) => {
    armBubbleDismiss();
    fn(...args);
  };
  bubbleActions.appendChild(b);
}
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// ── 说人话：直接读取概念卡 plain 层，不依赖远程模型 ─────
async function explainPlain(q) {
  noteInteraction();
  playAnimation("reading");
  setBubbleMode("plain");
  bubbleSrc.hidden = true;
  bubbleActions.innerHTML = "";
  bubbleBody.textContent = "我翻一下这张概念卡……";
  bubbleBody.classList.add("streaming");
  showBubble();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CFG.engineIsRemote ? 75000 : 5000);
  try {
    const url = new URL(`${CFG.engine}/concept`);
    url.searchParams.set("corpus_id", q.corpus_id || "");
    url.searchParams.set("slug", q.slug || "marcus-aurelius");
    const resp = await fetch(url, { signal: controller.signal });
    const data = await resp.json();
    if (!resp.ok || !data.concept?.plain) throw new Error(data.error || `HTTP ${resp.status}`);
    bubbleBody.textContent = shortenPlain(data.concept.plain);
    playAnimation("talking");
  } catch (_e) {
    bubbleBody.textContent = "本地释义暂时没有读到，请重启 philo-pet 引擎后再试。";
    playAnimation("calm");
  } finally {
    clearTimeout(timeout);
    bubbleBody.classList.remove("streaming");
    addAction("返回弹语", () => renderQuote(q));
    addAction("深度聊 →", () => window.philo?.openWeb(q.slug));
    armBubbleDismiss();
    fit();
  }
}

// ── 交互绑定：短按开关弹窗，长按后拖动窗口 ─────────────
let longPressTimer = null;
let dragging = false;
let activePointer = null;
let dragStart = null;

async function showQuoteOnClick() {
  if (quoteRequestPending) return;
  quoteRequestPending = true;
  noteInteraction();
  playAnimation("wave", { restart: true });
  const previousId = currentQuote?.id;
  setBubbleMode("plain");
  bubbleSrc.hidden = true;
  bubbleActions.innerHTML = "";
  bubbleBody.textContent = CFG.engineIsRemote
    ? "服务刚睡醒，我叫它一下……"
    : "我找一句新的……";
  bubbleBody.classList.add("streaming");
  showBubble();
  // Render 免费实例的首次唤醒可能超过一分钟；加载提示由请求完成后再计时。
  if (bubbleDismissTimer) clearTimeout(bubbleDismissTimer);
  bubbleDismissTimer = null;
  try {
    let quote = await window.philo?.requestQuote();
    if (quote?.id === previousId) quote = await window.philo?.requestQuote();
    if (quote && quote.id !== previousId) {
      renderQuote(quote);
    } else {
      setBubbleMode("plain");
      bubbleSrc.hidden = true;
      bubbleActions.innerHTML = "";
      bubbleBody.textContent = "暂时没有新的弹语，过一会儿再来找我吧。";
      addAction("好", hideBubble);
      showBubble();
    }
  } catch (_e) {
    setBubbleMode("plain");
    bubbleSrc.hidden = true;
    bubbleActions.innerHTML = "";
    bubbleBody.textContent = "暂时没有连上弹语服务，请稍后再点我试试。";
    addAction("好", hideBubble);
    showBubble();
  } finally {
    bubbleBody.classList.remove("streaming");
    quoteRequestPending = false;
  }
}

function toggleBubbleFromPet() {
  noteInteraction();
  if (!bubble.hidden) {
    hideBubble();
  } else if (currentQuote) {
    renderQuote(currentQuote);
  } else {
    showQuoteOnClick();
  }
}

// 气泡主体用于换下一句；出处区域保留滚动和选中文字的能力。
bubble.addEventListener("click", () => {
  if (window.getSelection()?.toString()) return;
  showQuoteOnClick();
});
bubbleSrc.addEventListener("click", (event) => event.stopPropagation());

pet.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  activePointer = e.pointerId;
  dragStart = { x: e.screenX, y: e.screenY };
  pet.setPointerCapture?.(e.pointerId);
  pet.classList.add("long-press");
  longPressTimer = setTimeout(() => {
    dragging = true;
    pet.classList.add("dragging");
    window.philo?.startDrag({ x: e.screenX, y: e.screenY });
  }, 260);
});

pet.addEventListener("pointermove", (e) => {
  if (e.pointerId !== activePointer || !dragging) return;
  const dx = e.screenX - dragStart.x;
  playAnimation(dx >= 0 ? "runRight" : "runLeft");
  window.philo?.moveDrag({ x: e.screenX, y: e.screenY });
});

function finishPointer(e, cancelled = false) {
  if (e.pointerId !== activePointer) return;
  if (longPressTimer) clearTimeout(longPressTimer);
  pet.classList.remove("long-press", "dragging");
  if (dragging) {
    window.philo?.endDrag();
    playAnimation("idle", { restart: true });
    noteInteraction();
  } else if (!cancelled) {
    toggleBubbleFromPet();
  }
  dragging = false;
  activePointer = null;
  dragStart = null;
}

pet.addEventListener("pointerup", (e) => finishPointer(e));
pet.addEventListener("pointercancel", (e) => finishPointer(e, true));

// ── 初始化 ────────────────────────────────────────────
(async () => {
  playAnimation("idle");
  if (document.fonts?.ready) await document.fonts.ready;
  if (window.philo) {
    CFG = await window.philo.getConfig();
    applyUiScale(CFG.petScale || 1);
    window.philo.onQuote((q) => { if (q) renderQuote(q); });
    window.philo.onPetSize((scale) => applyUiScale(scale));
    window.philo.onAmbientAction(() => playAmbientAction());
  }
  scheduleAmbientAction();
  fit();
})();
