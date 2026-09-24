import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useTheme } from '../../contexts/ThemeContext';
import { useConfig } from '../../contexts/ConfigContext';
import { useToast } from '../../contexts/ToastContext';
import { Typography, tabularNums } from '../../constants/theme';
import { AvisoTorneo, actualizarTorneo, esAvisoTorneo, mensajeTransaccion, useUltimoTorneo } from '../../hooks/useUltimoTorneo';
import { useCatalogo } from '../../hooks/useCatalogo';
import { pozoDe, type PuestoPremio, type Torneo } from '../../lib/torneo';
import { coleccionDe, formatARS, type CatalogoItem } from '../../lib/pedido';
import { mensajeError } from '../../lib/errores';
import Screen, { LoadingScreen } from '../../components/Screen';
import Button from '../../components/Button';
import Stepper from '../../components/Stepper';
import { Badge, Card, EmptyState, ErrorBanner, SectionLabel, SmallButton } from '../../components/ui';

const PASO_CREDITO = 500;
// Tope de cordura por puesto (las reglas de Firestore frenan subidas de crédito mayores).
const MAX_CREDITO_PUESTO = 1_000_000;
const ESPERA_GUARDADO_MS = 700;

export default function PremiosScreen() {
  const router = useRouter();
  const { torneo, loading, error, reintentar } = useUltimoTorneo();

  if (loading) return <LoadingScreen />;
  if (error) {
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
  return <PremiosTorneo torneo={torneo} />;
}

function PremiosTorneo({ torneo }: { readonly torneo: Torneo }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { config } = useConfig();
  const { mostrar } = useToast();
  const catalogo = useCatalogo();
  const creditoPremio = config.creditoPremio;

  const [borradores, setBorradores] = useState<Record<number, number>>({});
  const [entregando, setEntregando] = useState<number | null>(null);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pendientesGuardar = useRef<Record<number, number>>({});

  const productoDe = useCallback(
    (p: PuestoPremio): CatalogoItem | null =>
      p.productoId ? catalogo.items.find((i) => i.id === p.productoId && i.origen === (p.productoOrigen ?? 'tcg')) ?? null : null,
    [catalogo.items]
  );

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

  const cambiarCredito = (p: PuestoPremio, delta: number) => {
    const nuevo = Math.min(MAX_CREDITO_PUESTO, Math.max(0, creditoDe(p) + delta));
    setBorradores((prev) => ({ ...prev, [p.puesto]: nuevo }));
    clearTimeout(timers.current[p.puesto]);
    pendientesGuardar.current[p.puesto] = nuevo;
    timers.current[p.puesto] = setTimeout(() => guardarCredito(p.puesto, nuevo), ESPERA_GUARDADO_MS);
  };

  const entregar = async (p: PuestoPremio, credito: number) => {
    clearTimeout(timers.current[p.puesto]);
    delete pendientesGuardar.current[p.puesto];
    const item = productoDe(p);
    // Si el producto se borró del catálogo (o no controla stock) se entrega igual, sin mover stock.
    const mueveStock = !!item && item.stock !== null && p.cantidadProducto > 0;
    setEntregando(p.puesto);
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
        (tx, t) => {
          const actual = t.premios.find((x) => x.puesto === p.puesto);
          if (!actual?.jugadorUid) return;
          if (mueveStock && actual.productoId && actual.cantidadProducto > 0) {
            tx.update(doc(db, coleccionDe(actual.productoOrigen ?? 'tcg'), actual.productoId), { stock: increment(-actual.cantidadProducto) });
          }
          if (credito > 0) tx.update(doc(db, 'users', actual.jugadorUid), { creditoCafeteria: increment(credito) });
        }
      );
      mostrar(`Premio del ${p.puesto}º entregado`, 'ok');
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
    if (p.productoId && p.cantidadProducto > 0) partes.push(`${p.cantidadProducto} × ${item?.nombre ?? 'producto'}`);
    if (credito > 0) partes.push(`${formatARS(credito)} de crédito de cafetería`);
    const detalle = partes.length > 0 ? `${nombre} recibe ${partes.join(' y ')}.` : `Este puesto no tiene producto ni crédito: solo se marca como entregado.`;
    const efectos = [
      p.productoId && p.cantidadProducto > 0 ? (item && item.stock !== null ? 'se descuenta del stock' : 'el producto ya no está en el stock, no se descuenta nada') : null,
      credito > 0 ? 'el crédito queda en su cuenta' : null,
    ].filter((x): x is string => x !== null);
    Alert.alert(`Entregar el ${p.puesto}º puesto`, `${detalle}${efectos.length > 0 ? ` Al confirmar, ${efectos.join(' y ')}.` : ''}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Entregar', onPress: () => void entregar(p, credito) },
    ]);
  };

  const resumenProductos = useMemo(() => {
    const grupos = new Map<string, { item: CatalogoItem | null; comprometido: number; entregado: number }>();
    torneo.premios.forEach((p) => {
      if (!p.productoId || p.cantidadProducto <= 0) return;
      const clave = `${p.productoOrigen ?? 'tcg'}:${p.productoId}`;
      const g = grupos.get(clave) ?? { item: productoDe(p), comprometido: 0, entregado: 0 };
      g.comprometido += p.cantidadProducto;
      if (p.entregado) g.entregado += p.cantidadProducto;
      grupos.set(clave, g);
    });
    return [...grupos.entries()];
  }, [torneo.premios, productoDe]);

  const creditoEmitido = torneo.premios.filter((p) => p.entregado).reduce((acc, p) => acc + p.creditoCafeteria, 0);
  const creditoPorEntregar = creditoPremio ? torneo.premios.filter((p) => !p.entregado).reduce((acc, p) => acc + creditoDe(p), 0) : 0;
  const pagas = torneo.jugadores.filter((j) => j.pagado).length;
  const enCurso = torneo.estado === 'en_curso';

  return (
    <Screen back={enCurso ? `Ronda ${torneo.rondaActual}` : 'Torneo'} onBack={() => router.navigate('/torneo')} title="Premios">
      <Text style={[styles.intro, { color: colors.dim }]}>
        Pozo de {torneo.jugadores.length} inscripciones de {formatARS(torneo.inscripcion)} ({torneo.nombre}). Se reparte en productos
        {creditoPremio ? ' y en crédito de cafetería' : ''}: al entregar, el producto se descuenta del stock ya cargado
        {creditoPremio ? ' y el crédito queda en la cuenta del jugador' : ''}.
      </Text>

      {catalogo.error ? <ErrorBanner mensaje={mensajeError(catalogo.error, 'No se pudo leer el stock de los productos del premio.')} /> : null}

      {torneo.premios.length === 0 ? (
        <EmptyState title="Este torneo no tiene premios cargados" body="El reparto se define en el paso 4 de Nuevo torneo." />
      ) : (
        <View>
          {torneo.premios.map((p) => {
            const nombre = nombreDe(p.jugadorUid);
            const item = productoDe(p);
            const credito = creditoPremio || p.entregado ? creditoDe(p) : 0;
            const detalleProducto =
              p.productoId && p.cantidadProducto > 0
                ? `${p.cantidadProducto} × ${item?.nombre ?? (catalogo.loading ? '…' : 'producto borrado')}`
                : 'Sin producto';
            const detalleCredito = credito > 0 ? `Crédito ${formatARS(credito)}` : 'Sin crédito';
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
                  <Badge label={p.entregado ? 'Entregado' : 'Pendiente'} tone={p.entregado ? 'ok' : 'gold'} />
                </View>
                {!p.entregado ? (
                  <View style={styles.acciones}>
                    {creditoPremio ? (
                      <Stepper
                        value={credito}
                        min={0}
                        max={MAX_CREDITO_PUESTO}
                        formatValue={formatARS}
                        onIncrement={() => cambiarCredito(p, PASO_CREDITO)}
                        onDecrement={() => cambiarCredito(p, -PASO_CREDITO)}
                        accessibilityLabel={`crédito del puesto ${p.puesto}`}
                      />
                    ) : (
                      <View />
                    )}
                    <SmallButton
                      label={entregando === p.puesto ? 'Entregando…' : 'Entregar'}
                      tone="gold"
                      disabled={!nombre || entregando !== null}
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
        <SectionLabel>Resumen</SectionLabel>
        <View style={styles.resumenFila}>
          <Text style={[styles.resumenTexto, { color: colors.ink }]}>Pozo recaudado</Text>
          <Text style={[styles.resumenValor, { color: colors.ink }, tabularNums(12.5)]}>{formatARS(pozoDe(torneo))}</Text>
        </View>
        <Text style={[styles.detalle, { color: colors.dim }]}>
          {torneo.jugadores.length} inscripciones · {pagas} marcadas como pagas al anotar
        </Text>
        {resumenProductos.map(([clave, g]) => {
          const quedan = g.item?.stock ?? null;
          const porEntregar = g.comprometido - g.entregado;
          return (
            <View key={clave} style={styles.resumenBloque}>
              <View style={styles.resumenFila}>
                <Text style={[styles.resumenTexto, styles.flex1, { color: colors.ink }]} numberOfLines={1}>
                  {g.item?.nombre ?? (catalogo.loading ? '…' : 'Producto borrado')}
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
  divisor: { height: 1, marginVertical: 8 },
});
