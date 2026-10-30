/*
 * public/js/cart.js — GoodsPlatz Shopping Cart UI logic
 *
 * Responsibilities:
 *   1. Fetch user's cart from GET /api/cart.
 *   2. Handle unauthenticated state (401 -> link to login).
 *   3. Handle empty cart state with friendly prompt and link to products.
 *   4. Render items with image, details, unit price, quantity controls,
 *      item subtotal, and remove button.
 *   5. Real-time quantity adjustments (step +/- and direct input) via
 *      PATCH /api/cart/items/:productId.
 *   6. Single item deletion via DELETE /api/cart/items/:productId.
 *   7. Clear entire cart via DELETE /api/cart.
 *   8. Prevent race conditions and duplicate submissions while requests are in-flight.
 *   9. Safe DOM manipulation via textContent — no unsafe HTML interpolation.
 *  10. Update shared header cart badge on every cart modification.
 */

"use strict";

/* ─── Element References ─────────────────────────────────────── */

var cartContainer = document.getElementById("cart-container");
var alertContainer = document.getElementById("cart-alert-container");

/* ─── Helpers ─────────────────────────────────────────────────── */

/**
 * Format numeric value as Indian Rupees.
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
 * Return category emoji fallback when image is unavailable.
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

/**
 * Display a temporary alert banner at the top of the cart page.
 * @param {string} message
 * @param {"success"|"error"|"info"} type
 */
function showAlert(message, type) {
    if (!alertContainer) return;

    alertContainer.innerHTML = "";
    if (!message) return;

    var alertDiv = document.createElement("div");
    alertDiv.className = "cart-alert cart-alert-" + (type || "info");

    var span = document.createElement("span");
    span.textContent = message;
    alertDiv.appendChild(span);

    var closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.background = "none";
    closeBtn.style.border = "none";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.fontSize = "16px";
    closeBtn.setAttribute("aria-label", "Dismiss alert");
    closeBtn.addEventListener("click", function () {
        alertContainer.innerHTML = "";
    });
    alertDiv.appendChild(closeBtn);

    alertContainer.appendChild(alertDiv);

    // Auto dismiss after 6 seconds for success/info
    if (type !== "error") {
        setTimeout(function () {
            if (alertContainer.contains(alertDiv)) {
                alertContainer.removeChild(alertDiv);
            }
        }, 6000);
    }
}

/* ─── State Renderers ────────────────────────────────────────── */

/**
 * Show loading spinner.
 */
function showLoading() {
    if (!cartContainer) return;
    cartContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "loading-state";

    var spinner = document.createElement("div");
    spinner.className = "spinner";

    var p = document.createElement("p");
    p.textContent = "Loading your cart…";

    div.appendChild(spinner);
    div.appendChild(p);
    cartContainer.appendChild(div);
}

/**
 * Show unauthenticated state directing user to login.
 */
function showUnauthenticated() {
    if (!cartContainer) return;
    cartContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "empty-state";

    var icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "🔒";

    var h2 = document.createElement("h2");
    h2.textContent = "Please log in to view your cart";

    var p = document.createElement("p");
    p.textContent = "Sign in to access your saved items and proceed to checkout.";

    var btn = document.createElement("a");
    btn.className = "primary-button";
    btn.href = "login.html";
    btn.textContent = "Log In to GoodsPlatz";
    btn.style.display = "inline-block";
    btn.style.marginTop = "16px";

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);
    div.appendChild(btn);

    cartContainer.appendChild(div);
}

/**
 * Show empty cart state.
 */
function showEmptyCart() {
    if (!cartContainer) return;
    cartContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "empty-state";

    var icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "🛒";

    var h2 = document.createElement("h2");
    h2.textContent = "Your cart is empty";

    var p = document.createElement("p");
    p.textContent = "You don't have any items in your shopping cart yet.";

    var btn = document.createElement("a");
    btn.className = "primary-button";
    btn.href = "products.html";
    btn.textContent = "Explore Products";
    btn.style.display = "inline-block";
    btn.style.marginTop = "16px";

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);
    div.appendChild(btn);

    cartContainer.appendChild(div);
}

/**
 * Show general error state with retry button.
 * @param {string} message
 */
function showErrorState(message) {
    if (!cartContainer) return;
    cartContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "error-state";

    var icon = document.createElement("div");
    icon.className = "error-icon";
    icon.textContent = "⚠️";

    var h2 = document.createElement("h2");
    h2.textContent = "Could not load cart";

    var p = document.createElement("p");
    p.textContent = message || "An unexpected error occurred while loading your cart.";

    var btn = document.createElement("button");
    btn.className = "retry-btn";
    btn.textContent = "Retry";
    btn.addEventListener("click", function () {
        loadCart();
    });

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);
    div.appendChild(btn);

    cartContainer.appendChild(div);
}

