/**
 * Unit Entity
 * 
 * Represents an organizational unit in the hierarchy
 */
class Unit {
  constructor({
    id,
    name,
    acronyme,
    type,
    parentId = null
  }) {
    this.id = this.validateId(id);
    this.name = this.validateName(name);
    this.acronyme = acronyme || '';
    this.type = this.validateType(type);
    this.parentId = parentId;
  }

  validateId(id) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Unit ID must be a non-empty string');
    }
    return id.trim();
  }

  validateName(name) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Unit name must be a non-empty string');
    }
    return name.trim();
  }

  validateType(type) {
    const validTypes = [
      'Ministere', 'Secretariat_Particulier', 'Conseillers_Techniques',
      'Inspection_Generale', 'Secretariat_General', 'Direction',
      'Sous_Direction', 'Division', 'Service', 'Bureau', 'Cellule',
      'Services_Exterieurs', 'Organismes_Rattaches'
    ];
    
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid unit type: ${type}`);
    }
    
    return type;
  }

  getDisplayName() {
    return this.acronyme ? `${this.name} (${this.acronyme})` : this.name;
  }

  isMinistry() {
    return this.type === 'Ministere';
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      acronyme: this.acronyme,
      type: this.type,
      parentId: this.parentId,
      displayName: this.getDisplayName()
    };
  }
}

module.exports = Unit;