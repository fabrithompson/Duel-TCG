import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { getMetadata, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';

const PROJECT_ID = 'demo-duel';
const CODIGO = 'ABCD2345';
// Día local de Argentina (UTC-3): las reglas exigen que un torneo nuevo tenga la fecha de hoy.
const HOY = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

const U = {
  admin: 'admin1',
  adminPendiente: 'adminPendiente',
  mozo: 'mozo1',
  juez: 'juez1',
  j1: 'jugador1',
  j2: 'jugador2',
  j3: 'jugador3',
  mozoPendiente: 'mozoPendiente',
  juezRechazado: 'juezRechazado',
  nuevo: 'nuevo1',
  legado: 'legado1',
} as const;

let testEnv: RulesTestEnvironment;

function leer(archivo: string): string {
  return readFileSync(resolve(__dirname, '..', archivo), 'utf8');
}

function email(uid: string): string {
  return `${uid}@duel.test`;
}

function ctx(uid: string): RulesTestContext {
  return testEnv.authenticatedContext(uid, { email: email(uid) });
}

/** YYYY-MM-DD del día argentino corrido `dias`. */
function fechaAR(dias: number): string {
  return new Date(Date.now() - 3 * 3600_000 + dias * 86400_000).toISOString().slice(0, 10);
}

function comoVerificado(uid: string): Firestore {
  return testEnv.authenticatedContext(uid, { email: email(uid), email_verified: true }).firestore() as unknown as Firestore;
}

/** Como la app: el torneo nuevo y el candado de "uno en curso a la vez" van en la misma escritura. */
function crearTorneo(db: Firestore, id: string, datos: Record<string, unknown>) {
  const b = writeBatch(db);
  b.set(doc(db, 'torneos', id), datos);
  b.set(doc(db, 'bloqueos', 'torneo'), { torneoId: id, actualizadoEn: serverTimestamp() });
  return b.commit();
}

async function liberarCandado(): Promise<void> {
  await sinReglas((a) => setDoc(doc(a, 'bloqueos', 'torneo'), { torneoId: null, actualizadoEn: Timestamp.now() }));
}

function como(uid: string): Firestore {
  return ctx(uid).firestore() as unknown as Firestore;
}

function anonimo(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

function almacenamiento(c: RulesTestContext): FirebaseStorage {
  return c.storage() as unknown as FirebaseStorage;
}

async function sinReglas(fn: (db: Firestore) => Promise<void>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (c) => {
    await fn(c.firestore() as unknown as Firestore);
  });
}

function perfil(uid: string, role: string, estadoAprobacion: string, extra: Record<string, unknown> = {}) {
  return { uid, nombre: `Usuario ${uid}`, email: email(uid), role, estadoAprobacion, creadoEn: Timestamp.now(), ...extra };
}

function directorio(uid: string, creditoCafeteria = 0) {
  return { uid, nombre: `Usuario ${uid}`, nombreBusqueda: `usuario ${uid}`, creditoCafeteria, creadoEn: Timestamp.now() };
}

function jugador(uid: string) {
  return { uid, nombre: `Usuario ${uid}`, pagado: true };
}

function torneoBase(creadoPor: string) {
  return {
    nombre: 'Liga semanal',
    juego: 'Pokémon TCG',
    formatoId: 'suizo',
    formato: 'Suizo',
    totalRondas: 3,
    topCut: 0,
    minutosPorRonda: 50,
    minutosExtra: 3,
    inscripcion: 6000,
    cupo: 16,
    jugadores: [jugador(U.j1), jugador(U.j2)],
    jugadoresUids: [U.j1, U.j2],
    estado: 'en_curso',
    rondaActual: 1,
    rondas: [
      {
        numero: 1,
        fase: 'suizo',
        partidas: [
          { mesa: 1, jugador1: jugador(U.j1), jugador2: jugador(U.j2), resultado: null, mesaSalonId: 'm2', mesaSalonNumero: 2 },
        ],
      },
    ],
    premios: [
      { puesto: 1, jugadorUid: null, productoId: 't1', productoOrigen: 'tcg', cantidadProducto: 4, creditoCafeteria: 3000, entregado: false },
    ],
    rondaFinEn: Date.now() + 50 * 60000,
    rondaRestanteMs: null,
    rondaPausada: false,
    fecha: HOY,
    creadoPor,
    creadoEn: serverTimestamp(),
  };
}

function ventaBase(creadoPor: string) {
  return {
    mesaId: 'm1',
    mesaNum: 1,
    items: [{ itemId: 'p1', nombre: 'Espresso', precio: 2200, cantidad: 2, rubro: 'Café', origen: 'productos' }],
    subtotal: 4400,
    creditoAplicado: 0,
    creditoUid: null,
    total: 4400,
    medioPago: 'efectivo',
    fecha: HOY,
    hora: '21:30',
    creadoPor,
    creadoEn: serverTimestamp(),
  };
}

function ingresoBase(creadoPor: string) {
  return {
    productoId: 'p1',
    coleccion: 'productos',
    nombre: 'Espresso',
    rubro: 'Café',
    cantidad: 10,
    unidad: 'u',
    costoUnitario: 900,
    fecha: HOY,
    creadoPor,
    creadoEn: serverTimestamp(),
  };
}

function reporteBase(uid: string, ronda = 1, mesa = 1) {
  return { ronda, mesa, uid, resultado: '2-1', creadoEn: serverTimestamp() };
}

function altaUsuario(uid: string, role: string, estadoAprobacion: string, extra: Record<string, unknown> = {}) {
  return { uid, nombre: 'Ana Pérez', email: email(uid), role, estadoAprobacion, creadoEn: serverTimestamp(), ...extra };
}

async function sembrar(): Promise<void> {
  await sinReglas(async (db) => {
    const b = writeBatch(db);
    const ahora = Timestamp.now();
    b.set(doc(db, 'users', U.admin), perfil(U.admin, 'admin', 'aprobado'));
    b.set(doc(db, 'users', U.adminPendiente), perfil(U.adminPendiente, 'admin', 'pendiente'));
    b.set(doc(db, 'users', U.mozo), perfil(U.mozo, 'mozo', 'aprobado'));
    b.set(doc(db, 'users', U.juez), perfil(U.juez, 'juez', 'aprobado'));
    b.set(doc(db, 'users', U.j1), perfil(U.j1, 'jugador', 'aprobado'));
    b.set(doc(db, 'users', U.j2), perfil(U.j2, 'jugador', 'aprobado'));
    b.set(doc(db, 'users', U.j3), perfil(U.j3, 'jugador', 'aprobado'));
    b.set(doc(db, 'users', U.mozoPendiente), perfil(U.mozoPendiente, 'mozo', 'pendiente', { codigoInvitacion: CODIGO }));
    b.set(doc(db, 'users', U.juezRechazado), perfil(U.juezRechazado, 'juez', 'rechazado', { codigoInvitacion: CODIGO }));
    b.set(doc(db, 'users', U.legado), { uid: U.legado, name: 'Viejo Prototipo', email: email(U.legado), role: 'user', createdAt: ahora });
    b.set(doc(db, 'jugadores', U.j1), directorio(U.j1, 5000));
    b.set(doc(db, 'jugadores', U.j2), directorio(U.j2));
    b.set(doc(db, 'jugadores', U.j3), directorio(U.j3));
    b.set(doc(db, 'config', 'publico'), {
      nombreLocal: 'Duel Test',
      logoUrl: null,
      marca: null,
      oscuroPorDefecto: false,
      turnos: [{ nombre: 'Mañana', apertura: '08:00', cierre: '15:00' }],
      alertaStock: 5,
      torneo: { rondas: 5, minutos: 50, extra: 3, inscripcion: 6000, cupo: 16 },
      temporada: { nombre: 'Temporada 1', inicio: null },
      reporteJugador: true,
      creditoPremio: true,
      descontarStock: true,
    });
    b.set(doc(db, 'config', 'privado'), { codigoInvitacion: CODIGO, codigoVenceEn: Timestamp.fromMillis(Date.now() + 7 * 86400000) });
    b.set(doc(db, 'salas', 's1'), { nombre: 'Planta baja', orden: 0, creadoEn: ahora });
    b.set(doc(db, 'mesas', 'm1'), { numero: 1, x: 18, y: 16, salaId: 's1', tipo: 'cafe', estado: 'libre', pedido: [], creadoEn: ahora });
    b.set(doc(db, 'mesas', 'm2'), { numero: 2, x: 118, y: 16, salaId: 's1', tipo: 'duelo', estado: 'libre', pedido: [], creadoEn: ahora });
    b.set(doc(db, 'mesas', 'vieja'), { numero: 9, x: 0, y: 0, salaId: 's1', estado: 'ocupada', pedido: [], capacidad: 4 });
    b.set(doc(db, 'productos', 'p1'), {
      nombre: 'Espresso', precio: 2200, rubro: 'Café', controlStock: true, stock: 10, unidad: 'u', activo: true, creadoEn: ahora,
    });
    b.set(doc(db, 'productos', 'serv'), { nombre: 'Alquiler mesa 1h', precio: 3000, rubro: 'Mesa', controlStock: false, creadoEn: ahora });
    b.set(doc(db, 'productos', 'viejo'), { nombre: 'Medialuna', precio: 1400, categoria: 'Comidas', imagen: 'x' });
    b.set(doc(db, 'tcg_productos', 't1'), { nombre: 'Sobre Surging Sparks', valor: 7500, stock: 5, unidad: 'u', creadoEn: ahora });
    b.set(doc(db, 'ventas', 'v1'), { ...ventaBase(U.mozo), creadoEn: ahora });
    b.set(doc(db, 'ingresos', 'i1'), { ...ingresoBase(U.admin), creadoEn: ahora });
    b.set(doc(db, 'torneos', 't1'), { ...torneoBase(U.juez), creadoEn: ahora });
    b.set(doc(db, 'torneos', 'tf'), {
      ...torneoBase(U.juez),
      fecha: '2026-09-17',
      estado: 'finalizado',
      rondaActual: 3,
      rondas: [1, 2, 3].map((numero) => ({ ...torneoBase(U.juez).rondas[0], numero })),
      premios: [{ ...torneoBase(U.juez).premios[0], jugadorUid: U.j1 }],
      rondaFinEn: null,
      posiciones: [{ uid: U.j1, nombre: 'Usuario jugador1', puesto: 1, puntos: 9, victorias: 3, derrotas: 0 }],
      finalizadoEn: ahora,
      creadoEn: Timestamp.fromMillis(ahora.toMillis() - 7 * 86400000),
    });
    b.set(doc(db, 'torneos', 't1', 'reportes', `1_1_${U.j1}`), { ...reporteBase(U.j1), creadoEn: ahora });
    b.set(doc(db, 'torneos', 't2r'), {
      ...torneoBase(U.juez),
      rondaActual: 2,
      rondas: [1, 2].map((numero) => ({ ...torneoBase(U.juez).rondas[0], numero })),
      creadoEn: ahora,
    });
    const base3 = torneoBase(U.juez);
    b.set(doc(db, 'torneos', 't3'), {
      ...base3,
      jugadores: [jugador(U.j1), jugador(U.j2), jugador(U.j3)],
      jugadoresUids: [U.j1, U.j2, U.j3],
      rondas: [
        {
          numero: 1,
          fase: 'suizo',
          partidas: [
            { mesa: 1, jugador1: jugador(U.j1), jugador2: jugador(U.j2), resultado: null, mesaSalonId: null, mesaSalonNumero: null },
            { mesa: 2, jugador1: jugador(U.j3), jugador2: null, resultado: '2-0', mesaSalonId: null, mesaSalonNumero: null },
          ],
        },
      ],
      creadoEn: ahora,
    });
    b.set(doc(db, 'tcg_juegos', 'x'), { nombre: 'Pokémon' });
    await b.commit();
  });
}

beforeAll(async () => {
  setLogLevel('silent');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: leer('firestore.rules') },
    storage: { rules: leer('storage.rules') },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await sembrar();
});

