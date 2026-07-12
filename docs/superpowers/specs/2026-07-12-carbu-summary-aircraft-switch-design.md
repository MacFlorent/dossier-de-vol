# Design : Carte de synthèse et changement d'avion dans l'onglet Carbu

**Date :** 2026-07-12
**Statut :** approuvé

## Contexte

Dans l'onglet Carbu (`FuelPanel.tsx`), les informations importantes pour juger un vol d'un coup d'œil — distance totale, durée de vol brute, durée de vol réelle et autonomie — sont aujourd'hui dispersées entre plusieurs blocs (sous-totaux du Bloc 2 "Segments", du Bloc 3 "Temps complémentaires", et du Bloc 6 "Autonomie requise" en fin de page). La distance totale n'y est même pas affichée du tout (elle n'existe aujourd'hui que dans l'onglet Vols, `BranchesPanel.tsx`).

Par ailleurs, l'avion associé au dossier n'est pas nommé dans l'onglet Carbu, et le changer nécessite de remonter au header global de l'application (bouton "Changer" dans `AppChrome.tsx`), alors que c'est précisément dans Carbu que l'on ajuste les paramètres liés à l'avion (facteur pilote, réserve, etc.).

Une note de restructuration antérieure du projet (2026-07-04) évoquait un bandeau transverse à tous les onglets pour ce type d'informations ; ce lot reste volontairement circonscrit à l'onglet Carbu uniquement, sans toucher aux autres onglets.

## Périmètre

1. Remonter la carte "Autonomie requise" (actuel Bloc 6) en haut de la page Carbu, juste après le strip d'onglets de vol, et l'enrichir avec la distance totale et les deux durées de vol (brute et réelle).
2. Ajouter le nom de l'avion et un bouton "Changer" dans le Bloc "Appareil", réutilisant le mécanisme de changement d'avion existant (`ChangeAircraftModal`, `applyAircraftChange`).

## 1. Carte de synthèse remontée en haut

### Déplacement, pas duplication

La carte du Bloc 6 actuel (`FuelPanel.tsx:170-197`) est retirée de sa position en fin de page et déplacée en tête de page, immédiatement après le `FlightTabStrip`. Un seul exemplaire — pas de résumé condensé en haut doublé d'un détail en bas.

### Contenu enrichi

La carte garde son format actuel (titre "Autonomie requise", liste `dl`, badge de statut OK/ATTENTION/INSUFFISANT/INVALIDE) et gagne trois lignes en tête de liste :

