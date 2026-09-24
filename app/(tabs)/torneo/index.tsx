import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDocs, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useTheme } from '../../../contexts/ThemeContext';
import { useConfig } from '../../../contexts/ConfigContext';
import { useToast } from '../../../contexts/ToastContext';
import { useUserProfileContext } from '../../../contexts/UserProfileContext';
import { Typography, tabularNums } from '../../../constants/theme';
import { AvisoTorneo, actualizarTorneo, esAvisoTorneo, mensajeTransaccion, useUltimoTorneo } from '../../../hooks/useUltimoTorneo';
import { useReportes } from '../../../hooks/useReportes';
import { useMesasDuelo } from '../../../hooks/useMesasDuelo';
import {
  RESULTADOS,
  Partida,
  Reporte,
  Resultado,
  Standing,
  Torneo,
  aplicarReportes,
  asignarPremios,
  calcularStandings,
  esUltimaRonda,
  estadoTimer,
  formatTimer,
  generarRonda,
  nombreRonda,
  pendientesDe,
  posicionesFinales,
  recordDe,
  reportesDePartida,
  rondaCompleta,
  segundosRestantes,
  timerConExtra,
  timerNuevaRonda,
  timerPausado,
  timerReanudado,
} from '../../../lib/torneo';
import { codigoError, mensajeError } from '../../../lib/errores';
import { advertencia } from '../../../lib/haptics';
import Screen, { LoadingScreen } from '../../../components/Screen';
import Button from '../../../components/Button';
import { Card, EmptyState, ErrorBanner, SectionLabel, SmallButton } from '../../../components/ui';

const SEGUNDOS_TIEMPO_BAJO = 300;
const ERRORES_TRANSITORIOS = ['unavailable', 'aborted', 'deadline-exceeded'];

export default function TorneoScreen() {
  const { torneo, loading, error, reintentar } = useUltimoTorneo();

  if (loading) return <LoadingScreen />;
  if (error) {
    return (
      <Screen title="Torneo">
        <ErrorBanner mensaje={mensajeError(error, 'No se pudo cargar el torneo.')} onRetry={reintentar} />
      </Screen>
    );
  }
  if (!torneo || torneo.estado !== 'en_curso') return <SinTorneo ultimo={torneo} />;
  return <TorneoEnCurso torneo={torneo} />;
}

function SinTorneo({ ultimo }: { readonly ultimo: Torneo | null }) {
  const router = useRouter();
  return (
    <Screen title="Torneo" subtitle="Rondas, reloj y resultados del torneo del día">
      <EmptyState
        title="No hay torneo en curso"
        body={
          ultimo
            ? `El último torneo (${ultimo.nombre}) ya cerró. Podés entregar lo que falte en Premios o armar uno nuevo.`
            : 'Armá el primero en cuatro pasos: juego y formato, reglas, inscriptos y premios.'
        }
        action={
          <View style={styles.emptyActions}>
            <Button label="Nuevo torneo" onPress={() => router.push('/torneo/nuevo')} />
            {ultimo ? (
              <View style={styles.centrado}>
                <SmallButton label="Premios del último torneo" tone="gold" onPress={() => router.push('/premios')} />
              </View>
            ) : null}
          </View>
        }
      />
    </Screen>
  );
}

type Accion = 'resultado' | 'ronda' | 'cierre' | 'descartar' | null;

