# Dossier de Vol — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réécrire entièrement le dépôt `pilot-toolkit` pour en faire l'application `dossier-de-vol` — préparation de vol VFR produisant un dossier imprimable.

**Architecture:** Pas de React Router (état local), pas d'IndexedDB (localStorage pour les avions, JSON pour les dossiers), aviation pures functions testées avec Vitest. Les 5 fichiers aviation existants (`coordinates.ts`, `windTriangle.ts`, `isa.ts`, `wbCalc.ts`, `perfCalc.ts`) sont conservés quasi-intacts.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind 4 (CSS config), TanStack Query 5, Leaflet + react-leaflet, Vitest, IBM Plex Sans + IBM Plex Mono (Google Fonts), PWA.

**Design reference:** `docs/dossier-de-vol-handoff/dossier-de-vol/project/Dossier de Vol.dc.html` (1398 lignes — mockup complet à respecter pixel-perfect)

**Design spec:** `docs/superpowers/specs/2026-06-12-pilot-toolkit-design.md`

---

## Couleurs (CSS vars à définir dans index.css)

```
--bg-page: #2a2e35    --bg-app: #0e1217     --bg-chrome: #11161c
--bg-card: #13181f    --bg-inset: #0c1116
--border: #1c222b     --border-strong: #2a323d
--text-1: #e8edf2     --text-2: #cfd6dd     --text-muted: #9aa7b4  --text-dim: #687482
--amber: #f0a93b      --amber-btn: #f5b54a  --amber-dark: #c87f1e
--blue: #4d8df0       --green: #46c98a      --red: #f0604d
```

---

## Structure de fichiers

```
src/
├── main.tsx                        # QueryClientProvider + App
├── App.tsx                         # État root (screen + dossier), pas de Router
├── index.css                       # Tailwind + CSS vars + Google Fonts + @media print

├── types/
│   └── index.ts                    # Tous les types TS (Aircraft, FlightDossier, etc.)

├── lib/
│   ├── storage.ts                  # localStorage aircraft CRUD + JSON dossier save/load
│   ├── flightplan/
│   │   └── parser.ts               # Parser XML .flightplan (DivelementsFlightPlanner)
│   ├── icao/
│   │   └── database.ts             # Base ~80 aérodromes FR/BE/CH + lookup par coords
│   ├── templates/
│   │   ├── dr221.ts                # Template DR221 (BEW=615kg, MTOW=1000kg, etc.)
│   │   └── index.ts                # Registre des templates
│   └── aviation/
│       ├── coordinates.ts          # [KEEP] distanceNm, trueCourse, normAngle
│       ├── windTriangle.ts         # [KEEP] solveWindTriangle, windAtAltitude
│       ├── isa.ts                  # [KEEP] pressureAltitude, densityAltitude
│       ├── wbCalc.ts               # [KEEP, update imports] computeWB
│       ├── perfCalc.ts             # [KEEP] interpolatePerf, computePerf
│       └── navlogGen.ts            # [NEW] generateNavlog(route, weather, ac, overrides)

├── components/
│   ├── AppChrome.tsx               # Header barre (logo + nav tabs + actions)
│   └── ui/
│       ├── Button.tsx              # Variants: primary(amber), ghost, danger
│       ├── Input.tsx               # Input stylé + label + error
│       ├── Card.tsx                # Conteneur bg-card avec border
│       ├── Badge.tsx               # Pill coloré (success/warning/error/info)
│       └── Tabs.tsx                # TabBar + TabPanel

├── screens/
│   ├── HomeScreen.tsx              # Fleet liste + new dossier CTA + open JSON
│   ├── AircraftEditorScreen.tsx    # Formulaire avion (depuis template ou existant)
│   └── DossierScreen.tsx           # 7 tabs — route le panel actif

└── features/
    ├── route/
    │   ├── RoutePanel.tsx          # Carte Leaflet + liste waypoints + import
    │   └── FlightplanImport.tsx    # Drag&drop .flightplan + sélecteur de route
    ├── weather/
    │   └── WeatherPanel.tsx        # Terrains QNH/temp + couches vent + NOTAM + METAR
    ├── navlog/
    │   └── NavlogPanel.tsx         # Tableau navlog (grid 9 cols) + overrides GS/ETE
    ├── fuel/
    │   └── FuelPanel.tsx           # Bilan carbu + extras libres + résultats
    ├── wb/
    │   └── WBPanel.tsx             # M&C stations + SVG enveloppe (départ bleu/arrivée vert)
    ├── perf/
    │   └── PerfPanel.tsx           # Perf par terrain (PA, DA, TO/LDG avec facteurs)
    └── dossier/
        └── DossierPanel.tsx        # Vue print compilée (bouton → window.print())

src/__tests__/
├── aviation/
│   ├── coordinates.test.ts
│   ├── windTriangle.test.ts
│   ├── isa.test.ts
│   ├── wbCalc.test.ts
│   ├── perfCalc.test.ts
│   └── navlogGen.test.ts
├── flightplan/
│   └── parser.test.ts
└── icao/
    └── database.test.ts
```

