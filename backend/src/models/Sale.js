const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema(
  {
    itemRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    category: {
      type: String,
      default: "Uncategorized",
      trim: true,
      maxlength: 60,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    qty: {
      type: Number,
      required: true,
      min: 1,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  }
);

const saleSchema = new mongoose.Schema(
  {
    saleType: {
      type: String,
      enum: ["ONLINE", "OFFLINE"],
      default: "ONLINE",
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    billNo: {
      type: Number,
      required: true,
      min: 1,
    },
    tokenNo: {
      type: Number,
      required: true,
      min: 1,
    },
    billedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    items: {
      type: [saleItemSchema],
      default: [],
    },
    totalQty: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    discountAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Sale", saleSchema);
