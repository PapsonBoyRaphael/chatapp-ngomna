import 'package:flutter/material.dart';
import '../main.dart'; // Pour accéder à globalSocket
import '../utils/mock_data.dart' as MockData;

// Génère un id MongoDB conversation à partir de deux ids participants (String)
String generateMongoId(String id1, String id2) {
  // Toujours trier et manipuler comme des chaînes de caractères (zéro parse int)
  List<String> sorted = [id1, id2]..sort();
  final base = sorted[0].padLeft(6, '0') + sorted[1].padLeft(6, '0');
  return (base + 'a' * (24 - base.length)).substring(0, 24);
}

class Message {
  final String text;
  final bool isSent;
  final String time;
  final String? messageId;
  final String? status; // 'sent', 'delivered', 'read'

  Message({
    required this.text,
    required this.isSent,
    required this.time,
    this.messageId,
    this.status = 'sent',
  });
}

class ChatDetailScreen extends StatefulWidget {
  final String name;
  final List<dynamic>? userMetadata; // Ajouté pour participants
  final bool isOnline;
  final bool isGroup;
  final String? matricule; // Ajouté pour identifier l'utilisateur connecté
  final String? userId; // ID utilisateur pour la comparaison
  final String? convId; // Id temporaire de la conversation
  final List<dynamic>? initialMessages; // Ajouté pour précharger les messages
  const ChatDetailScreen({
    Key? key,
    required this.name,
    this.userMetadata,
    this.isOnline = false,
    this.isGroup = false,
    this.matricule,
    this.userId,
    this.convId,
    this.initialMessages,
  }) : super(key: key);

  @override
  State<ChatDetailScreen> createState() => _ChatDetailScreenState();
}

class _ChatDetailScreenState extends State<ChatDetailScreen> {
  String? getOtherParticipantName() {
    if (widget.isGroup) return widget.name;
    final meta = widget.userMetadata;
    if (meta == null || meta.length < 2) return widget.name;

    // On cherche le participant dont l'userId n'est pas le mien
    for (final user in meta) {
      if (user is Map && user['userId'] != widget.userId) {
        return user['name'] as String? ?? widget.name;
      }
    }
    return widget.name;
  }

  late final String conversationId;
  final TextEditingController _messageController = TextEditingController();
  final List<Message> _messages = [];
  String? currentUserId; // ID utilisateur pour le backend

  @override
  void initState() {
    super.initState();

    // Récupérer l'ID utilisateur à partir du matricule
    final userData = MockData.findUserByMatricule(widget.matricule ?? '');
    currentUserId = userData?['id']?.toString();

    // Ajoute les messages initiaux si fournis (fallback HTTP)
    if (widget.initialMessages != null && widget.initialMessages!.isNotEmpty) {
      for (var msg in widget.initialMessages!) {
        _messages.add(
          Message(
            text: msg['content'] ?? '',
            isSent: msg['senderId'] == currentUserId,
            time: _formatTimestamp(msg['timestamp']),
            messageId: msg['_id']?.toString(),
            status: msg['status'] ?? 'sent',
          ),
        );
      }
    }

    // Nouvelle logique : on n'utilise QUE l'id fourni par le backend
    if (widget.convId != null && widget.convId!.isNotEmpty) {
      conversationId = widget.convId!;
      // Rejoindre la conversation au chargement
      globalSocket.emit('joinConversation', {'conversationId': conversationId});
      // Demander les messages via Socket.IO (événement getMessages)
      globalSocket.emit('getMessages', {'conversationId': conversationId});
    } else {
      // Si pas d'id conversation, refuse l'accès et affiche une erreur claire
      print(
        '❌ Aucun id de conversation fourni à ChatDetailScreen pour ${widget.name}',
      );
      // Optionnel : tu peux afficher un message d'erreur à l'utilisateur ici
    }

    // Ecoute des messages initiaux via Socket.IO
    globalSocket.on('messagesLoaded', (data) {
      print('messagesLoaded reçu: $data');
      List<dynamic> messagesList = [];
      if (data is Map && data['messages'] is List) {
        messagesList = data['messages'];
      } else if (data is List) {
        messagesList = data;
      }
      if (mounted) {
        setState(() {
          _messages.clear();
          for (var msg in messagesList) {
            _messages.add(
              Message(
                text: msg['content'] ?? '',
                isSent: msg['senderId'] == currentUserId,
                time: _formatTimestamp(msg['timestamp']),
                messageId: msg['_id']?.toString(),
                status: msg['status'] ?? 'sent',
              ),
            );
          }
        });
      }
    });

    // Ecoute des nouveaux messages via Socket.IO
    globalSocket.on('newMessage', (data) {
      if (data is List) {
        for (var msg in data) {
          if (MockData.normalizeConversationId(msg['conversationId']) ==
              conversationId) {
            if (mounted) {
              setState(() {
                _messages.add(
                  Message(
                    text: msg['content'] ?? '',
                    isSent: msg['senderId'] == currentUserId,
                    time: _formatTimestamp(msg['timestamp']),
                    messageId: msg['_id']?.toString(),
                    status: msg['status'] ?? 'sent',
                  ),
                );
              });
            }
          }
        }
      } else if (data != null &&
          MockData.normalizeConversationId(data['conversationId']) ==
              conversationId) {
        if (mounted) {
          setState(() {
            _messages.add(
              Message(
                text: data['content'] ?? '',
                isSent: data['senderId'] == currentUserId,
                time: _formatTimestamp(data['timestamp']),
                messageId: data['_id']?.toString(),
                status: data['status'] ?? 'sent',
              ),
            );
          });
        }
      }
    });

    // Gestion des accusés de réception
    _setupMessageStatusListeners();
  }

