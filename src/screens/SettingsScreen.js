import React, { useCallback, useState } from 'react';
import { exportProducts, exportMovements, exportFullBackup } from '../export';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Alert } from '../dialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAuth, roleLabels, translateError } from '../auth';
import { Card, Segmented, Button, Sheet, Field } from '../components';
import { getProfiles, setRole } from '../db';

const ROLE_ORDER = ['viewer', 'storekeeper', 'admin', 'pending'];

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { profile, session, isAdmin, signOut, changePassword } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [exporting, setExporting] = useState('');

  const runExport = async (kind, fn) => {
    if (exporting) return;
    setExporting(kind);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Не удалось выгрузить', e.message);
    } finally {
      setExporting('');
    }
  };

  const savePassword = async () => {
    if (pw1.length < 6) return Alert.alert('Пароль должен быть не короче 6 символов');
    if (pw1 !== pw2) return Alert.alert('Пароли не совпадают');
    setPwBusy(true);
    try {
      await changePassword(pw1);
      setPwOpen(false);
      setPw1('');
      setPw2('');
      Alert.alert('Готово', 'Пароль изменён');
    } catch (e) {
      Alert.alert('Ошибка', translateError(e.message));
    } finally {
      setPwBusy(false);
    }
  };
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState([]);
  const [picked, setPicked] = useState(null);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setUsers(await getProfiles());
    } catch (e) {
      Alert.alert('Ошибка', e.message);
    }
  }, [isAdmin]);

  useFocusEffect(useCallback(() => { loadUsers(); }, [loadUsers]));

  const choose = async (role) => {
    try {
      await setRole(picked.id, role);
      setPicked(null);
      loadUsers();
    } catch (e) {
      Alert.alert('Ошибка', e.message);
    }
  };

  const openUser = (u) => {
    if (u.id === session?.user?.id) return Alert.alert('Свою роль менять нельзя');
    setPicked(u);
  };

  const pendingCount = users.filter((u) => u.role === 'pending').length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', marginBottom: 14 }}>Настройки</Text>

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {profile?.full_name || 'Без имени'}
          </Text>
          <Text style={{ color: colors.sub, marginTop: 2 }}>{profile?.email || session?.user?.email}</Text>
          <Text style={{ color: colors.primary, fontWeight: '600', marginTop: 6 }}>
            {roleLabels[profile?.role] || ''}
          </Text>
          <Button title="Сменить пароль" variant="soft" icon="key-outline" onPress={() => setPwOpen(true)} style={{ marginTop: 14 }} />
          <Button title="Выйти" variant="soft" icon="log-out-outline" onPress={signOut} style={{ marginTop: 10 }} />
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>Тема оформления</Text>
          <Text style={{ color: colors.sub, fontSize: 13, marginBottom: 14 }}>
            Меняется мгновенно и запоминается. «Системная» следует теме телефона.
          </Text>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'system', label: 'Системная' },
              { value: 'light', label: 'Светлая' },
              { value: 'dark', label: 'Тёмная' },
            ]}
          />
        </Card>

        {isAdmin ? (
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
              Выгрузка и резервная копия
            </Text>
            <Text style={{ color: colors.sub, fontSize: 13, marginBottom: 12 }}>
              Файл можно отправить на почту, в мессенджер или сохранить в «Файлы». Таблицы открываются в Excel.
              Полную копию храните в надёжном месте: в ней все цены.
            </Text>
            <Button
              title={exporting === 'p' ? 'Готовлю…' : 'Товары в Excel'}
              variant="soft"
              icon="download-outline"
              onPress={() => runExport('p', exportProducts)}
            />
            <Button
              title={exporting === 'm' ? 'Готовлю…' : 'История в Excel'}
              variant="soft"
              icon="download-outline"
              onPress={() => runExport('m', exportMovements)}
              style={{ marginTop: 10 }}
            />
            <Button
              title={exporting === 'f' ? 'Готовлю…' : 'Полная копия (резерв)'}
              icon="shield-checkmark-outline"
              onPress={() => runExport('f', exportFullBackup)}
              style={{ marginTop: 10 }}
            />
          </Card>
        ) : null}

        {isAdmin ? (
          <Card>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 }}>Пользователи</Text>
            <Text style={{ color: pendingCount ? colors.danger : colors.sub, fontSize: 13, marginBottom: 10 }}>
              {pendingCount ? `Ожидают подтверждения: ${pendingCount}` : 'Нажмите на пользователя, чтобы изменить роль'}
            </Text>
            {users.map((u) => (
              <Pressable
                key={u.id}
                onPress={() => openUser(u)}
                style={{
                  flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                  borderTopWidth: 1, borderTopColor: colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                    {u.full_name || u.email}
                  </Text>
                  <Text style={{ color: colors.sub, fontSize: 12 }} numberOfLines={1}>{u.email}</Text>
                </View>
                <Text style={{ color: u.role === 'pending' ? colors.danger : colors.primary, fontSize: 13, fontWeight: '600' }}>
                  {roleLabels[u.role]}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.sub} style={{ marginLeft: 6 }} />
              </Pressable>
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <Sheet visible={!!picked} onClose={() => setPicked(null)} title={picked?.full_name || picked?.email || ''}>
        <Text style={{ color: colors.sub, marginBottom: 14 }}>Выберите роль пользователя</Text>
        {ROLE_ORDER.map((r) => (
          <Button
            key={r}
            title={roleLabels[r]}
            variant={picked?.role === r ? 'primary' : 'soft'}
            onPress={() => choose(r)}
            style={{ marginBottom: 10 }}
          />
        ))}
        <Text style={{ color: colors.sub, fontSize: 12, marginTop: 4 }}>
          Кладовщик: товары, приход и расход. Просмотр: только чтение. Администратор: всё, включая удаление и пользователей.
        </Text>
      </Sheet>

      <Sheet visible={pwOpen} onClose={() => setPwOpen(false)} title="Смена пароля">
        <Field label="Новый пароль" value={pw1} onChangeText={setPw1} secureTextEntry autoCapitalize="none" placeholder="Не короче 6 символов" />
        <Field label="Повторите пароль" value={pw2} onChangeText={setPw2} secureTextEntry autoCapitalize="none" />
        <Button title={pwBusy ? 'Сохраняю…' : 'Сохранить пароль'} icon="checkmark" onPress={savePassword} />
      </Sheet>
    </View>
  );
}
