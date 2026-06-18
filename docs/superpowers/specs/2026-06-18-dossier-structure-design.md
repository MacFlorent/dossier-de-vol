# Dossier de vol — Améliorations de structure

**Date :** 2026-06-18  
**Statut :** Approuvé

## Contexte

Cinq améliorations à la structure et à l'ergonomie d'un dossier de vol :

1. Nom éditable du dossier
2. Changement d'avion en cours d'édition
3. Renommage "Branches" → "Vols" + durée calculée
4. Notes et modification de rôle inline sur les FlightPoints
5. Label "custom" pour les points non résolus

---

## 1. Modèle de données

**Fichier :** `src/types/index.ts`

### FlightPoint — ajout de `notes`

```ts
export interface FlightPoint {
  id: string
  type: FlightPointType
  identifier: string
  role: FlightPointRole
  notes?: string   // texte libre optionnel
}
```

Aucun autre changement de type. `FlightBranch`, `FlightDossier`, `FlightPointType` et `FlightPointRole` restent identiques.

### Compatibilité fichiers existants

Le champ `branches` dans `FlightDossier` conserve son nom en base JSON pour ne pas casser les dossiers existants. `migrateDossier()` dans `storage.ts` doit initialiser `notes: ''` sur les `FlightPoint` qui en seraient dépourvus.

---

## 2. AppChrome — nom éditable et changement d'avion

**Fichier :** `src/components/AppChrome.tsx`

### Nouveaux props

```ts
onUpdateName: (name: string) => void
onChangeAircraft: () => void
```

### Nom éditable inline

- Affichage actuel : `<span>{dossier.name}</span>`
- Au clic : bascule en `<input>` pré-rempli avec la valeur courante
- Validation : `blur` ou `Enter` → appelle `onUpdateName(value)`
- Annulation : `Escape` → restore la valeur précédente sans appel
- Style : même pattern que les labels de branche (border-b amber, bg transparent)

### Avion + bouton Changer

Dans la top bar, après le nom du dossier :

```
dossier de vol · [nom éditable]  DR221 [Changer]  2026-06-18
```

- Nom de l'avion affiché : `dossier.aircraft.name`
- Bouton "Changer" : variant `ghost`, size `sm`
- Au clic : ouvre `ChangeAircraftModal`

### ChangeAircraftModal

Nouveau composant (peut vivre dans `src/components/AppChrome.tsx` ou `src/features/aircraft/ChangeAircraftModal.tsx`).

- Liste tous les avions de la flotte (`listAircraft()`)
- Au clic sur un avion : affiche une `window.confirm` (ou un dialogue inline) :
  > "Changer l'avion pour [Nom] ? Les données carburant (GS de base), masse & centrage et performances seront réinitialisées."
- Si confirmé : dispatch `UPDATE_DOSSIER` avec le dossier recalculé (voir §2.1)
- Si annulé : ferme la modale sans changement

### 2.1 Recalcul lors du changement d'avion

Dans `App.tsx`, le handler construit un nouveau dossier :

```ts
const newDossier: FlightDossier = {
  ...dossier,
  aircraft: { ...newAircraft, snapshotAt: new Date().toISOString() },
  fuelInputs: Object.fromEntries(
    dossier.branches.map(b => [b.id, {
      ...dossier.fuelInputs[b.id],          // conserve roulage, marge, réserve, extras, plein
      gsBase: newAircraft.characteristics.regimes[0].speed,
      windAdjust: 0,
    }])
  ),
  loading: Object.fromEntries(
    newAircraft.massBalance.stations.map(s => [s.name, 0])
  ),
  perfInputs: {},
  updatedAt: new Date().toISOString(),
}
```

---

## 3. Panneau "Vols" (BranchesPanel)

**Fichier :** `src/features/branches/BranchesPanel.tsx`  
**Fichier :** `src/components/AppChrome.tsx`

### Renommage terminologique

| Avant | Après |
|-------|-------|
| Tab label "Branches" | "Vols" |
| "Étape N" (label branche par défaut) | "Vol N" |
| "Ajouter une branche" (bouton) | "Ajouter un vol" |

Les identifiants de code (`branches`, `FlightBranch`, etc.) et le format JSON restent inchangés.

### Durée calculée

À droite du champ distance, en lecture seule :

```
[ 125 ] nm   1h05
```

**Calcul :**
```ts
const speedKt = dossier.aircraft.characteristics.regimes[0].speed
const durationMin = distanceNm > 0
  ? Math.round((distanceNm / speedKt) * 60)
  : null
```

**Format d'affichage :**
- `null` ou `0` → `--`
- `< 60 min` → `0h MM` (ex : `0h45`)
- `>= 60 min` → `XhMM` (ex : `1h05`)

Style : texte dim, monospace, même ligne que `nm`.

Le panneau `BranchesPanel` doit recevoir `aircraft` (ou `dossier.aircraft`) en prop pour accéder à `regimes[0].speed`. Actuellement il reçoit `branches`, `onChange`, etc. — on ajoute `aircraft: AircraftSnapshot`.

---

## 4. FlightPoints — notes et rôle inline

**Fichier :** `src/features/branches/BranchesPanel.tsx`

### Layout de chaque point

Chaque point passe de 1 à 2 lignes :

**Ligne 1 :**  
`[badge rôle cliquable]` `[identifiant]` `[nom ou "custom"]` `[bouton ✕]`

**Ligne 2 :**  
`[input notes texte libre, placeholder "Notes..."]`

### Badge rôle cliquable

Au clic sur le badge, le rôle cycle dans l'ordre :
```
DEP → ARR → DIVERT → OVERFLY → DEP → …
```

Le cycle s'applique via `onChange` sur le point mis à jour. Pas de modale.

### Notes

- `<input type="text">` compact, full-width sur la ligne 2
- `onChange` met à jour `point.notes`
- Placeholder : `"Notes..."`
- Style cohérent avec les autres inputs du panel (bg-inset, border, rounded)

### Points non résolus

Quand `getAerodrome(pt.identifier)` retourne `null/undefined` :

- Avant : `<span className="text-[var(--amber)]">? non résolu</span>`
- Après : `<span className="text-[var(--text-dim)]">custom</span>`

---

## 5. Migration des données existantes

Dans `migrateDossier()` (`src/lib/storage.ts`) :

```ts
// Initialiser notes sur les FlightPoints si absent
for (const branch of dossier.branches) {
  for (const point of branch.points) {
    if (point.notes === undefined) point.notes = ''
  }
}
```

---

## Résumé des fichiers touchés

| Fichier | Changement |
|---------|-----------|
| `src/types/index.ts` | Ajout `notes?: string` sur `FlightPoint` |
| `src/components/AppChrome.tsx` | Nom éditable inline, avion + bouton Changer, modale ChangeAircraft |
| `src/App.tsx` | Props `onUpdateName`, `onChangeAircraft` ; logique recalcul avion |
| `src/features/branches/BranchesPanel.tsx` | Renommage Vols, durée calculée, FlightPoint 2 lignes (notes + rôle cycle), label "custom" |
| `src/lib/storage.ts` | Migration `notes` sur FlightPoint |

Aucun nouveau fichier requis (la modale ChangeAircraft peut vivre dans AppChrome.tsx).
