# i18n — clés de la boîte de choix de fusion

**Réf. tâche** : x4
**Statut** : fait
**Type** : i18n
**Issue** :

Référence : [../features/merge-tab-groups-same-name/technical.md §6](../features/merge-tab-groups-same-name/technical.md#6-i18n).

## Constat vérifié

- Messages dans `public/_locales/fr/messages.json` et `public/_locales/en/messages.json`.
- `t(key, substitutions?)` ([src/lib/i18n.ts](../../src/lib/i18n.ts)) passe à
  `browser.i18n.getMessage` ; aucun message n'utilise encore de placeholder.
- `buttonCancel` (« Annuler ») existe déjà.

## À faire

1. Ajouter dans les **deux** fichiers `messages.json` :

   | clé | fr                                      | en                                     |
   | --- |-----------------------------------------|----------------------------------------|
   | `mergeConflictHeading` | Un groupe nommé « $NAME$ » existe déjà. | A group named “$NAME$” already exists. |
   | `mergePickLocalHeading` | Fusionner avec quel groupe local ?      | Merge with which local group?          |
   | `mergeChoiceRenameLocal` | Renommer le groupe local                | Rename the local group                 |
   | `mergeChoiceKeepLocal` | Garder mes onglets locaux               | Keep my local tabs                     |
   | `mergeChoiceKeepCloud` | Garder les onglets du cloud             | Keep the cloud tabs                    |
   | `mergeChoiceMerge` | Fusionner                               | Merge                                  |
   | `localGroupSuffix` | local                                   | local                                  |

2. `mergeConflictHeading` déclare `"placeholders": { "name": { "content": "$1" } }` et
   `$NAME$` dans le message ; appel `t('mergeConflictHeading', [name])`.
3. Vérifier via `tests/lib/i18n.test.ts` que les deux locales ont exactement le même
   jeu de clés (si un tel test de parité existe, sinon l'ajouter).

## Dépendances

Aucune.
