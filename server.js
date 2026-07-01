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

// API: Create new menu item
app.post('/api/menu', async (req, res) => {
  try {
    const { name, category, price, description } = req.body;
    if (!name || !category || price === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Generate simple readable unique ID
    const newId = category.toLowerCase().substring(0, 4) + "-" + Date.now();
    const newItem = {
      id: newId,
      name,
      category,
      price: parseFloat(price),
      description: description || "",
      available: true
    };
    
    const saved = await db.addMenuItem(newItem);
    res.status(201).json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Quick update menu item price
app.patch('/api/menu/:id/price', async (req, res) => {
  try {
    const { price } = req.body;
    if (price === undefined || isNaN(price)) {
      return res.status(400).json({ error: "Invalid price value" });
    }
    
    await db.updateMenuPrice(req.params.id, parseFloat(price));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Update full details of a menu item
app.put('/api/menu/:id', async (req, res) => {
  try {
    const { name, category, price, description } = req.body;
    if (!name || !category || price === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const updates = {
      name,
      category,
      price: parseFloat(price),
      description: description || ""
    };
    
    await db.updateMenuItem(req.params.id, updates);
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
    const { items, customerName, phone, address, notes, checkoutMode, total, email, paymentMethod } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: "Basket is empty" });

    const newOrder = {
      items,
      customerName: customerName || "Guest User",
      email: email || "Guest",
      phone: phone || "",
      address: address || "",
      notes: notes || "",
      checkoutMode: checkoutMode || "delivery",
      paymentMethod: paymentMethod || "COD",
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
// Serve Redesigned Modern Menu Catalog page
app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

// Serve Firebase Phone Auth web page
app.get('/login-phone', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VSS Sports Square - Verification</title>
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
  <style>
    body {
      background-color: #ffffff;
      color: #1c1c1e;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }
    .container {
      width: 100%;
      max-width: 380px;
      text-align: center;
    }
    .title {
      font-size: 22px;
      font-weight: bold;
      color: #d4af37;
      margin-bottom: 24px;
    }
    .input-field {
      width: 100%;
      padding: 12px 16px;
      font-size: 16px;
      border: 1px solid #e5e5ea;
      border-radius: 12px;
      background-color: #f5f5f7;
      color: #1c1c1e;
      margin-bottom: 16px;
      box-sizing: border-box;
      outline: none;
    }
    .btn {
      width: 100%;
      padding: 14px;
      font-size: 16px;
      font-weight: bold;
      color: white;
      background: linear-gradient(to right, #d4af37, #ff9f1c);
      border: none;
      border-radius: 16px;
      cursor: pointer;
      margin-bottom: 16px;
    }
    .btn:disabled {
      background: #e5e5ea;
      color: #8e8e93;
    }
    #recaptcha-container {
      margin-top: 10px;
      margin-bottom: 16px;
      display: flex;
      justify-content: center;
    }
    .error-msg {
      color: #ff3b30;
      font-size: 14px;
      margin-top: 10px;
    }
    .status-msg {
      color: #8e8e93;
      font-size: 14px;
    }
    .grecaptcha-badge {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="title" id="page-title">VSS Sports Square</div>
    
    <!-- Phone Number Screen -->
    <div id="phone-screen">
      <input type="tel" id="phone-number" class="input-field" placeholder="Phone Number (e.g. +919876543210)">
      <div id="recaptcha-container"></div>
      <button id="send-btn" class="btn" onclick="sendOTP()">Send Verification Code</button>
      <div id="phone-error" class="error-msg"></div>
    </div>

    <!-- OTP Code Screen -->
    <div id="otp-screen" style="display: none;">
      <div class="status-msg" id="otp-status" style="margin-bottom: 16px;"></div>
      <input type="number" id="verification-code" class="input-field" placeholder="Enter 6-Digit OTP">
      <button id="verify-btn" class="btn" onclick="verifyOTP()">Verify OTP</button>
      <div id="otp-error" class="error-msg"></div>
    </div>
  </div>

  <script>
    const firebaseConfig = {
      apiKey: "AIzaSyCQFoCw-c3r5oeWTjoG9jGYLNvYXsJChTA",
      authDomain: "vss-cafe.firebaseapp.com",
      projectId: "vss-cafe",
      storageBucket: "vss-cafe.firebasestorage.app",
      messagingSenderId: "49558508166",
      appId: "1:49558508166:android:dc6d5b0bb2ce59e764f707"
    };
    firebase.initializeApp(firebaseConfig);

    let confirmationResult = null;

    window.onload = function() {
      window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'invisible',
        'callback': (response) => {
          // reCAPTCHA solved
        }
      });
    };

    function sendOTP() {
      let phoneNumber = document.getElementById("phone-number").value.trim();
      const sendBtn = document.getElementById("send-btn");
      const phoneError = document.getElementById("phone-error");
      
      phoneError.innerText = "";
      
      // Auto-prefix country code +91 for standard 10-digit Indian numbers
      if (phoneNumber.length === 10 && !phoneNumber.startsWith("+")) {
        phoneNumber = "+91" + phoneNumber;
      } else if (phoneNumber.length > 10 && !phoneNumber.startsWith("+")) {
        phoneNumber = "+" + phoneNumber;
      }
      
      if (!phoneNumber || !phoneNumber.startsWith("+")) {
        phoneError.innerText = "Please enter a valid phone number (e.g. 9876543210)";
        return;
      }

      sendBtn.disabled = true;
      sendBtn.innerText = "Sending SMS...";

      const appVerifier = window.recaptchaVerifier;
      firebase.auth().signInWithPhoneNumber(phoneNumber, appVerifier)
        .then((result) => {
          confirmationResult = result;
          document.getElementById("phone-screen").style.display = "none";
          document.getElementById("otp-screen").style.display = "block";
          document.getElementById("otp-status").innerText = "OTP sent to " + phoneNumber;
        })
        .catch((error) => {
          console.error(error);
          phoneError.innerText = error.message;
          sendBtn.disabled = false;
          sendBtn.innerText = "Send Verification Code";
        });
    }

    function verifyOTP() {
      const code = document.getElementById("verification-code").value.trim();
      const verifyBtn = document.getElementById("verify-btn");
      const otpError = document.getElementById("otp-error");
      
      otpError.innerText = "";

      if (code.length !== 6) {
        otpError.innerText = "Please enter a 6-digit OTP code";
        return;
      }

      verifyBtn.disabled = true;
      verifyBtn.innerText = "Verifying...";

      confirmationResult.confirm(code)
        .then((result) => {
          const user = result.user;
          const phone = user.phoneNumber;
          if (window.AndroidBridge) {
            window.AndroidBridge.onLoginSuccess(phone);
          } else {
            document.body.innerHTML = "<h3>Login Successful!</h3><p>You can close this window now.</p>";
          }
        })
        .catch((error) => {
          console.error(error);
          otpError.innerText = "Invalid OTP code. Please check and try again.";
          verifyBtn.disabled = false;
          verifyBtn.innerText = "Verify OTP";
        });
    }
  </script>
</body>
</html>`);
});

// API: Get user orders by phone number
app.get('/api/orders/phone/:phone', async (req, res) => {
  try {
    const orders = await db.getOrders();
    const phone = req.params.phone.replace(/[^0-9]/g, '').slice(-10); // Match last 10 digits
    const userOrders = orders.filter(o => {
      const oPhone = o.phone ? o.phone.replace(/[^0-9]/g, '') : '';
      return oPhone.endsWith(phone);
    });
    res.json(userOrders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Phone number check
app.post('/api/auth/login-phone', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });
    
    const formattedPhone = phone.replace(/[^0-9]/g, '');
    const user = await db.getUserByPhone(formattedPhone);
    
    if (user) {
      res.json({ found: true, user });
    } else {
      res.json({ found: false });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Register new user by phone
app.post('/api/auth/register-phone', async (req, res) => {
  try {
    const { phone, name, email } = req.body;
    if (!phone || !name) return res.status(400).json({ error: "Missing required fields" });
    
    const formattedPhone = phone.replace(/[^0-9]/g, '');
    let user = await db.getUserByPhone(formattedPhone);
    
    if (!user) {
      user = {
        email: email || (formattedPhone + "@vss.com"),
        password: "phone_auth_user",
        name,
        phone: formattedPhone,
        isAdmin: false
      };
      await db.addUser(user);
    }
    
    res.status(201).json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`VSS Cafe API Server listening on port ${PORT}`);
});
