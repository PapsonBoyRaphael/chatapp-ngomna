import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'screens/chat_welcome_screen.dart';

// Socket.IO global
late IO.Socket globalSocket;

void main() {
  globalSocket = IO.io('http://localhost:8003', <String, dynamic>{
    'transports': ['websocket'],
    'autoConnect': true,
    'extraHeaders': {'origin': '*'},
  });
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Exemple de configuration d'écoute globale (à adapter selon les besoins)
    globalSocket.onConnect((_) {
      print('Socket.IO connecté (global)');
      // Authentification supprimée, sera gérée via mock-data après saisie matricule
    });
    globalSocket.on('newMessage', (data) {
      print('Nouveau message reçu (global): $data');
    });
    globalSocket.on('onlineUsers', (data) {
      print('Utilisateurs en ligne (global): ${data['users']}');
    });
    globalSocket.on('authenticated', (data) {
      print('Authentifié (global): $data');
    });

    return MaterialApp(
      title: 'Ngomna App',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  void _navigateToChatScreen(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => const ChatWelcomeScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(icon: const Icon(Icons.menu), onPressed: () {}),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {},
          ),
          IconButton(icon: const Icon(Icons.settings), onPressed: () {}),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: GridView.count(
          crossAxisCount: 2,
          mainAxisSpacing: 16,
          crossAxisSpacing: 16,
          children: [
            const MenuCard(
              title: 'Payslips',
              icon: Icons.description,
              color: Color(0xFFE8F5E9),
              iconColor: Colors.green,
            ),
            const MenuCard(
              title: 'Census',
              icon: Icons.help_outline,
              color: Color(0xFFE8F5E9),
              iconColor: Colors.green,
            ),
            const MenuCard(
              title: 'Information',
              icon: Icons.person_outline,
              color: Color(0xFFE8F5E9),
              iconColor: Colors.green,
            ),
            const MenuCard(
              title: 'DGI',
              icon: Icons.account_balance,
              color: Color(0xFFE8F5E9),
              iconColor: Colors.green,
            ),
          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.chat_bubble_outline),
            label: 'Chat',
          ),
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(
            icon: Icon(Icons.star_border),
            label: 'Favorites',
          ),
        ],
        currentIndex: 1,
        selectedItemColor: Colors.green,
        onTap: (index) {
          if (index == 0) {
            _navigateToChatScreen(context);
          }
        },
      ),
    );
  }
}

class MenuCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final Color iconColor;

  const MenuCard({
    super.key,
    required this.title,
    required this.icon,
    required this.color,
    required this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: color,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 48, color: iconColor),
          const SizedBox(height: 8),
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}
