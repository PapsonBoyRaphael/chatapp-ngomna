/**
 * HealthController - Contrôleur pour les vérifications de santé
 * Surveille l'état de tous les services (MongoDB, Redis, Kafka, WebSocket)
 */
class HealthController {
    constructor(redisClient = null, kafkaConfig = null) {
        this.redisClient = redisClient;
        this.kafkaConfig = kafkaConfig;
        this.startTime = new Date();
    }

    /**
     * Health check complet de tous les services
     */
    async getHealthStatus(req, res) {
        try {
            const healthData = {
                service: "CENADI Chat-File Service",
                version: "1.0.0",
                status: "healthy",
                timestamp: new Date().toISOString(),
                uptime: this.getUptime(),
                environment: process.env.NODE_ENV || 'development',
                services: await this.checkAllServices(),
                resources: await this.getResourceUsage(),
                endpoints: {
                    files: "/api/files",
                    messages: "/api/messages", 
                    conversations: "/api/conversations",
                    health: "/api/health"
                }
            };

            // Déterminer le statut global
            const allServicesHealthy = Object.values(healthData.services).every(
                service => service.status === 'healthy' || service.status === 'connected'
            );

            healthData.status = allServicesHealthy ? 'healthy' : 'degraded';

            res.status(allServicesHealthy ? 200 : 503).json({
                success: true,
                data: healthData
            });

        } catch (error) {
            console.error('❌ Erreur health check:', error);
            res.status(500).json({
                success: false,
                message: 'Erreur lors de la vérification de santé',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * État spécifique de MongoDB
     */
    async getMongoDBStatus(req, res) {
        try {
            const mongoStatus = await this.checkMongoDB();
            
            res.json({
                success: true,
                service: 'MongoDB',
                data: mongoStatus
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                service: 'MongoDB',
                message: 'Erreur MongoDB',
                error: error.message
            });
        }
    }

    /**
     * État spécifique de Redis
     */
    async getRedisStatus(req, res) {
        try {
            const redisStatus = await this.checkRedis();
            
            res.json({
                success: true,
                service: 'Redis',
                data: redisStatus
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                service: 'Redis', 
                message: 'Erreur Redis',
                error: error.message
            });
        }
    }

    /**
     * État spécifique de Kafka
     */
    async getKafkaStatus(req, res) {
        try {
            const kafkaStatus = await this.checkKafka();
            
            res.json({
                success: true,
                service: 'Kafka',
                data: kafkaStatus
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                service: 'Kafka',
                message: 'Erreur Kafka', 
                error: error.message
            });
        }
    }

    /**
     * Vérification de tous les services
     */
    async checkAllServices() {
        const services = {};

        // MongoDB
        try {
            services.mongodb = await this.checkMongoDB();
        } catch (error) {
            services.mongodb = {
                status: 'error',
                message: error.message,
                lastCheck: new Date().toISOString()
            };
        }

        // Redis
        try {
            services.redis = await this.checkRedis();
        } catch (error) {
            services.redis = {
                status: 'error',
                message: error.message,
                lastCheck: new Date().toISOString()
            };
        }

        // Kafka
        try {
            services.kafka = await this.checkKafka();
        } catch (error) {
            services.kafka = {
                status: 'error',
                message: error.message,
                lastCheck: new Date().toISOString()
            };
        }

        // WebSocket (basé sur l'état du serveur)
        services.websocket = {
            status: 'healthy',
            message: 'WebSocket server running',
            port: process.env.CHAT_FILE_SERVICE_PORT || 8003,
            lastCheck: new Date().toISOString()
        };

        return services;
    }

    /**
     * Vérification MongoDB
     */
    async checkMongoDB() {
        try {
            const mongoose = require('mongoose');
            
            if (mongoose.connection.readyState === 1) {
                // Tester une opération simple
                await mongoose.connection.db.admin().ping();
                
                return {
                    status: 'healthy',
                    message: 'MongoDB connecté et opérationnel',
                    readyState: mongoose.connection.readyState,
                    host: mongoose.connection.host,
                    name: mongoose.connection.name,
                    lastCheck: new Date().toISOString()
                };
            } else {
                return {
                    status: 'error',
                    message: 'MongoDB non connecté',
                    readyState: mongoose.connection.readyState,
                    lastCheck: new Date().toISOString()
                };
            }

        } catch (error) {
            return {
                status: 'error',
                message: `Erreur MongoDB: ${error.message}`,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Vérification Redis
     */
    async checkRedis() {
        try {
            if (!this.redisClient) {
                return {
                    status: 'disabled',
                    message: 'Redis non configuré - Mode développement',
                    lastCheck: new Date().toISOString()
                };
            }

            // Tester une opération Redis
            const testKey = 'health_check_' + Date.now();
            await this.redisClient.set(testKey, 'ok', 'EX', 10);
            const result = await this.redisClient.get(testKey);
            await this.redisClient.del(testKey);

            if (result === 'ok') {
                return {
                    status: 'healthy',
                    message: 'Redis connecté et opérationnel',
                    connected: true,
                    lastCheck: new Date().toISOString()
                };
            } else {
                return {
                    status: 'error',
                    message: 'Redis: test de lecture/écriture échoué',
                    lastCheck: new Date().toISOString()
                };
            }

        } catch (error) {
            return {
                status: 'error',
                message: `Erreur Redis: ${error.message}`,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Vérification Kafka
     */
    async checkKafka() {
        try {
            if (!this.kafkaConfig) {
                return {
                    status: 'disabled',
                    message: 'Kafka non configuré - Mode développement',
                    lastCheck: new Date().toISOString()
                };
            }

            // Utiliser la méthode de health check du kafkaConfig
            if (typeof this.kafkaConfig.getHealthStatus === 'function') {
                const kafkaHealth = await this.kafkaConfig.getHealthStatus();
                return {
                    status: 'healthy',
                    message: 'Kafka connecté et opérationnel',
                    details: kafkaHealth,
                    lastCheck: new Date().toISOString()
                };
            } else {
                return {
                    status: 'healthy',
                    message: 'Kafka configuré',
                    lastCheck: new Date().toISOString()
                };
            }

        } catch (error) {
            return {
                status: 'error',
                message: `Erreur Kafka: ${error.message}`,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Calculer l'uptime
     */
    getUptime() {
        const uptimeMs = Date.now() - this.startTime.getTime();
        const uptimeSeconds = Math.floor(uptimeMs / 1000);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;

        return {
            ms: uptimeMs,
            seconds: uptimeSeconds,
            human: `${hours}h ${minutes}m ${seconds}s`,
            startTime: this.startTime.toISOString()
        };
    }

    /**
     * Obtenir l'usage des ressources système
     */
    async getResourceUsage() {
        try {
            const used = process.memoryUsage();
            
            return {
                memory: {
                    rss: this.formatBytes(used.rss),
                    heapTotal: this.formatBytes(used.heapTotal),
                    heapUsed: this.formatBytes(used.heapUsed),
                    external: this.formatBytes(used.external)
                },
                cpu: {
                    uptime: process.uptime(),
                    loadAverage: process.platform === 'linux' ? require('os').loadavg() : null
                },
                node: {
                    version: process.version,
                    platform: process.platform,
                    arch: process.arch
                }
            };

        } catch (error) {
            return {
                error: `Impossible d'obtenir les ressources: ${error.message}`
            };
        }
    }

    /**
     * Formater les bytes en format lisible
     */
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * Health check rapide pour load balancer
     */
    async quickHealthCheck(req, res) {
        try {
            // Vérification rapide MongoDB seulement
            const mongoose = require('mongoose');
            
            if (mongoose.connection.readyState === 1) {
                res.status(200).json({
                    status: 'ok',
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(503).json({
                    status: 'error',
                    message: 'Database unavailable'
                });
            }

        } catch (error) {
            res.status(503).json({
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * Métriques Prometheus-style (optionnel)
     */
    async getMetrics(req, res) {
        try {
            const uptime = this.getUptime();
            const memory = process.memoryUsage();
            
            const metrics = [
                `# HELP nodejs_process_uptime_seconds Process uptime in seconds`,
                `# TYPE nodejs_process_uptime_seconds counter`,
                `nodejs_process_uptime_seconds ${uptime.seconds}`,
                ``,
                `# HELP nodejs_heap_used_bytes Heap used in bytes`,
                `# TYPE nodejs_heap_used_bytes gauge`,
                `nodejs_heap_used_bytes ${memory.heapUsed}`,
                ``,
                `# HELP nodejs_heap_total_bytes Heap total in bytes`,
                `# TYPE nodejs_heap_total_bytes gauge`, 
                `nodejs_heap_total_bytes ${memory.heapTotal}`,
                ``
            ].join('\n');

            res.set('Content-Type', 'text/plain');
            res.send(metrics);

        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Erreur génération métriques',
                error: error.message
            });
        }
    }
}

module.exports = HealthController;
