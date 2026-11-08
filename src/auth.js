import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { readCache, writeCache, clearCache } from './cache';

export const roleLabels = {
  admin: 'Администратор',
  storekeeper: 'Кладовщик',
  viewer: 'Только просмотр',
  pending: 'Ожидает подтверждения',
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  // undefined = ещё грузится, null = профиля нет
  const [profile, setProfile] = useState(undefined);
  const [loading, setLoading] = useState(true);

  const [profileError, setProfileError] = useState(false);

  const loadProfile = useCallback(async (uid) => {
    // Если сервер молчит дольше 10 секунд, считаем это ошибкой связи, а не ждём вечно
    let res;
    try {
      res = await Promise.race([
        supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
        new Promise((resolve) => setTimeout(() => resolve({ error: new Error('timeout') }), 10000)),
      ]);
    } catch (e) {
      res = { error: e };
    }
    const { data, error } = res;
    if (error) {
      setProfileError(true); // нет связи: остаёмся с тем, что уже есть
      return;
    }
    setProfileError(false);
    writeCache('profile:' + uid, data || null);
    // не обновляем состояние, если ничего не изменилось
    setProfile((prev) => (JSON.stringify(prev) === JSON.stringify(data || null) ? prev : data || null));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const uid0 = data.session.user.id;
        // Профиль из кэша: приложение открывается сразу, свежий профиль подтянется в фоне.
        // Права всё равно проверяет база, так что устаревшая роль ничего не открывает.
        const cached = await readCache('profile:' + uid0);
        if (cached) {
          setProfile(cached);
          loadProfile(uid0);
        } else {
          await loadProfile(uid0);
        }
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        setProfile((p) => p ?? undefined);
        // нельзя вызывать запросы прямо внутри колбэка — откладываем
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(undefined);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Администратор мог сменить роль — подхватываем без перезахода
  const uid = session?.user?.id;
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel('profile-' + uid)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
        () => loadProfile(uid)
      )
      .subscribe();
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') loadProfile(uid);
    });
    const timer = setInterval(() => loadProfile(uid), 30000); // запасной вариант
    return () => {
      supabase.removeChannel(channel);
      appSub.remove();
      clearInterval(timer);
    };
  }, [uid, loadProfile]);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signUp = async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw new Error(error.message);
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearCache();
  };

  // Сброс пароля по коду из письма (без ссылок, поэтому работает в приложении)
  const requestReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw new Error(error.message);
  };

  const confirmReset = async (email, code, password) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
    if (error) throw new Error(error.message);
    const { error: e2 } = await supabase.auth.updateUser({ password });
    if (e2) throw new Error(e2.message);
  };

  // Подтверждение регистрации кодом из письма (после успеха вход выполняется автоматически)
  const confirmSignup = async (email, code) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' });
    if (error) throw new Error(error.message);
  };

  const resendSignup = async (email) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw new Error(error.message);
  };

  const changePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  };
  const refreshProfile = () => (session ? loadProfile(session.user.id) : null);

  const role = profile?.role;
  const value = useMemo(
    () => ({
      session, profile, loading, role, profileError,
      canEdit: role === 'admin' || role === 'storekeeper',
      isAdmin: role === 'admin',
      signIn, signUp, signOut, refreshProfile, requestReset, confirmReset, changePassword, confirmSignup, resendSignup,
    }),
    [session, profile, loading, role, profileError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function translateError(msg = '') {
  if (/invalid login credentials/i.test(msg)) return 'Неверный email или пароль';
  if (/already registered/i.test(msg)) return 'Этот email уже зарегистрирован';
  if (/at least 6/i.test(msg)) return 'Пароль должен быть не короче 6 символов';
  if (/invalid email|unable to validate email/i.test(msg)) return 'Проверьте адрес почты';
  if (/email not confirmed/i.test(msg)) return 'Подтвердите почту по ссылке из письма';
  if (/rate limit|security purposes/i.test(msg)) return 'Слишком много попыток, попробуйте через минуту';
  if (/expired|invalid/i.test(msg) && /token|otp|code/i.test(msg)) return 'Код неверный или просрочен';
  if (/different from the old/i.test(msg)) return 'Новый пароль должен отличаться от старого';
  if (/network request failed/i.test(msg)) return 'Нет соединения с сервером';
  return msg;
}
