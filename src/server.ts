import express, { Request, Response } from "express";
import { createServer } from "https";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import path from "path";
import cors from "cors";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { configDotenv } from "dotenv";
import { readFileSync } from "fs";

// --- ТИПЫ ДАННЫХ ---
interface User {
  id: number;
  login: string;
  password?: string;
  name: string;
  role: string;
  balance: number;
  subscription_end?: string;
  allergies?: string;
  preferences?: string;
}

interface Product {
  id: number;
  menu_type: string;
  category: string;
  name: string;
  price: number;
  calories: number;
  stock: number;
  image: string;
  desc: string;
  avgRating?: number;
}

interface Order {
  id: number;
  user_id: number;
  user_name: string;
  user_allergies?: string;
  user_preferences?: string;
  items: string;
  total: number;
  status: string;
  date: string;
}

const config = configDotenv().parsed || {};
const PORT = config.PORT || "3000";
const BASE_URL = config.BASE_URL || "http://localhost:" + PORT;
const CERT_PATH = config.CERT_PATH;
const KEY_PATH = config.KEY_PATH;

const sslKey = readFileSync(KEY_PATH);
const sslCert = readFileSync(CERT_PATH);

const app = express();
const httpServer = createServer({ key: sslKey, cert: sslCert }, app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const db = new sqlite3.Database("canteen_v6.db");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hashPassword = (pass: string) =>
  crypto.createHash("md5").update(pass).digest("hex");
const validateText = (_text: string): boolean => {
  return true;
};

// --- MIDDLEWARE ---
app.use(express.json());
app.use(cors({ allowedHeaders: "Content-Type" }));
app.use(express.static(path.join(__dirname, "../public")));
app.set("views", path.join(__dirname, "../views"));
app.set("view engine", "ejs");

// --- DB HELPERS ---
const query = <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
};

const run = (
  sql: string,
  params: any[] = [],
): Promise<{ lastID: number; changes: number }> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

