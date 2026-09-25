import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityActionEvent, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  /** Si está, tocar el número deja escribirlo: para montos grandes los toques de ± no alcanzan. */
  readonly onChangeValue?: (valor: number) => void;
}

// Mantener apretado ± repite: primero lento, después más rápido.
const REPETIR_MS = 110;
const REPETIR_RAPIDO_MS = 45;
const TOQUES_HASTA_RAPIDO = 8;

export default function Stepper({ value, onIncrement, onDecrement, formatValue, min, max, accessibilityLabel, onChangeValue }: StepperProps) {
  const { colors } = useTheme();
  const enMin = min !== undefined && value <= min;
  const enMax = max !== undefined && value >= max;
  const etiqueta = accessibilityLabel ?? 'valor';
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');

  // Los handlers de la repetición leen siempre lo último (el valor cambia en cada paso).
  const ultimo = useRef({ enMin, enMax, onIncrement, onDecrement });
  useLayoutEffect(() => {
    ultimo.current = { enMin, enMax, onIncrement, onDecrement };
  });
  const repeticion = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cortarRepeticion = () => {
    if (repeticion.current) clearTimeout(repeticion.current);
    repeticion.current = null;
  };
  useEffect(() => cortarRepeticion, []);

  const restar = () => {
    if (ultimo.current.enMin) return false;
    tocar();
    ultimo.current.onDecrement();
    return true;
  };
  const sumar = () => {
    if (ultimo.current.enMax) return false;
    tocar();
    ultimo.current.onIncrement();
    return true;
  };

  const repetir = (paso: () => boolean) => {
    cortarRepeticion();
    let toques = 0;
    const tick = () => {
      if (!paso()) return;
      toques += 1;
      repeticion.current = setTimeout(tick, toques >= TOQUES_HASTA_RAPIDO ? REPETIR_RAPIDO_MS : REPETIR_MS);
    };
    tick();
  };

  // Con rol "adjustable", VoiceOver/TalkBack cambian el valor deslizando arriba/abajo.
  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') sumar();
    if (e.nativeEvent.actionName === 'decrement') restar();
  };

  const empezarEdicion = () => {
    if (!onChangeValue) return;
    setTexto(String(value));
    setEditando(true);
  };

  const terminarEdicion = () => {
    setEditando(false);
    const limpio = texto.replace(/\D/g, '');
    if (!onChangeValue || !limpio) return;
    let n = Number(limpio);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (n !== value) onChangeValue(n);
  };

  const textoValor = formatValue ? formatValue(value) : String(value);

  return (
    <View
      style={styles.row}
      accessible={!editando}
      accessibilityRole="adjustable"
      accessibilityLabel={etiqueta}
      accessibilityHint={onChangeValue ? 'Tocá dos veces el número para escribirlo' : undefined}
      accessibilityValue={{ text: textoValor }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, ...(onChangeValue ? [{ name: 'activate' as const }] : [])]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'activate' ? empezarEdicion() : onAccessibilityAction(e))}
    >
      <TouchableOpacity
        style={[styles.btn, { borderColor: colors.line, opacity: enMin ? 0.4 : 1 }]}
        onPress={restar}
        onLongPress={() => repetir(restar)}
        onPressOut={cortarRepeticion}
        delayLongPress={350}
        disabled={enMin}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        importantForAccessibility="no"
        accessibilityLabel={`Restar ${etiqueta}`}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>−</Text>
      </TouchableOpacity>
      {editando ? (
        <TextInput
          value={texto}
          onChangeText={setTexto}
          onBlur={terminarEdicion}
          onSubmitEditing={terminarEdicion}
          keyboardType="number-pad"
          returnKeyType="done"
          autoFocus
          selectTextOnFocus
          maxLength={9}
          style={[styles.value, styles.input, { color: colors.ink, borderColor: colors.br }, tabularNums(13)]}
          accessibilityLabel={`Escribir ${etiqueta}`}
        />
      ) : onChangeValue ? (
        <TouchableOpacity onPress={empezarEdicion} hitSlop={{ top: 8, bottom: 8 }} importantForAccessibility="no" accessibilityLabel={`Escribir ${etiqueta}`}>
          <Text style={[styles.value, styles.editable, { color: colors.ink, borderBottomColor: colors.line }, tabularNums(13)]}>{textoValor}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={[styles.value, { color: colors.ink }, tabularNums(13)]}>{textoValor}</Text>
      )}
      <TouchableOpacity
        style={[styles.btn, { borderColor: colors.line, opacity: enMax ? 0.4 : 1 }]}
        onPress={sumar}
        onLongPress={() => repetir(sumar)}
        onPressOut={cortarRepeticion}
        delayLongPress={350}
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
  editable: { borderBottomWidth: 1, borderStyle: 'dashed', paddingBottom: 1 },
  input: { minWidth: 72, borderWidth: 1, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 6 },
});
