// src/infrastructure/kafka/consumers/ThumbnailQueueConsumer.js
class ThumbnailQueueConsumer {
  constructor(kafkaInstance, thumbnailService, fileRepository) {
    this.kafka = kafkaInstance;
    this.thumbnailService = thumbnailService;
    this.fileRepository = fileRepository; // Pour update status en Mongo
    this.consumer = null;
    this.maxRetries = 3;
    this.metrics = { processed: 0, errors: 0, retries: 0 };
  }

  async start() {
    this.consumer = this.kafka.consumer({
      groupId: "thumbnail-generation-group",
    });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: "generate_thumbnails",
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const msg = JSON.parse(message.value.toString());
          console.log(
            `📥 Reçu job thumbnail: fileId=${msg.fileId}, mimeType=${msg.mimeType}`
          );

          // Télécharge fichier pour processing (via buffer pour mémoire)
          const originalBuffer =
            await this.thumbnailService.downloadImageForProcessing(
              msg.originalPath
            );

          // Génère thumbnails
          const thumbnails = await this.thumbnailService.generateThumbnails(
            originalBuffer,
            msg.originalName,
            msg.fileId
          );

          // Update Mongo avec thumbnails
          await this.fileRepository.updateThumbnails(msg.fileId, thumbnails);

          this.metrics.processed++;
          console.log(`✅ Thumbnails générés pour fileId=${msg.fileId}`);
        } catch (error) {
          this.metrics.errors++;
          console.error(`❌ Erreur job thumbnail: ${error.message}`);
          // Retry logic
          if (message.headers.retryCount < this.maxRetries) {
            this.metrics.retries++;
            await this.kafka.producer.send({
              topic,
              messages: [
                {
                  value: message.value,
                  headers: {
                    retryCount: (message.headers.retryCount || 0) + 1,
                  },
                },
              ],
            });
          } else {
            await this.fileRepository.markThumbnailProcessingFailed(
              msg.fileId,
              error
            );
          }
        }
      },
    });

    console.log("ThumbnailQueueConsumer démarré");
  }

  async stop() {
    await this.consumer?.stop();
    await this.consumer?.disconnect();
  }

  getMetrics() {
    return this.metrics;
  }
}

module.exports = ThumbnailQueueConsumer;
