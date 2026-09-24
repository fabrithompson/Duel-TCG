import {
  FormatoId,
  JugadorTorneo,
  MesaDuelo,
  Partida,
  RESULTADOS,
  Reporte,
  Rng,
  Ronda,
  Torneo,
  aplicarReportes,
  asignarPremios,
  calcularStandings,
  crearRng,
  esUltimaRonda,
  estadoTimer,
  formatTimer,
  generarRonda,
  idReporte,
  invertirResultado,
  mesasSalonEnDuelo,
  nombreRonda,
  normalizarTorneo,
  ordenLlave,
  posicionesFinales,
  reportesDePartida,
  rondaCompleta,
  rondasSuizasDe,
  segundosRestantes,
  sugerirRondas,
  timerConExtra,
  timerNuevaRonda,
  timerPausado,
  timerReanudado,
  topCutEfectivo,
  totalRondasPara,
} from '../lib/torneo';

function jugadores(n: number): JugadorTorneo[] {
  return Array.from({ length: n }, (_, i) => ({ uid: `u${i + 1}`, nombre: `Jugador ${String(i + 1).padStart(2, '0')}`, pagado: true }));
}

type Base = Pick<Torneo, 'jugadores' | 'rondas' | 'formatoId' | 'totalRondas' | 'topCut'>;

function torneoBase(n: number, formatoId: FormatoId, totalRondas: number, topCut = 0): Base {
  return { jugadores: jugadores(n), rondas: [], formatoId, totalRondas, topCut };
}

/** Carga resultados al azar (reproducibles) en todas las partidas pendientes. */
function jugarRonda(ronda: Ronda, rng: Rng): Ronda {
  return {
    ...ronda,
    partidas: ronda.partidas.map((p) => (p.resultado ? p : { ...p, resultado: RESULTADOS[Math.floor(rng() * RESULTADOS.length)] })),
  };
}

function jugarTorneo(base: Base, semilla: number, mesas: MesaDuelo[] = []): Base {
  const rng = crearRng(semilla);
  let t = base;
  for (let n = 1; n <= base.totalRondas; n++) {
    const ronda = jugarRonda(generarRonda(t, n, mesas, rng), rng);
    t = { ...t, rondas: [...t.rondas, ronda] };
  }
  return t;
}

function cruces(rondas: readonly Ronda[]): string[] {
  return rondas.flatMap((r) =>
    r.partidas.filter((p) => p.jugador2).map((p) => [p.jugador1.uid, p.jugador2?.uid ?? ''].sort().join('|'))
  );
}

function uidsDeRonda(r: Ronda): string[] {
  return r.partidas.flatMap((p) => [p.jugador1.uid, ...(p.jugador2 ? [p.jugador2.uid] : [])]);
}

function partida(mesa: number, j1: JugadorTorneo, j2: JugadorTorneo | null, resultado: Partida['resultado']): Partida {
  return { mesa, jugador1: j1, jugador2: j2, resultado, mesaSalonId: null, mesaSalonNumero: null };
}

