# Design : Refonte de la page Performances

**Date :** 2026-07-14
**Statut :** approuvé

## Contexte

`PerfPanel.tsx` est la dernière page à ne pas suivre le pattern de mise en page adopté par Carbu/Vols/M&C (pleine hauteur, cartes empilées) — elle reste centrée en `max-w-4xl mx-auto space-y-6`. Elle empile aussi une carte par aérodrome (déduplication de tous les aérodromes DEP/ARR/ALTERNATE de toutes les branches), sans onglets, sans possibilité d'ajouter un aérodrome hors plan de vol, et sans lien vers le référentiel aérodromes.

Le vent réel n'existe nulle part dans l'application : `surfaceWind` est codé en dur à `{direction_deg: 0, speed_kt: 0}` (commentaire "calm (no wind layers)"), ce qui rend les boutons de sélection de piste actuels non fonctionnels (toujours 0 kt affiché). La fonction `headwindKt` existe déjà (`src/lib/aviation/coordinates.ts`) mais n'est jamais alimentée par une vraie saisie utilisateur.

L'éditeur du référentiel aérodromes (`AerodromeScreen.tsx`) est un écran plein-écran séparé (`Screen = 'aerodrome-db'`), ouvert uniquement depuis `HomeScreen` — y naviguer depuis un dossier ouvert ferait perdre le dossier en cours (aucun chemin de retour).

## Périmètre

1. Alignement de la mise en page sur Carbu/Vols/M&C (pleine hauteur, `p-4 space-y-5`).
2. Remplacement des cartes aérodrome empilées par des onglets (réutilisation de `FlightTabStrip`), portée dossier (agrégation de toutes les branches, comme aujourd'hui), jamais deux onglets pour le même aérodrome.
3. Onglets automatiques (DEP/ARR/DVRT) non fermables ; ajout/suppression d'onglets aérodrome supplémentaires via recherche dans le référentiel.
4. Blocs Décollage et Atterrissage affichés systématiquement pour chaque aérodrome (plus de distinction par rôle).
5. Saisie du vent réel (direction/vitesse) par aérodrome, affichage face-au-vent/traversier par piste, initialisation trigonométrique de la piste la plus probable (meilleure composante face au vent).
6. Accès rapide à l'édition du référentiel aérodromes via une modale, sans quitter le dossier.

## 1. Mise en page

Conteneur racine de `PerfPanel.tsx`, sur le modèle de `FuelPanel`/`WBPanel` :

```tsx
<div className="flex flex-col h-full">
  <FlightTabStrip ... />
  <div className="flex-1 overflow-auto p-4 space-y-5">
    {/* contenu de l'onglet actif */}
  </div>
</div>
```

La carte "Marge réglementaire (×)" reste au-dessus des onglets (globale au dossier, pas par aérodrome) — dans un bandeau fin type toolbar, cohérent avec la barre "Distance totale" de `BranchesPanel`.

## 2. Onglets aérodrome

### Constantes de rôle partagées (nettoyage préalable)

`ROLE_LABELS`/`ROLE_COLORS`/`ROLE_CYCLE` sont aujourd'hui définis localement dans `BranchesPanel.tsx` (lignes 34-38). Ils sont extraits vers `src/lib/aviation/aerodromeRoles.ts` :

```ts
import type { FlightAerodrome } from '../../types'

export type AeroRole = FlightAerodrome['role']

export const ROLE_LABELS: Record<AeroRole, string> = { DEP: 'DEP', ARR: 'ARR', ALTERNATE: 'ALT', OVERFLY: 'OVFL' }
export const ROLE_COLORS: Record<AeroRole, string> = {
  DEP: 'var(--blue)', ARR: 'var(--green)', ALTERNATE: 'var(--amber)', OVERFLY: 'var(--text-dim)',
}
export const ROLE_CYCLE: AeroRole[] = ['DEP', 'ARR', 'ALTERNATE', 'OVERFLY']
```

`BranchesPanel.tsx` importe désormais ces constantes au lieu de les redéfinir (`ROLE_ICONS`, spécifique à Leaflet, reste local). `PerfPanel.tsx` les réutilise pour les badges d'onglet.

### Dérivation et ordre des onglets

```ts
interface AerodromeTab {
  icao: string
  roles: AeroRole[]     // rôles cumulés sur toutes les branches (hors OVERFLY), [] si ajouté manuellement
  closable: boolean
}

const ROLE_ORDER: AeroRole[] = ['DEP', 'ALTERNATE', 'ARR']

const aerodromeTabs = useMemo(() => {
  const byIcao = new Map<string, Set<AeroRole>>()
  branches.forEach(b => b.aerodromes.forEach(a => {
    if (a.role === 'OVERFLY') return
    if (!byIcao.has(a.identifier)) byIcao.set(a.identifier, new Set())
    byIcao.get(a.identifier)!.add(a.role)
  }))

  const auto = [...byIcao.entries()]
    .map(([icao, roles]) => ({ icao, roles: [...roles], closable: false }))
    .sort((a, b) => {
      const rank = (roles: AeroRole[]) => Math.min(...roles.map(r => ROLE_ORDER.indexOf(r)))
      return rank(a.roles) - rank(b.roles)
    })

  const extra = perfExtraAerodromes
    .filter(icao => !byIcao.has(icao))
    .map(icao => ({ icao, roles: [] as AeroRole[], closable: true }))

  return [...auto, ...extra]
}, [branches, perfExtraAerodromes])
```

- Tri : rang minimal du meilleur rôle présent (DEP=0, ALTERNATE=1, ARR=2) — un aérodrome DEP dans une branche et ARR dans une autre reste trié comme DEP (rang le plus prioritaire).
- Dédup stricte : un ICAO déjà présent dans `byIcao` (auto) est exclu de la liste `perfExtraAerodromes` même s'il y figure encore (peut arriver si l'utilisateur l'ajoute manuellement puis qu'il devienne DEP/ARR/DVRT via Vols) — évite tout doublon d'onglet.

