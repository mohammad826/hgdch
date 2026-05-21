import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Pool } from "pg";
import dotenv from "dotenv";
import dns from "dns";
import fs from "fs";

// Fix for Node >= 17 IPv6 ENETUNREACH with Supabase database host
dns.setDefaultResultOrder("ipv4first");

dotenv.config();

const app = express();
const PORT = 3000;
app.use(express.json());

// Initialize PostgreSQL Pool
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:vp7fyiMJkA6dd0YH@db.mbmplfyhvfanyjdpatot.supabase.co:5432/postgres";

let pool: any = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

// JSON File Database Fallback
const DB_FILE = path.join(process.cwd(), 'db.json');

interface User {
  id: string;
  balance: number;
  tasks_completed: string[];
  referrals_count: number;
  referrer_id: string | null;
  updated_at: string;
}

interface GlobalSettings {
  id: number;
  exchange_rate: number;
  min_withdraw: number;
  dollar_rate: number;
}

interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  address: string;
  method: string;
  status: string;
  timestamp: number;
  created_at: string;
}

interface DbSchema {
  users: Record<string, User>;
  global_settings: Record<number, GlobalSettings>;
  withdrawals: Record<string, Withdrawal>;
}

class LocalDb {
  private data: DbSchema;

  constructor() {
    this.data = {
      users: {},
      global_settings: {
        1: { id: 1, exchange_rate: 10000, min_withdraw: 50000, dollar_rate: 5.0 }
      },
      withdrawals: {}
    };
    this.load();
  }

