/**
 * admin.js — Shared Admin & Super Admin Frontend Utilities
 */

// Verify access on page load
async function checkAdminAccess() {
    const message = document.getElementById('access-message');

    try {
        const isSuperAdminPage = window.location.pathname.includes('super-dashboard.html');
        const endpoint = isSuperAdminPage ? '/api/admin/super/check' : '/api/admin/check';

        const response = await fetch(endpoint, {
            credentials: 'same-origin'
        });

        if (response.ok) {
            document.body.style.visibility = 'visible';
            initPageFeatures();
            return;
        }

        if (response.status === 401) {
            window.location.href = '/adminlogin';
            return;
        }

        if (message) {
            message.textContent = 'Access denied. Administrator permissions required.';
            message.style.color = '#dc2626';
            message.style.padding = '20px';
        }

        document.body.style.visibility = 'visible';
        const main = document.querySelector('.main-content');
        const sidebar = document.querySelector('.sidebar');
        if (main) main.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';

    } catch (error) {
        console.error('Authentication check failed:', error);
        document.body.style.visibility = 'visible';
    }
}

// Global logout handler
async function handleAdminLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        window.location.href = '/adminlogin';
    } catch (e) {
        window.location.href = '/adminlogin';
    }
}

// Router for specific admin pages to load their real data
function initPageFeatures() {
    const path = window.location.pathname;

    // Attach logout buttons
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', handleAdminLogout);
    });

    if (path.includes('super-dashboard.html')) {
        loadSuperDashboard();
    } else if (path.includes('dashboard.html')) {
        loadDashboardStats();
    } else if (path.includes('customers.html')) {
        loadCustomers();
    } else if (path.includes('sellers.html')) {
        loadSellers();
    } else if (path.includes('products.html')) {
        loadAdminProducts();
    } else if (path.includes('categories.html')) {
        loadAdminCategories();
    }
}

/**
 * 1. Admin Main Dashboard
 */
async function loadDashboardStats() {
    try {
        const res = await fetch('/api/admin/stats', { credentials: 'same-origin' });
        if (!res.ok) return;
        const data = await res.json();

        const statCustomers = document.getElementById('stat-customers');
        const statSellers = document.getElementById('stat-sellers');
        const statProducts = document.getElementById('stat-products');
        const statOrders = document.getElementById('stat-orders');

        if (statCustomers) statCustomers.textContent = data.total_customers;
        if (statSellers) statSellers.textContent = data.total_sellers;
        if (statProducts) statProducts.textContent = data.total_products;
        if (statOrders) statOrders.textContent = data.total_orders;

        const activityContainer = document.getElementById('recent-activity-list');
        if (activityContainer && data.recent_activity) {
            if (data.recent_activity.length === 0) {
                activityContainer.innerHTML = '<p style="color:#64748b;">No recent activity logs recorded yet.</p>';
                return;
            }

            activityContainer.innerHTML = `
                <table style="width:100%;">
                    <thead>
                        <tr>
                            <th>Action</th>
                            <th>Actor</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.recent_activity.map(act => `
                            <tr>
                                <td><strong>${escapeHtml(act.action)}</strong></td>
                                <td>${escapeHtml(act.user_name || 'System')} (${escapeHtml(act.role || 'auto')})</td>
                                <td style="color:#64748b;">${new Date(act.created_at).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    } catch (err) {
        console.error('Error loading dashboard stats:', err);
    }
}

/**
 * 2. Customer Management
 */
async function loadCustomers() {
    const tbody = document.getElementById('customers-table-body');
    const searchInput = document.getElementById('customer-search');
    if (!tbody) return;

    try {
        const res = await fetch('/api/admin/customers', { credentials: 'same-origin' });
        const data = await res.json();
        const customers = data.customers || [];

        function render(list) {
            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;">No customers found.</td></tr>';
                return;
            }

            tbody.innerHTML = list.map(c => `
                <tr>
                    <td>#${c.user_id}</td>
                    <td><strong>${escapeHtml(c.name)}</strong></td>
                    <td>${escapeHtml(c.email)}</td>
                    <td>${c.total_orders} orders (₹${Number(c.total_spent).toFixed(2)})</td>
                    <td><span class="badge badge-${c.status}">${c.status.toUpperCase()}</span></td>
                    <td>
                        ${c.status === 'active' 
                            ? `<button class="btn-danger" onclick="toggleCustomerStatus(${c.user_id}, 'blocked')">Block</button>`
                            : `<button class="btn-success" onclick="toggleCustomerStatus(${c.user_id}, 'active')">Unblock</button>`}
                    </td>
                </tr>
            `).join('');
        }

        render(customers);

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = customers.filter(c => 
                    c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term)
                );
                render(filtered);
            });
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:red;">Failed to load customers.</td></tr>';
    }
}

