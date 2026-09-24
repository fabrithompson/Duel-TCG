import { Redirect } from 'expo-router';
import { LoadingScreen } from '../../components/Screen';
import { useUserProfileContext } from '../../contexts/UserProfileContext';

export default function TabsIndex() {
  const { profile } = useUserProfileContext();
  if (!profile) return <LoadingScreen />;
  return <Redirect href={profile.role === 'jugador' ? '/(tabs)/duelo' : '/(tabs)/hoy'} />;
}
