/*
 * public/js/checkout.js — GoodsPlatz Customer Checkout Logic
 *
 * Responsibilities:
 *   1. Verify customer authentication (GET /api/auth/me) and fetch current cart (GET /api/cart).
 *   2. Handle unauthenticated visitors and empty carts with helpful prompts and links.
 *   3. Collect shipping details: Recipient Name, Phone, Address, City, State, Postal Code.
 *   4. Client-side validation: ensure 10-digit phone, valid postal code, non-empty fields.
 *   5. Display cart summary with server-calculated prices and grand total.
 *   6. Submit order via POST /api/orders with credentials.
 *   7. Prevent duplicate submissions while requests are in-flight.
 *   8. Render confirmation view on success with order reference number.
 *   9. Safe DOM updates via textContent — no unsafe HTML interpolation.
 */

"use strict";

/* ─── Element References ─────────────────────────────────────── */

var checkoutContainer = document.getElementById("checkout-container");

/* ─── Helpers ─────────────────────────────────────────────────── */

function formatPrice(price) {
    var num = Number(price);
    if (isNaN(num)) return "₹—";
    return "₹" + num.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
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

/* ─── State Renderers ────────────────────────────────────────── */

function showLoading() {
    if (!checkoutContainer) return;
    checkoutContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "loading-state";

    var spinner = document.createElement("div");
    spinner.className = "spinner";

    var p = document.createElement("p");
    p.textContent = "Loading checkout details…";

    div.appendChild(spinner);
    div.appendChild(p);
    checkoutContainer.appendChild(div);
}

function showUnauthenticated() {
    if (!checkoutContainer) return;
    checkoutContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "empty-state";

    var icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "🔒";

    var h2 = document.createElement("h2");
    h2.textContent = "Please log in to proceed with checkout";

    var p = document.createElement("p");
    p.textContent = "Sign in to your GoodsPlatz account to provide shipping details and complete your purchase.";

    var btn = document.createElement("a");
    btn.className = "primary-button";
    btn.href = "login.html";
    btn.textContent = "Log In to Continue";
    btn.style.display = "inline-block";
    btn.style.marginTop = "16px";

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);
    div.appendChild(btn);

    checkoutContainer.appendChild(div);
}

function showEmptyCart() {
    if (!checkoutContainer) return;
    checkoutContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "empty-state";

    var icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "🛒";

    var h2 = document.createElement("h2");
    h2.textContent = "Your shopping cart is empty";

    var p = document.createElement("p");
    p.textContent = "You need at least one item in your cart before checking out.";

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

    checkoutContainer.appendChild(div);
}

function showErrorState(message) {
    if (!checkoutContainer) return;
    checkoutContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "error-state";

    var icon = document.createElement("div");
    icon.className = "error-icon";
    icon.textContent = "⚠️";

    var h2 = document.createElement("h2");
    h2.textContent = "Checkout Error";

    var p = document.createElement("p");
    p.textContent = message || "An error occurred while loading checkout.";

    var btn = document.createElement("button");
    btn.className = "retry-btn";
    btn.textContent = "Retry";
    btn.addEventListener("click", loadCheckout);

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);
    div.appendChild(btn);

    checkoutContainer.appendChild(div);
}

/* ─── Confirmation Success View ──────────────────────────────── */

