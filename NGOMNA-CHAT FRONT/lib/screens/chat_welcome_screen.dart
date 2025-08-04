import 'package:flutter/material.dart';
import 'post_selection_screen.dart';

class ChatWelcomeScreen extends StatelessWidget {
  const ChatWelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.menu),
          onPressed: () {
            // Ouvre un menu latéral (drawer) s'il existe
            final scaffoldState = Scaffold.of(context);
            if (scaffoldState.hasDrawer) {
              scaffoldState.openDrawer();
            } else {
              // Alternative : afficher un SnackBar ou une modal avec les options de menu
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Menu - Fonctionnalité à implémenter'),
                ),
              );
            }
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {
              // Naviguer vers un écran de notifications
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Notifications - Fonctionnalité à implémenter'),
                ),
              );
              // TODO: Navigator.push(context, MaterialPageRoute(builder: (context) => NotificationsScreen()));
            },
          ),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () {
              // Naviguer vers un écran de paramètres
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Paramètres - Fonctionnalité à implémenter'),
                ),
              );
              // TODO: Navigator.push(context, MaterialPageRoute(builder: (context) => SettingsScreen()));
            },
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              alignment: Alignment.center,
              children: [
                const Icon(
                  Icons.chat_bubble_outline,
                  size: 120,
                  color: Colors.green,
                ),
                Positioned(
                  right: 0,
                  top: 20,
                  child: Container(
                    width: 80,
                    height: 80,
                    alignment: Alignment.center,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 40),
            const Text(
              'WELCOME TO',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const Text(
              'NGOMNA',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const Text(
              'INSTANT CHAT !!!',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 40),
            ElevatedButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const PostSelectionScreen(),
                  ),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: Colors.green,
                padding: const EdgeInsets.symmetric(
                  horizontal: 48,
                  vertical: 16,
                ),
                elevation: 2,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(30),
                ),
              ),
              child: const Text(
                'GET STARTED',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
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
        currentIndex: 0,
        selectedItemColor: Colors.green,
        onTap: (index) {
          if (index == 0) {
            // Déjà sur ChatWelcomeScreen, peut-être rafraîchir ou rien faire
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Vous êtes déjà sur l\'écran Chat'),
                duration: Duration(seconds: 1),
              ),
            );
          } else if (index == 1) {
            // Retourner à l'écran d'accueil (HomePage)
            Navigator.popUntil(context, (route) => route.isFirst);
          } else if (index == 2) {
            // Naviguer vers l'écran des favoris
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Favoris - Fonctionnalité à implémenter'),
              ),
            );
            // TODO: Navigator.push(context, MaterialPageRoute(builder: (context) => FavoritesScreen()));
          }
        },
      ),
    );
  }
}
