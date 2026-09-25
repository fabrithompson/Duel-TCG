import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Screen, { LoadingScreen } from '../../components/Screen';
import Button from '../../components/Button';
import Avatar from '../../components/Avatar';
import { Card, EmptyState, ErrorBanner, SectionLabel } from '../../components/ui';
import { useTheme } from '../../contexts/ThemeContext';
import { useConfig } from '../../contexts/ConfigContext';
import { useToast } from '../../contexts/ToastContext';
import { useUserProfileContext } from '../../contexts/UserProfileContext';
import { Typography, tabularNums } from '../../constants/theme';
import { reportarResultado, useMiDuelo, useReportesPartida } from '../../hooks/useMiDuelo';
import { useMiCredito } from '../../hooks/useDirectorioJugadores';
import { ahoraServidor } from '../../lib/reloj';
import { describirReloj } from '../../lib/relojRonda';
import { RESULTADOS, calcularStandings, etiquetaMesa, nombreRonda, recordDe, type Resultado, type Standing, type Torneo } from '../../lib/torneo';
import {
  esVictoria,
  miPartidaActual,
  resultadoParaJugador,
  type MiPartida,
} from '../../lib/temporada';
import { formatARS } from '../../lib/pedido';
import { MENSAJE_FALTA_INDICE, codigoError, esFaltaDeIndice, mensajeError } from '../../lib/errores';
import { advertencia, tocar } from '../../lib/haptics';
import { fechaDeNegocio } from '../../lib/fecha';
import { confirmar } from '../../lib/dialogo';

/** Pasado este tiempo sin respuesta del servidor, el reporte queda en la cola offline de Firestore. */
const ESPERA_MAXIMA_MS = 10_000;

function marcador(r: Resultado): string {
  return r.replace('-', '–');
}

function detalleMarcador(r: Resultado): string {
  const [mios, suyos] = r.split('-');
  return `${esVictoria(r) ? 'Ganaste' : 'Perdiste'} ${mios} a ${suyos}`;
}

// En los casuales no hay puntaje: solo el récord de la noche.
function textoRecord(s: Standing | undefined, conPuntos: boolean): string {
  return conPuntos ? `${recordDe(s)} · ${s?.puntos ?? 0} pts` : recordDe(s);
}

function textosSinPartida(torneo: Torneo): { titulo: string; cuerpo: string } {
  const ronda = torneo.rondas.find((r) => r.numero === torneo.rondaActual);
  if (!ronda || ronda.partidas.length === 0) {
    return {
      titulo: `Todavía no se armó la ronda ${torneo.rondaActual}`,
      cuerpo: 'Apenas el juez empareje la ronda, acá aparecen tu mesa y tu rival.',
    };
  }
  if (ronda.fase === 'eliminacion') {
    return {
      titulo: 'No jugás esta ronda de la llave',
      cuerpo: 'Tu puesto final aparece en tu historial cuando el juez cierre el torneo.',
    };
  }
  return {
    titulo: `No tenés partida en la ronda ${torneo.rondaActual}`,
    cuerpo: 'Si creés que es un error, avisale al juez.',
  };
}

function creditoValido(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.max(0, valor) : 0;
}

export default function DueloScreen() {
  const router = useRouter();
  const { config } = useConfig();
  const { user, profile } = useUserProfileContext();
  const uid = user?.uid ?? null;
  const { torneo, cargando, error, reintentar } = useMiDuelo(uid);
  const { credito: miCredito } = useMiCredito(uid);

  if (cargando) return <LoadingScreen />;

  const credito = creditoValido(miCredito);
  const avatar = <BotonCuenta fotoUrl={profile?.fotoUrl} onPress={() => router.push('/cuenta')} />;
  const creditoCard = config.creditoPremio || credito > 0 ? <CreditoBarra monto={credito} /> : null;
  const errorBanner = error ? (
    <ErrorBanner
      mensaje={esFaltaDeIndice(error) ? MENSAJE_FALTA_INDICE : mensajeError(error, 'No pudimos cargar tu torneo.')}
      onRetry={reintentar}
    />
  ) : null;

  if (!uid || !torneo || torneo.estado !== 'en_curso') {
    return (
      <Screen title="Mi duelo" right={avatar} divider>
        {errorBanner}
        {error ? null : <SinTorneo ultimo={torneo} uid={uid} />}
        {creditoCard}
      </Screen>
    );
  }

  return <DueloEnCurso torneo={torneo} uid={uid} avatar={avatar} errorBanner={errorBanner} creditoCard={creditoCard} />;
}

