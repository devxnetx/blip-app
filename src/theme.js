import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'blip-color-scheme';

export const lightColors = {
  bg: '#d9d6d0',
  surface: '#f6f4ef',
  card: '#ffffff',
  ink: '#1c1b19',
  muted: '#5e5a54',
  faint: '#8a847a',
  line: '#d9d6d0',
  accent: '#c2410c',
  onAccent: '#f6f4ef',
  button: '#1c1b19',
  onButton: '#f6f4ef',
  hint: 'rgba(246,244,239,0.94)',
  hintText: '#1c1b19',
  backdrop: 'rgba(28,27,25,0.35)',
  credit: '#5e5a54',
  spinner: '#1c1b19',
  sliderMin: '#1c1b19',
  sliderMax: '#d9d6d0',
  thumb: '#d9d6d0',
  pin: '#1c1b19',
  pinText: '#f6f4ef',
  pinMuted: '#cfcabe',
  pinThumb: '#3a3834',
  countBorder: '#f6f4ef',
  me: '#2563eb',
  meBorder: '#f6f4ef',
  bootHole: '#f6f4ef',
  replyMine: '#1c1b19',
  replyMineText: '#f6f4ef',
  replyMineTime: '#cfcabe',
};

export const darkColors = {
  bg: '#12110f',
  surface: '#1c1b19',
  card: '#2a2825',
  ink: '#f6f4ef',
  muted: '#cfcabe',
  faint: '#9c968c',
  line: '#3a3834',
  accent: '#e85d2a',
  onAccent: '#f6f4ef',
  button: '#f6f4ef',
  onButton: '#1c1b19',
  hint: 'rgba(28,27,25,0.94)',
  hintText: '#f6f4ef',
  backdrop: 'rgba(0,0,0,0.6)',
  credit: '#cfcabe',
  spinner: '#f6f4ef',
  sliderMin: '#f6f4ef',
  sliderMax: '#3a3834',
  thumb: '#3a3834',
  pin: '#f6f4ef',
  pinText: '#1c1b19',
  pinMuted: '#5e5a54',
  pinThumb: '#d9d6d0',
  countBorder: '#12110f',
  me: '#60a5fa',
  meBorder: '#12110f',
  bootHole: '#12110f',
  replyMine: '#f6f4ef',
  replyMineText: '#1c1b19',
  replyMineTime: '#5e5a54',
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dark, setDarkState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then((value) => {
        if (!cancelled && value === 'dark') {
          setDarkState(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setDark = (value) => {
    setDarkState(value);
    AsyncStorage.setItem(KEY, value ? 'dark' : 'light').catch(() => {});
  };

  const colors = dark ? darkColors : lightColors;
  const value = useMemo(() => ({ dark, colors, setDark }), [dark, colors]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return value;
}
