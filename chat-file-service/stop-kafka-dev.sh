#!/bin/bash

echo "🛑 ARRÊT KAFKA"
echo "=============="

# Arrêter Kafka
echo "🔌 Arrêt de Kafka..."
pkill -f kafka.Kafka 2>/dev/null && echo "   ✅ Kafka arrêté" || echo "   ⚠️  Kafka n'était pas en cours"

# Arrêter Zookeeper
echo "🔌 Arrêt de Zookeeper..."
pkill -f zookeeper 2>/dev/null && echo "   ✅ Zookeeper arrêté" || echo "   ⚠️  Zookeeper n'était pas en cours"

sleep 2

# Nettoyer les logs
echo "🧹 Nettoyage des logs..."
rm -rf /tmp/kafka-logs* /tmp/zookeeper* 2>/dev/null

echo ""
echo "✅ Kafka arrêté proprement"