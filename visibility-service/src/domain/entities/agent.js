class Agent {
  constructor({ id, agt_id, matricule, nom, prenom, sexe, mmnaissance, aanaissance, lieunaissance, ministere, created_at }) {
    this.id = id;
    this.agt_id = agt_id;
    this.matricule = matricule;
    this.nom = nom;
    this.prenom = prenom;
    this.sexe = sexe;
    this.mmnaissance = mmnaissance;
    this.aanaissance = aanaissance;
    this.lieunaissance = lieunaissance;
    this.ministere = ministere;
    this.created_at = created_at;
  }
}

module.exports = Agent;