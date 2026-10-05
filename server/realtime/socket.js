const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { getUserFromToken } = require("../middleware/authenticate");

let ioInstance = null;

function createRealtimeServer(httpServer, allowedOrigins) {
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed by Socket.IO CORS."));
      },
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    try {
      const claims = jwt.verify(token, process.env.JWT_SECRET);
      const user = await getUserFromToken(token);
      socket.data.authUser = {
        id: String(user.id),
        role: user.role,
      };
      socket.data.tokenExpiresAt = claims.exp ? claims.exp * 1000 : null;
      next();
    } catch {
      const error = new Error("Socket authentication failed.");
      error.data = { code: "AUTHENTICATION_FAILED" };
      next(error);
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.authUser;
    socket.join(`user:${user.id}`);
    if (user.role === "admin") socket.join("admins");

    const expiresAt = socket.data.tokenExpiresAt;
    if (expiresAt) {
      const remaining = expiresAt - Date.now();
      const expiryTimer = setTimeout(() => {
        socket.emit("auth:expired", { code: "TOKEN_EXPIRED" });
        socket.disconnect(true);
      }, Math.max(remaining, 0));
      socket.once("disconnect", () => clearTimeout(expiryTimer));
    }
  });

  ioInstance = io;
  return io;
}

function serializeRequestReference(record) {
  const value = typeof record.toJSON === "function" ? record.toJSON() : record;
  const userId = value.userId == null ? null : String(value.userId._id ?? value.userId);
  return {
    id: String(value.id ?? value._id),
    userId,
  };
}

function emitRequestChanged(eventName, record) {
  if (!ioInstance || !record) return;
  const payload = serializeRequestReference(record);
  const rooms = ["admins"];
  if (payload.userId) rooms.push(`user:${payload.userId}`);
  ioInstance.to(rooms).emit(eventName, payload);
}

function emitRequestDeleted(eventName, record) {
  if (!ioInstance || !record) return;
  const id = String(record.id ?? record._id);
  const userId = record.userId == null
    ? null
    : String(record.userId._id ?? record.userId);
  const rooms = ["admins"];
  if (userId) rooms.push(`user:${userId}`);
  ioInstance.to(rooms).emit(eventName, { id, userId });
}

function disconnectUserSockets(userId) {
  if (!ioInstance || !userId) return;
  const normalizedId = String(userId);
  for (const socket of ioInstance.sockets.sockets.values()) {
    if (socket.data.authUser?.id !== normalizedId) continue;
    socket.emit("auth:expired", { code: "ACCOUNT_REVOKED" });
    socket.disconnect(true);
  }
}

module.exports = {
  createRealtimeServer,
  disconnectUserSockets,
  emitRequestChanged,
  emitRequestDeleted,
};