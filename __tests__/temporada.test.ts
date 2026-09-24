import {
  calcularTablaTemporada,
  estadoReloj,
  fechasDeTemporada,
  historialDeJugador,
  miPartidaActual,
  numeroDeMesa,
  posicionesValidas,
  resultadoParaJugador,
  textoPremio,
} from '../lib/temporada';
import { normalizarTorneo, type Posicion, type Torneo } from '../lib/torneo';
import { esFaltaDeIndice } from '../lib/errores';

function pos(uid: string, nombre: string, puesto: number, puntos: number, victorias: number, derrotas: number): Posicion {
  return { uid, nombre, puesto, puntos, victorias, derrotas };
}

const ana = { uid: 'ana', nombre: 'Ana', pagado: true };
const beto = { uid: 'beto', nombre: 'Beto', pagado: true };
const caro = { uid: 'caro', nombre: 'Caro', pagado: true };

function torneoBase(extra: Partial<Torneo> = {}): Torneo {
  return normalizarTorneo('t1', {
    nombre: 'Copa',
    juego: 'Pokémon TCG',
    formatoId: 'suizo',
    estado: 'en_curso',
    rondaActual: 1,
    jugadores: [ana, beto, caro],
    jugadoresUids: ['ana', 'beto', 'caro'],
    rondas: [],
    premios: [],
    fecha: '2026-08-10',
    minutosPorRonda: 50,
    minutosExtra: 3,
    ...extra,
  });
}

describe('calcularTablaTemporada', () => {
  it('suma puntos, récord y torneos entre fechas', () => {
    const filas = calcularTablaTemporada(
      [
        { fecha: '2026-08-01', posiciones: [pos('ana', 'Ana', 1, 9, 3, 0), pos('beto', 'Beto', 2, 6, 2, 1)] },
        { fecha: '2026-08-08', posiciones: [pos('beto', 'Beto', 1, 9, 3, 0), pos('ana', 'Ana', 3, 3, 1, 2)] },
      ],
      null
    );
    expect(filas).toEqual([
      { uid: 'beto', nombre: 'Beto', puntos: 15, victorias: 5, derrotas: 1, torneos: 2, mejorPuesto: 1, posicion: 1 },
      { uid: 'ana', nombre: 'Ana', puntos: 12, victorias: 4, derrotas: 2, torneos: 2, mejorPuesto: 1, posicion: 2 },
    ]);
  });

  it('con inicio de temporada ignora los torneos anteriores', () => {
    const torneos = [
      { fecha: '2026-06-30', posiciones: [pos('ana', 'Ana', 1, 9, 3, 0)] },
      { fecha: '2026-07-01', posiciones: [pos('beto', 'Beto', 1, 6, 2, 0)] },
      { fecha: '', posiciones: [pos('caro', 'Caro', 1, 30, 10, 0)] },
    ];
    const filas = calcularTablaTemporada(torneos, '2026-07-01');
    expect(filas.map((f) => f.uid)).toEqual(['beto']);
    expect(fechasDeTemporada(torneos, '2026-07-01')).toBe(1);
    expect(calcularTablaTemporada(torneos, null).map((f) => f.uid)).toEqual(['caro', 'ana', 'beto']);
  });

  it('desempata por victorias y después por nombre; los empates completos comparten puesto', () => {
    const filas = calcularTablaTemporada(
      [
        {
          fecha: '2026-08-01',
          posiciones: [
            pos('zoe', 'Zoe', 1, 6, 2, 0),
            pos('ana', 'Ana', 2, 6, 2, 1),
            pos('beto', 'Beto', 3, 6, 1, 1),
            pos('dani', 'Dani', 4, 3, 1, 2),
          ],
        },
      ],
      null
    );
    expect(filas.map((f) => [f.nombre, f.posicion])).toEqual([
      ['Ana', 1],
      ['Zoe', 1],
      ['Beto', 3],
      ['Dani', 4],
    ]);
  });

  it('tolera torneos sin posiciones o con datos rotos', () => {
    const filas = calcularTablaTemporada(
      [
        { fecha: '2026-08-01', posiciones: undefined },
        { fecha: '2026-08-02', posiciones: 'nada' as unknown as Posicion[] },
        {
          fecha: '2026-08-03',
          posiciones: [
            { uid: '', nombre: 'Sin uid', puesto: 1, puntos: 9, victorias: 3, derrotas: 0 },
            { uid: 'ana', nombre: '  ', puesto: 0, puntos: Number.NaN, victorias: 1, derrotas: 0 },
          ] as Posicion[],
        },
      ],
      null
    );
    expect(filas).toEqual([
      { uid: 'ana', nombre: 'Jugador', puntos: 0, victorias: 1, derrotas: 0, torneos: 1, mejorPuesto: null, posicion: 1 },
    ]);
    expect(fechasDeTemporada([{ fecha: '2026-08-01', posiciones: [] }], null)).toBe(0);
  });

  it('usa el nombre más reciente del jugador', () => {
    const filas = calcularTablaTemporada(
      [
        { fecha: '2026-08-08', posiciones: [pos('ana', 'Ana Paula', 1, 3, 1, 0)] },
        { fecha: '2026-08-01', posiciones: [pos('ana', 'Ana', 2, 3, 1, 1)] },
      ],
      null
    );
    expect(filas[0].nombre).toBe('Ana Paula');
    expect(filas[0].mejorPuesto).toBe(1);
  });

  it('no cuenta los torneos casuales, que no tienen puntaje', () => {
    const torneos = [
      { fecha: '2026-08-01', formatoId: 'casual' as const, posiciones: [pos('ana', 'Ana', 1, 0, 3, 0)] },
      { fecha: '2026-08-02', formatoId: 'suizo' as const, posiciones: [pos('beto', 'Beto', 1, 9, 3, 0)] },
    ];
    expect(calcularTablaTemporada(torneos, null).map((f) => f.uid)).toEqual(['beto']);
    expect(fechasDeTemporada(torneos, null)).toBe(1);
  });
});

