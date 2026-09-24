import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, increment, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useConfig } from '../../../contexts/ConfigContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useToast } from '../../../contexts/ToastContext';
import { useUserProfileContext } from '../../../contexts/UserProfileContext';
import { Typography, tabularNums } from '../../../constants/theme';
import { useCatalogo } from '../../../hooks/useCatalogo';
import { JugadorCredito, useCreditoJugadores } from '../../../hooks/useCreditoJugadores';
import { useUltimoTorneo } from '../../../hooks/useUltimoTorneo';
import Screen, { LoadingScreen } from '../../../components/Screen';
import { EmptyState, ErrorBanner, SectionLabel } from '../../../components/ui';
import Button from '../../../components/Button';
import Chip from '../../../components/Chip';
import FormField from '../../../components/FormField';
import Stepper from '../../../components/Stepper';
import { mensajeError } from '../../../lib/errores';
import { fechaLocal, horaLocal } from '../../../lib/fecha';
import { tocar } from '../../../lib/haptics';
import {
  CatalogoItem,
  ItemPedido,
  MEDIOS_PAGO,
  MedioPago,
  RUBROS,
  Rubro,
  Unidad,
  formatARS,
  formatCantidad,
  stockBajo,
  subtotalDe,
} from '../../../lib/pedido';
import {
  DueloEnMesa,
  agregarItem,
  buscarEnCatalogo,
  cambiarCantidad,
  cantidadEnCuenta,
  coincideBusqueda,
  creditoAplicable,
  descuentosDeStock,
  duelosPorMesa,
  esperarConfirmacion,
  etiquetaDuelo,
  medioDePagoFinal,
  mismoPedido,
  normalizarLineas,
  numeroMesaTexto,
  puedeAgregar,
} from '../../../lib/salon';
import { segundosRestantes } from '../../../lib/torneo';

const ESPERA_ESCRITURA_MS = 4000;
const MAX_RESULTADOS_JUGADOR = 6;

interface MesaPedido {
  numero: number;
  estado: string;
  pedido: ItemPedido[];
}

type EstadoCarga = 'cargando' | 'ok' | 'no_existe' | 'error';

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

function textoQuedan(stock: number, unidad: Unidad): string {
  if (stock <= 0) return 'sin stock';
  return `quedan ${formatCantidad(stock, unidad).replace(/ u$/, '')}`;
}

function limpiarLinea(l: ItemPedido): ItemPedido {
  return { itemId: l.itemId, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad, rubro: l.rubro, origen: l.origen };
}

interface ProductoCardProps {
  readonly item: CatalogoItem;
  readonly enCuenta: number;
  readonly alertaLocal: number;
  readonly onAgregar: (item: CatalogoItem) => void;
}

