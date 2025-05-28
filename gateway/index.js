const express = require("express");
const cors = require("cors");
const httpProxy = require("http-proxy");
const favicon = require("serve-favicon");
const path = require("path");
require("dotenv").config();

const app = express();
const proxy = httpProxy.createProxyServer();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));
app.use(favicon(path.join(__dirname, "./public/favicon.ico")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "./public/index.html"));
});

app.get("/home.html", (req, res) => {
  res.sendFile(path.join(__dirname, "./public/home.html"));
});

// Redirection vers les services
app.use("/api/login", (req, res) => {
  proxy.web(req, res, { target: process.env.AUTH_SERVICE_URL });
});

app.use("/api/users", (req, res) => {
  proxy.web(req, res, { target: process.env.USER_SERVICE_URL });
});

app.use("/api/messages", (req, res) => {
  proxy.web(req, res, { target: process.env.CHAT_SERVICE_URL });
});

app.use("/api/conversations", (req, res) => {
  proxy.web(req, res, { target: process.env.CHAT_SERVICE_URL });
});

app.use("/api/groups", (req, res) => {
  proxy.web(req, res, { target: process.env.GROUP_SERVICE_URL });
});

app.use("/api/contacts", (req, res) => {
  proxy.web(req, res, { target: process.env.CONTACT_SERVICE_URL });
});

app.use("/api/files", (req, res) => {
  proxy.web(req, res, { target: process.env.FILE_SERVICE_URL });
});

app.use(({ res }) => {
  const message = "Ressource non trouvée.";
  res.status(404).json({ message });
});

const port = process.env.GATEWAY_PORT || 8000;
app.listen(port, () => console.log(`gateway démarré sur le port ${port}`));
