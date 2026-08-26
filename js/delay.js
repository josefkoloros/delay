// Výpočetní jádro delay kalkulačky pro ozvučovací systémy.
// Všechny funkce jsou čisté, aby se daly testovat bez DOM.

export const FEET_TO_M = 0.3048;

/**
 * Rychlost zvuku ve vzduchu [m/s].
 * Základ je přesný vztah pro suchý vzduch c = 331.3 * sqrt(1 + T/273.15),
 * doplněný o běžně používanou lineární korekci na relativní vlhkost.
 *
 * @param {number} tempC teplota vzduchu [°C]
 * @param {number} humidity relativní vlhkost [%], 0-100
 */
export function speedOfSound(tempC, humidity = 0) {
  const t = Number(tempC);
  const rh = clamp(Number(humidity) || 0, 0, 100);
  if (!Number.isFinite(t) || t <= -273.15) return NaN;
  const dry = 331.3 * Math.sqrt(1 + t / 273.15);
  // Vlhký vzduch je lehčí -> zvuk se šíří rychleji. Cca +0.0124 m/s na 1 % RH.
  return dry + 0.0124 * rh;
}

/** Převede vzdálenost na zpoždění [ms]. */
export function distanceToDelay(meters, speed) {
  const d = Number(meters);
  if (!Number.isFinite(d) || !Number.isFinite(speed) || speed <= 0) return NaN;
  return (d / speed) * 1000;
}

/** Převede zpoždění [ms] na vzdálenost [m]. */
export function delayToDistance(ms, speed) {
  const t = Number(ms);
  if (!Number.isFinite(t) || !Number.isFinite(speed) || speed <= 0) return NaN;
  return (t / 1000) * speed;
}

/** Počet vzorků odpovídající zpoždění [ms] při dané vzorkovací frekvenci [Hz]. */
export function msToSamples(ms, sampleRate) {
  const t = Number(ms);
  const sr = Number(sampleRate);
  if (!Number.isFinite(t) || !Number.isFinite(sr) || sr <= 0) return NaN;
  return (t / 1000) * sr;
}

/**
 * Kompletní výpočet jedné delay linky.
 *
 * @param {object} opts
 * @param {number} opts.distance vzdálenost mezi hlavním systémem a delay reproduktorem
 * @param {'m'|'ft'} opts.unit jednotka vzdálenosti
 * @param {number} opts.haas dodatečný Haasův offset [ms]
 * @param {number} opts.tempC teplota [°C]
 * @param {number} opts.humidity relativní vlhkost [%]
 * @param {number} opts.sampleRate vzorkovací frekvence [Hz]
 */
export function computeLine({ distance, unit = 'm', haas = 0, tempC = 20, humidity = 50, sampleRate = 48000 }) {
  const speed = speedOfSound(tempC, humidity);
  const meters = toMeters(distance, unit);
  const propagation = distanceToDelay(meters, speed);
  const offset = Number(haas) || 0;
  const total = propagation + offset;
  return {
    speed,
    meters,
    propagationMs: propagation,
    haasMs: offset,
    totalMs: total,
    samples: msToSamples(total, sampleRate),
  };
}

/** Převod zadané vzdálenosti na metry. */
export function toMeters(value, unit) {
  const v = Number(value);
  if (!Number.isFinite(v)) return NaN;
  return unit === 'ft' ? v * FEET_TO_M : v;
}

/** Převod metrů na zvolenou jednotku. */
export function fromMeters(meters, unit) {
  const v = Number(meters);
  if (!Number.isFinite(v)) return NaN;
  return unit === 'ft' ? v / FEET_TO_M : v;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Kontrola Haasova okna. Do cca 30 ms posluchač vnímá oba zdroje
 * jako jeden a lokalizuje ho podle prvního (hlavního) systému.
 */
export function haasStatus(offsetMs) {
  const v = Number(offsetMs) || 0;
  if (v < 0) return { level: 'warn', text: 'Záporný offset – delay linka hraje před hlavním systémem.' };
  if (v === 0) return { level: 'ok', text: 'Bez offsetu – přesné časové zarovnání.' };
  if (v <= 30) return { level: 'ok', text: 'V Haasově okně – lokalizace zůstává u hlavního systému.' };
  if (v <= 50) return { level: 'warn', text: 'Za Haasovým oknem – hrozí slyšitelná ozvěna.' };
  return { level: 'bad', text: 'Příliš velký offset – zvuk bude vnímán jako zřetelná ozvěna.' };
}
