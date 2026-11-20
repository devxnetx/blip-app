import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { useTheme } from '../theme';
import { timeAgo } from '../time';

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

function PinMarker({ pin, onPress, stackOffset = 0, now = Date.now(), stamp = 0 }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tracking, setTracking] = useState(true);
  const freeze = useRef(null);
  const laidOut = useRef('');
  const posted = timeAgo(pin.created_at, now);
  const kind = [categoryLabel(pin.category), posted].filter(Boolean).join(' · ');
  const layoutKey = `${pin.id}:${posted}:${pin.image_url || ''}:${stackOffset}:${stamp}`;

  function paint() {
    setTracking(true);
    clearTimeout(freeze.current);
    freeze.current = setTimeout(() => setTracking(false), pin.image_url ? 800 : 500);
  }

  function onLayout() {
    if (laidOut.current === layoutKey) {
      return;
    }
    laidOut.current = layoutKey;
    paint();
  }

  useEffect(() => {
    paint();
    return () => clearTimeout(freeze.current);
  }, [stackOffset, pin.image_url, pin.message, pin.category, posted, stamp, colors]);

  return (
    <Marker
      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracking}
      zIndex={stackOffset + 1}
      onPress={onPress}
    >
      <View style={styles.wrap} collapsable={false} onLayout={onLayout}>
        <View style={styles.bubble}>
          {pin.image_url ? (
            <Image
              source={{ uri: pin.image_url }}
              style={styles.thumb}
              onLoad={paint}
              onError={paint}
            />
          ) : null}
          <Text numberOfLines={2} style={styles.message}>{pin.message}</Text>
          {kind ? <Text numberOfLines={1} style={styles.category}>{kind}</Text> : null}
        </View>
        <View style={styles.tail} />
        {stackOffset > 0 ? <View style={{ height: stackOffset }} /> : null}
      </View>
    </Marker>
  );
}

export default memo(PinMarker, (prev, next) => (
  prev.pin.id === next.pin.id
  && prev.pin.message === next.pin.message
  && prev.pin.category === next.pin.category
  && prev.pin.image_url === next.pin.image_url
  && prev.pin.created_at === next.pin.created_at
  && prev.stackOffset === next.stackOffset
  && prev.stamp === next.stamp
  && timeAgo(prev.pin.created_at, prev.now) === timeAgo(next.pin.created_at, next.now)
));

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
