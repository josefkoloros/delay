import test from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateStorage, newEvent, nextLocalId, eventFromGoogle, mergeGoogleEvents,
  sortEvents, formatEventDate, eventLabel, sanitizeLine,
} from '../js/events.js';

const googleItem = (over = {}) => ({
  id: 'abc123',
  status: 'confirmed',
  summary: 'Ples SDH Lhota',
  location: 'KD Lhota',
  description: 'Delay tower vzadu',
  start: { dateTime: '2026-10-17T19:00:00+02:00' },
  end: { dateTime: '2026-10-18T02:00:00+02:00' },
  ...over,
});

test('migrace v1 přenese linky do jedné výchozí akce', () => {
  const v1 = {
    temp: 18, humidity: 65, unit: 'ft', sampleRate: 96000, distance: 33, haas: 8, revMs: 120,
    lines: [{ name: 'Věž L', meters: 40, haas: 10 }, { name: 'rozbitá' }, { meters: 12 }],
  };
  const r = migrateStorage(v1);
  assert.deepEqual(r.settings, { temp: 18, humidity: 65, sampleRate: 96000, distance: 33, haas: 8, revMs: 120, unit: 'ft' });
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].name, 'Moje akce');
  assert.equal(r.events[0].lines.length, 2);
  assert.equal(r.events[0].lines[1].haas, 0);
  assert.equal(r.activeId, r.events[0].id);
  assert.equal(r.nextLineId, 3);
});

test('migrace v1 bez linek nevytvoří prázdnou akci', () => {
  const r = migrateStorage({ temp: 20, lines: [] });
  assert.equal(r.events.length, 0);
  assert.equal(r.activeId, null);
});

test('prázdné nebo poškozené úložiště vrací výchozí stav', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    const r = migrateStorage(bad);
    assert.deepEqual(r.events, []);
    assert.equal(r.google.calendarId, 'primary');
  }
});

test('migrace v2 zachová akce, aktivní akci i nastavení Google', () => {
  const v2 = {
    version: 2,
    settings: { temp: 25, unit: 'm' },
    activeId: 'g-xyz',
    google: { clientId: '123.apps.googleusercontent.com', calendarId: 'work@group.calendar.google.com' },
    events: [
      { id: 'local-1', name: 'Zkouška', lines: [{ meters: 5 }] },
      { id: 'g-xyz', name: 'Koncert', start: '2026-11-01T20:00:00+01:00', googleId: 'xyz', lines: [] },
      null, { name: 'bez id' },
    ],
  };
  const r = migrateStorage(v2);
  assert.equal(r.events.length, 2);
  assert.equal(r.activeId, 'g-xyz');
  assert.equal(r.google.clientId, '123.apps.googleusercontent.com');
  assert.equal(r.google.calendarId, 'work@group.calendar.google.com');
  assert.equal(r.events[0].lines[0].id, 1);
});

test('neexistující activeId spadne na první akci', () => {
  const r = migrateStorage({ version: 2, activeId: 'nope', events: [{ id: 'a', name: 'A' }] });
  assert.equal(r.activeId, 'a');
});

test('newEvent doplní výchozí hodnoty a ořeže texty', () => {
  const e = newEvent('local-1', { name: '  ', location: 'x'.repeat(300) });
  assert.equal(e.name, 'Nová akce');
  assert.equal(e.location.length, 120);
  assert.equal(e.googleId, null);
  assert.deepEqual(e.lines, []);
});

test('sanitizeLine odmítne linku bez vzdálenosti', () => {
  assert.equal(sanitizeLine({ name: 'x' }, 1), null);
  assert.deepEqual(sanitizeLine({ meters: 10 }, 7), { id: 7, name: 'Delay 7', meters: 10, haas: 0 });
});

test('nextLocalId pokračuje za nejvyšší lokální id', () => {
  assert.equal(nextLocalId([]), 'local-1');
  assert.equal(nextLocalId([{ id: 'local-3' }, { id: 'g-1' }, { id: 'local-1' }]), 'local-4');
});

