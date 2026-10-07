const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Complaint = require("../models/Complaint");
const AssistanceRequest = require("../models/AssistanceRequest");
const RequestHistory = require("../models/RequestHistory");
const User = require("../models/User");
const { sendVerificationCode, sendPasswordRecoveryCode } = require("../services/email");
const { validatePassword } = require("../services/password-policy");
const { removeOwnedPublicFileUrl } = require("../services/storage-service");

const OTP_LENGTH = 6;
const OTP_EXPIRATION_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_RESEND_LIMIT = 3;
const PASSWORD_RECOVERY_MESSAGE = "If an account exists for this email, a verification code has been sent.";
const PASSWORD_RECOVERY_TOKEN_MINUTES = 10;

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function generateOtp() {
  const range = 10 ** OTP_LENGTH;
  return crypto.randomInt(0, range).toString().padStart(OTP_LENGTH, "0");
}

function hashRecoveryToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function login(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required.", code: "MISSING_CREDENTIALS" });
    }

    const user = await User.findOne({ email }).select("+passwordHash");
    const passwordMatches = user && await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
    }
    if (user.accountStatus === "pending") {
      return res.status(403).json({ error: "Account is awaiting admin approval.", code: "ACCOUNT_PENDING" });
    }
    if (user.accountStatus === "rejected") {
      return res.status(403).json({ error: "Account registration was rejected.", code: "ACCOUNT_REJECTED" });
    }
    if (!user.emailVerified) {
      return res.status(403).json({ error: "Email address has not been verified.", code: "EMAIL_UNVERIFIED" });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: "Account is inactive.", code: "ACCOUNT_INACTIVE" });
    }

    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({ token, user: user.toJSON() });
  } catch (error) {
    return next(error);
  }
}

async function getCurrentUser(req, res) {
  return res.json({ user: req.user.toJSON() });
}

async function updateProfile(req, res, next) {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const phoneNumber = typeof req.body.phoneNumber === "string" ? req.body.phoneNumber.trim() : "";

    if (!name) {
      return res.status(400).json({ error: "A valid name is required.", code: "INVALID_NAME" });
    }
    if (phoneNumber && !/^\d{11}$/.test(phoneNumber)) {
      return res.status(400).json({ error: "Phone number must be exactly 11 digits.", code: "INVALID_PHONE_NUMBER" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "Authenticated account not found.", code: "ACCOUNT_NOT_FOUND" });
    }

    user.name = name;
    user.phoneNumber = phoneNumber || null;
    await user.save();
    return res.json({ profile: user.toJSON() });
  } catch (error) {
    return next(error);
  }
}

async function updateNotificationSettings(req, res, next) {
  try {
    if (typeof req.body.emailNotifications !== "boolean") {
      return res.status(400).json({
        error: "Email notifications must be enabled or disabled.",
        code: "INVALID_NOTIFICATION_SETTINGS",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "Authenticated account not found.", code: "ACCOUNT_NOT_FOUND" });
    }

    user.emailNotifications = req.body.emailNotifications;
    await user.save();
    return res.json({ profile: user.toJSON() });
  } catch (error) {
    return next(error);
  }
}

