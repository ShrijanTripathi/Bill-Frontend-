const mongoose = require("mongoose");

const saleArchiveSchema = new mongoose.Schema(
  {
    originalSaleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    filter: {
      type: String,
      enum: ["today", "week", "month"],
      required: true,
    },
    deletedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    deletedBy: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160,
    },
    saleSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SaleArchive", saleArchiveSchema);
