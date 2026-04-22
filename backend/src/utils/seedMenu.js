const connectDb = require("../config/db");
const Category = require("../models/Category");
const MenuItem = require("../models/MenuItem");

const seedItems = [
  { name: "Chaap Thali", price: 110, category: "Thali", available: true, description: "House special chaap thali." },
  { name: "Paneer Thali", price: 160, category: "Thali", available: true, description: "Paneer thali with accompaniments." },
  { name: "Butter Roti", price: 15, category: "Bread", available: true, description: "Fresh butter roti." },
  { name: "Plain Naan", price: 20, category: "Bread", available: true, description: "Tandoor plain naan." },
  { name: "Garlic Naan", price: 25, category: "Bread", available: true, description: "Garlic flavored naan." },
  { name: "Mix Veg", price: 150, category: "Main Course", available: true, description: "Seasonal mixed vegetables." },
  { name: "Dal Makhni", price: 150, category: "Main Course", available: true, description: "Slow-cooked black dal." },
  { name: "Paneer Butter Masala", price: 200, category: "Main Course", available: true, description: "Creamy paneer gravy." },
  { name: "Veg Noodles", price: 120, category: "Snacks", available: true, description: "Stir-fried noodles." },
  { name: "Burger", price: 100, category: "Snacks", available: true, description: "Classic veg burger." },
  { name: "Pizza", price: 150, category: "Snacks", available: true, description: "Cheese veg pizza." },
  { name: "Cold Coffee", price: 70, category: "Beverages", available: true, description: "Chilled cold coffee." },
  { name: "Shake", price: 100, category: "Beverages", available: true, description: "Rich flavored shake." }
];

async function seed() {
  await connectDb();

  const categoryNames = [...new Set(seedItems.map((item) => item.category))];
  for (const name of categoryNames) {
    await Category.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true });
  }

  for (const item of seedItems) {
    await MenuItem.updateOne(
      { name: item.name, category: item.category },
      {
        $set: {
          price: item.price,
          available: item.available,
          description: item.description,
        },
        $setOnInsert: {
          name: item.name,
          category: item.category,
        },
      },
      { upsert: true }
    );
  }

  process.stdout.write("Seed complete: categories and menu items are up to date.\n");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seeding failed", error);
  process.exit(1);
});