interface DueloEnCursoProps {
  readonly torneo: Torneo;
  readonly uid: string;
  readonly avatar: React.ReactNode;
  readonly errorBanner: React.ReactNode;
  readonly creditoCard: React.ReactNode;
}

function DueloEnCurso({ torneo, uid, avatar, errorBanner, creditoCard }: DueloEnCursoProps) {
  const { config } = useConfig();
  const mia = useMemo(() => miPartidaActual(torneo, uid), [torneo, uid]);
  const standings = useMemo(() => calcularStandings(torneo), [torneo]);
  const ronda = torneo.rondas.find((r) => r.numero === torneo.rondaActual);
  const etiquetaRonda = ronda?.fase === 'eliminacion' ? nombreRonda(torneo, ronda) : `Ronda ${torneo.rondaActual}`;
  const sinPartida = mia ? null : textosSinPartida(torneo);

  return (
    <Screen
      eyebrow={`${torneo.nombre} · ${etiquetaRonda}`}
      eyebrowTone="gold"
      title={mia ? (mia.rival ? etiquetaMesa(mia.partida).titulo : 'Bye esta ronda') : 'Sin mesa todavía'}
      right={avatar}
      divider
    >
      {errorBanner}
      {mia ? (
        <Enfrentamiento
          yo={standings.find((s) => s.jugador.uid === uid)}
          rival={mia.rival ? standings.find((s) => s.jugador.uid === mia.rival?.uid) : undefined}
          nombreRival={mia.rival?.nombre ?? null}
          conPuntos={torneo.formatoId !== 'casual'}
        />
      ) : null}
      {sinPartida ? (
        <View style={styles.bloque}>
          <EmptyState title={sinPartida.titulo} body={sinPartida.cuerpo} />
        </View>
      ) : null}

      {mia && mia.rival && !etiquetaMesa(mia.partida).enSalon ? (
        <View style={styles.seccion}>
          <Card dashed>
            <SinMesaNota />
          </Card>
        </View>
      ) : null}

      <RelojRonda torneo={torneo} />

      {mia && mia.rival ? (
        <ReporteResultado
          key={`${torneo.id}_${torneo.rondaActual}_${mia.partida.mesa}`}
          torneo={torneo}
          mia={mia}
          uid={uid}
          habilitado={config.reporteJugador}
          nombreRival={mia.rival.nombre}
        />
      ) : null}
      {mia && !mia.rival ? (
        <View style={styles.seccion}>
          <Card dashed>
            <ByeNota />
          </Card>
        </View>
      ) : null}

      {creditoCard}
    </Screen>
  );
}

function BotonCuenta({ fotoUrl, onPress }: { readonly fotoUrl: string | null | undefined; readonly onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => {
        tocar();
        onPress();
      }}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Mi cuenta"
    >
      <Avatar fotoUrl={fotoUrl} tamano={38} borde={colors.gold} />
    </TouchableOpacity>
  );
}

function SinTorneo({ ultimo, uid }: { readonly ultimo: Torneo | null; readonly uid: string | null }) {
  const router = useRouter();
  const { config } = useConfig();
  const terminadoHoy = ultimo && ultimo.estado === 'finalizado' && ultimo.fecha === fechaDeNegocio(config.turnos) ? ultimo : null;
  const puesto = terminadoHoy && uid ? terminadoHoy.posiciones?.find((p) => p.uid === uid)?.puesto : undefined;

  let cuerpo = 'Cuando el juez te anote en un torneo y arranque la ronda, acá vas a ver tu mesa, tu rival y el reloj.';
  if (terminadoHoy) cuerpo = puesto ? `Saliste ${puesto}º. En tu historial están tu récord y tu premio.` : 'En tu historial está cómo te fue.';

  return (
    <EmptyState
      title={terminadoHoy ? `Terminó ${terminadoHoy.nombre}` : 'No estás jugando un torneo ahora'}
      body={cuerpo}
      action={<Button label="Ver mi historial" variant="secondary" onPress={() => router.push('/historial')} />}
    />
  );
}

