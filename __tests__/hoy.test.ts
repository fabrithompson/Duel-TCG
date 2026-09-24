jest.mock('../config/firebase', () => ({ auth: {}, db: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));

import { armarPendientes, EntradaPendientes, normalizarCobro, normalizarTorneoHoy, TorneoHoy } from '../hooks/useHoy';
import { normalizarPerfil } from '../hooks/useUserProfile';
import type { Mesa } from '../hooks/useMesas';
import type { CatalogoItem } from '../lib/pedido';

function mesa(parcial: Partial<Mesa> & Pick<Mesa, 'id' | 'numero'>): Mesa {
  return { x: 0, y: 0, salaId: 's1', tipo: 'cafe', estado: 'libre', pedido: [], ...parcial };
}

function item(parcial: Partial<CatalogoItem> & Pick<CatalogoItem, 'id' | 'nombre'>): CatalogoItem {
  return { precio: 1000, rubro: 'Café', origen: 'productos', stock: 1, unidad: 'u', alerta: null, activo: true, ...parcial };
}

const torneoBase: TorneoHoy = {
  id: 't1',
  nombre: 'Copa de agosto',
  estado: 'en_curso',
  rondaActual: 3,
  totalRondas: 5,
  jugadores: 16,
  resultadosPendientes: 2,
  mesasEnDuelo: ['m1'],
  premiosSinEntregar: 0,
  rondaFinEn: 10_000_000,
  rondaRestanteMs: null,
  rondaPausada: false,
};

function entrada(parcial: Partial<EntradaPendientes>): EntradaPendientes {
  return { role: 'admin', mesas: [], torneo: null, stockBajo: [], staffPendiente: [], ahoraMs: 0, ...parcial };
}

describe('normalizarTorneoHoy', () => {
  it('cuenta solo las partidas de la ronda actual sin resultado (sin byes ni docs viejos resueltos)', () => {
    const t = normalizarTorneoHoy('t1', {
      nombre: 'Copa',
      estado: 'en_curso',
      rondaActual: 2,
      totalRondas: 4,
      jugadores: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }, { uid: 'd' }, { uid: 'e' }],
      rondas: [
        { numero: 1, partidas: [{ jugador1: {}, jugador2: {}, resultado: null }] },
        {
          numero: 2,
          partidas: [
            { jugador1: {}, jugador2: {}, resultado: null, mesaSalonId: 'm4' },
            { jugador1: {}, jugador2: {}, resultado: '2-1', mesaSalonId: 'm5' },
            { jugador1: {}, jugador2: null, resultado: '2-0' },
            { jugador1: 'Ana', jugador2: 'Beto', ganador: 'Ana' },
          ],
        },
      ],
      premios: [],
    });
    expect(t.resultadosPendientes).toBe(1);
    expect(t.mesasEnDuelo).toEqual(['m4']);
    expect(t.jugadores).toBe(5);
    expect(t.totalRondas).toBe(4);
  });

  it('cuenta premios asignados y sin entregar', () => {
    const t = normalizarTorneoHoy('t2', {
      estado: 'finalizado',
      premios: [
        { puesto: 1, jugadorUid: 'a', cantidadProducto: 4, creditoCafeteria: 0, entregado: false },
        { puesto: 2, jugadorUid: 'b', cantidadProducto: 0, creditoCafeteria: 5000, entregado: true },
        { puesto: 3, jugadorUid: null, cantidadProducto: 2, creditoCafeteria: 0, entregado: false },
        { puesto: 4, jugadorUid: 'd', cantidadProducto: 0, creditoCafeteria: 0, entregado: false },
      ],
    });
    expect(t.premiosSinEntregar).toBe(1);
    expect(t.nombre).toBe('Torneo');
  });

  it('no rompe con datos basura', () => {
    const t = normalizarTorneoHoy('t3', { rondas: 'x', premios: 3, jugadores: null });
    expect(t.resultadosPendientes).toBe(0);
    expect(t.premiosSinEntregar).toBe(0);
    expect(t.jugadores).toBe(0);
  });
});

