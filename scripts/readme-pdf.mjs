// Конвертация README.md в печатный HTML (A4) для Edge --print-to-pdf
// Запуск: node scripts/readme-pdf.mjs → docs/readme.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { marked } from 'marked';

const md = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const body = marked.parse(md, { gfm: true, breaks: false });

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Планер — README</title>
<style>
  @page { size: A4; margin: 16mm 15mm 18mm 15mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    font-family: 'Segoe UI', 'Golos Text', system-ui, sans-serif;
    color: #1c1e2a;
    font-size: 10.5pt;
    line-height: 1.55;
  }
  h1 { font-size: 21pt; color: #4a4ac2; margin: 0 0 6pt; line-height: 1.25; }
  h1 + p { font-size: 11.5pt; color: #444a5e; }
  h2 {
    font-size: 14.5pt; color: #4a4ac2;
    margin: 22pt 0 8pt; padding-bottom: 4pt;
    border-bottom: 1.5px solid #e3e3f2;
    break-after: avoid-page;
  }
  h3 { font-size: 11.5pt; margin: 14pt 0 6pt; break-after: avoid-page; }
  p { margin: 6pt 0; }
  ul, ol { margin: 6pt 0; padding-left: 20pt; }
  li { margin: 3pt 0; break-inside: avoid-page; }
  li input[type="checkbox"] { margin-right: 5pt; }
  a { color: #5b5bd6; text-decoration: none; }
  strong { font-weight: 600; }
  hr { border: none; border-top: 1px solid #e3e3f2; margin: 16pt 0; }
  code {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 8.8pt;
    background: #f1f1f9;
    border: 1px solid #e7e7f4;
    border-radius: 4px;
    padding: 0.5pt 3pt;
    overflow-wrap: break-word;
  }
  pre {
    background: #f6f6fb;
    border: 1px solid #e7e7f4;
    border-radius: 8px;
    padding: 9pt 12pt;
    margin: 8pt 0;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    break-inside: avoid-page;
  }
  pre code { background: none; border: none; padding: 0; font-size: 8.6pt; line-height: 1.5; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0;
    font-size: 9.3pt;
    break-inside: avoid-page;
  }
  th {
    background: #efeff8;
    text-align: left;
    font-weight: 600;
  }
  th, td { border: 1px solid #e3e3f2; padding: 4.5pt 8pt; vertical-align: top; }
  tr { break-inside: avoid-page; }
</style>
</head>
<body>
${body}
</body>
</html>`;

mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/readme.html', import.meta.url), html);
console.log('OK: docs/readme.html');