interface EnfrentamientoProps {
  readonly yo: Standing | undefined;
  readonly rival: Standing | undefined;
  /** null = bye. */
  readonly nombreRival: string | null;
  readonly conPuntos: boolean;
}

function Enfrentamiento({ yo, rival, nombreRival, conPuntos }: EnfrentamientoProps) {
  const { colors } = useTheme();
  const recordYo = textoRecord(yo, conPuntos);
  const recordRival = textoRecord(rival, conPuntos);
  return (
    <View style={[styles.vsFila, styles.bloque]}>
      <View
        style={[styles.vsCard, { borderColor: colors.gold, borderWidth: 1.5, backgroundColor: colors.shade }]}
        accessible
        accessibilityLabel={`Vos, ${recordYo}`}
      >
        <Text style={[styles.vsNombre, { color: colors.ink }]}>Vos</Text>
        <Text style={[styles.vsRecord, { color: colors.dim }, tabularNums(11)]}>{recordYo}</Text>
      </View>
      <Text
        style={[styles.vsSeparador, { color: colors.dim }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        VS
      </Text>
      {nombreRival ? (
        <View style={[styles.vsCard, { borderColor: colors.line, borderWidth: 1 }]} accessible accessibilityLabel={`Contra ${nombreRival}, ${recordRival}`}>
          <Text style={[styles.vsNombre, { color: colors.ink }]} numberOfLines={1}>
            {nombreRival}
          </Text>
          <Text style={[styles.vsRecord, { color: colors.dim }, tabularNums(11)]}>{recordRival}</Text>
        </View>
      ) : (
        <View
          style={[styles.vsCard, { borderColor: colors.line, borderWidth: 1, borderStyle: 'dashed' }]}
          accessible
          accessibilityLabel="Sin rival: te tocó bye"
        >
          <Text style={[styles.vsNombre, { color: colors.gold }]}>Bye</Text>
          <Text style={[styles.vsRecord, { color: colors.dim }]}>Sin rival esta ronda</Text>
        </View>
      )}
    </View>
  );
}

function SinMesaNota() {
  const { colors } = useTheme();
  return (
    <>
      <Text style={[styles.notaTitulo, { color: colors.ink }]}>Sin mesa del salón</Text>
      <Text style={[styles.notaCuerpo, { color: colors.dim }]}>
        Preguntale al juez dónde se juega tu partida.
      </Text>
    </>
  );
}

function ByeNota() {
  const { colors } = useTheme();
  return (
    <>
      <Text style={[styles.notaTitulo, { color: colors.ink }]}>Te tocó bye</Text>
      <Text style={[styles.notaCuerpo, { color: colors.dim }]}>
        Cuenta como victoria. Esperá la próxima ronda.
      </Text>
    </>
  );
}

function RelojRonda({ torneo }: { readonly torneo: Torneo }) {
  const { colors } = useTheme();
  const [ahora, setAhora] = useState(() => ahoraServidor());
  const avisoAnterior = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setAhora(ahoraServidor());
      const id = setInterval(() => setAhora(ahoraServidor()), 1000);
      return () => clearInterval(id);
    }, [])
  );

  const reloj = describirReloj(torneo, ahora);
  const aviso = reloj.fase === 'extra' ? 'extra' : reloj.fase === 'corriendo' && reloj.bajo ? 'bajo' : 'normal';

  useEffect(() => {
    // Solo vibra al cruzar el umbral, no al abrir la pantalla con la ronda ya en los últimos minutos.
    if (avisoAnterior.current !== null && aviso !== 'normal' && aviso !== avisoAnterior.current) advertencia();
    avisoAnterior.current = aviso;
  }, [aviso]);

  const colorTiempo = reloj.fase === 'extra' || reloj.bajo ? colors.dg : colors.ink;

  return (
    <View style={[styles.reloj, styles.bloque, { borderColor: colors.line, backgroundColor: colors.sf }]}>
      <Text
        style={[styles.relojTiempo, { color: colorTiempo }, tabularNums(64)]}
        accessibilityRole="timer"
        accessibilityLabel={reloj.accesible}
      >
        {reloj.reloj}
      </Text>
      <Text style={[styles.relojEstado, { color: reloj.fase === 'extra' ? colors.dg : colors.dim }]}>{reloj.estado.toUpperCase()}</Text>
    </View>
  );
}

