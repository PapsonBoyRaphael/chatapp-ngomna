import 'package:flutter/material.dart';
import '../main.dart';
import '../utils/mock_data.dart' as MockData;
import 'chat_detail_screen.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class GroupsScreen extends StatefulWidget {
  const GroupsScreen({super.key});

  @override
  State<GroupsScreen> createState() => _GroupsScreenState();
}

class _GroupsScreenState extends State<GroupsScreen> {
  List<Map<String, dynamic>> groups = [];
  bool isLoading = true;
  int unreadGroupsCount = 0;

  @override
  void initState() {
    super.initState();
    _setupSocketListeners();
    _loadGroups();
  }

  void _setupSocketListeners() {
    // Écoute des groupes chargés
    globalSocket.on('conversationsLoaded', (data) {
      if (mounted) {
        setState(() {
          // Filtrer seulement les groupes
          final allConversations = List<Map<String, dynamic>>.from(
            data['conversations'] ?? [],
          );
          groups = allConversations
              .where((conv) => conv['isGroup'] == true)
              .toList();
          unreadGroupsCount = data['unreadGroups'] ?? 0;
          isLoading = false;
        });
      }
    });

    // Écoute des nouveaux messages dans les groupes
    globalSocket.on('newMessage', (data) {
      if (data != null && data['isGroup'] == true && mounted) {
        _refreshGroups();
      }
    });
  }

  void _loadGroups() {
    // Demander les conversations avec filtre pour les groupes
    globalSocket.emit('getConversations', {
      'page': 1,
      'limit': 50,
      'filter': {'isGroup': true},
    });
  }

  void _refreshGroups() {
    setState(() {
      isLoading = true;
    });
    _loadGroups();
  }

  // Fonction utilitaire pour récupérer les messages du groupe
  Future<List<dynamic>> fetchGroupMessages(
    String convId,
    BuildContext context,
  ) async {
    final url = Uri.parse(
      'http://localhost:8003/messages?conversationId=$convId',
    );
    try {
      final response = await http.get(url, headers: {'user-id': '51'});
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true) {
          return data['data']['messages'] ?? data['data'] ?? [];
        }
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Erreur lors de la récupération des messages du groupe',
            ),
          ),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Erreur réseau : $e')));
    }
    return [];
  }

  @override
  void dispose() {
    globalSocket.off('conversationsLoaded');
    globalSocket.off('newMessage');
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
          'Groups',
          style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold),
        ),
        leading: IconButton(
          icon: const Icon(Icons.more_vert),
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Menu - Fonctionnalité à implémenter'),
              ),
            );
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refreshGroups,
            tooltip: 'Actualiser les groupes',
          ),
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'Créer un groupe - Fonctionnalité à implémenter',
                  ),
                ),
              );
            },
            tooltip: 'Créer un groupe',
          ),
        ],
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
                    hintText: 'Search Groups',
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
                  _buildFilterChip(context, 'Groups', true),
                  _buildFilterChip(context, 'All Chats', false),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Groups List
            Expanded(
              child: isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : groups.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.group_outlined,
                            size: 48,
                            color: Colors.grey[400],
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Aucun groupe trouvé',
                            style: TextStyle(
                              color: Colors.grey[600],
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 8),
                          ElevatedButton(
                            onPressed: _refreshGroups,
                            child: const Text('Actualiser'),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: () async => _refreshGroups(),
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: groups.length,
                        itemBuilder: (context, index) {
                          final group = groups[index];
                          return _buildGroupItem(
                            context,
                            name: group['name'] ?? 'Groupe sans nom',
                            memberCount: group['memberCount'] ?? 0,
                            message: group['lastMessage'] ?? 'Aucun message',
                            time: group['lastTime'] ?? '',
                            isOnline: group['isOnline'] ?? false,
                            convId: group['_id'] ?? group['convId'],
                          );
                        },
                      ),
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
                if (unreadGroupsCount > 0)
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
                        unreadGroupsCount.toString(),
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
          } else if (index == 0) {
            // Chat icon
            Navigator.pop(context);
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
          if (label == 'All Chats') {
            Navigator.pop(context);
          }
        },
        backgroundColor: Colors.white,
        selectedColor: Colors.green,
        checkmarkColor: Colors.white,
        elevation: 2,
      ),
    );
  }

  Widget _buildGroupItem(
    BuildContext context, {
    required String name,
    required int memberCount,
    required String message,
    required String time,
    bool isOnline = false,
    String? convId,
  }) {
    return GestureDetector(
      onTap: () async {
        if (convId == null || convId.isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('ID de conversation manquant pour ce groupe'),
              backgroundColor: Colors.red,
            ),
          );
          return;
        }

        final messages = await fetchGroupMessages(convId, context);
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => ChatDetailScreen(
              name: name,
              isGroup: true,
              isOnline: isOnline,
              convId: convId,
              initialMessages: messages,
            ),
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Row(
          children: [
            Stack(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: Colors.grey[200],
                  child: const Icon(Icons.group, color: Colors.green, size: 30),
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
                  const SizedBox(height: 2),
                  Text(
                    '$memberCount members',
                    style: TextStyle(color: Colors.grey[600], fontSize: 12),
                  ),
                  const SizedBox(height: 2),
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
      ),
    );
  }
}