test('eventFromGoogle převede běžnou událost', () => {
  const g = eventFromGoogle(googleItem(), 'primary');
  assert.deepEqual(g, {
    googleId: 'abc123', calendarId: 'primary', name: 'Ples SDH Lhota',
    start: '2026-10-17T19:00:00+02:00', end: '2026-10-18T02:00:00+02:00', allDay: false,
    location: 'KD Lhota', note: 'Delay tower vzadu',
  });
});

test('eventFromGoogle rozpozná celodenní událost a chybějící název', () => {
  const g = eventFromGoogle(googleItem({ summary: undefined, start: { date: '2026-12-24' }, end: { date: '2026-12-25' } }));
  assert.equal(g.allDay, true);
  assert.equal(g.start, '2026-12-24');
  assert.equal(g.name, '(bez názvu)');
});

test('eventFromGoogle ignoruje zrušené a neúplné události', () => {
  assert.equal(eventFromGoogle(googleItem({ status: 'cancelled' })), null);
  assert.equal(eventFromGoogle(googleItem({ start: {} })), null);
  assert.equal(eventFromGoogle(googleItem({ id: undefined })), null);
  assert.equal(eventFromGoogle(null), null);
});

test('mergeGoogleEvents přidá nové a aktualizuje existující, linky zachová', () => {
  const existing = [
    newEvent('g-abc123', { name: 'Starý název', googleId: 'abc123', start: '2026-10-17T18:00:00+02:00', lines: [{ id: 1, name: 'L', meters: 30, haas: 5 }] }),
    newEvent('local-1', { name: 'Ruční akce' }),
  ];
  const items = [googleItem(), googleItem({ id: 'new1', summary: 'Nová', start: { dateTime: '2026-09-30T10:00:00+02:00' }, end: {} })];
  const r = mergeGoogleEvents(existing, items, 'primary');

  assert.equal(r.added, 1);
  assert.equal(r.updated, 1);
  assert.equal(r.events.length, 3);
  const updated = r.events.find((e) => e.googleId === 'abc123');
  assert.equal(updated.name, 'Ples SDH Lhota');
  assert.equal(updated.start, '2026-10-17T19:00:00+02:00');
  assert.equal(updated.lines.length, 1, 'linky musí přežít aktualizaci');
  assert.equal(r.events.find((e) => e.id === 'local-1').name, 'Ruční akce');
  // nezměněný vstup podruhé nic neaktualizuje
  const again = mergeGoogleEvents(r.events, items, 'primary');
  assert.equal(again.added, 0);
  assert.equal(again.updated, 0);
});

test('mergeGoogleEvents nemění vstupní pole', () => {
  const existing = [newEvent('local-1', { name: 'A' })];
  mergeGoogleEvents(existing, [googleItem()]);
  assert.equal(existing.length, 1);
});

test('sortEvents řadí podle začátku, akce bez data na konec podle názvu', () => {
  const sorted = sortEvents([
    newEvent('a', { name: 'Zeta' }),
    newEvent('b', { name: 'B', start: '2026-12-01' }),
    newEvent('c', { name: 'Alfa' }),
    newEvent('d', { name: 'D', start: '2026-01-01T10:00:00Z' }),
  ]);
  assert.deepEqual(sorted.map((e) => e.id), ['d', 'b', 'c', 'a']);
});

test('formatEventDate a eventLabel', () => {
  assert.equal(formatEventDate(newEvent('x')), 'bez termínu');
  assert.equal(formatEventDate(newEvent('x', { start: 'nesmysl' })), 'bez termínu');
  assert.equal(formatEventDate(newEvent('x', { start: '2026-12-24', allDay: true })), '24. 12. 2026');
  const withTime = formatEventDate(newEvent('x', { start: '2026-10-17T19:00:00+02:00' }));
  assert.match(withTime, /2026/);
  assert.match(withTime, /\d{2}:\d{2}/);
  assert.equal(eventLabel(newEvent('x', { name: 'Ples', start: '2026-12-24', allDay: true })), '24. 12. 2026 · Ples');
});
