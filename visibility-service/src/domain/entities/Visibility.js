class Visibility {
  constructor({ entityId, entityType, visibilityLevel, updatedBy }) {
    this.entityId = entityId || "";
    this.entityType = entityType || "";
    this.visibilityLevel = visibilityLevel || "public";
    this.updatedBy = updatedBy || "";
  }

  validate() {
    if (!this.entityId || this.entityId.length > 100) {
      throw new Error("Entity ID must not exceed 100 characters");
    }
    if (!this.entityType || this.entityType.length > 50) {
      throw new Error("Entity type must not exceed 50 characters");
    }
    if (!["public", "private", "restricted"].includes(this.visibilityLevel)) {
      throw new Error("Invalid visibility level");
    }
  }
}

module.exports = Visibility;