describe('armarPendientes', () => {
  it('mozo: cada mesa con cuenta lleva al pedido de esa mesa y no ve cosas del torneo ni del equipo', () => {
    const p = armarPendientes(
      entrada({
        role: 'mozo',
        mesas: [
          mesa({ id: 'm1', numero: 4, estado: 'consumo', pedido: [{ itemId: 'i', nombre: 'Flat white', precio: 3200, cantidad: 2, rubro: 'Café', origen: 'productos' }] }),
          mesa({ id: 'm2', numero: 2, estado: 'libre' }),
        ],
        torneo: torneoBase,
        staffPendiente: [{ id: 'u1', role: 'mozo' }],
      })
    );
    expect(p).toHaveLength(1);
    expect(p[0].titulo).toBe('Mesa 04 con cuenta abierta');
    expect(p[0].subtitulo).toBe('$6.400 · 2 ítems');
    expect(p[0].tono).toBe('br');
    expect(p[0].destino).toEqual({ pathname: '/(tabs)/salon/pedido', params: { mesaId: 'm1' } });
  });

  it('juez: resultados sin cargar en dorado y sin mesas del café', () => {
    const p = armarPendientes(
      entrada({ role: 'juez', torneo: torneoBase, mesas: [mesa({ id: 'm1', numero: 1, estado: 'consumo' })], ahoraMs: 0 })
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ tono: 'gold', destino: '/(tabs)/torneo', titulo: '2 resultados sin cargar' });
  });

  it('se terminó el tiempo de la ronda: el pendiente pasa a urgente', () => {
    const p = armarPendientes(entrada({ role: 'juez', torneo: torneoBase, ahoraMs: 20_000_000 }));
    expect(p[0].tono).toBe('dg');
    expect(p[0].subtitulo).toContain('se terminó el tiempo');
  });

  it('ronda pausada no se considera vencida', () => {
    const p = armarPendientes(
      entrada({ role: 'juez', torneo: { ...torneoBase, rondaPausada: true, rondaRestanteMs: 0 }, ahoraMs: 20_000_000 })
    );
    expect(p[0].tono).toBe('gold');
  });

  it('admin: staff por aprobar va a Equipo con el resumen por rol, y lo urgente va primero', () => {
    const p = armarPendientes(
      entrada({
        role: 'admin',
        mesas: [mesa({ id: 'm1', numero: 8, estado: 'consumo' })],
        stockBajo: [item({ id: 'p1', nombre: 'Cheesecake', stock: 0 })],
        staffPendiente: [
          { id: 'u1', role: 'mozo' },
          { id: 'u2', role: 'juez' },
        ],
      })
    );
    expect(p.map((x) => x.tono)).toEqual(['dg', 'br', 'br']);
    expect(p[0]).toMatchObject({ titulo: 'Cheesecake: sin stock', destino: '/(tabs)/stock' });
    const staff = p.find((x) => x.id === 'staff-pendiente');
    expect(staff).toMatchObject({ subtitulo: '1 mozo y 1 juez', destino: '/(tabs)/ajustes/equipo' });
    expect(p.find((x) => x.id === 'mesa-m1')?.subtitulo).toBe('Todavía sin pedido cargado');
  });

  it('agrupa las mesas que no entran en la lista', () => {
    const mesas = Array.from({ length: 7 }, (_, i) => mesa({ id: `m${i}`, numero: i + 1, estado: 'consumo' }));
    const p = armarPendientes(entrada({ role: 'mozo', mesas }));
    expect(p.filter((x) => x.id.startsWith('mesa-'))).toHaveLength(5);
    expect(p[p.length - 1]).toMatchObject({ titulo: '2 mesas más con cuenta abierta', destino: '/(tabs)/salon' });
  });

  it('stock bajo de varios productos se resume en un solo pendiente', () => {
    const p = armarPendientes(
      entrada({
        role: 'mozo',
        stockBajo: [
          item({ id: 'a', nombre: 'Medialuna', stock: -2 }),
          item({ id: 'b', nombre: 'Brownie', stock: 1 }),
          item({ id: 'c', nombre: 'Cookie', stock: 3 }),
        ],
      })
    );
    expect(p).toHaveLength(1);
    expect(p[0].titulo).toBe('3 productos con stock bajo');
    expect(p[0].subtitulo).toBe('Medialuna, Brownie y 1 más · 1 sin stock');
  });

  it('premios sin entregar del último torneo finalizado', () => {
    const p = armarPendientes(
      entrada({ role: 'juez', torneo: { ...torneoBase, estado: 'finalizado', resultadosPendientes: 0, premiosSinEntregar: 2 } })
    );
    expect(p).toEqual([expect.objectContaining({ titulo: '2 premios sin entregar', destino: '/(tabs)/premios', tono: 'gold' })]);
  });
});

describe('normalizarCobro', () => {
  it('traduce el medio de pago y tolera campos faltantes', () => {
    expect(normalizarCobro('v1', { total: 6400, hora: '19:38', mesaNum: 4, medioPago: 'efectivo' })).toMatchObject({
      total: 6400,
      hora: '19:38',
      mesaNum: 4,
      medio: 'Efectivo',
      creadoMs: null,
    });
    expect(normalizarCobro('v2', { medioPago: 'credito_torneo' }).medio).toBe('Crédito de torneo');
    expect(normalizarCobro('v3', { total: 'mucho' })).toMatchObject({ total: 0, hora: '--:--', medio: 'Otro medio' });
  });
});

describe('normalizarPerfil', () => {
  it('sin documento o con rol desconocido no hay perfil', () => {
    expect(normalizarPerfil('u', undefined)).toBeNull();
    expect(normalizarPerfil('u', { role: 'superadmin', estadoAprobacion: 'aprobado' })).toBeNull();
  });

  it('un estado desconocido cuenta como pendiente', () => {
    expect(normalizarPerfil('u', { role: 'mozo', estadoAprobacion: 'si', nombre: ' Ana ' })).toMatchObject({
      uid: 'u',
      role: 'mozo',
      estadoAprobacion: 'pendiente',
      nombre: 'Ana',
    });
  });

  it('crédito inválido se descarta', () => {
    expect(normalizarPerfil('u', { role: 'jugador', estadoAprobacion: 'aprobado', email: 'a@b.com', creditoCafeteria: 'x' })).toMatchObject({
      nombre: 'a',
      creditoCafeteria: undefined,
    });
  });
});
