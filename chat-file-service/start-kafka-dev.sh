#!/bin/bash

echo "🚀 DÉMARRAGE KAFKA POUR DÉVELOPPEMENT"
echo "===================================="

# Vérifier Java
if ! command -v java &> /dev/null; then
    echo "❌ Java non installé"
    echo "💡 Installer avec: sudo apt install openjdk-11-jdk"
    exit 1
fi

# Créer les répertoires si nécessaire
sudo mkdir -p /opt/kafka/logs /var/log/kafka
sudo chown -R $USER:$USER /opt/kafka/logs /var/log/kafka

# Arrêter les services existants
echo "🛑 Arrêt des services existants..."
pkill -f zookeeper 2>/dev/null || true
pkill -f kafka.Kafka 2>/dev/null || true
sleep 2

# Nettoyer les anciens logs
rm -rf /opt/kafka/logs/* /tmp/kafka-logs* /tmp/zookeeper*

# Démarrer Zookeeper
echo "🔄 Démarrage Zookeeper..."
nohup /opt/kafka/bin/zookeeper-server-start.sh /opt/kafka/config/zookeeper.properties > /tmp/zookeeper.log 2>&1 &
ZOOKEEPER_PID=$!
echo "   ✅ Zookeeper démarré (PID: $ZOOKEEPER_PID)"

# Attendre Zookeeper
echo "⏳ Attente Zookeeper (5s)..."
sleep 5

# Démarrer Kafka
echo "🔄 Démarrage Kafka..."
nohup /opt/kafka/bin/kafka-server-start.sh /opt/kafka/config/server.properties > /tmp/kafka.log 2>&1 &
KAFKA_PID=$!
echo "   ✅ Kafka démarré (PID: $KAFKA_PID)"

# Attendre Kafka
echo "⏳ Attente Kafka (15s)..."
sleep 15

# Tester la connexion
echo "🔌 Test de connexion..."
if /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092 &>/dev/null; then
    echo "   ✅ Kafka accessible"
    
    # Créer les topics
    echo "📋 Création des topics..."
    TOPICS=("chat.messages" "chat.files" "chat.notifications" "chat.events")
    
    for topic in "${TOPICS[@]}"; do
        if ! /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092 | grep -q "^${topic}$"; then
            /opt/kafka/bin/kafka-topics.sh --create --topic ${topic} --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1
            echo "   ✅ Topic ${topic} créé"
        else
            echo "   ℹ️  Topic ${topic} existe déjà"
        fi
    done
    
    echo ""
    echo "🎉 KAFKA OPÉRATIONNEL !"
    echo "📊 Topics disponibles:"
    /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092 | sed 's/^/   • /'
    echo ""
    echo "📋 Logs des services:"
    echo "   🔍 Zookeeper: tail -f /tmp/zookeeper.log"
    echo "   🔍 Kafka:     tail -f /tmp/kafka.log"
    echo ""
    echo "🚀 Vous pouvez maintenant démarrer votre application:"
    echo "   npm run dev"
    
else
    echo "   ❌ Impossible de se connecter à Kafka"
    echo "📋 Vérifiez les logs:"
    echo "   tail -f /tmp/zookeeper.log"
    echo "   tail -f /tmp/kafka.log"
    exit 1
fi
