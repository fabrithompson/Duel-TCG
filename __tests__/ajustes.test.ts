import {
  cruzaMedianoche,
  errorNombre,
  fechaConAnio,
  haceCuanto,
  normalizarHora,
  pasoSiguiente,
  validarTurnos,
} from '../lib/ajustes';
import { CONFIG_DEFAULT, LIMITES } from '../lib/config';

describe('normalizarHora', () => {
  it('completa formatos abreviados', () => {
    expect(normalizarHora('8:00')).toBe('08:00');
    expect(normalizarHora('800')).toBe('08:00');
    expect(normalizarHora('0830')).toBe('08:30');
    expect(normalizarHora(' 23:59 ')).toBe('23:59');
    expect(normalizarHora('24:00')).toBe('00:00');
  });

  it('rechaza horas imposibles o texto', () => {
    expect(normalizarHora('')).toBeNull();
    expect(normalizarHora('25:00')).toBeNull();
    expect(normalizarHora('12:60')).toBeNull();
    expect(normalizarHora('mediodía')).toBeNull();
    expect(normalizarHora('1:5')).toBeNull();
  });
});

describe('validarTurnos', () => {
  it('acepta los turnos por defecto, incluido el que cruza la medianoche', () => {
    const r = validarTurnos(CONFIG_DEFAULT.turnos);
    expect(r).toEqual({ ok: true, turnos: CONFIG_DEFAULT.turnos });
    expect(cruzaMedianoche('15:00', '00:30')).toBe(true);
    expect(cruzaMedianoche('08:00', '15:00')).toBe(false);
  });

  it('normaliza nombres y horas', () => {
    const r = validarTurnos([{ nombre: '  Turno   noche ', apertura: '2000', cierre: '2:00' }]);
    expect(r).toEqual({ ok: true, turnos: [{ nombre: 'Turno noche', apertura: '20:00', cierre: '02:00' }] });
  });

  it('exige entre 1 y 4 turnos', () => {
    expect(validarTurnos([]).ok).toBe(false);
    const cinco = ['01', '02', '03', '04', '05'].map((h, i) => ({ nombre: `T${i}`, apertura: `${h}:00`, cierre: `${h}:30` }));
    expect(validarTurnos(cinco).ok).toBe(false);
  });

  it('rechaza nombres vacíos, repetidos u horas iguales', () => {
    expect(validarTurnos([{ nombre: ' ', apertura: '08:00', cierre: '12:00' }]).ok).toBe(false);
    expect(
      validarTurnos([
        { nombre: 'Mañana', apertura: '08:00', cierre: '12:00' },
        { nombre: 'mañana', apertura: '12:00', cierre: '16:00' },
      ]).ok
    ).toBe(false);
    expect(validarTurnos([{ nombre: 'Raro', apertura: '10:00', cierre: '10:00' }]).ok).toBe(false);
    expect(validarTurnos([{ nombre: 'Raro', apertura: '10:00', cierre: '99:00' }]).ok).toBe(false);
  });

  it('detecta superposiciones, también a través de la medianoche', () => {
    const r = validarTurnos([
      { nombre: 'Noche', apertura: '20:00', cierre: '02:00' },
      { nombre: 'Trasnoche', apertura: '01:00', cierre: '04:00' },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('se superponen');

    expect(
      validarTurnos([
        { nombre: 'Noche', apertura: '20:00', cierre: '02:00' },
        { nombre: 'Mañana', apertura: '02:00', cierre: '12:00' },
        { nombre: 'Tarde', apertura: '12:00', cierre: '20:00' },
      ]).ok
    ).toBe(true);
  });
});

describe('pasoSiguiente', () => {
  it('alinea al paso y respeta los límites', () => {
    expect(pasoSiguiente(50, 5, 1, LIMITES.minutos)).toBe(55);
    expect(pasoSiguiente(52, 5, 1, LIMITES.minutos)).toBe(55);
    expect(pasoSiguiente(52, 5, -1, LIMITES.minutos)).toBe(50);
    expect(pasoSiguiente(120, 5, 1, LIMITES.minutos)).toBe(120);
    expect(pasoSiguiente(10, 5, -1, LIMITES.minutos)).toBe(10);
    expect(pasoSiguiente(6000, 500, 1, LIMITES.inscripcion)).toBe(6500);
    expect(pasoSiguiente(0, 500, -1, LIMITES.inscripcion)).toBe(0);
    expect(pasoSiguiente(2, 1, -1, LIMITES.cupo)).toBe(2);
  });
});

describe('errorNombre', () => {
  it('valida vacío y largo', () => {
    expect(errorNombre('   ', 60, 'el nombre')).toBe('Escribí el nombre.');
    expect(errorNombre('x'.repeat(61), 60, 'el nombre')).toContain('60');
    expect(errorNombre('Duel · Palermo', 60, 'el nombre')).toBeNull();
  });
});

describe('haceCuanto', () => {
  const ahora = new Date(2026, 8, 24, 15, 0);
  const menos = (min: number) => ahora.getTime() - min * 60000;

  it('usa minutos y horas para lo reciente', () => {
    expect(haceCuanto(null, ahora)).toBeNull();
    expect(haceCuanto(menos(0), ahora)).toBe('recién');
    expect(haceCuanto(ahora.getTime() + 60000, ahora)).toBe('recién');
    expect(haceCuanto(menos(12), ahora)).toBe('hace 12 min');
    expect(haceCuanto(menos(125), ahora)).toBe('hace 2 h');
  });

  it('dice "ayer" solo si pasó bastante tiempo', () => {
    const anocheTarde = new Date(2026, 8, 23, 23, 0).getTime();
    expect(haceCuanto(anocheTarde, new Date(2026, 8, 24, 7, 0))).toBe('hace 8 h');
    const ayerTemprano = new Date(2026, 8, 23, 9, 0).getTime();
    expect(haceCuanto(ayerTemprano, ahora)).toBe('ayer');
  });

  it('cuenta días y después muestra la fecha', () => {
    expect(haceCuanto(new Date(2026, 8, 20, 10, 0).getTime(), ahora)).toBe('hace 4 días');
    expect(haceCuanto(new Date(2026, 6, 26, 10, 0).getTime(), ahora)).toBe('el 26 jul');
    expect(haceCuanto(new Date(2025, 11, 3, 10, 0).getTime(), ahora)).toBe('el 3 dic 2025');
  });
});

describe('fechaConAnio', () => {
  it('agrega el año solo si no es el actual', () => {
    const ahora = new Date(2026, 0, 1);
    expect(fechaConAnio('2026-07-26', ahora)).toBe('26 jul');
    expect(fechaConAnio('2025-07-26', ahora)).toBe('26 jul 2025');
  });
});
