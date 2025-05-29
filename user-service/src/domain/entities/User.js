class User {
  constructor({
    username,
    bio,
    email,
    phoneNumber,
    role,
    status,
    profilePicture,
    isVerify,
    mongoId,
  }) {
    this.username = username || "";
    this.bio = bio || "";
    this.email = email || "";
    this.phoneNumber = phoneNumber || "";
    this.role = role || "user";
    this.status = status || "";
    this.profilePicture = profilePicture || {
      public_id: "",
      url: "",
      width: 0,
      height: 0,
      format: "",
    };
    this.isVerify = isVerify || false;
    this.mongoId = mongoId || "";
  }

  validate() {
    if (
      !this.username ||
      this.username.length < 3 ||
      this.username.length > 50
    ) {
      throw new Error("Username must be 3-50 characters");
    }
    if (this.bio && this.bio.length > 500) {
      throw new Error("Bio cannot exceed 500 characters");
    }
    if (this.email && !/^\S+@\S+\.\S+$/.test(this.email)) {
      throw new Error("Invalid email");
    }
    if (this.phoneNumber && !/^\+?[1-9]\d{1,14}$/.test(this.phoneNumber)) {
      throw new Error("Invalid phone number");
    }
    if (!["user", "admin"].includes(this.role)) {
      throw new Error("Role must be user or admin");
    }
  }
}

module.exports = User;
