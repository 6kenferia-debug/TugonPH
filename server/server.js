const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const dns = require("node:dns");
const dnsServers = process.env.MONGODB_DNS_SERVERS
  ?.split(",")
  .map((server) => server.trim())
  .filter(Boolean);
if (dnsServers?.length) {
  dns.setServers(dnsServers);
}

const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth");
const complaintRoutes = require("./routes/complaints");
const assistanceRoutes = require("./routes/assistance");
const adminUserRoutes = require("./routes/admin-users");
const pollingRoutes = require("./routes/polling");
const { servePublicFile } = require("./controllers/storageController");
const { connectToDatabase } = require("./config/db");
const { errorHandler, notFoundHandler } = require("./middleware/error-handler");

const app = express();
const defaultOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "https://localhost",
];
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || defaultOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  },
  allowedHeaders: ["Authorization", "Content-Type"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));
app.use(express.json({ limit: "15mb" }));

app.get("/api/health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    database: connected ? mongoose.connection.name : null,
    mongo: connected ? "connected" : "disconnected",
  });
});

app.get("/api/uploads/profile/:userId/:filename", (req, res, next) => {
  req.params[0] = `profile/${req.params.userId}/${req.params.filename}`;
  return servePublicFile(req, res, next);
});
app.get("/api/uploads/resolution/:recordType/:recordId/:filename", (req, res, next) => {
  req.params[0] = `resolution/${req.params.recordType}/${req.params.recordId}/${req.params.filename}`;
  return servePublicFile(req, res, next);
});

app.use("/api/auth", authRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/assistance", assistanceRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/polling", pollingRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be set in server/.env before starting the API.");
  }

  await connectToDatabase();
  const port = Number(process.env.PORT) || 5000;
  const httpServer = require("node:http").createServer(app);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`API listening on port ${port}; MongoDB database: ${mongoose.connection.name}`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received; closing API and MongoDB connection.`);
    httpServer.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

startServer().catch(async (error) => {
  console.error(`Backend startup failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});

module.exports = app;