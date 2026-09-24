import { aMilis, diaCorto, fechaCorta, fechaLocal, horaLocal, minutosDelDia, sumarDias } from '../lib/fecha';

describe('fechaLocal', () => {
  it('usa el día local aunque en UTC ya sea el día siguiente', () => {
    // 22:30 del 3 de marzo en hora local: toISOString podría dar el 4 si el huso es negativo.
    const d = new Date(2026, 2, 3, 22, 30);
    expect(fechaLocal(d)).toBe('2026-03-03');
  });

  it('rellena mes y día con cero', () => {
    expect(fechaLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('horaLocal', () => {
  it('devuelve HH:MM en 24 h', () => {
    expect(horaLocal(new Date(2026, 5, 1, 7, 4))).toBe('07:04');
    expect(horaLocal(new Date(2026, 5, 1, 23, 59))).toBe('23:59');
  });
});

describe('sumarDias', () => {
  it('cruza fin de mes sin mutar el original', () => {
    const base = new Date(2026, 0, 31);
    const siguiente = sumarDias(base, 1);
    expect(fechaLocal(siguiente)).toBe('2026-02-01');
    expect(fechaLocal(base)).toBe('2026-01-31');
  });

  it('acepta días negativos', () => {
    expect(fechaLocal(sumarDias(new Date(2026, 2, 1), -1))).toBe('2026-02-28');
  });
});

describe('minutosDelDia', () => {
  it('convierte horas válidas', () => {
    expect(minutosDelDia('00:00')).toBe(0);
    expect(minutosDelDia('08:30')).toBe(510);
    expect(minutosDelDia('23:59')).toBe(1439);
  });

  it('rechaza formatos inválidos', () => {
    expect(minutosDelDia('24:00')).toBeNull();
    expect(minutosDelDia('8:30')).toBeNull();
    expect(minutosDelDia('08:60')).toBeNull();
    expect(minutosDelDia('abc')).toBeNull();
  });
});

describe('formatos cortos', () => {
  it('diaCorto usa L M X J V S D', () => {
    expect(diaCorto(new Date(2026, 8, 24))).toBe('J'); // jueves 24/9/2026
    expect(diaCorto(new Date(2026, 8, 27))).toBe('D');
  });

  it('fechaCorta formatea y tolera basura', () => {
    expect(fechaCorta('2026-07-26')).toBe('26 jul');
    expect(fechaCorta('no-es-fecha')).toBe('no-es-fecha');
  });
});

describe('aMilis', () => {
  it('acepta Timestamp de Firestore, números y rechaza lo demás', () => {
    expect(aMilis({ toMillis: () => 1234 })).toBe(1234);
    expect(aMilis(99)).toBe(99);
    expect(aMilis(null)).toBeNull();
    expect(aMilis('2026')).toBeNull();
  });
});