async function deleteCurrentUserAccount(req, res, next) {
  const session = await User.startSession();
  let filesToRemove = [];

  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      if (!user) {
        const error = new Error("Authenticated account not found.");
        error.status = 404;
        error.code = "ACCOUNT_NOT_FOUND";
        throw error;
      }

      filesToRemove = [];
      if (user.profilePictureUrl) {
        filesToRemove.push({
          fileUrl: user.profilePictureUrl,
          kind: "profile",
          ownerId: user.id,
        });
      }

      const complaints = await Complaint.find({ userId: user._id })
        .select("_id resolutionProofImage")
        .session(session)
        .lean();
      const assistanceRequests = await AssistanceRequest.find({ userId: user._id })
        .select("_id resolutionProofImage")
        .session(session)
        .lean();

      for (const complaint of complaints) {
        if (complaint.resolutionProofImage) {
          filesToRemove.push({
            fileUrl: complaint.resolutionProofImage,
            kind: "complaint-proof",
            ownerId: String(complaint._id),
          });
        }
      }
      for (const request of assistanceRequests) {
        if (request.resolutionProofImage) {
          filesToRemove.push({
            fileUrl: request.resolutionProofImage,
            kind: "assistance-proof",
            ownerId: String(request._id),
          });
        }
      }

      const complaintIds = complaints.map(({ _id }) => _id);
      const assistanceRequestIds = assistanceRequests.map(({ _id }) => _id);

      if (complaintIds.length) {
        await Complaint.deleteMany({
          _id: { $in: complaintIds },
          userId: user._id,
        }).session(session);
        await RequestHistory.deleteMany({
          requestType: "complaint",
          requestId: { $in: complaintIds },
        }).session(session);
      }
      if (assistanceRequestIds.length) {
        await AssistanceRequest.deleteMany({
          _id: { $in: assistanceRequestIds },
          userId: user._id,
        }).session(session);
        await RequestHistory.deleteMany({
          requestType: "assistance",
          requestId: { $in: assistanceRequestIds },
        }).session(session);
      }

      const deletion = await User.deleteOne({ _id: user._id }).session(session);
      if (!deletion.deletedCount) {
        const error = new Error("Authenticated account not found.");
        error.status = 404;
        error.code = "ACCOUNT_NOT_FOUND";
        throw error;
      }
    });

    const cleanupFailures = [];
    for (const file of filesToRemove) {
      try {
        await removeOwnedPublicFileUrl(file.fileUrl, file.kind, file.ownerId);
      } catch (error) {
        console.error(`Failed to remove account-owned ${file.kind} file:`, error);
        cleanupFailures.push(file.kind);
      }
    }

    return res.json({
      message: "Account deleted successfully.",
      ...(cleanupFailures.length
        ? { warning: "The account was deleted, but some uploaded files could not be removed." }
        : {}),
    });
  } catch (error) {
    return next(error);
  } finally {
    await session.endSession();
  }
}

async function register(req, res, next) {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const phoneNumber = typeof req.body.phoneNumber === "string" ? req.body.phoneNumber.trim() : "";

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "A valid email address is required.", code: "INVALID_EMAIL" });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({ error: "Password is too weak. Use at least 8 characters and meet the password strength requirements.", code: "INVALID_PASSWORD" });
  }
  if (!name || name.length > 160) {
    return res.status(400).json({ error: "A valid name is required.", code: "INVALID_NAME" });
  }
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ error: "An account with this email already exists.", code: "DUPLICATE_EMAIL" });
  }

  const user = new User({
    email,
    passwordHash: await bcrypt.hash(password, 12),
    name,
    phoneNumber: phoneNumber || null,
    role: "resident",
    isActive: false,
    accountStatus: "pending",
    emailVerified: false,
  });

  try {
    const otp = generateOtp();
    user.emailOtpHash = await bcrypt.hash(otp, 12);
    user.emailOtpExpiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);
    user.emailOtpAttempts = 0;
    user.emailOtpLastSentAt = new Date();
    user.emailOtpResendCount = 1;
    user.emailOtpVerifiedAt = null;

    await user.save();
    await sendVerificationCode(email, otp);

    return res.status(202).json({
      message: "Verification code sent to your email. Please enter it to complete registration.",
      email,
      requiresOtp: true,
      otpExpiresInMinutes: OTP_EXPIRATION_MINUTES,
      otpResendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    });
  } catch (error) {
    if (error && (error.code === "EMAIL_SERVICE_NOT_CONFIGURED" || error.code === "EMAIL_DELIVERY_FAILED")) {
      user.emailOtpHash = null;
      user.emailOtpExpiresAt = null;
      user.emailOtpAttempts = 0;
      user.emailOtpLastSentAt = null;
      user.emailOtpResendCount = 0;
      await user.save();
    }

    if (error && error.code === "EMAIL_SERVICE_NOT_CONFIGURED") {
      return res.status(503).json({ error: error.message, code: error.code });
    }
    if (error && error.code === "EMAIL_DELIVERY_FAILED") {
      return res.status(503).json({ error: error.message, code: error.code });
    }
    return next(error);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email address is required.", code: "INVALID_EMAIL" });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: "A valid 6-digit verification code is required.", code: "INVALID_OTP" });
    }

    const user = await User.findOne({ email }).select("+emailOtpHash +emailOtpExpiresAt +emailOtpAttempts");
    if (!user) {
      return res.status(404).json({ error: "No registration was found for this email.", code: "USER_NOT_FOUND" });
    }
    if (user.emailVerified) {
      return res.status(409).json({ error: "This registration has already been verified.", code: "REGISTRATION_ALREADY_VERIFIED" });
    }
    if (!user.emailOtpHash || !user.emailOtpExpiresAt) {
      return res.status(400).json({ error: "There is no active verification code for this registration.", code: "INVALID_REGISTRATION_STATE" });
    }
    if (new Date(user.emailOtpExpiresAt).getTime() <= Date.now()) {
      user.emailOtpHash = null;
      user.emailOtpExpiresAt = null;
      user.emailOtpAttempts = 0;
      await user.save();
      return res.status(410).json({ error: "Your verification code has expired. Please request a new one.", code: "OTP_EXPIRED" });
    }
    if (user.emailOtpAttempts >= OTP_MAX_ATTEMPTS) {
      user.emailOtpHash = null;
      user.emailOtpExpiresAt = null;
      user.emailOtpAttempts = 0;
      await user.save();
      return res.status(429).json({ error: "Too many verification attempts. Please request a new code.", code: "OTP_ATTEMPT_LIMIT_REACHED" });
    }

    const matches = await bcrypt.compare(otp, user.emailOtpHash);
    if (!matches) {
      user.emailOtpAttempts += 1;
      await user.save();

      if (user.emailOtpAttempts >= OTP_MAX_ATTEMPTS) {
        user.emailOtpHash = null;
        user.emailOtpExpiresAt = null;
        user.emailOtpAttempts = 0;
        await user.save();
        return res.status(429).json({ error: "Too many incorrect verification attempts. Please request a new code.", code: "OTP_ATTEMPT_LIMIT_REACHED" });
      }

      return res.status(400).json({ error: "The verification code is incorrect.", code: "INVALID_OTP" });
    }

    user.emailVerified = true;
    user.emailOtpHash = null;
    user.emailOtpExpiresAt = null;
    user.emailOtpAttempts = 0;
    user.emailOtpVerifiedAt = new Date();
    await user.save();

    return res.json({
      message: "Email verified successfully.",
      verified: true,
      user: user.toJSON(),
    });
  } catch (error) {
    return next(error);
  }
}