// --- INIT DB ---
db.serialize(async () => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, login TEXT UNIQUE, password TEXT, name TEXT, role TEXT DEFAULT 'STUDENT',
        balance REAL DEFAULT 0, subscription_end TEXT, allergies TEXT, preferences TEXT
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY, menu_type TEXT, category TEXT, name TEXT, price INTEGER, calories INTEGER, stock INTEGER DEFAULT 50, image TEXT, description TEXT
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY, user_id INTEGER, user_name TEXT, user_allergies TEXT, user_preferences TEXT, items TEXT,
        total INTEGER, status TEXT DEFAULT 'pending', date TEXT
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY, user_id INTEGER, product_id INTEGER, rating INTEGER, comment TEXT, date TEXT
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS supplies (
        id INTEGER PRIMARY KEY, product_id INTEGER, product_name TEXT, amount INTEGER, estimated_cost INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', date TEXT
    )`);

  db.run(
    `CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT )`,
  );

  // SEEDING
  try {
    const uC = (
      await query<{ c: number }>("SELECT count(*) as c FROM users")
    )[0].c;
    if (uC === 0) {
      run(
        "INSERT INTO users (login, password, name, role, balance) VALUES (?,?,?,?,?)",
        ["admin", hashPassword("admin"), "Администратор", "ADMIN", 0],
      );
      run(
        "INSERT INTO users (login, password, name, role, balance) VALUES (?,?,?,?,?)",
        ["cook", hashPassword("cook"), "Шеф Повар", "COOK", 0],
      );
      run(
        "INSERT INTO users (login, password, name, role, balance, allergies) VALUES (?,?,?,?,?,?)",
        [
          "student",
          hashPassword("student"),
          "Иван Петров",
          "STUDENT",
          6000,
          "Мед",
        ],
      );
    }

    const pC = (
      await query<{ c: number }>("SELECT count(*) as c FROM products")
    )[0].c;
    if (pC === 0) {
      const products = [
        {
          id: 1,
          type: "breakfast",
          cat: "main",
          name: "Каша Овсяная",
          price: 60,
          cal: 210,
          img: "🥣",
          desc: "Хлопья овсяные, молоко, масло",
        },
        {
          id: 2,
          type: "breakfast",
          cat: "main",
          name: "Сырники",
          price: 90,
          cal: 320,
          img: "🥞",
          desc: "Творог 9%, яйцо, мука, сметана",
        },
        {
          id: 4,
          type: "lunch",
          cat: "main",
          name: "Борщ домашний",
          price: 110,
          cal: 180,
          img: "🍲",
          desc: "Свекла, говядина, капуста",
        },
        {
          id: 5,
          type: "lunch",
          cat: "main",
          name: "Пюре с котлетой",
          price: 150,
          cal: 450,
          img: "🥔",
          desc: "Картофель, свинина, лук",
        },
        {
          id: 8,
          type: "all_day",
          cat: "bakery",
          name: "Сосиска в тесте",
          price: 65,
          cal: 280,
          img: "🌭",
          desc: "Тесто сдобное, сосиска",
        },
        {
          id: 9,
          type: "all_day",
          cat: "drink",
          name: "Чай с лимоном",
          price: 25,
          cal: 5,
          img: "☕️",
          desc: "Чай черный, лимон",
        },
      ];
      products.forEach((p) => {
        run(
          "INSERT INTO products (id, menu_type, category, name, price, calories, stock, image, description) VALUES (?,?,?,?,?,?,?,?,?)",
          [p.id, p.type, p.cat, p.name, p.price, p.cal, 50, p.img, p.desc],
        );
      });
    }
  } catch (e) {}
});

// --- SOCKET.IO ---
io.on("connection", (socket) => {
  // Пользователь авторизуется в сокете и попадает в комнату своей роли
  socket.on("auth", (role: string) => {
    if (role) {
      socket.join(role); // 'STUDENT', 'COOK', 'ADMIN'
      socket.join("ALL"); // Общий канал для всех
    }
  });
});

// --- ROUTES ---
app.get("/", (req, res) =>
  res.render("index", { apiUrl: `${BASE_URL}:${PORT}/api` }),
);

app.get("/api/init", async (req, res) => {
  const products = await query<Product>("SELECT * FROM products");
  const reviews = await query<{ product_id: number; r: number }>(
    "SELECT product_id, AVG(rating) as r FROM reviews GROUP BY product_id",
  );

  const productsWithRating = products.map((p) => {
    const rating = reviews.find((r) => r.product_id === p.id);
    return { ...p, avgRating: rating ? parseFloat(rating.r.toFixed(1)) : null };
  });

  const sanitary = (
    await query("SELECT value FROM settings WHERE key='sanitary_day'")
  )[0];
  res.json({
    products: productsWithRating,
    isSanitaryDay: sanitary ? sanitary.value === "true" : false,
  });
});

// Auth
app.post("/api/auth/login", async (req, res) => {
  const { login, password } = req.body;
  const user = (
    await query<User>("SELECT * FROM users WHERE login = ? AND password = ?", [
      login,
      hashPassword(password),
    ])
  )[0];
  if (user) {
    const { password, ...u } = user;
    res.json({ success: true, user: u });
  } else res.json({ success: false, error: "Неверные данные" });
});

app.post("/api/auth/register", async (req, res) => {
  const { login, password, name, allergies, preferences } = req.body;
  if (
    !validateText(name) ||
    !validateText(allergies) ||
    !validateText(preferences)
  )
    return res.json({ success: false, error: "Недопустимая лексика!" });
  try {
    await run(
      "INSERT INTO users (login, password, name, role, balance, allergies, preferences) VALUES (?,?,?,?,?,?,?)",
      [
        login,
        hashPassword(password),
        name || "User",
        "STUDENT",
        0,
        allergies || "",
        preferences || "",
      ],
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: "Логин занят" });
  }
});

// Orders
app.post("/api/orders", async (req, res) => {
  const { userId, items, total, payWithSub } = req.body;
  const user = (
    await query<User>("SELECT * FROM users WHERE id=?", [userId])
  )[0];

  let finalTotal = total;
  if (payWithSub) {
    if (user.subscription_end) {
      const parts = user.subscription_end.split(".");
      const subEnd = new Date(
        Number(parts[2]),
        Number(parts[1]) - 1,
        Number(parts[0]),
      );
      const zero = new Date();
      zero.setHours(0, 0, 0, 0);
      if (subEnd < zero)
        return res.json({ success: false, error: "Подписка истекла" });
      finalTotal = 0;
    } else return res.json({ success: false, error: "Нет подписки" });
  }

  if (!payWithSub && user.balance < finalTotal)
    return res.json({ success: false, error: "Нет денег" });

  if (finalTotal > 0)
    await run("UPDATE users SET balance = balance - ? WHERE id=?", [
      finalTotal,
      userId,
    ]);
  for (const item of items)
    await run("UPDATE products SET stock = stock - ? WHERE id=?", [
      item.quantity,
      item.id,
    ]);

  const date = new Date().toISOString();
  const result = await run(
    "INSERT INTO orders (user_id, user_name, user_allergies, user_preferences, items, total, status, date) VALUES (?,?,?,?,?,?,?,?)",
    [
      userId,
      user.name,
      user.allergies,
      user.preferences,
      JSON.stringify(items),
      finalTotal,
      "pending",
      date,
    ],
  );

  io.to("COOK").emit("order:new", {
    id: result.lastID,
    user_id: userId,
    user_name: user.name,
    user_allergies: user.allergies,
    user_preferences: user.preferences,
    items,
    total: finalTotal,
    status: "pending",
    date,
  });

  const u2 = (await query<User>("SELECT * FROM users WHERE id=?", [userId]))[0];
  const { password, ...safeUser } = u2;
  res.json({ success: true, user: safeUser });
});

// Reviews
app.get("/api/products/:id/reviews", async (req, res) => {
  const reviews = await query(
    `SELECT r.*, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.product_id = ? ORDER BY r.id DESC`,
    [req.params.id],
  );
  res.json(reviews);
});

app.post("/api/reviews", async (req, res) => {
  const { userId, productId, rating, comment } = req.body;
  if (!validateText(comment))
    return res.json({ success: false, error: "Недопустимая лексика" });
  await run(
    "INSERT INTO reviews (user_id, product_id, rating, comment, date) VALUES (?,?,?,?,?)",
    [userId, productId, rating, comment, new Date().toISOString()],
  );
  res.json({ success: true });
});

// Subs & Topup
app.post("/api/user/subscribe", async (req, res) => {
  const { userId } = req.body;
  const user = (
    await query<User>("SELECT balance FROM users WHERE id=?", [userId])
  )[0];
  if (user.balance < 5000)
    return res.json({ success: false, error: "Недостаточно средств" });

  const date = new Date();
  date.setDate(date.getDate() + 30);
  const dateStr = date.toLocaleDateString("ru-RU");
  await run(
    "UPDATE users SET balance = balance - 5000, subscription_end = ? WHERE id=?",
    [dateStr, userId],
  );
  res.json({ success: true, subDate: dateStr });
});

app.post("/api/user/topup", async (req, res) => {
  await run("UPDATE users SET balance = balance + ? WHERE id=?", [
    req.body.amount,
    req.body.userId,
  ]);
  res.json({ success: true });
});

// Order Flow
app.get("/api/orders/user/:id", async (req, res) => {
  const rows = await query<Order>("SELECT * FROM orders WHERE user_id = ?", [
    req.params.id,
  ]);
  res.json(rows.map((o) => ({ ...o, items: JSON.parse(o.items) })));
});

app.post("/api/orders/confirm", async (req, res) => {
  await run("UPDATE orders SET status = 'completed' WHERE id = ?", [
    req.body.orderId,
  ]);
  const order = (
    await query<Order>("SELECT user_id FROM orders WHERE id=?", [
      req.body.orderId,
    ])
  )[0];
  io.emit("order:update", {
    id: req.body.orderId,
    status: "completed",
    userId: order?.user_id,
  });
  res.json({ success: true });
});

app.get("/api/cook/orders", async (req, res) => {
  const rows = await query<Order>(
    "SELECT * FROM orders WHERE status != 'completed'",
  );
  res.json(rows.map((o) => ({ ...o, items: JSON.parse(o.items) })));
});

app.post("/api/cook/status", async (req, res) => {
  await run("UPDATE orders SET status = ? WHERE id = ?", [
    req.body.status,
    req.body.orderId,
  ]);
  const order = (
    await query<Order>("SELECT user_id FROM orders WHERE id=?", [
      req.body.orderId,
    ])
  )[0];
  io.emit("order:update", {
    id: req.body.orderId,
    status: req.body.status,
    userId: order?.user_id,
  });
  res.json({ success: true });
});

app.post("/api/cook/stock", async (req, res) => {
  await run("UPDATE products SET stock = ? WHERE id = ?", [
    req.body.amount,
    req.body.productId,
  ]);
  res.json({ success: true });
});

// --- ADMIN & REPORTS & NOTIFICATIONS ---

// 1. Статистика
app.get("/api/admin/stats/advanced", async (req, res) => {
  const attendanceRaw = await query<{
    d: string;
    c: number;
  }>(`SELECT substr(date, 1, 10) as d, count(DISTINCT user_id) as c 
        FROM orders 
        GROUP BY d 
        ORDER BY d DESC 
        LIMIT 7`);

  const revenue =
    (
      await query(
        "SELECT SUM(total) as t FROM orders WHERE status != 'pending'",
      )
    )[0].t || 0;

  res.json({ revenue, attendance: attendanceRaw.reverse() });
});

// 2. Управление закупками
app.get("/api/admin/supplies", async (req, res) => {
  const supplies = await query("SELECT * FROM supplies ORDER BY id DESC");
  res.json(supplies);
});

app.post("/api/admin/supplies/action", async (req, res) => {
  const { id, status, productId, amount } = req.body; // status: 'approved' | 'rejected'

  if (status === "approved" && productId) {
    // Если одобрили, автоматически пополняем склад
    await run("UPDATE products SET stock = stock + ? WHERE id = ?", [
      amount,
      productId,
    ]);
  }
  await run("UPDATE supplies SET status = ? WHERE id = ?", [status, id]);
  res.json({ success: true });
});

// 3. Отчеты
app.get("/api/admin/report", async (req, res) => {
  const income =
    (
      await query(
        "SELECT SUM(total) as t FROM orders WHERE status = 'completed'",
      )
    )[0].t || 0;
  const expenses =
    (
      await query(
        "SELECT SUM(estimated_cost) as t FROM supplies WHERE status = 'approved'",
      )
    )[0].t || 0;

  const completedOrders = await query<Order>(
    "SELECT items FROM orders WHERE status = 'completed'",
  );
  let totalCalories = 0;
  let totalDishes = 0;

  completedOrders.forEach((o) => {
    JSON.parse(o.items).forEach((i: any) => {
      totalCalories += i.calories * i.quantity;
      totalDishes += i.quantity;
    });
  });

  res.json({
    income,
    expenses,
    profit: income - expenses,
    nutrition: { totalCalories, totalDishes },
  });
});

// 4. Уведомления (Таргетированные)
app.post("/api/admin/notify", (req, res) => {
  const { message, type, target } = req.body;
  // target: 'ALL', 'STUDENT', 'COOK'
  io.to(target).emit("notify:banner", { message, type, target });
  res.json({ success: true });
});

// 5. Данные для повара и Заявки
app.get("/api/cook/data", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const completedOrders = await query<Order>(
    "SELECT items FROM orders WHERE date LIKE ? AND status IN ('ready', 'completed')",
    [`${today}%`],
  );

  let stats = { breakfast: 0, lunch: 0, all: 0 };
  completedOrders.forEach((o) => {
    JSON.parse(o.items).forEach((item: any) => {
      stats.all += item.quantity;
      if (item.menu_type === "breakfast") stats.breakfast += item.quantity;
      else stats.lunch += item.quantity;
    });
  });

  const supplies = await query(
    "SELECT * FROM supplies ORDER BY id DESC LIMIT 20",
  );
  res.json({ stats, supplies });
});

app.post("/api/supplies/request", async (req, res) => {
  const { productId, amount } = req.body;

  // Получаем продукт для точного названия и цены
  const product = (
    await query<Product>("SELECT * FROM products WHERE id = ?", [productId])
  )[0];
  if (!product) return res.json({ success: false, error: "Продукт не найден" });

  // Расчетная стоимость закупки = 60% от цены меню * количество
  const estCost = Math.round(product.price * 0.6 * amount);

  await run(
    "INSERT INTO supplies (product_id, product_name, amount, estimated_cost, date) VALUES (?,?,?,?,?)",
    [productId, product.name, amount, estCost, new Date().toISOString()],
  );
  res.json({ success: true });
});

app.post("/api/admin/sanitary", async (req, res) => {
  await run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('sanitary_day', ?)",
    [String(req.body.state)],
  );
  res.json({ success: true });
});

httpServer.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
