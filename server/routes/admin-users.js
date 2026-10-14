const express = require("express");
const { asyncRoute } = require("../controllers/complaintController");
const { listUsers, updateUser, reviewRegistration, archiveUser, unarchiveUser } = require("../controllers/userController");
const { authenticate } = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");

const router = express.Router();
router.use(authenticate, authorize("admin"));
router.get("/", asyncRoute(listUsers));
router.put("/:userId/verify-address", asyncRoute(reviewRegistration));
router.put("/:userId", asyncRoute(updateUser));
router.patch("/:userId/archive", asyncRoute(archiveUser));
router.patch("/:userId/unarchive", asyncRoute(unarchiveUser));

module.exports = router;