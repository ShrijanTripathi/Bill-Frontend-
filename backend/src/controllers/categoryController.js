const Category = require("../models/Category");
const MenuItem = require("../models/MenuItem");

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((error) => {
      if (error.code === 11000) {
        return res.status(409).json({ message: "Category already exists" });
      }

      if (error.name === "ValidationError") {
        return res.status(400).json({
          message: "Validation failed",
          errors: Object.values(error.errors).map((entry) => ({
            field: entry.path,
            message: entry.message,
          })),
        });
      }

      return next(error);
    });
  };
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  return fallback;
}

function buildCategoryResponse(category) {
  return {
    _id: category._id,
    id: String(category._id),
    name: category.name,
    slug: category.slug,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

async function findCategoryByName(name, excludedId) {
  const normalizedName = Category.normalizeName(name);
  const query = { name: normalizedName };

  if (excludedId) {
    query._id = { $ne: excludedId };
  }

  return Category.findOne(query).collation({ locale: "en", strength: 2 });
}

async function getCategories(req, res) {
  const includeInactive = req.query.includeInactive === "true";
  const active = toBoolean(req.query.active, null);
  const filter = {};

  if (active !== null) {
    filter.isActive = active;
  } else if (!includeInactive) {
    filter.isActive = true;
  }

  const categories = await Category.find(filter)
    .select("_id name slug sortOrder isActive createdAt updatedAt")
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  return res.json({
    categories: categories.map(buildCategoryResponse),
  });
}

async function createCategory(req, res) {
  const normalizedName = Category.normalizeName(req.body.name);
  const existing = await findCategoryByName(normalizedName);

  if (existing) {
    return res.status(409).json({ message: "Category already exists" });
  }

  const category = await Category.create({
    name: normalizedName,
    sortOrder: Number(req.body.sortOrder || 0),
    isActive: toBoolean(req.body.isActive, true),
  });

  return res.status(201).json({ category: buildCategoryResponse(category.toObject()) });
}

async function updateCategory(req, res) {
  const { id } = req.params;
  const category = await Category.findById(id);

  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  if (typeof req.body.name === "string") {
    const normalizedName = Category.normalizeName(req.body.name);
    const existing = await findCategoryByName(normalizedName, id);

    if (existing) {
      return res.status(409).json({ message: "Category name already in use" });
    }

    category.name = normalizedName;
  }

  if (req.body.sortOrder !== undefined) {
    category.sortOrder = Number(req.body.sortOrder);
  }

  if (req.body.isActive !== undefined) {
    category.isActive = toBoolean(req.body.isActive, category.isActive);
  }

  await category.save();

  return res.json({ category: buildCategoryResponse(category.toObject()) });
}

async function deleteCategory(req, res) {
  const { id } = req.params;
  const category = await Category.findById(id).lean();

  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  const linkedItems = await MenuItem.countDocuments({ category: id });
  if (linkedItems > 0) {
    return res.status(409).json({
      message: "Category cannot be deleted while menu items exist",
      linkedItems,
    });
  }

  await Category.findByIdAndDelete(id);
  return res.json({ message: "Category deleted", categoryId: id });
}

module.exports = {
  getCategories: asyncHandler(getCategories),
  createCategory: asyncHandler(createCategory),
  updateCategory: asyncHandler(updateCategory),
  deleteCategory: asyncHandler(deleteCategory),
};
