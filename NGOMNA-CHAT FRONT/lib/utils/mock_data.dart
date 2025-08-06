/// Données mock centralisées pour l'application Ngomna Chat
/// Ce fichier contient toutes les données de test utilisées dans l'application

// Fonctions utilitaires pour la gestion des IDs de conversation
/// Normalise un conversationId venant du backend (String ou Map avec $oid)
String normalizeConversationId(dynamic convId) {
  if (convId == null) return '';
  if (convId is String) return convId;
  if (convId is Map && convId['\$oid'] != null) {
    return convId['\$oid'].toString();
  }
  return convId.toString();
}

/// Vérifie si deux IDs de conversation correspondent
bool conversationIdsMatch(dynamic id1, dynamic id2) {
  final normalizedId1 = normalizeConversationId(id1);
  final normalizedId2 = normalizeConversationId(id2);
  return normalizedId1.isNotEmpty &&
      normalizedId2.isNotEmpty &&
      normalizedId1 == normalizedId2;
}

/// Trouve une conversation par son ID de manière sécurisée
Map<String, dynamic> findConversationById(
  List<Map<String, dynamic>> conversations,
  String? convId,
) {
  if (convId == null || convId.isEmpty) return {};

  try {
    return conversations.firstWhere(
      (c) =>
          conversationIdsMatch(c['convId'], convId) ||
          conversationIdsMatch(c['_id'], convId),
      orElse: () => {},
    );
  } catch (e) {
    print('Erreur lors de la recherche de conversation: $e');
    return {};
  }
}

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

/// Mock data pour tous les membres du groupe (compatible avec groups_screen.dart)
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

/// Utilitaire pour trouver un utilisateur par matricule
Map<String, dynamic>? findUserByMatricule(String matricule) {
  for (final entry in userMapping.entries) {
    if (entry.value['matricule'] == matricule) {
      return entry.value;
    }
  }
  return null;
}

/// Valide le format d'un matricule
bool isValidMatriculeFormat(String matricule) {
  // Format accepté: lettres majuscules et chiffres uniquement
  return RegExp(r'^[A-Z0-9]+$').hasMatch(matricule);
}

/// Assure qu'une valeur est une liste, retourne une liste vide si ce n'est pas le cas
List<dynamic> ensureList(dynamic value) {
  if (value is List) {
    return value;
  }
  return <dynamic>[];
}

/// Extrait le nom approprié d'une conversation en fonction du userId connecté
/// Utilise les noms dans userMetadata pour les conversations privées
String getConversationDisplayName(
  Map<String, dynamic> conversation,
  String? currentUserId,
) {
  // Pour les groupes, utiliser le nom de la conversation
  if (conversation['type'] == 'GROUP' || conversation['isGroup'] == true) {
    return conversation['name']?.toString() ?? 'Groupe';
  }

  // Pour les conversations privées, chercher l'autre participant
  final userMetadata = ensureList(conversation['userMetadata']);

  if (userMetadata.isNotEmpty && currentUserId != null) {
    // Trouver l'autre participant (pas le currentUserId)
    for (final user in userMetadata) {
      if (user is Map && user['userId'] != currentUserId) {
        final name = user['name']?.toString();
        if (name != null && name.isNotEmpty) {
          return name;
        }
      }
    }
  }

  // Fallback sur le nom de la conversation
  return conversation['name']?.toString() ?? 'Conversation';
}

/// Exemple de conversation MongoDB pour les tests
const Map<String, dynamic> exampleConversation = {
  "_id": {"\$oid": "000051000052aaaaaaaaaaaa"},
  "name": "M. Louis Paul MOTAZE & Dr Madeleine TCHUINTE",
  "type": "PRIVATE",
  "participants": ["51", "52"],
  "createdBy": "51",
  "isActive": true,
  "isArchived": false,
  "userMetadata": [
    {
      "userId": "51",
      "name": "M. Louis Paul MOTAZE",
      "unreadCount": 0,
      "lastReadAt": null,
      "isMuted": false,
      "isPinned": false,
      "notificationSettings": {
        "enabled": true,
        "sound": true,
        "vibration": true,
      },
    },
    {
      "userId": "52",
      "name": "Dr Madeleine TCHUINTE",
      "unreadCount": 0,
      "lastReadAt": null,
      "isMuted": false,
      "isPinned": false,
      "notificationSettings": {
        "enabled": true,
        "sound": true,
        "vibration": true,
      },
    },
  ],
  "unreadCounts": {"51": 0, "52": 0},
  "lastMessage": {
    "content": "Hello",
    "type": "TEXT",
    "senderId": "51",
    "senderName": null,
    "timestamp": {"\$date": "2025-07-24T12:17:58.926Z"},
  },
  "lastMessageAt": {"\$date": "2025-07-24T12:17:58.926Z"},
  "settings": {},
  "metadata": {},
  "integrations": {},
  "updatedAt": {"\$date": "2025-07-24T12:17:58.926Z"},
};

/// Fonction de test pour vérifier l'extraction des noms
void testConversationDisplayNames() {
  print(
    'Test avec userId 51: ${getConversationDisplayName(exampleConversation, "51")}',
  );
  // Devrait afficher: "Dr Madeleine TCHUINTE"

  print(
    'Test avec userId 52: ${getConversationDisplayName(exampleConversation, "52")}',
  );
  // Devrait afficher: "M. Louis Paul MOTAZE"

  print(
    'Test avec userId inconnu: ${getConversationDisplayName(exampleConversation, "99")}',
  );
  // Devrait afficher: "M. Louis Paul MOTAZE & Dr Madeleine TCHUINTE"
}
