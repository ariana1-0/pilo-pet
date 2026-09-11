const test = require("node:test");
const assert = require("node:assert/strict");
const people = require("./philosophers.json");
const { participants, createDiscussion, isSubmitKey } = require("./roundtable-core");

test("default table and remembered order support two through six distinct philosophers", () => {
  assert.deepEqual(participants(people, null), ["marcus-aurelius", "zhuangzi", "nietzsche"]);
  for (let count = 2; count <= 6; count++) {
    const selected = people.slice(0, count).map(p => p.slug).reverse();
    assert.deepEqual(participants(people, JSON.stringify(selected)), selected);
  }
  for (const invalid of ["garbage", '["laozi"]', '["laozi","laozi"]', '["../../x","camus"]']) {
    assert.equal(participants(people, invalid).length, 3);
  }
});
test("stream binds every increment to its own speaker and does not duplicate starts", () => {
  const table = createDiscussion();
  table.apply("speaker_start", { message_id: "a", slug: "laozi" });
  table.apply("delta", { message_id: "a", text: "水" });
  assert.equal(table.apply("speaker_start", { message_id: "a", slug: "laozi" }), null);
  table.apply("speaker_done", { message_id: "a" });
  table.apply("speaker_start", { message_id: "b", slug: "zhuangzi" });
  table.apply("delta", { message_id: "b", text: "鱼" });
  assert.equal(table.messages.get("a").content, "水");
  assert.equal(table.messages.get("b").content, "鱼");
});
test("paused partial messages remain visible but ignore late buffered tokens", () => {
  const table = createDiscussion();
  table.apply("speaker_start", { message_id: "a", slug: "laozi" });
  table.apply("delta", { message_id: "a", text: "上善" });
  table.apply("paused", {});
  table.apply("delta", { message_id: "a", text: "若水" });
  assert.equal(table.messages.get("a").content, "上善");
  assert.equal(table.messages.get("a").status, "incomplete");
  table.apply("speaker_start", { message_id: "retry", slug: "laozi" });
  assert.equal(table.messages.size, 2);
});
test("Chinese composition and Shift+Enter never submit an interjection", () => {
  assert.equal(isSubmitKey({ key: "Enter" }), true);
  assert.equal(isSubmitKey({ key: "Enter", isComposing: true }), false);
  assert.equal(isSubmitKey({ key: "Enter", keyCode: 229 }), false);
  assert.equal(isSubmitKey({ key: "Enter", shiftKey: true }), false);
});
test("a speech completed before stop acknowledgment is reconciled from the server", () => {
  const table = createDiscussion();
  table.apply("speaker_start", { message_id: "a", slug: "laozi" });
  table.apply("delta", { message_id: "a", text: "上善" });
  table.apply("paused", {});
  table.apply("speaker_done", { message_id: "a", text: "上善若水。" });
  assert.equal(table.messages.get("a").status, "complete");
  assert.equal(table.messages.get("a").content, "上善若水。");
});
