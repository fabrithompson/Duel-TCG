import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useTheme } from '../contexts/ThemeContext';
import { Typography, tabularNums } from '../constants/theme';
import { fechaCorta } from '../lib/fecha';
import { esFaltaDeIndice } from '../lib/errores';
import { formatARS } from '../lib/pedido';
import { numeroMesaTexto } from '../lib/salon';

// Dónde se usó el crédito del jugador: si alguien lo usa sin permiso, el jugador lo ve y reclama.

const MAX_USOS = 8;

interface Uso {
  id: string;
  fecha: string;
  hora: string;
  mesaNum: number;
  monto: number;
}

export default function UsosCredito({ uid }: { readonly uid: string }) {
  const { colors } = useTheme();
  const [usos, setUsos] = useState<Uso[] | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'ventas'), where('creditoUid', '==', uid), orderBy('creadoEn', 'desc'), limit(MAX_USOS)),
        (snap) => {
          setUsos(
            snap.docs.map((d) => {
              const v = d.data();
              return {
                id: d.id,
                fecha: typeof v.fecha === 'string' ? v.fecha : '',
                hora: typeof v.hora === 'string' ? v.hora : '',
                mesaNum: typeof v.mesaNum === 'number' ? v.mesaNum : 0,
                monto: typeof v.creditoAplicado === 'number' ? v.creditoAplicado : 0,
              };
            })
          );
          setProblema(null);
        },
        (e) => setProblema(esFaltaDeIndice(e) ? 'Los movimientos todavía se están preparando.' : 'No se pudieron cargar los movimientos.')
      ),
    [uid]
  );

  if (problema) return <Text style={[styles.nota, { color: colors.dim }]}>{problema}</Text>;
  if (usos === null) return null;
  if (usos.length === 0) return <Text style={[styles.nota, { color: colors.dim }]}>Todavía no usaste tu crédito en la barra.</Text>;

  return (
    <View style={styles.lista} accessibilityLabel="Últimos usos de tu crédito">
      <Text style={[styles.titulo, { color: colors.dim }]}>ÚLTIMOS USOS</Text>
      {usos.map((u) => (
        <View
          key={u.id}
          style={[styles.fila, { borderBottomColor: colors.line }]}
          accessible
          accessibilityLabel={`${fechaCorta(u.fecha)} ${u.hora}, mesa ${numeroMesaTexto(u.mesaNum)}, ${formatARS(u.monto)}`}
        >
          <Text style={[styles.texto, { color: colors.ink }, tabularNums(12.5)]}>
            {fechaCorta(u.fecha)} · {u.hora} · Mesa {numeroMesaTexto(u.mesaNum)}
          </Text>
          <Text style={[styles.monto, { color: colors.gold }, tabularNums(12.5)]}>−{formatARS(u.monto)}</Text>
        </View>
      ))}
      <Text style={[styles.nota, { color: colors.dim }]}>Si ves un uso que no reconocés, avisale al encargado del local.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { marginTop: 10, gap: 2 },
  titulo: { fontFamily: Typography.fontFamily.bold, fontSize: 10, letterSpacing: 1.6, marginBottom: 4 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, gap: 10 },
  texto: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, flexShrink: 1 },
  monto: { fontFamily: Typography.display.semibold, fontSize: 12.5 },
  nota: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, lineHeight: 17, marginTop: 6 },
});
