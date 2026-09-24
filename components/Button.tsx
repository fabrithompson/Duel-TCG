import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Typography } from '../constants/theme';
import { tocar } from '../lib/haptics';

interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** primary: acción principal · secondary: borde · danger: destructiva (borde rojo). */
  readonly variant?: 'primary' | 'secondary' | 'danger';
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly accessibilityHint?: string;
}

export default function Button({ label, onPress, variant = 'primary', loading = false, disabled = false, accessibilityHint }: ButtonProps) {
  const { colors } = useTheme();
  const bloqueado = disabled || loading;

  const fondo = variant === 'primary' ? { backgroundColor: colors.br } : { borderWidth: 1.5, borderColor: variant === 'danger' ? colors.dg : colors.line, backgroundColor: 'transparent' };
  const colorTexto = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? colors.dg : colors.ink;

  return (
    <TouchableOpacity
      style={[styles.base, fondo, bloqueado && styles.disabled]}
      onPress={() => {
        tocar();
        onPress();
      }}
      disabled={bloqueado}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: bloqueado, busy: loading }}
    >
      {loading ? <ActivityIndicator color={colorTexto} /> : <Text style={[styles.text, { color: colorTexto }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  text: { fontFamily: Typography.fontFamily.semibold, fontSize: 15, textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
