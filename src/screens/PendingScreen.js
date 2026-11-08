import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAuth } from '../auth';
import { Button } from '../components';

export default function PendingScreen() {
  const { colors } = useTheme();
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      await refreshProfile();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <Ionicons name="hourglass-outline" size={64} color={colors.primary} />
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 16, textAlign: 'center' }}>
        Ожидайте подтверждения
      </Text>
      <Text style={{ color: colors.sub, textAlign: 'center', marginTop: 10, marginBottom: 26 }}>
        {profile
          ? 'Аккаунт создан. Администратор должен подтвердить доступ и назначить вам роль.'
          : 'Профиль не найден. Выйдите и зарегистрируйтесь заново или обратитесь к администратору.'}
        {'\n\n'}
        {session?.user?.email}
      </Text>
      <Button title={busy ? 'Проверяю…' : 'Проверить доступ'} icon="refresh" onPress={check} style={{ alignSelf: 'stretch' }} />
      <Button title="Выйти" variant="soft" icon="log-out-outline" onPress={signOut} style={{ alignSelf: 'stretch', marginTop: 10 }} />
    </View>
  );
}
