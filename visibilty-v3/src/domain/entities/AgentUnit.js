const Rank = require('../value-objects/Rank');

/**
 * AgentUnit Entity
 * 
 * Represents the relationship between an agent and a unit
 */
class AgentUnit {
  constructor({
    matricule,
    unitId,
    rank,
    attachedAt = new Date()
  }) {
    this.matricule = this.validateMatricule(matricule);
    this.unitId = this.validateUnitId(unitId);
    this.rank = new Rank(rank);
    this.attachedAt = attachedAt;
  }

  validateMatricule(matricule) {
    if (!matricule || typeof matricule !== 'string') {
      throw new Error('Matricule must be a non-empty string');
    }
    const pattern = /^[0-9]{6}[A-Z]$/;
    if (!pattern.test(matricule.toUpperCase())) {
      throw new Error('Invalid matricule format');
    }
    return matricule.toUpperCase();
  }

  validateUnitId(unitId) {
    if (!unitId || typeof unitId !== 'string') {
      throw new Error('Unit ID must be a non-empty string');
    }
    return unitId.trim();
  }

  toJSON() {
    return {
      matricule: this.matricule,
      unitId: this.unitId,
      rank: this.rank.toJSON(),
      attachedAt: this.attachedAt.toISOString()
    };
  }
}

module.exports = AgentUnit;