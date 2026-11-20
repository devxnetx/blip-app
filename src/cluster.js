const REVEAL_DELTA = 0.012;
const CELL_DIVISOR = 7;
const SAME_SPOT = 0.00015;

function pinHeight(pin) {
  const upcoming = pin.kind === 'upcoming' && pin.starts_at && new Date(pin.starts_at).getTime() > Date.now();
  const text = 40 + (pin.category ? 18 : 0) + (upcoming ? 32 : 0);

  return Math.max(text, pin.image_url ? 72 : 0) + 28;
}

function sameSpot(a, b) {
  return Math.abs(a.latitude - b.latitude) < SAME_SPOT
    && Math.abs(a.longitude - b.longitude) < SAME_SPOT;
}

function stackPins(pins) {
  const sorted = [...pins].sort((a, b) => a.id - b.id);
  const stacks = [];
  const singles = [];

  sorted.forEach((pin) => {
    let stack = stacks.find((item) => sameSpot(item, pin));
    if (!stack) {
      stack = { latitude: pin.latitude, longitude: pin.longitude, offset: 0 };
      stacks.push(stack);
    }
    singles.push({ ...pin, stackOffset: stack.offset });
    stack.offset += pinHeight(pin);
  });

  return singles;
}

export function groupPins(pins, region) {
  if (!pins.length || !region || !region.latitudeDelta) {
    return { clusters: [], singles: [] };
  }

  if (region.latitudeDelta <= REVEAL_DELTA) {
    return { clusters: [], singles: stackPins(pins) };
  }

  const latCell = region.latitudeDelta / CELL_DIVISOR;
  const lngCell = (region.longitudeDelta || region.latitudeDelta) / CELL_DIVISOR;
  const cells = new Map();

  pins.forEach((pin) => {
    const key = `${Math.floor(pin.latitude / latCell)}:${Math.floor(pin.longitude / lngCell)}`;
    const group = cells.get(key);
    if (group) {
      group.push(pin);
    } else {
      cells.set(key, [pin]);
    }
  });

  const clusters = [];
  const singles = [];
  cells.forEach((group, key) => {
    if (group.length === 1) {
      singles.push({ ...group[0], stackOffset: 0 });
      return;
    }
    const latitude = group.reduce((sum, pin) => sum + pin.latitude, 0) / group.length;
    const longitude = group.reduce((sum, pin) => sum + pin.longitude, 0) / group.length;
    const lats = group.map((pin) => pin.latitude);
    const lngs = group.map((pin) => pin.longitude);
    clusters.push({
      id: key,
      count: group.length,
      latitude,
      longitude,
      latitudeSpan: Math.max(...lats) - Math.min(...lats),
      longitudeSpan: Math.max(...lngs) - Math.min(...lngs),
    });
  });

  return { clusters, singles };
}

export function zoomRegion(region, cluster) {
  const span = Math.max(cluster.latitudeSpan || 0, cluster.longitudeSpan || 0);
  const latitudeDelta = Math.min(
    region.latitudeDelta * 0.45,
    Math.max(span * 1.8, 0.006),
  );
  const ratio = region.longitudeDelta && region.latitudeDelta
    ? region.longitudeDelta / region.latitudeDelta
    : 1;

  return {
    latitude: cluster.latitude,
    longitude: cluster.longitude,
    latitudeDelta,
    longitudeDelta: latitudeDelta * ratio,
  };
}
