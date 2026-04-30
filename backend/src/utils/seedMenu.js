const connectDb = require("../config/db");
const Category = require("../models/Category");
const MenuItem = require("../models/MenuItem");

const seedItems = [
  { name: "Chaap Thali", basePrice: 110, category: "Thali", itemType: "meal", description: "House special chaap thali." },
  { name: "Paneer Thali", basePrice: 160, category: "Thali", itemType: "meal", description: "Paneer thali with accompaniments." },
  { name: "Butter Roti", basePrice: 15, category: "Bread", itemType: "bread", description: "Fresh butter roti." },
  { name: "Plain Naan", basePrice: 20, category: "Bread", itemType: "bread", description: "Tandoor plain naan." },
  { name: "Garlic Naan", basePrice: 25, category: "Bread", itemType: "bread", description: "Garlic flavored naan." },
  { name: "Mix Veg", basePrice: 150, category: "Main Course", itemType: "meal", description: "Seasonal mixed vegetables." },
  { name: "Dal Makhni", basePrice: 150, category: "Main Course", itemType: "meal", description: "Slow-cooked black dal." },
  { name: "Paneer Butter Masala", basePrice: 200, category: "Main Course", itemType: "meal", description: "Creamy paneer gravy." },
  { name: "Veg Noodles", basePrice: 120, category: "Chinese", itemType: "regular", description: "Stir-fried noodles." },
  { name: "Burger", basePrice: 100, category: "Burger", itemType: "regular", description: "Classic veg burger." },
  { name: "Pizza", basePrice: 150, category: "Pizza", itemType: "regular", description: "Cheese veg pizza." },
  { name: "Cold Coffee", basePrice: 70, category: "Coffee", itemType: "beverage", description: "Chilled cold coffee." },
  { name: "Shake", basePrice: 100, category: "Mocktails", itemType: "beverage", description: "Rich flavored shake." },
];

async function seed() {
  await connectDb();

  const categoryNames = [...new Set(seedItems.map((item) => item.category))];
  const categoryMap = new Map();

  for (const name of categoryNames) {
    const normalizedName = Category.normalizeName(name);
    const category = await Category.findOneAndUpdate(
      { name: normalizedName },
      { $setOnInsert: { name: normalizedName } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).collation({ locale: "en", strength: 2 });

    categoryMap.set(name, category);
  }

  for (const item of seedItems) {
    const category = categoryMap.get(item.category);

    await MenuItem.updateOne(
      { name: item.name, category: category._id },
      {
        $set: {
          basePrice: item.basePrice,
          itemType: item.itemType,
          pricingType: "single",
          variants: [],
          addons: [],
          isAvailable: true,
          isActive: true,
          description: item.description,
        },
        $setOnInsert: {
          name: item.name,
          slug: MenuItem.slugify(item.name),
          category: category._id,
        },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  process.stdout.write("Seed complete: categories and menu items are up to date.\n");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seeding failed", error);
  process.exit(1);
});