describe('posicionesValidas', () => {
  it('descarta repetidos dentro de un mismo torneo', () => {
    expect(posicionesValidas([pos('ana', 'Ana', 1, 9, 3, 0), pos('ana', 'Ana', 2, 6, 2, 1)])).toHaveLength(1);
  });
});

describe('historialDeJugador', () => {
  it('usa las posiciones del torneo cerrado y el récord en vivo del que sigue', () => {
    const cerrado = torneoBase({
      estado: 'finalizado',
      posiciones: [pos('ana', 'Ana', 2, 6, 2, 1)],
      premios: [
        { puesto: 2, jugadorUid: 'ana', productoId: 'sobre', cantidadProducto: 3, creditoCafeteria: 4000, entregado: true },
        { puesto: 1, jugadorUid: 'beto', productoId: 'sobre', cantidadProducto: 4, creditoCafeteria: 8000, entregado: true },
      ],
    });
    const enCurso = torneoBase({
      rondas: [
        {
          numero: 1,
          partidas: [
            { mesa: 1, jugador1: beto, jugador2: ana, resultado: '0-2' },
            { mesa: 2, jugador1: caro, jugador2: null, resultado: '2-0' },
          ],
        },
      ],
    });
    const { filas, resumen } = historialDeJugador([{ ...enCurso, id: 't2' }, cerrado], 'ana');
    expect(filas[0]).toMatchObject({ id: 't2', enCurso: true, puesto: null, victorias: 1, derrotas: 0, premio: null });
    expect(filas[1]).toMatchObject({ enCurso: false, puesto: 2, victorias: 2, derrotas: 1, premio: { cantidadProducto: 3, credito: 4000 } });
    expect(resumen).toEqual({ ganados: 3, perdidos: 1, torneos: 2 });
  });
});

