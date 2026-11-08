import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';
import { Card, fmt, fmtCompact } from './components';
import { conditionTone } from './parts';
import { Thumb } from './PhotoUI';

function Chip({ icon, text, color }) {
  const { colors } = useTheme();
  const fg = color || colors.sub;
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', backgroundColor: color ? color + '22' : colors.input,
        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginTop: 6,
      }}
    >
      <Ionicons name={icon} size={12} color={fg} />
      <Text style={{ color: fg, fontSize: 12, marginLeft: 4, fontWeight: color ? '700' : '400' }} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function Metric({ label, value }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.sub, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// Карточка товара: что это, сколько есть, сколько продано, цена
function ProductCard({ item, sold, cover, canEdit, isAdmin, onPress, onEdit }) {
  const { colors } = useTheme();
  const none = item.qty <= 0;
  const color = none ? colors.danger : colors.success;
  const hasCodes = item.model_code || item.sku || item.barcode || item.oem;
  const tone = conditionTone(item.condition);
  const condColor = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : tone === 'warn' ? '#E0A100' : colors.sub;

  return (
    <Card onPress={() => onPress(item)} style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 5, backgroundColor: color }} />
        <View style={{ flex: 1, padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ marginRight: 12 }}>
              <Thumb path={cover} size={60} />
            </View>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }} numberOfLines={2}>
                {item.name}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {item.pending ? <Chip icon="cloud-upload-outline" text="Ждёт отправки" color={colors.primary} /> : null}
                {item.model_code ? <Chip icon="cog-outline" text={item.model_code} /> : null}
                {item.condition ? <Chip icon="shield-checkmark-outline" text={item.condition} color={condColor} /> : null}
                {item.donor ? <Chip icon="car-outline" text={item.donor} /> : null}
                {item.location ? <Chip icon="location-outline" text={item.location} /> : null}
                {item.mileage != null ? <Chip icon="speedometer-outline" text={`${fmt(item.mileage)} км`} /> : null}
                {item.brand ? <Chip icon="ribbon-outline" text={item.brand} /> : null}
                {item.sku ? <Chip icon="pricetag-outline" text={`№ ${item.sku}`} /> : null}
                {item.oem ? <Chip icon="construct-outline" text={`OEM ${item.oem}`} /> : null}
                {item.barcode ? <Chip icon="qr-code-outline" text={item.barcode} /> : null}
                {item.category ? <Chip icon="folder-outline" text={item.category} /> : null}
                {!hasCodes ? <Chip icon="remove-circle-outline" text="Без кода и номера" /> : null}
              </View>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800' }}>{fmt(item.qty)}</Text>
              <Text style={{ color: colors.sub, fontSize: 12, marginTop: -2 }}>шт на складе</Text>
              <View
                style={{
                  backgroundColor: color + '22', borderRadius: 8, paddingHorizontal: 8,
                  paddingVertical: 3, marginTop: 6,
                }}
              >
                <Text style={{ color, fontSize: 11, fontWeight: '700' }}>
                  {none ? 'Нет в наличии' : 'В наличии'}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 10,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
            }}
          >
            {isAdmin ? <Metric label="Цена за 1 шт" value={item.price > 0 ? fmt(item.price) : '—'} /> : null}
            <Metric label="Продано" value={`${fmt(sold)} шт`} />
            {isAdmin ? <Metric label="Сумма остатка" value={fmtCompact(item.qty * (item.price || 0))} /> : null}
            {canEdit && !item.pending ? (
              <Pressable hitSlop={10} onPress={() => onEdit(item)} style={{ paddingLeft: 8 }}>
                <Ionicons name="create-outline" size={22} color={colors.sub} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

// Перерисовываем карточку, только если изменились её данные
export default React.memo(ProductCard);
