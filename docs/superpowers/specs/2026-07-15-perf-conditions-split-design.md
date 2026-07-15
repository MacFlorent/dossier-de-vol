# Design : Scinder la carte Conditions de la page Performances

**Date :** 2026-07-15
**Statut :** approuvé

## Contexte

Depuis la refonte de la page Performances (`docs/superpowers/specs/2026-07-14-perf-panel-redesign-design.md`), chaque onglet aérodrome affiche une carte unique `AerodromeConditionsCard`, titrée génériquement "Conditions", qui mélange quatre types d'information sans distinction visuelle : infrastructure terrain (Élévation, Surface, TODA/LDA), météo (QNH, Temp, Vent réel), sélecteur de piste active, et altitudes calculées (pression/densité). Le titre "Conditions" ne dit rien de l'aérodrome consulté.

## Périmètre

1. Extraire QNH, Temp, Vent réel et les altitudes pression/densité dans une nouvelle carte "Conditions", positionnée juste sous la carte "Marge réglementaire".
2. Renommer le titre de la carte restante (Élévation, Surface, TODA/LDA, sélecteur de piste, édition référentiel) avec le descripteur de l'aérodrome : `<OACI> — <nom>` (ou `<OACI>` seul si l'aérodrome n'est pas dans le référentiel).

## 1. Répartition des champs

| Nouvelle carte "Conditions" (`AerodromeWeatherCard`) | Carte aérodrome renommée (`AerodromeTerrainCard`) |
|---|---|
| QNH, Température | Élévation, Surface |
| Vent réel (direction/vitesse), secours manuel si aucune piste | TODA, LDA |
| Alt. pression / Alt. densité (calculées) | Sélecteur de piste active |
| — | Bouton ✏️ édition référentiel |

Le sélecteur de piste reste dans la carte aérodrome car c'est une info piste/terrain, même s'il affiche pour chaque piste la composante de vent calculée à partir des données saisies dans la carte Conditions — les deux cartes lisent/écrivent le même `TerrainPerfInputs` partagé, donc rien n'est dupliqué.

## 2. Portée et position

