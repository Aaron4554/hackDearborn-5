import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as RouterThemeProvider,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import LoadingScreen from '@/components/LoadingScreen';
import StreakBadge from '@/components/StreakBadge';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { StudyProvider } from '@/contexts/StudyContext';
import {
  ThemeProvider,
  useTheme,
  useThemePreference,
} from '@/contexts/ThemeContext';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Nothing blocks first paint, so the splash can go as soon as we mount. An
  // earlier version awaited a bundled font here via `useFonts`; on web that path
  // verifies the font with fontfaceobserver, which rejects after 12s when the
  // face never loads. expo-font only catches that rejection synchronously, so it
  // escaped as an unhandled rejection and took the whole app down with it. The
  // app uses no custom font, so there is nothing to wait for.
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootLayoutNav() {
  const theme = useTheme();
  const { resolved } = useThemePreference();

  const { user, profile, personalInfo, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen label="Opening your study space…" />;
  }

  return (
    // Keyed on the user so signing out cannot leave a session (and its timer)
    // alive for whoever signs in next on a shared device.
    <StudyProvider key={user?.uid ?? 'signed-out'}>
      <RouterThemeProvider
        value={{
          ...(resolved === 'dark' ? DarkTheme : DefaultTheme),
          // The app paints its own canvas; match it so route transitions and any
          // unstyled surface do not flash white against the page background.
          colors: {
            ...(resolved === 'dark' ? DarkTheme : DefaultTheme).colors,
            background: theme.page,
            card: theme.page,
          },
        }}
      >
        <View style={{ flex: 1 }}>
        <Stack>
          {/* The root route decides where to start after Firebase restores auth. */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Protected guard={!user}>
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="sign-up" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!!user && (!profile || !personalInfo)}>
            <Stack.Screen name="profile-setup" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!!user && !!profile && !!personalInfo}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* Declared here, not only on disk: an auto-discovered route would
                otherwise sit outside every guard, reachable while signed out. */}
            <Stack.Screen name="study/setup" options={{ headerShown: false }} />
            <Stack.Screen name="study/quiz" options={{ headerShown: false }} />
            <Stack.Screen name="study/results" options={{ headerShown: false }} />
            <Stack.Screen name="flashcards/index" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
        <StreakBadge />
        </View>
      </RouterThemeProvider>
    </StudyProvider>
  );
}
