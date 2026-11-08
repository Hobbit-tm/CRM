import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, ScrollView,
  Keyboard, Platform, StyleSheet, useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';

export function Card({ children, style, onPress }) {
  const { colors, isDark } = useTheme();
  const base = {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: isDark ? 0 : 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: isDark ? 0 : 2,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', icon, style }) {
  const { colors } = useTheme();
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.input;
  const fg = variant === 'primary' ? colors.onPrimary : variant === 'danger' ? '#fff' : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        },
        style,
        pressed && { opacity: 0.8 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, style, ...props }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={{ color: colors.sub, fontSize: 13, marginBottom: 6 }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.sub}
        // В числовых полях при нажатии выделяем всё: старый «0» заменяется сразу, как только начали вводить
        selectTextOnFocus={/(decimal-pad|number-pad|numeric)/.test(props.keyboardType || '')}
        {...props}
        style={[
          {
            backgroundColor: colors.input, color: colors.text, borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
          },
          style,
        ]}
      />
    </View>
  );
}

export function Segmented({ options, value, onChange }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.input, borderRadius: 14, padding: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center',
              backgroundColor: active ? colors.primary : 'transparent',
            }}
          >
            <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// На сколько клавиатура перекрывает контейнер (ref). Работает одинаково на iOS и Android,
// в том числе когда система сама не сдвигает окно (режим edge-to-edge).
export function useKeyboardOverlap(ref) {
  const [h, setH] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const kbH = e.endCoordinates.height;
      const top = e.endCoordinates.screenY;
      if (ref.current && typeof top === 'number' && isFinite(top)) {
        ref.current.measureInWindow((x, y, w, hh) => {
          const overlap = y + hh - top;
          setH(isFinite(overlap) ? Math.max(0, Math.min(overlap, kbH + 80)) : kbH);
        });
      } else {
        setH(kbH);
      }
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref]);
  return h;
}

function SheetBody({ onClose, title, children }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const rootRef = React.useRef(null);
  const kb = useKeyboardOverlap(rootRef);

  // Запас снизу под системные кнопки (на Android минимум, если система не сообщила отступ)
  const bottomSafe = Math.max(insets.bottom, Platform.OS === 'android' ? 28 : 0);
  const topSafe = Math.max(insets.top, 24);
  const maxHeight = height - kb - topSafe - 12;

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)', paddingBottom: kb }}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View
        style={{
          backgroundColor: colors.card, borderTopLeftRadius: 26, borderTopRightRadius: 26,
          paddingTop: 20, paddingHorizontal: 20,
          paddingBottom: kb > 0 ? 12 : bottomSafe + 16,
          maxHeight,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' }}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.sub} />
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

// Нижняя «шторка» для форм: поднимается над клавиатурой и не заезжает под системные кнопки
export function Sheet({ visible, onClose, title, children }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SheetBody onClose={onClose} title={title}>{children}</SheetBody>
      </SafeAreaProvider>
    </Modal>
  );
}

// Понимает «1 500», «1500,50» и «1 500.5»
export const toNum = (s) => {
  const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

// Форматирование чисел и дат вручную, без toLocaleString:
// на разных телефонах (iOS, Android, разные языки) результат всегда одинаковый.
// Числа: 1 500,5 (пробел между тысячами, запятая у дробной части)
export const fmt = (n, maxDecimals = 2) => {
  const v = Number(n);
  if (!isFinite(v)) return '0';
  const fixed = Math.abs(v).toFixed(maxDecimals);
  let [int, dec = ''] = fixed.split('.');
  dec = dec.replace(/0+$/, '');
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = v < 0 && Number(fixed) !== 0 ? '-' : '';
  return sign + int + (dec ? ',' + dec : '');
};

// Компактно для больших сумм: 12,5 млн
export const fmtCompact = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return fmt(n / 1e9, 1) + ' млрд';
  if (a >= 1e6) return fmt(n / 1e6, 1) + ' млн';
  return fmt(n);
};

// Даты: 30 окт, 10:28
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const fmtDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${p(d.getHours())}:${p(d.getMinutes())}`;
};
