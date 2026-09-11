const fs = require("fs");
const path = require("path");

const output = path.join(__dirname, "..", "release-config.json");
const supplied = process.argv[2] || process.env.PHILO_SERVICE_URL;

function validServiceUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch (_error) {
    return false;
  }
}

if (supplied) {
  if (!validServiceUrl(supplied)) {
    console.error("PHILO_SERVICE_URL 必须是 https:// 开头的完整 Render 地址。");
    process.exit(1);
  }
  fs.writeFileSync(output, JSON.stringify({ serviceUrl: supplied.replace(/\/+$/, "") }, null, 2) + "\n");
  console.log(`已写入 ${output}`);
} else {
  try {
    const existing = JSON.parse(fs.readFileSync(output, "utf8"));
    if (!validServiceUrl(existing.serviceUrl)) throw new Error("invalid");
    console.log(`沿用 ${output} 中的 Render 地址`);
  } catch (_error) {
    console.error("请先设置 PHILO_SERVICE_URL，或执行 npm run release:config -- https://你的服务.onrender.com");
    process.exit(1);
  }
}
