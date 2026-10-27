/*
 * public/js/product-details.js — GoodsPlatz product details page
 *
 * Responsibilities:
 *   1. Read the product ID from the URL query string (?id=<integer>).
 *   2. Validate the ID format before making any network request.
 *   3. Fetch the product from GET /api/products/:id.
 *   4. Render the product (name, price, image, category, description,
 *      stock availability) using DOM manipulation — never innerHTML
 *      with untrusted data.
 *   5. Provide an Add to Cart action button that honors availability
 *      without falsely claiming an unintegrated backend operation succeeded.
 *   6. Handle all error states:
 *        - Missing or invalid ID (no request made).
 *        - Product not found (404 from the API).
 *        - Network or server errors.
 *        - Loading state while the request is in-flight.
 *
 * Technology: vanilla JavaScript, Fetch API, DOM manipulation.
 */

"use strict";

/* ─── Element references ─────────────────────────────────────── */

var container = document.getElementById("product-detail-container");

/* ─── Helpers ─────────────────────────────────────────────────── */

/**
 * Format a numeric price as Indian Rupees.
 * @param {number|string} price
 * @returns {string}
 */
function formatPrice(price) {
    var num = Number(price);
    if (isNaN(num)) return "₹—";
    return "₹" + num.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Return an emoji representative of the product category.
 * @param {string} categoryName
 * @returns {string}
 */
function categoryEmoji(categoryName) {
    var name = (categoryName || "").toLowerCase();
    if (name.includes("electron"))  return "📱";
    if (name.includes("cloth"))     return "👕";
    if (name.includes("book"))      return "📚";
    if (name.includes("home"))      return "🏠";
    if (name.includes("kitchen"))   return "🍳";
    if (name.includes("sport"))     return "⚽";
    if (name.includes("toy"))       return "🧸";
    if (name.includes("food"))      return "🍎";
    return "🛍️";
}

/* ─── State renderers ────────────────────────────────────────── */

/**
 * Show a loading spinner.
 */
function showLoading() {
    if (!container) return;

    var div = document.createElement("div");
    div.className = "loading-state";

    var spinner = document.createElement("div");
    spinner.className = "spinner";

    var p = document.createElement("p");
    p.textContent = "Loading product details…";

    div.appendChild(spinner);
    div.appendChild(p);

    container.innerHTML = "";
    container.appendChild(div);
}

/**
 * Show a generic error message.
 * @param {string} heading
 * @param {string} message
 */
function showError(heading, message) {
    if (!container) return;

    var div = document.createElement("div");
    div.className = "error-state";

    var icon = document.createElement("div");
    icon.className = "error-icon";
    icon.textContent = "⚠️";

    var h2 = document.createElement("h2");
    h2.textContent = heading || "Something went wrong";

    var p = document.createElement("p");
    p.textContent = message || "We could not load this product. Please try again.";

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);

    container.innerHTML = "";
    container.appendChild(div);
}

/**
 * Show a not-found state when the product doesn't exist or is inactive.
 */
function showNotFound() {
    if (!container) return;

    var div = document.createElement("div");
    div.className = "empty-state";

    var icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "🔍";

    var h2 = document.createElement("h2");
    h2.textContent = "Product not found";

    var p = document.createElement("p");
    p.textContent = "This product may have been removed or is no longer available.";

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);

    container.innerHTML = "";
    container.appendChild(div);
}

/**
 * Show an invalid-ID state when the URL parameter is missing or not a number.
 */
function showInvalidId() {
    if (!container) return;

    var div = document.createElement("div");
    div.className = "error-state";

    var icon = document.createElement("div");
    icon.className = "error-icon";
    icon.textContent = "🚫";

    var h2 = document.createElement("h2");
    h2.textContent = "Invalid product link";

    var p = document.createElement("p");
    p.textContent = "The product URL is missing a valid ID. Please return to the product listing and try again.";

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);

    container.innerHTML = "";
    container.appendChild(div);
}

/* ─── Product renderer ───────────────────────────────────────── */

/**
 * Build and inject the full product detail layout.
 * All text is set via textContent or safe DOM properties.
 * @param {object} product — response object from GET /api/products/:id
 */
