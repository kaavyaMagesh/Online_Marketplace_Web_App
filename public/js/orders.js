/*
 * public/js/orders.js — GoodsPlatz Customer Order History UI
 *
 * Responsibilities:
 *   1. Fetch customer's orders from GET /api/orders with session credentials.
 *   2. Handle unauthenticated visitors (401 -> prompt to login).
 *   3. Handle empty order history state with prompt to explore products.
 *   4. Render order cards with reference number, formatted date, total amount,
 *      and color-coded status badges.
 *   5. Allow expanding any order to view detailed shipping address and purchased
 *      item breakdown by fetching GET /api/orders/:id.
 *   6. Safe DOM updates via textContent — no unsafe HTML interpolation.
 */

"use strict";

/* ─── Element References ─────────────────────────────────────── */

var ordersContainer = document.getElementById("orders-container");

/* ─── Helpers ─────────────────────────────────────────────────── */

function formatPrice(price) {
    var num = Number(price);
    if (isNaN(num)) return "₹—";
    return "₹" + num.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDate(dateStr) {
    if (!dateStr) return "Recent";
    try {
        var d = new Date(dateStr);
        return d.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch (e) {
        return String(dateStr);
    }
}

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

function getStatusBadgeClass(status) {
    switch ((status || "").toLowerCase()) {
        case "delivered":  return "order-badge-delivered";
        case "shipped":    return "order-badge-shipped";
        case "processing": return "order-badge-processing";
        case "confirmed":  return "order-badge-confirmed";
        case "cancelled":  return "order-badge-cancelled";
        default:           return "order-badge-pending";
    }
}

function formatStatusText(status) {
    var s = (status || "").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ─── State Renderers ────────────────────────────────────────── */

function showLoading() {
    if (!ordersContainer) return;
    ordersContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "loading-state";

    var spinner = document.createElement("div");
    spinner.className = "spinner";

    var p = document.createElement("p");
    p.textContent = "Loading your orders…";

    div.appendChild(spinner);
    div.appendChild(p);
    ordersContainer.appendChild(div);
}

function showUnauthenticated() {
    if (!ordersContainer) return;
    ordersContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "empty-state";

    var icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "🔒";

    var h2 = document.createElement("h2");
    h2.textContent = "Please log in to view your orders";

    var p = document.createElement("p");
    p.textContent = "Sign in to track orders, view invoices, and manage deliveries.";

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

    ordersContainer.appendChild(div);
}

function showEmptyOrders() {
    if (!ordersContainer) return;
    ordersContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "empty-state";

    var icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "📦";

    var h2 = document.createElement("h2");
    h2.textContent = "No orders found";

    var p = document.createElement("p");
    p.textContent = "You haven't placed any orders with GoodsPlatz yet.";

    var btn = document.createElement("a");
    btn.className = "primary-button";
    btn.href = "products.html";
    btn.textContent = "Start Shopping";
    btn.style.display = "inline-block";
    btn.style.marginTop = "16px";

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);
    div.appendChild(btn);

    ordersContainer.appendChild(div);
}

function showErrorState(message) {
    if (!ordersContainer) return;
    ordersContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "error-state";

    var icon = document.createElement("div");
    icon.className = "error-icon";
    icon.textContent = "⚠️";

    var h2 = document.createElement("h2");
    h2.textContent = "Could not load orders";

    var p = document.createElement("p");
    p.textContent = message || "An unexpected error occurred while loading your orders.";

    var btn = document.createElement("button");
    btn.className = "retry-btn";
    btn.textContent = "Retry";
    btn.addEventListener("click", loadOrders);

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);
    div.appendChild(btn);

    ordersContainer.appendChild(div);
}

/* ─── Orders List & Card Builder ─────────────────────────────── */

function renderOrdersList(orders) {
    if (!ordersContainer) return;
    ordersContainer.innerHTML = "";

    var listWrapper = document.createElement("div");
    listWrapper.className = "orders-list";

    orders.forEach(function (order) {
        var card = buildOrderCard(order);
        listWrapper.appendChild(card);
    });

    ordersContainer.appendChild(listWrapper);
}

function buildOrderCard(order) {
    var card = document.createElement("article");
    card.className = "order-card";
    card.dataset.orderId = order.order_id;

    // 1. Order Top Header Row
    var headerRow = document.createElement("div");
    headerRow.className = "order-card-header";

    var infoCol = document.createElement("div");
    infoCol.className = "order-ref-group";

    var refTitle = document.createElement("h3");
    refTitle.className = "order-number";
    refTitle.textContent = "Order #" + order.order_id;
    infoCol.appendChild(refTitle);

    var dateEl = document.createElement("span");
    dateEl.className = "order-date";
    dateEl.textContent = "Placed on " + formatDate(order.created_at);
    infoCol.appendChild(dateEl);

    headerRow.appendChild(infoCol);

    // Status Badge
    var badge = document.createElement("span");
    badge.className = "order-status-badge " + getStatusBadgeClass(order.status);
    badge.textContent = formatStatusText(order.status);
    headerRow.appendChild(badge);

    card.appendChild(headerRow);

    // 2. Order Summary Body
    var bodyRow = document.createElement("div");
    bodyRow.className = "order-card-body";

    var statItems = document.createElement("div");
    statItems.className = "order-stat";
    var lblItems = document.createElement("span");
    lblItems.className = "stat-label";
    lblItems.textContent = "Items";
    var valItems = document.createElement("span");
    valItems.className = "stat-val";
    valItems.textContent = order.total_quantity + " unit(s)";
    statItems.appendChild(lblItems);
    statItems.appendChild(valItems);
    bodyRow.appendChild(statItems);

    var statPay = document.createElement("div");
    statPay.className = "order-stat";
    var lblPay = document.createElement("span");
    lblPay.className = "stat-label";
    lblPay.textContent = "Payment";
    var valPay = document.createElement("span");
    valPay.className = "stat-val";
    valPay.textContent = (order.payment_method || "COD") + " (" + formatStatusText(order.payment_status) + ")";
    statPay.appendChild(lblPay);
    statPay.appendChild(valPay);
    bodyRow.appendChild(statPay);

    var statTotal = document.createElement("div");
    statTotal.className = "order-stat";
    var lblTotal = document.createElement("span");
    lblTotal.className = "stat-label";
    lblTotal.textContent = "Total Amount";
    var valTotal = document.createElement("span");
    valTotal.className = "stat-val order-price-highlight";
    valTotal.textContent = formatPrice(order.total_amount);
    statTotal.appendChild(lblTotal);
    statTotal.appendChild(valTotal);
    bodyRow.appendChild(statTotal);

    card.appendChild(bodyRow);

    // 3. Actions / Expandable Details Section
    var detailsContainer = document.createElement("div");
    detailsContainer.className = "order-details-drawer";
    detailsContainer.style.display = "none";
    card.appendChild(detailsContainer);

    var footerRow = document.createElement("div");
    footerRow.className = "order-card-footer";

    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "order-toggle-btn";
    toggleBtn.textContent = "▼ View Order Details";

    var isExpanded = false;
    toggleBtn.addEventListener("click", function () {
        if (!isExpanded) {
            toggleBtn.textContent = "▲ Hide Details";
            detailsContainer.style.display = "block";
            isExpanded = true;
            loadOrderDetails(order.order_id, detailsContainer);
        } else {
            toggleBtn.textContent = "▼ View Order Details";
            detailsContainer.style.display = "none";
            isExpanded = false;
        }
    });

    footerRow.appendChild(toggleBtn);
    card.appendChild(footerRow);

    return card;
}

/* ─── Expandable Order Details Loader ────────────────────────── */

function loadOrderDetails(orderId, targetContainer) {
    // If already loaded, do not re-fetch
    if (targetContainer.dataset.loaded === "true") return;

    targetContainer.innerHTML = '<p style="color: #6b7280; font-size: 13px; margin: 12px 0;">Loading items and delivery address…</p>';

    fetch("/api/orders/" + encodeURIComponent(orderId), { credentials: "same-origin" })
        .then(function (res) {
            if (!res.ok) {
                throw new Error("Could not load details for Order #" + orderId);
            }
            return res.json();
        })
        .then(function (detail) {
            targetContainer.innerHTML = "";
            targetContainer.dataset.loaded = "true";

            var wrapper = document.createElement("div");
            wrapper.className = "order-expanded-content";

            // Delivery address block
            var addrBlock = document.createElement("div");
            addrBlock.className = "order-detail-block";
            var addrTitle = document.createElement("h4");
            addrTitle.textContent = "Delivery Address";
            addrBlock.appendChild(addrTitle);

            var addr = detail.shipping_address || {};
            var addrText = document.createElement("p");
            addrText.className = "order-address-text";
            addrText.textContent = (detail.customer && detail.customer.name ? detail.customer.name + " • " : "") +
                (addr.address_line || "") + ", " + (addr.city || "") + ", " +
                (addr.state || "") + " - " + (addr.postal_code || "");
            addrBlock.appendChild(addrText);

            wrapper.appendChild(addrBlock);

            // Items breakdown block
            var itemsBlock = document.createElement("div");
            itemsBlock.className = "order-detail-block";
            var itemsTitle = document.createElement("h4");
            itemsTitle.textContent = "Ordered Items";
            itemsBlock.appendChild(itemsTitle);

            var itemsList = document.createElement("div");
            itemsList.className = "order-items-grid";

            (detail.items || []).forEach(function (item) {
                var itCard = document.createElement("div");
                itCard.className = "order-item-card";

                var thumb = document.createElement("div");
                thumb.className = "order-item-thumb";
                var imgUrl = item.image || item.image_url;
                if (imgUrl) {
                    var img = document.createElement("img");
                    img.src = imgUrl;
                    img.alt = item.product_name;
                    img.onerror = function () {
                        thumb.removeChild(img);
                        thumb.textContent = categoryEmoji(item.category_name);
                    };
                    thumb.appendChild(img);
                } else {
                    thumb.textContent = categoryEmoji(item.category_name);
                }
                itCard.appendChild(thumb);

                var itInfo = document.createElement("div");
                itInfo.className = "order-item-info";
                var nameLink = document.createElement("a");
                nameLink.href = "product-details.html?id=" + encodeURIComponent(item.product_id);
                nameLink.className = "order-item-name";
                nameLink.textContent = item.product_name || "Product";
                itInfo.appendChild(nameLink);

                var qtyPrice = document.createElement("p");
                qtyPrice.className = "order-item-qty";
                qtyPrice.textContent = "Qty: " + item.quantity + " × " + formatPrice(item.price);
                itInfo.appendChild(qtyPrice);

                itCard.appendChild(itInfo);

                var itSub = document.createElement("div");
                itSub.className = "order-item-subtotal";
                itSub.textContent = formatPrice(item.subtotal);
                itCard.appendChild(itSub);

                itemsList.appendChild(itCard);
            });

            itemsBlock.appendChild(itemsList);
            wrapper.appendChild(itemsBlock);
            targetContainer.appendChild(wrapper);
        })
        .catch(function (err) {
            targetContainer.innerHTML = "";
            var errP = document.createElement("p");
            errP.style.color = "#dc2626";
            errP.style.fontSize = "13px";
            errP.textContent = "⚠️ " + err.message;
            targetContainer.appendChild(errP);
        });
}

/* ─── Main Orders Loader ─────────────────────────────────────── */

function loadOrders() {
    showLoading();

    fetch("/api/orders", { credentials: "same-origin" })
        .then(function (res) {
            if (res.status === 401) {
                showUnauthenticated();
                return null;
            }
            if (!res.ok) {
                throw new Error("Server returned status " + res.status);
            }
            return res.json();
        })
        .then(function (data) {
            if (!data) return;
            var orders = Array.isArray(data.orders) ? data.orders : [];
            if (orders.length === 0) {
                showEmptyOrders();
            } else {
                renderOrdersList(orders);
            }
        })
        .catch(function (err) {
            console.error("Orders load error:", err.message);
            showErrorState(err.message.includes("Failed to fetch")
                ? "Could not connect to the server. Make sure the server is running."
                : err.message);
        });
}

loadOrders();
