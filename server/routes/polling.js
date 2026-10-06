const express = require("express");
const Complaint = require("../models/Complaint");
const AssistanceRequest = require("../models/AssistanceRequest");
const { authenticate } = require("../middleware/authenticate");

const router = express.Router();

router.get("/complaints", authenticate, async (req, res, next) => {
  try {
    const query = req.user.role === "admin" ? {} : { userId: req.user.id };
    const complaints = await Complaint.find(query)
      .select("_id userId updatedAt")
      .lean();
    return res.json(complaints.map((complaint) => ({
      id: String(complaint._id),
      userId: complaint.userId == null ? null : String(complaint.userId),
      updatedAt: complaint.updatedAt.toISOString(),
    })));
  } catch (error) {
    next(error);
  }
});

router.get("/assistance-requests", authenticate, async (req, res, next) => {
  try {
    const query = req.user.role === "admin" ? {} : { userId: req.user.id };
    const requests = await AssistanceRequest.find(query)
      .select("_id userId updatedAt")
      .lean();
    return res.json(requests.map((request) => ({
      id: String(request._id),
      userId: request.userId == null ? null : String(request.userId),
      updatedAt: request.updatedAt.toISOString(),
    })));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
