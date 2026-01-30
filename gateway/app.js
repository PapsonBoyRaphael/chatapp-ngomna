const express = require("express");
const cors = require("cors");
const chalk = require("chalk");
const httpProxy = require("http-proxy");
const favicon = require("serve-favicon");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const compression = require("compression");
require("dotenv").config();
const path = require("path");

const app = express();
const proxy = httpProxy.createProxyServer();

app.use(
  cors({
    origin: function (origin, callback) {
      if (
        process.env.FRONTEND_URL ||
        /^http:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error("Non autorisé par CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Custom-Header"],
    credentials: true,
  }),
);

// 🛡️ Sécurité avec helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Désactivé pour le développement
    crossOriginEmbedderPolicy: false,
  }),
);

// ⚡ Compression des réponses
app.use(
  compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      // Ne pas compresser les uploads de fichiers
      if (
        req.headers["content-type"] &&
        req.headers["content-type"].includes("multipart")
      ) {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
);

// 🚫 Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requêtes par IP
  message: {
    success: false,
    message: "Trop de requêtes, veuillez patienter",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 🔐 Rate limiting strict pour l'authentification
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Seulement 10 tentatives de connexion
  message: {
    success: false,
    message: "Trop de tentatives de connexion, compte temporairement bloqué",
  },
});

// Application des limiteurs
app.use("/api/", globalLimiter);
app.use("/api/auth/login", authLimiter);

// Middleware de base

app.use(express.json({ limit: "50mb" }));

// Servir les fichiers statiques avec cache
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "1d", // Cache 1 jour
    etag: true,
  }),
);

// Routes proxy vers les services
const routes = [
  {
    path: "/api/auth",
    target: process.env.AUTH_USER_SERVICE_URL,
    description: "Authentification",
  },
  {
    path: "/api/users",
    target: process.env.AUTH_USER_SERVICE_URL,
    description: "Utilisateurs",
  },
  {
    path: "/api/visibility",
    target: process.env.VISIBILITY_SERVICE_URL,
    description: "Visibilité",
  },
  {
    path: "/api/chat",
    target: process.env.CHAT_FILE_SERVICE_URL,
    description: "Chat et Fichiers",
  },
];

// Configuration du proxy avec logging
proxy.on("proxyReq", (proxyReq, req, res) => {
  // Headers de sécurité
  proxyReq.setHeader("X-Forwarded-For", req.ip);
  proxyReq.setHeader("X-Gateway-Time", Date.now());

  if (req.body && Object.keys(req.body).length > 0) {
    const bodyData = JSON.stringify(req.body);
    proxyReq.setHeader("Content-Type", "application/json");
    proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }

  console.log(chalk.blue(`📤 ${req.method} ${req.url} → ${proxyReq.path}`));
});

proxy.on("proxyRes", (proxyRes, req, res) => {
  const statusColor = proxyRes.statusCode >= 400 ? chalk.red : chalk.green;
  console.log(
    statusColor(`📥 ${proxyRes.statusCode} ${req.method} ${req.url}`),
  );
});

// Routes proxy vers les services
routes.forEach(({ path, target, description }) => {
  app.use(path, (req, res) => {
    if (!target) {
      return res.status(503).json({
        success: false,
        message: `Service ${description} non configuré`,
      });
    }

    proxy.web(req, res, {
      target,
      changeOrigin: true,
      secure: false,
      timeout: 30000,
    });
  });
});

// Route de santé avec métriques
app.get("/api/health", (req, res) => {
  res.json({
    status: "UP",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: routes.map((r) => ({
      path: r.path,
      target: r.target,
      description: r.description,
    })),
  });
});

// Gestion des erreurs proxy
proxy.on("error", (err, req, res) => {
  console.error(chalk.red("❌ Erreur Proxy:"), err.message);

  if (!res.headersSent) {
    const isServiceDown = err.code === "ECONNREFUSED";
    res.status(isServiceDown ? 503 : 500).json({
      success: false,
      message: isServiceDown
        ? "Service temporairement indisponible"
        : "Erreur de communication avec le service",
      timestamp: new Date().toISOString(),
    });
  }
});

// Route 404 améliorée
app.use((req, res) => {
  console.log(
    chalk.yellow(`⚠️ Route non trouvée: ${req.method} ${req.originalUrl}`),
  );
  res.status(404).json({
    success: false,
    message: "Ressource non trouvée",
    path: req.originalUrl,
    availableRoutes: routes.map((r) => r.path),
  });
});

const PORT = process.env.GATEWAY_PORT || 8000;

app.listen(PORT, () => {
  console.log(
    chalk.yellow(`🚀 Gateway CENADI sécurisée démarrée sur le port ${PORT}`),
  );
  console.log(chalk.blue(`🌍 URL: http://localhost:${PORT}`));
  console.log(
    chalk.green("🛡️ Sécurité activée: Rate Limiting + Helmet + Compression"),
  );

  routes.forEach((route) => {
    const status = route.target ? chalk.green("✅") : chalk.red("❌");
    console.log(
      `   ${status} ${route.path} → ${route.target || "NON CONFIGURÉ"}`,
    );
  });
});
