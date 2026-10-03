import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import LoadingScreen from '@/components/LoadingScreen';
import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { StudyProvider } from '@/contexts/StudyContext';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'login',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, profile, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen label="Opening your study space…" />;
  }

  return (
    // Keyed on the user so signing out cannot leave a session (and its timer)
    // alive for whoever signs in next on a shared device.
    <StudyProvider key={user?.uid ?? 'signed-out'}>
      <ThemeProvider
        value={{
          ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme),
          // The app paints its own canvas; match it so route transitions and any
          // unstyled surface do not flash white against #F7F8F5.
          colors: {
            ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme).colors,
            background: colorScheme === 'dark' ? '#141815' : '#F7F8F5',
          },
        }}
      >
        <Stack>
          <Stack.Protected guard={!user}>
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="sign-up" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!!user && !profile}>
            <Stack.Screen name="profile-setup" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!!user && !!profile}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="study/setup" options={{ headerShown: false }} />
            <Stack.Screen name="study/quiz" options={{ headerShown: false }} />
            <Stack.Screen name="study/results" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </StudyProvider>
  );
}
