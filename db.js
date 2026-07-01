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
      // Auto-initialize menu if empty in MongoDB
      mongoDb.collection('menu').countDocuments().then(count => {
        if (count === 0) {
          const localMenu = JSON.parse(fs.readFileSync(dbPath, 'utf8')).menu;
          mongoDb.collection('menu').insertMany(localMenu).then(() => {
            console.log("Initialized menu items in MongoDB collection.");
          });
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
  if (mongoDb) {
    return await mongoDb.collection('menu').find({}).toArray();
  }
  return readLocalJson().menu;
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
  const formatted = phone.replace(/[^0-9]/g, '');
  if (mongoDb) {
    return await mongoDb.collection('users').findOne({ phone: formatted });
  }
  const db = readLocalJson();
  const users = db.users || [];
  return users.find(u => {
    if (!u.phone) return false;
    return String(u.phone).replace(/[^0-9]/g, '') === formatted;
  });
}

module.exports = {
  getMenu,
  updateMenuAvailability,
  getOrders,
  addOrder,
  getOrder,
  updateOrder,
  addUser,
  getUserByEmail,
  getUserByPhone,
  addMenuItem,
  updateMenuPrice,
  updateMenuItem,
  isMongo: () => !!mongoDb
};
