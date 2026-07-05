# Design : Unification des blocs segment (Vols / Carbu)

**Date :** 2026-07-05
**Statut :** approuvé

## Contexte

Le bloc "segment" diffère aujourd'hui entre l'onglet Vols (`BranchesPanel.tsx`, composant privé `SegmentCard`) et l'onglet Carbu (`FuelPanel.tsx`, fonction privée `segmentRow`) :

| | Vols | Carbu |
|---|---|---|
| Nom | éditable | lecture seule |
| Distance (nm) | éditable | lecture seule |
| Cap °M | éditable | lecture seule |
| Vent (direction + force) | éditable | éditable |
| GS / WCA | calculés, affichés | calculés, affichés |
| Durée | absente | affichée (texte) |
| Notes libres | champ texte | absente |
| Réorganiser / supprimer | oui (↑↓, ✕) | non |
| Ajouter un segment | oui | non |
| Repliable | non | non |

Les deux pages opèrent sur la même donnée sous-jacente (`FlightBranch.segments`), donc cette divergence est purement une différence de présentation et de fonctionnalités exposées, sans raison de fond.

## Périmètre

1. Un unique composant de carte segment, utilisé identiquement sur Vols et Carbu : mêmes champs éditables (nom, distance, cap, vent), mêmes valeurs calculées affichées (GS, WCA, durée).
2. Carbu devient éditable sur nom/distance/cap (au même titre que Vols) — pas de duplication de vérité, les deux pages écrivent dans le même `FlightBranch.segments`.
3. Ajout / suppression / réorganisation des segments ENROUTE possibles depuis Carbu aussi, via un composant de section partagé.
4. Suppression complète du champ "Notes" libre par segment — UI et modèle de données (`FlightSegment.notes`), sans migration de compatibilité.
5. Ajout de l'affichage de la durée du segment (calculée à partir de la distance et de la GS, aucune nouvelle saisie).
6. La carte segment devient repliable (dépliée par défaut).

## Ce qui ne change pas

- Le segment de déroutement (ALT) reste affiché où il l'est déjà aujourd'hui : à la suite de la liste sur Vols, dans son propre bloc "Déroutement planifié" sur Carbu (avec ses sous-totaux carburant spécifiques, inchangés). Seul le rendu de la carte elle-même devient le composant partagé.
- Les sous-totaux et calculs carburant de Carbu (`computeBranchFuel`, Blocs 1/3/5/6) sont inchangés.
- `FlightBranch.notes` (remarques libres au niveau du vol, en bas de `BranchView`) est un champ distinct de `FlightSegment.notes` et n'est pas concerné par ce lot.
- Aucun changement de formule de calcul (GS, WCA, durée) — uniquement extraction/partage du code existant.

## Architecture

### `src/components/ui/SegmentCard.tsx` (nouveau, partagé)

Remplace le composant privé `SegmentCard` de `BranchesPanel.tsx` et la fonction privée `segmentRow` de `FuelPanel.tsx`.

```tsx
interface SegmentCardProps {
  segment: FlightSegment
  tas: number
  isLastEnroute: boolean
  onChange: (seg: FlightSegment) => void
  onRemove?: () => void        // absent = pas de bouton supprimer (cas ALT)
  onMoveUp?: () => void        // absent = pas de bouton ↑ (cas ALT)
  onMoveDown?: () => void      // absent = pas de bouton ↓ (cas ALT)
  canMoveUp?: boolean
  canMoveDown?: boolean
}
```

- Champs éditables : nom (texte), distance (nm), cap magnétique (°M), vent (direction + force) — repris tels quels de l'actuelle carte Vols.
- Valeurs calculées affichées : GS, WCA, **durée** (nouveau — voir §Calcul de durée).
- Pas de champ notes.
- Repliable : voir §Repli ci-dessous.
- Style ALT (bordure/fond ambre, badge "ALT") conservé, activé quand `segment.role === 'ALTERNATE'`.
- `onRemove`/`onMoveUp`/`onMoveDown` optionnels : absents pour la carte ALT (elle n'est ni réordonnable ni supprimable manuellement, comme aujourd'hui — sa présence est synchronisée avec les aérodromes via `syncAlternateSegment`).

### `src/components/ui/SegmentsSection.tsx` (nouveau, partagé)

