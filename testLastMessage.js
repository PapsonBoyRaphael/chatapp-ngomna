const path = require("path");
const mongoose = require(
  path.join(__dirname, "chat-file-service/node_modules/mongoose"),
);
const Conversation = require("./chat-file-service/src/infrastructure/mongodb/models/ConversationModel");

async function testLastMessageUpdate() {
  try {
    // Connexion à MongoDB
    await mongoose.connect("mongodb://localhost:27017/chatapp", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ Connecté à MongoDB");

    // Trouver une conversation existante
    const conversation = await Conversation.findOne({ type: "PRIVATE" });
    if (!conversation) {
      console.log("❌ Aucune conversation trouvée");
      return;
    }

    console.log("📋 Conversation trouvée:", {
      id: conversation._id,
      name: conversation.name,
      lastMessage: conversation.lastMessage,
      participants: conversation.participants,
    });

    // Simuler la mise à jour du lastMessage
    const newMessageData = {
      content: `Test message ${Date.now()}`,
      timestamp: new Date(),
      senderId: conversation.participants[0],
      messageId: new mongoose.Types.ObjectId(),
    };

    console.log("🔄 Mise à jour du lastMessage...");
    const updated = await Conversation.findByIdAndUpdate(
      conversation._id,
      {
        $set: {
          lastMessage: {
            _id: newMessageData.messageId,
            content: newMessageData.content,
            type: "TEXT",
            senderId: newMessageData.senderId,
            senderName: null,
            timestamp: newMessageData.timestamp,
          },
          lastMessageAt: newMessageData.timestamp,
          updatedAt: new Date(),
        },
      },
      { new: true },
    );

    console.log("✅ LastMessage mis à jour:", {
      id: updated._id,
      lastMessage: updated.lastMessage,
      lastMessageAt: updated.lastMessageAt,
    });
  } catch (error) {
    console.error("❌ Erreur:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Déconnecté de MongoDB");
  }
}

testLastMessageUpdate();
