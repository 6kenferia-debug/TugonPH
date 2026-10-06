const User = require("../models/User");
const { removeUserFiles } = require("./storageController");

function serializeUser(user) {
  return user.toJSON();
}

async function listUsers(req, res) {
  const users = await User.find().sort({ createdAt: -1 });
  return res.json({ users: users.map(serializeUser) });
}

async function updateUser(req, res) {
  const allowed = ["isActive", "accountStatus"];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "No supported user fields were provided." });
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

  const accountStatus = status === "verified" ? "approved" : status;
  const updates = {
    accountStatus,
    isActive: status === "verified" || status === "approved",
    addressRejectionReason: status === "rejected" ? String(rejectionReason).trim() : null,
  };
  const user = await User.findByIdAndUpdate(req.params.userId, updates, { returnDocument: "after", runValidators: true });
  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json({ profile: serializeUser(user) });
}

async function deleteUser(req, res) {
  const user = await User.findByIdAndDelete(req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  await removeUserFiles(user);
  return res.json({ message: "User deleted successfully." });
}

module.exports = { listUsers, updateUser, reviewRegistration, deleteUser };