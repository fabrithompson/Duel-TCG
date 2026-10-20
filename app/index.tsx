import { useEffect, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../config/firebase';
import { useTheme } from '../contexts/ThemeContext';
import { useConfig } from '../contexts/ConfigContext';
import Button from '../components/Button';
import { LoadingScreen } from '../components/Screen';

const LOGO_DUEL = require('../assets/brand/duel-logo.png');

export default function Splash() {
  const router = useRouter();
  const { colors } = useTheme();
  const { config } = useConfig();
  const [estado, setEstado] = useState<'cargando' | 'adentro' | 'afuera'>('cargando');
  // Sin señal o con el archivo borrado, el logo propio no carga: la pantalla no puede quedar vacía.
  const [urlFallida, setUrlFallida] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setEstado(user ? 'adentro' : 'afuera'));
    return unsub;
  }, []);

  if (estado === 'cargando') return <LoadingScreen />;
  if (estado === 'adentro') return <Redirect href="/(tabs)" />;

  const propio = config.logoUrl && config.logoUrl !== urlFallida ? config.logoUrl : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <Image
          source={propio ? { uri: propio } : LOGO_DUEL}
          style={propio ? styles.logoCustom : styles.logo}
          onError={() => {
            if (propio) setUrlFallida(propio);
          }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessibilityLabel={`Logo de ${config.nombreLocal}`}
        />
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
  logo: { width: 240, height: 245, maxWidth: '80%', maxHeight: '70%' },
  logoCustom: { width: 200, height: 200, borderRadius: 30 },
  actions: { gap: 10 },
});
