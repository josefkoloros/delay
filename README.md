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
- **Akce** – každé ozvučení (ples, koncert, konference) má vlastní seznam delay linek, název,
  termín a místo. Mezi akcemi se přepíná rozbalovacím seznamem.
- **Převzetí akcí z Google kalendáře** – akci zapíšete v kalendáři telefonu, aplikace ji po
  přihlášení Google účtem načte a založí z ní akci včetně termínu a místa (viz níže).
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

## Akce z Google kalendáře

Nativní kalendář v telefonu (Android i iOS) se běžně synchronizuje s účtem Google. Aplikace
umí události z tohoto účtu načíst a udělat z nich akce – bez serveru, přímo z prohlížeče přes
Google Calendar API. Přístup je jen pro čtení, do kalendáře se nic nezapisuje.

### Postup použití

1. Akci zapište v kalendáři telefonu do kalendáře účtu Google (název, datum, místo).
2. V aplikaci rozbalte **Google kalendář**, vyplňte client ID (jen poprvé, uloží se
   v prohlížeči) a klepněte na **Přihlásit ke Google**.
3. Vyberte kalendář a období, klepněte na **Načíst události** a u konkrétní události na
   **Převzít**. Vznikne akce s názvem, termínem a místem; delay linky k ní přidáváte jako
   dosud.
4. Při dalším načtení se u převzatých akcí aktualizuje název, termín a místo podle kalendáře,
   delay linky zůstávají. Akce, které z kalendáře zmizely, se v aplikaci nemažou.

Přihlášení platí zhruba hodinu, potom se stačí přihlásit znovu. Client ID a zvolený kalendář
se ukládají do localStorage, přístupový token jen do paměti stránky.

### Jednorázové nastavení v Google Cloud

Aplikace potřebuje OAuth client ID. Založí ho vlastník nasazení, uživatelé ho pak jen vloží
do nastavení (nebo ho lze vepsat jako výchozí hodnotu do `index.html`).

1. Na <https://console.cloud.google.com/> vytvořte projekt (např. „Delay kalkulačka“).
2. **APIs & Services → Library** – zapněte **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** – typ *External*, vyplňte název aplikace a
   e-mail. V části *Scopes* přidejte `https://www.googleapis.com/auth/calendar.readonly`.
   Dokud je aplikace v režimu *Testing*, přidejte do *Test users* účty, které ji budou
   používat (do 100 účtů to bez ověření Googlem stačí).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, typ
   **Web application**. Do *Authorized JavaScript origins* přidejte
   `https://josefkoloros.github.io` a pro lokální vývoj `http://localhost:8080`.
   *Authorized redirect URIs* nechte prázdné (používá se token v prohlížeči, ne přesměrování).
5. Zkopírujte vzniklé client ID ve tvaru `….apps.googleusercontent.com` do aplikace.

Bez client ID zůstává zbytek aplikace plně funkční, včetně ručně zakládaných akcí.

## Testy

```bash
npm test                    # jednotkové testy výpočetního jádra a modulu akcí (node:test)
```

Volitelný smoke test uživatelského rozhraní v prohlížeči (vyžaduje `npm i -D playwright`
a běžící `npm start`):

```bash
node test/smoke.mjs
```

## Nasazení

Push do větve `main` spustí workflow `.github/workflows/pages.yml`, který projede
testy a publikuje statické soubory na GitHub Pages:
<https://josefkoloros.github.io/delay/>

V nastavení repozitáře (Settings → Pages) musí být zdroj přepnutý na **GitHub Actions**.

## Struktura

```
index.html        rozvržení stránky
styles.css        vzhled
js/delay.js       výpočetní jádro (čisté funkce, bez DOM)
js/events.js      akce: migrace úložiště, převod událostí z Google, slučování (čisté funkce)
js/google.js      přihlášení Google (Identity Services) a čtení Google Calendar API
js/app.js         propojení s uživatelským rozhraním, ukládání, export
server.js         minimální statický server pro lokální spuštění
.github/workflows nasazení na GitHub Pages
test/             testy
```

## Poznámky k nasazení na akci

Vypočtená hodnota je výchozí bod, ne konečná pravda. Zkontrolujte polaritu delay bedny,
připočtěte vlastní latenci reproduktoru a systému a výsledek doostřete poslechem
v přechodové zóně – tam, kde jsou oba systémy stejně hlasité.
