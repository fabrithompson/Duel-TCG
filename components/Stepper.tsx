import React from 'react';
import { AccessibilityActionEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Typography, tabularNums } from '../constants/theme';
import { tocar } from '../lib/haptics';

interface StepperProps {
  readonly value: number;
  readonly onIncrement: () => void;
  readonly onDecrement: () => void;
  readonly formatValue?: (n: number) => string;
  readonly min?: number;
  readonly max?: number;
  /** Nombre del valor para lectores de pantalla ("cantidad de Medialuna"). */
  readonly accessibilityLabel?: string;
}

export default function Stepper({ value, onIncrement, onDecrement, formatValue, min, max, accessibilityLabel }: StepperProps) {
  const { colors } = useTheme();
  const enMin = min !== undefined && value <= min;
  const enMax = max !== undefined && value >= max;
  const etiqueta = accessibilityLabel ?? 'valor';

  const restar = () => {
    if (enMin) return;
    tocar();
    onDecrement();
  };
  const sumar = () => {
    if (enMax) return;
    tocar();
    onIncrement();
  };

  // Con rol "adjustable", VoiceOver/TalkBack cambian el valor deslizando arriba/abajo.
  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') sumar();
    if (e.nativeEvent.actionName === 'decrement') restar();
  };

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={etiqueta}
      accessibilityValue={{ text: formatValue ? formatValue(value) : String(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
    >
      <TouchableOpacity
        style={[styles.btn, { borderColor: colors.line, opacity: enMin ? 0.4 : 1 }]}
        onPress={restar}
        disabled={enMin}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        importantForAccessibility="no"
        accessibilityLabel={`Restar ${etiqueta}`}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>−</Text>
      </TouchableOpacity>
      <Text style={[styles.value, { color: colors.ink }, tabularNums(13)]}>{formatValue ? formatValue(value) : value}</Text>
      <TouchableOpacity
        style={[styles.btn, { borderColor: colors.line, opacity: enMax ? 0.4 : 1 }]}
        onPress={sumar}
        disabled={enMax}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        importantForAccessibility="no"
        accessibilityLabel={`Sumar ${etiqueta}`}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: Typography.fontFamily.semibold, fontSize: 16, lineHeight: 19 },
  value: { fontFamily: Typography.fontFamily.semibold, fontSize: 13, minWidth: 44, textAlign: 'center' },
});
