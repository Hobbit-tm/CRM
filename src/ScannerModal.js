import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, Pressable, Animated, Easing, Linking, Vibration, Platform,
  PixelRatio, StyleSheet, useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './components';
import { useTheme } from './theme';

const SHADE = 'rgba(0,0,0,0.62)';
const CORNER = 36;
const WIDTH = 5;
const RADIUS = 16;
const HOLD_MS = 280; // сколько показываем «прилипшую» рамку, прежде чем отдать результат
const LOST_MS = 600; // через сколько без кода рамка возвращается в центр
const MIN_BOX = 90;

// Типы кодов: только нужные, так распознавание быстрее
const TYPES = ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'datamatrix'];
const ZOOMS = [0, 0.2, 0.4];

function Corner({ pos, color }) {
  const base = { position: 'absolute', width: CORNER, height: CORNER, borderColor: color };
  const map = {
    tl: { top: 0, left: 0, borderTopWidth: WIDTH, borderLeftWidth: WIDTH, borderTopLeftRadius: RADIUS },
    tr: { top: 0, right: 0, borderTopWidth: WIDTH, borderRightWidth: WIDTH, borderTopRightRadius: RADIUS },
    bl: { bottom: 0, left: 0, borderBottomWidth: WIDTH, borderLeftWidth: WIDTH, borderBottomLeftRadius: RADIUS },
    br: { bottom: 0, right: 0, borderBottomWidth: WIDTH, borderRightWidth: WIDTH, borderBottomRightRadius: RADIUS },
  };
  return <View style={[base, map[pos]]} />;
}

function RoundButton({ icon, onPress, active }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        width: 46, height: 46, borderRadius: 23,
        backgroundColor: active ? '#fff' : 'rgba(0,0,0,0.55)',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={24} color={active ? '#000' : '#fff'} />
    </Pressable>
  );
}

