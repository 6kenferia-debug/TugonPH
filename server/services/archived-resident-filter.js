function archivedResidentFilter() {
  return {
    $or: [
      { isArchived: true },
      { role: "resident", deactivatedAt: { $ne: null } },
      { role: "resident", accountStatus: "approved", isActive: { $ne: true } },
    ],
  };
}

module.exports = { archivedResidentFilter };