describe('generarRonda · suizo', () => {
  it.each([8, 7])('no repite cruces en 3 rondas con %i jugadores (varias semillas)', (n) => {
    for (let semilla = 1; semilla <= 40; semilla++) {
      const t = jugarTorneo(torneoBase(n, 'suizo', 3), semilla);
      const todos = cruces(t.rondas);
      expect(new Set(todos).size).toBe(todos.length);
      t.rondas.forEach((r) => {
        const uids = uidsDeRonda(r);
        expect(uids).toHaveLength(n);
        expect(new Set(uids).size).toBe(n);
      });
    }
  });

  it('no repite cruces en 4 rondas con 8 jugadores cuando es posible', () => {
    for (let semilla = 1; semilla <= 25; semilla++) {
      const t = jugarTorneo(torneoBase(8, 'suizo', 4), semilla);
      const todos = cruces(t.rondas);
      expect(new Set(todos).size).toBe(todos.length);
    }
  });

  it('empareja por puntos: en la ronda 2 los ganadores se cruzan entre sí', () => {
    const rng = crearRng(7);
    const base = torneoBase(8, 'suizo', 3);
    const r1 = jugarRonda(generarRonda(base, 1, [], rng), rng);
    const t = { ...base, rondas: [r1] };
    const r2 = generarRonda(t, 2, [], rng);
    const puntos = new Map(calcularStandings(t).map((s) => [s.jugador.uid, s.puntos]));
    r2.partidas.forEach((p) => {
      expect(puntos.get(p.jugador1.uid)).toBe(puntos.get(p.jugador2?.uid ?? ''));
    });
  });

  it('el bye rota: con 7 jugadores y 7 rondas nadie recibe dos', () => {
    for (let semilla = 1; semilla <= 10; semilla++) {
      const t = jugarTorneo(torneoBase(7, 'suizo', 7), semilla);
      const byes = t.rondas.flatMap((r) => r.partidas.filter((p) => !p.jugador2).map((p) => p.jugador1.uid));
      expect(byes).toHaveLength(7);
      expect(new Set(byes).size).toBe(7);
    }
  });

  it('el bye va al de menos puntos que todavía no tuvo bye y se carga como 2-0', () => {
    const [a, b, c, d, e] = jugadores(5);
    const base: Base = {
      jugadores: [a, b, c, d, e],
      formatoId: 'suizo',
      totalRondas: 3,
      topCut: 0,
      rondas: [
        {
          numero: 1,
          fase: 'suizo',
          partidas: [partida(1, a, b, '2-0'), partida(2, c, d, '2-1'), partida(3, e, null, '2-0')],
        },
      ],
    };
    const r2 = generarRonda(base, 2, [], crearRng(3));
    const bye = r2.partidas.find((p) => p.jugador2 === null);
    expect(bye).toBeDefined();
    expect(['u2', 'u4']).toContain(bye?.jugador1.uid);
    expect(bye?.resultado).toBe('2-0');
    expect(r2.partidas.filter((p) => p.jugador2).every((p) => p.resultado === null)).toBe(true);
  });

  it('si no hay forma de evitar revancha, igual empareja a todos (menor costo)', () => {
    const [a, b, c, d] = jugadores(4);
    const rondas: Ronda[] = [
      { numero: 1, fase: 'suizo', partidas: [partida(1, a, b, '2-0'), partida(2, c, d, '2-0')] },
      { numero: 2, fase: 'suizo', partidas: [partida(1, a, c, '2-0'), partida(2, b, d, '2-0')] },
      { numero: 3, fase: 'suizo', partidas: [partida(1, a, d, '2-0'), partida(2, b, c, '2-0')] },
    ];
    const r4 = generarRonda({ jugadores: [a, b, c, d], rondas, formatoId: 'suizo', totalRondas: 4, topCut: 0 }, 4, [], crearRng(1));
    expect(r4.partidas).toHaveLength(2);
    expect(new Set(uidsDeRonda(r4)).size).toBe(4);
  });

  it('es reproducible con la misma semilla', () => {
    const a = generarRonda(torneoBase(9, 'suizo', 3), 1, [], crearRng(42));
    const b = generarRonda(torneoBase(9, 'suizo', 3), 1, [], crearRng(42));
    expect(a).toEqual(b);
  });

  it('asigna mesas de duelo del Salón en orden y null si faltan', () => {
    const mesas: MesaDuelo[] = [
      { id: 'm-12', numero: 12 },
      { id: 'm-10', numero: 10 },
      { id: 'm-11', numero: 11 },
    ];
    const r = generarRonda(torneoBase(9, 'suizo', 3), 1, mesas, crearRng(5));
    const reales = r.partidas.filter((p) => p.jugador2);
    expect(reales.map((p) => p.mesa)).toEqual([1, 2, 3, 4]);
    expect(reales.map((p) => p.mesaSalonNumero)).toEqual([10, 11, 12, null]);
    expect(reales.map((p) => p.mesaSalonId)).toEqual(['m-10', 'm-11', 'm-12', null]);
    const bye = r.partidas.find((p) => !p.jugador2);
    expect(bye?.mesa).toBe(5);
    expect(bye?.mesaSalonId).toBeNull();
  });
});

