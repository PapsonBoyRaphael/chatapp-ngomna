/**
 * Notification Consumer - Chat File Service
 * Consumer pour traiter les notifications
 */

class NotificationConsumer {
  constructor(kafkaConsumer, io) {
    this.consumer = kafkaConsumer;
    this.io = io; // Socket.IO instance
  }

  async start() {
    try {
      await this.consumer.subscribe({ 
        topics: ['chat.notifications'],
        fromBeginning: false 
      });

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const notification = JSON.parse(message.value.toString());
            await this.handleNotification(notification);
          } catch (error) {
            console.error('❌ Erreur traitement notification:', error);
          }
        },
      });

      console.log('✅ Consumer notifications démarré');
    } catch (error) {
      console.error('❌ Erreur démarrage consumer notifications:', error);
    }
  }

  async handleNotification(notification) {
    try {
      const { type, userId, data } = notification;

      switch (type) {
        case 'message.received':
          this.io.to(userId).emit('notification', {
            type: 'message',
            title: 'Nouveau message',
            message: `Nouveau message de ${data.senderName}`,
            data
          });
          break;

        case 'file.shared':
          this.io.to(userId).emit('notification', {
            type: 'file',
            title: 'Fichier partagé',
            message: `${data.fileName} a été partagé avec vous`,
            data
          });
          break;

        default:
          console.log(`Type notification non géré: ${type}`);
      }
    } catch (error) {
      console.error('❌ Erreur gestion notification:', error);
    }
  }
}

module.exports = NotificationConsumer;
