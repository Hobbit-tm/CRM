import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, FlatList, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from './dialog';
import { useTheme } from './theme';
import { useAuth } from './auth';
import { Card, Button, Segmented, Sheet, Field, toNum, fmt } from './components';
import ScannerModal from './ScannerModal';
import { getProducts, addMovement } from './db';
import { readCache, writeCache } from './cache';

const r3 = (x) => Math.round(x * 1000) / 1000;
const sign = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');

function Stat({ label, value, color }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.sub, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: color || colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Body({ products, onClose, onDone }) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const uid = session?.user?.id;
  const key = 'inventory:' + uid;

  const [counts, setCounts] = useState({}); // { [productId]: посчитанное количество }
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('counted'); // counted | diff | all
  const [query, setQuery] = useState('');
  const [scan, setScan] = useState(false);
  const [edit, setEdit] = useState(null); // товар, который сейчас считаем
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const countsRef = useRef(counts);
  countsRef.current = counts;

  // Черновик хранится на телефоне: можно закрыть приложение и продолжить позже
  useEffect(() => {
    if (!uid) return;
    readCache(key).then((c) => {
      setCounts((c && c.counts) || {});
      setLoaded(true);
    });
  }, [uid, key]);

  const save = (next) => {
    setCounts(next);
    writeCache(key, { counts: next });
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .map((p) => {
        const counted = counts[p.id];
        const has = counted !== undefined;
        return { p, has, counted, diff: has ? r3(counted - p.qty) : 0 };
      })
      .filter((r) => {
        if (tab === 'counted' && !r.has) return false;
        if (tab === 'diff' && !(r.has && r.diff !== 0)) return false;
        if (!q) return true;
        const s = `${r.p.name} ${r.p.sku || ''} ${r.p.barcode || ''} ${r.p.oem || ''} ${r.p.brand || ''}`.toLowerCase();
        return s.includes(q);
      });
  }, [products, counts, tab, query]);

  const totals = useMemo(() => {
    let counted = 0, diffs = 0, plus = 0, minus = 0;
    for (const p of products) {
      const c = counts[p.id];
      if (c === undefined) continue;
      counted += 1;
      const d = r3(c - p.qty);
      if (d !== 0) diffs += 1;
      if (d > 0) plus += d;
      if (d < 0) minus += -d;
    }
    return { counted, diffs, plus: r3(plus), minus: r3(minus) };
  }, [products, counts]);

  const open = (p) => {
    setEdit(p);
    const c = countsRef.current[p.id];
    setVal(c === undefined ? '' : String(c));
  };

  const onScanned = (code) => {
    setScan(false);
    const c = String(code).trim().toLowerCase();
    const p = products.find(
      (x) =>
        (x.barcode || '').toLowerCase() === c ||
        (x.sku || '').toLowerCase() === c ||
        (x.oem || '').toLowerCase() === c ||
        (x.model_code || '').toLowerCase() === c
    );
    // пауза, чтобы окно камеры успело закрыться (иначе на iOS окна конфликтуют)
    setTimeout(() => {
      if (p) open(p);
      else Alert.alert('Товар не найден', `Код: ${code}`);
    }, 450);
  };

  const commit = () => {
    const n = toNum(val);
    if (val.trim() === '' || n < 0) return Alert.alert('Укажите количество (0 или больше)');
    save({ ...counts, [edit.id]: r3(n) });
    setEdit(null);
  };

  const uncount = () => {
    const next = { ...counts };
    delete next[edit.id];
    save(next);
    setEdit(null);
  };

  const reset = () =>
    Alert.alert('Сбросить пересчёт?', 'Все введённые количества будут удалены. Остатки на складе не изменятся.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Сбросить', style: 'destructive', onPress: () => save({}) },
    ]);

  // Считаем расхождения по свежим остаткам с сервера (пока считали, могли быть продажи)
  const prepare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const fresh = await getProducts();
      const byId = new Map(fresh.map((p) => [p.id, p]));
      const ops = [];
      for (const [id, c] of Object.entries(countsRef.current)) {
        const p = byId.get(Number(id));
        if (!p) continue;
        const diff = r3(c - p.qty);
        if (diff !== 0) ops.push({ p, diff });
      }
      if (!ops.length) {
        Alert.alert('Расхождений нет', 'Посчитанное совпадает с остатками на складе.');
        return;
      }
      const plus = r3(ops.filter((o) => o.diff > 0).reduce((s, o) => s + o.diff, 0));
      const minus = r3(ops.filter((o) => o.diff < 0).reduce((s, o) => s - o.diff, 0));
      Alert.alert(
        'Применить результат?',
        `Позиций с расхождением: ${ops.length}\nИзлишек: +${fmt(plus)} шт\nНедостача: −${fmt(minus)} шт\n\nОстатки на складе станут равны посчитанным. В истории появятся корректировки, продажами они не считаются.`,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Применить', onPress: () => run(ops) },
        ]
      );
    } catch (e) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setBusy(false);
    }
  };

  const run = async (ops) => {
    setBusy(true);
    let ok = 0;
    const failed = [];
    const next = { ...countsRef.current };
    for (const { p, diff } of ops) {
      try {
        await addMovement(p.id, diff > 0 ? 'in' : 'out', Math.abs(diff), 'Инвентаризация', true);
        delete next[p.id];
        ok += 1;
      } catch (e) {
        failed.push(`${p.name}: ${e.message}`);
      }
    }
    // совпавшие с остатком позиции тоже считаем завершёнными
    for (const p of products) {
      const c = next[p.id];
      if (c !== undefined && r3(c - p.qty) === 0 && !ops.some((o) => o.p.id === p.id)) delete next[p.id];
    }
    save(next);
    setBusy(false);
    onDone();
    if (failed.length) {
      Alert.alert(`Применено: ${ok}. Не удалось: ${failed.length}`, failed.slice(0, 5).join('\n'));
    } else {
      Alert.alert('Готово', `Остатки обновлены: ${ok} поз.`);
    }
  };

  const renderItem = ({ item: r }) => {
    const color = r.diff > 0 ? colors.primary : r.diff < 0 ? colors.danger : colors.success;
    return (
      <Card onPress={() => open(r.p)} style={{ marginBottom: 8, padding: 12, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={2}>{r.p.name}</Text>
          <Text style={{ color: colors.sub, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {[r.p.model_code, r.p.donor, r.p.location && `Место ${r.p.location}`].filter(Boolean).join(' · ') || ' '}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {r.has ? (
            <>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{fmt(r.counted)} шт</Text>
              <Text style={{ color, fontSize: 12, fontWeight: '700' }}>
                {r.diff === 0 ? 'совпало' : `${sign(r.diff)}${fmt(Math.abs(r.diff))} к учёту ${fmt(r.p.qty)}`}
              </Text>
            </>
          ) : (
            <>
              <Text style={{ color: colors.sub, fontSize: 15, fontWeight: '700' }}>по учёту {fmt(r.p.qty)}</Text>
              <Text style={{ color: colors.sub, fontSize: 12 }}>не посчитано</Text>
            </>
          )}
        </View>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ flex: 1, color: colors.text, fontSize: 26, fontWeight: '800' }}>Инвентаризация</Text>
          <Pressable
            onPress={() => setScan(true)}
            style={{
              width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center', marginRight: 8,
            }}
          >
            <Ionicons name="scan-outline" size={24} color={colors.onPrimary} />
          </Pressable>
          <Pressable
            onPress={onClose}
            style={{
              width: 44, height: 44, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1,
              borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <Card style={{ padding: 12, marginBottom: 12, flexDirection: 'row' }}>
          <Stat label="Посчитано" value={`${totals.counted} из ${products.length}`} />
          <Stat label="Расхождений" value={String(totals.diffs)} color={totals.diffs ? colors.danger : colors.success} />
          <Stat label="Излишек / недостача" value={`+${fmt(totals.plus)} / −${fmt(totals.minus)}`} />
        </Card>

        <View
          style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: colors.input,
            borderRadius: 14, paddingHorizontal: 12, marginBottom: 10,
          }}
        >
          <Ionicons name="search" size={20} color={colors.sub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Найти товар"
            placeholderTextColor={colors.sub}
            style={{ flex: 1, color: colors.text, paddingVertical: 11, paddingHorizontal: 8, fontSize: 15 }}
          />
        </View>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'counted', label: 'Посчитано' },
            { value: 'diff', label: 'Расхождения' },
            { value: 'all', label: 'Все' },
          ]}
        />
        <View style={{ height: 10 }} />
      </View>

      {!loaded ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.p.id)}
          renderItem={renderItem}
          initialNumToRender={10}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 20 }}>
              <Ionicons name="clipboard-outline" size={52} color={colors.sub} />
              <Text style={{ color: colors.sub, marginTop: 10, textAlign: 'center' }}>
                {tab === 'counted' && !query
                  ? 'Отсканируйте товар или найдите его в списке «Все» и укажите, сколько его фактически на полке'
                  : tab === 'diff' && !query
                  ? 'Расхождений пока нет'
                  : 'Ничего не найдено'}
              </Text>
            </View>
          }
        />
      )}

      <View
        style={{
          paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12,
          borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg,
        }}
      >
        <Button
          title={busy ? 'Применяю…' : totals.diffs ? `Применить расхождения (${totals.diffs})` : 'Применить'}
          icon="checkmark-done-outline"
          onPress={prepare}
        />
        {totals.counted ? (
          <Button title="Сбросить пересчёт" variant="soft" icon="refresh-outline" onPress={reset} style={{ marginTop: 8 }} />
        ) : null}
      </View>

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.name || ''}>
        {edit ? (
          <>
            <Text style={{ color: colors.sub, marginBottom: 14 }}>
              По учёту на складе: {fmt(edit.qty)} шт
              {edit.sku ? `\nАрт. ${edit.sku}` : ''}
            </Text>
            <Field
              label="Фактически на полке, шт"
              value={val}
              onChangeText={setVal}
              keyboardType="decimal-pad"
              placeholder="0"
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: -4, marginBottom: 14 }}>
              <Button
                title="+1"
                variant="soft"
                onPress={() => setVal(String(r3(toNum(val) + 1)))}
                style={{ flex: 1 }}
              />
              <Button
                title="Как по учёту"
                variant="soft"
                onPress={() => setVal(String(edit.qty))}
                style={{ flex: 2 }}
              />
            </View>
            {val.trim() !== '' ? (
              <Text
                style={{
                  color: toNum(val) === edit.qty ? colors.success : toNum(val) > edit.qty ? colors.primary : colors.danger,
                  fontWeight: '700', marginBottom: 14,
                }}
              >
                {toNum(val) === edit.qty
                  ? 'Совпадает с учётом'
                  : `${toNum(val) > edit.qty ? 'Излишек' : 'Недостача'}: ${sign(r3(toNum(val) - edit.qty))}${fmt(Math.abs(r3(toNum(val) - edit.qty)))} шт`}
              </Text>
            ) : null}
            <Button title="Сохранить" icon="checkmark" onPress={commit} />
            {counts[edit.id] !== undefined ? (
              <Button title="Убрать из пересчёта" variant="soft" icon="close-circle-outline" onPress={uncount} style={{ marginTop: 10 }} />
            ) : null}
          </>
        ) : null}
      </Sheet>

      <ScannerModal visible={scan} onClose={() => setScan(false)} onScanned={onScanned} />
    </View>
  );
}

export default function InventoryModal({ visible, products, onClose, onDone }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>{visible ? <Body products={products} onClose={onClose} onDone={onDone} /> : null}</SafeAreaProvider>
    </Modal>
  );
}
