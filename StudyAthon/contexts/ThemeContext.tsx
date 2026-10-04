import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import themes, { type ColorScheme, type Theme } from '@/constants/theme';

const STORAGE_KEY = 'studyathon.color-scheme';

export type SchemePreference = ColorScheme | 'system';

type ThemeContextValue = {
  theme: Theme;
  preference: SchemePreference;
  setPreference: (next: SchemePreference) => void;
  /** What the preference resolves to right now, for labelling the toggle. */
  resolved: ColorScheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<SchemePreference>('system');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark') setPreferenceState(stored);
      })
      // A missing or unreadable preference just means "follow the system".
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const setPreference = useCallback((next: SchemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const resolved: ColorScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({ theme: themes[resolved], preference, setPreference, resolved }),
    [resolved, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const value = useContext(ThemeContext);
  // Screens are all rendered inside the provider, so a null here means a screen
  // was mounted outside the layout. Falling back to light beats throwing.
  return value ?? {
    theme: themes.light,
    preference: 'light',
    setPreference: () => undefined,
    resolved: 'light',
  };
}

/**
 * The resolved colour tokens for the active scheme. This is the hook screens and
 * stylesheets use: `const theme = useTheme()` then `theme.surface`, `theme.textBody`.
 */
export function useTheme(): Theme {
  return useThemeContext().theme;
}

/** The stored preference plus its setter, for the theme picker in Settings. */
export function useThemePreference() {
  const { preference, setPreference, resolved } = useThemeContext();
  return { preference, setPreference, resolved };
}