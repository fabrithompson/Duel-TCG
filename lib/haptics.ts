import * as Haptics from 'expo-haptics';

// La háptica es un extra: si el dispositivo no la soporta, se ignora.

export function tocar(): void {
  Haptics.selectionAsync().catch(() => undefined);
}

export function exito(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function advertencia(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

export function fallo(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
}
