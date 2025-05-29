class Group {
  constructor({ name, description, members, admins, profilePic }) {
    this.name = name || "";
    this.description = description || "";
    this.members = members || [];
    this.admins = admins || [];
    this.profilePic = profilePic || {
      public_id: "",
      url: "",
      width: 0,
      height: 0,
      format: "",
    };
  }

  validate() {
    if (!this.name || this.name.length < 3 || this.name.length > 50) {
      throw new Error("Group name must be 3-50 characters");
    }
    if (this.description && this.description.length > 500) {
      throw new Error("Description cannot exceed 500 characters");
    }
    if (this.members.length === 0) {
      throw new Error("Group must have at least one member");
    }
    if (this.admins.length === 0) {
      throw new Error("Group must have at least one admin");
    }
  }
}

module.exports = Group;