async function resendVerification(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email address is required.", code: "INVALID_EMAIL" });
    }

    const user = await User.findOne({ email }).select("+emailOtpHash +emailOtpExpiresAt +emailOtpAttempts +emailOtpLastSentAt +emailOtpResendCount");
    if (!user) {
      return res.status(404).json({ error: "No registration was found for this email.", code: "USER_NOT_FOUND" });
    }
    if (user.emailVerified) {
      return res.status(409).json({ error: "This registration has already been verified.", code: "REGISTRATION_ALREADY_VERIFIED" });
    }

    const lastSentAt = user.emailOtpLastSentAt ? new Date(user.emailOtpLastSentAt).getTime() : 0;
    const resendCooldownRemaining = Math.max(0, OTP_RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - lastSentAt) / 1000));
    if (lastSentAt && resendCooldownRemaining > 0) {
      return res.status(429).json({
        error: `Please wait ${resendCooldownRemaining} seconds before requesting a new verification code.`,
        code: "OTP_RESEND_COOLDOWN",
      });
    }

    if ((user.emailOtpResendCount || 0) >= OTP_RESEND_LIMIT) {
      return res.status(429).json({
        error: "You have reached the maximum number of OTP resend attempts. Please contact support.",
        code: "OTP_RESEND_LIMIT_REACHED",
      });
    }

    const previousOtp = {
      emailOtpHash: user.emailOtpHash,
      emailOtpExpiresAt: user.emailOtpExpiresAt,
      emailOtpAttempts: user.emailOtpAttempts,
      emailOtpLastSentAt: user.emailOtpLastSentAt,
      emailOtpResendCount: user.emailOtpResendCount,
    };
    const otp = generateOtp();
    user.emailOtpHash = await bcrypt.hash(otp, 12);
    user.emailOtpExpiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);
    user.emailOtpAttempts = 0;
    user.emailOtpLastSentAt = new Date();
    user.emailOtpResendCount = (user.emailOtpResendCount || 0) + 1;
    await user.save();

    try {
      await sendVerificationCode(email, otp);
      return res.json({
        message: "A new verification code has been sent to your email.",
        email,
        requiresOtp: true,
        otpResendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      });
    } catch (error) {
      if (error && (error.code === "EMAIL_SERVICE_NOT_CONFIGURED" || error.code === "EMAIL_DELIVERY_FAILED")) {
        Object.assign(user, previousOtp);
        await user.save();
        return res.status(503).json({ error: error.message, code: error.code });
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
}

async function requestPasswordRecovery(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email address is required.", code: "INVALID_EMAIL" });
    }

    const genericResponse = () => res.status(202).json({
      message: PASSWORD_RECOVERY_MESSAGE,
      otpExpiresInMinutes: OTP_EXPIRATION_MINUTES,
      otpResendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    });
    const user = await User.findOne({ email, emailVerified: true }).select(
      "+passwordRecoveryOtpHash +passwordRecoveryOtpExpiresAt +passwordRecoveryOtpAttempts +passwordRecoveryOtpLastSentAt +passwordRecoveryOtpResendCount +passwordRecoveryTokenHash +passwordRecoveryTokenExpiresAt",
    );
    if (!user) return genericResponse();

    const now = Date.now();
    const lastSentAt = user.passwordRecoveryOtpLastSentAt
      ? user.passwordRecoveryOtpLastSentAt.getTime()
      : 0;
    const withinRecoveryWindow = lastSentAt
      && now - lastSentAt < OTP_EXPIRATION_MINUTES * 60 * 1000;
    if (lastSentAt && now - lastSentAt < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      return genericResponse();
    }
    if (withinRecoveryWindow && (user.passwordRecoveryOtpResendCount || 0) >= OTP_RESEND_LIMIT) {
      return genericResponse();
    }
    if (!withinRecoveryWindow) {
      user.passwordRecoveryOtpResendCount = 0;
      user.passwordRecoveryOtpAttempts = 0;
    }

    const previousState = {
      passwordRecoveryOtpHash: user.passwordRecoveryOtpHash,
      passwordRecoveryOtpExpiresAt: user.passwordRecoveryOtpExpiresAt,
      passwordRecoveryOtpAttempts: user.passwordRecoveryOtpAttempts,
      passwordRecoveryOtpLastSentAt: user.passwordRecoveryOtpLastSentAt,
      passwordRecoveryOtpResendCount: user.passwordRecoveryOtpResendCount,
      passwordRecoveryTokenHash: user.passwordRecoveryTokenHash,
      passwordRecoveryTokenExpiresAt: user.passwordRecoveryTokenExpiresAt,
    };
    const otp = generateOtp();
    user.passwordRecoveryOtpHash = await bcrypt.hash(otp, 12);
    user.passwordRecoveryOtpExpiresAt = new Date(now + OTP_EXPIRATION_MINUTES * 60 * 1000);
    user.passwordRecoveryOtpAttempts = 0;
    user.passwordRecoveryOtpLastSentAt = new Date(now);
    user.passwordRecoveryOtpResendCount = (user.passwordRecoveryOtpResendCount || 0) + 1;
    user.passwordRecoveryTokenHash = null;
    user.passwordRecoveryTokenExpiresAt = null;

    await user.save();
    try {
      await sendPasswordRecoveryCode(email, otp);
    } catch (error) {
      Object.assign(user, previousState);
      await user.save();
      if (error && (error.code === "EMAIL_SERVICE_NOT_CONFIGURED" || error.code === "EMAIL_DELIVERY_FAILED")) {
        return res.status(503).json({ error: error.message, code: error.code });
      }
      throw error;
    }

    return genericResponse();
  } catch (error) {
    return next(error);
  }
}

