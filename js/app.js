import {
  speedOfSound, computeLine, delayToDistance, msToSamples,
  toMeters, fromMeters, haasStatus,
} from './delay.js';
import {
  STORAGE_VERSION, migrateStorage, newEvent, nextLocalId, mergeGoogleEvents,
  sortEvents, eventFromGoogle, eventLabel, formatEventDate,
} from './events.js';
import * as gcal from './google.js';

const STORAGE_KEY = 'delay-kalkulacka/v1';
const $ = (id) => document.getElementById(id);

const el = {
  temp: $('temp'), tempRange: $('tempRange'),
  humidity: $('humidity'), humidityRange: $('humidityRange'),
  unit: $('unit'), sampleRate: $('sampleRate'),
  speedValue: $('speedValue'),
  distance: $('distance'), distanceRange: $('distanceRange'), distUnit: $('distUnit'),
  haas: $('haas'), haasRange: $('haasRange'),
  totalMs: $('totalMs'), propMs: $('propMs'), samples: $('samples'),
  distAlt: $('distAlt'), distAltUnit: $('distAltUnit'),
  haasStatus: $('haasStatus'),
  addLine: $('addLine'), newLine: $('newLine'), clearLines: $('clearLines'), exportCsv: $('exportCsv'),
  linesBody: $('linesBody'), linesEmpty: $('linesEmpty'), linesEventName: $('linesEventName'),
  revMs: $('revMs'), revDistance: $('revDistance'), revUnit: $('revUnit'),
  refBody: $('refBody'), refBadge: $('refBadge'),
  // Akce
  eventSelect: $('eventSelect'), eventsEmpty: $('eventsEmpty'), eventForm: $('eventForm'),
  newEvent: $('newEvent'), deleteEvent: $('deleteEvent'),
  eventName: $('eventName'), eventStart: $('eventStart'), eventLocation: $('eventLocation'), eventNote: $('eventNote'),
  eventOrigin: $('eventOrigin'),
  // Google
  googlePanel: $('googlePanel'), googleClientId: $('googleClientId'),
  googleSignIn: $('googleSignIn'), googleSignOut: $('googleSignOut'),
  googleTools: $('googleTools'), googleCalendar: $('googleCalendar'), googleRange: $('googleRange'),
  googleLoad: $('googleLoad'), googleImportAll: $('googleImportAll'),
  googleStatus: $('googleStatus'), googleList: $('googleList'),
};

// --- Stav ------------------------------------------------------------------

/** Akce; každá drží vlastní delay linky (vzdálenost vždy v metrech). */
let events = [];
let activeId = null;
let nextLineId = 1;
let google = { clientId: '', calendarId: 'primary' };
/** Naposledy načtené události z Google (jen v paměti, po obnovení stránky se načtou znovu). */
let googleItems = [];

const activeEvent = () => events.find((e) => e.id === activeId) ?? null;
const lines = () => activeEvent()?.lines ?? [];

// --- Formátování -----------------------------------------------------------

const nf = (digits) => new Intl.NumberFormat('cs-CZ', {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});
const fmt1 = nf(1);
const fmt2 = nf(2);
const fmt0 = nf(0);

const num = (input, fallback = 0) => {
  const v = Number.parseFloat(input.value);
  return Number.isFinite(v) ? v : fallback;
};

// --- Ukládání --------------------------------------------------------------

function conditions() {
  return {
    tempC: num(el.temp, 20),
    humidity: num(el.humidity, 50),
    unit: el.unit.value,
    sampleRate: Number(el.sampleRate.value),
  };
}

function save() {
  const c = conditions();
  const payload = {
    version: STORAGE_VERSION,
    settings: {
      temp: c.tempC, humidity: c.humidity, unit: c.unit, sampleRate: c.sampleRate,
      distance: num(el.distance, 0), haas: num(el.haas, 0), revMs: num(el.revMs, 0),
    },
    activeId,
    google,
    events,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Soukromý režim prohlížeče – aplikace funguje dál, jen bez ukládání.
  }
}

