const { EventEmitter } = require("events");

// ─── ÉTATS D'UNE SESSION ──────────────────────────────────────────────────────
const SESSION_STATES = {
  PENDING: "PENDING",       // Session créée, pas encore démarrée
  RUNNING: "RUNNING",       // Export en cours
  PAUSED: "PAUSED",         // Suspendu par l'utilisateur
  CANCELLED: "CANCELLED",   // Annulé par l'utilisateur
  COMPLETED: "COMPLETED",   // Terminé avec succès
  FAILED: "FAILED",         // Échoué (erreur non récupérable)
};

/**
 * BackupSessionManager
 * ─────────────────────
 * Gère le cycle de vie des sessions de backup en temps réel.
 *
 * Chaque session est identifiée par un sessionId unique et associée à un userId.
 * Un userId ne peut avoir qu'une seule session RUNNING ou PAUSED à la fois.
 *
 * Le manager émet des événements Socket.IO vers le client via l'instance io :
 *   backup:progress  → progression en temps réel (% conversations, messages)
 *   backup:paused    → session suspendue
 *   backup:resumed   → session reprise
 *   backup:cancelled → session annulée
 *   backup:completed → backup terminé avec succès (objectPath, stats)
 *   backup:failed    → erreur lors du backup
 *   backup:error     → erreur de commande (ex: session introuvable)
 *
 * Dépendances :
 *   @param {import('../application/use-cases/ExportConversationBackup')} exportUseCase
 *   @param {import('socket.io').Server} io
 */