/* ─── Cart Page Renderer ─────────────────────────────────────── */

/**
 * Build and inject the full cart layout with items and summary.
 * All dynamic values set via textContent.
 * @param {object} cartData
 */
function renderCart(cartData) {
    if (!cartContainer) return;
    cartContainer.innerHTML = "";

    var items = cartData.items || [];
    if (items.length === 0) {
        showEmptyCart();
        return;
    }

    // ── Outer Layout ────────────────────────────────────────────
    var layout = document.createElement("div");
    layout.className = "cart-layout";

    // ── Left: Items Panel ───────────────────────────────────────
    var itemsPanel = document.createElement("div");
    itemsPanel.className = "cart-items-panel";

    var headerRow = document.createElement("div");
    headerRow.className = "cart-header-row";

    var h2 = document.createElement("h2");
    h2.textContent = "Cart Items (" + cartData.total_items + ")";
    headerRow.appendChild(h2);

    var clearBtn = document.createElement("button");
    clearBtn.className = "cart-clear-btn";
    clearBtn.textContent = "Clear All";
    clearBtn.addEventListener("click", handleClearCart);
    headerRow.appendChild(clearBtn);

    itemsPanel.appendChild(headerRow);

    // Render individual item rows
    items.forEach(function (item) {
        var itemRow = buildCartItemRow(item);
        itemsPanel.appendChild(itemRow);
    });

    // ── Right: Summary Sidebar ──────────────────────────────────
    var summaryBox = document.createElement("div");
    summaryBox.className = "cart-summary";

    var sumTitle = document.createElement("h2");
    sumTitle.textContent = "Order Summary";
    summaryBox.appendChild(sumTitle);

    // Row: Items count
    var rowCount = document.createElement("div");
    rowCount.className = "summary-row";
    var lblCount = document.createElement("span");
    lblCount.textContent = "Total Items";
    var valCount = document.createElement("span");
    valCount.textContent = String(cartData.total_items);
    rowCount.appendChild(lblCount);
    rowCount.appendChild(valCount);
    summaryBox.appendChild(rowCount);

    // Row: Subtotal
    var rowSub = document.createElement("div");
    rowSub.className = "summary-row";
    var lblSub = document.createElement("span");
    lblSub.textContent = "Subtotal";
    var valSub = document.createElement("span");
    valSub.textContent = formatPrice(cartData.subtotal);
    rowSub.appendChild(lblSub);
    rowSub.appendChild(valSub);
    summaryBox.appendChild(rowSub);

    // Row: Delivery
    var rowShip = document.createElement("div");
    rowShip.className = "summary-row";
    var lblShip = document.createElement("span");
    lblShip.textContent = "Delivery";
    var valShip = document.createElement("span");
    valShip.textContent = "FREE";
    valShip.style.color = "#16a34a";
    valShip.style.fontWeight = "600";
    rowShip.appendChild(lblShip);
    rowShip.appendChild(valShip);
    summaryBox.appendChild(rowShip);

    // Row: Grand Total
    var rowTot = document.createElement("div");
    rowTot.className = "summary-row-total";
    var lblTot = document.createElement("span");
    lblTot.textContent = "Total";
    var valTot = document.createElement("span");
    valTot.textContent = formatPrice(cartData.total);
    rowTot.appendChild(lblTot);
    rowTot.appendChild(valTot);
    summaryBox.appendChild(rowTot);

    // Checkout Button
    var checkoutBtn = document.createElement("button");
    checkoutBtn.className = "checkout-btn";
    checkoutBtn.textContent = "Proceed to Checkout";
    checkoutBtn.addEventListener("click", function () {
        window.location.href = "checkout.html";
    });
    summaryBox.appendChild(checkoutBtn);

    // Continue Shopping Link
    var contLink = document.createElement("a");
    contLink.className = "continue-shopping-link";
    contLink.href = "products.html";
    contLink.textContent = "← Continue Shopping";
    summaryBox.appendChild(contLink);

    layout.appendChild(itemsPanel);
    layout.appendChild(summaryBox);

    cartContainer.appendChild(layout);
}

/**
 * Build DOM for an individual cart item row.
 * @param {object} item
 * @returns {HTMLElement}
 */
