import 'package:socket_io_client/socket_io_client.dart' as IO;

class SocketService {
  static final SocketService _instance = SocketService._internal();
  factory SocketService() => _instance;
  SocketService._internal();

  IO.Socket? _socket;
  bool _isConnected = false;
  String? _currentUserId;

  // Callbacks
  final Map<String, List<Function(dynamic)>> _eventListeners = {};

  IO.Socket? get socket => _socket;
  bool get isConnected => _isConnected;
  String? get currentUserId => _currentUserId;

  Future<void> connect({String? serverUrl}) async {
    if (_socket != null && _isConnected) {
      print('✅ Socket déjà connecté');
      return;
    }

    final url = serverUrl ?? 'http://localhost:8003';

    _socket = IO.io(url, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': true,
      'timeout': 20000,
      'reconnection': true,
      'reconnectionAttempts': 5,
      'reconnectionDelay': 2000,
      'extraHeaders': {'origin': '*'},
    });

    _setupBaseEvents();
  }

  void _setupBaseEvents() {
    _socket?.onConnect((_) {
      print('✅ Socket.IO connecté');
      _isConnected = true;
      _notifyListeners('connect', null);
    });

    _socket?.onDisconnect((_) {
      print('🔌 Socket.IO déconnecté');
      _isConnected = false;
      _currentUserId = null;
      _notifyListeners('disconnect', null);
    });

    _socket?.onConnectError((error) {
      print('❌ Erreur de connexion Socket.IO: $error');
      _isConnected = false;
      _notifyListeners('connect_error', error);
    });
  }

  void authenticate({required String userId, required String matricule}) {
    if (_socket == null) {
      print('❌ Socket non initialisé');
      return;
    }

    _currentUserId = userId;
    _socket!.emit('authenticate', {'userId': userId, 'matricule': matricule});
  }

  void addListener(String event, Function(dynamic) callback) {
    if (!_eventListeners.containsKey(event)) {
      _eventListeners[event] = [];
      _socket?.on(event, (data) => _notifyListeners(event, data));
    }
    _eventListeners[event]!.add(callback);
  }

  void removeListener(String event, Function(dynamic) callback) {
    _eventListeners[event]?.remove(callback);
    if (_eventListeners[event]?.isEmpty == true) {
      _eventListeners.remove(event);
      _socket?.off(event);
    }
  }

  void _notifyListeners(String event, dynamic data) {
    _eventListeners[event]?.forEach((callback) {
      try {
        callback(data);
      } catch (e) {
        print('❌ Erreur dans le callback pour $event: $e');
      }
    });
  }

  void emit(String event, dynamic data) {
    if (_socket == null || !_isConnected) {
      print('❌ Impossible d\'émettre $event: Socket non connecté');
      return;
    }
    _socket!.emit(event, data);
  }

  void disconnect() {
    _eventListeners.clear();
    _socket?.disconnect();
    _socket = null;
    _isConnected = false;
    _currentUserId = null;
  }
}
