import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useTheme } from '../../../contexts/ThemeContext';
import { useToast } from '../../../contexts/ToastContext';
import { useUserProfileContext } from '../../../contexts/UserProfileContext';
import { Radii, Typography, tabularNums } from '../../../constants/theme';
import { NOMBRE_SALA_MAX, Sala, useSalas } from '../../../hooks/useSalas';
import { Mesa, estadoVisual, useMesas } from '../../../hooks/useMesas';
import type { EstadoMesaVisual } from '../../../hooks/useMesas';
import { useUltimoTorneo } from '../../../hooks/useUltimoTorneo';
import Screen, { LoadingScreen } from '../../../components/Screen';
import { EmptyState, ErrorBanner, SmallButton } from '../../../components/ui';
import Button from '../../../components/Button';
import Chip from '../../../components/Chip';
import FormField from '../../../components/FormField';
import { mensajeError } from '../../../lib/errores';
import { tocar } from '../../../lib/haptics';
import { formatARS, subtotalDe } from '../../../lib/pedido';
import { segundosRestantes } from '../../../lib/torneo';
import {
  DueloEnMesa,
  TipoMesa,
  aFraccion,
  aPixeles,
  contarSalon,
  duelosPorMesa,
  esFraccion,
  esperarConfirmacion,
  etiquetaDuelo,
  numeroMesaTexto,
  posicionLibre,
  siguienteNumeroMesa,
  tamanoMesa,
} from '../../../lib/salon';

const PASO_PUNTOS = 16;
const UMBRAL_ARRASTRE = 6;
const BORDE_LIENZO = 1;
const ESPERA_ESCRITURA_MS = 4000;
const SIN_CONEXION = ' Se sincroniza cuando vuelva la conexión.';

interface Medidas {
  ancho: number;
  alto: number;
}

function useAhora(activo: boolean): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return undefined;
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activo]);
  return ahora;
}

// Views absolutas memoizadas: se dibujan una vez por tamaño y tema, y rasterizadas no cuestan nada al arrastrar.
const PuntosLienzo = memo(function PuntosLienzo({ ancho, alto, color }: { readonly ancho: number; readonly alto: number; readonly color: string }) {
  const columnas = Math.max(0, Math.floor(ancho / PASO_PUNTOS));
  const filas = Math.max(0, Math.floor(alto / PASO_PUNTOS));
  const puntos: React.ReactElement[] = [];
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      puntos.push(
        <View
          key={`${f}-${c}`}
          style={[styles.punto, { left: c * PASO_PUNTOS + PASO_PUNTOS / 2 - 1, top: f * PASO_PUNTOS + PASO_PUNTOS / 2 - 1, backgroundColor: color }]}
        />
      );
    }
  }
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {puntos}
    </View>
  );
});

interface MesaEnLienzoProps {
  readonly mesa: Mesa;
  readonly left: number;
  readonly top: number;
  readonly ancho: number;
  readonly alto: number;
  readonly lienzo: Medidas;
  readonly estado: EstadoMesaVisual;
  readonly info: string;
  readonly puedeEditar: boolean;
  readonly onAbrir: (mesa: Mesa) => void;
  readonly onOpciones: (mesa: Mesa) => void;
  readonly onSoltar: (mesa: Mesa, left: number, top: number) => Promise<boolean>;
}

