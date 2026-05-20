import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Pool } from "pg";
import dotenv from "dotenv";
import dns from "dns";

// Fix for Node >= 17 IPv6 ENETUNREACH with Supabase database host
dns.setDefaultResultOrder("ipv4first");

dotenv.config();

const app = express();
const PORT = 3000;
app.use(express.json());

// Initialize PostgreSQL Pool
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:vp7fyiMJkA6dd0YH@db.mbmplfyhvfanyjdpatot.supabase.co:5432/postgres";

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        balance INTEGER DEFAULT 0,
        tasks_completed JSONB DEFAULT '[]',
        referrals_count INTEGER DEFAULT 0,
        referrer_id VARCHAR(255) DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_settings (
        id INTEGER PRIMARY KEY,
        exchange_rate INTEGER DEFAULT 10000,
        min_withdraw INTEGER DEFAULT 50000,
        dollar_rate DECIMAL(10,2) DEFAULT 5.0
      );
    `);

    // Insert default settings if not exists
    await client.query(`
      INSERT INTO global_settings (id, exchange_rate, min_withdraw, dollar_rate)
      VALUES (1, 10000, 50000, 5.0)
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        amount INTEGER,
        address VARCHAR(255),
        method VARCHAR(50),
        status VARCHAR(50),
        timestamp BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Migration: add referral columns if they don't exist
    try {
      await client.query(`ALTER TABLE users ADD COLUMN referrals_count INTEGER DEFAULT 0;`);
    } catch (e) { /* ignore if exists */ }
    try {
      await client.query(`ALTER TABLE users ADD COLUMN referrer_id VARCHAR(255) DEFAULT NULL;`);
    } catch (e) { /* ignore if exists */ }

    console.log("Database tables initialized.");
  } catch (err) {
    console.error("Failed to initialize database:", err);
  } finally {
    client.release();
  }
}

initDB();

