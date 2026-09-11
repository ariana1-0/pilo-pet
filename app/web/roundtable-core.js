(function (root) {
  "use strict";
  const defaults = ["marcus-aurelius", "zhuangzi", "nietzsche"];
  function participants(people, saved) {
    let selected;
    try { selected = JSON.parse(saved); } catch { /* use the default table */ }
    const valid = new Set(people.map(p => p.slug));
    if (!Array.isArray(selected) || selected.length < 2 || selected.length > 6
      || new Set(selected).size !== selected.length || selected.some(s => !valid.has(s))) {
      selected = defaults.filter(s => valid.has(s));
    }
    return selected;
  }
  function isSubmitKey(event) {
    return event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
  }
  function createDiscussion() {
    const messages = new Map();
    let active = null;
    return {
      messages,
      apply(event, data) {
        if (event === "speaker_start") {
          if (messages.has(data.message_id)) return null;
          active = { id: data.message_id, slug: data.slug, content: "", status: "streaming" };
          messages.set(active.id, active);
          return active;
        }
        const item = messages.get(data.message_id);
        if (event === "delta" && item?.status === "streaming") item.content += data.text;
        if (event === "speaker_done" && item) {
          if (typeof data.text === "string") item.content = data.text;
          item.status = "complete";
          if (active === item) active = null;
        }
        if (["paused", "error", "crisis"].includes(event) && active) {
          active.status = "incomplete";
          const result = active; active = null; return result;
        }
        return item || null;
      },
    };
  }
  const api = { participants, isSubmitKey, createDiscussion };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PhiloRoundtable = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
