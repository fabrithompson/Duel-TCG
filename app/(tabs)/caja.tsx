import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { useConfig } from '../../contexts/ConfigContext';
import { useUserProfileContext } from '../../contexts/UserProfileContext';
import { Typography, tabularNums } from '../../constants/theme';
import { FilaDesglose, nombreMedio, useCaja } from '../../hooks/useCaja';
import Screen, { LoadingScreen } from '../../components/Screen';
import MetricTile from '../../components/MetricTile';
import { EmptyState, ErrorBanner, SectionLabel, SmallButton } from '../../components/ui';
import { mensajeError } from '../../lib/errores';
import { fechaCorta, fechaLocal, sumarDias } from '../../lib/fecha';
import { formatARS } from '../../lib/pedido';
import { numeroMesaTexto } from '../../lib/salon';

const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ALTO_GRAFICO = 96;
const ALTO_BARRA_MAX = 72;

function fechaLarga(d: Date): string {
  const dia = DIAS_LARGOS[d.getDay()];
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}`;
}

function Desglose({ filas }: { readonly filas: readonly FilaDesglose[] }) {
  const { colors } = useTheme();
  return (
    <View>
      {filas.map((f) => (
        <View
          key={f.clave}
          style={[styles.fila, { borderBottomColor: colors.line }]}
          accessible
          accessibilityLabel={`${f.nombre}: ${formatARS(f.total)}, ${f.pct}%`}
        >
          <Text style={[styles.filaNombre, { color: f.tono === 'gold' ? colors.gold : colors.ink }]} numberOfLines={1}>
            {f.nombre}
          </Text>
          <Text style={[styles.filaPct, { color: colors.dim }, tabularNums(12.5)]}>{f.pct}%</Text>
          <Text style={[styles.filaMonto, { color: f.tono === 'gold' ? colors.gold : colors.ink }, tabularNums(13)]}>{formatARS(f.total)}</Text>
        </View>
      ))}
    </View>
  );
}

function CajaAdmin() {
  const router = useRouter();
  const { colors } = useTheme();
  const { config } = useConfig();
  // null = la jornada en curso; si no, un día anterior elegido con las flechas.
  const [fechaElegida, setFechaElegida] = useState<string | null>(null);
  const { resumen, hoy, esHoy, fechaHoy, inscripciones, cargando, error, reintentar } = useCaja(config.turnos, fechaElegida);

  const volver = () => router.navigate('/(tabs)/hoy');
  const moverDia = (dias: number) => {
    const destino = fechaLocal(sumarDias(hoy, dias));
    // Hacia adelante no se pasa de la jornada en curso.
    setFechaElegida(destino >= fechaHoy ? null : destino);
  };
  const navegacion = (
    <View style={styles.navDias}>
      <SmallButton label="‹ Anterior" onPress={() => moverDia(-1)} disabled={cargando} />
      {esHoy ? null : <SmallButton label="Siguiente ›" onPress={() => moverDia(1)} disabled={cargando} />}
    </View>
  );

  if (cargando && resumen.cobros === 0) return <LoadingScreen />;

  if (error) {
    return (
      <Screen back="Hoy" onBack={volver} title="Cierre del día" subtitle={fechaLarga(hoy)} right={navegacion}>
        <ErrorBanner mensaje={mensajeError(error, 'No se pudieron cargar las ventas.')} onRetry={reintentar} />
      </Screen>
    );
  }

  const maxDia = Math.max(1, ...resumen.barras.map((b) => b.total));
  const diaSemanaPasada = DIAS_LARGOS[hoy.getDay()];
  const variacion = resumen.variacionPct;

  return (
    <Screen back="Hoy" onBack={volver} title="Cierre del día" subtitle={esHoy ? `${fechaLarga(hoy)} · jornada en curso` : fechaLarga(hoy)} right={navegacion}>
      <View style={styles.totalBloque}>
        <View style={styles.totalFila}>
          <Text
            style={[styles.total, { color: colors.ink }, tabularNums(40)]}
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityLabel={`Total cobrado ${esHoy ? 'hoy' : 'ese día'}: ${formatARS(resumen.totalHoy)}`}
          >
            {formatARS(resumen.totalHoy)}
          </Text>
          {variacion !== null ? (
            <Text
              style={[styles.variacion, { color: variacion >= 0 ? colors.ok : colors.dg }, tabularNums(12.5)]}
              accessibilityLabel={`${Math.abs(variacion)}% ${variacion >= 0 ? 'más' : 'menos'} que el ${diaSemanaPasada} pasado`}
            >
              {variacion > 0 ? '+' : ''}
              {variacion}%
            </Text>
          ) : null}
        </View>
        <Text style={[styles.totalSub, { color: colors.dim }]}>
          {variacion !== null
            ? esHoy
              ? `Cobrado hoy · contra el ${diaSemanaPasada} pasado a esta misma hora`
              : `Cobrado ese día · contra el ${diaSemanaPasada} anterior`
            : esHoy
              ? 'Cobrado hoy'
              : 'Cobrado ese día'}
        </Text>
        {inscripciones.total > 0 ? (
          <Text style={[styles.totalSub, { color: colors.gold }, tabularNums(11.5)]}>
            + {formatARS(inscripciones.total)} de inscripciones de torneo ({inscripciones.pagas} {inscripciones.pagas === 1 ? 'paga' : 'pagas'}), que cobra el juez y no están en las ventas
          </Text>
        ) : null}
      </View>

      <View style={styles.metricas}>
        <MetricTile value={String(resumen.cobros)} label="Cobros" />
        <MetricTile value={formatARS(resumen.ticketPromedio)} label="Ticket prom." />
        <MetricTile value={formatARS(resumen.creditoAplicado)} label="Crédito torneo" />
      </View>

      <View style={styles.grafico}>
        {resumen.barras.map((b) => {
          const alto = b.total > 0 ? Math.max(6, (b.total / maxDia) * ALTO_BARRA_MAX) : 3;
          return (
            <View key={b.fecha} style={styles.columna} accessible accessibilityLabel={`${b.esHoy ? 'Hoy' : fechaCorta(b.fecha)}: ${formatARS(b.total)}`}>
              <View style={[styles.barra, { height: alto, backgroundColor: b.esHoy ? colors.br : colors.line }]} />
              <Text style={[styles.letra, { color: b.esHoy ? colors.br : colors.dim }]}>{b.letra}</Text>
            </View>
          );
        })}
      </View>

      {resumen.cobros === 0 ? (
        <View style={styles.seccion}>
          <EmptyState
            title={esHoy ? 'Todavía no se cobró nada hoy' : 'Ese día no hubo cobros'}
            body={esHoy ? 'Cuando se cobre una mesa desde el Salón, el cierre se arma solo acá.' : 'Mirá otro día con las flechas de arriba.'}
          />
        </View>
      ) : (
        <>
          <View style={styles.seccion}>
            <SectionLabel>Por rubro</SectionLabel>
            <Desglose filas={resumen.porRubro} />
          </View>

          <View style={styles.seccion}>
            <SectionLabel>Por medio de pago</SectionLabel>
            <Desglose filas={resumen.porMedio} />
          </View>

          <View style={styles.seccion}>
            <SectionLabel>Últimos cobros</SectionLabel>
            {resumen.ultimos.map((v) => (
              <View
                key={v.id}
                style={[styles.cobro, { borderBottomColor: colors.line }]}
                accessible
                accessibilityLabel={`${v.hora}, mesa ${numeroMesaTexto(v.mesaNum)}, ${nombreMedio(v.medioPago)}, ${formatARS(v.total)}`}
              >
                <View style={styles.cobroTextos}>
                  <Text style={[styles.cobroTexto, { color: colors.ink }, tabularNums(13)]} numberOfLines={1}>
                    {v.hora || '--:--'} · Mesa {numeroMesaTexto(v.mesaNum)} · {nombreMedio(v.medioPago)}
                  </Text>
                  {v.creditoAplicado > 0 ? (
                    <Text style={[styles.cobroCredito, { color: colors.gold }, tabularNums(11)]}>Crédito de torneo −{formatARS(v.creditoAplicado)}</Text>
                  ) : null}
                </View>
                <Text style={[styles.filaMonto, { color: colors.ink }, tabularNums(13)]}>{formatARS(v.total)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

export default function CajaScreen() {
  const { profile } = useUserProfileContext();
  if (profile?.role !== 'admin') return <Redirect href="/(tabs)/hoy" />;
  return <CajaAdmin />;
}

const styles = StyleSheet.create({
  totalBloque: { marginBottom: 16 },
  navDias: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  totalFila: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  total: { flexShrink: 1, fontFamily: Typography.fontFamily.bold, fontSize: 40 },
  variacion: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
  totalSub: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, marginTop: 4 },
  metricas: { flexDirection: 'row', gap: 8 },
  grafico: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: ALTO_GRAFICO, marginTop: 22 },
  columna: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' },
  barra: { width: '100%', borderRadius: 6 },
  letra: { fontFamily: Typography.fontFamily.semibold, fontSize: 11 },
  seccion: { marginTop: 24 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  filaNombre: { flex: 1, fontFamily: Typography.fontFamily.medium, fontSize: 13 },
  filaPct: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, minWidth: 40, textAlign: 'right' },
  filaMonto: { fontFamily: Typography.fontFamily.semibold, fontSize: 13, minWidth: 80, textAlign: 'right' },
  cobro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1 },
  cobroTextos: { flex: 1 },
  cobroTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 13 },
  cobroCredito: { fontFamily: Typography.fontFamily.medium, fontSize: 11, marginTop: 2 },
});