function load() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    data = null;
  }
  const state = migrateStorage(data);
  const s = state.settings;

  if (Number.isFinite(s.temp)) el.temp.value = s.temp;
  if (Number.isFinite(s.humidity)) el.humidity.value = s.humidity;
  if (s.unit) el.unit.value = s.unit;
  if (Number.isFinite(s.sampleRate)) el.sampleRate.value = String(s.sampleRate);
  if (Number.isFinite(s.distance)) el.distance.value = s.distance;
  if (Number.isFinite(s.haas)) el.haas.value = s.haas;
  if (Number.isFinite(s.revMs)) el.revMs.value = s.revMs;

  events = sortEvents(state.events);
  activeId = state.activeId;
  nextLineId = state.nextLineId;
  google = state.google;
  el.googleClientId.value = google.clientId;
}

// --- Přepočet --------------------------------------------------------------

function render() {
  const c = conditions();
  const speed = speedOfSound(c.tempC, c.humidity);
  el.speedValue.textContent = fmt1.format(speed);

  const unitLabel = c.unit === 'ft' ? 'ft' : 'm';
  const otherLabel = c.unit === 'ft' ? 'm' : 'ft';
  el.distUnit.textContent = unitLabel;
  el.revUnit.textContent = unitLabel;
  document.querySelectorAll('[data-unit]').forEach((n) => { n.textContent = unitLabel; });

  // Hlavní výpočet
  const distance = num(el.distance, 0);
  const haas = num(el.haas, 0);
  const r = computeLine({ distance, unit: c.unit, haas, tempC: c.tempC, humidity: c.humidity, sampleRate: c.sampleRate });

  el.totalMs.textContent = fmt1.format(r.totalMs);
  el.propMs.textContent = fmt1.format(r.propagationMs);
  el.samples.textContent = fmt0.format(Math.round(r.samples));
  el.distAlt.textContent = fmt1.format(fromMeters(r.meters, c.unit === 'ft' ? 'm' : 'ft'));
  el.distAltUnit.textContent = otherLabel;

  const status = haasStatus(haas);
  el.haasStatus.textContent = status.text;
  el.haasStatus.dataset.level = status.level;

  // Zpětný převod
  const revMeters = delayToDistance(num(el.revMs, 0), speed);
  el.revDistance.textContent = fmt1.format(fromMeters(revMeters, c.unit));

  renderEvents();
  renderLines(c, speed);
  renderReference(c, speed);
  save();
}

// --- Akce ------------------------------------------------------------------

/** ISO řetězec → hodnota pro <input type="datetime-local"> v místním čase. */
function toLocalInput(event) {
  if (!event?.start) return '';
  if (event.allDay) return `${event.start.slice(0, 10)}T00:00`;
  const d = new Date(event.start);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderEvents() {
  // Změna termínu může změnit pořadí, seznam držíme vždy seřazený.
  events = sortEvents(events);
  const active = activeEvent();
  el.eventsEmpty.hidden = events.length > 0;
  el.eventSelect.hidden = events.length === 0;
  el.eventForm.hidden = !active;
  el.deleteEvent.disabled = !active;

  el.eventSelect.replaceChildren(...events.map((e) => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = eventLabel(e);
    opt.selected = e.id === activeId;
    return opt;
  }));

  if (active) {
    // Pole přepisujeme jen když se hodnota liší, aby uživateli neuskočil kurzor při psaní.
    setIfChanged(el.eventName, active.name);
    setIfChanged(el.eventStart, toLocalInput(active));
    setIfChanged(el.eventLocation, active.location);
    setIfChanged(el.eventNote, active.note);
    el.eventOrigin.hidden = !active.googleId;
    el.eventOrigin.dataset.level = 'ok';
    el.eventOrigin.textContent = active.googleId
      ? 'Převzato z Google kalendáře. Při dalším načtení se název, termín a místo aktualizují podle kalendáře; delay linky zůstanou.'
      : '';
    el.linesEventName.textContent = `– ${active.name}`;
  } else {
    el.eventOrigin.hidden = true;
    el.linesEventName.textContent = '';
  }
}

function setIfChanged(input, value) {
  if (input.value !== value && document.activeElement !== input) input.value = value;
}

function selectEvent(id) {
  activeId = id;
  render();
}

function createEvent(overrides = {}) {
  const e = newEvent(nextLocalId(events), overrides);
  events = sortEvents([...events, e]);
  activeId = e.id;
  render();
  return e;
}

function ensureEvent() {
  return activeEvent() ?? createEvent();
}

function updateActive(patch) {
  const active = activeEvent();
  if (!active) return;
  Object.assign(active, patch);
  render();
}

