/**
 * Date Helper Utility - Chat Files Service
 * CENADI Chat-Files-Service
 * Utilitaires pour manipulation et formatage des dates
 */

const { createLogger } = require('./logger');

const logger = createLogger('DateHelper');

class DateHelper {
  // === FORMATAGE ===

  // Formater une date en ISO string
  static toISOString(date = new Date()) {
    return new Date(date).toISOString();
  }

  // Formater une date lisible (français)
  static toReadableString(date = new Date(), options = {}) {
    const defaultOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris'
    };

    return new Date(date).toLocaleDateString('fr-FR', {
      ...defaultOptions,
      ...options
    });
  }

  // Formater une date courte
  static toShortString(date = new Date()) {
    return new Date(date).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  // Formater l'heure
  static toTimeString(date = new Date()) {
    return new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  // Formater une durée relative (ex: "il y a 2 heures")
  static toRelativeString(date) {
    const now = new Date();
    const target = new Date(date);
    const diffMs = now - target;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    if (diffSec < 60) return 'À l\'instant';
    if (diffMin < 60) return `Il y a ${diffMin} minute${diffMin > 1 ? 's' : ''}`;
    if (diffHour < 24) return `Il y a ${diffHour} heure${diffHour > 1 ? 's' : ''}`;
    if (diffDay < 7) return `Il y a ${diffDay} jour${diffDay > 1 ? 's' : ''}`;
    if (diffWeek < 4) return `Il y a ${diffWeek} semaine${diffWeek > 1 ? 's' : ''}`;
    if (diffMonth < 12) return `Il y a ${diffMonth} mois`;
    return `Il y a ${diffYear} an${diffYear > 1 ? 's' : ''}`;
  }

  // === CALCULS ===

  // Ajouter du temps à une date
  static addTime(date, amount, unit = 'days') {
    const result = new Date(date);
    
    switch (unit) {
      case 'milliseconds':
        result.setMilliseconds(result.getMilliseconds() + amount);
        break;
      case 'seconds':
        result.setSeconds(result.getSeconds() + amount);
        break;
      case 'minutes':
        result.setMinutes(result.getMinutes() + amount);
        break;
      case 'hours':
        result.setHours(result.getHours() + amount);
        break;
      case 'days':
        result.setDate(result.getDate() + amount);
        break;
      case 'weeks':
        result.setDate(result.getDate() + (amount * 7));
        break;
      case 'months':
        result.setMonth(result.getMonth() + amount);
        break;
      case 'years':
        result.setFullYear(result.getFullYear() + amount);
        break;
      default:
        throw new Error(`Unité de temps invalide: ${unit}`);
    }
    
    return result;
  }

  // Soustraire du temps d'une date
  static subtractTime(date, amount, unit = 'days') {
    return this.addTime(date, -amount, unit);
  }

  // Calculer la différence entre deux dates
  static diffInMs(date1, date2 = new Date()) {
    return Math.abs(new Date(date1) - new Date(date2));
  }

  static diffInSeconds(date1, date2 = new Date()) {
    return Math.floor(this.diffInMs(date1, date2) / 1000);
  }

  static diffInMinutes(date1, date2 = new Date()) {
    return Math.floor(this.diffInSeconds(date1, date2) / 60);
  }

  static diffInHours(date1, date2 = new Date()) {
    return Math.floor(this.diffInMinutes(date1, date2) / 60);
  }

  static diffInDays(date1, date2 = new Date()) {
    return Math.floor(this.diffInHours(date1, date2) / 24);
  }

  // === VALIDATION ===

  // Vérifier si une date est valide
  static isValid(date) {
    const d = new Date(date);
    return d instanceof Date && !isNaN(d);
  }

  // Vérifier si une date est dans le futur
  static isFuture(date) {
    return new Date(date) > new Date();
  }

  // Vérifier si une date est dans le passé
  static isPast(date) {
    return new Date(date) < new Date();
  }

  // Vérifier si une date est aujourd'hui
  static isToday(date) {
    const today = new Date();
    const target = new Date(date);
    
    return today.getDate() === target.getDate() &&
           today.getMonth() === target.getMonth() &&
           today.getFullYear() === target.getFullYear();
  }

  // Vérifier si une date est expirée
  static isExpired(expirationDate) {
    return new Date(expirationDate) <= new Date();
  }

  // === UTILITAIRES SPÉCIFIQUES AU SERVICE ===

  // Créer une date d'expiration pour un partage
  static createShareExpiration(daysFromNow = 7) {
    return this.addTime(new Date(), daysFromNow, 'days');
  }

  // Vérifier si un partage est expiré
  static isShareExpired(shareData) {
    if (!shareData.expiresAt) return false;
    return this.isExpired(shareData.expiresAt);
  }

  // Calculer le temps restant avant expiration
  static timeUntilExpiration(expirationDate) {
    if (this.isExpired(expirationDate)) {
      return null;
    }

    const diffMs = new Date(expirationDate) - new Date();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return { days, hours, minutes, totalMs: diffMs };
  }

  // === PLAGES DE DATES ===

  // Début de la journée
  static startOfDay(date = new Date()) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  // Fin de la journée
  static endOfDay(date = new Date()) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  // Début de la semaine (lundi)
  static startOfWeek(date = new Date()) {
    const result = new Date(date);
    const day = result.getDay();
    const diff = day === 0 ? 6 : day - 1; // Lundi = 0
    result.setDate(result.getDate() - diff);
    return this.startOfDay(result);
  }

  // Début du mois
  static startOfMonth(date = new Date()) {
    const result = new Date(date);
    result.setDate(1);
    return this.startOfDay(result);
  }

  // Fin du mois
  static endOfMonth(date = new Date()) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + 1, 0);
    return this.endOfDay(result);
  }

  // === PARSING ===

  // Parser une date depuis différents formats
  static parseDate(dateInput) {
    if (!dateInput) return null;

    // Si c'est déjà une date
    if (dateInput instanceof Date) {
      return this.isValid(dateInput) ? dateInput : null;
    }

    // Si c'est un timestamp
    if (typeof dateInput === 'number') {
      return new Date(dateInput);
    }

    // Si c'est une chaîne
    if (typeof dateInput === 'string') {
      // ISO string
      if (dateInput.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        return new Date(dateInput);
      }

      // Format français DD/MM/YYYY
      if (dateInput.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = dateInput.split('/');
        return new Date(year, month - 1, day);
      }

      // Format YYYY-MM-DD
      if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return new Date(dateInput + 'T00:00:00.000Z');
      }

      // Essayer le parsing par défaut
      const parsed = new Date(dateInput);
      return this.isValid(parsed) ? parsed : null;
    }

    return null;
  }

  // === FUSEAUX HORAIRES ===

  // Convertir en UTC
  static toUTC(date = new Date()) {
    const utcDate = new Date(date);
    utcDate.setTime(utcDate.getTime() + (utcDate.getTimezoneOffset() * 60000));
    return utcDate;
  }

  // Convertir depuis UTC vers timezone locale
  static fromUTC(utcDate, timezone = 'Europe/Paris') {
    return new Date(utcDate).toLocaleString('fr-FR', {
      timeZone: timezone
    });
  }

  // === FORMATAGE POUR API ===

  // Formater pour réponse API
  static toAPIFormat(date) {
    return {
      iso: this.toISOString(date),
      readable: this.toReadableString(date),
      relative: this.toRelativeString(date),
      timestamp: new Date(date).getTime()
    };
  }

  // === LOGGING SPÉCIALISÉ ===

  // Logger une opération avec timestamp
  static logOperation(operation, metadata = {}) {
    logger.info(`🕒 ${operation}`, {
      timestamp: this.toISOString(),
      operation,
      ...metadata
    });
  }

  // === UTILITAIRES DE CACHE ===

  // Générer une clé de cache basée sur la date
  static generateCacheKey(prefix, date = new Date(), granularity = 'hour') {
    const d = new Date(date);
    
    switch (granularity) {
      case 'minute':
        return `${prefix}:${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
      case 'hour':
        return `${prefix}:${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
      case 'day':
        return `${prefix}:${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      default:
        return `${prefix}:${this.toISOString(d)}`;
    }
  }

  // === CONSTANTES UTILES ===

  static get MILLISECONDS_PER_SECOND() { return 1000; }
  static get SECONDS_PER_MINUTE() { return 60; }
  static get MINUTES_PER_HOUR() { return 60; }
  static get HOURS_PER_DAY() { return 24; }
  static get DAYS_PER_WEEK() { return 7; }
  static get DAYS_PER_MONTH() { return 30; } // Approximation
  static get DAYS_PER_YEAR() { return 365; } // Approximation

  static get MS_PER_MINUTE() { 
    return this.MILLISECONDS_PER_SECOND * this.SECONDS_PER_MINUTE; 
  }
  
  static get MS_PER_HOUR() { 
    return this.MS_PER_MINUTE * this.MINUTES_PER_HOUR; 
  }
  
  static get MS_PER_DAY() { 
    return this.MS_PER_HOUR * this.HOURS_PER_DAY; 
  }
}

module.exports = DateHelper;
