const mongoose = require("mongoose");

function normalizeCategoryName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeCategoryName(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
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
      maxlength: 80,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

categorySchema.pre("validate", function buildSlug(next) {
  if (this.isModified("name")) {
    this.name = normalizeCategoryName(this.name);
  }

  if (!this.slug || this.isModified("name")) {
    this.slug = slugify(this.name);
  } else {
    this.slug = slugify(this.slug);
  }

  next();
});

categorySchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ isActive: 1, sortOrder: 1, name: 1 });

categorySchema.statics.normalizeName = normalizeCategoryName;
categorySchema.statics.slugify = slugify;

module.exports = mongoose.model("Category", categorySchema);
