import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useConfig } from '../contexts/ConfigContext';
import { useUserProfileContext } from '../contexts/UserProfileContext';
import { getTheme, Typography, tabularNums, type ThemeTokens } from '../constants/theme';
import { useUltimoTorneo } from '../hooks/useUltimoTorneo';
import { useSincronizarReloj } from '../hooks/useReloj';
import {
  calcularStandings,
  conNombresUnicos,
  nombreRonda,
  pendientesDe,
  type Partida,
  type Torneo,
  etiquetaMesa,
} from '../lib/torneo';
import { ahoraServidor } from '../lib/reloj';
import { describirReloj } from '../lib/relojRonda';
import { mensajeError } from '../lib/errores';

// Pantalla de solo lectura para la tele del local: siempre en paleta noche.

const ANCHO_DOS_COLUMNAS = 700;
const ISOTIPO = require('../assets/brand/duel-mark-dark.png');

export default function ModoTvScreen() {
  const router = useRouter();
  useKeepAwake();

  // El resto de la app es vertical; la tele del local se ve mejor acostada.
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.unlockAsync().catch(() => undefined);
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
      };
    }, [])
  );
  const { config } = useConfig();
  const { user, profile, loading } = useUserProfileContext();
  useSincronizarReloj(profile?.estadoAprobacion === 'aprobado' ? profile.uid : null);
  const colors = useMemo(() => getTheme('night', config.marca ?? undefined), [config.marca]);

  const salir = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const habilitado = !!user && profile?.estadoAprobacion === 'aprobado';

  return (
    <SafeAreaView style={[styles.flex1, { backgroundColor: colors.bg }]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="light" hidden />
      {loading ? (
        <Centro colors={colors}>
          <ActivityIndicator size="large" color={colors.gold} accessibilityLabel="Cargando" />
        </Centro>
      ) : habilitado ? (
        <TvTorneo colors={colors} onSalir={salir} />
      ) : (
        <Centro colors={colors}>
          <Text style={[styles.avisoTitulo, { color: colors.ink }]}>Modo TV</Text>
          <Text style={[styles.avisoTexto, { color: colors.dim }]}>
            Iniciá sesión con una cuenta aprobada del local para mostrar el torneo en esta pantalla.
          </Text>
          <BotonSalir colors={colors} onPress={salir} />
        </Centro>
      )}
    </SafeAreaView>
  );
}

function Centro({ colors, children }: { readonly colors: ThemeTokens; readonly children: React.ReactNode }) {
  return <View style={[styles.centro, { backgroundColor: colors.bg }]}>{children}</View>;
}

function BotonSalir({ colors, onPress }: { readonly colors: ThemeTokens; readonly onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.salir, { borderColor: colors.line }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Salir del Modo TV"
    >
      <Text style={[styles.salirTexto, { color: colors.dim }]}>Salir</Text>
    </TouchableOpacity>
  );
}

function TvTorneo({ colors, onSalir }: { readonly colors: ThemeTokens; readonly onSalir: () => void }) {
  const { torneo: leido, loading, error, reintentar } = useUltimoTorneo();
  const torneo = useMemo(() => (leido ? conNombresUnicos(leido) : null), [leido]);

  if (loading) {
    return (
      <Centro colors={colors}>
        <ActivityIndicator size="large" color={colors.gold} accessibilityLabel="Cargando torneo" />
      </Centro>
    );
  }
  if (error) {
    return (
      <Centro colors={colors}>
        <Text style={[styles.avisoTexto, { color: colors.dg }]} accessibilityRole="alert">
          {mensajeError(error, 'No se pudo cargar el torneo.')}
        </Text>
        <View style={styles.filaBotones}>
          <TouchableOpacity style={[styles.salir, { borderColor: colors.dg }]} onPress={reintentar} accessibilityRole="button">
            <Text style={[styles.salirTexto, { color: colors.dg }]}>Reintentar</Text>
          </TouchableOpacity>
          <BotonSalir colors={colors} onPress={onSalir} />
        </View>
      </Centro>
    );
  }
  if (!torneo || torneo.estado !== 'en_curso') return <SinTorneo torneo={torneo} colors={colors} onSalir={onSalir} />;
  return <TableroTorneo torneo={torneo} colors={colors} onSalir={onSalir} />;
}

