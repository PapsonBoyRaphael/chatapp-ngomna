# Correction TypeError: \_JsonMap is not a subtype of List<dynamic>

## Problème

L'application plantait avec l'erreur :

```
TypeError: Instance of '_JsonMap': type '_JsonMap' is not a subtype of type 'List<dynamic>?'
```

L'erreur se produisait à la ligne 300 du fichier `chat_list_screen.dart`.

## Cause

Le paramètre `userMetadata` de `ChatDetailScreen` attend une `List<dynamic>?`, mais le code tentait de lui passer directement la valeur `['userMetadata']` depuis un Map retourné par `findConversationById()`.

Le problème était que `userMetadata` dans les données peut être de n'importe quel type (Map, String, null, etc.) mais le constructeur de `ChatDetailScreen` attend spécifiquement une liste.

## Solution

1. **Ajout d'une fonction utilitaire** dans `mock_data.dart` :

   ```dart
   /// Assure qu'une valeur est une liste, retourne une liste vide si ce n'est pas le cas
   List<dynamic> ensureList(dynamic value) {
     if (value is List) {
       return value;
     }
     return <dynamic>[];
   }
   ```

2. **Utilisation de la fonction** dans `chat_list_screen.dart` :
   ```dart
   userMetadata: MockData.ensureList(
     MockData.findConversationById(
       conversations,
       convId,
     )['userMetadata'],
   ),
   ```

## Résultat

L'application ne plante plus et gère correctement les cas où `userMetadata` n'est pas une liste en retournant une liste vide par défaut.

Date de correction : 4 août 2025