window.toggleCustomerStatus = async function(id, targetStatus) {
    if (!confirm(`Are you sure you want to set customer #${id} to ${targetStatus}?`)) return;
    try {
        const res = await fetch(`/api/admin/customers/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ status: targetStatus })
        });
        if (res.ok) {
            loadCustomers();
        } else {
            const d = await res.json();
            alert(d.error || 'Failed to update customer status');
        }
    } catch (e) {
        alert('Network error');
    }
};

/**
 * 3. Seller Management
 */
async function loadSellers() {
    const tbody = document.getElementById('sellers-table-body');
    const searchInput = document.getElementById('seller-search');
    if (!tbody) return;

    try {
        const res = await fetch('/api/admin/sellers', { credentials: 'same-origin' });
        const data = await res.json();
        const sellers = data.sellers || [];

        function render(list) {
            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;">No sellers found.</td></tr>';
                return;
            }

            tbody.innerHTML = list.map(s => `
                <tr>
                    <td>#${s.user_id}</td>
                    <td><strong>${escapeHtml(s.name)}</strong></td>
                    <td>${escapeHtml(s.email)}</td>
                    <td>${s.total_products} prods (${s.total_stock} in stock)</td>
                    <td><span class="badge badge-${s.status}">${s.status.toUpperCase()}</span></td>
                    <td>
                        ${s.status === 'active' 
                            ? `<button class="btn-danger" onclick="toggleSellerStatus(${s.user_id}, 'blocked')">Block</button>`
                            : `<button class="btn-success" onclick="toggleSellerStatus(${s.user_id}, 'active')">Approve / Unblock</button>`}
                    </td>
                </tr>
            `).join('');
        }

        render(sellers);

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = sellers.filter(s => 
                    s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term)
                );
                render(filtered);
            });
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:red;">Failed to load sellers.</td></tr>';
    }
}

window.toggleSellerStatus = async function(id, targetStatus) {
    if (!confirm(`Are you sure you want to set seller #${id} to ${targetStatus}?`)) return;
    try {
        const res = await fetch(`/api/admin/sellers/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ status: targetStatus })
        });
        if (res.ok) {
            loadSellers();
        } else {
            const d = await res.json();
            alert(d.error || 'Failed to update seller status');
        }
    } catch (e) {
        alert('Network error');
    }
};

/**
 * 4. Product Management
 */
async function loadAdminProducts() {
    const tbody = document.getElementById('product-table-body');
    const searchInput = document.getElementById('product-search');
    if (!tbody) return;

    try {
        const res = await fetch('/api/admin/products', { credentials: 'same-origin' });
        const data = await res.json();
        const products = data.products || [];

        function render(list) {
            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b;">No products found.</td></tr>';
                return;
            }

            tbody.innerHTML = list.map(p => `
                <tr>
                    <td>#${p.product_id}</td>
                    <td><strong>${escapeHtml(p.product_name)}</strong></td>
                    <td>${escapeHtml(p.seller_name || 'Seller #' + p.seller_id)}</td>
                    <td>₹${Number(p.price).toFixed(2)}</td>
                    <td>${p.stock_quantity}</td>
                    <td><span class="badge badge-${p.status}">${p.status.toUpperCase()}</span></td>
                    <td>
                        ${p.status === 'active' 
                            ? `<button class="btn-secondary" onclick="toggleProductStatus(${p.product_id}, 'inactive')">Deactivate</button>`
                            : `<button class="btn-success" onclick="toggleProductStatus(${p.product_id}, 'active')">Activate</button>`}
                    </td>
                </tr>
            `).join('');
        }

        render(products);

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = products.filter(p => 
                    p.product_name.toLowerCase().includes(term) || (p.seller_name && p.seller_name.toLowerCase().includes(term))
                );
                render(filtered);
            });
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="color:red;">Failed to load products.</td></tr>';
    }
}

window.toggleProductStatus = async function(id, targetStatus) {
    try {
        const res = await fetch(`/api/admin/products/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ status: targetStatus })
        });
        if (res.ok) {
            loadAdminProducts();
        } else {
            const d = await res.json();
            alert(d.error || 'Failed to update product');
        }
    } catch (e) {
        alert('Network error');
    }
};

/**
 * 5. Category Management
 */
