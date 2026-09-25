import { conNombresUnicos, etiquetaMesa, normalizarTorneo, pozoCobrado, pozoDe, premioPorEntregar, premiosPorEntregar, type PuestoPremio } from '../lib/torneo';
import { torneosDeTemporada } from '../lib/temporada';
import { estimarDesfase } from '../lib/reloj';
import { CONFIG_DEFAULT, JUEGOS_POR_DEFECTO, MEDIOS_COBRO, normalizarConfig } from '../lib/config';

// Pruebas de QA de las piezas que comparten varias pantallas: una sola definición para todas.

const jugador = { uid: 'a', nombre: 'Ana', pagado: true };

function premio(parcial: Partial<PuestoPremio>): PuestoPremio {
  return { puesto: 1, jugadorUid: 'a', productoId: 'sobre', cantidadProducto: 2, creditoCafeteria: 0, entregado: false, ...parcial };
}

describe('etiquetaMesa', () => {
  it('manda el número físico del Salón', () => {
    expect(etiquetaMesa({ mesa: 1, mesaSalonNumero: 4, jugador2: jugador })).toEqual({
      titulo: 'Mesa 04',
      corta: '04',
      larga: 'Mesa 04',
      enSalon: true,
    });
  });

  it('sin mesa del Salón no inventa un número que puede ser de una mesa de café', () => {
    const e = etiquetaMesa({ mesa: 5, mesaSalonNumero: null, jugador2: jugador });
    expect(e.titulo).toBe('Partida 5');
    expect(e.larga).toBe('Partida 5, sin mesa asignada');
    expect(e.enSalon).toBe(false);
  });

  it('el bye se dice bye', () => {
    expect(etiquetaMesa({ mesa: 9, mesaSalonNumero: null, jugador2: null }).larga).toBe('Bye esta ronda');
  });
});

describe('premios por entregar', () => {
  it('hace falta ganador, algo para dar y que no se haya entregado', () => {
    expect(premioPorEntregar(premio({}))).toBe(true);
    expect(premioPorEntregar(premio({ entregado: true }))).toBe(false);
    expect(premioPorEntregar(premio({ jugadorUid: null }))).toBe(false);
    expect(premioPorEntregar(premio({ productoId: null, cantidadProducto: 0 }))).toBe(false);
    expect(premioPorEntregar(premio({ productoId: null, cantidadProducto: 0, creditoCafeteria: 3000 }))).toBe(true);
  });

  it('con el crédito de premios apagado, un puesto que solo tenía crédito no queda pendiente', () => {
    expect(premioPorEntregar(premio({ productoId: null, cantidadProducto: 0, creditoCafeteria: 3000 }), false)).toBe(false);
  });

  it('un torneo en curso todavía no tiene premios pendientes', () => {
    expect(premiosPorEntregar({ estado: 'en_curso', premios: [premio({})] })).toBe(0);
    expect(premiosPorEntregar({ estado: 'finalizado', premios: [premio({}), premio({ puesto: 2, entregado: true })] })).toBe(1);
  });
});

describe('pozo', () => {
  it('separa lo previsto de lo cobrado', () => {
    const t = { inscripcion: 6000, jugadores: [jugador, { ...jugador, uid: 'b', pagado: false }, { ...jugador, uid: 'c' }] };
    expect(pozoDe(t)).toBe(18000);
    expect(pozoCobrado(t)).toBe(12000);
  });
});

describe('temporada que arranca a mitad del día', () => {
  const inicio = '2026-09-24';
  const inicioMs = Date.UTC(2026, 8, 24, 23, 0);
  const torneos = [
    { fecha: '2026-09-24', posiciones: [], creadoEn: { toMillis: () => inicioMs - 3_600_000 } },
    { fecha: '2026-09-24', posiciones: [], creadoEn: { toMillis: () => inicioMs + 60_000 } },
    { fecha: '2026-09-25', posiciones: [] },
    { fecha: '2026-09-23', posiciones: [] },
  ];

  it('los torneos de ese día creados antes de empezarla quedan en la anterior', () => {
    expect(torneosDeTemporada(torneos, inicio, inicioMs)).toHaveLength(2);
  });

  it('sin hora de inicio (dato viejo) cuenta todo el día', () => {
    expect(torneosDeTemporada(torneos, inicio)).toHaveLength(3);
  });
});

describe('estimarDesfase', () => {
  it('toma el punto medio del viaje como la hora local de la escritura', () => {
    // El teléfono está 3 minutos atrasado: el servidor marcó 180 s más que el medio del viaje.
    expect(estimarDesfase(1_000_180_000, 1_000_000_000 - 200, 1_000_000_000 + 200)).toBe(180_000);
  });
});

describe('config: juegos y medios de pago', () => {
  it('sin datos usa los valores por defecto', () => {
    expect(CONFIG_DEFAULT.juegos).toEqual(JUEGOS_POR_DEFECTO);
    expect(normalizarConfig({}).mediosPago).toEqual(MEDIOS_COBRO);
  });

  it('limpia juegos repetidos o vacíos y respeta el orden de los medios', () => {
    const c = normalizarConfig({ juegos: ['Lorcana', ' lorcana ', '', 42, 'Digimon'], mediosPago: ['qr', 'efectivo', 'bitcoin'] });
    expect(c.juegos).toEqual(['Lorcana', 'Digimon']);
    expect(c.mediosPago).toEqual(['efectivo', 'qr']);
  });

  it('una lista vacía no deja al local sin opciones', () => {
    const c = normalizarConfig({ juegos: [], mediosPago: [] });
    expect(c.juegos).toEqual(JUEGOS_POR_DEFECTO);
    expect(c.mediosPago).toEqual(MEDIOS_COBRO);
  });
});

describe('conNombresUnicos', () => {
  const partida = (a: string, b: string) => ({ mesa: 1, jugador1: { uid: a, nombre: 'Juan Pérez', pagado: true }, jugador2: { uid: b, nombre: 'Juan Perez', pagado: true }, resultado: null });

  it('si dos inscriptos se llaman igual, los distingue en todos lados', () => {
    const t = normalizarTorneo('t', {
      estado: 'finalizado',
      jugadores: [
        { uid: 'abcd1', nombre: 'Juan Pérez' },
        { uid: 'wxyz2', nombre: 'Juan Perez' },
      ],
      rondas: [{ numero: 1, partidas: [partida('abcd1', 'wxyz2')] }],
      posiciones: [{ uid: 'wxyz2', nombre: 'Juan Perez', puesto: 1, puntos: 3, victorias: 1, derrotas: 0 }],
    });
    const u = conNombresUnicos(t);
    expect(u.jugadores.map((j) => j.nombre)).toEqual(['Juan Pérez · #ABCD', 'Juan Perez · #WXYZ']);
    expect(u.rondas[0].partidas[0].jugador2?.nombre).toBe('Juan Perez · #WXYZ');
    expect(u.posiciones?.[0].nombre).toBe('Juan Perez · #WXYZ');
  });

  it('sin repetidos devuelve el mismo torneo', () => {
    const t = normalizarTorneo('t', { jugadores: [{ uid: 'a', nombre: 'Ana' }, { uid: 'b', nombre: 'Beto' }] });
    expect(conNombresUnicos(t)).toBe(t);
  });
});
