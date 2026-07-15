# Conclusion des tests : Cas d'utilisation (Use Cases)

Les tests de la couche Application mettent en avant les choix d'architecture concernant l'orchestration métier et la gestion des erreurs.

## Points Clés

1. **Gestion silencieuse des erreurs (ex: `SendMessage`)** :
   Lors du test d'envoi de message, nous avons remarqué que si un utilisateur tente d'envoyer un message dans une conversation dont il n'est pas membre, **le code n'échoue pas directement en remontant l'erreur au contrôleur**. 
   Le bloc `catch` interne au Use Case intercepte l'erreur, la masque (`conversation = null`), et tente ensuite de créer une nouvelle conversation à la place. C'est un choix de design défensif qui évite les crashs, mais c'est un "edge case" important à documenter si l'API était censée renvoyer explicitement une erreur HTTP 403 "Accès refusé".

2. **Mocking et Isolation** :
   L'injection de dépendances permet de mocker entièrement les composants d'infrastructure. Dans `SendMessage.test.js`, nous avons pu mocker `messageRepository`, `conversationRepository` et `resilientService` pour valider toute la logique métier complexe sans jamais toucher à Mongoose, Redis ou Kafka.
