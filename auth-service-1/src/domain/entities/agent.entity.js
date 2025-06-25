class Agent {
  constructor({ matricule, nom, prenom, sexe, mmnaissance, aanaissance, lieunaissance, ministere, rang }) {
    this.matricule = matricule;
    this.nom = nom;
    this.prenom = prenom;
    this.sexe = sexe;
    this.mmnaissance = mmnaissance;
    this.aanaissance = aanaissance;
    this.lieunaissance = lieunaissance;
    this.ministere = ministere;
    this.rang = rang;
  }
}

module.exports = Agent;
// This class represents an Agent entity with properties such as matricule, nom, prenom, sexe, etc.
// It is used to encapsulate the data and behavior related to an agent in the system.