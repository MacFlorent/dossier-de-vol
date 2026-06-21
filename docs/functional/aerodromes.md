# Base aérodromes

## Fonctionnement général

La base est stockée dans le `localStorage` sous la clé `dossier-de-vol:aerodromes_v2`. Au premier lancement, elle est amorcée depuis `resources/aerodromes.json` (seed). L'utilisateur peut ensuite modifier, ajouter ou supprimer des terrains via l'écran **Base aérodromes**.

## Import / Export

- **Export** : bouton « ↓ Exporter » — génère un fichier `aerodromes-YYYY-MM-DD.json` (format `{ version: 1, aerodromes: [...] }`)
- **Import** : bouton « ↑ Importer » — fusionne par upsert sur le code OACI (les entrées existantes sont mises à jour, les nouvelles sont ajoutées)

## Régénérer le seed depuis OurAirports

```sh
npm run build:aerodromes
```

Le script `scripts/build-aerodromes.mjs` télécharge trois CSV depuis [OurAirports](https://ourairports.com/data/) et écrase `resources/aerodromes.json` :

| CSV | Contenu |
|---|---|
| `airports.csv` | Coordonnées, altitude, type, code OACI |
| `runways.csv` | Pistes : ident, longueur, surface |
| `airport-frequencies.csv` | Fréquences radio (TWR, AFIS, ATIS…) |

**Périmètre :** France uniquement (`iso_country = FR`), types `large_airport`, `medium_airport`, `small_airport` — héliports et terrains fermés exclus. Résultat : ~1 190 terrains.

## Choix de conception

**Caps magnétiques dérivés des numéros de piste**
Le numéro de piste est par définition le cap magnétique arrondi à 10° (piste 27 → 270°M). C'est la valeur publiée sur les VAC, plus fiable que le cap vrai fourni par OurAirports. Les idents non-numériques (hélistations…) sont ignorés.

**Terrains sans code OACI**
Les petits terrains sans indicatif OACI reçoivent un identifiant OurAirports de la forme `FR-XXXX`. Ces codes ne sont pas reconnus par les API météo externes (METAR/TAF) — c'est attendu. Ils restent utilisables pour la planification interne (coords, pistes, performances).

**Surface des pistes**
Classifiée `hard` ou `grass` par correspondance de mots-clés sur la valeur OurAirports (ASPH, CONC, TARMAC…). Quand le champ est vide (cas fréquent pour les grands aéroports), la piste est classée `grass` par défaut — à corriger manuellement si nécessaire.

**Clé localStorage versionnée**
La clé inclut un suffixe de version (`_v2`). Un changement de version force le rechargement du seed au prochain lancement, sans migration des données utilisateur.
