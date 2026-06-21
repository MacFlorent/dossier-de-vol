# Tables de performance — guide de configuration

Les tables de performance sont saisies en JSON dans la fiche avion. Ce guide explique comment choisir la bonne structure selon le type de manuel.

## Identifier sa famille

Deux questions suffisent :

**1. Comment le poids est-il traité ?**

| Ce que je lis dans le manuel | Famille |
|---|---|
| Plusieurs colonnes de poids (ex. 700 kg / 900 kg) | [Famille A — Interpolation](aide-famille-interpolation.md) |
| Un seul poids de référence + formule `(P/X)²` | [Famille B — Poids unique](aide-famille-poids-unique.md) |
| Un seul poids, aucune formule | [Famille B — Poids unique](aide-famille-poids-unique.md) |

**2. Comment la température est-elle exprimée ?**

Les valeurs sont toujours en °C — seule leur signification change :

| Ce que je lis | Champ à ajouter |
|---|---|
| °C absolus (0°, 15°, 30°...) | rien (défaut) |
| Écart à l'ISA (Std−20, Std, Std+20...) | `"oatAxis": "isa_delta"` |

**Altitudes-pression : toujours en ft.** Si le manuel affiche des mètres, utiliser les valeurs en pieds indiquées entre parenthèses (ex. 500 m → 1640 ft).

---

## Principe commun à toutes les tables

Toutes les tables partagent la même règle d'indexation :

```
values[poids_idx][pa_idx][oat_idx] = distance en mètres
```

- `weights[0]` → `values[0]`
- `weights[1]` → `values[1]`
- etc.

À chaque poids correspond un tableau 2D `[pa_idx][oat_idx]`.

**Le calcul interpole linéairement** entre les valeurs connues dans les trois dimensions. Si une condition est hors des bornes du tableau, elle est clampée à la valeur extrême (comportement conservateur).

---

## Fichiers d'exemples disponibles

| Fichier | Avion | Particularités |
|---|---|---|
| [dr221-perf.json](dr221-perf.json) | DR221 | Poids unique + correction quadratique, herbe = table séparée |
| [dr400-perf.json](dr400-perf.json) | DR400-120 | 2 poids, températures ISA, vent tabulé |
| [c172-perf.json](c172-perf.json) | Cessna 172S | 3 poids, interpolation standard |

---

## Référence des champs

Voir [aide-reference.md](aide-reference.md) pour la liste complète de tous les champs disponibles.
