#!/bin/bash

# Script de démarrage de l'environnement de développement CENADI
# Fusionné avec le gestionnaire de services CHATAPP

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables globales
SERVICES_OK=true
REDIS_RUNNING=false
MINIO_RUNNING=false

# Configuration des services applicatifs
declare -A APP_SERVICES=(
    ["auth-user-service"]="npm run dev:8001:auth-user-service"
    ["chat-file-service"]="npm run dev:full:8003:chat-file-service"
    ["gateway"]="npm run dev:8000:gateway"
)

# Fonction pour afficher les messages
print_message() {
    echo -e "${2}${1}${NC}"
}

# Fonction de vérification des services système
check_service() {
    local service=$1
    local port=$2
    local name=$3
    
    if netstat -tln 2>/dev/null | grep -q ":$port " || ss -tln 2>/dev/null | grep -q ":$port "; then
        print_message "✅ $name actif (port $port)" $GREEN
        return 0
    else
        print_message "❌ $name inactif (port $port)" $RED
        return 1
    fi
}

# Fonction pour vérifier si un port est utilisé
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Fonction pour démarrer un service applicatif
start_app_service() {
    local service_name=$1
    local command=$(echo $2 | cut -d: -f1)
    local port=$(echo $2 | cut -d: -f2)
    local directory=$3
    
    print_message "\n🚀 Démarrage de $service_name..." $BLUE
    
    if check_port $port; then
        print_message "⚠️  Le port $port est déjà utilisé." $YELLOW
        read -p "Voulez-vous continuer quand même? (o/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Oo]$ ]]; then
            print_message "❌ Démarrage de $service_name annulé" $RED
            return 1
        fi
    fi
    
    cd "$directory"
    
    if command -v gnome-terminal &> /dev/null; then
        gnome-terminal -- bash -c "cd '$PWD' && $command; exec bash" 2>/dev/null
    elif command -v xterm &> /dev/null; then
        xterm -e "cd '$PWD' && $command; exec bash" &
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        osascript -e "tell application \"Terminal\" to do script \"cd '$PWD' && $command\"" 2>/dev/null
    else
        $command > "../logs/$service_name.log" 2>&1 &
        print_message "ℹ️  Service démarré en arrière-plan, logs dans logs/$service_name.log" $YELLOW
    fi
    
    cd - > /dev/null
    
    print_message "✅ $service_name démarré (port $port)" $GREEN
    return 0
}

# Fonction pour démarrer les services système
start_system_services() {
    print_message "\n🔍 Vérification des services système..." $BLUE
    
    # MongoDB
    if ! check_service mongodb 27017 "MongoDB"; then
        print_message "🔄 Démarrage MongoDB..." $YELLOW
        sudo systemctl start mongod 2>/dev/null || print_message "⚠️ Impossible de démarrer MongoDB" $RED
    fi
    
    # PostgreSQL
    print_message "🔄 Démarrage PostgreSQL..." $BLUE
    sudo systemctl start postgresql 2>/dev/null || print_message "⚠️ Impossible de démarrer MongoDB" $RED
    
    
    # Redis
    if ! check_service redis 6379 "Redis"; then
        print_message "🔄 Démarrage Redis..." $YELLOW
        sudo systemctl start redis-server 2>/dev/null || redis-server --daemonize yes 2>/dev/null
        if check_service redis 6379 "Redis" 2>/dev/null; then
            REDIS_RUNNING=true
        fi
    else
        REDIS_RUNNING=true
    fi
    
    # MinIO
    if ! check_service minio 9000 "MinIO"; then
        print_message "🔄 Démarrage MinIO..." $YELLOW
        
        if command -v minio &> /dev/null; then
            MINIO_DATA_DIR="./storage/minio-data"
            print_message "📁 Création du répertoire MinIO: $MINIO_DATA_DIR" $BLUE
            
            mkdir -p $MINIO_DATA_DIR
            chmod 755 $MINIO_DATA_DIR
            
            if [ -d "$MINIO_DATA_DIR" ]; then
                print_message "✅ Répertoire MinIO créé: $MINIO_DATA_DIR" $GREEN
            else
                print_message "❌ Erreur: impossible de créer $MINIO_DATA_DIR" $RED
                exit 1
            fi
            
            print_message "🚀 Démarrage de MinIO..." $BLUE
            nohup minio server $MINIO_DATA_DIR --console-address ":9001" > /tmp/minio.log 2>&1 &
            
            if check_service minio 9000 "MinIO" 2>/dev/null; then
                MINIO_RUNNING=true
                print_message "   ✅ MinIO démarré avec succès" $GREEN
                print_message "   🌐 Console MinIO: http://localhost:9001" $BLUE
            else
                print_message "   ❌ Échec du démarrage de MinIO" $RED
                print_message "   🔍 Vérifiez les logs: tail -f /tmp/minio.log" $YELLOW
            fi
        else
            print_message "⚠️ MinIO non installé. Pour l'installer:" $YELLOW
            print_message "   wget https://dl.min.io/server/minio/release/linux-amd64/minio" $BLUE
            print_message "   chmod +x minio" $BLUE
            print_message "   sudo mv minio /usr/local/bin/" $BLUE
        fi
    else
        MINIO_RUNNING=true
    fi
}

