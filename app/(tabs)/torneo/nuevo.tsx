import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useTheme } from '../../../contexts/ThemeContext';
import { useConfig } from '../../../contexts/ConfigContext';
import { useToast } from '../../../contexts/ToastContext';
import { useUserProfileContext } from '../../../contexts/UserProfileContext';
import { Typography, tabularNums } from '../../../constants/theme';
import { useBuscarJugadores } from '../../../hooks/useDirectorioJugadores';
import { etiquetasDesambiguadas } from '../../../lib/jugadores';

interface JugadorCuenta {
  uid: string;
  nombre: string;
  nombreBusqueda: string;
}
import { useCatalogo } from '../../../hooks/useCatalogo';
import { useMesasDuelo } from '../../../hooks/useMesasDuelo';
import { AvisoTorneo, esAvisoTorneo, mensajeTransaccion, useUltimoTorneo } from '../../../hooks/useUltimoTorneo';
import { LIMITES, type DefaultsTorneo } from '../../../lib/config';
import {
  FORMATOS,
  TOP_CUTS,
  crearRng,
  generarRonda,
  nuevaSemilla,
  sugerirRondas,
  timerNuevaRonda,
  topCutEfectivo,
  totalRondasPara,
  type FormatoId,
  type JugadorTorneo,
  type PuestoPremio,
} from '../../../lib/torneo';
import { ahoraServidor } from '../../../lib/reloj';
import { formatARS, type CatalogoItem } from '../../../lib/pedido';
import { fechaCorta, fechaDeNegocio } from '../../../lib/fecha';
import { mensajeError } from '../../../lib/errores';
import { tocar } from '../../../lib/haptics';
import Screen, { LoadingScreen } from '../../../components/Screen';
import SoloParaRoles from '../../../components/SoloParaRoles';
import Button from '../../../components/Button';
import Chip from '../../../components/Chip';
import Stepper from '../../../components/Stepper';
import FormField from '../../../components/FormField';
import { Card, EmptyState, ErrorBanner, SectionLabel, SettingRow, SmallButton } from '../../../components/ui';
import { preguntar } from '../../../lib/dialogo';

const TOTAL_PASOS = 4;
const TITULOS_PASO = ['Juego y formato', 'Reglas de la ronda', 'Inscriptos', 'Premios'];
const MAX_PUESTOS = 8;
const PASO_CREDITO = 500;
// Tope de cordura por puesto (las reglas de Firestore frenan subidas de crédito mayores).
const MAX_CREDITO_PUESTO = 1_000_000;
const MAX_CANTIDAD_PUESTO = 99;

interface Reparto {
  cantidad: number;
  credito: number;
}

const LARGO_NOMBRE_TORNEO = 60;

function limpiarNombre(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, LARGO_NOMBRE_TORNEO);
}

/** "Pokémon TCG del 24 sep": en el Historial se ve de qué juego fue cada torneo. */
function nombrePorDefecto(juego: string, fecha: string): string {
  return `${juego} del ${fechaCorta(fecha)}`;
}

function limitar(valor: number, lim: { readonly min: number; readonly max: number }): number {
  return Math.min(lim.max, Math.max(lim.min, Math.round(valor)));
}

function claveProducto(item: Pick<CatalogoItem, 'origen' | 'id'>): string {
  return `${item.origen}:${item.id}`;
}

export default function NuevoTorneoScreen() {
  return (
    <SoloParaRoles roles={['admin', 'juez']} titulo="Nuevo torneo">
      <NuevoTorneoPantalla />
    </SoloParaRoles>
  );
}

