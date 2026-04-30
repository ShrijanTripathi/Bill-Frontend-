const mongoose = require("mongoose");

const ITEM_TYPES = ["regular", "combo", "addon", "beverage", "bread", "meal"];
const PRICING_TYPES = ["single", "half-full", "size-based", "custom"];
const VARIANT_CODES = ["half", "full", "small", "medium", "large", "custom"];

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hasPrice(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

const variantSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 40,
    },
    code: {
      type: String,
      enum: VARIANT_CODES,
      default: "custom",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: true,
  }
);

const addonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: true,
  }
);

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      default: function defaultSlug() {
        return slugify(this.name);
      },
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 160,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    itemType: {
      type: String,
      enum: ITEM_TYPES,
      default: "regular",
      index: true,
    },
    pricingType: {
      type: String,
      enum: PRICING_TYPES,
      default: "single",
      index: true,
    },
    basePrice: {
      type: Number,
      min: 0,
      default: null,
    },
    variants: {
      type: [variantSchema],
      default: [],
    },
    addons: {
      type: [addonSchema],
      default: [],
    },
    description: {
      type: String,
      default: "",
      maxlength: 1000,
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    isRecommended: {
      type: Boolean,
      default: false,
      index: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

menuItemSchema.pre("validate", function normalizeAndValidate(next) {
  if (this.isModified("name")) {
    this.name = normalizeText(this.name);
  }

  if (!this.slug || this.isModified("name")) {
    this.slug = slugify(this.name);
  } else {
    this.slug = slugify(this.slug);
  }

  this.tags = [...new Set((this.tags || []).map(normalizeText).filter(Boolean))];
  (this.addons || []).forEach((addon) => {
    addon.name = normalizeText(addon.name);
  });
  (this.variants || []).forEach((variant) => {
    variant.label = normalizeText(variant.label);
    variant.code = variant.code || "custom";
  });
  this.variants.sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));

  const hasBasePrice = hasPrice(this.basePrice);
  const hasVariants = Array.isArray(this.variants) && this.variants.length > 0;

  if (this.pricingType === "single" && !hasBasePrice) {
    this.invalidate("basePrice", "basePrice is required for single pricing");
  }

  if ((this.pricingType === "half-full" || this.pricingType === "size-based") && !hasVariants) {
    this.invalidate("variants", "variants are required for half-full and size-based pricing");
  }

  if (!hasBasePrice && !hasVariants) {
    this.invalidate("basePrice", "Either basePrice or variants are required");
  }

  const variantKeys = new Set();
  for (const variant of this.variants || []) {
    const key = `${normalizeText(variant.label).toLowerCase()}::${variant.code || "custom"}`;
    if (variantKeys.has(key)) {
      this.invalidate("variants", "Duplicate variant labels are not allowed");
      break;
    }
    variantKeys.add(key);
  }

  next();
});

menuItemSchema.path("basePrice").validate(function validateBasePrice(value) {
  const hasBasePrice = hasPrice(value);
  const hasVariants = Array.isArray(this.variants) && this.variants.length > 0;

  if (this.pricingType === "single") {
    return hasBasePrice;
  }

  return hasBasePrice || hasVariants;
}, "Either basePrice or variants are required");

menuItemSchema.path("variants").validate(function validateVariants(value) {
  const variants = Array.isArray(value) ? value : [];
  const hasVariants = variants.length > 0;
  const hasBasePrice = hasPrice(this.basePrice);

  if (this.pricingType === "half-full" || this.pricingType === "size-based") {
    return hasVariants;
  }

  return hasBasePrice || hasVariants;
}, "variants are required for half-full and size-based pricing");

menuItemSchema.index({ name: 1, category: 1 }, { unique: true });
menuItemSchema.index({ category: 1, isActive: 1, isAvailable: 1, sortOrder: 1, name: 1 });
menuItemSchema.index({ isActive: 1, isAvailable: 1, isRecommended: 1, sortOrder: 1 });
menuItemSchema.index({ slug: 1, category: 1 });
menuItemSchema.index({ name: "text", description: "text", tags: "text" });

menuItemSchema.statics.itemTypes = ITEM_TYPES;
menuItemSchema.statics.pricingTypes = PRICING_TYPES;
menuItemSchema.statics.variantCodes = VARIANT_CODES;
menuItemSchema.statics.normalizeName = normalizeText;
menuItemSchema.statics.slugify = slugify;

module.exports = mongoose.model("MenuItem", menuItemSchema);