el.eventSelect.addEventListener('change', () => selectEvent(el.eventSelect.value));
el.newEvent.addEventListener('click', () => {
  createEvent();
  el.eventName.focus();
  el.eventName.select();
});
el.deleteEvent.addEventListener('click', () => {
  const active = activeEvent();
  if (!active) return;
  const count = active.lines.length;
  const detail = count > 0 ? ` včetně ${count} delay linek` : '';
  if (!confirm(`Smazat akci „${active.name}“${detail}? Z Google kalendáře se nic nemaže.`)) return;
  events = events.filter((e) => e.id !== active.id);
  activeId = events[0]?.id ?? null;
  render();
});

el.eventName.addEventListener('input', () => {
  const active = activeEvent();
  if (!active) return;
  active.name = el.eventName.value.trim().slice(0, 120) || 'Nová akce';
  // Přejmenování se promítne do seznamu a nadpisu linek bez plného překreslení tabulky.
  const opt = el.eventSelect.querySelector(`option[value="${CSS.escape(active.id)}"]`);
  if (opt) opt.textContent = eventLabel(active);
  el.linesEventName.textContent = `– ${active.name}`;
  save();
});
el.eventStart.addEventListener('change', () => {
  const v = el.eventStart.value;
  updateActive(v ? { start: v, allDay: false, end: null } : { start: null, end: null, allDay: false });
});
el.eventLocation.addEventListener('input', () => {
  const active = activeEvent();
  if (active) { active.location = el.eventLocation.value.trim().slice(0, 120); save(); }
});
el.eventNote.addEventListener('input', () => {
  const active = activeEvent();
  if (active) { active.note = el.eventNote.value.trim().slice(0, 120); save(); }
});

// --- Google kalendář -------------------------------------------------------

function googleStatus(text, level = 'ok') {
  el.googleStatus.hidden = !text;
  el.googleStatus.textContent = text;
  el.googleStatus.dataset.level = level;
}

function setSignedIn(signedIn) {
  el.googleSignIn.hidden = signedIn;
  el.googleSignOut.hidden = !signedIn;
  el.googleTools.hidden = !signedIn;
  if (!signedIn) {
    googleItems = [];
    el.googleList.replaceChildren();
    el.googleImportAll.hidden = true;
  }
}

async function busy(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } catch (err) {
    googleStatus(err?.message || String(err), 'bad');
  } finally {
    button.disabled = false;
  }
}

el.googleClientId.addEventListener('change', () => {
  google.clientId = el.googleClientId.value.trim();
  save();
});

el.googleSignIn.addEventListener('click', () => busy(el.googleSignIn, async () => {
  google.clientId = el.googleClientId.value.trim();
  save();
  googleStatus('Otevírám přihlášení Google…');
  await gcal.signIn(google.clientId);
  googleStatus('Načítám seznam kalendářů…');
  const calendars = await gcal.listCalendars();
  el.googleCalendar.replaceChildren(...calendars.map((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.primary ? `${c.summary} (hlavní)` : c.summary;
    return opt;
  }));
  const known = calendars.some((c) => c.id === google.calendarId);
  el.googleCalendar.value = known ? google.calendarId : (calendars.find((c) => c.primary)?.id ?? calendars[0]?.id ?? '');
  google.calendarId = el.googleCalendar.value || 'primary';
  save();
  setSignedIn(true);
  googleStatus('Přihlášeno. Vyberte kalendář a načtěte události.');
  await loadGoogleEvents();
}));

el.googleSignOut.addEventListener('click', () => {
  gcal.signOut();
  setSignedIn(false);
  googleStatus('Odhlášeno.');
});

el.googleCalendar.addEventListener('change', () => {
  google.calendarId = el.googleCalendar.value;
  save();
  busy(el.googleLoad, loadGoogleEvents);
});

el.googleLoad.addEventListener('click', () => busy(el.googleLoad, loadGoogleEvents));

el.googleImportAll.addEventListener('click', () => {
  importGoogle(googleItems);
});

function rangeFromSelect() {
  const days = Number(el.googleRange.value);
  const day = 86_400_000;
  const now = Date.now();
  return days >= 0
    ? { timeMin: new Date(now - day), timeMax: new Date(now + days * day) }
    : { timeMin: new Date(now + days * day), timeMax: new Date(now + 365 * day) };
}

