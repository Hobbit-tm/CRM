import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from './dialog';
import { useTheme } from './theme';
import { useAuth } from './auth';
import { Card, Button, Segmented, Field, toNum, fmt, useKeyboardOverlap } from './components';
import ScannerModal from './ScannerModal';
import { submitSale } from './offline';
import { shareInvoice } from './invoiceShare';

const PAYMENTS = [
  { value: 'Наличные', label: 'Наличные' },
  { value: 'Карта', label: 'Карта' },
  { value: 'Перевод', label: 'Перевод' },
];

function Body({ products, initialIds, onClose, onDone }) {
  const { colors } = useTheme();
  const { isAdmin } = useAuth();
  const insets = useSafeAreaInsets();
  const rootRef = useRef(null);
  const kb = useKeyboardOverlap(rootRef);
  const [cart, setCart] = useState([]); // [{ id, qty, price }]
  const [query, setQuery] = useState('');
  const [scan, setScan] = useState(false);
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [payment, setPayment] = useState('Наличные');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Позиции, с которыми открыли окно (например, из карточки товара)
  useEffect(() => {
    setCart(
      (initialIds || [])
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((p) => ({ id: p.id, qty: '1', price: p.price ? String(p.price) : '' }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIds]);

  const addProduct = (p) => {
    setCart((c) => {
      const i = c.findIndex((x) => x.id === p.id);
      if (i >= 0) {
        const next = [...c];
        next[i] = { ...next[i], qty: String(toNum(next[i].qty) + 1) };
        return next;
      }
      return [...c, { id: p.id, qty: '1', price: p.price ? String(p.price) : '' }];
    });
    setQuery('');
  };

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) =>
        `${p.name} ${p.model_code || ''} ${p.barcode || ''} ${p.sku || ''} ${p.donor || ''} ${p.location || ''}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 6);
  }, [products, query]);

  const onScanned = (code) => {
    setScan(false);
    const c = String(code).trim().toLowerCase();
    const p = products.find(
      (x) =>
        (x.barcode || '').toLowerCase() === c ||
        (x.sku || '').toLowerCase() === c ||
        (x.oem || '').toLowerCase() === c
    );
    setTimeout(() => {
      if (p) addProduct(p);
      else Alert.alert('Товар не найден', `Код: ${code}`);
    }, 450);
  };

  const setLine = (id, patch) => setCart((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeLine = (id) => setCart((c) => c.filter((x) => x.id !== id));

  const total = cart.reduce((s, l) => s + toNum(l.qty) * toNum(l.price), 0);

  const submit = async () => {
    if (busy) return;
    if (!cart.length) return Alert.alert('Добавьте позиции', 'Найдите товар или отсканируйте его код.');
    for (const l of cart) {
      const p = byId.get(l.id);
      const q = toNum(l.qty);
      if (q <= 0) return Alert.alert('Проверьте количество', `«${p?.name}»: укажите количество больше нуля.`);
      if (p && q > p.qty) return Alert.alert('Не хватает на складе', `«${p.name}»: на складе ${fmt(p.qty)} шт, в продаже ${fmt(q)}.`);
    }
    setBusy(true);
    try {
      const res = await submitSale({
        items: cart.map((l) => ({
          product_id: l.id,
          qty: toNum(l.qty),
          // цену передаём только администратору: у остальных её нет, сервер возьмёт цену из каталога
          ...(isAdmin && l.price !== '' ? { price: toNum(l.price) } : {}),
        })),
        customer,
        phone,
        payment,
        note,
      }, `Продажа${customer ? ' (' + customer + ')' : ''}: ${cart.length} поз.`);
      if (res.queued) {
        onDone();
        Alert.alert(
          'Нет связи',
          'Продажа сохранена на телефоне и оформится сама, как только появится интернет. Накладную можно будет сделать в «Истории» после отправки.',
          [{ text: 'Понятно', onPress: onClose }]
        );
        return;
      }
      onDone();
      Alert.alert(`Продажа № ${res.number} оформлена`, 'Остатки обновлены. Напечатать или отправить накладную?', [
        { text: 'Готово', style: 'cancel', onPress: onClose },
        {
          text: 'Накладная',
          onPress: async () => {
            try {
              await shareInvoice(res.id, isAdmin);
            } catch (e) {
              Alert.alert('Не удалось сделать накладную', e.message);
            }
            onClose();
          },
        },
      ]);
    } catch (e) {
      Alert.alert('Не удалось оформить', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View ref={rootRef} style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
        <Text style={{ flex: 1, color: colors.text, fontSize: 26, fontWeight: '800' }}>Продажа</Text>
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

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 + kb }}
      >
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: colors.input,
            borderRadius: 14, paddingHorizontal: 12, marginBottom: 8,
          }}
        >
          <Ionicons name="search" size={20} color={colors.sub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Найти и добавить товар"
            placeholderTextColor={colors.sub}
            style={{ flex: 1, color: colors.text, paddingVertical: 12, paddingHorizontal: 8, fontSize: 15 }}
          />
        </View>

        {found.map((p) => (
          <Card key={p.id} onPress={() => addProduct(p)} style={{ marginBottom: 6, padding: 10, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{p.name}</Text>
              <Text style={{ color: colors.sub, fontSize: 12 }} numberOfLines={1}>
                {[p.model_code, p.donor, `на складе ${fmt(p.qty)}`].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons name="add-circle" size={26} color={p.qty > 0 ? colors.primary : colors.sub} />
          </Card>
        ))}

        {cart.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 28 }}>
            <Ionicons name="cart-outline" size={52} color={colors.sub} />
            <Text style={{ color: colors.sub, marginTop: 8, textAlign: 'center' }}>
              Найдите товар в поиске или отсканируйте его код, чтобы добавить в продажу
            </Text>
          </View>
        ) : null}

        {cart.map((l) => {
          const p = byId.get(l.id);
          if (!p) return null;
          const over = toNum(l.qty) > p.qty;
          return (
            <Card key={l.id} style={{ marginBottom: 10, padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={2}>{p.name}</Text>
                  <Text style={{ color: over ? colors.danger : colors.sub, fontSize: 12, marginTop: 2 }}>
                    {[p.model_code, `на складе ${fmt(p.qty)} шт`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Pressable onPress={() => removeLine(l.id)} hitSlop={10}>
                  <Ionicons name="close-circle" size={24} color={colors.sub} />
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Количество"
                    value={l.qty}
                    onChangeText={(v) => setLine(l.id, { qty: v })}
                    keyboardType="decimal-pad"
                    placeholder="1"
                  />
                </View>
                {isAdmin ? (
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Цена за шт"
                      value={l.price}
                      onChangeText={(v) => setLine(l.id, { price: v })}
                      keyboardType="decimal-pad"
                      placeholder="0"
                    />
                  </View>
                ) : null}
              </View>
              {isAdmin ? (
                <Text style={{ color: colors.sub, fontSize: 13, marginTop: -6 }}>
                  Сумма: {fmt(toNum(l.qty) * toNum(l.price))}
                </Text>
              ) : null}
            </Card>
          );
        })}

        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 10, marginBottom: 10 }}>Покупатель</Text>
        <Field label="Имя или название" value={customer} onChangeText={setCustomer} placeholder="Не обязательно" />
        <Field label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Не обязательно" />
        <Text style={{ color: colors.sub, fontSize: 13, marginBottom: 6 }}>Оплата</Text>
        <Segmented value={payment} onChange={setPayment} options={PAYMENTS} />
        <View style={{ height: 14 }} />
        <Field label="Примечание" value={note} onChangeText={setNote} placeholder="Доставка, договорённости…" />
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12,
          borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg,
        }}
      >
        {isAdmin ? (
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 8 }}>
            Итого: {fmt(total)}
          </Text>
        ) : (
          <Text style={{ color: colors.sub, fontSize: 13, marginBottom: 8 }}>Позиций: {cart.length}</Text>
        )}
        <Button title={busy ? 'Оформляю…' : 'Оформить продажу'} icon="checkmark-done-outline" onPress={submit} />
      </View>

      <ScannerModal visible={scan} onClose={() => setScan(false)} onScanned={onScanned} />
    </View>
  );
}

export default function SaleModal({ visible, products, initialIds, onClose, onDone }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        {visible ? <Body products={products} initialIds={initialIds} onClose={onClose} onDone={onDone} /> : null}
      </SafeAreaProvider>
    </Modal>
  );
}
