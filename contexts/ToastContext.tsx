import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import { Typography } from '../constants/theme';
import { exito, fallo } from '../lib/haptics';
import { MargenToastProvider, useMargenToast } from './MargenToastContext';

export type TonoToast = 'ok' | 'error' | 'info';

interface ToastState {
  id: number;
  mensaje: string;
  tono: TonoToast;
}

interface ToastContextValue {
  mostrar: (mensaje: string, tono?: TonoToast) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURACION_MS = 2600;
// Un error se lee con más calma: suele decir qué hacer.
const DURACION_ERROR_MS = 4200;

/** Avisos no bloqueantes (reemplazan a los Alert de "listo, guardado"). */
export function ToastProvider({ children }: { readonly children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const contador = useRef(0);

  const mostrar = useCallback((mensaje: string, tono: TonoToast = 'ok') => {
    contador.current += 1;
    setToast({ id: contador.current, mensaje, tono });
    if (tono === 'ok') exito();
    if (tono === 'error') fallo();
    // En iOS accessibilityLiveRegion no existe: sin esto VoiceOver no lee los avisos.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(mensaje);
  }, []);

  const value = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <ToastContext.Provider value={value}>
      <MargenToastProvider>
        {children}
        {toast && <ToastView key={toast.id} toast={toast} onFin={() => setToast(null)} />}
      </MargenToastProvider>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onFin }: { readonly toast: ToastState; readonly onFin: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // El margen se toma al aparecer el aviso: si la pantalla se va mientras se ve, no salta.
  const margenActual = useMargenToast();
  const [margenFooter] = useState(margenActual);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(toast.tono === 'error' ? DURACION_ERROR_MS : DURACION_MS),
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onFin();
    });
  }, [anim, onFin, toast.tono]);

  const acento = toast.tono === 'error' ? colors.dg : toast.tono === 'ok' ? colors.ok : colors.br;

  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 72 + margenFooter }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.toast,
          {
            backgroundColor: colors.ink,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: acento }]} />
        <Text style={[styles.texto, { color: colors.bg }]}>{toast.mensaje}</Text>
      </Animated.View>
    </View>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>.');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13, paddingVertical: 12, paddingHorizontal: 16, maxWidth: 480 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  texto: { fontFamily: Typography.fontFamily.semibold, fontSize: 13, flexShrink: 1 },
});
