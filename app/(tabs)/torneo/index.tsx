import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDocsFromServer, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
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
  describirResultado,
  asignarPremios,
  conNombresUnicos,
  crearRng,
  nuevaSemilla,
  etiquetaMesa,
  calcularStandings,
  esUltimaRonda,
  generarRonda,
  nombreRonda,
  pendientesDe,
  posicionesFinales,
  recordDe,
  reportesDePartida,
  rondaCompleta,
  timerConExtra,
  timerNuevaRonda,
  timerPausado,
  timerReanudado,
} from '../../../lib/torneo';
import { ahoraServidor } from '../../../lib/reloj';
import { describirReloj } from '../../../lib/relojRonda';
import { codigoError, mensajeError } from '../../../lib/errores';
import { advertencia } from '../../../lib/haptics';
import Screen, { LoadingScreen } from '../../../components/Screen';
import { tocar } from '../../../lib/haptics';
import SoloParaRoles from '../../../components/SoloParaRoles';
import Button from '../../../components/Button';
import { Card, EmptyState, ErrorBanner, SectionLabel, SmallButton } from '../../../components/ui';
import { preguntar } from '../../../lib/dialogo';

const ERRORES_TRANSITORIOS = ['unavailable', 'aborted', 'deadline-exceeded'];

export default function TorneoScreen() {
  return (
    <SoloParaRoles roles={['admin', 'juez']} titulo="Torneo">
      <TorneoPantalla />
    </SoloParaRoles>
  );
}

