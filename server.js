
require("dotenv").config();

const fs = require("fs");
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();

if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET .env file mein missing hai.");
    process.exit(1);
}

const frontendUrl = process.env.FRONTEND_URL || "http://127.0.0.1:5500";

app.use(cors({
    origin: frontendUrl,
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Database Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "billing_system",

    ssl: process.env.DB_SSL === "true"
        ? {
            ca: fs.readFileSync(process.env.DB_SSL_CA)
        }
        : undefined
});

db.connect((err) => {
    if (err) {
        console.log("Database connection failed:", err.message);
        return;
    }

    console.log("Database connected successfully!");
});

// Cookie Settings
const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
};

// Authentication Middleware
function authenticateToken(req, res, next) {
    const token = req.cookies.authToken;

    if (!token) {
        return res.status(401).json({
            message: "Please login first."
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie("authToken", cookieOptions);

        return res.status(401).json({
            message: "Session expired. Please login again."
        });
    }
}

// Home Route
app.get("/", (req, res) => {
    res.send("Billing System Server is running!");
});

// Setup Admin
app.post("/setup-admin", async (req, res) => {
    const { username, password } = req.body;

    if (
        typeof username !== "string" ||
        !username.trim() ||
        typeof password !== "string" ||
        password.length < 8
    ) {
        return res.status(400).send(
            "Username required hai aur password kam se kam 8 characters ka hona chahiye."
        );
    }

    db.query("SELECT COUNT(*) AS total FROM users", async (err, results) => {
        if (err) {
            console.log(err);
            return res.status(500).send("User check nahi ho paya.");
        }

        if (Number(results[0].total) > 0) {
            return res.status(403).send(
                "Admin account already created hai."
            );
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 12);

            db.query(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                [username.trim(), hashedPassword],
                (err) => {
                    if (err) {
                        console.log(err);
                        return res.status(500).send(
                            "Admin account create nahi hua."
                        );
                    }

                    res.status(201).send(
                        "Admin account successfully created. Ab login kar sakte ho."
                    );
                }
            );
        } catch (error) {
            console.log(error);
            res.status(500).send("Password process nahi ho paya.");
        }
    });
});

// Login
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        !username.trim() ||
        !password
    ) {
        return res.status(400).send("Username aur password required hain.");
    }

    db.query(
        "SELECT * FROM users WHERE username = ?",
        [username.trim()],
        async (err, results) => {
            if (err) {
                console.log(err);
                return res.status(500).send("Login nahi ho paya.");
            }

            if (results.length === 0) {
                return res.status(401).send("Username ya password galat hai.");
            }

            try {
                const user = results[0];

                const passwordMatch = await bcrypt.compare(
                    password,
                    user.password
                );

                if (!passwordMatch) {
                    return res.status(401).send(
                        "Username ya password galat hai."
                    );
                }

                const token = jwt.sign(
                    {
                        id: user.id,
                        username: user.username
                    },
                    process.env.JWT_SECRET,
                    { expiresIn: "7d" }
                );

                res.cookie("authToken", token, cookieOptions);

                res.json({
                    message: "Login successful!",
                    username: user.username
                });

            } catch (error) {
                console.log(error);
                res.status(500).send("Login process mein error aaya.");
            }
        }
    );
});

// Check Login Status
app.get("/auth-status", authenticateToken, (req, res) => {
    res.json({
        loggedIn: true,
        username: req.user.username
    });
});

// Logout
app.post("/logout", (req, res) => {
    res.clearCookie("authToken", cookieOptions);
    res.json({ message: "Logout successful!" });
});

// Get Products
app.get("/products", authenticateToken, (req, res) => {
    const sql = "SELECT * FROM products ORDER BY id DESC";

    db.query(sql, (err, results) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Products load nahi hue.");
        }

        res.json(results);
    });
});

