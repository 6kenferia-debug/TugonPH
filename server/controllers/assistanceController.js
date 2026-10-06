const mongoose = require("mongoose");
const AssistanceRequest = require("../models/AssistanceRequest");
const User = require("../models/User");
const { asyncRoute } = require("./complaintController");
const { removePublicFileUrl } = require("../services/storage-service");
const { sendStatusUpdateEmail } = require("../services/email");
const { createRequestHistoryEntry, createRequestHistoryEntries, getRequestHistory } = require("../services/requestHistory");

async function recordAssistanceHistory({ user, existingRequest, nextRequest, updates }) {
  const entries = [];

  if (updates.status !== undefined) {
    const previousStatus = String(existingRequest.status ?? "");
    const nextStatus = String(nextRequest.status ?? "");
    if (previousStatus !== nextStatus) {
      entries.push({
        action: "Status changed",
        previousValue: previousStatus,
        newValue: nextStatus,
        details: `${previousStatus} → ${nextStatus}`,
      });
    }
  }

  if (updates.priority !== undefined) {
    const previousPriority = String(existingRequest.priority ?? "");
    const nextPriority = String(nextRequest.priority ?? "");
    if (previousPriority !== nextPriority) {
      entries.push({
        action: "Priority changed",
        previousValue: previousPriority,
        newValue: nextPriority,
        details: `${previousPriority} → ${nextPriority}`,
      });
    }
  }

  if (updates.category !== undefined) {
    const previousCategory = String(existingRequest.category ?? "");
    const nextCategory = String(nextRequest.category ?? "");
    if (previousCategory !== nextCategory) {
      entries.push({
        action: "Category changed",
        previousValue: previousCategory,
        newValue: nextCategory,
        details: `${previousCategory} → ${nextCategory}`,
      });
    }
  }

  if (updates.respondent !== undefined) {
    const previousRespondent = String(existingRequest.respondent ?? "");
    const nextRespondent = String(nextRequest.respondent ?? "");
    if (previousRespondent !== nextRespondent) {
      entries.push({
        action: "Respondent changed",
        previousValue: previousRespondent || null,
        newValue: nextRespondent || null,
        details: previousRespondent && nextRespondent ? `${previousRespondent} → ${nextRespondent}` : nextRespondent || "Respondent removed",
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, "adminNotes")) {
    const previousNote = String(existingRequest.adminNotes ?? "").trim();
    const nextNote = String(nextRequest.adminNotes ?? "").trim();
    if (previousNote !== nextNote) {
      const action = nextNote ? (previousNote ? "Admin note updated" : "Admin note added") : "Admin note removed";
      entries.push({
        action,
        previousValue: previousNote || null,
        newValue: nextNote || null,
        details: nextNote || "Admin note removed.",
      });
    }
  }

  if (entries.length > 0) {
    await createRequestHistoryEntries({
      requestType: "assistance",
      requestId: nextRequest._id,
      user,
      entries,
    });
  }
}
const ASSISTANCE_CATEGORIES = new Set([
  "health-services",
  "emergency-assistance",
  "financial-assistance",
  "medical-assistance",
  "senior-citizen-support",
  "pwd-assistance",
  "food-assistance",
  "disaster-relief",
  "burial-assistance",
  "scholarship-assistance",
]);

function validateSubmission(body) {
  const required = ["title", "description", "category", "location", "photo", "contactInfo"];
  if (required.some((field) => typeof body[field] !== "string" || !body[field].trim())) {
    const error = new Error("Title, description, category, location, photo, and contact information are required.");
    error.status = 400;
    throw error;
  }
  if (!/^\d{11}$/.test(body.contactInfo.trim())) {
    const error = new Error("Contact number must contain exactly 11 digits.");
    error.status = 400;
    throw error;
  }
  if (!ASSISTANCE_CATEGORIES.has(body.category)) {
    const error = new Error("Invalid assistance category.");
    error.status = 400;
    throw error;
  }
}

function pagination(req) {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 1000, 1), 1000);
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  return { limit, skip: (page - 1) * limit };
}

async function list(req, res) {
  const filter = req.user.role === "admin" ? {} : { userId: req.user._id };
  const { limit, skip } = pagination(req);
  const assistanceRequests = await AssistanceRequest.find(filter).sort({ dateSubmitted: -1 }).skip(skip).limit(limit);
  return res.json({ assistanceRequests });
}

async function getById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid record identifier.", code: "INVALID_ID" });
  }
  const assistanceRequest = await AssistanceRequest.findById(req.params.id);
  if (!assistanceRequest) return res.status(404).json({ error: "Assistance request not found." });
  if (req.user.role !== "admin" && String(assistanceRequest.userId) !== String(req.user._id)) {
    return res.status(403).json({ error: "You cannot access this assistance request." });
  }
  return res.json({ assistanceRequest });
}

