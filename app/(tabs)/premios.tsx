import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useTheme } from '../../contexts/ThemeContext';
import { useConfig } from '../../contexts/ConfigContext';
import { useToast } from '../../contexts/ToastContext';
import { useUserProfileContext } from '../../contexts/UserProfileContext';
import { Typography, tabularNums } from '../../constants/theme';
import { AvisoTorneo, actualizarTorneo, esAvisoTorneo, mensajeTransaccion, useTorneosRecientes } from '../../hooks/useUltimoTorneo';
import { normalizarProducto, normalizarProductoTcg, useCatalogo } from '../../hooks/useCatalogo';
import { pozoCobrado, pozoDe, premioPorEntregar, premiosPorEntregar, type PuestoPremio, type Torneo } from '../../lib/torneo';
import { coleccionDe, formatARS, type CatalogoItem } from '../../lib/pedido';
import { mensajeError } from '../../lib/errores';
import Screen, { LoadingScreen } from '../../components/Screen';
import SoloParaRoles from '../../components/SoloParaRoles';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Stepper from '../../components/Stepper';
import { Badge, Card, EmptyState, ErrorBanner, SectionLabel, SmallButton } from '../../components/ui';

const PASO_CREDITO = 500;
// Tope de cordura por puesto (las reglas de Firestore frenan subidas de crédito mayores).
const MAX_CREDITO_PUESTO = 1_000_000;
const ESPERA_GUARDADO_MS = 700;

export default function PremiosScreen() {
  return (
    <SoloParaRoles roles={['admin', 'juez']} titulo="Premios">
      <PremiosPantalla />
    </SoloParaRoles>
  );
}

function PremiosPantalla() {
  const router = useRouter();
  const { config } = useConfig();
  const params = useLocalSearchParams<{ torneoId?: string | string[] }>();
  const pedido = Array.isArray(params.torneoId) ? params.torneoId[0] : params.torneoId;
  const { torneos, loading, error, reintentar } = useTorneosRecientes();
  const [elegido, setElegido] = useState<string | null>(null);

  // El último torneo siempre; los anteriores solo si quedaron premios sin entregar (si no, se pierden de vista).
  const relevantes = useMemo(
    () => torneos.filter((t, i) => i === 0 || premiosPorEntregar(t, config.creditoPremio) > 0),
    [torneos, config.creditoPremio]
  );
  const buscado = elegido ?? pedido ?? null;
  const torneo = relevantes.find((t) => t.id === buscado) ?? relevantes[0] ?? null;

  if (loading) return <LoadingScreen />;
  if (error && torneos.length === 0) {
    return (
      <Screen title="Premios">
        <ErrorBanner mensaje={mensajeError(error, 'No se pudieron cargar los premios.')} onRetry={reintentar} />
      </Screen>
    );
  }
  if (!torneo) {
    return (
      <Screen title="Premios">
        <EmptyState
          title="Todavía no hay torneos"
          body="El reparto se arma en el último paso de Nuevo torneo y se entrega cuando el torneo cierra."
          action={<Button label="Ir a Torneo" onPress={() => router.navigate('/torneo')} />}
        />
      </Screen>
    );
  }
  // key: al cambiar de torneo, los borradores de crédito del anterior no pueden quedar colgados.
  return <PremiosTorneo key={torneo.id} torneo={torneo} otros={relevantes} onElegir={setElegido} />;
}

interface PremiosTorneoProps {
  readonly torneo: Torneo;
  /** Torneos con premios por entregar (incluye al actual): si hay más de uno, se elige arriba. */
  readonly otros: readonly Torneo[];
  readonly onElegir: (id: string) => void;
}

