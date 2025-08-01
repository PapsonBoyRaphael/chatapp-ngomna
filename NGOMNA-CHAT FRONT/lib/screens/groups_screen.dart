import 'package:flutter/material.dart';
import 'chat_detail_screen.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

// Mock data pour tous les membres du groupe
const Map<String, Map<String, dynamic>> groupMembersMock = {
  'M. Louis Paul MOTAZE': {
    'id': 'a1f52b',
    'matricule': '151703A',
    'nom': 'M. Louis Paul MOTAZE',
  },
  'Dr Madeleine TCHUINTE': {
    'id': 'b2c63d',
    'matricule': '565939D',
    'nom': 'Dr Madeleine TCHUINTE',
  },
  'M. MESSANGA ETOUNDI Serge Ulrich': {
    'id': 'c3d74e',
    'matricule': 'X001',
    'nom': 'M. MESSANGA ETOUNDI Serge Ulrich',
  },
  'M. NLEME AKONO Patrick': {
    'id': 'd4e85f',
    'matricule': 'X002',
    'nom': 'M. NLEME AKONO Patrick',
  },
  'Mme YECKE ENDALE Berthe épse EKO EKO': {
    'id': 'e5f96a',
    'matricule': 'X003',
    'nom': 'Mme YECKE ENDALE Berthe épse EKO EKO',
  },
  'Pr MBARGA BINDZI Marie Alain': {
    'id': 'f6a07b',
    'matricule': 'X004',
    'nom': 'Pr MBARGA BINDZI Marie Alain',
  },
  'M. NSONGAN ETUNG Joseph': {
    'id': 'g7b18c',
    'matricule': 'X005',
    'nom': 'M. NSONGAN ETUNG Joseph',
  },
  'M. SOUTH SOUTH Ruben': {
    'id': 'h8c29d',
    'matricule': 'X006',
    'nom': 'M. SOUTH SOUTH Ruben',
  },
  'M. ABENA MVEME Innocent Paul': {
    'id': 'i9d30e',
    'matricule': 'X007',
    'nom': 'M. ABENA MVEME Innocent Paul',
  },
  'Mme GOMA Flore': {
    'id': 'j0e41f',
    'matricule': 'X008',
    'nom': 'Mme GOMA Flore',
  },
  'M. EPIE NGENE Goddy': {
    'id': 'k1f52a',
    'matricule': 'X009',
    'nom': 'M. EPIE NGENE Goddy',
  },
  'Mme TCHUENTE FOGUEM GERMAINE épse BAHANAG': {
    'id': 'l2g63b',
    'matricule': 'X010',
    'nom': 'Mme TCHUENTE FOGUEM GERMAINE épse BAHANAG',
  },
  'Pr MVEH Chantal Marguerite': {
    'id': 'm3h74c',
    'matricule': 'X011',
    'nom': 'Pr MVEH Chantal Marguerite',
  },
};

class GroupsScreen extends StatelessWidget {
  // Fonction utilitaire pour récupérer les messages du groupe
  Future<List<dynamic>> fetchGroupMessages() async {
    const groupConvId = '60f7b3b3b3b3b3b3b3b3b3b4';
    final url = Uri.parse(
      'http://localhost:8000/messages?conversationId=$groupConvId&page=1&limit=50',
    );
    try {
      final response = await http.get(
        url,
        headers: {'user-id': '51'},
      ); // id admin ou connecté
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true) {
          return data['data']['messages'] ?? data['data'] ?? [];
        }
      }
    } catch (e) {}
    return [];
  }

  const GroupsScreen({super.key});

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
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _buildGroupItem(
                    context,
                    name: 'CONSEIL DE DIRECTION CENADI',
                    memberCount: 13,
                    message: 'Click to start group conversation',
                    time: '',
                    isOnline: true,
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
                    child: const Text(
                      '1234',
                      style: TextStyle(color: Colors.white, fontSize: 10),
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
  }) {
    return GestureDetector(
      onTap: () async {
        final messages = await fetchGroupMessages();
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => ChatDetailScreen(
              name: name,
              isGroup: true,
              isOnline: isOnline,
              convId: '60f7b3b3b3b3b3b3b3b3b3b4',
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
