import { estadoReloj, type FaseReloj } from './temporada';
import { formatTimer, type Torneo } from './torneo';

// Un solo lugar para decir en qué está el reloj de la ronda: Mi duelo, Torneo, Salón y el
// Modo TV muestran lo mismo (antes cada pantalla lo contaba a su manera).

export interface DescripcionReloj {
  fase: FaseReloj;
  segundos: number;
  /** Quedan menos de 5 minutos: el reloj pasa a rojo. */
  bajo: boolean;
  /** "Ronda en curso · 50 min", "Pausada por el juez", "Se cumplió el tiempo", "Ronda sin empezar". */
  estado: string;
  /** Lo que se ve grande: "12:40", o "00:00" en tiempo extra. */
  reloj: string;
  /** Para lugares chicos (la mesa del Salón): "12:40", "12:40 · pausa", "tiempo cumplido", "sin empezar". */
  corto: string;
  /** Para lectores de pantalla. */
  accesible: string;
}

type CamposReloj = Pick<Torneo, 'rondaPausada' | 'rondaRestanteMs' | 'rondaFinEn' | 'minutosPorRonda'>;

function enPalabras(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m} ${m === 1 ? 'minuto' : 'minutos'} y ${s} ${s === 1 ? 'segundo' : 'segundos'}`;
}

/** `ahoraMs` es la hora del servidor (lib/reloj): así todos los dispositivos dicen lo mismo. */
export function describirReloj(t: CamposReloj, ahoraMs: number): DescripcionReloj {
  const { fase, segundos, bajo } = estadoReloj(t, ahoraMs);
  const reloj = formatTimer(segundos);
  switch (fase) {
    case 'pausada':
      return { fase, segundos, bajo, estado: 'Pausada por el juez', reloj, corto: `${reloj} · pausa`, accesible: `Ronda pausada, quedan ${enPalabras(segundos)}` };
    case 'extra':
      return {
        fase,
        segundos: 0,
        bajo: false,
        estado: 'Se cumplió el tiempo',
        reloj: formatTimer(0),
        corto: 'tiempo cumplido',
        accesible: 'Se cumplió el tiempo de la ronda: terminen la partida en curso',
      };
    case 'sin_iniciar':
      return { fase, segundos, bajo: false, estado: 'Ronda sin empezar', reloj, corto: 'sin empezar', accesible: 'La ronda todavía no empezó' };
    default:
      return {
        fase,
        segundos,
        bajo,
        estado: `Ronda en curso · ${t.minutosPorRonda} min`,
        reloj,
        corto: reloj,
        accesible: `Quedan ${enPalabras(segundos)}`,
      };
  }
}