function renderProduct(product) {
    if (!container) return;

    // Update page title dynamically
    document.title = "GoodsPlatz | " + (product.product_name || "Product Details");

    // ── Outer layout ────────────────────────────────────────────
    var section = document.createElement("div");
    section.className = "product-detail";

    // ── Left: image ─────────────────────────────────────────────
    var imageDiv = document.createElement("div");
    imageDiv.className = "product-detail-image";

    var imageUrl = product.image || product.image_url;
    if (imageUrl) {
        var img = document.createElement("img");
        img.src = imageUrl;                            // safe attribute assignment
        img.alt = product.product_name || "Product image";

        img.onerror = function () {
            imageDiv.removeChild(img);
            imageDiv.textContent = categoryEmoji(product.category_name);
        };

        imageDiv.appendChild(img);
    } else {
        imageDiv.textContent = categoryEmoji(product.category_name);
    }

    // ── Right: info ─────────────────────────────────────────────
    var infoDiv = document.createElement("div");
    infoDiv.className = "product-detail-info";

    // Product name
    var h1 = document.createElement("h1");
    h1.textContent = product.product_name || "Product Details";
    infoDiv.appendChild(h1);

    // Price
    var priceEl = document.createElement("div");
    priceEl.className = "detail-price";
    priceEl.textContent = formatPrice(product.price);
    infoDiv.appendChild(priceEl);

    // Meta badges (category + stock status)
    var metaDiv = document.createElement("div");
    metaDiv.className = "detail-meta";

    if (product.category_name) {
        var catBadge = document.createElement("span");
        catBadge.className = "badge badge-category";
        catBadge.textContent = product.category_name;
        metaDiv.appendChild(catBadge);
    }

    var rawStock = product.stock_quantity !== undefined ? product.stock_quantity : product.stock;
    var stockQuantity = Number(rawStock);
    var inStock = !isNaN(stockQuantity) && stockQuantity > 0;

    var stockBadge = document.createElement("span");
    stockBadge.className = "badge " + (inStock ? "badge-instock" : "badge-outofstock");
    stockBadge.textContent = inStock ? "In Stock" : "Out of Stock";
    metaDiv.appendChild(stockBadge);

    infoDiv.appendChild(metaDiv);

    // Description
    if (product.description) {
        var descEl = document.createElement("p");
        descEl.className = "detail-description";
        descEl.textContent = product.description;
        infoDiv.appendChild(descEl);
    }

    // Stock count
    if (inStock) {
        var stockEl = document.createElement("p");
        stockEl.className = "detail-stock";
        stockEl.textContent = stockQuantity + " units available";
        infoDiv.appendChild(stockEl);
    }

    // Add to Cart action area
    var actionDiv = document.createElement("div");
    actionDiv.className = "detail-actions";

    var addToCartBtn = document.createElement("button");
    addToCartBtn.className = "btn btn-primary add-to-cart-btn";
    if (inStock) {
        addToCartBtn.textContent = "Add to Cart";
        addToCartBtn.addEventListener("click", function () {
            // Preserved for cart phase: inform user without false claims
            alert("Cart functionality will be enabled in Day 5. Item: " + (product.product_name || "Product"));
        });
    } else {
        addToCartBtn.textContent = "Out of Stock";
        addToCartBtn.disabled = true;
    }
    actionDiv.appendChild(addToCartBtn);
    infoDiv.appendChild(actionDiv);

    section.appendChild(imageDiv);
    section.appendChild(infoDiv);

    container.innerHTML = "";
    container.appendChild(section);
}

/* ─── Main fetch flow ────────────────────────────────────────── */

/**
 * Read ?id= from the current URL, validate it, then fetch and render
 * the product (or display the appropriate error state).
 */
function loadProduct() {
    var params    = new URLSearchParams(window.location.search);
    var rawId     = params.get("id");

    // ── Validate the ID ─────────────────────────────────────────
    var productId = Number(rawId);

    if (!rawId || !Number.isFinite(productId) || !Number.isInteger(productId) || productId <= 0) {
        showInvalidId();
        return;
    }

    showLoading();

    fetch("/api/products/" + productId, { credentials: "same-origin" })
        .then(function (response) {
            if (response.status === 404) {
                showNotFound();
                return null;
            }
            if (response.status === 400) {
                showInvalidId();
                return null;
            }
            if (!response.ok) {
                return response.json().then(function (data) {
                    throw new Error(data.message || "Server returned " + response.status);
                }).catch(function () {
                    throw new Error("Server returned " + response.status);
                });
            }
            return response.json();
        })
        .then(function (product) {
            if (product === null) return;
            if (!product || !product.product_id) {
                showNotFound();
                return;
            }
            renderProduct(product);
        })
        .catch(function (err) {
            console.error("Failed to load product:", err.message);
            showError(
                "Could not load product",
                err.message.includes("Failed to fetch")
                    ? "Could not reach the server. Make sure the server is running."
                    : err.message
            );
        });
}

/* ─── Initialise ─────────────────────────────────────────────── */

loadProduct();
