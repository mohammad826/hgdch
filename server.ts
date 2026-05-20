import express from "express";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;
app.use(express.json());

// In-memory rudimentary DB for users
// In production, you would use a real database like PostgreSQL on Render/Vercel
const DB_FILE = path.join(process.cwd(), 'database.json');

async function getDB() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return { users: {} };
  }
}

async function saveDB(db: any) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

// API Routes
app.get("/api/user/:id", async (req, res) => {
  const userId = req.params.id;
  const db = await getDB();
  
  if (!db.users[userId]) {
    db.users[userId] = { balance: 0, tasksCompleted: [] };
    await saveDB(db);
  }
  
  res.json(db.users[userId]);
});

app.post("/api/reward/ad", async (req, res) => {
  const { userId, amount } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const db = await getDB();
  if (!db.users[userId]) {
    db.users[userId] = { balance: 0, tasksCompleted: [] };
  }

  // Simple validation for ad rewards. In production with Adsgram, 
  // you might verify a callback or use server-to-server secure checks.
  db.users[userId].balance += (amount || 100); 
  await saveDB(db);

  res.json({ success: true, balance: db.users[userId].balance });
});

app.get("/api/adsgram-tasks", async (req, res) => {
  // Simulate fetching dynamic tasks from Adsgram CPA/Offerwall API
  // In production on Render, you make an Axios call to Adsgram endpoints here.
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

  const db = await getDB();
  if (!db.users[userId]) {
    db.users[userId] = { balance: 0, tasksCompleted: [] };
  }

  if (db.users[userId].tasksCompleted.includes(taskId)) {
    return res.status(400).json({ error: "Task already completed" });
  }

  db.users[userId].tasksCompleted.push(taskId);
  db.users[userId].balance += amount;
  await saveDB(db);

  res.json({ success: true, balance: db.users[userId].balance });
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
