/*
 * public/js/profile.js — GoodsPlatz Customer Profile Controller
 *
 * Responsibilities:
 *   1. Fetch customer profile data from GET /api/auth/profile.
 *   2. Prompt visitors to log in if unauthenticated (401).
 *   3. Render account overview, editable personal details, delivery address,
 *      and dedicated password update form.
 *   4. Client-side input validation and accessible alert messaging.
 *   5. Synchronize display name and phone with session state upon save.
 *   6. Secure password changes verifying current password.
 */

"use strict";

var profileContainer = document.getElementById("profile-container");

/* ─── Helpers ─────────────────────────────────────────────────── */

function formatDate(dateStr) {
    if (!dateStr) return "Recently";
    try {
        var d = new Date(dateStr);
        return d.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    } catch (e) {
        return String(dateStr);
    }
}

function isValidMobile(phone) {
    return /^[0-9]{10}$/.test(String(phone).trim());
}

/* ─── State Renderers ────────────────────────────────────────── */

function showLoading() {
    if (!profileContainer) return;
    profileContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "loading-state";

    var spinner = document.createElement("div");
    spinner.className = "spinner";

    var p = document.createElement("p");
    p.textContent = "Loading your profile…";

    div.appendChild(spinner);
    div.appendChild(p);
    profileContainer.appendChild(div);
}

function showUnauthenticated() {
    if (!profileContainer) return;
    profileContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "empty-state";

    var icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "🔒";

    var h2 = document.createElement("h2");
    h2.textContent = "Please sign in to view your profile";

    var p = document.createElement("p");
    p.textContent = "You need an active GoodsPlatz customer session to manage your account details.";

    var btn = document.createElement("a");
    btn.className = "primary-button";
    btn.href = "login.html";
    btn.textContent = "Sign In to GoodsPlatz";
    btn.style.display = "inline-block";
    btn.style.marginTop = "16px";

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);
    div.appendChild(btn);

    profileContainer.appendChild(div);
}

function showErrorState(message) {
    if (!profileContainer) return;
    profileContainer.innerHTML = "";

    var div = document.createElement("div");
    div.className = "error-state";

    var icon = document.createElement("div");
    icon.className = "error-icon";
    icon.textContent = "⚠️";

    var h2 = document.createElement("h2");
    h2.textContent = "Could not load profile";

    var p = document.createElement("p");
    p.textContent = message || "An unexpected error occurred while loading your profile.";

    var btn = document.createElement("button");
    btn.className = "retry-btn";
    btn.textContent = "Try Again";
    btn.addEventListener("click", loadProfile);

    div.appendChild(icon);
    div.appendChild(h2);
    div.appendChild(p);
    div.appendChild(btn);

    profileContainer.appendChild(div);
}

/* ─── Main Profile View Builder ──────────────────────────────── */

