/*
 * auth.js — GoodsPlatz customer authentication
 *
 * Handles browser-side validation and API integration for:
 *   - POST /api/auth/register   (customer registration)
 *   - POST /api/auth/login      (customer login)
 *
 * API STATUS: Pending — the backend authentication endpoints have not been
 * implemented yet (Day 3 responsibility). The fetch calls below are structured
 * and ready, but will fail with a network error until the backend team adds
 * the /api/auth routes.
 *
 * Technology: Vanilla JavaScript, Fetch API, DOM manipulation.
 * No frameworks, no libraries beyond what the browser provides.
 */

/* ─── Helpers ──────────────────────────────────────────────────── */

/**
 * Display a message inside the form's .form-message element.
 * Uses textContent so no raw HTML from the server can be injected.
 *
 * @param {HTMLFormElement} form
 * @param {string} message
 * @param {boolean} isError  true = red error, false = green success
 */
function showMessage(form, message, isError) {
    var messageEl = form.querySelector(".form-message");
    if (!messageEl) return;
    // Default to showing as an error if the second argument is omitted
    var error = (isError === undefined) ? true : isError;
    messageEl.textContent = message;
    messageEl.style.color = error ? "#b42318" : "#18794e";
}

/**
 * Clear the form message area.
 * @param {HTMLFormElement} form
 */
function clearMessage(form) {
    var messageEl = form.querySelector(".form-message");
    if (messageEl) {
        messageEl.textContent = "";
    }
}

/**
 * Basic email format check using a simple regular expression.
 * Checks for the pattern: something@something.something
 * The browser's type="email" attribute also enforces this natively,
 * but we check here too for the cases where novalidate is used.
 *
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate a 10-digit Indian mobile number.
 * Accepts exactly 10 digits, no spaces or dashes.
 *
 * @param {string} mobile
 * @returns {boolean}
 */
function isValidMobile(mobile) {
    return /^[0-9]{10}$/.test(mobile);
}

/**
 * Disable or re-enable a submit button and update its label.
 *
 * @param {HTMLButtonElement} button
 * @param {boolean} disabled
 * @param {string} loadingText  label shown while disabled
 * @param {string} normalText   label shown when enabled
 */
function setButtonState(button, disabled, loadingText, normalText) {
    button.disabled = disabled;
    button.textContent = disabled ? loadingText : normalText;
}

/* ─── Registration form ─────────────────────────────────────────── */

var registerForm = document.getElementById("register-form");

