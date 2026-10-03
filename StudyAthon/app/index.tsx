import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';

export default function EntryScreen() {
  const { user, profile, personalInfo } = useAuth();

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!profile || !personalInfo) {
    return <Redirect href="/profile-setup" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