---

## Types clés (src/types/index.ts)

### Aircraft
```
id, name, registration, sdReference?
ias, tas, fuelBurn, fuelCapacity, fuelDensity, taxiFuel
emptyWeight, emptyArm, maxWeight
stations: WeightStation[]          // { name, arm, maxWeight }
envelopePoints: [number,number][]  // [kg, mm][]
toTable: PerformanceTable
ldgTable: PerformanceTable
factors: { regulatory, grass, headwindPerKt, tailwindPerKt }
magneticVariation
```

### AircraftSnapshot
Identique à `Aircraft` + `snapshotAt: string`

### FlightDossier
```
id, name, date, departureTime
aircraft: AircraftSnapshot
route: ImportedRoute | null
weatherInputs: WeatherInputs        // { fields: Record<ICAO, {qnh,temp}>, winds: WindLayer[], notes }
navOverrides: Record<number, { gs?: number; ete?: number }>
navNotes: Record<number, string>
fuelInputs: FuelInputs              // { gsBase, windAdjust, roulage, marge, extras, reserveMin, derouteMin, plein }
loading: StationLoading             // Record<stationName, kg>
perfInputs: Record<ICAO, TerrainPerfInputs>  // { surface, slope, windKt, toda?, lda? }
notes: string
createdAt, updatedAt
```

### ImportedRoute
```
waypoints: RouteWaypoint[]   // { id, name, type, lat, lng, alt_ft, notes }
sourceFile: string
```

### NavlogEntry (calculé, non stocké)
```
legIndex, fromName, toName
tc, wca, th, mh, dist_nm
gs, ete_min, fuel_l
cumul_fuel_l, cumul_time_min
gsOverridden, eteOverridden
```

### PerformanceTable (conservé de l'existant)
```
weights: number[], pressureAltitudes: number[], oats: number[]
values: number[][][]
grassFactor?, headwindFactor?, tailwindFactor?, slopeFactor?
```

### WindLayer (conservé de l'existant)
```
altitude_ft, direction_deg, speed_kt
```

---

## Algorithmes clés

### navlogGen.ts — generateNavlog(route, weather, ac, overrides)
Pour chaque tronçon i (wp[i-1] → wp[i]) :
1. `dist = distanceNm(prev.lat, prev.lng, wp.lat, wp.lng)`
2. `tc = trueCourse(prev.lat, prev.lng, wp.lat, wp.lng)`
3. `wind = windAtAltitude(wp.alt_ft, weather.winds)`
4. `{ wca, gs: calcGs, th } = solveWindTriangle(tc, ac.tas, wind.direction_deg, wind.speed_kt)`
5. `mh = normAngle(th - ac.magneticVariation)`
6. Si override[i].gs → gs = override, ete = dist/gs*60
7. Si override[i].ete → ete = override, gs = dist/ete*60
8. `fuel_l = ete/60 * ac.fuelBurn`
9. Cumuler fuel et temps

### FuelPanel — calcFuel(inputs, ac)
```
gsEff = gsBase + windAdjust
brutMin = totalDist / gsEff * 60
baseTime = brutMin + roulage + sum(extras)
margeMin = baseTime * marge/100
totalTime = baseTime + margeMin
fuelVol = totalTime/60 * ac.fuelBurn
reserveL = reserveMin/60 * ac.fuelBurn
derouteL = derouteMin/60 * ac.fuelBurn
minFuel = fuelVol + reserveL + derouteL
```

