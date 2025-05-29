class Chat {
  constructor({ participants, messages }) {
    this.participants = participants || [];
    this.messages = messages || [];
  }

  validate() {
    if (this.participants.length < 2) {
      throw new Error("A chat must have at least two participants");
    }
    // Validation supplémentaire si nécessaire
  }
}

module.exports = Chat;
