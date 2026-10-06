const Complaint = require("../models/Complaint");
const AssistanceRequest = require("../models/AssistanceRequest");
const {
  getPublicFilePath,
  publicFileUrl,
  removePublicFileUrl,
  removeStoredFile,
  saveFile,
} = require("../services/storage-service");
const { createRequestHistoryEntry } = require("../services/requestHistory");

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

async function saveProfilePicture(req, res) {
  const user = req.user;
  const stored = await saveFile({
    kind: "profile",
    ownerId: user.id,
    buffer: req.file.buffer,
    mimeType: req.file.detectedMimeType,
  });
  const nextUrl = publicFileUrl(stored);
  const previousUrl = user.profilePictureUrl;

  try {
    user.profilePictureUrl = nextUrl;
    await user.save();
  } catch (error) {
    await removeStoredFile(stored);
    throw error;
  }

  if (previousUrl && previousUrl !== nextUrl) {
    await removePublicFileUrl(previousUrl).catch(() => false);
  }
  return res.json({ profile: user.toJSON() });
}

async function servePublicFile(req, res, next) {
  let absolutePath;
  try {
    absolutePath = getPublicFilePath(req.params[0]);
  } catch {
    return res.status(404).json({ error: "File not found." });
  }
  if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: "File not found." });
  return res.sendFile(absolutePath, (error) => {
    if (error && !res.headersSent) next(error);
  });
}

async function saveResolutionProof(req, res, Model, recordType) {
  const record = await Model.findById(req.params.id);
  if (!record) return res.status(404).json({ error: `${recordType} not found.` });

  const kind = recordType === "Complaint" ? "complaint-proof" : "assistance-proof";
  const stored = await saveFile({
    kind,
    ownerId: record.id,
    buffer: req.file.buffer,
    mimeType: req.file.detectedMimeType,
  });
  const nextUrl = publicFileUrl(stored);
  const previousUrl = record.resolutionProofImage;

  try {
    record.resolutionProofImage = nextUrl;
    record.resolutionProofUploadedAt = new Date();
    record.resolutionProofUploadedBy = req.user.id;
    await record.save();
  } catch (error) {
    await removeStoredFile(stored);
    throw error;
  }

  await createRequestHistoryEntry({
    requestType: recordType === "Complaint" ? "complaint" : "assistance",
    requestId: record._id,
    action: "Resolution proof uploaded",
    previousValue: previousUrl || null,
    newValue: nextUrl,
    details: `${recordType === "Complaint" ? "Complaint" : "Assistance request"} resolution proof uploaded.`,
    user: req.user,
  });

  if (previousUrl && previousUrl !== nextUrl) {
    await removePublicFileUrl(previousUrl).catch(() => false);
  }
  return res.json({ [recordType === "Complaint" ? "complaint" : "assistanceRequest"]: record, url: nextUrl });
}

const saveComplaintProof = (req, res) =>
  saveResolutionProof(req, res, Complaint, "Complaint");
const saveAssistanceProof = (req, res) =>
  saveResolutionProof(req, res, AssistanceRequest, "AssistanceRequest");

async function removeUserFiles(user) {
  const tasks = [];
  if (user.profilePictureUrl) tasks.push(removePublicFileUrl(user.profilePictureUrl));
  await Promise.all(tasks.map((task) => task.catch(() => false)));
}

module.exports = {
  asyncRoute,
  removeUserFiles,
  saveAssistanceProof,
  saveComplaintProof,
  saveProfilePicture,
  servePublicFile,
};