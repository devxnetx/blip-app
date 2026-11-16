import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { useTheme } from '../theme';

const CATEGORIES = {
  seeking: 'Търся',
  lost: 'Загубено',
  warning: 'Внимание',
  free: 'Безплатно',
  other: 'Друго',
};

function categoryLabel(id) {
  return CATEGORIES[id] || '';
}

export default function PinMarker({ pin, onPress, stackOffset = 0 }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tracking, setTracking] = useState(true);

  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), pin.image_url ? 700 : 350);
    return () => clearTimeout(timer);
  }, [stackOffset, pin.image_url, pin.message, pin.category, colors]);

  return (
    <Marker
      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracking}
      zIndex={stackOffset + 1}
      onPress={onPress}
    >
      <View style={styles.wrap} collapsable={false}>
        <View style={styles.bubble}>
          {pin.image_url ? (
            <Image
              source={{ uri: pin.image_url }}
              style={styles.thumb}
              onLoad={() => setTracking(false)}
              onError={() => setTracking(false)}
            />
          ) : null}
          <Text numberOfLines={2} style={styles.message}>{pin.message}</Text>
          {categoryLabel(pin.category) ? (
            <Text style={styles.category}>{categoryLabel(pin.category)}</Text>
          ) : null}
        </View>
        <View style={styles.tail} />
        {stackOffset > 0 ? <View style={{ height: stackOffset }} /> : null}
      </View>
    </Marker>
  );
}

function createStyles(c) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', maxWidth: 168 },
    bubble: {
      backgroundColor: c.pin,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 8,
      maxWidth: 168,
    },
    thumb: {
      width: 48,
      height: 48,
      borderRadius: 8,
      marginBottom: 6,
      backgroundColor: c.pinThumb,
    },
    message: { color: c.pinText, fontSize: 13, fontWeight: '600' },
    category: { color: c.pinMuted, fontSize: 11, fontWeight: '600', marginTop: 3 },
    tail: {
      width: 0,
      height: 0,
      borderLeftWidth: 7,
      borderRightWidth: 7,
      borderTopWidth: 8,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: c.pin,
    },
  });
}
