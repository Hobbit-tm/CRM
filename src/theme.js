import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const palettes = {
  light: {
    bg: '#F5F6FA', card: '#FFFFFF', text: '#1B1D26', sub: '#6B7080',
    primary: '#4F46E5', onPrimary: '#FFFFFF', border: '#E4E6EF',
    danger: '#E5484D', success: '#2FA66A', input: '#EEF0F7',
  },
  dark: {
    bg: '#0F1117', card: '#1A1D27', text: '#F2F3F8', sub: '#9AA0B4',
    primary: '#818CF8', onPrimary: '#0F1117', border: '#2A2E3D',
    danger: '#FF6B6F', success: '#4CC38A', input: '#232736',
  },
};

const KEY = 'theme_mode'; // 'system' | 'light' | 'dark'
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => v && setModeState(v)).catch(() => {});
  }, []);

  const setMode = (m) => {
    setModeState(m);
    AsyncStorage.setItem(KEY, m).catch(() => {});
  };

  const scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const value = useMemo(
    () => ({ mode, setMode, scheme, colors: palettes[scheme], isDark: scheme === 'dark' }),
    [mode, scheme]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
