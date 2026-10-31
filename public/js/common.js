/*
 * common.js — GoodsPlatz shared navigation and footer
 *
 * Rendered on every page. On load it calls GET /api/auth/me to find out
 * whether the current visitor is signed in, then shows the correct nav links.
 *
 * Signed-out nav:  Home | Products | Login | Sign Up
 * Signed-in nav:   Home | Products | Hi, <Name> | Logout
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
        // Signed-in: show the user's name and a logout button.
        rightLinks =
            '<span class="nav-user">Hi, ' + escapeHtml(user.name) + '</span>' +
            '<button class="nav-button" id="nav-logout-btn">Logout</button>';
    } else {
        // Signed-out: show Login and Sign Up links.
        rightLinks =
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
 * Handle the Logout button click in the nav.
 */
function handleLogout() {
    fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
    })
    .then(function () {
        // Redirect to home regardless of the response status.
        window.location.href = "index.html";
    })
    .catch(function () {
        // Even on network failure, redirect — the session will expire.
        window.location.href = "index.html";
    });
}

// Run on every page load.
loadNav();
