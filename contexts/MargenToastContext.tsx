import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Las pantallas con botones fijos abajo (Pedido, Nuevo torneo) avisan su alto para que el
// toast aparezca encima y no tape "Guardar" o "Continuar" justo después de tocarlos.

interface MargenToastValue {
  margen: number;
  registrar: (id: number, alto: number) => void;
  quitar: (id: number) => void;
}

const MargenToastContext = createContext<MargenToastValue>({ margen: 0, registrar: () => undefined, quitar: () => undefined });

export function MargenToastProvider({ children }: { readonly children: React.ReactNode }) {
  const altos = useRef(new Map<number, number>());
  const [margen, setMargen] = useState(0);

  const recalcular = useCallback(() => setMargen(Math.max(0, ...altos.current.values())), []);
  const registrar = useCallback(
    (id: number, alto: number) => {
      altos.current.set(id, alto);
      recalcular();
    },
    [recalcular]
  );
  const quitar = useCallback(
    (id: number) => {
      if (altos.current.delete(id)) recalcular();
    },
    [recalcular]
  );

  const value = useMemo(() => ({ margen, registrar, quitar }), [margen, registrar, quitar]);
  return <MargenToastContext.Provider value={value}>{children}</MargenToastContext.Provider>;
}

export function useMargenToast(): number {
  return useContext(MargenToastContext).margen;
}

let siguienteId = 0;

/** Registra el alto del footer fijo de una pantalla mientras está montada (null = sin footer). */
export function useFooterParaToast(alto: number | null): void {
  const { registrar, quitar } = useContext(MargenToastContext);
  const id = useRef<number | null>(null);
  if (id.current === null) {
    siguienteId += 1;
    id.current = siguienteId;
  }
  useEffect(() => {
    const propio = id.current as number;
    if (alto && alto > 0) registrar(propio, alto);
    else quitar(propio);
    return () => quitar(propio);
  }, [alto, registrar, quitar]);
}
