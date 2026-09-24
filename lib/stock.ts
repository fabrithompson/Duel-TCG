import { addDoc, collection, deleteDoc, deleteField, doc, increment, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { LIMITES } from './config';
import { fechaLocal } from './fecha';
import { CatalogoItem, Rubro, Unidad, coleccionDe } from './pedido';

export const LIMITES_STOCK = {
  nombre: 60,
  precio: 10_000_000,
  cantidad: 100_000,
  costo: 10_000_000,
} as const;

export type RubroMercaderia = Exclude<Rubro, 'Mesa'>;
export const RUBROS_MERCADERIA: readonly RubroMercaderia[] = ['Café', 'Pastelería', 'TCG'];

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

export function admiteDecimales(unidad: Unidad): boolean {
  return unidad === 'kg' || unidad === 'L';
}

// Se acepta coma o punto como separador decimal: el teclado numérico de Android en es-AR muestra la coma.
export function parsearCantidad(texto: string, unidad: Unidad): number | null {
  const t = texto.trim().replace(',', '.');
  const patron = admiteDecimales(unidad) ? /^\d+(\.\d{1,3})?$/ : /^\d+$/;
  if (!patron.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Pesos enteros: el punto solo vale como separador de miles ("1.500" = 1500); "2200.50" se rechaza en vez de leerse 220050.
export function parsearMonto(texto: string): number | null {
  const t = texto.trim().replace(/^\$/, '').replace(/\s/g, '');
  let digitos: string;
  if (/^\d+$/.test(t)) digitos = t;
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) digitos = t.replace(/\./g, '');
  else return null;
  const n = Number(digitos);
  return Number.isSafeInteger(n) ? n : null;
}

function mismoNombre(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');
}

function validarNombre(nombre: string): Resultado<string> {
  const limpio = nombre.trim().replace(/\s+/g, ' ');
  if (!limpio) return { ok: false, error: 'Escribí el nombre del producto.' };
  if (limpio.length > LIMITES_STOCK.nombre) return { ok: false, error: `El nombre puede tener hasta ${LIMITES_STOCK.nombre} caracteres.` };
  return { ok: true, valor: limpio };
}

function validarPrecio(texto: string, permitirCero: boolean): Resultado<number> {
  const precio = parsearMonto(texto);
  if (precio === null) return { ok: false, error: 'El precio tiene que ser un número entero de pesos.' };
  if (!permitirCero && precio <= 0) return { ok: false, error: 'El precio tiene que ser mayor a $0.' };
  if (precio > LIMITES_STOCK.precio) return { ok: false, error: 'El precio es demasiado alto. Revisalo.' };
  return { ok: true, valor: precio };
}

function validarCantidad(texto: string, unidad: Unidad): Resultado<number> {
  const cantidad = parsearCantidad(texto, unidad);
  if (cantidad === null) {
    return {
      ok: false,
      error: admiteDecimales(unidad) ? 'La cantidad tiene que ser un número (hasta 3 decimales).' : `La cantidad en "${unidad}" tiene que ser un número entero.`,
    };
  }
  if (cantidad <= 0) return { ok: false, error: 'La cantidad tiene que ser mayor a 0.' };
  if (cantidad > LIMITES_STOCK.cantidad) return { ok: false, error: 'La cantidad es demasiado alta. Revisala.' };
  return { ok: true, valor: cantidad };
}

export interface FormIngreso {
  modo: 'existente' | 'nuevo';
  producto: CatalogoItem | null;
  nombre: string;
  rubro: RubroMercaderia;
  unidad: Unidad;
  precio: string;
  cantidad: string;
  costo: string;
}

export type IngresoValido =
  | { tipo: 'existente'; producto: CatalogoItem; cantidad: number; costoUnitario: number }
  | { tipo: 'nuevo'; nombre: string; rubro: RubroMercaderia; unidad: Unidad; precio: number; cantidad: number; costoUnitario: number };

function validarCosto(texto: string): Resultado<number> {
  const costo = parsearMonto(texto);
  if (costo === null) return { ok: false, error: 'Cargá el costo unitario en pesos enteros (0 si entró sin cargo).' };
  if (costo > LIMITES_STOCK.costo) return { ok: false, error: 'El costo es demasiado alto. Revisalo.' };
  return { ok: true, valor: costo };
}

export function validarIngreso(form: FormIngreso, catalogo: readonly CatalogoItem[]): Resultado<IngresoValido> {
  if (form.modo === 'existente') {
    const producto = form.producto;
    if (!producto) return { ok: false, error: 'Elegí qué producto entró.' };
    if (producto.stock === null) return { ok: false, error: `${producto.nombre} no controla stock. Activalo desde su ficha primero.` };
    const cantidad = validarCantidad(form.cantidad, producto.unidad);
    if (!cantidad.ok) return cantidad;
    const costo = validarCosto(form.costo);
    if (!costo.ok) return costo;
    return { ok: true, valor: { tipo: 'existente', producto, cantidad: cantidad.valor, costoUnitario: costo.valor } };
  }

  const nombre = validarNombre(form.nombre);
  if (!nombre.ok) return nombre;
  const duplicado = catalogo.find((c) => c.rubro === form.rubro && mismoNombre(c.nombre, nombre.valor));
  if (duplicado) return { ok: false, error: `Ya existe "${duplicado.nombre}" en ${form.rubro}. Elegilo en "Producto existente".` };
  const precio = validarPrecio(form.precio, false);
  if (!precio.ok) return precio;
  const cantidad = validarCantidad(form.cantidad, form.unidad);
  if (!cantidad.ok) return cantidad;
  const costo = validarCosto(form.costo);
  if (!costo.ok) return costo;
  return {
    ok: true,
    valor: { tipo: 'nuevo', nombre: nombre.valor, rubro: form.rubro, unidad: form.unidad, precio: precio.valor, cantidad: cantidad.valor, costoUnitario: costo.valor },
  };
}

// Producto e ingreso van en el mismo batch: nunca queda stock sumado sin su renglón de trazabilidad (ni al revés).
export async function registrarIngreso(ingreso: IngresoValido, uid: string): Promise<string> {
  const batch = writeBatch(db);
  let productoId: string;
  let coleccion: 'productos' | 'tcg_productos';
  let nombre: string;
  let rubro: Rubro;
  let unidad: Unidad;

  if (ingreso.tipo === 'existente') {
    const p = ingreso.producto;
    coleccion = coleccionDe(p.origen);
    productoId = p.id;
    nombre = p.nombre;
    rubro = p.rubro;
    unidad = p.unidad;
    batch.update(doc(db, coleccion, p.id), { stock: increment(ingreso.cantidad) });
  } else {
    coleccion = ingreso.rubro === 'TCG' ? 'tcg_productos' : 'productos';
    const ref = doc(collection(db, coleccion));
    productoId = ref.id;
    nombre = ingreso.nombre;
    rubro = ingreso.rubro;
    unidad = ingreso.unidad;
    if (coleccion === 'tcg_productos') {
      batch.set(ref, { nombre, valor: ingreso.precio, stock: ingreso.cantidad, unidad, activo: true, creadoEn: serverTimestamp() });
    } else {
      batch.set(ref, { nombre, precio: ingreso.precio, rubro, controlStock: true, stock: ingreso.cantidad, unidad, activo: true, creadoEn: serverTimestamp() });
    }
  }

  batch.set(doc(collection(db, 'ingresos')), {
    productoId,
    coleccion,
    nombre,
    rubro,
    cantidad: ingreso.cantidad,
    unidad,
    costoUnitario: ingreso.costoUnitario,
    fecha: fechaLocal(),
    creadoPor: uid,
    creadoEn: serverTimestamp(),
  });

  await batch.commit();
  return productoId;
}

export interface FormProducto {
  nombre: string;
  precio: string;
  alerta: string;
  activo: boolean;
  controlStock: boolean;
}

export interface CambiosProducto {
  nombre: string;
  precio: number;
  /** null = usa la alerta general del local. */
  alerta: number | null;
  activo: boolean;
  controlStock: boolean;
}

export function validarProducto(
  form: FormProducto,
  contexto: { catalogo: readonly CatalogoItem[]; rubro: Rubro; unidad: Unidad; idActual: string | null }
): Resultado<CambiosProducto> {
  const nombre = validarNombre(form.nombre);
  if (!nombre.ok) return nombre;
  const duplicado = contexto.catalogo.find(
    (c) => c.id !== contexto.idActual && c.rubro === contexto.rubro && mismoNombre(c.nombre, nombre.valor)
  );
  if (duplicado) return { ok: false, error: `Ya existe "${duplicado.nombre}" en ese rubro.` };
  // Los servicios pueden valer $0 (cortesía del juez, por ejemplo).
  const precio = validarPrecio(form.precio, contexto.rubro === 'Mesa');
  if (!precio.ok) return precio;

  let alerta: number | null = null;
  if (form.alerta.trim()) {
    const n = parsearCantidad(form.alerta, contexto.unidad);
    if (n === null) return { ok: false, error: 'La alerta tiene que ser un número (o dejala vacía para usar la del local).' };
    if (n > LIMITES.alertaStock.max) return { ok: false, error: `La alerta puede ser hasta ${LIMITES.alertaStock.max}.` };
    alerta = n;
  }
  return { ok: true, valor: { nombre: nombre.valor, precio: precio.valor, alerta, activo: form.activo, controlStock: form.controlStock } };
}

export async function actualizarProducto(item: CatalogoItem, cambios: CambiosProducto): Promise<void> {
  const alerta = cambios.alerta === null ? deleteField() : cambios.alerta;
  if (item.origen === 'tcg') {
    await updateDoc(doc(db, 'tcg_productos', item.id), { nombre: cambios.nombre, valor: cambios.precio, alerta, activo: cambios.activo });
    return;
  }
  const activaControl = cambios.controlStock && item.stock === null;
  await updateDoc(doc(db, 'productos', item.id), {
    nombre: cambios.nombre,
    precio: cambios.precio,
    alerta,
    activo: cambios.activo,
    controlStock: cambios.controlStock,
    // Lo que hubiera quedado guardado de antes no se contó mientras el control estaba apagado.
    ...(activaControl ? { stock: 0 } : {}),
  });
}

export async function crearServicio(cambios: Pick<CambiosProducto, 'nombre' | 'precio'>): Promise<void> {
  await addDoc(collection(db, 'productos'), {
    nombre: cambios.nombre,
    precio: cambios.precio,
    rubro: 'Mesa',
    controlStock: false,
    activo: true,
    creadoEn: serverTimestamp(),
  });
}

export async function eliminarProducto(item: Pick<CatalogoItem, 'id' | 'origen'>): Promise<void> {
  await deleteDoc(doc(db, coleccionDe(item.origen), item.id));
}
