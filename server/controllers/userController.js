const User = require("../models/User");
const { archivedResidentFilter } = require("../services/archived-resident-filter");

function serializeUser(user) {
  return user.toJSON();
}

async function listUsers(req, res) {
  const archived = req.query.archived === "true";
  if (req.query.archived !== undefined && !["true", "false"].includes(req.query.archived)) {
    return res.status(400).json({ error: "archived must be true or false." });
  }
  const filter = archived
    ? archivedResidentFilter()
    : {
        isArchived: { $ne: true },
        $nor: [
          { role: "resident", deactivatedAt: { $ne: null } },
          { role: "resident", accountStatus: "approved", isActive: { $ne: true } },
        ],
      };
  const users = await User.find(filter).sort({ createdAt: -1 });
  return res.json({ users: users.map(serializeUser) });
}

async function updateUser(req, res) {
  const allowed = ["isActive", "accountStatus"];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "No supported user fields were provided." });
  }
  const existingUser = await User.findById(req.params.userId);
  if (!existingUser) return res.status(404).json({ error: "User not found." });
  if (existingUser.isArchived) {
    return res.status(409).json({ error: "Restore this account before changing its status." });
  }
  if (typeof updates.isActive === "boolean") {
    updates.deactivatedAt = updates.isActive ? null : new Date();
    updates.selfDeactivated = false;
  }
  const user = await User.findByIdAndUpdate(req.params.userId, updates, { returnDocument: "after", runValidators: true });
  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json({ profile: serializeUser(user) });
}

async function reviewRegistration(req, res) {
  const { status, rejectionReason } = req.body;
  if (!["verified", "approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "Status must be verified, approved, rejected, or pending." });
  }
  if (status === "rejected" && !String(rejectionReason || "").trim()) {
    return res.status(400).json({ error: "A rejection reason is required." });
  }

  const existingUser = await User.findById(req.params.userId);
  if (!existingUser) return res.status(404).json({ error: "User not found." });
  if (existingUser.isArchived) {
    return res.status(409).json({ error: "Restore this account before reviewing its registration." });
  }

  const accountStatus = status === "verified" ? "approved" : status;
  const updates = {
    accountStatus,
    isActive: status === "verified" || status === "approved",
    selfDeactivated: false,
    deactivatedAt: null,
    addressRejectionReason: status === "rejected" ? String(rejectionReason).trim() : null,
  };
  const user = await User.findByIdAndUpdate(req.params.userId, updates, { returnDocument: "after", runValidators: true });
  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json({ profile: serializeUser(user) });
}

async function archiveUser(req, res) {
  const user = await User.findById(req.params.userId).select("+wasActiveBeforeArchive");
  if (!user) return res.status(404).json({ error: "User not found." });
  if (String(user._id) === String(req.user._id)) {
    return res.status(400).json({ error: "You cannot archive your own administrator account." });
  }
  if (user.role === "admin") {
    return res.status(400).json({ error: "Administrator accounts cannot be archived here." });
  }
  if (!user.isArchived) {
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length > 500) return res.status(400).json({ error: "Archive reason must be 500 characters or fewer." });
    user.wasActiveBeforeArchive = user.isActive;
    user.isActive = false;
    user.isArchived = true;
    user.archivedAt = new Date();
    user.archivedBy = req.user._id;
    user.archiveReason = reason;
    await user.save();
  }
  return res.json({ user: serializeUser(user), message: "User account archived successfully." });
}

async function unarchiveUser(req, res) {
  const user = await User.findById(req.params.userId).select("+wasActiveBeforeArchive");
  if (!user) return res.status(404).json({ error: "User not found." });
  if (user.isArchived) {
    user.isArchived = false;
    user.isActive = user.wasActiveBeforeArchive;
    user.wasActiveBeforeArchive = false;
    user.archivedAt = null;
    user.archivedBy = null;
    user.archiveReason = "";
    await user.save();
  }
  return res.json({ user: serializeUser(user), message: "User account restored successfully." });
}

module.exports = { listUsers, updateUser, reviewRegistration, archiveUser, unarchiveUser };