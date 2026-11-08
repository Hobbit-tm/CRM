import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Alert } from './dialog';
import { Ionicons } from '@expo/vector-icons';
import { Sheet, Field, Button, toNum, fmt } from './components';
import ScannerModal from './ScannerModal';
import { CATEGORIES, CONDITIONS, ORIGINS } from './parts';
import { saveProduct, deleteProduct } from './db';
import { submitProduct, isNetworkError } from './offline';
import { useTheme } from './theme';
import { useAuth } from './auth';

const empty = {
  name: '', sku: '', barcode: '', qty: '1', price: '', brand: '', oem: '', applicability: '', category: '',
  model_code: '', donor: '', condition: '', mileage: '', origin: '', warranty: '', location: '', comment: '',
};

// Ряд подсказок: нажали — значение подставилось, нажали ещё раз — очистилось
function Chips({ value, options, onPick }) {
  const { colors } = useTheme();
  const cur = (value || '').trim().toLowerCase();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: -6, marginBottom: 12 }}>
      {options.map((c) => {
        const on = cur === c.toLowerCase();
        return (
          <Pressable
            key={c}
            onPress={() => onPick(on ? '' : c)}
            style={{
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, marginRight: 8, marginBottom: 8,
              backgroundColor: on ? colors.primary : colors.input,
            }}
          >
            <Text style={{ color: on ? colors.onPrimary : colors.sub, fontSize: 13, fontWeight: '600' }}>{c}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ProductForm({ visible, product, initialBarcode, categories = [], onClose, onSaved }) {
  const { colors } = useTheme();
  const { isAdmin } = useAuth();
  const [f, setF] = useState(empty);
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (product) {
      const next = {
        name: product.name,
        sku: product.sku || '',
        barcode: product.barcode || '',
        qty: String(product.qty),
        price: product.price ? String(product.price) : '',
        brand: product.brand || '',
        oem: product.oem || '',
        applicability: product.applicability || '',
        category: product.category || '',
        model_code: product.model_code || '',
        donor: product.donor || '',
        condition: product.condition || '',
        mileage: product.mileage == null ? '' : String(product.mileage),
        origin: product.origin || '',
        warranty: product.warranty || '',
        location: product.location || '',
        comment: product.comment || '',
      };
      setF(next);
      // раздел «Дополнительно» раскрываем, если там уже что-то заполнено
      setMore(!!(next.mileage || next.origin || next.warranty || next.oem || next.sku || next.brand || next.applicability || next.comment));
    } else {
      setF({ ...empty, barcode: initialBarcode || '' });
      setMore(false);
    }
  }, [visible, product, initialBarcode]);

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const price = toNum(f.price);
  const qtyForTotal = product ? product.qty : toNum(f.qty);
  const total = price * qtyForTotal;
  const catOptions = [...CATEGORIES, ...categories.filter((c) => !CATEGORIES.some((p) => p.toLowerCase() === c.toLowerCase()))];

  const save = async () => {
    if (busy) return;
    if (!f.name.trim()) return Alert.alert('Укажите название');
    if (toNum(f.qty) < 0) return Alert.alert('Остаток не может быть отрицательным');
    setBusy(true);
    try {
      const payload = {
        id: product?.id,
        name: f.name.trim(),
        sku: f.sku.trim(),
        barcode: f.barcode.trim(),
        qty: toNum(f.qty),
        oldQty: product?.qty ?? 0,
        price: isAdmin ? price : undefined, // цену задаёт и видит только администратор
        brand: f.brand.trim(),
        oem: f.oem.trim(),
        applicability: f.applicability.trim(),
        category: f.category.trim(),
        model_code: f.model_code.trim(),
        donor: f.donor.trim(),
        condition: f.condition.trim(),
        mileage: f.mileage.trim() === '' ? null : toNum(f.mileage),
        origin: f.origin.trim(),
        warranty: f.warranty.trim(),
        location: f.location.trim(),
        comment: f.comment.trim(),
      };
      if (product?.id) {
        await saveProduct(payload);
      } else {
        const r = await submitProduct(payload);
        if (r.queued) {
          Alert.alert(
            'Нет связи',
            'Позиция сохранена на телефоне и появится на складе, как только будет интернет. Фото к ней можно добавить после отправки.'
          );
        }
      }
      onSaved();
    } catch (e) {
      Alert.alert(
        isNetworkError(e) ? 'Нет связи' : 'Ошибка',
        isNetworkError(e) ? 'Изменить существующую позицию можно только при подключении к интернету. Новые позиции без интернета добавляются.' : e.message
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('Удалить позицию?', 'Вместе с ней удалится и история движений.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProduct(product.id);
            onSaved();
          } catch (e) {
            Alert.alert(
              isNetworkError(e) ? 'Нет связи' : 'Ошибка',
              isNetworkError(e) ? 'Удалить позицию можно только при подключении к интернету.' : e.message
            );
          }
        },
      },
    ]);

  return (
    <Sheet visible={visible} onClose={onClose} title={product ? 'Редактировать позицию' : 'Новая позиция'}>
      <Field
        label="Название *"
        value={f.name}
        onChangeText={set('name')}
        placeholder="Например, Двигатель 2AZ-FE 2.4 Toyota Camry"
      />

      <Field label="Категория" value={f.category} onChangeText={set('category')} placeholder="Двигатель, КПП, навесное…" />
      <Chips value={f.category} options={catOptions} onPick={set('category')} />

      <Field
        label="Код двигателя / КПП"
        value={f.model_code}
        onChangeText={set('model_code')}
        autoCapitalize="characters"
        placeholder="Например, 2AZ-FE или U660E"
      />

      <Field label="Состояние" value={f.condition} onChangeText={set('condition')} placeholder="Выберите или впишите" />
      <Chips value={f.condition} options={CONDITIONS} onPick={set('condition')} />

      <Field
        label="Авто-донор (марка, модель, год)"
        value={f.donor}
        onChangeText={set('donor')}
        placeholder="Например, Toyota Camry ACV40, 2008"
      />

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Штрихкод / QR-код (наша наклейка)"
            value={f.barcode}
            onChangeText={set('barcode')}
            autoCapitalize="none"
            placeholder="Введите или отсканируйте"
          />
        </View>
        <Pressable
          onPress={() => setScan(true)}
          style={{
            width: 48, height: 48, borderRadius: 12, marginBottom: 14,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="qr-code-outline" size={26} color={colors.onPrimary} />
        </Pressable>
      </View>

      {isAdmin ? (
        <Field
          label="Цена"
          value={f.price}
          onChangeText={set('price')}
          keyboardType="decimal-pad"
          placeholder="0"
        />
      ) : null}

      <Field
        label={product ? 'Остаток на складе, шт' : 'Количество, шт'}
        value={f.qty}
        onChangeText={set('qty')}
        keyboardType="decimal-pad"
        placeholder="1"
      />
      {product ? (
        <Text style={{ color: colors.sub, fontSize: 12, marginTop: -6, marginBottom: 12 }}>
          Если пересчитали, впишите фактическое число. Разница попадёт в историю как «Корректировка» и не считается
          продажей. Чтобы записать продажу или поступление, откройте позицию и нажмите «Приход / расход».
        </Text>
      ) : null}

      <Field label="Место на складе" value={f.location} onChangeText={set('location')} placeholder="Например, стеллаж 3, полка B" />

      <Pressable
        onPress={() => setMore((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginBottom: 6 }}
      >
        <Ionicons name={more ? 'chevron-down' : 'chevron-forward'} size={20} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '700', marginLeft: 6 }}>
          Дополнительно: пробег, происхождение, гарантия, номера
        </Text>
      </Pressable>

      {more ? (
        <>
          <Field label="Пробег, км" value={f.mileage} onChangeText={set('mileage')} keyboardType="number-pad" placeholder="Если известен" />
          <Field label="Откуда" value={f.origin} onChangeText={set('origin')} placeholder="Выберите или впишите" />
          <Chips value={f.origin} options={ORIGINS} onPick={set('origin')} />
          <Field label="Гарантия" value={f.warranty} onChangeText={set('warranty')} placeholder="Например, 14 дней" />
          <Field
            label="Номер детали / OEM"
            value={f.oem}
            onChangeText={set('oem')}
            autoCapitalize="characters"
            placeholder="Номер по каталогу"
          />
          <Field label="Внутренний номер" value={f.sku} onChangeText={set('sku')} autoCapitalize="characters" />
          <Field label="Марка агрегата" value={f.brand} onChangeText={set('brand')} placeholder="Например, Toyota, Aisin, Denso" />
          <Field
            label="Подходит на авто"
            value={f.applicability}
            onChangeText={set('applicability')}
            multiline
            placeholder="Например: Toyota Camry 2006-2011, Lexus ES 2006-2012"
            style={{ minHeight: 70, textAlignVertical: 'top' }}
          />
          <Field
            label="Комментарий"
            value={f.comment}
            onChangeText={set('comment')}
            multiline
            placeholder="Что проверено, особенности, дефекты"
            style={{ minHeight: 70, textAlignVertical: 'top' }}
          />
        </>
      ) : null}

      {isAdmin ? (
        <Text style={{ color: colors.sub, fontSize: 13, marginBottom: 16 }}>
          {price > 0 && qtyForTotal > 0
            ? `Стоимость: ${fmt(qtyForTotal)} × ${fmt(price)} = ${fmt(total)}`
            : 'Укажите цену за штуку: общая стоимость считается как количество × цена.'}
        </Text>
      ) : null}

      <Button title={busy ? 'Сохраняю…' : 'Сохранить'} icon="checkmark" onPress={save} />
      {product && isAdmin ? (
        <Button title="Удалить позицию" variant="danger" icon="trash-outline" onPress={remove} style={{ marginTop: 10 }} />
      ) : null}

      <ScannerModal
        visible={scan}
        onClose={() => setScan(false)}
        onScanned={(code) => {
          setScan(false);
          set('barcode')(code);
        }}
      />
    </Sheet>
  );
}
