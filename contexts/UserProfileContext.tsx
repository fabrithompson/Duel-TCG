import React, { createContext, useContext, useMemo } from 'react';
import { useUserProfile, UseUserProfileResult } from '../hooks/useUserProfile';

type UserProfileContextValue = UseUserProfileResult;

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

/** Un único listener de sesión + perfil para toda la app. */
export function UserProfileProvider({ children }: { readonly children: React.ReactNode }) {
  const { user, profile, loading, error, reintentar } = useUserProfile();
  const value = useMemo(
    () => ({ user, profile, loading, error, reintentar }),
    [user, profile, loading, error, reintentar]
  );
  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>;
}

export function useUserProfileContext(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext);
  if (!ctx) throw new Error('useUserProfileContext debe usarse dentro de <UserProfileProvider>.');
  return ctx;
}