function TorneoPantalla() {
  const { torneo: leido, loading, error, reintentar } = useUltimoTorneo();
  const torneo = useMemo(() => (leido ? conNombresUnicos(leido) : null), [leido]);

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
    <Screen title="Torneo">
      <EmptyState
        title="No hay torneo en curso"
        body={ultimo ? `Último: ${ultimo.nombre}` : undefined}
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

type Accion = 'ronda' | 'cierre' | 'descartar' | null;

// Si el torneo no llega a reflejar un resultado guardado (listener caído), la fila se libera igual.
const TOPE_EN_VUELO_MS = 10_000;

function TorneoEnCurso({ torneo }: { readonly torneo: Torneo }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { config } = useConfig();
  const { mostrar } = useToast();
  const { profile } = useUserProfileContext();
  const esAdmin = profile?.role === 'admin';

  const ronda = torneo.rondas.find((r) => r.numero === torneo.rondaActual);
  const numeroRonda = torneo.rondaActual;
  const { reportes, cargando: cargandoReportes, error: errorReportes, reintentar: reintentarReportes } = useReportes(torneo.id, numeroRonda);
  const { mesas: mesasDuelo, error: errorMesas, reintentar: reintentarMesas } = useMesasDuelo();

  const [accion, setAccion] = useState<Accion>(null);
  // Resultado que el juez acaba de tocar, por mesa, mientras se guarda: se ve al instante y cada mesa
  // se guarda por su cuenta (antes un toque en otra mesa se ignoraba en silencio).
  const [enVuelo, setEnVuelo] = useState<Record<number, Resultado | null>>({});
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
    if (!ronda || !config.reporteJugador || cargandoReportes) return;
    const aAplicar: { mesa: number; resultado: Resultado; uid1: string; uid2: string }[] = [];
    ronda.partidas.forEach((p) => {
      if (p.resultado !== null || !p.jugador2) return;
      const r = aplicarReportes(p, reportes, ronda.numero);
      if (!r) return;
      const clave = `${torneo.id}_${ronda.numero}_${p.mesa}_${r}`;
      if (intentados.current.has(clave)) return;
      intentados.current.add(clave);
      aAplicar.push({ mesa: p.mesa, resultado: r, uid1: p.jugador1.uid, uid2: p.jugador2.uid });
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
                // Solo si sigue siendo la misma pareja y nadie la tocó a mano mientras tanto.
                if (!a || p.resultado !== null || p.manual || p.jugador1.uid !== a.uid1 || p.jugador2?.uid !== a.uid2) return p;
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
  }, [ronda, reportes, cargandoReportes, config.reporteJugador, torneo.id, fallar]);

  const refTorneo = doc(db, 'torneos', torneo.id);

  const cambiarTimer = (campos: CamposTimer) => {
    // Sin await: con mala señal el cambio se ve al instante y se sincroniza después.
    updateDoc(refTorneo, campos).catch((e: unknown) => mostrar(mensajeError(e, 'No se pudo actualizar el reloj.'), 'error'));
  };

  const soltarEnVuelo = useCallback((mesa: number) => {
    setEnVuelo((prev) => {
      if (!(mesa in prev)) return prev;
      const copia = { ...prev };
      delete copia[mesa];
      return copia;
    });
  }, []);

  // Cuando el torneo ya trae el resultado guardado, deja de estar en vuelo.
  useEffect(() => {
    for (const [mesa, valor] of Object.entries(enVuelo)) {
      const p = ronda?.partidas.find((x) => x.mesa === Number(mesa));
      if (!p || p.resultado === valor) soltarEnVuelo(Number(mesa));
    }
  }, [ronda, enVuelo, soltarEnVuelo]);

  const guardarResultado = async (partida: Partida, nuevo: Resultado | null) => {
    const mesa = partida.mesa;
    setEnVuelo((prev) => ({ ...prev, [mesa]: nuevo }));
    try {
      await actualizarTorneo(torneo.id, (t) => {
        if (t.estado !== 'en_curso' || t.rondaActual !== numeroRonda) throw new AvisoTorneo('La ronda ya cambió en otro dispositivo.');
        const rondas = t.rondas.map((r) =>
          r.numero !== numeroRonda
            ? r
            : { ...r, partidas: r.partidas.map((p) => (p.mesa === mesa && p.jugador2 ? { ...p, resultado: nuevo, manual: true } : p)) }
        );
        return { rondas };
      });
      // La transacción no actualiza la caché local: el valor queda "en vuelo" hasta que llega en el torneo.
      setTimeout(() => soltarEnVuelo(mesa), TOPE_EN_VUELO_MS);
    } catch (e) {
      fallar(e, 'No se pudo guardar el resultado.');
      soltarEnVuelo(mesa);
    }
  };

  const cargarResultado = (partida: Partida, resultado: Resultado) => {
    if (accion || partida.mesa in enVuelo) return;
    if (partida.resultado !== resultado) {
      void guardarResultado(partida, resultado);
      return;
    }
    // Borrar es la excepción: se pregunta, así un doble toque no deshace lo que se acaba de cargar.
    preguntar(`Borrar el resultado de ${etiquetaMesa(partida).larga}`, 'La partida vuelve a quedar sin resultado.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => void guardarResultado(partida, null) },
    ]);
  };

  const avanzar = async () => {
    setAccion('ronda');
    try {
      const mesas = mesasDuelo.map((m) => ({ id: m.id, numero: m.numero }));
      await actualizarTorneo(torneo.id, (t) => {
        if (t.estado !== 'en_curso' || t.rondaActual !== numeroRonda) throw new AvisoTorneo('La ronda ya avanzó en otro dispositivo.');
        const actual = t.rondas.find((r) => r.numero === numeroRonda);
        if (!actual || !rondaCompleta(actual)) throw new AvisoTorneo('Todavía faltan resultados en esta ronda.');
        // La semilla queda guardada: el sorteo de la ronda se puede reproducir si alguien lo cuestiona.
        const semilla = nuevaSemilla();
        const nueva = { ...generarRonda(t, numeroRonda + 1, mesas, crearRng(semilla)), semilla };
        return {
          rondaActual: numeroRonda + 1,
          rondas: [...t.rondas.filter((r) => r.numero <= numeroRonda), nueva],
          ...timerNuevaRonda(t.minutosPorRonda, ahoraServidor()),
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
      }, async (tx, t) => {
        // Se libera el candado de torneo en curso (ver Nuevo torneo) si apuntaba a este.
        const refCandado = doc(db, 'bloqueos', 'torneo');
        const candado = await tx.get(refCandado);
        if (candado.exists() && candado.get('torneoId') === t.id) tx.set(refCandado, { torneoId: null, actualizadoEn: serverTimestamp() });
      });
      mostrar('Torneo cerrado. Ya podés entregar los premios.', 'ok');
      router.push({ pathname: '/premios', params: { torneoId: torneo.id } });
    } catch (e) {
      fallar(e, 'No se pudo cerrar el torneo.');
    } finally {
      setAccion(null);
    }
  };

  const descartar = async () => {
    setAccion('descartar');
    try {
      // Del servidor: sin señal falla en el acto (con la caché se borraría solo lo que quedó guardado local).
      const reportesSnap = await getDocsFromServer(collection(db, 'torneos', torneo.id, 'reportes'));
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
    if (!completa || accion || Object.keys(enVuelo).length > 0) return;
    if (ultima) {
      preguntar('¿Cerrar el torneo?', 'Se guardan las posiciones finales y se asigna cada premio a su puesto. No se puede deshacer.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar torneo', onPress: () => void cerrar() },
      ]);
      return;
    }
    preguntar(
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
    preguntar('¿Descartar el torneo?', 'Se borra el torneo en curso con sus rondas, resultados y reportes.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: () =>
          preguntar('¿Seguro?', `"${torneo.nombre}" no se puede recuperar después.`, [
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
      acciones={
        <>
          <SmallButton label="Modo TV" tone="gold" onPress={() => router.push('/tv')} />
          <SmallButton label="Premios" tone="gold" onPress={() => router.push('/premios')} />
        </>
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
              ronda={numeroRonda}
              deshabilitado={accion !== null}
              enVuelo={p.mesa in enVuelo ? { resultado: enVuelo[p.mesa] } : null}
              onResultado={(r) => cargarResultado(p, r)}
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
          disabled={!completa || Object.keys(enVuelo).length > 0}
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
  const [ahora, setAhora] = useState(() => ahoraServidor());

  useEffect(() => {
    setAhora(ahoraServidor());
    if (torneo.rondaPausada) return undefined;
    const id = setInterval(() => setAhora(ahoraServidor()), 1000);
    return () => clearInterval(id);
  }, [torneo.rondaPausada, torneo.rondaFinEn]);

  const reloj = describirReloj(torneo, ahora);

  return (
    <Card style={styles.timerCard}>
      <Text
        style={[styles.timer, { color: reloj.fase === 'extra' || reloj.bajo ? colors.dg : colors.ink }, tabularNums(60)]}
        accessibilityRole="timer"
        accessibilityLabel={reloj.accesible}
      >
        {reloj.reloj}
      </Text>
      <Text style={[styles.timerEstado, { color: reloj.fase === 'extra' ? colors.dg : colors.dim }]}>{reloj.estado.toUpperCase()}</Text>
      <View style={styles.timerBtns}>
        <View style={styles.flex1}>
          <Button
            label={torneo.rondaPausada ? 'Reanudar' : 'Pausar'}
            onPress={() => onCambiar(torneo.rondaPausada ? timerReanudado(torneo, ahoraServidor()) : timerPausado(torneo, ahoraServidor()))}
          />
        </View>
        {torneo.minutosExtra > 0 ? (
          <View style={styles.flex1}>
            <Button
              label={`+${torneo.minutosExtra} min`}
              variant="secondary"
              accessibilityHint="Suma minutos extra al reloj de la ronda"
              onPress={() => onCambiar(timerConExtra(torneo, torneo.minutosExtra, ahoraServidor()))}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

interface FilaPartidaProps {
  readonly partida: Partida;
  readonly standings: Map<string, Standing>;
  readonly reportes: readonly Reporte[];
  readonly ronda: number;
  readonly deshabilitado: boolean;
  /** Resultado que se está guardando para esta mesa (se muestra ya elegido). */
  readonly enVuelo: { resultado: Resultado | null } | null;
  readonly onResultado: (r: Resultado) => void;
}

function primerNombre(nombre: string): string {
  return nombre.split(' ')[0] || nombre;
}

function FilaPartida({ partida, standings, reportes, ronda, deshabilitado, enVuelo, onResultado }: FilaPartidaProps) {
  const { colors } = useTheme();
  const { jugador1, jugador2 } = partida;
  const etiqueta = etiquetaMesa(partida);

  if (!jugador2) {
    return (
      <View style={[styles.fila, { borderBottomColor: colors.line }]}>
        <Text style={[styles.mesa, { color: colors.dim }, tabularNums(11.5)]}>—</Text>
        <View style={styles.flex1}>
          <Text style={[styles.nombres, { color: colors.ink }]}>{jugador1.nombre}</Text>
          <Text style={[styles.meta, { color: colors.dim }]}>Bye · gana 2-0 sin jugar</Text>
        </View>
      </View>
    );
  }

  const { jugador1: r1, jugador2: r2 } = reportesDePartida(partida, reportes, ronda);
  let aviso: { texto: string; color: string } | null = null;
  if (partida.manual && partida.resultado === null && (r1 || r2)) {
    aviso = { texto: 'Borraste el resultado: lo que reporten los jugadores ya no se aplica solo.', color: colors.dim };
  } else if (r1 && r2 && r1.resultado === r2.resultado) {
    aviso = { texto: `Coinciden: ${describirResultado(partida, r1.resultado)}`, color: colors.ok };
  } else if (r1 && r2) {
    aviso = {
      texto: `No coinciden, decidí vos: ${primerNombre(jugador1.nombre)} dice ${describirResultado(partida, r1.resultado)} · ${primerNombre(jugador2.nombre)} dice ${describirResultado(partida, r2.resultado)}`,
      color: colors.dg,
    };
  } else {
    const r = r1 ?? r2;
    if (r) aviso = { texto: `${primerNombre(r1 ? jugador1.nombre : jugador2.nombre)} reportó: ${describirResultado(partida, r.resultado)}`, color: colors.dim };
  }

  return (
    <View style={[styles.fila, { borderBottomColor: colors.line }]}>
      <Text style={[styles.mesa, { color: etiqueta.enSalon ? colors.gold : colors.dim }, tabularNums(11.5)]} accessibilityLabel={etiqueta.larga}>
        {etiqueta.corta}
      </Text>
      <View style={styles.flex1}>
        <Text style={[styles.nombres, { color: colors.ink }]}>
          {jugador1.nombre} <Text style={[styles.vs, { color: colors.dim }]}>vs</Text> {jugador2.nombre}
        </Text>
        <Text style={[styles.meta, { color: colors.dim }, tabularNums(10.5)]}>
          {recordDe(standings.get(jugador1.uid))} · {recordDe(standings.get(jugador2.uid))}
          {etiqueta.enSalon ? '' : ' · sin mesa asignada'}
        </Text>
        <View style={styles.resultados} accessibilityRole="radiogroup">
          {RESULTADOS.map((r) => {
            const activo = (enVuelo ? enVuelo.resultado : partida.resultado) === r;
            return (
              <TouchableOpacity
                key={r}
                style={[styles.resultado, { borderColor: activo ? colors.ok : colors.line, backgroundColor: activo ? colors.ok : 'transparent' }]}
                onPress={() => {
                  tocar();
                  onResultado(r);
                }}
                disabled={deshabilitado || !!enVuelo}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityLabel={`${etiqueta.larga}: ${jugador1.nombre} ${r} ${jugador2.nombre}`}
                accessibilityHint={activo ? 'Tocá de nuevo para borrar el resultado' : undefined}
                accessibilityState={{ checked: activo, disabled: deshabilitado || !!enVuelo, busy: !!enVuelo }}
              >
                <Text style={[styles.resultadoTexto, { color: activo ? colors.onOk : colors.dim }, tabularNums(12)]}>{r}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {enVuelo ? (
          <Text style={[styles.aviso, { color: colors.dim }]} accessibilityLiveRegion="polite">
            Guardando…
          </Text>
        ) : aviso ? (
          <Text style={[styles.aviso, { color: aviso.color }]}>{aviso.texto}</Text>
        ) : null}
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
  timerCard: { alignItems: 'center', borderRadius: 18, paddingVertical: 20, paddingHorizontal: 16 },
  timer: { fontFamily: Typography.display.light, fontSize: 60, lineHeight: 68 },
  timerEstado: { fontFamily: Typography.fontFamily.semibold, fontSize: 10.5, letterSpacing: 1.5, marginTop: 8 },
  timerBtns: { flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' },
  seccion: { marginTop: 22 },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 2 },
  fila: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  mesa: { fontFamily: Typography.display.semibold, fontSize: 11.5, minWidth: 30, paddingTop: 2 },
  nombres: { fontFamily: Typography.fontFamily.medium, fontSize: 13.5, lineHeight: 18 },
  vs: { fontFamily: Typography.fontFamily.regular },
  resultados: { flexDirection: 'row', gap: 6, marginTop: 10 },
  resultado: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  resultadoTexto: { fontFamily: Typography.display.semibold, fontSize: 12 },
  aviso: { fontFamily: Typography.fontFamily.semibold, fontSize: 11.5, marginTop: 8, lineHeight: 16 },
  plegable: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  plegableTexto: { fontFamily: Typography.fontFamily.bold, fontSize: 10, letterSpacing: 1.6 },
  posFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  posNumero: { fontFamily: Typography.display.bold, fontSize: 13, minWidth: 22 },
  posNombre: { flex: 1, fontFamily: Typography.fontFamily.medium, fontSize: 13 },
  posDato: { fontFamily: Typography.display.semibold, fontSize: 12.5 },
  posRecord: { fontFamily: Typography.display.regular, fontSize: 12, minWidth: 34, textAlign: 'right' },
  acciones: { marginTop: 22, gap: 10 },
});
