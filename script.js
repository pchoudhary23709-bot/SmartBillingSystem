
"use strict";

// API URL
const API_URL = "http://127.0.0.1:3000";

// Authentication elements
const loginSection = document.getElementById("loginSection");
const appLayout = document.getElementById("appLayout");
const loginForm = document.getElementById("loginForm");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginMessage = document.getElementById("loginMessage");

const setupForm = document.getElementById("setupForm");
const setupUsername = document.getElementById("setupUsername");
const setupPassword = document.getElementById("setupPassword");
const setupMessage = document.getElementById("setupMessage");

const loginBox = document.getElementById("loginBox");
const setupBox = document.getElementById("setupBox");

const showSetupLink = document.getElementById("showSetup");
const showLoginLink = document.getElementById("showLogin");
const logoutButton = document.getElementById("logoutBtn");

let isAuthenticated = false;

// DOM elements
const productForm = document.getElementById("productForm");
const productNameInput = document.getElementById("productName");
const productPriceInput = document.getElementById("productPrice");
const productStockInput = document.getElementById("productStock");

const productList = document.getElementById("productList");
const emptyProducts = document.getElementById("emptyProducts");

const billingForm = document.getElementById("billingForm");
const billProduct = document.getElementById("billProduct");
const billQuantity = document.getElementById("billQuantity");

const billList = document.getElementById("billList");
const grandTotal = document.getElementById("grandTotal");

const completeSaleButton = document.getElementById("completeSale");
const printBillButton = document.getElementById("printBill");

const totalProductsElement = document.getElementById("totalProducts");
const totalStockElement = document.getElementById("totalStock");
const lowStockElement = document.getElementById("lowStock");
const todaySalesElement = document.getElementById("todaySales");
const yesterdaySalesElement = document.getElementById("yesterdaySales");

// Application data
let products = [];
let cart = [];
let lastCompletedBill = null;

// Currency format
function formatCurrency(amount) {
    return "₹" + Number(amount).toFixed(2);
}

// API requests with login cookie
async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "include"
    });

    if (response.status === 401 && isAuthenticated) {
        isAuthenticated = false;
        showLoginScreen("Session expired. Please login again.");
    }

    return response;
}

// Load products from database
async function loadProducts() {
    try {
        const response = await apiFetch(`${API_URL}/products`);

        if (!response.ok) {
            throw new Error("Products load nahi hue.");
        }

        const data = await response.json();

        products = data.map(item => ({
            id: String(item.id),
            name: item.product_name,
            price: Number(item.price),
            stock: Number(item.stock)
        }));

        renderProducts();
        updateDashboard();

    } catch (error) {
        console.error("Product loading error:", error);

        if (isAuthenticated) {
            alert("Database se products load nahi ho paaye. Server check karo.");
        }
    }
}

// Display products in table and dropdown
function renderProducts() {
    productList.innerHTML = "";

    if (products.length === 0) {
        emptyProducts.style.display = "block";
    } else {
        emptyProducts.style.display = "none";
    }

    products.forEach(product => {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = product.name;

        const priceCell = document.createElement("td");
        priceCell.textContent = formatCurrency(product.price);

        const stockCell = document.createElement("td");
        stockCell.textContent = product.stock;

        row.append(nameCell, priceCell, stockCell);
        productList.appendChild(row);
    });

    billProduct.innerHTML = '<option value="">Select Product</option>';

    products.forEach(product => {
        if (product.stock > 0) {
            const option = document.createElement("option");

            option.value = product.id;
            option.textContent =
                `${product.name} - ${formatCurrency(product.price)} (Stock: ${product.stock})`;

            billProduct.appendChild(option);
        }
    });
}

// Update dashboard values
function updateDashboard() {
    const totalStock = products.reduce(
        (sum, product) => sum + product.stock,
        0
    );

    const lowStock = products.filter(
        product => product.stock <= 5
    ).length;

    totalProductsElement.textContent = products.length;
    totalStockElement.textContent = totalStock;
    lowStockElement.textContent = lowStock;
}

// Load today's sales
async function loadTodaySales() {
    try {
        const response = await apiFetch(`${API_URL}/today-sales`);

        if (!response.ok) {
            throw new Error("Today's sales load nahi hui.");
        }

        const data = await response.json();

        todaySalesElement.textContent =
            formatCurrency(data.todaySales || 0);

    } catch (error) {
        console.error("Sales loading error:", error);
        todaySalesElement.textContent = formatCurrency(0);
    }
}

