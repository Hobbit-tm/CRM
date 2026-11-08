import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, Modal, FlatList, Animated, PanResponder, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from './dialog';
import { useTheme } from './theme';
import { signedUrl, getPhotos, addPhoto, deletePhoto } from './photos';
import { readCache, writeCache } from './cache';

// Картинка из закрытого хранилища: ссылка берётся по пути, файл кэшируется на телефоне по пути (не по ссылке)
// Файл ищется в памяти телефона по пути: уже виденные фото показываются сразу и работают без интернета.
// Ссылка с сервера нужна только для новых фото.
export function RemoteImage({ path, style, contentFit = 'cover', radius = 10, transparent = false }) {
  const { colors } = useTheme();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (path) signedUrl(path).then((u) => alive && u && setUrl(u)).catch(() => {});
    return () => { alive = false; };
  }, [path]);
  return (
    <View style={[{ backgroundColor: transparent ? 'transparent' : colors.input, borderRadius: radius, overflow: 'hidden' }, style]}>
      {path ? (
        <Image
          source={{ uri: url || 'https://photos.local/' + path, cacheKey: path }}
          style={{ width: '100%', height: '100%' }}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={path}
          transition={100}
        />
      ) : null}
    </View>
  );
}

// Маленькая плитка для карточки списка: фото или значок
export function Thumb({ path, size = 56 }) {
  const { colors } = useTheme();
  return path ? (
    <RemoteImage path={path} style={{ width: size, height: size }} />
  ) : (
    <View
      style={{
        width: size, height: size, borderRadius: 10, backgroundColor: colors.input,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Ionicons name="image-outline" size={22} color={colors.sub} />
    </View>
  );
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Фото с масштабом. Листание фото между собой работает одним пальцем (пока фото не приближено).
// Приблизить: двойное касание, кнопки +/- или щипок двумя пальцами. Приближенное фото двигается одним пальцем.
function ZoomableImage({ path, thumbPath, width, height, active, onZoom }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const s = useRef({ scale: 1, x: 0, y: 0, x0: 0, y0: 0, d0: 0, s0: 1, lastTap: 0, pinching: false }).current;

  const apply = (sc, x, y, animate) => {
    s.scale = sc;
    s.x = x;
    s.y = y;
    if (animate) {
      Animated.parallel(
        [[scale, sc], [tx, x], [ty, y]].map(([v, to]) =>
          Animated.timing(v, { toValue: to, duration: 160, useNativeDriver: true })
        )
      ).start();
    } else {
      scale.setValue(sc);
      tx.setValue(x);
      ty.setValue(y);
    }
    onZoom && onZoom(sc > 1.02);
  };

  // Нельзя утащить фото за границы окна
  const limit = (sc, x, y) => {
    const mx = (width * sc - width) / 2;
    const my = (height * sc - height) / 2;
    return [clamp(x, -mx, mx), clamp(y, -my, my)];
  };

  const zoomTo = (sc) => {
    const next = clamp(sc, 1, 5);
    const [x, y] = next <= 1 ? [0, 0] : limit(next, s.x, s.y);
    apply(next, x, y, true);
  };

  useEffect(() => {
    if (!active && s.scale !== 1) apply(1, 0, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const pan = useRef(
    PanResponder.create({
      // Одним пальцем жест забираем только у приближенного фото; иначе листает список
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2 || s.scale > 1.02,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        s.x0 = s.x;
        s.y0 = s.y;
        s.d0 = 0;
        s.pinching = false;
      },
      onPanResponderMove: (e, g) => {
        const t = e.nativeEvent.touches;
        if (t.length >= 2) {
          const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
          if (!s.d0) {
            s.d0 = d;
            s.s0 = s.scale;
            s.pinching = true;
          }
          const sc = clamp((s.s0 * d) / s.d0, 1, 5);
          const [x, y] = limit(sc, s.x, s.y);
          apply(sc, x, y, false);
        } else if (s.scale > 1.02 && !s.pinching) {
          const [x, y] = limit(s.scale, s.x0 + g.dx, s.y0 + g.dy);
          apply(s.scale, x, y, false);
        }
      },
      onPanResponderRelease: () => {
        s.pinching = false;
        s.d0 = 0;
        if (s.scale < 1.05 && s.scale !== 1) apply(1, 0, 0, true);
      },
      onPanResponderTerminate: () => {
        s.pinching = false;
        s.d0 = 0;
      },
    })
  ).current;

  const onTap = () => {
    const now = Date.now();
    if (now - s.lastTap < 320) {
      s.lastTap = 0;
      zoomTo(s.scale > 1.02 ? 1 : 2.5);
    } else {
      s.lastTap = now;
    }
  };

  const Btn = ({ icon, onPress }) => (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={icon} size={26} color="#fff" />
    </Pressable>
  );

  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <View {...pan.panHandlers} style={{ width, height }}>
        <Pressable onPress={onTap} style={{ width, height }}>
          <Animated.View style={{ width, height, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }}>
            {/* маленькая копия уже загружена в списке: показываем её сразу, пока грузится большая */}
            {thumbPath ? (
              <RemoteImage path={thumbPath} contentFit="contain" radius={0} style={{ position: 'absolute', width, height }} transparent />
            ) : null}
            <RemoteImage path={path} contentFit="contain" radius={0} style={{ width, height }} transparent />
          </Animated.View>
        </Pressable>
      </View>
      <View style={{ position: 'absolute', bottom: 12, right: 16, flexDirection: 'row', gap: 12 }}>
        <Btn icon="remove" onPress={() => zoomTo(s.scale / 1.6)} />
        <Btn icon="add" onPress={() => zoomTo(s.scale < 1.02 ? 2 : s.scale * 1.6)} />
      </View>
    </View>
  );
}

function Viewer({ photos, start, canEdit, onClose, onDelete }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    setIdx(start);
  }, [start]);

  const current = photos[idx];
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        ref={listRef}
        data={photos}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => String(p.id)}
        initialScrollIndex={Math.min(start, Math.max(photos.length - 1, 0))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => {
          setIdx(Math.round(e.nativeEvent.contentOffset.x / width));
          setZoomed(false);
        }}
        renderItem={({ item, index }) => (
          <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
            <ZoomableImage
              path={item.path}
              thumbPath={item.thumb_path}
              width={width}
              height={height * 0.8}
              active={index === idx}
              onZoom={index === idx ? setZoomed : undefined}
            />
          </View>
        )}
      />
      <View
        style={{
          position: 'absolute', top: insets.top + 10, left: 16, right: 16,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
          {photos.length ? `${idx + 1} / ${photos.length}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {canEdit && current ? (
            <Pressable
              onPress={() => onDelete(current)}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="trash-outline" size={22} color="#ff6b6f" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Полоса фото в карточке позиции: просмотр, добавление (камера/галерея), удаление
export function PhotoStrip({ productId, canEdit, onChanged }) {
  const { colors } = useTheme();
  const [photos, setPhotos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState(-1);

  const load = useCallback(async () => {
    try {
      const list = await getPhotos(productId);
      setPhotos(list);
      writeCache('photos:' + productId, list);
    } catch (e) {
      // без сети остаётся список, сохранённый на телефоне
      setPhotos((prev) => prev ?? []);
    }
  }, [productId]);

  useEffect(() => {
    let alive = true;
    setPhotos(null);
    setViewer(-1);
    if (productId) {
      // сначала показываем сохранённый список фото, потом тихо обновляем
      readCache('photos:' + productId).then((c) => {
        if (alive && c) setPhotos((prev) => prev ?? c);
      });
      load();
    }
    return () => { alive = false; };
  }, [productId, load]);

  const upload = async (uris) => {
    setBusy(true);
    let failed = 0;
    let lastError = '';
    for (const uri of uris) {
      try {
        await addPhoto(productId, uri);
      } catch (e) {
        failed += 1;
        lastError = e.message;
      }
    }
    setBusy(false);
    await load();
    onChanged && onChanged();
    if (failed) Alert.alert('Не все фото загрузились', `Ошибок: ${failed}. ${lastError}`);
  };

  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Нет доступа к камере', 'Разрешите камеру в настройках телефона.');
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled && r.assets?.length) upload(r.assets.map((a) => a.uri));
  };

  const fromGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 8,
      quality: 0.8,
    });
    if (!r.canceled && r.assets?.length) upload(r.assets.map((a) => a.uri));
  };

  const add = () =>
    Alert.alert('Добавить фото', 'Откуда взять фото?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Из галереи', onPress: () => setTimeout(fromGallery, 300) },
      { text: 'Снять камерой', onPress: () => setTimeout(fromCamera, 300) },
    ]);

  const remove = (photo) =>
    Alert.alert('Удалить фото?', 'Фото удалится у всех сотрудников.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePhoto(photo);
            setViewer(-1);
            await load();
            onChanged && onChanged();
          } catch (e) {
            Alert.alert('Ошибка', e.message);
          }
        },
      },
    ]);

  if (photos === null) {
    return <ActivityIndicator color={colors.primary} style={{ height: 84 }} />;
  }
  if (!photos.length && !canEdit) return null;

  return (
    <View style={{ marginBottom: 14 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {photos.map((p, i) => (
          <Pressable key={p.id} onPress={() => setViewer(i)} style={{ marginRight: 8 }}>
            <RemoteImage path={p.thumb_path} style={{ width: 84, height: 84 }} />
          </Pressable>
        ))}
        {canEdit ? (
          <Pressable
            onPress={busy ? undefined : add}
            style={{
              width: 84, height: 84, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary,
              borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={26} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                  {photos.length ? 'Ещё' : 'Добавить фото'}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal visible={viewer >= 0} animationType="fade" statusBarTranslucent onRequestClose={() => setViewer(-1)}>
        <SafeAreaProvider>
          {viewer >= 0 ? (
            <Viewer photos={photos} start={viewer} canEdit={canEdit} onClose={() => setViewer(-1)} onDelete={remove} />
          ) : null}
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}
