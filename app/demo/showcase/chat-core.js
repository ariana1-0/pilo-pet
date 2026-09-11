/* Shared, dependency-free desktop handoff and SSE helpers. */
(function (root) {
  "use strict";
  function selectPhilosopher(people, search, remembered) {
    const params = new URLSearchParams(search);
    const requested = params.get("philosopher") || params.get("slug");
    return people.find(p => p.slug === requested)
      || people.find(p => p.slug === remembered)
      || people.find(p => p.slug === "marcus-aurelius") || people[0];
  }
  function createEventParser() {
    let buffer = "";
    function parse(block) {
      let event = "message";
      const data = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (!data.length) return null;
      return { event, data: JSON.parse(data.join("\n")) };
    }
    return {
      push(text) {
        buffer = (buffer + text).replace(/\r\n/g, "\n");
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop();
        return blocks.map(parse).filter(Boolean);
      },
      finish() {
        const event = parse(buffer);
        buffer = "";
        return event ? [event] : [];
      },
    };
  }
  async function* readEvents(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = createEventParser();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield* parser.push(decoder.decode(value, { stream: true }));
      }
      yield* parser.push(decoder.decode());
      yield* parser.finish();
    } finally { reader.releaseLock(); }
  }
  function chatPayload(userId, slug, messages) {
    return { user_id: userId, source: "web", slug, region: "CN",
      messages: messages.map(({ role, content }) => ({ role, content })) };
  }
  function replyText(text, streaming = false) {
    // Keep model/history text intact; display emphasis as plain text. Do not
    // interpret HTML. Spaced operators (2 ** 3 / 2 * 3) remain literal text.
    const plain = text.replace(/\\\*/g, "*")
      .replace(/\*{2,3}(?=\S)|(?<=\S)\*{2,3}/g, "");
    // A Markdown delimiter may arrive one asterisk at a time over SSE.
    return streaming ? plain.replace(/\*+$/, "") : plain;
  }
  const api = { selectPhilosopher, createEventParser, readEvents, chatPayload, replyText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PhiloChat = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
