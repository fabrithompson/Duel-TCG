import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { ItemPedido } from '../lib/pedido';
import { normalizarLineas } from '../lib/salon';

// Colección `mesas/{id}`:
//   { numero, x, y, salaId, tipo: 'cafe'|'duelo', estado: 'libre'|'consumo',
//     pedido: ItemPedido[], creadoEn }
// "Duelo en curso" NO se guarda: se deriva del torneo activo (ver lib/torneo.ts).

export type TipoMesa = 'cafe' | 'duelo';
export type EstadoMesaVisual = 'libre' | 'consumo' | 'duelo_en_curso';

export interface Mesa {
  id: string;
  numero: number;
  x: number;
  y: number;
  salaId: string;
  tipo: TipoMesa;
  /** 'libre' | 'consumo' (docs viejos pueden traer 'ocupada'). */
  estado: string;
  pedido: ItemPedido[];
}

/** Estado visual: el duelo en curso tiene prioridad; 'ocupada' (viejo) cuenta como consumo. */
export function estadoVisual(estado: string, enDuelo = false): EstadoMesaVisual {
  if (enDuelo || estado === 'duelo_en_curso') return 'duelo_en_curso';
  if (estado === 'libre') return 'libre';
  return 'consumo';
}

export function normalizarMesa(id: string, data: Record<string, unknown>): Mesa {
  return {
    id,
    numero: typeof data.numero === 'number' ? data.numero : 0,
    x: typeof data.x === 'number' ? data.x : 20,
    y: typeof data.y === 'number' ? data.y : 20,
    salaId: typeof data.salaId === 'string' ? data.salaId : '',
    tipo: data.tipo === 'duelo' ? 'duelo' : 'cafe',
    estado: typeof data.estado === 'string' ? data.estado : 'libre',
    pedido: normalizarLineas(data.pedido),
  };
}

interface UseMesasResult {
  mesas: Mesa[];
  cargando: boolean;
  error: unknown;
}

/** Mesas de una sala, o de todas si `salaId` es 'todas'. */
export function useMesas(salaId: string | null | 'todas'): UseMesasResult {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!salaId) {
      setMesas([]);
      setCargando(false);
      return undefined;
    }
    setCargando(true);
    const ref = collection(db, 'mesas');
    const q = salaId === 'todas' ? ref : query(ref, where('salaId', '==', salaId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMesas(snap.docs.map((d) => normalizarMesa(d.id, d.data())).sort((a, b) => a.numero - b.numero));
        setError(null);
        setCargando(false);
      },
      (e) => {
        setError(e);
        setCargando(false);
      }
    );
    return unsub;
  }, [salaId]);

  return { mesas, cargando, error };
}