function TorneoEnCurso({ torneo }: { readonly torneo: Torneo }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { config } = useConfig();
  const { mostrar } = useToast();
  const { profile } = useUserProfileContext();
  const esAdmin = profile?.role === 'admin';

  const ronda = torneo.rondas.find((r) => r.numero === torneo.rondaActual);
  const numeroRonda = torneo.rondaActual;
  const { reportes, error: errorReportes, reintentar: reintentarReportes } = useReportes(torneo.id, numeroRonda);
  const { mesas: mesasDuelo, error: errorMesas, reintentar: reintentarMesas } = useMesasDuelo();

  const [accion, setAccion] = useState<Accion>(null);
  const [verPosiciones, setVerPosiciones] = useState(false);

  const general = useMemo(() => calcularStandings(torneo), [torneo]);
  const porUid = useMemo(() => new Map(general.map((s) => [s.jugador.uid, s])), [general]);
  const tabla = useMemo(
    () => (torneo.formatoId === 'suizo_top_cut' ? calcularStandings(torneo, ['suizo']) : general),
    [torneo, general]
  );

  const pendientes = pendientesDe(ronda);
  const completa = ronda ? rondaCompleta(ronda) : false;
  const ultima = esUltimaRonda(torneo);
  const partidasOrdenadas = useMemo(() => (ronda ? [...ronda.partidas].sort((a, b) => a.mesa - b.mesa) : []), [ronda]);

  const fallar = useCallback(
    (e: unknown, porDefecto: string) => {
      if (esAvisoTorneo(e)) mostrar(e.message, 'info');
      else mostrar(mensajeTransaccion(e, porDefecto), 'error');
    },
    [mostrar]
  );

  // Cuando los dos jugadores reportan lo mismo, el cliente del juez lo escribe (la transacción lo hace idempotente).
  const intentados = useRef(new Set<string>());
  useEffect(() => {
    if (!ronda || !config.reporteJugador) return;
    const aAplicar: { mesa: number; resultado: Resultado }[] = [];
    ronda.partidas.forEach((p) => {
      if (p.resultado !== null || !p.jugador2) return;
      const r = aplicarReportes(p, reportes);
      if (!r) return;
      const clave = `${torneo.id}_${ronda.numero}_${p.mesa}_${r}`;
      if (intentados.current.has(clave)) return;
      intentados.current.add(clave);
      aAplicar.push({ mesa: p.mesa, resultado: r });
    });
    if (aAplicar.length === 0) return;
    actualizarTorneo(torneo.id, (t) => {
      if (t.estado !== 'en_curso' || t.rondaActual !== ronda.numero) return null;
      let cambio = false;
      const rondas = t.rondas.map((r) =>
        r.numero !== ronda.numero
          ? r
          : {
              ...r,
              partidas: r.partidas.map((p) => {
                const a = aAplicar.find((x) => x.mesa === p.mesa);
                if (!a || p.resultado !== null) return p;
                cambio = true;
                return { ...p, resultado: a.resultado };
              }),
            }
      );
      return cambio ? { rondas } : null;
    }).catch((e: unknown) => {
      // Si fue la red, se libera para reintentar con el próximo cambio; si no, se avisa una sola vez.
      if (ERRORES_TRANSITORIOS.includes(codigoError(e) ?? '')) {
        aAplicar.forEach((a) => intentados.current.delete(`${torneo.id}_${ronda.numero}_${a.mesa}_${a.resultado}`));
        return;
      }
      fallar(e, 'No se pudo aplicar el resultado que reportaron los jugadores.');
    });
  }, [ronda, reportes, config.reporteJugador, torneo.id, fallar]);

  const refTorneo = doc(db, 'torneos', torneo.id);

  const cambiarTimer = (campos: CamposTimer) => {
    // Sin await: con mala señal el cambio se ve al instante y se sincroniza después.
    updateDoc(refTorneo, campos).catch((e: unknown) => mostrar(mensajeError(e, 'No se pudo actualizar el reloj.'), 'error'));
  };

  const cargarResultado = async (partida: Partida, resultado: Resultado) => {
    if (accion) return;
    const nuevo = partida.resultado === resultado ? null : resultado;
    setAccion('resultado');
    try {
      await actualizarTorneo(torneo.id, (t) => {
        if (t.estado !== 'en_curso' || t.rondaActual !== numeroRonda) throw new AvisoTorneo('La ronda ya cambió en otro dispositivo.');
        const rondas = t.rondas.map((r) =>
          r.numero !== numeroRonda
            ? r
            : { ...r, partidas: r.partidas.map((p) => (p.mesa === partida.mesa && p.jugador2 ? { ...p, resultado: nuevo } : p)) }
        );
        return { rondas };
      });
    } catch (e) {
      fallar(e, 'No se pudo guardar el resultado.');
    } finally {
      setAccion(null);
    }
  };

  const avanzar = async () => {
    setAccion('ronda');
    try {
      const mesas = mesasDuelo.map((m) => ({ id: m.id, numero: m.numero }));
      await actualizarTorneo(torneo.id, (t) => {
        if (t.estado !== 'en_curso' || t.rondaActual !== numeroRonda) throw new AvisoTorneo('La ronda ya avanzó en otro dispositivo.');
        const actual = t.rondas.find((r) => r.numero === numeroRonda);
        if (!actual || !rondaCompleta(actual)) throw new AvisoTorneo('Todavía faltan resultados en esta ronda.');
        const nueva = generarRonda(t, numeroRonda + 1, mesas);
        return {
          rondaActual: numeroRonda + 1,
          rondas: [...t.rondas.filter((r) => r.numero <= numeroRonda), nueva],
          ...timerNuevaRonda(t.minutosPorRonda, Date.now()),
        };
      });
      mostrar(`Ronda ${numeroRonda + 1} emparejada`, 'ok');
    } catch (e) {
      fallar(e, 'No se pudo emparejar la ronda siguiente.');
    } finally {
      setAccion(null);
    }
  };

  const cerrar = async () => {
    setAccion('cierre');
    try {
      await actualizarTorneo(torneo.id, (t) => {
        if (t.estado !== 'en_curso') throw new AvisoTorneo('El torneo ya estaba cerrado.');
        const actual = t.rondas.find((r) => r.numero === t.rondaActual);
        if (!actual || !rondaCompleta(actual)) throw new AvisoTorneo('Todavía faltan resultados en esta ronda.');
        const posiciones = posicionesFinales(t);
        return {
          estado: 'finalizado',
          posiciones,
          premios: asignarPremios(t.premios, posiciones),
          finalizadoEn: serverTimestamp(),
          rondaFinEn: null,
          rondaRestanteMs: null,
        };
      });
      mostrar('Torneo cerrado. Ya podés entregar los premios.', 'ok');
      router.push('/premios');
    } catch (e) {
      fallar(e, 'No se pudo cerrar el torneo.');
    } finally {
      setAccion(null);
    }
  };

  const descartar = async () => {
    setAccion('descartar');
    try {
      const reportesSnap = await getDocs(collection(db, 'torneos', torneo.id, 'reportes'));
      const refs = reportesSnap.docs.map((d) => d.ref);
      // Un batch admite 500 operaciones: se borra en tandas y el torneo va en la última.
      for (let i = 0; i < refs.length; i += 450) {
        const batch = writeBatch(db);
        refs.slice(i, i + 450).forEach((r) => batch.delete(r));
        await batch.commit();
      }
      const final = writeBatch(db);
      final.delete(refTorneo);
      await final.commit();
      mostrar('Torneo descartado', 'ok');
    } catch (e) {
      mostrar(mensajeError(e, 'No se pudo descartar el torneo.'), 'error');
      setAccion(null);
    }
  };

  const confirmarAvance = () => {
    if (!completa || accion) return;
    if (ultima) {
      Alert.alert('¿Cerrar el torneo?', 'Se guardan las posiciones finales y se asigna cada premio a su puesto. No se puede deshacer.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar torneo', onPress: () => void cerrar() },
      ]);
      return;
    }
    Alert.alert(
      `¿Cerrar la ronda ${numeroRonda}?`,
      `Se empareja la ronda ${numeroRonda + 1} y el reloj vuelve a ${torneo.minutosPorRonda} min.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Emparejar', onPress: () => void avanzar() },
      ]
    );
  };

  const confirmarDescarte = () => {
    advertencia();
    Alert.alert('¿Descartar el torneo?', 'Se borra el torneo en curso con sus rondas, resultados y reportes.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: () =>
          Alert.alert('¿Seguro?', `"${torneo.nombre}" no se puede recuperar después.`, [
            { text: 'No, dejarlo', style: 'cancel' },
            { text: 'Borrar definitivamente', style: 'destructive', onPress: () => void descartar() },
          ]),
      },
    ]);
  };

  const etiquetaAvance = !completa
    ? `Faltan ${pendientes} ${pendientes === 1 ? 'resultado' : 'resultados'}`
    : ultima
      ? 'Cerrar torneo'
      : `Cerrar ronda y emparejar R${numeroRonda + 1}`;

  return (
    <Screen
      eyebrow={`${torneo.formato} · ${torneo.jugadores.length} jugadores`}
      eyebrowTone="gold"
      title={nombreRonda(torneo, ronda)}
      subtitle={`${torneo.nombre} · ${torneo.juego}`}
      right={
        <View style={styles.headerBtns}>
          <SmallButton label="Modo TV" tone="gold" onPress={() => router.push('/tv')} />
          <SmallButton label="Premios" tone="gold" onPress={() => router.push('/premios')} />
        </View>
      }
    >
      <RelojRonda torneo={torneo} onCambiar={cambiarTimer} />

      {errorReportes ? (
        <ErrorBanner
          mensaje={`Reportes de los jugadores: ${mensajeError(errorReportes, 'no se pudieron leer.')}`}
          onRetry={reintentarReportes}
        />
      ) : null}
      {errorMesas ? (
        <ErrorBanner
          mensaje={`Mesas de duelo: ${mensajeError(errorMesas, 'no se pudieron leer.')} La próxima ronda se emparejaría sin mesa del Salón.`}
          onRetry={reintentarMesas}
        />
      ) : null}

      <View style={styles.seccion}>
        <SectionLabel
          right={
            <Text style={[styles.meta, { color: colors.dim }]}>
              {pendientes === 0 ? 'Todas cargadas' : `${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}`}
            </Text>
          }
        >
          Emparejamientos
        </SectionLabel>
        {partidasOrdenadas.length === 0 ? (
          <EmptyState title="Esta ronda no tiene partidas" body="Puede ser un torneo viejo con datos incompletos. Si hace falta, descartalo y armá uno nuevo." />
        ) : (
          partidasOrdenadas.map((p) => (
            <FilaPartida
              key={`${p.mesa}-${p.jugador1.uid}`}
              partida={p}
              standings={porUid}
              reportes={reportes}
              deshabilitado={accion !== null}
              onResultado={(r) => void cargarResultado(p, r)}
            />
          ))
        )}
      </View>

      {torneo.formatoId !== 'casual' ? (
        <View style={styles.seccion}>
          <TouchableOpacity
            style={styles.plegable}
            onPress={() => setVerPosiciones((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Posiciones"
            accessibilityState={{ expanded: verPosiciones }}
          >
            <Text style={[styles.plegableTexto, { color: colors.dim }]}>
              {torneo.formatoId === 'suizo_top_cut' ? 'POSICIONES DEL SUIZO' : 'POSICIONES'}
            </Text>
            <Ionicons name={verPosiciones ? 'chevron-up' : 'chevron-down'} size={16} color={colors.dim} />
          </TouchableOpacity>
          {verPosiciones ? <TablaPosiciones tabla={tabla} /> : null}
        </View>
      ) : null}

      <View style={styles.acciones}>
        <Button
          label={etiquetaAvance}
          onPress={confirmarAvance}
          disabled={!completa}
          loading={accion === 'ronda' || accion === 'cierre'}
        />
        {esAdmin ? (
          <Button label="Descartar torneo" variant="danger" onPress={confirmarDescarte} loading={accion === 'descartar'} disabled={accion !== null && accion !== 'descartar'} />
        ) : null}
      </View>
    </Screen>
  );
}

type CamposTimer = Pick<Torneo, 'rondaPausada' | 'rondaRestanteMs' | 'rondaFinEn'>;

/** El reloj vive aparte para que el tic de cada segundo no vuelva a dibujar toda la lista de mesas. */
function RelojRonda({ torneo, onCambiar }: { readonly torneo: Torneo; readonly onCambiar: (campos: CamposTimer) => void }) {
  const { colors } = useTheme();
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    setAhora(Date.now());
    if (torneo.rondaPausada) return undefined;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [torneo.rondaPausada, torneo.rondaFinEn]);

  const segundos = segundosRestantes(torneo, ahora);
  const estado = estadoTimer(torneo, ahora);
  const textoEstado =
    estado === 'pausado' ? 'Pausada por el juez' : estado === 'extra' ? 'Tiempo extra' : `Ronda en curso · ${torneo.minutosPorRonda} min`;

  return (
    <Card style={styles.timerCard}>
      <Text
        style={[styles.timer, { color: segundos < SEGUNDOS_TIEMPO_BAJO ? colors.dg : colors.ink }, tabularNums(60)]}
        accessibilityRole="timer"
        accessibilityLabel={`Quedan ${Math.floor(segundos / 60)} minutos y ${segundos % 60} segundos`}
      >
        {formatTimer(segundos)}
      </Text>
      <Text style={[styles.timerEstado, { color: estado === 'extra' ? colors.dg : colors.dim }]}>{textoEstado.toUpperCase()}</Text>
      <View style={styles.timerBtns}>
        <View style={styles.flex1}>
          <Button
            label={torneo.rondaPausada ? 'Reanudar' : 'Pausar'}
            onPress={() => onCambiar(torneo.rondaPausada ? timerReanudado(torneo, Date.now()) : timerPausado(torneo, Date.now()))}
          />
        </View>
        {torneo.minutosExtra > 0 ? (
          <View style={styles.flex1}>
            <Button
              label={`+${torneo.minutosExtra} min`}
              variant="secondary"
              accessibilityHint="Suma minutos extra al reloj de la ronda"
              onPress={() => onCambiar(timerConExtra(torneo, torneo.minutosExtra, Date.now()))}
            />
          </View>
        ) : null}
      </View>
      <Text style={[styles.timerNota, { color: colors.dim }]}>
        El reloj es el mismo en los celulares de los jugadores y en el Modo TV. Al llegar a 0 la ronda sigue en tiempo extra hasta que la cierres.
      </Text>
    </Card>
  );
}

interface FilaPartidaProps {
  readonly partida: Partida;
  readonly standings: Map<string, Standing>;
  readonly reportes: readonly Reporte[];
  readonly deshabilitado: boolean;
  readonly onResultado: (r: Resultado) => void;
}

function primerNombre(nombre: string): string {
  return nombre.split(' ')[0] || nombre;
}

function FilaPartida({ partida, standings, reportes, deshabilitado, onResultado }: FilaPartidaProps) {
  const { colors } = useTheme();
  const { jugador1, jugador2 } = partida;
  const salon = partida.mesaSalonNumero ? ` · Salón ${String(partida.mesaSalonNumero).padStart(2, '0')}` : '';

  if (!jugador2) {
    return (
      <View style={[styles.fila, { borderBottomColor: colors.line }]}>
        <Text style={[styles.mesa, { color: colors.dim }, tabularNums(11.5)]}>M{partida.mesa}</Text>
        <View style={styles.flex1}>
          <Text style={[styles.nombres, { color: colors.ink }]}>{jugador1.nombre}</Text>
          <Text style={[styles.meta, { color: colors.dim }]}>Bye · gana 2-0 sin jugar</Text>
        </View>
      </View>
    );
  }

  const { jugador1: r1, jugador2: r2 } = reportesDePartida(partida, reportes);
  let aviso: { texto: string; color: string } | null = null;
  if (r1 && r2 && r1.resultado === r2.resultado) {
    aviso = { texto: `Coinciden: ${r1.resultado}`, color: colors.ok };
  } else if (r1 && r2) {
    aviso = {
      texto: `No coinciden: decidí vos (${primerNombre(jugador1.nombre)} ${r1.resultado} · ${primerNombre(jugador2.nombre)} ${r2.resultado})`,
      color: colors.dg,
    };
  } else {
    const r = r1 ?? r2;
    if (r) aviso = { texto: `${primerNombre(r1 ? jugador1.nombre : jugador2.nombre)} reportó ${r.resultado}`, color: colors.dim };
  }

  return (
    <View style={[styles.fila, { borderBottomColor: colors.line }]}>
      <Text style={[styles.mesa, { color: colors.gold }, tabularNums(11.5)]}>M{partida.mesa}</Text>
      <View style={styles.flex1}>
        <Text style={[styles.nombres, { color: colors.ink }]}>
          {jugador1.nombre} <Text style={[styles.vs, { color: colors.dim }]}>vs</Text> {jugador2.nombre}
        </Text>
        <Text style={[styles.meta, { color: colors.dim }, tabularNums(10.5)]}>
          {recordDe(standings.get(jugador1.uid))} · {recordDe(standings.get(jugador2.uid))}
          {salon}
        </Text>
        <View style={styles.resultados} accessibilityRole="radiogroup">
          {RESULTADOS.map((r) => {
            const activo = partida.resultado === r;
            return (
              <TouchableOpacity
                key={r}
                style={[styles.resultado, { borderColor: activo ? colors.ok : colors.line, backgroundColor: activo ? colors.ok : 'transparent' }]}
                onPress={() => onResultado(r)}
                disabled={deshabilitado}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityLabel={`Mesa ${partida.mesa}: ${jugador1.nombre} ${r} ${jugador2.nombre}`}
                accessibilityHint={activo ? 'Tocá de nuevo para borrar el resultado' : undefined}
                accessibilityState={{ checked: activo, disabled: deshabilitado }}
              >
                <Text style={[styles.resultadoTexto, { color: activo ? colors.bg : colors.dim }, tabularNums(12)]}>{r}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {aviso ? <Text style={[styles.aviso, { color: aviso.color }]}>{aviso.texto}</Text> : null}
      </View>
    </View>
  );
}

function TablaPosiciones({ tabla }: { readonly tabla: readonly Standing[] }) {
  const { colors } = useTheme();
  if (tabla.length === 0) return <Text style={[styles.meta, { color: colors.dim }]}>Todavía no hay resultados cargados.</Text>;
  return (
    <View>
      {tabla.map((s, i) => (
        <View key={s.jugador.uid} style={[styles.posFila, { borderBottomColor: colors.line }]}>
          <Text style={[styles.posNumero, { color: colors.gold }, tabularNums(13)]}>{i + 1}</Text>
          <Text style={[styles.posNombre, { color: colors.ink }]} numberOfLines={1}>
            {s.jugador.nombre}
          </Text>
          <Text style={[styles.posDato, { color: colors.ink }, tabularNums(12.5)]}>{s.puntos} pts</Text>
          <Text style={[styles.posRecord, { color: colors.dim }, tabularNums(12)]}>{recordDe(s)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  centrado: { alignItems: 'center' },
  emptyActions: { gap: 14 },
  headerBtns: { flexDirection: 'row', gap: 6 },
  timerCard: { alignItems: 'center', borderRadius: 18, paddingVertical: 20, paddingHorizontal: 16 },
  timer: { fontFamily: Typography.fontFamily.light, fontSize: 60, lineHeight: 68 },
  timerEstado: { fontFamily: Typography.fontFamily.semibold, fontSize: 10.5, letterSpacing: 1.5, marginTop: 8 },
  timerBtns: { flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' },
  timerNota: { fontFamily: Typography.fontFamily.regular, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 12 },
  seccion: { marginTop: 22 },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 2 },
  fila: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  mesa: { fontFamily: Typography.fontFamily.semibold, fontSize: 11.5, minWidth: 30, paddingTop: 2 },
  nombres: { fontFamily: Typography.fontFamily.medium, fontSize: 13.5, lineHeight: 18 },
  vs: { fontFamily: Typography.fontFamily.regular },
  resultados: { flexDirection: 'row', gap: 6, marginTop: 10 },
  resultado: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  resultadoTexto: { fontFamily: Typography.fontFamily.semibold, fontSize: 12 },
  aviso: { fontFamily: Typography.fontFamily.semibold, fontSize: 11.5, marginTop: 8, lineHeight: 16 },
  plegable: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  plegableTexto: { fontFamily: Typography.fontFamily.bold, fontSize: 10, letterSpacing: 1.6 },
  posFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  posNumero: { fontFamily: Typography.fontFamily.bold, fontSize: 13, minWidth: 22 },
  posNombre: { flex: 1, fontFamily: Typography.fontFamily.medium, fontSize: 13 },
  posDato: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
  posRecord: { fontFamily: Typography.fontFamily.regular, fontSize: 12, minWidth: 34, textAlign: 'right' },
  acciones: { marginTop: 22, gap: 10 },
});
