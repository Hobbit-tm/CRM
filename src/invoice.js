import { SHOP } from './shop';

const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 1 500,5: так же, как числа выглядят в приложении
const money = (n) => {
  const v = Number(n) || 0;
  const [i, d = ''] = Math.abs(v).toFixed(2).split('.');
  const dec = d.replace(/0+$/, '');
  return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec ? ',' + dec : '');
};

const dateRu = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

// sale: { number, customer, phone, payment, note, created_at }
// lines: строки продажи из базы; отменённые в накладную не попадают
// withPrices: только администратору (цены от остальных скрыты в базе)
export function invoiceHtml({ sale, lines, withPrices, shop = SHOP }) {
  const live = lines.filter((l) => !l.cancelled_at);
  const priceOf = (l) => Number((Array.isArray(l.movement_prices) ? l.movement_prices[0] : l.movement_prices)?.price) || 0;
  const total = live.reduce((s, l) => s + Number(l.qty) * priceOf(l), 0);

  const rows = live
    .map((l, i) => {
      const p = l.products || {};
      const sub = [p.model_code, p.donor].filter(Boolean).join(', ');
      return (
        `<tr><td class="c">${i + 1}</td>` +
        `<td><b>${esc(p.name || '')}</b>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</td>` +
        `<td class="c">${esc(p.warranty || '—')}</td>` +
        `<td class="r">${money(l.qty)}</td>` +
        (withPrices ? `<td class="r">${money(priceOf(l))}</td><td class="r">${money(Number(l.qty) * priceOf(l))}</td>` : '') +
        `</tr>`
      );
    })
    .join('');

  const head =
    `<th class="c" style="width:26px">№</th><th>Наименование</th><th style="width:70px">Гарантия</th><th style="width:44px">Кол-во</th>` +
    (withPrices ? `<th style="width:70px">Цена</th><th style="width:80px">Сумма</th>` : '');

  const css = `
    @page { margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; color: #000; font-family: Roboto, Arial, sans-serif; font-size: 11px; }
    .page { width: 595px; min-height: 842px; padding: 34px 32px; }
    .shop { font-size: 15px; font-weight: bold; }
    .muted { color: #555; margin-top: 2px; }
    h1 { font-size: 16px; margin: 20px 0 10px; }
    .info div { margin-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th, td { border: 1px solid #333; padding: 4px 5px; vertical-align: top; }
    th { background: #eee; text-align: center; }
    .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
    .s { font-size: 9px; color: #444; margin-top: 2px; }
    .total { text-align: right; font-size: 13px; font-weight: bold; margin-top: 10px; }
    .sign { display: flex; justify-content: space-between; margin-top: 46px; }
    .sign div { width: 45%; border-top: 1px solid #000; padding-top: 4px; text-align: center; color: #444; }
    .warn { margin-top: 12px; padding: 8px; border: 1px solid #b00; color: #b00; font-weight: bold; text-align: center; }
    .foot { margin-top: 26px; color: #777; font-size: 9px; }
  `;
  const body =
    `<div class="page"><div class="shop">${esc(shop.name)}</div>` +
    (shop.address || shop.phone ? `<div class="muted">${esc([shop.address, shop.phone].filter(Boolean).join(', '))}</div>` : '') +
    `<h1>Расходная накладная № ${esc(sale.number)} от ${dateRu(sale.created_at)}</h1>` +
    `<div class="info"><div><b>Покупатель:</b> ${esc(sale.customer || '—')}${sale.phone ? ', ' + esc(sale.phone) : ''}</div>` +
    (sale.payment ? `<div><b>Оплата:</b> ${esc(sale.payment)}</div>` : '') +
    (sale.note ? `<div><b>Примечание:</b> ${esc(sale.note)}</div>` : '') +
    `</div>` +
    (live.length
      ? `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>` +
        (withPrices ? `<div class="total">Итого: ${money(total)}</div>` : '')
      : `<div class="warn">Продажа отменена</div>`) +
    `<div class="sign"><div>Продавец</div><div>Покупатель</div></div>` +
    `<div class="foot">Гарантия на б/у запчасти действует при наличии накладной.</div></div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=595"><style>${css}</style></head><body>${body}</body></html>`;
}

export const INVOICE_PAGE = { width: 595, height: 842 };
