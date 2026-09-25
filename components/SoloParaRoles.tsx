import React from 'react';
import { useRouter } from 'expo-router';
import { ROLE_LABEL, type Role } from '../constants/roles';
import { useUserProfileContext } from '../contexts/UserProfileContext';
import Button from './Button';
import Screen, { LoadingScreen } from './Screen';
import { EmptyState } from './ui';

interface SoloParaRolesProps {
  readonly roles: readonly Role[];
  /** Título de la pantalla, para que el aviso se vea en su lugar. */
  readonly titulo: string;
  readonly children: React.ReactNode;
}

function listaRoles(roles: readonly Role[]): string {
  const nombres = roles.map((r) => ROLE_LABEL[r].toLowerCase());
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0] ?? '';
}

/**
 * Las pestañas que no le corresponden a un rol se ocultan en el layout, pero la ruta sigue
 * existiendo (un deep link duel://… llega igual). Cada pantalla sensible se envuelve en esto:
 * las reglas de Firestore frenan la escritura, pero la interfaz tampoco ofrece la acción.
 */
export default function SoloParaRoles({ roles, titulo, children }: SoloParaRolesProps) {
  const router = useRouter();
  const { profile, loading } = useUserProfileContext();
  if (loading) return <LoadingScreen />;
  if (!profile || !roles.includes(profile.role)) {
    return (
      <Screen title={titulo}>
        <EmptyState
          title="Esta pantalla no es para tu perfil"
          body={`La usan ${listaRoles(roles)}. Si necesitás entrar, pedíselo al admin del local.`}
          action={<Button label="Ir al inicio" variant="secondary" onPress={() => router.replace('/(tabs)')} />}
        />
      </Screen>
    );
  }
  return <>{children}</>;
}
