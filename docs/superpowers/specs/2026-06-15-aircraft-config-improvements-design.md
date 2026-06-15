# Améliorations fiche avion — Design Spec
*Date : 2026-06-15*

## Contexte

Deux problèmes identifiés sur la fiche de configuration avion :

1. **Stations de chargement** : le champ `maxWeight` est inutile ; carburant et charges sèches doivent être distingués (unités différentes : L vs kg).
2. **Tables de performance** : le modèle actuel (interpolation 3D poids × PA × OAT) ne couvre pas les cas rencontrés dans les manuels réels. Exemples analysés : DR221 (poids unique + correction quadratique), DR400-120 (écart ISA, herbe séparée, vent tabulé), Cessna 172S (3 poids, interpolation classique).

---

## Sujet A — Stations de chargement

### Changements de types (`src/types/index.ts`)

```typescript
// Avant
interface WeightStation {
  name: string
  arm: number
  maxWeight: number
}

// Après
interface WeightStation {
  name: string
  arm: number
  kind: 'dry' | 'fuel'
}

// StationLoading : Record<string, number> — inchangé en forme
// Sémantique : 'dry' → valeur en kg  |  'fuel' → valeur en L
```

### `computeWB` (`src/lib/aviation/wbCalc.ts`)

Nouvelle signature — la conversion L→kg se fait en interne :

```typescript
export function computeWB(
  massBalance: AircraftMassBalance,
  loading: StationLoading,
  fuelDensity = FUEL_DENSITY_KGL,
): WBResult
```

Pour chaque station :
- `kind === 'fuel'` → masse kg = `loading[name] * fuelDensity`
- `kind === 'dry'`  → masse kg = `loading[name]`

### `WBPanel` (`src/features/wb/WBPanel.tsx`)

- Stations `'fuel'` : input en **L**, masse kg affichée en lecture seule à côté
- Stations `'dry'` : input en **kg**, comportement inchangé
- Carburant au départ : **plus hardcodé au plein** — l'utilisateur saisit les litres réellement emportés
- Carburant arrivée : `dep_L - navlog_fuel_L`, reconverti en kg pour le calcul
- Suppression du hack `name.includes('carburant')`
- Suppression de la colonne "Max" (plus de `maxWeight`)
- Plusieurs stations `'fuel'` supportées — chacune avec son bras propre

### Alertes WBPanel

| Condition | Niveau | Message |
|---|---|---|
| Masse départ > MTOW | Erreur | « Masse départ (X kg) dépasse le MTOW » |
| Masse arrivée > MTOW | Erreur | « Masse arrivée (X kg) dépasse le MTOW » |
| Centrage hors enveloppe | Erreur | « Centrage hors enveloppe — revoir la répartition » |
| Aucune station `'fuel'` | Warning | « Aucune station carburant — centrage arrivée = centrage départ » |

### `AircraftEditorScreen` — stations

- Colonne "Poids max" remplacée par sélecteur **Sec / Carburant** (`kind`)
- Libellé de la colonne masse : "Masse (kg)" pour `dry`, "Carburant (L)" pour `fuel`

---

## Sujet B — Tables de performance

### Changements de types (`src/types/index.ts`)

```typescript
interface PerformanceTable {
  // Axes
  weights: number[]              // kg, triés croissant
  pressureAltitudes: number[]    // ft, triés croissant
  oats: number[]                 // °C (absolus ou écart ISA), triés croissant

  // Sémantique OAT — NOUVEAU
  oatAxis?: 'absolute' | 'isa_delta'  // défaut 'absolute'

  // Valeurs
  values: number[][][]           // [w][pa][oat] — piste dure, distances en mètres
  grassValues?: number[][][]     // piste herbe, mêmes dimensions — NOUVEAU

  // Correction de poids — NOUVEAU
  weightCorrection?: 'interpolate' | 'quadratic'  // défaut 'interpolate'
  referenceWeight?: number       // requis si quadratic
  weightCorrectionDivisor?: number  // défaut = referenceWeight

  // Correction vent (deux modes exclusifs)
  windCorrections?: Array<{ speedKt: number; factor: number }>  // NOUVEAU
  headwindFactor?: number        // réduction linéaire /kt (ignoré si windCorrections présent)
  tailwindFactor?: number        // majoration linéaire /kt (ignoré si windCorrections présent)

  // Supprimés : slopeFactor, grassFactor (remplacé par grassValues ou factors.grass)
}

interface AircraftPerformance {
  toTable: PerformanceTable
  ldgTable: PerformanceTable
  factors: {
    regulatory: number   // multiplicateur réglementaire, appliqué en dernier
    grass: number        // facteur herbe fallback, utilisé si table.grassValues absent
    // Supprimés : headwindPerKt, tailwindPerKt (maintenant dans la table)
  }
}
```

### `perfCalc.ts` — logique étendue

**`interpolatePerf(table, weight, pa, oat)`** :

1. Si `oatAxis === 'isa_delta'` : convertir `oat` en écart ISA avant lookup
   `delta = oat - (15 - 2 * pa / 1000)`
   Interpoler `table.oats` avec `delta`
2. Interpolation 3D identique au code actuel
3. Si `weightCorrection === 'quadratic'` :
   `d *= (weight / div)²` où `div = weightCorrectionDivisor ?? referenceWeight ?? weights[0]`
   *(le tableau est lu au premier poids, la correction est appliquée après)*

