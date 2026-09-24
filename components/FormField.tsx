import React, { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Typography } from '../constants/theme';
import { tocar } from '../lib/haptics';

interface FormFieldProps extends TextInputProps {
  readonly label: string;
  readonly containerStyle?: StyleProp<ViewStyle>;
  /** Mensaje de validación: pinta el borde en rojo y se muestra debajo del campo. */
  readonly error?: string;
  /** Campo de contraseña con botón Mostrar/Ocultar. */
  readonly secureToggle?: boolean;
  readonly ref?: React.Ref<TextInput>;
}

export default function FormField({
  label,
  style,
  containerStyle,
  error,
  secureToggle = false,
  secureTextEntry,
  ref,
  onFocus,
  onBlur,
  editable,
  accessibilityLabel,
  ...inputProps
}: FormFieldProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput | null>(null);
  const [visible, setVisible] = useState(false);
  const [enfocado, setEnfocado] = useState(false);

  const asignarRef = useCallback(
    (nodo: TextInput | null) => {
      inputRef.current = nodo;
      if (typeof ref === 'function') ref(nodo);
      else if (ref) ref.current = nodo;
    },
    [ref]
  );

  const oculto = secureToggle ? !visible : secureTextEntry;
  const colorBorde = error ? colors.dg : enfocado ? colors.br : colors.line;
  const deshabilitado = editable === false;

  return (
    <View style={containerStyle}>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        disabled={deshabilitado}
        accessible={false}
        style={[styles.box, { borderColor: colorBorde, backgroundColor: colors.sf }, deshabilitado && styles.deshabilitado]}
      >
        <View style={styles.texts}>
          <Text style={[styles.label, { color: error ? colors.dg : colors.dim }]}>{label}</Text>
          <TextInput
            ref={asignarRef}
            style={[styles.input, { color: colors.ink }, style]}
            placeholderTextColor={colors.dim}
            secureTextEntry={oculto}
            editable={editable}
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityHint={error}
            onFocus={(e) => {
              setEnfocado(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setEnfocado(false);
              onBlur?.(e);
            }}
            {...inputProps}
          />
        </View>
        {secureToggle ? (
          <TouchableOpacity
            onPress={() => {
              tocar();
              setVisible((v) => !v);
            }}
            disabled={deshabilitado}
            style={styles.toggle}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          >
            <Text style={[styles.toggleText, { color: colors.dim }]}>{visible ? 'Ocultar' : 'Mostrar'}</Text>
          </TouchableOpacity>
        ) : null}
      </Pressable>
      {error ? (
        <Text style={[styles.error, { color: colors.dg }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56 },
  deshabilitado: { opacity: 0.7 },
  texts: { flex: 1 },
  label: { fontFamily: Typography.fontFamily.semibold, fontSize: 9.5, letterSpacing: 1.3, textTransform: 'uppercase' },
  input: { fontFamily: Typography.fontFamily.regular, fontSize: 14, paddingVertical: 4, paddingHorizontal: 0 },
  toggle: { minHeight: 44, minWidth: 64, alignItems: 'flex-end', justifyContent: 'center', paddingLeft: 8 },
  toggleText: { fontFamily: Typography.fontFamily.semibold, fontSize: 12 },
  error: { fontFamily: Typography.fontFamily.medium, fontSize: 11.5, marginTop: 6, marginLeft: 4, lineHeight: 16 },
});
