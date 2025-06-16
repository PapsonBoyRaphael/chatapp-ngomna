const jwt = require('jsonwebtoken');

/**
 * Gestionnaire WebSocket pour le chat en temps réel avec validation JWT locale
 */
function chatHandler(io, redisClient, ...useCases) {
    console.log('🔌 Configuration du gestionnaire WebSocket avec validation locale');

    // Middleware d'authentification pour WebSocket
    io.use(async (socket, next) => {
        try {
            // Récupérer le token depuis l'auth ou les headers
            let token = socket.handshake.auth?.token;
            
            if (!token) {
                // Essayer depuis les headers
                const authHeader = socket.handshake.headers.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    token = authHeader.substring(7);
                }
            }
            
            if (!token) {
                console.log('❌ Connexion refusée : token manquant');
                return next(new Error('Token manquant'));
            }

            // **VALIDATION LOCALE DU TOKEN JWT**
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'votre_secret_jwt_dev');
            
            // Ajouter les infos utilisateur au socket
            socket.userId = decoded.id || decoded.userId;
            socket.userRole = decoded.role;
            socket.userName = decoded.nom || decoded.name;
            socket.userMatricule = decoded.matricule;
            
            console.log(`✅ Utilisateur authentifié: ${socket.userName} (${socket.userId})`);
            next();
            
        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                console.log('❌ Token JWT invalide:', error.message);
                next(new Error('Token invalide'));
            } else if (error.name === 'TokenExpiredError') {
                console.log('❌ Token JWT expiré');
                next(new Error('Token expiré'));
            } else {
                console.log('❌ Erreur authentification WebSocket:', error.message);
                next(new Error('Erreur d\'authentification'));
            }
        }
    });

    // Événements de connexion
    io.on('connection', (socket) => {
        const serverId = process.env.SERVER_ID || 'chat-file-1';
        console.log(`🔌 Utilisateur connecté: ${socket.userName} (${socket.id}) sur ${serverId}`);

        // Rejoindre une room personnelle pour les notifications
        socket.join(`user_${socket.userId}`);

        // Événement de connexion d'un utilisateur à une conversation
        socket.on('join_conversation', async (data) => {
            try {
                const { conversationId } = data;
                
                if (!conversationId) {
                    socket.emit('error', { message: 'ID de conversation requis' });
                    return;
                }

                // Rejoindre la room de la conversation
                socket.join(`conversation_${conversationId}`);
                socket.currentConversation = conversationId;
                
                console.log(`👥 ${socket.userName} a rejoint la conversation ${conversationId}`);
                
                // Notifier les autres participants
                socket.to(`conversation_${conversationId}`).emit('user_joined', {
                    userId: socket.userId,
                    userName: socket.userName,
                    conversationId
                });

            } catch (error) {
                console.error('❌ Erreur join_conversation:', error);
                socket.emit('error', { message: 'Erreur lors de la connexion à la conversation' });
            }
        });

        // Événement d'envoi de message
        socket.on('send_message', async (data) => {
            try {
                const { conversationId, content, type = 'TEXT' } = data;
                
                if (!conversationId || !content) {
                    socket.emit('error', { message: 'Données de message incomplètes' });
                    return;
                }

                // Créer le message avec les infos du socket
                const messageData = {
                    conversationId,
                    senderId: socket.userId,
                    senderName: socket.userName,
                    content,
                    type,
                    timestamp: new Date()
                };

                // Diffuser le message à tous les participants de la conversation
                io.to(`conversation_${conversationId}`).emit('new_message', {
                    id: Date.now(), // Remplacer par l'ID réel du message
                    ...messageData,
                    status: 'sent'
                });

                console.log(`💬 Message envoyé par ${socket.userName} dans ${conversationId}`);

            } catch (error) {
                console.error('❌ Erreur send_message:', error);
                socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
            }
        });

        // Événement de frappe (typing indicator)
        socket.on('typing', (data) => {
            const { conversationId, isTyping } = data;
            
            if (conversationId) {
                socket.to(`conversation_${conversationId}`).emit('user_typing', {
                    userId: socket.userId,
                    userName: socket.userName,
                    isTyping,
                    conversationId
                });
            }
        });

        // Événement de déconnexion d'une conversation
        socket.on('leave_conversation', (data) => {
            const { conversationId } = data;
            
            if (conversationId && socket.currentConversation === conversationId) {
                socket.leave(`conversation_${conversationId}`);
                socket.currentConversation = null;
                
                // Notifier les autres participants
                socket.to(`conversation_${conversationId}`).emit('user_left', {
                    userId: socket.userId,
                    userName: socket.userName,
                    conversationId
                });
                
                console.log(`👋 ${socket.userName} a quitté la conversation ${conversationId}`);
            }
        });

        // Événement de déconnexion
        socket.on('disconnect', (reason) => {
            console.log(`🔌 Utilisateur déconnecté: ${socket.userName} (${socket.id}) - Raison: ${reason}`);
            
            // Notifier les conversations que l'utilisateur a quittées
            if (socket.currentConversation) {
                socket.to(`conversation_${socket.currentConversation}`).emit('user_left', {
                    userId: socket.userId,
                    userName: socket.userName,
                    conversationId: socket.currentConversation
                });
            }
        });

        // Événement d'erreur
        socket.on('error', (error) => {
            console.error(`❌ Erreur WebSocket pour ${socket.userName}:`, error);
        });

        // Confirmer la connexion
        socket.emit('connected', {
            message: 'Connexion WebSocket établie',
            userId: socket.userId,
            userName: socket.userName,
            serverId
        });
    });

    console.log('✅ Gestionnaire WebSocket configuré avec validation locale JWT');
}

module.exports = chatHandler;
