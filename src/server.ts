import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import cors from 'cors';
import md5 from 'md5';
import { fileURLToPath } from 'url';
import { configDotenv } from 'dotenv';

// --- ТИПЫ ДАННЫХ (Interfaces) ---
interface User {
    id: number;
    login: string;
    password?: string;
    name: string;
    role: string;
    balance: number;
    subscription_end?: string;
}

interface Product {
    id: number;
    category: string;
    name: string;
    price: number;
    calories: number;
    stock: number;
    image: string;
    desc: string;
}

interface OrderItem {
    id: number;
    category: string;
    name: string;
    price: number;
    quantity: number;
}

interface Order {
    id: number;
    user_id: number;
    items: string; // JSON string in DB
    total: number;
    status: string;
    rating: number;
}

interface Supply {
    id: number;
    product_name: string;
    status: string;
}

interface Setting {
    value: string;
}

interface CountResult {
    c: number;
}

interface SumResult {
    t: number;
}

interface AvgResult {
    r: number;
}

// --- КОНФИГУРАЦИЯ ---
const config = configDotenv().parsed!;
const BOT_TOKEN = config.BOT_TOKEN; 
const WEBAPP_URL = config.WEBAPP_URL; 
const PORT = config.PORT;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
const db = new sqlite3.Database('canteen.db');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (BOT_TOKEN) {
    const bot = new Telegraf(BOT_TOKEN);
    bot.command('start', (ctx) => {
        ctx.reply('Добро пожаловать в столовую! 🍱', Markup.keyboard([
            [Markup.button.webApp('📱 Открыть Столовую', WEBAPP_URL)]
        ]).resize());
    });
    bot.launch().then(() => console.log('🤖 Bot started'));
    
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// --- MIDDLEWARE ---
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// --- DB HELPERS ---
// Исправлено: добавлены типы для sql и params, а также Generic <T> для возвращаемого значения
const query = <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows as T[]);
        });
    });
};

