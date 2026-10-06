const mongoose = require("mongoose");
const User = require("../models/User");
const Complaint = require("../models/Complaint");
const AssistanceRequest = require("../models/AssistanceRequest");
const RequestHistory = require("../models/RequestHistory");

let connectionPromise;

function isValidAtlasUri(uri) {
  try {
    const parsed = new URL(uri);
    const host = parsed.hostname.toLowerCase();
    const dbName = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    return parsed.protocol === "mongodb+srv:"
      && host.endsWith(".mongodb.net")
      && dbName === "TugonPH";
  } catch {
    return false;
  }
}

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI must be set to the MongoDB Atlas connection string in server/.env.");
  }
  if (!isValidAtlasUri(uri)) {
    throw new Error("MONGODB_URI must be an Atlas mongodb+srv URI for the TugonPH database.");
  }

  connectionPromise = (async () => {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
    await mongoose.connection.db.admin().ping();
    await Promise.all([User.init(), Complaint.init(), AssistanceRequest.init(), RequestHistory.init()]);
    return mongoose.connection;
  })();

  try {
    return await connectionPromise;
  } catch (error) {
    connectionPromise = undefined;
    throw error;
  }
}

module.exports = { connectToDatabase };