/** El logo que cargó el local (la tele es lo más visible del local); si no hay o falla, el isotipo de Duel. */
function LogoLocal({ tamano }: { readonly tamano: number }) {
  const { config } = useConfig();
  const [falla, setFalla] = useState(false);
  const propio = !!config.logoUrl && !falla;
  return (
    <Image
      source={propio && config.logoUrl ? { uri: config.logoUrl } : ISOTIPO}
      onError={() => setFalla(true)}
      resizeMode="contain"
      style={{ width: tamano, height: tamano, borderRadius: propio ? Math.round(tamano * 0.22) : 0 }}
      accessibilityIgnoresInvertColors
      accessibilityLabel={config.nombreLocal}
    />
  );
}

function SinTorneo({ torneo, colors, onSalir }: { readonly torneo: Torneo | null; readonly colors: ThemeTokens; readonly onSalir: () => void }) {
  const nombreLocal = useConfig().config.nombreLocal;
  const podio = (torneo?.posiciones ?? []).filter((p) => p.puesto <= 3).sort((a, b) => a.puesto - b.puesto);
  return (
    <Centro colors={colors}>
      <LogoLocal tamano={64} />
      <Text style={[styles.local, { color: colors.dim }]}>{nombreLocal.toUpperCase()}</Text>
      <Text style={[styles.avisoTitulo, { color: colors.ink }]}>No hay un torneo en curso</Text>
      {torneo && podio.length > 0 ? (
        <View style={styles.podioFinal}>
          <Text style={[styles.etiqueta, { color: colors.gold }]}>{`Podio · ${torneo.nombre}`.toUpperCase()}</Text>
          {podio.map((p) => (
            <View key={p.uid} style={[styles.podioFila, { borderBottomColor: colors.line }]}>
              <Text style={[styles.podioPos, { color: colors.gold }, tabularNums(15)]}>{p.puesto}</Text>
              <Text style={[styles.podioNombre, { color: colors.ink }]}>{p.nombre}</Text>
              <Text style={[styles.podioPts, { color: colors.dim }, tabularNums(13)]}>
                {p.victorias}-{p.derrotas}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.avisoTexto, { color: colors.dim }]}>Cuando el juez arranque la ronda 1, el reloj y las mesas aparecen acá.</Text>
      )}
      <BotonSalir colors={colors} onPress={onSalir} />
    </Centro>
  );
}

function TableroTorneo({ torneo, colors, onSalir }: { readonly torneo: Torneo; readonly colors: ThemeTokens; readonly onSalir: () => void }) {
  const { width } = useWindowDimensions();
  const ancho = width >= ANCHO_DOS_COLUMNAS;

  const ronda = torneo.rondas.find((r) => r.numero === torneo.rondaActual);
  const partidas = useMemo(() => (ronda ? [...ronda.partidas].sort((a, b) => a.mesa - b.mesa) : []), [ronda]);
  const podio = useMemo(
    () => (torneo.formatoId === 'casual' ? [] : calcularStandings(torneo, torneo.formatoId === 'suizo_top_cut' ? ['suizo'] : undefined).slice(0, 3)),
    [torneo]
  );

  const pendientes = pendientesDe(ronda);
  const jugadas = partidas.filter((p) => p.jugador2).length;
  const tamTimer = ancho ? 122 : Math.min(104, Math.round(width * 0.25));

  const izquierda = (
    <View style={[ancho ? styles.izquierdaAncha : styles.bloqueAngosto, ancho && { borderRightColor: colors.line }]}>
      <View style={styles.encabezado}>
        <View style={styles.flex1}>
          <Text style={[styles.etiqueta, { color: colors.gold }]} numberOfLines={2}>
            {`${torneo.nombre} · ${torneo.juego}`.toUpperCase()}
          </Text>
          <Text style={[styles.titulo, { color: colors.ink }]} accessibilityRole="header">
            {nombreRonda(torneo, ronda)}
          </Text>
        </View>
        <LogoLocal tamano={44} />
      </View>
      <RelojTv torneo={torneo} colors={colors} tamano={tamTimer} />
      <View style={styles.pie}>
        <Text style={[styles.pieTexto, { color: colors.dim }]}>{torneo.jugadores.length} jugadores</Text>
        <Text style={[styles.pieTexto, { color: colors.dim }]}>
          {jugadas} {jugadas === 1 ? 'mesa' : 'mesas'}
        </Text>
        <Text style={[styles.pieTexto, { color: colors.dim }]}>{pendientes === 0 ? 'Todas cargadas' : `${pendientes} pendientes`}</Text>
      </View>
    </View>
  );

  const derecha = (
    <View style={ancho ? styles.derechaAncha : styles.bloqueAngosto}>
      <View style={styles.encabezadoDerecha}>
        <Text style={[styles.etiquetaSeccion, { color: colors.dim }]}>MESAS</Text>
        {ancho ? <BotonSalir colors={colors} onPress={onSalir} /> : null}
      </View>
      <View style={styles.grilla}>
        {partidas.map((p) => (
          <CeldaPartida key={`${p.mesa}-${p.jugador1.uid}`} partida={p} colors={colors} />
        ))}
      </View>
      {podio.length > 0 ? (
        <View style={styles.podio}>
          <Text style={[styles.etiquetaSeccion, { color: colors.dim }]}>PODIO EN JUEGO</Text>
          {podio.map((s, i) => (
            <View key={s.jugador.uid} style={[styles.podioFila, { borderBottomColor: colors.line }]}>
              <Text style={[styles.podioPos, { color: colors.gold }, tabularNums(13)]}>{i + 1}</Text>
              <Text style={[styles.podioNombre, { color: colors.ink }]} numberOfLines={1}>
                {s.jugador.nombre}
              </Text>
              <Text style={[styles.podioPts, { color: colors.dim }, tabularNums(12)]}>
                {s.puntos} pts · {s.victorias}-{s.derrotas}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  if (ancho) {
    return (
      <View style={styles.dosColumnas}>
        {izquierda}
        <ScrollView style={styles.flex1} contentContainerStyle={styles.derechaScroll}>
          {derecha}
        </ScrollView>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.angosto}>
      <View style={styles.salirArriba}>
        <BotonSalir colors={colors} onPress={onSalir} />
      </View>
      {izquierda}
      <View style={[styles.divisor, { backgroundColor: colors.line }]} />
      {derecha}
    </ScrollView>
  );
}

/** Separado para que el tic de cada segundo no vuelva a dibujar la grilla de mesas. */
function RelojTv({ torneo, colors, tamano }: { readonly torneo: Torneo; readonly colors: ThemeTokens; readonly tamano: number }) {
  const [ahora, setAhora] = useState(() => ahoraServidor());

  useEffect(() => {
    setAhora(ahoraServidor());
    if (torneo.rondaPausada) return undefined;
    const id = setInterval(() => setAhora(ahoraServidor()), 1000);
    return () => clearInterval(id);
  }, [torneo.rondaPausada, torneo.rondaFinEn]);

  const reloj = describirReloj(torneo, ahora);

  return (
    <View style={styles.timerZona}>
      <Text
        style={[
          styles.timer,
          { color: reloj.fase === 'extra' || reloj.bajo ? colors.dg : colors.ink, fontSize: tamano, lineHeight: Math.round(tamano * 1.08) },
          tabularNums(tamano),
          { letterSpacing: -0.04 * tamano },
        ]}
        accessibilityRole="timer"
        accessibilityLabel={reloj.accesible}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {reloj.reloj}
      </Text>
      <Text style={[styles.estado, { color: reloj.fase === 'extra' ? colors.dg : colors.dim }]}>{reloj.estado.toUpperCase()}</Text>
    </View>
  );
}

function CeldaPartida({ partida, colors }: { readonly partida: Partida; readonly colors: ThemeTokens }) {
  const bye = partida.jugador2 === null;
  const lista = !bye && partida.resultado !== null;
  const color = lista ? colors.ok : colors.dim;
  const etiqueta = etiquetaMesa(partida);
  const estado = bye ? 'Bye' : lista ? `Listo ${partida.resultado}` : 'Jugando';
  return (
    <View style={[styles.celda, { borderColor: lista ? colors.ok : colors.line }]}>
      <View style={styles.celdaFila}>
        <Text style={[styles.celdaMesa, { color: lista ? colors.ok : colors.gold }, tabularNums(13)]}>
          {etiqueta.titulo}
        </Text>
        <Text style={[styles.celdaEstado, { color }]}>{estado}</Text>
      </View>
      <Text style={[styles.celdaNombres, { color: colors.ink }]} numberOfLines={2}>
        {partida.jugador1.nombre}
        {partida.jugador2 ? <Text style={{ color: colors.dim }}> vs </Text> : null}
        {partida.jugador2?.nombre ?? ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  avisoTitulo: { fontFamily: Typography.fontFamily.bold, fontSize: 24, letterSpacing: -0.7, textAlign: 'center' },
  avisoTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 440 },
  filaBotones: { flexDirection: 'row', gap: 10 },
  salir: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  salirTexto: { fontFamily: Typography.fontFamily.semibold, fontSize: 12 },
  local: { fontFamily: Typography.fontFamily.semibold, fontSize: 11, letterSpacing: 1.6, marginTop: -4 },
  podioFinal: { alignSelf: 'stretch', maxWidth: 440, width: '100%', gap: 4 },
  dosColumnas: { flex: 1, flexDirection: 'row' },
  izquierdaAncha: { flex: 1.15, paddingVertical: 26, paddingHorizontal: 28, borderRightWidth: 1 },
  derechaAncha: { gap: 14 },
  derechaScroll: { paddingVertical: 26, paddingHorizontal: 26 },
  angosto: { paddingHorizontal: 20, paddingBottom: 28 },
  salirArriba: { alignItems: 'flex-end', paddingTop: 8 },
  bloqueAngosto: { paddingVertical: 16, gap: 14, minHeight: 320 },
  divisor: { height: 1 },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  etiqueta: { fontFamily: Typography.fontFamily.bold, fontSize: 11, letterSpacing: 2.2 },
  titulo: { fontFamily: Typography.fontFamily.bold, fontSize: 26, lineHeight: 30, letterSpacing: -0.78, marginTop: 6 },
  timerZona: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  timer: { fontFamily: Typography.fontFamily.light },
  estado: { fontFamily: Typography.fontFamily.semibold, fontSize: 12, letterSpacing: 2.4, marginTop: 6, textAlign: 'center' },
  pie: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  pieTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 12 },
  encabezadoDerecha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  etiquetaSeccion: { fontFamily: Typography.fontFamily.bold, fontSize: 10.5, letterSpacing: 1.9 },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  celda: { flexBasis: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 10, gap: 3 },
  celdaFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  celdaMesa: { fontFamily: Typography.fontFamily.semibold, fontSize: 13 },
  celdaEstado: { fontFamily: Typography.fontFamily.semibold, fontSize: 11 },
  celdaNombres: { fontFamily: Typography.fontFamily.medium, fontSize: 12.5, lineHeight: 17 },
  podio: { gap: 2, marginTop: 4 },
  podioFila: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 6, borderBottomWidth: 1 },
  podioPos: { fontFamily: Typography.fontFamily.bold, fontSize: 13, minWidth: 16 },
  podioNombre: { flex: 1, fontFamily: Typography.fontFamily.medium, fontSize: 12.5 },
  podioPts: { fontFamily: Typography.fontFamily.regular, fontSize: 12 },
});
