import { SymbolView } from 'expo-symbols';
import { Link, Tabs } from 'expo-router';
import { Platform, Pressable } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { FontAwesome5 } from "@expo/vector-icons";
import { Ionicons } from "@expo/vector-icons";


export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: false,
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <FontAwesome5
              name="home"
              tintColor={color}
              size={28}
            />
          )
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Ionicons
              name= "settings"
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
    </Tabs>
  );
}
