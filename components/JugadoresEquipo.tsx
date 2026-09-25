import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { collection, doc, limit, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { Typography, tabularNums } from '../constants/theme';
import { useBuscarJugadores } from '../hooks/useDirectorioJugadores';
import { mensajeError } from '../lib/errores';
import { AVISO_SIN_SENAL, ESPERA_ESCRITURA_MS, esperarConfirmacion } from '../lib/escritura';
import { JugadorDirectorio, etiquetasDesambiguadas, normalizarJugadorDirectorio } from '../lib/jugadores';
import { formatARS } from '../lib/pedido';
import FormField from './FormField';
import { Card, ErrorBanner, SectionLabel, SmallButton } from './ui';
import { preguntar } from '../lib/dialogo';

// Cuentas de jugador (Ajustes > Equipo). Los jugadores entran sin aprobación: si alguien crea
// cuentas falsas o molesta, el admin la bloquea. El bloqueo no borra nada (ni su crédito):
// pierde el acceso y deja de aparecer en las búsquedas del staff hasta que se lo reactive.

const MAX_RESULTADOS = 15;
const MAX_BLOQUEADOS = 50;

function useJugadoresBloqueados(): { bloqueados: JugadorDirectorio[]; error: unknown } {
  const [estado, setEstado] = useState<{ bloqueados: JugadorDirectorio[]; error: unknown }>({ bloqueados: [], error: null });
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'jugadores'), where('activo', '==', false), limit(MAX_BLOQUEADOS)),
        (snap) => setEstado({ bloqueados: snap.docs.map((d) => normalizarJugadorDirectorio(d.id, d.data())), error: null }),
        (e) => setEstado((prev) => ({ ...prev, error: e }))
      ),
    []
  );
  return estado;
}

export default function JugadoresEquipo() {
  const { colors } = useTheme();
  const { mostrar } = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const buscados = useBuscarJugadores({ activo: true, busqueda, limite: MAX_RESULTADOS });
  const { bloqueados, error: errorBloqueados } = useJugadoresBloqueados();
  const idsBloqueados = useMemo(() => new Set(bloqueados.map((j) => j.uid)), [bloqueados]);
  const activos = buscados.jugadores.filter((j) => !idsBloqueados.has(j.uid));
  const etiquetas = useMemo(() => etiquetasDesambiguadas([...activos, ...bloqueados]), [activos, bloqueados]);

  const cambiarAcceso = async (j: JugadorDirectorio, bloquear: boolean) => {
    setOcupado(j.uid);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', j.uid), { estadoAprobacion: bloquear ? 'rechazado' : 'aprobado' });
      batch.update(doc(db, 'jugadores', j.uid), { activo: !bloquear });
      const r = await esperarConfirmacion(batch.commit(), ESPERA_ESCRITURA_MS, (e) =>
        mostrar(mensajeError(e, 'No se pudo guardar el cambio.'), 'error')
      );
      const texto = bloquear ? `${j.nombre} quedó bloqueado` : `${j.nombre} puede volver a entrar`;
      mostrar(r === 'pendiente' ? `${texto}. ${AVISO_SIN_SENAL}` : texto, r === 'pendiente' ? 'info' : 'ok');
    } catch (e) {
      mostrar(mensajeError(e, 'No se pudo guardar el cambio.'), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const confirmarBloqueo = (j: JugadorDirectorio) => {
    preguntar(
      `¿Bloquear a ${etiquetas.get(j.uid) ?? j.nombre}?`,
      'No va a poder entrar a la app y deja de aparecer en las búsquedas del staff. Su historial y su crédito se conservan: podés reactivarlo cuando quieras.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Bloquear', style: 'destructive', onPress: () => void cambiarAcceso(j, true) },
      ]
    );
  };

  const fila = (j: JugadorDirectorio, bloqueado: boolean) => (
    <View key={j.uid} style={[styles.fila, { borderBottomColor: colors.line }]}>
      <View style={styles.textos}>
        <Text style={[styles.nombre, { color: bloqueado ? colors.dim : colors.ink }]} numberOfLines={1}>
          {etiquetas.get(j.uid) ?? j.nombre}
        </Text>
        <Text style={[styles.meta, { color: colors.dim }, tabularNums(11)]}>
          {j.credito > 0 ? `Crédito ${formatARS(j.credito)}` : 'Sin crédito'}
          {bloqueado ? ' · bloqueado' : ''}
        </Text>
      </View>
      {ocupado === j.uid ? (
        <ActivityIndicator color={colors.dim} accessibilityLabel="Guardando" />
      ) : bloqueado ? (
        <SmallButton label="Reactivar" onPress={() => void cambiarAcceso(j, false)} disabled={ocupado !== null} />
      ) : (
        <SmallButton label="Bloquear" tone="dg" onPress={() => confirmarBloqueo(j)} disabled={ocupado !== null} />
      )}
    </View>
  );

  return (
    <View>
      <SectionLabel>Jugadores</SectionLabel>
      <Card>
        <FormField
          label="Buscar jugador"
          placeholder="Nombre con el que se registró"
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={40}
        />
        {buscados.error ? (
          <ErrorBanner mensaje={mensajeError(buscados.error, 'No se pudo cargar la lista de jugadores.')} onRetry={buscados.reintentar} />
        ) : buscados.cargando ? (
          <ActivityIndicator color={colors.br} style={styles.cargando} accessibilityLabel="Buscando jugadores" />
        ) : activos.length === 0 ? (
          <Text style={[styles.meta, { color: colors.dim }]}>{busqueda.trim() ? 'Nadie con ese nombre.' : 'Todavía no hay jugadores.'}</Text>
        ) : (
          activos.map((j) => fila(j, false))
        )}
        {errorBloqueados ? <ErrorBanner mensaje={mensajeError(errorBloqueados, 'No se pudo cargar la lista de bloqueados.')} /> : null}
        {bloqueados.length > 0 ? (
          <View style={styles.bloqueados}>
            <Text style={[styles.subtitulo, { color: colors.dim }]}>BLOQUEADOS</Text>
            {bloqueados.map((j) => fila(j, true))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, minHeight: 52 },
  textos: { flex: 1 },
  nombre: { fontFamily: Typography.fontFamily.semibold, fontSize: 13.5 },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, marginTop: 2 },
  cargando: { marginVertical: 12 },
  bloqueados: { marginTop: 14 },
  subtitulo: { fontFamily: Typography.fontFamily.bold, fontSize: 10, letterSpacing: 1.6, marginBottom: 2 },
});
