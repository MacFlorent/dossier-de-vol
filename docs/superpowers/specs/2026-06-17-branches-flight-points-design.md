# Design : Branches et FlightPoints — Remplacement de la page Route

**Date** : 2026-06-17
**Statut** : Approuvé

---

## Contexte et motivation

L'import de fichier `.flightplan` Skydemon est la seule façon actuelle de renseigner la route dans un dossier de vol. Il contient trop peu d'informations (pas d'élévation, pas de données de piste) et impose une dépendance externe.

L'objectif est de remplacer la page « Route » par une liste de **points de vol** (aérodromes de départ, d'arrivée, de déroutement, survolés), organisés en **branches** (tronçons avec escale). Ces points servent à :

1. Visualiser le vol sur une carte
2. Faciliter la récupération des NOTAM et de la météo par terrain
3. Pré-remplir les fiches de performance (élévation, piste active, TODA/LDA)
4. Calculer un bilan carburant par branche (vol avec escales)

Le log de nav est supprimé — il sera géré par le pilote en dehors de l'application.

---

## Base de données aérodromes (stockage local)

### Modèle

```typescript
interface StoredAerodrome {
  icao: string
  name: string
  lat: number
  lng: number
  elevationFt: number
  runways: RunwayInfo[]
  updatedAt: string        // ISO 8601
}

interface RunwayInfo {
  ident: string            // texte libre : "27", "09G", "27 herbe", etc.
  headingTrue: number      // cap vrai en degrés
  lengthFt: number
  toda?: number            // m — optionnel (données souvent absentes pour la France)
  lda?: number             // m — optionnel
  surface?: string         // "hard" | "grass" | texte libre
}
```

### Stockage

Stockée en **localStorage** sous une clé dédiée (`aerodromeDb`), indépendante des dossiers de vol. Initialisée à partir des ~100 entrées hardcodées existantes dans `src/lib/icao/database.ts` (lat/lng uniquement — élévation et pistes à compléter).

### Interface de gestion (HomeScreen)

Nouvel écran accessible depuis le HomeScreen, au même niveau que la flotte :

- Liste des aérodromes : ICAO, nom, élévation, nombre de pistes
- Export JSON / Import JSON (même pattern que la flotte)
- Fiche par aérodrome : édition de l'élévation et des pistes (ident, cap, longueur, TODA?, LDA?)
- Bouton « ↻ Rafraîchir depuis OpenAIP » par aérodrome (ou sélection multiple)

### Source API

**OpenAIP** (`api.core.openaip.net`) — accès gratuit sur inscription, clé API configurable dans les paramètres de l'application. Fallback sur la base hardcodée si l'API est indisponible ou si la clé n'est pas configurée.

Note : pour la France, les données de piste (TODA/LDA) sont **partiellement disponibles** dans OpenAIP — la saisie manuelle reste nécessaire dans de nombreux cas.

---

## Modèle de données du dossier de vol

### Nouveaux types

```typescript
type FlightPointType = 'AERODROME' | 'VOR' | 'NDB' | 'WAYPOINT' | 'USER'
type FlightPointRole = 'DEP' | 'ARR' | 'DIVERT' | 'OVERFLY'

interface FlightPoint {
  id: string
  type: FlightPointType
  identifier: string       // ICAO pour les aérodromes, trigramme pour les VOR, etc.
  role: FlightPointRole
}

interface FlightBranch {
  id: string
  label: string            // ex. "Aller", "Étape 1"
  points: FlightPoint[]    // ordonnés : DEP en premier, ARR en dernier
  distanceNm: number       // saisie manuelle
  notes: string            // commentaires libres sur ce tronçon
}
```

`FlightPoint` ne contient aucune donnée géographique. Les coordonnées, l'élévation et les pistes sont résolus à l'affichage depuis la base aérodromes. Un point dont l'`identifier` est absent de la base est affiché avec un badge « ? » (non résolu) sans bloquer le dossier.

Le match entre un `FlightPoint` et la base aérodromes se fait sur `type === 'AERODROME'` et `identifier === icao`.

### Modifications de `FlightDossier`

| Champ supprimé | Remplacement |
|---|---|
| `route: ImportedRoute \| null` | `branches: FlightBranch[]` |
| `fuelInputs: FuelInputs` | `fuelInputs: Record<branchId, FuelInputs>` |
| `navOverrides: Record<number, ...>` | *(supprimé)* |
| `navNotes: Record<number, string>` | *(supprimé — notes portées par `FlightBranch.notes`)* |

Le champ `notes: string` global du dossier est conservé pour les remarques transversales.

### Types supprimés

- `ImportedRoute`
- `RouteWaypoint`
- `NavlogEntry`

---

## UI — Onglet « Branches » (ex-Route)

### Navigation entre branches

- Une seule branche : pas de tabs, affichage direct
- Plusieurs branches : tabs horizontaux en haut du panel avec bouton `+` pour ajouter
- Double-clic sur un label de tab pour le renommer
- Bouton de suppression de branche (désactivé si une seule branche)

### Vue par branche

