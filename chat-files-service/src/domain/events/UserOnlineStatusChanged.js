/**
 * Événement : Statut en ligne de l'utilisateur changé
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class UserOnlineStatusChanged extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.userId,
      aggregateType: 'User',
      userId: data.userId,
      isOnline: data.isOnline,
      previousStatus: data.previousStatus,
      changedAt: data.changedAt || new Date(),
      ...data
    });
  }

  getUserId() {
    return this.data.userId;
  }

  isOnline() {
    return this.data.isOnline;
  }

  getPreviousStatus() {
    return this.data.previousStatus;
  }

  getChangedAt() {
    return this.data.changedAt;
  }

  wentOnline() {
    return this.data.isOnline && !this.data.previousStatus;
  }

  wentOffline() {
    return !this.data.isOnline && this.data.previousStatus;
  }
}

module.exports = UserOnlineStatusChanged;