### PerfPanel — calcPerf(ac, terrain, weather)
```
pa = pressureAltitude(terrain.alt_ft, weather.qnh)
da = densityAltitude(pa, weather.temp)
rawDist = interpolatePerf(ac.toTable, masse_kg, pa, weather.temp)
factor = grass×1.20 (si herbe) × headwind×(1-0.025/kt) × slope×(1+0.07/%) × regulatory
corrDist = rawDist * factor
alerte si corrDist > toda
```

### WBPanel — M&C départ + arrivée
```
Départ: computeWB(ac, loading)
Arrivée: computeWB(ac, { ...loading, [fuelStation]: loading[fuelStation] - fuelConsumedKg })
SVG: enveloppe polygonale + point départ (bleu) + arrivée (vert)
```

---

## DR221 Template (src/lib/templates/dr221.ts)

```
BEW=615kg  emptyArm=345mm  MTOW=1000kg
stations: [
  { name:'Pilote',   arm:375, maxWeight:120 },
  { name:'Passager', arm:505, maxWeight:100 },
  { name:'Bagages',  arm:545, maxWeight:30 },
  { name:'Carburant',arm:350, maxWeight:84 },  // 116L × 0.72
]
envelopePoints: [[615,295],[615,430],[880,430],[1000,425],[1000,360],[880,295]]
toTable: généré depuis TOR0=290m +12%/1000ft DA (weights:800/900/1000, PA:0/2000/4000/6000, OAT:-10/15/35)
ldgTable: généré depuis LDR0=480m +12%/1000ft DA
factors: { regulatory:1.15, grass:1.20, headwindPerKt:0.025, tailwindPerKt:0.02 }
ias:100, tas:106, fuelBurn:20, fuelCapacity:116, fuelDensity:0.72, taxiFuel:2
magneticVariation:0
```

---

## ICAO Database (src/lib/icao/database.ts)

~80 aérodromes FR/BE/CH/LU avec `{ icao, name, lat, lng }`.

Fonction `findIcaoByCoords(lat, lng, thresholdNm=2): string | null` — nearest-neighbor.

Aérodromes à inclure (minima) :
- Île-de-France : LFPG, LFPO, LFPB, LFPN, LFPH, LFPM, LFPC, LFPF
- Nord-Ouest : LFOP, LFON, LFOR, LFRC, LFRG, LFRK, LFRB, LFRN, LFRS, LFRD, LFRT, LFRH, LFRI, LFRM, LFRV
- Centre-Ouest : LFOX, LFOJ, LFOV, LFOU, LFRA, LFLD, LFQG
- Est : LFST, LFSB, LFSR, LFOK, LFSD, LFSO, LFSF, LFSH, LFSM, LFSP, LFQO, LFQT, LFQV
- Sud-Ouest : LFBO, LFBD, LFBH, LFBZ, LFBT, LFBS, LFBR
- Sud-Est : LFML, LFMN, LFLL, LFLY, LFLS, LFLU, LFLP, LFMA, LFMD, LFMC, LFMO, LFMP, LFMT, LFMV, LFLB, LFLC, LFLD
- Belgique : EBBR, EBCI, EBLG, EBAW, EBOS
- Suisse : LSZH, LSGG, LSZB, LSGC
- Luxembourg : ELLX

---

## Print layout (@media print dans index.css)

Page A4 (210mm × 297mm, padding 16mm/18mm), `page-break-before: always` entre sections.

**Feuille 1 :**
- Masthead : titre dossier + route ICAO + avion + date
- Tuiles synthèse : distance · temps · carbu minimum · masse départ
- Colonne météo (QNH/temp/vents) + colonne waypoints avec fréquences
- Zone NOTAM

**Feuille 2 :**
- Tableau navlog (même colonnes qu'à l'écran + colonnes vides : Réel/Hobbs)
- Résumé carbu · M&C · perf en colonnes sur 1/3 de page chacun

Couleurs print : fond blanc, texte noir, accents conservés.

---

## Tâches

### Task 1 — Project setup

