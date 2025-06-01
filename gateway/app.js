const express = require("express");
const cors = require("cors");
const chalk = require("chalk");
const httpProxy = require("http-proxy");
const favicon = require("serve-favicon");
const path = require("path");
require("dotenv").config();

const app = express();
const proxy = httpProxy.createProxyServer();

// Middleware de base
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());

// Fichiers statiques
app.use(express.static(path.join(__dirname, "public")));
app.use(favicon(path.join(__dirname, "public/favicon.ico")));

// Routes de base
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "public/home.html"));
});

// Routes proxy vers les services
const routes = [
  { path: "/api/auth", target: process.env.AUTH_SERVICE_URL },
  { path: "/api/users", target: process.env.USER_SERVICE_URL },
  { path: "/api/messages", target: process.env.CHAT_SERVICE_URL },
  { path: "/api/conversations", target: process.env.CHAT_SERVICE_URL },
  { path: "/api/groups", target: process.env.GROUP_SERVICE_URL },
  { path: "/api/visibility", target: process.env.VISIBILITY_SERVICE_URL },
  { path: "/api/files", target: process.env.FILE_SERVICE_URL },
];

// Configuration du proxy
proxy.on("proxyReq", (proxyReq, req, res) => {
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyData = JSON.stringify(req.body);
    proxyReq.setHeader("Content-Type", "application/json");
    proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }
});

// Routes proxy vers les services
routes.forEach(({ path, target }) => {
  app.use(path, (req, res) => {
    proxy.web(req, res, {
      target,
      changeOrigin: true,
      secure: false,
    });
  });
});

// Gestion des erreurs proxy
proxy.on("error", (err, req, res) => {
  console.error("Erreur Proxy:", err);
  res.status(500).json({
    success: false,
    message: "Erreur de communication avec le service",
  });
});

// Route 404
app.use(({ res }) => {
  res.status(404).json({
    success: false,
    message: "Ressource non trouvée",
  });
});

const PORT = process.env.GATEWAY_PORT || 8000;

app.listen(PORT, () => {
  console.log(chalk.yellow(`🚀 Gateway démarrée sur le port ${PORT} `));
});
