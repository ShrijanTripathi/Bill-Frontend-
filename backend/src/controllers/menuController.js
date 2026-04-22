const MenuItem = require("../models/MenuItem");
const Category = require("../models/Category");

async function getMenu(req, res) {
  const includeUnavailable = req.query.includeUnavailable === "true";
  const search = String(req.query.search || "").trim();
  const category = String(req.query.category || "").trim();
  const filter = {};

  if (!includeUnavailable) {
    filter.available = true;
  }

  if (search) {
    filter.name = { $regex: search, $options: "i" };
  }

  if (category) {
    filter.category = category;
  }

  const items = await MenuItem.find(filter).sort({ category: 1, name: 1 });
  return res.json({ items });
}

async function createMenuItem(req, res) {
  const { name, price, category, available, description } = req.body;
  const normalizedCategory = category.trim();

  const categoryDoc = await Category.findOne({ name: normalizedCategory });
  if (!categoryDoc) {
    return res.status(400).json({ message: "Category does not exist" });
  }

  const item = await MenuItem.create({
    name: name.trim(),
    price,
    category: normalizedCategory,
    available: typeof available === "boolean" ? available : true,
    description: description?.trim() || "",
  });

  return res.status(201).json({ item });
}

async function updateMenuItem(req, res) {
  const { id } = req.params;
  const updates = {};

  if (typeof req.body.name === "string") updates.name = req.body.name.trim();
  if (typeof req.body.price === "number") updates.price = req.body.price;
  if (typeof req.body.available === "boolean") updates.available = req.body.available;
  if (typeof req.body.description === "string") updates.description = req.body.description.trim();

  if (typeof req.body.category === "string") {
    const normalizedCategory = req.body.category.trim();
    const categoryDoc = await Category.findOne({ name: normalizedCategory });
    if (!categoryDoc) {
      return res.status(400).json({ message: "Category does not exist" });
    }
    updates.category = normalizedCategory;
  }

  const item = await MenuItem.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  if (!item) {
    return res.status(404).json({ message: "Menu item not found" });
  }

  return res.json({ item });
}

async function deleteMenuItem(req, res) {
  const { id } = req.params;
  const deleted = await MenuItem.findByIdAndDelete(id);
  if (!deleted) {
    return res.status(404).json({ message: "Menu item not found" });
  }

  return res.json({ message: "Menu item deleted" });
}

module.exports = {
  getMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
};
