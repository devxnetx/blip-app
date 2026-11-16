import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { useTheme } from '../theme';

export default function CountMarker({ cluster, onPress }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tracking, setTracking] = useState(true);

  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 400);
    return () => clearTimeout(timer);
  }, [cluster.count, colors]);

  return (
    <Marker
      coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
      zIndex={3}
      onPress={onPress}
    >
      <View style={styles.count} collapsable={false}>
        <Text style={styles.countText}>({cluster.count})</Text>
      </View>
    </Marker>
  );
}

function createStyles(c) {
  return StyleSheet.create({
    count: {
      minWidth: 46,
      height: 46,
      paddingHorizontal: 10,
      borderRadius: 23,
      backgroundColor: c.pin,
      borderWidth: 2,
      borderColor: c.countBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countText: { color: c.pinText, fontWeight: '700', fontSize: 15 },
  });
}
