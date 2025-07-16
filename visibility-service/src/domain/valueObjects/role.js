const { ROLE_HIERARCHY, ROLE_EQUIVALENCIES } = require('../../config/roleHierarchy');

class Role {
  constructor(roleName) {
    if (!ROLE_HIERARCHY[roleName] && !Object.values(ROLE_EQUIVALENCIES).flat().includes(roleName)) {
      throw new Error(`Invalid role: ${roleName}`);
    }
    this.name = roleName;
  }

  getRank() {
    if (ROLE_HIERARCHY[this.name]) {
      return ROLE_HIERARCHY[this.name];
    }
    const canonicalRole = Object.keys(ROLE_EQUIVALENCIES).find(
      (key) => ROLE_EQUIVALENCIES[key].includes(this.name)
    );
    return canonicalRole ? ROLE_HIERARCHY[canonicalRole] : 0;
  }
}

module.exports = Role;