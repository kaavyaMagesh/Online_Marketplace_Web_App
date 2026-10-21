const header = document.getElementById("site-header");
const footer = document.getElementById("site-footer");

if (header) {
    header.innerHTML = `
        <nav class="navbar">
            <a class="brand" href="index.html">MarketHub</a>

            <div class="nav-links">
                <a href="index.html">Home</a>
                <a href="products.html">Products</a>
                <a href="login.html">Login</a>
                <a href="register.html" class="nav-button">Sign Up</a>
            </div>
        </nav>
    `;
}

if (footer) {
    footer.innerHTML = `
        <footer class="footer">
            <p>&copy; 2026 MarketHub | Online Marketplace</p>
        </footer>
    `;
}