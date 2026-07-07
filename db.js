const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'db.json');
const isMongo = !!process.env.MONGO_URI;

let mongoClient = null;
let mongoDb = null;

if (isMongo) {
  try {
    const { MongoClient } = require('mongodb');
    mongoClient = new MongoClient(process.env.MONGO_URI);
    mongoClient.connect().then(client => {
      console.log("Successfully connected to MongoDB Cloud Database!");
      mongoDb = client.db();
      // Auto-initialize and sync menu image mappings in MongoDB
      const localMenu = JSON.parse(fs.readFileSync(dbPath, 'utf8')).menu;
      mongoDb.collection('menu').countDocuments().then(async (count) => {
        if (count === 0) {
          await mongoDb.collection('menu').insertMany(localMenu);
          console.log("Initialized menu items in MongoDB collection.");
        } else {
          // Sync all local image mappings to MongoDB collection
          for (const item of localMenu) {
            await mongoDb.collection('menu').updateOne(
              { id: item.id },
              { $set: { image: item.image, category: item.category, description: item.description, price: item.price } }
            );
          }
          console.log("Synchronized menu image mappings in MongoDB collection.");
        }
      });
    }).catch(err => {
      console.error("MongoDB Connection failed, falling back to local file:", err);
      mongoClient = null;
      mongoDb = null;
    });
  } catch (e) {
    console.error("mongodb npm package is not installed. Run 'npm install mongodb' to connect.");
  }
}

// Local db.json helpers
function readLocalJson() {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading db.json:", err);
    return { menu: [], orders: [], users: [] };
  }
}

function writeLocalJson(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing to db.json:", err);
  }
}

// API Methods
async function getMenu() {
  let menu = [];
  if (mongoDb) {
    menu = await mongoDb.collection('menu').find({}).toArray();
  } else {
    menu = readLocalJson().menu;
  }
  const taking = await getTakingOrders();
  return menu.map(item => {
    if (!item.image || (!item.image.startsWith("http://") && !item.image.startsWith("https://"))) {
      item.image = getIndianFoodImage(item.name, item.category);
    }
    if (!taking) {
      item.available = false;
    }
    return item;
  });
}

async function updateMenuAvailability(id, available) {
  if (mongoDb) {
    await mongoDb.collection('menu').updateOne({ id }, { $set: { available } });
    return;
  }
  const db = readLocalJson();
  const item = db.menu.find(m => m.id === id);
  if (item) {
    item.available = available;
    writeLocalJson(db);
  }
}

async function getOrders() {
  if (mongoDb) {
    return await mongoDb.collection('orders').find({}).toArray();
  }
  return readLocalJson().orders;
}

async function addOrder(order) {
  if (mongoDb) {
    const count = await mongoDb.collection('orders').countDocuments();
    order.id = 1001 + count;
    await mongoDb.collection('orders').insertOne(order);
    return order;
  }
  const db = readLocalJson();
  let nextOrderId = 1001;
  if (db.orders.length > 0) {
    nextOrderId = Math.max(...db.orders.map(o => o.id)) + 1;
  }
  order.id = nextOrderId;
  db.orders.push(order);
  writeLocalJson(db);
  return order;
}

async function getOrder(id) {
  if (mongoDb) {
    return await mongoDb.collection('orders').findOne({ id: parseInt(id) });
  }
  const db = readLocalJson();
  return db.orders.find(o => o.id == id);
}

async function updateOrder(id, updates) {
  if (mongoDb) {
    await mongoDb.collection('orders').updateOne({ id: parseInt(id) }, { $set: updates });
    return await mongoDb.collection('orders').findOne({ id: parseInt(id) });
  }
  const db = readLocalJson();
  const order = db.orders.find(o => o.id == id);
  if (order) {
    Object.assign(order, updates);
    writeLocalJson(db);
  }
  return order;
}

async function clearOrders() {
  if (mongoDb) {
    await mongoDb.collection('orders').deleteMany({});
    return;
  }
  const db = readLocalJson();
  db.orders = [];
  writeLocalJson(db);
}

async function addUser(user) {
  if (mongoDb) {
    await mongoDb.collection('users').insertOne(user);
    return user;
  }
  const db = readLocalJson();
  db.users.push(user);
  writeLocalJson(db);
  return user;
}

