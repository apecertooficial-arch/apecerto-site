import fs from "node:fs";

const bundleUrl = new URL("../index.html", import.meta.url);
const designUrl = new URL("../design/Site ApeCerto.dc.html", import.meta.url);
const bundle = fs.readFileSync(bundleUrl, "utf8");
const match = bundle.match(
  /<script type="__bundler\/template">\s*([\s\S]*?)\s*<\/script>/,
);

if (!match) {
  throw new Error("Template do design não encontrado em index.html");
}

const design = JSON.parse(match[1]);
fs.mkdirSync(new URL("../design/", import.meta.url), { recursive: true });
fs.writeFileSync(designUrl, design);
console.log(`Design extraído para ${designUrl.pathname}`);