  private load() {
    if (fs.existsSync(DB_FILE)) {
      try {
        const fileContent = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(fileContent);
      } catch (e) {
        console.error("Failed to parse db.json, using defaults", e);
      }
    } else {
      this.save();
    }
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error("Failed to write db.json", e);
    }
  }

  async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    const cleanSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (cleanSql.startsWith('select * from users where id =') || cleanSql.startsWith('select balance from users where id =')) {
      const id = params[0];
      const user = this.data.users[id];
      return { rows: user ? [this.toPgUser(user)] : [] };
    }

    if (cleanSql.startsWith('select tasks_completed from users where id =')) {
      const id = params[0];
      const user = this.data.users[id];
      return { rows: user ? [{ tasks_completed: user.tasks_completed }] : [] };
    }

    if (cleanSql.startsWith('select * from global_settings where id = 1')) {
      const settings = this.data.global_settings[1];
      return { rows: settings ? [this.toPgSettings(settings)] : [] };
    }

    if (cleanSql.startsWith('select * from withdrawals where user_id =')) {
      const userId = params[0];
      const list = Object.values(this.data.withdrawals)
        .filter(w => w.user_id === userId)
        .map(w => this.toPgWithdrawal(w));
      return { rows: list };
    }

    if (cleanSql.startsWith('select * from withdrawals order by')) {
      const list = Object.values(this.data.withdrawals)
        .map(w => this.toPgWithdrawal(w));
      return { rows: list };
    }

    if (cleanSql.includes('update users set balance = balance + 1000')) {
      const referrerId = params[0];
      const user = this.data.users[referrerId];
      if (user) {
        user.balance += 1000;
        user.referrals_count += 1;
        user.updated_at = new Date().toISOString();
        this.save();
      }
      return { rows: [] };
    }

    if (cleanSql.includes('update users set balance = balance + $1')) {
      if (cleanSql.includes('tasks_completed = $2')) {
        const amount = params[0];
        const tasksCompleted = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
        const userId = params[2];
        const user = this.data.users[userId];
        if (user) {
          user.balance += amount;
          user.tasks_completed = tasksCompleted;
          user.updated_at = new Date().toISOString();
          this.save();
          return { rows: [{ balance: user.balance }] };
        }
      } else {
        const amount = params[0];
        const userId = params[1];
        const user = this.data.users[userId];
        if (user) {
          user.balance += amount;
          user.updated_at = new Date().toISOString();
          this.save();
          return { rows: [{ balance: user.balance }] };
        }
      }
      return { rows: [] };
    }

    if (cleanSql.includes('update users set balance = balance - $1')) {
      const amount = params[0];
      const userId = params[1];
      const user = this.data.users[userId];
      if (user) {
        user.balance -= amount;
        user.updated_at = new Date().toISOString();
        this.save();
      }
      return { rows: [] };
    }

    if (cleanSql.startsWith('insert into users')) {
      const id = params[0];
      const referrerId = params[1] || null;
      const newUser: User = {
        id,
        balance: 0,
        tasks_completed: [],
        referrals_count: 0,
        referrer_id: referrerId,
        updated_at: new Date().toISOString()
      };
      this.data.users[id] = newUser;
      this.save();
      return { rows: [this.toPgUser(newUser)] };
    }

    if (cleanSql.startsWith('insert into withdrawals')) {
      const [id, user_id, amount, address, method, status, timestamp] = params;
      const newW: Withdrawal = {
        id,
        user_id,
        amount,
        address,
        method,
        status,
        timestamp,
        created_at: new Date().toISOString()
      };
      this.data.withdrawals[id] = newW;
      this.save();
      return { rows: [] };
    }

    if (cleanSql.startsWith('select * from withdrawals where id =')) {
      const id = params[0];
      const w = this.data.withdrawals[id];
      return { rows: w ? [this.toPgWithdrawal(w)] : [] };
    }

    if (cleanSql.startsWith('update withdrawals set status =')) {
      const status = params[0];
      const id = params[1];
      const w = this.data.withdrawals[id];
      if (w) {
        w.status = status;
        this.save();
      }
      return { rows: [] };
    }

    if (cleanSql.includes('update global_settings set exchange_rate')) {
      const [rate, min, dollar] = params;
      this.data.global_settings[1] = {
        id: 1,
        exchange_rate: rate,
        min_withdraw: min,
        dollar_rate: dollar
      };
      this.save();
      return { rows: [] };
    }

    // List all users
    if (cleanSql.startsWith('select * from users order by')) {
      const allUsers = Object.values(this.data.users).map(u => this.toPgUser(u));
      return { rows: allUsers };
    }

    // Count users
    if (cleanSql.startsWith('select count(*) as count from users')) {
      return { rows: [{ count: Object.keys(this.data.users).length }] };
    }

    // Count withdrawals by status
    if (cleanSql.includes('count(*) as count from withdrawals where status =')) {
      const status = params[0];
      const count = Object.values(this.data.withdrawals).filter(w => w.status === status).length;
      return { rows: [{ count }] };
    }

    // Sum of all user balances
    if (cleanSql.includes('coalesce(sum(balance), 0) as total from users')) {
      const total = Object.values(this.data.users).reduce((s, u) => s + u.balance, 0);
      return { rows: [{ total }] };
    }

    // Update user balance directly
    if (cleanSql.startsWith('update users set balance = $1') && cleanSql.includes('where id =')) {
      const balance = params[0];
      const userId = params[1];
      const user = this.data.users[userId];
      if (user) {
        user.balance = balance;
        user.updated_at = new Date().toISOString();
        this.save();
        return { rows: [this.toPgUser(user)] };
      }
      return { rows: [] };
    }

    // Delete user
    if (cleanSql.startsWith('delete from users where id =')) {
      const id = params[0];
      if (this.data.users[id]) {
        delete this.data.users[id];
        this.save();
        return { rows: [{ id }] };
      }
      return { rows: [] };
    }

    // Delete user withdrawals
    if (cleanSql.startsWith('delete from withdrawals where user_id =')) {
      const userId = params[0];
      const toDelete = Object.keys(this.data.withdrawals).filter(k => this.data.withdrawals[k].user_id === userId);
      toDelete.forEach(k => delete this.data.withdrawals[k]);
      this.save();
      return { rows: [] };
    }

    // List all users
    if (cleanSql.startsWith('select * from users order by')) {
      const allUsers = Object.values(this.data.users).map(u => this.toPgUser(u));
      return { rows: allUsers };
    }

    // Count users
    if (cleanSql.startsWith('select count(*) as count from users')) {
      return { rows: [{ count: Object.keys(this.data.users).length }] };
    }

    // Count withdrawals by status
    if (cleanSql.includes('count(*) as count from withdrawals where status =')) {
      const status = params[0];
      const count = Object.values(this.data.withdrawals).filter(w => w.status === status).length;
      return { rows: [{ count }] };
    }

    // Sum of all user balances
    if (cleanSql.includes('coalesce(sum(balance), 0) as total from users')) {
      const total = Object.values(this.data.users).reduce((s, u) => s + u.balance, 0);
      return { rows: [{ total }] };
    }

    // Update user balance directly
    if (cleanSql.startsWith('update users set balance = $1') && cleanSql.includes('where id =') && !cleanSql.includes('balance + $1') && !cleanSql.includes('balance - $1')) {
      const balance = params[0];
      const userId = params[1];
      const user = this.data.users[userId];
      if (user) {
        user.balance = balance;
        user.updated_at = new Date().toISOString();
        this.save();
        return { rows: [this.toPgUser(user)] };
      }
      return { rows: [] };
    }

    // Delete user
    if (cleanSql.startsWith('delete from users where id =')) {
      const id = params[0];
      if (this.data.users[id]) {
        delete this.data.users[id];
        this.save();
        return { rows: [{ id }] };
      }
      return { rows: [] };
    }

    // Delete user withdrawals
    if (cleanSql.startsWith('delete from withdrawals where user_id =')) {
      const userId = params[0];
      const toDelete = Object.keys(this.data.withdrawals).filter(k => this.data.withdrawals[k].user_id === userId);
      toDelete.forEach(k => delete this.data.withdrawals[k]);
      this.save();
      return { rows: [] };
    }

    if (cleanSql === 'begin' || cleanSql === 'commit' || cleanSql === 'rollback') {
      return { rows: [] };
    }

    return { rows: [] };
  }

  private toPgUser(u: User) {
    return {
      id: u.id,
      balance: u.balance,
      tasks_completed: u.tasks_completed,
      referrals_count: u.referrals_count,
      referrer_id: u.referrer_id,
      updated_at: u.updated_at
    };
  }

  private toPgSettings(s: GlobalSettings) {
    return {
      id: s.id,
      exchange_rate: s.exchange_rate,
      min_withdraw: s.min_withdraw,
      dollar_rate: s.dollar_rate
    };
  }

  private toPgWithdrawal(w: Withdrawal) {
    return {
      id: w.id,
      user_id: w.user_id,
      amount: w.amount,
      address: w.address,
      method: w.method,
      status: w.status,
      timestamp: w.timestamp.toString(),
      created_at: w.created_at
    };
  }
}

