const crypto = require("node:crypto");
const mongoose = require("mongoose");

function createTicketId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const suffix = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  return `AST-${suffix}`;
}

const assistanceRequestSchema = new mongoose.Schema(
  {
    ticketId: { type: String, unique: true, default: createTicketId, immutable: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 10000 },
    category: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true, maxlength: 1000 },
    photo: { type: String, required: true },
    contactInfo: { type: String, required: true, match: /^\d{11}$/ },
    status: {
      type: String,
      enum: ["pending", "in-progress", "resolved", "rejected"],
      default: "pending",
      required: true,
    },
    dateSubmitted: { type: Date, default: Date.now, required: true },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium", required: true },
    adminNotes: { type: String, default: "", maxlength: 10000 },
    resolutionProofImage: { type: String, default: null },
    resolutionProofUploadedAt: { type: Date, default: null },
    resolutionProofUploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    respondent: { type: String, default: "", trim: true, maxlength: 500 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    userName: { type: String, required: true, trim: true, maxlength: 160 },
    latitude: { type: Number, min: -90, max: 90, default: null },
    longitude: { type: Number, min: -180, max: 180, default: null },
  },
  {
    timestamps: true,
    collection: "assistance_requests",
    toJSON: {
      transform(_document, value) {
        value.id = value._id.toString();
        delete value._id;
        delete value.__v;
        return value;
      },
    },
  },
);

assistanceRequestSchema.index({ userId: 1, dateSubmitted: -1 });
assistanceRequestSchema.index({ status: 1, dateSubmitted: -1 });
assistanceRequestSchema.index({ latitude: 1, longitude: 1 });

module.exports = mongoose.model("AssistanceRequest", assistanceRequestSchema);