const REVEAL_DELTA = 0.012;
const CELL_DIVISOR = 7;
const SAME_SPOT = 0.00015;
const STACK_SIDE_BY_SIDE = 4;
const STACK_SHIFT = 124;
const STACK_FETCH_PAD_PX = 360;

function pinHeight(pin) {
  const upcoming = pin.kind === 'upcoming' && pin.starts_at && new Date(pin.starts_at).getTime() > Date.now();
  const text = 40 + (pin.category ? 18 : 0) + (upcoming ? 32 : 0);

  return Math.max(text, pin.image_url ? 72 : 0) + 28;
}

function sameSpot(a, b) {
  return Math.abs(a.latitude - b.latitude) < SAME_SPOT
    && Math.abs(a.longitude - b.longitude) < SAME_SPOT;
}

function placeGroup(group) {
  if (group.length < STACK_SIDE_BY_SIDE) {
    let y = 0;
    return group.map((pin) => {
      const placed = { ...pin, stackX: 0, stackY: y };
      y += pinHeight(pin);
      return placed;
    });
  }

  const placed = [];
  let y = 0;
  for (let index = 0; index < group.length; index += 2) {
    const left = group[index];
    const right = group[index + 1];
    const rowHeight = Math.max(pinHeight(left), right ? pinHeight(right) : 0);
    if (!right) {
      placed.push({ ...left, stackX: 0, stackY: y });
    } else {
      placed.push({ ...left, stackX: -STACK_SHIFT, stackY: y });
      placed.push({ ...right, stackX: STACK_SHIFT, stackY: y });
    }
    y += rowHeight;
  }

  return placed;
}

function stackPins(pins) {
  const sorted = [...pins].sort((a, b) => a.id - b.id);
  const groups = [];

  sorted.forEach((pin) => {
    let group = groups.find((item) => sameSpot(item, pin));
    if (!group) {
      group = { latitude: pin.latitude, longitude: pin.longitude, pins: [] };
      groups.push(group);
    }
    group.pins.push(pin);
  });

  return groups.flatMap((group) => placeGroup(group.pins));
}

export function regionForPinLoad(region, screenHeight) {
  if (!region || !region.latitudeDelta || region.latitudeDelta > REVEAL_DELTA) {
    return region;
  }

  const height = Math.max(screenHeight || 800, 1);
  const pad = region.latitudeDelta * (STACK_FETCH_PAD_PX / height);

  return {
    ...region,
    latitude: region.latitude + pad / 2,
    latitudeDelta: region.latitudeDelta + pad,
  };
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
      singles.push({ ...group[0], stackX: 0, stackY: 0 });
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
