# Design : Refonte de la page M&C (Masse et Centrage)

**Date :** 2026-07-12
**Statut :** approuvé

## Contexte

La page M&C (`WBPanel.tsx`) est la dernière à ne pas suivre le pattern de mise en page adopté par Carbu et Vols (largeur pleine, cartes empilées) — elle reste centrée en `max-w-4xl` avec une grille 2 colonnes. Son graphe d'enveloppe de centrage (SVG fait main, sans librairie) est petit (viewBox 300×200, plafonné à `max-w-xs`), sans aucune graduation d'axe, et affiche deux points « Départ » / « Arrivée » — sauf que le point « Arrivée » est actuellement un artefact : faute de connaître la consommation par branche au niveau du dossier, il est toujours calculé comme strictement égal au point « Départ » (bug documenté dans le code).

Par ailleurs, la capacité carburant d'un avion est aujourd'hui un seul nombre global (`characteristics.fuelCapacity`), alors que certains avions ont plusieurs réservoirs de capacités différentes — `resources/dr48.json` documente déjà "Essence Avant (80L max)" / "Essence Arrière (110L max)" dans le *nom* des stations, sans que cette information soit exploitable en calcul.

## Périmètre

1. Ajout d'une capacité par station carburant (nouveau modèle de données), remplaçant la capacité globale.
2. Remplacement des points Départ/Arrivée du graphe par trois points : Sans carburant, Actuel (saisie utilisateur), Plein carburant.
3. Graphe agrandi, avec axes gradués et légendés (masse en kg, CG en mm).
4. Homogénéisation de la mise en page de M&C avec Carbu/Vols (largeur, cartes).
5. Alignement du tableau de résultats et des alertes sur les mêmes trois points.

## 1. Capacité de carburant par réservoir

### Modèle de données

`src/types/index.ts` :

```ts
export interface WeightStation {
  name: string
  arm: number
  kind: 'dry' | 'fuel'
  capacityL: number   // nouveau — capacité utilisable, pertinent seulement si kind === 'fuel'
}
```

`AircraftCharacteristics.fuelCapacity` est **supprimé** :

```ts
export interface AircraftCharacteristics {
  regimes: CruiseRegime[]
  // fuelCapacity: number  ← supprimé
}
```

