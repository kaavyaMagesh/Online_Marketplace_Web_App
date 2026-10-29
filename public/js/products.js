/*
 * public/js/products.js — GoodsPlatz product listing page
 *
 * Responsibilities:
 *   1. On page load, fetch active categories from GET /api/categories
 *      and populate the category dropdown.
 *   2. Fetch products from GET /api/products (with optional ?search= and
 *      ?category= query parameters) and render them as cards in the grid.
 *   3. Handle the Search button and Enter key to re-fetch with the current
 *      search term.
 *   4. Handle category dropdown changes to re-fetch with the selected
 *      category. Search and category filters combine in one request.
 *   5. Render loading, empty, and error states in the grid area.
 *
 * Safety:
 *   - All product data is inserted via textContent or DOM properties,
 *     never via innerHTML with untrusted content.
 *   - Query params are built with URLSearchParams.
 *   - Image src values are set via .src = value (safe attribute assignment).
 *
 * Technology: vanilla JavaScript, Fetch API, DOM manipulation.
 * No frameworks. No dependencies beyond common.js (already loaded).
 */

"use strict";

/* ─── Element references ─────────────────────────────────────── */

var searchInput    = document.getElementById("search-input");
var searchBtn      = document.getElementById("search-btn");
var categorySelect = document.getElementById("category-select");
var productGrid    = document.getElementById("product-grid");
var resultsCount   = document.getElementById("results-count");

/* ─── Helpers ─────────────────────────────────────────────────── */

/**
 * Format a numeric price as an Indian Rupee string.
 * e.g. 1499 → "₹1,499.00"
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
 * Return a category emoji fallback based on category name.
 * Used when a product has no image.
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

/* ─── Render helpers ─────────────────────────────────────────── */

/**
 * Show a loading spinner in the grid area.
 */
function showLoading() {
    if (resultsCount) resultsCount.textContent = "";
    if (!productGrid) return;

    var div = document.createElement("div");
    div.className = "loading-state";

    var spinner = document.createElement("div");
    spinner.className = "spinner";

    var p = document.createElement("p");
    p.textContent = "Loading products…";

    div.appendChild(spinner);
    div.appendChild(p);

    productGrid.innerHTML = "";
    productGrid.appendChild(div);
}

/**
 * Show an empty-state message when no products match.
 * @param {string} search - Current search term (may be empty)
 * @param {string} category - Current category name (may be empty)
 */
function showEmpty(search, category) {
    if (!productGrid) return;

    var div = document.createElement("div");
    div.className = "empty-state";

    var icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "🔍";

    var h3 = document.createElement("h3");
    h3.textContent = "No products found";

    var p = document.createElement("p");
    if (search && category) {
        p.textContent = 'No products matched "' + search + '" in that category.';
    } else if (search) {
        p.textContent = 'No products matched "' + search + '". Try a different search term.';
    } else if (category) {
        p.textContent = "No products are available in this category right now.";
    } else {
        p.textContent = "No products are available at the moment. Check back soon.";
    }

    div.appendChild(icon);
    div.appendChild(h3);
    div.appendChild(p);

    productGrid.innerHTML = "";
    productGrid.appendChild(div);

    if (resultsCount) resultsCount.textContent = "0 products";
}

/**
 * Show an error message with a Retry button.
 * @param {string} message - User-facing error description
 */
function showError(message) {
    if (!productGrid) return;

    var div = document.createElement("div");
    div.className = "error-state";

    var icon = document.createElement("div");
    icon.className = "error-icon";
    icon.textContent = "⚠️";

    var h3 = document.createElement("h3");
    h3.textContent = "Something went wrong";

    var p = document.createElement("p");
    p.textContent = message || "We could not load products. Please try again.";

    var btn = document.createElement("button");
    btn.className = "retry-btn";
    btn.textContent = "Retry";
    btn.addEventListener("click", function () {
        loadProducts();
    });

    div.appendChild(icon);
    div.appendChild(h3);
    div.appendChild(p);
    div.appendChild(btn);

    productGrid.innerHTML = "";
    productGrid.appendChild(div);

    if (resultsCount) resultsCount.textContent = "";
}