### Ajout / suppression manuelle

Nouveau champ dossier `perfExtraAerodromes: string[]` (liste d'ICAO, portée dossier — voir §3).

Le "+" de `FlightTabStrip` ouvre `AddPerfAerodromeModal` (nouveau, dans `PerfPanel.tsx`, calqué sur `AddAerodromeModal` de `BranchesPanel.tsx` mais sans sélecteur de rôle) :

```tsx
function AddPerfAerodromeModal({ excluded, onAdd, onClose }: {
  excluded: string[]
  onAdd: (icao: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const db = useMemo(() => getAerodromeDb(), [])
  const suggestions = useMemo(() => {
    if (query.length < 1) return []
    const q = query.toUpperCase()
    return db
      .filter(a => !excluded.includes(a.icao))
      .filter(a => a.icao.startsWith(q) || a.name.toUpperCase().includes(q))
      .slice(0, 8)
  }, [query, db, excluded])
  // ... rendu identique au pattern recherche+suggestions de AddAerodromeModal
}
```

Suppression : bouton "×" sur les onglets `closable: true` uniquement (extension de `FlightTabStrip`, voir ci-dessous), retire l'ICAO de `perfExtraAerodromes`.

### Extension de `FlightTabStrip`

Utilisé tel quel par Vols et Carbu — extension additive, rétrocompatible :

```ts
interface FlightTabStripProps {
  branches: { id: string; label: string; closable?: boolean }[]
  activeId: string
  onSelect: (id: string) => void
  onRename?: (id: string, label: string) => void
  onAdd?: () => void
  onClose?: (id: string) => void          // nouveau
  renderBadge?: (id: string) => ReactNode // nouveau
  className?: string
}
```

- `renderBadge`, si fourni, est rendu à côté du libellé de chaque onglet (badges de rôle DEP/ARR/ALT).
- Le bouton "×" n'apparaît que si `onClose` est fourni **et** `b.closable === true` sur cet item ; `stopPropagation` pour ne pas déclencher `onSelect`.
- Vols/Carbu n'utilisent ni l'un ni l'autre : aucun changement visuel pour eux.

`PerfPanel.tsx` alimente `FlightTabStrip` avec :

```tsx
<FlightTabStrip
  branches={aerodromeTabs.map(t => ({ id: t.icao, label: t.icao, closable: t.closable }))}
  activeId={activeIcao}
  onSelect={setActiveIcao}
  onAdd={() => setShowAdd(true)}
  onClose={icao => update({ perfExtraAerodromes: perfExtraAerodromes.filter(i => i !== icao) })}
  renderBadge={icao => {
    const roles = aerodromeTabs.find(t => t.icao === icao)?.roles ?? []
    return <>{roles.map(r => <Badge key={r} style={{ backgroundColor: ROLE_COLORS[r], color: 'white' }}>{ROLE_LABELS[r]}</Badge>)}</>
  }}
/>
```

(`activeIcao` : `useState`, comme `activeId` dans `BranchesPanel`/`FuelPanel` — non persisté dans le dossier, réinitialisé au premier onglet disponible si l'actif disparaît.)

## 3. Modèle de données

`src/types/index.ts` :

```ts
export interface FlightDossier {
  // ... inchangé
  perfExtraAerodromes: string[]   // nouveau — ICAO ajoutés manuellement sur Performances, portée dossier
}

export interface TerrainPerfInputs {
  surface: 'hard' | 'grass'
  windKt: number
  toda?: number
  lda?: number
  windDirDeg?: number      // nouveau — vent réel saisi
  windSpeedKt?: number     // nouveau — vent réel saisi
  selectedRunway?: string  // nouveau — persisté (était un useState local perdu au changement d'onglet)
  elevation?: number       // nouveau — persisté (idem)
  qnh?: number             // nouveau — persisté (idem)
  temp?: number            // nouveau — persisté (idem)
}
```

Nécessaire car les onglets démontent le contenu inactif (comme `BranchesPanel`/`FuelPanel` le font déjà pour les branches) — sans cette persistance, élévation/QNH/température/piste seraient perdues à chaque changement d'onglet, alors qu'elles survivent aujourd'hui tant qu'on ne quitte pas la page (toutes les cartes restent montées simultanément).

**Création/migration :**
- `App.tsx` (création d'un nouveau dossier, ~ligne 116) : ajoute `perfExtraAerodromes: []`.
- `src/lib/dossierTransforms.ts` (`applyAircraftChange`, ligne 15) : aucun changement nécessaire — la fonction ne remplace que `perfInputs` (tables de performance liées à l'avion) et préserve déjà le reste du dossier par spread, donc `perfExtraAerodromes` (indépendant de l'avion) traverse intact, comme `branches`/`notes`/`perfRegulatory` aujourd'hui.
- `src/lib/storage.ts` (`migrateDossier`, ligne 118) : nouveau bloc de migration défensive, même pattern que les autres :
  ```ts
  if (!Array.isArray(data.perfExtraAerodromes)) data.perfExtraAerodromes = []
  ```
- Tests à mettre à jour : toutes les fixtures `FlightDossier` (`WBPanel.test.tsx`, `FuelPanel.test.tsx`, `storage.migration.test.ts`, `dossierTransforms.test.ts`, et les futurs tests de `PerfPanel`) — ajout de `perfExtraAerodromes: []`.

## 4. Contenu d'un onglet — blocs Décollage/Atterrissage systématiques

Pour chaque onglet, quel que soit le(s) rôle(s) de l'aérodrome (y compris les aérodromes ajoutés manuellement, sans rôle) :

```tsx
<AerodromeConditionsCard icao={icao} runways={runways} inputs={inputs} onUpdate={...} defaultElevation={...} />
<div className="grid gap-4 sm:grid-cols-2">
  <PerfResultCard label="Décollage" tableKey="to" aircraft={aircraft} weight={depWeight} cond={cond} availableDistance={inputs.toda} perfRegulatory={perfRegulatory} />
  <PerfResultCard label="Atterrissage" tableKey="ldg" aircraft={aircraft} weight={depWeight} cond={cond} availableDistance={inputs.lda} perfRegulatory={perfRegulatory} />
</div>
```

Découpage de l'actuel `TerrainCard` (qui mélangeait conditions + résultats d'un seul tableau) en trois composants, dans `src/features/perf/` :

- **`AerodromeConditionsCard.tsx`** — élévation/QNH/température (désormais lues/écrites via `perfInputs[icao]`), altitude pression/densité affichées en pied de carte (dérivées, partagées entre TO et LDG), vent réel (direction/vitesse), sélecteur de piste, toggle surface, TODA/LDA (overrides manuels).
- **`PerfResultCard.tsx`** — un bloc par type de calcul (`tableKey: 'to' | 'ldg'`), reprend la logique badges/`computePerf`/`validatePerformanceTable`/distance réglementaire/disponibilité TODA-ou-LDA de l'actuel `TerrainCard`, mais sans les champs de saisie (purement lecture, alimenté par `cond: PerfConditions` calculé une fois dans `PerfPanel`/`AerodromeConditionsCard` et partagé).
- **`PerfPanel.tsx`** — orchestration : onglets, ajout/suppression, marge réglementaire, assemblage des deux composants ci-dessus par onglet actif.

## 5. Vent réel & sélection de piste

### Nouvelle fonction `crosswindKt`

`src/lib/aviation/coordinates.ts`, à côté de `headwindKt` :

```ts
/** Composante de vent traversier par rapport à une piste (kt). Positif = vent de droite, négatif = vent de gauche. */
export function crosswindKt(
  windDirMag: number,
  windSpeedKt: number,
  runwayHeadingMag: number,
): number {
  const angle = ((windDirMag - runwayHeadingMag) + 360) % 360
  return Math.round(windSpeedKt * Math.sin(angle * Math.PI / 180))
}
```

### Affichage par piste

Chaque bouton de piste dans `AerodromeConditionsCard` affiche désormais les deux composantes calculées à partir du vent réel saisi :

```
27 (274° — +12kt face / 3kt trav.)
```

### Initialisation trigonométrique (une seule fois, confirmé)

```ts
function bestRunway(runways: RunwayInfo[], windDir: number, windSpeed: number): RunwayInfo {
  return runways.reduce((best, r) =>
    headwindKt(windDir, windSpeed, r.headingMag) > headwindKt(windDir, windSpeed, best.headingMag) ? r : best
  )
}
```

Dans les handlers `onChange` des champs Direction/Vitesse de `AerodromeConditionsCard` :

```ts
const updateWind = (changes: { windDirDeg?: number; windSpeedKt?: number }) => {
  const next = { ...inputs, ...changes }
  if (!inputs.selectedRunway && runways.length > 0 && next.windDirDeg !== undefined && next.windSpeedKt !== undefined) {
    const rwy = bestRunway(runways, next.windDirDeg, next.windSpeedKt)
    onUpdate({ ...next, selectedRunway: rwy.ident, windKt: headwindKt(next.windDirDeg, next.windSpeedKt, rwy.headingMag), surface: rwy.surface, toda: rwy.toda, lda: rwy.lda })
    return
  }
  onUpdate(next)
}
```

Un clic manuel sur un autre bouton de piste (`handleRunwaySelect`, logique inchangée) fixe `selectedRunway` et n'est plus jamais recalculé automatiquement, même si le vent change ensuite (confirmé).

Si l'aérodrome n'a aucune piste dans le référentiel, le champ "Vent (kt)" en saisie manuelle directe reste disponible en secours (comportement actuel conservé).

## 6. Accès rapide au référentiel

Réutilisation du composant `Modal` existant (`src/components/ui/Modal.tsx`, déjà utilisé ailleurs — pas de nouveau composant de base à créer).

### Extraction du formulaire d'édition

`AerodromeScreen.tsx` mélange aujourd'hui la carte-liste (`AerodromeCard`, avec son bouton "Modifier"/"Fermer") et le formulaire d'édition (nom/lat/lng/élévation + `RunwayEditor`). Extraction du formulaire vers un composant réutilisable :

`src/features/aerodromes/AerodromeEditForm.tsx` (nouveau fichier — regroupe `RunwayEditor`, déplacé tel quel depuis `AerodromeScreen.tsx`, et le nouveau `AerodromeEditForm`) :

```tsx
export function AerodromeEditForm({ draft, onChange }: {
  draft: StoredAerodrome
  onChange: (draft: StoredAerodrome) => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Input label="Nom" value={draft.name} onChange={e => onChange({ ...draft, name: e.target.value })} />
        <Input label="Lat" type="number" value={draft.lat} onChange={e => onChange({ ...draft, lat: Number(e.target.value) })} />
        <Input label="Lng" type="number" value={draft.lng} onChange={e => onChange({ ...draft, lng: Number(e.target.value) })} />
        <Input label="Élévation (ft)" type="number" value={draft.elevationFt} onChange={e => onChange({ ...draft, elevationFt: Number(e.target.value) })} />
      </div>
      <RunwayEditor runways={draft.runways} onChange={runways => onChange({ ...draft, runways })} />
    </div>
  )
}
```

`AerodromeScreen.tsx` : `AerodromeCard` utilise `<AerodromeEditForm draft={draft} onChange={setDraft} />` à la place du bloc actuellement inline (lignes ~92-105) — comportement de l'écran inchangé, juste factorisé.

### Modale sur Performances

`src/features/perf/AerodromeQuickEditModal.tsx` (nouveau) :

```tsx
export function AerodromeQuickEditModal({ icao, onClose }: { icao: string; onClose: () => void }) {
  const [draft, setDraft] = useState<StoredAerodrome>(
    () => getAerodrome(icao) ?? { icao, name: '', lat: 0, lng: 0, elevationFt: 0, runways: [], updatedAt: '' }
  )
  const save = () => { upsertAerodrome({ ...draft, updatedAt: new Date().toISOString() }); onClose() }

  return (
    <Modal open onClose={onClose} title={`Aérodrome ${icao}`}>
      <AerodromeEditForm draft={draft} onChange={setDraft} />
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={save}>Enregistrer</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
      </div>
    </Modal>
  )
}
```

Déclenchée par une icône "✏️" dans l'en-tête de `AerodromeConditionsCard`. À la fermeture après sauvegarde, `PerfPanel` relit `getAerodrome(icao)` (déjà fait à chaque rendu aujourd'hui) — les pistes/élévation mises à jour apparaissent immédiatement sans plomberie supplémentaire, le référentiel `localStorage` étant la source de vérité lue à chaque rendu.

## Ce qui n'est pas couvert

- Pas de récupération METAR/ATIS en direct — le vent réel reste une saisie manuelle, comme le reste de l'application aujourd'hui.
- Pas de limite de vent traversier avion (nécessiterait un nouveau champ sur `Aircraft`, non demandé) — la composante traversière est affichée à titre indicatif seulement, sans seuil ni alerte.
- Pas d'arbitrage traversier dans le choix automatique de piste — critère unique : meilleure composante face au vent (confirmé).
- Pas de portée par branche pour les onglets aérodrome — portée dossier confirmée, comme le comportement actuel.
- Pas de changement à `computePerf`, `validatePerformanceTable`, ni à l'algorithme de calcul lui-même — seule la façon dont les entrées (conditions, vent, piste) sont saisies et persistées change.
- TODA/LDA restent des valeurs uniques par aérodrome (issues de la piste sélectionnée), pas par piste distincte affichée en parallèle — comportement actuel conservé.