# Fonction pour démarrer tous les services applicatifs dans l'ordre
start_all_app_services() {
    print_message "\n=========================================" $GREEN
    print_message "   DÉMARRAGE DES SERVICES APPLICATIFS" $GREEN
    print_message "   Ordre: auth-user-service → chat-file-service → gateway" $GREEN
    print_message "=========================================\n" $GREEN
    
    local failed_services=()
    
    # 1. Démarrer auth-user-service (en premier)
    if start_app_service "auth-user-service" "${APP_SERVICES['auth-user-service']}" "auth-user-service"; then
        print_message "✅ auth-user-service démarré\n" $GREEN
    else
        failed_services+=("auth-user-service")
    fi
    
    # 2. Démarrer chat-file-service
    if start_app_service "chat-file-service" "${APP_SERVICES['chat-file-service']}" "chat-file-service"; then
        print_message "✅ chat-file-service démarré\n" $GREEN
    else
        failed_services+=("chat-file-service")
    fi
    
    # 3. Démarrer gateway
    if start_app_service "gateway" "${APP_SERVICES['gateway']}" "gateway"; then
        print_message "✅ gateway démarrée\n" $GREEN
    else
        failed_services+=("gateway")
    fi
    
    # Résumé
    print_message "\n=========================================" $GREEN
    if [ ${#failed_services[@]} -eq 0 ]; then
        print_message "🎉 TOUS LES SERVICES APPLICATIFS SONT DÉMARRÉS!" $GREEN
        print_message "📝 URLs des services:" $BLUE
        print_message "   • Auth User Service: http://localhost:8001" $BLUE
        print_message "   • Chat File Service: http://localhost:8003" $BLUE
        print_message "   • Gateway: http://localhost:8000" $BLUE
    else
        print_message "⚠️  Certains services n'ont pas démarré correctement:" $YELLOW
        for service in "${failed_services[@]}"; do
            print_message "   • $service" $YELLOW
        done
    fi
    print_message "=========================================\n" $GREEN
}

# Fonction pour vérifier l'état des services
check_all_services() {
    print_message "\n📊 ÉTAT DES SERVICES:" $BLUE
    print_message "========================" $BLUE
    
    # Services système
    print_message "\n🔧 SERVICES SYSTÈME:" $BLUE
    check_service mongodb 27017 "MongoDB" || SERVICES_OK=false
    check_service redis 6379 "Redis" || print_message "⚠️ Redis en mode fallback" $YELLOW
    print_message "⚠️  Kafka      - Non démarré (optionnel)" $YELLOW
    check_service minio 9000 "MinIO" || print_message "⚠️ MinIO en mode fallback" $YELLOW
    
    # # Services applicatifs
    # print_message "\n📱 SERVICES APPLICATIFS:" $BLUE
    # for service in "${!APP_SERVICES[@]}"; do
    #     port=$(echo ${APP_SERVICES[$service]} | cut -d: -f2)
    #     if check_port $port; then
    #         print_message "✅ $service: EN COURS (port $port)" $GREEN
    #     else
    #         print_message "❌ $service: ARRÊTÉ (port $port)" $RED
    #     fi
    # done
}

# Fonction pour arrêter tous les services
stop_all_services() {
    print_message "\n🛑 Arrêt des services..." $YELLOW
    
    # Arrêter les services applicatifs
    pkill -f "node.*auth-user-service" 2>/dev/null
    pkill -f "node.*chat-file-service" 2>/dev/null
    pkill -f "node.*gateway" 2>/dev/null
    
    # Arrêter MinIO si nécessaire
    if [ "$MINIO_RUNNING" = true ]; then
        pkill -f minio 2>/dev/null
    fi
    
    print_message "✅ Services arrêtés" $GREEN
}

# Fonction de nettoyage
cleanup() {
    print_message "\n🛑 Arrêt des services..." $YELLOW
    stop_all_services
    exit 0
}

# Capturer Ctrl+C
trap cleanup SIGINT SIGTERM

# Fonction pour créer le dossier de logs
setup_logs() {
    mkdir -p logs
}

# Menu principal
show_menu() {
    clear
    echo ""
    print_message "╔══════════════════════════════════════════════════════╗" $BLUE
    print_message "║     ENVIRONNEMENT DE DÉVELOPPEMENT CENADI           ║" $BLUE
    print_message "╠══════════════════════════════════════════════════════╣" $BLUE
    print_message "║  1. Démarrer tous les services (système + app)      ║" $BLUE
    print_message "║  2. Démarrer seulement les services système         ║" $BLUE
    print_message "║  3. Démarrer seulement les services applicatifs     ║" $BLUE
    print_message "║  4. Démarrer un service spécifique                  ║" $BLUE
    print_message "║  5. Arrêter tous les services                       ║" $BLUE
    print_message "║  6. Vérifier l'état des services                    ║" $BLUE
    print_message "║  7. Afficher les logs                               ║" $BLUE
    print_message "║  8. Afficher les commandes utiles                   ║" $BLUE
    print_message "║  9. Quitter                                         ║" $BLUE
    print_message "╚══════════════════════════════════════════════════════╝" $BLUE
    echo ""
}

# Afficher les commandes utiles
show_useful_commands() {
    print_message "\n📋 COMMANDES UTILES:" $BLUE
    print_message "=====================" $BLUE
    echo ""
    print_message "❤️  Health check: curl http://localhost:3000/health" $GREEN
    print_message "🌐 Console MinIO: http://localhost:9001" $GREEN
    print_message "📨 Démarrer Kafka: ./start-kafka-dev.sh" $GREEN
    print_message "🛑 Arrêter Kafka: pkill -f 'kafka|zookeeper'" $GREEN
    print_message "🛑 Arrêter MinIO: pkill -f minio" $GREEN
    print_message "📊 Logs MinIO: tail -f /tmp/minio.log" $GREEN
    echo ""
}

# Programme principal
main() {
    print_message "🔍 Vérification de l'environnement..." $BLUE
    setup_logs
    print_message "✅ Environnement OK" $GREEN
    
    while true; do
        show_menu
        read -p "Choisissez une option (1-9): " choice
        
        case $choice in
            1)
                start_system_services
                start_all_app_services
                check_all_services
                read -p "Appuyez sur Entrée pour continuer..."
                ;;
            2)
                start_system_services
                check_all_services
                read -p "Appuyez sur Entrée pour continuer..."
                ;;
            3)
                start_all_app_services
                read -p "Appuyez sur Entrée pour continuer..."
                ;;
            4)
                print_message "\nServices disponibles:" $BLUE
                for service in "${!APP_SERVICES[@]}"; do
                    echo "   • $service"
                done
                echo ""
                read -p "Nom du service à démarrer: " service_name
                if [[ -n "${APP_SERVICES[$service_name]}" ]]; then
                    start_app_service "$service_name" "${APP_SERVICES[$service_name]}" "$service_name"
                else
                    print_message "❌ Service non reconnu" $RED
                fi
                read -p "Appuyez sur Entrée pour continuer..."
                ;;
            5)
                stop_all_services
                read -p "Appuyez sur Entrée pour continuer..."
                ;;
            6)
                check_all_services
                read -p "Appuyez sur Entrée pour continuer..."
                ;;
            7)
                ls -la logs/ 2>/dev/null || print_message "Aucun log trouvé" $YELLOW
                read -p "Appuyez sur Entrée pour continuer..."
                ;;
            8)
                show_useful_commands
                read -p "Appuyez sur Entrée pour continuer..."
                ;;
            9)
                print_message "\n👋 Au revoir!" $BLUE
                exit 0
                ;;
            *)
                print_message "❌ Option invalide. Choisissez 1-9" $RED
                sleep 2
                ;;
        esac
    done
}

# Lancer le programme principal
main