if (registerForm) {
    registerForm.addEventListener("submit", function (event) {
        // Always prevent the native browser form submission.
        event.preventDefault();
        clearMessage(registerForm);

        // ── Read and trim field values ──────────────────────────────
        var name     = document.getElementById("name").value.trim();
        var email    = document.getElementById("email").value.trim();
        var mobile   = document.getElementById("mobile").value.trim();
        var password = document.getElementById("password").value;
        var confirm  = document.getElementById("confirm-password").value;

        var submitBtn = document.getElementById("register-submit");

        // ── Browser-side validation ─────────────────────────────────

        // 1. Required fields
        if (!name || !email || !mobile || !password || !confirm) {
            showMessage(registerForm, "Please fill in all fields.");
            return;
        }

        // 2. Name must not be whitespace-only (already trimmed above,
        //    so checking again is a safety net).
        if (name.length === 0) {
            showMessage(registerForm, "Full name cannot be empty or only spaces.");
            return;
        }

        // 3. Email format
        if (!isValidEmail(email)) {
            showMessage(registerForm, "Please enter a valid email address.");
            return;
        }

        // 4. Mobile: must be exactly 10 digits
        if (!isValidMobile(mobile)) {
            showMessage(
                registerForm,
                "Mobile number must be exactly 10 digits (no spaces or dashes)."
            );
            return;
        }

        // 5. Password length
        if (password.length < 8) {
            showMessage(registerForm, "Password must be at least 8 characters long.");
            return;
        }

        // 6. Confirm password
        if (password !== confirm) {
            showMessage(registerForm, "Passwords do not match. Please try again.");
            return;
        }

        // ── All client-side checks passed — call the API ────────────
        // Note: Passing validation here does NOT mean the user is registered.
        // The server must still verify the data and create the account.

        setButtonState(submitBtn, true, "Registering...", "Register");

        // Build the JSON body.
        // The role field is intentionally omitted: the server always
        // assigns 'customer' by default and must not trust the client.
        var requestBody = {
            name: name,
            email: email,
            phone: mobile,
            password: password
        };

        /*
         * API STATUS: PENDING
         * The /api/auth/register endpoint does not exist yet.
         * This fetch call is structured correctly and ready to work
         * once the backend team implements the route in Day 3.
         *
         * Expected success response (HTTP 201):
         *   { "message": "Registration successful." }
         *
         * Expected error response (HTTP 400 / 409 / 500):
         *   { "error": "A human-readable error message." }
         */
        fetch("/api/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        })
        .then(function (response) {
            // Try to parse the body as JSON regardless of status code,
            // because the server may send an error message in JSON.
            return response.json().then(function (data) {
                return { status: response.status, data: data };
            });
        })
        .then(function (result) {
            setButtonState(submitBtn, false, "Registering...", "Register");

            if (result.status === 201 || result.status === 200) {
                // Registration succeeded on the server.
                showMessage(
                    registerForm,
                    "Account created successfully! You can now log in.",
                    false
                );
                registerForm.reset();
            } else {
                // Server returned a validation or business-logic error.
                var errorMsg = (result.data && result.data.error)
                    ? result.data.error
                    : "Registration failed. Please try again.";
                showMessage(registerForm, errorMsg);
            }
        })
        .catch(function (networkError) {
            // The fetch itself failed (server not running, no network, etc.).
            setButtonState(submitBtn, false, "Registering...", "Register");
            showMessage(
                registerForm,
                "Could not reach the server. Please check your connection and try again."
            );
            console.error("Registration network error:", networkError);
        });
    });
}

/* ─── Login form ────────────────────────────────────────────────── */

var loginForm = document.getElementById("login-form");

if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
        // Always prevent the native browser form submission.
        event.preventDefault();
        clearMessage(loginForm);

        // ── Read and trim field values ──────────────────────────────
        var email    = document.getElementById("email").value.trim();
        var password = document.getElementById("password").value;

        var submitBtn = document.getElementById("login-submit");

        // ── Browser-side validation ─────────────────────────────────

        // 1. Required fields
        if (!email || !password) {
            showMessage(loginForm, "Please enter your email and password.");
            return;
        }

        // 2. Email format
        if (!isValidEmail(email)) {
            showMessage(loginForm, "Please enter a valid email address.");
            return;
        }

        // ── All client-side checks passed — call the API ────────────
        // Note: Passing validation here does NOT mean the credentials are correct.
        // The server must verify the email and password against the database.

        setButtonState(submitBtn, true, "Logging in...", "Login");

        var requestBody = {
            email: email,
            password: password
        };

        /*
         * API STATUS: PENDING
         * The /api/auth/login endpoint does not exist yet.
         * This fetch call is structured correctly and ready to work
         * once the backend team implements the route in Day 3.
         *
         * Expected success response (HTTP 200):
         *   { "message": "Login successful.", "user": { "role": "customer", ... } }
         *   The server sets a session cookie; the frontend reads the role
         *   from the response to redirect appropriately.
         *
         * Expected error response (HTTP 400 / 401 / 500):
         *   { "error": "A human-readable error message." }
         *
         * Redirect plan after successful login:
         *   - role === "customer"    → redirect to index.html
         *   - role === "seller"      → redirect to seller dashboard (Day 3+)
         *   - role === "admin"       → redirect to admin panel (Day 3+)
         */
        fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        })
        .then(function (response) {
            return response.json().then(function (data) {
                return { status: response.status, data: data };
            });
        })
        .then(function (result) {
            setButtonState(submitBtn, false, "Logging in...", "Login");

            if (result.status === 200) {
                // Login succeeded — the server has set the session cookie.
                var role = result.data.user && result.data.user.role;

                // Redirect based on role; default to homepage for customers.
                if (role === "seller") {
                    window.location.href = "/seller/dashboard.html";
                } else if (role === "admin" || role === "super_admin") {
                    window.location.href = "/admin/dashboard.html";
                } else {
                    // customer or unknown role → homepage
                    window.location.href = "index.html";
                }
            } else {
                var errorMsg = (result.data && result.data.error)
                    ? result.data.error
                    : "Login failed. Please check your email and password.";
                showMessage(loginForm, errorMsg);
            }
        })
        .catch(function (networkError) {
            setButtonState(submitBtn, false, "Logging in...", "Login");
            showMessage(
                loginForm,
                "Could not reach the server. Please check your connection and try again."
            );
            console.error("Login network error:", networkError);
        });
    });
}
