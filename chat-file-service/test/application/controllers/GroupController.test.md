# Conclusion des tests : GroupController.test.js

## Résultats : 14/14 ✅

## Points clés

1. **Codes HTTP sémantiques par type d'erreur** : Le contrôleur utilise des codes HTTP précis selon l'erreur — 409 pour "déjà membre", 403 pour les violations d'autorisation, 404 pour les ressources introuvables. Les tests confirment que la détection d'erreur basée sur le message (`.includes(...)`) fonctionne correctement. Attention : cette approche est fragile si les messages d'erreur changent dans les Use Cases.

2. **Injection d'objets dans le constructeur** : Contrairement aux autres contrôleurs qui prennent des arguments positionnels, `GroupController` accepte un objet de dépendances `{ createGroupUseCase, ... }`. C'est une conception plus flexible qui facilite l'extension future (ajout de nouveaux Use Cases sans casser l'interface).

3. **addAdmin conditionnel (503)** : Si `addAdminUseCase` n'est pas injecté, le contrôleur renvoie 503 "Service non disponible" — différent du 501 du ConversationController. Cette inconsistance entre contrôleurs est à noter pour une future harmonisation.

4. **Validation du type de groupe** : La méthode `getGroup` vérifie explicitement que `conversation.type === "GROUP"` avant de renvoyer la réponse. Cela empêche l'API `/groups/:id` de retourner des conversations privées ou des canaux par leur ID.
