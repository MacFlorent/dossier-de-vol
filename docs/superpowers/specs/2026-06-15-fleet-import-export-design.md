# Fleet Import/Export & Templates Design
*Date : 2026-06-15*

## Contexte

La flotte d'avions est stockée en localStorage, sans moyen de la sauvegarder, la partager ou la migrer. Les templates d'avions sont codés en TypeScript avec des données synthétiques. Ce spec couvre :

1. **Export de flotte** — télécharger tous les avions en un fichier JSON
2. **Import de flotte avec prévisualisation** — modal de sélection par avion, déduplication par immatriculation
3. **Duplication d'avion** — copier un avion existant pour créer une variante
4. **Templates via `import.meta.glob`** — remplacer le TypeScript hardcodé par des JSON autodécouverts dans `resources/`

---

## Format du fichier de flotte

```json
{
  "version": 1,
  "aircraft": [ /* Aircraft[] */ ]
}
```

Le champ `version` permet des migrations futures à l'import (même pattern que `getAircraft` en localStorage). La validation à l'import vérifie : objet JSON, `version === 1`, `aircraft` tableau non vide.

---

## Couche données — `src/lib/storage.ts`

### Export

```typescript
export function downloadFleet(): void
```

Sérialise `listAircraft()` dans le format versionné et déclenche un téléchargement :
`flotte-dossier-de-vol-YYYY-MM-DD.json`

### Import

```typescript
export function importFleet(selected: Aircraft[]): { added: number; updated: number }
```

**Clé primaire : `registration`** (pas l'`id` UUID).

- Registration absente du localStorage → `saveAircraft({ ...imported, id: crypto.randomUUID() })` — added
- Registration existante → `saveAircraft({ ...imported, id: existing.id })` — updated, l'ID localStorage est préservé

### Duplication

```typescript
export function duplicateAircraft(ac: Aircraft): Aircraft
```

Retourne `{ ...ac, id: crypto.randomUUID(), registration: '', name: ac.name + ' (copie)' }` **sans sauvegarder**. L'appelant pré-remplit l'éditeur comme pour un nouvel avion.

---

## Modal d'import — `src/features/fleet/FleetImportModal.tsx`

```typescript
interface Props {
  aircraft: Aircraft[]       // avions parsés du fichier
  onComplete: () => void     // rafraîchit la flotte et ferme
  onCancel: () => void
}
```

### État interne

```typescript
const [selected, setSelected] = useState<Set<string>>(() => {
  // Nouveau → coché par défaut ; Existant → décoché par défaut
  return new Set(aircraft.filter(ac => !existsByRegistration(ac.registration)).map(ac => ac.registration))
})
```

### Affichage

Table par avion : nom, immatriculation, badge, case à cocher.

| Badge | Couleur | Condition |
|-------|---------|-----------|
| Nouveau | Vert | Registration absente du localStorage |
| Existant ⚠ | Amber | Registration déjà présente |

- Bouton primaire : `Importer N avion(s)` (disabled si aucun sélectionné)
- Bouton secondaire : `Annuler`
- Avertissement fixe sous la liste : « Les avions "Existant" cochés seront écrasés. »

### Déclenchement

Le parsing JSON et la validation se font dans `HomeScreen` avant d'ouvrir le modal. Si le fichier n'est pas un fichier de flotte valide (format dossier, JSON malformé, `aircraft` absent), une erreur inline s'affiche — même pattern que l'erreur dossier existante. Le modal ne s'ouvre que si la validation passe.

### Import et fermeture

Au clic "Importer" : `importFleet(selectedAircraft)` → `onComplete()`. Pas de rapport séparé — la liste de flotte mise à jour suffit comme confirmation.

---

## Templates autodécouverts — `src/lib/templates/index.ts`

### `resources/dr221.json` (nouveau)

Objet `Aircraft` complet. Consolide les données des trois fichiers partiels actuels :
- `resources/template_dr221_wb.json` → `massBalance.envelopePoints`
- `resources/template_dr221_takeoff.json` → `performance.toTable`
- `resources/template_dr221_landing.json` → `performance.ldgTable`

Les trois fichiers partiels sont **supprimés** une fois intégrés dans `dr221.json`.

`src/lib/templates/dr221.ts` est **supprimé**.

### `templates/index.ts` avec `import.meta.glob`

```typescript
import type { Aircraft } from '../../types'

export interface TemplateEntry {
  key: string
  label: string
  template: Aircraft
}

const modules = import.meta.glob('../../../resources/*.json', { eager: true })

export const TEMPLATES: TemplateEntry[] = Object.entries(modules).map(([path, mod]) => {
  const aircraft = (mod as { default: Aircraft }).default
  const key = path.split('/').pop()!.replace('.json', '')
  return { key, label: aircraft.name, template: aircraft }
})

export function createFromTemplate(key: string, id: string): Aircraft | null {
  const entry = TEMPLATES.find(t => t.key === key)
  if (!entry) return null
  return { ...entry.template, id, registration: '' }
}

export function getTemplate(key: string): Aircraft | null {
  return TEMPLATES.find(t => t.key === key)?.template ?? null
}
```

**Ajouter un avion au catalogue = déposer un JSON dans `resources/` et relancer le dev server.** Aucun autre fichier à modifier.

---

## Modifications UI — `HomeScreen.tsx`

### Barre d'actions flotte

```
Flotte (3)          [+ Nouvel avion] [↓ Exporter] [↑ Importer]
```

- **Exporter** → `downloadFleet()`
- **Importer** → `<input type="file" accept=".json">` → parse → validation → ouvre `FleetImportModal`

### Carte avion — nouveaux boutons

```
[DR221 · F-BPCT · ...]    [Nouveau dossier] [Modifier] [Dupliquer] [✕]
```

- **Dupliquer** → `duplicateAircraft(ac)` → `onEditAircraft` avec pré-remplissage (pas d'ID en localStorage, traité comme nouvel avion)

Pour pré-remplir l'éditeur avec la copie sans sauvegarder, `App.tsx` passe un nouveau prop optionnel :

```typescript
// AircraftEditorScreen
interface Props {
  editingAircraftId: string | null
  prefillAircraft?: Aircraft   // nouveau — prérempli si fourni, pas de lecture localStorage
  onSave: () => void
  onCancel: () => void
}
```

`applyAircraft` est appelé dans un `useEffect` sur `prefillAircraft` si présent.

---

## Hors scope

- Templates configurables par l'utilisateur (l'import de flotte est la solution pour ça)
- Sync cloud / partage en temps réel
- Historique de versions d'avion
- Export d'un avion individuel (le fichier de flotte couvre le cas)