async function loadAdminCategories() {
    const tbody = document.getElementById('category-table-body');
    const searchInput = document.getElementById('category-search');
    const addBtn = document.getElementById('add-category-btn');
    if (!tbody) return;

    try {
        const res = await fetch('/api/admin/categories', { credentials: 'same-origin' });
        const data = await res.json();
        const categories = data.categories || [];

        function render(list) {
            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">No categories found.</td></tr>';
                return;
            }

            tbody.innerHTML = list.map(c => `
                <tr>
                    <td>#${c.category_id}</td>
                    <td><strong>${escapeHtml(c.category_name)}</strong></td>
                    <td>${escapeHtml(c.description || '—')}</td>
                    <td>${c.product_count || 0} products</td>
                    <td><span class="badge badge-${c.status}">${c.status.toUpperCase()}</span></td>
                </tr>
            `).join('');
        }

        render(categories);

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = categories.filter(c => 
                    c.category_name.toLowerCase().includes(term)
                );
                render(filtered);
            });
        }

        if (addBtn) {
            addBtn.onclick = async () => {
                const name = prompt('Enter new category name:');
                if (!name || !name.trim()) return;
                const desc = prompt('Enter category description (optional):');

                try {
                    const addRes = await fetch('/api/admin/categories', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({ category_name: name.trim(), description: desc || '' })
                    });
                    if (addRes.ok) {
                        alert('Category created successfully!');
                        loadAdminCategories();
                    } else {
                        const d = await addRes.json();
                        alert(d.error || 'Failed to create category');
                    }
                } catch (e) {
                    alert('Network error');
                }
            };
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:red;">Failed to load categories.</td></tr>';
    }
}

/**
 * 6. Super Admin Full Dashboard Suite
 */
async function loadSuperDashboard() {
    loadSuperStats();
    loadSuperAdmins();
    loadSuperPermissions();
    loadSuperLogs();
    loadSuperSettings();
    loadSuperReports();

    // Tab switcher
    document.querySelectorAll('.super-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.super-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.super-tab-pane').forEach(p => p.style.display = 'none');

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            const target = document.getElementById(targetId);
            if (target) target.style.display = 'block';
        });
    });

    const createAdminBtn = document.getElementById('btn-create-admin');
    if (createAdminBtn) {
        createAdminBtn.onclick = () => {
            const modal = document.getElementById('createAdminModal');
            if (modal) modal.classList.add('open');
        };
    }

    const cancelAdminModal = document.getElementById('btn-cancel-admin-modal');
    if (cancelAdminModal) {
        cancelAdminModal.onclick = () => {
            const modal = document.getElementById('createAdminModal');
            if (modal) modal.classList.remove('open');
        };
    }

    const adminForm = document.getElementById('createAdminForm');
    if (adminForm) {
        adminForm.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('adminName').value.trim();
            const email = document.getElementById('adminEmail').value.trim();
            const password = document.getElementById('adminPassword').value;
            const phone = document.getElementById('adminPhone').value.trim();

            const perms = Array.from(document.querySelectorAll('.admin-perm-checkbox:checked')).map(cb => cb.value);

            try {
                const res = await fetch('/api/superadmin/admins', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ name, email, password, phone, permissions: perms })
                });

                const data = await res.json();
                if (res.ok) {
                    alert('Administrator account created successfully!');
                    document.getElementById('createAdminModal').classList.remove('open');
                    adminForm.reset();
                    loadSuperAdmins();
                    loadSuperPermissions();
                } else {
                    alert(data.error || 'Failed to create administrator');
                }
            } catch (err) {
                alert('Network error');
            }
        };
    }
}

async function loadSuperStats() {
    try {
        const res = await fetch('/api/admin/stats', { credentials: 'same-origin' });
        if (!res.ok) return;
        const d = await res.json();

        const a = document.getElementById('super-stat-admins');
        const c = document.getElementById('super-stat-customers');
        const s = document.getElementById('super-stat-sellers');
        const o = document.getElementById('super-stat-orders');

        if (a) a.textContent = d.total_admins;
        if (c) c.textContent = d.total_customers;
        if (s) s.textContent = d.total_sellers;
        if (o) o.textContent = d.total_orders;
    } catch (e) {}
}

async function loadSuperAdmins() {
    const tbody = document.getElementById('super-admins-table-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/superadmin/admins', { credentials: 'same-origin' });
        const d = await res.json();
        const admins = d.admins || [];

        tbody.innerHTML = admins.map(a => `
            <tr>
                <td>#${a.user_id}</td>
                <td><strong>${escapeHtml(a.name)}</strong></td>
                <td>${escapeHtml(a.email)}</td>
                <td><span class="badge ${a.role === 'super_admin' ? 'badge-confirmed' : 'badge-shipped'}">${a.role.toUpperCase()}</span></td>
                <td><small>${a.permissions.join(', ')}</small></td>
                <td>${new Date(a.created_at).toLocaleDateString()}</td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:red;">Failed to load admins</td></tr>';
    }
}

async function loadSuperPermissions() {
    const tbody = document.getElementById('super-permissions-table-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/superadmin/permissions', { credentials: 'same-origin' });
        const d = await res.json();
        const perms = d.permissions || [];

        if (perms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">No individual permissions assigned yet.</td></tr>';
            return;
        }

        tbody.innerHTML = perms.map(p => `
            <tr>
                <td>#${p.permission_id}</td>
                <td><strong>${escapeHtml(p.admin_name)}</strong> (${escapeHtml(p.admin_email)})</td>
                <td><code>${escapeHtml(p.permission_name)}</code></td>
                <td>${escapeHtml(p.granted_by_name || 'Super Admin')}</td>
                <td>${new Date(p.created_at).toLocaleString()}</td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:red;">Failed to load permissions</td></tr>';
    }
}

