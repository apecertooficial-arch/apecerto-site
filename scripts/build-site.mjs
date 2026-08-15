import fs from "node:fs";

const bundleUrl = new URL("../index.html", import.meta.url);
const designUrl = new URL("../design/Site ApeCerto.dc.html", import.meta.url);
const outputDirUrl = new URL("../dist/", import.meta.url);
const outputUrl = new URL("index.html", outputDirUrl);

const bundle = fs.readFileSync(bundleUrl, "utf8");
const design = fs.readFileSync(designUrl, "utf8");

// A barra precisa permanecer escapada para que </script> dentro do design não
// encerre prematuramente a tag que transporta o template no pacote publicado.
const serializedDesign = JSON.stringify(design).replaceAll("</", "<\\u002F");
const templatePattern =
  /(<script type="__bundler\/template">\n)[\s\S]*?(\n  <\/script>)/;

if (!templatePattern.test(bundle)) {
  throw new Error("Bloco do template não encontrado no pacote-base");
}

const output = bundle.replace(
  templatePattern,
  `$1${serializedDesign}$2`,
);

fs.mkdirSync(outputDirUrl, { recursive: true });
fs.writeFileSync(outputUrl, output);
console.log(`Site gerado em ${outputUrl.pathname}`);