async function verifyPasswordRecoveryOtp(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email address is required.", code: "INVALID_EMAIL" });
    }
    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otp)) {
      return res.status(400).json({ error: `A valid ${OTP_LENGTH}-digit verification code is required.`, code: "INVALID_OTP" });
    }

    const user = await User.findOne({ email, emailVerified: true }).select(
      "+passwordRecoveryOtpHash +passwordRecoveryOtpExpiresAt +passwordRecoveryOtpAttempts +passwordRecoveryTokenHash +passwordRecoveryTokenExpiresAt",
    );
    if (!user) {
      return res.status(400).json({ error: "The verification code is invalid or expired.", code: "INVALID_OTP" });
    }
    if (user.passwordRecoveryTokenHash && user.passwordRecoveryTokenExpiresAt
      && user.passwordRecoveryTokenExpiresAt.getTime() > Date.now()) {
      return res.status(409).json({ error: "This verification code has already been used.", code: "OTP_ALREADY_USED" });
    }
    if (!user.passwordRecoveryOtpHash || !user.passwordRecoveryOtpExpiresAt) {
      return res.status(400).json({ error: "The verification code is invalid or expired.", code: "INVALID_OTP" });
    }
    if (user.passwordRecoveryOtpExpiresAt.getTime() <= Date.now()) {
      user.passwordRecoveryOtpHash = null;
      user.passwordRecoveryOtpExpiresAt = null;
      user.passwordRecoveryOtpAttempts = 0;
      await user.save();
      return res.status(410).json({ error: "The verification code has expired. Please request a new one.", code: "OTP_EXPIRED" });
    }
    if (user.passwordRecoveryOtpAttempts >= OTP_MAX_ATTEMPTS) {
      user.passwordRecoveryOtpHash = null;
      user.passwordRecoveryOtpExpiresAt = null;
      await user.save();
      return res.status(429).json({ error: "Too many verification attempts. Please request a new code.", code: "OTP_ATTEMPT_LIMIT_REACHED" });
    }

    const matches = await bcrypt.compare(otp, user.passwordRecoveryOtpHash);
    if (!matches) {
      user.passwordRecoveryOtpAttempts += 1;
      if (user.passwordRecoveryOtpAttempts >= OTP_MAX_ATTEMPTS) {
        user.passwordRecoveryOtpHash = null;
        user.passwordRecoveryOtpExpiresAt = null;
        await user.save();
        return res.status(429).json({ error: "Too many incorrect verification attempts. Please request a new code.", code: "OTP_ATTEMPT_LIMIT_REACHED" });
      }
      await user.save();
      return res.status(400).json({ error: "The verification code is incorrect.", code: "INVALID_OTP" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordRecoveryOtpHash = null;
    user.passwordRecoveryOtpExpiresAt = null;
    user.passwordRecoveryOtpAttempts = 0;
    user.passwordRecoveryTokenHash = hashRecoveryToken(resetToken);
    user.passwordRecoveryTokenExpiresAt = new Date(
      Date.now() + PASSWORD_RECOVERY_TOKEN_MINUTES * 60 * 1000,
    );
    await user.save();

    return res.json({
      verified: true,
      resetToken,
      resetTokenExpiresInMinutes: PASSWORD_RECOVERY_TOKEN_MINUTES,
    });
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const resetToken = typeof req.body.resetToken === "string" ? req.body.resetToken : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const confirmPassword = typeof req.body.confirmPassword === "string" ? req.body.confirmPassword : "";
    if (!/^[a-f0-9]{64}$/.test(resetToken)) {
      return res.status(400).json({ error: "The password reset session is invalid or expired.", code: "INVALID_RESET_TOKEN" });
    }
    if (!password || !confirmPassword) {
      return res.status(400).json({ error: "New password and confirmation are required.", code: "MISSING_PASSWORD" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match.", code: "PASSWORD_MISMATCH" });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: "Password is too weak. Use at least 8 characters and meet the password strength requirements.", code: "INVALID_PASSWORD" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const updatedUser = await User.findOneAndUpdate(
      {
        passwordRecoveryTokenHash: hashRecoveryToken(resetToken),
        passwordRecoveryTokenExpiresAt: { $gt: new Date() },
      },
      {
        $set: { passwordHash },
        $unset: {
          passwordRecoveryOtpHash: 1,
          passwordRecoveryOtpExpiresAt: 1,
          passwordRecoveryOtpAttempts: 1,
          passwordRecoveryOtpLastSentAt: 1,
          passwordRecoveryOtpResendCount: 1,
          passwordRecoveryTokenHash: 1,
          passwordRecoveryTokenExpiresAt: 1,
        },
      },
      { new: true },
    );
    if (!updatedUser) {
      return res.status(410).json({ error: "The password reset session is invalid, expired, or already used.", code: "RESET_TOKEN_INVALID_OR_USED" });
    }

    return res.json({ message: "Password reset successfully." });
  } catch (error) {
    return next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
    const confirmPassword = typeof req.body.confirmPassword === "string" ? req.body.confirmPassword : "";
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "Current password, new password, and confirmation are required.", code: "MISSING_PASSWORD" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New password and confirmation do not match.", code: "PASSWORD_MISMATCH" });
    }
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: "Password is too weak. Use at least 8 characters and meet the password strength requirements.", code: "INVALID_PASSWORD" });
    }

    const user = await User.findById(req.user._id).select("+passwordHash");
    if (!user) {
      return res.status(401).json({ error: "Authenticated account not found.", code: "ACCOUNT_NOT_FOUND" });
    }
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) {
      return res.status(400).json({ error: "Current password is incorrect.", code: "CURRENT_PASSWORD_INCORRECT" });
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({ error: "New password must be different from your current password.", code: "PASSWORD_UNCHANGED" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    return res.json({ message: "Password changed successfully." });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
  getCurrentUser,
  updateProfile,
  updateNotificationSettings,
  deleteCurrentUserAccount,
  register,
  resendVerification,
  verifyEmail,
  requestPasswordRecovery,
  verifyPasswordRecoveryOtp,
  resetPassword,
  changePassword,
};