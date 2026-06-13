# dossier-de-vol — Design Spec
*Date : 2026-06-12*

## Contexte et objectif

Application web de préparation de vol VFR à usage personnel, avec ouverture future possible vers un club. L'objectif est de remplacer un ensemble de fichiers Excel et de documents papier par un outil cohérent qui produit un dossier de vol imprimable complet.

Le code existant dans ce dépôt a été généré sans réflexion préalable sur les besoins — cette spec redéfinit l'application depuis les exigences réelles.

## Workflow utilisateur cible

1. Configurer son avion une fois dans l'app (données stables)
2. Planifier la route dans SkyDemon, exporter en `.flightplan`
3. Dans l'app : créer un nouveau dossier, choisir l'avion, importer le `.flightplan`
4. Saisir les données météo (vents, QNH, températures) par terrain et par altitude
5. Consulter / ajuster le navlog généré
6. Compléter le bilan carburant (extras, réserve, déroutement)
7. Vérifier la masse & centrage et les performances par terrain
8. Imprimer le dossier compilé
9. Sauvegarder le dossier en JSON (autonome, partageable)

## Architecture

### Stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- TanStack Query (appels METAR/TAF uniquement)
- Leaflet / react-leaflet (carte read-only)
- Pas de React Router (navigation par état local)
- Pas d'IndexedDB

### Persistance

| Donnée | Stockage |
|---|---|
| Configuration avions | `localStorage` |
| Dossier de vol actif | State React en mémoire |
| Sauvegarde dossier | Fichier JSON téléchargé par l'utilisateur |

Le fichier JSON d'un dossier est **autonome** : il embarque un snapshot complet des données avion au moment de la création. Un dossier peut être partagé ou rouvert sans dépendre de la config locale.

### Structure du dossier JSON

```typescript
interface FlightDossier {
  id: string
  name: string               // ex: "VEA2026 LFPN→LFOX"
  date: string               // YYYY-MM-DD
  aircraft: AircraftSnapshot // snapshot complet au moment de la création
  route: ImportedRoute       // depuis le .flightplan
  weather: WeatherData       // saisie manuelle + cache METAR/TAF
  navlog: NavlogEntry[]      // généré + ajustements manuels
  fuelPlan: FuelPlan         // bilan carburant
  loading: StationLoading    // masses par station M&C
  notes: string              // NOTAM, SUPAIP, remarques libres
  createdAt: string
  updatedAt: string
}
```

## Fonctionnalités

### 1. Configuration avion

Stockée en `localStorage`. L'utilisateur configure ses avions une fois. Templates disponibles pour les types courants (DR221, C172S, PA28-161, etc.).

**Données par avion :**

```typescript
interface Aircraft {
  id: string
  name: string               // ex: "DR221"
  registration: string       // ex: "F-BPCT"
  sdReference?: string       // ex: "DR221-FBOZU" (pour auto-match à l'import)

  // Performances vol
  ias: number                // kt IAS de croisière
  tas: number                // kt TAS de croisière (pour le triangle des vitesses)
  fuelBurn: number           // L/h en croisière
  fuelCapacity: number       // L utilisables
  fuelDensity: number        // kg/L (0.72 Avgas)
  taxiFuel: number           // L pour le roulage

  // Masse & centrage
  emptyWeight: number        // kg
  emptyArm: number           // mm depuis le datum
  maxWeight: number          // kg
  stations: WeightStation[]
  envelopePoints: [number, number][]  // [poids_kg, cg_mm][]

  // Tables de performances TO/LDG
  toTable: PerformanceTable
  ldgTable: PerformanceTable

  // Facteurs réglementaires
  factors: {
    regulatory: number       // ex: 1.15 (Alcyons France)
    grass: number            // ex: 1.20
    headwindPerKt: number    // réduction par kt de vent de face
    tailwindPerKt: number    // majoration par kt de vent arrière
  }

  magneticVariation: number  // degrés, positif = Est (valeur par défaut pour la zone)
}
```

