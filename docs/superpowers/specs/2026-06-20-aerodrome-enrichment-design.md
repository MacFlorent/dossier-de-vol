# Design : Enrichissement de la base aérodromes

**Date :** 2026-06-20  
**Statut :** approuvé

## Contexte

`resources/aerodromes.json` contient ~80 terrains (France + quelques voisins), tous avec `elevationFt: 0` et `runways: []` vides. L'objectif est de le remplacer par une base exhaustive de terrains français (~1 190 entrées), avec coordonnées exactes, altitude, pistes et fréquences radio, générée automatiquement depuis OurAirports.

## Périmètre

- **Pays :** France uniquement (`iso_country = FR`)
- **Types inclus :** `large_airport`, `medium_airport`, `small_airport`
- **Types exclus :** `heliport`, `closed`, `seaplane_base`, `balloonport`
- **Résultat attendu :** ~1 190 entrées dans `resources/aerodromes.json`

## Sources de données

Trois fichiers CSV globaux publiés par [OurAirports](https://ourairports.com/data/) :

| Fichier | URL | Contenu |
|---|---|---|
| `airports.csv` | `https://davidmegginson.github.io/ourairports-data/airports.csv` | Coordonnées, élévation, type, code ICAO |
| `runways.csv` | `https://davidmegginson.github.io/ourairports-data/runways.csv` | Pistes : ident, longueur, surface, cap vrai |
| `airport-frequencies.csv` | `https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv` | Fréquences : TWR, AFIS, ATIS, APP… |

Les fichiers sont téléchargés à l'exécution du script, non versionnés dans le repo.

## Modifications du type `StoredAerodrome`

Ajout dans `src/types/index.ts` :

```ts
export interface FrequencyInfo {
  type: string          // ex : "TWR", "AFIS", "ATIS", "APP"
  description: string   // libellé OurAirports
  frequencyMhz: number
}

// Dans StoredAerodrome, ajouter :
frequencies?: FrequencyInfo[]
```

Tous les autres champs existants (`icao`, `name`, `lat`, `lng`, `elevationFt`, `runways`, `updatedAt`) restent inchangés.

## Mapping OurAirports → StoredAerodrome

### Aérodrome

| Champ cible | Source |
|---|---|
| `icao` | `airports.icao_code` — clé d'unicité |
| `name` | `airports.name` |
| `lat` | `airports.latitude_deg` |
| `lng` | `airports.longitude_deg` |
| `elevationFt` | `airports.elevation_ft` (défaut `0` si absent) |
| `updatedAt` | Date d'exécution ISO 8601 |
| `runways` | voir ci-dessous |
| `frequencies` | voir ci-dessous |

### Pistes (`runways.csv`)

Chaque ligne OurAirports décrit une piste avec deux sens (`le_*` et `he_*`). On génère deux `RunwayInfo` par ligne (sauf si la piste est fermée : `closed = 1` → ignorée).

| Champ `RunwayInfo` | Source |
|---|---|
| `ident` | `le_ident` / `he_ident` (ex : "27", "09", "27L") |
| `headingMag` | `parseInt(ident) * 10` — le numéro de piste *est* le cap magnétique arrondi à 10° |
| `lengthFt` | `length_ft` |
| `surface` | `'hard'` si la valeur contient ASPH, CONC, TARMAC, PAVED, MACADAM, BRICK, ASPHALT, CONCRETE ; sinon `'grass'` |
| `toda` | non disponible dans OurAirports — champ absent |
| `lda` | non disponible dans OurAirports — champ absent |

Si `ident` ne permet pas d'extraire un entier (cas pathologique), `headingMag = 0`.

### Fréquences (`airport-frequencies.csv`)

| Champ `FrequencyInfo` | Source |
|---|---|
| `type` | `type` (ex : "TWR", "AFIS", "ATIS") |
| `description` | `description` |
| `frequencyMhz` | `frequency_mhz` (nombre flottant) |

## Script de génération

### Emplacement et commande

```
scripts/build-aerodromes.mjs   ← script ESM, pas de transpilation
```

Entrée dans `package.json` :
```json
"build:aerodromes": "node scripts/build-aerodromes.mjs"
```

Commande d'utilisation :
```sh
npm run build:aerodromes
```

### Étapes internes du script

1. **Fetch** — `fetch()` sur les 3 URLs OurAirports en parallèle (`Promise.all`). Échec réseau → exception avec URL concernée.
2. **Parse CSV** — parseur maison : split par lignes, détection des guillemets pour les champs avec virgules. Pas de dépendance externe.
3. **Indexation** — construction de deux `Map<string, RunwayInfo[]>` et `Map<string, FrequencyInfo[]>` indexées sur le code ICAO.
4. **Transform** — filtre `iso_country = FR` et types autorisés ; mappe chaque ligne vers `StoredAerodrome`.
5. **Write** — `JSON.stringify(result, null, 2)` écrit dans `resources/aerodromes.json`.
6. **Log** — affiche le nombre de terrains écrits, de pistes et de fréquences chargées.

### Gestion des cas limites

| Cas | Comportement |
|---|---|
| `elevation_ft` vide ou absent | `elevationFt = 0` |
| Piste fermée (`closed = 1`) | piste ignorée |
| Ident de piste non numérique | `headingMag = 0` |
| Code ICAO absent ou vide dans `airports.csv` | aérodrome ignoré |
| Fetch échoue | arrêt avec message d'erreur explicite |

## Compatibilité avec l'app

- `aerodromeDb.ts` sème le JSON dans localStorage via `initAerodromeDb()` seulement si la clé est absente → les utilisateurs existants ne sont pas affectés tant qu'ils ne vident pas leur localStorage.
- La fonction `upsertAerodrome()` utilise déjà le code ICAO comme clé d'unicité — cohérent avec le script.
- Le champ `frequencies` étant optionnel (`?`), aucune migration de données existantes n'est nécessaire.

## Ce qui n'est pas couvert

- Caps magnétiques précis au degré près (les VAC font autorité pour ça — modification manuelle possible via l'écran aérodromes).
- TODA / LDA (non disponibles dans OurAirports).
- Pays voisins (Belgique, Suisse, Luxembourg) : hors périmètre, les entrées existantes seront remplacées par les ~1 190 terrains FR uniquement.
- Mise à jour automatique / CI : le script est à lancer manuellement.
