import { API_URL } from './config';

async function readError(response) {
  try {
    const body = await response.json();
    const errors = body.errors || {};
    const first = Object.values(errors)[0];
    if (Array.isArray(first) && first[0]) {
      return first[0];
    }
    return body.message || 'Нещо се обърка.';
  } catch {
    return 'Нещо се обърка.';
  }
}

export async function fetchCityCounts() {
  const response = await fetch(`${API_URL}/api/cities`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const body = await response.json();
  const counts = {};
  (body.cities || []).forEach((city) => {
    counts[city.name] = Number(city.count) || 0;
  });
  return counts;
}

export async function fetchPins(region, device) {
  const params = new URLSearchParams({
    north: String(region.latitude + region.latitudeDelta / 2),
    south: String(region.latitude - region.latitudeDelta / 2),
    east: String(region.longitude + region.longitudeDelta / 2),
    west: String(region.longitude - region.longitudeDelta / 2),
  });

  const response = await fetch(`${API_URL}/api/pins?${params}`, {
    headers: {
      Accept: 'application/json',
      'X-Device-Id': device,
    },
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const body = await response.json();
  return body.pins || [];
}

export async function createPin({ message, latitude, longitude, duration, category, kind, startsAt, image, device }) {
  const form = new FormData();
  form.append('message', message);
  form.append('latitude', String(latitude));
  form.append('longitude', String(longitude));
  form.append('duration', duration);
  if (kind) {
    form.append('kind', kind);
  }
  if (startsAt) {
    form.append('starts_at', startsAt);
  }
  if (category) {
    form.append('category', category);
  }

  if (image) {
    const local = await fetch(image);
    const blob = await local.blob();
    form.append('image', blob, 'pin.jpg');
  }

  const response = await fetch(`${API_URL}/api/pins`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-Device-Id': device,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function fetchReplies(id, device) {
  const response = await fetch(`${API_URL}/api/pins/${id}/replies`, {
    headers: {
      Accept: 'application/json',
      'X-Device-Id': device,
    },
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const body = await response.json();
  return body.replies || [];
}

export async function createReply(id, message, device, authorOnly = false) {
  const response = await fetch(`${API_URL}/api/pins/${id}/replies`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Device-Id': device,
    },
    body: JSON.stringify({ message, author_only: authorOnly }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function reportPin(id, device) {
  const response = await fetch(`${API_URL}/api/pins/${id}/report`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-Device-Id': device,
    },
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function deletePin(id, device) {
  const response = await fetch(`${API_URL}/api/pins/${id}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      'X-Device-Id': device,
    },
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}
