"use strict";

// DOM elements
const productForm = document.getElementById("productForm");
const productNameInput = document.getElementById("productName");
const productPriceInput = document.getElementById("productPrice");
const productStockInput = document.getElementById("productStock");

const productList = document.getElementById("productList");
const emptyProducts = document.getElementById("emptyProducts");

const billProduct = document.getElementById("billProduct");
const billingForm = document.getElementById("billingForm");
const billQuantity = document.getElementById("billQuantity");
const billList = document.getElementById("billList");

const grandTotal = document.getElementById("grandTotal");
const completeSaleButton = document.getElementById("completeSale");

// Storage keys
const PRODUCTS_KEY = "kiranaSmartProducts_v1";
const SALES_KEY = "kiranaSmartSales_v1";

// Read saved data safely
function readStorage(key, fallback) {
    try {
        const value = localStorage.getItem(key);

        if (value === null) {
            return fallback;
        }

        return JSON.parse(value);
    } catch (error) {
        console.error("Could not read saved data:", error);
        return fallback;
    }
}

function saveStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error("Could not save data:", error);
        alert("Data save nahi ho paya. Browser storage check karein.");
        return false;
    }
}

// Validate stored products before using them
function validProduct(product) {
    return product &&
        typeof product.name === "string" &&
        product.name.trim().length > 0 &&
        Number.isFinite(product.price) &&
        product.price > 0 &&
        Number.isInteger(product.stock) &&
        product.stock >= 0;
}

const savedProducts = readStorage(PRODUCTS_KEY, []);

let products = Array.isArray(savedProducts)
    ? savedProducts.filter(validProduct)
    : [];

const savedSales = readStorage(SALES_KEY, []);

let sales = Array.isArray(savedSales)
    ? savedSales.filter(sale =>
        sale &&
        typeof sale.date === "string" &&
        Number.isFinite(sale.total) &&
        sale.total >= 0
    )
    : [];

// Cart stores product IDs rather than array positions
let cart = [];

function money(amount) {
    return "₹" + amount.toFixed(2);
}

function todayKey() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function saveProducts() {
    return saveStorage(PRODUCTS_KEY, products);
}

function saveSales() {
    return saveStorage(SALES_KEY, sales);
}

// Dashboard
function updateDashboard() {
    document.getElementById("totalProducts").textContent =
        products.length;

    const totalStock = products.reduce(
        (sum, product) => sum + product.stock,
        0
    );

    document.getElementById("totalStock").textContent =
        totalStock;

    const lowStockCount = products.filter(
        product => product.stock <= 5
    ).length;

    document.getElementById("lowStock").textContent =
        lowStockCount;

    const dailyTotal = sales
        .filter(sale => sale.date === todayKey())
        .reduce((sum, sale) => sum + sale.total, 0);

    document.getElementById("todaySales").textContent =
        money(dailyTotal);
}

// Create safe table cells without inserting user text as HTML
function addCell(row, text) {
    const cell = document.createElement("td");
    cell.textContent = String(text);
    row.appendChild(cell);
    return cell;
}

// Show products and update billing dropdown
function renderProducts() {
    productList.replaceChildren();
    billProduct.replaceChildren();

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select Product";
    billProduct.appendChild(defaultOption);

    emptyProducts.hidden = products.length > 0;

    products.forEach(product => {
        const row = document.createElement("tr");

        addCell(row, product.name);
        addCell(row, money(product.price));
        addCell(row, product.stock);

        const statusCell = addCell(
            row,
            product.stock === 0
                ? "Out of Stock"
                : product.stock <= 5
                    ? "Low Stock"
                    : "Available"
        );

        if (product.stock === 0 || product.stock <= 5) {
            statusCell.className = "status-low";
        } else {
            statusCell.className = "status-available";
        }

        productList.appendChild(row);

        if (product.stock > 0) {
            const option = document.createElement("option");

            option.value = product.id;
            option.textContent =
                `${product.name} — ${money(product.price)} ` +
                `(Stock: ${product.stock})`;

            billProduct.appendChild(option);
        }
    });

    updateDashboard();
}

