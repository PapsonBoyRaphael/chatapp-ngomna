/// Données mock centralisées pour l'application Ngomna Chat
/// Ce fichier contient toutes les données de test utilisées dans l'application

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
