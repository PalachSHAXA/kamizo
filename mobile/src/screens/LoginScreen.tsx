import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { Input } from '../components/Input';
import { Button } from '../components/Button';

export const LoginScreen = () => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const { login: loginUser, isLoading, error } = useAuthStore();

  const handleLogin = async () => {
    if (!login || !password) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }

    try {
      await loginUser(login, password);
    } catch (err) {
      Alert.alert('Ошибка', 'Неверный логин или пароль');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>🏢</Text>
          </View>
          <Text style={styles.title}>UK CRM</Text>
          <Text style={styles.subtitle}>Система управления жилым комплексом</Text>
        </View>

        <View style={styles.formContainer}>
          <Input
            label="Логин"
            value={login}
            onChangeText={setLogin}
            placeholder="Введите логин"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Пароль"
            value={password}
            onChangeText={setPassword}
            placeholder="Введите пароль"
            secureTextEntry
            autoCapitalize="none"
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Button
            title="Войти"
            onPress={handleLogin}
            loading={isLoading}
            style={styles.button}
          />
        </View>

        <Text style={styles.footer}>
          Версия 1.0.0 | © 2024 UK CRM
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  formContainer: {
    marginBottom: 24,
  },
  button: {
    marginTop: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 12,
  },
});