**`computePerf(table, cond, factors)`** :

1. Sélectionner `grassValues` si `cond.surfaceGrass && table.grassValues` présent,
   sinon `values` × `factors.grass` si `cond.surfaceGrass`
2. Appeler `interpolatePerf`
3. Vent :
   - Si `windCorrections` présent → interpoler le facteur entre les points ; appliquer
   - Sinon → `headwindFactor` / `tailwindFactor` linéaire comme actuellement
4. Appliquer `factors.regulatory` en dernier

### Validation (`src/lib/aviation/perfTableValidation.ts`) — nouveau fichier

```typescript
export interface PerfTableValidation {
  errors: string[]    // bloquants — table refusée, calcul impossible
  warnings: string[]  // paramètres ignorés silencieusement sans ce warning
}

export function validatePerformanceTable(table: unknown): PerfTableValidation
```

**Erreurs bloquantes :**

| Condition | Message |
|---|---|
| `weights` / `pressureAltitudes` / `oats` absent ou vide | « Axe [x] manquant ou vide » |
| Axe non trié croissant | « Axe [x] doit être trié croissant » |
| `values.length !== weights.length` | « values : dimension poids incohérente (attendu N, reçu M) » |
| `values[i].length !== pressureAltitudes.length` | « values[i] : dimension PA incohérente » |
| `values[i][j].length !== oats.length` | « values[i][j] : dimension OAT incohérente » |
| `grassValues` présent, dimensions ≠ `values` | « grassValues : dimensions différentes de values » |
| `weightCorrection: 'quadratic'` sans `referenceWeight` | « referenceWeight requis avec weightCorrection: quadratic » |
| `weightCorrection: 'quadratic'` avec `weights.length > 1` | « quadratic attend un seul poids — utiliser interpolate pour plusieurs poids » |
| Valeur ≤ 0 dans `values` ou `grassValues` | « Distance invalide à [i][j][k] : doit être > 0 » |

**Warnings :**

| Condition | Message |
|---|---|
| `windCorrections` et `headwindFactor` tous deux présents | « headwindFactor ignoré — windCorrections est prioritaire » |
| `windCorrections` et `tailwindFactor` tous deux présents | « tailwindFactor ignoré — windCorrections est prioritaire » |
| `referenceWeight` sans `weightCorrection: 'quadratic'` | « referenceWeight ignoré » |
| `weightCorrectionDivisor` sans `weightCorrection: 'quadratic'` | « weightCorrectionDivisor ignoré » |
| `windCorrections[0].speedKt !== 0` | « windCorrections : premier point devrait être speedKt=0, factor=1.0 » |
| `windCorrections` contient `factor > 1.0` | « windCorrections : facteur > 1.0 à speedKt=[x] — suspect pour vent de face » |

### `AircraftEditorScreen` — performances

- Validation lancée à chaque keystroke dans les textarea JSON (toTable / ldgTable)
- Erreurs → bandeau rouge sous le textarea + bouton Sauvegarder **désactivé**
- Warnings → bandeau amber, sauvegarde autorisée
- L'affichage `PerfTablePreview` existant reste inchangé

### `PerfPanel` — alertes calcul

- Si la table du snapshot avion a des erreurs de validation → message d'erreur, **pas de calcul affiché**
- Si warnings → badge amber « ⚠ config partielle » avec liste au survol/clic
- Résultats : alerte rouge si distance corrigée > TODA ou LDA saisis

---

## Tests unitaires

### Nouveau : `src/__tests__/aviation/perfTableValidation.test.ts`

- 1 test par règle d'erreur (cas valide → pas d'erreur ; cas invalide → erreur attendue)
- 1 test par warning (configuration ambiguë → warning attendu)
- Test combiné : table valide complète → zéro erreur, zéro warning

### Étendu : `src/__tests__/aviation/perfCalc.test.ts`

| Cas | Ce qui est vérifié |
|---|---|
| `oatAxis: 'isa_delta'` | Même résultat à OAT = ISA qu'avec `oatAxis: 'absolute'` à 15°C (PA=0) |
| `oatAxis: 'isa_delta'` | Conversion correcte à PA=4000 ft, OAT=7°C → delta=0 |
| `weightCorrection: 'quadratic'` | Distance × (P/div)² appliquée |
| `grassValues` présent | `computePerf` sélectionne `grassValues` quand `surfaceGrass: true` |
| `grassValues` absent | `computePerf` applique `factors.grass` quand `surfaceGrass: true` |
| `windCorrections` | Interpolation correcte entre deux points tabulés |
| Fallback `headwindFactor` | Utilisé quand `windCorrections` absent |

### Étendu : `src/__tests__/aviation/wbCalc.test.ts`

| Cas | Ce qui est vérifié |
|---|---|
| Station `'fuel'` | Masse = litres × fuelDensity |
| Station `'dry'` | Masse = kg direct |
| Mix `'dry'` + `'fuel'` | Somme correcte des moments |
| `fuelDensity` custom | Paramètre pris en compte |

---

## Ce qui est hors scope

- Facteur pente (slope) : supprimé
- Distance de roulement séparée : ignorée, seul le passage obstacle est modélisé
- Unités configurables : PA toujours en ft, OAT toujours en °C, distances toujours en mètres, poids toujours en kg
- Cas "sans frein sur herbe" (DR400 LDG) : non modélisé en v1
- Densité carburant par avion : constante globale Avgas 100LL (0.72 kg/L)