function PremiosTorneo({ torneo, otros, onElegir }: PremiosTorneoProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { config } = useConfig();
  const { profile } = useUserProfileContext();
  const { mostrar } = useToast();
  const catalogo = useCatalogo();
  const creditoPremio = config.creditoPremio;
  const esAdmin = profile?.role === 'admin';

  const [borradores, setBorradores] = useState<Record<number, number>>({});
  const [entregando, setEntregando] = useState<number | null>(null);
  const [cobrando, setCobrando] = useState<string | null>(null);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pendientesGuardar = useRef<Record<number, number>>({});

  const productoDe = useCallback(
    (p: PuestoPremio): CatalogoItem | null =>
      p.productoId ? catalogo.items.find((i) => i.id === p.productoId && i.origen === (p.productoOrigen ?? 'tcg')) ?? null : null,
    [catalogo.items]
  );

  // El torneo guarda una copia del nombre: aunque el producto se haya borrado, se sabe qué era.
  const nombreProducto = (p: PuestoPremio): string =>
    productoDe(p)?.nombre ?? p.productoNombre ?? (catalogo.loading ? '…' : 'producto borrado');

  const nombreDe = (uid: string | null): string | null => {
    if (!uid) return null;
    return torneo.jugadores.find((j) => j.uid === uid)?.nombre ?? torneo.posiciones?.find((p) => p.uid === uid)?.nombre ?? 'Jugador';
  };

  // Cuando el doc ya refleja el crédito editado, el borrador deja de hacer falta.
  useEffect(() => {
    setBorradores((prev) => {
      let cambio = false;
      const copia = { ...prev };
      torneo.premios.forEach((p) => {
        if (copia[p.puesto] === p.creditoCafeteria || p.entregado) {
          if (copia[p.puesto] !== undefined) {
            delete copia[p.puesto];
            cambio = true;
          }
        }
      });
      return cambio ? copia : prev;
    });
  }, [torneo.premios]);

  const guardarCredito = useCallback(
    (puesto: number, valor: number) => {
      delete pendientesGuardar.current[puesto];
      actualizarTorneo(torneo.id, (t) => {
        const actual = t.premios.find((x) => x.puesto === puesto);
        if (!actual || actual.entregado || actual.creditoCafeteria === valor) return null;
        return { premios: t.premios.map((x) => (x.puesto === puesto ? { ...x, creditoCafeteria: valor } : x)) };
      }).catch((e: unknown) => mostrar(mensajeTransaccion(e, 'No se pudo guardar el crédito del premio.'), 'error'));
    },
    [torneo.id, mostrar]
  );

  // Si se sale de la pantalla antes de que venza la espera, el último valor igual se guarda.
  useEffect(() => {
    const t = timers.current;
    const pendientes = pendientesGuardar.current;
    return () => {
      Object.values(t).forEach(clearTimeout);
      Object.entries(pendientes).forEach(([puesto, valor]) => guardarCredito(Number(puesto), valor));
    };
  }, [guardarCredito]);

  const creditoDe = (p: PuestoPremio) => borradores[p.puesto] ?? p.creditoCafeteria;

  const fijarCredito = (p: PuestoPremio, valor: number) => {
    const nuevo = Math.min(MAX_CREDITO_PUESTO, Math.max(0, Math.round(valor)));
    setBorradores((prev) => ({ ...prev, [p.puesto]: nuevo }));
    clearTimeout(timers.current[p.puesto]);
    pendientesGuardar.current[p.puesto] = nuevo;
    timers.current[p.puesto] = setTimeout(() => guardarCredito(p.puesto, nuevo), ESPERA_GUARDADO_MS);
  };

  const entregar = async (p: PuestoPremio, credito: number) => {
    clearTimeout(timers.current[p.puesto]);
    delete pendientesGuardar.current[p.puesto];
    setEntregando(p.puesto);
    let descontoStock = false;
    try {
      await actualizarTorneo(
        torneo.id,
        (t) => {
          const actual = t.premios.find((x) => x.puesto === p.puesto);
          if (!actual) throw new AvisoTorneo('Ese puesto ya no existe.');
          if (actual.entregado) throw new AvisoTorneo('Ese premio ya estaba entregado.');
          if (!actual.jugadorUid) throw new AvisoTorneo('El puesto todavía no tiene ganador.');
          return { premios: t.premios.map((x) => (x.puesto === p.puesto ? { ...x, creditoCafeteria: credito, entregado: true } : x)) };
        },
        async (tx, t) => {
          const actual = t.premios.find((x) => x.puesto === p.puesto);
          if (!actual?.jugadorUid) return;
          // Se decide con el producto leído en la transacción, no con el catálogo en memoria (que puede no haber cargado).
          let refProducto = null;
          if (actual.productoId && actual.cantidadProducto > 0) {
            const origen = actual.productoOrigen ?? 'tcg';
            const ref = doc(db, coleccionDe(origen), actual.productoId);
            const snap = await tx.get(ref);
            if (snap.exists()) {
              const item = origen === 'tcg' ? normalizarProductoTcg(snap.id, snap.data()) : normalizarProducto(snap.id, snap.data());
              if (item.stock !== null) refProducto = ref;
            }
          }
          // El crédito vive en el directorio: una cuenta vieja que no abrió la app desde la actualización todavía no está.
          const refJugador = doc(db, 'jugadores', actual.jugadorUid);
          if (credito > 0 && !(await tx.get(refJugador)).exists()) {
            throw new AvisoTorneo(
              `${nombreDe(actual.jugadorUid) ?? 'El jugador'} tiene que abrir la app una vez (con la versión nueva) antes de recibir crédito. Podés entregar solo el producto dejando el crédito en $0.`
            );
          }
          if (refProducto) {
            tx.update(refProducto, { stock: increment(-actual.cantidadProducto) });
            descontoStock = true;
          }
          // ultimoPremio ata la acreditación a este premio: las reglas no aceptan crédito sin un premio que se entrega.
          if (credito > 0) tx.update(refJugador, { creditoCafeteria: increment(credito), ultimoPremio: { torneoId: t.id, puesto: actual.puesto } });
        }
      );
      const sinStock = p.productoId && p.cantidadProducto > 0 && !descontoStock ? ' (el producto no controla stock: no se descontó nada)' : '';
      mostrar(`Premio del ${p.puesto}º entregado${sinStock}`, 'ok');
    } catch (e) {
      if (esAvisoTorneo(e)) mostrar(e.message, 'info');
      else mostrar(mensajeTransaccion(e, 'No se pudo registrar la entrega.'), 'error');
    } finally {
      setEntregando(null);
    }
  };

  const confirmarEntrega = (p: PuestoPremio) => {
    const nombre = nombreDe(p.jugadorUid);
    if (!nombre || entregando !== null) return;
    const credito = creditoPremio ? creditoDe(p) : 0;
    const item = productoDe(p);
    const partes: string[] = [];
    if (p.cantidadProducto > 0) partes.push(`${p.cantidadProducto} × ${nombreProducto(p)}`);
    if (credito > 0) partes.push(`${formatARS(credito)} de crédito de cafetería`);
    const detalle = `${nombre} recibe ${partes.join(' y ')}.`;
    const efectos = [
      p.cantidadProducto > 0 ? (!p.productoId || (item && item.stock === null) ? 'no mueve stock' : 'se descuenta del stock') : null,
      credito > 0 ? 'el crédito queda en su cuenta' : null,
    ].filter((x): x is string => x !== null);
    Alert.alert(`Entregar el ${p.puesto}º puesto`, `${detalle}${efectos.length > 0 ? ` Al confirmar, ${efectos.join(' y ')}.` : ''}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Entregar', onPress: () => void entregar(p, credito) },
    ]);
  };

  const marcarPagada = (uid: string, nombre: string) => {
    Alert.alert('Inscripción cobrada', `¿${nombre} pagó la inscripción de ${formatARS(torneo.inscripcion)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, pagó',
        onPress: () => {
          setCobrando(uid);
          actualizarTorneo(torneo.id, (t) => {
            const j = t.jugadores.find((x) => x.uid === uid);
            if (!j) throw new AvisoTorneo(`${nombre} ya no está inscripto.`);
            if (j.pagado) return null;
            return { jugadores: t.jugadores.map((x) => (x.uid === uid ? { ...x, pagado: true } : x)) };
          })
            .then(() => mostrar(`Inscripción de ${nombre} cobrada`, 'ok'))
            .catch((e: unknown) =>
              esAvisoTorneo(e) ? mostrar(e.message, 'info') : mostrar(mensajeTransaccion(e, 'No se pudo marcar la inscripción.'), 'error')
            )
            .finally(() => setCobrando(null));
        },
      },
    ]);
  };

  const resumenProductos = useMemo(() => {
    const grupos = new Map<string, { item: CatalogoItem | null; nombre: string | null; comprometido: number; entregado: number }>();
    torneo.premios.forEach((p) => {
      if (!p.productoId || p.cantidadProducto <= 0) return;
      const clave = `${p.productoOrigen ?? 'tcg'}:${p.productoId}`;
      const g = grupos.get(clave) ?? { item: productoDe(p), nombre: p.productoNombre ?? null, comprometido: 0, entregado: 0 };
      g.comprometido += p.cantidadProducto;
      if (p.entregado) g.entregado += p.cantidadProducto;
      grupos.set(clave, g);
    });
    return [...grupos.entries()];
  }, [torneo.premios, productoDe]);

  const creditoEmitido = torneo.premios.filter((p) => p.entregado).reduce((acc, p) => acc + p.creditoCafeteria, 0);
  const creditoPorEntregar = creditoPremio ? torneo.premios.filter((p) => !p.entregado && p.jugadorUid).reduce((acc, p) => acc + creditoDe(p), 0) : 0;
  const impagos = torneo.jugadores.filter((j) => !j.pagado);
  const enCurso = torneo.estado === 'en_curso';
  // Cerrado el torneo, las reglas solo le dejan al juez tocar los premios; el admin puede corregir inscripciones.
  const puedeCobrarInscripcion = enCurso || esAdmin;
  const conPendientes = otros.filter((t) => t.id !== torneo.id && premiosPorEntregar(t, creditoPremio) > 0);

  return (
    <Screen back={enCurso ? `Ronda ${torneo.rondaActual}` : 'Torneo'} onBack={() => router.navigate('/torneo')} title="Premios">
      {otros.length > 1 ? (
        <View style={styles.selector}>
          {conPendientes.length > 0 ? (
            <Text style={[styles.aviso, { color: colors.gold }]}>
              {conPendientes.length === 1 ? 'Otro torneo tiene premios sin entregar.' : `${conPendientes.length} torneos anteriores tienen premios sin entregar.`}
            </Text>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {otros.map((t) => {
              const n = premiosPorEntregar(t, creditoPremio);
              return (
                <Chip
                  key={t.id}
                  label={n > 0 ? `${t.nombre} · ${n}` : t.nombre}
                  tone="gold"
                  active={t.id === torneo.id}
                  onPress={() => onElegir(t.id)}
                  accessibilityHint={n > 0 ? `${n} ${n === 1 ? 'premio' : 'premios'} sin entregar` : undefined}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <Text style={[styles.intro, { color: colors.dim }]}>
        {torneo.nombre}: {torneo.jugadores.length} inscripciones de {formatARS(torneo.inscripcion)}. Se reparte en productos
        {creditoPremio ? ' y en crédito de cafetería' : ''}: al entregar, el producto se descuenta del stock
        {creditoPremio ? ' y el crédito queda en la cuenta del jugador' : ''}.
      </Text>

      {catalogo.error ? (
        <ErrorBanner mensaje={mensajeError(catalogo.error, 'No se pudo leer el stock de los productos del premio.')} onRetry={catalogo.reintentar} />
      ) : null}

      {torneo.premios.length === 0 ? (
        <EmptyState title="Este torneo no tiene premios cargados" body="El reparto se define en el paso 4 de Nuevo torneo." />
      ) : (
        <View>
          {torneo.premios.map((p) => {
            const nombre = nombreDe(p.jugadorUid);
            const credito = creditoPremio || p.entregado ? creditoDe(p) : 0;
            const tieneProducto = p.cantidadProducto > 0;
            const detalleProducto = tieneProducto ? `${p.cantidadProducto} × ${nombreProducto(p)}` : 'Sin producto';
            const detalleCredito = credito > 0 ? `Crédito ${formatARS(credito)}` : 'Sin crédito';
            const porEntregar = premioPorEntregar({ ...p, creditoCafeteria: credito }, creditoPremio);
            const badge = p.entregado
              ? { label: 'Entregado', tone: 'ok' as const }
              : !p.jugadorUid
                ? { label: enCurso ? 'En juego' : 'Sin ganador', tone: 'dim' as const }
                : porEntregar
                  ? { label: 'Pendiente', tone: 'gold' as const }
                  : { label: 'Sin premio', tone: 'dim' as const };
            return (
              <View key={p.puesto} style={[styles.puesto, { borderBottomColor: colors.line }]}>
                <View style={styles.fila}>
                  <Text style={[styles.numero, { color: colors.gold }, tabularNums(20)]}>{p.puesto}º</Text>
                  <View style={styles.flex1}>
                    <Text style={[styles.ganador, { color: nombre ? colors.ink : colors.dim }]}>
                      {nombre ?? (enCurso ? 'Se define al cerrar el torneo' : 'Sin ganador para este puesto')}
                    </Text>
                    <Text style={[styles.detalle, { color: colors.dim }, tabularNums(11)]}>
                      {detalleProducto} · {detalleCredito}
                    </Text>
                  </View>
                  <Badge label={badge.label} tone={badge.tone} />
                </View>
                {!p.entregado ? (
                  <View style={styles.acciones}>
                    {creditoPremio ? (
                      <Stepper
                        value={credito}
                        min={0}
                        max={MAX_CREDITO_PUESTO}
                        formatValue={formatARS}
                        onIncrement={() => fijarCredito(p, creditoDe(p) + PASO_CREDITO)}
                        onDecrement={() => fijarCredito(p, creditoDe(p) - PASO_CREDITO)}
                        onChangeValue={(v) => fijarCredito(p, v)}
                        accessibilityLabel={`crédito del puesto ${p.puesto}`}
                      />
                    ) : (
                      <View />
                    )}
                    <SmallButton
                      label={entregando === p.puesto ? 'Entregando…' : 'Entregar'}
                      tone="gold"
                      disabled={!nombre || !porEntregar || entregando !== null}
                      onPress={() => confirmarEntrega(p)}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <Card style={styles.resumen}>
        <SectionLabel>Inscripciones</SectionLabel>
        <View style={styles.resumenFila}>
          <Text style={[styles.resumenTexto, { color: colors.ink }]}>Cobrado</Text>
          <Text style={[styles.resumenValor, { color: colors.ink }, tabularNums(12.5)]}>{formatARS(pozoCobrado(torneo))}</Text>
        </View>
        <Text style={[styles.detalle, { color: colors.dim }, tabularNums(11)]}>
          {torneo.jugadores.length - impagos.length} de {torneo.jugadores.length} pagas · pozo previsto {formatARS(pozoDe(torneo))}
        </Text>
        {impagos.length > 0 ? (
          <View style={styles.impagos}>
            <Text style={[styles.detalle, { color: colors.dg }, tabularNums(11)]}>
              Falta cobrar {formatARS(impagos.length * torneo.inscripcion)}
              {puedeCobrarInscripcion ? '' : ' · con el torneo cerrado, solo el admin puede marcarlas'}
            </Text>
            {impagos.map((j) => (
              <View key={j.uid} style={styles.impagoFila}>
                <Text style={[styles.resumenTexto, styles.flex1, { color: colors.ink }]} numberOfLines={1}>
                  {j.nombre}
                </Text>
                {puedeCobrarInscripcion ? (
                  <SmallButton label={cobrando === j.uid ? 'Guardando…' : 'Pagó'} disabled={cobrando !== null} onPress={() => marcarPagada(j.uid, j.nombre)} />
                ) : (
                  <Badge label="Impaga" tone="dg" />
                )}
              </View>
            ))}
          </View>
        ) : null}

        {resumenProductos.length > 0 ? <View style={[styles.divisor, { backgroundColor: colors.line }]} /> : null}
        {resumenProductos.map(([clave, g]) => {
          const quedan = g.item?.stock ?? null;
          const porEntregar = g.comprometido - g.entregado;
          return (
            <View key={clave} style={styles.resumenBloque}>
              <View style={styles.resumenFila}>
                <Text style={[styles.resumenTexto, styles.flex1, { color: colors.ink }]} numberOfLines={1}>
                  {g.item?.nombre ?? g.nombre ?? (catalogo.loading ? '…' : 'Producto borrado')}
                </Text>
                <Text style={[styles.resumenValor, { color: colors.ink }, tabularNums(12.5)]}>
                  {g.entregado} de {g.comprometido} entregados
                </Text>
              </View>
              {quedan !== null ? (
                <Text style={[styles.detalle, { color: quedan < porEntregar || quedan < 0 ? colors.dg : colors.dim }, tabularNums(11)]}>
                  Quedan {quedan} en stock{porEntregar > 0 ? ` · faltan entregar ${porEntregar}` : ''}
                </Text>
              ) : null}
            </View>
          );
        })}
        <View style={[styles.divisor, { backgroundColor: colors.line }]} />
        <View style={styles.resumenFila}>
          <Text style={[styles.resumenTexto, { color: colors.gold }]}>Crédito emitido</Text>
          <Text style={[styles.resumenValor, { color: colors.gold }, tabularNums(12.5)]}>{formatARS(creditoEmitido)}</Text>
        </View>
        {creditoPorEntregar > 0 ? (
          <Text style={[styles.detalle, { color: colors.dim }, tabularNums(11)]}>{formatARS(creditoPorEntregar)} más por entregar</Text>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  selector: { marginBottom: 14, gap: 8 },
  chips: { gap: 7 },
  aviso: { fontFamily: Typography.fontFamily.semibold, fontSize: 12, lineHeight: 17 },
  intro: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, lineHeight: 20, marginBottom: 10 },
  puesto: { paddingVertical: 13, borderBottomWidth: 1, gap: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  numero: { fontFamily: Typography.fontFamily.bold, fontSize: 20, minWidth: 32 },
  ganador: { fontFamily: Typography.fontFamily.medium, fontSize: 13.5 },
  detalle: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 2, lineHeight: 16 },
  acciones: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 46 },
  resumen: { marginTop: 20, gap: 6 },
  resumenBloque: { marginTop: 6 },
  resumenFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  resumenTexto: { fontFamily: Typography.fontFamily.medium, fontSize: 12.5 },
  resumenValor: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
  impagos: { gap: 6, marginTop: 4 },
  impagoFila: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  divisor: { height: 1, marginVertical: 8 },
});
