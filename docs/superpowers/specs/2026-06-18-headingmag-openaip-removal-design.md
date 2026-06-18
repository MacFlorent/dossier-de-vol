# Design : headingMag + suppression OpenAIP

**Date :** 2026-06-18

## Contexte

`RunwayInfo.headingTrue` stocke le cap vrai de piste (alimenté par le champ `trueHeading` d'OpenAIP). C'est incorrect : en aéronautique, l'orientation de piste est le **QFU** — un cap magnétique. Le vent de surface (METAR via `surfaceWindDir`) est également magnétique. Le calcul de vent de face dans `headwindKt` mélange donc les deux référentiels.

Par ailleurs, l'intégration OpenAIP n'a jamais été utilisée en pratique. La base aérodromes est alimentée manuellement via `resources/aerodromes.json`.

## Décisions

- Renommage `headingTrue` → `headingMag` partout (code + types)
- Label UI : `"Cap vrai (°)"` → `"QFU (°)"`
- Paramètres de `headwindKt` renommés en conséquence (`windDirMag`, `runwayHeadingMag`)
- Suppression complète d'OpenAIP : fichier client, test, clé API, bouton refresh, UI

## Périmètre des changements

### Fichiers supprimés

| Fichier | Raison |
|---|---|
| `src/lib/icao/openAipClient.ts` | Plus utilisé |
| `src/__tests__/icao/openAipClient.test.ts` | Test du client supprimé |

### `src/types/index.ts`

```ts
// avant
export interface RunwayInfo {
  ident: string
  headingTrue: number      // cap vrai en degrés
  ...
}

// après
export interface RunwayInfo {
  ident: string
  headingMag: number       // QFU — orientation magnétique de la piste
  ...
}
```

### `src/lib/aviation/coordinates.ts`

Renommage des paramètres de `headwindKt` ; corps (calcul trigonométrique) inchangé.

```ts
// avant
export function headwindKt(windDirTrue: number, windSpeedKt: number, runwayHeadingTrue: number): number

// après
export function headwindKt(windDirMag: number, windSpeedKt: number, runwayHeadingMag: number): number
```

### `src/features/aerodromes/AerodromeScreen.tsx`

**Suppressions :**
- Import `fetchFromOpenAip`
- Constante `OPENAIP_KEY_STORAGE`
- State `apiKey`, state `refreshing`
- Callback `handleRefreshFromApi`
- Section `<details>` clé API OpenAIP
- Props `onRefresh` / `refreshing` de `AerodromeCard` et bouton `↻`

**Renommages dans `RunwayEditor` :**
- `headingTrue` → `headingMag`
- Valeur par défaut : `{ ident: '', headingMag: 0, lengthFt: 0, surface: 'hard' }`
- Label : `"Cap vrai (°)"` → `"QFU (°)"`

### `src/features/perf/PerfPanel.tsx`

- Type inline prop `runways` : `headingTrue` → `headingMag`
- Usages `rwy.headingTrue` → `rwy.headingMag` (affichage dans le sélecteur de piste + appel `headwindKt`)

## Ce qui ne change pas

- `aerodromeDb.ts` — aucune référence à `headingTrue`, non touché
- `resources/aerodromes.json` — toutes les pistes sont déjà `[]`, non touché
- Logique de calcul `headwindKt` — seuls les noms de paramètres changent
- Tests `headwind.test.ts` — appellent `headwindKt` avec des littéraux, non impactés

## Aucun impact fonctionnel

Ce changement est un renommage pur + suppression de code mort. Aucun comportement ne change pour l'utilisateur, sauf la disparition du bouton `↻` et de la section clé API sur l'écran aérodromes.
