const express = require("express");
const {
  getCurrentUser,
  login,
  register,
  resendVerification,
  verifyEmail,
} = require("../controllers/authController");
const { saveProfilePicture, asyncRoute } = require("../controllers/storageController");
const { authenticate } = require("../middleware/authenticate");
const { profileImageUpload } = require("../middleware/upload");

const router = express.Router();

router.post("/login", asyncRoute(login));
router.post("/register", asyncRoute(register));
router.post("/verify-email", asyncRoute(verifyEmail));
router.post("/resend-verification", asyncRoute(resendVerification));
router.get("/me", authenticate, asyncRoute(getCurrentUser));
router.put("/profile/picture", authenticate, profileImageUpload, asyncRoute(saveProfilePicture));

module.exports = router;