async function loadSuperLogs() {
    const tbody = document.getElementById('super-logs-table-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/superadmin/logs?limit=50', { credentials: 'same-origin' });
        const d = await res.json();
        const logs = d.logs || [];

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;">No system logs recorded yet.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(l => `
            <tr>
                <td>#${l.log_id}</td>
                <td><span class="badge badge-shipped">${escapeHtml(l.action)}</span></td>
                <td>${escapeHtml(l.user_name || 'System')} (${escapeHtml(l.user_role || 'auto')})</td>
                <td><small style="font-family:monospace;">${escapeHtml(JSON.stringify(l.details))}</small></td>
                <td>${escapeHtml(l.ip_address || '127.0.0.1')}</td>
                <td><small>${new Date(l.created_at).toLocaleString()}</small></td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:red;">Failed to load logs</td></tr>';
    }
}

async function loadSuperSettings() {
    const container = document.getElementById('super-settings-container');
    if (!container) return;

    try {
        const res = await fetch('/api/superadmin/settings', { credentials: 'same-origin' });
        const d = await res.json();
        const records = d.records || [];

        if (records.length === 0) {
            container.innerHTML = '<p style="color:#64748b;">No system settings configured.</p>';
            return;
        }

        container.innerHTML = `
            <table style="width:100%;">
                <thead>
                    <tr>
                        <th>Setting Key</th>
                        <th>Setting Value</th>
                        <th>Updated By</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map(s => `
                        <tr>
                            <td><strong>${escapeHtml(s.setting_key)}</strong></td>
                            <td><input type="text" id="setting-input-${s.setting_key}" value="${escapeHtml(s.setting_value)}" style="padding:6px;width:100%;max-width:280px;border:1px solid #d1d5db;border-radius:4px;"></td>
                            <td>${escapeHtml(s.updated_by_name || 'Super Admin')}</td>
                            <td><button onclick="updateSystemSetting('${escapeHtml(s.setting_key)}')">Save</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        container.innerHTML = '<p style="color:red;">Failed to load settings.</p>';
    }
}

window.updateSystemSetting = async function(key) {
    const input = document.getElementById(`setting-input-${key}`);
    if (!input) return;
    const value = input.value;

    try {
        const res = await fetch(`/api/superadmin/settings/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value })
        });
        const d = await res.json();
        if (res.ok) {
            alert(`Setting '${key}' updated to '${value}' successfully.`);
            loadSuperSettings();
        } else {
            alert(d.error || 'Failed to update setting');
        }
    } catch (e) {
        alert('Network error');
    }
};

async function loadSuperReports() {
    const container = document.getElementById('super-reports-container');
    if (!container) return;

    try {
        const res = await fetch('/api/admin/reports', { credentials: 'same-origin' });
        const d = await res.json();
        const summary = d.summary || {};
        const breakdown = d.status_breakdown || [];
        const topProds = d.top_products || [];

        container.innerHTML = `
            <div class="dashboard-stats" style="margin-bottom:20px;">
                <div class="stat-card">
                    <h3>Gross Revenue</h3>
                    <p>₹${Number(summary.gross_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                </div>
                <div class="stat-card">
                    <h3>Total Orders</h3>
                    <p>${summary.total_orders || 0}</p>
                </div>
                <div class="stat-card">
                    <h3>Avg Order Value</h3>
                    <p>₹${Number(summary.avg_order_value || 0).toFixed(2)}</p>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                <div class="card">
                    <h3>Orders by Status</h3>
                    <table>
                        <thead>
                            <tr><th>Status</th><th>Orders</th><th>Value</th></tr>
                        </thead>
                        <tbody>
                            ${breakdown.map(b => `
                                <tr>
                                    <td><span class="badge badge-${b.status}">${b.status.toUpperCase()}</span></td>
                                    <td>${b.count}</td>
                                    <td>₹${Number(b.total_value).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="card">
                    <h3>Top Selling Products</h3>
                    <table>
                        <thead>
                            <tr><th>Product</th><th>Seller</th><th>Revenue</th></tr>
                        </thead>
                        <tbody>
                            ${topProds.map(p => `
                                <tr>
                                    <td><strong>${escapeHtml(p.product_name)}</strong></td>
                                    <td>${escapeHtml(p.seller_name)}</td>
                                    <td>₹${Number(p.total_revenue).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = '<p style="color:red;">Failed to load reports.</p>';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', checkAdminAccess);
