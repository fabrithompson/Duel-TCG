import React from 'react';
import { StyleProp, StyleSheet, Switch, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Typography } from '../constants/theme';
import { tocar } from '../lib/haptics';

// Primitivas del sistema de diseño (DESIGN.md §4 "Patrones recurrentes").

type Tono = 'br' | 'gold' | 'ok' | 'dg' | 'dim' | 'ink';

export function SectionLabel({ children, tone = 'dim', right }: { readonly children: string; readonly tone?: Tono; readonly right?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color: colors[tone] }]}>{children.toUpperCase()}</Text>
      {right}
    </View>
  );
}

interface CardProps {
  readonly children: React.ReactNode;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  /** Seleccionado/activo: borde 1.5 del acento + fondo suave. */
  readonly active?: boolean;
  readonly tone?: 'br' | 'gold';
  readonly dashed?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly disabled?: boolean;
}

export function Card({ children, onPress, onLongPress, active, tone = 'br', dashed, style, accessibilityLabel, disabled }: CardProps) {
  const { colors } = useTheme();
  const base = [
    styles.card,
    {
      borderColor: active ? colors[tone] : dashed ? colors.gold : colors.line,
      borderWidth: active ? 1.5 : 1,
      borderStyle: dashed ? ('dashed' as const) : ('solid' as const),
      backgroundColor: active ? (tone === 'gold' ? colors.shade : colors.brs) : dashed ? 'transparent' : colors.sf,
    },
    style,
  ];
  if (!onPress && !onLongPress) return <View style={base}>{children}</View>;
  return (
    <TouchableOpacity
      style={base}
      onPress={onPress ? () => { tocar(); onPress(); } : undefined}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active, disabled }}
    >
      {children}
    </TouchableOpacity>
  );
}

export function Badge({ label, tone = 'dim' }: { readonly label: string; readonly tone?: Tono }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { borderColor: colors[tone] }]}>
      <Text style={[styles.badgeText, { color: colors[tone] }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function Dot({ tone, size = 8 }: { readonly tone: Tono; readonly size?: number }) {
  const { colors } = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[tone] }} />;
}

interface ToggleRowProps {
  readonly label: string;
  readonly sub?: string;
  readonly value: boolean;
  readonly onChange: (v: boolean) => void;
  readonly disabled?: boolean;
}

/** Fila de ajuste con toggle (pista 46×27 en el diseño; se usa el Switch nativo teñido). */
export function ToggleRow({ label, sub, value, onChange, disabled }: ToggleRowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.settingRow, { borderColor: colors.line, backgroundColor: colors.sf }]}>
      <View style={styles.settingTexts}>
        <Text style={[styles.settingLabel, { color: colors.ink }]}>{label}</Text>
        {sub ? <Text style={[styles.settingSub, { color: colors.dim }]}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => { tocar(); onChange(v); }}
        disabled={disabled}
        trackColor={{ false: colors.line, true: colors.br }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={colors.line}
        accessibilityLabel={label}
      />
    </View>
  );
}

interface SettingRowProps {
  readonly label: string;
  readonly sub?: string;
  readonly children?: React.ReactNode;
  readonly onPress?: () => void;
  readonly value?: string;
}

/** Fila de ajuste genérica: etiqueta + control o valor a la derecha. */
export function SettingRow({ label, sub, children, onPress, value }: SettingRowProps) {
  const { colors } = useTheme();
  const content = (
    <>
      <View style={styles.settingTexts}>
        <Text style={[styles.settingLabel, { color: colors.ink }]}>{label}</Text>
        {sub ? <Text style={[styles.settingSub, { color: colors.dim }]}>{sub}</Text> : null}
      </View>
      {value !== undefined ? <Text style={[styles.settingValue, { color: colors.br }]}>{value}</Text> : null}
      {children}
    </>
  );
  const style = [styles.settingRow, { borderColor: colors.line, backgroundColor: colors.sf }];
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <TouchableOpacity style={style} onPress={() => { tocar(); onPress(); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>
      {content}
    </TouchableOpacity>
  );
}

interface EmptyStateProps {
  readonly title: string;
  readonly body?: string;
  readonly action?: React.ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: colors.line }]}>
      <Text style={[styles.emptyTitle, { color: colors.ink }]}>{title}</Text>
      {body ? <Text style={[styles.emptyBody, { color: colors.dim }]}>{body}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function ErrorBanner({ mensaje, onRetry }: { readonly mensaje: string; readonly onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.errorBanner, { borderColor: colors.dg }]} accessibilityRole="alert">
      <Text style={[styles.errorText, { color: colors.dg }]}>{mensaje}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.errorRetry, { color: colors.dg }]}>Reintentar</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Botón chico con borde (acciones de header: "+ Ingreso", "Premios"). */
export function SmallButton({ label, onPress, tone = 'br', disabled }: { readonly label: string; readonly onPress: () => void; readonly tone?: 'br' | 'gold' | 'dg'; readonly disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.smallBtn, { borderColor: colors[tone], opacity: disabled ? 0.45 : 1 }]}
      onPress={() => { tocar(); onPress(); }}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.smallBtnText, { color: colors[tone] }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 10 },
  section: { fontFamily: Typography.fontFamily.bold, fontSize: 10, letterSpacing: 1.6 },
  card: { borderRadius: 13, padding: 13 },
  badge: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontFamily: Typography.fontFamily.semibold, fontSize: 9, letterSpacing: 1.1 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, minHeight: 56 },
  settingTexts: { flex: 1 },
  settingLabel: { fontFamily: Typography.fontFamily.semibold, fontSize: 13 },
  settingSub: { fontFamily: Typography.fontFamily.regular, fontSize: 10.5, marginTop: 2, lineHeight: 15 },
  settingValue: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 13, padding: 18, alignItems: 'center' },
  emptyTitle: { fontFamily: Typography.fontFamily.semibold, fontSize: 14, textAlign: 'center' },
  emptyBody: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  emptyAction: { marginTop: 14, alignSelf: 'stretch' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { flex: 1, fontFamily: Typography.fontFamily.medium, fontSize: 12 },
  errorRetry: { fontFamily: Typography.fontFamily.bold, fontSize: 12, textDecorationLine: 'underline' },
  smallBtn: { borderWidth: 1.5, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7, minHeight: 32, justifyContent: 'center' },
  smallBtnText: { fontFamily: Typography.fontFamily.semibold, fontSize: 12 },
});
