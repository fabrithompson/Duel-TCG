import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { Typography } from '../constants/theme';
import { ROLES, SelectableRole } from '../constants/roles';
import { tocar } from '../lib/haptics';

type NombreIcono = React.ComponentProps<typeof Ionicons>['name'];

const ICONO: Record<SelectableRole, NombreIcono> = {
  mozo: 'cafe-outline',
  juez: 'shield-checkmark-outline',
  jugador: 'star-outline',
};

interface RoleSelectorProps {
  readonly value: SelectableRole | null;
  readonly onChange: (role: SelectableRole) => void;
  /** `list`: tarjetas apiladas con descripción (Login). `grid`: fila de 3 compactas (Registro). */
  readonly variant?: 'list' | 'grid';
  readonly disabled?: boolean;
}

export default function RoleSelector({ value, onChange, variant = 'list', disabled = false }: RoleSelectorProps) {
  const { colors } = useTheme();

  const elegir = (role: SelectableRole) => {
    if (role === value) return;
    tocar();
    onChange(role);
  };

  if (variant === 'grid') {
    return (
      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Perfil">
        {ROLES.map((r) => {
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
            >
              <Ionicons name={ICONO[r.id]} size={16} color={tinta} />
              <Text style={[styles.gridLabel, { color: tinta }]}>{r.nombre}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Perfil">
      {ROLES.map((r) => {
        const active = value === r.id;
        const tinta = active ? colors.br : colors.ink;
        return (
          <TouchableOpacity
            key={r.id}
            style={[
              styles.listCard,
              { borderColor: active ? colors.br : colors.line, backgroundColor: active ? colors.brs : 'transparent' },
              disabled && styles.disabled,
            ]}
            onPress={() => elegir(r.id)}
            disabled={disabled}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityLabel={`${r.nombre}. ${r.descripcion}`}
            accessibilityState={{ checked: active, selected: active, disabled }}
          >
            <View style={[styles.listIconBox, { borderColor: colors.line, backgroundColor: active ? colors.sf : colors.shade }]}>
              <Ionicons name={ICONO[r.id]} size={17} color={tinta} />
            </View>
            <View style={styles.listTexts}>
              <Text style={[styles.listName, { color: tinta }]}>{r.nombre}</Text>
              <Text style={[styles.listDesc, { color: colors.dim }]}>{r.descripcion}</Text>
            </View>
            <View style={[styles.dot, { borderColor: active ? colors.br : colors.line, backgroundColor: active ? colors.br : 'transparent' }]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  listCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 13, paddingVertical: 12, paddingHorizontal: 13, minHeight: 60 },
  listIconBox: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  listTexts: { flex: 1 },
  listName: { fontFamily: Typography.fontFamily.semibold, fontSize: 14.5 },
  listDesc: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 2 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  grid: { flexDirection: 'row', gap: 8 },
  gridCard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, minHeight: 64 },
  gridLabel: { fontFamily: Typography.fontFamily.semibold, fontSize: 12 },
  disabled: { opacity: 0.6 },
});
