import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Alert } from './dialog';
import { Sheet, Field, Button, Segmented, toNum, fmt } from './components';
import { submitMovement } from './offline';
import { useTheme } from './theme';

export default function MovementModal({ visible, product, onClose, onDone }) {
  const { colors } = useTheme();
  const [type, setType] = useState('in');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setType('in');
      setQty('');
      setNote('');
    }
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    const n = toNum(qty);
    if (n <= 0) return Alert.alert('Укажите количество больше нуля');
    setBusy(true);
    try {
      const r = await submitMovement(product.id, type, n, note.trim(), `${type === 'in' ? 'Приход' : 'Расход'} ${n} шт: ${product.name}`);
      if (r.queued) Alert.alert('Нет связи', 'Операция сохранена на телефоне и отправится сама, как только появится интернет.');
      onDone();
    } catch (e) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={product?.name || ''}>
      <Text style={{ color: colors.sub, marginBottom: 14 }}>
        На складе: {product ? fmt(product.qty) : 0} {product?.unit}
      </Text>
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: 'in', label: 'Приход' },
          { value: 'out', label: 'Расход / продажа' },
        ]}
      />
      <Text style={{ height: 14 }} />
      <Field label="Количество" value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="0" autoFocus />
      <Field label="Комментарий" value={note} onChangeText={setNote} placeholder="Поставщик, покупатель, причина списания…" />
      <Button
        title={busy ? 'Сохраняю…' : type === 'in' ? 'Принять на склад' : 'Списать со склада'}
        icon={type === 'in' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
        variant={type === 'in' ? 'primary' : 'danger'}
        onPress={submit}
      />
    </Sheet>
  );
}