- **Distance totale** — nouvelle, somme des `distanceNm` des segments `ENROUTE` de la branche active (route principale uniquement, comme le total distance déjà affiché dans `BranchesPanel.tsx:150`, à l'exclusion du déroutement).
- **Temps de vol brut** — `result.rawFlightTimeMin` (temps en-route pur, somme des segments ENROUTE, déjà calculé par `computeBranchFuel`). Valeur identique à celle déjà affichée en sous-total du Bloc 2.
- **Temps de vol réel** — `result.totalFlightTimeMin` (temps brut + roulage + atterrissage + phases supplémentaires, majoré du facteur pilote). Valeur identique à celle déjà affichée en sous-total du Bloc 3.

Les lignes existantes (autonomie requise, essence requise L/kg, capacité, badge de statut) restent inchangées, à la suite.

Le déroutement (ALT) n'est pas inclus dans la distance ni les deux durées mises en avant : il conserve ses propres sous-totaux dans le Bloc "Déroutement planifié", et son temps continue d'être comptabilisé séparément dans le calcul de l'autonomie requise (`requiredEnduranceMin`), sans changement de calcul.

### Modèle de données

`BranchFuelResult` (`src/lib/aviation/fuelCalc.ts:14-37`) gagne un champ `totalDistanceNm: number`, calculé dans `computeBranchFuel` aux côtés des autres totaux (somme des `distanceNm` des segments `ENROUTE` de la branche), plutôt que recalculé en inline dans `FuelPanel` — source unique avec le reste des totaux déjà exposés par cette fonction. Aucun changement de `rawFlightTimeMin` ni `totalFlightTimeMin`.

### Ce qui ne change pas dans les autres blocs

Les blocs 2 ("Segments") et 3 ("Temps complémentaires") conservent leurs sous-totaux actuels ("Temps vol brut", "Temps de vol total", "Essence vol") tels quels : la carte remontée est un résumé de tête de page, pas un remplacement des sous-totaux détaillés dans leurs blocs respectifs.

## 2. Nom de l'avion et changement depuis Carbu

### Bloc "Appareil"

L'en-tête du Bloc "Appareil" (`FuelPanel.tsx:72-92`) devient :

```tsx
<div className="flex items-center justify-between mb-3">
  <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Appareil</h2>
  <div className="flex items-center gap-2">
    <span className="text-sm font-medium text-[var(--text-1)]">{aircraft.name}</span>
    <Button variant="ghost" size="sm" onClick={() => setShowChangeModal(true)}>Changer</Button>
  </div>
</div>
```

Le contenu existant du bloc (TAS, FB, conso, capacité, autonomie max, facteur pilote) n'est pas modifié.

### Réutilisation du mécanisme existant

Le comportement du bouton "Changer" est strictement identique à celui déjà présent dans le header global (`AppChrome.tsx`) : ouverture d'une modale listant la flotte (hors avion courant), sélection, confirmation avec avertissement ("les données carburant, masse & centrage et performances seront réinitialisées"), puis appel à `applyAircraftChange` (`src/lib/dossierTransforms.ts:4`). Aucune nouvelle logique métier.

### Extraction du composant partagé

`ChangeAircraftModal` est aujourd'hui un composant privé défini dans `AppChrome.tsx:26-77`. Il est extrait vers `src/components/ui/ChangeAircraftModal.tsx` (même props : `currentAircraftId`, `onConfirm`, `onClose`), importé à la fois par `AppChrome.tsx` et par `FuelPanel.tsx`. Pas de changement de comportement ni de style pour l'usage existant dans le header.

### Câblage de `onChangeAircraft` jusqu'à `FuelPanel`

`FuelPanel` reçoit une nouvelle prop `onChangeAircraft: (newAircraftId: string) => void`. Elle est fournie par `DossierScreen.tsx`, qui dispose déjà de `dossier` et de `onUpdate(dossier: FlightDossier)` complet :

```tsx
{activeTab === 'fuel' && (
  <FuelPanel
    dossier={dossier}
    onUpdate={(fuelInputs) => update({ fuelInputs })}
    onUpdateBranches={(branches) => update({ branches })}
    onChangeAircraft={(newAircraftId) => {
      const newAircraft = getAircraft(newAircraftId)
      if (newAircraft) onUpdate(applyAircraftChange(dossier, newAircraft))
    }}
  />
)}
```

Aucune modification de `App.tsx` n'est nécessaire : le câblage reste local à `DossierScreen.tsx`, qui importe `getAircraft` (`src/lib/storage.ts`) et `applyAircraftChange` (`src/lib/dossierTransforms.ts`), déjà utilisés ailleurs dans le projet pour ce même usage.

## Ordre final des blocs dans `FuelPanel`

1. `FlightTabStrip` (inchangé)
2. **Autonomie requise** (déplacé ici, enrichi — ex-Bloc 6)
3. Appareil (avec nom + bouton "Changer")
4. Segments
5. Temps complémentaires
6. Déroutement planifié (si un segment ALTERNATE existe)
7. Réserve réglementaire

## Tests

- `FuelPanel.test.tsx` :
  - La carte de synthèse en tête de page affiche distance totale, temps de vol brut, temps de vol réel, autonomie requise, essence requise et le badge de statut corrects pour la branche active.
  - Le Bloc "Appareil" affiche le nom de l'avion et un bouton "Changer" qui ouvre la modale.
  - Sélection d'un autre avion dans la modale + confirmation déclenche `onChangeAircraft`, avec réinitialisation des données carburant/W&B/perf identique au comportement du header global (test peut réutiliser les fixtures de `dossierTransforms.test.ts`).
- `fuelCalc.test.ts` : nouveau champ `totalDistanceNm` de `BranchFuelResult`, vérifié pour une branche à plusieurs segments ENROUTE (et exclusion du segment ALTERNATE du total).
- `ChangeAircraftModal` (déplacé) : tests existants côté `AppChrome` conservés ; ajout d'un test d'intégration côté `FuelPanel` pour le second point d'entrée.
- Vérification finale : suite complète, `tsc --noEmit`, `npm run build`.

## Ce qui n'est pas couvert

- Pas de bandeau transverse visible sur tous les onglets (Vols, W&B, Perf, Dossier) — ce lot reste circonscrit à l'onglet Carbu, conformément à la décision prise en amont.
- Pas de sélection du régime de croisière dans Carbu (l'app n'utilise aujourd'hui que `regimes[0]`) — hors périmètre, non demandé.
- Pas de changement du calcul de l'autonomie requise, du déroutement, ni des réserves réglementaires — uniquement mise en avant de valeurs déjà calculées et ajout de la distance totale.
- Pas de renommage de l'avion lui-même (édition de ses caractéristiques) depuis Carbu — seul le changement vers un autre avion de la flotte est couvert, via le mécanisme existant.
