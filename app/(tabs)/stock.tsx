import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConfig } from '../../contexts/ConfigContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { useUserProfileContext } from '../../contexts/UserProfileContext';
import { Typography, tabularNums } from '../../constants/theme';
import { useCatalogo } from '../../hooks/useCatalogo';
import Screen, { LoadingScreen } from '../../components/Screen';
import SoloParaRoles from '../../components/SoloParaRoles';
import { Badge, EmptyState, ErrorBanner, SectionLabel, SmallButton, ToggleRow } from '../../components/ui';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import FormField from '../../components/FormField';
import { mensajeError } from '../../lib/errores';
import { AVISO_SIN_SENAL, ESPERA_ESCRITURA_MS } from '../../lib/escritura';
import { fechaDeNegocio } from '../../lib/fecha';
import { tocar } from '../../lib/haptics';
import { CatalogoItem, Rubro, UNIDADES, Unidad, formatARS, formatCantidad, stockBajo } from '../../lib/pedido';
import { RUBRO_SERVICIOS, RUBRO_TCG, nombreRubro, veRubroEnStock } from '../../lib/rubros';
import type { Role } from '../../constants/roles';
import { coincideBusqueda, esperarConfirmacion } from '../../lib/salon';
import {
  FormIngreso,
  LIMITES_STOCK,
  actualizarProducto,
  admiteDecimales,
  crearServicio,
  eliminarProducto,
  registrarIngreso,
  validarIngreso,
  validarProducto,
} from '../../lib/stock';
import { preguntar } from '../../lib/dialogo';

/** 'Todo', 'Servicios' o el nombre de un rubro. */
type Filtro = string;

const MAX_RESULTADOS = 6;

interface VistaRol {
  titulo: string;
  sub: string;
  filtros: readonly Filtro[];
}

// Los filtros salen de los rubros del local (Ajustes > Stock).
function vistaDe(role: Role | undefined, cafeteria: readonly string[]): VistaRol {
  if (role === 'juez') return { titulo: 'Stock TCG', sub: 'Sellado y accesorios del torneo', filtros: [RUBRO_TCG] };
  if (role === 'mozo') return { titulo: 'Stock cafetería', sub: 'Solo consulta: el ingreso lo carga el admin', filtros: ['Todo', ...cafeteria] };
  return { titulo: 'Depósito', sub: 'Todo lo que entra y sale del local', filtros: ['Todo', ...cafeteria, RUBRO_TCG, 'Servicios'] };
}

function pasaFiltro(item: CatalogoItem, filtro: Filtro): boolean {
  if (filtro === 'Servicios') return item.rubro === 'Mesa';
  if (filtro === 'Todo') return item.rubro !== 'Mesa';
  return item.rubro === filtro;
}


function partesCantidad(stock: number, unidad: Unidad): { numero: string; unidad: string } {
  const texto = formatCantidad(stock, unidad);
  const corte = texto.lastIndexOf(' ');
  return { numero: texto.slice(0, corte), unidad: texto.slice(corte + 1) };
}

// La barra llena equivale a 4 veces el umbral: por debajo de 1/4 ya es stock bajo.
function nivel(stock: number, alerta: number): number {
  if (stock <= 0) return 0;
  if (alerta <= 0) return 1;
  return Math.max(0.03, Math.min(1, stock / (alerta * 4)));
}

interface FilaStockProps {
  readonly item: CatalogoItem;
  readonly alertaLocal: number;
  readonly editable: boolean;
  readonly onPress: (item: CatalogoItem) => void;
}

