const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["resident", "admin"], default: "resident", required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    phoneNumber: { type: String, default: null, trim: true, match: /^\d{11}$/ },
    profilePictureUrl: { type: String, default: null },
    emailNotifications: { type: Boolean, default: true },
    isActive: { type: Boolean, default: false, index: true },
    accountStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    requiredBarangay: {
      type: String,
      default: "Barangay 407, Zone 42, District IV, Sampaloc, Manila",
    },
    emailVerified: { type: Boolean, default: false, index: true },
    emailOtpHash: { type: String, default: null, select: false },
    emailOtpExpiresAt: { type: Date, default: null, select: false },
    emailOtpAttempts: { type: Number, default: 0, select: false },
    emailOtpLastSentAt: { type: Date, default: null, select: false },
    emailOtpResendCount: { type: Number, default: 0, select: false },
    emailOtpVerifiedAt: { type: Date, default: null, select: false },
    passwordRecoveryOtpHash: { type: String, default: null, select: false },
    passwordRecoveryOtpExpiresAt: { type: Date, default: null, select: false },
    passwordRecoveryOtpAttempts: { type: Number, default: 0, select: false },
    passwordRecoveryOtpLastSentAt: { type: Date, default: null, select: false },
    passwordRecoveryOtpResendCount: { type: Number, default: 0, select: false },
    passwordRecoveryTokenHash: { type: String, default: null, select: false, index: true },
    passwordRecoveryTokenExpiresAt: { type: Date, default: null, select: false },
    addressRejectionReason: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_document, value) {
        value.id = value._id.toString();
        delete value._id;
        delete value.__v;
        delete value.passwordHash;
        delete value.emailOtpHash;
        delete value.emailOtpExpiresAt;
        delete value.emailOtpAttempts;
        delete value.emailOtpLastSentAt;
        delete value.emailOtpResendCount;
        delete value.emailOtpVerifiedAt;
        delete value.passwordRecoveryOtpHash;
        delete value.passwordRecoveryOtpExpiresAt;
        delete value.passwordRecoveryOtpAttempts;
        delete value.passwordRecoveryOtpLastSentAt;
        delete value.passwordRecoveryOtpResendCount;
        delete value.passwordRecoveryTokenHash;
        delete value.passwordRecoveryTokenExpiresAt;
        return value;
      },
    },
  },
);

userSchema.index({ accountStatus: 1, createdAt: -1 });

module.exports = mongoose.model("User", userSchema);