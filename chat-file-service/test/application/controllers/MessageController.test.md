# Conclusion des tests : MessageController.test.js

## Résultats : 6/6 ✅

## Points clés

1. **Validation en amont avant l'appel au Use Case** : Le contrôleur vérifie `senderId`, `receiverId`, et `content` avant d'appeler `sendMessageUseCase.execute()`. Si un champ est manquant, le Use Case n'est jamais appelé. Cela évite des erreurs en profondeur et renvoie un 400 clair.

2. **Plafonnement du `limit` à 100** : La méthode `getMessages` applique `Math.min(parseInt(limit), 100)` pour éviter des requêtes trop larges en base de données. Cela est confirmé par les tests via la propagation des options au Use Case.

3. **Headers de cache sur `getMessages`** : Comme pour `ConversationController`, les headers `X-Cache: HIT/MISS` et `X-Load-Source` sont propagés depuis le résultat du Use Case. Le contrôleur est transparent vis-à-vis du cache.

4. **Gestion des erreurs avec code 500** : Toute erreur non anticipée du Use Case est interceptée et retourne un 500 avec le code `SEND_MESSAGE_FAILED`. En développement (`NODE_ENV=development`), le message d'erreur original est inclus, ce qui facilite le debug.