function showSuccess(orderData, shipping) {
    if (!checkoutContainer) return;
    checkoutContainer.innerHTML = "";

    var card = document.createElement("div");
    card.className = "checkout-success-card";

    var icon = document.createElement("div");
    icon.className = "success-icon";
    icon.textContent = "✅";
    card.appendChild(icon);

    var h2 = document.createElement("h2");
    h2.textContent = "Order Placed Successfully!";
    card.appendChild(h2);

    var subhead = document.createElement("p");
    subhead.className = "success-subhead";
    subhead.textContent = "Thank you for shopping with GoodsPlatz. Your order is confirmed and will be processed shortly.";
    card.appendChild(subhead);

    // Summary detail box
    var infoBox = document.createElement("div");
    infoBox.className = "success-info-box";

    function addRow(label, value) {
        var row = document.createElement("div");
        row.className = "success-info-row";
        var l = document.createElement("span");
        l.className = "info-label";
        l.textContent = label;
        var v = document.createElement("span");
        v.className = "info-value";
        v.textContent = value;
        row.appendChild(l);
        row.appendChild(v);
        infoBox.appendChild(row);
    }

    addRow("Order Number", "#" + orderData.order_id);
    addRow("Total Amount", formatPrice(orderData.total_amount));
    addRow("Status", "Pending (Cash on Delivery)");
    addRow("Payment Status", "Pending");
    addRow("Recipient", shipping.recipient_name + " (" + shipping.phone + ")");
    addRow("Delivery Address", shipping.address_line + ", " + shipping.city + ", " + shipping.state + " - " + shipping.postal_code);

    card.appendChild(infoBox);

    // Action buttons
    var actions = document.createElement("div");
    actions.className = "success-actions";

    var ordersBtn = document.createElement("a");
    ordersBtn.className = "primary-button";
    ordersBtn.href = "orders.html";
    ordersBtn.textContent = "View My Orders";
    actions.appendChild(ordersBtn);

    var shopBtn = document.createElement("a");
    shopBtn.className = "secondary-button";
    shopBtn.href = "products.html";
    shopBtn.textContent = "Continue Shopping";
    actions.appendChild(shopBtn);

    card.appendChild(actions);
    checkoutContainer.appendChild(card);

    // Refresh navbar cart badge (now 0)
    if (typeof window.updateCartBadge === "function") {
        window.updateCartBadge();
    }
}

/* ─── Main Checkout Form & Summary Renderer ──────────────────── */

