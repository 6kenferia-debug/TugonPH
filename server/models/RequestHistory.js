const mongoose = require("mongoose");

const requestHistorySchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    requestType: {
      type: String,
      enum: ["complaint", "assistance"],
      required: true,
      index: true,
    },
    action: { type: String, required: true, trim: true, maxlength: 200 },
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    details: { type: String, default: "", trim: true, maxlength: 10000 },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    performedByName: { type: String, default: "System", trim: true, maxlength: 160 },
    performedByRole: { type: String, default: "system", trim: true, maxlength: 80 },
    createdAt: { type: Date, default: Date.now, required: true, index: true },
  },
  {
    timestamps: false,
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

requestHistorySchema.index({ requestId: 1, requestType: 1, createdAt: -1 });

module.exports = mongoose.model("RequestHistory", requestHistorySchema);
