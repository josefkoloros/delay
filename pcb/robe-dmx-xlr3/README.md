# DMX deska 2× XLR 3pin (Robe 150 Beam / Spike) – návrh v0.1

Dvoulistá DPS 36 × 24 mm, 1,6 mm. Dva konektory XLR3 (IN/OUT) zapojené paralelně
+ 3 pady pro kabel k hlavní desce.

| Síť | XLR pin | Význam |
|-----|---------|--------|
| 1 | 1 | stínění / GND |
| 2 | 2 | DMX − |
| 3 | 3 | DMX + |

## Soubory
- `robe-dmx-xlr3-gerber.zip` – Gerbery (RS-274X, mm) + Excellon vrtání → rovnou do JLCPCB/PCBWay
- `gerber/` – totéž rozbalené (F/B Cu, F/B Mask, F Silk, Edge, PTH.drl)
- `robe-dmx-xlr3.kicad_pcb` – KiCad 7+ (netestováno v KiCadu, jen vygenerováno)
- `preview_top.png`, `preview_bottom.png` – náhled
- `gen.py` – generátor; rozměry v sekci `CONFIG`, po úpravě `python3 gen.py`

## ⚠ Před objednáním ověřit
Návrh je udělaný jen z fotky, **rozteče konektorů nejsou změřené**. Piny XLR (pady 2,0 / vrtáno 1,1,
rozteč 4 mm) jsou zástupné. Je potřeba:
1. Změřit na originální desce / konektoru: rozteče pinů, průměr nožiček, polohu přichytných nožek
   (na fotce má každý konektor navíc pady pro mechanické úchyty – zde zatím chybí).
2. Zkontrolovat gender a pořadí pinů: B konektor je zrcadlově obrácený. Pin 1/2/3 musí odpovídat
   číslování na konektoru (pohled ze strany pájení).
3. Ověřit, jak je originál zapojen k hlavní desce (pořadí 3 vývodů dole, případně zapojení
   zakončovacího rezistoru – na fotce je uprostřed 5 malých padů, které návrh neobsahuje).
4. Případně upravit obrys desky na originál (rohy, otvory).

Pošli rozměry/foto z obou stran s pravítkem a upravím to na 1:1 náhradu.