const MesaEnLienzo = memo(function MesaEnLienzo(props: MesaEnLienzoProps) {
  const { mesa, left, top, ancho, alto, estado, info, puedeEditar, onAbrir, onOpciones } = props;
  const { colors } = useTheme();
  const pan = useRef(new Animated.ValueXY()).current;
  const [arrastrando, setArrastrando] = useState(false);
  const ultimo = useRef(props);

  // El PanResponder se crea una sola vez: lee las props vigentes desde este ref.
  useLayoutEffect(() => {
    ultimo.current = props;
  });

  // Antes de pintar: la posición nueva ya llegó en props, así la mesa no "salta" un frame.
  useLayoutEffect(() => {
    pan.setValue({ x: 0, y: 0 });
  }, [left, top, pan]);

  const responder = useMemo(() => {
    const limitar = (dx: number, dy: number) => {
      const p = ultimo.current;
      const maxLeft = Math.max(0, p.lienzo.ancho - p.ancho);
      const maxTop = Math.max(0, p.lienzo.alto - p.alto);
      return {
        x: Math.min(maxLeft, Math.max(0, p.left + dx)) - p.left,
        y: Math.min(maxTop, Math.max(0, p.top + dy)) - p.top,
      };
    };
    const quiereArrastrar = (dx: number, dy: number) => ultimo.current.puedeEditar && Math.hypot(dx, dy) > UMBRAL_ARRASTRE;
    const volver = () => Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, bounciness: 4 }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => quiereArrastrar(g.dx, g.dy),
      onMoveShouldSetPanResponder: (_, g) => quiereArrastrar(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        tocar();
        setArrastrando(true);
      },
      onPanResponderMove: (_, g) => {
        pan.setValue(limitar(g.dx, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        setArrastrando(false);
        const d = limitar(g.dx, g.dy);
        const p = ultimo.current;
        p.onSoltar(p.mesa, p.left + d.x, p.top + d.y)
          .then((guardado) => {
            if (!guardado) volver();
          })
          .catch(volver);
      },
      onPanResponderTerminate: () => {
        setArrastrando(false);
        volver();
      },
    });
  }, [pan]);

  const tinta = estado === 'duelo_en_curso' ? colors.gold : estado === 'consumo' ? colors.ink : colors.dim;
  const borde = estado === 'duelo_en_curso' ? colors.gold : estado === 'consumo' ? colors.br : colors.line;
  const fondo = estado === 'duelo_en_curso' ? colors.shade : estado === 'consumo' ? colors.brs : 'transparent';
  const tipoTexto = mesa.tipo === 'duelo' ? 'Duelo' : 'Café';
  const estadoTexto = estado === 'duelo_en_curso' ? `duelo en curso, ${info}` : estado === 'consumo' ? `cuenta abierta de ${info}` : 'libre';

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.mesa,
        {
          left,
          top,
          width: ancho,
          height: alto,
          borderRadius: mesa.tipo === 'duelo' ? Radii.duelTable : Radii.cafeTable,
          borderColor: borde,
          backgroundColor: fondo,
          zIndex: arrastrando ? 10 : 1,
          opacity: arrastrando ? 0.85 : 1,
          transform: pan.getTranslateTransform(),
        },
      ]}
    >
      <Pressable
        style={styles.mesaPress}
        onPress={() => {
          tocar();
          onAbrir(mesa);
        }}
        onLongPress={puedeEditar ? () => onOpciones(mesa) : undefined}
        delayLongPress={450}
        accessibilityRole="button"
        accessibilityLabel={`Mesa ${numeroMesaTexto(mesa.numero)}, ${tipoTexto.toLowerCase()}, ${estadoTexto}`}
        accessibilityHint={puedeEditar ? 'Abre el pedido. Mantené apretado para opciones o arrastrá para moverla.' : 'Abre el pedido.'}
      >
        <Text style={[styles.mesaNumero, { color: tinta }, tabularNums(18)]}>{numeroMesaTexto(mesa.numero)}</Text>
        <Text style={[styles.mesaTipo, { color: colors.dim }]}>{tipoTexto.toUpperCase()}</Text>
        <Text style={[styles.mesaInfo, { color: tinta }, tabularNums(11)]} numberOfLines={1}>
          {info}
        </Text>
      </Pressable>
    </Animated.View>
  );
});

interface SalaModalProps {
  readonly visible: boolean;
  readonly sala: Sala | null;
  readonly salas: readonly Sala[];
  readonly onCerrar: () => void;
  readonly onGuardada: (id: string) => void;
}

