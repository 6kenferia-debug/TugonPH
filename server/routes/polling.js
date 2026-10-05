const express = require("express");
const Complaint = require("../models/Complaint");
const AssistanceRequest = require("../models/AssistanceRequest");
const { authenticate } = require("../middleware/authenticate");

const router = express.Router();

// Simple polling endpoint - returns items changed since timestamp
router.get("/complaints", authenticate, async (req, res, next) => {
  try {
    const since = parseInt(req.query.since) || 0;
    const sinceDate = new Date(since);

    const user = req.user;
    const query = { userId: user.id };

    // Get created/updated complaints since the timestamp
    const complaints = await Complaint.find({
      ...query,
      updatedAt: { $gte: sinceDate },
    })
      .sort({ updatedAt: -1 })
      .limit(50);

    return res.json({
      created: complaints.filter((c) => c.createdAt >= sinceDate),
      updated: complaints.filter((c) => c.createdAt < sinceDate),
      deleted: [],
    });
  } catch (error) {
    next(error);
  }
});

router.get("/assistance-requests", authenticate, async (req, res, next) => {
  try {
    const since = parseInt(req.query.since) || 0;
    const sinceDate = new Date(since);

    const user = req.user;
    const query = { userId: user.id };

    // Get created/updated assistance requests since the timestamp
    const requests = await AssistanceRequest.find({
      ...query,
      updatedAt: { $gte: sinceDate },
    })
      .sort({ updatedAt: -1 })
      .limit(50);

    return res.json({
      created: requests.filter((r) => r.createdAt >= sinceDate),
      updated: requests.filter((r) => r.createdAt < sinceDate),
      deleted: [],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