function renderCheckoutView(user, cartData) {
    if (!checkoutContainer) return;
    checkoutContainer.innerHTML = "";

    var layout = document.createElement("div");
    layout.className = "checkout-layout";

    // ── Left: Shipping Address Form ─────────────────────────────
    var formPanel = document.createElement("div");
    formPanel.className = "checkout-form-panel";

    var formTitle = document.createElement("h2");
    formTitle.textContent = "Delivery & Shipping Address";
    formPanel.appendChild(formTitle);

    var errorBox = document.createElement("div");
    errorBox.className = "cart-alert cart-alert-error";
    errorBox.style.display = "none";
    errorBox.id = "checkout-error-box";
    formPanel.appendChild(errorBox);

    var form = document.createElement("form");
    form.id = "checkout-form";
    form.noValidate = true;

    function createInputGroup(id, labelText, type, placeholder, value, isRequired) {
        var group = document.createElement("div");
        group.className = "checkout-form-group";

        var label = document.createElement("label");
        label.htmlFor = id;
        label.textContent = labelText + (isRequired ? " *" : "");

        var input = document.createElement("input");
        input.type = type || "text";
        input.id = id;
        input.name = id;
        input.placeholder = placeholder || "";
        input.value = value || "";
        input.required = Boolean(isRequired);

        group.appendChild(label);
        group.appendChild(input);
        return group;
    }

    // Prefill from user session if available
    var defaultName  = user ? (user.name || "") : "";
    var defaultPhone = user ? (user.phone || "") : "";

    form.appendChild(createInputGroup("recipient-name", "Recipient Full Name", "text", "e.g. John Doe", defaultName, true));
    form.appendChild(createInputGroup("phone", "Mobile Phone (10 digits)", "tel", "e.g. 9876543210", defaultPhone, true));
    form.appendChild(createInputGroup("address-line", "Street Address", "text", "e.g. Flat 302, Green Valley Apartments", "", true));

    // City & State row
    var rowCityState = document.createElement("div");
    rowCityState.className = "form-row-2";
    rowCityState.appendChild(createInputGroup("city", "City", "text", "e.g. Bengaluru", "", true));
    rowCityState.appendChild(createInputGroup("state", "State", "text", "e.g. Karnataka", "", true));
    form.appendChild(rowCityState);

    // Postal Code & Country row
    var rowPin = document.createElement("div");
    rowPin.className = "form-row-2";
    rowPin.appendChild(createInputGroup("postal-code", "Postal Code / PIN", "text", "e.g. 560001", "", true));

    var groupCountry = document.createElement("div");
    groupCountry.className = "checkout-form-group";
    var lblCountry = document.createElement("label");
    lblCountry.textContent = "Country";
    var inpCountry = document.createElement("input");
    inpCountry.type = "text";
    inpCountry.value = "India";
    inpCountry.disabled = true;
    groupCountry.appendChild(lblCountry);
    groupCountry.appendChild(inpCountry);
    rowPin.appendChild(groupCountry);

    form.appendChild(rowPin);

    // Payment method indicator
    var payGroup = document.createElement("div");
    payGroup.className = "checkout-payment-box";
    var payTitle = document.createElement("h3");
    payTitle.textContent = "Payment Method";
    var payOption = document.createElement("div");
    payOption.className = "payment-option-pill";
    payOption.innerHTML = '<span style="font-size: 18px;">💵</span> <span>Cash on Delivery (Pay upon delivery)</span>';
    payGroup.appendChild(payTitle);
    payGroup.appendChild(payOption);
    form.appendChild(payGroup);

    // Submit button
    var submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "checkout-place-order-btn";
    submitBtn.id = "place-order-btn";
    submitBtn.textContent = "Place Order (" + formatPrice(cartData.total) + ")";
    form.appendChild(submitBtn);

    formPanel.appendChild(form);

    // ── Right: Order Summary Panel ──────────────────────────────
    var summaryPanel = document.createElement("div");
    summaryPanel.className = "checkout-summary-panel";

    var sumTitle = document.createElement("h2");
    sumTitle.textContent = "Order Summary (" + cartData.total_items + " items)";
    summaryPanel.appendChild(sumTitle);

    var itemsList = document.createElement("div");
    itemsList.className = "checkout-items-list";

    cartData.items.forEach(function (item) {
        var itRow = document.createElement("div");
        itRow.className = "checkout-item-row";

        var thumb = document.createElement("div");
        thumb.className = "checkout-item-thumb";
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
        itRow.appendChild(thumb);

        var details = document.createElement("div");
        details.className = "checkout-item-info";
        var nameEl = document.createElement("p");
        nameEl.className = "checkout-item-name";
        nameEl.textContent = item.product_name;
        var qtyEl = document.createElement("p");
        qtyEl.className = "checkout-item-qty";
        qtyEl.textContent = "Qty: " + item.quantity + " × " + formatPrice(item.price);
        details.appendChild(nameEl);
        details.appendChild(qtyEl);
        itRow.appendChild(details);

        var subEl = document.createElement("div");
        subEl.className = "checkout-item-subtotal";
        subEl.textContent = formatPrice(item.subtotal);
        itRow.appendChild(subEl);

        itemsList.appendChild(itRow);
    });

    summaryPanel.appendChild(itemsList);

    // Totals rows
    var calcBox = document.createElement("div");
    calcBox.className = "checkout-calc-box";

    function addCalcRow(label, value, isTotal) {
        var r = document.createElement("div");
        r.className = isTotal ? "calc-row calc-row-total" : "calc-row";
        var l = document.createElement("span");
        l.textContent = label;
        var v = document.createElement("span");
        v.textContent = value;
        r.appendChild(l);
        r.appendChild(v);
        calcBox.appendChild(r);
    }

    addCalcRow("Subtotal", formatPrice(cartData.subtotal), false);
    addCalcRow("Delivery", "FREE", false);
    addCalcRow("Total Payable", formatPrice(cartData.total), true);

    summaryPanel.appendChild(calcBox);

    var backToCart = document.createElement("a");
    backToCart.className = "continue-shopping-link";
    backToCart.href = "cart.html";
    backToCart.textContent = "← Edit Cart";
    summaryPanel.appendChild(backToCart);

    layout.appendChild(formPanel);
    layout.appendChild(summaryPanel);
    checkoutContainer.appendChild(layout);

    // ── Handle Order Submission ─────────────────────────────────
    var isSubmitting = false;

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (isSubmitting) return;

        errorBox.style.display = "none";
        errorBox.textContent = "";

        var recipientName = document.getElementById("recipient-name").value.trim();
        var phone         = document.getElementById("phone").value.trim();
        var addressLine   = document.getElementById("address-line").value.trim();
        var city          = document.getElementById("city").value.trim();
        var state         = document.getElementById("state").value.trim();
        var postalCode    = document.getElementById("postal-code").value.trim();

        // 1. Validation
        if (!recipientName) {
            showFormError("Recipient full name is required.");
            document.getElementById("recipient-name").focus();
            return;
        }

        if (!phone || !/^[0-9]{10}$/.test(phone)) {
            showFormError("Please enter a valid 10-digit mobile number.");
            document.getElementById("phone").focus();
            return;
        }

        if (!addressLine) {
            showFormError("Street address line is required.");
            document.getElementById("address-line").focus();
            return;
        }

        if (!city) {
            showFormError("City is required.");
            document.getElementById("city").focus();
            return;
        }

        if (!state) {
            showFormError("State is required.");
            document.getElementById("state").focus();
            return;
        }

        if (!postalCode || !/^[0-9A-Za-z\s\-]{3,10}$/.test(postalCode)) {
            showFormError("Please enter a valid postal code / PIN.");
            document.getElementById("postal-code").focus();
            return;
        }

        // 2. Prevent duplicate submissions on both UI and state level
        isSubmitting = true;
        submitBtn.disabled = true;
        submitBtn.textContent = "Placing Order…";

        var payload = {
            recipient_name: recipientName,
            phone:          phone,
            address_line:   addressLine,
            city:           city,
            state:          state,
            postal_code:    postalCode,
            payment_method: "Cash on Delivery"
        };

        fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(payload)
        })
        .then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok) {
                    throw new Error(data.error || "Order placement failed. Status: " + res.status);
                }
                return data;
            });
        })
        .then(function (orderResult) {
            showSuccess(orderResult, payload);
        })
        .catch(function (err) {
            isSubmitting = false;
            showFormError(err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = "Place Order (" + formatPrice(cartData.total) + ")";
        });
    });

    function showFormError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = "flex";
        errorBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

