/**
 * Akce (události) – čisté funkce bez DOM.
 *
 * Akce sdružuje delay linky pro jedno konkrétní ozvučení (koncert, ples, konference).
 * Může vzniknout ručně nebo převzetím události z Google kalendáře, kam se
 * synchronizuje nativní kalendář v telefonu.
 */

export const STORAGE_VERSION = 2;

/** Maximální délka textových polí ukládaných do prohlížeče. */
const MAX_TEXT = 120;

const text = (value, fallback = '') => String(value ?? fallback).trim().slice(0, MAX_TEXT);

/** Vytvoří prázdnou akci. `id` musí být unikátní v rámci úložiště. */
export function newEvent(id, overrides = {}) {
  return {
    id,
    name: text(overrides.name, 'Nová akce') || 'Nová akce',
    start: overrides.start ?? null,        // ISO 8601, nebo null
    end: overrides.end ?? null,            // ISO 8601, nebo null
    allDay: Boolean(overrides.allDay),
    location: text(overrides.location),
    note: text(overrides.note),
    googleId: overrides.googleId ?? null,  // id události v Google kalendáři
    calendarId: overrides.calendarId ?? null,
    lines: Array.isArray(overrides.lines) ? overrides.lines : [],
  };
}

/** Očistí jednu delay linku načtenou z úložiště; neplatné vrací null. */
export function sanitizeLine(raw, id) {
  if (!raw || !Number.isFinite(raw.meters)) return null;
  return {
    id,
    name: String(raw.name ?? `Delay ${id}`).slice(0, 40),
    meters: Number(raw.meters),
    haas: Number.isFinite(raw.haas) ? Number(raw.haas) : 0,
  };
}

/**
 * Převede data z úložiště (v1 i v2) na aktuální strukturu.
 * Vrací { settings, events, activeId, google, nextLineId }.
 *
 * v1: { temp, humidity, unit, sampleRate, distance, haas, revMs, lines }
 * v2: { version: 2, settings, events, activeId, google }
 */
export function migrateStorage(data) {
  const out = { settings: {}, events: [], activeId: null, google: { clientId: '', calendarId: 'primary' }, nextLineId: 1 };
  if (!data || typeof data !== 'object') return out;

  const settingsSrc = data.version >= 2 && data.settings && typeof data.settings === 'object' ? data.settings : data;
  for (const key of ['temp', 'humidity', 'sampleRate', 'distance', 'haas', 'revMs']) {
    if (Number.isFinite(settingsSrc[key])) out.settings[key] = settingsSrc[key];
  }
  if (settingsSrc.unit === 'm' || settingsSrc.unit === 'ft') out.settings.unit = settingsSrc.unit;

  const takeLines = (raw) => {
    if (!Array.isArray(raw)) return [];
    const lines = [];
    for (const l of raw) {
      const line = sanitizeLine(l, out.nextLineId);
      if (line) {
        lines.push(line);
        out.nextLineId++;
      }
    }
    return lines;
  };

  if (data.version >= 2) {
    if (Array.isArray(data.events)) {
      out.events = data.events
        .filter((e) => e && typeof e === 'object' && e.id != null)
        .map((e) => newEvent(String(e.id), { ...e, lines: takeLines(e.lines) }));
    }
    if (data.google && typeof data.google === 'object') {
      out.google.clientId = text(data.google.clientId);
      out.google.calendarId = text(data.google.calendarId) || 'primary';
    }
    out.activeId = data.activeId != null ? String(data.activeId) : null;
  } else {
    // v1: jeden plochý seznam linek → jedna výchozí akce, ať uživatel o nic nepřijde.
    const lines = takeLines(data.lines);
    if (lines.length > 0) {
      out.events = [newEvent('local-1', { name: 'Moje akce', lines })];
    }
  }

  if (out.events.length > 0 && !out.events.some((e) => e.id === out.activeId)) {
    out.activeId = out.events[0].id;
  }
  if (out.events.length === 0) out.activeId = null;
  return out;
}

/** Vrátí nový unikátní identifikátor akce vytvořené ručně. */
export function nextLocalId(events) {
  let max = 0;
  for (const e of events) {
    const m = /^local-(\d+)$/.exec(e.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `local-${max + 1}`;
}

/**
 * Převede událost z Google Calendar API (resource `Event`) na pole akce.
 * Zrušené události a události bez začátku vrací null.
 * @see https://developers.google.com/calendar/api/v3/reference/events
 */
export function eventFromGoogle(item, calendarId = 'primary') {
  if (!item || typeof item !== 'object' || item.status === 'cancelled' || !item.id) return null;
  const start = item.start || {};
  const end = item.end || {};
  const allDay = Boolean(start.date && !start.dateTime);
  const startIso = start.dateTime || start.date || null;
  if (!startIso) return null;

  return {
    googleId: String(item.id),
    calendarId,
    name: text(item.summary, '(bez názvu)') || '(bez názvu)',
    start: startIso,
    end: end.dateTime || end.date || null,
    allDay,
    location: text(item.location),
    note: text(item.description),
  };
}

/**
 * Sloučí události z Google do seznamu akcí.
 * Existující akce se stejným googleId se aktualizují (název, čas, místo, poznámka),
 * delay linky zůstávají. Nové se přidají. Nic se nemaže – akce, která z kalendáře
 * zmizela, může stále obsahovat rozpracované linky.
 * Vrací { events, added, updated }.
 */
export function mergeGoogleEvents(events, googleItems, calendarId = 'primary') {
  const result = events.map((e) => ({ ...e }));
  let added = 0;
  let updated = 0;

  for (const item of googleItems) {
    const g = eventFromGoogle(item, calendarId);
    if (!g) continue;
    const existing = result.find((e) => e.googleId === g.googleId);
    if (existing) {
      const changed = ['name', 'start', 'end', 'allDay', 'location', 'note']
        .some((k) => existing[k] !== g[k]);
      if (changed) {
        Object.assign(existing, g);
        updated++;
      }
    } else {
      result.push(newEvent(`g-${g.googleId}`, g));
      added++;
    }
  }
  return { events: sortEvents(result), added, updated };
}

/** Seřadí akce podle začátku; akce bez data na konec, ty pak podle názvu. */
export function sortEvents(events) {
  return [...events].sort((a, b) => {
    if (a.start && b.start) return a.start.localeCompare(b.start);
    if (a.start) return -1;
    if (b.start) return 1;
    return a.name.localeCompare(b.name, 'cs');
  });
}

/** Krátký český popis termínu akce pro seznam a nadpisy. */
export function formatEventDate(event, locale = 'cs-CZ') {
  if (!event?.start) return 'bez termínu';
  const d = new Date(event.start);
  if (Number.isNaN(d.getTime())) return 'bez termínu';
  if (event.allDay) {
    // Celodenní události Google posílá jako YYYY-MM-DD; parsujeme bez posunu časové zóny.
    const [y, m, day] = event.start.split('-').map(Number);
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric' })
      .format(new Date(y, m - 1, day));
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

/** Popisek akce do rozbalovacího seznamu: "12. 10. 2026 · Název". */
export function eventLabel(event) {
  return `${formatEventDate(event)} · ${event.name}`;
}