function NuevoTorneoPantalla() {
  const router = useRouter();
  const { config, cargando: cargandoConfig } = useConfig();
  const { torneo, loading, error, reintentar } = useUltimoTorneo();
  // Se decide una sola vez: al crear, el torneo nuevo aparece en curso y no hay que bloquear la pantalla que lo creó.
  const [ocupado, setOcupado] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && !error && ocupado === null) setOcupado(torneo?.estado === 'en_curso');
  }, [loading, error, torneo, ocupado]);

  if (cargandoConfig || loading) return <LoadingScreen />;
  if (error) {
    return (
      <Screen back="Torneo" title="Nuevo torneo">
        <ErrorBanner mensaje={mensajeError(error, 'No se pudo comprobar si hay un torneo en curso.')} onRetry={reintentar} />
      </Screen>
    );
  }
  if (ocupado === null) return <LoadingScreen />;
  if (ocupado) {
    return (
      <Screen back="Torneo en curso" title="Nuevo torneo">
        <EmptyState
          title="Ya hay un torneo en curso"
          body="Cerralo desde la última ronda (o descartalo, si sos admin) antes de armar otro: la app sigue un torneo a la vez."
          action={<Button label="Volver al torneo" variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }
  return <Asistente defaults={config.torneo} creditoPremio={config.creditoPremio} juegos={config.juegos} />;
}

interface AsistenteProps {
  readonly defaults: DefaultsTorneo;
  readonly creditoPremio: boolean;
  readonly juegos: readonly string[];
}

function Asistente({ defaults, creditoPremio, juegos }: AsistenteProps) {
  const turnos = useConfig().config.turnos;
  // Si el juez ya se fue de la pantalla cuando termina de crear, no se navega por él (el router es global).
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  const router = useRouter();
  const { colors } = useTheme();
  const { mostrar } = useToast();
  const { user } = useUserProfileContext();
  const catalogoQ = useCatalogo();
  const mesasQ = useMesasDuelo();

  const [paso, setPaso] = useState(1);
  const [juego, setJuego] = useState<string>(juegos[0] ?? 'Otro');
  // Vacío = se usa el nombre por defecto con la fecha.
  const [nombre, setNombre] = useState('');
  const [formatoId, setFormatoId] = useState<FormatoId>('suizo');
  const [rondas, setRondas] = useState(() => limitar(defaults.rondas, LIMITES.rondas));
  const [topCut, setTopCut] = useState(TOP_CUTS[0]);
  const [minutos, setMinutos] = useState(() => limitar(defaults.minutos, LIMITES.minutos));
  const [extra, setExtra] = useState(() => limitar(defaults.extra, LIMITES.extra));
  const [inscripcion, setInscripcion] = useState(() => limitar(defaults.inscripcion, LIMITES.inscripcion));
  const [cupo, setCupo] = useState(() => limitar(defaults.cupo, LIMITES.cupo));
  // Se guardan nombre y todo: la búsqueda cambia los resultados, pero los anotados no se pierden de vista.
  const [seleccion, setSeleccion] = useState<JugadorCuenta[]>([]);
  const [pagados, setPagados] = useState<Record<string, boolean>>({});
  const [busqueda, setBusqueda] = useState('');
  const jugadoresQ = useBuscarJugadores({ activo: paso === 3, busqueda, limite: 30 });
  const [puestos, setPuestos] = useState(4);
  const [reparto, setReparto] = useState<Reparto[]>(() =>
    Array.from({ length: MAX_PUESTOS }, (_, i) => ({ cantidad: Math.max(1, 4 - i), credito: 0 }))
  );
  const [productoClave, setProductoClave] = useState<string | null | undefined>(undefined);
  const [creando, setCreando] = useState(false);
  const [creado, setCreado] = useState(false);
  const navigation = useNavigation();

  const inscriptos = seleccion;
  const n = inscriptos.length;
  const nParaRondas = n >= 2 ? n : cupo;
  const totalRondas = totalRondasPara(formatoId, nParaRondas, rondas, topCut);
  const corte = formatoId === 'suizo_top_cut' ? topCutEfectivo(nParaRondas, topCut) : 0;
  const pozo = n * inscripcion;
  const puestosMax = Math.max(1, Math.min(MAX_PUESTOS, n));
  const puestosEfectivos = Math.min(puestos, puestosMax);

  const productos = useMemo(
    () =>
      catalogoQ.items
        .filter((i) => i.activo && i.stock !== null)
        .sort((a, b) => Number(b.rubro === 'TCG') - Number(a.rubro === 'TCG') || a.nombre.localeCompare(b.nombre, 'es')),
    [catalogoQ.items]
  );

  // Producto por defecto: el primero de TCG con stock, una vez que carga el catálogo.
  useEffect(() => {
    if (productoClave !== undefined || catalogoQ.loading) return;
    const primero = productos.find((p) => (p.stock ?? 0) > 0) ?? null;
    setProductoClave(primero ? claveProducto(primero) : null);
  }, [productoClave, catalogoQ.loading, productos]);

  const producto = productos.find((p) => claveProducto(p) === productoClave) ?? null;
  const comprometidos = producto ? reparto.slice(0, puestosEfectivos).reduce((acc, r) => acc + r.cantidad, 0) : 0;

  const filtrados = useMemo(() => {
    const anotados = new Set(seleccion.map((j) => j.uid));
    return jugadoresQ.jugadores.filter((j) => !anotados.has(j.uid));
  }, [seleccion, jugadoresQ.jugadores]);
  const etiquetas = useMemo(() => etiquetasDesambiguadas([...seleccion, ...filtrados]), [seleccion, filtrados]);

  // Ya hay algo armado: salir por error (atrás de Android, "← Torneo", otra pestaña) no lo tira sin preguntar.
  const hayProgreso = !creado && (paso > 1 || seleccion.length > 0 || nombre.trim() !== '');
  usePreventRemove(hayProgreso && !creando, ({ data }) => {
    preguntar('¿Salir sin crear el torneo?', 'Se pierde lo que cargaste en el asistente.', [
      { text: 'Seguir armando', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const salir = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/torneo');
  };

  // Creado el torneo, se vuelve una sola vez (y solo si el juez sigue en esta pantalla).
  const salido = useRef(false);
  useEffect(() => {
    if (!creado || salido.current || !montado.current) return;
    salido.current = true;
    salir();
  });

  const atras = () => {
    if (paso > 1) setPaso(paso - 1);
    else salir();
  };

  const problemaPaso = (p: number): string | null => {
    if (p === 3) {
      if (n < 2) return 'Anotá al menos 2 jugadores.';
      if (n > cupo) return `Hay ${n} anotados y el cupo es ${cupo}: sacá jugadores o subí el cupo.`;
    }
    return null;
  };

  const continuar = () => {
    const problema = problemaPaso(paso);
    if (problema) {
      mostrar(problema, 'info');
      return;
    }
    setPaso(paso + 1);
  };

  const alternarJugador = (jugador: JugadorCuenta) => {
    setSeleccion((prev) => {
      if (prev.some((j) => j.uid === jugador.uid)) return prev.filter((j) => j.uid !== jugador.uid);
      if (prev.length >= cupo) {
        mostrar(`Llegaste al cupo de ${cupo}. Subilo en el paso 2 si entran más.`, 'info');
        return prev;
      }
      return [...prev, { uid: jugador.uid, nombre: jugador.nombre, nombreBusqueda: jugador.nombreBusqueda }];
    });
  };

  const fijarReparto = (indice: number, campo: keyof Reparto, valor: number) => {
    const tope = campo === 'cantidad' ? MAX_CANTIDAD_PUESTO : MAX_CREDITO_PUESTO;
    setReparto((prev) => prev.map((r, i) => (i === indice ? { ...r, [campo]: Math.min(tope, Math.max(0, Math.round(valor))) } : r)));
  };

  const cambiarReparto = (indice: number, campo: keyof Reparto, delta: number) => {
    setReparto((prev) =>
      prev.map((r, i) => {
        if (i !== indice) return r;
        const tope = campo === 'cantidad' ? MAX_CANTIDAD_PUESTO : MAX_CREDITO_PUESTO;
        return { ...r, [campo]: Math.min(tope, Math.max(0, r[campo] + delta)) };
      })
    );
  };

  const crear = async () => {
    if (creando) return;
    const problema = problemaPaso(3);
    if (problema) {
      mostrar(problema, 'info');
      setPaso(3);
      return;
    }
    if (!user) {
      mostrar('Tu sesión venció. Volvé a iniciar sesión.', 'error');
      return;
    }
    setCreando(true);
    try {
      const jugadores: JugadorTorneo[] = inscriptos.map((j) => ({ uid: j.uid, nombre: j.nombre, pagado: pagados[j.uid] === true }));
      const total = totalRondasPara(formatoId, jugadores.length, rondas, topCut);
      const corteFinal = formatoId === 'suizo_top_cut' ? topCutEfectivo(jugadores.length, topCut) : 0;
      const semilla = nuevaSemilla();
      const ronda1 = {
        ...generarRonda(
          { jugadores, rondas: [], formatoId, totalRondas: total, topCut: corteFinal },
          1,
          mesasQ.mesas.map((m) => ({ id: m.id, numero: m.numero })),
          crearRng(semilla)
        ),
        semilla,
      };
      const premios: PuestoPremio[] = reparto.slice(0, Math.min(puestos, jugadores.length, MAX_PUESTOS)).map((r, i) => ({
        puesto: i + 1,
        jugadorUid: null,
        productoId: producto ? producto.id : null,
        productoOrigen: producto ? producto.origen : 'tcg',
        productoNombre: producto ? producto.nombre : null,
        cantidadProducto: producto ? r.cantidad : 0,
        creditoCafeteria: creditoPremio ? r.credito : 0,
        entregado: false,
      }));
      const fecha = fechaDeNegocio(turnos);
      const refTorneo = doc(collection(db, 'torneos'));
      const refCandado = doc(db, 'bloqueos', 'torneo');
      await runTransaction(db, async (tx) => {
        // Dos jueces creando a la vez: el segundo lee el candado del primero y no crea otro torneo en curso.
        const candado = await tx.get(refCandado);
        const enCursoId = candado.exists() ? candado.get('torneoId') : null;
        if (typeof enCursoId === 'string' && enCursoId) {
          const enCurso = await tx.get(doc(db, 'torneos', enCursoId));
          if (enCurso.exists() && enCurso.get('estado') === 'en_curso') {
            throw new AvisoTorneo(`Ya hay un torneo en curso (${String(enCurso.get('nombre') ?? 'sin nombre')}). Cerralo antes de armar otro.`);
          }
        }
        tx.set(refCandado, { torneoId: refTorneo.id, actualizadoEn: serverTimestamp() });
        tx.set(refTorneo, {
        nombre: limpiarNombre(nombre) || nombrePorDefecto(juego, fecha),
        juego,
        formatoId,
        formato: FORMATOS.find((f) => f.id === formatoId)?.nombre ?? 'Suizo',
        totalRondas: total,
        topCut: corteFinal,
        minutosPorRonda: minutos,
        minutosExtra: extra,
        inscripcion,
        cupo,
        jugadores,
        jugadoresUids: jugadores.map((j) => j.uid),
        estado: 'en_curso',
        rondaActual: 1,
        rondas: [ronda1],
        premios,
        ...timerNuevaRonda(minutos, ahoraServidor()),
        fecha,
        creadoPor: user.uid,
        creadoEn: serverTimestamp(),
        });
      });
      mostrar('Torneo creado. La ronda 1 ya está emparejada.', 'ok');
      // Se navega en el efecto de abajo, cuando el aviso de salir sin crear ya no aplica.
      setCreado(true);
    } catch (e) {
      if (esAvisoTorneo(e)) mostrar(e.message, 'info');
      else mostrar(mensajeTransaccion(e, 'No se pudo crear el torneo.'), 'error');
      setCreando(false);
    }
  };

  const problemaActual = problemaPaso(paso);

  return (
    <Screen
      back="Torneo"
      onBack={salir}
      title="Nuevo torneo"
      keyboard
      subtitle={`Paso ${paso} de ${TOTAL_PASOS} · ${TITULOS_PASO[paso - 1]}`}
      footer={
        <View style={[styles.footer, { borderTopColor: colors.line, backgroundColor: colors.bg }]}>
          <View style={styles.flex1}>
            <Button label="Atrás" variant="secondary" onPress={atras} disabled={creando} />
          </View>
          <View style={styles.flex17}>
            {paso < TOTAL_PASOS ? (
              <Button label="Continuar" onPress={continuar} accessibilityHint={problemaActual ?? undefined} />
            ) : (
              <Button label="Crear y emparejar R1" onPress={() => void crear()} loading={creando} disabled={mesasQ.cargando} />
            )}
          </View>
        </View>
      }
    >
      <View style={styles.progreso} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: TOTAL_PASOS, now: paso }}>
        {Array.from({ length: TOTAL_PASOS }, (_, i) => (
          <View key={`paso-${i}`} style={[styles.progresoTramo, { backgroundColor: i < paso ? colors.br : colors.line }]} />
        ))}
      </View>

      {paso === 1 ? (
        <View>
          <FormField
            label="Nombre del torneo (opcional)"
            placeholder={nombrePorDefecto(juego, fechaDeNegocio(turnos))}
            value={nombre}
            onChangeText={setNombre}
            maxLength={LARGO_NOMBRE_TORNEO}
            autoCapitalize="sentences"
            returnKeyType="done"
            containerStyle={styles.nombreCampo}
          />
          <SectionLabel>Juego</SectionLabel>
          <View style={styles.chips}>
            {juegos.map((j) => (
              <Chip key={j} label={j} active={juego === j} onPress={() => setJuego(j)} />
            ))}
          </View>
          <View style={styles.bloque}>
            <SectionLabel>Formato</SectionLabel>
            <View style={styles.lista} accessibilityRole="radiogroup">
              {FORMATOS.map((f) => {
                const activo = formatoId === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.formato, { borderColor: activo ? colors.br : colors.line, backgroundColor: activo ? colors.brs : colors.sf }]}
                    onPress={() => {
                      tocar();
                      setFormatoId(f.id);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityLabel={f.nombre}
                    accessibilityHint={f.descripcion}
                    accessibilityState={{ checked: activo }}
                  >
                    <View style={[styles.radio, { borderColor: activo ? colors.br : colors.line, backgroundColor: activo ? colors.br : 'transparent' }]} />
                    <View style={styles.flex1}>
                      <Text style={[styles.formatoNombre, { color: activo ? colors.br : colors.ink }]}>{f.nombre}</Text>
                      <Text style={[styles.formatoDesc, { color: colors.dim }]}>{f.descripcion}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}

      {paso === 2 ? (
        <View style={styles.lista}>
          {formatoId === 'eliminacion' ? (
            <SettingRow
              label="Rondas"
              sub={`Se calculan solas: llave de ${nParaRondas} ${n >= 2 ? 'inscriptos' : 'jugadores (cupo)'}`}
              value={String(totalRondas)}
            />
          ) : (
            <SettingRow
              label={formatoId === 'suizo_top_cut' ? 'Rondas suizas' : 'Rondas'}
              sub={`Sugeridas para ${nParaRondas} jugadores${n >= 2 ? '' : ' (cupo)'}: ${sugerirRondas(nParaRondas)}`}
            >
              <Stepper
                value={rondas}
                min={LIMITES.rondas.min}
                max={LIMITES.rondas.max}
                onIncrement={() => setRondas((v) => limitar(v + 1, LIMITES.rondas))}
                onDecrement={() => setRondas((v) => limitar(v - 1, LIMITES.rondas))}
                accessibilityLabel="rondas"
              />
            </SettingRow>
          )}
          {formatoId === 'suizo_top_cut' ? (
            <SettingRow label="Top cut" sub={`Llave final de los mejores del suizo · ${totalRondas} rondas en total`}>
              <View style={styles.chipsFila}>
                {TOP_CUTS.map((k) => (
                  <Chip key={k} label={`Top ${k}`} active={topCut === k} onPress={() => setTopCut(k)} />
                ))}
              </View>
            </SettingRow>
          ) : null}
          <SettingRow label="Minutos por ronda" sub="Reloj de sala">
            <Stepper
              value={minutos}
              min={LIMITES.minutos.min}
              max={LIMITES.minutos.max}
              onIncrement={() => setMinutos((v) => limitar(v + 5, LIMITES.minutos))}
              onDecrement={() => setMinutos((v) => limitar(v - 5, LIMITES.minutos))}
              accessibilityLabel="minutos por ronda"
            />
          </SettingRow>
          <SettingRow label="Minutos extra" sub="Los suma el juez al llegar a cero">
            <Stepper
              value={extra}
              min={LIMITES.extra.min}
              max={LIMITES.extra.max}
              onIncrement={() => setExtra((v) => limitar(v + 1, LIMITES.extra))}
              onDecrement={() => setExtra((v) => limitar(v - 1, LIMITES.extra))}
              accessibilityLabel="minutos extra"
            />
          </SettingRow>
          <SettingRow label="Inscripción" sub="Cobrable desde el salón">
            <Stepper
              value={inscripcion}
              min={LIMITES.inscripcion.min}
              max={LIMITES.inscripcion.max}
              formatValue={formatARS}
              onIncrement={() => setInscripcion((v) => limitar(v + 500, LIMITES.inscripcion))}
              onDecrement={() => setInscripcion((v) => limitar(v - 500, LIMITES.inscripcion))}
              onChangeValue={(v) => setInscripcion(limitar(v, LIMITES.inscripcion))}
              accessibilityLabel="inscripción"
            />
          </SettingRow>
          <SettingRow
            label="Cupo máximo"
            sub={
              mesasQ.cargando
                ? 'Contando mesas de duelo…'
                : mesasQ.error
                  ? 'No se pudieron leer las mesas de duelo'
                  : `Mesas de duelo disponibles: ${mesasQ.mesas.length}`
            }
          >
            <Stepper
              value={cupo}
              min={LIMITES.cupo.min}
              max={LIMITES.cupo.max}
              onIncrement={() => setCupo((v) => limitar(v + 2, LIMITES.cupo))}
              onDecrement={() => setCupo((v) => limitar(v - 2, LIMITES.cupo))}
              accessibilityLabel="cupo máximo"
            />
          </SettingRow>
          <Card dashed>
            <Text style={[styles.nota, { color: colors.dim }]}>Tomados de los ajustes del local. Cambiarlos acá afecta solo a este torneo.</Text>
          </Card>
        </View>
      ) : null}

      {paso === 3 ? (
        <View>
          <SectionLabel
            right={
              <Text style={[styles.contador, { color: n > cupo ? colors.dg : colors.dim }, tabularNums(11.5)]}>
                {n} de {cupo}
              </Text>
            }
          >
            Inscriptos
          </SectionLabel>
          <FormField
            label="Buscar"
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Nombre del jugador"
            autoCorrect={false}
            autoCapitalize="none"
            maxLength={60}
            returnKeyType="search"
            containerStyle={styles.buscador}
          />
          {problemaActual ? <Text style={[styles.meta, styles.sugerenciaTexto, { color: n > cupo ? colors.dg : colors.dim }]}>{problemaActual}</Text> : null}
          {formatoId !== 'eliminacion' && n >= 2 && rondas !== limitar(sugerirRondas(n), LIMITES.rondas) ? (
            <View style={styles.sugerencia}>
              <Text style={[styles.meta, styles.flex1, { color: colors.dim }]}>
                Con {n} inscriptos se sugieren {sugerirRondas(n)} rondas{formatoId === 'suizo_top_cut' ? ' suizas' : ''} (elegiste {rondas}).
              </Text>
              <SmallButton label={`Usar ${limitar(sugerirRondas(n), LIMITES.rondas)}`} onPress={() => setRondas(limitar(sugerirRondas(n), LIMITES.rondas))} />
            </View>
          ) : null}
          {!mesasQ.cargando && !mesasQ.error && Math.floor(n / 2) > mesasQ.mesas.length ? (
            <Text style={[styles.meta, styles.sugerenciaTexto, { color: colors.dg }]}>
              Con {n} inscriptos se juegan {Math.floor(n / 2)} partidas por ronda y hay {mesasQ.mesas.length}{' '}
              {mesasQ.mesas.length === 1 ? 'mesa' : 'mesas'} de duelo: {Math.floor(n / 2) - mesasQ.mesas.length} van a quedar sin mesa asignada.
              Sumá mesas de duelo desde el Salón.
            </Text>
          ) : null}
          {formatoId === 'suizo_top_cut' && n >= 2 && corte !== topCut ? (
            <Text style={[styles.meta, styles.sugerenciaTexto, { color: colors.dim }]}>
              Con {n} inscriptos el top cut queda en {corte > 0 ? `top ${corte}` : 'nada'}.
            </Text>
          ) : null}

          {jugadoresQ.error ? (
            <ErrorBanner mensaje={mensajeError(jugadoresQ.error, 'No se pudo cargar la lista de jugadores.')} onRetry={jugadoresQ.reintentar} />
          ) : null}
          {seleccion.map((j) => (
            <FilaInscripto
              key={j.uid}
              jugador={j}
              etiqueta={etiquetas.get(j.uid) ?? j.nombre}
              marcado
              pagado={pagados[j.uid] === true}
              onAlternar={() => alternarJugador(j)}
              onPago={() => setPagados((prev) => ({ ...prev, [j.uid]: !prev[j.uid] }))}
            />
          ))}
          {jugadoresQ.cargando ? (
            <ActivityIndicator color={colors.br} style={styles.cargando} accessibilityLabel="Buscando jugadores" />
          ) : filtrados.length === 0 && !jugadoresQ.error ? (
            busqueda.trim() ? (
              <EmptyState title={`Nadie coincide con "${busqueda.trim()}"`} body="Se busca por cómo empieza el nombre con el que se registró (sin importar tildes ni mayúsculas)." />
            ) : seleccion.length === 0 ? (
              <EmptyState
                title="Todavía no hay jugadores registrados"
                body="Cada jugador se crea su cuenta desde la app (perfil Jugador) y aparece acá al instante."
              />
            ) : null
          ) : (
            filtrados.map((j) => (
              <FilaInscripto
                key={j.uid}
                jugador={j}
                etiqueta={etiquetas.get(j.uid) ?? j.nombre}
                marcado={false}
                pagado={false}
                onAlternar={() => alternarJugador(j)}
                onPago={() => undefined}
              />
            ))
          )}
          {!jugadoresQ.cargando && filtrados.length >= 30 ? (
            <Text style={[styles.meta, { color: colors.dim }]}>Se muestran los primeros 30: escribí parte del nombre para encontrar al resto.</Text>
          ) : null}
          <Card style={styles.bloque}>
            <Text style={[styles.nota, { color: colors.dim }]}>
              Tocá Pagado / Impago para marcar la inscripción. Si alguien paga después, marcalo desde Premios → Inscripciones.
            </Text>
          </Card>
        </View>
      ) : null}

      {paso === 4 ? (
        <View>
          <Card>
            <Text style={[styles.etiqueta, { color: colors.dim }]}>POZO</Text>
            <Text style={[styles.pozo, { color: colors.ink }, tabularNums(30)]}>{formatARS(pozo)}</Text>
            <Text style={[styles.meta, { color: colors.dim }]}>
              {n} {n === 1 ? 'inscripción' : 'inscripciones'} de {formatARS(inscripcion)}
            </Text>
          </Card>

          <View style={styles.bloque}>
            <SectionLabel>Producto del premio</SectionLabel>
            {catalogoQ.error ? <ErrorBanner mensaje={mensajeError(catalogoQ.error, 'No se pudo cargar el stock.')} /> : null}
            {catalogoQ.loading ? (
              <ActivityIndicator color={colors.gold} accessibilityLabel="Cargando productos" />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsFila}>
                <Chip label="Sin producto" tone="gold" active={productoClave === null} onPress={() => setProductoClave(null)} />
                {productos.map((p) => (
                  <Chip
                    key={claveProducto(p)}
                    label={`${p.nombre} · ${p.stock ?? 0}`}
                    tone="gold"
                    active={productoClave === claveProducto(p)}
                    onPress={() => setProductoClave(claveProducto(p))}
                  />
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.bloque}>
            <SectionLabel>Reparto</SectionLabel>
            <SettingRow label="Puestos premiados" sub={`Del 1º al ${puestosEfectivos}º`}>
              <Stepper
                value={puestosEfectivos}
                min={1}
                max={puestosMax}
                onIncrement={() => setPuestos(Math.min(puestosMax, puestosEfectivos + 1))}
                onDecrement={() => setPuestos(Math.max(1, puestosEfectivos - 1))}
                accessibilityLabel="puestos premiados"
              />
            </SettingRow>
            {reparto.slice(0, puestosEfectivos).map((r, i) => (
              <View key={`puesto-${i}`} style={[styles.puesto, { borderBottomColor: colors.line }]}>
                <View style={styles.puestoFila}>
                  <Text style={[styles.puestoNumero, { color: colors.gold }, tabularNums(17)]}>{i + 1}º</Text>
                  <View style={styles.flex1}>
                    <Text style={[styles.puestoTexto, { color: colors.ink }]}>
                      {producto ? `${r.cantidad} × ${producto.nombre}` : 'Sin producto'}
                    </Text>
                    <Text style={[styles.meta, { color: colors.dim }, tabularNums(10.5)]}>
                      {creditoPremio ? (r.credito > 0 ? `Crédito ${formatARS(r.credito)}` : 'Sin crédito') : 'El local no da crédito como premio'}
                    </Text>
                  </View>
                  {producto ? (
                    <Stepper
                      value={r.cantidad}
                      min={0}
                      max={MAX_CANTIDAD_PUESTO}
                      onIncrement={() => cambiarReparto(i, 'cantidad', 1)}
                      onDecrement={() => cambiarReparto(i, 'cantidad', -1)}
                      accessibilityLabel={`cantidad de ${producto.nombre} para el puesto ${i + 1}`}
                    />
                  ) : null}
                </View>
                {creditoPremio ? (
                  <View style={styles.creditoFila}>
                    <Text style={[styles.meta, { color: colors.dim }]}>Crédito de cafetería</Text>
                    <Stepper
                      value={r.credito}
                      min={0}
                      max={MAX_CREDITO_PUESTO}
                      formatValue={formatARS}
                      onIncrement={() => cambiarReparto(i, 'credito', PASO_CREDITO)}
                      onDecrement={() => cambiarReparto(i, 'credito', -PASO_CREDITO)}
                      onChangeValue={(v) => fijarReparto(i, 'credito', v)}
                      accessibilityLabel={`crédito para el puesto ${i + 1}`}
                    />
                  </View>
                ) : null}
              </View>
            ))}
            {producto ? (
              <View style={styles.comprometidos}>
                <Text style={[styles.meta, { color: colors.dim }]}>Comprometidos</Text>
                <Text
                  style={[styles.comprometidosValor, { color: comprometidos > (producto.stock ?? 0) ? colors.dg : colors.ok }, tabularNums(12.5)]}
                >
                  {comprometidos} de {producto.stock ?? 0} en stock
                </Text>
              </View>
            ) : null}
            {comprometidos > (producto?.stock ?? 0) ? (
              <Text style={[styles.meta, { color: colors.dg }]}>
                No alcanza el stock: podés crear igual, pero al entregar el stock queda negativo hasta que se reponga.
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

interface FilaInscriptoProps {
  readonly jugador: JugadorCuenta;
  /** Nombre a mostrar (con sufijo si hay dos jugadores que se llaman igual). */
  readonly etiqueta: string;
  readonly marcado: boolean;
  readonly pagado: boolean;
  readonly onAlternar: () => void;
  readonly onPago: () => void;
}

// Dos controles hermanos (no anidados): así VoiceOver y TalkBack llegan a los dos por separado.
function FilaInscripto({ etiqueta, marcado, pagado, onAlternar, onPago }: FilaInscriptoProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.inscripto, { borderBottomColor: colors.line }]}>
      <TouchableOpacity
        style={styles.inscriptoToque}
        onPress={() => {
          tocar();
          onAlternar();
        }}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityLabel={etiqueta}
        accessibilityState={{ checked: marcado }}
      >
        <View style={[styles.check, { borderColor: marcado ? colors.br : colors.line, backgroundColor: marcado ? colors.br : 'transparent' }]}>
          {marcado ? <Ionicons name="checkmark" size={13} color={colors.onBr} /> : null}
        </View>
        <Text style={[styles.inscriptoNombre, { color: colors.ink }]} numberOfLines={1}>
          {etiqueta}
        </Text>
      </TouchableOpacity>
      {marcado ? (
        <TouchableOpacity
          style={styles.pago}
          onPress={() => {
            tocar();
            onPago();
          }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="switch"
          accessibilityLabel={`Inscripción de ${etiqueta}`}
          accessibilityState={{ checked: pagado }}
          accessibilityHint="Tocá para marcarla como pagada o impaga"
        >
          <Text style={[styles.pagoTexto, { color: pagado ? colors.ok : colors.dg }]}>{pagado ? 'Pagado' : 'Impago'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  flex17: { flex: 1.7 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1 },
  progreso: { flexDirection: 'row', gap: 5, marginBottom: 20 },
  progresoTramo: { flex: 1, height: 4, borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  nombreCampo: { marginBottom: 18 },
  chipsFila: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  bloque: { marginTop: 22 },
  lista: { gap: 8 },
  formato: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 13, paddingVertical: 13, paddingHorizontal: 14, minHeight: 56 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  formatoNombre: { fontFamily: Typography.fontFamily.semibold, fontSize: 13.5 },
  formatoDesc: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 2 },
  nota: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, lineHeight: 18 },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: 11, lineHeight: 16 },
  contador: { fontFamily: Typography.fontFamily.medium, fontSize: 11.5 },
  buscador: { marginBottom: 6 },
  sugerencia: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  sugerenciaTexto: { marginBottom: 8 },
  cargando: { marginVertical: 24 },
  inscripto: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 52, paddingVertical: 6, borderBottomWidth: 1 },
  inscriptoToque: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  inscriptoNombre: { flex: 1, fontFamily: Typography.fontFamily.medium, fontSize: 13.5 },
  pago: { minHeight: 44, minWidth: 64, alignItems: 'flex-end', justifyContent: 'center' },
  pagoTexto: { fontFamily: Typography.fontFamily.semibold, fontSize: 11 },
  etiqueta: { fontFamily: Typography.fontFamily.bold, fontSize: 10, letterSpacing: 1.6 },
  pozo: { fontFamily: Typography.fontFamily.bold, fontSize: 30, marginTop: 8 },
  puesto: { paddingVertical: 11, borderBottomWidth: 1, gap: 8 },
  puestoFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  puestoNumero: { fontFamily: Typography.fontFamily.bold, fontSize: 17, minWidth: 30 },
  puestoTexto: { fontFamily: Typography.fontFamily.medium, fontSize: 13 },
  creditoFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 42 },
  comprometidos: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  comprometidosValor: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
});
