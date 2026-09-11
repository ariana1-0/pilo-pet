/* Local deep chat. Scripted greetings are original AI character dialogue,
 * not quotations. Each request uses the selected philosopher's compiled prompt.
 */
"use strict";
const $ = (selector) => document.querySelector(selector);
const core = window.PhiloChat;
function readLocal(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writeLocal(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
const localHost = location.hostname === "127.0.0.1" || location.hostname === "localhost";
const DEFAULT_ENGINE = localHost || location.protocol === "file:"
  ? "http://127.0.0.1:8848"
  : location.origin;
const ENGINE = readLocal("philo_engine") || window.PHILO_ENGINE || DEFAULT_ENGINE;
const ENGINE_IS_REMOTE = !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(ENGINE);
const USER_ID = readLocal("philo_user") || ("web-" + (crypto.randomUUID?.() || Math.random().toString(36).slice(2)));
writeLocal("philo_user", USER_ID);
const CRISIS_KEY = "philo_crisis_" + USER_ID;
const stream = $("#stream"), input = $("#input"), sendButton = $("#btn-send");
let people = [], person = null, history = [], busy = false, deleting = false;
let controller = null, retryTurn = null;
let crisisActive = readLocal(CRISIS_KEY) === "1";
let pinnedToBottom = true;
let composerOpen = false, composing = false;

function status(text = "") {
  $("#status").classList.remove("sr-only");
  $("#status").textContent = text;
  $("#status").hidden = !text;
}
function scrollDown(force = false) {
  if (force || pinnedToBottom) stream.scrollTop = stream.scrollHeight;
}
stream.addEventListener("scroll", () => {
  pinnedToBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
});
function addMessage(type, text = "") {
  const element = document.createElement("div");
  element.className = "msg " + type;
  if (type.split(" ").includes("philo")) {
    const label = document.createElement("div"); label.className = "speaker-label";
    const portrait = document.createElement("img"); portrait.src = person.portrait; portrait.alt = "";
    portrait.style.objectPosition = person.portraitPosition;
    portrait.addEventListener("error", () => { portrait.hidden = true; });
    const name = document.createElement("span"); name.textContent = person.name;
    label.append(portrait, name);
    const body = document.createElement("div"); body.className = "speaker-text";
    body.classList.toggle("streaming", type.split(" ").includes("streaming"));
    body.textContent = text; element.append(label, body);
  } else element.textContent = text;
  stream.append(element);
  scrollDown();
  return element;
}
function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(Math.max(input.scrollHeight, 27), 112) + "px";
}
function syncControls() {
  const started = history.some(m => m.role === "user");
  $("#app").classList.toggle("has-discussion", started);
  $("#app .portrait-frame").hidden = started;
  $("#latin-name").hidden = started;
  $("#app .chapter-rule").hidden = started;
  $("#btn-new-chat").hidden = !started;
  $("#btn-new-chat").disabled = busy || deleting || !person;
  const collapsed = busy && !composerOpen && !crisisActive;
  const wasCollapsed = $("#chat-form").hidden;
  $("#chat-form").hidden = collapsed;
  $("#deep-controls").hidden = !busy || crisisActive;
  const composeToggle = $("#btn-compose-toggle");
  composeToggle.textContent = collapsed ? "写下一句" : "收起输入";
  composeToggle.setAttribute("aria-expanded", String(!collapsed));
  composeToggle.disabled = deleting;
  $("#btn-stop-reply").disabled = !busy || deleting || crisisActive;
  $("#deep-status").textContent = busy && person ? person.name + "正在回复…" : "";
  if (collapsed && document.activeElement === input) composeToggle.focus();
  if (wasCollapsed !== collapsed) {
    if (!collapsed) autosize();
    if (pinnedToBottom) requestAnimationFrame(() => scrollDown());
  }
  input.disabled = !person || deleting || crisisActive;
  sendButton.disabled = !person || deleting || crisisActive || busy || !input.value.trim();
  input.placeholder = busy ? "先写下一句，等回复结束后发送…" : "从此刻想到的那件事说起…";
  $("#btn-philosopher").disabled = busy || deleting || !person;
  $("#btn-reset").disabled = busy || deleting || !person;
  $("#btn-forget").disabled = busy || deleting;
  $("#btn-resume").disabled = busy || deleting;
  $("#crisis-banner").hidden = !crisisActive;
}
function setCrisis(active) {
  const wasActive = crisisActive;
  crisisActive = active;
  if (active) controller?.abort();
  writeLocal(CRISIS_KEY, active ? "1" : "0");
  if (wasActive && !active && person) startConversation(person);
  syncControls();
  window.dispatchEvent(new Event("philo-crisis"));
}
function showBackground(selected) {
  if (!selected) return;
  const backdrop = $(".backdrop");
  backdrop.style.backgroundImage = 'url("' + selected.background + '")';
  backdrop.style.backgroundPosition = selected.backgroundPosition || "50% 50%";
  backdrop.style.setProperty("--background-saturation", selected.backgroundSaturation ?? 1);
  backdrop.classList.toggle("supplied-background", selected.slug !== "marcus-aurelius");
}
function startConversation(nextPerson) {
  person = nextPerson;
  if (document.body.dataset.mode !== "roundtable") showBackground(person);
  history = [];
  composerOpen = false;
  retryTurn = null;
  stream.replaceChildren();
  pinnedToBottom = true;
  $("#philosopher-name").textContent = person.name;
  $("#latin-name").textContent = person.latinName;
  $("#btn-philosopher").setAttribute("aria-label", "和其他哲学家聊聊，当前为" + person.name);
  if (document.body.dataset.mode !== "roundtable") document.title = person.name + " · 深度聊";
  const portrait = $("#portrait");
  $("#portrait-fallback").hidden = true;
  portrait.hidden = false;
  portrait.alt = person.name + "的肖像";
  portrait.style.objectPosition = person.portraitPosition || "50% 25%";
  portrait.style.transform = "scale(" + (person.portraitScale || 1) + ")";
  portrait.style.transformOrigin = person.portraitPosition || "50% 25%";
  portrait.src = person.portrait;
  writeLocal("philo_last_philosopher", person.slug);
  const url = new URL(location.href);
  url.searchParams.set("philosopher", person.slug);
  window.history.replaceState(null, "", url);
  input.value = "";
  status();
  if (crisisActive) {
    addMessage("crisis", "先照顾好此刻的自己。角色对话仍然暂停，等你感到平稳、希望继续时再回来。");
  } else {
    addMessage("philo opening", person.opening);
    history.push({ role: "assistant", content: person.opening });
  }
  syncControls();
  autosize();
}
$("#portrait").addEventListener("error", () => {
  $("#portrait").hidden = true;
  $("#portrait-fallback").textContent = person?.name.slice(0, 1) || "";
  $("#portrait-fallback").hidden = false;
});
function clearRetry() {
  retryTurn?.errorElement?.remove();
  retryTurn = null;
}
function renderCrisis(data) {
  const element = document.createElement("div");
  element.className = "msg crisis";
  const label = document.createElement("div");
  label.className = "label"; label.textContent = "philo-pet · 此刻先照顾你";
  const text = document.createElement("div");
  text.textContent = data.message;
  element.append(label, text);
  for (const resource of data.resources || []) {
    const row = document.createElement("div");
    row.className = "res";
    row.textContent = resource.name + "：" + resource.contact + (resource.hours ? "（" + resource.hours + "）" : "");
    element.append(row);
  }
  stream.append(element);
  scrollDown(true);
}
function confirmAction(title, description, actionLabel) {
  $("#more-menu").open = false;
  const dialog = $("#confirm-dialog");
  $("#confirm-title").textContent = title;
  $("#confirm-description").textContent = description;
  $("#confirm-ok").textContent = actionLabel;
  dialog.returnValue = "cancel";
  dialog.showModal();
  $("#confirm-cancel").focus();
  return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true }));
}
$("#confirm-cancel").onclick = () => $("#confirm-dialog").close("cancel");
$("#confirm-ok").onclick = () => $("#confirm-dialog").close("ok");

