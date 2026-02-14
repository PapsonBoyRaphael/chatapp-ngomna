#!/bin/bash

echo "🚀 DÉMARRAGE ENVIRONNEMENT DÉVELOPPEMENT CENADI"
echo "================================================"

# Variables
SERVICES_OK=true
REDIS_RUNNING=false
MINIO_RUNNING=false

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

# ✅ KAFKA OPTIONNEL - NE PAS DÉMARRER AUTOMATIQUEMENT
echo ""
echo "⚠️  Kafka non démarré automatiquement"
echo "💡 Pour démarrer Kafka manuellement:"
echo "   ./start-kafka-dev.sh"
echo ""

# MinIO
if check_service minio 9000 "MinIO"; then
    MINIO_RUNNING=true
else
    echo "🔄 Démarrage MinIO..."
    # Vérifier si MinIO est installé
    if command -v minio &> /dev/null; then
        # Définir le répertoire MinIO dans le home
        MINIO_DATA_DIR="./storage/minio-data"
        echo "📁 Création du répertoire MinIO: $MINIO_DATA_DIR"
        
        # Créer le répertoire
        mkdir -p $MINIO_DATA_DIR
        chmod 755 $MINIO_DATA_DIR
        
        # Vérifier que le répertoire a été créé
        if [ -d "$MINIO_DATA_DIR" ]; then
            echo "✅ Répertoire MinIO créé: $MINIO_DATA_DIR"
        else
            echo "❌ Erreur: impossible de créer $MINIO_DATA_DIR"
            exit 1
        fi
        
        # Démarrer MinIO
        echo "🚀 Démarrage de MinIO..."
        nohup minio server $MINIO_DATA_DIR --console-address ":9001" > /tmp/minio.log 2>&1 &
        sleep 3
        if check_service minio 9000 "MinIO"; then
            MINIO_RUNNING=true
            echo "   ✅ MinIO démarré avec succès"
            echo "   🌐 Console MinIO: http://localhost:9001"
        else
            echo "   ❌ Échec du démarrage de MinIO"
            echo "   🔍 Vérifiez les logs: tail -f /tmp/minio.log"
        fi
    else
        echo "⚠️ MinIO non installé. Pour l'installer:"
        echo "   wget https://dl.min.io/server/minio/release/linux-amd64/minio"
        echo "   chmod +x minio"
        echo "   sudo mv minio /usr/local/bin/"
    fi
fi

echo ""
echo "📊 RÉSUMÉ DES SERVICES:"
echo "========================"
check_service mongodb 27017 "MongoDB" || SERVICES_OK=false
check_service redis 6379 "Redis" || echo "⚠️ Redis en mode fallback"
echo "⚠️  Kafka      - Non démarré (optionnel)"
check_service minio 9000 "MinIO" || echo "⚠️ MinIO en mode fallback"

echo ""
if [ "$SERVICES_OK" = true ] && [ "$MINIO_RUNNING" = true ]; then
    echo "🎉 Environnement de base prêt !"
else
    echo "⚠️ Certains services ne sont pas disponibles"
    echo "💡 L'application peut fonctionner en mode dégradé"
fi

echo ""
echo "🚀 Pour démarrer l'application:"
echo "   npm run dev"
echo ""
echo "📋 Logs disponibles:"
[ -f /tmp/minio.log ] && echo "   🔍 MinIO: tail -f /tmp/minio.log"
echo ""
echo "🔧 Commandes utiles:"
echo "   ❤️ Health check: curl http://localhost:8003/health"
echo "   🌐 Console MinIO: http://localhost:9001"
echo "   📨 Démarrer Kafka: ./start-kafka-dev.sh"
echo "   🛑 Arrêter Kafka: pkill -f 'kafka|zookeeper'"
echo "   🛑 Arrêter MinIO: pkill -f minio"