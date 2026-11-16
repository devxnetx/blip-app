import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MapScreen from './src/screens/MapScreen';
import { ThemeProvider, useTheme } from './src/theme';

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <ThemedStatusBar />
        <MapScreen />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
