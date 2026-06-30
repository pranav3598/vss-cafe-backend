const express = require('express');
const path = require('path');
const db = require('./db');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Background tracking simulator loop using portability layer
setInterval(async () => {
  try {
    const ordersList = await db.getOrders();
    for (const o of ordersList) {
      if (o.status === "Out for Delivery") {
        if (o.progress < 1.0) {
          const nextProgress = Math.min(o.progress + 0.05, 1.0);
          const updates = { progress: nextProgress };
          if (nextProgress >= 1.0) {
            updates.status = "Delivered";
          }
          await db.updateOrder(o.id, updates);
        }
      }
    }
  } catch (err) {
    console.error("Error in background tracking simulation:", err);
  }
}, 3000); // Check and increment every 3 seconds

// API: Get menu list
app.get('/api/menu', async (req, res) => {
  try {
    const menu = await db.getMenu();
    res.json(menu);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Update item availability
app.patch('/api/menu/:id/availability', async (req, res) => {
  try {
    const { available } = req.body;
    await db.updateMenuAvailability(req.params.id, available);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: List all orders (for Admin Dashboard)
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await db.getOrders();
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Place a new order
app.post('/api/orders', async (req, res) => {
  try {
    const { items, customerName, phone, address, notes, checkoutMode, total, email } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "Basket is empty" });

    const newOrder = {
      items,
      customerName: customerName || "Guest User",
      email: email || "Guest",
      phone: phone || "",
      address: address || "",
      notes: notes || "",
      checkoutMode: checkoutMode || "delivery",
      total: total || 0,
      status: "Received",
      progress: 0.0,
      timestamp: new Date().toISOString()
    };

    const savedOrder = await db.addOrder(newOrder);
    res.status(201).json(savedOrder);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Get individual order status & progress
app.get('/api/orders/:id/status', async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json({ status: order.status, progress: order.progress });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Update order status manually (Admin Dashboard)
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    
    const { status } = req.body;
    const updates = {};
    if (status) {
      updates.status = status;
      if (status === "Out for Delivery" && order.progress === 0) {
        updates.progress = 0.05; // Start delivery animation
      } else if (status === "Delivered") {
        updates.progress = 1.0;
      } else if (status === "Received" || status === "Preparing") {
        updates.progress = 0.0;
      }
    }

    const updated = await db.updateOrder(req.params.id, updates);
    res.json({ success: true, order: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Register User
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const existing = await db.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "Email is already registered" });
    }
    
    const newUser = { email, password, name, isAdmin: false };
    await db.addUser(newUser);
    
    res.status(201).json({ email, name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Login User
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }
    
    const user = await db.getUserByEmail(email);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    res.json({ email: user.email, name: user.name, isAdmin: !!user.isAdmin });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fallback: Serve Admin html page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`VSS Cafe API Server listening on port ${PORT}`);
});