async function getHistory(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid record identifier.", code: "INVALID_ID" });
  }

  const assistanceRequest = await AssistanceRequest.findById(req.params.id).select("_id userId");
  if (!assistanceRequest) return res.status(404).json({ error: "Assistance request not found." });
  if (req.user.role !== "admin" && String(assistanceRequest.userId) !== String(req.user._id)) {
    return res.status(403).json({ error: "You cannot access this assistance request." });
  }

  const history = await getRequestHistory({
    requestType: "assistance",
    requestId: assistanceRequest._id,
  });
  return res.json({ history });
}

async function create(req, res) {
  validateSubmission(req.body);
  const body = req.body;
  let userName = req.user?.name;
  if (!req.user) {
    const latestGuest = await AssistanceRequest.findOne({ userId: null, userName: /^Anonymous\d+$/ }).sort({ createdAt: -1 }).select("userName");
    const previousNumber = latestGuest?.userName?.match(/Anonymous(\d+)/)?.[1];
    userName = `Anonymous${String(Number(previousNumber || 0) + 1).padStart(3, "0")}`;
  }

  const assistanceRequest = await AssistanceRequest.create({
    title: body.title.trim(),
    description: body.description.trim(),
    category: body.category.trim(),
    location: body.location.trim(),
    photo: body.photo,
    contactInfo: body.contactInfo.trim(),
    status: "pending",
    priority: ["emergency-assistance", "disaster-relief"].includes(body.category) ? "high" : "medium",
    respondent: body.respondent || "",
    userId: req.user?._id || null,
    userName: userName || "Unknown User",
    latitude: body.coordinates?.lat ?? body.latitude ?? null,
    longitude: body.coordinates?.lng ?? body.longitude ?? null,
  });

  await createRequestHistoryEntry({
    requestType: "assistance",
    requestId: assistanceRequest._id,
    action: "Request submitted",
    previousValue: null,
    newValue: assistanceRequest.status,
    details: "Request submitted.",
    user: req.user,
  });

  return res.status(201).json({ assistanceRequest });
}

async function update(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid record identifier.", code: "INVALID_ID" });
  }
  const allowed = ["title", "description", "category", "location", "photo", "contactInfo", "status", "priority", "adminNotes", "resolutionProofImage", "resolutionProofUploadedAt", "resolutionProofUploadedBy", "respondent", "latitude", "longitude"];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  if (updates.contactInfo !== undefined && !/^\d{11}$/.test(updates.contactInfo)) {
    return res.status(400).json({ error: "Contact number must contain exactly 11 digits." });
  }

  const existingRequest = await AssistanceRequest.findById(req.params.id);
  if (!existingRequest) return res.status(404).json({ error: "Assistance request not found." });

  const previousRequestSnapshot = {
    status: existingRequest.status,
    priority: existingRequest.priority,
    category: existingRequest.category,
    respondent: existingRequest.respondent,
    adminNotes: existingRequest.adminNotes,
  };
  const previousStatus = existingRequest.status;
  Object.assign(existingRequest, updates);
  const assistanceRequest = await existingRequest.save();

  await recordAssistanceHistory({
    user: req.user,
    existingRequest: previousRequestSnapshot,
    nextRequest: assistanceRequest,
    updates,
  });

  const statusChanged = updates.status !== undefined && String(updates.status) !== String(previousStatus);
  if (statusChanged && assistanceRequest.userId) {
    try {
      const user = await User.findById(assistanceRequest.userId).select("email");
      if (!user?.email) {
        console.warn(`Skipping assistance status email for ${assistanceRequest.id}: no registered user email found.`);
      } else {
        await sendStatusUpdateEmail({
          email: user.email,
          kind: "assistance",
          title: assistanceRequest.title,
          referenceId: assistanceRequest.ticketId,
          previousStatus,
          newStatus: assistanceRequest.status,
          adminNotes: assistanceRequest.adminNotes,
        });
      }
    } catch (error) {
      console.error(`Failed to send assistance status email for ${assistanceRequest.id}:`, error);
    }
  }

  return res.json({ assistanceRequest });
}

async function remove(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid record identifier.", code: "INVALID_ID" });
  }
  const assistanceRequest = await AssistanceRequest.findByIdAndDelete(req.params.id);
  if (!assistanceRequest) return res.status(404).json({ error: "Assistance request not found." });
  if (assistanceRequest.resolutionProofImage) {
    await removePublicFileUrl(assistanceRequest.resolutionProofImage).catch(() => false);
  }
  return res.json({ message: "Assistance request deleted successfully." });
}

module.exports = { asyncRoute, list, getById, getHistory, create, update, remove };