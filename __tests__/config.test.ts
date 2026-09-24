import { CONFIG_DEFAULT, LIMITES, generarCodigoInvitacion, normalizarConfig, turnoActual } from '../lib/config';

describe('normalizarConfig', () => {
  it('sin documento devuelve los defaults', () => {
    expect(normalizarConfig(undefined)).toEqual(CONFIG_DEFAULT);
    expect(normalizarConfig(null)).toEqual(CONFIG_DEFAULT);
  });

  it('respeta valores válidos', () => {
    const c = normalizarConfig({
      nombreLocal: '  Duel · Palermo  ',
      marca: '#3f6b58',
      alertaStock: 12,
      torneo: { rondas: 6, minutos: 45, extra: 5, inscripcion: 7000, cupo: 32 },
      temporada: { nombre: 'T2', inicio: '2026-07-01' },
      reporteJugador: false,
    });
    expect(c.nombreLocal).toBe('Duel · Palermo');
    expect(c.marca).toBe('#3F6B58');
    expect(c.alertaStock).toBe(12);
    expect(c.torneo).toEqual({ rondas: 6, minutos: 45, extra: 5, inscripcion: 7000, cupo: 32 });
    expect(c.temporada).toEqual({ nombre: 'T2', inicio: '2026-07-01' });
    expect(c.reporteJugador).toBe(false);
  });

  it('descarta valores inválidos o maliciosos', () => {
    const c = normalizarConfig({
      nombreLocal: '',
      marca: 'red; background:url(x)',
      logoUrl: 'http://inseguro.com/logo.png',
      alertaStock: -40,
      torneo: { rondas: 999, minutos: 'mucho', cupo: 1 },
      temporada: { inicio: 'ayer' },
      turnos: [{ nombre: 'X', apertura: '25:00', cierre: '10:00' }],
      descontarStock: 'sí',
    });
    expect(c.nombreLocal).toBe(CONFIG_DEFAULT.nombreLocal);
    expect(c.marca).toBeNull();
    expect(c.logoUrl).toBeNull();
    expect(c.alertaStock).toBe(LIMITES.alertaStock.min);
    expect(c.torneo.rondas).toBe(LIMITES.rondas.max);
    expect(c.torneo.minutos).toBe(CONFIG_DEFAULT.torneo.minutos);
    expect(c.torneo.cupo).toBe(LIMITES.cupo.min);
    expect(c.temporada.inicio).toBeNull();
    expect(c.turnos).toEqual(CONFIG_DEFAULT.turnos);
    expect(c.descontarStock).toBe(CONFIG_DEFAULT.descontarStock);
  });

  it('limita la cantidad de turnos y recorta nombres', () => {
    const turnos = Array.from({ length: 6 }, (_, i) => ({ nombre: `Turno ${i} ${'x'.repeat(40)}`, apertura: '08:00', cierre: '12:00' }));
    const c = normalizarConfig({ turnos });
    expect(c.turnos).toHaveLength(4);
    expect(c.turnos[0].nombre.length).toBeLessThanOrEqual(24);
  });
});

describe('turnoActual', () => {
  const turnos = [
    { nombre: 'Mañana', apertura: '08:00', cierre: '15:00' },
    { nombre: 'Tarde', apertura: '15:00', cierre: '00:30' },
  ];

  it('encuentra el turno del día', () => {
    expect(turnoActual(turnos, new Date(2026, 0, 1, 9, 0))?.nombre).toBe('Mañana');
    expect(turnoActual(turnos, new Date(2026, 0, 1, 15, 0))?.nombre).toBe('Tarde');
  });

  it('soporta turnos que cruzan la medianoche', () => {
    expect(turnoActual(turnos, new Date(2026, 0, 1, 23, 50))?.nombre).toBe('Tarde');
    expect(turnoActual(turnos, new Date(2026, 0, 2, 0, 10))?.nombre).toBe('Tarde');
  });

  it('fuera de horario devuelve null', () => {
    expect(turnoActual(turnos, new Date(2026, 0, 1, 3, 0))).toBeNull();
  });
});

describe('generarCodigoInvitacion', () => {
  it('genera 8 caracteres sin ambiguos (0 O 1 I)', () => {
    const bytes = new Uint8Array([0, 31, 64, 200, 255, 17, 90, 128]);
    const codigo = generarCodigoInvitacion(bytes);
    expect(codigo).toHaveLength(8);
    expect(codigo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });
});
