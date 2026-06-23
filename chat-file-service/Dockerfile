# ============================================================================
# STAGE 1: BUILDER - Construction et compilation des dépendances natives
# ============================================================================
FROM node:18-alpine AS builder

# Installer les dépendances de build
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    cairo-dev \
    jpeg-dev \
    giflib-dev \
    pango-dev \
    pixman-dev \
    build-base \
    linux-headers \
    pkg-config

# Définir le répertoire de travail
WORKDIR /build

# Copier package.json et package-lock.json
COPY package*.json ./

# Copier le module shared
COPY ../shared ./shared

# Installer toutes les dépendances (incluant les dépendances optionnelles pour les builds natifs)
RUN npm ci --include=optional \
    && npm cache clean --force

# ============================================================================
# STAGE 2: RUNTIME - Image production minimale
# ============================================================================
FROM node:18-alpine

# Installer les dépendances runtime uniquement
RUN apk add --no-cache \
    ffmpeg \
    exiftool \
    curl \
    ca-certificates \
    tini \
    bash

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Définir le répertoire de travail
WORKDIR /app

# Copier node_modules et dépendances du stage builder
COPY --from=builder --chown=nodejs:nodejs /build/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /build/package*.json ./

# Copier le code source
COPY --chown=nodejs:nodejs . .

# Créer les répertoires nécessaires
RUN mkdir -p /app/storage/uploads \
    && mkdir -p /app/storage/chunks \
    && mkdir -p /app/storage/temp \
    && mkdir -p /app/logs \
    && chown -R nodejs:nodejs /app/storage \
    && chown -R nodejs:nodejs /app/logs

# Passer à l'utilisateur non-root
USER nodejs

# Exposer le port du service
EXPOSE 8003

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8003/health || exit 1

# Utiliser tini comme init pour une gestion propre des signaux
ENTRYPOINT ["/sbin/tini", "--"]

# Commande de démarrage
CMD ["npm", "start"]