En-tête "Segments" + bouton "+ Segment" + liste des `SegmentCard` pour les segments `ENROUTE` uniquement, avec ajout/suppression/réorganisation intégrés.

```tsx
interface SegmentsSectionProps {
  branch: FlightBranch
  tas: number
  onChange: (branch: FlightBranch) => void
}
```

Reprend la logique aujourd'hui dans `BranchesPanel.tsx` (`addSegment`, `removeSegment`, `moveSegment`) :
- `addSegment` : nouveau segment ENROUTE vide, inséré avant le segment ALT s'il existe (sinon en fin de liste).
- `removeSegment` : refuse si c'est le seul segment ENROUTE ou si c'est le segment ALT.
- `moveSegment` : échange avec le voisin, uniquement parmi les segments ENROUTE.

Ne gère **pas** le segment ALT — chaque page continue de l'afficher séparément où elle le fait déjà, via `SegmentCard` directement (sans `onRemove`/`onMoveUp`/`onMoveDown`).

### Calcul de durée partagé

`fuelCalc.ts` calcule déjà GS/WCA/durée par segment dans une fonction privée :

```ts
function computeSegmentDetail(segment: FlightSegment, tas: number): SegmentFuelDetail {
  let gs = tas, wca = 0
  if (segment.wind) {
    const r = computeSegmentWind(segment.headingMag, tas, segment.wind.directionDeg, segment.wind.speedKt)
    gs = r.gs; wca = r.wca
  }
  const timeMin = gs !== 0 ? (segment.distanceNm / gs) * 60 : Infinity
  return { segmentId: segment.id, name: segment.name, role: segment.role, distanceNm: segment.distanceNm, gs, wca, timeMin }
}
```

Cette logique est extraite en fonction pure **exportée**, à côté de `computeSegmentWind` dans `src/lib/aviation/windTriangle.ts` (par exemple `computeSegmentTiming(segment, tas): { gs, wca, timeMin }`), ne dépendant que de `segment` + `tas` — pas de `FuelInputs` ni de `CruiseRegime`. `fuelCalc.ts` l'appelle au lieu de dupliquer le calcul (aucun changement de résultat, `computeBranchFuel` produit exactement les mêmes valeurs qu'aujourd'hui).

`SegmentCard` utilise cette même fonction pour afficher GS/WCA/durée sur Vols comme sur Carbu, sans dépendre des données carburant.

Le format d'affichage de la durée (`fmtTime`, ex. "18min", "1h05", "∞" si GS = 0) est extrait de `FuelPanel.tsx` vers un utilitaire partagé (par ex. `src/lib/format/time.ts`, fonction `formatDuration(min: number): string`), utilisé par `SegmentCard` et conservé dans `FuelPanel` pour les sous-totaux existants.

### `BranchesPanel.tsx`

Le bloc "Segments" de `BranchView` (actuellement la boucle `enrouteSegments.map(...)` + le rendu conditionnel de `alternateSegment`) devient :

```tsx
<SegmentsSection branch={branch} tas={speedKt} onChange={onChange} />
{alternateSegment && (
  <div className="mb-2">
    <SegmentCard segment={alternateSegment} tas={speedKt} isLastEnroute={false} onChange={updateSegment} canMoveUp={false} canMoveDown={false} />
  </div>
)}
```