function ScannerBody({ onClose, onScanned }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [view, setView] = useState({ w: win.width, h: win.height });
  const [torch, setTorch] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [debug, setDebug] = useState(false);
  const [dbg, setDbg] = useState('');
  const granted = permission?.granted;

  const size = Math.min(Math.round(view.w * 0.72), 320);
  const def = { x: (view.w - size) / 2, y: (view.h - size) / 2, w: size, h: size };

  // Положение рамки (меняется плавно)
  const fx = useRef(new Animated.Value(def.x)).current;
  const fy = useRef(new Animated.Value(def.y)).current;
  const fw = useRef(new Animated.Value(def.w)).current;
  const fh = useRef(new Animated.Value(def.h)).current;
  const line = useRef(new Animated.Value(0)).current;

  const doneRef = useRef(false);
  const pendingRef = useRef(null);
  const lastRef = useRef(0);
  const lostTimer = useRef(null);
  const holdTimer = useRef(null);
  const trackingRef = useRef(false);
  const debugRef = useRef(false);
  const calib = useRef({ n: 0, maxX: 0, maxY: 0, unit: Platform.OS === 'android' ? 'px' : 'dp', locked: false });
  const viewRef = useRef(view);
  const defRef = useRef(def);
  viewRef.current = view;
  defRef.current = def;
  debugRef.current = debug;

  const animateTo = (r, ms) => {
    Animated.parallel(
      [[fx, r.x], [fy, r.y], [fw, r.w], [fh, r.h]].map(([v, to]) =>
        Animated.timing(v, { toValue: to, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: false })
      )
    ).start();
  };

  // Размер экрана стал известен или изменился — ставим рамку по центру
  useEffect(() => {
    if (!trackingRef.current) {
      fx.setValue(def.x); fy.setValue(def.y); fw.setValue(def.w); fh.setValue(def.h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.w, view.h]);

  // Бегущая линия, пока код не найден
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(line, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(line, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [line]);

  useEffect(
    () => () => {
      clearTimeout(lostTimer.current);
      clearTimeout(holdTimer.current);
    },
    []
  );

  // Координаты кода -> прямоугольник на экране (в dp). Единицы Android определяем автоматически.
  const computeRect = (ev) => {
    let minX, minY, maxX, maxY;
    const pts = Array.isArray(ev.cornerPoints) && ev.cornerPoints.length ? ev.cornerPoints : null;
    if (pts) {
      const xs = pts.map((p) => Number(p.x));
      const ys = pts.map((p) => Number(p.y));
      minX = Math.min(...xs); maxX = Math.max(...xs);
      minY = Math.min(...ys); maxY = Math.max(...ys);
    } else if (ev.bounds && ev.bounds.origin && ev.bounds.size) {
      minX = Number(ev.bounds.origin.x); minY = Number(ev.bounds.origin.y);
      maxX = minX + Number(ev.bounds.size.width); maxY = minY + Number(ev.bounds.size.height);
    } else {
      return null;
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;

    const v = viewRef.current;
    const c = calib.current;
    c.n += 1;
    c.maxX = Math.max(c.maxX, maxX);
    c.maxY = Math.max(c.maxY, maxY);
    if (Platform.OS === 'android' && !c.locked) {
      if (c.maxX > v.w * 1.03 || c.maxY > v.h * 1.03) {
        c.unit = 'px'; // координаты больше экрана в dp: значит, в пикселях
        c.locked = true;
      } else if (c.n >= 5) {
        c.unit = 'dp';
      }
    }
    const k = c.unit === 'px' ? PixelRatio.get() : 1;
    let x0 = minX / k, y0 = minY / k, x1 = maxX / k, y1 = maxY / k;

    if (debugRef.current) {
      setDbg(
        `ед.: ${c.unit}${c.locked ? ' (зафикс.)' : ''}  масштаб: ${PixelRatio.get()}\n` +
        `код: ${Math.round(minX)},${Math.round(minY)} - ${Math.round(maxX)},${Math.round(maxY)}\n` +
        `экран: ${Math.round(v.w)}x${Math.round(v.h)}`
      );
    }

    const pad = Math.max(10, (x1 - x0) * 0.12);
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    // не меньше минимального размера
    if (x1 - x0 < MIN_BOX) { const cx = (x0 + x1) / 2; x0 = cx - MIN_BOX / 2; x1 = cx + MIN_BOX / 2; }
    if (y1 - y0 < MIN_BOX) { const cy = (y0 + y1) / 2; y0 = cy - MIN_BOX / 2; y1 = cy + MIN_BOX / 2; }
    // остаёмся в пределах экрана
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(v.w, x1); y1 = Math.min(v.h, y1);
    if (x1 - x0 < 20 || y1 - y0 < 20) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  const finish = () => {
    if (doneRef.current || pendingRef.current == null) return;
    doneRef.current = true;
    try { Vibration.vibrate(60); } catch (e) {}
    onScanned(String(pendingRef.current));
  };

  const handleScan = (ev) => {
    if (doneRef.current || !ev || !ev.data) return;
    const now = Date.now();
    if (now - lastRef.current < 60) return; // не обрабатываем каждый кадр
    lastRef.current = now;

    const rect = computeRect(ev);
    if (rect) {
      if (!trackingRef.current) {
        trackingRef.current = true;
        setTracking(true);
      }
      animateTo(rect, 110);
      clearTimeout(lostTimer.current);
      lostTimer.current = setTimeout(() => {
        // код пропал из кадра — рамка возвращается в центр
        if (doneRef.current) return;
        trackingRef.current = false;
        setTracking(false);
        animateTo(defRef.current, 260);
      }, LOST_MS);
    }

    if (pendingRef.current == null) {
      pendingRef.current = String(ev.data);
      // даём увидеть, как рамка «села» на код, и отдаём результат
      holdTimer.current = setTimeout(finish, rect ? HOLD_MS : 0);
    }
  };

  const cornerColor = tracking ? colors.success : '#fff';
  const topBottomShade = { position: 'absolute', left: 0, right: 0, backgroundColor: SHADE };

  return (
    <View
      style={{ flex: 1, backgroundColor: '#000' }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width && height && (Math.abs(width - view.w) > 1 || Math.abs(height - view.h) > 1)) {
          setView({ w: width, h: height });
        }
      }}
    >
      {granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          autofocus="on"
          zoom={ZOOMS[zoomIdx]}
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: TYPES }}
          onBarcodeScanned={handleScan}
        />
      ) : permission ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 16 }}>
          <Ionicons name="camera-outline" size={56} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center' }}>
            Для сканирования штрихкодов и QR-кодов нужен доступ к камере
          </Text>
          {permission.canAskAgain === false ? (
            <Button title="Открыть настройки" icon="settings-outline" onPress={() => Linking.openSettings()} />
          ) : (
            <Button title="Разрешить камеру" icon="camera-outline" onPress={requestPermission} />
          )}
        </View>
      ) : null}

      {granted ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* затемнение вокруг рамки, рамка двигается вместе с кодом */}
          <Animated.View style={[topBottomShade, { top: 0, height: fy }]} />
          <Animated.View style={[topBottomShade, { top: Animated.add(fy, fh), bottom: 0 }]} />
          <Animated.View style={{ position: 'absolute', left: 0, width: fx, top: fy, height: fh, backgroundColor: SHADE }} />
          <Animated.View
            style={{ position: 'absolute', left: Animated.add(fx, fw), right: 0, top: fy, height: fh, backgroundColor: SHADE }}
          />

          <Animated.View style={{ position: 'absolute', left: fx, top: fy, width: fw, height: fh }}>
            <Corner pos="tl" color={cornerColor} />
            <Corner pos="tr" color={cornerColor} />
            <Corner pos="bl" color={cornerColor} />
            <Corner pos="br" color={cornerColor} />
            {!tracking ? (
              <Animated.View
                style={{
                  position: 'absolute', left: 14, right: 14, height: 2, borderRadius: 1,
                  backgroundColor: colors.primary,
                  transform: [{ translateY: line.interpolate({ inputRange: [0, 1], outputRange: [10, size - 12] }) }],
                }}
              />
            ) : null}
          </Animated.View>
        </View>
      ) : null}

      {granted ? (
        <View
          style={{
            position: 'absolute', left: 24, right: 24, top: def.y + def.h + 24, alignItems: 'center',
          }}
        >
          <Pressable onLongPress={() => setDebug((d) => !d)} delayLongPress={900}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
              {tracking ? 'Код найден' : 'Наведите камеру на штрихкод или QR-код'}
            </Text>
          </Pressable>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 6, textAlign: 'center' }}>
            {tracking ? 'Не двигайте камеру' : 'Код считывается автоматически'}
          </Text>
          {debug ? (
            <Text style={{ color: '#9AF', fontSize: 12, marginTop: 10, textAlign: 'center' }}>{dbg || 'ждём код…'}</Text>
          ) : null}
        </View>
      ) : null}

      <View
        style={{
          position: 'absolute', top: insets.top + 12, left: 16, right: 16,
          flexDirection: 'row', justifyContent: 'space-between',
        }}
      >
        {granted ? <RoundButton icon={torch ? 'flash' : 'flash-off'} active={torch} onPress={() => setTorch((v) => !v)} /> : <View />}
        <RoundButton icon="close" onPress={onClose} />
      </View>

      {granted ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 28, alignItems: 'center' }}>
          <Pressable
            onPress={() => setZoomIdx((i) => (i + 1) % ZOOMS.length)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10,
              borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)',
            }}
          >
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700' }}>Приближение {zoomIdx + 1}/{ZOOMS.length}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function ScannerModal({ visible, onClose, onScanned }) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        {visible ? <ScannerBody onClose={onClose} onScanned={onScanned} /> : null}
      </SafeAreaProvider>
    </Modal>
  );
}
