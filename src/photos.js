import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

const BUCKET = 'product-photos';
const FULL_WIDTH = 1600;
const THUMB_WIDTH = 400;

const ok = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// ---------- Временные ссылки на фото (хранилище закрытое) ----------
// Запросы за ссылками собираются в пачку: список из 10 карточек = один запрос
const cache = new Map(); // path -> { url, exp }
let queue = new Map(); // path -> [{ res, rej }]
let timer = null;

async function flush() {
  const batch = queue;
  queue = new Map();
  timer = null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls([...batch.keys()], 86400);
    if (error) throw new Error(error.message);
    for (const d of data) {
      const waiters = batch.get(d.path) || [];
      if (d.signedUrl) {
        cache.set(d.path, { url: d.signedUrl, exp: Date.now() + 86400 * 1000 });
        waiters.forEach((w) => w.res(d.signedUrl));
      } else {
        waiters.forEach((w) => w.res(null));
      }
    }
  } catch (e) {
    for (const waiters of batch.values()) waiters.forEach((w) => w.rej(e));
  }
}

export function signedUrl(path) {
  const c = cache.get(path);
  if (c && c.exp > Date.now() + 60000) return Promise.resolve(c.url);
  return new Promise((res, rej) => {
    queue.set(path, [...(queue.get(path) || []), { res, rej }]);
    if (!timer) timer = setTimeout(flush, 30);
  });
}

// ---------- Список фото ----------
export async function getPhotos(productId) {
  return ok(
    await supabase
      .from('product_photos')
      .select('id,path,thumb_path,created_at')
      .eq('product_id', productId)
      .order('created_at')
      .order('id')
  );
}

// Обложка для каждой позиции: { [productId]: thumb_path } (первое добавленное фото)
export async function getCovers() {
  const PAGE = 1000;
  const map = {};
  try {
    for (let from = 0; ; from += PAGE) {
      const rows = ok(
        await supabase
          .from('product_photos')
          .select('product_id,thumb_path')
          .order('created_at')
          .order('id')
          .range(from, from + PAGE - 1)
      );
      for (const r of rows) if (!map[r.product_id]) map[r.product_id] = r.thumb_path;
      if (rows.length < PAGE) break;
    }
  } catch (e) {
    // таблицы фото ещё нет (SQL не выполнен) - список товаров всё равно работает
  }
  return map;
}

// ---------- Загрузка ----------
function b64ToBuffer(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (p < len) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < len) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.buffer;
}

async function shrink(uri, width, compress) {
  const rendered = await ImageManipulator.manipulate(uri).resize({ width, height: null }).renderAsync();
  const r = await rendered.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  return b64ToBuffer(r.base64);
}

// Фото сжимается (до 1600 px) и получает миниатюру (400 px): список открывается быстро, трафик небольшой
export async function addPhoto(productId, uri) {
  const [full, thumb] = [await shrink(uri, FULL_WIDTH, 0.72), await shrink(uri, THUMB_WIDTH, 0.6)];
  const name = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${name}.jpg`;
  const thumbPath = `${name}_t.jpg`;
  const store = supabase.storage.from(BUCKET);

  const up1 = await store.upload(path, full, { contentType: 'image/jpeg' });
  if (up1.error) throw new Error(up1.error.message);
  const up2 = await store.upload(thumbPath, thumb, { contentType: 'image/jpeg' });
  if (up2.error) {
    await store.remove([path]);
    throw new Error(up2.error.message);
  }
  const ins = await supabase.from('product_photos').insert({ product_id: productId, path, thumb_path: thumbPath });
  if (ins.error) {
    await store.remove([path, thumbPath]);
    throw new Error(ins.error.message);
  }
}

// ---------- Удаление ----------
export async function deletePhoto(photo) {
  ok(await supabase.from('product_photos').delete().eq('id', photo.id));
  await supabase.storage.from(BUCKET).remove([photo.path, photo.thumb_path]);
}

// При удалении позиции строки фото удалит база, а файлы - это
export async function deleteProductFiles(productId) {
  try {
    const rows = await getPhotos(productId);
    if (rows.length) await supabase.storage.from(BUCKET).remove(rows.flatMap((r) => [r.path, r.thumb_path]));
  } catch (e) {}
}