interface ReporteResultadoProps {
  readonly torneo: Torneo;
  readonly mia: MiPartida;
  readonly uid: string;
  readonly habilitado: boolean;
  readonly nombreRival: string;
}

function ReporteResultado({ torneo, mia, uid, habilitado, nombreRival }: ReporteResultadoProps) {
  const { colors } = useTheme();
  const { mostrar } = useToast();
  const { partida, soyJugador1 } = mia;
  const ronda = torneo.rondaActual;
  const [enviando, setEnviando] = useState<Resultado | null>(null);

  const reportes = useReportesPartida({
    torneoId: habilitado ? torneo.id : null,
    ronda,
    mesa: partida.mesa,
    miUid: uid,
    rivalUid: mia.rival?.uid ?? null,
  });

  const confirmado = partida.resultado ? resultadoParaJugador(partida.resultado, soyJugador1) : null;
  const mio = reportes.mio ? resultadoParaJugador(reportes.mio, soyJugador1) : null;
  const delRival = reportes.rival ? resultadoParaJugador(reportes.rival, soyJugador1) : null;

  let estado = 'Cargá el resultado cuando termine la partida.';
  if (confirmado) {
    estado = `El juez confirmó ${marcador(confirmado)}. ${esVictoria(confirmado) ? 'Ganaste esta ronda.' : 'Perdiste esta ronda.'}`;
  } else if (!habilitado) {
    estado = 'El resultado lo carga el juez.';
  } else if (mio && delRival && mio === delRival) {
    estado = `Coincide con lo que reportó ${nombreRival}. Queda esperando la confirmación del juez.`;
  } else if (mio && delRival) {
    estado = `No coincide con lo que reportó ${nombreRival} (${marcador(delRival)} para vos). Lo define el juez.`;
  } else if (mio) {
    estado = `Reportaste ${marcador(mio)}. Esperando a tu rival; si no coinciden, decide el juez.`;
  } else if (delRival) {
    estado = `${nombreRival} ya reportó. Falta tu resultado.`;
  }

  const enviar = async (r: Resultado) => {
    setEnviando(r);
    const escritura = reportarResultado({ torneoId: torneo.id, ronda, mesa: partida.mesa, uid, resultadoMio: r, soyJugador1 });
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const demora = new Promise<'lento'>((resolve) => {
      temporizador = setTimeout(() => resolve('lento'), ESPERA_MAXIMA_MS);
    });
    const avisarError = (e: unknown) =>
      mostrar(
        codigoError(e) === 'permission-denied'
          ? 'No se guardó: la ronda ya cambió o el reporte está cerrado. Si sigue, avisale al juez: él carga el resultado.'
          : mensajeError(e, 'No pudimos guardar tu reporte. Probá de nuevo.'),
        'error'
      );
    try {
      const fin = await Promise.race([escritura.then(() => 'ok' as const), demora]);
      if (fin === 'ok') {
        mostrar(`Reportaste ${marcador(r)}.`, 'ok');
      } else {
        mostrar('Sin señal: tu reporte se envía cuando vuelva. No cierres la app hasta verlo confirmado.', 'info');
        escritura.catch(avisarError);
      }
    } catch (e) {
      avisarError(e);
    } finally {
      clearTimeout(temporizador);
      setEnviando(null);
    }
  };

  const elegir = (r: Resultado) => {
    if (enviando || confirmado || r === mio) return;
    confirmar(
      `Reportar ${marcador(r)}`,
      `${detalleMarcador(r)} contra ${nombreRival}. Podés cambiarlo hasta que el juez lo confirme.`,
      'Reportar',
      () => {
        enviar(r).catch(() => undefined);
      }
    );
  };

  return (
    <View style={styles.seccion}>
      <SectionLabel>{habilitado && !confirmado ? 'Reportar resultado' : 'Resultado'}</SectionLabel>
      {reportes.error ? (
        <ErrorBanner mensaje={mensajeError(reportes.error, 'No pudimos leer los reportes de tu mesa.')} onRetry={reportes.reintentar} />
      ) : null}
      {habilitado ? (
        <View style={styles.botonesFila}>
          {RESULTADOS.map((r) => {
            const esConfirmado = confirmado === r;
            const elegido = !confirmado && mio === r;
            const acento = esConfirmado ? colors.ok : elegido ? colors.gold : null;
            const bloqueado = !!enviando || !!confirmado;
            return (
              <TouchableOpacity
                key={r}
                style={[
                  styles.botonReporte,
                  { borderColor: acento ?? colors.line, backgroundColor: acento ?? 'transparent' },
                  bloqueado && !acento && enviando !== r && styles.botonApagado,
                ]}
                onPress={() => {
                  tocar();
                  elegir(r);
                }}
                disabled={bloqueado}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${marcador(r)}: ${detalleMarcador(r).toLowerCase()}`}
                accessibilityState={{ selected: elegido || esConfirmado, disabled: bloqueado, busy: enviando === r }}
              >
                {enviando === r ? (
                  <ActivityIndicator color={colors.gold} />
                ) : (
                  <Text style={[styles.botonTexto, { color: esConfirmado ? colors.onOk : elegido ? colors.onGold : colors.ink }, tabularNums(14)]}>{marcador(r)}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      <Text style={[styles.estadoReporte, { color: colors.dim }]} accessibilityLiveRegion="polite">
        {estado}
      </Text>
    </View>
  );
}

function CreditoBarra({ monto }: { readonly monto: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.credito, { borderColor: colors.br }]}
      accessible
      accessibilityLabel={`Tu crédito en la barra: ${formatARS(monto)}`}
    >
      <View style={styles.flex}>
        <Text style={[styles.creditoTitulo, { color: colors.ink }]}>Tu crédito en la barra</Text>
        <Text style={[styles.creditoSub, { color: colors.dim }]}>
          {monto > 0 ? 'Ganado en torneos anteriores' : 'Se suma cuando ganás crédito en un torneo'}
        </Text>
      </View>
      <Text style={[styles.creditoMonto, { color: colors.br }, tabularNums(19)]}>{formatARS(monto)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bloque: { marginBottom: 14 },
  seccion: { marginTop: 8 },
  vsFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vsCard: { flex: 1, borderRadius: 14, padding: 13, alignItems: 'center' },
  vsNombre: { fontFamily: Typography.fontFamily.semibold, fontSize: 14 },
  vsRecord: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 3 },
  vsSeparador: { fontFamily: Typography.fontFamily.semibold, fontSize: 11 },
  reloj: { borderWidth: 1, borderRadius: 18, paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center' },
  relojTiempo: { fontFamily: Typography.fontFamily.light, fontSize: 64, lineHeight: 72, includeFontPadding: false },
  relojEstado: { fontFamily: Typography.fontFamily.semibold, fontSize: 10.5, letterSpacing: 1.47, marginTop: 8, textAlign: 'center' },
  botonesFila: { flexDirection: 'row', gap: 7 },
  botonReporte: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  botonApagado: { opacity: 0.45 },
  botonTexto: { fontFamily: Typography.fontFamily.semibold, fontSize: 14 },
  estadoReporte: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  notaTitulo: { fontFamily: Typography.fontFamily.semibold, fontSize: 13.5 },
  notaCuerpo: { fontFamily: Typography.fontFamily.regular, fontSize: 12, lineHeight: 18, marginTop: 4 },
  credito: {
    marginTop: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  creditoTitulo: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
  creditoSub: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 2 },
  creditoMonto: { fontFamily: Typography.fontFamily.bold, fontSize: 19 },
});
