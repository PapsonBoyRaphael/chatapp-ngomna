# Dépendances Ngomna Chat App

## Versions mises à jour

### 🔄 Changements apportés

- **socket_io_client**: `^2.0.0` → `^3.0.0`
  - ✅ Amélioration de la compatibilité avec les serveurs Socket.IO modernes
  - ✅ Performance améliorée pour les connexions WebSocket
  - ✅ Meilleure gestion des événements et des erreurs

### 📦 Dépendances actuelles

```yaml
dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.8 # Icônes iOS/Cupertino
  socket_io_client: ^3.0.0 # Communication temps réel (mis à jour)
  http: ^1.4.0 # Requêtes HTTP/REST

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0 # Linting et bonnes pratiques
```

## 🚀 Commandes utiles

### Installation des dépendances

```bash
flutter pub get
```

### Mise à jour des dépendances

```bash
flutter pub upgrade
```

### Vérifier les versions outdated

```bash
flutter pub outdated
```

### Nettoyage et réinstallation

```bash
flutter clean
flutter pub get
```

## 🔍 Changements de l'API Socket.IO v3.x

### Nouvelles fonctionnalités disponibles

- Meilleure gestion des timeouts
- Support amélioré des namespaces
- Reconnexion automatique optimisée
- Gestion d'erreurs plus robuste

### Migration depuis v2.x

Les changements sont rétrocompatibles pour les fonctionnalités utilisées dans l'app :

- `IO.io()` - ✅ Compatible
- `socket.emit()` - ✅ Compatible
- `socket.on()` - ✅ Compatible
- `socket.off()` - ✅ Compatible

## 📝 Recommandations de maintenance

### 1. Surveillance des mises à jour

Exécuter périodiquement :

```bash
flutter pub outdated
```

### 2. Tests après mise à jour

- Tester les connexions Socket.IO
- Vérifier les requêtes HTTP
- Valider la navigation entre écrans

### 3. Versions futures

- Surveiller les releases de `socket_io_client`
- Mettre à jour `flutter_lints` vers v6.0.0 quand stable
- Considérer les mises à jour de `http` package

## 🐛 Résolution de problèmes

### Erreurs de connexion Socket.IO

Si des erreurs apparaissent après la mise à jour :

1. Vérifier la configuration du serveur
2. Tester avec les options de transport explicites :

```dart
globalSocket = IO.io(socketUrl, <String, dynamic>{
  'transports': ['websocket'],
  'upgrade': false,
  'autoConnect': true,
});
```

### Problèmes de compilation

```bash
flutter clean
flutter pub get
flutter pub upgrade
```

## 📚 Documentation utile

- [Socket.IO Client Dart](https://pub.dev/packages/socket_io_client)
- [HTTP Package](https://pub.dev/packages/http)
- [Flutter Dependencies Guide](https://docs.flutter.dev/development/packages-and-plugins/using-packages)
