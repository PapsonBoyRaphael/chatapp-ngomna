import 'package:flutter/material.dart';
import '../main.dart';
import '../utils/mock_data.dart' as MockData;
import 'chat_list_screen.dart';

class PostSelectionScreen extends StatefulWidget {
  const PostSelectionScreen({super.key});

  @override
  State<PostSelectionScreen> createState() => _PostSelectionScreenState();
}

class _PostSelectionScreenState extends State<PostSelectionScreen> {
  final TextEditingController _matriculeController = TextEditingController();
  bool _isButtonEnabled = false;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _matriculeController.addListener(() {
      setState(() {
        _isButtonEnabled = _matriculeController.text.isNotEmpty;
      });
    });

    // Configurer les écouteurs Socket.IO pour l'authentification
    _setupSocketListeners();
  }

  void _setupSocketListeners() {
    // Écouteur pour authentification réussie
    globalSocket.on('authenticated', (data) {
      print('Authentification réussie : $data');
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => ChatListScreen(
              matricule: data['matricule'],
              userId: data['userId'],
            ),
          ),
        );
      }
    });

    // Écouteur pour erreur d'authentification
    globalSocket.on('auth_error', (data) {
      print('Erreur d\'authentification : $data');
      if (mounted) {
        setState(() {
          _errorMessage = data['message'] ?? 'Erreur d\'authentification';
          _isLoading = false;
        });
      }
    });
  }

  @override
  void dispose() {
    _matriculeController.dispose();
    // Nettoyer les écouteurs Socket.IO
    globalSocket.off('authenticated');
    globalSocket.off('auth_error');
    super.dispose();
  }

  Future<void> _authenticateMatricule() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final matricule = _matriculeController.text.trim().toUpperCase();

    // Validation du format du matricule
    if (!MockData.isValidMatriculeFormat(matricule)) {
      setState(() {
        _errorMessage =
            'Matricule invalide. Utilisez uniquement des lettres majuscules et des chiffres.';
        _isLoading = false;
      });
      return;
    }

    // Recherche de l'utilisateur dans les données mock
    final userData = MockData.findUserByMatricule(matricule);

    if (userData != null) {
      // Lancer l'événement Socket.IO 'authenticate' avec les données mock
      globalSocket.emit('authenticate', {
        'userId': userData['id'],
        'matricule': userData['matricule'],
        'nom': userData['nom'],
      });

      // Note: La navigation se fera dans l'écouteur 'authenticated'
      // ou en cas de timeout, on navigue directement après 3 secondes
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted && _isLoading) {
          // Timeout: naviguer directement si pas de réponse du serveur
          setState(() {
            _isLoading = false;
          });
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => ChatListScreen(
                matricule: userData['matricule'],
                userId: userData['id'] as String?,
              ),
            ),
          );
        }
      });
    } else {
      setState(() {
        _errorMessage = 'Matricule inconnu ou non autorisé.';
        _isLoading = false;
      });
    }
  }

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
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Menu - Fonctionnalité à implémenter'),
              ),
            );
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Notifications - Fonctionnalité à implémenter'),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Paramètres - Fonctionnalité à implémenter'),
                ),
              );
            },
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
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
                  right: -10,
                  top: 10,
                  child: Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    child: const Text(
                      '...',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.green,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 40),
            const Text(
              'Please enter your',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const Text(
              'matricule below',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 30),
            TextField(
              controller: _matriculeController,
              decoration: InputDecoration(
                hintText: 'Type matricule here!',
                hintStyle: TextStyle(color: Colors.grey[400], fontSize: 16),
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 15,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: BorderSide(color: Colors.grey[300]!),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: BorderSide(color: Colors.grey[300]!),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: const BorderSide(color: Colors.green),
                ),
              ),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _isButtonEnabled && !_isLoading
                  ? () {
                      _authenticateMatricule();
                    }
                  : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                foregroundColor: Colors.white,
                disabledBackgroundColor: Colors.grey[300],
                disabledForegroundColor: Colors.grey[500],
                padding: const EdgeInsets.symmetric(
                  horizontal: 48,
                  vertical: 16,
                ),
                elevation: 2,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(30),
                ),
              ),
              child: _isLoading
                  ? const CircularProgressIndicator(
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    )
                  : const Text(
                      'Done',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
            ),
            if (_errorMessage != null) ...[
              const SizedBox(height: 10),
              Text(
                _errorMessage!,
                style: TextStyle(color: Colors.red, fontSize: 16),
              ),
            ],
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
          if (index == 1) {
            // Retourner à l'écran d'accueil (HomePage)
            Navigator.popUntil(context, (route) => route.isFirst);
          } else if (index == 0) {
            // Déjà sur l'écran de saisie du matricule
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Saisissez votre matricule pour continuer'),
                duration: Duration(seconds: 1),
              ),
            );
          } else if (index == 2) {
            // Favoris - à implémenter
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Favoris - Fonctionnalité à implémenter'),
              ),
            );
          }
        },
      ),
    );
  }
}
