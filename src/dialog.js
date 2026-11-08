import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Alert as RNAlert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';

// Свои всплывающие окна в стиле приложения вместо системных.
// Использование такое же, как у Alert из react-native:
//   Alert.alert('Заголовок', 'Текст', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: ... }])
let enqueue = null;

export const Alert = {
  alert(title, message, buttons) {
    if (enqueue) enqueue({ title, message, buttons });
    else RNAlert.alert(title, message, buttons); // запасной вариант, если провайдер ещё не готов
  },
};

function pickKind(title = '', message = '', buttons) {
  if (buttons.some((b) => b.style === 'destructive')) return 'warn';
  if (/ошибка|не удалось/i.test(title)) return 'error';
  if (/не найден/i.test(title)) return 'warn';
  if (/^(готово|код отправлен|проверьте почту)/i.test(title)) return 'success';
  return 'info';
}

function DialogButton({ btn, onPress, flex }) {
  const { colors } = useTheme();
  const kind = btn.style === 'cancel' ? 'cancel' : btn.style === 'destructive' ? 'danger' : 'primary';
  const bg = kind === 'cancel' ? colors.input : kind === 'danger' ? colors.danger : colors.primary;
  const fg = kind === 'cancel' ? colors.text : kind === 'danger' ? '#fff' : colors.onPrimary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: flex ? 1 : undefined, backgroundColor: bg, borderRadius: 14,
          paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center',
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={{ color: fg, fontSize: 16, fontWeight: '700' }}>{btn.text || 'OK'}</Text>
    </Pressable>
  );
}

export function DialogProvider({ children }) {
  const { colors } = useTheme();
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    enqueue = (d) => setQueue((q) => [...q, d]);
    return () => {
      enqueue = null;
    };
  }, []);

  const current = queue[0];
  const buttons = current?.buttons?.length ? current.buttons : [{ text: 'OK' }];

  const close = (btn) => {
    setQueue((q) => q.slice(1));
    if (btn?.onPress) setTimeout(() => btn.onPress(), 60);
  };

  const kind = current ? pickKind(current.title, current.message, buttons) : 'info';
  const iconMap = {
    error: { name: 'alert-circle', color: colors.danger },
    warn: { name: 'warning', color: '#F59E0B' },
    success: { name: 'checkmark-circle', color: colors.success },
    info: { name: 'information-circle', color: colors.primary },
  };
  const icon = iconMap[kind];
  const column = buttons.length > 2;

  return (
    <>
      {children}
      <Modal
        visible={!!current}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => close(buttons.find((b) => b.style === 'cancel'))}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <View
            style={{
              width: '86%', maxWidth: 400, backgroundColor: colors.card, borderRadius: 24,
              padding: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
            }}
          >
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: 56, height: 56, borderRadius: 28, backgroundColor: icon.color + '22',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                }}
              >
                <Ionicons name={icon.name} size={30} color={icon.color} />
              </View>
              <Text style={{ color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' }}>
                {current?.title}
              </Text>
              {current?.message ? (
                <ScrollView style={{ maxHeight: 220, marginTop: 8 }}>
                  <Text style={{ color: colors.sub, fontSize: 15, lineHeight: 21, textAlign: 'center' }}>
                    {String(current.message)}
                  </Text>
                </ScrollView>
              ) : null}
            </View>

            <View style={{ flexDirection: column ? 'column' : 'row', gap: 10, marginTop: 22 }}>
              {buttons.map((b, i) => (
                <DialogButton key={i} btn={b} flex={!column} onPress={() => close(b)} />
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