/**
 * Build and return a single product card element.
 * All text is set via textContent — never innerHTML.
 * @param {object} product
 * @returns {HTMLElement}
 */
function buildProductCard(product) {
    var article = document.createElement("article");
    article.className = "product-card";

    // ── Image area ──────────────────────────────────────────────
    var imageDiv = document.createElement("div");
    imageDiv.className = "product-image";

    var imageUrl = product.image || product.image_url;
    if (imageUrl) {
        var img = document.createElement("img");
        img.src = imageUrl;                            // safe attribute assignment
        img.alt = product.product_name || "Product image";
        img.loading = "lazy";

        // If the image fails to load (broken URL), fall back to emoji
        img.onerror = function () {
            imageDiv.removeChild(img);
            imageDiv.textContent = categoryEmoji(product.category_name);
        };

        imageDiv.appendChild(img);
    } else {
        imageDiv.textContent = categoryEmoji(product.category_name);
    }

    // ── Product info ────────────────────────────────────────────
    var infoDiv = document.createElement("div");
    infoDiv.className = "product-info";

    // Category tag (optional)
    if (product.category_name) {
        var catTag = document.createElement("span");
        catTag.className = "product-category-tag";
        catTag.textContent = product.category_name;
        infoDiv.appendChild(catTag);
    }

    // Product name
    var h3 = document.createElement("h3");
    h3.textContent = product.product_name || "Unnamed Product";
    infoDiv.appendChild(h3);

    // Short description
    if (product.description) {
        var desc = document.createElement("p");
        desc.className = "product-description";
        desc.textContent = product.description;
        infoDiv.appendChild(desc);
    }

    // Price
    var priceEl = document.createElement("p");
    priceEl.className = "price";
    priceEl.textContent = formatPrice(product.price);
    infoDiv.appendChild(priceEl);

    // ── Card footer with link and Add to Cart ───────────────────
    var footer = document.createElement("div");
    footer.className = "product-card-footer";

    var link = document.createElement("a");
    link.className = "view-details-link";
    link.href = "product-details.html?id=" + encodeURIComponent(product.product_id);
    link.textContent = "View Details";
    footer.appendChild(link);

    var rawStock = product.stock_quantity !== undefined ? product.stock_quantity : product.stock;
    var stockQty = Number(rawStock);
    var inStock  = !isNaN(stockQty) && stockQty > 0;

    var addBtn = document.createElement("button");
    addBtn.className = "card-add-btn";
    addBtn.type = "button";
    if (inStock) {
        addBtn.textContent = "+ Cart";
        addBtn.setAttribute("aria-label", "Add " + (product.product_name || "product") + " to cart");
        addBtn.addEventListener("click", function (e) {
            e.preventDefault();
            addBtn.disabled = true;
            addBtn.textContent = "Adding…";

            fetch("/api/cart/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ product_id: product.product_id, quantity: 1 })
            })
            .then(function (res) {
                if (res.status === 401) {
                    if (confirm("Please log in to add items to your cart.\n\nGo to login page now?")) {
                        window.location.href = "login.html";
                    }
                    return null;
                }
                return res.json().then(function (data) {
                    if (!res.ok) {
                        throw new Error(data.error || "Could not add item to cart.");
                    }
                    return data;
                });
            })
            .then(function (data) {
                if (!data) {
                    addBtn.disabled = false;
                    addBtn.textContent = "+ Cart";
                    return;
                }
                addBtn.textContent = "✓ Added!";
                if (typeof window.updateCartBadge === "function") {
                    window.updateCartBadge();
                }
                setTimeout(function () {
                    addBtn.disabled = false;
                    addBtn.textContent = "+ Cart";
                }, 1500);
            })
            .catch(function (err) {
                alert(err.message);
                addBtn.disabled = false;
                addBtn.textContent = "+ Cart";
            });
        });
    } else {
        addBtn.textContent = "Out of Stock";
        addBtn.disabled = true;
    }
    footer.appendChild(addBtn);

    article.appendChild(imageDiv);
    article.appendChild(infoDiv);
    article.appendChild(footer);

    return article;
}

