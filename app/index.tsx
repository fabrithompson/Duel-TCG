import { useEffect, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../config/firebase';
import { useTheme } from '../contexts/ThemeContext';
import { useConfig } from '../contexts/ConfigContext';
import { Typography } from '../constants/theme';
import Button from '../components/Button';
import { LoadingScreen } from '../components/Screen';

const LOGO_DAY = require('../assets/brand/duel-logo.png');
const LOGO_NIGHT = require('../assets/brand/duel-logo-dark.png');

export default function Splash() {
  const router = useRouter();
  const { colors, mode } = useTheme();
  const { config } = useConfig();
  const [estado, setEstado] = useState<'cargando' | 'adentro' | 'afuera'>('cargando');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setEstado(user ? 'adentro' : 'afuera'));
    return unsub;
  }, []);

  if (estado === 'cargando') return <LoadingScreen />;
  if (estado === 'adentro') return <Redirect href="/(tabs)" />;

  const logo = config.logoUrl ? { uri: config.logoUrl } : mode === 'night' ? LOGO_NIGHT : LOGO_DAY;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <Image
          source={logo}
          style={config.logoUrl ? styles.logoCustom : styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessibilityLabel={`Logo de ${config.nombreLocal}`}
        />
        <Text style={[styles.localName, { color: colors.dim }]}>{config.nombreLocal}</Text>
      </View>
      <View style={styles.actions}>
        <Button label="Iniciar sesión" onPress={() => router.push('/(auth)/login')} />
        <Button label="Crear cuenta" variant="secondary" onPress={() => router.push('/(auth)/register')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 26, paddingBottom: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 186, height: 323, maxHeight: '70%' },
  logoCustom: { width: 200, height: 200, borderRadius: 30 },
  localName: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, letterSpacing: 0.5, marginTop: 14, textAlign: 'center' },
  actions: { gap: 10 },
});
