function cityPoint(latitude, longitude, city) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return {
    latitude: lat,
    longitude: lng,
    city: typeof city === 'string' ? city.trim() : '',
  };
}

async function readCity(url, pick) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    return pick(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function lookupIpCity() {
  return readCity(
    'https://get.geojs.io/v1/ip/geo.json',
    (body) => cityPoint(body.latitude, body.longitude, body.city),
  ).then((point) => point || readCity(
    'https://ipwho.is/',
    (body) => (body && body.success ? cityPoint(body.latitude, body.longitude, body.city) : null),
  ));
}
