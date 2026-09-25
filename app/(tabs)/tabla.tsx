import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import Screen, { LoadingScreen } from '../../components/Screen';
import { EmptyState, ErrorBanner } from '../../components/ui';
import { useTheme } from '../../contexts/ThemeContext';
import { useConfig } from '../../contexts/ConfigContext';
import { useUserProfileContext } from '../../contexts/UserProfileContext';
import { Typography, tabularNums } from '../../constants/theme';
import { MAX_TORNEOS_SIN_INICIO, useTemporada } from '../../hooks/useTemporada';
import { type FilaTemporada } from '../../lib/temporada';
import { MENSAJE_FALTA_INDICE, mensajeError } from '../../lib/errores';

export default function TablaScreen() {
  const { colors } = useTheme();
  const { config } = useConfig();
  const { user } = useUserProfileContext();
  const miUid = user?.uid ?? null;
  const { filas, fechas, cargando, error, faltaIndice, recortada, reintentar } = useTemporada();
  const temporada = config.temporada.nombre;

  const renderItem = useCallback<ListRenderItem<FilaTemporada>>(
    ({ item }) => <FilaTabla fila={item} soyYo={item.uid === miUid} />,
    [miUid]
  );

  if (cargando && filas.length === 0) return <LoadingScreen />;

  const estoyEnLaTabla = !!miUid && filas.some((f) => f.uid === miUid);

  const resumen = (
    <View style={styles.resumen}>
      <Text style={[styles.resumenTexto, { color: colors.dim }, tabularNums(11)]} numberOfLines={2}>
        {`${temporada} · ${fechas} ${fechas === 1 ? 'fecha' : 'fechas'}`}
      </Text>
    </View>
  );

  const pie =
    filas.length > 0 ? (
      <View style={styles.pie}>
        {estoyEnLaTabla ? null : (
          <Text style={[styles.pieTexto, { color: colors.ink }]}>Todavía no sumaste puntos en {temporada}.</Text>
        )}
        <Text style={[styles.pieTexto, { color: colors.dim }]}>
          Los puntos de {temporada} se suman cuando se cierra cada torneo.
        </Text>
        {recortada ? (
          <Text style={[styles.pieTexto, { color: colors.dim }]}>
            Se cuentan los últimos {MAX_TORNEOS_SIN_INICIO} torneos. El admin puede fijar el inicio de la temporada en Ajustes.
          </Text>
        ) : null}
      </View>
    ) : null;

  return (
    <Screen title="Clasificación" right={error && filas.length === 0 ? undefined : resumen} scroll={false} divider>
      <FlatList
        data={filas}
        keyExtractor={(f) => f.uid}
        renderItem={renderItem}
        ListHeaderComponent={
          error ? (
            <ErrorBanner
              mensaje={faltaIndice ? MENSAJE_FALTA_INDICE : mensajeError(error, 'No pudimos cargar la tabla.')}
              onRetry={reintentar}
            />
          ) : null
        }
        ListEmptyComponent={
          error ? null : (
            <EmptyState
              title={`Todavía no hay torneos cerrados en ${temporada}`}
            />
          )
        }
        ListFooterComponent={pie}
        ItemSeparatorComponent={Separador}
        contentContainerStyle={styles.lista}
      />
    </Screen>
  );
}

function Separador() {
  return <View style={styles.separador} />;
}

function FilaTabla({ fila, soyYo }: { readonly fila: FilaTemporada; readonly soyYo: boolean }) {
  const { colors } = useTheme();
  const acento = soyYo ? colors.br : fila.posicion <= 3 ? colors.gold : colors.ink;
  const nombre = soyYo ? `Vos · ${fila.nombre}` : fila.nombre;

  return (
    <View
      style={[
        styles.fila,
        { backgroundColor: soyYo ? colors.brs : 'transparent', borderColor: soyYo ? colors.br : 'transparent' },
      ]}
      accessible
      accessibilityLabel={`Puesto ${fila.posicion}, ${soyYo ? `vos, ${fila.nombre}` : fila.nombre}, ${fila.puntos} puntos, ${fila.victorias} ganadas y ${fila.derrotas} perdidas`}
    >
      <Text style={[styles.posicion, { color: acento }, tabularNums(15)]}>{fila.posicion}</Text>
      <View style={styles.flex}>
        <Text
          style={[styles.nombre, { color: colors.ink, fontFamily: soyYo ? Typography.fontFamily.bold : Typography.fontFamily.medium }]}
          numberOfLines={1}
        >
          {nombre}
        </Text>
        <Text style={[styles.record, { color: colors.dim }, tabularNums(11)]}>
          {fila.victorias}-{fila.derrotas}
        </Text>
      </View>
      <Text style={[styles.puntos, { color: acento }, tabularNums(15)]}>{fila.puntos}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lista: { paddingHorizontal: 20, paddingBottom: 32 },
  separador: { height: 6 },
  resumen: { paddingTop: 10, maxWidth: 170 },
  resumenTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 11, textAlign: 'right' },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 56,
  },
  posicion: { fontFamily: Typography.fontFamily.bold, fontSize: 15, minWidth: 24 },
  nombre: { fontSize: 13.5 },
  record: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 2 },
  puntos: { fontFamily: Typography.fontFamily.bold, fontSize: 15 },
  pie: { marginTop: 16, gap: 6 },
  pieTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, lineHeight: 18 },
});
