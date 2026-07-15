# Conclusion des tests : CreateGroup.test.js

## Résultats : 4/4 ✅

## Points clés

1. **`autoCreated=true` contourne le contrôle de permissions** : Quand le flag `autoCreated` est actif, le Use Case saute entièrement la vérification via l'API externe (`fetch`) et la validation `UserCacheService`. C'est un raccourci intentionnel pour les créations de groupes système (ex: via des workflows internes). Il faut s'assurer que ce flag ne soit jamais exposé à l'API publique sans contrôle.

2. **Dépendance à `fetch` global pour les permissions** : Le Use Case utilise `global.fetch` pour vérifier les droits de création de groupe. Dans les tests, cela a nécessité de mocker `global.fetch`. En production, si `VISIBILITY_API_URL` n't est pas défini, le Use Case échouera silencieusement.

3. **`groupId` optionnel → `_id` MongoDB** : Si un `groupId` est fourni, il est assigné directement en tant que `_id` de la conversation dans MongoDB. C'est une conception qui permet des identifiants métier prédictibles.
