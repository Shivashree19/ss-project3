// Simple Express + SQLite backend for orders and payments
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (your current site)
app.use(express.static(path.join(__dirname)));

// Init DB
const db = new Database(path.join(__dirname, 'store.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT,
  customer_email TEXT NOT NULL,
  phone TEXT,
  total_amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  provider TEXT,
  provider_payment_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  received_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
`);

// Helpers
function nowISO() { return new Date().toISOString(); }

// API: Create order
app.post('/api/orders', (req, res) => {
  try {
    const { firstName, lastName, email, phone, totalAmount = 399, currency = 'INR' } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required' });
    const id = 'ORD-' + new Date().getFullYear() + '-' + uuidv4().slice(0, 8).toUpperCase();
    const customer_name = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
    const now = nowISO();

    const stmt = db.prepare(`INSERT INTO orders (id, customer_name, customer_email, phone, total_amount, currency, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(id, customer_name, email, phone || null, Number(totalAmount), currency, 'pending', now, now);

    res.json({ id, status: 'pending' });
  } catch (e) {
    console.error('Create order error:', e);
    res.status(500).json({ error: 'failed_to_create_order' });
  }
});

// API: Record payment (simulate success)
app.post('/api/payments', (req, res) => {
  try {
    const { orderId, amount = 399, currency = 'INR', provider = 'manual', providerPaymentId = null, status = 'succeeded' } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).json({ error: 'order_not_found' });

    const id = 'PAY-' + uuidv4().slice(0, 8).toUpperCase();
    const now = nowISO();

    db.prepare(`INSERT INTO payments (id, order_id, provider, provider_payment_id, amount, currency, status, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, orderId, provider, providerPaymentId, Number(amount), currency, status, now);

    // Update order status if success
    const newStatus = status === 'succeeded' ? 'paid' : status;
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, orderId);

    res.json({ id, orderId, status });
  } catch (e) {
    console.error('Record payment error:', e);
    res.status(500).json({ error: 'failed_to_record_payment' });
  }
});

// API: Basic stats
app.get('/api/admin/stats', (req, res) => {
  try {
    const totalOrders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
    const paidOrders = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'paid'").get().c;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE status = 'succeeded'").get().s;
    const recentPayments = db.prepare('SELECT id, order_id, amount, currency, status, received_at FROM payments ORDER BY received_at DESC LIMIT 10').all();
    res.json({ totalOrders, paidOrders, totalRevenue, recentPayments });
  } catch (e) {
    console.error('Stats error:', e);
    res.status(500).json({ error: 'failed_to_get_stats' });
  }
});

// Fallback to index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});