function buildCartItemRow(item) {
    var row = document.createElement("div");
    row.className = "cart-item";
    row.dataset.productId = item.product_id;

    // 1. Thumbnail
    var thumbDiv = document.createElement("div");
    thumbDiv.className = "cart-item-thumb";

    var imageUrl = item.image || item.image_url;
    if (imageUrl) {
        var img = document.createElement("img");
        img.src = imageUrl;
        img.alt = item.product_name || "Product image";
        img.loading = "lazy";
        img.onerror = function () {
            thumbDiv.removeChild(img);
            thumbDiv.textContent = categoryEmoji(item.category_name);
        };
        thumbDiv.appendChild(img);
    } else {
        thumbDiv.textContent = categoryEmoji(item.category_name);
    }
    row.appendChild(thumbDiv);

    // 2. Details
    var detailsDiv = document.createElement("div");
    detailsDiv.className = "cart-item-details";

    var title = document.createElement("h3");
    title.className = "cart-item-title";
    var titleLink = document.createElement("a");
    titleLink.href = "product-details.html?id=" + encodeURIComponent(item.product_id);
    titleLink.textContent = item.product_name || "Product";
    title.appendChild(titleLink);
    detailsDiv.appendChild(title);

    var unitPrice = document.createElement("p");
    unitPrice.className = "cart-item-unit-price";
    unitPrice.textContent = "Unit Price: " + formatPrice(item.price);
    detailsDiv.appendChild(unitPrice);

    // Stock warning indicator if stock is low or exceeded
    if (item.exceeds_stock) {
        var warn = document.createElement("p");
        warn.className = "cart-item-warning";
        warn.textContent = "⚠️ Only " + item.stock + " units currently available.";
        detailsDiv.appendChild(warn);
    } else if (!item.is_available) {
        var unavail = document.createElement("p");
        unavail.className = "cart-item-warning";
        unavail.textContent = "⚠️ Item is currently unavailable.";
        detailsDiv.appendChild(unavail);
    }

    row.appendChild(detailsDiv);

    // 3. Quantity Stepper
    var stepper = document.createElement("div");
    stepper.className = "qty-stepper";

    var minusBtn = document.createElement("button");
    minusBtn.textContent = "−";
    minusBtn.setAttribute("aria-label", "Decrease quantity of " + (item.product_name || "item"));
    minusBtn.disabled = item.quantity <= 1;
    minusBtn.addEventListener("click", function () {
        updateItemQuantity(item.product_id, { action: "decrease" }, stepper, row);
    });

    var qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "1";
    qtyInput.max = String(item.stock || 99);
    qtyInput.value = item.quantity;
    qtyInput.dataset.lastConfirmed = item.quantity;
    qtyInput.setAttribute("aria-label", "Quantity for " + (item.product_name || "item"));

    // Handle direct input change
    qtyInput.addEventListener("change", function () {
        var val = parseInt(qtyInput.value, 10);
        if (isNaN(val) || val < 1) {
            qtyInput.value = qtyInput.dataset.lastConfirmed || item.quantity;
            showAlert("Quantity must be at least 1.", "error");
            return;
        }
        if (val === item.quantity) return;
        updateItemQuantity(item.product_id, { quantity: val }, stepper, row, qtyInput);
    });

    // Enter key submits change
    qtyInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            qtyInput.blur();
        }
    });

    var plusBtn = document.createElement("button");
    plusBtn.textContent = "+";
    plusBtn.setAttribute("aria-label", "Increase quantity of " + (item.product_name || "item"));
    plusBtn.disabled = item.quantity >= item.stock;
    plusBtn.addEventListener("click", function () {
        updateItemQuantity(item.product_id, { action: "increase" }, stepper, row);
    });

    stepper.appendChild(minusBtn);
    stepper.appendChild(qtyInput);
    stepper.appendChild(plusBtn);

    row.appendChild(stepper);

    // 4. Right side: Subtotal & Remove button
    var rightDiv = document.createElement("div");
    rightDiv.className = "cart-item-right";

    var subtotalEl = document.createElement("p");
    subtotalEl.className = "cart-item-subtotal";
    subtotalEl.textContent = formatPrice(item.subtotal);
    rightDiv.appendChild(subtotalEl);

    var removeBtn = document.createElement("button");
    removeBtn.className = "cart-remove-btn";
    removeBtn.textContent = "✕ Remove";
    removeBtn.setAttribute("aria-label", "Remove " + (item.product_name || "item") + " from cart");
    removeBtn.addEventListener("click", function () {
        removeItem(item.product_id, item.product_name, row);
    });
    rightDiv.appendChild(removeBtn);

    row.appendChild(rightDiv);

    return row;
}

