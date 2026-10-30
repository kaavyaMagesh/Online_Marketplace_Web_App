/*
 * common.js — GoodsPlatz shared navigation and footer
 *
 * Rendered on every page. On load it calls GET /api/auth/me to find out
 * whether the current visitor is signed in, then shows the correct nav links.
 *
 * Signed-out nav:  Home | Products | Cart | Login | Sign Up
 * Signed-in nav:   Home | Products | Cart (N) | Hi, <Name> | Logout
 */

var header = document.getElementById("site-header");
var footer  = document.getElementById("site-footer");

/* ─── Footer (always the same) ────────────────────────────────── */
if (footer) {
    footer.innerHTML =
        '<footer class="footer">' +
        '  <p>&copy; 2026 GoodsPlatz | Online Marketplace</p>' +
        '</footer>';
}

/* ─── Header (depends on auth state) ──────────────────────────── */

/**
 * Build and inject the navbar HTML.
 * @param {object|null} user  The signed-in user object, or null.
 */
function renderNav(user) {
    if (!header) return;

    var rightLinks;

    if (user) {
        // Signed-in: show Orders, Cart with counter, Profile link, and logout button.
        rightLinks =
            '<a href="orders.html" class="nav-orders-link" id="nav-orders-link">Orders</a>' +
            '<a href="cart.html" class="nav-cart-link" id="nav-cart-link" aria-label="Shopping Cart">' +
            '  🛒 Cart <span class="cart-badge" id="nav-cart-badge">0</span>' +
            '</a>' +
            '<a href="profile.html" class="nav-user" id="nav-profile-link" title="My Profile">Hi, ' + escapeHtml(user.name) + '</a>' +
            '<button class="nav-button" id="nav-logout-btn">Logout</button>';
    } else {
        // Signed-out: show Cart, Login, and Sign Up links.
        rightLinks =
            '<a href="cart.html" class="nav-cart-link" id="nav-cart-link" aria-label="Shopping Cart">🛒 Cart</a>' +
            '<a href="login.html">Login</a>' +
            '<a href="register.html" class="nav-button">Sign Up</a>';
    }

    header.innerHTML =
        '<nav class="navbar">' +
        '  <a class="brand" href="index.html">GoodsPlatz</a>' +
        '  <div class="nav-links">' +
        '    <a href="index.html">Home</a>' +
        '    <a href="products.html">Products</a>' +
             rightLinks +
        '  </div>' +
        '</nav>';

    // Attach logout handler if the button exists.
    var logoutBtn = document.getElementById("nav-logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }

    // Refresh cart badge if logged in
    if (user) {
        updateCartBadge();
    }
}

/**
 * Escape a string so it is safe to embed in HTML.
 * Used for the user's display name in the nav.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * Update the shopping cart badge count in the navigation.
 * Can be called after any cart addition/modification across pages.
 */
function updateCartBadge() {
    var badge = document.getElementById("nav-cart-badge");
    if (!badge) return;

    fetch("/api/cart", {
        method: "GET",
        credentials: "same-origin"
    })
    .then(function (response) {
        if (response.ok) {
            return response.json();
        }
        return null;
    })
    .then(function (data) {
        if (!data || !badge) return;
        var total = Number(data.total_items) || 0;
        badge.textContent = total;
        badge.style.display = total > 0 ? "inline-block" : "inline-block";
    })
    .catch(function () {
        // Silently ignore if unauthenticated or network failure
    });
}

// Expose globally for other page scripts
window.updateCartBadge = updateCartBadge;

/**
 * Call GET /api/auth/me, render the nav, and return the user (or null).
 */
function loadNav() {
    fetch("/api/auth/me", {
        method: "GET",
        credentials: "same-origin"  // send the session cookie
    })
    .then(function (response) {
        if (response.status === 200) {
            return response.json().then(function (data) {
                renderNav(data.user);
            });
        } else {
            // 401 = not signed in; any other status = treat as signed-out.
            renderNav(null);
        }
    })
    .catch(function () {
        // Network error or server not running — render signed-out nav.
        renderNav(null);
    });
}

/**
 * Logout button click
 */
function handleLogout() {
    fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
    })
    .then(function () {
        window.location.href = "index.html";
    })
    .catch(function () {
        window.location.href = "index.html";
    });
}

// Run on every page load.
loadNav();
