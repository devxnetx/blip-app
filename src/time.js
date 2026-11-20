export function timeAgo(createdAt, now = Date.now()) {
  const ms = now - new Date(createdAt).getTime();

  if (!Number.isFinite(ms) || ms < 45000) {
    return 'Току-що';
  }

  const minutes = Math.floor(ms / 60000);

  if (minutes < 60) {
    return minutes === 1 ? 'преди 1 мин' : `преди ${minutes} мин`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return hours === 1 ? 'преди 1 час' : `преди ${hours} часа`;
  }

  const days = Math.floor(hours / 24);

  return days === 1 ? 'преди 1 ден' : `преди ${days} дни`;
}

export function parseLocalStart(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+|T)(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function upcomingLabel(pin, now = Date.now()) {
  if (!pin || pin.kind !== 'upcoming' || !pin.starts_at) {
    return '';
  }
  const date = new Date(pin.starts_at);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now) {
    return '';
  }
  const formatted = new Intl.DateTimeFormat('bg-BG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return `Предстоящо · ${formatted}`;
}

export function timeLeft(expiresAt, now = Date.now()) {
  const ms = new Date(expiresAt).getTime() - now;

  if (!Number.isFinite(ms) || ms <= 0) {
    return 'Изтече';
  }

  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;

  if (days === 0) {
    if (hours === 0) {
      return `още ${rest} мин`;
    }
    if (rest === 0) {
      return `още ${hours} ч`;
    }
    return `още ${hours} ч ${rest} мин`;
  }

  const dayLabel = days === 1 ? '1 ден' : `${days} дни`;

  if (hours === 0 && rest === 0) {
    return `още ${dayLabel}`;
  }
  if (hours === 0) {
    return `още ${dayLabel} и ${rest} мин`;
  }

  const hourLabel = hours === 1 ? '1 час' : `${hours} часа`;

  return `още ${dayLabel} и ${hourLabel}`;
}
