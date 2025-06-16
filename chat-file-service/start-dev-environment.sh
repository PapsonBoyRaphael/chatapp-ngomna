#!/bin/bash

echo "🚀 DÉMARRAGE ENVIRONNEMENT DÉVELOPPEMENT CENADI"
echo "================================================"

# Variables
SERVICES_OK=true
KAFKA_RUNNING=false
REDIS_RUNNING=false

# Fonction de vérification des services
check_service() {
    local service=$1
    local port=$2
    local name=$3
    
    if netstat -tln 2>/dev/null | grep -q ":$port " || ss -tln 2>/dev/null | grep -q ":$port "; then
        echo "✅ $name actif (port $port)"
        return 0
    else
        echo "❌ $name inactif (port $port)"
        return 1
    fi
}

# Vérifier Java (requis pour Kafka)
if ! command -v java &> /dev/null; then
    echo "⚠️ Java non installé, installation..."
    sudo apt update && sudo apt install -y openjdk-11-jdk
fi

echo "🔍 Vérification des services..."

# MongoDB
if check_service mongodb 27017 "MongoDB"; then
    true
else
    echo "🔄 Démarrage MongoDB..."
    sudo systemctl start mongod 2>/dev/null || echo "⚠️ Impossible de démarrer MongoDB"
fi

# Redis
if check_service redis 6379 "Redis"; then
    REDIS_RUNNING=true
else
    echo "🔄 Démarrage Redis..."
    sudo systemctl start redis-server 2>/dev/null || redis-server --daemonize yes 2>/dev/null || echo "⚠️ Redis non disponible"
    sleep 2
    if check_service redis 6379 "Redis"; then
        REDIS_RUNNING=true
    fi
fi

# Kafka/Zookeeper
if check_service zookeeper 2181 "Zookeeper" && check_service kafka 9092 "Kafka"; then
    KAFKA_RUNNING=true
else
    if [ -d "/opt/kafka" ]; then
        echo "🔄 Démarrage Kafka..."
        
        # Arrêter les services existants
        pkill -f zookeeper 2>/dev/null || true
        pkill -f kafka.Kafka 2>/dev/null || true
        sleep 2
        
        # Nettoyer les logs
        rm -rf /opt/kafka/logs/* /tmp/kafka-logs* /tmp/zookeeper* 2>/dev/null || true
        
        # Créer les répertoires
        sudo mkdir -p /opt/kafka/logs /var/log/kafka
        sudo chown -R $USER:$USER /opt/kafka/logs /var/log/kafka
        
        # Démarrer Zookeeper
        nohup /opt/kafka/bin/zookeeper-server-start.sh /opt/kafka/config/zookeeper.properties > /tmp/zookeeper.log 2>&1 &
        sleep 5
        
        # Démarrer Kafka
        nohup /opt/kafka/bin/kafka-server-start.sh /opt/kafka/config/server.properties > /tmp/kafka.log 2>&1 &
        sleep 15
        
        # Vérifier
        if check_service kafka 9092 "Kafka"; then
            KAFKA_RUNNING=true
            
            # Créer les topics
            echo "📋 Création des topics..."
            TOPICS=("chat.messages" "chat.files" "chat.notifications" "chat.events")
            
            for topic in "${TOPICS[@]}"; do
                if ! /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092 2>/dev/null | grep -q "^${topic}$"; then
                    /opt/kafka/bin/kafka-topics.sh --create --topic ${topic} --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1 2>/dev/null
                    echo "   ✅ Topic ${topic} créé"
                else
                    echo "   ℹ️ Topic ${topic} existe déjà"
                fi
            done
        fi
    else
        echo "⚠️ Kafka non installé"
    fi
fi

echo ""
echo "📊 RÉSUMÉ DES SERVICES:"
echo "========================"
check_service mongodb 27017 "MongoDB" || SERVICES_OK=false
check_service redis 6379 "Redis" || echo "⚠️ Redis en mode fallback"
check_service kafka 9092 "Kafka" || echo "⚠️ Kafka en mode fallback"

echo ""
if [ "$SERVICES_OK" = true ]; then
    echo "🎉 Environnement prêt !"
else
    echo "⚠️ Certains services ne sont pas disponibles"
    echo "💡 L'application peut fonctionner en mode dégradé"
fi

echo ""
echo "🚀 Démarrage de l'application..."
echo "   Commande: npm run dev"
echo ""
echo "📋 Logs disponibles:"
[ -f /tmp/zookeeper.log ] && echo "   🔍 Zookeeper: tail -f /tmp/zookeeper.log"
[ -f /tmp/kafka.log ] && echo "   🔍 Kafka: tail -f /tmp/kafka.log"
echo ""
echo "🔧 Commandes utiles:"
echo "   �� Health check: curl http://localhost:8003/health"
echo "   🛑 Arrêter: pkill -f 'kafka|zookeeper'"
