const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { sendVerificationCode } = require("../services/email");

const OTP_LENGTH = 6;
const OTP_EXPIRATION_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_RESEND_LIMIT = 3;

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function generateOtp() {
  const range = 10 ** OTP_LENGTH;
  return crypto.randomInt(0, range).toString().padStart(OTP_LENGTH, "0");
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

async function register(req, res, next) {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const phoneNumber = typeof req.body.phoneNumber === "string" ? req.body.phoneNumber.trim() : "";

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "A valid email address is required.", code: "INVALID_EMAIL" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters.", code: "INVALID_PASSWORD" });
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
    if (user && user._id) {
      await User.findByIdAndDelete(user._id).catch(() => {});
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
        return res.status(503).json({ error: error.message, code: error.code });
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
}

module.exports = { login, getCurrentUser, register, resendVerification, verifyEmail };