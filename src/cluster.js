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

function tailFor(index, count) {
  if (count < 2) {
    return 'center';
  }
  return index % 2 === 0 ? 'right' : 'left';
}

function placeGroup(group) {
  if (group.length < STACK_SIDE_BY_SIDE) {
    let y = 0;
    return group.map((pin, index) => {
      const placed = { ...pin, stackX: 0, stackY: y, tail: tailFor(index, group.length) };
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
      placed.push({ ...left, stackX: 0, stackY: y, tail: tailFor(index, group.length) });
    } else {
      placed.push({ ...left, stackX: -STACK_SHIFT, stackY: y, tail: tailFor(index, group.length) });
      placed.push({ ...right, stackX: STACK_SHIFT, stackY: y, tail: tailFor(index + 1, group.length) });
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
  if (!region || !region.latitudeDelta) {
    return region;
  }

  if (region.latitudeDelta <= REVEAL_DELTA) {
    const height = Math.max(screenHeight || 800, 1);
    const northPad = region.latitudeDelta * (STACK_FETCH_PAD_PX / height);
    const lngDelta = region.longitudeDelta || region.latitudeDelta;
    const latPad = Math.max(0.03, northPad);
    const lngPad = Math.max(0.03, lngDelta);

    return {
      ...region,
      latitude: region.latitude + northPad / 2,
      latitudeDelta: region.latitudeDelta + latPad * 2,
      longitudeDelta: lngDelta + lngPad * 2,
    };
  }

  if (region.latitudeDelta <= 0.16) {
    const lngDelta = region.longitudeDelta || region.latitudeDelta;
    const latPad = Math.min(region.latitudeDelta * 0.8, 0.045);
    const lngPad = Math.min(lngDelta * 0.8, 0.045);

    return {
      ...region,
      latitudeDelta: region.latitudeDelta + latPad * 2,
      longitudeDelta: lngDelta + lngPad * 2,
    };
  }

  return region;
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
      singles.push({ ...group[0], stackX: 0, stackY: 0, tail: 'center' });
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

export function nearbyClusters(pins, region) {
  if (!pins.length || !region || !region.latitudeDelta) {
    return [];
  }

  const lngDelta = region.longitudeDelta || region.latitudeDelta;
  const zoomedIn = region.latitudeDelta <= REVEAL_DELTA;
  const clusterDelta = zoomedIn ? 0.028 : region.latitudeDelta;
  const clusterLng = zoomedIn ? 0.028 * (lngDelta / region.latitudeDelta) : lngDelta;
  const grouped = groupPins(pins, {
    latitude: region.latitude,
    longitude: region.longitude,
    latitudeDelta: clusterDelta,
    longitudeDelta: clusterLng,
  });
  const halfLat = region.latitudeDelta / 2;
  const halfLng = lngDelta / 2;
  const marginLat = Math.min(Math.max(region.latitudeDelta, 0.028), 0.06);
  const marginLng = Math.min(Math.max(lngDelta, 0.028), 0.06);

  return grouped.clusters.filter((cluster) => (
    Math.abs(cluster.latitude - region.latitude) <= halfLat + marginLat
    && Math.abs(cluster.longitude - region.longitude) <= halfLng + marginLng
  ));
}

export function projectCluster(cluster, region, width, height, heading) {
  const lngDelta = region.longitudeDelta || region.latitudeDelta;
  const east = ((cluster.longitude - region.longitude) / lngDelta) * width;
  const south = ((region.latitude - cluster.latitude) / region.latitudeDelta) * height;
  const turn = (-(heading || 0) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);

  return {
    x: width / 2 + east * cos - south * sin,
    y: height / 2 + east * sin + south * cos,
  };
}

export function openClusterRegion(region, cluster) {
  const span = Math.max(cluster.latitudeSpan || 0, cluster.longitudeSpan || 0);
  const latitudeDelta = Math.min(Math.max(span * 2.4, 0.008), REVEAL_DELTA - 0.001);
  const ratio = region && region.longitudeDelta && region.latitudeDelta
    ? region.longitudeDelta / region.latitudeDelta
    : 1;

  return {
    latitude: cluster.latitude,
    longitude: cluster.longitude,
    latitudeDelta,
    longitudeDelta: latitudeDelta * ratio,
  };
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
