# Guide de déploiement multi-serveurs

## 📦 Architecture NPM

Le shared module est configuré pour être publié comme package NPM réel.

### Configuration actuelle

**shared/package.json**

```json
{
  "name": "@chatapp-ngomna/shared",
  "version": "1.0.0",
  "private": false
}
```

**chat-file-service/package.json**

```json
{
  "dependencies": {
    "@chatapp-ngomna/shared": "file:../shared" // Local development
  }
}
```

## 🚀 Déploiement (3 stratégies)

### Option 1 : npm Public (Recommandé pour production)

```bash
# 1️⃣ Publier le shared
cd shared
npm login
npm version patch  # Ou minor/major
npm publish

# 2️⃣ Mettre à jour chat-file-service
cd ../chat-file-service
# Dans package.json :
# "@chatapp-ngomna/shared": "^1.0.0"

npm install
npm start
```

**Avantages** ✅

- Réutilisable par tous les services
- Versionning sémantique
- Peut être sur serveurs différents
- Facile à maintenir

**Inconvénients** ❌

- Dépend de npmjs.org

---

### Option 2 : Registry Privée (Verdaccio local)

```bash
# 1️⃣ Installer Verdaccio
npm install -g verdaccio
verdaccio  # Démarre sur http://localhost:4873

# 2️⃣ Configurer npm
npm set registry http://localhost:4873/

# 3️⃣ Publier shared
cd shared
npm publish

# 4️⃣ Installer dans chat-file-service
cd ../chat-file-service
npm set registry http://localhost:4873/
npm install @chatapp-ngomna/shared
```

**Avantages** ✅

- Registry privée locale
- Pas dépendant d'internet
- Contrôle complet des versions
- Multi-serveurs possible

**Inconvénients** ❌

- Infrastructure supplémentaire à gérer
- Dépend du serveur Verdaccio

---

### Option 3 : Déploiement monolitique (Développement)

Utiliser `file:../shared` pour le développement local.

```bash
# Structure
chatapp-ngomna/
  ├── shared/
  ├── chat-file-service/
  ├── auth-service/
  └── group-service/

# Chaque service peut faire
# package.json: "@chatapp-ngomna/shared": "file:../shared"
```

**Avantages** ✅

- Zéro configuration
- Développement facile

**Inconvénients** ❌

- Pas possible sur serveurs différents
- Changements du shared = rebuild tous les services

---

## 🔄 Pipeline CI/CD avec npm

### GitHub Actions

```yaml
name: Publish Shared Module

on:
  push:
    branches: [main]
    paths:
      - "shared/**"

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: "18"
          registry-url: "https://registry.npmjs.org"

      - run: cd shared && npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - run: cd chat-file-service && npm install @chatapp-ngomna/shared@latest
```

---

## 📋 Checklist Déploiement Multi-Serveurs

### Avant production

- [ ] Créer compte npm ou Verdaccio
- [ ] Générer NPM_TOKEN
- [ ] Configurer `.npmrc` sur tous les serveurs
- [ ] Tester publication du shared
- [ ] Tester installation dans chat-file-service
- [ ] Valider les imports dans les services

### Configuration serveur

```bash
# Sur chaque serveur (chat-file-service)
cat > ~/.npmrc << EOF
@chatapp-ngomna:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=YOUR_TOKEN_HERE
EOF

npm install
npm start
```

### Monitoring versions

```bash
# Vérifier version installée
npm list @chatapp-ngomna/shared

# Voir les mises à jour disponibles
npm outdated @chatapp-ngomna/shared

# Mettre à jour
npm update @chatapp-ngomna/shared
```

---

## 🐛 Troubleshooting

### "Cannot find module '@chatapp-ngomna/shared'"

**Solution 1** : Vérifier .npmrc

```bash
npm config list
cat ~/.npmrc
```

**Solution 2** : Réinstaller

```bash
rm -rf node_modules package-lock.json
npm install
```

**Solution 3** : Vérifier que le package est publié

```bash
npm view @chatapp-ngomna/shared versions
```

---

## 📈 Versioning

Après chaque changement dans shared :

```bash
cd shared

# Minor: Nouvelles fonctionnalités compatibles
npm version minor
npm publish

# Patch: Corrections de bugs
npm version patch
npm publish

# Major: Changements API incompatibles
npm version major
npm publish

cd ../chat-file-service
npm update @chatapp-ngomna/shared
```

---

## 🔗 Ressources

- [npm Scoped Packages](https://docs.npmjs.com/about/scoped-packages)
- [Verdaccio Documentation](https://verdaccio.org/)
- [npm Publishing](https://docs.npmjs.com/cli/v9/commands/npm-publish)