describe('textoPremio', () => {
  it('arma el texto del premio', () => {
    expect(textoPremio({ cantidadProducto: 3, productoNombre: null, credito: 4000 })).toBe('3 sobres + $4.000');
    expect(textoPremio({ cantidadProducto: 1, productoNombre: null, credito: 0 })).toBe('1 sobre');
    expect(textoPremio({ cantidadProducto: 0, productoNombre: null, credito: 8000 })).toBe('$8.000');
    expect(textoPremio(null)).toBe('—');
  });

  it('usa el nombre del producto cuando se guardó en el premio', () => {
    expect(textoPremio({ cantidadProducto: 1, productoNombre: 'Playmat oficial', credito: 0 })).toBe('1 × Playmat oficial');
    expect(textoPremio({ cantidadProducto: 4, productoNombre: 'Sobre Surging Sparks', credito: 8500 })).toBe('4 × Sobre Surging Sparks + $8.500');
  });
});

describe('Mi duelo', () => {
  const torneo = torneoBase({
    rondaActual: 2,
    rondas: [
      { numero: 1, partidas: [{ mesa: 1, jugador1: ana, jugador2: beto, resultado: '2-1' }] },
      {
        numero: 2,
        partidas: [
          { mesa: 1, jugador1: beto, jugador2: ana, resultado: null, mesaSalonNumero: 4 },
          { mesa: 2, jugador1: caro, jugador2: null, resultado: '2-0' },
        ],
      },
    ],
  });

  it('encuentra mi partida de la ronda actual y mi rival', () => {
    const mia = miPartidaActual(torneo, 'ana');
    expect(mia?.soyJugador1).toBe(false);
    expect(mia?.rival?.uid).toBe('beto');
    expect(mia && numeroDeMesa(mia.partida)).toBe(4);
  });

  it('marca el bye y devuelve null si no juego la ronda', () => {
    expect(miPartidaActual(torneo, 'caro')?.rival).toBeNull();
    expect(miPartidaActual(torneo, 'nadie')).toBeNull();
  });

  it('normaliza el resultado a la perspectiva del jugador1 y vuelve', () => {
    expect(resultadoParaJugador('2-1', true)).toBe('2-1');
    expect(resultadoParaJugador('2-1', false)).toBe('1-2');
    expect(resultadoParaJugador(resultadoParaJugador('0-2', false), false)).toBe('0-2');
  });

});

describe('estadoReloj', () => {
  const base = { minutosPorRonda: 50, rondaPausada: false, rondaRestanteMs: null, rondaFinEn: null };

  it('sin arrancar muestra la duración de la ronda', () => {
    expect(estadoReloj(base, 0)).toEqual({ fase: 'sin_iniciar', segundos: 3000, bajo: false });
  });

  it('corriendo, bajo 5 minutos y tiempo extra', () => {
    expect(estadoReloj({ ...base, rondaFinEn: 600_000 }, 0)).toEqual({ fase: 'corriendo', segundos: 600, bajo: false });
    expect(estadoReloj({ ...base, rondaFinEn: 299_000 }, 0)).toEqual({ fase: 'corriendo', segundos: 299, bajo: true });
    expect(estadoReloj({ ...base, rondaFinEn: 1000 }, 5000)).toEqual({ fase: 'extra', segundos: 0, bajo: false });
  });

  it('pausada usa el restante guardado', () => {
    expect(estadoReloj({ ...base, rondaPausada: true, rondaRestanteMs: 120_000 }, 0)).toEqual({ fase: 'pausada', segundos: 120, bajo: true });
  });
});

describe('esFaltaDeIndice', () => {
  it('reconoce failed-precondition con o sin prefijo', () => {
    expect(esFaltaDeIndice({ code: 'failed-precondition' })).toBe(true);
    expect(esFaltaDeIndice({ code: 'firestore/failed-precondition' })).toBe(true);
    expect(esFaltaDeIndice({ code: 'permission-denied' })).toBe(false);
    expect(esFaltaDeIndice(null)).toBe(false);
  });
});