function FilaStock({ item, alertaLocal, editable, onPress }: FilaStockProps) {
  const { colors } = useTheme();
  const alerta = item.alerta ?? alertaLocal;
  const bajo = item.activo && stockBajo(item, alertaLocal);
  const color = item.stock === null ? colors.dim : bajo ? colors.dg : item.stock <= alerta * 2 ? colors.br : colors.ok;
  const cantidad = item.stock === null ? null : partesCantidad(item.stock, item.unidad);
  const etiquetaStock = item.stock === null ? (item.rubro === 'Mesa' ? 'servicio' : 'sin control de stock') : formatCantidad(item.stock, item.unidad);

  return (
    <Pressable
      onPress={() => {
        tocar();
        onPress(item);
      }}
      disabled={!editable}
      style={({ pressed }) => [styles.fila, { borderBottomColor: colors.line, opacity: !item.activo ? 0.55 : pressed ? 0.7 : 1 }]}
      accessibilityRole={editable ? 'button' : 'text'}
      accessibilityLabel={`${item.nombre}, ${etiquetaStock}${bajo ? ', stock bajo' : ''}${item.activo ? '' : ', pausado'}, ${formatARS(item.precio)}`}
      accessibilityHint={editable ? 'Abre la ficha del producto.' : undefined}
    >
      <View style={styles.filaTop}>
        <Text style={[styles.filaNombre, { color: colors.ink }]} numberOfLines={2}>
          {item.nombre}
        </Text>
        {!item.activo ? <Badge label="Pausado" /> : null}
        {cantidad ? (
          <>
            <Text style={[styles.filaCantidad, { color }, tabularNums(15)]}>{cantidad.numero}</Text>
            <Text style={[styles.filaUnidad, { color: colors.dim }]}>{cantidad.unidad}</Text>
          </>
        ) : (
          <Text style={[styles.filaSinControl, { color: colors.dim }]}>{item.rubro === RUBRO_SERVICIOS ? 'Servicio' : 'Sin control'}</Text>
        )}
      </View>
      {item.stock !== null ? (
        <View style={[styles.barra, { backgroundColor: colors.line }]}>
          <View style={[styles.barraRelleno, { width: `${nivel(item.stock, alerta) * 100}%`, backgroundColor: color }]} />
        </View>
      ) : null}
      <View style={styles.filaMeta}>
        <Text style={[styles.meta, { color: colors.dim }, tabularNums(11)]}>
          {nombreRubro(item.rubro)} · {formatARS(item.precio)}
        </Text>
        {item.stock !== null ? (
          <Text style={[styles.meta, { color: bajo ? colors.dg : colors.dim }, tabularNums(11)]}>
            {bajo ? 'Stock bajo' : `Alerta en ${formatCantidad(alerta, item.unidad).replace(/ u$/, '')}${item.alerta === null ? ' (local)' : ''}`}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

interface PanelIngresoProps {
  readonly catalogo: readonly CatalogoItem[];
  readonly uid: string | null;
}

const FORM_INGRESO_VACIO: FormIngreso = {
  modo: 'existente',
  producto: null,
  nombre: '',
  rubro: 'Café',
  unidad: 'u',
  precio: '',
  cantidad: '',
  costo: '',
};

function PanelIngreso({ catalogo, uid }: PanelIngresoProps) {
  const { colors } = useTheme();
  const { config } = useConfig();
  const toast = useToast();
  // El rubro inicial es el primero del local (si quitó "Café" de Ajustes, no se propone).
  const [form, setForm] = useState<FormIngreso>(() => ({ ...FORM_INGRESO_VACIO, rubro: config.rubrosCafeteria[0] ?? FORM_INGRESO_VACIO.rubro }));
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (parcial: Partial<FormIngreso>) => {
    setForm((f) => ({ ...f, ...parcial }));
    setError(null);
  };

  const conStock = useMemo(() => catalogo.filter((c) => c.stock !== null), [catalogo]);
  const resultados = useMemo(
    () => (busqueda.trim() ? conStock.filter((c) => coincideBusqueda(c.nombre, busqueda)).slice(0, MAX_RESULTADOS) : []),
    [conStock, busqueda]
  );
  const productoVivo = form.producto ? catalogo.find((c) => c.id === form.producto?.id && c.origen === form.producto?.origen) ?? null : null;
  const unidad = form.modo === 'existente' ? productoVivo?.unidad ?? 'u' : form.unidad;

  const guardar = async () => {
    if (enviando) return;
    if (!uid) {
      setError('Tu sesión venció. Volvé a iniciar sesión.');
      return;
    }
    const validado = validarIngreso({ ...form, producto: productoVivo }, catalogo);
    if (!validado.ok) {
      setError(validado.error);
      return;
    }
    setEnviando(true);
    const v = validado.valor;
    const nombre = v.tipo === 'existente' ? v.producto.nombre : v.nombre;
    const unidadFinal = v.tipo === 'existente' ? v.producto.unidad : v.unidad;
    try {
      const resultado = await esperarConfirmacion(registrarIngreso(v, uid, fechaDeNegocio(config.turnos)), ESPERA_ESCRITURA_MS, (e) =>
        toast.mostrar(`El ingreso de ${nombre} no se guardó: ${mensajeError(e)}`, 'error')
      );
      const texto = `Ingresaron ${formatCantidad(v.cantidad, unidadFinal)} de ${nombre}`;
      toast.mostrar(resultado === 'pendiente' ? `${texto}. ${AVISO_SIN_SENAL}` : texto, resultado === 'pendiente' ? 'info' : 'ok');
      setForm({ ...FORM_INGRESO_VACIO, modo: form.modo, rubro: form.rubro });
      setBusqueda('');
    } catch (e) {
      setError(mensajeError(e, 'No se pudo registrar el ingreso.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={[styles.panel, { borderColor: colors.br, backgroundColor: colors.brs }]}>
      <Text style={[styles.panelEtiqueta, { color: colors.br }]}>INGRESO DE MERCADERÍA · SOLO ADMIN</Text>

      <View style={styles.chipsFila} accessibilityRole="radiogroup">
        <Chip label="Producto existente" active={form.modo === 'existente'} onPress={() => cambiar({ modo: 'existente' })} />
        <Chip label="Producto nuevo" active={form.modo === 'nuevo'} onPress={() => cambiar({ modo: 'nuevo' })} />
      </View>

      {form.modo === 'existente' ? (
        <View style={styles.bloque}>
          {productoVivo ? (
            <Pressable
              onPress={() => cambiar({ producto: null })}
              style={[styles.elegido, { borderColor: colors.br, backgroundColor: colors.sf }]}
              accessibilityRole="button"
              accessibilityLabel={`${productoVivo.nombre} elegido. Tocá para cambiar de producto.`}
            >
              <View style={styles.flex1}>
                <Text style={[styles.elegidoNombre, { color: colors.ink }]}>{productoVivo.nombre}</Text>
                <Text style={[styles.meta, { color: colors.dim }, tabularNums(11)]}>
                  {productoVivo.rubro} · hay {formatCantidad(productoVivo.stock ?? 0, productoVivo.unidad)}
                </Text>
              </View>
              <Text style={[styles.cambiar, { color: colors.br }]}>Cambiar</Text>
            </Pressable>
          ) : (
            <>
              <FormField
                label="Buscar producto"
                placeholder="Nombre del producto"
                value={busqueda}
                onChangeText={setBusqueda}
                autoCorrect={false}
                maxLength={LIMITES_STOCK.nombre}
                returnKeyType="search"
              />
              {busqueda.trim() && resultados.length === 0 ? (
                <Text style={[styles.nota, { color: colors.dim }]}>No hay productos con stock con ese nombre. Cargalo como producto nuevo.</Text>
              ) : null}
              {resultados.map((p) => (
                <Pressable
                  key={`${p.origen}:${p.id}`}
                  onPress={() => {
                    tocar();
                    cambiar({ producto: p });
                  }}
                  style={[styles.resultado, { borderColor: colors.line, backgroundColor: colors.sf }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Elegir ${p.nombre}`}
                >
                  <Text style={[styles.resultadoNombre, { color: colors.ink }]} numberOfLines={1}>
                    {p.nombre}
                  </Text>
                  <Text style={[styles.meta, { color: colors.dim }, tabularNums(11)]}>{formatCantidad(p.stock ?? 0, p.unidad)}</Text>
                </Pressable>
              ))}
            </>
          )}
        </View>
      ) : (
        <View style={styles.bloque}>
          <FormField
            label="Nombre"
            placeholder="Medialunas, Sobres Surging Sparks…"
            value={form.nombre}
            onChangeText={(t) => cambiar({ nombre: t })}
            maxLength={LIMITES_STOCK.nombre}
            autoCapitalize="sentences"
          />
          <Text style={[styles.miniEtiqueta, { color: colors.dim }]}>RUBRO</Text>
          <View style={styles.chipsFila} accessibilityRole="radiogroup">
            {[...config.rubrosCafeteria, RUBRO_TCG].map((r) => (
              <Chip key={r} label={r} active={form.rubro === r} onPress={() => cambiar({ rubro: r })} />
            ))}
          </View>
          <Text style={[styles.miniEtiqueta, { color: colors.dim }]}>UNIDAD</Text>
          <View style={styles.chipsFila} accessibilityRole="radiogroup">
            {UNIDADES.map((u) => (
              <Chip key={u} label={u} active={form.unidad === u} onPress={() => cambiar({ unidad: u, cantidad: '' })} />
            ))}
          </View>
          <FormField
            label="Precio de venta ($)"
            placeholder="0"
            value={form.precio}
            onChangeText={(t) => cambiar({ precio: t })}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>
      )}

      <View style={styles.dobleCampo}>
        <View style={styles.flex1}>
          <FormField
            label={`Cantidad (${unidad})`}
            placeholder="0"
            value={form.cantidad}
            onChangeText={(t) => cambiar({ cantidad: t })}
            keyboardType={admiteDecimales(unidad) ? 'decimal-pad' : 'number-pad'}
            maxLength={9}
          />
        </View>
        <View style={styles.flex1}>
          <FormField
            label="Costo unitario ($)"
            placeholder="0"
            value={form.costo}
            onChangeText={(t) => cambiar({ costo: t })}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.dg }]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button label="Guardar ingreso" onPress={() => void guardar()} loading={enviando} />
    </View>
  );
}

type ModalProducto = { tipo: 'editar'; item: CatalogoItem } | { tipo: 'nuevoServicio' } | null;

interface ProductoModalProps {
  readonly modo: ModalProducto;
  readonly catalogo: readonly CatalogoItem[];
  readonly alertaLocal: number;
  readonly onCerrar: () => void;
}

function ProductoModal({ modo, catalogo, alertaLocal, onCerrar }: ProductoModalProps) {
  const { colors } = useTheme();
  const { config } = useConfig();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const item = modo?.tipo === 'editar' ? modo.item : null;
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [alerta, setAlerta] = useState('');
  const [activo, setActivo] = useState(true);
  const [controlStock, setControlStock] = useState(false);
  const [rubroElegido, setRubroElegido] = useState<Rubro>('Mesa');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inicial = useRef(item);
  useLayoutEffect(() => {
    inicial.current = item;
  });
  const clave = modo ? (modo.tipo === 'editar' ? `${modo.item.origen}:${modo.item.id}` : 'nuevo') : null;

  // Se reinicia solo al abrir otro producto: los snapshots del catálogo no deben borrar lo que el admin está escribiendo.
  useEffect(() => {
    if (!clave) return;
    const i = inicial.current;
    setNombre(i?.nombre ?? '');
    setPrecio(i ? String(Math.round(i.precio)) : '');
    setAlerta(i?.alerta !== null && i?.alerta !== undefined ? String(i.alerta).replace('.', ',') : '');
    setActivo(i?.activo ?? true);
    setControlStock(i ? i.stock !== null : false);
    setRubroElegido(i?.rubro ?? 'Mesa');
    setError(null);
  }, [clave]);

  if (!modo) return null;

  const esTcg = item?.origen === 'tcg';
  const rubro: Rubro = item && !esTcg ? rubroElegido : item?.rubro ?? RUBRO_SERVICIOS;
  // Los de cafetería del local, el que ya tenía (aunque se haya quitado de Ajustes) y servicios.
  const opcionesRubro = [...new Set([...config.rubrosCafeteria, ...(item && !esTcg ? [item.rubro] : []), RUBRO_SERVICIOS])];
  const unidad: Unidad = item?.unidad ?? 'u';
  const muestraAlerta = esTcg || controlStock;

  const guardar = async () => {
    if (enviando) return;
    const validado = validarProducto(
      { nombre, precio, alerta: muestraAlerta ? alerta : '', activo, controlStock: esTcg ? true : controlStock },
      { catalogo, rubro, unidad, idActual: item?.id ?? null }
    );
    if (!validado.ok) {
      setError(validado.error);
      return;
    }
    setEnviando(true);
    try {
      const escritura = item ? actualizarProducto(item, validado.valor) : crearServicio(validado.valor);
      const resultado = await esperarConfirmacion(escritura, ESPERA_ESCRITURA_MS, (e) =>
        toast.mostrar(`${validado.valor.nombre} no se guardó: ${mensajeError(e)}`, 'error')
      );
      const texto = item ? `${validado.valor.nombre} actualizado` : `Servicio ${validado.valor.nombre} creado`;
      toast.mostrar(resultado === 'pendiente' ? `${texto}. ${AVISO_SIN_SENAL}` : texto, resultado === 'pendiente' ? 'info' : 'ok');
      onCerrar();
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar el producto.'));
    } finally {
      setEnviando(false);
    }
  };

  const eliminar = () => {
    if (!item) return;
    preguntar(`¿Eliminar ${item.nombre}?`, 'Deja de aparecer en el pedido y en el depósito. Las ventas ya cobradas no cambian. No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          setEnviando(true);
          esperarConfirmacion(eliminarProducto(item), ESPERA_ESCRITURA_MS, (e) => toast.mostrar(`${item.nombre} no se eliminó: ${mensajeError(e)}`, 'error'))
            .then(() => {
              toast.mostrar(`${item.nombre} eliminado`);
              onCerrar();
            })
            .catch((e: unknown) => setError(mensajeError(e, 'No se pudo eliminar el producto.')))
            .finally(() => setEnviando(false));
        },
      },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={enviando ? () => undefined : onCerrar} navigationBarTranslucent statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={enviando ? undefined : onCerrar} accessibilityRole="button" accessibilityLabel="Cerrar" />
        <KeyboardAvoidingView behavior="padding" style={styles.sheetWrap}>
          <View style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.line }]}>
            <ScrollView contentContainerStyle={[styles.sheetScroll, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled">
              <View style={styles.sheetHeader}>
                <Text style={[styles.sheetTitulo, { color: colors.ink }]} accessibilityRole="header" numberOfLines={2}>
                  {item ? item.nombre : 'Nuevo servicio'}
                </Text>
                <Pressable onPress={onCerrar} disabled={enviando} hitSlop={12} style={styles.cerrar} accessibilityRole="button" accessibilityLabel="Cancelar">
                  <Text style={[styles.cerrarTexto, { color: colors.dim }]}>Cancelar</Text>
                </Pressable>
              </View>
              {item ? (
                <Text style={[styles.nota, { color: colors.dim }]}>
                  {nombreRubro(item.rubro)}
                  {item.stock !== null ? ` · hay ${formatCantidad(item.stock, item.unidad)}` : ''}
                </Text>
              ) : (
                <Text style={[styles.nota, { color: colors.dim }]}>Alquiler de mesa, inscripción, agua: se cobran en el pedido sin descontar stock.</Text>
              )}

              <FormField
                label="Nombre"
                value={nombre}
                onChangeText={(t) => {
                  setNombre(t);
                  setError(null);
                }}
                maxLength={LIMITES_STOCK.nombre}
              />
              {item && !esTcg ? (
                <View style={styles.rubros} accessibilityRole="radiogroup" accessibilityLabel="Rubro">
                  {opcionesRubro.map((r) => (
                    <Chip key={r} label={nombreRubro(r)} accessibilityLabel={`Rubro ${nombreRubro(r)}`} active={rubro === r} onPress={() => setRubroElegido(r)} />
                  ))}
                </View>
              ) : null}
              <FormField
                label="Precio ($)"
                value={precio}
                onChangeText={(t) => {
                  setPrecio(t);
                  setError(null);
                }}
                keyboardType="number-pad"
                maxLength={10}
              />
              {item && !esTcg ? (
                <ToggleRow label="Controlar stock" sub="Descuenta al cobrar y avisa cuando queda poco" value={controlStock} onChange={setControlStock} disabled={enviando} />
              ) : null}
              {muestraAlerta ? (
                <FormField
                  label={`Alerta propia (${unidad})`}
                  placeholder={`Vacío = la del local (${formatCantidad(alertaLocal, unidad)})`}
                  value={alerta}
                  onChangeText={(t) => {
                    setAlerta(t);
                    setError(null);
                  }}
                  keyboardType={admiteDecimales(unidad) ? 'decimal-pad' : 'number-pad'}
                  maxLength={8}
                />
              ) : null}
              {item ? (
                <ToggleRow label="Activo" sub="Si lo pausás, no aparece en el pedido" value={activo} onChange={setActivo} disabled={enviando} />
              ) : null}

              {error ? (
                <Text style={[styles.error, { color: colors.dg }]} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              <Button label={item ? 'Guardar cambios' : 'Crear servicio'} onPress={() => void guardar()} loading={enviando} />
              {item ? <Button label="Eliminar producto" variant="danger" onPress={eliminar} disabled={enviando} /> : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function StockScreen() {
  return (
    <SoloParaRoles roles={['admin', 'mozo', 'juez']} titulo="Stock">
      <StockPantalla />
    </SoloParaRoles>
  );
}

function StockPantalla() {
  const { config } = useConfig();
  const { user, profile } = useUserProfileContext();
  const { items, loading, error, reintentar } = useCatalogo();
  const esAdmin = profile?.role === 'admin';
  const vista = useMemo(() => vistaDe(profile?.role, config.rubrosCafeteria), [profile?.role, config.rubrosCafeteria]);

  const [filtro, setFiltro] = useState<Filtro>(vista.filtros[0]);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [modal, setModal] = useState<ModalProducto>(null);

  const filtroActual: Filtro = vista.filtros.includes(filtro) ? filtro : vista.filtros[0];
  const role = profile?.role ?? 'jugador';
  const visibles = useMemo(() => items.filter((i) => veRubroEnStock(role, i.rubro)), [items, role]);
  const bajos = useMemo(() => visibles.filter((i) => i.activo && stockBajo(i, config.alertaStock)).length, [visibles, config.alertaStock]);
  const lista = useMemo(
    () => visibles.filter((i) => pasaFiltro(i, filtroActual)).sort((a, b) => Number(b.activo) - Number(a.activo)),
    [visibles, filtroActual]
  );
  const itemEnModal = modal?.tipo === 'editar' ? items.find((i) => i.id === modal.item.id && i.origen === modal.item.origen) : undefined;

  useEffect(() => {
    if (modal?.tipo === 'editar' && !loading && !itemEnModal) setModal(null);
  }, [modal, itemEnModal, loading]);

  if (loading && items.length === 0) return <LoadingScreen />;

  const subtitulo = bajos > 0 ? `${bajos} con stock bajo` : vista.sub;

  return (
    <Screen
      title={vista.titulo}
      subtitle={subtitulo}
      subtitleTone={bajos > 0 ? 'dg' : 'dim'}
      divider
      keyboard
      right={esAdmin ? <SmallButton label={panelAbierto ? 'Cerrar' : '+ Ingreso'} onPress={() => setPanelAbierto((p) => !p)} /> : undefined}
    >
      {error ? <ErrorBanner mensaje={mensajeError(error, 'No se pudo cargar el stock.')} onRetry={reintentar} /> : null}
      {esAdmin && panelAbierto ? <PanelIngreso catalogo={items} uid={user?.uid ?? null} /> : null}

      {vista.filtros.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
          {vista.filtros.map((f) => (
            <Chip key={f} label={f} active={filtroActual === f} onPress={() => setFiltro(f)} />
          ))}
        </ScrollView>
      ) : null}

      {esAdmin && filtroActual === 'Servicios' ? (
        <SectionLabel right={<SmallButton label="+ Servicio" onPress={() => setModal({ tipo: 'nuevoServicio' })} />}>Servicios de mesa</SectionLabel>
      ) : null}

      {lista.length === 0 ? (
        <EmptyState
          title={visibles.length === 0 ? 'Todavía no hay productos' : filtroActual === 'Servicios' ? 'Todavía no hay servicios' : `No hay productos en ${filtroActual}`}
          body={
            !esAdmin
              ? 'El admin los carga desde el depósito.'
              : filtroActual === 'Servicios'
                ? 'Agregá alquiler de mesa, inscripción o agua con "+ Servicio".'
                : 'Cargá el primer ingreso de mercadería con "+ Ingreso".'
          }
        />
      ) : (
        <View>
          {lista.map((i) => (
            <FilaStock key={`${i.origen}:${i.id}`} item={i} alertaLocal={config.alertaStock} editable={esAdmin} onPress={(it) => setModal({ tipo: 'editar', item: it })} />
          ))}
        </View>
      )}

      {esAdmin ? (
        <ProductoModal
          modo={modal?.tipo === 'editar' ? (itemEnModal ? { tipo: 'editar', item: itemEnModal } : null) : modal}
          catalogo={items}
          alertaLocal={config.alertaStock}
          onCerrar={() => setModal(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  chipsScroll: { flexGrow: 0, marginTop: 4, marginBottom: 8 },
  chips: { gap: 7 },
  fila: { paddingVertical: 13, borderBottomWidth: 1, minHeight: 44 },
  filaTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filaNombre: { flex: 1, fontFamily: Typography.fontFamily.medium, fontSize: 13.5 },
  filaCantidad: { fontFamily: Typography.fontFamily.bold, fontSize: 15 },
  filaUnidad: { fontFamily: Typography.fontFamily.regular, fontSize: 11, minWidth: 34, textAlign: 'right' },
  filaSinControl: { fontFamily: Typography.fontFamily.regular, fontSize: 11 },
  barra: { height: 4, borderRadius: 4, marginTop: 9, overflow: 'hidden' },
  barraRelleno: { height: 4, borderRadius: 4 },
  filaMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 10 },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: 11 },
  panel: { borderWidth: 1.5, borderRadius: 14, padding: 15, marginBottom: 14, gap: 12 },
  panelEtiqueta: { fontFamily: Typography.fontFamily.bold, fontSize: 10, letterSpacing: 1.4 },
  chipsFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bloque: { gap: 10 },
  miniEtiqueta: { fontFamily: Typography.fontFamily.semibold, fontSize: 9.5, letterSpacing: 1.3 },
  elegido: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, padding: 12, minHeight: 52 },
  elegidoNombre: { fontFamily: Typography.fontFamily.semibold, fontSize: 14 },
  cambiar: { fontFamily: Typography.fontFamily.semibold, fontSize: 12 },
  resultado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 },
  resultadoNombre: { flex: 1, fontFamily: Typography.fontFamily.medium, fontSize: 13.5 },
  dobleCampo: { flexDirection: 'row', gap: 10 },
  nota: { fontFamily: Typography.fontFamily.regular, fontSize: 12, lineHeight: 18 },
  error: { fontFamily: Typography.fontFamily.medium, fontSize: 12, lineHeight: 17 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,16,13,0.55)' },
  sheetWrap: { maxHeight: '90%' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, overflow: 'hidden' },
  sheetScroll: { padding: 20, paddingBottom: 32, gap: 12 },
  rubros: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sheetTitulo: { flex: 1, fontFamily: Typography.fontFamily.bold, fontSize: 21, letterSpacing: -0.5 },
  cerrar: { minHeight: 44, justifyContent: 'center' },
  cerrarTexto: { fontFamily: Typography.fontFamily.semibold, fontSize: 13 },
});
