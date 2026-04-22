const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    available: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      default: "",
      maxlength: 500,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

menuItemSchema.index({ name: 1, category: 1 }, { unique: true });

module.exports = mongoose.model("MenuItem", menuItemSchema);