/**
 * Render an array of products into the grid.
 * @param {Array} products
 * @param {string} search - Current search term (for empty state message)
 * @param {string} categoryLabel - Current category label (for empty state message)
 */
function renderProducts(products, search, categoryLabel) {
    if (!productGrid) return;

    productGrid.innerHTML = "";

    if (!products || products.length === 0) {
        showEmpty(search, categoryLabel);
        return;
    }

    // Update result count
    if (resultsCount) {
        resultsCount.textContent =
            products.length === 1
                ? "1 product found"
                : products.length + " products found";
    }

    // Build and append each card using a DocumentFragment for performance
    var frag = document.createDocumentFragment();
    products.forEach(function (product) {
        frag.appendChild(buildProductCard(product));
    });
    productGrid.appendChild(frag);
}

/* ─── Data fetching ──────────────────────────────────────────── */

/**
 * Fetch and render products, applying current search and category values.
 */
function loadProducts() {
    var search   = searchInput  ? searchInput.value.trim() : "";
    var category = categorySelect ? categorySelect.value   : "";

    // Build query string safely with URLSearchParams
    var params = new URLSearchParams();
    if (search)   params.set("search",   search);
    if (category) params.set("category", category);

    var url = "/api/products";
    var qs  = params.toString();
    if (qs) url += "?" + qs;

    // Derive category label for empty-state messages
    var categoryLabel = "";
    if (categorySelect && category) {
        var selectedOpt = categorySelect.options[categorySelect.selectedIndex];
        categoryLabel   = selectedOpt ? selectedOpt.textContent : "";
    }

    showLoading();

    fetch(url, { credentials: "same-origin" })
        .then(function (response) {
            if (!response.ok) {
                return response.json().then(function (data) {
                    throw new Error(data.message || "Server returned " + response.status);
                }).catch(function () {
                    throw new Error("Server returned " + response.status);
                });
            }
            return response.json();
        })
        .then(function (data) {
            var products = Array.isArray(data.products) ? data.products : [];
            renderProducts(products, search, categoryLabel);
        })
        .catch(function (err) {
            console.error("Failed to load products:", err.message);
            showError(
                err.message.includes("Failed to fetch")
                    ? "Could not reach the server. Make sure the server is running."
                    : err.message
            );
        });
}

/**
 * Fetch active categories from GET /api/categories and populate
 * the dropdown. On success, trigger the initial product load.
 */
function loadCategories() {
    fetch("/api/categories", { credentials: "same-origin" })
        .then(function (response) {
            if (!response.ok) {
                throw new Error("Categories request failed with status " + response.status);
            }
            return response.json();
        })
        .then(function (categories) {
            if (!categorySelect) return;

            if (Array.isArray(categories)) {
                categories.forEach(function (cat) {
                    var option = document.createElement("option");
                    option.value = cat.category_id;
                    option.textContent = cat.category_name;
                    categorySelect.appendChild(option);
                });
            }

            loadProducts();
        })
        .catch(function (err) {
            console.warn("Could not load categories:", err.message);
            loadProducts();
        });
}

/* ─── Event listeners ────────────────────────────────────────── */

// Search button click
if (searchBtn) {
    searchBtn.addEventListener("click", function () {
        loadProducts();
    });
}

// Press Enter in the search input
if (searchInput) {
    searchInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            loadProducts();
        }
    });

    // Native clear button on search input
    searchInput.addEventListener("input", function () {
        if (searchInput.value === "") {
            loadProducts();
        }
    });
}

// Category dropdown change
if (categorySelect) {
    categorySelect.addEventListener("change", function () {
        loadProducts();
    });
}

/* ─── Initialise ─────────────────────────────────────────────── */

loadCategories();
