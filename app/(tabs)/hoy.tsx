import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import Screen, { LoadingScreen } from '../../components/Screen';
import MetricTile from '../../components/MetricTile';
import PendingCard from '../../components/PendingCard';
import Avatar from '../../components/Avatar';
import { EmptyState, ErrorBanner, SectionLabel } from '../../components/ui';
import { useTheme } from '../../contexts/ThemeContext';
import { useConfig } from '../../contexts/ConfigContext';
import { useUserProfileContext } from '../../contexts/UserProfileContext';
import { Typography, tabularNums } from '../../constants/theme';
import { ROLE_LABEL } from '../../constants/roles';
import { turnoActual } from '../../lib/config';
import { mensajeError } from '../../lib/errores';
import { formatARS } from '../../lib/pedido';
import { tocar } from '../../lib/haptics';
import type { UserProfile } from '../../lib/users';
import { HoyData, pad2, useHoy } from '../../hooks/useHoy';

export default function HoyScreen() {
  const { profile } = useUserProfileContext();
  if (!profile) return <LoadingScreen />;
  if (profile.role === 'jugador') return <Redirect href="/(tabs)/duelo" />;
  return <PanelHoy profile={profile} />;
}

interface Metrica {
  valor: string;
  etiqueta: string;
  tono?: 'ink' | 'dg';
  onPress?: () => void;
  hint?: string;
}

function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || nombre;
}

function ronda(hoy: HoyData): string {
  return hoy.torneo ? `R${hoy.torneo.rondaActual}/${hoy.torneo.totalRondas}` : '—';
}

