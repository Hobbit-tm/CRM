import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';
import { Sheet, Button } from './components';
import { useOffline, flushQueue, retryOp, dismissOp } from './offline';

// Полоса над меню: сколько операций ждёт отправки и что не прошло
export default function OfflineBanner() {
  const { colors } = useTheme();
  const { pending, failed } = useOffline();
  const [open, setOpen] = useState(false);
  if (!pending.length && !failed.length) return null;

  const bad = failed.length > 0;
  const bg = bad ? colors.danger : colors.primary;
  return (
    <>
      <Pressable
        onPress={() => (bad ? setOpen(true) : flushQueue())}
        style={{ backgroundColor: bg, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}
      >
        <Ionicons name={bad ? 'warning-outline' : 'cloud-upload-outline'} size={18} color={colors.onPrimary} />
        <Text style={{ color: colors.onPrimary, fontWeight: '700', marginLeft: 8, flex: 1, fontSize: 13 }}>
          {bad
            ? `Не прошло операций: ${failed.length}. Нажмите, чтобы посмотреть`
            : `Ждут отправки: ${pending.length}. Уйдут сами, как появится связь`}
        </Text>
        {!bad ? <Text style={{ color: colors.onPrimary, fontSize: 12 }}>Отправить</Text> : null}
      </Pressable>

      <Sheet visible={open && bad} onClose={() => setOpen(false)} title="Не удалось отправить">
        <Text style={{ color: colors.sub, marginBottom: 12 }}>
          Сервер отклонил эти операции (например, на складе уже не хватало товара). На складе они не применены.
        </Text>
        {failed.map((f) => (
          <View key={f.cid} style={{ marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{f.label || (f.kind === 'sale' ? 'Продажа' : 'Операция')}</Text>
            <Text style={{ color: colors.sub, fontSize: 12, marginTop: 2 }}>{new Date(f.at).toLocaleString('ru-RU')}</Text>
            <Text style={{ color: colors.danger, fontSize: 13, marginTop: 4 }}>{f.error}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Button title="Повторить" variant="soft" onPress={() => retryOp(f.cid)} style={{ flex: 1 }} />
              <Button title="Удалить" variant="danger" onPress={() => dismissOp(f.cid)} style={{ flex: 1 }} />
            </View>
          </View>
        ))}
      </Sheet>
    </>
  );
}
