import { describirReloj } from '../lib/relojRonda';

// Pruebas de QA: el mismo texto del reloj en todas las pantallas.

const base = { minutosPorRonda: 50, minutosExtra: 3, rondaPausada: false, rondaRestanteMs: null, rondaFinEn: null };

describe('describirReloj', () => {
  it('corriendo: minutos de la ronda y reloj', () => {
    const d = describirReloj({ ...base, rondaFinEn: 1_000_000 + 760_000 }, 1_000_000);
    expect(d).toMatchObject({ fase: 'corriendo', estado: 'Ronda en curso · 50 min', reloj: '12:40', corto: '12:40', bajo: false });
    expect(d.accesible).toBe('Quedan 12 minutos y 40 segundos');
  });

  it('con menos de 5 minutos avisa que está bajo', () => {
    expect(describirReloj({ ...base, rondaFinEn: 1_000_000 + 60_000 }, 1_000_000).bajo).toBe(true);
  });

  it('pausada: lo dice en todos lados, también en la mesa del salón', () => {
    const d = describirReloj({ ...base, rondaPausada: true, rondaRestanteMs: 600_000 }, 1_000_000);
    expect(d).toMatchObject({ fase: 'pausada', estado: 'Pausada por el juez', reloj: '10:00', corto: '10:00 · pausa' });
  });

  it('en cero: se cumplió el tiempo (los minutos extra los suma el juez, no se dan por sumados)', () => {
    const d = describirReloj({ ...base, rondaFinEn: 999_000 }, 1_000_000);
    expect(d).toMatchObject({ fase: 'extra', estado: 'Se cumplió el tiempo', reloj: '00:00', corto: 'tiempo cumplido' });
  });

  it('sin fin ni pausa: la ronda todavía no empezó', () => {
    expect(describirReloj(base, 1_000_000)).toMatchObject({ fase: 'sin_iniciar', estado: 'Ronda sin empezar', corto: 'sin empezar' });
  });
});