class BackupSessionManager extends EventEmitter {
  /**
   * @param {import('../application/use-cases/ExportConversationBackup')} exportUseCase
   * @param {import('socket.io').Server} io
   */
  constructor(exportUseCase, io) {
    super();

    this.exportUseCase = exportUseCase;
    this.io = io;

    /**
     * Map des sessions actives.
     * sessionId → SessionObject
     *
     * @type {Map<string, SessionObject>}
     */
    this.sessions = new Map();

    /**
     * Index userId → sessionId (session active ou pausée)
     * Permet de garantir une session unique par user.
     *
     * @type {Map<string, string>}
     */
    this.userSessionIndex = new Map();

    console.log("✅ BackupSessionManager initialisé");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API PUBLIQUE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Démarre une nouvelle session de backup pour un utilisateur.
   * Si une session est déjà RUNNING ou PAUSED, renvoie une erreur.
   *
   * @param {string} userId
   * @param {object} [options]
   * @param {string} [options.conversationId] - limiter à une seule conversation
   * @param {string} [options.label]          - étiquette libre
   * @param {string} [options.socketId]       - socket du demandeur (pour les émissions ciblées)
   * @returns {{ sessionId: string, state: string, startedAt: string }}
   */
  startSession(userId, options = {}) {
    const userIdStr = String(userId);

    // Vérifier si une session active existe
    const existingSessionId = this.userSessionIndex.get(userIdStr);
    if (existingSessionId) {
      const existing = this.sessions.get(existingSessionId);
      if (
        existing &&
        [SESSION_STATES.RUNNING, SESSION_STATES.PAUSED].includes(existing.state)
      ) {
        throw new Error(
          `Une session de backup est déjà en cours (id=${existingSessionId}, état=${existing.state}). Annulez-la avant d'en créer une nouvelle.`
        );
      }
    }

    const sessionId = this._generateSessionId(userIdStr);
    const now = new Date();

    /** @type {SessionObject} */
    const session = {
      sessionId,
      userId: userIdStr,
      state: SESSION_STATES.PENDING,
      options: { ...options },
      socketId: options.socketId || null,

      // Progression
      progress: {
        conversationsTotal: 0,
        conversationsLoaded: 0,
        messagesTotal: 0,
        messagesLoaded: 0,
        percentage: 0,
        currentStep: "init",
      },

      // Contrôle asynchrone
      _pauseSignal: false,
      _cancelSignal: false,
      _resolveWhenResumed: null,

      // Résultat final
      result: null,
      error: null,

      // Timestamps
      startedAt: now.toISOString(),
      pausedAt: null,
      resumedAt: null,
      cancelledAt: null,
      completedAt: null,
    };

    this.sessions.set(sessionId, session);
    this.userSessionIndex.set(userIdStr, sessionId);

    console.log(
      `🟢 BackupSessionManager: session PENDING créée → sessionId=${sessionId} | userId=${userIdStr}`
    );

    // Lancer l'export de manière asynchrone (non-bloquant)
    this._runExport(session);

    return {
      sessionId,
      state: SESSION_STATES.PENDING,
      startedAt: session.startedAt,
    };
  }

  /**
   * Suspend une session RUNNING.
   *
   * @param {string} userId
   * @returns {{ sessionId: string, state: string, pausedAt: string }}
   */
  suspendSession(userId) {
    const session = this._getActiveSession(userId);

    if (session.state !== SESSION_STATES.RUNNING) {
      throw new Error(
        `Impossible de suspendre : la session est en état "${session.state}" (attendu: RUNNING)`
      );
    }

    session._pauseSignal = true;
    session.state = SESSION_STATES.PAUSED;
    session.pausedAt = new Date().toISOString();

    console.log(
      `⏸️  BackupSessionManager: session PAUSED → sessionId=${session.sessionId}`
    );

    this._emitToSession(session, "backup:paused", {
      sessionId: session.sessionId,
      state: session.state,
      pausedAt: session.pausedAt,
      progress: session.progress,
    });

    return {
      sessionId: session.sessionId,
      state: session.state,
      pausedAt: session.pausedAt,
    };
  }

  /**
   * Reprend une session PAUSED.
   *
   * @param {string} userId
   * @returns {{ sessionId: string, state: string, resumedAt: string }}
   */
  resumeSession(userId) {
    const session = this._getActiveSession(userId);

    if (session.state !== SESSION_STATES.PAUSED) {
      throw new Error(
        `Impossible de reprendre : la session est en état "${session.state}" (attendu: PAUSED)`
      );
    }

    session._pauseSignal = false;
    session.state = SESSION_STATES.RUNNING;
    session.resumedAt = new Date().toISOString();

    // Débloquer le promise de pause
    if (session._resolveWhenResumed) {
      session._resolveWhenResumed();
      session._resolveWhenResumed = null;
    }

    console.log(
      `▶️  BackupSessionManager: session RESUMED → sessionId=${session.sessionId}`
    );

    this._emitToSession(session, "backup:resumed", {
      sessionId: session.sessionId,
      state: session.state,
      resumedAt: session.resumedAt,
      progress: session.progress,
    });

    return {
      sessionId: session.sessionId,
      state: session.state,
      resumedAt: session.resumedAt,
    };
  }

  /**
   * Annule une session RUNNING ou PAUSED.
   *
   * @param {string} userId
   * @returns {{ sessionId: string, state: string, cancelledAt: string }}
   */
  cancelSession(userId) {
    const session = this._getActiveSession(userId);

    if (
      ![SESSION_STATES.RUNNING, SESSION_STATES.PAUSED, SESSION_STATES.PENDING].includes(
        session.state
      )
    ) {
      throw new Error(
        `Impossible d'annuler : la session est en état "${session.state}"`
      );
    }

    session._cancelSignal = true;
    session._pauseSignal = false; // Débloquer si en pause pour qu'elle se cancelle
    session.state = SESSION_STATES.CANCELLED;
    session.cancelledAt = new Date().toISOString();

    // Débloquer la pause pour permettre l'arrêt propre
    if (session._resolveWhenResumed) {
      session._resolveWhenResumed();
      session._resolveWhenResumed = null;
    }

    // Nettoyer l'index user
    this.userSessionIndex.delete(String(userId));

    console.log(
      `🚫 BackupSessionManager: session CANCELLED → sessionId=${session.sessionId}`
    );

    this._emitToSession(session, "backup:cancelled", {
      sessionId: session.sessionId,
      state: session.state,
      cancelledAt: session.cancelledAt,
      progress: session.progress,
    });

    return {
      sessionId: session.sessionId,
      state: session.state,
      cancelledAt: session.cancelledAt,
    };
  }

  /**
   * Retourne l'état courant d'une session pour un userId.
   *
   * @param {string} userId
   * @returns {object|null}
   */
  getSessionStatus(userId) {
    const sessionId = this.userSessionIndex.get(String(userId));
    if (!sessionId) return null;

    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return this._toPublicSession(session);
  }

  /**
   * Met à jour le socketId d'un user (utile à la reconnexion).
   *
   * @param {string} userId
   * @param {string} socketId
   */
  updateSocketId(userId, socketId) {
    const sessionId = this.userSessionIndex.get(String(userId));
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (session) {
      session.socketId = socketId;
      console.log(
        `🔄 BackupSessionManager: socketId mis à jour → sessionId=${sessionId} | socketId=${socketId}`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MOTEUR D'EXPORT (avec support pause/cancel)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Exécute l'export de manière asynchrone.
   * Vérifie les signaux pause/cancel entre chaque étape clé.
   *
   * @param {SessionObject} session
   */
  async _runExport(session) {
    try {
      session.state = SESSION_STATES.RUNNING;
      this._emitProgress(session, "Chargement des conversations...", 0);

      // ─── ÉTAPE 1 : Charger les conversations ────────────────────────────
      session.progress.currentStep = "loading_conversations";

      const ConversationModel = require("../mongodb/models/ConversationModel");
      const userIdStr = session.userId;
      const userIdVariants = [
        userIdStr,
        isNaN(userIdStr) ? userIdStr : Number(userIdStr),
      ].filter((v, i, arr) => arr.indexOf(v) === i);

      const convFilter = { participants: { $in: userIdVariants } };
      if (session.options.conversationId) {
        convFilter._id = session.options.conversationId;
      }

      const conversations = await ConversationModel.find(convFilter)
        .lean()
        .sort({ lastMessageAt: -1 });

      session.progress.conversationsTotal = conversations.length;
      session.progress.conversationsLoaded = conversations.length;
      this._emitProgress(
        session,
        `${conversations.length} conversations chargées`,
        15
      );

      // ─── Vérification signal après étape 1 ─────────────────────────────
      await this._checkSignals(session);
      if (session.state === SESSION_STATES.CANCELLED) return;

      // ─── ÉTAPE 2 : Charger les messages par batch ────────────────────────
      session.progress.currentStep = "loading_messages";
      const MessageModel = require("../mongodb/models/MessageModel");
      const conversationIds = conversations.map((c) => c._id);
      const allMessages = [];
      const BATCH = 1000;
      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        // Vérification signal avant chaque batch
        await this._checkSignals(session);
        if (session.state === SESSION_STATES.CANCELLED) return;

        const batch = await MessageModel.find({
          conversationId: { $in: conversationIds },
        })
          .lean()
          .sort({ createdAt: 1 })
          .skip(skip)
          .limit(BATCH);

        if (batch.length === 0) {
          hasMore = false;
        } else {
          allMessages.push(...batch);
          skip += batch.length;
          if (batch.length < BATCH) hasMore = false;

          session.progress.messagesLoaded = allMessages.length;
          const msgPct = Math.min(
            80,
            15 + Math.round((allMessages.length / Math.max(allMessages.length + BATCH, 1)) * 65)
          );
          this._emitProgress(
            session,
            `${allMessages.length} messages chargés...`,
            msgPct
          );
        }
      }

      session.progress.messagesTotal = allMessages.length;

      // ─── Vérification signal après chargement messages ──────────────────
      await this._checkSignals(session);
      if (session.state === SESSION_STATES.CANCELLED) return;

      // ─── ÉTAPE 3 : Créer le ZIP et uploader sur MinIO ───────────────────
      session.progress.currentStep = "compressing";
      this._emitProgress(session, "Compression et upload MinIO...", 85);

      const meta = {
        userId: userIdStr,
        label: session.options.label || "socket-backup",
        sessionId: session.sessionId,
      };

      const result = await this.exportUseCase.backupService.createBackup(
        conversations,
        allMessages,
        meta,
        { userIdScope: userIdStr }
      );

      // ─── ÉTAPE 4 : Succès ────────────────────────────────────────────────
      session.state = SESSION_STATES.COMPLETED;
      session.result = result;
      session.completedAt = new Date().toISOString();
      session.progress.percentage = 100;
      session.progress.currentStep = "done";

      this.userSessionIndex.delete(userIdStr);

      console.log(
        `✅ BackupSessionManager: session COMPLETED → sessionId=${session.sessionId} | path=${result.objectPath}`
      );

      this._emitToSession(session, "backup:completed", {
        sessionId: session.sessionId,
        state: session.state,
        completedAt: session.completedAt,
        result: {
          objectPath: result.objectPath,
          bucket: result.bucket,
          size: result.size,
          checksum: result.checksum,
          stats: result.stats,
        },
      });
    } catch (err) {
      if (session.state === SESSION_STATES.CANCELLED) {
        // Normal — l'annulation a causé l'interruption
        return;
      }

      session.state = SESSION_STATES.FAILED;
      session.error = err.message;
      this.userSessionIndex.delete(session.userId);

      console.error(
        `❌ BackupSessionManager: session FAILED → sessionId=${session.sessionId}:`,
        err.message
      );

      this._emitToSession(session, "backup:failed", {
        sessionId: session.sessionId,
        state: session.state,
        error: err.message,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITAIRES INTERNES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Vérifie les signaux pause/cancel.
   * Si pause : bloque jusqu'à la reprise (via Promise + resolve).
   * Si cancel : retourne immédiatement.
   *
   * @param {SessionObject} session
   */
  async _checkSignals(session) {
    if (session._cancelSignal) return;

    if (session._pauseSignal) {
      console.log(
        `⏸️  BackupSessionManager: pause détectée → sessionId=${session.sessionId}`
      );
      // Attendre jusqu'à la reprise ou l'annulation
      await new Promise((resolve) => {
        session._resolveWhenResumed = resolve;
      });
    }
  }

  /**
   * Émet un événement de progression vers le client.
   */
  _emitProgress(session, message, percentage) {
    session.progress.percentage = Math.max(
      session.progress.percentage,
      percentage
    );

    this._emitToSession(session, "backup:progress", {
      sessionId: session.sessionId,
      state: session.state,
      progress: {
        ...session.progress,
        message,
      },
    });
  }

  /**
   * Émet un événement Socket.IO vers le socket du user propriétaire de la session.
   */
  _emitToSession(session, event, data) {
    if (!this.io) return;

    // Émettre vers le socket spécifique si disponible
    if (session.socketId) {
      this.io.to(session.socketId).emit(event, data);
    } else {
      // Fallback : émettre vers la room userId (si le user a rejoint sa propre room)
      this.io.to(`user:${session.userId}`).emit(event, data);
    }
  }

  /**
   * Récupère la session active (RUNNING ou PAUSED) d'un userId.
   * Lève une erreur si aucune session active n'existe.
   */
  _getActiveSession(userId) {
    const userIdStr = String(userId);
    const sessionId = this.userSessionIndex.get(userIdStr);

    if (!sessionId) {
      throw new Error(
        `Aucune session de backup active pour l'utilisateur ${userIdStr}`
      );
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.userSessionIndex.delete(userIdStr);
      throw new Error(`Session ${sessionId} introuvable`);
    }

    return session;
  }

  /**
   * Génère un sessionId unique.
   */
  _generateSessionId(userId) {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    return `backup_${userId}_${ts}_${rand}`;
  }

  /**
   * Retourne une vue publique (safe) d'une session.
   */
  _toPublicSession(session) {
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      state: session.state,
      progress: session.progress,
      startedAt: session.startedAt,
      pausedAt: session.pausedAt,
      resumedAt: session.resumedAt,
      cancelledAt: session.cancelledAt,
      completedAt: session.completedAt,
      result: session.result
        ? {
            objectPath: session.result.objectPath,
            bucket: session.result.bucket,
            size: session.result.size,
            stats: session.result.stats,
          }
        : null,
      error: session.error,
    };
  }
}

// Exporter les états aussi pour que le chatHandler puisse y référer si besoin
BackupSessionManager.STATES = SESSION_STATES;

module.exports = BackupSessionManager;
