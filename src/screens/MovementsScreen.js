import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { Alert } from '../dialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { Card, Button, Sheet, Field, fmt, fmtDate } from '../components';
import { getMovements, subscribe, cancelMovement, cancelSale } from '../db';
import { shareInvoice, printInvoice } from '../invoiceShare';
import { readCache, writeCache, reuseList } from '../cache';
import { useAuth } from '../auth';

export default function MovementsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { session, canEdit, isAdmin } = useAuth();
  const uid = session?.user?.id;
  const lastLoad = useRef(0);
  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sel, setSel] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid) return;
    readCache('movements:' + uid).then((c) => {
      if (c && lastLoad.current === 0) setItems(c);
    });
  }, [uid]);

  const load = useCallback(async () => {
    try {
      const rows = await getMovements();
      lastLoad.current = Date.now();
      setItems((prev) => reuseList(prev, rows));
      if (uid) writeCache('movements:' + uid, rows);
    } catch (e) {
      if (!/network|fetch/i.test(e.message)) Alert.alert('Ошибка загрузки', e.message);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoad.current > 20000) load();
    }, [load])
  );
  useEffect(() => subscribe(load), [load]);

  // Отменить может админ или автор в течение суток (то же проверяет база)
  const canCancel = (m) =>
    canEdit &&
    !m.cancelled_at &&
    (isAdmin || (m.created_by === uid && Date.now() - new Date(m.created_at).getTime() < 24 * 3600 * 1000));

  const openItem = (m) => {
    setReason('');
    setSel(m);
  };

  const doCancel = (whole) => {
    const m = sel;
    Alert.alert(
      whole ? `Отменить всю продажу № ${m.sale_number}?` : 'Отменить операцию?',
      whole
        ? 'Все позиции вернутся на склад, продажа исчезнет из отчётов. Запись останется в истории с пометкой «Отменено».'
        : m.type === 'out'
        ? 'Товар вернётся на склад, продажа исчезнет из отчётов. Запись останется в истории с пометкой «Отменено».'
        : 'Приход будет убран со склада. Запись останется в истории с пометкой «Отменено».',
      [
        { text: 'Назад', style: 'cancel' },
        {
          text: 'Отменить',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              if (whole) await cancelSale(m.sale_id, reason.trim());
              else await cancelMovement(m.id, reason.trim());
              setSel(null);
              await load();
            } catch (e) {
              Alert.alert('Не удалось отменить', e.message);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const invoice = async (print) => {
    setBusy(true);
    try {
      if (print) await printInvoice(sel.sale_id, isAdmin);
      else await shareInvoice(sel.sale_id, isAdmin);
    } catch (e) {
      Alert.alert('Не удалось сделать накладную', e.message);
    } finally {
      setBusy(false);
    }
  };

  const renderItem = ({ item }) => {
    const isIn = item.type === 'in';
    const gone = !!item.cancelled_at;
    const color = gone ? colors.sub : isIn ? colors.success : colors.danger;
    const meta = [
      fmtDate(item.created_at),
      item.author_name,
      item.sale_number ? `Продажа № ${item.sale_number}${item.customer ? ', ' + item.customer : ''}` : '',
      item.note,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <Card onPress={() => openItem(item)} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', opacity: gone ? 0.6 : 1 }}>
        <View
          style={{
            width: 42, height: 42, borderRadius: 21, backgroundColor: color + '22',
            alignItems: 'center', justifyContent: 'center', marginRight: 12,
          }}
        >
          <Ionicons name={isIn ? 'arrow-down' : 'arrow-up'} size={22} color={color} />
        </View>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text
            style={{ color: colors.text, fontSize: 15, fontWeight: '600', textDecorationLine: gone ? 'line-through' : 'none' }}
            numberOfLines={1}
          >
            {item.product_name}
          </Text>
          <Text style={{ color: colors.sub, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
            {meta}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color, fontSize: 17, fontWeight: '700', textDecorationLine: gone ? 'line-through' : 'none' }}>
            {isIn ? '+' : '−'}{fmt(item.qty)} шт
          </Text>
          <Text style={{ color: gone ? colors.danger : colors.sub, fontSize: 11, marginTop: 2 }}>
            {gone ? 'Отменено' : item.is_correction ? 'Корректировка' : isIn ? 'Приход' : item.sale_number ? 'Продажа' : 'Расход'}
          </Text>
        </View>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', paddingHorizontal: 16, marginBottom: 14 }}>
        История
      </Text>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderItem}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="time-outline" size={56} color={colors.sub} />
            <Text style={{ color: colors.sub, marginTop: 10 }}>Движений пока нет</Text>
          </View>
        }
      />

      <Sheet visible={!!sel} onClose={() => setSel(null)} title={sel?.product_name || ''}>
        {sel ? (
          <>
            {[
              ['Операция', sel.cancelled_at ? 'Отменена' : sel.is_correction ? 'Корректировка' : sel.type === 'in' ? 'Приход' : sel.sale_number ? 'Продажа' : 'Расход'],
              ['Количество', `${sel.type === 'in' ? '+' : '−'}${fmt(sel.qty)} шт`],
              ['Когда', fmtDate(sel.created_at)],
              ['Кто', sel.author_name],
              ['Продажа', sel.sale_number ? `№ ${sel.sale_number}` : ''],
              ['Покупатель', sel.customer],
              ['Оплата', sel.payment],
              ['Комментарий', sel.note],
              ['Причина отмены', sel.cancelled_at ? sel.cancel_reason : ''],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', marginBottom: 6 }}>
                  <Text style={{ color: colors.sub, fontSize: 13, width: 112 }}>{k}</Text>
                  <Text style={{ color: colors.text, fontSize: 14, flex: 1, fontWeight: '600' }}>{v}</Text>
                </View>
              ))}
            <View style={{ height: 8 }} />
            {sel.sale_id ? (
              <>
                <Button title={busy ? 'Готовлю…' : 'Накладная (PDF)'} icon="document-text-outline" onPress={() => invoice(false)} />
                <Button title="Печать накладной" variant="soft" icon="print-outline" onPress={() => invoice(true)} style={{ marginTop: 10 }} />
              </>
            ) : null}
            {canCancel(sel) ? (
              <>
                <Field
                  label="Причина отмены (не обязательно)"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Например, ошибся при вводе"
                  style={{ marginTop: 14 }}
                />
                <Button
                  title={busy ? 'Отменяю…' : 'Отменить операцию'}
                  variant="danger"
                  icon="close-circle-outline"
                  onPress={() => doCancel(false)}
                />
                {sel.sale_id ? (
                  <Button
                    title="Отменить всю продажу"
                    variant="danger"
                    icon="trash-outline"
                    onPress={() => doCancel(true)}
                    style={{ marginTop: 10 }}
                  />
                ) : null}
              </>
            ) : !sel.cancelled_at && canEdit ? (
              <Text style={{ color: colors.sub, fontSize: 12, marginTop: 10 }}>
                Отменить может администратор. Автор операции может отменить её только в течение суток.
              </Text>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