/* ─── Cart API Operations ─────────────────────────────────────── */

/**
 * Fetch cart from backend and render.
 */
function loadCart() {
    showLoading();

    fetch("/api/cart", {
        method: "GET",
        credentials: "same-origin"
    })
    .then(function (response) {
        if (response.status === 401) {
            showUnauthenticated();
            return null;
        }
        if (!response.ok) {
            return response.json().then(function (data) {
                throw new Error(data.error || "Server returned status " + response.status);
            }).catch(function () {
                throw new Error("Server returned status " + response.status);
            });
        }
        return response.json();
    })
    .then(function (cartData) {
        if (cartData === null) return;
        renderCart(cartData);
        if (typeof window.updateCartBadge === "function") {
            window.updateCartBadge();
        }
    })
    .catch(function (err) {
        console.error("Failed to load cart:", err.message);
        var friendlyMsg = (typeof window.formatCustomerError === "function")
            ? window.formatCustomerError(err)
            : (err.message || "An unexpected error occurred while loading your cart.");
        showErrorState(friendlyMsg);
    });
}

/**
 * Update item quantity via PATCH /api/cart/items/:productId.
 * Dims the row and disables stepper during flight to prevent race conditions.
 * @param {number} productId
 * @param {object} payload
 * @param {HTMLElement} [stepperEl]
 * @param {HTMLElement} [rowEl]
 * @param {HTMLInputElement} [inputEl]
 */
function updateItemQuantity(productId, payload, stepperEl, rowEl, inputEl) {
    if (stepperEl) {
        var buttons = stepperEl.querySelectorAll("button, input");
        buttons.forEach(function (btn) { btn.disabled = true; });
    }
    if (rowEl) {
        rowEl.style.opacity = "0.6";
        rowEl.style.pointerEvents = "none";
    }

    fetch("/api/cart/items/" + encodeURIComponent(productId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
    })
    .then(function (response) {
        return response.json().then(function (data) {
            if (!response.ok) {
                throw new Error(data.error || "Failed to update quantity.");
            }
            return data;
        });
    })
    .then(function (data) {
        showAlert(data.message || "Cart updated.", "success");
        // Reload cart to re-render all subtotals and totals safely from backend calculations
        loadCart();
    })
    .catch(function (err) {
        // Revert input field to last confirmed quantity if direct input failed
        if (inputEl && inputEl.dataset && inputEl.dataset.lastConfirmed) {
            inputEl.value = inputEl.dataset.lastConfirmed;
        }
        var friendlyMsg = (typeof window.formatCustomerError === "function")
            ? window.formatCustomerError(err)
            : (err.message || "Failed to update quantity.");
        showAlert(friendlyMsg, "error");
        // Reload cart to restore accurate state
        loadCart();
    });
}

/**
 * Remove an item from the cart via DELETE /api/cart/items/:productId.
 * @param {number} productId
 * @param {string} productName
 * @param {HTMLElement} rowEl
 */
function removeItem(productId, productName, rowEl) {
    if (!confirm('Remove "' + (productName || "this item") + '" from your cart?')) {
        return;
    }

    if (rowEl) {
        rowEl.style.opacity = "0.5";
        rowEl.style.pointerEvents = "none";
    }

    fetch("/api/cart/items/" + encodeURIComponent(productId), {
        method: "DELETE",
        credentials: "same-origin"
    })
    .then(function (response) {
        return response.json().then(function (data) {
            if (!response.ok) {
                throw new Error(data.error || "Failed to remove item.");
            }
            return data;
        });
    })
    .then(function () {
        showAlert('"' + (productName || "Item") + '" removed from cart.', "info");
        loadCart();
    })
    .catch(function (err) {
        showAlert(err.message, "error");
        loadCart();
    });
}

/**
 * Clear the entire cart via DELETE /api/cart.
 */
function handleClearCart() {
    if (!confirm("Are you sure you want to remove all items from your cart?")) {
        return;
    }

    fetch("/api/cart", {
        method: "DELETE",
        credentials: "same-origin"
    })
    .then(function (response) {
        return response.json().then(function (data) {
            if (!response.ok) {
                throw new Error(data.error || "Failed to clear cart.");
            }
            return data;
        });
    })
    .then(function () {
        showAlert("Your cart has been cleared.", "info");
        loadCart();
    })
    .catch(function (err) {
        showAlert(err.message, "error");
        loadCart();
    });
}

/* ─── Initialise ─────────────────────────────────────────────── */

loadCart();
