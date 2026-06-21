# Référence complète — champs PerformanceTable

## Axes (obligatoires)

| Champ | Type | Description |
|---|---|---|
| `weights` | `number[]` | Poids en **kg**, triés croissant. Un seul élément si poids unique. |
| `pressureAltitudes` | `number[]` | Altitudes-pression en **ft**, triées croissant. |
| `oats` | `number[]` | Températures en **°C**, triées croissant. Absolus ou écart ISA selon `oatAxis`. |

## Valeurs (obligatoire)

| Champ | Type | Description |
|---|---|---|
| `values` | `number[][][]` | `values[poids_idx][pa_idx][oat_idx]` — distance en mètres. |
| `grassValues` | `number[][][]` | Même structure que `values` pour piste en herbe. Si absent, `grassFactor` est appliqué. |

## Axe température

Les valeurs de `oats` sont toujours en °C. `oatAxis` indique leur signification :

| Champ | Valeurs | Description |
|---|---|---|
| `oatAxis` | `"absolute"` (défaut) | °C absolus lus directement dans le manuel (ex. 0, 15, 30). |
| | `"isa_delta"` | °C d'écart à l'ISA (ex. −20, 0, +20 pour Std−20 / Standard / Std+20). Le calcul dérive l'écart depuis la température réelle : `delta = OAT − (15 − 2 × PA_ft/1000)`. |

## Correction de poids

| Champ | Valeurs / Type | Description |
|---|---|---|
| `weightCorrection` | `"interpolate"` (défaut) | Interpolation linéaire entre les poids du tableau. |
| | `"quadratic"` | Formule `(P_réel / weightCorrectionDivisor)²`. Le tableau est lu au `referenceWeight`. |
| `referenceWeight` | `number` | Poids pour lequel la table a été calculée. Requis si `weightCorrection: "quadratic"`. |
| `weightCorrectionDivisor` | `number` | Diviseur de la formule quadratique. Si absent, `referenceWeight` est utilisé. |

## Herbe

Deux modes, priorité à `grassValues` :

| Champ | Type | Description |
|---|---|---|
| `grassValues` | `number[][][]` | Table complète pour piste herbe (mêmes dimensions que `values`). Prioritaire. |
| `grassFactor` | `number` | Facteur multiplicatif appliqué à `values` si `grassValues` absent. Ex. `1.20`. |

> Si les deux sont présents : warning « grassFactor ignoré — grassValues est prioritaire ».

## Correction vent

Deux modes exclusifs — utiliser l'un ou l'autre :

| Champ | Type | Description |
|---|---|---|
| `windCorrections` | `{speedKt, factor}[]` | Table de facteurs tabulés. Interpolation linéaire entre les points. Vent de face uniquement (facteur < 1). |
| `headwindFactor` | `number` | Réduction linéaire par kt de vent de face. Ex. `0.025` = −2.5 %/kt. |
| `tailwindFactor` | `number` | Majoration linéaire par kt de vent arrière. Ex. `0.02` = +2 %/kt. |

> Si `windCorrections` est présent, `headwindFactor` et `tailwindFactor` sont ignorés.

## Validation

### Erreurs bloquantes

La table est refusée si l'une de ces conditions est vraie.

| Condition | Message |
|---|---|
| `weights`, `pressureAltitudes` ou `oats` vide ou absent | « Axe [x] manquant ou vide » |
| `weights`, `pressureAltitudes` ou `oats` non trié croissant | « Axe [x] doit être trié croissant » |
| `values.length !== weights.length` | « values : dimension poids incohérente (attendu N, reçu M) » |
| `values[i].length !== pressureAltitudes.length` pour tout i | « values[i] : dimension PA incohérente » |
| `values[i][j].length !== oats.length` pour tout i, j | « values[i][j] : dimension OAT incohérente » |
| `grassValues` présent et dimensions ≠ `values` | « grassValues : dimensions différentes de values » |
| `weightCorrection: "quadratic"` sans `referenceWeight` | « referenceWeight requis avec weightCorrection: quadratic » |
| `weightCorrection: "quadratic"` avec `weights.length > 1` | « quadratic attend un seul poids — utiliser interpolate pour plusieurs poids » |
| Une valeur dans `values` ou `grassValues` ≤ 0 | « Distance invalide à [i][j][k] : doit être > 0 » |

### Warnings (paramètres ignorés)

La table est acceptée mais l'utilisateur est averti.

| Condition | Message |
|---|---|
| `grassValues` et `grassFactor` tous les deux présents | « grassFactor ignoré — grassValues est prioritaire » |
| `windCorrections` et `headwindFactor` tous les deux présents | « headwindFactor ignoré — windCorrections est prioritaire » |
| `windCorrections` et `tailwindFactor` tous les deux présents | « tailwindFactor ignoré — windCorrections est prioritaire » |
| `referenceWeight` présent sans `weightCorrection: "quadratic"` | « referenceWeight ignoré — weightCorrection n'est pas quadratic » |
| `weightCorrectionDivisor` présent sans `weightCorrection: "quadratic"` | « weightCorrectionDivisor ignoré — weightCorrection n'est pas quadratic » |
| `windCorrections` contient un `factor > 1.0` | « windCorrections : facteur > 1.0 à speedKt=[x] — vent de face devrait réduire la distance » |

---

## Récapitulatif par avion

| Avion | `weightCorrection` | `oatAxis` | `grassValues` | `grassFactor` | `windCorrections` |
|---|---|---|---|---|---|
| DR221 TO | `quadratic` | `absolute` | ✓ | — | — |
| DR221 LDG | `interpolate` | `absolute` | — | — | — |
| DR400 TO | `interpolate` | `isa_delta` | ✓ | — | ✓ |
| DR400 LDG | `interpolate` | `isa_delta` | — | — | ✓ |
| C172 TO | `interpolate` | `absolute` | — | `1.20` | — |
| C172 LDG | `interpolate` | `absolute` | — | — | — |

> Le facteur réglementaire (×1.15 clubs Alcyons, etc.) n'est **pas** dans la table avion — il se configure dans le dossier de vol (`perfRegulatory`).
