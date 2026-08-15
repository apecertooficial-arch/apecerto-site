// Extrai o documento do design de dentro do pacote-base (index.html).
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const base = await readFile('index.html', 'utf8');
const MARK = '<script type="__bundler/template">';
const s = base.indexOf(MARK);
if (s < 0) throw new Error('bloco __bundler/template nao encontrado');
const contentStart = base.indexOf('\n', s) + 1;
const end = base.indexOf('</scr' + 'ipt>', contentStart);
const doc = JSON.parse(base.slice(contentStart, end).trim());
await mkdir('design', { recursive: true });
await writeFile('design/Site ApeCerto.dc.html', doc);
console.log('design extraido:', doc.length, 'chars');