// Load yesterday's sales
async function loadYesterdaySales() {
    try {
        const response = await apiFetch(`${API_URL}/yesterday-sales`);

        if (!response.ok) {
            throw new Error("Yesterday's sales load nahi hui.");
        }

        const data = await response.json();

        yesterdaySalesElement.textContent =
            formatCurrency(data.yesterdaySales || 0);

    } catch (error) {
        console.error("Yesterday sales loading error:", error);
        yesterdaySalesElement.textContent = formatCurrency(0);
    }
}

// Add new product
productForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const name = productNameInput.value.trim();
    const price = Number(productPriceInput.value);
    const stock = Number(productStockInput.value);

    if (!name || price <= 0 || stock < 0 ||
        !Number.isInteger(stock)) {
        alert("Please valid product details enter karo.");
        return;
    }

    try {
        const response = await apiFetch(`${API_URL}/products`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                product_name: name,
                price: price,
                stock: stock
            })
        });

        const message = await response.text();

        if (!response.ok) {
            throw new Error(message);
        }

        alert("Product added successfully!");

        productForm.reset();
        await loadProducts();

    } catch (error) {
        console.error("Add product error:", error);
        alert("Product add nahi hua: " + error.message);
    }
});

// Add product to bill
billingForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const productId = billProduct.value;
    const quantity = Number(billQuantity.value);

    if (!productId || quantity <= 0 ||
        !Number.isInteger(quantity)) {
        alert("Please product aur valid quantity select karo.");
        return;
    }

    const product = products.find(
        item => item.id === productId
    );

    if (!product) {
        alert("Product nahi mila.");
        return;
    }

    const existingItem = cart.find(
        item => item.productId === productId
    );

    const alreadyAdded = existingItem
        ? existingItem.quantity
        : 0;

    if (alreadyAdded + quantity > product.stock) {
        alert("Available stock se zyada quantity nahi add kar sakte.");
        return;
    }

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            productId: productId,
            quantity: quantity
        });
    }

    billingForm.reset();
    renderBill();
});

// Display bill
function renderBill() {
    billList.innerHTML = "";

    let total = 0;

    cart.forEach(item => {
        const product = products.find(
            entry => entry.id === item.productId
        );

        if (!product) return;

        const itemTotal = product.price * item.quantity;
        total += itemTotal;

        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = product.name;

        const priceCell = document.createElement("td");
        priceCell.textContent = formatCurrency(product.price);

        const quantityCell = document.createElement("td");
        quantityCell.textContent = item.quantity;

        const totalCell = document.createElement("td");
        totalCell.textContent = formatCurrency(itemTotal);

        const actionCell = document.createElement("td");
        const removeButton = document.createElement("button");

        removeButton.type = "button";
        removeButton.textContent = "Remove";

        removeButton.addEventListener("click", function() {
            cart = cart.filter(
                cartItem => cartItem.productId !== item.productId
            );

            renderBill();
        });

        actionCell.appendChild(removeButton);

        row.append(
            nameCell,
            priceCell,
            quantityCell,
            totalCell,
            actionCell
        );

        billList.appendChild(row);
    });

    grandTotal.textContent = formatCurrency(total);
}

// Complete sale
completeSaleButton.addEventListener("click", async function() {
    if (cart.length === 0) {
        alert("Please pehle bill mein product add karo.");
        return;
    }

    const billItems = cart.map(item => {
        const product = products.find(
            entry => entry.id === item.productId
        );

        return {
            name: product.name,
            price: product.price,
            quantity: item.quantity,
            total: product.price * item.quantity
        };
    });

    const totalAmount = billItems.reduce(
        (sum, item) => sum + item.total,
        0
    );

    const itemsForServer = cart.map(item => ({
        product_id: Number(item.productId),
        quantity: item.quantity
    }));

    try {
        completeSaleButton.disabled = true;

        const response = await apiFetch(`${API_URL}/sales`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                items: itemsForServer
            })
        });

        const message = await response.text();

        if (!response.ok) {
            throw new Error(message);
        }

        lastCompletedBill = {
            items: billItems,
            total: totalAmount,
            date: new Date().toLocaleString("en-IN")
        };

        alert("Sale completed successfully!");

        cart = [];
        renderBill();

        await loadProducts();
        await loadTodaySales();
        await loadYesterdaySales();

    } catch (error) {
        console.error("Sale error:", error);
        alert("Sale complete nahi hui: " + error.message);

    } finally {
        completeSaleButton.disabled = false;
    }
});

