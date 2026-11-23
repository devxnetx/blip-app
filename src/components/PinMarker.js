import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { useTheme } from '../theme';
import { timeAgo, upcomingLabel } from '../time';

function PinMarker({ pin, onPress, stackX = 0, stackY = 0, tail = 'center', now = Date.now(), stamp = 0, label = '' }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tracking, setTracking] = useState(true);
  const [height, setHeight] = useState(0);
  const freeze = useRef(null);
  const laidOut = useRef('');
  const posted = upcomingLabel(pin, now) || timeAgo(pin.created_at, now);
  const kind = [label, posted].filter(Boolean).join(' · ');
  const layoutKey = `${pin.id}:${posted}:${label}:${pin.image_url || ''}:${stackX}:${stackY}:${tail}:${stamp}`;

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
  }, [stackX, stackY, tail, pin.image_url, pin.message, pin.category, label, posted, stamp, colors]);

  const cardHeight = height || (pin.image_url ? 96 : 64);

  return (
    <Marker
      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={{ x: stackX || 0, y: -(cardHeight / 2 + (stackY || 0)) }}
      tracksViewChanges={tracking}
      zIndex={1000 + (stackY || 0) + (stackX > 0 ? 1 : 0)}
      onPress={onPress}
    >
      <View style={styles.shift} collapsable={false} pointerEvents="box-none">
        {Platform.OS !== 'ios' && stackX > 0 ? <View pointerEvents="none" style={{ width: stackX * 2 }} /> : null}
        <View style={styles.wrap} collapsable={false} pointerEvents="box-none">
          <View
            style={[
              styles.card,
              tail === 'right' && styles.cardRight,
              tail === 'left' && styles.cardLeft,
            ]}
            collapsable={false}
            onLayout={(event) => {
              const next = Math.round(event.nativeEvent.layout.height);
              if (next && next !== height) {
                setHeight(next);
              }
              onLayout();
            }}
          >
            <View style={styles.bubble}>
              {pin.image_url ? (
                <Image
                  source={{ uri: pin.image_url }}
                  style={styles.thumb}
                  onLoad={paint}
                  onError={paint}
                />
              ) : null}
              <View style={styles.copy}>
                <Text numberOfLines={2} style={styles.message}>{pin.message}</Text>
                {kind ? <Text numberOfLines={2} style={styles.category}>{kind}</Text> : null}
              </View>
            </View>
            <View style={[
              styles.tail,
              tail === 'right' && styles.tailRight,
              tail === 'left' && styles.tailLeft,
            ]} />
          </View>
          {Platform.OS !== 'ios' && stackY > 0 ? <View pointerEvents="none" style={{ height: stackY }} /> : null}
        </View>
        {Platform.OS !== 'ios' && stackX < 0 ? <View pointerEvents="none" style={{ width: -stackX * 2 }} /> : null}
      </View>
    </Marker>
  );
}

export default memo(PinMarker, (prev, next) => (
  prev.pin.id === next.pin.id
  && prev.pin.message === next.pin.message
  && prev.pin.category === next.pin.category
  && prev.label === next.label
  && prev.pin.image_url === next.pin.image_url
  && prev.pin.created_at === next.pin.created_at
  && prev.pin.kind === next.pin.kind
  && prev.pin.starts_at === next.pin.starts_at
  && prev.stackX === next.stackX
  && prev.stackY === next.stackY
  && prev.tail === next.tail
  && prev.stamp === next.stamp
  && (upcomingLabel(prev.pin, prev.now) || timeAgo(prev.pin.created_at, prev.now))
    === (upcomingLabel(next.pin, next.now) || timeAgo(next.pin.created_at, next.now))
));

function createStyles(c) {
  return StyleSheet.create({
    shift: { flexDirection: 'row', alignItems: 'flex-end' },
    wrap: { alignItems: 'center', maxWidth: 240 },
    card: { alignItems: 'center', maxWidth: 240 },
    cardRight: { alignItems: 'flex-end' },
    cardLeft: { alignItems: 'flex-start' },
    bubble: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: c.pin,
      borderRadius: 14,
      paddingHorizontal: 8,
      paddingVertical: 8,
      maxWidth: 240,
    },
    thumb: {
      width: 72,
      height: 72,
      borderRadius: 10,
      marginRight: 8,
      backgroundColor: c.pinThumb,
    },
    copy: { flexShrink: 1, maxWidth: 148 },
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
    tailRight: { marginRight: 14 },
    tailLeft: { marginLeft: 14 },
  });
}
