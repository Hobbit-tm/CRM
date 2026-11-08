import { supabase } from './supabase';
import { deleteProductFiles } from './photos';

const ok = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// ---------- Товары ----------
// Сервер отдаёт не больше 1000 строк за запрос, поэтому читаем страницами
// Позициям без штрихкода присваиваем внутренний код (AP000123): по нему этикетка сканируется как обычный штрихкод
export async function ensureBarcodes(products) {
  const out = [];
  for (const p of products) {
    if ((p.barcode || '').trim()) {
      out.push(p);
      continue;
    }
    const code = 'AP' + String(p.id).padStart(6, '0');
    ok(await supabase.from('products').update({ barcode: code }).eq('id', p.id));
    out.push({ ...p, barcode: code });
  }
  return out;
}

// Цены хранятся в закрытой таблице: база отдаёт их только администратору
export async function getPrices() {
  const PAGE = 1000;
  const map = {};
  for (let from = 0; ; from += PAGE) {
    const rows = ok(
      await supabase.from('product_prices').select('product_id,price').order('product_id').range(from, from + PAGE - 1)
    );
    for (const r of rows) map[r.product_id] = Number(r.price) || 0;
    if (rows.length < PAGE) break;
  }
  return map;
}

export async function getProducts(withPrices = false) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const rows = ok(
      await supabase
        .from('products')
        .select('id,name,sku,barcode,unit,qty,min_qty,brand,oem,applicability,category,model_code,donor,condition,mileage,origin,warranty,location,comment')
        .order('name')
        .order('id')
        .range(from, from + PAGE - 1)
    );
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  if (withPrices) {
    const prices = await getPrices();
    for (const p of out) p.price = prices[p.id] || 0;
  }
  return out;
}

// Продано / принято по всем товарам (считает база): { [productId]: { sold, soldSum, received, lastOut } }
export async function getProductTotals() {
  const rows = ok(await supabase.rpc('product_totals', { p_product_id: null }));
  const map = {};
  for (const r of rows) {
    map[r.product_id] = {
      sold: Number(r.sold), soldSum: Number(r.sold_sum),
      received: Number(r.received), lastOut: r.last_out,
    };
  }
  return map;
}

export async function getProductByBarcode(code, withPrice = false) {
  const c = String(code).trim();
  let rows = ok(await supabase.from('products').select('*').eq('barcode', c).limit(1));
  // На коробке часто штрихкод производителя или артикул: ищем и по ним
  if (!rows.length) rows = ok(await supabase.from('products').select('*').eq('sku', c).limit(1));
  if (!rows.length) rows = ok(await supabase.from('products').select('*').eq('oem', c).limit(1));
  const p = rows[0] || null;
  if (p && withPrice) {
    const pr = ok(await supabase.from('product_prices').select('price').eq('product_id', p.id).limit(1));
    p.price = Number(pr[0]?.price) || 0;
  }
  return p;
}

export async function saveProduct(p) {
  // unit и min_qty в форме больше нет: остаются значения по умолчанию в базе
  const row = {
    name: p.name, sku: p.sku, barcode: p.barcode,
    brand: p.brand || '', oem: p.oem || '', applicability: p.applicability || '', category: p.category || '',
    model_code: p.model_code || '', donor: p.donor || '', condition: p.condition || '',
    mileage: p.mileage == null || p.mileage === '' ? null : Number(p.mileage),
    origin: p.origin || '', warranty: p.warranty || '', location: p.location || '', comment: p.comment || '',
  };
  if (p.id) {
    ok(await supabase.from('products').update(row).eq('id', p.id));
    if (p.price !== undefined) await savePrice(p.id, p.price);
    // Остаток изменили вручную: записываем разницу как корректировку
    const diff = Math.round((p.qty - p.oldQty) * 1000) / 1000;
    if (diff !== 0) {
      await addMovement(p.id, diff > 0 ? 'in' : 'out', Math.abs(diff), 'Корректировка остатка', true);
    }
    return p.id;
  }
  const created = ok(await supabase.from('products').insert(row).select('id').single());
  if (p.price !== undefined) await savePrice(created.id, p.price);
  if (p.qty > 0) await addMovement(created.id, 'in', p.qty, 'Начальный остаток');
  return created.id;
}

// Новая позиция одним запросом: сервер создаёт её вместе с ценой и начальным остатком.
// clientId защищает от дубля, если запрос пришлось повторить после обрыва связи.
export async function createProduct(p, clientId) {
  const { id, qty, oldQty, price, ...row } = p;
  return ok(
    await supabase.rpc('create_product', {
      p_row: row,
      p_price: price === undefined ? null : Number(price) || 0,
      p_qty: Number(qty) || 0,
      p_client_id: clientId || null,
    })
  );
}

// Менять цену может только администратор (проверяет база)
async function savePrice(productId, price) {
  ok(await supabase.from('product_prices').upsert({ product_id: productId, price: Number(price) || 0 }));
}

export async function deleteProduct(id) {
  await deleteProductFiles(id); // файлы фото; строки фото удалит база вместе с позицией
  ok(await supabase.from('products').delete().eq('id', id));
}

