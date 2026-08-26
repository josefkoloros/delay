# Delay kalkulačka pro reprobedny

Webová aplikace pro časové zarovnání delay reproduktorů (delay tower, podvěsy, ozvučení
dlouhých sálů). Spočítá, o kolik milisekund zpozdit vzdálenou reprobednu proti hlavnímu
systému, aby zvuk dorazil ve stejný okamžik a posluchač stále lokalizoval zdroj na pódium.

Bez závislostí, bez buildu – čisté HTML, CSS a ES moduly. Funguje i offline.

## Spuštění

```bash
npm start        # http://localhost:8080
```

Případně stačí obsah složky vystavit jakýmkoli statickým serverem. Přímé otevření
`index.html` přes `file://` nefunguje, protože prohlížeč blokuje ES moduly.

## Co aplikace umí

- **Rychlost zvuku** z teploty a relativní vlhkosti – klíčové, protože mezi 0 °C a 30 °C
  se zpoždění na 100 m liší zhruba o 16 ms.
- **Výpočet delay linky**: vzdálenost → doba šíření, Haasův offset, výsledné zpoždění
  v ms i ve vzorcích (44,1 / 48 / 88,2 / 96 / 192 kHz).
- **Hlídání Haasova okna** – upozorní, když je offset tak velký, že bude slyšet ozvěna.
- **Seznam delay linek** s vlastními názvy, editovatelný přímo v tabulce, s exportem do CSV.
- **Zpětný převod** ms → vzdálenost pro kontrolu hodnot nastavených v procesoru.
- **Referenční tabulka** vzdálenost / zpoždění / vzorky pro aktuální podmínky.
- Metry i stopy, ukládání do prohlížeče (localStorage), tisková verze stránky.

## Výpočet

Rychlost zvuku:

```
c = 331,3 · √(1 + T / 273,15) + 0,0124 · RH        [m/s]
```

kde `T` je teplota vzduchu ve °C a `RH` relativní vlhkost v procentech. První člen je
přesný vztah pro suchý vzduch, druhý běžně používaná lineární korekce na vlhkost
(vlhký vzduch je lehčí, zvuk se v něm šíří rychleji).

Zpoždění delay linky:

```
t = (d / c) · 1000 + offset                        [ms]
```

`d` je vzdálenost mezi hlavním systémem a delay reproduktorem, `offset` je dodatečné
zpoždění podle Haasova efektu (v praxi 5–15 ms), díky kterému posluchač vnímá směr
zvuku od pódia, i když je delay reprobedna hlasitější.

## Testy

```bash
npm test                    # jednotkové testy výpočetního jádra (node:test)
```

Volitelný smoke test uživatelského rozhraní v prohlížeči (vyžaduje `npm i -D playwright`
a běžící `npm start`):

```bash
node test/smoke.mjs
```

## Struktura

```
index.html        rozvržení stránky
styles.css        vzhled
js/delay.js       výpočetní jádro (čisté funkce, bez DOM)
js/app.js         propojení s uživatelským rozhraním, ukládání, export
server.js         minimální statický server pro lokální spuštění
test/             testy
```

## Poznámky k nasazení na akci

Vypočtená hodnota je výchozí bod, ne konečná pravda. Zkontrolujte polaritu delay bedny,
připočtěte vlastní latenci reproduktoru a systému a výsledek doostřete poslechem
v přechodové zóně – tam, kde jsou oba systémy stejně hlasité.
