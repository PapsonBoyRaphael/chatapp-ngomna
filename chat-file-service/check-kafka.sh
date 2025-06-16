#!/bin/bash

echo "🔍 VÉRIFICATION INSTALLATION KAFKA"
echo "=================================="

# 1. Vérifier l'installation
echo "📁 1. Vérification des fichiers..."
if [ -d "/opt/kafka" ]; then
    echo "   ✅ Répertoire /opt/kafka existe"
    echo "   📋 Binaires disponibles: $(ls /opt/kafka/bin/kafka*.sh | wc -l)"
else
    echo "   ❌ Kafka non installé dans /opt/kafka"
    exit 1
fi

# 2. Vérifier Java (requis pour Kafka)
echo ""
echo "☕ 2. Vérification Java..."
if command -v java &> /dev/null; then
    echo "   ✅ Java installé: $(java -version 2>&1 | head -1)"
else
    echo "   ❌ Java non installé (requis pour Kafka)"
    echo "   💡 Installer avec: sudo apt install openjdk-11-jdk"
    exit 1
fi

# 3. Vérifier les processus
echo ""
echo "🔄 3. Vérification des processus..."
ZOOKEEPER_PID=$(pgrep -f zookeeper 2>/dev/null)
KAFKA_PID=$(pgrep -f kafka.Kafka 2>/dev/null)

if [ ! -z "$ZOOKEEPER_PID" ]; then
    echo "   ✅ Zookeeper en cours d'exécution (PID: $ZOOKEEPER_PID)"
else
    echo "   ❌ Zookeeper non démarré"
fi

if [ ! -z "$KAFKA_PID" ]; then
    echo "   ✅ Kafka en cours d'exécution (PID: $KAFKA_PID)"
else
    echo "   ❌ Kafka non démarré"
fi

# 4. Vérifier les ports
echo ""
echo "🌐 4. Vérification des ports..."
if netstat -tlnp 2>/dev/null | grep -q ":2181" || ss -tlnp 2>/dev/null | grep -q ":2181"; then
    echo "   ✅ Port 2181 (Zookeeper) ouvert"
else
    echo "   ❌ Port 2181 (Zookeeper) fermé"
fi

if netstat -tlnp 2>/dev/null | grep -q ":9092" || ss -tlnp 2>/dev/null | grep -q ":9092"; then
    echo "   ✅ Port 9092 (Kafka) ouvert"
else
    echo "   ❌ Port 9092 (Kafka) fermé"
fi

# 5. Test de connexion Kafka (si en cours d'exécution)
echo ""
echo "🔌 5. Test de connexion..."
if [ ! -z "$KAFKA_PID" ]; then
    echo "   🔄 Test de connexion à Kafka..."
    if timeout 10 /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092 &>/dev/null; then
        echo "   ✅ Connexion Kafka réussie"
        echo "   📋 Topics existants:"
        /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092 | sed 's/^/      /'
    else
        echo "   ❌ Impossible de se connecter à Kafka"
    fi
else
    echo "   ⚠️  Kafka non démarré, impossible de tester la connexion"
fi

# 6. Résumé et recommandations
echo ""
echo "📊 RÉSUMÉ:"
echo "   Installation : ✅ OK"
echo "   Java         : $(command -v java &> /dev/null && echo "✅ OK" || echo "❌ KO")"
echo "   Zookeeper    : $([ ! -z "$ZOOKEEPER_PID" ] && echo "✅ Démarré" || echo "❌ Arrêté")"
echo "   Kafka        : $([ ! -z "$KAFKA_PID" ] && echo "✅ Démarré" || echo "❌ Arrêté")"

if [ ! -z "$KAFKA_PID" ] && timeout 10 /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092 &>/dev/null; then
    echo "   Statut       : ✅ OPÉRATIONNEL"
    echo ""
    echo "🎉 Kafka est prêt ! Vous pouvez redémarrer votre application."
else
    echo "   Statut       : ❌ NON OPÉRATIONNEL"
    echo ""
    echo "💡 PROCHAINES ÉTAPES:"
    if [ -z "$ZOOKEEPER_PID" ]; then
        echo "   1. Démarrer Zookeeper:"
        echo "      nohup /opt/kafka/bin/zookeeper-server-start.sh /opt/kafka/config/zookeeper.properties > /tmp/zookeeper.log 2>&1 &"
    fi
    if [ -z "$KAFKA_PID" ]; then
        echo "   2. Démarrer Kafka:"
        echo "      nohup /opt/kafka/bin/kafka-server-start.sh /opt/kafka/config/server.properties > /tmp/kafka.log 2>&1 &"
    fi
    echo "   3. Redémarrer l'application:"
    echo "      npm run dev"
fi
