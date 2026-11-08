import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Alert } from '../dialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAuth, translateError } from '../auth';
import { Field, Button, useKeyboardOverlap } from '../components';

// mode: 'login' | 'register' | 'reset'
export default function AuthScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, requestReset, confirmReset, confirmSignup, resendSignup } = useAuth();
  const [mode, setMode] = useState('login');
  const [codeSent, setCodeSent] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const rootRef = React.useRef(null);
  const kb = useKeyboardOverlap(rootRef); // поднимаем форму над клавиатурой

  const goMode = (m) => {
    setMode(m);
    setCodeSent(false);
    setCode('');
    setPassword('');
  };

  const submit = async () => {
    if (busy) return;
    const mail = email.trim();
    if (!mail) return Alert.alert('Введите email');

    try {
      if (mode === 'reset') {
        if (!codeSent) {
          setBusy(true);
          await requestReset(mail);
          setCodeSent(true);
          Alert.alert('Код отправлен', 'Проверьте почту (и папку «Спам»). Введите код из письма и новый пароль.');
        } else {
          if (!code.trim()) return Alert.alert('Введите код из письма');
          if (password.length < 6) return Alert.alert('Пароль должен быть не короче 6 символов');
          setBusy(true);
          await confirmReset(mail, code.trim(), password); // после успеха вход выполняется автоматически
        }
        return;
      }

      if (mode === 'register' && codeSent) {
        if (!code.trim()) return Alert.alert('Введите код из письма');
        setBusy(true);
        await confirmSignup(mail, code.trim()); // после успеха вход выполняется автоматически
        return;
      }
      if (!password) return Alert.alert('Введите пароль');
      if (mode === 'register' && !name.trim()) return Alert.alert('Введите ваше имя');
      setBusy(true);
      if (mode === 'register') {
        const d = await signUp(mail, password, name.trim());
        if (!d.session) {
          setCodeSent(true);
          Alert.alert('Код отправлен', 'Мы отправили код на вашу почту (проверьте и «Спам»). Введите его, чтобы подтвердить адрес.');
        }
      } else {
        await signIn(mail, password);
      }
    } catch (e) {
      Alert.alert('Ошибка', translateError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const subtitle =
    mode === 'register' ? (codeSent ? 'Подтвердите почту' : 'Создайте аккаунт') : mode === 'reset' ? 'Восстановление пароля' : 'Войдите, чтобы продолжить';
  const buttonTitle = busy
    ? 'Подождите…'
    : mode === 'register'
    ? codeSent ? 'Подтвердить' : 'Зарегистрироваться'
    : mode === 'reset'
    ? codeSent ? 'Сменить пароль' : 'Отправить код'
    : 'Войти';

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: kb }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1, justifyContent: 'center', padding: 24,
          paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View
            style={{
              width: 84, height: 84, borderRadius: 26, backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}
          >
            <Ionicons name="cube" size={44} color={colors.onPrimary} />
          </View>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>Автосклад</Text>
          <Text style={{ color: colors.sub, marginTop: 6 }}>{subtitle}</Text>
        </View>

        {mode === 'register' && !codeSent ? <Field label="Имя" value={name} onChangeText={setName} placeholder="Как вас зовут" /> : null}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="name@company.com"
          editable={!codeSent}
        />

        {codeSent && mode !== 'login' ? (
          <Field
            label="Код из письма"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoCapitalize="none"
            placeholder="Например, 123456"
          />
        ) : null}

        {(mode === 'login' || (mode === 'register' && !codeSent) || (mode === 'reset' && codeSent)) ? (
          <Field
            label={mode === 'reset' ? 'Новый пароль' : 'Пароль'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Не короче 6 символов"
          />
        ) : null}

        <Button title={buttonTitle} onPress={submit} />

        {mode === 'login' ? (
          <Pressable onPress={() => goMode('reset')} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.sub }}>Забыли пароль?</Text>
          </Pressable>
        ) : null}

        {mode === 'reset' && codeSent ? (
          <Pressable onPress={() => setCodeSent(false)} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.sub }}>Отправить код ещё раз</Text>
          </Pressable>
        ) : null}

        {mode === 'register' && codeSent ? (
          <Pressable
            onPress={async () => {
              try {
                await resendSignup(email.trim());
                Alert.alert('Готово', 'Код отправлен ещё раз.');
              } catch (e) {
                Alert.alert('Ошибка', translateError(e.message));
              }
            }}
            style={{ marginTop: 16, alignItems: 'center' }}
          >
            <Text style={{ color: colors.sub }}>Отправить код ещё раз</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => goMode(mode === 'login' ? 'register' : 'login')}
          style={{ marginTop: 18, alignItems: 'center' }}
        >
          <Text style={{ color: colors.primary, fontWeight: '600' }}>
            {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Назад ко входу'}
          </Text>
        </Pressable>

        {mode === 'register' ? (
          <Text style={{ color: colors.sub, fontSize: 12, textAlign: 'center', marginTop: 16 }}>
            После регистрации администратор должен подтвердить доступ и назначить вашу роль.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