// Print completed invoice
printBillButton.addEventListener("click", function() {
    if (!lastCompletedBill) {
        alert("Pehle Complete Sale button se sale complete karo.");
        return;
    }

    const printArea = document.getElementById("billPrintHeader");

    let invoiceRows = "";

    lastCompletedBill.items.forEach(item => {
        invoiceRows += `
            <tr>
                <td>${escapeHTML(item.name)}</td>
                <td>${formatCurrency(item.price)}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.total)}</td>
            </tr>
        `;
    });

    printArea.innerHTML = `
        <div class="invoice">
            <h1>Smart Billing System</h1>
            <h2>Customer Invoice</h2>
            <p>Date: ${escapeHTML(lastCompletedBill.date)}</p>

            <table>
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>Price</th>
                        <th>Quantity</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoiceRows}
                </tbody>
            </table>

            <h3>
                Grand Total: ${formatCurrency(lastCompletedBill.total)}
            </h3>

            <p>Thank you for shopping with us!</p>
        </div>
    `;

    window.print();
});

// Escape product names
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function(character) {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

// Show login screen
function showLoginScreen(message = "") {
    loginSection.style.display = "flex";
    appLayout.style.display = "none";

    loginMessage.textContent = message;
    loginPassword.value = "";
}

// Show dashboard after login
async function showDashboard(username = "") {
    isAuthenticated = true;

    loginSection.style.display = "none";
    appLayout.style.display = "flex";

    loginMessage.textContent = "";

    const welcomeText = document.querySelector(".welcome");

    if (welcomeText && username) {
        welcomeText.textContent = `Welcome back, ${username}!`;
    }

    await loadProducts();
    await loadTodaySales();
    await loadYesterdaySales();

    renderBill();
}

// Show admin setup form
showSetupLink.addEventListener("click", function(event) {
    event.preventDefault();

    loginBox.style.display = "none";
    setupBox.style.display = "block";

    setupMessage.textContent = "";
});

// Back to login
showLoginLink.addEventListener("click", function(event) {
    event.preventDefault();

    setupBox.style.display = "none";
    loginBox.style.display = "block";

    loginMessage.textContent = "";
});

// Create first admin account
setupForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const username = setupUsername.value.trim();
    const password = setupPassword.value;

    if (!username || password.length < 8) {
        setupMessage.textContent =
            "Username aur minimum 8-character password enter karo.";

        return;
    }

    try {
        const response = await fetch(`${API_URL}/setup-admin`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        const message = await response.text();

        if (!response.ok) {
            throw new Error(message);
        }

        setupForm.reset();

        setupBox.style.display = "none";
        loginBox.style.display = "block";

        loginMessage.textContent =
            "Admin account created! Ab login karo.";

    } catch (error) {
        setupMessage.textContent = error.message;
    }
});

// Login
loginForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.message || "Username ya password galat hai."
            );
        }

        loginForm.reset();

        await showDashboard(data.username);

    } catch (error) {
        loginMessage.textContent = error.message;
    }
});

// Logout
logoutButton.addEventListener("click", async function() {
    try {
        await fetch(`${API_URL}/logout`, {
            method: "POST",
            credentials: "include"
        });

    } catch (error) {
        console.error("Logout error:", error);
    }

    isAuthenticated = false;

    cart = [];
    products = [];
    lastCompletedBill = null;

    productList.innerHTML = "";
    billProduct.innerHTML = '<option value="">Select Product</option>';

    renderBill();

    showLoginScreen("You have been logged out.");
});

// Check existing login session
async function checkLoginStatus() {
    try {
        const response = await fetch(`${API_URL}/auth-status`, {
            credentials: "include"
        });

        if (!response.ok) {
            showLoginScreen();
            return;
        }

        const data = await response.json();

        await showDashboard(data.username);

    } catch (error) {
        console.error("Login status check failed:", error);

        showLoginScreen(
            "Server se connection nahi ho pa raha. Server check karo."
        );
    }
}

// Initial loading
showLoginScreen();
checkLoginStatus();