// Add Product
app.post("/products", authenticateToken, (req, res) => {
    const { product_name, price, stock } = req.body;

    if (
        typeof product_name !== "string" ||
        !product_name.trim() ||
        !Number.isFinite(Number(price)) ||
        Number(price) <= 0 ||
        !Number.isInteger(Number(stock)) ||
        Number(stock) < 0
    ) {
        return res.status(400).send("Invalid product details.");
    }

    const sql = `
        INSERT INTO products (product_name, price, stock)
        VALUES (?, ?, ?)
    `;

    db.query(
        sql,
        [product_name.trim(), Number(price), Number(stock)],
        (err) => {
            if (err) {
                console.log(err);
                return res.status(500).send("Product add nahi hua.");
            }

            res.send("Product added successfully!");
        }
    );
});

// Complete Sale
app.post("/sales", authenticateToken, (req, res) => {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).send("Bill is empty.");
    }

    for (const item of items) {
        if (
            !Number.isInteger(Number(item.product_id)) ||
            Number(item.product_id) <= 0 ||
            !Number.isInteger(Number(item.quantity)) ||
            Number(item.quantity) <= 0
        ) {
            return res.status(400).send("Invalid bill items.");
        }
    }

    db.beginTransaction((err) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Transaction start nahi hua.");
        }

        let totalAmount = 0;
        const saleItems = [];

        function rollback(message) {
            db.rollback(() => {
                res.status(400).send(message);
            });
        }

        function processItem(index) {
            if (index >= items.length) {
                saveSale();
                return;
            }

            const item = items[index];
            const productId = Number(item.product_id);
            const quantity = Number(item.quantity);

            const selectSql = `
                SELECT * FROM products
                WHERE id = ?
                FOR UPDATE
            `;

            db.query(selectSql, [productId], (err, results) => {
                if (err) {
                    console.log(err);
                    return rollback("Product check nahi ho paya.");
                }

                if (results.length === 0) {
                    return rollback("Product nahi mila.");
                }

                const product = results[0];

                if (Number(product.stock) < quantity) {
                    return rollback(
                        "Insufficient stock for " + product.product_name
                    );
                }

                const price = Number(product.price);
                const itemTotal = price * quantity;

                totalAmount += itemTotal;

                saleItems.push({
                    product_id: product.id,
                    product_name: product.product_name,
                    price: price,
                    quantity: quantity
                });

                const updateSql = `
                    UPDATE products
                    SET stock = stock - ?
                    WHERE id = ?
                `;

                db.query(updateSql, [quantity, productId], (err) => {
                    if (err) {
                        console.log(err);
                        return rollback("Stock update nahi hua.");
                    }

                    processItem(index + 1);
                });
            });
        }

        function saveSale() {
            const saleSql = `
                INSERT INTO sales (total_amount)
                VALUES (?)
            `;

            db.query(saleSql, [totalAmount], (err, result) => {
                if (err) {
                    console.log(err);
                    return rollback("Sale save nahi hui.");
                }

                const saleId = result.insertId;

                const saleItemSql = `
                    INSERT INTO sale_items
                    (sale_id, product_id, product_name, price, quantity)
                    VALUES ?
                `;

                const values = saleItems.map(item => [
                    saleId,
                    item.product_id,
                    item.product_name,
                    item.price,
                    item.quantity
                ]);

                db.query(saleItemSql, [values], (err) => {
                    if (err) {
                        console.log(err);
                        return rollback("Bill items save nahi hue.");
                    }

                    db.commit((err) => {
                        if (err) {
                            console.log(err);

                            return db.rollback(() => {
                                res.status(500).send("Sale save nahi hui.");
                            });
                        }

                        res.send("Sale completed successfully!");
                    });
                });
            });
        }

        processItem(0);
    });
});

// Today's Sales
app.get("/today-sales", authenticateToken, (req, res) => {
    const sql = `
        SELECT COALESCE(SUM(total_amount), 0) AS todaySales
        FROM sales
        WHERE DATE(sales_date) = CURDATE()
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Today's sales load nahi hui.");
        }

        res.json(results[0]);
    });
});

// Yesterday's Sales
app.get("/yesterday-sales", authenticateToken, (req, res) => {
    const sql = `
        SELECT COALESCE(SUM(total_amount), 0) AS yesterdaySales
        FROM sales
        WHERE DATE(sales_date) = CURDATE() - INTERVAL 1 DAY
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Yesterday's sales load nahi hui.");
        }

        res.json(results[0]);
    });
});

// Start Server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
