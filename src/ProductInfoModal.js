import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Sheet, Button, fmt, fmtCompact, fmtDate } from './components';
import { getProductStats } from './db';
import { isNetworkError } from './offline';
import { useTheme } from './theme';
import { useAuth } from './auth';
import { PhotoStrip } from './PhotoUI';

function Tile({ label, value, sub, color }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.input, borderRadius: 14, padding: 12 }}>
      <Text style={{ color: colors.sub, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: color || colors.text, fontSize: 22, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
        {value}
      </Text>
      {sub ? <Text style={{ color: colors.sub, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

// Карточка товара после сканирования: наличие, продано, принято
export default function ProductInfoModal({ visible, product, canEdit, onClose, onMove, onEdit, onLabel, onSell, onPhotosChanged }) {
  const { colors } = useTheme();
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !product) return;
    let alive = true;
    setStats(null);
    setError('');
    getProductStats(product.id)
      .then((s) => alive && setStats(s))
      .catch((e) => alive && setError(isNetworkError(e) ? 'offline' : e.message));
    return () => { alive = false; };
  }, [visible, product]);

  const inStock = product ? product.qty > 0 : false;

  return (
    <Sheet visible={visible} onClose={onClose} title={product?.name || ''}>
      {product ? (
        <>
          <PhotoStrip productId={product.id} canEdit={canEdit} onChanged={onPhotosChanged} />
          <Text style={{ color: colors.sub, marginBottom: 10 }}>
            {[
              product.brand,
              product.sku && `Арт. ${product.sku}`,
              product.oem && `OEM ${product.oem}`,
              product.barcode,
            ].filter(Boolean).join(' · ') || 'Без артикула'}
          </Text>
          {[
            ['Категория', product.category],
            ['Код агрегата', product.model_code],
            ['Состояние', product.condition],
            ['Авто-донор', product.donor],
            ['Пробег', product.mileage != null ? `${fmt(product.mileage)} км` : ''],
            ['Откуда', product.origin],
            ['Гарантия', product.warranty],
            ['Место', product.location],
            ['Подходит на', product.applicability],
            ['Комментарий', product.comment],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text style={{ color: colors.sub, fontSize: 13, width: 104 }}>{k}</Text>
                <Text style={{ color: colors.text, fontSize: 14, flex: 1, fontWeight: '600' }}>{v}</Text>
              </View>
            ))}
          <View style={{ height: 10 }} />

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <Tile
              label="В наличии"
              value={`${fmt(product.qty)} шт`}
              sub={inStock ? undefined : 'Нет в наличии'}
              color={inStock ? colors.success : colors.danger}
            />
            {isAdmin ? <Tile label="Цена за 1 шт" value={product.price > 0 ? fmt(product.price) : '—'} /> : null}
          </View>

          {error === 'offline' ? (
            <Text style={{ color: colors.sub, marginVertical: 10, fontSize: 13 }}>
              Нет связи: статистика продаж недоступна, остальные данные сохранены на телефоне.
            </Text>
          ) : error ? (
            <Text style={{ color: colors.danger, marginVertical: 10 }}>{error}</Text>
          ) : !stats ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 18 }} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <Tile label="Продано" value={`${fmt(stats.sold)} шт`} sub={isAdmin && stats.sold > 0 ? `на ${fmtCompact(stats.soldSum)}` : undefined} />
                <Tile label="Принято всего" value={`${fmt(stats.received)} шт`} />
              </View>
              <Text style={{ color: colors.sub, fontSize: 12, marginBottom: 16 }}>
                {[
                  isAdmin && `Остаток на складе по цене: ${fmtCompact(product.qty * (product.price || 0))}`,
                  stats.lastOut && `Последний расход: ${fmtDate(stats.lastOut)}`,
                ].filter(Boolean).join('\n')}
              </Text>
            </>
          )}

          {canEdit ? (
            <>
              {onSell && product.qty > 0 ? (
                <Button title="Продать" icon="cart-outline" onPress={() => onSell(product)} style={{ marginBottom: 10 }} />
              ) : null}
              <Button title="Приход / расход" variant={onSell ? 'soft' : 'primary'} icon="swap-vertical-outline" onPress={() => onMove(product)} />
              <Button title="Редактировать" variant="soft" icon="create-outline" onPress={() => onEdit(product)} style={{ marginTop: 10 }} />
              {onLabel ? (
                <Button title="Печать этикетки" variant="soft" icon="pricetags-outline" onPress={() => onLabel(product)} style={{ marginTop: 10 }} />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