describe('generarRonda · casual', () => {
  it('empareja a todos al azar con fase casual', () => {
    const r = generarRonda(torneoBase(6, 'casual', 3), 1, [], crearRng(9));
    expect(r.fase).toBe('casual');
    expect(r.partidas).toHaveLength(3);
    expect(new Set(uidsDeRonda(r)).size).toBe(6);
  });
});

describe('calcularStandings', () => {
  const [a, b, c, d] = jugadores(4);

  it('3 puntos por victoria, bye cuenta como victoria y solo suman partidas con resultado', () => {
    const t = {
      jugadores: [a, b, c],
      rondas: [
        { numero: 1, fase: 'suizo' as const, partidas: [partida(1, a, b, '2-1'), partida(2, c, null, '2-0')] },
        { numero: 2, fase: 'suizo' as const, partidas: [partida(1, a, c, null), partida(2, b, null, '2-0')] },
      ],
    };
    const s = calcularStandings(t);
    const por = new Map(s.map((x) => [x.jugador.uid, x]));
    expect(por.get('u1')).toMatchObject({ puntos: 3, victorias: 1, derrotas: 0 });
    expect(por.get('u2')).toMatchObject({ puntos: 3, victorias: 1, derrotas: 1 });
    expect(por.get('u3')).toMatchObject({ puntos: 3, victorias: 1, derrotas: 0 });
    expect(por.get('u1')?.gw).toBeCloseTo(2 / 3);
    expect(por.get('u3')?.gw).toBe(1);
    // El bye no es un rival: u3 no tiene OMW.
    expect(por.get('u3')?.omw).toBe(0);
  });

  it('desempata por OMW (con piso 0.33) antes que por GW', () => {
    const t = {
      jugadores: [a, b, c, d],
      rondas: [
        { numero: 1, fase: 'suizo' as const, partidas: [partida(1, a, b, '2-0'), partida(2, c, d, '2-0')] },
        { numero: 2, fase: 'suizo' as const, partidas: [partida(1, a, c, '2-0'), partida(2, d, b, '2-0')] },
      ],
    };
    const s = calcularStandings(t);
    expect(s.map((x) => x.jugador.uid)).toEqual(['u1', 'u3', 'u4', 'u2']);
    const c3 = s[1];
    const d4 = s[2];
    expect(c3.puntos).toBe(d4.puntos);
    expect(c3.gw).toBeCloseTo(d4.gw);
    expect(c3.omw).toBeCloseTo((0.5 + 1) / 2);
    expect(d4.omw).toBeCloseTo((0.5 + 0.33) / 2);
  });

  it('desempata por GW y después por nombre', () => {
    const t = {
      jugadores: [d, c, b, a],
      rondas: [{ numero: 1, fase: 'suizo' as const, partidas: [partida(1, a, b, '2-1'), partida(2, c, d, '2-0')] }],
    };
    const s = calcularStandings(t);
    // a y c ganaron; c 2-0 (GW 1) supera a a 2-1 (GW .67); OMW igual (rival con 0 → piso).
    expect(s.map((x) => x.jugador.uid)).toEqual(['u3', 'u1', 'u2', 'u4']);
    const empate = calcularStandings({ jugadores: [b, a], rondas: [] });
    expect(empate.map((x) => x.jugador.uid)).toEqual(['u1', 'u2']);
  });

  it('puede limitarse a las rondas suizas', () => {
    const t = {
      jugadores: [a, b],
      rondas: [
        { numero: 1, fase: 'suizo' as const, partidas: [partida(1, a, b, '2-0')] },
        { numero: 2, fase: 'eliminacion' as const, partidas: [partida(1, b, a, '2-0')] },
      ],
    };
    expect(calcularStandings(t, ['suizo'])[0].jugador.uid).toBe('u1');
    expect(calcularStandings(t).find((x) => x.jugador.uid === 'u2')?.victorias).toBe(1);
  });
});

