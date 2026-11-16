import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../theme';

export default function ThemeSwitch({ compact = false }) {
  const { dark, setDark, colors } = useTheme();

  return (
    <View
      style={[
        styles.row,
        compact ? styles.compact : styles.wide,
        { backgroundColor: compact ? colors.surface : 'transparent' },
      ]}
    >
      <Text style={[styles.label, { color: colors.ink }]}>{compact ? 'Тъмен' : 'Тъмен режим'}</Text>
      <Switch
        value={dark}
        onValueChange={setDark}
        accessibilityLabel="Тъмен режим"
        trackColor={{ false: colors.line, true: colors.accent }}
        thumbColor={colors.onAccent}
        ios_backgroundColor={colors.line}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compact: {
    height: 48,
    borderRadius: 24,
    paddingLeft: 14,
    paddingRight: 8,
    gap: 4,
  },
  wide: {
    marginTop: 14,
    marginBottom: 4,
  },
  label: { fontWeight: '700', fontSize: 15 },
});