function renderProfileView(profileData) {
    if (!profileContainer) return;
    profileContainer.innerHTML = "";

    var user    = profileData.user;
    var address = profileData.address;

    var layout = document.createElement("div");
    layout.className = "profile-layout";

    // ── Column 1: Overview & Address Card ────────────────────────
    var leftCol = document.createElement("div");
    leftCol.className = "profile-col-side";

    // 1. Account Summary Card
    var overviewCard = document.createElement("section");
    overviewCard.className = "profile-card";

    var avatarBox = document.createElement("div");
    avatarBox.className = "profile-avatar-box";
    var avatarIcon = document.createElement("div");
    avatarIcon.className = "profile-avatar";
    avatarIcon.textContent = "👤";
    var nameHeading = document.createElement("h2");
    nameHeading.className = "profile-name-title";
    nameHeading.id = "overview-display-name";
    nameHeading.textContent = user.name;
    var emailText = document.createElement("p");
    emailText.className = "profile-email-text";
    emailText.textContent = user.email;

    avatarBox.appendChild(avatarIcon);
    avatarBox.appendChild(nameHeading);
    avatarBox.appendChild(emailText);
    overviewCard.appendChild(avatarBox);

    var metaList = document.createElement("div");
    metaList.className = "profile-meta-list";

    function addMetaRow(label, value) {
        var row = document.createElement("div");
        row.className = "profile-meta-row";
        var l = document.createElement("span");
        l.className = "meta-label";
        l.textContent = label;
        var v = document.createElement("span");
        v.className = "meta-value";
        v.textContent = value;
        row.appendChild(l);
        row.appendChild(v);
        metaList.appendChild(row);
    }

    addMetaRow("Account Role", user.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : "Customer");
    addMetaRow("Account Status", user.status ? (user.status.charAt(0).toUpperCase() + user.status.slice(1)) : "Active");
    addMetaRow("Member Since", formatDate(user.created_at));

    overviewCard.appendChild(metaList);
    leftCol.appendChild(overviewCard);

    // 2. Saved Delivery Address Card
    var addrCard = document.createElement("section");
    addrCard.className = "profile-card";

    var addrTitle = document.createElement("h3");
    addrTitle.className = "profile-card-title";
    addrTitle.textContent = "📍 Saved Delivery Address";
    addrCard.appendChild(addrTitle);

    if (address && address.address_line) {
        var addrBox = document.createElement("div");
        addrBox.className = "profile-address-box";

        var addrLine = document.createElement("p");
        addrLine.className = "address-line-strong";
        addrLine.textContent = address.address_line;

        var addrCityState = document.createElement("p");
        addrCityState.className = "address-line-sub";
        addrCityState.textContent = address.city + ", " + address.state + " - " + address.postal_code;

        var addrCountry = document.createElement("p");
        addrCountry.className = "address-line-country";
        addrCountry.textContent = address.country || "India";

        addrBox.appendChild(addrLine);
        addrBox.appendChild(addrCityState);
        addrBox.appendChild(addrCountry);
        addrCard.appendChild(addrBox);
    } else {
        var noAddrBox = document.createElement("div");
        noAddrBox.className = "profile-no-address-box";

        var noAddrIcon = document.createElement("div");
        noAddrIcon.className = "empty-icon";
        noAddrIcon.style.fontSize = "28px";
        noAddrIcon.style.marginBottom = "8px";
        noAddrIcon.textContent = "📦";

        var noAddrTitle = document.createElement("h4");
        noAddrTitle.style.margin = "0 0 4px";
        noAddrTitle.style.fontSize = "14px";
        noAddrTitle.style.color = "#111827";
        noAddrTitle.textContent = "No saved address yet";

        var noAddr = document.createElement("p");
        noAddr.className = "profile-no-address-note";
        noAddr.textContent = "Your shipping address is automatically saved when you place an order.";

        var exploreLink = document.createElement("a");
        exploreLink.className = "secondary-button";
        exploreLink.href = "products.html";
        exploreLink.style.display = "inline-block";
        exploreLink.style.marginTop = "10px";
        exploreLink.style.fontSize = "13px";
        exploreLink.style.padding = "6px 14px";
        exploreLink.textContent = "Start Shopping";

        noAddrBox.appendChild(noAddrIcon);
        noAddrBox.appendChild(noAddrTitle);
        noAddrBox.appendChild(noAddr);
        noAddrBox.appendChild(exploreLink);
        addrCard.appendChild(noAddrBox);
    }

    leftCol.appendChild(addrCard);
    layout.appendChild(leftCol);

    // ── Column 2: Personal Details & Password Forms ──────────────
    var mainCol = document.createElement("div");
    mainCol.className = "profile-col-main";

    // 3. Personal Information Form
    var detailsCard = document.createElement("section");
    detailsCard.className = "profile-card";

    var detailsTitle = document.createElement("h3");
    detailsTitle.className = "profile-card-title";
    detailsTitle.textContent = "Personal Information";
    detailsCard.appendChild(detailsTitle);

    var detailsAlert = document.createElement("div");
    detailsAlert.className = "cart-alert";
    detailsAlert.style.display = "none";
    detailsAlert.id = "details-alert";
    detailsCard.appendChild(detailsAlert);

    var detailsForm = document.createElement("form");
    detailsForm.id = "details-form";
    detailsForm.noValidate = true;

    function createFormGroup(id, labelText, type, value, isRequired, isDisabled, hintText) {
        var group = document.createElement("div");
        group.className = "profile-form-group";

        var label = document.createElement("label");
        label.htmlFor = id;
        label.textContent = labelText + (isRequired ? " *" : "");

        var input = document.createElement("input");
        input.type = type || "text";
        input.id = id;
        input.name = id;
        input.value = value || "";
        input.disabled = Boolean(isDisabled);
        input.required = Boolean(isRequired);

        group.appendChild(label);
        group.appendChild(input);

        if (hintText) {
            var hint = document.createElement("span");
            hint.className = "profile-field-hint";
            hint.textContent = hintText;
            group.appendChild(hint);
        }

        return group;
    }

    var groupName  = createFormGroup("profile-name", "Full Name", "text", user.name, true, false, "");
    var groupPhone = createFormGroup("profile-phone", "Mobile Number (10 digits)", "tel", user.phone || "", true, false, "Used for delivery notifications and order coordination.");
    var groupEmail = createFormGroup("profile-email", "Email Address", "email", user.email, false, true, "Email address is your unique login credential and cannot be edited.");

    detailsForm.appendChild(groupName);
    detailsForm.appendChild(groupPhone);
    detailsForm.appendChild(groupEmail);

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "primary-button profile-btn";
    saveBtn.id = "save-profile-btn";
    saveBtn.textContent = "Save Changes";
    detailsForm.appendChild(saveBtn);

    detailsCard.appendChild(detailsForm);
    mainCol.appendChild(detailsCard);

    // 4. Change Password Form Card
    var pwdCard = document.createElement("section");
    pwdCard.className = "profile-card";

    var pwdTitle = document.createElement("h3");
    pwdTitle.className = "profile-card-title";
    pwdTitle.textContent = "Change Password";
    pwdCard.appendChild(pwdTitle);

    var pwdAlert = document.createElement("div");
    pwdAlert.className = "cart-alert";
    pwdAlert.style.display = "none";
    pwdAlert.id = "pwd-alert";
    pwdCard.appendChild(pwdAlert);

    var pwdForm = document.createElement("form");
    pwdForm.id = "password-form";
    pwdForm.noValidate = true;

    var groupCurrent = createFormGroup("current-password", "Current Password", "password", "", true, false, "Verify your identity with your existing password.");
    var groupNew     = createFormGroup("new-password", "New Password", "password", "", true, false, "Must be at least 8 characters long.");
    var groupConfirm = createFormGroup("confirm-password", "Confirm New Password", "password", "", true, false, "");

    pwdForm.appendChild(groupCurrent);
    pwdForm.appendChild(groupNew);
    pwdForm.appendChild(groupConfirm);

    var pwdBtn = document.createElement("button");
    pwdBtn.type = "submit";
    pwdBtn.className = "secondary-button profile-btn";
    pwdBtn.id = "save-password-btn";
    pwdBtn.textContent = "Update Password";
    pwdForm.appendChild(pwdBtn);

    pwdCard.appendChild(pwdForm);
    mainCol.appendChild(pwdCard);

    layout.appendChild(mainCol);
    profileContainer.appendChild(layout);

    // ── Form Submissions ──────────────────────────────────────────

    // 1. Profile details update
    detailsForm.addEventListener("submit", function (e) {
        e.preventDefault();
        hideAlert(detailsAlert);

        var nameVal  = document.getElementById("profile-name").value.trim();
        var phoneVal = document.getElementById("profile-phone").value.trim();

        if (!nameVal) {
            showAlert(detailsAlert, "Full name is required.", "error");
            document.getElementById("profile-name").focus();
            return;
        }

        if (!isValidMobile(phoneVal)) {
            showAlert(detailsAlert, "Please enter a valid 10-digit mobile number.", "error");
            document.getElementById("profile-phone").focus();
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving…";

        fetch("/api/auth/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ name: nameVal, phone: phoneVal })
        })
        .then(function (res) {
            if (res.status === 401) {
                showAlert(detailsAlert, "Your session has expired. Redirecting to login…", "error");
                setTimeout(function () {
                    window.location.href = "login.html";
                }, 1500);
                return null;
            }
            return res.json().then(function (data) {
                if (!res.ok) {
                    throw new Error(data.error || "Failed to update profile.");
                }
                return data;
            });
        })
        .then(function (data) {
            if (!data) return;
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Changes";
            showAlert(detailsAlert, data.message || "Profile updated successfully.", "success");

            // Update overview display name
            nameHeading.textContent = nameVal;

            // Update navbar user greeting if visible, preserving profile icon
            var navUserName = document.querySelector(".nav-user-name");
            if (navUserName) {
                navUserName.textContent = "Hi, " + nameVal;
            } else {
                var navUser = document.querySelector(".nav-user");
                if (navUser) {
                    navUser.textContent = "Hi, " + nameVal;
                }
            }
            var navLink = document.getElementById("nav-profile-link");
            if (navLink) {
                navLink.setAttribute("aria-label", "My Profile — Hi, " + nameVal);
            }
        })
        .catch(function (err) {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Changes";
            var friendlyMsg = (typeof window.formatCustomerError === "function")
                ? window.formatCustomerError(err)
                : (err.message || "Failed to update profile.");
            showAlert(detailsAlert, friendlyMsg, "error");
        });
    });

    // 2. Password change
    pwdForm.addEventListener("submit", function (e) {
        e.preventDefault();
        hideAlert(pwdAlert);

        var curVal     = document.getElementById("current-password").value;
        var newVal     = document.getElementById("new-password").value;
        var confirmVal = document.getElementById("confirm-password").value;

        if (!curVal) {
            showAlert(pwdAlert, "Current password is required.", "error");
            document.getElementById("current-password").focus();
            return;
        }

        if (!newVal || newVal.length < 8) {
            showAlert(pwdAlert, "New password must be at least 8 characters long.", "error");
            document.getElementById("new-password").focus();
            return;
        }

        if (newVal !== confirmVal) {
            showAlert(pwdAlert, "New password and confirmation password do not match.", "error");
            document.getElementById("confirm-password").focus();
            return;
        }

        pwdBtn.disabled = true;
        pwdBtn.textContent = "Updating…";

        fetch("/api/auth/password", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ current_password: curVal, new_password: newVal })
        })
        .then(function (res) {
            if (res.status === 401) {
                showAlert(pwdAlert, "Your session has expired. Redirecting to login…", "error");
                setTimeout(function () {
                    window.location.href = "login.html";
                }, 1500);
                return null;
            }
            return res.json().then(function (data) {
                if (!res.ok) {
                    throw new Error(data.error || "Failed to update password.");
                }
                return data;
            });
        })
        .then(function (data) {
            if (!data) return;
            pwdBtn.disabled = false;
            pwdBtn.textContent = "Update Password";
            showAlert(pwdAlert, data.message || "Password changed successfully.", "success");
            pwdForm.reset();
        })
        .catch(function (err) {
            pwdBtn.disabled = false;
            pwdBtn.textContent = "Update Password";
            var friendlyMsg = (typeof window.formatCustomerError === "function")
                ? window.formatCustomerError(err)
                : (err.message || "Failed to update password.");
            showAlert(pwdAlert, friendlyMsg, "error");
        });
    });
}

function showAlert(el, message, type) {
    if (!el) return;
    el.textContent = message;
    el.className = "cart-alert " + (type === "success" ? "cart-alert-success" : "cart-alert-error");
    el.style.display = "flex";
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideAlert(el) {
    if (!el) return;
    el.textContent = "";
    el.style.display = "none";
}

/* ─── Initialization ─────────────────────────────────────────── */

function loadProfile() {
    showLoading();

    fetch("/api/auth/profile", {
        method: "GET",
        credentials: "same-origin"
    })
    .then(function (res) {
        if (res.status === 401) {
            showUnauthenticated();
            return null;
        }
        if (!res.ok) {
            throw new Error("Unable to retrieve profile. Server status: " + res.status);
        }
        return res.json();
    })
    .then(function (profileData) {
        if (!profileData) return;
        renderProfileView(profileData);
    })
    .catch(function (err) {
        console.error("Profile load error:", err.message);
        var friendlyMsg = (typeof window.formatCustomerError === "function")
            ? window.formatCustomerError(err)
            : (err.message || "Could not connect to the server. Please check your connection.");
        showErrorState(friendlyMsg);
    });
}

loadProfile();