`capacityL` est obligatoire au niveau du type mais sans validation bloquante à la saisie (même traitement que `arm` aujourd'hui — défaut `0`, éditable librement).

### Utilitaire partagé

`src/lib/aviation/wbCalc.ts` — nouvelle fonction exportée, à côté de `computeWB` :

```ts
export function totalFuelCapacity(massBalance: AircraftMassBalance): number {
  return massBalance.stations
    .filter(s => s.kind === 'fuel')
    .reduce((sum, s) => sum + s.capacityL, 0)
}
```

Remplace tous les usages de `characteristics.fuelCapacity` :

| Fichier | Usage actuel | Remplacement |
|---|---|---|
| `src/features/fuel/FuelPanel.tsx:24` | `aircraft.characteristics.fuelCapacity` | `totalFuelCapacity(aircraft.massBalance)` |
| `src/features/dossier/DossierPanel.tsx:199` | idem, ligne récap "Capacité avion" | idem |
| `src/screens/HomeScreen.tsx:147` | idem, carte résumé avion | idem |
| `src/features/wb/WBPanel.tsx:222,230` | idem, par station (bug : capacité globale utilisée comme max de *chaque* station) | `st.capacityL` directement — corrige le bug au passage |

### Éditeur avion (`AircraftEditorScreen.tsx`)

- Suppression du champ autonome "Capacité carburant (L)" (lignes ~392-399) et de l'état `fuelCapacity` (ligne 159).
- Le tableau des stations (lignes ~421-481) gagne une colonne "Capacité (L)", affichée uniquement pour les lignes `kind === 'fuel'` (cellule vide/non affichée pour les lignes `dry`). `updateStation` gère un nouveau `field: 'capacityL'`.
- Quand une ligne passe de `dry` à `fuel` via le sélecteur, `capacityL` est initialisé à `0` (comme `arm` l'est déjà à la création d'une ligne).
- Affichage informatif en lecture seule du total (`totalFuelCapacity`) à côté du tableau, pour remplacer le repère visuel qu'apportait l'ancien champ global.

### Migration des données existantes

`src/lib/storage.ts`, fonction `getAircraft()` (bloc de migration défensive existant, lignes 18-42) — nouveau bloc suivant le même pattern (détection de champ manquant, pas de version de schéma) :

```ts
const legacyCapacity = (ac.characteristics as { fuelCapacity?: number }).fuelCapacity
if (legacyCapacity !== undefined) {
  const fuelStations = ac.massBalance.stations.filter(s => s.kind === 'fuel')
  const each = fuelStations.length > 0 ? legacyCapacity / fuelStations.length : 0
  ac.massBalance.stations = ac.massBalance.stations.map(s =>
    s.kind === 'fuel' && s.capacityL === undefined ? { ...s, capacityL: each } : s
  )
  delete (ac.characteristics as { fuelCapacity?: number }).fuelCapacity
}
```

`migrateDossier()` (lignes 103-127) applique la même logique à `data.aircraft.massBalance` pour les dossiers importés dont le snapshot avion est ancien.

### Fichiers modèles (`resources/*.json`)

Ces fichiers sont chargés directement comme `Aircraft` typé (`src/lib/templates/index.ts`), sans passer par la migration de `storage.ts` — mise à jour manuelle, en reprenant les valeurs déjà documentées dans les noms de station :

- `dr48.json` : `fuelCapacity: 190` supprimé ; `capacityL: 80` sur "Essence Avant", `capacityL: 110` sur "Essence Arrière".
- `dr221.json` : `fuelCapacity: 110` supprimé ; `capacityL: 110` sur "Carburant".
- `dr42.json` : `fuelCapacity: 110` supprimé ; `capacityL: 110` sur sa station fuel.

### Tests à mettre à jour

Toutes les fixtures construisant un `AircraftCharacteristics`/`WeightStation` (`FuelPanel.test.tsx`, `BranchesPanel.test.tsx`, `ChangeAircraftModal.test.tsx`, `storage.test.ts`, `storage.migration.test.ts`, `dossierTransforms.test.ts`, `wbCalc.test.ts`) : retrait de `fuelCapacity`, ajout de `capacityL` sur les stations `fuel`. Nouveau test de migration (`storage.migration.test.ts`) : un avion sauvegardé avec l'ancien `fuelCapacity` et sans `capacityL` obtient une répartition égale entre ses stations fuel, et perd le champ `fuelCapacity`.

## 2. Calcul des trois points W&B

`computeWB()` (`src/lib/aviation/wbCalc.ts`) reste inchangé — générique, il accepte n'importe quel `StationLoading`.

Dans `WBPanel.tsx`, remplacement de `arrivalFuelLoading()` (supprimée, avec son commentaire sur le bug arrivée = départ) par deux constructions de chargement, à charge sèche identique (celle actuellement saisie) et carburant variable :

```ts
function zeroFuelLoading(fuelStationNames: string[]): StationLoading {
  return Object.fromEntries(fuelStationNames.map(n => [n, 0]))
}
function fullFuelLoading(fuelStations: WeightStation[]): StationLoading {
  return Object.fromEntries(fuelStations.map(s => [s.name, s.capacityL]))
}
```

```ts
const zfwResult   = useMemo(() => computeWB(massBalance, { ...loading, ...zeroFuelLoading(fuelStationNames) }), [massBalance, loading, fuelStationNames])
const fullResult  = useMemo(() => computeWB(massBalance, { ...loading, ...fullFuelLoading(fuelStations) }), [massBalance, loading, fuelStations])
const curResult   = useMemo(() => computeWB(massBalance, loading), [massBalance, loading])
```

`curResult` est l'actuel `depResult`, simplement renommé. Si l'avion n'a aucune station fuel, les trois résultats coïncident (masse/CG identiques) — pas de cas particulier à gérer dans l'UI au-delà du texte informatif déjà existant ("Aucune station carburant…").

## 3. Mise en page

Conteneur racine de `WBPanel.tsx`, sur le modèle de `FuelPanel`/`BranchesPanel` :

```tsx
<div className="flex flex-col h-full">
  <div className="flex-1 overflow-auto p-4 space-y-5">
    <div className="grid gap-6 md:grid-cols-2">
      {/* Chargement (gauche) / Résultats M&C (droite) — inchangé dans le fond */}
    </div>
    {/* Graphe — nouvelle carte pleine largeur, en dessous */}
  </div>
</div>
```

Pas de `FlightTabStrip` : le chargement (`loading`) est au niveau du dossier, pas par branche — comportement actuel inchangé, cohérent avec l'absence de notion de vol actif sur cette page.

## 4. Graphe (`EnvelopeSVG`)

### Choix technique : pas de librairie de graphe

Le projet n'a aujourd'hui aucune dépendance de charting (seul `leaflet` pour les cartes). Ce graphe reste en SVG fait main plutôt que d'introduire une librairie (recharts, visx…) : le polygone d'enveloppe rempli n'est pas un type de graphe standard proposé clé en main par ces librairies, donc même avec une lib il faudrait passer par une échappatoire bas niveau pour le dessiner — autant garder le contrôle total sans ajouter de dépendance pour un seul graphe dans toute l'application.

### Points affichés

Props redéfinies :

```ts
{
  points: [number, number][]       // polygone d'enveloppe, inchangé
  zeroFuel: { weight: number; cg: number } | null
  current: { weight: number; cg: number } | null
  full: { weight: number; cg: number } | null
}
```

- Ligne pointillée grise reliant `zeroFuel` ↔ `full` (trajectoire de consommation à charge sèche constante).
- `zeroFuel` et `full` : cercles **creux** (fill none, stroke coloré), rayon modeste — bleu (`var(--blue)`) pour sans carburant, vert (`var(--green)`) pour plein carburant.
- `current` : cercle **plein**, clair (`var(--text-1)`), rayon plus grand — c'est le point opérationnellement réel, il doit dominer visuellement.
- Légende : rendue en HTML sous le SVG (pastilles + libellés, même pattern que les lignes du tableau Résultats), plus fiable que des `<text>` SVG codés en dur.

### Taille et échelle

- `viewBox` agrandi (~640×400 contre 300×200 actuellement), rendu en `className="w-full max-w-3xl mx-auto"` (suppression du plafond `max-w-xs`) — nettement plus grand tout en restant raisonnable sur très grand écran.
- Padding augmenté pour laisser la place aux libellés d'axes.
- Échelle `scaleX`/`scaleY` calculée sur l'**union** des points de l'enveloppe et des trois points calculés (pas seulement l'enveloppe comme aujourd'hui) — corrige un bug latent où un point hors enveloppe pouvait sortir du cadre visible.

### Axes

- Quadrillage complet en fond (lignes fines, faible contraste) + axes principaux (bas + gauche) plus marqués.
- Graduations chiffrées sur les deux axes : masse en kg (axe Y), CG en mm (axe X), nombre de graduations ~4-5, valeurs arrondies ("nice numbers") plutôt que le simple min/max.
- Titres d'axes ("Masse (kg)", "CG (mm)") en plus des graduations, pour lever toute ambiguïté d'unité.

## 5. Tableau de résultats et alertes

- Tableau "Résultats M&C" : 3 lignes dans l'ordre croissant de masse — Sans carburant, Actuel, Plein carburant —, mêmes couleurs de pastille que sur le graphe (creux bleu / plein clair / creux vert rendus en HTML comme aujourd'hui, pas besoin de cercles creux ici, la pastille pleine suffit pour l'identification dans une liste). Colonnes Masse/CG/Statut inchangées.
- Badge global du header (`wbStatus`) : `OK` seulement si les 3 points sont dans l'enveloppe ; `HORS LIMITE` sinon.
- Cartes d'alerte rouge en bas de page (MTOW dépassé, hors enveloppe) : déclenchées si **n'importe lequel** des 3 points dépasse le MTOW ou sort de l'enveloppe, avec un message qui précise quel(s) point(s) est/sont concerné(s) (ex. "Masse plein carburant (612 kg) dépasse le MTOW (600 kg)").

## Ce qui n'est pas couvert

- Pas de changement de `computeWB()` ni de l'algorithme de détection point-dans-polygone.
- Pas de `FlightTabStrip` sur M&C — la page reste au niveau dossier, pas par vol.
- Pas de changement du calcul carburant Carbu (`computeBranchFuel`) — seul son point de lecture de la capacité change (`totalFuelCapacity` au lieu de `characteristics.fuelCapacity`), le résultat numérique est identique tant que la somme des `capacityL` correspond à l'ancien `fuelCapacity` (vrai pour les 3 avions modèles après migration/mise à jour).
- Pas de validation empêchant un `capacityL` incohérent (négatif, ou somme différente d'une éventuelle contrainte réglementaire) — comportement laxiste identique à `arm` aujourd'hui.
- Pas de persistance d'un éventuel repli/dépli ou d'options d'affichage du graphe — page simple, sans état d'UI supplémentaire à sauvegarder.