```
┌─────────────────────────────────────────────┐
│ [Aller] [Retour] [+]                        │
├─────────────────────────────────────────────┤
│            Carte Leaflet (~200px)           │
│   DEP bleu · ARR vert · DIVERT orange      │
│   OVERFLY gris · Ligne DEP→OVFL→ARR        │
├─────────────────────────────────────────────┤
│  Distance totale : [____] nm                │
├─────────────────────────────────────────────┤
│  Points de la branche          [+ Ajouter]  │
│  ┌──────────────────────────────────────┐   │
│  │ DEP  LFPN  Toussus-le-Noble         │   │
│  │ OVFL LFOJ  Orléans-Bricy            │   │
│  │ ARR  LFGH  La Charité-sur-Loire     │   │
│  │ DVRT LFLD  Bourges               ?  │   │
│  └──────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│  Notes  [textarea libre]                    │
└─────────────────────────────────────────────┘
```

Chaque ligne de point : badge rôle + identifier + nom résolu (ou badge « ? » si non résolu) + boutons réordonner (↑↓) + supprimer.

### Modal d'ajout d'un point

- Champ de recherche : saisie ICAO ou nom → suggestions depuis la base locale
- Sélecteur de rôle : DEP / ARR / DIVERT / OVERFLY
- Si non trouvé dans la base : option « Ajouter sans résolution » (identifier saisi manuellement, pas de coordonnées)

---

## Impact sur les autres panels

### Météo

**Source des terrains** : agrégation des `FlightPoint` de **toutes les branches**, filtrés sur `type === 'AERODROME'`, tous rôles confondus (OVERFLY inclus — objectif NOTAM/météo). Dédupliqués par `identifier`.

Aucun changement d'interface — seule la source des ICAOs change.

### Performance

**Cards dynamiques** depuis les FlightPoints de toutes les branches, dédupliqués par identifier, `role !== 'OVERFLY'` uniquement.

- `role === 'DEP'` → table décollage (TO)
- `role === 'ARR'` ou `'DIVERT'` → table atterrissage (LDG)

**Élévation** : pré-remplie depuis la base si disponible, sinon saisie manuelle.

**Sélection de piste** : si des pistes sont renseignées dans la base pour ce terrain, un sélecteur apparaît (texte libre). À la sélection :
- TODA / LDA pré-remplis si disponibles dans la base
- Composante de vent calculée automatiquement (cap piste + vent météo du terrain) → `windKt` pré-rempli, toujours éditable

Si pas de pistes dans la base : comportement actuel (saisie manuelle intégrale).

### Carburant

`fuelInputs: Record<branchId, FuelInputs>` — un bilan par branche. Le panel affiche un onglet par branche.

- **Distance** : lue depuis `branch.distanceNm` (lecture seule dans ce panel, saisie dans l'onglet Branches)
- **GS de base, roulage, marge** : propres à chaque branche
- **Réserves et déroutement** : portés uniquement par la **dernière branche** du dossier

Une ligne de total agrège le carburant emporté de toutes les branches.

### Log de navigation

**Supprimé intégralement** :
- `NavlogPanel` et l'onglet `'navlog'`
- `navlogGen.ts` et ses tests
- `navOverrides`, `navNotes` dans `FlightDossier`
- `NavlogEntry` dans les types

---

## Fichiers impactés

### Suppressions
- `src/features/navlog/NavlogPanel.tsx`
- `src/lib/aviation/navlogGen.ts`
- `src/__tests__/aviation/navlogGen.test.ts`
- `src/features/route/FlightplanImport.tsx`
- `src/lib/flightplan/parser.ts`
- `src/__tests__/flightplan/parser.test.ts`

### Nouveaux fichiers
- `src/lib/icao/aerodromeDb.ts` — service localStorage (CRUD + export/import)
- `src/lib/icao/openAipClient.ts` — appels API OpenAIP
- `src/features/aerodromes/AerodromeScreen.tsx` — écran de gestion de la base
- `src/features/branches/BranchesPanel.tsx` — remplace `RoutePanel`

### Modifications majeures
- `src/types/index.ts` — nouveaux types (`FlightPoint`, `FlightBranch`), suppression des anciens (`ImportedRoute`, `RouteWaypoint`, `NavlogEntry`), `DossierTab` perd `'navlog'`, `Screen` gagne `'aerodrome-db'`
- `src/lib/storage.ts` — adapter aux nouveaux types (`branches` au lieu de `route`, `fuelInputs` en `Record`)
- `src/components/AppChrome.tsx` — navigation vers `AerodromeScreen`
- `src/screens/DossierScreen.tsx` — remplacer `RoutePanel` par `BranchesPanel`, supprimer `NavlogPanel`
- `src/screens/HomeScreen.tsx` — bouton vers `AerodromeScreen`
- `src/features/perf/PerfPanel.tsx` — cards dynamiques + sélecteur de piste
- `src/features/fuel/FuelPanel.tsx` — onglets par branche
- `src/features/weather/WeatherPanel.tsx` — source ICAOs depuis branches
