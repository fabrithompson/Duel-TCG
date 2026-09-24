import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { useUserProfileContext } from '../../contexts/UserProfileContext';
import { Typography } from '../../constants/theme';
import { ROLE_LABEL, Role } from '../../constants/roles';
import { LoadingScreen } from '../../components/Screen';
import { ErrorBanner } from '../../components/ui';
import Button from '../../components/Button';
import { mensajeError } from '../../lib/errores';
import type { UserProfile } from '../../lib/users';

type NombreIcono = React.ComponentProps<typeof Ionicons>['name'];

function motivoSinAcceso(profile: UserProfile | null): string | null {
  if (!profile) return 'No encontramos tu perfil. Si creés que es un error, hablá con el admin.';
  if (profile.estadoAprobacion === 'rechazado') return 'El admin quitó el acceso a tu cuenta.';
  if (profile.estadoAprobacion !== 'aprobado') return 'Tu cuenta todavía espera la aprobación del admin.';
  return null;
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { mostrar } = useToast();
  const router = useRouter();
  const { user, profile, loading, error, reintentar } = useUserProfileContext();
  const cerrando = useRef(false);
  const rolVisto = useRef<{ uid: string; role: Role } | null>(null);

  const motivo = !loading && user && !error ? motivoSinAcceso(profile) : null;

  // Si el admin quita el acceso (o borra el perfil) con la app abierta, la sesión no puede seguir viva.
  useEffect(() => {
    if (!motivo || cerrando.current) return;
    cerrando.current = true;
    mostrar(motivo, 'error');
    signOut(auth)
      .catch((e: unknown) => mostrar(mensajeError(e, 'No se pudo cerrar la sesión.'), 'error'))
      .finally(() => {
        cerrando.current = false;
      });
  }, [motivo, mostrar]);

  // Si el admin cambia el rol con la app abierta, la pestaña actual puede quedar fuera del nuevo esquema.
  const rolVigente = profile && !motivo ? profile.role : null;
  useEffect(() => {
    if (!user || !rolVigente) return;
    const previo = rolVisto.current;
    rolVisto.current = { uid: user.uid, role: rolVigente };
    if (previo && previo.uid === user.uid && previo.role !== rolVigente) {
      mostrar(`Tu perfil ahora es ${ROLE_LABEL[rolVigente]}.`, 'info');
      router.replace('/(tabs)');
    }
  }, [user, rolVigente, mostrar, router]);

  if (loading) return <LoadingScreen />;
  if (!user) return <Redirect href="/(auth)/login" />;

  const cerrarSesion = () => {
    signOut(auth).catch((e: unknown) => mostrar(mensajeError(e, 'No se pudo cerrar la sesión.'), 'error'));
  };

  if (error && !profile) {
    return (
      <View style={[styles.aviso, { backgroundColor: colors.bg }]}>
        <Text style={[styles.avisoTitulo, { color: colors.ink }]} accessibilityRole="header">
          No pudimos cargar tu perfil
        </Text>
        <ErrorBanner mensaje={mensajeError(error, 'Revisá la conexión y probá de nuevo.')} onRetry={reintentar} />
        <Button label="Cerrar sesión" variant="secondary" onPress={cerrarSesion} />
      </View>
    );
  }

  if (motivo) {
    return (
      <View style={[styles.aviso, { backgroundColor: colors.bg }]}>
        <Text style={[styles.avisoTitulo, { color: colors.ink }]} accessibilityRole="header">
          Sin acceso
        </Text>
        <Text style={[styles.avisoTexto, { color: colors.dim }]}>{motivo}</Text>
        <Button label="Volver al inicio" variant="secondary" onPress={cerrarSesion} />
      </View>
    );
  }

  if (!profile) return <LoadingScreen />;

  return <RoleTabs role={profile.role} />;
}

function icono(normal: NombreIcono, activo: NombreIcono) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <Ionicons name={focused ? activo : normal} size={size} color={color} />
  );
}

function RoleTabs({ role }: { readonly role: Role }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const esAdmin = role === 'admin';
  const esMozo = role === 'mozo';
  const esJuez = role === 'juez';
  const esJugador = role === 'jugador';
  const visibleSi = (condicion: boolean) => (condicion ? undefined : null);

  return (
    <Tabs
      initialRouteName={esJugador ? 'duelo' : 'hoy'}
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.br,
        tabBarInactiveTintColor: colors.dim,
        tabBarStyle: {
          backgroundColor: colors.sf,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 58 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: { minHeight: 44 },
        tabBarIconStyle: { marginBottom: 1 },
        tabBarLabelStyle: { fontFamily: Typography.fontFamily.semibold, fontSize: 10.5 },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />

      <Tabs.Screen
        name="hoy"
        options={{ href: visibleSi(!esJugador), title: 'Hoy', tabBarIcon: icono('home-outline', 'home') }}
      />
      <Tabs.Screen
        name="salon"
        options={{ href: visibleSi(esAdmin || esMozo), title: 'Salón', tabBarIcon: icono('grid-outline', 'grid') }}
      />
      <Tabs.Screen
        name="torneo"
        options={{ href: visibleSi(esAdmin || esJuez), title: 'Torneo', tabBarIcon: icono('diamond-outline', 'diamond') }}
      />
      <Tabs.Screen
        name="premios"
        options={{ href: visibleSi(esJuez), title: 'Premios', tabBarIcon: icono('trophy-outline', 'trophy') }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          href: visibleSi(!esJugador),
          title: esJuez ? 'Stock TCG' : 'Stock',
          tabBarIcon: icono('cube-outline', 'cube'),
        }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{ href: visibleSi(esAdmin), title: 'Ajustes', tabBarIcon: icono('settings-outline', 'settings') }}
      />
      <Tabs.Screen
        name="duelo"
        options={{ href: visibleSi(esJugador), title: 'Mi duelo', tabBarIcon: icono('flash-outline', 'flash') }}
      />
      <Tabs.Screen
        name="historial"
        options={{ href: visibleSi(esJugador), title: 'Historial', tabBarIcon: icono('time-outline', 'time') }}
      />
      <Tabs.Screen
        name="tabla"
        options={{ href: visibleSi(esJugador), title: 'Tabla', tabBarIcon: icono('podium-outline', 'podium') }}
      />
      <Tabs.Screen name="caja" options={{ href: null, title: 'Caja' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  aviso: { flex: 1, justifyContent: 'center', paddingHorizontal: 26, gap: 12 },
  avisoTitulo: { fontFamily: Typography.fontFamily.bold, fontSize: 22, letterSpacing: -0.6, marginBottom: 4 },
  avisoTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 13.5, lineHeight: 20, marginBottom: 8 },
});