describe('config', () => {
  test('cualquiera (incluso sin sesión) lee config/publico', async () => {
    await assertSucceeds(getDoc(doc(anonimo(), 'config', 'publico')));
  });

  test('solo el admin aprobado escribe config/publico', async () => {
    await assertSucceeds(setDoc(doc(como(U.admin), 'config', 'publico'), { alertaStock: 8 }, { merge: true }));
    for (const uid of [U.mozo, U.juez, U.j1, U.adminPendiente, U.mozoPendiente]) {
      await assertFails(setDoc(doc(como(uid), 'config', 'publico'), { alertaStock: 8 }, { merge: true }));
    }
    await assertFails(setDoc(doc(anonimo(), 'config', 'publico'), { nombreLocal: 'Hackeado' }, { merge: true }));
  });

  test('config/publico valida campos, tipos y rangos', async () => {
    const db = como(U.admin);
    await assertSucceeds(setDoc(doc(db, 'config', 'publico'), { torneo: { rondas: 6 }, marca: '#3F6B57' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'config', 'publico'), { alertaStock: -1 }, { merge: true }));
    await assertFails(setDoc(doc(db, 'config', 'publico'), { alertaStock: 5000 }, { merge: true }));
    await assertFails(setDoc(doc(db, 'config', 'publico'), { marca: 'rojo' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'config', 'publico'), { codigoInvitacion: 'FILTRADO' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'config', 'publico'), { torneo: { rondas: 99 } }, { merge: true }));
    await assertFails(setDoc(doc(db, 'config', 'publico'), { logoUrl: 'http://inseguro.test/logo.png' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'config', 'publico'), { reporteJugador: 'no' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'config', 'publico'), { nombreLocal: '' }, { merge: true }));
  });

  test('juegos, medios de pago e inicio de temporada del local', async () => {
    const r = doc(como(U.admin), 'config', 'publico');
    await assertSucceeds(setDoc(r, { juegos: ['Pokémon TCG', 'Lorcana'], mediosPago: ['efectivo', 'qr'] }, { merge: true }));
    await assertSucceeds(setDoc(r, { temporada: { nombre: 'T2', inicio: HOY, inicioMs: Date.now() } }, { merge: true }));
    await assertFails(setDoc(r, { juegos: [] }, { merge: true }));
    await assertFails(setDoc(r, { juegos: 'Magic' }, { merge: true }));
    await assertFails(setDoc(r, { mediosPago: ['bitcoin'] }, { merge: true }));
    await assertFails(setDoc(r, { mediosPago: ['credito_torneo'] }, { merge: true }));
    await assertFails(setDoc(r, { mediosPago: [] }, { merge: true }));
    await assertFails(setDoc(r, { temporada: { inicioMs: 'ayer' } }, { merge: true }));
  });

  test('el admin puede crear config/publico desde cero', async () => {
    await sinReglas((db) => deleteDoc(doc(db, 'config', 'publico')));
    await assertSucceeds(setDoc(doc(como(U.admin), 'config', 'publico'), { nombreLocal: 'Mi café' }, { merge: true }));
  });

  test('el código de invitación solo lo lee y escribe el admin', async () => {
    await assertSucceeds(getDoc(doc(como(U.admin), 'config', 'privado')));
    for (const uid of [U.mozo, U.juez, U.j1, U.mozoPendiente, U.adminPendiente]) {
      await assertFails(getDoc(doc(como(uid), 'config', 'privado')));
      await assertFails(setDoc(doc(como(uid), 'config', 'privado'), { codigoInvitacion: 'MIO12345' }));
    }
    await assertFails(getDoc(doc(anonimo(), 'config', 'privado')));
    const vence = Timestamp.fromMillis(Date.now() + 7 * 86400000);
    await assertSucceeds(setDoc(doc(como(U.admin), 'config', 'privado'), { codigoInvitacion: 'ZXCV7890', codigoVenceEn: vence }));
    // Un código sin vencimiento ya no se acepta.
    await assertFails(setDoc(doc(como(U.admin), 'config', 'privado'), { codigoInvitacion: 'ZXCV7890' }));
    await assertFails(setDoc(doc(como(U.admin), 'config', 'privado'), { codigoInvitacion: 'abc' }));
    await assertFails(setDoc(doc(como(U.admin), 'config', 'privado'), { codigoInvitacion: 'ZXCV7890', extra: true }));
  });

  test('no se puede leer ni escribir otros documentos de config', async () => {
    await assertFails(getDoc(doc(como(U.admin), 'config', 'local')));
    await assertFails(setDoc(doc(como(U.admin), 'config', 'local'), { codigoInvitacion: 'X' }));
  });
});

describe('users: alta', () => {
  test('un jugador se registra aprobado', async () => {
    await assertSucceeds(setDoc(doc(como(U.nuevo), 'users', U.nuevo), altaUsuario(U.nuevo, 'jugador', 'aprobado')));
  });

  test('el email se compara sin distinguir mayúsculas', async () => {
    const doc0 = altaUsuario(U.nuevo, 'jugador', 'aprobado', { email: email(U.nuevo).toUpperCase() });
    await assertSucceeds(setDoc(doc(como(U.nuevo), 'users', U.nuevo), doc0));
  });

  test('mozo y juez se registran pendientes con el código correcto', async () => {
    await assertSucceeds(
      setDoc(doc(como(U.nuevo), 'users', U.nuevo), altaUsuario(U.nuevo, 'mozo', 'pendiente', { codigoInvitacion: CODIGO }))
    );
    await assertSucceeds(
      setDoc(doc(como('nuevo2'), 'users', 'nuevo2'), altaUsuario('nuevo2', 'juez', 'pendiente', { codigoInvitacion: CODIGO }))
    );
  });

  test('código incorrecto, ausente o sin config/privado: rechazado', async () => {
    const db = como(U.nuevo);
    const ref0 = doc(db, 'users', U.nuevo);
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'mozo', 'pendiente', { codigoInvitacion: 'ZZZZ9999' })));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'mozo', 'pendiente')));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'mozo', 'pendiente', { codigoInvitacion: null })));
    await sinReglas((a) => setDoc(doc(a, 'config', 'privado'), { codigoInvitacion: null }));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'mozo', 'pendiente', { codigoInvitacion: CODIGO })));
    await sinReglas((a) => deleteDoc(doc(a, 'config', 'privado')));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'juez', 'pendiente', { codigoInvitacion: CODIGO })));
  });

  test('nadie se auto-aprueba como staff ni se crea admin', async () => {
    const ref0 = doc(como(U.nuevo), 'users', U.nuevo);
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'mozo', 'aprobado', { codigoInvitacion: CODIGO })));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'juez', 'aprobado', { codigoInvitacion: CODIGO })));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'admin', 'aprobado')));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'admin', 'pendiente', { codigoInvitacion: CODIGO })));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'jugador', 'pendiente')));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'superadmin', 'aprobado')));
  });

  test('el alta valida dueño, campos, email y timestamp del servidor', async () => {
    const db = como(U.nuevo);
    const ref0 = doc(db, 'users', U.nuevo);
    await assertFails(setDoc(doc(db, 'users', 'otro'), altaUsuario('otro', 'jugador', 'aprobado')));
    await assertFails(setDoc(ref0, { ...altaUsuario(U.nuevo, 'jugador', 'aprobado'), uid: 'otro' }));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'jugador', 'aprobado', { creditoCafeteria: 999999 })));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'jugador', 'aprobado', { codigoInvitacion: CODIGO })));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'jugador', 'aprobado', { email: 'otro@duel.test' })));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'jugador', 'aprobado', { creadoEn: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'jugador', 'aprobado', { nombre: 'A' })));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'jugador', 'aprobado', { nombre: 'x'.repeat(61) })));
    await assertFails(setDoc(ref0, altaUsuario(U.nuevo, 'jugador', 'aprobado', { telefono: '1234' })));
    await assertFails(setDoc(doc(anonimo(), 'users', U.nuevo), altaUsuario(U.nuevo, 'jugador', 'aprobado')));
  });

  test('un usuario existente no puede re-crearse con otro rol', async () => {
    await assertFails(
      setDoc(doc(como(U.j1), 'users', U.j1), altaUsuario(U.j1, 'mozo', 'pendiente', { codigoInvitacion: CODIGO }))
    );
  });
});

describe('código de invitación con vencimiento', () => {
  test('el admin lo genera con vencimiento de hasta un mes', async () => {
    const r = doc(como(U.admin), 'config', 'privado');
    await assertSucceeds(setDoc(r, { codigoInvitacion: 'NUEVO2345', codigoVenceEn: Timestamp.fromMillis(Date.now() + 7 * 86400000) }));
    await assertFails(setDoc(r, { codigoInvitacion: 'NUEVO2345', codigoVenceEn: Timestamp.fromMillis(Date.now() - 60_000) }));
    await assertFails(setDoc(r, { codigoInvitacion: 'NUEVO2345', codigoVenceEn: Timestamp.fromMillis(Date.now() + 60 * 86400000) }));
  });

  test('un código viejo sin vencimiento ya no sirve para registrarse', async () => {
    await sinReglas((a) => setDoc(doc(a, 'config', 'privado'), { codigoInvitacion: CODIGO }));
    await assertFails(setDoc(doc(como(U.nuevo), 'users', U.nuevo), altaUsuario(U.nuevo, 'mozo', 'pendiente', { codigoInvitacion: CODIGO })));
  });

  test('un código vencido ya no sirve para registrarse', async () => {
    await sinReglas((a) => setDoc(doc(a, 'config', 'privado'), { codigoInvitacion: CODIGO, codigoVenceEn: Timestamp.fromMillis(Date.now() - 60_000) }));
    await assertFails(setDoc(doc(como(U.nuevo), 'users', U.nuevo), altaUsuario(U.nuevo, 'mozo', 'pendiente', { codigoInvitacion: CODIGO })));
    await sinReglas((a) => setDoc(doc(a, 'config', 'privado'), { codigoInvitacion: CODIGO, codigoVenceEn: Timestamp.fromMillis(Date.now() + 86400000) }));
    await assertSucceeds(setDoc(doc(como(U.nuevo), 'users', U.nuevo), altaUsuario(U.nuevo, 'mozo', 'pendiente', { codigoInvitacion: CODIGO })));
  });
});

