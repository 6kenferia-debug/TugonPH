const express = require("express");
const { asyncRoute } = require("../controllers/complaintController");
const { deleteUser, listUsers, updateUser, reviewRegistration } = require("../controllers/userController");
const { authenticate } = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");

const router = express.Router();
router.use(authenticate, authorize("admin"));
router.get("/", asyncRoute(listUsers));
router.put("/:userId/verify-address", asyncRoute(reviewRegistration));
router.put("/:userId", asyncRoute(updateUser));
router.delete("/:userId", asyncRoute(deleteUser));

module.exports = router;