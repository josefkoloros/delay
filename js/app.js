import {
  speedOfSound, computeLine, delayToDistance, msToSamples,
  toMeters, fromMeters, haasStatus,
} from './delay.js';

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
  linesBody: $('linesBody'), linesEmpty: $('linesEmpty'),
  revMs: $('revMs'), revDistance: $('revDistance'), revUnit: $('revUnit'),
  refBody: $('refBody'), refBadge: $('refBadge'),
};

/** Linky drží vzdálenost vždy v metrech, zobrazení se převádí podle zvolené jednotky. */
let lines = [];
let nextId = 1;

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

// --- Stav ------------------------------------------------------------------

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
    temp: c.tempC, humidity: c.humidity, unit: c.unit, sampleRate: c.sampleRate,
    distance: num(el.distance, 0), haas: num(el.haas, 0), revMs: num(el.revMs, 0),
    lines,
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
  if (!data || typeof data !== 'object') return;

  if (Number.isFinite(data.temp)) el.temp.value = data.temp;
  if (Number.isFinite(data.humidity)) el.humidity.value = data.humidity;
  if (data.unit === 'm' || data.unit === 'ft') el.unit.value = data.unit;
  if (Number.isFinite(data.sampleRate)) el.sampleRate.value = String(data.sampleRate);
  if (Number.isFinite(data.distance)) el.distance.value = data.distance;
  if (Number.isFinite(data.haas)) el.haas.value = data.haas;
  if (Number.isFinite(data.revMs)) el.revMs.value = data.revMs;

  if (Array.isArray(data.lines)) {
    lines = data.lines
      .filter((l) => l && Number.isFinite(l.meters))
      .map((l) => ({
        id: nextId++,
        name: String(l.name ?? `Delay ${nextId}`).slice(0, 40),
        meters: Number(l.meters),
        haas: Number.isFinite(l.haas) ? Number(l.haas) : 0,
      }));
  }
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

  renderLines(c, speed);
  renderReference(c, speed);
  save();
}

function renderLines(c, speed) {
  el.linesBody.replaceChildren();
  el.linesEmpty.hidden = lines.length > 0;

  for (const line of lines) {
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
    lines = lines.filter((l) => l.id !== id);
    render();
  });
  return btn;
}

// --- Akce ------------------------------------------------------------------

function addLine(meters, haas) {
  // Číslujeme podle rostoucího id, aby po mazání nevznikaly duplicitní názvy.
  lines.push({ id: nextId, name: `Delay ${nextId++}`, meters, haas });
  render();
}

function exportCsv() {
  const c = conditions();
  const speed = speedOfSound(c.tempC, c.humidity);
  const rows = [
    ['Nazev', 'Vzdalenost_m', 'Offset_ms', 'Sireni_ms', 'Celkem_ms', `Vzorky_${c.sampleRate}Hz`],
    ...lines.map((l) => {
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
  const csv = rows.map((r) => r.join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'delay-linky.csv';
  a.click();
  URL.revokeObjectURL(url);
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
  if (lines.length === 0 || confirm('Opravdu smazat všechny delay linky?')) {
    lines = [];
    render();
  }
});
el.exportCsv.addEventListener('click', exportCsv);

load();
updateDistanceRange();
syncRanges();
render();
