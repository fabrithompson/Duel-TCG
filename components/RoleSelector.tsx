import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { Typography } from '../constants/theme';
import { ROLES_EQUIPO, RolEquipo } from '../constants/roles';
import { tocar } from '../lib/haptics';

type NombreIcono = React.ComponentProps<typeof Ionicons>['name'];

const ICONO: Record<RolEquipo, NombreIcono> = {
  mozo: 'cafe-outline',
  juez: 'shield-checkmark-outline',
};

interface RoleSelectorProps {
  readonly value: RolEquipo;
  readonly onChange: (role: RolEquipo) => void;
  readonly disabled?: boolean;
}

/** Rol de una cuenta nueva del equipo (Ajustes > Equipo). */
export default function RoleSelector({ value, onChange, disabled = false }: RoleSelectorProps) {
  const { colors } = useTheme();

  const elegir = (role: RolEquipo) => {
    if (role === value) return;
    tocar();
    onChange(role);
  };

  return (
    <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Rol">
      {ROLES_EQUIPO.map((r) => {
        const active = value === r.id;
        const tinta = active ? colors.br : colors.ink;
        return (
          <TouchableOpacity
            key={r.id}
            style={[
              styles.gridCard,
              { borderColor: active ? colors.br : colors.line, backgroundColor: active ? colors.brs : 'transparent' },
              disabled && styles.disabled,
            ]}
            onPress={() => elegir(r.id)}
            disabled={disabled}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityLabel={r.nombre}
            accessibilityHint={r.descripcion}
            accessibilityState={{ checked: active, selected: active, disabled }}
            aria-checked={active}
          >
            <Ionicons name={ICONO[r.id]} size={16} color={tinta} />
            <Text style={[styles.gridLabel, { color: tinta }]}>{r.nombre}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 8 },
  gridCard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, minHeight: 64 },
  gridLabel: { fontFamily: Typography.fontFamily.semibold, fontSize: 12 },
  disabled: { opacity: 0.6 },
});
