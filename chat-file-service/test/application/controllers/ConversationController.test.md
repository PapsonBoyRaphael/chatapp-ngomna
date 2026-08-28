# Conclusion des tests : ConversationController.test.js

## Résultats : 11/11 ✅

## Points clés

1. **Validation de l'userId via plusieurs sources** : Le contrôleur récupère l'ID utilisateur depuis `req.user?.id`, `req.user?.userId`, ou `req.headers["user-id"]`. Les tests confirment que si aucune de ces sources n'est présente, le 400 est bien renvoyé. C'est une bonne pratique de défense en profondeur.

2. **Plafonnement du `limit` à 50** : Même si le client demande 999 résultats, le contrôleur plafonne automatiquement à 50. Le test confirme que cette règle est bien appliquée avant d'appeler le Use Case.

3. **Gestion des fonctionnalités optionnelles (501)** : Si `archiveConversationUseCase` n'est pas injecté dans le constructeur, la méthode renvoie 501 "Fonctionnalité non disponible". C'est une gestion élégante des fonctionnalités partiellement déployées — le serveur peut démarrer sans toutes les fonctionnalités.

4. **Headers de cache propagés depuis le repository** : Les headers `X-Cache`, `X-Load-Source`, `Cache-Control` sont définis en fonction de `result.fromCache` renvoyé par le Use Case. Le contrôleur ne gère pas le cache lui-même — il ne fait que propager l'information.