function PanelHoy({ profile }: { readonly profile: UserProfile }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { config } = useConfig();
  const hoy = useHoy(profile.role, config.alertaStock, config.creditoPremio, config.turnos);

  const role = profile.role;
  const tonoRol = role === 'juez' ? colors.gold : colors.br;
  const turno = turnoActual(config.turnos, new Date(hoy.ahora));
  const eyebrow = `${ROLE_LABEL[role]} · ${turno ? `Turno ${turno.nombre}` : 'Fuera de turno'}`;

  const encabezado =
    role === 'admin'
      ? { titulo: 'Panel del local', subtitulo: '' }
      : role === 'mozo'
        ? {
            titulo: `Hola, ${primerNombre(profile.nombre)}`,
            subtitulo: hoy.cargando
              ? ''
              : `${hoy.cuentasAbiertas} ${hoy.cuentasAbiertas === 1 ? 'cuenta abierta' : 'cuentas abiertas'} · ${hoy.mesasTotal} mesas`,
          }
        : {
            titulo: 'Panel del torneo',
            subtitulo: hoy.cargando
              ? ''
              : hoy.torneo
                ? `${hoy.torneo.nombre} · Ronda ${hoy.torneo.rondaActual} de ${hoy.torneo.totalRondas}`
                : 'No hay un torneo en curso',
          };

  const cifra = (valor: string) => (hoy.cargando ? '…' : valor);
  const stockBajo = hoy.stockBajo.length;

  const metricas: Metrica[] =
    role === 'juez'
      ? [
          { valor: cifra(ronda(hoy)), etiqueta: 'Ronda' },
          { valor: cifra(hoy.torneo ? String(hoy.torneo.jugadores) : '—'), etiqueta: 'Jugadores' },
          { valor: cifra(String(stockBajo)), etiqueta: 'Stock TCG bajo', tono: stockBajo > 0 ? 'dg' : 'ink' },
        ]
      : [
          {
            valor: cifra(formatARS(hoy.totalDia)),
            etiqueta: role === 'admin' ? 'Día · caja' : 'Día',
            onPress: role === 'admin' ? () => router.push('/(tabs)/caja') : undefined,
            hint: 'Abre el cierre de caja',
          },
          {
            valor: cifra(`${hoy.mesasOcupadas}/${hoy.mesasTotal}`),
            etiqueta: hoy.mesasEnDuelo > 0 ? `Mesas · ${hoy.mesasEnDuelo} en duelo` : 'Mesas',
            onPress: () => router.push('/(tabs)/salon'),
            hint: 'Abre el plano del salón',
          },
          role === 'admin'
            ? { valor: cifra(ronda(hoy)), etiqueta: 'Ronda' }
            : { valor: cifra(String(stockBajo)), etiqueta: 'Stock bajo', tono: stockBajo > 0 ? 'dg' : 'ink' },
        ];

  return (
    <Screen contentStyle={styles.contenido}>
      <View style={[styles.header, { borderBottomColor: colors.line }]}>
        <View style={styles.headerTexts}>
          <Text style={[styles.eyebrow, { color: tonoRol }]} numberOfLines={1}>
            {eyebrow.toUpperCase()}
          </Text>
          <Text style={[styles.titulo, { color: colors.ink }]} accessibilityRole="header" numberOfLines={2}>
            {encabezado.titulo}
          </Text>
          {encabezado.subtitulo ? (
            <Text style={[styles.subtitulo, { color: colors.dim }]} numberOfLines={2}>
              {encabezado.subtitulo}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => {
            tocar();
            router.push('/cuenta');
          }}
          style={styles.avatarHit}
          accessibilityRole="button"
          accessibilityLabel="Mi cuenta"
          accessibilityHint="Abre tu perfil, el tema y el cierre de sesión"
        >
          <Avatar fotoUrl={profile.fotoUrl} tamano={38} borde={tonoRol} />
        </TouchableOpacity>
      </View>

      {hoy.error ? (
        <View style={styles.errorWrap}>
          <ErrorBanner mensaje={mensajeError(hoy.error, 'No se pudieron cargar los datos de hoy.')} onRetry={hoy.reintentar} />
        </View>
      ) : null}

      <View style={styles.metricas}>
        {metricas.map((m) => (
          <MetricTile
            key={m.etiqueta}
            value={m.valor}
            label={m.etiqueta}
            tone={m.tono}
            onPress={m.onPress}
            accessibilityHint={m.onPress ? m.hint : undefined}
          />
        ))}
      </View>

      <View style={styles.seccion}>
        <SectionLabel>Pendientes</SectionLabel>
        {hoy.cargando ? (
          <ActivityIndicator color={colors.br} style={styles.spinner} accessibilityLabel="Cargando pendientes" />
        ) : hoy.pendientes.length === 0 ? (
          <EmptyState title="Nada pendiente por ahora" />
        ) : (
          <View style={styles.lista}>
            {hoy.pendientes.map((p) => (
              <PendingCard
                key={p.id}
                titulo={p.titulo}
                subtitulo={p.subtitulo}
                color={p.tono}
                accessibilityHint={p.hint}
                // withAnchor: la raíz de la pestaña queda debajo, así "← Salón" o "← Ajustes" vuelven ahí.
                onPress={() => router.push(p.destino, { withAnchor: true })}
              />
            ))}
          </View>
        )}
      </View>

      {role === 'admin' && !hoy.cargando ? (
        <View style={styles.seccionFeed}>
          <SectionLabel>Ahora en el local</SectionLabel>
          {hoy.cobrosRecientes.length === 0 ? (
            <Text style={[styles.feedVacio, { color: colors.dim }]}>
              Todavía no hubo cobros hoy.
            </Text>
          ) : (
            hoy.cobrosRecientes.map((c) => (
              <View
                key={c.id}
                style={[styles.feedFila, { borderBottomColor: colors.line }]}
                accessible
                accessibilityLabel={`${c.hora}, mesa ${c.mesaNum}, ${formatARS(c.total)}, ${c.medio}`}
              >
                <Text style={[styles.feedHora, { color: colors.br }, tabularNums(11.5)]}>{c.hora}</Text>
                <Text style={[styles.feedTexto, { color: colors.ink }]} numberOfLines={1}>
                  Mesa {pad2(c.mesaNum)} · <Text style={tabularNums(13)}>{formatARS(c.total)}</Text>
                </Text>
                <Text style={[styles.feedTag, { color: colors.dim }]} numberOfLines={1}>
                  {c.medio}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  contenido: { paddingTop: 16, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingBottom: 16, borderBottomWidth: 1 },
  headerTexts: { flex: 1 },
  eyebrow: { fontFamily: Typography.fontFamily.semibold, fontSize: 10, letterSpacing: 1.6 },
  titulo: { fontFamily: Typography.display.bold, fontSize: 27, lineHeight: 30, letterSpacing: -0.8, marginTop: 7 },
  subtitulo: { fontFamily: Typography.fontFamily.regular, fontSize: 12, lineHeight: 17, marginTop: 5 },
  avatarHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -3, marginRight: -3 },
  errorWrap: { marginTop: 16, marginBottom: -4 },
  metricas: { flexDirection: 'row', gap: 8, marginTop: 16 },
  seccion: { marginTop: 16 },
  spinner: { marginVertical: 24 },
  lista: { gap: 8 },
  seccionFeed: { marginTop: 18 },
  feedFila: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingVertical: 11, borderBottomWidth: 1, minHeight: 44 },
  feedHora: { fontFamily: Typography.display.semibold, fontSize: 11.5, minWidth: 38 },
  feedTexto: { flex: 1, fontFamily: Typography.fontFamily.regular, fontSize: 13, lineHeight: 19 },
  feedTag: { fontFamily: Typography.fontFamily.regular, fontSize: 11, maxWidth: 110, textAlign: 'right' },
  feedVacio: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, lineHeight: 18, paddingVertical: 8 },
});
