# Design : Suppression de la page Météo + homogénéisation de l'onglet Carbu

**Date :** 2026-07-04
**Statut :** approuvé

## Contexte

L'onglet Météo (saisie QNH/Temp par terrain + notes NOTAM/SIGMET + récupération METAR/TAF) fait doublon avec l'onglet Perf, où chaque terrain a déjà son propre champ QNH/Temp éditable. Par ailleurs, l'onglet Carbu a une présentation différente de l'onglet Vols/Branches (largeur, style des onglets de vol), alors que les deux écrans naviguent la même liste de branches.

## Périmètre

1. Suppression complète de la page Météo (UI + modèle de données).
2. Alignement de la largeur de zone de saisie de l'onglet Carbu sur celle de l'onglet Vols (pleine largeur).
3. Alignement du style des onglets de sélection de vol dans Carbu sur celui de Vols (onglet "classeur"), en lecture seule.

## 1. Suppression de la page Météo

### Suppression complète (UI + données)

- Suppression des fichiers `src/features/weather/WeatherPanel.tsx` et `src/__tests__/weather/WeatherPanel.test.tsx`.
- `src/components/AppChrome.tsx` : retrait de l'entrée `{ key: 'weather', label: 'Météo' }` de `DOSSIER_TABS`.
- `src/screens/DossierScreen.tsx` : retrait de l'import `WeatherPanel` et du bloc `activeTab === 'weather'`.
- `src/types/index.ts` :
  - Suppression de `WeatherInputs` et `FieldWeather`.
  - Suppression du champ `weatherInputs` de `FlightDossier`.
  - Retrait de `'weather'` du type `DossierTab`.
- `src/App.tsx` : retrait de `weatherInputs: { fields: {}, notes: '' }` dans la construction du dossier initial.
- `src/lib/storage.ts` : suppression du bloc de migration legacy qui nettoie `weatherInputs.winds` (dead code une fois le champ retiré du type).

### Impact sur l'onglet Perf (`PerfPanel.tsx`)

`getWeatherFor()` utilisait `weatherInputs.fields[icao]` avec fallback `{ qnh: 1013, temp: 15 }`. Cette fonction est supprimée ; `TerrainCard` reçoit directement les valeurs par défaut fixes `defaultQnh={1013}` et `defaultTemp={15}`. Le champ QNH/Temp reste éditable par terrain exactement comme avant (aucun changement de comportement pour l'utilisateur qui saisissait déjà ses valeurs par terrain).

### Impact sur l'onglet Dossier (`DossierPanel.tsx`)

Suppression du bloc "Notes / NOTAM" (section conditionnée par `weatherInputs.notes`) du récapitulatif imprimable. Le champ général `dossier.notes` (section "Remarques", déjà existant) n'est pas modifié — pas de fusion, cette section reste l'unique zone de remarques libres.

### Compatibilité des dossiers existants

Les dossiers déjà sauvegardés (localStorage / JSON téléchargés) contenant un champ `weatherInputs` ne posent pas de problème de lecture : ce champ superflu est simplement ignoré par le typage TypeScript à l'exécution. Aucune migration de nettoyage n'est nécessaire — pas de crash, juste une clé orpheline inerte dans les données stockées.

## 2. Largeur de l'onglet Carbu

`FuelPanel.tsx` a actuellement pour conteneur racine :

```tsx
<div className="p-4 max-w-2xl mx-auto space-y-5 overflow-auto">
```

Il devient, sur le modèle de `BranchesPanel` (`flex flex-col h-full`, contenu en `flex-1 overflow-auto p-4 space-y-6`) :

```tsx
<div className="flex flex-col h-full">
  {/* barre d'onglets de vol, cf. §3 */}
  <div className="flex-1 overflow-auto p-4 space-y-5">
    {/* Bloc 1 à 6 inchangés */}
  </div>
</div>
```

Les 6 blocs (Appareil, Segments, Temps complémentaires, Déroutement planifié, Réserve réglementaire, Autonomie requise) s'étalent donc sur toute la largeur du conteneur, sans limite `max-w-*`.

## 3. Style des onglets de vol dans Carbu

### Composant partagé

Le style "onglet classeur" (actif détaché en haut, coins arrondis, connecté à la bordure du panneau en dessous) est actuellement codé en dur dans `BranchesPanel.tsx` (lignes ~409-431), avec gestion du renommage par double-clic et bouton `+`. Il est extrait dans un nouveau composant partagé :

**`src/components/ui/FlightTabStrip.tsx`**

```tsx
interface FlightTabStripProps {
  branches: { id: string; label: string }[]
  activeId: string
  onSelect: (id: string) => void
  onRename?: (id: string, label: string) => void  // absent = lecture seule
  onAdd?: () => void                              // absent = pas de bouton +
  className?: string
}
```

- Rendu du strip d'onglets (fond, bordures, coin arrondi, onglet actif détaché) identique à l'existant dans `BranchesPanel`.
- Le double-clic pour renommer et le bouton `+` ne s'affichent que si `onRename` / `onAdd` sont fournis.
- `BranchesPanel` l'utilise avec `onRename` et `onAdd` renseignés (comportement actuel inchangé).
- `FuelPanel` l'utilise avec seulement `branches`, `activeId`, `onSelect` — pas de renommage ni d'ajout, conforme au fait que la gestion des vols reste dans l'onglet Vols.

### Comportement dans `FuelPanel`

- La barre d'onglets est **toujours affichée**, même s'il n'y a qu'un seul vol (alignement visuel avec `BranchesPanel`, qui affiche toujours son strip avec le bouton `+`). Suppression de la condition actuelle `branches.length > 1`.
- Remplace l'actuelle barre d'onglets "underline" (`border-b-2`) de `FuelPanel`.
- `activeBranchId` / `setActiveBranchId` restent gérés localement dans `FuelPanel` comme aujourd'hui ; seul le rendu visuel change.

## Ce qui n'est pas couvert

- Pas de renommage/suppression/ajout de vol depuis l'onglet Carbu (reste dans Vols, par design).
- Pas de changement du contenu des 6 blocs de l'onglet Carbu, uniquement leur conteneur et la barre d'onglets au-dessus.
- Pas de bandeau d'infos transverses (avion, distance totale, nom du vol) au-dessus des onglets — mentionné dans les notes de restructuration du projet mais hors périmètre de ce lot.
- Pas de renommage de "Vols" en "Branches" dans l'UI — également hors périmètre.