describe('users: lectura', () => {
  test('cada uno lee su propio perfil, aunque esté pendiente', async () => {
    for (const uid of [U.j1, U.mozoPendiente, U.juezRechazado, U.admin]) {
      await assertSucceeds(getDoc(doc(como(uid), 'users', uid)));
    }
    await assertSucceeds(getDoc(doc(como(U.nuevo), 'users', U.nuevo)));
  });

  test('un jugador no lee a otros usuarios', async () => {
    await assertFails(getDoc(doc(como(U.j1), 'users', U.j2)));
    await assertFails(getDoc(doc(como(U.j1), 'users', U.admin)));
    await assertFails(getDocs(query(collection(como(U.j1), 'users'), where('role', '==', 'jugador'))));
  });

  test('mozo y juez no leen perfiles ajenos (emails), ni siquiera de jugadores', async () => {
    for (const uid of [U.mozo, U.juez, U.mozoPendiente, U.adminPendiente]) {
      const db = como(uid);
      await assertFails(getDoc(doc(db, 'users', U.j1)));
      await assertFails(getDoc(doc(db, 'users', U.admin)));
      await assertFails(getDocs(query(collection(db, 'users'), where('role', '==', 'jugador'))));
      await assertFails(getDocs(collection(db, 'users')));
      await assertFails(getDocs(query(collection(db, 'users'), where('estadoAprobacion', '==', 'pendiente'))));
    }
  });

  test('el admin lee y lista todo', async () => {
    const db = como(U.admin);
    await assertSucceeds(getDoc(doc(db, 'users', U.mozoPendiente)));
    await assertSucceeds(getDocs(collection(db, 'users')));
    await assertSucceeds(getDocs(query(collection(db, 'users'), where('estadoAprobacion', '==', 'pendiente'))));
    await assertSucceeds(getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'mozo', 'juez']))));
  });

  test('sin sesión no se lee nada de users', async () => {
    await assertFails(getDoc(doc(anonimo(), 'users', U.j1)));
    await assertFails(getDocs(query(collection(anonimo(), 'users'), where('role', '==', 'jugador'))));
  });
});

describe('users: cuentas heredadas del prototipo', () => {
  test('el dueño pasa su cuenta vieja a jugador (y nada más)', async () => {
    const db = como(U.legado);
    await assertFails(updateDoc(doc(db, 'users', U.legado), { role: 'mozo', estadoAprobacion: 'aprobado', nombre: 'Viejo Prototipo' }));
    await assertFails(updateDoc(doc(db, 'users', U.legado), { role: 'jugador', estadoAprobacion: 'aprobado', nombre: 'Viejo Prototipo', email: 'x@y.z' }));
    await assertFails(updateDoc(doc(como(U.mozo), 'users', U.legado), { role: 'jugador', estadoAprobacion: 'aprobado', nombre: 'Viejo' }));
    const b = writeBatch(db);
    b.update(doc(db, 'users', U.legado), { role: 'jugador', estadoAprobacion: 'aprobado', nombre: 'Viejo Prototipo' });
    b.set(doc(db, 'jugadores', U.legado), { uid: U.legado, nombre: 'Viejo Prototipo', nombreBusqueda: 'viejo prototipo', creditoCafeteria: 0, creadoEn: serverTimestamp() });
    await assertSucceeds(b.commit());
  });

  test('una cuenta con rol válido no usa la migración para cambiarse el rol', async () => {
    await assertFails(updateDoc(doc(como(U.mozoPendiente), 'users', U.mozoPendiente), { role: 'jugador', estadoAprobacion: 'aprobado', nombre: 'Me escapo' }));
    await assertFails(updateDoc(doc(como(U.juezRechazado), 'users', U.juezRechazado), { role: 'jugador', estadoAprobacion: 'aprobado', nombre: 'Me escapo' }));
  });
});

describe('users: edición', () => {
  test('el propio usuario solo cambia su nombre', async () => {
    const db = como(U.j1);
    await assertSucceeds(updateDoc(doc(db, 'users', U.j1), { nombre: 'Juan Carlos' }));
    await assertFails(updateDoc(doc(db, 'users', U.j1), { nombre: 'J' }));
    await assertFails(updateDoc(doc(db, 'users', U.j1), { role: 'admin' }));
    await assertFails(updateDoc(doc(db, 'users', U.j1), { email: 'otro@duel.test' }));
    await assertFails(updateDoc(doc(db, 'users', U.j1), { nombre: 'Juan', role: 'admin' }));
    await assertFails(updateDoc(doc(db, 'users', U.j2), { nombre: 'Pisado' }));
  });

  test('cada uno pone o quita su foto de perfil, solo desde Firebase Storage', async () => {
    const foto = 'https://firebasestorage.googleapis.com/v0/b/duel.appspot.com/o/avatares%2Fx%2Ffoto.jpg?alt=media';
    await assertSucceeds(updateDoc(doc(como(U.j1), 'users', U.j1), { fotoUrl: foto }));
    await assertSucceeds(updateDoc(doc(como(U.j1), 'users', U.j1), { fotoUrl: null }));
    await assertSucceeds(updateDoc(doc(como(U.mozoPendiente), 'users', U.mozoPendiente), { fotoUrl: foto }));
    await assertFails(updateDoc(doc(como(U.j1), 'users', U.j1), { fotoUrl: 'https://otro-sitio.com/foto.jpg' }));
    await assertFails(updateDoc(doc(como(U.j1), 'users', U.j1), { fotoUrl: 42 }));
    await assertFails(updateDoc(doc(como(U.j1), 'users', U.j1), { fotoUrl: foto, role: 'admin' }));
    await assertFails(updateDoc(doc(como(U.j2), 'users', U.j1), { fotoUrl: foto }));
  });

  test('el email se marca verificado solo con el token de Authentication', async () => {
    await assertFails(updateDoc(doc(como(U.mozoPendiente), 'users', U.mozoPendiente), { emailVerificado: true }));
    await assertSucceeds(updateDoc(doc(comoVerificado(U.mozoPendiente), 'users', U.mozoPendiente), { emailVerificado: true }));
    await assertFails(updateDoc(doc(comoVerificado(U.mozoPendiente), 'users', U.mozoPendiente), { emailVerificado: true, estadoAprobacion: 'aprobado' }));
    await assertFails(updateDoc(doc(comoVerificado(U.j1), 'users', U.j2), { emailVerificado: true }));
  });

  test('nadie se auto-aprueba ni escala rol', async () => {
    await assertFails(updateDoc(doc(como(U.mozoPendiente), 'users', U.mozoPendiente), { estadoAprobacion: 'aprobado' }));
    await assertFails(updateDoc(doc(como(U.juezRechazado), 'users', U.juezRechazado), { estadoAprobacion: 'aprobado' }));
    await assertFails(updateDoc(doc(como(U.mozo), 'users', U.mozo), { role: 'admin' }));
    await assertFails(updateDoc(doc(como(U.juez), 'users', U.mozoPendiente), { estadoAprobacion: 'aprobado' }));
    await assertFails(updateDoc(doc(como(U.adminPendiente), 'users', U.adminPendiente), { estadoAprobacion: 'aprobado' }));
    await assertFails(updateDoc(doc(como(U.adminPendiente), 'users', U.mozoPendiente), { estadoAprobacion: 'aprobado' }));
  });

  test('el admin aprueba, rechaza y cambia roles', async () => {
    const db = como(U.admin);
    await assertSucceeds(updateDoc(doc(db, 'users', U.mozoPendiente), { estadoAprobacion: 'aprobado' }));
    await assertSucceeds(updateDoc(doc(db, 'users', U.juezRechazado), { estadoAprobacion: 'pendiente' }));
    await assertSucceeds(updateDoc(doc(db, 'users', U.mozo), { role: 'juez' }));
    await assertSucceeds(updateDoc(doc(db, 'users', U.j2), { nombre: 'Nombre corregido' }));
    await assertFails(updateDoc(doc(db, 'users', U.mozo), { role: 'dueño' }));
    await assertFails(updateDoc(doc(db, 'users', U.mozo), { estadoAprobacion: 'suspendido' }));
    await assertFails(updateDoc(doc(db, 'users', U.mozo), { email: 'x@duel.test' }));
    await assertFails(updateDoc(doc(db, 'users', U.mozo), { codigoInvitacion: 'OTRO1234' }));
  });

  test('el admin no puede tocarse su propio rol ni su aprobación', async () => {
    const db = como(U.admin);
    await assertFails(updateDoc(doc(db, 'users', U.admin), { role: 'jugador' }));
    await assertFails(updateDoc(doc(db, 'users', U.admin), { estadoAprobacion: 'pendiente' }));
    await assertSucceeds(updateDoc(doc(db, 'users', U.admin), { nombre: 'Dueña' }));
  });

  test('solo el admin borra usuarios', async () => {
    await assertFails(deleteDoc(doc(como(U.j1), 'users', U.j1)));
    await assertFails(deleteDoc(doc(como(U.mozo), 'users', U.j1)));
    await assertFails(deleteDoc(doc(como(U.juez), 'users', U.j1)));
    await assertSucceeds(deleteDoc(doc(como(U.admin), 'users', U.juezRechazado)));
  });
});

