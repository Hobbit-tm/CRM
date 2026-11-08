import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './src/components';
import OfflineBanner from './src/OfflineBanner';

import { ThemeProvider, useTheme } from './src/theme';
import { AuthProvider, useAuth } from './src/auth';
import { DialogProvider } from './src/dialog';
import AuthScreen from './src/screens/AuthScreen';
import PendingScreen from './src/screens/PendingScreen';
import ProductsScreen from './src/screens/ProductsScreen';
import MovementsScreen from './src/screens/MovementsScreen';
import ReportScreen from './src/screens/ReportScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const icons = {
  Склад: 'cube-outline',
  История: 'time-outline',
  Продажи: 'stats-chart-outline',
  Настройки: 'settings-outline',
};

function Tabs() {
  const { colors, isDark } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        tabBar={(props) => (
          <View>
            <OfflineBanner />
            <BottomTabBar {...props} />
          </View>
        )}
        screenOptions={({ route }) => ({
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.sub,
          tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
          tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name]} size={size} color={color} />,
        })}
      >
        <Tab.Screen name="Склад" component={ProductsScreen} />
        <Tab.Screen name="История" component={MovementsScreen} />
        <Tab.Screen name="Продажи" component={ReportScreen} />
        <Tab.Screen name="Настройки" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function Gate() {
  const { colors } = useTheme();
  const { session, profile, loading, profileError, refreshProfile, signOut } = useAuth();

  // Профиль не загрузился (нет связи): показываем понятное сообщение, а не бесконечное колесо
  if (!loading && session && profile === undefined && profileError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <Ionicons name="cloud-offline-outline" size={56} color={colors.sub} />
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 14 }}>Нет связи с сервером</Text>
        <Text style={{ color: colors.sub, textAlign: 'center', marginTop: 8, marginBottom: 20 }}>
          Проверьте интернет и повторите попытку.
        </Text>
        <Button title="Повторить" icon="refresh-outline" onPress={refreshProfile} style={{ alignSelf: 'stretch' }} />
        <Button title="Выйти" variant="soft" icon="log-out-outline" onPress={signOut} style={{ alignSelf: 'stretch', marginTop: 10 }} />
      </View>
    );
  }

  if (loading || (session && profile === undefined)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!session) return <AuthScreen />;
  if (!profile || profile.role === 'pending') return <PendingScreen />;
  return <Tabs />;
}

function Root() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Gate />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <DialogProvider>
          <AuthProvider>
            <Root />
          </AuthProvider>
        </DialogProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