// ---------- Движения ----------
// clientId: уникальный номер операции; по нему сервер не применит одну и ту же операцию дважды
export async function addMovement(productId, type, qty, note = '', correction = false, clientId = null) {
  ok(
    await supabase.rpc('add_movement', {
      p_product_id: productId,
      p_type: type,
      p_qty: qty,
      p_note: note,
      p_correction: correction,
      ...(clientId ? { p_client_id: clientId } : {}),
    })
  );
}

export async function getMovements(limit = 200) {
  const rows = ok(
    await supabase
      .from('movements')
      .select('id,type,qty,note,is_correction,created_at,cancelled_at,cancel_reason,sale_id,created_by, products(name,unit), sales(number,customer,payment), author:profiles!created_by(full_name,email)')
      .order('created_at', { ascending: false })
      .limit(limit)
  );
  return rows.map((r) => ({
    ...r,
    product_name: r.products?.name || '—',
    unit: r.products?.unit || '',
    sale_number: r.sales?.number ?? null,
    customer: r.sales?.customer || '',
    payment: r.sales?.payment || '',
    author_name: r.author?.full_name || r.author?.email || '',
  }));
}

// Вся история (для выгрузки): читаем страницами по 1000 строк
export async function getAllMovements() {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const rows = ok(
      await supabase
        .from('movements')
        .select('id,product_id,type,qty,note,is_correction,created_at,cancelled_at,sale_id, products(name,unit), movement_prices(price), sales(number,customer,payment), author:profiles!created_by(full_name,email)')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + PAGE - 1)
    );
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out.map((r) => ({
    ...r,
    product_name: r.products?.name || '—',
    price: Number((Array.isArray(r.movement_prices) ? r.movement_prices[0] : r.movement_prices)?.price) || 0,
    customer: r.sales?.customer || '',
    sale_number: r.sales?.number ?? null,
    author_name: r.author?.full_name || r.author?.email || '',
  }));
}

// ---------- Продажа и отмена ----------
// items: [{ product_id, qty, price? }]; цену при продаже меняет только админ (остальным сервер берёт цену каталога)
export async function makeSale({ items, customer, phone, payment, note, clientId }) {
  return ok(
    await supabase.rpc('make_sale', {
      p_items: items,
      p_customer: customer || '',
      p_phone: phone || '',
      p_payment: payment || '',
      p_note: note || '',
      ...(clientId ? { p_client_id: clientId } : {}),
    })
  );
}

export async function cancelMovement(id, reason = '') {
  ok(await supabase.rpc('cancel_movement', { p_id: id, p_reason: reason }));
}

export async function cancelSale(saleId, reason = '') {
  ok(await supabase.rpc('cancel_sale', { p_sale_id: saleId, p_reason: reason }));
}

// Продажа с позициями (для накладной). Цены вернутся только администратору.
export async function getSale(saleId) {
  const sale = ok(
    await supabase.from('sales').select('id,number,customer,phone,payment,note,created_at').eq('id', saleId).single()
  );
  const lines = ok(
    await supabase
      .from('movements')
      .select('id,qty,cancelled_at, products(name,model_code,donor,warranty), movement_prices(price)')
      .eq('sale_id', saleId)
      .order('id')
  );
  return { sale, lines };
}

// ---------- Сводка по одному товару (после сканирования) ----------
export async function getProductStats(productId) {
  const rows = ok(await supabase.rpc('product_totals', { p_product_id: productId }));
  const r = rows[0];
  if (!r) return { sold: 0, soldSum: 0, received: 0, lastOut: null };
  return {
    sold: Number(r.sold), soldSum: Number(r.sold_sum),
    received: Number(r.received), lastOut: r.last_out,
  };
}

// ---------- Отчёт по расходу / продажам ----------
export async function getSales(sinceIso) {
  const rows = ok(await supabase.rpc('sales_report', { p_since: sinceIso || null }));
  const items = rows.map((r) => ({
    id: r.product_id, name: r.name, unit: r.unit, qty: Number(r.qty), sum: Number(r.total),
  }));
  return {
    total: items.reduce((s, i) => s + i.sum, 0),
    operations: rows.reduce((s, r) => s + Number(r.ops), 0),
    items,
  };
}

// ---------- Пользователи (для администратора) ----------
export async function getProfiles() {
  const rows = ok(await supabase.from('profiles').select('*').order('created_at'));
  // ожидающие подтверждения — сверху
  return rows.sort((a, b) => (a.role === 'pending' ? -1 : 0) - (b.role === 'pending' ? -1 : 0));
}

// Администратор задаёт сотруднику новый пароль
export async function adminSetPassword(userId, password) {
  ok(await supabase.rpc('admin_set_password', { p_user: userId, p_password: password }));
}

export async function setRole(id, role) {
  ok(await supabase.from('profiles').update({ role }).eq('id', id));
}

// ---------- Обновления в реальном времени ----------
// Пачка событий подряд (например, при приходе меняются и товар, и история) даёт одну перезагрузку
export function subscribe(callback) {
  let timer = null;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(callback, 500);
  };
  const channel = supabase
    .channel('db-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fire)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movements' }, fire)
    .subscribe();
  return () => {
    clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