describe('jugadores: directorio público', () => {
  test('el jugador cambia su foto en el directorio; nadie cambia la de otro', async () => {
    const foto = 'https://firebasestorage.googleapis.com/v0/b/duel.appspot.com/o/avatares%2Fx%2Ffoto.jpg?alt=media';
    await assertSucceeds(updateDoc(doc(como(U.j1), 'jugadores', U.j1), { fotoUrl: foto }));
    await assertSucceeds(updateDoc(doc(como(U.j1), 'jugadores', U.j1), { fotoUrl: null }));
    await assertFails(updateDoc(doc(como(U.j1), 'jugadores', U.j1), { fotoUrl: 'javascript:alert(1)' }));
    await assertFails(updateDoc(doc(como(U.j1), 'jugadores', U.j1), { fotoUrl: foto, creditoCafeteria: 99999 }));
    await assertFails(updateDoc(doc(como(U.j2), 'jugadores', U.j1), { fotoUrl: foto }));
    await assertFails(updateDoc(doc(como(U.admin), 'jugadores', U.j1), { fotoUrl: foto }));
  });

  test('el juez o el admin se anotan en el directorio para jugar, con crédito 0', async () => {
    const ficha = (uid: string, credito = 0) => ({ uid, nombre: 'Juez Jugador', nombreBusqueda: 'juez jugador', creditoCafeteria: credito, creadoEn: serverTimestamp() });
    await assertFails(setDoc(doc(como(U.juez), 'jugadores', U.juez), ficha(U.juez, 5000)));
    await assertSucceeds(setDoc(doc(como(U.juez), 'jugadores', U.juez), ficha(U.juez)));
    await assertSucceeds(setDoc(doc(como(U.admin), 'jugadores', U.admin), ficha(U.admin)));
    await assertFails(setDoc(doc(como(U.juez), 'jugadores', U.mozo), ficha(U.mozo)));
    await assertFails(setDoc(doc(como(U.mozoPendiente), 'jugadores', U.mozoPendiente), ficha(U.mozoPendiente)));
    await assertFails(setDoc(doc(como(U.juezRechazado), 'jugadores', U.juezRechazado), ficha(U.juezRechazado)));
  });
  test('el jugador se da de alta en el mismo batch que su perfil', async () => {
    const db = como(U.nuevo);
    const b = writeBatch(db);
    b.set(doc(db, 'users', U.nuevo), altaUsuario(U.nuevo, 'jugador', 'aprobado'));
    b.set(doc(db, 'jugadores', U.nuevo), { uid: U.nuevo, nombre: 'Ana Pérez', nombreBusqueda: 'ana perez', creditoCafeteria: 0, creadoEn: serverTimestamp() });
    await assertSucceeds(b.commit());
  });

  test('nadie arranca con crédito, ni se da de alta por otro o sin ser jugador', async () => {
    const alta = (uid: string, extra: Record<string, unknown> = {}) => ({
      uid, nombre: 'Ana Pérez', nombreBusqueda: 'ana perez', creditoCafeteria: 0, creadoEn: serverTimestamp(), ...extra,
    });
    await sinReglas(async (db) => {
      await setDoc(doc(db, 'users', U.nuevo), perfil(U.nuevo, 'jugador', 'aprobado'));
    });
    await assertFails(setDoc(doc(como(U.nuevo), 'jugadores', U.nuevo), alta(U.nuevo, { creditoCafeteria: 50000 })));
    await assertFails(setDoc(doc(como(U.nuevo), 'jugadores', U.nuevo), alta(U.nuevo, { nombreBusqueda: 'Ana Perez' })));
    await assertFails(setDoc(doc(como(U.nuevo), 'jugadores', U.nuevo), alta(U.nuevo, { email: 'x@y.z' })));
    await assertFails(setDoc(doc(como(U.j2), 'jugadores', U.nuevo), alta(U.nuevo)));
    await assertFails(setDoc(doc(como(U.mozo), 'jugadores', U.mozo), alta(U.mozo)));
    await assertFails(setDoc(doc(como(U.mozoPendiente), 'jugadores', U.mozoPendiente), alta(U.mozoPendiente)));
    await assertSucceeds(setDoc(doc(como(U.nuevo), 'jugadores', U.nuevo), alta(U.nuevo)));
  });

  test('el staff aprobado lee y lista; el jugador solo se lee a sí mismo', async () => {
    for (const uid of [U.admin, U.mozo, U.juez]) {
      await assertSucceeds(getDocs(query(collection(como(uid), 'jugadores'), orderBy('nombreBusqueda'), limit(20))));
      await assertSucceeds(getDocs(query(collection(como(uid), 'jugadores'), where('creditoCafeteria', '>', 0), orderBy('creditoCafeteria', 'desc'), limit(6))));
      await assertSucceeds(getDoc(doc(como(uid), 'jugadores', U.j1)));
    }
    await assertSucceeds(getDoc(doc(como(U.j1), 'jugadores', U.j1)));
    await assertFails(getDoc(doc(como(U.j1), 'jugadores', U.j2)));
    await assertFails(getDocs(collection(como(U.j1), 'jugadores')));
    await assertFails(getDocs(collection(como(U.mozoPendiente), 'jugadores')));
    await assertFails(getDoc(doc(anonimo(), 'jugadores', U.j1)));
  });

  test('el jugador solo cambia su nombre (y el de búsqueda)', async () => {
    const db = como(U.j1);
    await assertSucceeds(updateDoc(doc(db, 'jugadores', U.j1), { nombre: 'Juan Carlos', nombreBusqueda: 'juan carlos' }));
    await assertFails(updateDoc(doc(db, 'jugadores', U.j1), { creditoCafeteria: increment(1000) }));
    await assertFails(updateDoc(doc(db, 'jugadores', U.j2), { nombre: 'Pisado', nombreBusqueda: 'pisado' }));
  });

  test('el juez acredita solo contra un premio que entrega en la misma escritura', async () => {
    const db = como(U.juez);
    const premios = torneoBase(U.juez).premios;
    const entrega = (uid: string, credito: number, monto = credito, torneoId = 'tf') => {
      const b = writeBatch(db);
      b.update(doc(db, 'torneos', torneoId), { premios: [{ ...premios[0], jugadorUid: uid, creditoCafeteria: credito, entregado: true }] });
      b.set(doc(db, 'torneos', torneoId, 'entregas', '1'), {
        puesto: 1,
        jugadorUid: uid,
        creditoCafeteria: credito,
        cantidadProducto: 4,
        entregadoPor: U.juez,
        entregadoEn: serverTimestamp(),
      });
      b.update(doc(db, 'jugadores', uid), { creditoCafeteria: increment(monto), ultimoPremio: { torneoId, puesto: 1 } });
      return b.commit();
    };
    // Sin premio, el juez no regala crédito.
    await assertFails(updateDoc(doc(db, 'jugadores', U.j1), { creditoCafeteria: increment(3000) }));
    // Con otro monto que el del premio, tampoco.
    await assertFails(entrega(U.j1, 3000, 5000));
    // A quien no ganó ese puesto (aunque se lo reasigne en la misma escritura), tampoco.
    await assertFails(entrega(U.j2, 3000));
    // Más que el tope por entrega, tampoco.
    await assertFails(entrega(U.j1, 2000000));
    // Con el torneo en curso todavía no hay ganadores.
    await assertFails(entrega(U.j1, 3000, 3000, 't1'));
    await assertSucceeds(entrega(U.j1, 3000));
    // El mismo premio no se cobra dos veces, ni aunque se lo vuelva a marcar pendiente.
    await assertFails(updateDoc(doc(db, 'jugadores', U.j1), { creditoCafeteria: increment(3000) }));
    await assertSucceeds(updateDoc(doc(db, 'torneos', 'tf'), { premios: [{ ...premios[0], jugadorUid: U.j1, creditoCafeteria: 3000, entregado: false }] }));
    await assertFails(entrega(U.j1, 3000));
    // El registro de la entrega no se edita ni lo borra el juez.
    await assertFails(updateDoc(doc(db, 'torneos', 'tf', 'entregas', '1'), { creditoCafeteria: 1 }));
    await assertFails(deleteDoc(doc(db, 'torneos', 'tf', 'entregas', '1')));
  });

  test('cerrado el torneo, el juez no agrega puestos', async () => {
    const premios = torneoBase(U.juez).premios;
    await assertFails(updateDoc(doc(como(U.juez), 'torneos', 'tf'), { premios: [...premios, { ...premios[0], puesto: 2 }] }));
    await assertSucceeds(updateDoc(doc(como(U.admin), 'torneos', 'tf'), { premios: [...premios, { ...premios[0], puesto: 2 }] }));
  });

  test('el admin bloquea y reactiva jugadores sin tocar su crédito', async () => {
    await assertSucceeds(updateDoc(doc(como(U.admin), 'jugadores', U.j2), { activo: false }));
    await assertSucceeds(updateDoc(doc(como(U.admin), 'jugadores', U.j2), { activo: true }));
    await assertFails(updateDoc(doc(como(U.admin), 'jugadores', U.j2), { activo: 'no' }));
    for (const uid of [U.mozo, U.juez, U.j2]) {
      await assertFails(updateDoc(doc(como(uid), 'jugadores', U.j2), { activo: false }));
    }
  });

  test('acreditar: solo subir, con tope; el admin puede corregir a mano', async () => {
    await assertSucceeds(updateDoc(doc(como(U.admin), 'jugadores', U.j1), { creditoCafeteria: increment(100) }));
    await assertFails(updateDoc(doc(como(U.admin), 'jugadores', U.j1), { creditoCafeteria: increment(50000000) }));
    await assertFails(updateDoc(doc(como(U.juez), 'jugadores', U.j1), { creditoCafeteria: increment(-100) }));
    await assertFails(updateDoc(doc(como(U.juez), 'jugadores', U.j1), { creditoCafeteria: increment(1000), nombre: 'X y Z' }));
    await assertFails(updateDoc(doc(como(U.juez), 'jugadores', U.j1), { creditoCafeteria: 'mucho' }));
    await assertFails(updateDoc(doc(como(U.mozo), 'jugadores', U.j1), { creditoCafeteria: increment(500) }));
  });

  test('el mozo descuenta solo junto con la venta que aplica ese crédito', async () => {
    const db = como(U.mozo);
    const cobro = (monto: number, descuento = monto, uid: string = U.j1) => {
      const b = writeBatch(db);
      const venta = doc(collection(db, 'ventas'));
      b.set(venta, { ...ventaBase(U.mozo), subtotal: 4400, creditoAplicado: monto, creditoUid: uid, total: 4400 - monto, medioPago: monto === 4400 ? 'credito_torneo' : 'efectivo' });
      b.update(doc(db, 'jugadores', uid), { creditoCafeteria: increment(-descuento), ultimaVenta: venta.id });
      return b.commit();
    };
    // Sin venta no se toca el saldo de nadie.
    await assertFails(updateDoc(doc(db, 'jugadores', U.j1), { creditoCafeteria: increment(-2000) }));
    // La venta dice 2.000 pero se descuentan 5.000: no.
    await assertFails(cobro(2000, 5000));
    await assertSucceeds(cobro(2000));
    // Sin saldo suficiente, no.
    await assertFails(cobro(4400));
    // Una venta con crédito que no descuenta nada, tampoco.
    const b = writeBatch(db);
    b.set(doc(collection(db, 'ventas')), { ...ventaBase(U.mozo), creditoAplicado: 1000, creditoUid: U.j1, total: 3400 });
    await assertFails(b.commit());
    await assertSucceeds(updateDoc(doc(como(U.admin), 'jugadores', U.j1), { creditoCafeteria: increment(-1000) }));
  });

  test('staff pendiente o rechazado no toca crédito; solo el admin borra', async () => {
    await assertFails(updateDoc(doc(como(U.mozoPendiente), 'jugadores', U.j1), { creditoCafeteria: increment(-1000) }));
    await assertFails(updateDoc(doc(como(U.juezRechazado), 'jugadores', U.j1), { creditoCafeteria: increment(1000) }));
    await assertFails(deleteDoc(doc(como(U.mozo), 'jugadores', U.j3)));
    await assertFails(deleteDoc(doc(como(U.j3), 'jugadores', U.j3)));
    await assertSucceeds(deleteDoc(doc(como(U.admin), 'jugadores', U.j3)));
  });
});

