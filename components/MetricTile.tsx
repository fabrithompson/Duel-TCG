import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const estilo = [styles.card, { borderColor: colors.line, backgroundColor: colors.sf }];
  const contenido = (
    <>
      <Text style={[styles.value, { color: colors[tone] }, tabularNums(22)]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
      <Text style={[styles.label, { color: colors.dim }]} numberOfLines={2}>
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
      <View style={estilo} accessible accessibilityLabel={`${label}: ${value}`}>
        {contenido}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={estilo}
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

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 11, minHeight: 64 },
  value: { fontFamily: Typography.fontFamily.semibold, fontSize: 22, lineHeight: 26 },
  label: { fontFamily: Typography.fontFamily.semibold, fontSize: 9.5, letterSpacing: 0.95, textTransform: 'uppercase', marginTop: 6, paddingRight: 10 },
  // Señal de que la tarjeta lleva a otra pantalla (si no, nadie descubre que se puede tocar).
  chevron: { position: 'absolute', right: 9, bottom: 8, fontFamily: Typography.fontFamily.semibold, fontSize: 16, lineHeight: 18 },
});