async function loadGoogleEvents() {
  if (!gcal.isSignedIn()) {
    setSignedIn(false);
    googleStatus('Přihlášení vypršelo, přihlaste se znovu.', 'warn');
    return;
  }
  googleStatus('Načítám události…');
  googleItems = (await gcal.listEvents(google.calendarId, rangeFromSelect()))
    .filter((item) => eventFromGoogle(item, google.calendarId));
  renderGoogleList();
  googleStatus(googleItems.length === 0
    ? 'V tomto období nejsou v kalendáři žádné události.'
    : `Načteno ${googleItems.length} událostí. Klepnutím na „Převzít“ z ní uděláte akci.`);
}

function renderGoogleList() {
  el.googleImportAll.hidden = googleItems.length === 0;
  el.googleList.replaceChildren(...googleItems.map((item) => {
    const g = eventFromGoogle(item, google.calendarId);
    const existing = events.find((e) => e.googleId === g.googleId);
    const li = document.createElement('li');

    const info = document.createElement('div');
    info.className = 'event-info';
    const title = document.createElement('strong');
    title.textContent = g.name;
    const meta = document.createElement('span');
    meta.className = 'event-meta';
    meta.textContent = [formatEventDate(g), g.location].filter(Boolean).join(' · ');
    info.append(title, meta);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = existing ? 'btn btn-ghost' : 'btn';
    btn.textContent = existing ? (existing.id === activeId ? 'Vybráno' : 'Otevřít') : 'Převzít';
    btn.disabled = Boolean(existing) && existing.id === activeId;
    btn.addEventListener('click', () => importGoogle([item], g.googleId));

    li.append(info, btn);
    if (existing) li.classList.add('is-imported');
    return li;
  }));
}

/** Sloučí vybrané události do akcí a přepne na tu, která byla vybrána (nebo první novou). */
function importGoogle(items, focusGoogleId = null) {
  const before = new Set(events.map((e) => e.id));
  const { events: merged, added, updated } = mergeGoogleEvents(events, items, google.calendarId);
  events = merged;

  const focus = focusGoogleId
    ? events.find((e) => e.googleId === focusGoogleId)
    : events.find((e) => !before.has(e.id));
  if (focus) activeId = focus.id;

  render();
  renderGoogleList();
  const parts = [];
  if (added) parts.push(`${added} nových`);
  if (updated) parts.push(`${updated} aktualizovaných`);
  googleStatus(parts.length ? `Převzato: ${parts.join(', ')}.` : 'Akce už je převzatá a je aktuální.');
}

// --- Delay linky -----------------------------------------------------------

function renderLines(c, speed) {
  const list = lines();
  el.linesBody.replaceChildren();
  el.linesEmpty.hidden = list.length > 0;

  for (const line of list) {
    const prop = (line.meters / speed) * 1000;
    const total = prop + line.haas;
    const tr = document.createElement('tr');

    tr.append(
      cell(textInput(line.name, (v) => { line.name = v; save(); })),
      cell(numberInput(fromMeters(line.meters, c.unit), 0.1, (v) => { line.meters = toMeters(v, c.unit); render(); })),
      cell(numberInput(line.haas, 1, (v) => { line.haas = v; render(); })),
      cell(fmt1.format(prop)),
      cell(fmt1.format(total), 'total'),
      cell(fmt0.format(Math.round(msToSamples(total, c.sampleRate)))),
      cell(removeButton(line.id)),
    );
    el.linesBody.append(tr);
  }
}

function renderReference(c, speed) {
  const step = c.unit === 'ft' ? 25 : 10;
  const count = 12;
  el.refBadge.textContent = `bez offsetu · ${c.sampleRate / 1000} kHz`;
  el.refBody.replaceChildren();

  for (let i = 1; i <= count; i++) {
    const value = i * step;
    const ms = (toMeters(value, c.unit) / speed) * 1000;
    const tr = document.createElement('tr');
    tr.append(
      cell(`${fmt0.format(value)} ${c.unit === 'ft' ? 'ft' : 'm'}`),
      cell(`${fmt2.format(ms)} ms`),
      cell(fmt0.format(Math.round(msToSamples(ms, c.sampleRate)))),
    );
    el.refBody.append(tr);
  }
}

// --- Pomocníci pro DOM -----------------------------------------------------

function cell(content, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.append(content);
  return td;
}

function textInput(value, onChange) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.maxLength = 40;
  input.addEventListener('input', () => onChange(input.value));
  return input;
}

