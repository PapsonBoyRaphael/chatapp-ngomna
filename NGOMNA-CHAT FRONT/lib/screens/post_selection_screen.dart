import 'package:flutter/material.dart';
// ...existing code...
import '../main.dart';
import 'chat_list_screen.dart';

const Map<String, Map<String, dynamic>> userMapping = {
  'M. Louis Paul MOTAZE': {
    'id': '51',
    'matricule': '151703A',
    'nom': 'M. Louis Paul MOTAZE',
  },
  'Dr Madeleine TCHUINTE': {
    'id': '52',
    'matricule': '565939D',
    'nom': 'Dr Madeleine TCHUINTE',
  },
  'M. MESSANGA ETOUNDI Serge Ulrich': {
    'id': '53',
    'matricule': '671633X',
    'nom': 'M. MESSANGA ETOUNDI Serge Ulrich',
  },
  'M. NLEME AKONO Patrick': {
    'id': '54',
    'matricule': '601376Y',
    'nom': 'M. NLEME AKONO Patrick',
  },
  'Mme YECKE ENDALE Berthe épse EKO EKO': {
    'id': '55',
    'matricule': '567265M',
    'nom': 'Mme YECKE ENDALE Berthe épse EKO EKO',
  },
  'Pr MBARGA BINDZI Marie Alain': {
    'id': '56',
    'matricule': '547865Q',
    'nom': 'Pr MBARGA BINDZI Marie Alain',
  },
  'M. NSONGAN ETUNG Joseph': {
    'id': '57',
    'matricule': '546513Q',
    'nom': 'M. NSONGAN ETUNG Joseph',
  },
  'M. SOUTH SOUTH Ruben': {
    'id': '58',
    'matricule': '680875L',
    'nom': 'M. SOUTH SOUTH Ruben',
  },
  'M. ABENA MVEME Innocent Paul': {
    'id': '59',
    'matricule': 'X007',
    'nom': 'M. ABENA MVEME Innocent Paul',
  },
  'Mme GOMA Flore': {'id': '60', 'matricule': 'X008', 'nom': 'Mme GOMA Flore'},
  'M. EPIE NGENE Goddy': {
    'id': '61',
    'matricule': 'X009',
    'nom': 'M. EPIE NGENE Goddy',
  },
  'Mme TCHUENTE FOGUEM GERMAINE épse BAHANAG': {
    'id': '62',
    'matricule': 'X010',
    'nom': 'Mme TCHUENTE FOGUEM GERMAINE épse BAHANAG',
  },
  'Pr MVEH Chantal Marguerite': {
    'id': '63',
    'matricule': 'X011',
    'nom': 'Pr MVEH Chantal Marguerite',
  },
};

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
  }

  @override
  void dispose() {
    _matriculeController.dispose();
    super.dispose();
  }

  Future<void> _authenticateMatricule() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    final matricule = _matriculeController.text.trim();
    // Sélection des données mock
    final userEntry = userMapping.entries.firstWhere(
      (entry) => entry.value['matricule'] == matricule,
      orElse: () => MapEntry('', {}),
    );
    if (userEntry.key.isNotEmpty) {
      final userData = userEntry.value;
      // Lancer l'événement Socket.IO 'authenticate' avec les données mock
      globalSocket.emit('authenticate', {
        'userId': userData['id'],
        'matricule': userData['matricule'],
        'nom': userData['nom'],
        // Ajoutez d'autres champs si besoin
      });
      // Navigation vers la liste des chats
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => ChatListScreen(
            matricule: userData['matricule'],
            userId: userData['id'] as String?,
          ),
        ),
      );
      setState(() {
        _isLoading = false;
      });
      return;
    } else {
      setState(() {
        _errorMessage = 'Matricule inconnu ou non autorisé.';
        _isLoading = false;
      });
      return;
    }
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
      ),
    );
  }
}