const run = (sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> => {
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
        id INTEGER PRIMARY KEY, login TEXT UNIQUE, password TEXT,
        name TEXT, role TEXT DEFAULT 'STUDENT', balance REAL DEFAULT 0,
        subscription_end TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY, category TEXT, name TEXT, price INTEGER,
        calories INTEGER, stock INTEGER DEFAULT 50, image TEXT, description TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY, user_id INTEGER, user_name TEXT, items TEXT, 
        total INTEGER, status TEXT DEFAULT 'pending', date TEXT, rating INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS supplies (
        id INTEGER PRIMARY KEY, product_name TEXT, amount INTEGER, 
        status TEXT DEFAULT 'pending', date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT
    )`);

    // SEEDING
    // Исправлено: указан тип <CountResult>
    const usersCount = (await query<CountResult>("SELECT count(*) as c FROM users"))[0].c;
    if (usersCount === 0) {
        console.log("🌱 Seeding Users...");
        run("INSERT INTO users (login, password, name, role, balance) VALUES (?,?,?,?,?)", ["admin", md5("admin"), "Администратор", "ADMIN", 0]);
        run("INSERT INTO users (login, password, name, role, balance) VALUES (?,?,?,?,?)", ["cook", md5("cook"), "Шеф Повар", "COOK", 0]);
    }

    const prodCount = (await query<CountResult>("SELECT count(*) as c FROM products"))[0].c;
    if (prodCount === 0) {
        console.log("🌱 Seeding Products...");
        const products = [
            {id:1, category:'lunch', name:'Котлета по-киевски', price: 150, calories: 350, stock: 15, image:'🍗', desc:'С курицей и маслом'},
            {id:2, category:'lunch', name:'Пюре с подливой', price: 80, calories: 150, stock: 50, image:'🥔', desc:'Домашнее на молоке'},
            {id:3, category:'lunch', name:'Паста Карбонара', price: 210, calories: 420, stock: 10, image:'🍝', desc:'С беконом и сыром'},
            {id:4, category:'bakery', name:'Сосиска в тесте', price: 65, calories: 280, stock: 20, image:'🌭', desc:'Горячая выпечка'},
            {id:5, category:'drink', name:'Чай Зеленый', price: 30, calories: 2, stock: 100, image:'🍵', desc:'Без сахара'},
            {id:6, category:'snack', name:'Шоколад Ritter', price: 120, calories: 500, stock: 30, image:'🍫', desc:'Молочный с орехом'}
        ];
        products.forEach(p => {
            run("INSERT INTO products (id, category, name, price, calories, stock, image, description) VALUES (?,?,?,?,?,?,?,?)",
                [p.id, p.category, p.name, p.price, p.calories, p.stock, p.image, p.desc]);
        });
    }

    run("INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)", ['sanitary_day', 'false']);
});

// --- API ROUTES ---

// 1. Инициализация
app.get('/api/init', async (req: Request, res: Response) => {
    try {
        const products = await query<Product>("SELECT * FROM products");
        const sanitary = (await query<Setting>("SELECT value FROM settings WHERE key='sanitary_day'"))[0];
        res.json({ 
            products, 
            isSanitaryDay: sanitary ? sanitary.value === 'true' : false 
        });
    } catch (e) { res.status(500).json({ error: 'DB Error' }); }
});

// 2. Авторизация
app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
        const { login, password } = req.body;
        // Исправлено: указан тип <User>
        const user = (await query<User>("SELECT * FROM users WHERE login = ? AND password = ?", [login, md5(password)]))[0];
        if (user) {
            const { password, ...safeUser } = user;
            res.json({ success: true, user: safeUser });
        } else {
            res.json({ success: false, error: 'Неверно' });
        }
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
        const { login, password, name } = req.body;
        await run("INSERT INTO users (login, password, name, role, balance) VALUES (?,?,?,?,?)", [login, md5(password), name, 'STUDENT', 0]);
        res.json({ success: true });
    } catch { res.json({ success: false, error: 'Логин занят' }); }
});

// 3. Создание заказа
app.post('/api/orders', async (req: Request, res: Response) => {
    try {
        const sanitary = (await query<Setting>("SELECT value FROM settings WHERE key='sanitary_day'"))[0];
        if (sanitary && sanitary.value === 'true') {
            return res.json({ success: false, error: 'Столовая закрыта (Санитарный день)' });
        }

        const { userId, items, total, payWithSub } = req.body;
        const user = (await query<User>("SELECT * FROM users WHERE id=?", [userId]))[0];
        
        if (!payWithSub && user.balance < total) return res.json({ success: false, error: 'Мало средств' });

        // Исправлено: items типизирован как any[] в цикле, так как приходит из body
        for (const item of items as OrderItem[]) {
            await run("UPDATE products SET stock = stock - ? WHERE id=?", [item.quantity, item.id]);
        }
        if (!payWithSub) await run("UPDATE users SET balance = balance - ? WHERE id=?", [total, userId]);

        const dateStr = new Date().toISOString();
        const result = await run("INSERT INTO orders (user_id, user_name, items, total, status, date) VALUES (?, ?, ?, ?, 'pending', ?)",
            [userId, user.name, JSON.stringify(items), payWithSub ? 0 : total, dateStr]);

        const newOrder = { id: result.lastID, userId, userName: user.name, items, total: payWithSub?0:total, status:'pending', date:dateStr };
        io.emit('order:new', newOrder);

        const updatedUser = (await query<User>("SELECT * FROM users WHERE id=?", [userId]))[0];
        const { password, ...safeUser } = updatedUser;
        res.json({ success: true, user: safeUser });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 4. Подтверждение
app.post('/api/orders/confirm', async (req: Request, res: Response) => {
    try {
        const { orderId, rating } = req.body;
        await run("UPDATE orders SET status = 'completed', rating = ? WHERE id = ?", [rating, orderId]);
        io.emit('order:update', { id: orderId, status: 'completed' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 5. User API
app.get('/api/orders/user/:id', async (req: Request, res: Response) => {
    // Исправлено: указан тип <Order> и маппинг
    const rows = await query<Order>("SELECT * FROM orders WHERE user_id = ?", [req.params.id]);
    res.json(rows.map(o => ({ ...o, items: JSON.parse(o.items) })));
});

app.post('/api/user/topup', async (req: Request, res: Response) => {
    await run("UPDATE users SET balance = balance + ? WHERE id=?", [req.body.amount, req.body.userId]);
    res.json({ success: true });
});

app.post('/api/user/subscribe', async (req: Request, res: Response) => {
    const date = new Date(); date.setDate(date.getDate() + 30);
    await run("UPDATE users SET balance = balance - 3000, subscription_end = ? WHERE id=?", [date.toLocaleDateString('ru-RU'), req.body.userId]);
    res.json({ success: true, subDate: date.toLocaleDateString('ru-RU') });
});

// 6. Cook API
app.get('/api/cook/orders', async (req: Request, res: Response) => {
    const rows = await query<Order>("SELECT * FROM orders WHERE status != 'completed'");
    res.json(rows.map(o => ({ ...o, items: JSON.parse(o.items) })));
});

app.post('/api/cook/status', async (req: Request, res: Response) => {
    await run("UPDATE orders SET status = ? WHERE id = ?", [req.body.status, req.body.orderId]);
    io.emit('order:update', { id: req.body.orderId, status: req.body.status });
    res.json({ success: true });
});

app.post('/api/supplies/request', async (req: Request, res: Response) => {
    await run("INSERT INTO supplies (product_name, amount, status, date) VALUES (?, ?, 'pending', ?)", 
        [req.body.productName, req.body.amount, new Date().toISOString()]);
    res.json({ success: true });
});

// 7. Admin API
app.get('/api/admin/dashboard', async (req: Request, res: Response) => {
    try {
        const revenue = (await query<SumResult>("SELECT SUM(total) as t FROM orders WHERE status != 'pending'"))[0].t || 0;
        
        const orders = (await query<Order>("SELECT * FROM orders ORDER BY id DESC LIMIT 50")).map(o => ({ ...o, items: JSON.parse(o.items) }));
        
        const supplies = await query<Supply>("SELECT * FROM supplies ORDER BY id DESC");
        
        // Исправлено: Типизация items как OrderItem[] и объекта stats
        const allOrders = (await query<Order>("SELECT items FROM orders WHERE status='completed' LIMIT 200")).map(o => JSON.parse(o.items) as OrderItem[]);
        
        // Явно указываем, что ключи - строки, а значения - числа
        const stats: { [key: string]: number } = { 'lunch': 0, 'bakery': 0, 'drink': 0, 'snack': 0 };
        
        allOrders.forEach(items => {
            items.forEach((i) => {
                if (stats[i.category] !== undefined) {
                    stats[i.category] += (i.price * i.quantity);
                }
            });
        });

        const ratingRow = (await query<AvgResult>("SELECT AVG(rating) as r FROM orders WHERE rating > 0"))[0];
        const avgRating = ratingRow?.r ? ratingRow.r.toFixed(1) : "0.0";

        const sanitary = (await query<Setting>("SELECT value FROM settings WHERE key='sanitary_day'"))[0];

        res.json({
            revenue,
            orders,
            supplies,
            chartData: stats,
            avgRating,
            isSanitaryDay: sanitary ? sanitary.value === 'true' : false
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Admin error' });
    }
});

app.post('/api/admin/sanitary', async (req: Request, res: Response) => {
    const { state } = req.body;
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('sanitary_day', ?)", [String(state)]);
    res.json({ success: true });
});

app.post('/api/admin/supplies/approve', async (req: Request, res: Response) => {
    const sup = (await query<Supply>("SELECT * FROM supplies WHERE id=?", [req.body.id]))[0];
    if (sup) {
        await run("UPDATE products SET stock = stock + 50 WHERE name LIKE ?", [`%${sup.product_name}%`]);
        await run("UPDATE supplies SET status = 'approved' WHERE id=?", [req.body.id]);
        res.json({ success: true });
    }
});

// --- START ---
httpServer.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));