describe('salas y mesas', () => {
  test('lee el staff aprobado; jugadores, pendientes y anónimos no', async () => {
    for (const uid of [U.admin, U.mozo, U.juez]) {
      await assertSucceeds(getDocs(collection(como(uid), 'salas')));
      await assertSucceeds(getDocs(query(collection(como(uid), 'mesas'), where('salaId', '==', 's1'))));
      await assertSucceeds(getDocs(query(collection(como(uid), 'mesas'), where('tipo', '==', 'duelo'))));
    }
    for (const db of [como(U.j1), como(U.mozoPendiente), anonimo()]) {
      await assertFails(getDocs(collection(db, 'salas')));
      await assertFails(getDoc(doc(db, 'mesas', 'm1')));
    }
  });

  test('solo el admin crea, edita y borra salas', async () => {
    const admin = como(U.admin);
    await assertSucceeds(setDoc(doc(admin, 'salas', 's2'), { nombre: 'Terraza', orden: 1, creadoEn: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(admin, 'salas', 's1'), { nombre: 'Salón principal' }));
    await assertFails(setDoc(doc(admin, 'salas', 's3'), { nombre: '', orden: 2 }));
    await assertFails(setDoc(doc(admin, 'salas', 's3'), { nombre: 'Patio', orden: 2, color: 'rojo' }));
    await assertFails(setDoc(doc(como(U.mozo), 'salas', 's3'), { nombre: 'Patio', orden: 2 }));
    await assertFails(updateDoc(doc(como(U.juez), 'salas', 's1'), { nombre: 'Mía' }));
    await assertFails(deleteDoc(doc(como(U.mozo), 'salas', 's1')));
    await assertSucceeds(deleteDoc(doc(admin, 'salas', 's1')));
  });

  test('solo el admin crea mesas válidas', async () => {
    const mesa = { numero: 3, x: 218, y: 16, salaId: 's1', tipo: 'cafe', estado: 'libre', pedido: [], creadoEn: serverTimestamp() };
    await assertSucceeds(setDoc(doc(como(U.admin), 'mesas', 'm3'), mesa));
    await assertFails(setDoc(doc(como(U.admin), 'mesas', 'm4'), { ...mesa, tipo: 'vip' }));
    await assertFails(setDoc(doc(como(U.admin), 'mesas', 'm4'), { ...mesa, estado: 'duelo_en_curso' }));
    await assertFails(setDoc(doc(como(U.admin), 'mesas', 'm4'), { ...mesa, numero: 0 }));
    await assertFails(setDoc(doc(como(U.mozo), 'mesas', 'm4'), mesa));
    await assertFails(setDoc(doc(como(U.juez), 'mesas', 'm4'), mesa));
  });

  test('el mozo solo cambia pedido y estado', async () => {
    const db = como(U.mozo);
    const item = { itemId: 'p1', nombre: 'Espresso', precio: 2200, cantidad: 1, rubro: 'Café', origen: 'productos' };
    await assertSucceeds(updateDoc(doc(db, 'mesas', 'm1'), { pedido: [item], estado: 'consumo' }));
    await assertSucceeds(updateDoc(doc(db, 'mesas', 'm1'), { pedido: [], estado: 'libre' }));
    await assertSucceeds(updateDoc(doc(db, 'mesas', 'vieja'), { pedido: [item] }));
    await assertFails(updateDoc(doc(db, 'mesas', 'm1'), { x: 40, y: 40 }));
    await assertFails(updateDoc(doc(db, 'mesas', 'm1'), { numero: 99 }));
    await assertFails(updateDoc(doc(db, 'mesas', 'm1'), { tipo: 'duelo' }));
    await assertFails(updateDoc(doc(db, 'mesas', 'm1'), { estado: 'duelo_en_curso' }));
    await assertFails(updateDoc(doc(db, 'mesas', 'm1'), { pedido: 'todo' }));
    await assertFails(updateDoc(doc(db, 'mesas', 'm1'), { pedido: Array.from({ length: 201 }, () => item) }));
    await assertFails(deleteDoc(doc(db, 'mesas', 'm1')));
  });

  test('el juez no toca mesas; el admin sí', async () => {
    await assertFails(updateDoc(doc(como(U.juez), 'mesas', 'm2'), { estado: 'consumo' }));
    await assertSucceeds(updateDoc(doc(como(U.admin), 'mesas', 'm1'), { x: 40, y: 60 }));
    await assertSucceeds(updateDoc(doc(como(U.admin), 'mesas', 'm1'), { tipo: 'duelo', numero: 7 }));
    await assertFails(updateDoc(doc(como(U.admin), 'mesas', 'm1'), { capacidad: 4 }));
    await assertSucceeds(deleteDoc(doc(como(U.admin), 'mesas', 'm1')));
  });
});

describe('productos y tcg_productos', () => {
  test('lee el staff aprobado; jugadores y anónimos no', async () => {
    for (const uid of [U.admin, U.mozo, U.juez]) {
      await assertSucceeds(getDocs(collection(como(uid), 'productos')));
      await assertSucceeds(getDocs(collection(como(uid), 'tcg_productos')));
    }
    for (const db of [como(U.j1), como(U.mozoPendiente), anonimo()]) {
      await assertFails(getDocs(collection(db, 'productos')));
      await assertFails(getDoc(doc(db, 'tcg_productos', 't1')));
    }
  });

  test('solo el admin crea productos válidos', async () => {
    const admin = como(U.admin);
    const producto = { nombre: 'Flat white', precio: 3200, rubro: 'Café', controlStock: true, stock: 38, unidad: 'u', creadoEn: serverTimestamp() };
    await assertSucceeds(setDoc(doc(admin, 'productos', 'p2'), producto));
    await assertSucceeds(setDoc(doc(admin, 'productos', 'agua'), { nombre: 'Agua', precio: 1200, rubro: 'Mesa', controlStock: false }));
    await assertSucceeds(setDoc(doc(admin, 'productos', 'p4'), { ...producto, rubro: 'Panadería' }));
    await assertFails(setDoc(doc(admin, 'productos', 'p3'), { ...producto, rubro: '' }));
    await assertFails(setDoc(doc(admin, 'productos', 'p3'), { ...producto, rubro: 'x'.repeat(31) }));
    await assertFails(setDoc(doc(admin, 'productos', 'p3'), { ...producto, precio: -10 }));
    await assertFails(setDoc(doc(admin, 'productos', 'p3'), { ...producto, unidad: 'docena' }));
    await assertFails(setDoc(doc(admin, 'productos', 'p3'), { ...producto, costo: 100 }));
    await assertFails(setDoc(doc(como(U.mozo), 'productos', 'p3'), producto));
    await assertSucceeds(setDoc(doc(admin, 'tcg_productos', 't2'), { nombre: 'Deckbox', valor: 9800, stock: 7, unidad: 'u' }));
    await assertFails(setDoc(doc(admin, 'tcg_productos', 't3'), { nombre: 'Deckbox', valor: 9800 }));
    await assertFails(setDoc(doc(como(U.juez), 'tcg_productos', 't3'), { nombre: 'Deckbox', valor: 9800, stock: 7 }));
  });

  test('mozo y juez solo bajan stock (puede quedar negativo)', async () => {
    await assertSucceeds(updateDoc(doc(como(U.mozo), 'productos', 'p1'), { stock: increment(-2) }));
    await assertSucceeds(updateDoc(doc(como(U.mozo), 'productos', 'p1'), { stock: increment(-20) }));
    await assertSucceeds(updateDoc(doc(como(U.juez), 'tcg_productos', 't1'), { stock: increment(-4) }));
    await assertSucceeds(updateDoc(doc(como(U.juez), 'productos', 'p1'), { stock: increment(-1) }));
    await assertFails(updateDoc(doc(como(U.mozo), 'productos', 'p1'), { stock: increment(5) }));
    await assertFails(updateDoc(doc(como(U.juez), 'tcg_productos', 't1'), { stock: increment(10) }));
    await assertFails(updateDoc(doc(como(U.mozo), 'productos', 'p1'), { stock: increment(0) }));
    await assertFails(updateDoc(doc(como(U.mozo), 'productos', 'p1'), { precio: 1 }));
    await assertFails(updateDoc(doc(como(U.mozo), 'productos', 'p1'), { stock: increment(-1), precio: 1 }));
    await assertFails(updateDoc(doc(como(U.mozo), 'tcg_productos', 't1'), { valor: 1 }));
    await assertFails(updateDoc(doc(como(U.mozo), 'productos', 'p1'), { stock: 'nada' }));
    await assertFails(deleteDoc(doc(como(U.mozo), 'productos', 'p1')));
    await assertFails(deleteDoc(doc(como(U.juez), 'tcg_productos', 't1')));
  });

  test('mozo y juez no vacían el depósito de un saque ni lo hunden en negativo', async () => {
    await assertFails(updateDoc(doc(como(U.mozo), 'productos', 'p1'), { stock: increment(-1001) }));
    await assertFails(updateDoc(doc(como(U.juez), 'tcg_productos', 't1'), { stock: -1000000 }));
    await sinReglas((a) => updateDoc(doc(a, 'productos', 'p1'), { stock: -995 }));
    await assertFails(updateDoc(doc(como(U.mozo), 'productos', 'p1'), { stock: increment(-10) }));
    await assertSucceeds(updateDoc(doc(como(U.mozo), 'productos', 'p1'), { stock: increment(-5) }));
    await assertSucceeds(updateDoc(doc(como(U.admin), 'productos', 'p1'), { stock: 40 }));
  });

  test('jugadores y staff pendiente no tocan stock', async () => {
    await assertFails(updateDoc(doc(como(U.j1), 'tcg_productos', 't1'), { stock: increment(-1) }));
    await assertFails(updateDoc(doc(como(U.mozoPendiente), 'productos', 'p1'), { stock: increment(-1) }));
  });

  test('el admin edita todo, suma stock y migra docs viejos', async () => {
    const admin = como(U.admin);
    await assertSucceeds(updateDoc(doc(admin, 'productos', 'p1'), { precio: 2400, stock: increment(24), alerta: 8 }));
    await assertSucceeds(updateDoc(doc(admin, 'productos', 'p1'), { activo: false }));
    await assertSucceeds(updateDoc(doc(admin, 'productos', 'viejo'), { rubro: 'Pastelería', controlStock: true, categoria: deleteField() }));
    await assertSucceeds(updateDoc(doc(admin, 'tcg_productos', 't1'), { stock: increment(12), valor: 8000 }));
    await assertSucceeds(updateDoc(doc(admin, 'productos', 'p1'), { rubro: 'Comidas' }));
    await assertFails(updateDoc(doc(admin, 'productos', 'p1'), { rubro: '' }));
    await assertFails(updateDoc(doc(admin, 'productos', 'p1'), { nombre: deleteField() }));
    await assertSucceeds(deleteDoc(doc(admin, 'productos', 'serv')));
  });
});

describe('ventas', () => {
  test('mozo y admin registran ventas válidas', async () => {
    await assertSucceeds(setDoc(doc(como(U.mozo), 'ventas', 'n1'), ventaBase(U.mozo)));
    await assertSucceeds(setDoc(doc(como(U.admin), 'ventas', 'n2'), ventaBase(U.admin)));
    const db = como(U.mozo);
    const b = writeBatch(db);
    b.set(doc(db, 'ventas', 'n3'), { ...ventaBase(U.mozo), creditoAplicado: 4400, creditoUid: U.j1, total: 0, medioPago: 'credito_torneo' });
    b.update(doc(db, 'jugadores', U.j1), { creditoCafeteria: increment(-4400), ultimaVenta: 'n3' });
    await assertSucceeds(b.commit());
  });

  test('una cuenta de $0 sin crédito se registra con un medio real', async () => {
    const gratis = { ...ventaBase(U.mozo), items: [{ itemId: 'agua', nombre: 'Agua', precio: 0, cantidad: 1, rubro: 'Mesa', origen: 'productos' }], subtotal: 0, total: 0 };
    await assertSucceeds(setDoc(doc(como(U.mozo), 'ventas', 'g1'), gratis));
    await assertFails(setDoc(doc(como(U.mozo), 'ventas', 'g2'), { ...gratis, medioPago: 'credito_torneo' }));
  });

  test('juez, jugador, pendientes y anónimos no registran ventas', async () => {
    for (const uid of [U.juez, U.j1, U.mozoPendiente, U.adminPendiente]) {
      await assertFails(setDoc(doc(como(uid), 'ventas', 'x'), ventaBase(uid)));
    }
    await assertFails(setDoc(doc(anonimo(), 'ventas', 'x'), ventaBase('nadie')));
  });

  test('la venta respeta el contrato', async () => {
    const db = como(U.mozo);
    const base = ventaBase(U.mozo);
    const r = doc(db, 'ventas', 'x');
    await assertFails(setDoc(r, { ...base, creadoPor: U.admin }));
    await assertFails(setDoc(r, { ...base, creadoEn: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(r, { ...base, total: 1 }));
    await assertFails(setDoc(r, { ...base, creditoAplicado: 500, total: 4400 }));
    await assertFails(setDoc(r, { ...base, creditoAplicado: 500, total: 3900 }));
    await assertFails(setDoc(r, { ...base, creditoAplicado: 5000, creditoUid: U.j1, total: -600 }));
    await assertFails(setDoc(r, { ...base, medioPago: 'bitcoin' }));
    await assertFails(setDoc(r, { ...base, medioPago: 'credito_torneo' }));
    const conDescuento = (venta: Record<string, unknown>, monto: number) => {
      const b = writeBatch(db);
      b.set(doc(db, 'ventas', 'cd'), venta);
      b.update(doc(db, 'jugadores', U.j1), { creditoCafeteria: increment(-monto), ultimaVenta: 'cd' });
      return b.commit();
    };
    await assertFails(conDescuento({ ...base, creditoAplicado: 1000, creditoUid: U.j1, total: 3400, medioPago: 'credito_torneo' }, 1000));
    await assertFails(conDescuento({ ...base, creditoAplicado: 4400, creditoUid: U.j1, total: 0, medioPago: 'efectivo' }, 4400));
    // Con el medio correcto, la misma venta pasa: lo que fallaba era solo el medio.
    await assertSucceeds(conDescuento({ ...base, creditoAplicado: 1000, creditoUid: U.j1, total: 3400, medioPago: 'efectivo' }, 1000));
    // Días cerrados: ni anteayer ni pasado mañana.
    await assertFails(setDoc(r, { ...base, fecha: fechaAR(-2) }));
    await assertFails(setDoc(r, { ...base, fecha: fechaAR(2) }));
    await assertFails(setDoc(r, { ...base, fecha: '24/09/2026' }));
    // Un día ya cerrado no se toca.
    await assertFails(setDoc(r, { ...base, fecha: '2020-01-01' }));
    await assertFails(setDoc(r, { ...base, hora: '9:30' }));
    await assertFails(setDoc(r, { ...base, items: [] }));
    await assertFails(setDoc(r, { ...base, items: Array.from({ length: 201 }, () => base.items[0]) }));
    await assertFails(setDoc(r, { ...base, propina: 500 }));
    const { hora: _hora, ...sinHora } = base;
    await assertFails(setDoc(r, sinHora));
  });

  test('el jugador ve las ventas en las que se usó su crédito', async () => {
    await sinReglas((a) => setDoc(doc(a, 'ventas', 'vc'), { ...ventaBase(U.mozo), creditoAplicado: 1000, creditoUid: U.j1, total: 3400, creadoEn: Timestamp.now() }));
    await assertSucceeds(getDoc(doc(como(U.j1), 'ventas', 'vc')));
    await assertSucceeds(getDocs(query(collection(como(U.j1), 'ventas'), where('creditoUid', '==', U.j1), orderBy('creadoEn', 'desc'), limit(10))));
    await assertFails(getDoc(doc(como(U.j2), 'ventas', 'vc')));
    await assertFails(getDocs(query(collection(como(U.j1), 'ventas'), where('creditoUid', '==', U.j2))));
  });

  test('solo mozo y admin leen ventas', async () => {
    await assertSucceeds(getDocs(query(collection(como(U.mozo), 'ventas'), where('fecha', '==', HOY))));
    await assertSucceeds(
      getDocs(query(collection(como(U.admin), 'ventas'), where('fecha', '>=', '2026-09-01'), where('fecha', '<=', HOY)))
    );
    await assertSucceeds(getDoc(doc(como(U.admin), 'ventas', 'v1')));
    for (const db of [como(U.juez), como(U.j1), como(U.mozoPendiente), anonimo()]) {
      await assertFails(getDoc(doc(db, 'ventas', 'v1')));
      await assertFails(getDocs(query(collection(db, 'ventas'), where('fecha', '==', HOY))));
    }
  });

  test('las ventas son inmutables, ni el admin las edita o borra', async () => {
    for (const uid of [U.mozo, U.admin]) {
      await assertFails(updateDoc(doc(como(uid), 'ventas', 'v1'), { total: 0 }));
      await assertFails(deleteDoc(doc(como(uid), 'ventas', 'v1')));
      await assertFails(setDoc(doc(como(uid), 'ventas', 'v1'), ventaBase(uid)));
    }
  });

  test('cobro completo en un batch: venta + crédito + stock + mesa', async () => {
    const db = como(U.mozo);
    const b = writeBatch(db);
    const venta = doc(collection(db, 'ventas'));
    b.set(venta, { ...ventaBase(U.mozo), creditoAplicado: 1000, creditoUid: U.j1, total: 3400 });
    b.update(doc(db, 'jugadores', U.j1), { creditoCafeteria: increment(-1000), ultimaVenta: venta.id });
    b.update(doc(db, 'productos', 'p1'), { stock: increment(-2) });
    b.update(doc(db, 'tcg_productos', 't1'), { stock: increment(-1) });
    b.update(doc(db, 'mesas', 'm1'), { pedido: [], estado: 'libre' });
    await assertSucceeds(b.commit());
  });

  test('un cobro grande (muchos productos) no pasa el límite de lecturas de las reglas', async () => {
    await sinReglas(async (a) => {
      const b = writeBatch(a);
      for (let i = 0; i < 15; i++) {
        b.set(doc(a, 'productos', `g${i}`), { nombre: `Producto ${i}`, precio: 100, rubro: 'Pastelería', controlStock: true, stock: 50 });
      }
      await b.commit();
    });
    const db = como(U.mozo);
    const b = writeBatch(db);
    b.set(doc(collection(db, 'ventas')), ventaBase(U.mozo));
    for (let i = 0; i < 15; i++) b.update(doc(db, 'productos', `g${i}`), { stock: increment(-1) });
    b.update(doc(db, 'mesas', 'm1'), { pedido: [], estado: 'libre' });
    await assertSucceeds(b.commit());
  });
});

describe('ingresos', () => {
  test('solo el admin registra ingresos válidos', async () => {
    await assertSucceeds(setDoc(doc(como(U.admin), 'ingresos', 'n1'), ingresoBase(U.admin)));
    await assertSucceeds(
      setDoc(doc(como(U.admin), 'ingresos', 'n2'), { ...ingresoBase(U.admin), productoId: 't1', coleccion: 'tcg_productos', rubro: 'TCG' })
    );
    for (const uid of [U.mozo, U.juez, U.j1, U.adminPendiente]) {
      await assertFails(setDoc(doc(como(uid), 'ingresos', 'x'), ingresoBase(uid)));
    }
  });

  test('el ingreso respeta el contrato', async () => {
    const r = doc(como(U.admin), 'ingresos', 'x');
    const base = ingresoBase(U.admin);
    await assertFails(setDoc(r, { ...base, creadoPor: U.mozo }));
    await assertFails(setDoc(r, { ...base, cantidad: 0 }));
    await assertFails(setDoc(r, { ...base, costoUnitario: -1 }));
    await assertFails(setDoc(r, { ...base, coleccion: 'ventas' }));
    await assertFails(setDoc(r, { ...base, fecha: '2026-9-24' }));
    await assertFails(setDoc(r, { ...base, fecha: fechaAR(-2) }));
    // Una hora del cliente (aunque sea de hace un minuto) no vale: tiene que ser la del servidor.
    await assertFails(setDoc(r, { ...base, creadoEn: Timestamp.fromMillis(Date.now() - 60_000) }));
    const { productoId: _p, ...sinProducto } = base;
    await assertFails(setDoc(r, sinProducto));
  });

  test('solo el admin lee ingresos y nadie los edita', async () => {
    await assertSucceeds(getDocs(collection(como(U.admin), 'ingresos')));
    await assertFails(getDocs(collection(como(U.mozo), 'ingresos')));
    await assertFails(getDoc(doc(como(U.juez), 'ingresos', 'i1')));
    await assertFails(updateDoc(doc(como(U.admin), 'ingresos', 'i1'), { cantidad: 1 }));
    await assertFails(deleteDoc(doc(como(U.admin), 'ingresos', 'i1')));
  });
});

describe('torneos', () => {
  test('lo lee cualquier usuario aprobado (jugadores incluidos)', async () => {
    for (const uid of [U.admin, U.mozo, U.juez, U.j1, U.j3]) {
      await assertSucceeds(getDoc(doc(como(uid), 'torneos', 't1')));
    }
    for (const db of [como(U.mozoPendiente), como(U.juezRechazado), anonimo()]) {
      await assertFails(getDoc(doc(db, 'torneos', 't1')));
    }
  });

  test('las consultas de la app están permitidas', async () => {
    const db = como(U.j1);
    await assertSucceeds(getDocs(query(collection(db, 'torneos'), orderBy('creadoEn', 'desc'), limit(1))));
    await assertSucceeds(
      getDocs(query(collection(db, 'torneos'), where('jugadoresUids', 'array-contains', U.j1), orderBy('creadoEn', 'desc')))
    );
    await assertSucceeds(
      getDocs(query(collection(db, 'torneos'), where('estado', '==', 'finalizado'), orderBy('fecha', 'asc')))
    );
    await assertFails(getDocs(query(collection(como(U.mozoPendiente), 'torneos'), orderBy('creadoEn', 'desc'), limit(1))));
  });

  test('juez y admin crean torneos válidos', async () => {
    await assertSucceeds(crearTorneo(como(U.juez), 'n1', torneoBase(U.juez)));
    await liberarCandado();
    await assertSucceeds(crearTorneo(como(U.admin), 'n2', torneoBase(U.admin)));
    await liberarCandado();
    // Los juegos los define el local en Ajustes.
    await assertSucceeds(crearTorneo(como(U.juez), 'n3', { ...torneoBase(U.juez), juego: 'Lorcana' }));
    await liberarCandado();
    for (const uid of [U.mozo, U.j1, U.juezRechazado]) {
      await assertFails(crearTorneo(como(uid), 'x', torneoBase(uid)));
    }
  });

  test('el alta de torneo valida el contrato', async () => {
    // Cada caso toma bien el candado: lo único que falla es el campo que se prueba.
    const r = { crear: (datos: Record<string, unknown>) => crearTorneo(como(U.juez), 'x', datos) };
    const setDoc = (_r: unknown, datos: Record<string, unknown>) => r.crear(datos);
    const base = torneoBase(U.juez);
    await assertSucceeds(r.crear(base));
    await liberarCandado();
    await sinReglas((a) => deleteDoc(doc(a, 'torneos', 'x')));
    await assertFails(setDoc(r, { ...base, estado: 'finalizado' }));
    await assertFails(setDoc(r, { ...base, rondaActual: 2 }));
    await assertFails(setDoc(r, { ...base, creadoPor: U.admin }));
    await assertFails(setDoc(r, { ...base, creadoEn: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(r, { ...base, jugadoresUids: [U.j1] }));
    await assertFails(setDoc(r, { ...base, formatoId: 'round_robin' }));
    await assertFails(setDoc(r, { ...base, juego: '' }));
    await assertFails(setDoc(r, { ...base, juego: 'x'.repeat(41) }));
    await assertFails(setDoc(r, { ...base, fecha: '2026-01-01' }));
    await assertFails(
      setDoc(r, { ...base, posiciones: [{ uid: U.juez, nombre: 'Juez', puesto: 1, puntos: 99, victorias: 9, derrotas: 0 }] })
    );
    await assertFails(setDoc(r, { ...base, finalizadoEn: serverTimestamp() }));
    await assertFails(setDoc(r, { ...base, minutosPorRonda: 500 }));
    await assertFails(setDoc(r, { ...base, rondas: [] }));
    await assertFails(setDoc(r, { ...base, fecha: 'hoy' }));
    await assertFails(setDoc(r, { ...base, pozoSecreto: 1 }));
    const { premios: _premios, ...sinPremios } = base;
    await assertFails(setDoc(r, sinPremios));
  });

  test('el juez corre la ronda: timer, resultados, siguiente ronda', async () => {
    const db = como(U.juez);
    const t = doc(db, 'torneos', 't1');
    await assertSucceeds(updateDoc(t, { rondaPausada: true, rondaRestanteMs: 600000, rondaFinEn: null }));
    await assertSucceeds(updateDoc(t, { rondaPausada: false, rondaRestanteMs: null, rondaFinEn: Date.now() + 600000 }));
    const base = torneoBase(U.juez);
    const rondas = [{ ...base.rondas[0], partidas: [{ ...base.rondas[0].partidas[0], resultado: '2-1' }] }];
    await assertSucceeds(updateDoc(t, { rondas }));
    await assertSucceeds(updateDoc(t, { rondas: [...rondas, { numero: 2, fase: 'suizo', partidas: [] }], rondaActual: 2 }));
    await assertSucceeds(
      updateDoc(t, { jugadores: [...base.jugadores, jugador(U.j3)], jugadoresUids: [U.j1, U.j2, U.j3] })
    );
  });

  test('la edición del torneo mantiene los invariantes', async () => {
    const t = doc(como(U.juez), 'torneos', 't1');
    await assertFails(updateDoc(t, { rondaActual: 0 }));
    await assertFails(updateDoc(t, { rondaActual: 1.5 }));
    await assertFails(updateDoc(t, { estado: 'cancelado' }));
    await assertFails(updateDoc(t, { jugadoresUids: 'todos' }));
    await assertFails(updateDoc(t, { jugadoresUids: [U.j1, U.j2, U.j3] }));
    await assertFails(updateDoc(t, { creadoPor: U.admin }));
    await assertFails(updateDoc(t, { creadoEn: serverTimestamp() }));
    await assertFails(updateDoc(t, { ganador: U.j1 }));
    await assertFails(updateDoc(t, { nombre: deleteField() }));
  });

  test('mozo, jugador y pendientes no editan torneos', async () => {
    for (const uid of [U.mozo, U.j1, U.j2, U.juezRechazado]) {
      await assertFails(updateDoc(doc(como(uid), 'torneos', 't1'), { rondaPausada: true }));
    }
  });

  test('el juez cierra el torneo y después solo marca premios', async () => {
    const db = como(U.juez);
    const base = torneoBase(U.juez);
    const premios = [{ ...base.premios[0], jugadorUid: U.j1 }];
    await assertSucceeds(
      updateDoc(doc(db, 'torneos', 't1'), {
        estado: 'finalizado',
        posiciones: [{ uid: U.j1, nombre: 'Usuario jugador1', puesto: 1, puntos: 3, victorias: 1, derrotas: 0 }],
        finalizadoEn: serverTimestamp(),
        premios,
        rondaFinEn: null,
      })
    );
    await assertSucceeds(updateDoc(doc(db, 'torneos', 't1'), { premios: [{ ...premios[0], entregado: true }] }));
    await assertFails(updateDoc(doc(db, 'torneos', 't1'), { estado: 'en_curso' }));
    await assertFails(updateDoc(doc(db, 'torneos', 'tf'), { posiciones: [] }));
    await assertSucceeds(updateDoc(doc(como(U.admin), 'torneos', 'tf'), { posiciones: [] }));
  });

  test('entrega de premio en batch: stock TCG + crédito + premios', async () => {
    const db = como(U.juez);
    const base = torneoBase(U.juez);
    const b = writeBatch(db);
    b.update(doc(db, 'tcg_productos', 't1'), { stock: increment(-4) });
    b.update(doc(db, 'jugadores', U.j1), { creditoCafeteria: increment(3000), ultimoPremio: { torneoId: 'tf', puesto: 1 } });
    b.update(doc(db, 'torneos', 'tf'), { premios: [{ ...base.premios[0], jugadorUid: U.j1, entregado: true }] });
    b.set(doc(db, 'torneos', 'tf', 'entregas', '1'), { puesto: 1, jugadorUid: U.j1, creditoCafeteria: 3000, cantidadProducto: 4, entregadoPor: U.juez, entregadoEn: serverTimestamp() });
    await assertSucceeds(b.commit());
  });

  test('solo el admin borra torneos', async () => {
    await assertFails(deleteDoc(doc(como(U.juez), 'torneos', 't1')));
    await assertFails(deleteDoc(doc(como(U.j1), 'torneos', 't1')));
    await assertSucceeds(deleteDoc(doc(como(U.admin), 'torneos', 't1')));
  });
});

describe('candado de torneo en curso', () => {
  test('sin tomar el candado no se crea un torneo', async () => {
    await assertFails(setDoc(doc(como(U.juez), 'torneos', 'solo'), torneoBase(U.juez)));
  });

  test('con otro torneo en curso, el juez no crea uno nuevo (el admin puede destrabar)', async () => {
    await sinReglas((a) => setDoc(doc(a, 'bloqueos', 'torneo'), { torneoId: 't1', actualizadoEn: Timestamp.now() }));
    await assertFails(crearTorneo(como(U.juez), 'n9', torneoBase(U.juez)));
    await assertSucceeds(crearTorneo(como(U.admin), 'n9', torneoBase(U.admin)));
  });

  test('el candado se libera solo al cerrar el torneo que lo tiene', async () => {
    await sinReglas((a) => setDoc(doc(a, 'bloqueos', 'torneo'), { torneoId: 't1', actualizadoEn: Timestamp.now() }));
    const db = como(U.juez);
    await assertFails(setDoc(doc(db, 'bloqueos', 'torneo'), { torneoId: null, actualizadoEn: serverTimestamp() }));
    const b = writeBatch(db);
    b.update(doc(db, 'torneos', 't1'), { estado: 'finalizado', finalizadoEn: serverTimestamp(), rondaFinEn: null });
    b.set(doc(db, 'bloqueos', 'torneo'), { torneoId: null, actualizadoEn: serverTimestamp() });
    await assertSucceeds(b.commit());
  });

  test('no acepta ids con barra (romperían la creación de torneos para todos)', async () => {
    await assertFails(setDoc(doc(como(U.juez), 'bloqueos', 'torneo'), { torneoId: 'a/b', actualizadoEn: serverTimestamp() }));
  });

  test('juez y admin lo toman y lo liberan con la hora del servidor', async () => {
    const candado = (uid: string) => doc(como(uid), 'bloqueos', 'torneo');
    await assertSucceeds(setDoc(candado(U.juez), { torneoId: 't1', actualizadoEn: serverTimestamp() }));
    await assertSucceeds(getDoc(candado(U.admin)));
    await assertSucceeds(setDoc(candado(U.admin), { torneoId: null, actualizadoEn: serverTimestamp() }));
    await assertFails(setDoc(candado(U.juez), { torneoId: 't1', actualizadoEn: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(candado(U.juez), { torneoId: 't1', actualizadoEn: serverTimestamp(), extra: 1 }));
    for (const uid of [U.mozo, U.j1, U.juezRechazado]) {
      await assertFails(setDoc(candado(uid), { torneoId: null, actualizadoEn: serverTimestamp() }));
      await assertFails(getDoc(candado(uid)));
    }
  });
});

describe('relojes', () => {
  test('cada uno escribe su propio reloj, solo con la hora del servidor', async () => {
    await assertSucceeds(setDoc(doc(como(U.j1), 'relojes', U.j1), { t: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(como(U.j1), 'relojes', U.j1)));
    await assertFails(setDoc(doc(como(U.j1), 'relojes', U.j1), { t: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(doc(como(U.j1), 'relojes', U.j1), { t: serverTimestamp(), otro: 1 }));
    await assertFails(setDoc(doc(como(U.j1), 'relojes', U.j2), { t: serverTimestamp() }));
    await assertFails(getDoc(doc(como(U.j2), 'relojes', U.j1)));
    await assertFails(setDoc(doc(anonimo(), 'relojes', 'x'), { t: serverTimestamp() }));
  });
});

describe('reportes de resultado', () => {
  const reporte = (uid: string, ronda = 1, mesa = 1) => doc(como(uid), 'torneos', 't1', 'reportes', `${ronda}_${mesa}_${uid}`);

  test('el jugador inscripto reporta y corrige su resultado', async () => {
    await assertSucceeds(setDoc(reporte(U.j2), reporteBase(U.j2)));
    await assertSucceeds(setDoc(reporte(U.j2), { ...reporteBase(U.j2), resultado: '2-0' }));
    await assertSucceeds(updateDoc(reporte(U.j1), { resultado: '0-2' }));
  });

  test('nadie reporta por otro jugador', async () => {
    const db = como(U.j1);
    await assertFails(setDoc(doc(db, 'torneos', 't1', 'reportes', `1_1_${U.j2}`), reporteBase(U.j2)));
    await assertFails(setDoc(doc(db, 'torneos', 't1', 'reportes', `1_1_${U.j2}`), reporteBase(U.j1)));
    await assertFails(setDoc(doc(db, 'torneos', 't1', 'reportes', `1_1_${U.j1}`), reporteBase(U.j2)));
    await assertFails(setDoc(doc(db, 'torneos', 't1', 'reportes', 'cualquiera'), reporteBase(U.j1)));
    await assertFails(setDoc(doc(db, 'torneos', 't1', 'reportes', `1_2_${U.j1}`), reporteBase(U.j1)));
  });

  test('solo inscriptos, en la ronda actual y con el torneo en curso', async () => {
    await assertFails(setDoc(reporte(U.j3), reporteBase(U.j3)));
    await assertFails(setDoc(reporte(U.juez), reporteBase(U.juez)));
    // Torneo jugando la ronda 2: la 1 ya no se reporta, la 2 sí.
    await assertFails(setDoc(doc(como(U.j1), 'torneos', 't2r', 'reportes', `1_1_${U.j1}`), reporteBase(U.j1, 1, 1)));
    await assertSucceeds(setDoc(doc(como(U.j1), 'torneos', 't2r', 'reportes', `2_1_${U.j1}`), reporteBase(U.j1, 2, 1)));
    await assertFails(setDoc(doc(como(U.j1), 'torneos', 'tf', 'reportes', `3_1_${U.j1}`), reporteBase(U.j1, 3, 1)));
    await assertFails(setDoc(doc(como(U.j1), 'torneos', 'noexiste', 'reportes', `1_1_${U.j1}`), reporteBase(U.j1)));
    await assertFails(setDoc(doc(anonimo(), 'torneos', 't1', 'reportes', `1_1_${U.j1}`), reporteBase(U.j1)));
  });

  test('solo reporta quien está sentado en esa mesa (el bye no reporta)', async () => {
    const rep3 = (uid: string, mesa: number) => doc(como(uid), 'torneos', 't3', 'reportes', `1_${mesa}_${uid}`);
    await assertSucceeds(setDoc(rep3(U.j1, 1), reporteBase(U.j1, 1, 1)));
    await assertFails(setDoc(rep3(U.j3, 1), reporteBase(U.j3, 1, 1)));
    await assertFails(setDoc(rep3(U.j3, 2), reporteBase(U.j3, 1, 2)));
    await assertFails(setDoc(rep3(U.j1, 7), reporteBase(U.j1, 1, 7)));
  });

  test('valida el contenido del reporte', async () => {
    await assertFails(setDoc(reporte(U.j2), { ...reporteBase(U.j2), resultado: '1-1' }));
    await assertFails(setDoc(reporte(U.j2), { ...reporteBase(U.j2), creadoEn: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(reporte(U.j2), { ...reporteBase(U.j2), comentario: 'gané' }));
    await assertFails(setDoc(doc(como(U.j2), 'torneos', 't1', 'reportes', `1.5_1_${U.j2}`), reporteBase(U.j2, 1.5, 1)));
  });

  test('respeta el ajuste reporteJugador', async () => {
    await sinReglas((a) => setDoc(doc(a, 'config', 'publico'), { reporteJugador: false }, { merge: true }));
    await assertFails(setDoc(reporte(U.j2), reporteBase(U.j2)));
    await sinReglas((a) => deleteDoc(doc(a, 'config', 'publico')));
    await assertSucceeds(setDoc(reporte(U.j2), reporteBase(U.j2)));
  });

  test('lectura: aprobados sí, pendientes y anónimos no', async () => {
    for (const uid of [U.j1, U.j3, U.juez, U.mozo]) {
      await assertSucceeds(getDocs(query(collection(como(uid), 'torneos', 't1', 'reportes'), where('ronda', '==', 1))));
    }
    await assertFails(getDocs(collection(como(U.mozoPendiente), 'torneos', 't1', 'reportes')));
    await assertFails(getDocs(collection(anonimo(), 'torneos', 't1', 'reportes')));
  });

  test('borran juez y admin; el jugador no', async () => {
    await assertFails(deleteDoc(reporte(U.j1)));
    await assertFails(deleteDoc(doc(como(U.mozo), 'torneos', 't1', 'reportes', `1_1_${U.j1}`)));
    await assertSucceeds(deleteDoc(doc(como(U.juez), 'torneos', 't1', 'reportes', `1_1_${U.j1}`)));
  });
});

describe('colecciones heredadas y rutas desconocidas', () => {
  test('todo lo que no está en la matriz queda denegado', async () => {
    const admin = como(U.admin);
    await assertFails(getDoc(doc(admin, 'tcg_juegos', 'x')));
    await assertFails(setDoc(doc(admin, 'tcg_juegos', 'y'), { nombre: 'Magic' }));
    await assertFails(getDocs(collection(admin, 'pedidos')));
    await assertFails(setDoc(doc(admin, 'cualquier', 'cosa'), { a: 1 }));
    await assertFails(setDoc(doc(admin, 'users', U.j1, 'privado', 'x'), { a: 1 }));
  });
});

describe('storage: logos', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  beforeEach(async () => {
    await testEnv.clearStorage();
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(almacenamiento(c), 'logos/actual.png'), png, { contentType: 'image/png' });
      await uploadBytes(ref(almacenamiento(c), 'privado/secreto.png'), png, { contentType: 'image/png' });
    });
  });

  test('cualquiera lee los logos', async () => {
    await assertSucceeds(getMetadata(ref(almacenamiento(testEnv.unauthenticatedContext()), 'logos/actual.png')));
  });

  test('solo el admin aprobado sube imágenes de menos de 2 MB', async () => {
    await assertSucceeds(uploadBytes(ref(almacenamiento(ctx(U.admin)), 'logos/nuevo.png'), png, { contentType: 'image/png' }));
    await assertSucceeds(uploadBytes(ref(almacenamiento(ctx(U.admin)), 'logos/nuevo.jpg'), png, { contentType: 'image/jpeg' }));
    await assertFails(
      uploadBytes(ref(almacenamiento(ctx(U.admin)), 'logos/grande.png'), new Uint8Array(2 * 1024 * 1024), { contentType: 'image/png' })
    );
    await assertFails(uploadBytes(ref(almacenamiento(ctx(U.admin)), 'logos/script.js'), png, { contentType: 'text/javascript' }));
    await assertFails(uploadBytes(ref(almacenamiento(ctx(U.admin)), 'logos/vector.svg'), png, { contentType: 'image/svg+xml' }));
    for (const uid of [U.mozo, U.juez, U.j1, U.adminPendiente]) {
      await assertFails(uploadBytes(ref(almacenamiento(ctx(uid)), 'logos/nuevo.png'), png, { contentType: 'image/png' }));
    }
    await assertFails(
      uploadBytes(ref(almacenamiento(testEnv.unauthenticatedContext()), 'logos/nuevo.png'), png, { contentType: 'image/png' })
    );
  });

  test('cada uno sube su foto de perfil; la ve cualquiera con sesión', async () => {
    await assertSucceeds(uploadBytes(ref(almacenamiento(ctx(U.j1)), `avatares/${U.j1}/foto-1.jpg`), png, { contentType: 'image/jpeg' }));
    await assertSucceeds(uploadBytes(ref(almacenamiento(ctx(U.mozoPendiente)), `avatares/${U.mozoPendiente}/foto-1.jpg`), png, { contentType: 'image/jpeg' }));
    await assertSucceeds(getMetadata(ref(almacenamiento(ctx(U.j2)), `avatares/${U.j1}/foto-1.jpg`)));
    await assertFails(getMetadata(ref(almacenamiento(testEnv.unauthenticatedContext()), `avatares/${U.j1}/foto-1.jpg`)));
    await assertFails(uploadBytes(ref(almacenamiento(ctx(U.j2)), `avatares/${U.j1}/foto-2.jpg`), png, { contentType: 'image/jpeg' }));
    await assertFails(
      uploadBytes(ref(almacenamiento(ctx(U.j1)), `avatares/${U.j1}/grande.jpg`), new Uint8Array(2 * 1024 * 1024), { contentType: 'image/jpeg' })
    );
    await assertFails(uploadBytes(ref(almacenamiento(ctx(U.j1)), `avatares/${U.j1}/script.js`), png, { contentType: 'text/javascript' }));
  });

  test('fuera de logos/ y avatares/ no se lee ni se escribe', async () => {
    await assertFails(getMetadata(ref(almacenamiento(ctx(U.admin)), 'privado/secreto.png')));
    await assertFails(uploadBytes(ref(almacenamiento(ctx(U.admin)), 'productos/foto.png'), png, { contentType: 'image/png' }));
  });
});