async function send(isRetry = false) {
  if (!person || busy || deleting || crisisActive) return;
  let turn;
  if (isRetry) {
    turn = retryTurn;
    if (!turn) return;
    turn.errorElement?.remove();
    turn.replyElement?.remove();
    history = history.slice(0, turn.historyLength);
    retryTurn = null;
  } else {
    const text = input.value.trim();
    if (!text) return;
    clearRetry();
    addMessage("user", text);
    history.push({ role: "user", content: text });
    turn = { historyLength: history.length };
    input.value = ""; autosize();
  }
  busy = true;
  composerOpen = composing || Boolean(input.value.trim());
  controller = new AbortController();
  syncControls();
  status();
  scrollDown(true);
  const reply = addMessage("philo streaming");
  turn.replyElement = reply;
  let acc = "", completed = false, bypassed = false, timedOut = false;
  let timeout;
  const resetTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => { timedOut = true; controller?.abort(); }, 90000);
  };
  resetTimeout();
  try {
    const response = await fetch(ENGINE + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(core.chatPayload(USER_ID, person.slug, history)),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error("service");
    for await (const event of core.readEvents(response.body)) {
      resetTimeout();
      switch (event.event) {
        case "crisis":
          bypassed = true;
          reply.remove();
          renderCrisis(event.data);
          setCrisis(true);
          break;
        case "delta":
          if (bypassed) break;
          acc += event.data.text;
          reply.querySelector(".speaker-text").textContent = core.replyText(acc, true);
          scrollDown();
          break;
        case "done":
          if (event.data.refusal) throw new Error("refusal");
          completed = true;
          break;
        case "error":
          throw new Error("service");
      }
    }
    if (!completed) throw new Error("interrupted");
  } catch (error) {
    if (!bypassed) {
      const stopped = error.name === "AbortError" && !timedOut;
      const errorElement = addMessage("error");
      const label = document.createElement("span");
      label.textContent = stopped ? "已停止回复。" : acc ? "连接中断，已保留收到的内容。" : "暂时没能接上这句话，请再试一次。";
      const retry = document.createElement("button");
      retry.type = "button"; retry.className = "retry";
      retry.textContent = stopped ? "重新回复" : "重试";
      retry.onclick = () => send(true);
      errorElement.append(label, retry);
      turn.errorElement = errorElement;
      retryTurn = turn;
    }
  } finally {
    clearTimeout(timeout);
    reply.classList.remove("streaming");
    reply.querySelector(".speaker-text").classList.remove("streaming");
    reply.querySelector(".speaker-text").textContent = core.replyText(acc);
    if (acc && !bypassed) history.push({ role: "assistant", content: acc });
    else reply.remove();
    busy = false; controller = null;
    syncControls();
    if (completed && !bypassed) {
      // Announce completion without reading every streaming token aloud.
      $("#status").textContent = person.name + "已回复。";
      $("#status").classList.add("sr-only");
      $("#status").hidden = false;
    }
    scrollDown();
  }
}
$("#chat-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!busy) send();
});
input.addEventListener("input", () => { autosize(); syncControls(); });
input.addEventListener("compositionstart", () => { composing = true; });
input.addEventListener("compositionend", () => { composing = false; });
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    if (!busy) send();
  }
});
$("#btn-reset").onclick = async () => {
  if (busy || deleting || !person) return;
  if (history.some(m => m.role === "user") && !await confirmAction("另起一聊？", "当前对话将从页面清空，已保存的困境记忆仍会保留。", "另起一聊")) return;
  $("#more-menu").open = false;
  startConversation(person);
};
$("#btn-new-chat").onclick = () => $("#btn-reset").click();
$("#btn-stop-reply").onclick = () => controller?.abort();
$("#btn-compose-toggle").onclick = () => {
  composerOpen = $("#chat-form").hidden;
  syncControls();
  if (composerOpen) { autosize(); input.focus(); }
};
$("#btn-forget").onclick = async () => {
  if (busy || deleting) return;
  if (!await confirmAction("遗忘我的记录？", "将删除此浏览器身份对应的困境记忆，并清空当前对话。删除后无法恢复。", "全部遗忘")) return;
  deleting = true; syncControls();
  window.dispatchEvent(new Event("philo-forgetting"));
  try {
    const response = await fetch(ENGINE + "/forget", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("forget");
    const result = await response.json();
    if (!result.deleted) throw new Error("forget");
    if (person) startConversation(person);
    window.dispatchEvent(new Event("philo-forgotten"));
    status("记录已遗忘。");
  } catch {
    status("暂时未能删除，记录仍然保留。请稍后再试。");
  } finally {
    deleting = false; syncControls();
    window.dispatchEvent(new Event("philo-forget-finished"));
  }
};
$("#btn-resume").onclick = () => {
  if (busy) return;
  setCrisis(false);
  history = []; // A resumed conversation does not replay the crisis transcript.
  stream.replaceChildren();
  addMessage("philo", person.opening);
  history.push({ role: "assistant", content: person.opening });
  status();
  input.focus();
};
window.addEventListener("storage", event => {
  if (event.key === CRISIS_KEY) {
    crisisActive = event.newValue === "1";
    if (crisisActive) controller?.abort();
    syncControls();
    window.dispatchEvent(new Event("philo-crisis"));
  }
});
document.querySelectorAll("[data-close]").forEach(button => {
  button.onclick = () => document.getElementById(button.dataset.close).close();
});
$("#btn-philosopher").onclick = () => {
  if (busy || !person) return;
  $("#more-menu").open = false;
  document.querySelectorAll(".person-option").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.slug === person.slug));
  });
  $("#philosopher-dialog").showModal();
};
async function choosePhilosopher(nextPerson) {
  if (busy || nextPerson.slug === person.slug) { $("#philosopher-dialog").close(); return; }
  $("#philosopher-dialog").close();
  if (history.some(m => m.role === "user") && !await confirmAction("与" + nextPerson.name + "开始新对话？", "当前对话将从页面清空。新的哲学家会用自己的方式与你开聊。", "开始新对话")) return;
  startConversation(nextPerson);
}
async function checkConnection() {
  const deadline = Date.now() + (ENGINE_IS_REMOTE ? 75000 : 5000);
  if (ENGINE_IS_REMOTE) status("正在唤醒对话服务，请稍候……");
  do {
    try {
      const response = await fetch(ENGINE + "/health", { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("offline");
      const health = await response.json();
      if (!health.api_configured) status("对话服务尚未准备好，稍后即可在这里继续。");
      else if (health.slugs_available && !health.slugs_available.includes(person.slug)) {
        status("这位哲学家暂时还没准备好，请先换一位。");
      } else status();
      return;
    } catch {
      if (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 2500));
        continue;
      }
      status("暂时连接不上对话服务，稍后可以重试。");
      return;
    }
  } while (Date.now() < deadline);
}
async function init() {
  try {
    const response = await fetch("./philosophers.json");
    if (!response.ok) throw new Error("catalog");
    people = await response.json();
    for (const nextPerson of people) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "person-option"; button.dataset.slug = nextPerson.slug;
      const image = document.createElement("img");
      image.src = nextPerson.portrait; image.alt = ""; image.loading = "lazy";
      const info = document.createElement("span");
      const name = document.createElement("strong"); name.textContent = nextPerson.name;
      const school = document.createElement("small"); school.textContent = nextPerson.school;
      info.append(name, school); button.append(image, info);
      button.onclick = () => choosePhilosopher(nextPerson);
      $("#philosopher-list").append(button);
    }
    startConversation(core.selectPhilosopher(people, location.search, readLocal("philo_last_philosopher")));
    await checkConnection();
  } catch {
    status("页面暂时没有加载完整，请刷新后再试。");
  }
}
window.PhiloApp = {
  ENGINE, USER_ID, readLocal, writeLocal, confirmAction, showBackground,
  setCrisis, isCrisis: () => crisisActive,
  isDeleting: () => deleting,
  activateDeep: () => { showBackground(person); autosize(); if (person) document.title = person.name + " · 深度聊"; },
  ready: init().then(() => people),
};
