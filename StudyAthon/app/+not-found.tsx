import { Link, Stack, useRouter } from 'expo-router';
import { StyleSheet, Pressable } from 'react-native';

import { Text, View } from '@/components/Themed';

export default function NotFoundScreen() {

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: '#2e78b7',
  },
});
