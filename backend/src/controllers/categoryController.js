const Category = require("../models/Category");
const MenuItem = require("../models/MenuItem");

async function getCategories(req, res) {
  const categories = await Category.find().sort({ name: 1 });
  return res.json({ categories });
}

async function createCategory(req, res) {
  const name = req.body.name.trim();
  const exists = await Category.findOne({ name });
  if (exists) {
    return res.status(409).json({ message: "Category already exists" });
  }

  const category = await Category.create({ name });
  return res.status(201).json({ category });
}

async function updateCategory(req, res) {
  const { id } = req.params;
  const name = req.body.name.trim();

  const existing = await Category.findOne({ name });
  if (existing && existing._id.toString() !== id) {
    return res.status(409).json({ message: "Category name already in use" });
  }

  const previous = await Category.findById(id);
  if (!previous) {
    return res.status(404).json({ message: "Category not found" });
  }

  const oldName = previous.name;
  previous.name = name;
  await previous.save();

  await MenuItem.updateMany({ category: oldName }, { category: name });

  return res.json({ category: previous });
}

async function deleteCategory(req, res) {
  const { id } = req.params;
  const category = await Category.findById(id);
  if (!category) {
    return res.status(404).json({ message: "Category not found" });
  }

  const linkedItems = await MenuItem.countDocuments({ category: category.name });
  if (linkedItems > 0) {
    return res.status(409).json({ message: "Category cannot be deleted while menu items exist" });
  }

  await Category.findByIdAndDelete(id);
  return res.json({ message: "Category deleted" });
}

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