// Add product
productForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const name = productNameInput.value.trim();
    const price = Number(productPriceInput.value);
    const stock = Number(productStockInput.value);

    if (name.length === 0) {
        alert("Please enter a product name.");
        return;
    }

    if (!Number.isFinite(price) || price <= 0) {
        alert("Price must be greater than zero.");
        return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
        alert("Stock must be a whole number and cannot be negative.");
        return;
    }

    const product = {
        id: createProductId(),
        name: name,
        price: price,
        stock: stock
    };

    products.push(product);

    if (!saveProducts()) {
        products.pop();
        return;
    }

    renderProducts();
    productForm.reset();

    alert("Product added successfully!");
});

function createProductId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }

    return "product-" + Date.now() + "-" +
        Math.random().toString(16).slice(2);
}

// Find a product in the cart
function findCartItem(productId) {
    return cart.find(item => item.productId === productId);
}

// Add product to bill
billingForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const productId = billProduct.value;
    const quantity = Number(billQuantity.value);

    const product = products.find(
        item => item.id === productId
    );

    if (!product) {
        alert("Please select a product.");
        return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
        alert("Quantity must be a whole number greater than zero.");
        return;
    }

    const cartItem = findCartItem(productId);
    const existingQuantity = cartItem ? cartItem.quantity : 0;

    if (existingQuantity + quantity > product.stock) {
        alert("Not enough stock available!");
        return;
    }

    if (cartItem) {
        cartItem.quantity += quantity;
    } else {
        cart.push({
            productId: product.id,
            quantity: quantity
        });
    }

    renderBill();
    billingForm.reset();
});

// Show bill
function renderBill() {
    billList.replaceChildren();

    let total = 0;

    cart.forEach(item => {
        const product = products.find(
            entry => entry.id === item.productId
        );

        if (!product) {
            return;
        }

        const itemTotal = product.price * item.quantity;
        total += itemTotal;

        const row = document.createElement("tr");

        addCell(row, product.name);
        addCell(row, money(product.price));
        addCell(row, item.quantity);
        addCell(row, money(itemTotal));

        const actionCell = document.createElement("td");
        const removeButton = document.createElement("button");

        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.className = "remove-button";

        removeButton.addEventListener("click", function() {
            cart = cart.filter(
                cartItem => cartItem.productId !== item.productId
            );

            renderBill();
        });

        actionCell.appendChild(removeButton);
        row.appendChild(actionCell);

        billList.appendChild(row);
    });

    grandTotal.textContent = money(total);
}

// Complete sale
completeSaleButton.addEventListener("click", function() {
    if (cart.length === 0) {
        alert("Please add at least one product to the bill.");
        return;
    }

    // Validate all items before changing stock
    for (const item of cart) {
        const product = products.find(
            entry => entry.id === item.productId
        );

        if (!product || item.quantity > product.stock) {
            alert(
                "Stock is insufficient. Please remove the item " +
                "and add it again."
            );
            return;
        }
    }

    const total = cart.reduce((sum, item) => {
        const product = products.find(
            entry => entry.id === item.productId
        );

        return sum + product.price * item.quantity;
    }, 0);

    const previousProducts = products.map(product => ({
        ...product
    }));

    const sale = {
        date: todayKey(),
        total: total,
        items: cart.map(item => {
            const product = products.find(
                entry => entry.id === item.productId
            );

            return {
                name: product.name,
                price: product.price,
                quantity: item.quantity
            };
        })
    };

    // Deduct stock
    cart.forEach(item => {
        const product = products.find(
            entry => entry.id === item.productId
        );

        product.stock -= item.quantity;
    });

    sales.push(sale);

    // Save both stock and sale; roll back if saving fails
    if (!saveProducts()) {
        products = previousProducts;
        sales.pop();
        renderProducts();
        return;
    }

    if (!saveSales()) {
        products = previousProducts;
        sales.pop();

        saveProducts();
        renderProducts();

        alert("Sale save nahi hui. Please dobara try karein.");
        return;
    }

    cart = [];
    renderProducts();
    renderBill();
    alert(
        "Sale completed successfully!\n" +
        "Total Amount: " + money(total)
    );
});

// Initial page render
renderProducts();
renderBill();