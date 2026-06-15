# Famille A — Interpolation classique

Pour les manuels avec **plusieurs colonnes de poids**. Le calcul interpole linéairement entre eux.

Exemples : Cessna 172 (3 poids), DR400-120 (2 poids).

---

## Structure de base

```json
{
  "weights": [700, 900],
  "pressureAltitudes": [0, 1000, 2000],
  "oats": [0, 10, 20],
  "values": [
    [
      [val_700_PA0_OAT0,  val_700_PA0_OAT10,  val_700_PA0_OAT20],
      [val_700_PA1000_0,  val_700_PA1000_10,  val_700_PA1000_20],
      [val_700_PA2000_0,  val_700_PA2000_10,  val_700_PA2000_20]
    ],
    [
      [val_900_PA0_OAT0,  val_900_PA0_OAT10,  val_900_PA0_OAT20],
      [val_900_PA1000_0,  val_900_PA1000_10,  val_900_PA1000_20],
      [val_900_PA2000_0,  val_900_PA2000_10,  val_900_PA2000_20]
    ]
  ]
}
```

> `values[poids_idx][pa_idx][oat_idx]` — distances en mètres

**Méthode de remplissage** : lire le manuel colonne par colonne (un poids = un bloc dans `values`), ligne par ligne (une PA = une ligne dans le bloc).

---

## Variante — Températures en écart ISA

Quand le manuel exprime la température comme « Std−20 », « Standard », « Std+20 » (fréquent dans les manuels français), ajouter :

```json
"oatAxis": "isa_delta",
"oats": [-20, 0, 20]
```

Le calcul convertit automatiquement la température réelle en écart ISA pour l'interpolation :
`delta = OAT_réelle − (15 − 2 × PA_ft/1000)`

Exemple DR400 à PA=4000 ft : ISA = 7°C → Std−20 = −13°C, Std = 7°C, Std+20 = 27°C.

---

## Variante — Table herbe séparée

Quand le manuel donne **deux tableaux distincts** (béton + herbe) plutôt qu'un simple facteur multiplicatif :

```json
"values":     [ /* béton — même structure */ ],
"grassValues": [ /* herbe — même structure et mêmes dimensions */ ]
```

Le calcul utilise automatiquement `grassValues` quand la piste est en herbe. Si `grassValues` est absent, le facteur `grassFactor` est appliqué à la place.

---

## Variante — Correction vent tabulée

Quand le manuel donne des facteurs de correction vent discrets (ex. DR400 : 10 kt → ×0.78) :

```json
"windCorrections": [
  { "speedKt": 10, "factor": 0.78 },
  { "speedKt": 20, "factor": 0.63 },
  { "speedKt": 30, "factor": 0.52 }
]
```

Le calcul interpole entre ces points. Si absent, `headwindFactor` (réduction linéaire par kt) est utilisé.

---

## Exemple complet — DR400-120 décollage

Voir [dr400-perf.json](dr400-perf.json) :
- 2 poids (700 / 900 kg)
- Températures en écart ISA
- Table herbe séparée
- Vent tabulé

## Exemple complet — Cessna 172S décollage

Voir [c172-perf.json](c172-perf.json) :
- 3 poids (998 / 1089 / 1157 kg)
- Températures absolues
- Pas de table herbe (facteur global dans `factors`)
