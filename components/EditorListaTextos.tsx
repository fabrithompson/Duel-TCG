import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { Typography } from '../constants/theme';
import { limpiarTexto } from '../lib/ajustes';
import Chip from './Chip';
import FormField from './FormField';
import { SmallButton } from './ui';
import { preguntar } from '../lib/dialogo';

// Lista corta de textos que edita el admin (juegos, rubros): chips para quitar y un campo para sumar.

interface EditorListaTextosProps {
  readonly titulo: string;
  readonly ayuda: string;
  readonly valores: readonly string[];
  /** Singular para los avisos: "juego", "rubro". */
  readonly que: string;
  readonly placeholder: string;
  readonly maximo: number;
  readonly largoMaximo: number;
  /** Qué pasa con lo ya cargado al quitar uno (va en la confirmación). */
  readonly alQuitar: string;
  /** Nombres que no se pueden usar (del sistema), en minúsculas. */
  readonly reservados?: readonly string[];
  readonly onGuardar: (valores: string[], aviso: string) => Promise<boolean>;
}

export default function EditorListaTextos(props: EditorListaTextosProps) {
  const { titulo, ayuda, valores, que, placeholder, maximo, largoMaximo, alQuitar, reservados = [], onGuardar } = props;
  const { colors } = useTheme();
  const { mostrar } = useToast();
  const [nuevo, setNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const lleno = valores.length >= maximo;

  const agregar = async () => {
    const limpio = limpiarTexto(nuevo).slice(0, largoMaximo);
    if (!limpio || guardando) return;
    if (reservados.includes(limpio.toLowerCase())) {
      mostrar(`"${limpio}" ya lo usa la app: elegí otro nombre`, 'info');
      return;
    }
    if (valores.some((v) => v.toLowerCase() === limpio.toLowerCase())) {
      mostrar(`${limpio} ya está en la lista`, 'info');
      return;
    }
    setGuardando(true);
    const ok = await onGuardar([...valores, limpio], `${limpio} agregado`);
    setGuardando(false);
    if (ok) setNuevo('');
  };

  const quitar = (valor: string) => {
    if (valores.length <= 1) {
      mostrar(`Tiene que quedar al menos un ${que}`, 'info');
      return;
    }
    preguntar(`Quitar ${valor}`, alQuitar, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => void onGuardar(valores.filter((v) => v !== valor), `${valor} quitado`) },
    ]);
  };

  return (
    <View style={[styles.bloque, { borderTopColor: colors.line }]}>
      <Text style={[styles.titulo, { color: colors.ink }]}>{titulo}</Text>
      <Text style={[styles.ayuda, { color: colors.dim }]}>{ayuda}</Text>
      <View style={styles.chips}>
        {valores.map((v) => (
          <Chip key={v} label={v} active={false} onPress={() => quitar(v)} onLongPress={() => quitar(v)} accessibilityLabel={`${v}, quitar`} />
        ))}
      </View>
      {lleno ? (
        <Text style={[styles.ayuda, { color: colors.dim }]}>
          Hasta {maximo} {que === 'rubro' ? 'rubros' : `${que}s`}.
        </Text>
      ) : (
        <View style={styles.agregar}>
          <FormField
            label={`Agregar ${que}`}
            placeholder={placeholder}
            value={nuevo}
            onChangeText={setNuevo}
            maxLength={largoMaximo}
            returnKeyType="done"
            onSubmitEditing={() => void agregar()}
            containerStyle={styles.flex1}
            editable={!guardando}
          />
          <SmallButton label={guardando ? 'Guardando…' : 'Agregar'} onPress={() => void agregar()} disabled={!limpiarTexto(nuevo) || guardando} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  bloque: { borderTopWidth: 1, paddingVertical: 12, gap: 8 },
  titulo: { fontFamily: Typography.fontFamily.semibold, fontSize: 13.5 },
  ayuda: { fontFamily: Typography.fontFamily.regular, fontSize: 11, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  agregar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
});
