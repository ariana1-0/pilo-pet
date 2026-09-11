const test = require("node:test");
const assert = require("node:assert/strict");
const people = require("./philosophers.json");
const { deepChatUrl } = require("../desktop/deep-link");
const { selectPhilosopher, readEvents, chatPayload, replyText } = require("./chat-core");

test("all six desktop quote authors reach their own greeting and chat request", () => {
  for (const person of people) {
    const link = new URL(deepChatUrl("http://localhost:8790/?existing=1", person.slug));
    const remembered = people.find(p => p.slug !== person.slug).slug;
    const selected = selectPhilosopher(people, link.search, remembered);
    assert.equal(selected.slug, person.slug);
    assert.equal(link.searchParams.get("existing"), "1");
    assert.equal(link.searchParams.get("source"), "pet");
    const payload = chatPayload("test-user", selected.slug, [
      { role: "assistant", content: selected.opening },
      { role: "user", content: "为什么这么说？" },
    ]);
    assert.equal(payload.slug, person.slug);
    assert.equal(payload.messages[0].content, person.opening);
    assert.equal(payload.messages[1].content, "为什么这么说？");
    assert.equal(payload.source, "web");
  }
  assert.equal(new Set(people.map(p => p.opening)).size, 6);
});

test("direct entry remembers selection; invalid inputs never become package paths", () => {
  assert.equal(selectPhilosopher(people, "", "zhuangzi").slug, "zhuangzi");
  assert.equal(selectPhilosopher(people, "?philosopher=../../secrets", null).slug, "marcus-aurelius");
  assert.equal(new URL(deepChatUrl("https://example.com/chat", "../../secrets")).searchParams.get("philosopher"), "marcus-aurelius");
  assert.throws(() => deepChatUrl("javascript:alert(1)", "laozi"));
});

test("streaming preserves split UTF-8, CRLF boundaries and the final event", async () => {
  const encoded = new TextEncoder().encode(
    'event: classify\r\ndata: {"tags":[]}\r\n\r\n' +
    'event: delta\r\ndata: {"text":"你且坐坐。"}\r\n\r\n' +
    'event: done\r\ndata: {"stop_reason":"stop"}'
  );
  // One-byte chunks split both Chinese characters and line delimiters.
  const body = new ReadableStream({ start(controller) {
    for (const byte of encoded) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  }});
  const events = [];
  for await (const event of readEvents(body)) events.push(event);
  assert.deepEqual(events.map(e => e.event), ["classify", "delta", "done"]);
  assert.equal(events[1].data.text, "你且坐坐。");
  assert.equal(events[2].data.stop_reason, "stop");
});

test("malformed response fails explicitly instead of silently discarding content", async () => {
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('event: delta\ndata: {broken}\n\n'));
    controller.close();
  }});
  await assert.rejects(async () => { for await (const event of readEvents(body)) void event; });
});

test("emphasis is plain text even when SSE splits a delimiter", () => {
  const raw = "是**怜悯**。\n\n也有***不同的想法***。";
  for (let end = 1; end <= raw.length; end++) {
    assert.equal(replyText(raw.slice(0, end), true).includes("*"), false);
  }
  assert.equal(replyText(raw), "是怜悯。\n\n也有不同的想法。");
  assert.equal(replyText("未完成的**想法", true), "未完成的想法");
  assert.equal(replyText(String.raw`是\*\*怜悯\*\*。`), "是怜悯。");
});

test("reply display preserves plain operators and treats HTML as literal text", () => {
  const raw = '2 ** 3，2 * 3。<img src=x onerror=alert(1)> **文字**';
  assert.equal(replyText(raw), '2 ** 3，2 * 3。<img src=x onerror=alert(1)> 文字');
  assert.equal(replyText("一段普通的话。\n\n另一段。"), "一段普通的话。\n\n另一段。");
});