  void _sendMessage() {
    final messageText = _messageController.text.trim();

    if (messageText.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Veuillez saisir un message'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    // Utiliser l'ID utilisateur au lieu du matricule pour le backend
    String senderId = currentUserId ?? widget.matricule ?? '51';
    String receiverId = '';

    // On récupère l'id du destinataire via le mapping (pour 1-1)
    if (!widget.isGroup) {
      final receiverInfo = MockData.userMapping[widget.name];
      if (receiverInfo != null) {
        receiverId = receiverInfo['id']?.toString() ?? '';
      }
      if (receiverId.isEmpty) {
        print('❌ receiverId introuvable pour ${widget.name}');
      }
    }
    final messageData = {
      'content': messageText,
      'senderId': senderId,
      'receiverId': widget.isGroup ? null : receiverId,
      'conversationId': conversationId,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
    };
    globalSocket.emit('sendMessage', messageData);

    // Générer un ID temporaire pour le message
    final tempMessageId = DateTime.now().millisecondsSinceEpoch.toString();

    setState(() {
      _messages.add(
        Message(
          text: messageText,
          isSent: true,
          time: _getCurrentTime(),
          messageId: tempMessageId,
          status: 'sending', // État temporaire
        ),
      );
    });
    _messageController.clear();
  }

  String _getCurrentTime() {
    final now = DateTime.now();
    return "${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}";
  }

  String _formatTimestamp(dynamic timestamp) {
    if (timestamp == null) return _getCurrentTime();

    try {
      DateTime dateTime;
      if (timestamp is int) {
        dateTime = DateTime.fromMillisecondsSinceEpoch(timestamp);
      } else if (timestamp is String) {
        dateTime = DateTime.parse(timestamp);
      } else {
        return _getCurrentTime();
      }

      return "${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}";
    } catch (e) {
      return _getCurrentTime();
    }
  }

  void _setupMessageStatusListeners() {
    // Écoute des accusés de réception
    globalSocket.on('messageDelivered', (data) {
      final messageId = data['messageId']?.toString();
      if (messageId != null && mounted) {
        setState(() {
          final messageIndex = _messages.indexWhere(
            (msg) => msg.messageId == messageId,
          );
          if (messageIndex != -1) {
            final message = _messages[messageIndex];
            _messages[messageIndex] = Message(
              text: message.text,
              isSent: message.isSent,
              time: message.time,
              messageId: message.messageId,
              status: 'delivered',
            );
          }
        });
      }
    });

    globalSocket.on('messageRead', (data) {
      final messageId = data['messageId']?.toString();
      if (messageId != null && mounted) {
        setState(() {
          final messageIndex = _messages.indexWhere(
            (msg) => msg.messageId == messageId,
          );
          if (messageIndex != -1) {
            final message = _messages[messageIndex];
            _messages[messageIndex] = Message(
              text: message.text,
              isSent: message.isSent,
              time: message.time,
              messageId: message.messageId,
              status: 'read',
            );
          }
        });
      }
    });

    globalSocket.on('messageStatusChanged', (data) {
      final messageId = data['messageId']?.toString();
      final status = data['status']?.toString();
      if (messageId != null && status != null && mounted) {
        setState(() {
          final messageIndex = _messages.indexWhere(
            (msg) => msg.messageId == messageId,
          );
          if (messageIndex != -1) {
            final message = _messages[messageIndex];
            _messages[messageIndex] = Message(
              text: message.text,
              isSent: message.isSent,
              time: message.time,
              messageId: message.messageId,
              status: status,
            );
          }
        });
      }
    });
  }

  @override
  void dispose() {
    globalSocket.off('messagesLoaded');
    globalSocket.off('newMessage');
    globalSocket.off('messageDelivered');
    globalSocket.off('messageRead');
    globalSocket.off('messageStatusChanged');
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      bottomNavigationBar: BottomNavigationBar(
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.chat_bubble), label: 'Chat'),
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(
            icon: Icon(Icons.star_border),
            label: 'Favorites',
          ),
        ],
        currentIndex: 0,
        selectedItemColor: Colors.green,
        onTap: (index) {
          if (index == 1) {
            // Home icon
            Navigator.of(context).popUntil((route) => route.isFirst);
          } else if (index == 0) {
            // Chat icon
            Navigator.pop(context);
          }
        },
      ),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leadingWidth: 30,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black),
          onPressed: () => Navigator.pop(context),
        ),
        title: Row(
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: Colors.grey[200],
              child: Icon(
                widget.isGroup ? Icons.group : Icons.person,
                color: widget.isGroup ? Colors.green : Colors.grey,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    getOtherParticipantName() ?? '',
                    style: const TextStyle(
                      color: Colors.black,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (widget.isOnline)
                    const Text(
                      'Online',
                      style: TextStyle(color: Colors.green, fontSize: 12),
                    ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.videocam, color: Colors.green),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.phone, color: Colors.green),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.more_vert, color: Colors.black),
            onPressed: () {},
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.chat_bubble_outline,
                          size: 48,
                          color: Colors.grey[400],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Start a new conversation',
                          style: TextStyle(
                            color: Colors.grey[600],
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message = _messages[index];
                      return message.isSent
                          ? _SentMessage(
                              message: message.text,
                              time: message.time,
                              status: message.status,
                            )
                          : _ReceivedMessage(
                              message: message.text,
                              time: message.time,
                            );
                    },
                  ),
          ),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  offset: const Offset(0, -3),
                  blurRadius: 6,
                  color: Colors.black.withOpacity(0.1),
                ),
              ],
            ),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.attach_file),
                  onPressed: () {},
                  color: Colors.grey,
                ),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      color: Colors.grey[100],
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: TextField(
                      controller: _messageController,
                      decoration: const InputDecoration(
                        hintText: 'Type a message',
                        border: InputBorder.none,
                      ),
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  decoration: const BoxDecoration(
                    color: Colors.green,
                    shape: BoxShape.circle,
                  ),
                  child: IconButton(
                    icon: const Icon(Icons.send, color: Colors.white),
                    onPressed: _sendMessage,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReceivedMessage extends StatelessWidget {
  final String message;
  final String time;

  const _ReceivedMessage({required this.message, required this.time});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, right: 50),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            decoration: BoxDecoration(
              color: Colors.grey[100],
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomRight: Radius.circular(16),
              ),
            ),
            padding: const EdgeInsets.all(12),
            child: Text(message),
          ),
          const SizedBox(height: 4),
          Text(time, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
        ],
      ),
    );
  }
}

class _SentMessage extends StatelessWidget {
  final String message;
  final String time;
  final String? status;

  const _SentMessage({required this.message, required this.time, this.status});

  Widget _buildStatusIcon() {
    switch (status) {
      case 'sending':
        return const Icon(Icons.schedule, size: 12, color: Colors.grey);
      case 'sent':
        return const Icon(Icons.check, size: 12, color: Colors.grey);
      case 'delivered':
        return const Icon(Icons.done_all, size: 12, color: Colors.grey);
      case 'read':
        return const Icon(Icons.done_all, size: 12, color: Colors.blue);
      default:
        return const Icon(Icons.check, size: 12, color: Colors.grey);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, left: 50),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Container(
            decoration: const BoxDecoration(
              color: Colors.green,
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomLeft: Radius.circular(16),
              ),
            ),
            padding: const EdgeInsets.all(12),
            child: Text(message, style: const TextStyle(color: Colors.white)),
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text(
                time,
                style: TextStyle(fontSize: 12, color: Colors.grey[600]),
              ),
              const SizedBox(width: 4),
              _buildStatusIcon(),
            ],
          ),
        ],
      ),
    );
  }
}
