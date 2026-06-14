# Aircraft Config — Refonte de la configuration avion

**Date :** 2026-06-14  
**Statut :** Validé

## Contexte

La config avion initiale était une interface plate avec des champs mélangés, des champs inutiles (densité carbu, roulage forfait), une seule vitesse de croisière, et la variation magnétique mal placée. Cette spec restructure le type `Aircraft` et l'éditeur associé.

## Décisions

- **Pas de migration** : l'app est en début de développement, les données localStorage existantes sont sacrifiées.
- **Densité carbu** : constante globale `FUEL_DENSITY_KGL = 0.72` (100LL uniquement).
- **Variation magnétique** : sort de l'avion — sera ajoutée au dossier de vol lors d'une prochaine spec.
- **TAS** : supprimé. À ces vitesses et altitudes (< 10 000 ft, ~100 kt), l'IAS est utilisé directement comme vitesse de croisière dans le triangle des vitesses.
- **Régime par défaut** : le premier régime de la liste est utilisé par le navlog.

---

## 1. Type system

### Nouveaux types

```typescript
interface CruiseRegime {
  label: string    // ex: "75% puissance"
  ias: number      // kt — utilisé directement comme vitesse de croisière
  fuelBurn: number // L/h
}

interface AircraftCharacteristics {
  regimes: CruiseRegime[]  // premier = défaut navlog
  fuelCapacity: number     // L utilisables
}

interface AircraftMassBalance {
  emptyWeight: number
  emptyArm: number                    // mm depuis le datum
  maxWeight: number                   // kg MTOW
  stations: WeightStation[]
  envelopePoints: [number, number][]  // [kg, mm][]
}

interface AircraftPerformance {
  toTable: PerformanceTable
  ldgTable: PerformanceTable
  factors: {
    regulatory: number      // ex: 1.15
    grass: number           // ex: 1.20
    headwindPerKt: number   // réduction par kt de vent de face
    tailwindPerKt: number   // majoration par kt de vent arrière
  }
}

interface Aircraft {
  id: string
  name: string
  registration: string
  sdReference?: string
  characteristics: AircraftCharacteristics
  massBalance: AircraftMassBalance
  performance: AircraftPerformance
}
```

### Suppressions

- `ias`, `tas`, `fuelBurn` (plats) → remplacés par `characteristics.regimes`
- `fuelDensity` → constante globale
- `taxiFuel` → géré dans le dossier de vol (FuelInputs)
- `magneticVariation` → sera dans FlightDossier

### Constante globale

```typescript
// src/lib/aviation/constants.ts
export const FUEL_DENSITY_KGL = 0.72  // Avgas 100LL
```

### AircraftSnapshot

Inchangé : `Aircraft & { snapshotAt: string }`.

---

## 2. Éditeur avion (AircraftEditorScreen)

L'écran est réorganisé en 4 sections Card correspondant exactement aux sous-types.

### Section 1 — Informations générales

Inchangé : nom, immatriculation, référence SkyDemon.

### Section 2 — Caractéristiques

Remplace "Performances croisière".

- Tableau de régimes : une ligne par régime avec colonnes `Label | IAS (kt) | Conso (L/h) | [✕]`
- Le premier régime affiche un badge `(défaut navlog)` à côté du label
- Bouton `+ Ajouter régime` sous le tableau
- Champ `Capacité carbu (L)` en dessous du tableau

### Section 3 — Masse & centrage

- Grille : masse à vide (kg), bras à vide (mm), MTOM (kg)
- Tableau stations (inchangé) : nom, bras (mm), poids max (kg)
- Zone textarea JSON : `Points d'enveloppe [[kg, mm], ...]`
- Aperçu SVG live en dessous du textarea : polygone fermé, axe X = bras (mm), axe Y = masse (kg), se met à jour à chaque frappe valide, silencieux en cas de JSON invalide

### Section 4 — Performances

- Sous-section **Facteurs réglementaires** : grille 4 champs (réglementaire ×, herbe ×, vent face %/kt, vent arrière %/kt) — inchangé
- Zone textarea JSON `toTable` + tableau de performances rendu en dessous (lecture seule) : lignes = PA (ft), colonnes = poids (kg), menu déroulant pour choisir la colonne OAT affichée
- Zone textarea JSON `ldgTable` + même rendu

Le rendu de table s'affiche uniquement si le JSON est valide et contient les champs `weights`, `pressureAltitudes`, `oats`, `values`.

---

## 3. Impacts sur le reste du code

### NavlogAircraftParams

```typescript
// Avant
interface NavlogAircraftParams {
  tas: number
  fuelBurn: number
  magneticVariation: number
}

// Après
interface NavlogAircraftParams {
  ias: number      // renommé depuis tas
  fuelBurn: number
  // magneticVariation retiré — sera injecté depuis le dossier plus tard
}
```

Construction depuis un avion :
```typescript
const regime = aircraft.characteristics.regimes[0]
const navlogParams: NavlogAircraftParams = {
  ias: regime.ias,
  fuelBurn: regime.fuelBurn,
}
```

Dans `navlogGen.ts`, `ac.tas` → `ac.ias`. La variation magnétique est temporairement fixée à `0` jusqu'à ce qu'elle soit ajoutée au dossier.

### Template DR221

`src/lib/templates/dr221.ts` mis à jour vers la nouvelle structure :

```typescript
export const DR221_TEMPLATE: Aircraft = {
  id: 'template-dr221',
  name: 'DR221',
  registration: '',
  sdReference: '',

  characteristics: {
    regimes: [
      { label: '75% puissance', ias: 108, fuelBurn: 22 },
      { label: '65% puissance', ias: 100, fuelBurn: 20 },
    ],
    fuelCapacity: 116,
  },

  massBalance: {
    emptyWeight: 615,
    emptyArm: 345,
    maxWeight: 1000,
    stations: [ /* repris depuis le template existant */ ],
    envelopePoints: [ /* repris depuis le template existant */ ],
  },

  performance: {
    toTable: buildTable(290),
    ldgTable: buildTable(480),
    factors: {
      regulatory: 1.15,
      grass: 1.20,
      headwindPerKt: 0.025,
      tailwindPerKt: 0.02,
    },
  },
}
```

### FuelPanel / WBPanel / PerfPanel

- `aircraft.fuelCapacity` → `aircraft.characteristics.fuelCapacity`
- `aircraft.fuelDensity` → `FUEL_DENSITY_KGL` (import depuis constants)
- `aircraft.emptyWeight` etc. → `aircraft.massBalance.emptyWeight` etc.
- `aircraft.toTable` → `aircraft.performance.toTable`
- `aircraft.factors` → `aircraft.performance.factors`

### FuelInputs

Le champ `roulage` reste dans `FuelInputs` (minutes, dossier de vol). Les valeurs par défaut (10 min départ + 15 min arrivée) seront définies lors de la refonte du bilan carbu.

---

## 4. Hors scope

- Variation magnétique dans le dossier (spec future)
- Refonte du bilan carbu (forfaits roulage par défaut)
- Sélection du régime de croisière dans le dossier (actuellement toujours régime[0])
