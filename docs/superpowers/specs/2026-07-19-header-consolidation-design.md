# Design : Bloc d'en-tête consolidé et suppression de l'onglet "Dossier"

**Date :** 2026-07-19
**Statut :** approuvé

## Contexte

La barre du haut (`AppChrome.tsx`) et l'onglet "Dossier" (`DossierPanel.tsx`) exposent aujourd'hui les informations essentielles d'un dossier de vol de façon dispersée : le nom et l'avion sont dans la barre du haut, la date y est affichée mais pas éditable, le nombre de branches et la distance totale ne sont visibles que dans l'onglet "Dossier" — un onglet par ailleurs peu consulté car il sert surtout de fiche imprimable (A4, tableau des branches + Masse & Centrage).

Une note de restructuration antérieure du projet (2026-07-04) évoquait déjà un bandeau transverse à tous les onglets pour ce type d'information ; le lot du 2026-07-12 l'avait volontairement circonscrit à l'onglet Carbu seul. Ce lot-ci généralise l'idée : les informations clés deviennent un bloc unique, toujours visible, au-dessus des onglets, quel que soit l'onglet actif.

## Périmètre

1. Ajouter un bloc toujours visible entre la barre fine (logo + Accueil) et la barre d'onglets, regroupant : nom du dossier (éditable), date du vol (éditable — nouveau), avion (nom, immat, TAS, autonomie, bouton Changer), nombre de branches, distance totale, temps de vol brut, export JSON, et impression A4.
2. Supprimer l'onglet "Dossier" de la navigation. Le contenu imprimable (tableau des branches + fiche M&C) est conservé, mais déplacé hors de la navigation à onglets — déclenché par un bouton "Imprimer" dans le nouveau bloc.
3. Enrichir la modale de changement d'avion (`ChangeAircraftModal`) avec TAS et autonomie par avion candidat, pour rester cohérent avec l'affichage du nouveau bloc.

## 1. Structure du header (`AppChrome.tsx`)

Le `<header>` sticky actuel garde sa barre fine du haut (logo "dossier de vol" + bouton "← Accueil") inchangée, et gagne un nouveau bloc à deux lignes juste avant la barre d'onglets :

- **Ligne 1 — identité** : nom du dossier (éditable, mécanisme actuel réutilisé tel quel) · date du vol (éditable, voir §3) · carte avion (nom, immat, TAS, autonomie — voir §5) · bouton "Changer".
- **Ligne 2 — synthèse et actions** : à gauche, trois badges *Branches* / *Distance totale* / *Temps de vol brut* (voir §2) ; à droite, boutons *Imprimer* (nouveau, voir §4) et *↓ JSON* (déplacé tel quel depuis la barre du haut actuelle).

Ce bloc reste gated par `screen === 'dossier' && dossier`, comme la barre d'onglets actuelle — inchangé quand aucun dossier n'est ouvert.

La barre d'onglets (`DOSSIER_TABS`) perd l'entrée `{ key: 'dossier', label: 'Dossier' }` et n'affiche plus que Vols / Carbu / M&C / Perf.

## 2. Calcul agrégé dossier entier

Il n'existe aujourd'hui aucun total "temps de vol" à l'échelle du dossier complet — uniquement par branche active, dans `computeBranchFuel` (onglet Carbu). Une nouvelle fonction `computeDossierTotals(dossier: FlightDossier)` est ajoutée dans `src/lib/aviation/` (ex. `dossierTotals.ts`), retournant `{ branchCount, totalDistanceNm, totalRawTimeMin }` :

- `branchCount` = `branches.length`.
- `totalDistanceNm` = somme des `distanceNm` des segments `ENROUTE` de toutes les branches (même logique que l'actuel `DossierPanel.tsx:25`, généralisée à toutes les branches — c'était déjà le cas).
- `totalRawTimeMin` = somme, sur toutes les branches, de `computeSegmentTiming(segment, regime.speed).timeMin` pour chaque segment `ENROUTE` (régime = `dossier.aircraft.characteristics.regimes[0]`, comme partout ailleurs dans l'app). Ce calcul ne dépend pas de `fuelInputs` — il reste disponible même si une branche n'a pas encore ses paramètres carburant renseignés.

Le nommage "Temps de vol brut" reprend celui déjà établi dans la carte de synthèse Carbu (2026-07-12), pour la cohérence de vocabulaire dans toute l'application. Formatage réutilisant le helper `formatDuration` déjà utilisé par `FuelPanel.tsx`.

Le déroutement (segments `ALTERNATE`) reste exclu de ces trois totaux, comme des autres totaux "distance/temps" déjà affichés ailleurs dans l'app.

## 3. Édition de la date

Même interaction que le nom aujourd'hui (`AppChrome.tsx:31-45`) : un clic sur la date passe en mode édition avec un `<input type="date">` natif, autofocus, confirmé au blur ou à la touche Entrée, annulé à Échap. Une nouvelle prop `onUpdateDate?: (date: string) => void` est ajoutée à `AppChromeProps` et câblée depuis `App.tsx` au même niveau que `onUpdateName` (mise à jour de `dossier.date` + `updatedAt`).

C'est une fonctionnalité entièrement nouvelle : `dossier.date` n'est aujourd'hui modifiable qu'à la création du dossier (`App.tsx:101`).

## 4. Impression

Le contenu imprimable actuel de `DossierPanel.tsx` (tableau des branches + fiche Masse & Centrage sur deux feuillets A4) n'est pas supprimé, mais n'est plus rattaché à un onglet : il devient un contenu **toujours monté, invisible à l'écran**, en réutilisant le pattern déjà présent et actuellement inutilisé dans `index.css:62,72` (`.print-only` — masqué à l'écran, révélé uniquement dans `@media print`).

