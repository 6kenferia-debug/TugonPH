const { createRequestHistoryEntry } = require("./requestHistory");

async function restoreActiveRequests(Model, requestType, label) {
  const records = await Model.find({
    isArchived: true,
    status: { $in: ["pending", "in-progress"] },
  }).select("_id status");

  for (const record of records) {
    const result = await Model.updateOne(
      {
        _id: record._id,
        isArchived: true,
        status: { $in: ["pending", "in-progress"] },
      },
      {
        $set: {
          isArchived: false,
          archivedAt: null,
          archivedBy: null,
          archiveReason: "",
        },
      },
    );

    if (result.modifiedCount > 0) {
      await createRequestHistoryEntry({
        requestType,
        requestId: record._id,
        action: "Request restored",
        previousValue: "archived",
        newValue: "active",
        details: `${label} was automatically restored because pending and in-progress requests cannot be archived.`,
      });
    }
  }
}

module.exports = { restoreActiveRequests };
