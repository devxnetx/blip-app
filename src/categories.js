import { API_URL } from './config';

export const FALLBACK_CATEGORIES = [
  { id: 'seeking', label: 'Търся' },
  { id: 'lost', label: 'Загубено' },
  { id: 'warning', label: 'Внимание' },
  { id: 'free', label: 'Безплатно' },
  { id: 'other', label: 'Друго' },
];

export async function loadCategories() {
  try {
    const response = await fetch(`${API_URL}/api/categories`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return FALLBACK_CATEGORIES;
    }
    const body = await response.json();
    const rows = Array.isArray(body.categories) ? body.categories : [];
    const next = rows
      .filter((item) => item && typeof item.id === 'string' && item.id && typeof item.label === 'string' && item.label)
      .map((item) => ({ id: item.id, label: item.label }));
    return next.length ? next : FALLBACK_CATEGORIES;
  } catch {
    return FALLBACK_CATEGORIES;
  }
}
