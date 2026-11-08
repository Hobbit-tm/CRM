import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getProducts, getAllMovements } from './db';
import { fmtDate } from './components';

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Число для русского Excel: десятичная запятая
const num = (v) => String(Number(v) || 0).replace('.', ',');

// Ячейка CSV: кавычки удваиваем, текст с ; переносами и кавычками берём в кавычки.
// Значения, начинающиеся с = + - @, получают апостроф, чтобы Excel не считал их формулой.
const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const toCsv = (header, rows) =>
  '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';

async function shareText(name, text, mimeType) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('На этом устройстве нельзя поделиться файлом');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

export async function exportProducts() {
  const products = await getProducts(true);
  const rows = products.map((p) => [
    p.name, p.category, p.model_code, p.condition, p.donor,
    p.mileage == null ? '' : num(p.mileage), p.origin, p.warranty, p.location,
    p.oem, p.sku, p.brand, p.applicability, p.comment, p.barcode,
    num(p.qty), num(p.price), num(p.qty * p.price),
  ]);
  await shareText(
    `tovary_${today()}.csv`,
    toCsv(
      ['Название', 'Категория', 'Код агрегата', 'Состояние', 'Авто-донор', 'Пробег, км', 'Откуда', 'Гарантия',
        'Место', 'OEM', 'Внутренний номер', 'Марка агрегата', 'Подходит на авто', 'Комментарий', 'Штрихкод',
        'Остаток, шт', 'Цена', 'Сумма'],
      rows
    ),
    'text/csv'
  );
  return products.length;
}

export async function exportMovements() {
  const list = await getAllMovements();
  const rows = list.map((m) => [
    fmtDate(m.created_at), m.product_name,
    m.cancelled_at ? 'ОТМЕНЕНО' : m.is_correction ? 'Корректировка' : m.type === 'in' ? 'Приход' : m.sale_id ? 'Продажа' : 'Расход',
    num(m.qty), num(m.price), num(m.qty * m.price), m.sale_number ? String(m.sale_number) : '', m.customer, m.author_name, m.note,
  ]);
  await shareText(
    `istoriya_${today()}.csv`,
    toCsv(['Дата', 'Товар', 'Операция', 'Кол-во, шт', 'Цена за 1 шт', 'Сумма', 'Продажа №', 'Покупатель', 'Сотрудник', 'Комментарий'], rows),
    'text/csv'
  );
  return list.length;
}

// Полная копия: все товары и вся история в одном файле (для восстановления)
export async function exportFullBackup() {
  const [products, movements] = await Promise.all([getProducts(true), getAllMovements()]);
  const data = { created_at: new Date().toISOString(), version: 1, products, movements };
  await shareText(`backup_${today()}.json`, JSON.stringify(data), 'application/json');
  return { products: products.length, movements: movements.length };
}
