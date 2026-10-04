import { useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, Pressable, Text, View } from 'react-native';


import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

export default function NotFoundScreen() {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);


  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn&apos;t exist.</Text>

        <Pressable style={styles.link} onPress ={() => router.push("/login")}>
          <Text style={styles.linkText}>Go to home screen!</Text>
        </Pressable>
      </View>
    </>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: theme.page,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.textPrimary,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: theme.coolText,
  },

  });
}