function SalaModal({ visible, sala, salas, onCerrar, onGuardada }: SalaModalProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (visible) {
      setNombre(sala?.nombre ?? '');
      setError(null);
    }
  }, [visible, sala]);

  const guardar = async () => {
    if (guardando) return;
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    if (!limpio) {
      setError('Escribí un nombre para la sala.');
      return;
    }
    if (limpio.length > NOMBRE_SALA_MAX) {
      setError(`El nombre puede tener hasta ${NOMBRE_SALA_MAX} caracteres.`);
      return;
    }
    const repetida = salas.some((s) => s.id !== sala?.id && s.nombre.toLocaleLowerCase('es') === limpio.toLocaleLowerCase('es'));
    if (repetida) {
      setError('Ya hay una sala con ese nombre.');
      return;
    }
    setGuardando(true);
    const tardio = (e: unknown) => toast.mostrar(mensajeError(e, `La sala ${limpio} no se guardó.`), 'error');
    try {
      if (sala) {
        const r = await esperarConfirmacion(updateDoc(doc(db, 'salas', sala.id), { nombre: limpio }), ESPERA_ESCRITURA_MS, tardio);
        toast.mostrar(`Sala renombrada a ${limpio}.${r === 'pendiente' ? SIN_CONEXION : ''}`, r === 'pendiente' ? 'info' : 'ok');
        onGuardada(sala.id);
      } else {
        const orden = salas.reduce((max, s) => Math.max(max, s.orden), -1) + 1;
        const ref = doc(collection(db, 'salas'));
        const r = await esperarConfirmacion(setDoc(ref, { nombre: limpio, orden, creadoEn: serverTimestamp() }), ESPERA_ESCRITURA_MS, tardio);
        toast.mostrar(`Sala ${limpio} creada.${r === 'pendiente' ? SIN_CONEXION : ''}`, r === 'pendiente' ? 'info' : 'ok');
        onGuardada(ref.id);
      }
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar la sala.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlayCentro}>
        <View style={[styles.modalCard, { backgroundColor: colors.sf, borderColor: colors.line }]}>
          <Text style={[styles.modalTitulo, { color: colors.ink }]} accessibilityRole="header">
            {sala ? 'Renombrar sala' : 'Nueva sala'}
          </Text>
          <FormField
            label="Nombre de la sala"
            placeholder="Planta baja, Terraza…"
            value={nombre}
            onChangeText={(t) => {
              setNombre(t);
              setError(null);
            }}
            maxLength={NOMBRE_SALA_MAX}
            autoFocus
            autoCapitalize="sentences"
            returnKeyType="done"
            onSubmitEditing={() => {
              void guardar();
            }}
          />
          {error ? (
            <Text style={[styles.errorTexto, { color: colors.dg }]} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <View style={styles.modalBotones}>
            <View style={styles.flex1}>
              <Button label="Cancelar" variant="secondary" onPress={onCerrar} disabled={guardando} />
            </View>
            <View style={styles.flex16}>
              <Button label="Guardar" onPress={() => void guardar()} loading={guardando} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function infoMesa(mesa: Mesa, estado: EstadoMesaVisual, duelo: DueloEnMesa | undefined, segundos: number): string {
  if (estado === 'duelo_en_curso' && duelo) return etiquetaDuelo(duelo.ronda, segundos);
  if (estado === 'consumo') return formatARS(subtotalDe(mesa.pedido));
  return 'libre';
}

export default function SalonScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { profile } = useUserProfileContext();
  const esAdmin = profile?.role === 'admin';

  const { salas, cargando: cargandoSalas, error: errorSalas } = useSalas();
  const { mesas, cargando: cargandoMesas, error: errorMesas } = useMesas('todas');
  const { torneo, error: errorTorneo, reintentar: reintentarTorneo } = useUltimoTorneo();

  const duelos = useMemo(() => duelosPorMesa(torneo), [torneo]);
  const ahora = useAhora(duelos.size > 0 && torneo?.rondaPausada !== true);
  const segundos = torneo && duelos.size > 0 ? segundosRestantes(torneo, ahora) : 0;

  const [salaElegida, setSalaElegida] = useState<string | null>(null);
  const [lienzo, setLienzo] = useState<Medidas | null>(null);
  const [modalSala, setModalSala] = useState<{ visible: boolean; sala: Sala | null }>({ visible: false, sala: null });
  const [creandoMesa, setCreandoMesa] = useState(false);

  const salaActual = salas.find((s) => s.id === salaElegida) ?? salas[0] ?? null;

  const mesasSala = useMemo(() => {
    if (!salaActual) return [];
    const ids = new Set(salas.map((s) => s.id));
    const esPrimera = salas[0]?.id === salaActual.id;
    // Mesas de salas borradas (o docs viejos sin sala) se muestran en la primera para que no queden invisibles.
    return mesas.filter((m) => m.salaId === salaActual.id || (esPrimera && !ids.has(m.salaId)));
  }, [mesas, salas, salaActual]);

  const { ocupadas, enDuelo } = useMemo(() => contarSalon(mesas, duelos), [mesas, duelos]);

  const onLayoutLienzo = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const ancho = Math.round(width - 2 * BORDE_LIENZO);
    const alto = Math.round(height - 2 * BORDE_LIENZO);
    setLienzo((prev) => (prev && prev.ancho === ancho && prev.alto === alto ? prev : { ancho, alto }));
  }, []);

  const abrirMesa = useCallback(
    (mesa: Mesa) => {
      router.push({ pathname: '/(tabs)/salon/pedido', params: { mesaId: mesa.id } });
    },
    [router]
  );

  const soltarMesa = useCallback(
    async (mesa: Mesa, left: number, top: number): Promise<boolean> => {
      if (!lienzo || !salaActual) return false;
      const t = tamanoMesa(mesa.tipo, lienzo.ancho);
      const x = aFraccion(left, lienzo.ancho, t.ancho);
      const y = aFraccion(top, lienzo.alto, t.alto);
      const mismaSala = mesa.salaId === salaActual.id;
      if (mismaSala && esFraccion(mesa.x) && esFraccion(mesa.y) && x === mesa.x && y === mesa.y) return false;
      try {
        await esperarConfirmacion(
          updateDoc(doc(db, 'mesas', mesa.id), mismaSala ? { x, y } : { x, y, salaId: salaActual.id }),
          ESPERA_ESCRITURA_MS,
          (e) => toast.mostrar(mensajeError(e, 'No se pudo mover la mesa.'), 'error')
        );
        return true;
      } catch (e) {
        toast.mostrar(mensajeError(e, 'No se pudo mover la mesa.'), 'error');
        return false;
      }
    },
    [lienzo, salaActual, toast]
  );

  const crearMesa = useCallback(
    async (tipo: TipoMesa) => {
      if (!salaActual || creandoMesa) return;
      setCreandoMesa(true);
      try {
        const ocupadasFraccion = mesasSala.map((m) => {
          if (!lienzo) return { x: esFraccion(m.x) ? m.x : 0.5, y: esFraccion(m.y) ? m.y : 0.5 };
          const t = tamanoMesa(m.tipo, lienzo.ancho);
          return {
            x: aFraccion(aPixeles(m.x, lienzo.ancho, t.ancho), lienzo.ancho, t.ancho),
            y: aFraccion(aPixeles(m.y, lienzo.alto, t.alto), lienzo.alto, t.alto),
          };
        });
        const pos = posicionLibre(ocupadasFraccion);
        const numero = siguienteNumeroMesa(mesas);
        const r = await esperarConfirmacion(
          setDoc(doc(collection(db, 'mesas')), {
            numero,
            x: pos.x,
            y: pos.y,
            salaId: salaActual.id,
            tipo,
            estado: 'libre',
            pedido: [],
            creadoEn: serverTimestamp(),
          }),
          ESPERA_ESCRITURA_MS,
          (e) => toast.mostrar(mensajeError(e, 'No se pudo crear la mesa.'), 'error')
        );
        toast.mostrar(`Mesa ${numeroMesaTexto(numero)} agregada.${r === 'pendiente' ? SIN_CONEXION : ''}`, r === 'pendiente' ? 'info' : 'ok');
      } catch (e) {
        toast.mostrar(mensajeError(e, 'No se pudo crear la mesa.'), 'error');
      } finally {
        setCreandoMesa(false);
      }
    },
    [salaActual, creandoMesa, mesasSala, lienzo, mesas, toast]
  );

  const agregarMesa = useCallback(() => {
    if (!salaActual) return;
    Alert.alert('Nueva mesa', `¿Qué tipo de mesa agregás en ${salaActual.nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Café', onPress: () => void crearMesa('cafe') },
      { text: 'Duelo', onPress: () => void crearMesa('duelo') },
    ]);
  }, [salaActual, crearMesa]);

  const cambiarTipo = useCallback(
    async (mesa: Mesa) => {
      const tipo: TipoMesa = mesa.tipo === 'cafe' ? 'duelo' : 'cafe';
      try {
        await esperarConfirmacion(updateDoc(doc(db, 'mesas', mesa.id), { tipo }), ESPERA_ESCRITURA_MS, (e) =>
          toast.mostrar(mensajeError(e, 'No se pudo cambiar la mesa.'), 'error')
        );
        toast.mostrar(`Mesa ${numeroMesaTexto(mesa.numero)} ahora es de ${tipo === 'duelo' ? 'duelo' : 'café'}`);
      } catch (e) {
        toast.mostrar(mensajeError(e, 'No se pudo cambiar la mesa.'), 'error');
      }
    },
    [toast]
  );

  const confirmarEliminarMesa = useCallback(
    (mesa: Mesa) => {
      Alert.alert(`¿Eliminar la mesa ${numeroMesaTexto(mesa.numero)}?`, 'Desaparece del plano. No se puede deshacer.', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            esperarConfirmacion(deleteDoc(doc(db, 'mesas', mesa.id)), ESPERA_ESCRITURA_MS, (e) =>
              toast.mostrar(mensajeError(e, 'No se pudo eliminar la mesa.'), 'error')
            )
              .then(() => toast.mostrar(`Mesa ${numeroMesaTexto(mesa.numero)} eliminada`))
              .catch((e: unknown) => toast.mostrar(mensajeError(e, 'No se pudo eliminar la mesa.'), 'error'));
          },
        },
      ]);
    },
    [toast]
  );

  const opcionesMesa = useCallback(
    (mesa: Mesa) => {
      const enDueloAhora = duelos.has(mesa.id);
      const libre = mesa.estado === 'libre' && mesa.pedido.length === 0 && !enDueloAhora;
      const botones: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
      if (!enDueloAhora) {
        botones.push({
          text: mesa.tipo === 'cafe' ? 'Cambiar a mesa de duelo' : 'Cambiar a mesa de café',
          onPress: () => void cambiarTipo(mesa),
        });
      }
      if (libre) botones.push({ text: 'Eliminar', style: 'destructive', onPress: () => confirmarEliminarMesa(mesa) });
      botones.push({ text: 'Cancelar', style: 'cancel' });
      const aviso = enDueloAhora
        ? 'Tiene un duelo en curso: se puede cambiar o eliminar cuando termine la partida.'
        : libre
          ? undefined
          : 'Para eliminarla tiene que estar libre (sin cuenta abierta).';
      Alert.alert(`Mesa ${numeroMesaTexto(mesa.numero)}`, aviso, botones);
    },
    [duelos, cambiarTipo, confirmarEliminarMesa]
  );

  const eliminarSala = useCallback(
    (sala: Sala) => {
      const propias = mesas.filter((m) => m.salaId === sala.id);
      const ocupada = propias.some((m) => m.estado !== 'libre' || m.pedido.length > 0 || duelos.has(m.id));
      if (ocupada) {
        Alert.alert('No se puede eliminar', `En ${sala.nombre} hay mesas con cuenta abierta o en duelo. Cerralas antes de eliminar la sala.`);
        return;
      }
      const detalle = propias.length === 1 ? 'También se elimina su mesa.' : propias.length > 1 ? `También se eliminan sus ${propias.length} mesas.` : 'No tiene mesas.';
      Alert.alert(`¿Eliminar ${sala.nombre}?`, `${detalle} No se puede deshacer.`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const snap = await getDocs(query(collection(db, 'mesas'), where('salaId', '==', sala.id)));
                const batch = writeBatch(db);
                snap.docs.forEach((d) => batch.delete(d.ref));
                batch.delete(doc(db, 'salas', sala.id));
                await esperarConfirmacion(batch.commit(), ESPERA_ESCRITURA_MS, (e) =>
                  toast.mostrar(mensajeError(e, `${sala.nombre} no se eliminó.`), 'error')
                );
                setSalaElegida(null);
                toast.mostrar(`${sala.nombre} eliminada`);
              } catch (e) {
                toast.mostrar(mensajeError(e, 'No se pudo eliminar la sala.'), 'error');
              }
            })();
          },
        },
      ]);
    },
    [mesas, duelos, toast]
  );

  const opcionesSala = useCallback(
    (sala: Sala) => {
      Alert.alert(sala.nombre, undefined, [
        { text: 'Renombrar', onPress: () => setModalSala({ visible: true, sala }) },
        { text: 'Eliminar', style: 'destructive', onPress: () => eliminarSala(sala) },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    },
    [eliminarSala]
  );

  if (cargandoSalas || (cargandoMesas && mesas.length === 0 && !errorMesas)) return <LoadingScreen />;

  const errorVisible = errorSalas ?? errorMesas;
  const resumen = `${ocupadas} ${ocupadas === 1 ? 'ocupada' : 'ocupadas'}${enDuelo > 0 ? ` · ${enDuelo} en duelo` : ''}`;

  return (
    <Screen
      title="Salón"
      scroll={false}
      right={
        <Text style={[styles.resumen, { color: colors.dim }]} accessibilityLabel={`${resumen} en todo el local`}>
          {resumen}
        </Text>
      }
    >
      <View style={styles.cuerpo}>
        {errorVisible ? <ErrorBanner mensaje={mensajeError(errorVisible, 'No se pudo cargar el salón.')} /> : null}
        {errorTorneo ? (
          <ErrorBanner mensaje={`${mensajeError(errorTorneo, 'No se pudo leer el torneo.')} Las mesas en duelo no se marcan.`} onRetry={reintentarTorneo} />
        ) : null}

        {salas.length === 0 ? (
          <EmptyState
            title="Todavía no hay salas"
            body={esAdmin ? 'Creá la primera sala y después agregá sus mesas.' : 'Pedile al admin que arme el plano del salón.'}
            action={esAdmin ? <Button label="+ Sala" onPress={() => setModalSala({ visible: true, sala: null })} /> : undefined}
          />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
              {salas.map((s) => (
                <Chip
                  key={s.id}
                  label={s.nombre}
                  active={salaActual?.id === s.id}
                  onPress={() => setSalaElegida(s.id)}
                  onLongPress={esAdmin ? () => opcionesSala(s) : undefined}
                  accessibilityHint={esAdmin ? 'Mantené apretado para renombrar o eliminar la sala.' : undefined}
                />
              ))}
              {esAdmin ? (
                <Chip label="+ Sala" active={false} onPress={() => setModalSala({ visible: true, sala: null })} accessibilityHint="Crea una sala nueva." />
              ) : null}
            </ScrollView>

            <View style={[styles.lienzo, { borderColor: colors.line }]} onLayout={onLayoutLienzo}>
              {lienzo ? <PuntosLienzo ancho={lienzo.ancho} alto={lienzo.alto} color={colors.shade} /> : null}
              {lienzo && mesasSala.length === 0 ? (
                <View style={styles.lienzoVacio}>
                  <Text style={[styles.lienzoVacioTitulo, { color: colors.ink }]}>Esta sala no tiene mesas</Text>
                  <Text style={[styles.lienzoVacioTexto, { color: colors.dim }]}>
                    {esAdmin ? 'Tocá "+ Mesa" para agregar la primera.' : 'El admin las agrega desde acá.'}
                  </Text>
                </View>
              ) : null}
              {lienzo
                ? mesasSala.map((m) => {
                    const t = tamanoMesa(m.tipo, lienzo.ancho);
                    const duelo = duelos.get(m.id);
                    const estado = estadoVisual(m.estado, !!duelo);
                    return (
                      <MesaEnLienzo
                        key={m.id}
                        mesa={m}
                        left={aPixeles(m.x, lienzo.ancho, t.ancho)}
                        top={aPixeles(m.y, lienzo.alto, t.alto)}
                        ancho={t.ancho}
                        alto={t.alto}
                        lienzo={lienzo}
                        estado={estado}
                        info={infoMesa(m, estado, duelo, segundos)}
                        puedeEditar={esAdmin}
                        onAbrir={abrirMesa}
                        onOpciones={opcionesMesa}
                        onSoltar={soltarMesa}
                      />
                    );
                  })
                : null}
            </View>

            <View style={styles.leyenda} accessibilityRole="summary">
              <View style={styles.leyendaItem}>
                <View style={[styles.muestra, styles.muestraCirculo, { borderColor: colors.line }]} />
                <Text style={[styles.leyendaTexto, { color: colors.dim }]}>Libre</Text>
              </View>
              <View style={styles.leyendaItem}>
                <View style={[styles.muestra, styles.muestraCirculo, { borderColor: colors.br, backgroundColor: colors.brs }]} />
                <Text style={[styles.leyendaTexto, { color: colors.dim }]}>Consumo</Text>
              </View>
              <View style={styles.leyendaItem}>
                <View style={[styles.muestra, { borderColor: colors.gold, backgroundColor: colors.shade }]} />
                <Text style={[styles.leyendaTexto, { color: colors.dim }]}>Duelo en curso</Text>
              </View>
            </View>

            {esAdmin ? (
              <View style={styles.barraAdmin}>
                <Text style={[styles.ayuda, { color: colors.dim }]}>Arrastrá para mover · mantené apretado para más opciones</Text>
                <SmallButton label={creandoMesa ? 'Creando…' : '+ Mesa'} onPress={agregarMesa} disabled={creandoMesa || !salaActual} />
              </View>
            ) : null}
          </>
        )}
      </View>

      {esAdmin ? (
        <SalaModal
          visible={modalSala.visible}
          sala={modalSala.sala}
          salas={salas}
          onCerrar={() => setModalSala({ visible: false, sala: null })}
          onGuardada={(id) => {
            setSalaElegida(id);
            setModalSala({ visible: false, sala: null });
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cuerpo: { flex: 1, paddingHorizontal: 20, paddingBottom: 14 },
  resumen: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, paddingTop: 10 },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingVertical: 4 },
  lienzo: { flex: 1, minHeight: 260, marginTop: 12, borderWidth: BORDE_LIENZO, borderRadius: Radii.roomBoard, overflow: 'hidden' },
  punto: { position: 'absolute', width: 2, height: 2, borderRadius: 1 },
  lienzoVacio: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lienzoVacioTitulo: { fontFamily: Typography.fontFamily.semibold, fontSize: 14, textAlign: 'center' },
  lienzoVacioTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, textAlign: 'center', marginTop: 6 },
  mesa: { position: 'absolute', borderWidth: 1.5 },
  mesaPress: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  mesaNumero: { fontFamily: Typography.fontFamily.semibold, fontSize: 18, lineHeight: 20 },
  mesaTipo: { fontFamily: Typography.fontFamily.semibold, fontSize: 8.5, letterSpacing: 1, marginTop: 3 },
  mesaInfo: { fontFamily: Typography.fontFamily.semibold, fontSize: 11, marginTop: 2 },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 12 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muestra: { width: 9, height: 9, borderWidth: 1.5 },
  muestraCirculo: { borderRadius: 4.5 },
  leyendaTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 11 },
  barraAdmin: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 },
  ayuda: { flex: 1, fontFamily: Typography.fontFamily.regular, fontSize: 11, lineHeight: 15 },
  overlayCentro: { flex: 1, backgroundColor: 'rgba(20,16,13,0.55)', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 18, borderWidth: 1, padding: 20, gap: 12 },
  modalTitulo: { fontFamily: Typography.fontFamily.bold, fontSize: 19, letterSpacing: -0.4 },
  errorTexto: { fontFamily: Typography.fontFamily.medium, fontSize: 12 },
  modalBotones: { flexDirection: 'row', gap: 10, marginTop: 4 },
  flex1: { flex: 1 },
  flex16: { flex: 1.6 },
});
