/*
 * auth.js — GoodsPlatz customer authentication (frontend)
 *
 * Handles browser-side validation and Fetch API calls for:
 *   POST /api/auth/register  — create a new customer account
 *   POST /api/auth/login     — sign in
 *
 * Browser-side validation improves UX — it catches obvious mistakes without
 * a round-trip to the server. However, the server always re-validates
 * everything; client-side validation is NOT a substitute for server security.
 *
 * Technology: vanilla JavaScript, Fetch API, DOM manipulation.
 * No frameworks or libraries beyond what the browser provides.
 */

/* ─── Helpers ─────────────────────────────────────────────────── */

/**
 * Display a message inside the form's .form-message element.
 * Uses textContent — server messages are never inserted as HTML.
 *
 * @param {HTMLFormElement} form
 * @param {string} message
 * @param {boolean} isError  true = red error colour, false = green success
 */
function showMessage(form, message, isError) {
    var messageEl = form.querySelector(".form-message");
    if (!messageEl) return;
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
 * Basic email format check — same pattern used on the server.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Exactly 10 digits — same rule used on the server.
 * @param {string} mobile
 * @returns {boolean}
 */
function isValidMobile(mobile) {
    return /^[0-9]{10}$/.test(mobile);
}

/**
 * Disable or re-enable a submit button and update its text label.
 *
 * @param {HTMLButtonElement} button
 * @param {boolean} disabled
 * @param {string} loadingText  label shown while disabled
 * @param {string} normalText   label shown when re-enabled
 */
function setButtonState(button, disabled, loadingText, normalText) {
    button.disabled = disabled;
    button.setAttribute("aria-busy", disabled ? "true" : "false");
    button.textContent = disabled ? loadingText : normalText;
}

/* ─── Registration form ───────────────────────────────────────── */

var registerForm = document.getElementById("register-form");
var isRegistering = false;

if (registerForm) {
    // Clear error messages when user starts editing inputs
    var regInputs = registerForm.querySelectorAll("input");
    regInputs.forEach(function (inp) {
        inp.addEventListener("input", function () {
            clearMessage(registerForm);
        });
    });

    registerForm.addEventListener("submit", function (event) {
        event.preventDefault();       // stop native browser submission
        if (isRegistering) return;
        clearMessage(registerForm);

        // Read and trim field values.
        var name     = document.getElementById("name").value.trim();
        var email    = document.getElementById("email").value.trim();
        var mobile   = document.getElementById("mobile").value.trim();
        var password = document.getElementById("password").value;
        var confirm  = document.getElementById("confirm-password").value;

        var submitBtn = document.getElementById("register-submit");

        // ── Browser-side validation ─────────────────────────────────

        if (!name || !email || !mobile || !password || !confirm) {
            showMessage(registerForm, "Please fill in all fields.");
            return;
        }

        // name.trim() already done above; this catches all-whitespace input.
        if (name.length === 0) {
            showMessage(registerForm, "Full name cannot be empty or only spaces.");
            return;
        }

        if (!isValidEmail(email)) {
            showMessage(registerForm, "Please enter a valid email address.");
            return;
        }

        if (!isValidMobile(mobile)) {
            showMessage(
                registerForm,
                "Mobile number must be exactly 10 digits (no spaces or dashes)."
            );
            return;
        }

        if (password.length < 8) {
            showMessage(registerForm, "Password must be at least 8 characters long.");
            return;
        }

        if (password !== confirm) {
            showMessage(registerForm, "Passwords do not match. Please try again.");
            return;
        }

        // ── Call the registration API ───────────────────────────────

        isRegistering = true;
        setButtonState(submitBtn, true, "Registering...", "Register");

        // The role field is deliberately excluded from the request body.
        // The server always assigns 'customer' — we never send a role.
        var requestBody = {
            name:     name,
            email:    email,
            phone:    mobile,
            password: password
        };

        fetch("/api/auth/register", {
            method:      "POST",
            credentials: "same-origin",     // send session cookie if any
            headers:     { "Content-Type": "application/json" },
            body:        JSON.stringify(requestBody)
        })
        .then(function (response) {
            // Parse the JSON body regardless of status code so we can
            // display the server's error message when validation fails.
            return response.json().then(function (data) {
                return { status: response.status, data: data };
            });
        })
        .then(function (result) {
            isRegistering = false;
            setButtonState(submitBtn, false, "Registering...", "Register");

            if (result.status === 201 || result.status === 200) {
                // Server confirmed the account was created.
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
            isRegistering = false;
            setButtonState(submitBtn, false, "Registering...", "Register");
            var friendlyMsg = (typeof window.formatCustomerError === "function")
                ? window.formatCustomerError(networkError)
                : "Could not reach the server. Please check your connection and try again.";
            showMessage(registerForm, friendlyMsg);
            console.error("Registration network error:", networkError);
        });
    });
}

/* ─── Login form ──────────────────────────────────────────────── */

var loginForm = document.getElementById("login-form");
var isLoggingIn = false;

if (loginForm) {
    // Clear error messages when user starts editing inputs
    var loginInputs = loginForm.querySelectorAll("input");
    loginInputs.forEach(function (inp) {
        inp.addEventListener("input", function () {
            clearMessage(loginForm);
        });
    });

    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();
        if (isLoggingIn) return;
        clearMessage(loginForm);

        var email    = document.getElementById("email").value.trim();
        var password = document.getElementById("password").value;

        var submitBtn = document.getElementById("login-submit");

        // ── Browser-side validation ─────────────────────────────────

        if (!email || !password) {
            showMessage(loginForm, "Please enter your email and password.");
            return;
        }

        if (!isValidEmail(email)) {
            showMessage(loginForm, "Please enter a valid email address.");
            return;
        }

        // ── Call the login API ──────────────────────────────────────

        isLoggingIn = true;
        setButtonState(submitBtn, true, "Logging in...", "Login");

        var requestBody = {
            email:    email,
            password: password
        };

        fetch("/api/auth/login", {
            method:      "POST",
            credentials: "same-origin",
            headers:     { "Content-Type": "application/json" },
            body:        JSON.stringify(requestBody)
        })
        .then(function (response) {
            return response.json().then(function (data) {
                return { status: response.status, data: data };
            });
        })
        .then(function (result) {
            isLoggingIn = false;
            setButtonState(submitBtn, false, "Logging in...", "Login");

            if (result.status === 200) {
                // Server authenticated the user and set the session cookie.
                var role = result.data.user && result.data.user.role;

                // Redirect by role.
                if (role === "seller") {
                    window.location.href = "/seller/dashboard.html";
                } else if (role === "admin" || role === "super_admin") {
                    window.location.href = "/admin/dashboard.html";
                } else {
                    // customer (default)
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
            isLoggingIn = false;
            setButtonState(submitBtn, false, "Logging in...", "Login");
            var friendlyMsg = (typeof window.formatCustomerError === "function")
                ? window.formatCustomerError(networkError)
                : "Could not reach the server. Please check your connection and try again.";
            showMessage(loginForm, friendlyMsg);
            console.error("Login network error:", networkError);
        });
    });
}