Le composant privé `SegmentCard` actuel de ce fichier est supprimé (remplacé par l'import du composant partagé). `addSegment`, `removeSegment`, `moveSegment` sont supprimés de `BranchesPanel.tsx` (déplacés dans `SegmentsSection`).

### `FuelPanel.tsx`

- **Bloc 2 — Segments** : le contenu (actuellement `enrouteDetails.map(d => segmentRow(d.segmentId))`) devient `<SegmentsSection branch={activeBranch} tas={regime.speed} onChange={updatedBranch => onUpdateBranches(branches.map(b => b.id === validId ? updatedBranch : b))} />`. Le sous-total "Temps de vol brut" (`result.rawFlightTimeMin`, via `computeBranchFuel`) reste affiché en dessous, inchangé.
- **Bloc 4 — Déroutement planifié** : garde sa carte séparée avec ses sous-totaux carburant (temps/essence de déroutement). Le contenu segment (actuellement `segmentRow(alternateDetail.segmentId)`) devient `<SegmentCard segment={alternateSegment} tas={regime.speed} isLastEnroute={false} onChange={...} canMoveUp={false} canMoveDown={false} />` (pas de `onRemove`).
- La fonction privée `segmentRow` est supprimée. `patchSegmentWind`/`updateWindDir`/`updateWindSpeed` sont remplacés par un `onChange` générique sur le segment complet (cohérent avec l'édition étendue nom/distance/cap), passant par `onUpdateBranches`.

### Modèle de données

`src/types/index.ts` :

```ts
export interface FlightSegment {
  id: string
  role: FlightSegmentRole
  name: string
  distanceNm: number
  headingMag: number
  wind: { directionDeg: number; speedKt: number } | null
  // notes: string   ← supprimé
}
```

Suppression du champ `notes` dans tous les sites de construction d'un `FlightSegment` :
- `BranchesPanel.tsx` : `addSegment` (dans `SegmentsSection` après déplacement), `syncAlternateSegment`.
- `App.tsx` / tout autre point de création de branche initiale avec un segment par défaut.
- Fixtures de test (`BranchesPanel.test.tsx`, `FuelPanel.test.tsx`, `dossierTransforms.test.ts`, `fuelCalc.test.ts`, et tout autre test construisant un `FlightSegment`).

Suppression complète, sans migration ni shim de compatibilité (même principe que la suppression de `weatherInputs` dans le lot précédent) : un segment déjà stocké avec un `notes` orphelin est simplement ignoré par le typage à la lecture, aucun risque d'erreur runtime.

## Repli (collapse)

- État local `useState<boolean>` dans `SegmentCard`, initialisé à `false` (déplié). Non persisté — revient déplié à chaque montage (changement de vol, rechargement de page).
- Basculé par un chevron cliquable dans l'en-tête de la carte.
- **En-tête repliée** : `<nom> · <distance> nm · <GS> kt · <durée>`, ex. `L'Aigle-Flers · 50 nm · 165 kt · 18min`.
- **Corps déplié** : identique à la carte Vols actuelle (nom éditable, grille distance/cap/vent, ligne GS/WCA) + durée ajoutée sur cette ligne.
- GS négatif ou nul : traitement visuel unifié sur le plus complet des deux rendus actuels (texte rouge + "⚠", cf. Carbu aujourd'hui). Durée affiche "∞" si GS = 0 (comportement `formatDuration`/`fmtTime` existant, inchangé).

## Tests

- Nouveaux tests `SegmentCard.test.tsx` : rendu des champs éditables, absence de champ notes, repli/dépli (contenu visible/masqué), affichage GS/WCA/durée corrects, cas GS ≤ 0.
- Nouveaux tests `SegmentsSection.test.tsx` : ajout d'un segment (inséré avant l'ALT si présent), suppression (refusée si dernier ENROUTE), réorganisation (↑/↓), exclusion du segment ALT de la liste gérée.
- `BranchesPanel.test.tsx` : mise à jour pour le composant partagé (retrait des tests spécifiques au notes-field local si présents, vérification que le comportement actuel — édition, ajout, suppression, réorganisation — persiste sans régression).
- `FuelPanel.test.tsx` : nouveaux tests d'édition croisée (nom/distance/cap éditables depuis Carbu), ajout/suppression/réorganisation de segments depuis Carbu, conservation des tests existants sur le calcul carburant (Blocs 1/3/5/6, inchangés).
- Retrait de `notes` dans toutes les fixtures de segments à travers la suite de tests (`dossierTransforms.test.ts`, `storage.migration.test.ts` si applicable, `fuelCalc.test.ts`).
- Vérification finale : suite complète, `tsc --noEmit`, `npm run build` — même barre de vérification que le lot précédent.

## Ce qui n'est pas couvert

- Pas de restructuration du découpage en "Blocs" de Carbu (Bloc 2 / Bloc 4 restent deux cartes séparées) — seul le contenu segment à l'intérieur devient partagé.
- Pas de changement des sous-totaux ou du calcul carburant global (`computeBranchFuel`, Blocs 1/3/5/6).
- Pas de persistance de l'état replié/déplié entre sessions ou rechargements.
- Pas de changement du champ `FlightBranch.notes` (remarques libres au niveau du vol) — hors périmètre, distinct du `FlightSegment.notes` supprimé ici.
