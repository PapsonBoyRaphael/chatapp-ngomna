import 'package:flutter/material.dart';
import '../main.dart';
import '../utils/mock_data.dart' as MockData;
import 'chat_detail_screen.dart';
import 'groups_screen.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

// Génère un id MongoDB conversation à partir de deux ids participants (String)
String generateMongoId(String id1, String id2) {
  // Toujours trier et manipuler comme des chaînes de caractères (zéro parse int)
  List<String> sorted = [id1, id2]..sort();
  final base = sorted[0].padLeft(6, '0') + sorted[1].padLeft(6, '0');
  return (base + 'a' * (24 - base.length)).substring(0, 24);
}

// Fonction utilitaire globale pour récupérer les messages d'une conversation
Future<Map<String, dynamic>?> fetchMessages(
  String? convId,
  String? userId,
  BuildContext context,
) async {
  if (convId == null) return null;
  final url = Uri.parse(
    'http://localhost:8003/messages?conversationId=$convId&page=1&limit=50',
  );
  try {
    final response = await http.get(url, headers: {'user-id': userId ?? ''});
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Erreur lors de la récupération des messages'),
        ),
      );
    }
  } catch (e) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('Erreur réseau : $e')));
  }
  return null;
}

class ChatListScreen extends StatefulWidget {
  final String? matricule;
  final String? userId;
  const ChatListScreen({Key? key, this.matricule, this.userId})
    : super(key: key);

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  List<Map<String, dynamic>> conversations = [];
  bool isLoading = true;
  int unreadCount = 0; // Compteur dynamique des messages non lus

  @override
  void initState() {
    super.initState();
    globalSocket.on('conversationsLoaded', (data) {
      setState(() {
        conversations = List<Map<String, dynamic>>.from(
          data['conversations'] ?? [],
        );
        // Calculer le nombre de messages non lus
        unreadCount = data['unreadConversations'] ?? 0;
        isLoading = false;
      });
    });
    globalSocket.emit('getConversations', {'page': 1, 'limit': 50});
  }

  @override
  void dispose() {
    globalSocket.off('conversationsLoaded');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Chats',
          style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold),
        ),
        leading: IconButton(
          icon: const Icon(Icons.more_vert),
          onPressed: () {},
        ),
        actions: [IconButton(icon: const Icon(Icons.add), onPressed: () {})],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Search Bar
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(30),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.grey.withOpacity(0.2),
                      spreadRadius: 1,
                      blurRadius: 5,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Search',
                    prefixIcon: const Icon(Icons.search, color: Colors.grey),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(30),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 15,
                    ),
                  ),
                ),
              ),
            ),

            // Filter Tabs
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  _buildFilterChip(context, 'All Chats', true),
                  _buildFilterChip(context, 'Groups', false),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Chat List
            Expanded(
              child: isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        ...conversations.map(
                          (conv) => _buildChatItem(
                            context,
                            name: conv['name'] is String
                                ? conv['name']
                                : (conv['name']?['nom'] ?? 'Inconnu'),
                            message: conv['lastMessage'] is String
                                ? conv['lastMessage']
                                : (conv['lastMessage']?['text'] ??
                                      conv['lastMessage']?['content'] ??
                                      conv['lastMessage']?.toString() ??
                                      'Aucun message'),
                            time: conv['lastTime'] is String
                                ? conv['lastTime']
                                : (conv['lastTime']?.toString() ?? ''),
                            isGroup: conv['isGroup'] ?? false,
                            isOnline: conv['isOnline'] ?? false,
                            convId: normalizeConversationId(
                              conv['_id'] ?? conv['convId'],
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        items: [
          BottomNavigationBarItem(
            icon: Stack(
              children: [
                const Icon(Icons.chat_bubble),
                if (unreadCount > 0)
                  Positioned(
                    right: -2,
                    top: -2,
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(
                        color: Colors.red,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      constraints: const BoxConstraints(
                        minWidth: 20,
                        minHeight: 14,
                      ),
                      child: Text(
                        unreadCount.toString(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ),
            label: 'Chat',
          ),
          const BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          const BottomNavigationBarItem(
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
          }
        },
      ),
    );
  }

  Widget _buildFilterChip(BuildContext context, String label, bool isSelected) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(
          label,
          style: TextStyle(color: isSelected ? Colors.white : Colors.grey),
        ),
        selected: isSelected,
        onSelected: (bool value) {
          if (label == 'Groups') {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (context) => const GroupsScreen()),
            );
          }
        },
        backgroundColor: Colors.white,
        selectedColor: Colors.green,
        checkmarkColor: Colors.white,
        elevation: 2,
      ),
    );
  }

  Widget _buildChatItem(
    BuildContext context, {
    required String name,
    required String message,
    required String time,
    bool isGroup = false,
    bool isOnline = false,
    String? convId,
  }) {
    return GestureDetector(
      onTap: () async {
        if (convId == null || convId.isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Aucune conversation disponible pour $name'),
              backgroundColor: Colors.red,
            ),
          );
          return;
        }
        List<dynamic> messages = [];
        try {
          final response = await fetchMessages(convId, widget.userId, context);
          if (response != null && response['success'] == true) {
            messages = response['data']['messages'] ?? response['data'] ?? [];
          }
        } catch (e) {
          // Erreur déjà gérée dans fetchMessages
        }
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => ChatDetailScreen(
              name: name,
              isGroup: isGroup,
              isOnline: isOnline,
              convId: convId,
              initialMessages: messages,
              userMetadata:
                  (conversations.firstWhere(
                    (c) =>
                        (c['convId'] == convId) ||
                        (c['_id'] == convId) ||
                        (c['_id']?['\$oid'] == convId),
                    orElse: () => {},
                  )['userMetadata'] ??
                  []),
              matricule: widget.matricule,
            ),
          ),
        );
      },
      child: Row(
        children: [
          Stack(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: Colors.grey[200],
                child: Icon(
                  isGroup ? Icons.group : Icons.person,
                  color: isGroup ? Colors.green : Colors.grey,
                  size: 30,
                ),
              ),
              if (isOnline)
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: Colors.green,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  message,
                  style: TextStyle(color: Colors.grey[600], fontSize: 14),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(time, style: TextStyle(color: Colors.grey[500], fontSize: 12)),
        ],
      ),
    );
  }
}
