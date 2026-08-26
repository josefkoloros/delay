// Ruční smoke test v prohlížeči: spusťte `npm start` a pak `node test/smoke.mjs`.
// Vyžaduje volitelnou závislost playwright (`npm i -D playwright`).
import { chromium } from 'playwright';
// Prohlížeč lze nasměrovat proměnnou CHROMIUM_PATH, jinak se použije ten z Playwrightu.
const exe = process.env.CHROMIUM_PATH;
const base = process.env.BASE_URL || 'http://localhost:8080/';
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const p = await b.newPage({ viewport: { width: 1280, height: 1400 } });
const errs = [];
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(base, { waitUntil: 'networkidle' });

const read = async () => ({
  speed: await p.textContent('#speedValue'),
  total: await p.textContent('#totalMs'),
  prop: await p.textContent('#propMs'),
  samples: await p.textContent('#samples'),
  alt: (await p.textContent('#distAlt')) + ' ' + (await p.textContent('#distAltUnit')),
  status: await p.textContent('#haasStatus'),
});
console.log('start:', JSON.stringify(await read()));

// změna teploty přepočítá
await p.fill('#temp', '5');
console.log('5°C:', JSON.stringify(await read()));

// velký offset -> varování
await p.fill('#haas', '60');
console.log('haas 60:', (await p.textContent('#haasStatus')).trim(), '| level=', await p.getAttribute('#haasStatus', 'data-level'));
await p.fill('#haas', '10');
await p.fill('#temp', '20');

// přidání linek
await p.click('#addLine');
await p.fill('#distance', '75');
await p.click('#addLine');
console.log('řádků:', await p.locator('#linesBody tr').count());
console.log('linka2 celkem:', await p.locator('#linesBody tr').nth(1).locator('td').nth(4).textContent());

// přepnutí na stopy
await p.selectOption('#unit', 'ft');
console.log('ft distance:', await p.inputValue('#distance'), '| linka1 vzdálenost:',
  await p.locator('#linesBody tr').nth(0).locator('input[type=number]').first().inputValue());
console.log('ref první řádek:', (await p.locator('#refBody tr').first().textContent()).trim());
await p.selectOption('#unit', 'm');

// zpětný převod
await p.fill('#revMs', '291.5');
console.log('rev 291.5ms ->', await p.textContent('#revDistance'), 'm');

// odebrání linky
await p.locator('#linesBody .btn-icon').first().click();
console.log('po smazání řádků:', await p.locator('#linesBody tr').count());

// perzistence
await p.reload({ waitUntil: 'networkidle' });
console.log('po reloadu řádků:', await p.locator('#linesBody tr').count(), '| total:', await p.textContent('#totalMs'));

await p.screenshot({ path: '/tmp/app.png', fullPage: true });
await p.setViewportSize({ width: 390, height: 844 });
await p.screenshot({ path: '/tmp/app-mobile.png', fullPage: true });
console.log('CHYBY:', errs.length ? errs : 'žádné');
await b.close();

if (errs.length) process.exitCode = 1;
