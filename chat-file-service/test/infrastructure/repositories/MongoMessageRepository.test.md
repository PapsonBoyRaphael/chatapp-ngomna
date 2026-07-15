# Conclusion des tests : MongoMessageRepository.test.js

## Résultats : 10/10 ✅

## Points clés

1. **Upsert via `findByIdAndUpdate`** : La méthode `save()` n'utilise pas simplement `doc.save()` de Mongoose — elle fait un `findByIdAndUpdate(..., { upsert: true })`. Cela garantit l'idempotence : sauvegarder deux fois le même message ne crée pas de doublon. C'est une décision de conception robuste pour une messagerie fiable.

2. **Validation dual : entité vs données brutes** : Le repository accepte soit une entité `Message` (qui a une méthode `validate()`), soit des données brutes qu'il passe dans le constructeur du modèle Mongoose pour validation via `validateSync()`. C'est une flexibilité utile pour les deux types d'appelants.

3. **Gestion spéciale pour READ/DELIVERED** : Contrairement aux autres statuts (`DELETED`, `EDITED`) qui utilisent un `updateMany` direct, les statuts `READ` et `DELIVERED` passent par `updateSingleMessageStatus()` message par message. Cela permet de gérer les compteurs (`readCount`, `deliveredCount`, `readBy[]`) correctement pour les groupes.

4. **Soft delete + événement Kafka** : `deleteById()` effectue un soft delete (champ `deletedAt`) et publie un événement Kafka `MESSAGE_DELETED`. Si Kafka échoue, l'erreur est swallowed (avertissement seulement) — ce qui évite que la suppression échoue à cause de l'infra événementielle.
