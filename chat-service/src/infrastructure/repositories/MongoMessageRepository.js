const Message = require("../mongodb/models/MessageModel");

class MongoMessageRepository {
  async saveMessage(messageData) {
    const message = new Message(messageData);
    return await message.save();
  }

  async getMessagesByConversation(participants) {
    return await Message.find({
      $or: [
        { senderId: participants[0], receiverId: participants[1] },
        { senderId: participants[1], receiverId: participants[0] },
      ],
    }).sort({ createdAt: 1 });
  }
}

module.exports = MongoMessageRepository;
