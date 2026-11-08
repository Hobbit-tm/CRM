// Очередь операций, сделанных без связи. Без зависимостей от React Native: логика проверяется отдельно.
// Каждая операция получает уникальный номер (cid). Сервер по этому номеру не даст применить её дважды,
// поэтому повторная отправка после обрыва связи безопасна.

export function uuid() {
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += h[8 + Math.floor(Math.random() * 4)];
    else s += h[Math.floor(Math.random() * 16)];
  }
  return s;
}

// Ошибка связи (а не отказ сервера по существу, вроде «Недостаточно товара»)
export function isNetworkError(e) {
  const m = String((e && e.message) || e || '');
  return /network request failed|failed to fetch|fetch failed|load failed|timeout|timed out|network|offline|internet|socket|ECONN|ENOTFOUND|resolve host|unknownhost|no address associated|software caused connection/i.test(m);
}

export function withTimeout(promise, ms = 12000) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error('timeout')), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

export function createQueue({ load, save, send, getUid }) {
  let items = [];
  let failed = [];
  let ready = null;
  let running = false;
  const listeners = new Set();

  const snapshot = () => ({ items, failed });
  const notify = () => {
    const s = snapshot();
    listeners.forEach((f) => f(s));
  };
  const persist = async () => {
    try {
      await save({ items, failed });
    } catch (e) {}
  };

  const init = () => {
    if (!ready) {
      ready = (async () => {
        try {
          const d = await load();
          if (d) {
            items = Array.isArray(d.items) ? d.items : [];
            failed = Array.isArray(d.failed) ? d.failed : [];
          }
        } catch (e) {}
        notify();
      })();
    }
    return ready;
  };

  return {
    init,
    getState: snapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async enqueue(op) {
      await init();
      const item = { cid: op.cid || uuid(), kind: op.kind, payload: op.payload, label: op.label || '', uid: await getUid(), at: new Date().toISOString() };
      items = [...items, item];
      await persist();
      notify();
      return item;
    },
    hasPending: async () => {
      await init();
      const uid = await getUid();
      return items.some((x) => x.uid === uid);
    },
    async flush() {
      await init();
      if (running) return { sent: 0, failed: 0, offline: false };
      running = true;
      let sent = 0, bad = 0, offline = false;
      try {
        const uid = await getUid();
        for (const it of items.filter((x) => x.uid === uid)) {
          try {
            await send(it);
            items = items.filter((x) => x.cid !== it.cid);
            sent++;
          } catch (e) {
            if (isNetworkError(e)) {
              offline = true;
              break;
            }
            items = items.filter((x) => x.cid !== it.cid);
            failed = [...failed, { ...it, error: String((e && e.message) || e) }];
            bad++;
          }
          await persist();
          notify();
        }
        await persist();
        notify();
      } finally {
        running = false;
      }
      return { sent, failed: bad, offline };
    },
    async dismiss(cid) {
      failed = failed.filter((x) => x.cid !== cid);
      await persist();
      notify();
    },
    async retry(cid) {
      const it = failed.find((x) => x.cid === cid);
      if (!it) return;
      const { error, ...rest } = it;
      failed = failed.filter((x) => x.cid !== cid);
      items = [...items, rest];
      await persist();
      notify();
    },
  };
}
