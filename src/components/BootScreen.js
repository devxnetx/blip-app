import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export default function BootScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.screen}>
      <View style={styles.pin}>
        <View style={styles.pinHead}>
          <View style={styles.pinHole} />
        </View>
        <View style={styles.pinPoint} />
      </View>
      <Text style={styles.word}>
        <Text style={styles.ko}>KO</Text>
        staa
      </Text>
      <ActivityIndicator color={colors.spinner} style={styles.spinner} />
    </View>
  );
}

function createStyles(c) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bg,
    },
    pin: {
      width: 64,
      height: 78,
      alignItems: 'center',
    },
    pinHead: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    pinHole: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.bootHole,
    },
    pinPoint: {
      position: 'absolute',
      bottom: 8,
      width: 22,
      height: 22,
      backgroundColor: c.accent,
      transform: [{ rotate: '45deg' }],
    },
    word: {
      marginTop: 8,
      color: c.ink,
      fontSize: 40,
      fontWeight: '700',
      letterSpacing: -1.4,
    },
    ko: { color: c.accent },
    spinner: { marginTop: 28 },
  });
}
