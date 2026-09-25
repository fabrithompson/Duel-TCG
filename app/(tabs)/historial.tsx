import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import Screen, { LoadingScreen } from '../../components/Screen';
import MetricTile from '../../components/MetricTile';
import { Badge, EmptyState, ErrorBanner, SectionLabel } from '../../components/ui';
import { useTheme } from '../../contexts/ThemeContext';
import { useUserProfileContext } from '../../contexts/UserProfileContext';
import { Typography, tabularNums } from '../../constants/theme';
import { useHistorial } from '../../hooks/useHistorial';
import { textoPremio, type FilaHistorial } from '../../lib/temporada';
import { MENSAJE_FALTA_INDICE, mensajeError } from '../../lib/errores';
import { fechaCorta } from '../../lib/fecha';

export default function HistorialScreen() {
  const { user } = useUserProfileContext();
  const { filas, resumen, cargando, error, faltaIndice, reintentar } = useHistorial(user?.uid ?? null);

  const renderItem = useCallback<ListRenderItem<FilaHistorial>>(({ item }) => <FilaTorneo fila={item} />, []);

  if (cargando && filas.length === 0) return <LoadingScreen />;

  const hayDatos = filas.length > 0;

  const encabezado = (
    <>
      {error ? (
        <ErrorBanner
          mensaje={faltaIndice ? MENSAJE_FALTA_INDICE : mensajeError(error, 'No pudimos cargar tu historial.')}
          onRetry={reintentar}
        />
      ) : null}
      {hayDatos ? (
        <>
          <View style={styles.metricas}>
            <MetricTile value={String(resumen.ganados)} label="Duelos ganados" tone="ok" />
            <MetricTile value={String(resumen.perdidos)} label="Perdidos" />
            <MetricTile value={String(resumen.torneos)} label="Torneos" tone="gold" />
          </View>
          <View style={styles.seccion}>
            <SectionLabel>Torneos jugados</SectionLabel>
          </View>
        </>
      ) : null}
    </>
  );

  return (
    <Screen title="Mi historial" scroll={false} divider>
      <FlatList
        data={filas}
        keyExtractor={(f) => f.id}
        renderItem={renderItem}
        ListHeaderComponent={encabezado}
        ListEmptyComponent={
          error ? null : (
            <EmptyState
              title="Todavía no jugaste torneos"
            />
          )
        }
        contentContainerStyle={styles.lista}
      />
    </Screen>
  );
}

function FilaTorneo({ fila }: { readonly fila: FilaHistorial }) {
  const { colors } = useTheme();
  const podio = fila.puesto !== null && fila.puesto <= 3;
  const record = `${fila.victorias}-${fila.derrotas}`;
  const meta = [fila.fecha ? fechaCorta(fila.fecha) : null, record].filter(Boolean).join(' · ');
  const premio = textoPremio(fila.premio);
  const puestoTexto = fila.enCurso ? 'en curso' : fila.puesto !== null ? `puesto ${fila.puesto}` : 'sin puesto registrado';

  return (
    <View
      style={[styles.fila, { borderBottomColor: colors.line }]}
      accessible
      accessibilityLabel={`${fila.nombre}, ${puestoTexto}, ${fila.victorias} ganadas y ${fila.derrotas} perdidas, premio: ${fila.premio ? premio : 'ninguno'}`}
    >
      <View style={styles.puestoCol}>
        {fila.enCurso ? (
          <Badge label="En curso" tone="gold" />
        ) : (
          <Text style={[styles.puesto, { color: podio ? colors.gold : colors.ink }, tabularNums(17)]}>
            {fila.puesto !== null ? `${fila.puesto}º` : '—'}
          </Text>
        )}
      </View>
      <View style={styles.flex}>
        <Text style={[styles.nombre, { color: colors.ink }]} numberOfLines={2}>
          {fila.nombre}
        </Text>
        <Text style={[styles.meta, { color: colors.dim }, tabularNums(11)]}>{meta}</Text>
      </View>
      <Text style={[styles.premio, { color: fila.premio ? colors.gold : colors.dim }]}>{premio}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lista: { paddingHorizontal: 20, paddingBottom: 32 },
  metricas: { flexDirection: 'row', gap: 8 },
  seccion: { marginTop: 22 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, minHeight: 56 },
  puestoCol: { minWidth: 34 },
  puesto: { fontFamily: Typography.fontFamily.bold, fontSize: 17 },
  nombre: { fontFamily: Typography.fontFamily.medium, fontSize: 13.5 },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 2 },
  premio: { fontFamily: Typography.fontFamily.medium, fontSize: 11, textAlign: 'right', maxWidth: 110 },
});
