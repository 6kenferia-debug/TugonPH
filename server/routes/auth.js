const express = require("express");
const {
  getCurrentUser,
  login,
  register,
  requestPasswordRecovery,
  verifyPasswordRecoveryOtp,
  resetPassword,
  changePassword,
  resendVerification,
  verifyEmail,
  updateProfile,
  updateNotificationSettings,
  deleteCurrentUserAccount,
} = require("../controllers/authController");
const { saveProfilePicture, asyncRoute } = require("../controllers/storageController");
const { authenticate } = require("../middleware/authenticate");
const { profileImageUpload } = require("../middleware/upload");

const router = express.Router();

router.post("/login", asyncRoute(login));
router.post("/register", asyncRoute(register));
router.post("/password-recovery/request", asyncRoute(requestPasswordRecovery));
router.post("/password-recovery/verify", asyncRoute(verifyPasswordRecoveryOtp));
router.post("/password-recovery/reset", asyncRoute(resetPassword));
router.put("/password", authenticate, asyncRoute(changePassword));
router.post("/verify-email", asyncRoute(verifyEmail));
router.post("/resend-verification", asyncRoute(resendVerification));
router.get("/me", authenticate, asyncRoute(getCurrentUser));
router.put("/profile", authenticate, asyncRoute(updateProfile));
router.put("/notifications", authenticate, asyncRoute(updateNotificationSettings));
router.delete("/profile", authenticate, asyncRoute(deleteCurrentUserAccount));
router.put("/profile/picture", authenticate, profileImageUpload, asyncRoute(saveProfilePicture));

module.exports = router;