// API Routes
app.post("/api/user", async (req, res) => {
  const { id: userId, referrerId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing user id" });

  try {
    let result = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (result.rows.length === 0) {
      if (referrerId && referrerId !== userId) {
        // give referrer 1000 coins and increment referrals count
        await pool.query(
          "UPDATE users SET balance = balance + 1000, referrals_count = referrals_count + 1 WHERE id = $1",
          [referrerId]
        );
      }
      
      result = await pool.query(
        "INSERT INTO users (id, balance, tasks_completed, referrer_id) VALUES ($1, 0, '[]'::jsonb, $2) RETURNING *",
        [userId, referrerId || null]
      );
    }
    const user = result.rows[0];
    res.json({ balance: user.balance, tasksCompleted: user.tasks_completed, referralsCount: user.referrals_count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/user/:id", async (req, res) => {
  const userId = req.params.id;
  try {
    let result = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (result.rows.length === 0) {
      result = await pool.query(
        "INSERT INTO users (id, balance, tasks_completed) VALUES ($1, 0, '[]'::jsonb) RETURNING *",
        [userId]
      );
    }
    const user = result.rows[0];
    res.json({ balance: user.balance, tasksCompleted: user.tasks_completed, referralsCount: user.referrals_count || 0 });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/reward/ad", async (req, res) => {
  const { userId, amount } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const rewardAmt = amount || 100;
    const result = await pool.query(
      "UPDATE users SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING balance",
      [rewardAmt, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true, balance: result.rows[0].balance });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/adsgram-tasks", async (req, res) => {
  const adsgramTasks = [
    { id: 'adsgram_task_1', title: 'عضویت در کانال حامیان Adsgram', type: 'channel', reward: 500, link: 'https://t.me/adsgram_example' },
    { id: 'adsgram_task_2', title: 'استارت ربات رسمی Adsgram', type: 'bot', reward: 800, link: 'https://t.me/adsgram_bot' },
    { id: 'adsgram_task_3', title: 'تست بازی پلتفرم Adsgram', type: 'web', reward: 1200, link: 'https://example.com/game' },
  ];
  res.json({ success: true, tasks: adsgramTasks });
});

app.post("/api/reward/task", async (req, res) => {
  const { userId, taskId, amount } = req.body;
  
  if (!userId || !taskId) {
     return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    let userRes = await pool.query("SELECT tasks_completed FROM users WHERE id = $1", [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    let tasksCompleted = userRes.rows[0].tasks_completed || [];
    if (tasksCompleted.includes(taskId)) {
      return res.status(400).json({ error: "Task already completed" });
    }

    tasksCompleted.push(taskId);
    const result = await pool.query(
      "UPDATE users SET balance = balance + $1, tasks_completed = $2::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING balance",
      [amount, JSON.stringify(tasksCompleted), userId]
    );

    res.json({ success: true, balance: result.rows[0].balance });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/settings", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM global_settings WHERE id = 1");
    if (result.rows.length > 0) {
      const s = result.rows[0];
      res.json({ success: true, settings: { exchangeRate: s.exchange_rate, minWithdraw: s.min_withdraw, dollarRate: parseFloat(s.dollar_rate) } });
    } else {
      res.json({ success: true, settings: { exchangeRate: 10000, minWithdraw: 50000, dollarRate: 5.0 } });
    }
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/admin/settings", checkAdmin, async (req, res) => {
  const { settings } = req.body;
  try {
    await pool.query(
      "UPDATE global_settings SET exchange_rate = $1, min_withdraw = $2, dollar_rate = $3 WHERE id = 1",
      [settings.exchangeRate, settings.minWithdraw, settings.dollarRate]
    );
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/withdrawals/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const result = await pool.query("SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY timestamp DESC", [userId]);
    const withdrawals = result.rows.map(w => ({
      id: w.id,
      userId: w.user_id,
      amount: w.amount,
      address: w.address,
      method: w.method,
      status: w.status,
      timestamp: Number(w.timestamp)
    }));
    res.json({ success: true, withdrawals });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/withdraw", async (req, res) => {
  const { userId, amount, address, method } = req.body;
  if (!userId || !amount || !address || !method) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query("SELECT balance FROM users WHERE id = $1", [userId]);
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "User not found" });
    }
    
    if (userRes.rows[0].balance < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Insufficient balance" });
    }
    
    await client.query("UPDATE users SET balance = balance - $1 WHERE id = $2", [amount, userId]);
    
    const wId = Date.now().toString();
    const ts = Date.now();
    await client.query(
      "INSERT INTO withdrawals (id, user_id, amount, address, method, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [wId, userId, amount, address, method, "pending", ts]
    );
    
    await client.query('COMMIT');
    const newBalance = userRes.rows[0].balance - amount;
    const withdrawal = { id: wId, userId, amount, address, method, status: "pending", timestamp: ts };
    res.json({ success: true, balance: newBalance, withdrawal });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

// Admin Routes
let activeAdminToken: string | null = null;
let activeAdminLastSeen: number = 0;
const ADMIN_SESSION_TIMEOUT = 1000 * 60 * 15; // 15 minutes timeout

function checkAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.query.token || req.body.token;
  if (!activeAdminToken || token !== activeAdminToken || Date.now() - activeAdminLastSeen > ADMIN_SESSION_TIMEOUT) {
    if (activeAdminToken && Date.now() - activeAdminLastSeen > ADMIN_SESSION_TIMEOUT) {
      activeAdminToken = null; // Session expired
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
  activeAdminLastSeen = Date.now();
  next();
}

app.post("/api/admin/login", async (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (password === adminPassword) {
    const now = Date.now();
    if (activeAdminToken && now - activeAdminLastSeen < ADMIN_SESSION_TIMEOUT) {
      return res.status(403).json({ error: "ادمین دیگری در حال حاضر وارد شده است. برای ورود باید ادمین قبلی خارج شود یا نشست او منقضی شود." });
    }
    
    const token = 'admin_' + Math.random().toString(36).substring(2, 15);
    activeAdminToken = token;
    activeAdminLastSeen = now;
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: "رمز عبور اشتباه است" });
  }
});

app.post("/api/admin/logout", async (req, res) => {
  const { token } = req.body;
  if (token === activeAdminToken) {
    activeAdminToken = null;
    activeAdminLastSeen = 0;
  }
  res.json({ success: true });
});

app.get("/api/admin/withdrawals", checkAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM withdrawals ORDER BY timestamp DESC");
    const withdrawals = result.rows.map(w => ({
      id: w.id,
      userId: w.user_id,
      amount: w.amount,
      address: w.address,
      method: w.method,
      status: w.status,
      timestamp: Number(w.timestamp)
    }));
    res.json({ success: true, withdrawals });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/admin/withdraw/status", checkAdmin, async (req, res) => {
  const { id, status } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wRes = await client.query("SELECT * FROM withdrawals WHERE id = $1", [id]);
    if (wRes.rows.length === 0) {
       await client.query('ROLLBACK');
       return res.status(404).json({ error: "Withdrawal not found" });
    }
    const item = wRes.rows[0];
    if (item.status !== 'pending') {
       await client.query('ROLLBACK');
       return res.status(400).json({ error: "Already processed" });
    }
    
    await client.query("UPDATE withdrawals SET status = $1 WHERE id = $2", [status, id]);
    
    if (status === 'rejected') {
       await client.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [item.amount, item.user_id]);
    }
    
    await client.query('COMMIT');
    res.json({ success: true, withdrawal: { ...item, status } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Database error" });
  } finally {
    client.release();
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

