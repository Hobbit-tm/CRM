import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, FlatList, Pressable, TextInput } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from './dialog';
import { useTheme } from './theme';
import { Card, Button, Segmented } from './components';
import { ensureBarcodes } from './db';
import { labelsHtml, FORMATS } from './labels';

function Body({ products, initialIds, onClose, onChanged }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState(() => new Set(initialIds || []));
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('a4');
  const [copies, setCopies] = useState(1);
  const [guides, setGuides] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setPicked(new Set(initialIds || []));
  }, [initialIds]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      `${p.name} ${p.model_code || ''} ${p.barcode || ''} ${p.donor || ''} ${p.location || ''}`.toLowerCase().includes(q)
    );
  }, [products, query]);

  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selectedCount = picked.size;
  const total = selectedCount * copies;

  const prepare = async () => {
    const chosen = products.filter((p) => picked.has(p.id));
    const withCodes = await ensureBarcodes(chosen);
    if (withCodes.some((p, i) => p.barcode !== chosen[i].barcode)) onChanged && onChanged();
    return labelsHtml(withCodes, format, copies, guides);
  };

  const run = async (kind) => {
    if (busy) return;
    if (!selectedCount) return Alert.alert('Выберите позиции', 'Отметьте, для каких позиций печатать этикетки.');
    setBusy(kind);
    try {
      const html = await prepare();
      const page = FORMATS[format].page;
      if (kind === 'print') {
        await Print.printAsync({ html, width: page.width, height: page.height });
      } else {
        const { uri } = await Print.printToFileAsync({ html, width: page.width, height: page.height });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Этикетки' });
        } else {
          Alert.alert('Готово', 'PDF создан, но поделиться им на этом устройстве нельзя.');
        }
      }
    } catch (e) {
      Alert.alert('Не удалось подготовить этикетки', e.message);
    } finally {
      setBusy('');
    }
  };

  const renderItem = ({ item: p }) => {
    const on = picked.has(p.id);
    return (
      <Card onPress={() => toggle(p.id)} style={{ marginBottom: 8, padding: 12, flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons
          name={on ? 'checkbox' : 'square-outline'}
          size={26}
          color={on ? colors.primary : colors.sub}
          style={{ marginRight: 12 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={2}>{p.name}</Text>
          <Text style={{ color: colors.sub, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {[p.model_code, p.location && `Место ${p.location}`, p.barcode ? p.barcode : 'код будет присвоен'].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ flex: 1, color: colors.text, fontSize: 26, fontWeight: '800' }}>Этикетки</Text>
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

        <View
          style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: colors.input,
            borderRadius: 14, paddingHorizontal: 12, marginBottom: 10,
          }}
        >
          <Ionicons name="search" size={20} color={colors.sub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Найти позицию"
            placeholderTextColor={colors.sub}
            style={{ flex: 1, color: colors.text, paddingVertical: 11, paddingHorizontal: 8, fontSize: 15 }}
          />
        </View>

        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
          <Pressable onPress={() => setPicked(new Set(rows.map((p) => p.id)))} style={{ marginRight: 18 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Выбрать все{query ? ' найденные' : ''}</Text>
          </Pressable>
          <Pressable onPress={() => setPicked(new Set(products.filter((p) => !(p.barcode || '').trim()).map((p) => p.id)))} style={{ marginRight: 18 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Без кода</Text>
          </Pressable>
          <Pressable onPress={() => setPicked(new Set())}>
            <Text style={{ color: colors.sub, fontWeight: '700' }}>Снять</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderItem}
        extraData={picked}
        initialNumToRender={12}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
      />

      <View
        style={{
          paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12,
          borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg,
        }}
      >
        <Segmented
          value={format}
          onChange={setFormat}
          options={[
            { value: 'a4', label: 'Лист A4 (24 шт)' },
            { value: 'single', label: 'Одна 58×40' },
          ]}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 10 }}>
          <Text style={{ color: colors.text, flex: 1 }}>Копий каждой позиции</Text>
          <Pressable onPress={() => setCopies((c) => Math.max(1, c - 1))} hitSlop={8} style={{ padding: 6 }}>
            <Ionicons name="remove-circle-outline" size={28} color={colors.primary} />
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', minWidth: 30, textAlign: 'center' }}>{copies}</Text>
          <Pressable onPress={() => setCopies((c) => Math.min(24, c + 1))} hitSlop={8} style={{ padding: 6 }}>
            <Ionicons name="add-circle-outline" size={28} color={colors.primary} />
          </Pressable>
        </View>
        {format === 'a4' ? (
          <Pressable onPress={() => setGuides((g) => !g)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ionicons name={guides ? 'checkbox' : 'square-outline'} size={22} color={guides ? colors.primary : colors.sub} />
            <Text style={{ color: colors.text, marginLeft: 8 }}>Линии для вырезания (для обычной бумаги)</Text>
          </Pressable>
        ) : null}
        <Text style={{ color: colors.sub, fontSize: 12, marginBottom: 8 }}>
          Выбрано позиций: {selectedCount}, этикеток: {total}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            title={busy === 'print' ? 'Готовлю…' : 'Печать'}
            icon="print-outline"
            onPress={() => run('print')}
            style={{ flex: 1 }}
          />
          <Button
            title={busy === 'pdf' ? 'Готовлю…' : 'PDF'}
            variant="soft"
            icon="share-outline"
            onPress={() => run('pdf')}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </View>
  );
}

export default function LabelsModal({ visible, products, initialIds, onClose, onChanged }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        {visible ? <Body products={products} initialIds={initialIds} onClose={onClose} onChanged={onChanged} /> : null}
      </SafeAreaProvider>
    </Modal>
  );
}
