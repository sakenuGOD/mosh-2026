# 🍱 School Digital Canteen (mosh-2026)

## 📝 About
Web app that automates a school canteen. Students order food online and pay from their balance or subscription; cooks get the orders on a tablet in real time.

Kills the break-time queue and simplifies stock accounting. Built for a school olympiad.

### What it does
*   🍎 **Student:** online menu, queue-free ordering, subscription plans, reviews.
*   👨‍🍳 **Cook:** tablet view of incoming orders, stop-list for missing products.
*   📊 **Admin:** finance tracking, dish-popularity analytics, supply requests.
*   ⚡ **Real-time:** instant notifications over WebSockets.

## 🛠 Stack
*   **Backend:** Node.js, Express, TypeScript (run via `tsx`), SQLite3.
*   **Frontend:** single EJS page + TailwindCSS (CDN) + Alpine.js (CDN).
*   **Real-time:** Socket.IO.
*   **Bot integration:** Telegraf (Telegram notifications).

---

## 🚀 Install & run

1.  **Requirements:**
    Install [Node.js](https://nodejs.org/) (v16 or higher).

2.  **Clone:**
    ```bash
    git clone https://github.com/sakenuGOD/mosh-2026
    cd mosh-2026
    ```

3.  **Install dependencies:**
    ```bash
    npm install
    ```

4.  **Environment:**
    Create a `.env` file if needed — defaults work out of the box.

5.  **Run:**
    ```bash
    npm start
    ```
    *Or directly via TypeScript:*
    ```bash
    npx tsx src/server.ts
    ```

---

## 🖥 Usage
Open in your browser: [http://localhost:3000](http://localhost:3000)

### Test credentials

| Role | Login | Password |
| :--- | :--- | :--- |
| **Admin** | `admin` | `admin` |
| **Cook** | `cook` | `cook` |
| **Student** | `student` | `student` |

---

## 🎥 Demo video
👉 [Watch on Rutube](https://rutube.ru/video/private/f34127607058a6b2e99846c45d95d123/?r=a&p=BD8HE2CV94ACcUFUytakJA)
