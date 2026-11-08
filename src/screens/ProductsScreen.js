import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, Pressable, ScrollView } from 'react-native';
import { readCache, writeCache, reuseList } from '../cache';
import { Alert } from '../dialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAuth } from '../auth';
import { Card, Button, Sheet, fmt, fmtCompact } from '../components';
import { getProducts, getProductTotals, getProductByBarcode, subscribe } from '../db';
import { getCovers } from '../photos';
import ProductCard from '../ProductCard';
import ProductForm from '../ProductForm';
import MovementModal from '../MovementModal';
import ScannerModal from '../ScannerModal';
import ProductInfoModal from '../ProductInfoModal';
import InventoryModal from '../InventoryModal';
import LabelsModal from '../LabelsModal';
import SaleModal from '../SaleModal';
import { useOffline, isNetworkError } from '../offline';

function Stat({ label, value, color }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, padding: 12 }}>
      <Text style={{ color: colors.sub, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: color || colors.text, fontSize: 18, fontWeight: '700', marginTop: 4 }} numberOfLines={1}>
        {value}
      </Text>
    </Card>
  );
}

export default function ProductsScreen() {
  const { colors } = useTheme();
  const { canEdit, isAdmin, session } = useAuth();
  const uid = session?.user?.id;
  const lastLoad = useRef(0);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('');
  const [rawAll, setAll] = useState([]);
  const { deltas, pending, pendingProducts } = useOffline();
  // остаток с учётом операций, которые ещё ждут отправки
  const real = useMemo(
    () => (Object.keys(deltas).length ? rawAll.map((p) => (deltas[p.id] ? { ...p, qty: p.qty + deltas[p.id] } : p)) : rawAll),
    [rawAll, deltas]
  );
  // новые позиции, ещё не дошедшие до сервера, показываем сверху
  const all = useMemo(() => (pendingProducts.length ? [...pendingProducts, ...real] : real), [real, pendingProducts]);
  const [totals, setTotals] = useState({});
  const [covers, setCovers] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({ visible: false, product: null, barcode: '' });
  const [moving, setMoving] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [info, setInfo] = useState(null);
  const [inventory, setInventory] = useState(false);
  const [labels, setLabels] = useState({ visible: false, ids: [] });
  const [sale, setSale] = useState({ visible: false, ids: [] });
  const [more, setMore] = useState(false);

  // Закрываем карточку и с небольшой паузой открываем следующее окно (иначе на iOS окна конфликтуют)
  const fromInfo = (fn) => {
    setInfo(null);
    setTimeout(fn, 450);
  };

  // Сначала показываем сохранённое на телефоне, потом тихо обновляем
  useEffect(() => {
    if (!uid) return;
    readCache('products:' + uid).then((c) => {
      if (c && lastLoad.current === 0) {
        setAll(c.products || []);
        setTotals(c.totals || {});
        setCovers(c.covers || {});
      }
    });
  }, [uid]);

  const load = useCallback(async () => {
    try {
      const [products, tot, cov] = await Promise.all([getProducts(isAdmin), getProductTotals(), getCovers()]);
      lastLoad.current = Date.now();
      setAll((prev) => reuseList(prev, products));
      setTotals(tot);
      setCovers(cov);
      if (uid) writeCache('products:' + uid, { products, totals: tot, covers: cov });
    } catch (e) {
      // без сети остаётся то, что уже на экране
      if (!/network|fetch/i.test(e.message)) Alert.alert('Ошибка загрузки', e.message);
    }
  }, [uid, isAdmin]);

  // При возврате на вкладку обновляем не чаще раза в 20 секунд: изменения и так приходят сами
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoad.current > 20000) load();
    }, [load])
  );
  useEffect(() => subscribe(load), [load]); // живые обновления от других пользователей

  // Когда очередь разгрузилась, подтягиваем свежие данные (новые позиции уже настоящие)
  const prevPending = useRef(0);
  useEffect(() => {
    if (pending.length < prevPending.current) load();
    prevPending.current = pending.length;
  }, [pending.length, load]);

  const deferredQuery = useDeferredValue(query);
  const haystack = useMemo(
    () =>
      all.map((p) => ({
        p,
        s: `${p.name} ${p.sku || ''} ${p.barcode || ''} ${p.brand || ''} ${p.oem || ''} ${p.applicability || ''} ${p.category || ''} ${p.model_code || ''} ${p.donor || ''} ${p.condition || ''} ${p.location || ''} ${p.origin || ''} ${p.comment || ''}`.toLowerCase(),
      })),
    [all]
  );

  // Список категорий из товаров (для фильтра и подсказок в форме)
  const categories = useMemo(() => {
    const set = new Map();
    for (const p of all) {
      const c = (p.category || '').trim();
      if (c && !set.has(c.toLowerCase())) set.set(c.toLowerCase(), c);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [all]);

  const items = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const c = cat.toLowerCase();
    if (!q && !c) return all;
    return haystack
      .filter((h) => (!c || (h.p.category || '').trim().toLowerCase() === c) && (!q || h.s.includes(q)))
      .map((h) => h.p);
  }, [all, haystack, deferredQuery, cat]);

  const stats = useMemo(
    () => ({
      total: all.length,
      value: all.reduce((s, p) => s + p.qty * (p.price || 0), 0),
      units: all.reduce((s, p) => s + p.qty, 0),
    }),
    [all]
  );

  const onScanned = (code) => {
    setScanning(false);
    setTimeout(async () => {
      try {
        const p = await getProductByBarcode(code, isAdmin);
        if (p) {
          setInfo(p); // карточка: наличие, продано, принято
        } else if (canEdit) {
          Alert.alert('Товар не найден', `Штрихкод: ${code}`, [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Добавить', onPress: () => setForm({ visible: true, product: null, barcode: code }) },
          ]);
        } else {
          Alert.alert('Товар не найден', `Штрихкод: ${code}`);
        }
      } catch (e) {
        if (isNetworkError(e)) {
          // без интернета ищем среди сохранённых на телефоне позиций
          const c = String(code).trim().toLowerCase();
          const p = real.find(
            (x) =>
              (x.barcode || '').toLowerCase() === c || (x.sku || '').toLowerCase() === c || (x.oem || '').toLowerCase() === c
          );
          if (p) setInfo(p);
          else Alert.alert('Нет связи', `Код ${code} не найден среди сохранённых на телефоне позиций.`);
        } else {
          Alert.alert('Ошибка', e.message);
        }
      }
    }, 450);
  };

  const closeForm = () => setForm((s) => ({ ...s, visible: false }));

  const pendingNote = () =>
    Alert.alert('Ждёт отправки', 'Эта позиция сохранена на телефоне и ещё не отправлена на сервер. Как только появится интернет, она станет обычной.');
  const openInfo = useCallback((p) => (p.pending ? pendingNote() : setInfo(p)), []);
  const openEdit = useCallback((p) => (p.pending ? pendingNote() : setForm({ visible: true, product: p, barcode: '' })), []);

  const renderItem = useCallback(
    ({ item }) => (
      <ProductCard
        item={item}
        sold={totals[item.id]?.sold || 0}
        cover={covers[item.id]}
        canEdit={canEdit}
        isAdmin={isAdmin}
        onPress={openInfo}
        onEdit={openEdit}
      />
    ),
    [totals, covers, canEdit, isAdmin, openInfo, openEdit]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ flex: 1, color: colors.text, fontSize: 30, fontWeight: '800' }}>Склад</Text>
          {canEdit ? (
            <Pressable
              onPress={() => setSale({ visible: true, ids: [] })}
              style={{
                width: 46, height: 46, borderRadius: 14, backgroundColor: colors.primary, marginRight: 10,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="cart-outline" size={24} color={colors.onPrimary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setScanning(true)}
            style={{
              width: 46, height: 46, borderRadius: 14, backgroundColor: colors.card,
              alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
            }}
          >
            <Ionicons name="scan-outline" size={24} color={colors.primary} />
          </Pressable>
          {canEdit ? (
            <Pressable
              onPress={() => setMore(true)}
              style={{
                width: 46, height: 46, borderRadius: 14, backgroundColor: colors.card, marginLeft: 10,
                alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <Stat label="Позиций" value={fmt(stats.total)} />
          <Stat label="Всего шт" value={fmtCompact(stats.units)} />
          {isAdmin ? <Stat label="Стоимость склада" value={fmtCompact(stats.value)} /> : null}
        </View>

        <View
          style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: colors.input,
            borderRadius: 14, paddingHorizontal: 12, marginBottom: 14,
          }}
        >
          <Ionicons name="search" size={20} color={colors.sub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Название, код двигателя, донор, место"
            placeholderTextColor={colors.sub}
            style={{ flex: 1, color: colors.text, paddingVertical: 12, paddingHorizontal: 8, fontSize: 15 }}
          />
        </View>
      </View>

      {categories.length ? (
        <View style={{ height: 44, marginBottom: 6 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center' }}
            keyboardShouldPersistTaps="handled"
          >
            {['', ...categories].map((c) => {
              const on = cat.toLowerCase() === c.toLowerCase();
              return (
                <Pressable
                  key={c || 'all'}
                  onPress={() => setCat(c)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, marginRight: 8,
                    backgroundColor: on ? colors.primary : colors.card,
                    borderWidth: 1, borderColor: on ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ color: on ? colors.onPrimary : colors.text, fontSize: 13, fontWeight: '600' }}>
                    {c || 'Все'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderItem}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="cube-outline" size={56} color={colors.sub} />
            <Text style={{ color: colors.sub, marginTop: 10, textAlign: 'center' }}>
              {query
                ? 'Ничего не найдено'
                : canEdit
                ? 'Склад пуст.\nНажмите «+», чтобы добавить первый товар'
                : 'Склад пока пуст'}
            </Text>
          </View>
        }
      />

      {canEdit ? (
        <Pressable
          onPress={() => setForm({ visible: true, product: null, barcode: '' })}
          style={{
            position: 'absolute', right: 20, bottom: 24, width: 62, height: 62, borderRadius: 31,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          }}
        >
          <Ionicons name="add" size={32} color={colors.onPrimary} />
        </Pressable>
      ) : null}

      <ProductForm
        visible={form.visible}
        product={form.product}
        initialBarcode={form.barcode}
        categories={categories}
        onClose={closeForm}
        onSaved={() => { closeForm(); load(); }}
      />
      <MovementModal
        visible={!!moving}
        product={moving}
        onClose={() => setMoving(null)}
        onDone={() => { setMoving(null); load(); }}
      />
      <Sheet visible={more} onClose={() => setMore(false)} title="Ещё">
        <Button
          title="Инвентаризация"
          variant="soft"
          icon="clipboard-outline"
          onPress={() => { setMore(false); setTimeout(() => setInventory(true), 450); }}
        />
        <Button
          title="Печать этикеток"
          variant="soft"
          icon="pricetags-outline"
          onPress={() => { setMore(false); setTimeout(() => setLabels({ visible: true, ids: [] }), 450); }}
          style={{ marginTop: 10 }}
        />
      </Sheet>
      <SaleModal
        visible={sale.visible}
        products={real}
        initialIds={sale.ids}
        onClose={() => setSale((s) => ({ ...s, visible: false }))}
        onDone={load}
      />
      <LabelsModal
        visible={labels.visible}
        products={real}
        initialIds={labels.ids}
        onClose={() => setLabels((s) => ({ ...s, visible: false }))}
        onChanged={load}
      />
      <InventoryModal visible={inventory} products={real} onClose={() => setInventory(false)} onDone={load} />
      <ScannerModal visible={scanning} onClose={() => setScanning(false)} onScanned={onScanned} />
      <ProductInfoModal
        visible={!!info}
        product={info}
        canEdit={canEdit}
        onClose={() => setInfo(null)}
        onPhotosChanged={load}
        onLabel={(p) => fromInfo(() => setLabels({ visible: true, ids: [p.id] }))}
        onSell={(p) => fromInfo(() => setSale({ visible: true, ids: [p.id] }))}
        onMove={(p) => fromInfo(() => setMoving(p))}
        onEdit={(p) => fromInfo(() => setForm({ visible: true, product: p, barcode: '' }))}
      />
    </View>
  );
}