function numberInput(value, step, onChange) {
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = Number(value).toFixed(step < 1 ? 1 : 0);
  input.addEventListener('change', () => {
    const v = Number.parseFloat(input.value);
    if (Number.isFinite(v)) onChange(v);
  });
  return input;
}

function removeButton(id) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-icon';
  btn.title = 'Odebrat linku';
  btn.setAttribute('aria-label', 'Odebrat linku');
  btn.textContent = '×';
  btn.addEventListener('click', () => {
    const active = activeEvent();
    if (active) active.lines = active.lines.filter((l) => l.id !== id);
    render();
  });
  return btn;
}

// --- Akce nad linkami ------------------------------------------------------

function addLine(meters, haas) {
  // Bez akce linky nemají kam patřit – založíme ji automaticky.
  const event = ensureEvent();
  // Číslujeme podle rostoucího id, aby po mazání nevznikaly duplicitní názvy.
  event.lines.push({ id: nextLineId, name: `Delay ${nextLineId++}`, meters, haas });
  render();
}

function exportCsv() {
  const c = conditions();
  const speed = speedOfSound(c.tempC, c.humidity);
  const active = activeEvent();
  const rows = [
    ['Nazev', 'Vzdalenost_m', 'Offset_ms', 'Sireni_ms', 'Celkem_ms', `Vzorky_${c.sampleRate}Hz`],
    ...lines().map((l) => {
      const prop = (l.meters / speed) * 1000;
      const total = prop + l.haas;
      return [
        l.name.replace(/[";\r\n]/g, ' '),
        l.meters.toFixed(2), l.haas.toFixed(1),
        prop.toFixed(2), total.toFixed(2),
        String(Math.round(msToSamples(total, c.sampleRate))),
      ];
    }),
    [],
    [`Teplota_C=${c.tempC}`, `Vlhkost_%=${c.humidity}`, `Rychlost_zvuku_m_s=${speed.toFixed(2)}`],
  ];
  if (active) {
    rows.push([`Akce=${active.name.replace(/[";\r\n]/g, ' ')}`, `Termin=${formatEventDate(active)}`, `Misto=${active.location.replace(/[";\r\n]/g, ' ')}`]);
  }
  const csv = rows.map((r) => r.join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = active ? `delay-${slug(active.name)}.csv` : 'delay-linky.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function slug(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'akce';
}

// --- Propojení ovládacích prvků -------------------------------------------

/** Spáruje číselné pole s posuvníkem, aby držely stejnou hodnotu. */
function pair(input, range) {
  input.addEventListener('input', () => { range.value = input.value; render(); });
  range.addEventListener('input', () => { input.value = range.value; render(); });
}

function syncRanges() {
  el.tempRange.value = el.temp.value;
  el.humidityRange.value = el.humidity.value;
  el.haasRange.value = el.haas.value;
  el.distanceRange.value = el.distance.value;
}

function updateDistanceRange() {
  // Ve stopách dává smysl širší rozsah posuvníku než v metrech.
  el.distanceRange.max = el.unit.value === 'ft' ? '650' : '200';
}

pair(el.temp, el.tempRange);
pair(el.humidity, el.humidityRange);
pair(el.distance, el.distanceRange);
pair(el.haas, el.haasRange);

el.sampleRate.addEventListener('change', render);
el.revMs.addEventListener('input', render);

el.unit.addEventListener('change', () => {
  // Zadanou vzdálenost převedeme, ať uživatel nepřijde o rozpracovanou hodnotu.
  const from = el.unit.value === 'ft' ? 'm' : 'ft';
  const meters = toMeters(num(el.distance, 0), from);
  el.distance.value = fromMeters(meters, el.unit.value).toFixed(1);
  updateDistanceRange();
  syncRanges();
  render();
});

el.addLine.addEventListener('click', () => {
  addLine(toMeters(num(el.distance, 0), el.unit.value), num(el.haas, 0));
});
el.newLine.addEventListener('click', () => addLine(0, 0));
el.clearLines.addEventListener('click', () => {
  const active = activeEvent();
  if (!active || active.lines.length === 0) return;
  if (confirm(`Opravdu smazat všechny delay linky akce „${active.name}“?`)) {
    active.lines = [];
    render();
  }
});
el.exportCsv.addEventListener('click', exportCsv);

load();
updateDistanceRange();
syncRanges();
setSignedIn(false);
render();
