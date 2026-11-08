import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { addMovement, makeSale, createProduct } from './db';
import { createQueue, isNetworkError, withTimeout, uuid } from './offlineQueue';

export { isNetworkError };

const KEY = 'offline:queue';

const queue = createQueue({
  load: async () => {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  },
  save: (d) => AsyncStorage.setItem(KEY, JSON.stringify(d)),
  getUid: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.user?.id || null;
    } catch (e) {
      return null;
    }
  },
  send: async (it) => {
    if (it.kind === 'movement') {
      const p = it.payload;
      await withTimeout(addMovement(p.productId, p.type, p.qty, p.note, false, it.cid));
    } else if (it.kind === 'sale') {
      await withTimeout(makeSale({ ...it.payload, clientId: it.cid }));
    } else if (it.kind === 'product') {
      await withTimeout(createProduct(it.payload, it.cid));
    }
  },
});

export const flushQueue = () => queue.flush();
export const retryOp = (cid) => queue.retry(cid).then(() => queue.flush());
export const dismissOp = (cid) => queue.dismiss(cid);

// Приход/расход: если связи нет, операция ждёт в очереди и уйдёт сама
// Возвращает { queued: true }, если сохранено на телефоне
export async function submitMovement(productId, type, qty, note = '', label = '') {
  const cid = uuid();
  if (!(await queue.hasPending())) {
    try {
      await withTimeout(addMovement(productId, type, qty, note, false, cid));
      return { queued: false };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }
  await queue.enqueue({ cid, kind: 'movement', payload: { productId, type, qty, note }, label });
  queue.flush();
  return { queued: true };
}

export async function submitSale(payload, label = '') {
  const cid = uuid();
  if (!(await queue.hasPending())) {
    try {
      const res = await withTimeout(makeSale({ ...payload, clientId: cid }));
      return { queued: false, ...res };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }
  await queue.enqueue({ cid, kind: 'sale', payload, label });
  queue.flush();
  return { queued: true };
}

// Новая позиция: без связи сохраняется на телефоне и создаётся на сервере позже
export async function submitProduct(p) {
  const cid = uuid();
  try {
    await withTimeout(createProduct(p, cid));
    return { queued: false };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
  }
  await queue.enqueue({ cid, kind: 'product', payload: p, label: `Новая позиция: ${p.name}` });
  queue.flush();
  return { queued: true };
}

// Состояние очереди для экранов. Запускает автоотправку: при открытии, возврате в приложение и раз в 15 секунд.
let watchers = 0;
let timer = null;
let appSub = null;
function startWatch() {
  if (watchers++ > 0) return;
  queue.init().then(() => queue.flush());
  appSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') queue.flush();
  });
  timer = setInterval(() => {
    if (queue.getState().items.length) queue.flush();
  }, 15000);
}
function stopWatch() {
  if (--watchers > 0) return;
  appSub && appSub.remove();
  clearInterval(timer);
  appSub = null;
  timer = null;
}

export function useOffline() {
  const [st, setSt] = useState(queue.getState());
  const [uid, setUid] = useState(null);
  useEffect(() => {
    startWatch();
    const un = queue.subscribe(setSt);
    setSt(queue.getState());
    supabase.auth.getSession().then(({ data }) => setUid(data?.session?.user?.id || null));
    return () => {
      un();
      stopWatch();
    };
  }, []);
  const pending = useMemo(() => st.items.filter((x) => x.uid === uid), [st.items, uid]);
  const failed = useMemo(() => st.failed.filter((x) => x.uid === uid), [st.failed, uid]);
  // На сколько уже изменился остаток в очереди (чтобы на экране он был правильным сразу)
  const deltas = useMemo(() => {
    const d = {};
    for (const it of pending) {
      if (it.kind === 'movement') {
        const { productId, type, qty } = it.payload;
        d[productId] = (d[productId] || 0) + (type === 'in' ? qty : -qty);
      } else if (it.kind === 'sale') {
        for (const l of it.payload.items || []) d[l.product_id] = (d[l.product_id] || 0) - l.qty;
      }
    }
    return d;
  }, [pending]);
  // Позиции, которые ещё не дошли до сервера: показываем их в списке с пометкой
  const pendingProducts = useMemo(
    () =>
      pending
        .filter((x) => x.kind === 'product')
        .map((x) => ({ ...x.payload, id: 'new-' + x.cid, pending: true, qty: Number(x.payload.qty) || 0, price: Number(x.payload.price) || 0 })),
    [pending]
  );
  return { pending, failed, deltas, pendingProducts };
}
