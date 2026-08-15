// Injeta design/Site ApeCerto.dc.html no pacote-base (index.html) e gera dist/index.html.
// O pacote-base guarda o documento do design como string JSON dentro de
// <script type="__bundler/template">; aqui esse bloco e substituido pelo design atual.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const base = await readFile('index.html', 'utf8');
const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');

const MARK = '<script type="__bundler/template">';
const s = base.indexOf(MARK);
if (s < 0) throw new Error('bloco __bundler/template nao encontrado no index.html');
const contentStart = base.indexOf('\n', s) + 1;
const end = base.indexOf('</scr' + 'ipt>', contentStart);
if (end < 0) throw new Error('fim do bloco __bundler/template nao encontrado');

// escapa como string JSON e protege </ para nao fechar a tag <script>
const encoded = JSON.stringify(design).replace(/<\//g, '<\\u002F');
const out = base.slice(0, contentStart) + encoded + '\n  ' + base.slice(end);

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', out);
console.log('dist/index.html gerado:', out.length, 'bytes');
