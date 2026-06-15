# Famille B — Poids unique

Pour les manuels avec **un seul tableau de référence** (un seul poids). Deux sous-cas selon que le manuel fournit une formule de correction ou non.

---

## Sous-cas B1 — Correction quadratique `(P/X)²`

Le manuel donne la table pour un poids de référence et précise une formule du type :
> « Pour un poids inférieur, multiplier par `(P_effectif / 830)²` »

```json
{
  "weights": [840],
  "pressureAltitudes": [0, 500, 1000, 1500],
  "oats": [0, 15, 30, 45],
  "weightCorrection": "quadratic",
  "referenceWeight": 840,
  "weightCorrectionDivisor": 830,
  "values": [
    [
      [440, 470, 500, 540],
      [490, 540, 580, 630],
      [580, 640, 700, 750],
      [680, 740, 800, 880]
    ]
  ]
}
```

**Champs spécifiques :**

| Champ | Valeur | Signification |
|---|---|---|
| `weightCorrection` | `"quadratic"` | Active la correction (P/div)² |
| `referenceWeight` | 840 | Poids pour lequel la table a été calculée |
| `weightCorrectionDivisor` | 830 | Diviseur dans la formule — souvent ≠ `referenceWeight` ! Lire attentivement le manuel. |

**Calcul appliqué :**
`distance_corrigée = distance_table × (poids_réel / weightCorrectionDivisor)²`

> Si `weightCorrectionDivisor` est absent, `referenceWeight` est utilisé comme diviseur.

---

## Sous-cas B2 — Poids unique sans formule

Le manuel donne une table à un seul poids (souvent le poids max) sans fournir de correction. Le calcul utilise la table telle quelle — comportement conservateur si le poids réel est inférieur.

```json
{
  "weights": [1157],
  "pressureAltitudes": [0, 1000, 2000, 3000, 4000],
  "oats": [0, 10, 20, 30, 40],
  "values": [
    [
      [1290, 1320, 1350, 1380, 1415],
      [1320, 1350, 1385, 1420, 1450],
      [1355, 1385, 1420, 1455, 1490],
      ...
    ]
  ]
}
```

Pas de champ `weightCorrection` — le clamping est le comportement par défaut.

---

## Sous-cas B3 — Poids unique sans variation PA/OAT

Certaines tables d'atterrissage ne varient ni avec l'altitude ni avec la température. Utiliser un seul point sur ces axes :

```json
{
  "weights": [750, 840],
  "pressureAltitudes": [0],
  "oats": [15],
  "values": [
    [[510]],
    [[550]]
  ]
}
```

`values[poids_idx][0][0]` = distance unique pour ce poids.

> Les valeurs sont ici pré-calculées (roulement + offset) puisque le manuel ne donne que le roulement.

---

## Exemple complet — DR221

Voir [dr221-perf.json](dr221-perf.json) :
- **Décollage** : B1 (poids unique + correction quadratique + table herbe séparée)
- **Atterrissage** : B3 (deux poids, un seul point PA/OAT, valeurs pré-calculées)