`AerodromeWeatherCard` reste **scopée à l'onglet aérodrome actif**, comme aujourd'hui — son contenu change avec l'onglet sélectionné, elle ne devient pas globale au dossier. Seule sa position visuelle change : elle devient le premier élément du contenu de l'onglet actif, donc apparaît juste après la carte "Marge réglementaire" (qui reste, elle, hors du scope d'un onglet).

Ordre final dans `PerfPanel.tsx` :

```
Marge réglementaire (Card, inchangée)
  ↓
[onglet actif] AerodromeWeatherCard ("Conditions")
  ↓
[onglet actif] AerodromeTerrainCard (titre = OACI + nom)
  ↓
[onglet actif] PerfResultCard × 2 (Décollage / Atterrissage)
```

## 3. Composants

### `src/features/perf/AerodromeWeatherCard.tsx` (nouveau)

```ts
interface Props {
  runways: RunwayInfo[]   // nécessaire pour la sélection auto de piste au meilleur vent de face
  inputs: TerrainPerfInputs
  qnh: number
  temp: number
  pa: number
  da: number
  onUpdate: (changes: Partial<TerrainPerfInputs>) => void
}
```

Contient la logique `bestRunway`/`updateWind` déplacée telle quelle depuis l'actuel `AerodromeConditionsCard.tsx` (lignes 18-22 et 36-52) — c'est elle qui applique la sélection automatique de piste au meilleur vent de face la première fois que direction et vitesse sont connues, en écrivant `selectedRunway`/`windKt`/`surface`/`toda`/`lda` dans `TerrainPerfInputs` même si ces champs sont affichés dans l'*autre* carte. `runways` est donc requis ici uniquement pour ce calcul, pas pour un affichage local.

Structure : titre "Conditions" (H2, remplace l'actuel `<h2>Conditions</h2>`), puis un grid 2 colonnes reprenant exactement la disposition existante des sous-sections "Terrain"/"Vent réel" (lignes 93-141 de l'actuel fichier), renommées "Météo"/"Vent réel" — sous-section "Météo" : QNH, Temp, puis la `<dl>` Alt. pression/densité (déplacée depuis la sous-section Terrain) ; sous-section "Vent réel" : inchangée (dir/vitesse + secours manuel si `runways.length === 0`).

### `src/features/perf/AerodromeTerrainCard.tsx` (renommage de `AerodromeConditionsCard.tsx`)

```ts
interface Props {
  title: string           // nouveau — résolu par PerfPanel (OACI + nom, ou OACI seul)
  runways: RunwayInfo[]
  inputs: TerrainPerfInputs
  elevation: number
  onUpdate: (changes: Partial<TerrainPerfInputs>) => void
  onEditReferential: () => void
}
```

`qnh`/`temp`/`pa`/`da` disparaissent de ses props (déplacés dans `AerodromeWeatherCard`). Le composant garde `handleRunwaySelect` et le rendu du sélecteur de piste actif tels quels (lignes 27-34 et 64-91 de l'actuel fichier) — ils lisent toujours `inputs.windDirDeg`/`inputs.windSpeedKt` pour calculer face/travers par piste, juste alimentés depuis l'autre carte maintenant. Le contenu "Terrain" (lignes 93-121) perd QNH/Temp (déplacés) et la `<dl>` PA/DA (déplacée) ; il ne reste qu'Élévation + Surface (une ligne de grid 2 colonnes) puis TODA/LDA (une seconde ligne) — la disposition en deux colonnes (Terrain | Vent réel) n'a plus lieu d'être, remplacée par une simple grille 2 colonnes de champs.

Le titre passe de `<h2>Conditions</h2>` (statique) à `<h2>{title}</h2>` (dynamique). `PerfPanel.tsx` résout `title` ainsi :

```ts
const title = aero ? `${icao} — ${aero.name}` : icao
```

(`aero` est déjà résolu via `getAerodrome(icao)` dans `PerfPanel.tsx` aujourd'hui — pas de nouvel appel nécessaire.)

### `src/features/perf/PerfPanel.tsx`

Dans le bloc IIFE de l'onglet actif (lignes 119-151 actuelles), insérer `AerodromeWeatherCard` avant `AerodromeTerrainCard` (anciennement `AerodromeConditionsCard`), et calculer `title` comme ci-dessus. Aucun autre changement — `elevation`/`qnh`/`temp`/`pa`/`da`/`cond` restent calculés une seule fois dans `PerfPanel` et distribués aux deux cartes plus les deux `PerfResultCard`, exactement comme aujourd'hui.

## 4. Tests

`src/__tests__/perf/AerodromeConditionsCard.test.tsx` est scindé en deux fichiers, chaque cas de test migrant vers le composant dont il vérifie le comportement :

- `src/__tests__/perf/AerodromeWeatherCard.test.tsx` : "shows the pressure and density altitude passed in", "auto-selects the best-headwind runway...", "does not re-select a runway once one was chosen manually...", "shows a manual wind-component fallback input when the aerodrome has no runways" (ce champ de secours fait partie de la sous-section "Vent réel", donc de cette carte). Les deux tests de sélection auto vérifient déjà l'appel à `onUpdate` via `onUpdate.mock.calls`, pas le rendu d'un bouton — inchangés par la migration.
- `src/__tests__/perf/AerodromeTerrainCard.test.tsx` (renommé) : "shows headwind and crosswind components on each runway button...", "clicking a runway button selects it manually", "calls onEditReferential when the edit icon is clicked".

`src/__tests__/perf/PerfPanel.test.tsx` : le test "shows both Décollage and Atterrissage blocks" et les tests d'onglets restent valables sans changement (ils ne dépendent pas de la structure interne des cartes). Un nouveau test vérifie que le titre affiché sur la carte aérodrome correspond à `<OACI> — <nom>` pour un aérodrome connu du référentiel, et à l'OACI seul sinon.

## Ce qui n'est pas couvert

- Pas de changement au modèle de données (`TerrainPerfInputs`, `PerfConditions`) — cette évolution est purement une réorganisation d'affichage entre deux composants existants.
- Pas de changement au calcul de piste la plus probable, à la validation des tables de performance, ni au calcul PA/DA — seule leur répartition visuelle entre les deux cartes change.
- Pas de renommage de `TerrainPerfInputs` ni d'autres types partagés, malgré le renommage des composants d'affichage.
