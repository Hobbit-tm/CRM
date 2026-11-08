import qrcode from 'qrcode-generator';

// Русские и любые не-латинские символы в QR кодируем как UTF-8 (так их читает сканер камеры)
try {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
} catch (e) {}

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// QR-код как встроенная SVG-картинка (без файлов и сети: печать идёт через WebView)
export function qrSvg(text, px) {
  const qr = qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  const m = 2; // белая рамка вокруг кода: без неё сканер читает хуже
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${n + 2 * m} ${n + 2 * m}" ` +
    `width="${px}" height="${px}" shape-rendering="crispEdges">` +
    `<rect x="${-m}" y="${-m}" width="${n + 2 * m}" height="${n + 2 * m}" fill="#fff"/>` +
    `<path d="${d}" fill="#000"/></svg>`
  );
}

// Форматы: размеры страницы в пунктах (72 на дюйм), ровно как их ждёт expo-print
export const FORMATS = {
  single: { label: 'Одна этикетка 58×40 мм', page: { width: 164, height: 113 }, w: 164, h: 113, qr: 76, perPage: 1 },
  a4: { label: 'Лист A4, 24 этикетки (70×37 мм)', page: { width: 595, height: 842 }, w: 198, h: 105, qr: 84, perPage: 24 },
};

function label(p, f, guides) {
  const text = [
    `<div class="n">${esc(p.name)}</div>`,
    p.model_code ? `<div class="c">${esc(p.model_code)}</div>` : '',
    p.location ? `<div class="l">Место: ${esc(p.location)}</div>` : '',
    `<div class="b">${esc(p.barcode)}</div>`,
  ].join('');
  return (
    `<div class="lb" style="width:${f.w}px;height:${f.h}px;${guides ? 'outline:0.5px dashed #aaa;outline-offset:-0.5px;' : ''}">` +
    `<div class="q">${qrSvg(p.barcode, f.qr)}</div><div class="t">${text}</div></div>`
  );
}

// items: позиции со штрихкодом; copies: сколько этикеток на позицию
export function labelsHtml(items, formatKey, copies = 1, guides = false) {
  const f = FORMATS[formatKey] || FORMATS.single;
  const all = [];
  for (const p of items) for (let i = 0; i < copies; i++) all.push(p);
  const pages = [];
  for (let i = 0; i < all.length; i += f.perPage) pages.push(all.slice(i, i + f.perPage));

  const css = `
    @page { margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; font-family: Roboto, Arial, sans-serif; color: #000; }
    .page { width: ${f.page.width}px; height: ${f.page.height}px; overflow: hidden; page-break-after: always;
            display: flex; flex-wrap: wrap; align-content: flex-start; }
    .lb { display: flex; flex-direction: row; align-items: center; padding: 5px; overflow: hidden; }
    .q { flex: 0 0 auto; margin-right: 5px; }
    .t { flex: 1 1 auto; min-width: 0; overflow: hidden; }
    .n { font-size: 10px; font-weight: bold; line-height: 11px; max-height: 33px; overflow: hidden; }
    .c { font-size: 11px; font-weight: bold; margin-top: 2px; }
    .l { font-size: 9px; margin-top: 2px; }
    .b { font-size: 8px; margin-top: 3px; color: #333; word-break: break-all; }
  `;
  const body = pages.map((pg) => `<div class="page">${pg.map((p) => label(p, f, guides)).join('')}</div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${f.page.width}"><style>${css}</style></head><body>${body}</body></html>`;
}
