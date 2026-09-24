import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Typography } from '../constants/theme';
import { tocar } from '../lib/haptics';

interface ChipProps {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly onLongPress?: () => void;
  readonly tone?: 'br' | 'gold';
  readonly accessibilityHint?: string;
}

export default function Chip({ label, active, onPress, onLongPress, tone = 'br', accessibilityHint }: ChipProps) {
  const { colors } = useTheme();
  const accent = colors[tone];
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        // Dorado sobre naranja suave mezclaría las dos paletas en un mismo bloque.
        { borderColor: active ? accent : colors.line, backgroundColor: active ? (tone === 'gold' ? colors.shade : colors.brs) : 'transparent' },
      ]}
      onPress={() => {
        tocar();
        onPress();
      }}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.text, { color: active ? accent : colors.dim }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9, borderWidth: 1.5, minHeight: 36, justifyContent: 'center' },
  text: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
});
