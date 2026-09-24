import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { Typography } from '../constants/theme';
import { tocar } from '../lib/haptics';

interface PendingCardProps {
  readonly titulo: string;
  readonly subtitulo: string;
  /** dg = urgente · gold = torneo · br = operación del café. */
  readonly color: 'dg' | 'gold' | 'br';
  readonly onPress?: () => void;
  readonly accessibilityHint?: string;
}

export default function PendingCard({ titulo, subtitulo, color, onPress, accessibilityHint }: PendingCardProps) {
  const { colors } = useTheme();

  const contenido = (
    <>
      <View style={[styles.dot, { backgroundColor: colors[color] }]} />
      <View style={styles.texts}>
        <Text style={[styles.title, { color: colors.ink }]} numberOfLines={2}>
          {titulo}
        </Text>
        {subtitulo ? (
          <Text style={[styles.subtitle, { color: colors.dim }]} numberOfLines={2}>
            {subtitulo}
          </Text>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.dim} /> : null}
    </>
  );

  const estilo = [styles.card, { borderColor: colors.line, backgroundColor: colors.sf }];

  if (!onPress) {
    return (
      <View style={estilo} accessible accessibilityLabel={`${titulo}. ${subtitulo}`}>
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
      accessibilityLabel={`${titulo}. ${subtitulo}`}
      accessibilityHint={accessibilityHint}
    >
      {contenido}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 15, minHeight: 56 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  texts: { flex: 1 },
  title: { fontFamily: Typography.fontFamily.semibold, fontSize: 13.5, lineHeight: 18 },
  subtitle: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, marginTop: 2, lineHeight: 16 },
});
