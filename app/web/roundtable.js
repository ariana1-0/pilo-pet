/* Independent view state; one SSE discussion plus concurrent user submissions. */
(function () {
  "use strict";
  const app = window.PhiloApp, core = window.PhiloRoundtable;
  const $ = selector => document.querySelector(selector);
  const stream = $("#rt-stream"), input = $("#rt-input");
  let people = [], roster = [], draft = [], sessionId = null, creating = null;
  let busy = false, stopping = false, blocked = app.isCrisis(), ready = false;
  let epoch = 0, pauseVersion = 0, wantRun = false, retry = false, controller = null;
  let discussion = core.createDiscussion(), bubbles = new Map(), outbox = [], pumping = false;
  let activeSlug = null, pinned = true, crisisShown = false;
  let expired = false;
  let resetting = false;
  let composerOpen = false;
  let composing = false;
  let mode = new URLSearchParams(location.search).get("mode") === "roundtable" ? "roundtable" : "deep";
  const id = () => crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  function person(slug) { return people.find(p => p.slug === slug); }
  function status(text) { $("#rt-status").textContent = text; }
  function scroll(force = false) { if (force || pinned) stream.scrollTop = stream.scrollHeight; }
  stream.addEventListener("scroll", () => { pinned = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80; });
  function hasContent() { return bubbles.size > 0 || outbox.length > 0; }
  function sync() {
    const locked = resetting || app.isDeleting();
    const started = hasContent();
    $("#roundtable").classList.toggle("has-discussion", started);
    $("#rt-participants").hidden = started;
    $(".roundtable-header .chapter-rule").hidden = started;
    const collapsed = busy && !composerOpen && !blocked;
    const wasCollapsed = $("#rt-form").hidden;
    $("#rt-form").hidden = collapsed;
    const composeToggle = $("#rt-compose-toggle");
    composeToggle.hidden = !busy || blocked;
    composeToggle.disabled = stopping || locked;
    composeToggle.textContent = collapsed ? "插话" : "收起输入";
    composeToggle.setAttribute("aria-expanded", String(!collapsed));
    $(".roundtable-controls").hidden = !sessionId && !$("#rt-status").textContent;
    if (collapsed && document.activeElement === input) composeToggle.focus();
    if (wasCollapsed !== collapsed) {
      if (!collapsed) resize();
      if (pinned) requestAnimationFrame(() => scroll());
    }
    input.disabled = !ready || blocked || expired || locked;
    $("#rt-send").disabled = !ready || blocked || expired || locked || !input.value.trim();
    $("#rt-choose").disabled = !ready || stopping || locked;
    $("#rt-choose").textContent = hasContent() ? "新开圆桌" : "选择入场者";
    $("#rt-toggle").hidden = !sessionId || blocked;
    $("#rt-toggle").disabled = stopping || locked || (!busy && outbox.some(m => m.state !== "sent"));
    $("#rt-resume").disabled = locked;
    $("#rt-toggle").textContent = stopping ? "正在暂停…" : busy ? "暂停讨论" : retry ? "重试当前发言" : "继续讨论";
    $("#rt-crisis").hidden = !blocked;
    input.placeholder = busy ? "随时补充，下一位会接着你的话聊…" : "想请大家聊聊什么？";
  }
  function picture(p, className = "") {
    const image = document.createElement("img");
    image.src = p.portrait; image.alt = p.name; image.className = className;
    image.style.objectPosition = p.portraitPosition;
    image.addEventListener("error", () => { image.hidden = true; });
    return image;
  }
  function participants() {
    const row = $("#rt-participants"); row.replaceChildren();
    for (const slug of roster) {
      const p = person(slug), item = document.createElement("div");
      item.className = "roundtable-seat"; item.dataset.slug = slug;
      const frame = document.createElement("div"); frame.className = "seat-portrait";
      const img = picture(p); img.style.transform = `scale(${p.portraitScale || 1})`;
      img.style.transformOrigin = p.portraitPosition;
      frame.append(img);
      const name = document.createElement("span"); name.textContent = p.name;
      const speaking = document.createElement("small"); speaking.textContent = "正在发言";
      item.append(frame, name, speaking); row.append(item);
    }
    highlight(activeSlug);
  }
  function highlight(slug) {
    activeSlug = slug;
    for (const item of $("#rt-participants").children) item.classList.toggle("is-speaking", item.dataset.slug === slug);
  }
  function showTableBackground() { app.showBackground(person("marcus-aurelius")); }
  function clearEmpty() { stream.querySelector(".roundtable-empty")?.remove(); }
  function speakerBubble(item) {
    if (bubbles.has(item.id)) return bubbles.get(item.id);
    clearEmpty();
    const element = document.createElement("article"); element.className = "roundtable-message msg";
    const heading = document.createElement("div"); heading.className = "speaker-label";
    const p = person(item.slug), name = document.createElement("span"); name.textContent = p.name;
    heading.append(picture(p), name);
    const body = document.createElement("div"); body.className = "speaker-text streaming";
    const note = document.createElement("small"); note.className = "speaker-note";
    element.append(heading, body, note); stream.append(element);
    const bubble = { element, body, note }; bubbles.set(item.id, bubble); return bubble;
  }
  function render(item) {
    if (!item) return;
    const bubble = speakerBubble(item);
    bubble.body.textContent = window.PhiloChat.replyText(item.content, item.status === "streaming");
    bubble.body.classList.toggle("streaming", item.status === "streaming");
    bubble.note.textContent = item.status === "incomplete" ? "发言未完成 · 继续时会重新回复" : "";
    scroll();
  }
  async function request(path, data, options = {}) {
    const response = await fetch(app.ENGINE + path, {
      method: options.method || "POST", headers: { "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      signal: AbortSignal.timeout(25000), ...options,
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || "暂时连接不上，请重试。");
      error.status = response.status; throw error;
    }
    return result;
  }
  async function ensureSession() {
    if (sessionId) return sessionId;
    if (!creating) {
      const version = epoch;
      creating = request("/roundtable/sessions", { user_id: app.USER_ID, participants: roster, region: "CN" })
        .then(result => {
          if (epoch !== version) {
            request(`/roundtable/sessions/${result.session_id}`, undefined, { method: "DELETE" }).catch(() => {});
            throw new Error("圆桌已重置。");
          }
          sessionId = result.session_id; sync(); return sessionId;
        }).finally(() => { if (epoch === version) creating = null; });
    }
    return creating;
  }
  function showCrisis(data) {
    blocked = true; wantRun = false;
    render(discussion.apply("crisis", {}));
    if (!crisisShown && data) {
      clearEmpty(); crisisShown = true;
      const box = document.createElement("div"); box.className = "msg crisis";
      const title = document.createElement("div"); title.className = "label"; title.textContent = "philo-pet · 此刻先照顾好你";
      const text = document.createElement("div"); text.textContent = data.message || data.text || "";
      box.append(title, text);
      for (const resource of data.resources || []) {
        const row = document.createElement("div"); row.className = "res";
        row.textContent = [resource.name, resource.contact || resource.phone || resource.url, resource.hours].filter(Boolean).join(" · ");
        box.append(row);
      }
      stream.append(box);
    }
    app.setCrisis(true); status("讨论已暂停。"); sync(); scroll(true);
  }
  function maybeRun() {
    if (wantRun && !busy && !stopping && !blocked && !resetting && !app.isDeleting() && sessionId && mode === "roundtable") {
      wantRun = false; void run(false);
    }
  }
  async function run(isRetry) {
    if (busy || stopping || blocked || resetting || app.isDeleting() || !sessionId) return;
    const version = epoch, sid = sessionId;
    busy = true; stopping = false; retry = false;
    composerOpen = composing || Boolean(input.value.trim());
    const abort = new AbortController(); controller = abort;
    let completed = false, timedOut = false, timer;
    const heartbeat = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { timedOut = true; abort.abort(); }, 90000);
    };
    heartbeat(); status("请大家入场…"); sync();
    try {
      const response = await fetch(`${app.ENGINE}/roundtable/sessions/${sid}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry: isRetry }), signal: abort.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json(); const error = new Error(data.error || "暂时无法开始讨论。");
        error.status = response.status; throw error;
      }
      for await (const event of window.PhiloChat.readEvents(response.body)) {
        if (version !== epoch) break;
        heartbeat();
        if (event.event === "crisis") { showCrisis(event.data); continue; }
        // Stop means no more visible tokens, even if some were already buffered.
        if (stopping && event.event === "delta") continue;
        const item = discussion.apply(event.event, event.data);
        if (item) render(item);
        if (event.event === "speaker_start" && !stopping) {
          highlight(event.data.slug); status(person(event.data.slug).name + "正在发言…");
        } else if (event.event === "error") {
          retry = true; wantRun = false; status(event.data.message);
        } else if (event.event === "paused") {
          completed = true;
          if (event.data.reason === "complete") status("先聊到这里。你也可以接着问。 ");
          else if (event.data.reason === "stopped" || stopping) status("讨论已暂停。");
          else if (event.data.reason === "error") retry = true;
        }
      }
      if (!completed && version === epoch) throw new Error("连接中断，已保留收到的内容。");
    } catch (error) {
      if (version !== epoch) return;
      render(discussion.apply("error", {}));
      if (!blocked) {
        retry = true; wantRun = false;
        status(error.status === 410 ? error.message : stopping ? "讨论已暂停。" : timedOut ? "连接超时，可以重试当前发言。" : error.message);
        if (error.status === 410) { expired = true; sessionId = null; $("#rt-choose").textContent = "新开圆桌"; }
      }
    } finally {
      clearTimeout(timer);
      if (version === epoch) {
        busy = false; stopping = false; controller = null;
        render(discussion.apply("paused", {})); highlight(null); sync(); maybeRun();
      }
    }
  }
  async function pause() {
    pauseVersion += 1; wantRun = false;
    if (!sessionId || !busy || stopping) return;
    stopping = true; render(discussion.apply("paused", {})); sync();
    try { await request(`/roundtable/sessions/${sessionId}/stop`, {}); }
    catch { controller?.abort(); }
  }
  function retryMessage(message, text) {
    message.state = "failed"; message.note.replaceChildren();
    if (expired) { message.note.textContent = "圆桌已过期，请新开圆桌。"; return; }
    const label = document.createElement("span"); label.textContent = text + " ";
    const button = document.createElement("button"); button.type = "button"; button.className = "retry"; button.textContent = "重试发送";
    button.onclick = () => { message.state = "queued"; message.note.textContent = "正在发送…"; void pump(); };
    message.note.append(label, button);
  }
  async function pump() {
    if (pumping || blocked || resetting || app.isDeleting()) return;
    pumping = true; const version = epoch;
    try {
      for (const message of outbox) {
        if (version !== epoch || blocked || resetting || app.isDeleting() || message.state === "failed") break;
        if (message.state === "sent") continue;
        const pauseAtSubmission = pauseVersion;
        try {
          const sid = await ensureSession();
          const result = await request(`/roundtable/sessions/${sid}/messages`, { message_id: message.id, content: message.content });
          if (version !== epoch) break;
          if (!result.accepted) throw new Error("消息未能提交，请新开圆桌。");
          message.state = "sent"; message.note.textContent = "";
          if (result.crisis) { showCrisis(result.response); break; }
          if (!result.running && pauseAtSubmission === pauseVersion) wantRun = true;
          maybeRun();
        } catch (error) {
          if (version === epoch) {
            if (error.status === 410) { expired = true; sessionId = null; }
            retryMessage(message, error.status === 410 ? "圆桌已过期，请新开圆桌。" : "尚未发送成功。");
            status(error.message); wantRun = false;
          }
          break;
        }
      }
    } finally {
      if (version === epoch) { pumping = false; sync(); }
    }
  }
  function send() {
    const text = input.value.trim(); if (!ready || blocked || expired || resetting || app.isDeleting() || !text) return;
    clearEmpty();
    const element = document.createElement("div"); element.className = "msg user";
    const body = document.createElement("div"); body.textContent = text;
    const note = document.createElement("small"); note.className = "speaker-note"; note.textContent = "正在发送…";
    element.append(body, note); stream.append(element);
    const message = { id: id(), content: text, note, state: "queued" };
    outbox.push(message); bubbles.set(message.id, { element, body, note });
    input.value = ""; composerOpen = false; resize(); sync(); scroll(true); void pump();
  }
  async function dispose() {
    resetting = true; sync();
    const sid = sessionId;
    epoch += 1; pauseVersion += 1; wantRun = false;
    controller?.abort(); controller = null;
    sessionId = null; creating = null; busy = false; stopping = false; pumping = false;
    if (sid) await request(`/roundtable/sessions/${sid}`, undefined, { method: "DELETE" }).catch(() => {});
  }
  function clear() {
    resetting = false;
    composerOpen = false;
    discussion = core.createDiscussion(); bubbles = new Map(); outbox = []; retry = false; activeSlug = null; crisisShown = false; expired = false;
    stream.replaceChildren();
    const empty = document.createElement("div"); empty.className = "roundtable-empty";
    const title = document.createElement("p"); title.textContent = "把你的问题，放在桌上。";
    const caption = document.createElement("span"); caption.textContent = "听听不同的想法，也随时说说你的。";
    empty.append(title, caption); stream.append(empty);
    input.value = ""; status(""); participants(); sync(); resize();
  }
  function drawPicker() {
    const list = $("#rt-picker-list"); list.replaceChildren();
    for (const p of people) {
      const button = document.createElement("button"); button.type = "button"; button.className = "person-option";
      const position = draft.indexOf(p.slug);
      button.setAttribute("aria-pressed", String(position >= 0));
      const label = document.createElement("span"), name = document.createElement("strong"), order = document.createElement("small");
      name.textContent = p.name; order.textContent = position >= 0 ? `第 ${position + 1} 位发言` : p.school;
      label.append(name, order); button.append(picture(p), label);
      button.onclick = () => { draft = position >= 0 ? draft.filter(s => s !== p.slug) : [...draft, p.slug]; drawPicker(); };
      list.append(button);
    }
    $("#rt-picker-order").textContent = draft.map(s => person(s).name).join(" → ") || "请邀请至少两位哲学家。";
    $("#rt-picker-apply").disabled = draft.length < 2 || draft.length > 6;
  }
  async function choose() {
    if (!ready || stopping || resetting || app.isDeleting()) return;
    if (hasContent()) {
      await pause();
      if (!await app.confirmAction("新开一桌？", "当前圆桌内容将清空，深度聊不受影响。", "新开圆桌")) return;
    }
    draft = [...roster]; drawPicker(); $("#rt-picker").showModal();
  }
  function resize() { input.style.height = "auto"; input.style.height = Math.min(Math.max(input.scrollHeight, 27), 112) + "px"; }
  function setMode(next, updateURL = true) {
    if (mode === "roundtable" && next !== mode) void pause();
    mode = next; document.body.dataset.mode = next;
    $("#app").hidden = next !== "deep"; $("#roundtable").hidden = next !== "roundtable";
    $("#btn-reset").hidden = next !== "deep"; $("#rt-menu-new").hidden = next !== "roundtable";
    $("#more-menu").open = false;
    for (const link of document.querySelectorAll("[data-mode]")) {
      if (link.dataset.mode === next) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    if (next === "deep") app.activateDeep();
    else { document.title = "圆桌派 · philo-pet"; showTableBackground(); highlight(activeSlug); resize(); }
    if (updateURL) { const url = new URL(location.href); url.searchParams.set("mode", next); window.history.pushState(null, "", url); }
  }
  $("#rt-form").addEventListener("submit", event => { event.preventDefault(); send(); });
  input.addEventListener("input", () => { resize(); sync(); });
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; });
  input.addEventListener("keydown", event => { if (core.isSubmitKey(event)) { event.preventDefault(); send(); } });
  $("#rt-toggle").onclick = () => { if (busy) void pause(); else void run(retry); };
  $("#rt-compose-toggle").onclick = () => {
    // Closing never discards a draft; sending is still available during a speech.
    composerOpen = $("#rt-form").hidden;
    sync();
    if (composerOpen) { resize(); input.focus(); }
  };
  $("#rt-choose").onclick = choose; $("#rt-menu-new").onclick = choose;
  $("#rt-picker-close").onclick = () => $("#rt-picker").close();
  $("#rt-picker-apply").onclick = async () => {
    if (draft.length < 2 || draft.length > 6) return;
    $("#rt-picker").close(); await dispose(); roster = [...draft];
    app.writeLocal("philo_roundtable_participants", JSON.stringify(roster)); clear(); input.focus();
  };
  $("#rt-resume").onclick = async () => { await dispose(); blocked = false; app.setCrisis(false); clear(); input.focus(); };
  document.querySelectorAll("[data-mode]").forEach(link => link.addEventListener("click", event => {
    event.preventDefault(); setMode(link.dataset.mode);
  }));
  window.addEventListener("popstate", () => setMode(new URLSearchParams(location.search).get("mode") === "roundtable" ? "roundtable" : "deep", false));
  window.addEventListener("philo-crisis", async () => {
    const wasBlocked = blocked;
    blocked = app.isCrisis();
    if (blocked) void pause();
    else if (wasBlocked && !resetting) { await dispose(); clear(); }
    sync();
  });
  window.addEventListener("philo-forgetting", () => { void pause(); sync(); });
  window.addEventListener("philo-forget-finished", sync);
  window.addEventListener("philo-forgotten", async () => { await dispose(); clear(); });
  window.addEventListener("pagehide", () => {
    if (sessionId) fetch(`${app.ENGINE}/roundtable/sessions/${sessionId}`, { method: "DELETE", keepalive: true }).catch(() => {});
  });
  setMode(mode, false);
  app.ready.then(catalog => {
    people = catalog;
    if (people.length < 2) { status("哲学家资料暂时没有加载完整，请刷新重试。"); return; }
    roster = core.participants(people, app.readLocal("philo_roundtable_participants"));
    ready = true; participants(); sync();
    if (mode === "roundtable") showTableBackground();
  });
})();
