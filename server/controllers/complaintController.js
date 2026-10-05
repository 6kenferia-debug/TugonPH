const mongoose = require("mongoose");
const Complaint = require("../models/Complaint");
const User = require("../models/User");
const { removePublicFileUrl } = require("../services/storage-service");
const { sendStatusUpdateEmail } = require("../services/email");
const { createRequestHistoryEntry, createRequestHistoryEntries, getRequestHistory } = require("../services/requestHistory");
const { emitRequestChanged, emitRequestDeleted } = require("../realtime/socket");

async function recordComplaintHistory({ user, existingComplaint, nextComplaint, updates }) {
  const entries = [];

  if (updates.status !== undefined) {
    const previousStatus = String(existingComplaint.status ?? "");
    const nextStatus = String(nextComplaint.status ?? "");
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
    const previousPriority = String(existingComplaint.priority ?? "");
    const nextPriority = String(nextComplaint.priority ?? "");
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
    const previousCategory = String(existingComplaint.category ?? "");
    const nextCategory = String(nextComplaint.category ?? "");
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
    const previousRespondent = String(existingComplaint.respondent ?? "");
    const nextRespondent = String(nextComplaint.respondent ?? "");
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
    const previousNote = String(existingComplaint.adminNotes ?? "").trim();
    const nextNote = String(nextComplaint.adminNotes ?? "").trim();
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
      requestType: "complaint",
      requestId: nextComplaint._id,
      user,
      entries,
    });
  }
}

const RESPONDENT_CATEGORIES = new Set([
  "neighborhood-disputes",
  "minor-crime",
  "public-disturbance",
  "noise-complaints",
  "property-damage",
]);
const COMPLAINT_CATEGORIES = new Set([
  "minor-crime",
  "garbage-sanitation",
  "noise-complaints",
  "property-damage",
  "neighborhood-disputes",
  "illegal-parking",
  "public-disturbance",
  "drainage-issues",
  "street-light-issues",
]);

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

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
  if (!COMPLAINT_CATEGORIES.has(body.category)) {
    const error = new Error("Invalid complaint category.");
    error.status = 400;
    throw error;
  }
  if (RESPONDENT_CATEGORIES.has(body.category) && !String(body.respondent || "").trim()) {
    const error = new Error("Respondent is required for this complaint category.");
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
  const complaints = await Complaint.find(filter).sort({ dateSubmitted: -1 }).skip(skip).limit(limit);
  return res.json({ complaints });
}

async function getById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid record identifier.", code: "INVALID_ID" });
  }
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) return res.status(404).json({ error: "Complaint not found." });
  if (req.user.role !== "admin" && String(complaint.userId) !== String(req.user._id)) {
    return res.status(403).json({ error: "You cannot access this complaint." });
  }
  return res.json({ complaint });
}

async function getHistory(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid record identifier.", code: "INVALID_ID" });
  }

  const complaint = await Complaint.findById(req.params.id).select("_id userId");
  if (!complaint) return res.status(404).json({ error: "Complaint not found." });
  if (req.user.role !== "admin" && String(complaint.userId) !== String(req.user._id)) {
    return res.status(403).json({ error: "You cannot access this complaint." });
  }

  const history = await getRequestHistory({
    requestType: "complaint",
    requestId: complaint._id,
  });
  return res.json({ history });
}

async function create(req, res) {
  validateSubmission(req.body);
  const body = req.body;
  let userName = req.user?.name;
  if (!req.user) {
    const latestGuest = await Complaint.findOne({ userId: null, userName: /^Anonymous\d+$/ }).sort({ createdAt: -1 }).select("userName");
    const previousNumber = latestGuest?.userName?.match(/Anonymous(\d+)/)?.[1];
    userName = `Anonymous${String(Number(previousNumber || 0) + 1).padStart(3, "0")}`;
  }

  const complaint = await Complaint.create({
    title: body.title.trim(),
    description: body.description.trim(),
    category: body.category.trim(),
    location: body.location.trim(),
    photo: body.photo,
    contactInfo: body.contactInfo.trim(),
    status: "pending",
    priority: ["minor-crime", "property-damage"].includes(body.category) ? "high" : "medium",
    respondent: body.respondent || "",
    userId: req.user?._id || null,
    userName: userName || "Unknown User",
    latitude: body.coordinates?.lat ?? body.latitude ?? null,
    longitude: body.coordinates?.lng ?? body.longitude ?? null,
  });

  await createRequestHistoryEntry({
    requestType: "complaint",
    requestId: complaint._id,
    action: "Request submitted",
    previousValue: null,
    newValue: complaint.status,
    details: "Request submitted.",
    user: req.user,
  });

  emitRequestChanged("complaint:created", complaint);
  return res.status(201).json({ complaint });
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

  const existingComplaint = await Complaint.findById(req.params.id);
  if (!existingComplaint) return res.status(404).json({ error: "Complaint not found." });

  const previousComplaintSnapshot = {
    status: existingComplaint.status,
    priority: existingComplaint.priority,
    category: existingComplaint.category,
    respondent: existingComplaint.respondent,
    adminNotes: existingComplaint.adminNotes,
  };
  const previousStatus = existingComplaint.status;
  Object.assign(existingComplaint, updates);
  const complaint = await existingComplaint.save();

  await recordComplaintHistory({
    user: req.user,
    existingComplaint: previousComplaintSnapshot,
    nextComplaint: complaint,
    updates,
  });

  const statusChanged = updates.status !== undefined && String(updates.status) !== String(previousStatus);
  if (statusChanged && complaint.userId) {
    try {
      const user = await User.findById(complaint.userId).select("email");
      if (!user?.email) {
        console.warn(`Skipping complaint status email for ${complaint.id}: no registered user email found.`);
      } else {
        await sendStatusUpdateEmail({
          email: user.email,
          kind: "complaint",
          title: complaint.title,
          referenceId: complaint.ticketId,
          previousStatus,
          newStatus: complaint.status,
          adminNotes: complaint.adminNotes,
        });
      }
    } catch (error) {
      console.error(`Failed to send complaint status email for ${complaint.id}:`, error);
    }
  }

  emitRequestChanged("complaint:updated", complaint);
  return res.json({ complaint });
}

async function remove(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid record identifier.", code: "INVALID_ID" });
  }
  const complaint = await Complaint.findByIdAndDelete(req.params.id);
  if (!complaint) return res.status(404).json({ error: "Complaint not found." });
  if (complaint.resolutionProofImage) {
    await removePublicFileUrl(complaint.resolutionProofImage).catch(() => false);
  }
  emitRequestDeleted("complaint:deleted", complaint);
  return res.json({ message: "Complaint deleted successfully." });
}

module.exports = { asyncRoute, list, getById, getHistory, create, update, remove };