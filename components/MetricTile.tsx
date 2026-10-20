import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Typography, tabularNums } from '../constants/theme';
import { tocar } from '../lib/haptics';

interface MetricTileProps {
  readonly value: string;
  readonly label: string;
  readonly onPress?: () => void;
  readonly accessibilityHint?: string;
  /** Color de la cifra (por defecto, tinta). */
  readonly tone?: 'ink' | 'dg' | 'gold' | 'br' | 'ok';
}

export default function MetricTile({ value, label, onPress, accessibilityHint, tone = 'ink' }: MetricTileProps) {
  const { colors } = useTheme();
  const [ancho, setAncho] = useState<number | null>(null);
  // Tres tarjetas en un celular de 320 a 360 px no dejan lugar para "$48.900" a 22: la cifra se achica
  // según el ancho de la tarjeta (cada cifra de Space Grotesk ocupa unos 0,62 de su tamaño).
  // adjustsFontSizeToFit solo existe en iOS y Android.
  const tam = ancho === null ? TAM_CIFRA : Math.max(14, Math.min(TAM_CIFRA, (ancho - 22) / (Math.max(value.length, 1) * 0.62)));
  const estilo = [styles.card, { borderColor: colors.line, backgroundColor: colors.sf }];
  const medir = (e: LayoutChangeEvent) => setAncho(Math.round(e.nativeEvent.layout.width));
  const contenido = (
    <>
      <Text
        style={[styles.value, { color: colors[tone], fontSize: tam, lineHeight: Math.round(tam * 1.18) }, tabularNums(tam)]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      <Text style={[styles.label, { color: colors.dim }]} numberOfLines={3}>
        {label}
      </Text>
      {onPress ? (
        <Text style={[styles.chevron, { color: colors.dim }]} importantForAccessibility="no">
          ›
        </Text>
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={estilo} onLayout={medir} accessible accessibilityLabel={`${label}: ${value}`}>
        {contenido}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={estilo}
      onLayout={medir}
      onPress={() => {
        tocar();
        onPress();
      }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={accessibilityHint}
    >
      {contenido}
    </TouchableOpacity>
  );
}

const TAM_CIFRA = 22;

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 11, minHeight: 64 },
  value: { fontFamily: Typography.display.semibold, fontSize: 22, lineHeight: 26 },
  label: { fontFamily: Typography.fontFamily.semibold, fontSize: 10, letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 6, paddingRight: 10 },
  // Señal de que la tarjeta lleva a otra pantalla (si no, nadie descubre que se puede tocar).
  chevron: { position: 'absolute', right: 9, bottom: 8, fontFamily: Typography.fontFamily.semibold, fontSize: 16, lineHeight: 18 },
});
