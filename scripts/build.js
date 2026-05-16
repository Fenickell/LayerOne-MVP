const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const files = ["index.html", "layerone.js", "styles.css", "config.example.js"];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of files) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) continue;

  const targetName = file === "config.example.js" ? "config.js" : file;
  fs.copyFileSync(source, path.join(dist, targetName));
}
