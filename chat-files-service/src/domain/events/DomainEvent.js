/**
 * Classe de base pour tous les événements de domaine
 * CENADI Chat-Files-Service
 */

const { v4: uuidv4 } = require('uuid');

class DomainEvent {
  constructor(data = {}) {
    this.id = uuidv4();
    this.occurredAt = new Date();
    this.version = '1.0';
    this.aggregateId = data.aggregateId;
    this.aggregateType = data.aggregateType;
    this.eventType = this.constructor.name;
    this.data = data;
    this.metadata = {
      userId: data.userId,
      source: 'chat-files-service',
      correlationId: data.correlationId,
      causationId: data.causationId,
      ...data.metadata
    };
  }

  toJSON() {
    return {
      id: this.id,
      eventType: this.eventType,
      occurredAt: this.occurredAt,
      version: this.version,
      aggregateId: this.aggregateId,
      aggregateType: this.aggregateType,
      data: this.data,
      metadata: this.metadata
    };
  }

  static fromJSON(json) {
    const event = new this(json.data);
    event.id = json.id;
    event.occurredAt = new Date(json.occurredAt);
    event.version = json.version;
    event.aggregateId = json.aggregateId;
    event.aggregateType = json.aggregateType;
    event.metadata = json.metadata;
    return event;
  }
}

module.exports = DomainEvent;