- [ ] Désinstaller `idb` et `react-router-dom` : `npm uninstall idb react-router-dom`
- [ ] Installer `vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event` en dev
- [ ] Mettre à jour `vite.config.ts` : ajouter config vitest (`test: { environment:'jsdom', globals:true }`), mettre à jour PWA manifest (name:"Dossier de Vol", short_name:"DossierVol", theme_color:"#f0a93b", background_color:"#0e1217")
- [ ] Mettre à jour `package.json` scripts : ajouter `"test": "vitest"` et `"test:ui": "vitest --ui"`
- [ ] Écrire `src/index.css` : import Google Fonts (IBM Plex Sans 400/500/600, IBM Plex Mono 400/500), `@import "tailwindcss"`, CSS vars couleurs, utilitaires de base, `@media print`
- [ ] Commit : `chore: project setup for dossier-de-vol (vitest, pwa, fonts)`

### Task 2 — TypeScript types

- [ ] Réécrire `src/types/index.ts` avec tous les types listés ci-dessus
- [ ] Vérifier que `wbCalc.ts` compile encore (importe `Aircraft, Loading` — renommer `Loading` en `StationLoading` et updater l'import)
- [ ] Vérifier que `perfCalc.ts` compile encore (importe `PerformanceTable` — shape inchangée)
- [ ] Commit : `feat: TypeScript types for dossier-de-vol`

### Task 3 — Aviation lib tests

- [ ] Créer `src/__tests__/aviation/coordinates.test.ts` — tester distanceNm (LFPN→LFOX ~27nm), trueCourse, normAngle
- [ ] Créer `src/__tests__/aviation/windTriangle.test.ts` — tester solveWindTriangle (cas vent de face, vent croisé, calme), windAtAltitude (interpolation entre couches)
- [ ] Créer `src/__tests__/aviation/isa.test.ts` — tester pressureAltitude (QNH=993 → +540ft), densityAltitude (PA=2000ft, OAT=30°C)
- [ ] Créer `src/__tests__/aviation/wbCalc.test.ts` — tester computeWB (chargement DR221 nominal, hors enveloppe)
- [ ] Créer `src/__tests__/aviation/perfCalc.test.ts` — tester interpolatePerf (points connus de table), computePerf (avec facteurs)
- [ ] Lancer `npm test` — tous PASS
- [ ] Commit : `test: aviation lib unit tests`

### Task 4 — navlogGen

- [ ] Créer `src/lib/aviation/navlogGen.ts` avec `generateNavlog(route, weatherInputs, ac, overrides?)` selon l'algorithme ci-dessus
- [ ] Créer `src/__tests__/aviation/navlogGen.test.ts` — tester avec route 2 waypoints, vent connu → vérifier MH, GS, ETE, carbu ; tester override GS ; tester override ETE
- [ ] Lancer `npm test` — PASS
- [ ] Commit : `feat: navlog generator with wind triangle per leg`

### Task 5 — FlightPlan parser

- [ ] Créer `src/lib/flightplan/parser.ts` avec `parseFlightplan(xmlString): ParsedFlightplan`
  - Parser DivelementsFlightPlanner XML (DOMParser)
  - Extraire PrimaryRoute + Routes alternatives
  - Convertir coords DMS `N484459.10 E0020640.25` en decimal degrees
  - Extraire WeightBalance → `Record<string, number>`
  - Retourner `{ routes: ImportedRoute[], weightBalance: Record<string, number> }`
- [ ] Créer `src/__tests__/flightplan/parser.test.ts` — tester avec le fichier exemple `20260418_LFPN-LFGH.flightplan` (contenu en string dans le test), vérifier coords LFPN = 48.7497°N, 2.1119°E
- [ ] Lancer `npm test` — PASS
- [ ] Commit : `feat: .flightplan XML parser`

### Task 6 — ICAO database

- [ ] Créer `src/lib/icao/database.ts` avec les ~80 aérodromes listés et `findIcaoByCoords(lat, lng, thresholdNm?)`
- [ ] Créer `src/__tests__/icao/database.test.ts` — vérifier LFPN trouvé par coords (48.7497, 2.1119), vérifier null si aucun dans 2nm
- [ ] Lancer `npm test` — PASS
- [ ] Commit : `feat: ICAO database with coord lookup`

### Task 7 — Storage

- [ ] Créer `src/lib/storage.ts` :
  - `listAircraft(): Aircraft[]`
  - `getAircraft(id): Aircraft | null`
  - `saveAircraft(ac): void`
  - `deleteAircraft(id): void`
  - `downloadDossier(dossier: FlightDossier): void` — JSON.stringify + <a download>
  - `loadDossierFromFile(file: File): Promise<FlightDossier>` — JSON.parse + validation basique
- [ ] Commit : `feat: storage layer (localStorage aircraft + JSON dossier)`

### Task 8 — DR221 template

- [ ] Créer `src/lib/templates/dr221.ts` — données DR221 complètes avec tables TO/LDG générées par formule (TOR0=290m, LDR0=480m, +12%/1000ft DA)
- [ ] Créer `src/lib/templates/index.ts` — `TEMPLATES: Record<string, Aircraft>` + `getTemplate(key)`
- [ ] Commit : `feat: DR221 aircraft template`

### Task 9 — UI primitives

- [ ] Créer `src/components/ui/Button.tsx` — variants `primary` (amber), `ghost`, `danger`
- [ ] Créer `src/components/ui/Input.tsx` — label + input stylé + message d'erreur
- [ ] Créer `src/components/ui/Card.tsx` — bg-card, border, padding
- [ ] Créer `src/components/ui/Badge.tsx` — pill success/warning/error/info
- [ ] Créer `src/components/ui/Tabs.tsx` — TabBar horizontal + panel actif
- [ ] Commit : `feat: UI primitives (Button, Input, Card, Badge, Tabs)`

### Task 10 — App shell + HomeScreen

- [ ] Réécrire `src/main.tsx` — QueryClientProvider + `<App />`
- [ ] Écrire `src/App.tsx` — `useReducer` avec `{ screen, editingAircraftId, dossier, dossierTab }`, brancher HomeScreen / AircraftEditorScreen / DossierScreen
- [ ] Écrire `src/components/AppChrome.tsx` — header avec logo "dossier de vol", tabs si dossier ouvert, boutons sauvegarder/retour
- [ ] Écrire `src/screens/HomeScreen.tsx` — liste avions (from localStorage), boutons "Nouvel avion", "Nouveau dossier" (sélection avion → DossierScreen), "Ouvrir JSON" (drag&drop ou input file)
- [ ] Lancer `npm run dev` — HomeScreen visible
- [ ] Commit : `feat: app shell and home screen`

### Task 11 — AircraftEditorScreen

- [ ] Écrire `src/screens/AircraftEditorScreen.tsx` :
  - Sélecteur de template en haut (pré-remplit tout)
  - Champs : nom, immatriculation, IAS, TAS, fuelBurn, fuelCapacity, fuelDensity, taxiFuel
  - Tableau stations M&C (éditable : nom, bras, poids max)
  - Empty weight + arm, MTOW
  - Variation magnétique
  - Facteurs (regulatory, grass, vent)
  - Zone JSON avancée (enveloppe + tables en JSON brut)
  - Bouton Sauvegarder → storage.saveAircraft()
- [ ] Lancer `npm run dev` — créer un avion DR221, vérifier persistance après refresh
- [ ] Commit : `feat: aircraft editor screen`

### Task 12 — Route panel

- [ ] Écrire `src/features/route/FlightplanImport.tsx` — drag&drop + file input, appelle le parser, si plusieurs routes → modal sélection, affecte route sur le dossier
- [ ] Écrire `src/features/route/RoutePanel.tsx` — carte Leaflet (CartoDB dark, `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`), marqueurs départ(bleu)/arrivée(vert)/WP(amber), liste waypoints éditables (nom, alt, notes), bouton import
- [ ] Vérifier carte et route LFPN→LFGH correctement affichées
- [ ] Commit : `feat: route panel with .flightplan import and Leaflet map`

### Task 13 — Weather panel

- [ ] Écrire `src/features/weather/WeatherPanel.tsx` :
  - Section par terrain ICAO (auto-détecté depuis route) : QNH + temp
  - Tableau couches vent (altitude, direction, vitesse) avec +/- lignes
  - Zone notes NOTAM (textarea)
  - Section METAR/TAF (fetch aviationweather.gov, TanStack Query, affiché brut)
- [ ] Vérifier METAR fetchés si connexion
- [ ] Commit : `feat: weather panel with METAR/TAF`

### Task 14 — Navlog panel

- [ ] Écrire `src/features/navlog/NavlogPanel.tsx` :
  - Appelle `generateNavlog` à chaque render (memo sur route + weather + overrides)
  - Tableau 9 colonnes (grid-template-columns: `minmax(180px,1.4fr) 56px 104px 64px 86px 86px 76px 78px minmax(140px,1fr)`)
  - Colonnes : Waypoint · Alt · Cap · Dist · GS (editable) · ETE (editable) · Carbu · Réel (editable) · Notes (editable)
  - Ligne overridée en amber
  - Totaux en pied de tableau
  - IAS avion en en-tête
- [ ] Vérifier calculs avec route LFPN→LFGH et vents saisis
- [ ] Commit : `feat: navlog panel with wind triangle computation`

### Task 15 — Fuel panel

- [ ] Écrire `src/features/fuel/FuelPanel.tsx` :
  - Champs : GS base (auto depuis navlog), ajustement vent, roulage (min), marge (%)
  - Extras libres (+ bouton, libellé + durée)
  - Réserve (30/45 min), déroutement (min)
  - Résultats : carbu vol · réserve · déroutement · total minimum (L et kg) · autonomie avec plein
  - Alerte si minimum > capacité avion
- [ ] Commit : `feat: fuel balance panel`

### Task 16 — W&B panel

- [ ] Écrire `src/features/wb/WBPanel.tsx` :
  - Tableau stations : nom · bras (mm) · poids (kg, éditable) · moment
  - Totaux départ + arrivée (poids arrivée = départ − carbu consommé × densité)
  - SVG 400×300 : enveloppe polygonale (blanc/gris), point départ (bleu), arrivée (vert), alerte rouge si hors enveloppe
  - Mapping CG et poids vers coordonnées SVG depuis les valeurs min/max de l'enveloppe
  - Badge OK/ATTENTION/HORS LIMITE
- [ ] Vérifier graphe DR221 avec chargement nominal
- [ ] Commit : `feat: weight & balance panel with SVG envelope`

### Task 17 — Performance panel

- [ ] Écrire `src/features/perf/PerfPanel.tsx` :
  - Par terrain (DEP obligatoire, ARR obligatoire, DEROUT optionnel)
  - Entrées : altitude terrain, QNH, temp, vent (kt), surface (dur/herbe), pente (%), TODA/LDA optionnels
  - Calcul PA → DA → interpolatePerf → apply factors → correctedDist × regulatory
  - Affichage : dist brute / dist corrigée, alerte si TODA/LDA insuffisante
- [ ] Commit : `feat: performance panel (TO/LDG with density altitude)`

### Task 18 — Dossier + print

- [ ] Écrire `src/features/dossier/DossierPanel.tsx` :
  - Vue compilée à imprimer
  - Feuille 1 : masthead (titre, ICAO, avion, date) + 4 tuiles synthèse + météo/waypoints 2 colonnes + NOTAM
  - Feuille 2 : tableau navlog + résumés carbu/M&C/perf en 3 colonnes
  - Bouton "Imprimer" (`window.print()`)
  - Bouton "Télécharger JSON" (`storage.downloadDossier(dossier)`)
- [ ] Vérifier `@media print` dans navigateur (Ctrl+P) — 2 pages A4 propres
- [ ] Commit : `feat: dossier print panel and JSON export`

### Task 19 — Final QA

- [ ] `npm test` — tous PASS
- [ ] `npm run build` — build propre sans erreurs TS
- [ ] Parcours utilisateur complet : créer avion DR221 → importer LFPN-LFGH.flightplan → saisir météo → vérifier navlog → bilan carbu → M&C → perfs → imprimer → télécharger JSON → recharger JSON
- [ ] Commit : `chore: final QA pass`

---

## Contraintes implémentation

- `wbCalc.ts` : mettre à jour l'import `Loading → StationLoading` (seul changement)
- `perfCalc.ts` : aucun changement
- `windTriangle.ts` : aucun changement (windAtAltitude prend `{ altitude_ft, direction_deg, speed_kt }[]` — conforme à `WindLayer`)
- Templates DR221 : la table perf est générée programmatiquement dans le fichier template (pas de données en dur dans un JSON externe)
- METAR URL : `https://aviationweather.gov/api/data/metar?ids={ICAO}&format=raw` + `taf` — cachés dans le dossier JSON (`weatherCache`)
- Print : `display:none` sur tous les éléments non-print dans `@media print`, `.print-only` sur DossierPanel
- Leaflet : import CSS dans `main.tsx` (`import 'leaflet/dist/leaflet.css'`), fix icônes via `delete L.Icon.Default.prototype._getIconUrl`