class LocalDbPool {
  private db: LocalDb;
  constructor() {
    this.db = new LocalDb();
  }
  async query(sql: string, params: any[] = []) {
    return this.db.query(sql, params);
  }
  async connect() {
    return {
      query: async (sql: string, params: any[] = []) => this.db.query(sql, params),
      release: () => {}
    };
  }
  async end() {}
}

async function initDB() {
  try {
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
  
      console.log("PostgreSQL database tables initialized successfully.");
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn("Failed to connect to PostgreSQL database. Switching to local JSON DB fallback.", err);
    pool = new LocalDbPool();
    console.log("Local JSON database initialized.");
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

// Admin: Get all users
app.get("/api/admin/users", checkAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users ORDER BY updated_at DESC");
    const users = result.rows.map((u: any) => ({
      id: u.id,
      balance: u.balance,
      tasksCompleted: u.tasks_completed || [],
      referralsCount: u.referrals_count || 0,
      referrerId: u.referrer_id,
      updatedAt: u.updated_at
    }));
    res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Admin: Get dashboard stats
app.get("/api/admin/stats", checkAdmin, async (req, res) => {
  try {
    const usersCount = await pool.query("SELECT COUNT(*) as count FROM users");
    const pendingCount = await pool.query("SELECT COUNT(*) as count FROM withdrawals WHERE status = $1", ['pending']);
    const approvedCount = await pool.query("SELECT COUNT(*) as count FROM withdrawals WHERE status = $1", ['approved']);
    const rejectedCount = await pool.query("SELECT COUNT(*) as count FROM withdrawals WHERE status = $1", ['rejected']);
    const totalBalance = await pool.query("SELECT COALESCE(SUM(balance), 0) as total FROM users");

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(usersCount.rows[0]?.count || '0'),
        pendingWithdrawals: parseInt(pendingCount.rows[0]?.count || '0'),
        approvedWithdrawals: parseInt(approvedCount.rows[0]?.count || '0'),
        rejectedWithdrawals: parseInt(rejectedCount.rows[0]?.count || '0'),
        totalBalance: parseInt(totalBalance.rows[0]?.total || '0')
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Admin: Update user balance
app.post("/api/admin/user/update", checkAdmin, async (req, res) => {
  const { userId, balance } = req.body;
  if (!userId || balance === undefined) {
    return res.status(400).json({ error: "Missing parameters" });
  }
  try {
    const result = await pool.query(
      "UPDATE users SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [balance, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Admin: Delete user
app.post("/api/admin/user/delete", checkAdmin, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }
  try {
    await pool.query("DELETE FROM withdrawals WHERE user_id = $1", [userId]);
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Admin: Get all users
app.get("/api/admin/users", checkAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users ORDER BY updated_at DESC");
    const users = result.rows.map((u: any) => ({
      id: u.id,
      balance: u.balance,
      tasksCompleted: u.tasks_completed || [],
      referralsCount: u.referrals_count || 0,
      referrerId: u.referrer_id,
      updatedAt: u.updated_at
    }));
    res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Admin: Get dashboard stats
app.get("/api/admin/stats", checkAdmin, async (req, res) => {
  try {
    const usersCount = await pool.query("SELECT COUNT(*) as count FROM users");
    const pendingCount = await pool.query("SELECT COUNT(*) as count FROM withdrawals WHERE status = $1", ['pending']);
    const approvedCount = await pool.query("SELECT COUNT(*) as count FROM withdrawals WHERE status = $1", ['approved']);
    const rejectedCount = await pool.query("SELECT COUNT(*) as count FROM withdrawals WHERE status = $1", ['rejected']);
    const totalBalance = await pool.query("SELECT COALESCE(SUM(balance), 0) as total FROM users");

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(usersCount.rows[0]?.count || '0'),
        pendingWithdrawals: parseInt(pendingCount.rows[0]?.count || '0'),
        approvedWithdrawals: parseInt(approvedCount.rows[0]?.count || '0'),
        rejectedWithdrawals: parseInt(rejectedCount.rows[0]?.count || '0'),
        totalBalance: parseInt(totalBalance.rows[0]?.total || '0')
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Admin: Update user balance
app.post("/api/admin/user/update", checkAdmin, async (req, res) => {
  const { userId, balance } = req.body;
  if (!userId || balance === undefined) {
    return res.status(400).json({ error: "Missing parameters" });
  }
  try {
    const result = await pool.query(
      "UPDATE users SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [balance, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Admin: Delete user
app.post("/api/admin/user/delete", checkAdmin, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }
  try {
    await pool.query("DELETE FROM withdrawals WHERE user_id = $1", [userId]);
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
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