async function getUserByEmail(email) {
  if (mongoDb) {
    return await mongoDb.collection('users').findOne({ email: email.toLowerCase() });
  }
  const db = readLocalJson();
  return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

async function addMenuItem(item) {
  if (mongoDb) {
    await mongoDb.collection('menu').insertOne(item);
    return item;
  }
  const db = readLocalJson();
  db.menu.push(item);
  writeLocalJson(db);
  return item;
}

async function updateMenuPrice(id, price) {
  if (mongoDb) {
    await mongoDb.collection('menu').updateOne({ id }, { $set: { price } });
    return;
  }
  const db = readLocalJson();
  const item = db.menu.find(m => m.id === id);
  if (item) {
    item.price = price;
    writeLocalJson(db);
  }
}

async function updateMenuItem(id, updates) {
  if (mongoDb) {
    await mongoDb.collection('menu').updateOne({ id }, { $set: updates });
    return;
  }
  const db = readLocalJson();
  const item = db.menu.find(m => m.id === id);
  if (item) {
    Object.assign(item, updates);
    writeLocalJson(db);
  }
}

async function getUserByPhone(phone) {
  const formatted = phone.replace(/[^0-9]/g, '').slice(-10); // Match last 10 digits
  if (mongoDb) {
    return await mongoDb.collection('users').findOne({ 
      $or: [
        { phone: { $regex: new RegExp(formatted + "$") } },
        { phone: formatted },
        { phone: parseInt(formatted) || 0 }
      ]
    });
  }
  const db = readLocalJson();
  const users = db.users || [];
  return users.find(u => {
    if (!u.phone) return false;
    const uPhoneStr = String(u.phone).replace(/[^0-9]/g, '');
    return uPhoneStr.endsWith(formatted);
  });
}

async function getTakingOrders() {
  if (mongoDb) {
    const doc = await mongoDb.collection('settings').findOne({ key: 'takingOrders' });
    return doc ? doc.value : true;
  }
  const db = readLocalJson();
  if (!db.settings) return true;
  return db.settings.takingOrders !== false;
}

async function setTakingOrders(taking) {
  if (mongoDb) {
    await mongoDb.collection('settings').updateOne(
      { key: 'takingOrders' },
      { $set: { value: taking } },
      { upsert: true }
    );
    return;
  }
  const db = readLocalJson();
  if (!db.settings) db.settings = {};
  db.settings.takingOrders = taking;
  writeLocalJson(db);
}

module.exports = {
  getMenu,
  updateMenuAvailability,
  getOrders,
  addOrder,
  getOrder,
  updateOrder,
  clearOrders,
  getTakingOrders,
  setTakingOrders,
  addUser,
  getUserByEmail,
  getUserByPhone,
  addMenuItem,
  updateMenuPrice,
  updateMenuItem,
  isMongo: () => !!mongoDb
};

// Curated image maps for exact matches, keywords, and categories
const EXACT_MATCH_IMAGES = {
  "butter chicken": "photo-1603894584373-5ac82b2ae398",
  "palak paneer": "photo-1601050690597-df056fb4ce78",
  "samosa": "photo-1601050690597-df056fb4ce78",
  "masala dosa": "photo-1589301760014-d929f3979dbc",
  "chicken biryani": "photo-1633945274405-b6c8069047b0",
  "dal makhani": "photo-1546833999-b9f581a1996d",
  "garlic naan": "photo-1626132647523-66f5bf380027",
  "chole bhature": "photo-1627308595229-7830a5c91f9f",
  "tandoori chicken": "photo-1610057099443-fde8c4d50f91",
  "mango lassi": "photo-1553787499-6f9133860278"
};

const KEYWORD_FALLBACKS = [
  { keyword: "fries", id: "photo-1573080496219-bb080dd4f877" },
  { keyword: "burger", id: "photo-1568901346375-23c9450c58cd" },
  { keyword: "sandwich", id: "photo-1539252554453-80ab65ce3586" },
  { keyword: "toast", id: "photo-1509440159596-0249088772ff" },
  { keyword: "pasta", id: "photo-1645112411341-6c4fd023714a" },
  { keyword: "cappuccino", id: "photo-1541167760496-1628856ab772" },
  { keyword: "latte", id: "photo-1517701604599-bb29b565090c" },
  { keyword: "shake", id: "photo-1579954115545-a95591f28bfc" },
  { keyword: "mojito", id: "photo-1513558161293-cdaf765ed2fd" },
  { keyword: "lime", id: "photo-1497534446932-c925b458314e" },
  { keyword: "soup", id: "photo-1547592165-e1d17fed6006" },
  { keyword: "noodle", id: "photo-1585032226651-759b368d7246" },
  { keyword: "rice", id: "photo-1512058564366-18510be2db19" },
  { keyword: "biriyani", id: "photo-1633945274405-b6c8069047b0" },
  { keyword: "paneer", id: "photo-1631452180519-c014fe946bc7" },
  { keyword: "kabab", id: "photo-1601050690597-df056fb4ce78" },
  { keyword: "dal", id: "photo-1546833999-b9f581a1996d" },
  { keyword: "roti", id: "photo-1626132647523-66f5bf380027" },
  { keyword: "naan", id: "photo-1589301760014-d929f3979dbc" },
  { keyword: "sundae", id: "photo-1563805042-7684c019e1cb" },
  { keyword: "gudbud", id: "photo-1579954115545-a95591f28bfc" }
];

const CAT_FALLBACKS = {
  "Snacks": "photo-1573080496219-bb080dd4f877",
  "Sandwiches": "photo-1539252554453-80ab65ce3586",
  "Pastas": "photo-1645112411341-6c4fd023714a",
  "Icecreams": "photo-1563805042-7684c019e1cb",
  "Beverages": "photo-1513558161293-cdaf765ed2fd",
  "Soups": "photo-1547592165-e1d17fed6006",
  "Starters": "photo-1601050690597-df056fb4ce78",
  "Tandoori Starters": "photo-1567188040759-fb8a883dc6d8",
  "Combos": "photo-1544025162-d76694265947",
  "Indian Breads": "photo-1626132647523-66f5bf380027",
  "Indian Curries": "photo-1631452180519-c014fe946bc7",
  "Delicious Rice": "photo-1633945274405-b6c8069047b0",
  "Rice & Noodles": "photo-1585032226651-759b368d7246"
};

function getIndianFoodImage(name, category) {
  if (!name) return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&auto=format&fit=crop";
  const clean = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  if (EXACT_MATCH_IMAGES[clean]) {
    return "https://images.unsplash.com/" + EXACT_MATCH_IMAGES[clean] + "?w=500&auto=format&fit=crop";
  }
  for (const entry of KEYWORD_FALLBACKS) {
    if (clean.includes(entry.keyword)) {
      return "https://images.unsplash.com/" + entry.id + "?w=500&auto=format&fit=crop";
    }
  }
  if (category && CAT_FALLBACKS[category]) {
    return "https://images.unsplash.com/" + CAT_FALLBACKS[category] + "?w=500&auto=format&fit=crop";
  }
  return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&auto=format&fit=crop";
}
