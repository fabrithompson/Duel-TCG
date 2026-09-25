import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Radii, Typography } from '../constants/theme';
import { ROLE_LABEL } from '../constants/roles';
import { CUENTAS_DEMO, HOST_DEMO, type CuentaDemo } from '../lib/demo';

// Solo en modo demo (`pnpm demo`): un toque completa el login con la cuenta de prueba de cada rol.
export default function AccesosDemo({ onElegir, disabled }: { readonly onElegir: (c: CuentaDemo) => void; readonly disabled?: boolean }) {
  const { colors } = useTheme();
  if (!HOST_DEMO) return null;
  return (
    <View style={[styles.caja, { borderColor: colors.gold, backgroundColor: colors.sf }]}>
      <Text style={[styles.titulo, { color: colors.ink }]}>Modo demo · datos de prueba</Text>
      <Text style={[styles.sub, { color: colors.dim }]}>Tocá una cuenta para completar el email y la contraseña.</Text>
      <View style={styles.fila}>
        {CUENTAS_DEMO.map((c) => (
          <TouchableOpacity
            key={c.uid}
            onPress={() => onElegir(c)}
            disabled={disabled}
            style={[styles.chip, { borderColor: colors.line, backgroundColor: colors.bg }]}
            accessibilityRole="button"
            accessibilityLabel={`Usar la cuenta de prueba de ${ROLE_LABEL[c.role]}, ${c.nombre}`}
          >
            <Text style={[styles.chipRol, { color: colors.br }]}>{ROLE_LABEL[c.role]}</Text>
            <Text style={[styles.chipNombre, { color: colors.dim }]} numberOfLines={1}>
              {c.nombre}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderStyle: 'dashed', borderRadius: Radii.card, padding: 12, marginBottom: 18, gap: 4 },
  titulo: { fontFamily: Typography.fontFamily.bold, fontSize: 12.5 },
  sub: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, lineHeight: 16 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { flexGrow: 1, flexBasis: '45%', minHeight: 44, borderWidth: 1, borderRadius: Radii.chip, paddingHorizontal: 10, paddingVertical: 6, justifyContent: 'center' },
  chipRol: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
  chipNombre: { fontFamily: Typography.fontFamily.regular, fontSize: 11 },
});
