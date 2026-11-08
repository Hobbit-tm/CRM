import AsyncStorage from '@react-native-async-storage/async-storage';

// Маленький кэш на телефоне: экран показывает прошлые данные сразу,
// а свежие подгружаются в фоне. Если ничего не сохранено, возвращаем null.
const P = 'cache:';

export async function readCache(key) {
  try {
    const raw = await AsyncStorage.getItem(P + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function writeCache(key, value) {
  try {
    AsyncStorage.setItem(P + key, JSON.stringify(value)).catch(() => {});
  } catch (e) {}
}

// При выходе из аккаунта данные пользователя на телефоне не оставляем
export async function clearCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(P));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch (e) {}
}

// Если данные не изменились, возвращаем прежний массив/объекты: React не перерисует лишнего
export function reuseList(prev, next, keyOf = (x) => x.id) {
  if (!Array.isArray(prev) || !prev.length) return next;
  const old = new Map(prev.map((x) => [keyOf(x), x]));
  let same = prev.length === next.length;
  const out = next.map((n, i) => {
    const o = old.get(keyOf(n));
    if (o && JSON.stringify(o) === JSON.stringify(n)) {
      if (prev[i] !== o) same = false;
      return o;
    }
    same = false;
    return n;
  });
  return same ? prev : out;
}
