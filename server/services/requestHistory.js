const RequestHistory = require("../models/RequestHistory");

function normalizeUser(user) {
  if (!user) {
    return {
      performedBy: null,
      performedByName: "System",
      performedByRole: "system",
    };
  }

  return {
    performedBy: user._id || user.id || null,
    performedByName: user.name || user.fullName || "Unknown user",
    performedByRole: user.role || "resident",
  };
}

async function createRequestHistoryEntry({
  requestType,
  requestId,
  action,
  previousValue = null,
  newValue = null,
  details = "",
  user = null,
}) {
  if (!requestType || !requestId || !action) {
    return null;
  }

  const normalized = normalizeUser(user);
  const record = await RequestHistory.create({
    requestId,
    requestType,
    action: String(action).trim(),
    previousValue,
    newValue,
    details: String(details || "").trim(),
    performedBy: normalized.performedBy,
    performedByName: normalized.performedByName,
    performedByRole: normalized.performedByRole,
    createdAt: new Date(),
  });

  return record.toJSON();
}

async function createRequestHistoryEntries({ requestType, requestId, user = null, entries = [] }) {
  if (!requestType || !requestId || !Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const normalized = normalizeUser(user);
  const payload = entries
    .filter((entry) => entry && entry.action)
    .map((entry) => ({
      requestId,
      requestType,
      action: String(entry.action).trim(),
      previousValue: entry.previousValue ?? null,
      newValue: entry.newValue ?? null,
      details: String(entry.details || "").trim(),
      performedBy: normalized.performedBy,
      performedByName: normalized.performedByName,
      performedByRole: normalized.performedByRole,
      createdAt: new Date(),
    }));

  if (payload.length === 0) return [];
  const created = await RequestHistory.insertMany(payload);
  return created.map((entry) => entry.toJSON());
}

async function getRequestHistory({ requestType, requestId }) {
  if (!requestType || !requestId) {
    return [];
  }

  const records = await RequestHistory.find({ requestType, requestId })
    .sort({ createdAt: -1 })
    .lean();

  return records.map((record) => ({
    ...record,
    id: String(record._id),
    requestId: String(record.requestId),
  }));
}

module.exports = {
  createRequestHistoryEntry,
  createRequestHistoryEntries,
  getRequestHistory,
};