describe('eliminación directa', () => {
  it('ordenLlave cruza 1-8, 4-5, 2-7, 3-6', () => {
    expect(ordenLlave(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(ordenLlave(4)).toEqual([1, 4, 2, 3]);
  });

  it('con 5 jugadores: byes a los 3 mejores sembrados, llave hasta la final y posiciones', () => {
    const base = torneoBase(5, 'eliminacion', totalRondasPara('eliminacion', 5, 0, 0));
    expect(base.totalRondas).toBe(3);

    const r1 = generarRonda(base, 1, [{ id: 'mx', numero: 7 }], crearRng(1));
    expect(r1.fase).toBe('eliminacion');
    expect(r1.partidas).toHaveLength(4);
    const real = r1.partidas.filter((p) => p.jugador2);
    expect(real).toHaveLength(1);
    expect([real[0].jugador1.uid, real[0].jugador2?.uid]).toEqual(['u4', 'u5']);
    expect(real[0].mesa).toBe(1);
    expect(real[0].mesaSalonId).toBe('mx');
    expect(r1.partidas.filter((p) => !p.jugador2).map((p) => p.jugador1.uid).sort()).toEqual(['u1', 'u2', 'u3']);
    expect(nombreRonda(base, r1)).toBe('Cuartos de final');

    const r1j: Ronda = { ...r1, partidas: r1.partidas.map((p) => (p.jugador2 ? { ...p, resultado: '0-2' } : p)) };
    const t1 = { ...base, rondas: [r1j] };
    const r2 = generarRonda(t1, 2, [], crearRng(1));
    expect(r2.partidas.map((p) => [p.jugador1.uid, p.jugador2?.uid])).toEqual([
      ['u1', 'u5'],
      ['u2', 'u3'],
    ]);
    expect(nombreRonda(t1, r2)).toBe('Semifinal');

    const r2j: Ronda = { ...r2, partidas: [{ ...r2.partidas[0], resultado: '2-1' }, { ...r2.partidas[1], resultado: '1-2' }] };
    const t2 = { ...t1, rondas: [r1j, r2j] };
    const r3 = generarRonda(t2, 3, [], crearRng(1));
    expect(r3.partidas.map((p) => [p.jugador1.uid, p.jugador2?.uid])).toEqual([['u1', 'u3']]);
    expect(nombreRonda(t2, r3)).toBe('Final');
    expect(esUltimaRonda({ ...t2, rondas: [r1j, r2j, r3], rondaActual: 3 })).toBe(true);

    const final: Ronda = { ...r3, partidas: [{ ...r3.partidas[0], resultado: '0-2' }] };
    const pos = posicionesFinales({ ...t2, rondas: [r1j, r2j, final] });
    expect(pos.map((p) => p.uid).slice(0, 2)).toEqual(['u3', 'u1']);
    expect(pos.map((p) => p.puesto)).toEqual([1, 2, 3, 4, 5]);
    expect(pos.slice(2, 4).map((p) => p.uid).sort()).toEqual(['u2', 'u5']);
    expect(pos[4].uid).toBe('u4');
  });

  it('no arma la siguiente ronda de llave si falta un resultado', () => {
    const base = torneoBase(4, 'eliminacion', 2);
    const r1 = generarRonda(base, 1, [], crearRng(1));
    expect(() => generarRonda({ ...base, rondas: [r1] }, 2, [], crearRng(1))).toThrow();
  });
});

describe('suizo + top cut', () => {
  it('top 4 sale de la tabla suiza y cierra con campeón, finalista y semifinalistas por tabla', () => {
    const total = totalRondasPara('suizo_top_cut', 8, 3, 4);
    expect(total).toBe(5);
    const base = torneoBase(8, 'suizo_top_cut', total, 4);
    expect(rondasSuizasDe(base)).toBe(3);

    const rng = crearRng(11);
    let t: Base = base;
    for (let n = 1; n <= 3; n++) {
      const r = jugarRonda(generarRonda(t, n, [], rng), rng);
      expect(r.fase).toBe('suizo');
      t = { ...t, rondas: [...t.rondas, r] };
    }
    const tabla = calcularStandings(t, ['suizo']).map((s) => s.jugador.uid);
    const r4 = generarRonda(t, 4, [], rng);
    expect(r4.fase).toBe('eliminacion');
    expect(nombreRonda(t, r4)).toBe('Top 4 · Semifinal');
    expect(r4.partidas.map((p) => [p.jugador1.uid, p.jugador2?.uid])).toEqual([
      [tabla[0], tabla[3]],
      [tabla[1], tabla[2]],
    ]);

    const r4j: Ronda = { ...r4, partidas: [{ ...r4.partidas[0], resultado: '0-2' }, { ...r4.partidas[1], resultado: '2-0' }] };
    t = { ...t, rondas: [...t.rondas, r4j] };
    const r5 = generarRonda(t, 5, [], rng);
    expect(r5.partidas.map((p) => [p.jugador1.uid, p.jugador2?.uid])).toEqual([[tabla[3], tabla[1]]]);
    expect(nombreRonda(t, r5)).toBe('Final');

    t = { ...t, rondas: [...t.rondas, { ...r5, partidas: [{ ...r5.partidas[0], resultado: '2-1' }] }] };
    const pos = posicionesFinales(t).map((p) => p.uid);
    expect(pos.slice(0, 4)).toEqual([tabla[3], tabla[1], tabla[0], tabla[2]]);
    expect(pos.slice(4)).toEqual(tabla.slice(4));
  });

  it('achica el corte si hay menos jugadores', () => {
    expect(topCutEfectivo(6, 8)).toBe(4);
    expect(topCutEfectivo(3, 4)).toBe(2);
    expect(topCutEfectivo(10, 0)).toBe(0);
    expect(totalRondasPara('suizo_top_cut', 6, 3, 8)).toBe(5);
  });
});

describe('formatos y rondas', () => {
  it('sugerirRondas = max(3, ceil(log2 n))', () => {
    expect(sugerirRondas(2)).toBe(3);
    expect(sugerirRondas(8)).toBe(3);
    expect(sugerirRondas(9)).toBe(4);
    expect(sugerirRondas(33)).toBe(6);
  });

  it('totalRondasPara según formato', () => {
    expect(totalRondasPara('suizo', 16, 5, 0)).toBe(5);
    expect(totalRondasPara('casual', 16, 4, 8)).toBe(4);
    expect(totalRondasPara('eliminacion', 16, 5, 0)).toBe(4);
    expect(totalRondasPara('eliminacion', 17, 5, 0)).toBe(5);
    expect(totalRondasPara('suizo_top_cut', 16, 5, 8)).toBe(8);
  });

  it('rondaCompleta y posiciones de suizo por tabla; casual no suma puntos', () => {
    const t = jugarTorneo(torneoBase(6, 'suizo', 3), 3);
    t.rondas.forEach((r) => expect(rondaCompleta(r)).toBe(true));
    const pos = posicionesFinales(t);
    expect(pos.map((p) => p.uid)).toEqual(calcularStandings(t).map((s) => s.jugador.uid));
    const casual = jugarTorneo(torneoBase(6, 'casual', 2), 3);
    expect(posicionesFinales(casual).every((p) => p.puntos === 0)).toBe(true);
  });

  it('asignarPremios respeta los ya entregados', () => {
    const pos = posicionesFinales(jugarTorneo(torneoBase(4, 'suizo', 2), 8));
    const premios = asignarPremios(
      [
        { puesto: 1, jugadorUid: null, productoId: 'p', productoOrigen: 'tcg', cantidadProducto: 2, creditoCafeteria: 0, entregado: false },
        { puesto: 2, jugadorUid: 'x', productoId: 'p', productoOrigen: 'tcg', cantidadProducto: 1, creditoCafeteria: 0, entregado: true },
        { puesto: 9, jugadorUid: null, productoId: null, productoOrigen: 'tcg', cantidadProducto: 0, creditoCafeteria: 500, entregado: false },
      ],
      pos
    );
    expect(premios.map((p) => p.jugadorUid)).toEqual([pos[0].uid, 'x', null]);
  });
});

describe('normalizarTorneo', () => {
  it('tolera un doc viejo sin formatoId, jugadoresUids, fecha ni mesas del Salón', () => {
    const t = normalizarTorneo('t1', {
      nombre: 'Copa vieja',
      juego: 'Pokémon TCG',
      formato: 'Eliminación directa',
      totalRondas: 2,
      jugadores: [
        { uid: 'a', nombre: 'Ana', pagado: true },
        { uid: 'b', nombre: 'Beto' },
        'Carla',
      ],
      estado: 'en_curso',
      rondaActual: 1,
      rondas: [{ numero: 1, partidas: [{ mesa: 1, jugador1: { uid: 'a', nombre: 'Ana' }, jugador2: { uid: 'b', nombre: 'Beto' }, resultado: '2-1' }] }],
      premios: [{ puesto: 1, jugadorUid: null, productoId: 'p1', cantidadProducto: 3, creditoCafeteria: 0, entregado: false }],
      rondaFinEn: 123,
      rondaPausada: false,
    });
    expect(t.formatoId).toBe('eliminacion');
    expect(t.jugadoresUids).toEqual(['a', 'b', 'Carla']);
    expect(t.jugadores[2]).toEqual({ uid: 'Carla', nombre: 'Carla', pagado: false });
    expect(t.fecha).toBe('');
    expect(t.rondas[0].fase).toBe('eliminacion');
    expect(t.rondas[0].partidas[0].mesaSalonId).toBeNull();
    expect(t.rondas[0].partidas[0].mesaSalonNumero).toBeNull();
    expect(t.premios[0].productoOrigen).toBe('tcg');
    expect(t.rondaRestanteMs).toBeNull();
    expect(t.topCut).toBe(0);
  });

  it('usa suizo por defecto, acepta el formatoId nuevo y descarta basura', () => {
    expect(normalizarTorneo('x', {}).formatoId).toBe('suizo');
    expect(normalizarTorneo('x', { formato: 'Suizo + top cut' }).formatoId).toBe('suizo_top_cut');
    expect(normalizarTorneo('x', { formatoId: 'casual', formato: 'Suizo' }).formatoId).toBe('casual');
    const t = normalizarTorneo('x', { jugadores: [null, 3, { nombre: '' }], rondas: 'nada', premios: [{}], estado: 'raro' });
    expect(t.jugadores).toEqual([]);
    expect(t.rondas).toEqual([]);
    expect(t.estado).toBe('en_curso');
    expect(t.premios[0]).toMatchObject({ puesto: 1, cantidadProducto: 0, entregado: false });
  });

  it('bye sin resultado queda 2-0 y "ganador" viejo se traduce', () => {
    const t = normalizarTorneo('x', {
      rondas: [
        {
          numero: 1,
          partidas: [
            { mesa: 1, jugador1: { uid: 'a', nombre: 'Ana' }, jugador2: null },
            { mesa: 2, jugador1: { uid: 'b', nombre: 'Beto' }, jugador2: { uid: 'c', nombre: 'Caro' }, ganador: 'c' },
          ],
        },
      ],
    });
    expect(t.rondas[0].partidas.map((p) => p.resultado)).toEqual(['2-0', '0-2']);
  });
});

describe('reportes', () => {
  const [a, b] = jugadores(2);
  const p = partida(3, a, b, null);
  const rep = (uid: string, resultado: Reporte['resultado'], mesa = 3): Reporte => ({ id: idReporte(2, mesa, uid), ronda: 2, mesa, uid, resultado });

  it('aplica solo si los dos reportaron lo mismo', () => {
    expect(aplicarReportes(p, [rep('u1', '2-1'), rep('u2', '2-1')])).toBe('2-1');
    expect(aplicarReportes(p, [rep('u1', '2-1'), rep('u2', '1-2')])).toBeNull();
    expect(aplicarReportes(p, [rep('u1', '2-1')])).toBeNull();
    expect(aplicarReportes(p, [rep('u1', '2-1'), rep('u2', '2-1', 4)])).toBeNull();
    expect(aplicarReportes(partida(1, a, null, '2-0'), [rep('u1', '2-0', 1)])).toBeNull();
  });

  it('reportesDePartida separa por jugador', () => {
    const r = reportesDePartida(p, [rep('u2', '0-2'), rep('zz', '2-0')]);
    expect(r.jugador1).toBeNull();
    expect(r.jugador2?.resultado).toBe('0-2');
  });

  it('idReporte e invertirResultado', () => {
    expect(idReporte(2, 5, 'abc')).toBe('2_5_abc');
    expect(invertirResultado('2-1')).toBe('1-2');
    expect(invertirResultado('0-2')).toBe('2-0');
  });
});

describe('timer', () => {
  const ahora = 1_000_000;

  it('nueva ronda, pausa, reanuda y suma minutos', () => {
    const t0 = timerNuevaRonda(50, ahora);
    expect(segundosRestantes(t0, ahora)).toBe(3000);
    const pausa = timerPausado(t0, ahora + 60_000);
    expect(pausa).toEqual({ rondaPausada: true, rondaRestanteMs: 2_940_000, rondaFinEn: null });
    expect(segundosRestantes(pausa, ahora + 999_999)).toBe(2940);
    expect(estadoTimer(pausa, ahora)).toBe('pausado');
    const sigue = timerReanudado(pausa, ahora + 120_000);
    expect(sigue.rondaFinEn).toBe(ahora + 120_000 + 2_940_000);
    expect(timerConExtra(pausa, 3, ahora).rondaRestanteMs).toBe(2_940_000 + 180_000);
  });

  it('en tiempo extra los minutos cuentan desde ahora', () => {
    const vencido = timerNuevaRonda(10, ahora);
    const tarde = ahora + 20 * 60_000;
    expect(estadoTimer(vencido, tarde)).toBe('extra');
    expect(timerConExtra(vencido, 3, tarde).rondaFinEn).toBe(tarde + 180_000);
    expect(formatTimer(segundosRestantes(vencido, tarde))).toBe('00:00');
    expect(formatTimer(3 * 60 + 5)).toBe('03:05');
  });
});

describe('mesasSalonEnDuelo', () => {
  it('solo las mesas de partidas sin resultado de la ronda actual en curso', () => {
    const [a, b, c, d] = jugadores(4);
    const t = {
      estado: 'en_curso' as const,
      rondaActual: 2,
      rondas: [
        { numero: 1, partidas: [{ ...partida(1, a, b, null), mesaSalonId: 'vieja' }] },
        {
          numero: 2,
          partidas: [
            { ...partida(1, a, c, null), mesaSalonId: 'm1' },
            { ...partida(2, b, d, '2-0'), mesaSalonId: 'm2' },
          ],
        },
      ],
    };
    expect([...mesasSalonEnDuelo(t)]).toEqual(['m1']);
    expect(mesasSalonEnDuelo({ ...t, estado: 'finalizado' }).size).toBe(0);
    expect(mesasSalonEnDuelo(null).size).toBe(0);
  });
});