/* ─── Initialization Flow ────────────────────────────────────── */

function loadCheckout() {
    showLoading();

    // 1. Verify user authentication
    fetch("/api/auth/me", { credentials: "same-origin" })
        .then(function (res) {
            if (res.status === 401) {
                showUnauthenticated();
                return null;
            }
            if (!res.ok) {
                throw new Error("Could not verify session.");
            }
            return res.json();
        })
        .then(function (authData) {
            if (!authData) return; // unauthenticated already handled

            var user = authData.user;

            // 2. Fetch current cart
            return fetch("/api/cart", { credentials: "same-origin" })
                .then(function (cartRes) {
                    if (!cartRes.ok) {
                        throw new Error("Could not retrieve cart details.");
                    }
                    return cartRes.json();
                })
                .then(function (cartData) {
                    if (!cartData || !cartData.items || cartData.items.length === 0) {
                        showEmptyCart();
                        return;
                    }
                    renderCheckoutView(user, cartData);
                });
        })
        .catch(function (err) {
            console.error("Checkout load error:", err.message);
            var friendlyMsg = (typeof window.formatCustomerError === "function")
                ? window.formatCustomerError(err)
                : (err.message || "An error occurred while loading checkout.");
            showErrorState(friendlyMsg);
        });
}

loadCheckout();
