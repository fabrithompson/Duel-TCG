import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Alert.alert con la misma firma, pero que también funciona en la versión web: en
 * react-native-web Alert.alert no hace nada (ni siquiera muestra el mensaje), así que
 * el juez no podía cerrar una ronda ni entregar un premio desde el navegador.
 *
 * En web cada opción se ofrece con window.confirm, empezando por la principal (la
 * última de la lista); la primera que se acepta se ejecuta. Si se rechazan todas,
 * corre la de cancelar.
 */
export function preguntar(titulo: string, mensaje?: string, botones?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(titulo, mensaje, botones);
    return;
  }
  const texto = mensaje ? `${titulo}\n\n${mensaje}` : titulo;
  const opciones = (botones ?? []).filter((b) => b.style !== 'cancel');
  if (opciones.length === 0) {
    window.alert(texto);
    botones?.[0]?.onPress?.();
    return;
  }
  for (const opcion of [...opciones].reverse()) {
    const pregunta = opciones.length > 1 ? `${texto}\n\n¿${opcion.text}?` : texto;
    if (window.confirm(pregunta)) {
      opcion.onPress?.();
      return;
    }
  }
  botones?.find((b) => b.style === 'cancel')?.onPress?.();
}

/** Confirmación de una sola acción: "Cancelar" o `accion`. */
export function confirmar(titulo: string, mensaje: string, accion: string, onOk: () => void, destructiva = false): void {
  preguntar(titulo, mensaje, [
    { text: 'Cancelar', style: 'cancel' },
    { text: accion, style: destructiva ? 'destructive' : 'default', onPress: onOk },
  ]);
}
