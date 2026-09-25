import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  RefreshControlProps,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useFooterParaToast } from '../contexts/MargenToastContext';
import { useEnFoco } from '../hooks/useEnFoco';
import { Typography } from '../constants/theme';

interface ScreenProps {
  readonly children?: React.ReactNode;
  /** Texto del link de volver ("← Salón"). Si falta, no hay link. */
  readonly back?: string;
  readonly onBack?: () => void;
  readonly eyebrow?: string;
  readonly eyebrowTone?: 'dim' | 'gold' | 'br';
  readonly title?: string;
  readonly subtitle?: string;
  readonly subtitleTone?: 'dim' | 'dg' | 'gold' | 'br';
  /** Línea de 1px bajo el header (Mi duelo, Historial, Clasificación, Depósito en el diseño). */
  readonly divider?: boolean;
  /** Elemento a la derecha del título (avatar, contador): siempre queda a la derecha. */
  readonly right?: React.ReactNode;
  /**
   * Botones del encabezado ("Modo TV", "Premios", "‹ Anterior"). A la derecha si hay lugar; en
   * pantallas angostas bajan a su propia fila para no cortar el título ni el eyebrow.
   */
  readonly acciones?: React.ReactNode;
  /** false = el contenido maneja su propio scroll (FlatList, lienzo). */
  readonly scroll?: boolean;
  readonly keyboard?: boolean;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Contenido fijo debajo del scroll (barra de acciones). */
  readonly footer?: React.ReactNode;
  /** Para mover el scroll desde la pantalla (por ejemplo, "Ver cuenta" en Pedido). */
  readonly scrollRef?: React.Ref<ScrollView>;
}

// Con menos ancho que esto, los botones del encabezado se comen el título (360 dp: quedaban ~150 dp de texto).
const ANCHO_ACCIONES_AL_LADO = 400;

/** Contenedor base de pantalla: safe area, fondo, header del sistema de diseño y scroll. */
export default function Screen({
  children,
  back,
  onBack,
  eyebrow,
  eyebrowTone = 'dim',
  title,
  subtitle,
  subtitleTone = 'dim',
  divider = false,
  right,
  acciones,
  scroll = true,
  keyboard = false,
  contentStyle,
  refreshControl,
  footer,
  scrollRef,
}: ScreenProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const [altoFooter, setAltoFooter] = useState<number | null>(null);
  const enFoco = useEnFoco();
  // Solo la pantalla visible corre el aviso hacia arriba (las de atrás siguen montadas).
  useFooterParaToast(footer && enFoco ? altoFooter : null);
  const { width } = useWindowDimensions();
  const accionesAbajo = !!acciones && width < ANCHO_ACCIONES_AL_LADO;

  const pie = footer ? <View onLayout={(e) => setAltoFooter(Math.round(e.nativeEvent.layout.height))}>{footer}</View> : null;

  const header = (back || title || eyebrow) && (
    <View style={[styles.headerWrap, divider && [styles.headerDivider, { borderBottomColor: colors.line }]]}>
      {back && (
        <TouchableOpacity
          onPress={onBack ?? (() => router.back())}
          style={styles.back}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={back === 'Volver' ? 'Volver' : `Volver a ${back}`}
        >
          <Text style={[styles.backText, { color: colors.dim }]}>← {back}</Text>
        </TouchableOpacity>
      )}
      {(title || eyebrow) && (
        <View style={styles.headerRow}>
          <View style={styles.headerTexts}>
            {eyebrow ? (
              <Text style={[styles.eyebrow, { color: colors[eyebrowTone] }]} numberOfLines={1}>
                {eyebrow.toUpperCase()}
              </Text>
            ) : null}
            {title ? (
              <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header" numberOfLines={2}>
                {title}
              </Text>
            ) : null}
            {subtitle ? <Text style={[styles.subtitle, { color: colors[subtitleTone] }]}>{subtitle}</Text> : null}
          </View>
          {right ? <View style={styles.right}>{right}</View> : null}
          {acciones && !accionesAbajo ? <View style={styles.acciones}>{acciones}</View> : null}
        </View>
      )}
      {acciones && accionesAbajo ? <View style={styles.accionesAbajo}>{acciones}</View> : null}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.scroll, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {header}
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentStyle]}>
      {header ? <View style={styles.fixedHeader}>{header}</View> : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg }]} edges={['top']}>
      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {body}
          {pie}
        </KeyboardAvoidingView>
      ) : (
        <>
          {body}
          {pie}
        </>
      )}
    </SafeAreaView>
  );
}

export function LoadingScreen() {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.flex, styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
      <ActivityIndicator size="large" color={colors.br} accessibilityLabel="Cargando" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  fixedHeader: { paddingHorizontal: 20, paddingTop: 12 },
  headerWrap: { marginBottom: 18 },
  headerDivider: { borderBottomWidth: 1, paddingBottom: 14 },
  back: { alignSelf: 'flex-start', marginBottom: 10, minHeight: 24, justifyContent: 'center' },
  backText: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerTexts: { flex: 1 },
  eyebrow: { fontFamily: Typography.fontFamily.bold, fontSize: 10, letterSpacing: 1.6, marginBottom: 4 },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: 25, letterSpacing: -0.75 },
  subtitle: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  right: { paddingTop: 2 },
  acciones: { paddingTop: 2, flexDirection: 'row', gap: 6 },
  accionesAbajo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
});
