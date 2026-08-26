import test from 'node:test';
import assert from 'node:assert/strict';
import {
  speedOfSound, distanceToDelay, delayToDistance, msToSamples,
  computeLine, toMeters, fromMeters, haasStatus, FEET_TO_M,
} from '../js/delay.js';

const close = (actual, expected, tol = 0.05) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} != ${expected} (±${tol})`);

test('rychlost zvuku v suchém vzduchu při 0 °C je 331,3 m/s', () => {
  close(speedOfSound(0, 0), 331.3, 0.01);
});

test('rychlost zvuku při 20 °C a 0 % vlhkosti je zhruba 343,2 m/s', () => {
  close(speedOfSound(20, 0), 343.2, 0.15);
});

test('vlhkost rychlost zvuku mírně zvyšuje', () => {
  assert.ok(speedOfSound(20, 80) > speedOfSound(20, 0));
  close(speedOfSound(20, 100) - speedOfSound(20, 0), 1.24, 0.01);
});

test('nesmyslná teplota vrací NaN', () => {
  assert.ok(Number.isNaN(speedOfSound(-300, 50)));
  assert.ok(Number.isNaN(speedOfSound('abc', 50)));
});

test('100 m při 343 m/s odpovídá zhruba 291,5 ms', () => {
  close(distanceToDelay(100, 343), 291.55, 0.01);
});

test('převod vzdálenost -> čas -> vzdálenost je konzistentní', () => {
  const speed = speedOfSound(18, 60);
  close(delayToDistance(distanceToDelay(63.5, speed), speed), 63.5, 1e-9);
});

test('nulová nebo záporná rychlost zvuku nevrací nekonečno', () => {
  assert.ok(Number.isNaN(distanceToDelay(10, 0)));
  assert.ok(Number.isNaN(delayToDistance(10, -5)));
});

test('vzorky odpovídají vzorkovací frekvenci', () => {
  assert.equal(msToSamples(1000, 48000), 48000);
  close(msToSamples(10, 44100), 441, 1e-9);
  assert.ok(Number.isNaN(msToSamples(10, 0)));
});

test('převod jednotek metry / stopy', () => {
  close(toMeters(100, 'ft'), 30.48, 1e-9);
  close(fromMeters(30.48, 'ft'), 100, 1e-9);
  assert.equal(toMeters(42, 'm'), 42);
  assert.equal(FEET_TO_M, 0.3048);
});

test('computeLine sečte dobu šíření a Haasův offset', () => {
  const r = computeLine({ distance: 40, unit: 'm', haas: 10, tempC: 20, humidity: 50, sampleRate: 48000 });
  close(r.speed, 343.83, 0.05);
  close(r.propagationMs, 116.3, 0.2);
  close(r.totalMs, r.propagationMs + 10, 1e-9);
  close(r.samples, (r.totalMs / 1000) * 48000, 1e-9);
});

test('computeLine respektuje stopy', () => {
  const m = computeLine({ distance: 30.48, unit: 'm', tempC: 20, humidity: 50 });
  const ft = computeLine({ distance: 100, unit: 'ft', tempC: 20, humidity: 50 });
  close(ft.totalMs, m.totalMs, 1e-9);
});

test('teplejší vzduch znamená kratší zpoždění', () => {
  const cold = computeLine({ distance: 100, tempC: 0, humidity: 50 });
  const hot = computeLine({ distance: 100, tempC: 30, humidity: 50 });
  assert.ok(hot.totalMs < cold.totalMs);
  close(cold.totalMs - hot.totalMs, 15.6, 0.5);
});

test('hodnocení Haasova offsetu', () => {
  assert.equal(haasStatus(0).level, 'ok');
  assert.equal(haasStatus(15).level, 'ok');
  assert.equal(haasStatus(30).level, 'ok');
  assert.equal(haasStatus(40).level, 'warn');
  assert.equal(haasStatus(80).level, 'bad');
  assert.equal(haasStatus(-5).level, 'warn');
});
