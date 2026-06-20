# Design : Segments météo et bilan carburant

**Date :** 2026-06-20
**Contexte :** Remplacement des `FlightPoint[]` par un modèle de segments ordonnés avec vent par tronçon, permettant un bilan carburant calculé automatiquement via le triangle des vents.

---

## Objectif

Modéliser la trajectoire d'un vol (branche) sous forme de segments ordonnés, chacun portant son cap magnétique, sa distance et les conditions de vent prévues. Ces données alimentent automatiquement le bilan carburant (GS par segment via triangle des vents) sans remplacer SkyDemon — le niveau de détail reste volontairement approximatif.

---

## Modèle de données

### Types supprimés

- `FlightPoint`
- `FlightPointType`
- `FlightPointRole`
- `WindLayer`

### `WeatherInputs` — modifié

```typescript
interface WeatherInputs {
  fields: Record<string, FieldWeather>
  notes: string
  // supprimé : winds: WindLayer[]
}
```

### `FlightBranch` — modifié

```typescript
interface FlightBranch {
  id: string
  label: string                  // obligatoire, non vide
  aerodromes: FlightAerodrome[]
  segments: FlightSegment[]      // min 1 (toujours au moins un segment ENROUTE)
  notes: string
  // supprimés : points[], distanceNm
}
```

La `distanceNm` de la branche devient une valeur dérivée (Σ distances des segments), non stockée.

### Nouveaux types

```typescript
interface FlightAerodrome {
  id: string
  identifier: string             // code OACI
  role: 'DEP' | 'ARR' | 'ALTERNATE' | 'OVERFLY'
}

type FlightSegmentRole = 'ENROUTE' | 'ALTERNATE'

interface FlightSegment {
  id: string
  role: FlightSegmentRole
  name: string
  distanceNm: number
  headingMag: number             // Cap magnétique (°M)
  wind: { directionDeg: number; speedKt: number } | null  // Direction vraie (°V, standard METAR)
  notes: string
}
```

### `FuelInputs` — champs supprimés

- `gsBase` — remplacé par le calcul automatique depuis `CruiseRegime.speed` (TAS)
- `windAdjust` — remplacé par le triangle des vents par segment
- `derouteMin` — remplacé par le temps calculé du segment ALTERNATE

Tous les autres champs restent inchangés : `roulage`, `marge`, `extras`, `reserveMin`, `plein`.

---

## Calcul carburant

### Triangle des vents par segment

Pour chaque segment (le calcul est identique pour ENROUTE et ALTERNATE) :

```
headwindComponent = wind.speedKt × cos(wind.directionDeg − segment.headingMag)
GS  = max(1, TAS − headwindComponent)          [utilisé pour le carbu]
WCA = asin(wind.speedKt × sin(wind.directionDeg − headingMag) / TAS)  [affiché, non stocké]

segmentTimeMin = (distanceNm / GS) × 60
```

Si `wind` est `null` : `GS = TAS` (pas de correction vent).

> **Note :** On traite `headingMag ≈ headingTrue`. La déclinaison magnétique en France (~1–2°W) est négligeable pour une planification VFR approximative.

`TAS` = `CruiseRegime.speed` du régime sélectionné.

### Bilan de la branche

```
flightTimeMin   = Σ segmentTimeMin  (segments ENROUTE uniquement)
derouteMin      = segmentTimeMin du segment ALTERNATE  (0 si absent)

totalTime       = flightTimeMin + roulage + Σ extras + reserveMin + derouteMin
totalWithMargin = totalTime × (1 + marge / 100)
fuelL           = (totalWithMargin / 60) × fuelBurn
```

`reserveMin` et `derouteMin` s'appliquent sur **chaque branche** — chaque branche est un vol autonome avec son bilan complet.

---

## Comportements métier

| Situation | Comportement |
|-----------|-------------|
| Création d'une branche | Un segment ENROUTE nommé "Vol" est créé automatiquement (champs vides) |
| Dernier segment ENROUTE | Non supprimable |
| Ajout d'un aérodrome ALTERNATE | Un segment ALTERNATE est auto-créé (champs vides, à compléter) |
| Suppression du dernier aérodrome ALTERNATE | Le segment ALTERNATE est auto-supprimé |
| Maximum de segments ALTERNATE | 1 par branche — plusieurs aérodromes ALTERNATE peuvent coexister, un seul segment est créé |
| Segment ALTERNATE | Non supprimable manuellement tant qu'un ALTERNATE existe dans les aérodromes |

---

## Interface utilisateur

### BranchesPanel

Chaque branche expose deux sous-sections :

**Aérodromes** — liste d'entrées OACI + rôle (DEP, ARR, ALTERNATE, OVERFLY). Ajout/suppression libres sauf contraintes métier ci-dessus.

**Segments** — liste ordonnée. Par segment :
- Champs éditables : nom, distance (nm), cap°M, vent (direction °V + force kt), notes
- Valeurs calculées (lecture seule) : **WCA** et **GS**
- Le segment ALTERNATE est visuellement différencié (couleur ou badge)
- Le dernier segment ENROUTE est protégé contre la suppression

Distance totale de la branche : affichée en lecture seule sous la liste (Σ segments).

### FuelPanel

- Suppression des champs : `gsBase`, `windAdjust`, `derouteMin`
- Ajout d'un tableau de détail par segment (nom, GS calculée, temps)
- Le temps de déroutement apparaît comme ligne du segment ALTERNATE dans ce tableau

### WeatherPanel

- Suppression de la section "Vents par altitude" (`WindLayer[]`)
- Champs conservés : QNH et température par terrain, notes

---

## Ce qui ne change pas

- La structure multi-branches du dossier
- La sélection du régime de croisière dans le FuelPanel
- `fuelBurn`, `fuelCapacity`, `CruiseRegime` dans le modèle avion
- `roulage`, `marge`, `extras`, `reserveMin`, `plein` dans `FuelInputs`
- La section QNH/température du WeatherPanel
- La section notes du WeatherPanel