### 2. Import de route `.flightplan`

Format : XML SkyDemon (`DivelementsFlightPlanner`).

**Parsing :**
- Un fichier peut contenir `<PrimaryRoute>` + un ou plusieurs `<Route>` (aller + retour typiquement)
- Si plusieurs routes présentes : l'utilisateur sélectionne laquelle importer
- Coordonnées `N484459.10 E0020640.25` converties en decimal degrees (format DMS)
- `<WeightBalance>` → pré-remplissage du formulaire M&C (correspondance de noms best-effort)

**Résolution des noms de waypoints :**
- Type `Aerodrome` : lookup dans une base ICAO locale embarquée (~2000 terrains FR/BE/CH/LU)
- Autres types (`ReportingPoint`, `UserWaypoint`, `Town`, `RadioAid`...) : champ nom à saisir, pré-rempli avec le type

**Données extraites par waypoint :**
```typescript
interface RouteWaypoint {
  id: string
  name: string               // ICAO ou nom saisi
  type: string               // "Aerodrome" | "ReportingPoint" | ...
  lat: number
  lng: number
  alt_ft: number             // altitude cible (depuis Level du segment)
  notes: string              // fréquences, espaces aériens — saisie libre
}
```

### 3. Navlog

**Génération automatique** à partir des waypoints et des vents saisis.

Par tronçon :
1. Distance Haversine (nm) entre waypoint N et N+1
2. Cap vrai (TC) depuis les coordonnées
3. Triangle des vitesses : TAS avion + vent à l'altitude du tronçon → WCA, cap vrai corrigé, GS
4. Cap magnétique (MH) = cap vrai corrigé + variation magnétique
5. ETE (min) = distance / GS × 60
6. Carburant tronçon (L) = ETE × fuelBurn / 60

Pas de distinction montée/croisière/descente — tous les tronçons sont traités uniformément.

**Colonnes affichées :**

| Waypoint | Alt (ft) | MH (°) | Dist (nm) | ETE (min) | Carbu (L) | Notes |
|---|---|---|---|---|---|---|

IAS affiché en en-tête (constant, vient de la config avion).

**Ajustements manuels :** l'utilisateur peut modifier GS ou ETE sur n'importe quel tronçon pour refléter la réalité (zone de travail, intégration, etc.). Les colonnes dérivées se recalculent.

**Format imprimé** (fidèle au log scanné fourni en exemple) :
- En-tête : vol, avion, date, distance totale, durée estimée
- Départ : terrain ICAO, altitude, fréquences (GND, TWR, ATIS)
- Par tronçon : nom waypoint, altitude, MH, distance, ETE + notes + colonnes vides (temps réel, compteur hobbs) à remplir à la main en vol
- Arrivée : terrain ICAO, fréquences

### 4. Bilan carburant

Calcul global (pas leg-by-leg).

**Entrées :**
```
Distance totale (nm)          [depuis la route]
GS de base (kt)               [calculé depuis TAS + vent global]
Ajustement vent (kt)          [saisie manuelle si besoin]
→ Temps de vol brut (min)

+ Roulage (min)               [saisie : taxi + intégrations]
+ Marge (%)                   [saisie : ex. 10%]
+ Extras (lignes libres)      [libellé + durée en min, ex. "Évolutions VEA : 30 min"]
= Temps de vol total (min)
→ Carburant vol (L)

+ Réserve                     [30 min jour / 45 min nuit — choix]
+ Déroutement                 [distance nm + GS → temps, ou durée directe]
= Carburant minimum (L)
```

**Sortie :**
- Carburant minimum requis (L et kg)
- Autonomie totale avec plein prévu
- Alerte si carburant minimum > capacité avion

### 5. Masse & centrage

**Entrées :**
- Stations définies dans la config avion (bras fixe, poids variable)
- Poids pré-remplis depuis `<WeightBalance>` du `.flightplan` (best-effort, ajustables)

