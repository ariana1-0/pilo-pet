const philosophers = require("./assets/philosophers.json");
const allowed = new Set(philosophers.map((person) => person.slug));

function deepChatUrl(base, slug) {
  const url = new URL(base);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid web URL");
  url.searchParams.set("philosopher", allowed.has(slug) ? slug : "marcus-aurelius");
  url.searchParams.set("source", "pet");
  return url.toString();
}

module.exports = { deepChatUrl };
