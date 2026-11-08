import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { Alert } from '../dialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { Card, Segmented, fmt } from '../components';
import { getSales, subscribe } from '../db';
import { useAuth } from '../auth';

const DAY = 24 * 60 * 60 * 1000;

export default function ReportScreen() {
  const { colors } = useTheme();
  const { isAdmin } = useAuth();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState('30');
  const [data, setData] = useState({ total: 0, operations: 0, items: [] });

  const load = useCallback(async () => {
    try {
      const since = period === 'all' ? null : new Date(Date.now() - Number(period) * DAY).toISOString();
      setData(await getSales(since));
    } catch (e) {
      Alert.alert('Ошибка загрузки', e.message);
    }
  }, [period]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => subscribe(load), [load]);

  const renderItem = ({ item }) => (
    <Card style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>{item.name}</Text>
        <Text style={{ color: colors.sub, fontSize: 12, marginTop: 2 }}>
          Продано: {fmt(item.qty)} {item.unit}
        </Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
        {isAdmin ? fmt(item.sum) : `${fmt(item.qty)} ${item.unit}`}
      </Text>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', marginBottom: 14 }}>Продажи</Text>
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: '7', label: '7 дней' },
            { value: '30', label: '30 дней' },
            { value: 'all', label: 'Всё время' },
          ]}
        />
        <View style={{ flexDirection: 'row', gap: 10, marginVertical: 14 }}>
          <Card style={{ flex: 1, padding: 12 }}>
            <Text style={{ color: colors.sub, fontSize: 12 }}>{isAdmin ? 'Сумма расхода' : 'Продано, шт'}</Text>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 4 }} numberOfLines={1}>
              {isAdmin ? fmt(data.total) : fmt(data.items.reduce((s, i) => s + i.qty, 0))}
            </Text>
          </Card>
          <Card style={{ flex: 1, padding: 12 }}>
            <Text style={{ color: colors.sub, fontSize: 12 }}>Операций</Text>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 4 }}>
              {fmt(data.operations)}
            </Text>
          </Card>
        </View>
      </View>

      <FlatList
        data={data.items}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Ionicons name="stats-chart-outline" size={56} color={colors.sub} />
            <Text style={{ color: colors.sub, marginTop: 10 }}>За этот период расходов нет</Text>
          </View>
        }
      />
    </View>
  );
}