- `DossierPanel.tsx` est renommé en `DossierPrintSheet.tsx` (même contenu de rendu : en-tête, tableau des branches, fiche M&C), débarrassé de ses boutons "Imprimer (A4)" / "Télécharger JSON" (`DossierPanel.tsx:33-40`, désormais dans le nouveau bloc) et de sa carte résumé "Branches / Distance totale" (`DossierPanel.tsx:61-71`, redondante avec les badges du bloc — non dupliquée).
- `DossierScreen.tsx` monte `<DossierPrintSheet dossier={dossier} />` en permanence dans un wrapper `.print-only`, en plus (et non à la place) du panneau de l'onglet actif — il ne dépend plus de `activeTab`.
- Le bouton "Imprimer" du nouveau bloc appelle directement `window.print()` : le contenu `.print-only` étant déjà dans le DOM (juste masqué en `display:none` à l'écran), l'impression se déclenche sans changement d'onglet ni aperçu intermédiaire, quel que soit l'onglet actuellement affiché.

## 5. Avion : carte enrichie + modale cohérente

La carte avion du nouveau bloc affiche : nom (`aircraft.name`), immatriculation (`aircraft.registration`), TAS (`regimes[0].speed`) et autonomie max, cette dernière calculée comme dans `FuelPanel.tsx:127-139` : `totalFuelCapacity(aircraft.massBalance) / regime.fuelBurn`, formatée en heures/minutes via `formatDuration`.

`ChangeAircraftModal` (`src/components/ui/ChangeAircraftModal.tsx`) affiche aujourd'hui seulement `name` et `registration` par avion candidat (ligne 48-49). Chaque ligne de la liste gagne TAS et autonomie, calculés de la même façon, pour permettre de comparer avant de confirmer un changement. Aucun changement du comportement de confirmation (`onConfirm(pending.id)`).

## 6. Suppression de l'onglet "Dossier"

- `DossierTab` (`src/types/index.ts:178`) perd la valeur `'dossier'` : `'branches' | 'fuel' | 'wb' | 'perf'`.
- `DOSSIER_TABS` (`AppChrome.tsx:7-13`) perd son entrée `dossier`.
- `DossierScreen.tsx:59` perd la branche `activeTab === 'dossier' && <DossierPanel ... />` (remplacée par le montage permanent de `DossierPrintSheet`, voir §4).
- Le type `Screen` (`src/types/index.ts:179`, valeur `'dossier'` = "un dossier est ouvert") n'est **pas** concerné — collision de nom uniquement avec l'ex-valeur de `DossierTab`, aucune relation entre les deux.

## Tests

- `dossierTotals.test.ts` (nouveau) : branchCount / distance / temps brut sur un dossier multi-branches, exclusion des segments `ALTERNATE`, dossier sans branche (zéros).
- `AppChrome.test.tsx` :
  - édition de la date (clic → input date → confirmation/annulation), comme le test existant pour le nom.
  - carte avion affiche nom/immat/TAS/autonomie corrects.
  - badges Branches/Distance/Temps affichent les valeurs de `computeDossierTotals`.
  - bouton "Imprimer" déclenche `window.print` (mock).
  - bouton "↓ JSON" toujours fonctionnel après déplacement.
- `ChangeAircraftModal.test.tsx` : chaque ligne candidate affiche TAS et autonomie.
- `DossierScreen.test.tsx` : `DossierPrintSheet` est monté quel que soit `activeTab` ; plus de branche `'dossier'`.
- Vérification finale : suite complète, `tsc --noEmit`, `npm run build`.

## Ce qui n'est pas couvert

- La carte "Autonomie requise" de l'onglet Carbu (distance/temps par branche active, ajoutée le 2026-07-12) n'est pas retouchée : elle reste un résumé par branche, complémentaire du résumé dossier-entier du nouveau bloc, pas redondant à supprimer.
- Pas de sélection du régime de croisière dans le nouveau bloc ni dans la modale avion (l'app n'utilise aujourd'hui que `regimes[0]`, comme partout ailleurs) — hors périmètre.
- Pas de changement du contenu du feuillet imprimable lui-même (tableau des branches, fiche M&C) — seul son point d'accès change (bouton dans le bloc plutôt qu'onglet dédié).
- Pas de validation de format ni de restrictions sur la date choisie (pas de contrainte "date future uniquement" ou autre) — l'`<input type="date">` natif suffit, sans règle métier additionnelle.