**Calcul :**
- Moment par station = poids × bras
- CG départ = Σ moments / poids total
- CG arrivée = départ − carburant consommé (depuis le bilan carbu)
- Validation : les deux points (départ, arrivée) sont dans l'enveloppe

**Affichage :**
- Tableau : station, bras (mm), poids (kg), moment (kg·mm)
- Totaux départ et arrivée
- Graphique SVG : enveloppe + points départ (bleu) et arrivée (vert), alerte si hors enveloppe (rouge)

### 6. Performances

Par terrain (départ obligatoire, arrivée obligatoire, déroutement optionnel).

**Entrées par terrain :**
- QNH (hPa)
- Altitude terrain (ft)
- Température (°C)
- Vent (kt, positif = de face)
- Masse (kg) — reprise du bilan M&C (départ pour terrain départ, arrivée pour terrain arrivée)
- Type de piste : dur / herbe
- TODA (m) pour TO, LDA (m) pour LDG — optionnels, pour validation

**Calcul :**
- Altitude pression (PA) = altitude terrain + (1013 − QNH) × 27
- Density altitude = PA + 120 × (OAT − ISA)
- Lookup dans la table TO ou LDG de l'avion (interpolation)
- Application des facteurs : réglementaire, herbe, vent

**Affichage :**
- Distance brute (table) et distance corrigée (avec facteurs)
- Alerte si TODA/LDA saisis et distance corrigée > valeur saisie

### 7. Météo

**Saisie manuelle (fait foi pour les calculs) :**
- Par terrain ICAO : QNH (hPa), température (°C)
- Vents : N couches d'altitude (direction °V, vitesse kt) — réutilisées par tronçon dans le navlog selon l'altitude de croisière
- Zone de notes libres : NOTAM collés, SUPAIP, SIGMETs, restrictions temporaires

**METAR/TAF (bonus, si connexion) :**
- Fetché via `https://aviationweather.gov/api/data/metar?ids={ICAO}&format=raw`
- Affiché brut, non parsé, non utilisé pour les calculs
- Mise en cache dans le dossier JSON (`weatherCache`)

### 8. Dossier imprimable

Vue compilée déclenchée par bouton "Imprimer" (déclenche `window.print()`).

**Ordre du dossier :**
1. En-tête vol (nom, avion, date, distance, durée estimée)
2. Log de navigation (format papier avec colonnes vides pour le vol réel)
3. Bilan carburant
4. Masse & centrage (tableau + graphique enveloppe SVG)
5. Performances par terrain
6. Notes météo / NOTAM

**Technique :** CSS `@media print`, mise en page A4, sauts de page entre sections. Aucune dépendance PDF externe.

## Interface utilisateur

### Navigation

Pas de React Router. Trois écrans principaux gérés par état local :

1. **Accueil** — liste des avions configurés + actions : nouveau dossier, ouvrir un dossier JSON
2. **Configuration avion** — formulaire édition/création (depuis templates ou scratch)
3. **Dossier de vol** — tabs : Route · Météo · Navlog · Carbu · M&C · Performances · Dossier

### UX notable

- Import `.flightplan` : drag & drop ou sélecteur de fichier
- Sélection de route si le fichier contient aller + retour
- Nom des waypoints inconnus : modal de saisie rapide post-import
- Sauvegarde : bouton "Télécharger JSON" à tout moment
- Ouverture d'un dossier existant : drag & drop ou sélecteur de fichier JSON

## Ce qui est hors scope (v1)

- Backend / synchronisation cloud (prévu pour partage club, phase ultérieure)
- Saisie manuelle de route sans import SkyDemon
- Import d'autres formats (GPX, PLN, Garmin FPL)
- Parsing automatique des METAR (utilisés en affichage brut uniquement)
- Gestion des espaces aériens (vérification automatique)
- Calcul de route optimisée / déroutements automatiques
- Application mobile native