function ProductoCard({ item, enCuenta, alertaLocal, onAgregar }: ProductoCardProps) {
  const { colors } = useTheme();
  const sinStock = item.stock !== null && item.stock <= 0;
  const bajo = stockBajo(item, alertaLocal);
  const tope = !sinStock && !puedeAgregar(item, enCuenta);
  const meta = item.stock === null ? formatARS(item.precio) : `${formatARS(item.precio)} · ${textoQuedan(item.stock, item.unidad)}`;
  return (
    <Pressable
      onPress={() => {
        tocar();
        onAgregar(item);
      }}
      disabled={sinStock}
      style={({ pressed }) => [
        styles.producto,
        { borderColor: enCuenta > 0 ? colors.br : colors.line, backgroundColor: colors.sf, opacity: sinStock ? 0.45 : pressed ? 0.7 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.nombre}, ${meta}${enCuenta > 0 ? `, ${enCuenta} en la cuenta` : ''}`}
      accessibilityHint={sinStock ? undefined : tope ? 'No queda más stock para sumar.' : 'Suma uno a la cuenta.'}
      accessibilityState={{ disabled: sinStock }}
    >
      <Text style={[styles.productoNombre, { color: colors.ink }]} numberOfLines={2}>
        {item.nombre}
      </Text>
      <Text style={[styles.productoMeta, { color: bajo ? colors.dg : colors.dim }, tabularNums(11)]} numberOfLines={1}>
        {meta}
      </Text>
    </Pressable>
  );
}

interface FilaJugadorProps {
  readonly jugador: JugadorCredito;
  readonly elegido: boolean;
  readonly onPress: () => void;
}

function FilaJugador({ jugador, elegido, onPress }: FilaJugadorProps) {
  const { colors } = useTheme();
  const sinCredito = jugador.credito <= 0;
  return (
    <Pressable
      onPress={() => {
        tocar();
        onPress();
      }}
      disabled={sinCredito}
      style={[
        styles.filaJugador,
        {
          borderColor: elegido ? colors.gold : colors.line,
          borderWidth: elegido ? 1.5 : 1,
          backgroundColor: elegido ? colors.shade : 'transparent',
          opacity: sinCredito ? 0.5 : 1,
        },
      ]}
      accessibilityRole="radio"
      accessibilityLabel={`${jugador.nombre}, ${sinCredito ? 'sin crédito' : `${formatARS(jugador.credito)} de crédito`}`}
      accessibilityState={{ selected: elegido, checked: elegido, disabled: sinCredito }}
    >
      <Text style={[styles.filaJugadorNombre, { color: colors.ink }]} numberOfLines={1}>
        {jugador.nombre}
      </Text>
      <Text style={[styles.filaJugadorCredito, { color: sinCredito ? colors.dim : colors.gold }, tabularNums(12.5)]}>
        {sinCredito ? 'sin crédito' : formatARS(jugador.credito)}
      </Text>
    </Pressable>
  );
}

interface CobroSheetProps {
  readonly visible: boolean;
  readonly mesaId: string;
  readonly mesaNumero: number;
  readonly cuenta: readonly ItemPedido[];
  readonly catalogo: readonly CatalogoItem[];
  readonly duelo: DueloEnMesa | undefined;
  readonly jugadores: readonly JugadorCredito[];
  readonly porUid: ReadonlyMap<string, JugadorCredito>;
  readonly cargandoJugadores: boolean;
  readonly errorJugadores: unknown;
  readonly bloqueo: string | null;
  readonly onCerrar: () => void;
  readonly onCobrado: (total: number, pendiente: boolean) => void;
}

function CobroSheet(props: CobroSheetProps) {
  const { visible, mesaId, mesaNumero, cuenta, catalogo, duelo, jugadores, porUid, cargandoJugadores, errorJugadores, bloqueo, onCerrar, onCobrado } = props;
  const { colors } = useTheme();
  const toast = useToast();
  const { config } = useConfig();
  const { user } = useUserProfileContext();

  const [medio, setMedio] = useState<MedioPago | null>(null);
  const [jugadorUid, setJugadorUid] = useState<string | null>(null);
  const [aplicar, setAplicar] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMedio(null);
    setJugadorUid(null);
    setAplicar(false);
    setBusqueda('');
    setError(null);
  }, [visible]);

  const subtotal = subtotalDe(cuenta);
  const sentados = useMemo(() => {
    if (!duelo) return [];
    const p = duelo.partida;
    return [p.jugador1, p.jugador2]
      .filter((j): j is NonNullable<typeof j> => !!j && typeof j.uid === 'string')
      .map((j) => porUid.get(j.uid) ?? { uid: j.uid, nombre: j.nombre, credito: 0 });
  }, [duelo, porUid]);

  const candidatos = useMemo(() => {
    if (sentados.length > 0) return sentados;
    if (busqueda.trim()) return jugadores.filter((j) => coincideBusqueda(j.nombre, busqueda)).slice(0, MAX_RESULTADOS_JUGADOR);
    return jugadores
      .filter((j) => j.credito > 0)
      .sort((a, b) => b.credito - a.credito)
      .slice(0, MAX_RESULTADOS_JUGADOR);
  }, [sentados, busqueda, jugadores]);

  const elegido = jugadorUid ? porUid.get(jugadorUid) ?? sentados.find((j) => j.uid === jugadorUid) : undefined;
  const credito = elegido?.credito ?? 0;
  const aplicable = creditoAplicable(credito, subtotal);
  const creditoAplicado = aplicar && elegido ? aplicable : 0;
  const total = subtotal - creditoAplicado;
  const medioFinal = medioDePagoFinal(total, medio);
  const { descuentos, huerfanas } = useMemo(() => descuentosDeStock(cuenta, catalogo), [cuenta, catalogo]);
  const uid = user?.uid ?? null;
  const puedeConfirmar = !enviando && !bloqueo && cuenta.length > 0 && medioFinal !== null && !!uid;

  const confirmar = async () => {
    if (!puedeConfirmar || !uid || medioFinal === null) return;
    setEnviando(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'ventas')), {
        mesaId,
        mesaNum: mesaNumero,
        items: cuenta.map(limpiarLinea),
        subtotal,
        creditoAplicado,
        creditoUid: creditoAplicado > 0 && elegido ? elegido.uid : null,
        total,
        medioPago: medioFinal,
        fecha: fechaLocal(),
        hora: horaLocal(),
        creadoPor: uid,
        creadoEn: serverTimestamp(),
      });
      if (config.descontarStock) {
        for (const d of descuentos) batch.update(doc(db, d.coleccion, d.id), { stock: increment(-d.cantidad) });
      }
      if (creditoAplicado > 0 && elegido) {
        batch.update(doc(db, 'users', elegido.uid), { creditoCafeteria: increment(-creditoAplicado) });
      }
      batch.update(doc(db, 'mesas', mesaId), { pedido: [], estado: 'libre' });
      const resultado = await esperarConfirmacion(batch.commit(), ESPERA_ESCRITURA_MS, (e) =>
        toast.mostrar(`El cobro de la mesa ${numeroMesaTexto(mesaNumero)} no se registró: ${mensajeError(e)}`, 'error')
      );
      onCobrado(total, resultado === 'pendiente');
    } catch (e) {
      // El batch es atómico: si el saldo de crédito cambió en otro dispositivo, las reglas rechazan todo el cobro.
      const extra = creditoAplicado > 0 ? ' Si aplicaste crédito, revisá que el jugador todavía lo tenga.' : '';
      setError(`${mensajeError(e, 'No se pudo registrar el cobro.')}${extra}`);
    } finally {
      setEnviando(false);
    }
  };

  const elegirJugador = (j: JugadorCredito) => {
    if (jugadorUid === j.uid) {
      setJugadorUid(null);
      setAplicar(false);
      return;
    }
    setJugadorUid(j.uid);
    setAplicar(j.credito > 0);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={enviando ? () => undefined : onCerrar}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={enviando ? undefined : onCerrar} accessibilityRole="button" accessibilityLabel="Cerrar cobro" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
          <View style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.line }]}>
            <View style={[styles.handle, { backgroundColor: colors.line }]} />
            <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.sheetHeader}>
                <Text style={[styles.sheetTitulo, { color: colors.ink }]} accessibilityRole="header">
                  Cobrar mesa {numeroMesaTexto(mesaNumero)}
                </Text>
                <Pressable onPress={onCerrar} disabled={enviando} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancelar cobro" style={styles.cerrar}>
                  <Text style={[styles.cerrarTexto, { color: colors.dim }]}>Cancelar</Text>
                </Pressable>
              </View>

              <View style={[styles.resumen, { borderColor: colors.line, backgroundColor: colors.sf }]}>
                {cuenta.map((l) => (
                  <View key={`${l.origen}:${l.itemId}`} style={styles.resumenFila}>
                    <Text style={[styles.resumenTexto, { color: colors.dim }]} numberOfLines={1}>
                      {l.cantidad} × {l.nombre}
                    </Text>
                    <Text style={[styles.resumenTexto, { color: colors.dim }, tabularNums(12.5)]}>{formatARS(l.precio * l.cantidad)}</Text>
                  </View>
                ))}
                <View style={[styles.divisor, { backgroundColor: colors.line }]} />
                <View style={styles.resumenFila}>
                  <Text style={[styles.resumenTexto, { color: colors.ink }]}>Subtotal</Text>
                  <Text style={[styles.resumenTexto, { color: colors.ink }, tabularNums(12.5)]}>{formatARS(subtotal)}</Text>
                </View>
                {creditoAplicado > 0 ? (
                  <View style={styles.resumenFila}>
                    <Text style={[styles.resumenTexto, { color: colors.gold }]}>Crédito de torneo</Text>
                    <Text style={[styles.resumenTexto, { color: colors.gold }, tabularNums(12.5)]}>−{formatARS(creditoAplicado)}</Text>
                  </View>
                ) : null}
                <View style={styles.resumenFila}>
                  <Text style={[styles.totalLabel, { color: colors.dim }]}>A COBRAR</Text>
                  <Text style={[styles.resumenTotal, { color: colors.ink }, tabularNums(24)]}>{formatARS(total)}</Text>
                </View>
              </View>

              {huerfanas.length > 0 ? (
                <Text style={[styles.aviso, { color: colors.dg }]}>
                  {huerfanas.map((h) => h.nombre).join(', ')} ya no {huerfanas.length === 1 ? 'está' : 'están'} en el catálogo: se cobra al precio
                  anotado, pero no descuenta stock.
                </Text>
              ) : null}

              <SectionLabel>Medio de pago</SectionLabel>
              {total > 0 ? (
                <View style={styles.chipsWrap} accessibilityRole="radiogroup">
                  {MEDIOS_PAGO.map((m) => (
                    <Chip key={m.id} label={m.nombre} active={medio === m.id} onPress={() => setMedio(m.id)} />
                  ))}
                </View>
              ) : (
                <Text style={[styles.nota, { color: colors.dim }]}>El crédito cubre toda la cuenta: se registra como crédito de torneo.</Text>
              )}

              <View style={styles.bloqueCredito}>
                <SectionLabel tone="gold">Crédito de torneo</SectionLabel>
                {errorJugadores ? (
                  <ErrorBanner mensaje={mensajeError(errorJugadores, 'No se pudo cargar el crédito de los jugadores.')} />
                ) : cargandoJugadores ? (
                  <ActivityIndicator color={colors.gold} accessibilityLabel="Cargando jugadores" />
                ) : (
                  <>
                    {sentados.length === 0 ? (
                      <FormField
                        label="Buscar jugador"
                        placeholder="Nombre del jugador"
                        value={busqueda}
                        onChangeText={setBusqueda}
                        autoCapitalize="words"
                        autoCorrect={false}
                        returnKeyType="search"
                        maxLength={40}
                      />
                    ) : (
                      <Text style={[styles.nota, { color: colors.dim }]}>Jugadores sentados en esta mesa de duelo:</Text>
                    )}
                    {candidatos.length === 0 ? (
                      <Text style={[styles.nota, { color: colors.dim }]}>
                        {busqueda.trim() ? 'No hay jugadores con ese nombre.' : 'Ningún jugador tiene crédito para usar.'}
                      </Text>
                    ) : (
                      <View style={styles.listaJugadores} accessibilityRole="radiogroup">
                        {candidatos.map((j) => (
                          <FilaJugador key={j.uid} jugador={j} elegido={jugadorUid === j.uid} onPress={() => elegirJugador(j)} />
                        ))}
                      </View>
                    )}
                    {elegido && aplicable > 0 ? (
                      <View style={[styles.toggleOro, { borderColor: colors.line, backgroundColor: colors.sf }]}>
                        <View style={styles.flex1}>
                          <Text style={[styles.toggleLabel, { color: colors.ink }]}>Aplicar {formatARS(aplicable)}</Text>
                          <Text style={[styles.toggleSub, { color: colors.dim }]}>
                            {elegido.nombre} tiene {formatARS(credito)} de crédito
                          </Text>
                        </View>
                        <Switch
                          value={aplicar}
                          onValueChange={(v) => {
                            tocar();
                            setAplicar(v);
                          }}
                          trackColor={{ false: colors.line, true: colors.gold }}
                          thumbColor="#FFFFFF"
                          ios_backgroundColor={colors.line}
                          accessibilityLabel={`Aplicar ${formatARS(aplicable)} de crédito de ${elegido.nombre}`}
                        />
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </ScrollView>

            <View style={[styles.sheetFooter, { borderTopColor: colors.line }]}>
              {error ? (
                <Text style={[styles.aviso, { color: colors.dg }]} accessibilityRole="alert">
                  {error}
                </Text>
              ) : bloqueo ? (
                <Text style={[styles.aviso, { color: colors.dg }]}>{bloqueo}</Text>
              ) : total > 0 && medioFinal === null ? (
                <Text style={[styles.nota, { color: colors.dim }]}>Elegí el medio de pago para confirmar.</Text>
              ) : null}
              <Button label={`Confirmar cobro ${formatARS(total)}`} onPress={() => void confirmar()} loading={enviando} disabled={!puedeConfirmar} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function PedidoScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { config } = useConfig();
  const { profile } = useUserProfileContext();
  const params = useLocalSearchParams<{ mesaId?: string | string[] }>();
  const mesaId = Array.isArray(params.mesaId) ? params.mesaId[0] : params.mesaId;
  const puedeOperar = profile?.role === 'admin' || profile?.role === 'mozo';

  const { items: catalogo, loading: cargandoCatalogo, error: errorCatalogo } = useCatalogo();
  const { torneo } = useUltimoTorneo();

  const [mesa, setMesa] = useState<MesaPedido | null>(null);
  const [estadoCarga, setEstadoCarga] = useState<EstadoCarga>('cargando');
  const [errorMesa, setErrorMesa] = useState<unknown>(null);
  const [cuenta, setCuenta] = useState<ItemPedido[]>([]);
  const [conflicto, setConflicto] = useState<ItemPedido[] | null>(null);
  const [rubroElegido, setRubroElegido] = useState<Rubro | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cobroAbierto, setCobroAbierto] = useState(false);

  const [baseVista, setBaseVista] = useState<ItemPedido[] | null>(null);
  const base = useRef<ItemPedido[] | null>(null);
  const cuentaActual = useRef<ItemPedido[]>(cuenta);

  // El listener de la mesa compara contra la cuenta vigente sin re-suscribirse en cada toque.
  useLayoutEffect(() => {
    cuentaActual.current = cuenta;
  }, [cuenta]);

  // La base vive en un ref para que el listener lea siempre la última sin re-suscribirse, y en estado para pintar.
  const fijarBase = useCallback((p: ItemPedido[] | null) => {
    base.current = p;
    setBaseVista(p);
  }, []);

  useEffect(() => {
    if (!mesaId || !puedeOperar) return undefined;
    fijarBase(null);
    setEstadoCarga('cargando');
    const unsub = onSnapshot(
      doc(db, 'mesas', mesaId),
      (snap) => {
        if (!snap.exists()) {
          setMesa(null);
          setEstadoCarga('no_existe');
          return;
        }
        const data = snap.data();
        const pedido = normalizarLineas(data.pedido);
        setMesa({
          numero: typeof data.numero === 'number' ? data.numero : 0,
          estado: typeof data.estado === 'string' ? data.estado : 'libre',
          pedido,
        });
        setErrorMesa(null);
        setEstadoCarga('ok');

        const anterior = base.current;
        const local = cuentaActual.current;
        if (anterior === null || mismoPedido(local, anterior)) {
          fijarBase(pedido);
          setCuenta(pedido);
          setConflicto(null);
        } else if (mismoPedido(local, pedido)) {
          fijarBase(pedido);
          setConflicto(null);
        } else if (mismoPedido(pedido, anterior)) {
          setConflicto(null);
        } else {
          // Cambios locales sin guardar y otro dispositivo tocó la mesa: nunca se pisa en silencio.
          setConflicto(pedido);
        }
      },
      (e) => {
        setErrorMesa(e);
        setEstadoCarga((prev) => (prev === 'ok' ? prev : 'error'));
      }
    );
    return unsub;
  }, [mesaId, puedeOperar, fijarBase]);

  const duelo = useMemo(() => (mesaId ? duelosPorMesa(torneo).get(mesaId) : undefined), [torneo, mesaId]);
  const ahora = useAhora(!!duelo && torneo?.rondaPausada !== true);
  const creditos = useCreditoJugadores(puedeOperar && (!!duelo || cobroAbierto));

  const activos = useMemo(() => catalogo.filter((i) => i.activo), [catalogo]);
  const rubros = useMemo(() => RUBROS.filter((r) => activos.some((i) => i.rubro === r)), [activos]);
  const rubro = rubroElegido && rubros.includes(rubroElegido) ? rubroElegido : rubros[0] ?? null;
  const productos = useMemo(() => activos.filter((i) => i.rubro === rubro), [activos, rubro]);
  const filas = useMemo(() => {
    const pares: CatalogoItem[][] = [];
    for (let i = 0; i < productos.length; i += 2) pares.push(productos.slice(i, i + 2));
    return pares;
  }, [productos]);

  const subtotal = subtotalDe(cuenta);
  const sucio = baseVista !== null && !mismoPedido(cuenta, baseVista);

  const agregar = useCallback(
    (item: CatalogoItem) => {
      const enCuenta = cantidadEnCuenta(cuentaActual.current, item);
      if (!puedeAgregar(item, enCuenta)) {
        toast.mostrar(`No hay más ${item.nombre} en stock`, 'info');
        return;
      }
      // Se vuelve a chequear sobre el estado más nuevo: dos toques rápidos no pueden pasarse del stock.
      setCuenta((prev) => (puedeAgregar(item, cantidadEnCuenta(prev, item)) ? agregarItem(prev, item) : prev));
    },
    [toast]
  );

  const recargar = () => {
    if (!conflicto) return;
    fijarBase(conflicto);
    setCuenta(conflicto);
    setConflicto(null);
    toast.mostrar('Cuenta actualizada con la versión del otro dispositivo', 'info');
  };

  const mantenerMia = () => {
    if (!conflicto) return;
    fijarBase(conflicto);
    setConflicto(null);
  };

  const guardar = async () => {
    if (!mesaId || !mesa || guardando || conflicto) return;
    setGuardando(true);
    const numero = numeroMesaTexto(mesa.numero);
    try {
      const lineas = cuenta.map(limpiarLinea);
      const resultado = await esperarConfirmacion(
        updateDoc(doc(db, 'mesas', mesaId), { pedido: lineas, estado: lineas.length > 0 ? 'consumo' : 'libre' }),
        ESPERA_ESCRITURA_MS,
        (e) => toast.mostrar(`La mesa ${numero} no se guardó: ${mensajeError(e)}`, 'error')
      );
      fijarBase(lineas);
      const texto = lineas.length > 0 ? `Mesa ${numero} guardada` : `Mesa ${numero} libre`;
      toast.mostrar(resultado === 'pendiente' ? `${texto}. Se sincroniza cuando vuelva la conexión.` : texto, resultado === 'pendiente' ? 'info' : 'ok');
      router.back();
    } catch (e) {
      toast.mostrar(mensajeError(e, 'No se pudo guardar la mesa.'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const onCobrado = (total: number, pendiente: boolean) => {
    setCobroAbierto(false);
    fijarBase([]);
    setCuenta([]);
    const texto = total > 0 ? `Cobrado ${formatARS(total)}` : 'Cobrado con crédito de torneo';
    toast.mostrar(pendiente ? `${texto}. Se sincroniza cuando vuelva la conexión.` : texto, pendiente ? 'info' : 'ok');
    router.back();
  };

  if (!puedeOperar) {
    return (
      <Screen back="Salón" title="Pedido">
        <EmptyState title="Solo mozos y admin toman pedidos" body="Con tu perfil no podés cargar ni cobrar cuentas." />
      </Screen>
    );
  }

  if (!mesaId || estadoCarga === 'no_existe') {
    return (
      <Screen back="Salón" title="Mesa">
        <EmptyState
          title="Esta mesa ya no existe"
          body="Puede que el admin la haya eliminado del plano."
          action={<Button label="Volver al salón" variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  if (estadoCarga === 'cargando' || (cargandoCatalogo && catalogo.length === 0)) return <LoadingScreen />;

  if (estadoCarga === 'error' || !mesa) {
    return (
      <Screen back="Salón" title="Mesa">
        <ErrorBanner mensaje={mensajeError(errorMesa, 'No se pudo abrir la mesa.')} />
      </Screen>
    );
  }

  const numero = numeroMesaTexto(mesa.numero);
  const segundos = duelo && torneo ? segundosRestantes(torneo, ahora) : 0;
  const estadoTexto = duelo ? `Duelo · ${etiquetaDuelo(duelo.ronda, segundos)}` : mesa.estado !== 'libre' || mesa.pedido.length > 0 ? 'Consumo' : 'Libre';
  const estadoColor = duelo ? colors.gold : estadoTexto === 'Consumo' ? colors.br : colors.dim;
  // Sin el catálogo completo no se sabe qué productos controlan stock: cobrar igual dejaría el stock mal.
  const catalogoIncompleto = config.descontarStock && (cargandoCatalogo || !!errorCatalogo);
  const sentadosConCredito = duelo
    ? [duelo.partida.jugador1, duelo.partida.jugador2]
        .filter((j): j is NonNullable<typeof j> => !!j)
        .map((j) => creditos.porUid.get(j.uid))
        .filter((j): j is JugadorCredito => !!j && j.credito > 0)
    : [];

  const footer = (
    <View style={[styles.footer, { borderTopColor: colors.line, backgroundColor: colors.bg }]}>
      {conflicto ? (
        <View style={[styles.conflicto, { borderColor: colors.dg }]} accessibilityRole="alert">
          <Text style={[styles.conflictoTexto, { color: colors.dg }]}>Otro dispositivo actualizó esta mesa. Tus cambios todavía no se guardaron.</Text>
          <View style={styles.conflictoAcciones}>
            <Pressable onPress={recargar} hitSlop={8} style={styles.conflictoBoton} accessibilityRole="button" accessibilityLabel="Recargar la cuenta del otro dispositivo">
              <Text style={[styles.conflictoAccion, { color: colors.dg }]}>Recargar</Text>
            </Pressable>
            <Pressable onPress={mantenerMia} hitSlop={8} style={styles.conflictoBoton} accessibilityRole="button" accessibilityLabel="Mantener mi versión">
              <Text style={[styles.conflictoAccion, { color: colors.dim }]}>Mantener la mía</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {catalogoIncompleto && cuenta.length > 0 && !conflicto ? (
        <Text style={[styles.nota, { color: errorCatalogo ? colors.dg : colors.dim }]}>
          {errorCatalogo ? 'No se pudo cargar el catálogo: para cobrar hace falta saber qué stock descontar.' : 'Cargando el catálogo para poder cobrar…'}
        </Text>
      ) : null}
      <View style={styles.totalFila}>
        <Text style={[styles.totalLabel, { color: colors.dim }]}>TOTAL</Text>
        <Text style={[styles.total, { color: colors.ink }, tabularNums(27)]} accessibilityLabel={`Total ${formatARS(subtotal)}`}>
          {formatARS(subtotal)}
        </Text>
      </View>
      <View style={styles.acciones}>
        <View style={styles.flex1}>
          <Button label="Guardar" variant="secondary" onPress={() => void guardar()} loading={guardando} disabled={!sucio || !!conflicto} />
        </View>
        <View style={styles.flex17}>
          <Button
            label={`Cobrar ${formatARS(subtotal)}`}
            onPress={() => setCobroAbierto(true)}
            disabled={cuenta.length === 0 || !!conflicto || guardando || catalogoIncompleto}
          />
        </View>
      </View>
    </View>
  );

  return (
    <Screen
      back="Salón"
      title={`Mesa ${numero}`}
      right={
        <Text style={[styles.estado, { color: estadoColor }, tabularNums(11.5)]} accessibilityLabel={`Estado: ${estadoTexto}`}>
          {estadoTexto}
        </Text>
      }
      footer={footer}
    >
      {errorMesa ? <ErrorBanner mensaje={mensajeError(errorMesa, 'Se perdió la conexión con la mesa.')} /> : null}
      {errorCatalogo ? <ErrorBanner mensaje={mensajeError(errorCatalogo, 'No se pudo cargar el catálogo.')} /> : null}

      {rubros.length === 0 ? (
        errorCatalogo ? null : <EmptyState title="Todavía no hay productos" body="El admin los carga desde Stock. Mientras tanto podés cobrar lo que ya está en la cuenta." />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
            {rubros.map((r) => (
              <Chip key={r} label={r} active={rubro === r} onPress={() => setRubroElegido(r)} />
            ))}
          </ScrollView>
          <View style={styles.grilla}>
            {filas.map((par) => (
              <View key={par.map((p) => `${p.origen}:${p.id}`).join('|')} style={styles.grillaFila}>
                {par.map((item) => (
                  <View key={`${item.origen}:${item.id}`} style={styles.flex1}>
                    <ProductoCard item={item} enCuenta={cantidadEnCuenta(cuenta, item)} alertaLocal={config.alertaStock} onAgregar={agregar} />
                  </View>
                ))}
                {par.length === 1 ? <View style={styles.flex1} /> : null}
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.cuentaHeader}>
        <SectionLabel>Cuenta</SectionLabel>
      </View>
      {cuenta.length === 0 ? (
        <Text style={[styles.nota, { color: colors.dim }]}>La cuenta está vacía. Tocá un producto para sumarlo.</Text>
      ) : (
        cuenta.map((l) => {
          const producto = buscarEnCatalogo(catalogo, l);
          const max = !producto ? l.cantidad : producto.stock === null ? undefined : Math.max(l.cantidad, producto.stock);
          return (
            <View key={`${l.origen}:${l.itemId}`} style={[styles.linea, { borderBottomColor: colors.line }]}>
              <Stepper
                value={l.cantidad}
                onIncrement={() => setCuenta((prev) => cambiarCantidad(prev, l, 1))}
                onDecrement={() => setCuenta((prev) => cambiarCantidad(prev, l, -1))}
                max={max}
                accessibilityLabel={`cantidad de ${l.nombre}`}
              />
              <View style={styles.lineaTextos}>
                <Text style={[styles.lineaNombre, { color: colors.ink }]} numberOfLines={2}>
                  {l.nombre}
                </Text>
                {!producto && !cargandoCatalogo ? (
                  <Text style={[styles.lineaAviso, { color: colors.dg }]}>Ya no está en el catálogo</Text>
                ) : null}
              </View>
              <Text style={[styles.lineaSubtotal, { color: colors.ink }, tabularNums(12.5)]}>{formatARS(l.precio * l.cantidad)}</Text>
            </View>
          );
        })
      )}

      {sentadosConCredito.length > 0 ? (
        <View style={[styles.notaCredito, { borderColor: colors.gold }]}>
          <Text style={[styles.notaCreditoTexto, { color: colors.dim }]}>
            <Text style={[styles.notaCreditoTitulo, { color: colors.gold }]}>Crédito de torneo</Text>
            {' — '}
            {sentadosConCredito.map((j) => `${j.nombre} tiene ${formatARS(j.credito)}`).join(' y ')}. Aplicalo al cobrar.
          </Text>
        </View>
      ) : null}

      <CobroSheet
        visible={cobroAbierto}
        mesaId={mesaId}
        mesaNumero={mesa.numero}
        cuenta={cuenta}
        catalogo={catalogo}
        duelo={duelo}
        jugadores={creditos.jugadores}
        porUid={creditos.porUid}
        cargandoJugadores={creditos.cargando}
        errorJugadores={creditos.error}
        bloqueo={
          conflicto
            ? 'Otro dispositivo cambió esta mesa. Cerrá y recargala antes de cobrar.'
            : catalogoIncompleto
              ? 'Falta cargar el catálogo para saber qué stock descontar.'
              : null
        }
        onCerrar={() => setCobroAbierto(false)}
        onCobrado={onCobrado}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  flex17: { flex: 1.7 },
  estado: { fontFamily: Typography.fontFamily.semibold, fontSize: 11.5, paddingTop: 12 },
  chipsScroll: { flexGrow: 0, marginBottom: 12 },
  chips: { gap: 7 },
  grilla: { gap: 8 },
  grillaFila: { flexDirection: 'row', gap: 8 },
  producto: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 68, justifyContent: 'center' },
  productoNombre: { fontFamily: Typography.fontFamily.semibold, fontSize: 14, lineHeight: 17 },
  productoMeta: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 5 },
  cuentaHeader: { marginTop: 22 },
  linea: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  lineaTextos: { flex: 1 },
  lineaNombre: { fontFamily: Typography.fontFamily.regular, fontSize: 13 },
  lineaAviso: { fontFamily: Typography.fontFamily.medium, fontSize: 11, marginTop: 2 },
  lineaSubtotal: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
  nota: { fontFamily: Typography.fontFamily.regular, fontSize: 12, lineHeight: 18 },
  notaCredito: { marginTop: 14, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13 },
  notaCreditoTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, lineHeight: 18 },
  notaCreditoTitulo: { fontFamily: Typography.fontFamily.semibold },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, gap: 10 },
  conflicto: { borderWidth: 1, borderRadius: 12, padding: 11, gap: 6 },
  conflictoTexto: { fontFamily: Typography.fontFamily.medium, fontSize: 12, lineHeight: 17 },
  conflictoAcciones: { flexDirection: 'row', gap: 18 },
  conflictoBoton: { minHeight: 32, justifyContent: 'center' },
  conflictoAccion: { fontFamily: Typography.fontFamily.bold, fontSize: 12.5, textDecorationLine: 'underline' },
  totalFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { fontFamily: Typography.fontFamily.bold, fontSize: 10, letterSpacing: 1.6 },
  total: { fontFamily: Typography.fontFamily.bold, fontSize: 27 },
  acciones: { flexDirection: 'row', gap: 8 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,16,13,0.55)' },
  sheetWrap: { maxHeight: '90%' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, overflow: 'hidden' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginTop: 8 },
  sheetScroll: { padding: 20, paddingTop: 12, gap: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitulo: { fontFamily: Typography.fontFamily.bold, fontSize: 21, letterSpacing: -0.5 },
  cerrar: { minHeight: 44, justifyContent: 'center' },
  cerrarTexto: { fontFamily: Typography.fontFamily.semibold, fontSize: 13 },
  resumen: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 6 },
  resumenFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  resumenTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, flexShrink: 1 },
  resumenTotal: { fontFamily: Typography.fontFamily.bold, fontSize: 24 },
  divisor: { height: 1, marginVertical: 4 },
  aviso: { fontFamily: Typography.fontFamily.medium, fontSize: 12, lineHeight: 17 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bloqueCredito: { gap: 10, marginTop: 4 },
  listaJugadores: { gap: 8 },
  filaJugador: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 12, paddingHorizontal: 13, minHeight: 48 },
  filaJugadorNombre: { flex: 1, fontFamily: Typography.fontFamily.semibold, fontSize: 13.5 },
  filaJugadorCredito: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
  toggleOro: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, minHeight: 56 },
  toggleLabel: { fontFamily: Typography.fontFamily.semibold, fontSize: 13 },
  toggleSub: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 2 },
  sheetFooter: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 8 },
});
