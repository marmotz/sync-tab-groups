# Fusion de groupes d'onglets homonymes à l'ouverture d'un groupe synchronisé

**Statut** : conception technique → [technical.md](technical.md)

## Contexte

Aujourd'hui, `openGroup` (src/lib/groupActions.ts) crée systématiquement un nouveau
groupe d'onglets local à partir d'un groupe synchronisé. Si l'utilisateur possède déjà
un groupe local portant le même nom (créé indépendamment sur ce device), il se retrouve
avec deux groupes homonymes distincts, non synchronisés entre eux, et doit fusionner à
la main.

## Objectif

À l'ouverture d'un groupe synchronisé, détecter un éventuel groupe local homonyme et
proposer à l'utilisateur comment réconcilier les deux, au lieu de dupliquer.

## Décisions actées

- **Déclencheur** : au clic sur « ouvrir » un groupe synchronisé, avant toute création
  de groupe local.
- **Recherche du candidat** : parmi les groupes locaux **non encore synchronisés**
  (`listUnsharedLocalGroups`), ceux dont le titre est égal au titre du groupe
  synchronisé — comparaison **insensible à la casse**, espaces de début/fin ignorés.
- **Aucun homonyme** → comportement actuel inchangé.
- **Un ou plusieurs homonymes** → boîte de dialogue « Un groupe nommé "x" existe
  déjà ». Si plusieurs candidats, l'utilisateur choisit d'abord auquel s'applique la
  réconciliation.
- Les trois options de réconciliation (local / cloud / fusion) **lient** ensuite le
  groupe local au `syncId` et **poussent immédiatement** l'état réconcilié vers le
  cloud (les autres devices reçoivent le résultat).

### Options de la boîte de dialogue

| Libellé | Effet |
| --- | --- |
| **Renommer le groupe local** | Ajoute un suffixe automatique (`"x (2)"`, incrémenté tant qu'il y a conflit) au groupe local, puis ouvre le groupe synchronisé normalement, à part. Rien n'est fusionné. |
| **Garder mes onglets** | Le contenu local écrase le distant ; le groupe local est lié à la synchro et poussé. |
| **Garder les onglets du cloud** | Les onglets du groupe local sont remplacés par ceux du cloud ; le groupe est lié à la synchro. |
| **Fusionner** | Réunit les onglets des deux côtés dans le groupe local : onglets locaux d'abord, puis onglets distants absents. Dédoublonnage par URL exacte. Le groupe est lié à la synchro et poussé. |
| **Annuler** | Aucune action. |

### Points hors périmètre

- Pas de détection d'homonyme entre deux groupes **déjà synchronisés**.
- Pas de matching flou (fautes de frappe, accents).
