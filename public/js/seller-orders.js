/**
 * GoodsPlatz Online Marketplace - Seller Orders & Reports Controller
 * Allows sellers to view their orders, transition statuses, and view sales reports.
 */

(function () {
  'use strict';

  const state = {
    orders: [],
    reports: null,
    currentStatusFilter: 'all',
    searchQuery: '',
    currentUser: null
  };

  const elements = {
    ordersTableBody: document.getElementById('ordersTableBody'),
    topProductsTableBody: document.getElementById('topProductsTableBody'),
    ordersSearchInput: document.getElementById('ordersSearchInput'),
    btnRefreshOrders: document.getElementById('btnRefreshOrders'),
    statusFilterPills: document.querySelectorAll('.btn-filter-pill'),

    // KPIs
    kpiCompletedSales: document.getElementById('kpiCompletedSales'),
    kpiCompletedUnits: document.getElementById('kpiCompletedUnits'),
    kpiGrossRevenue: document.getElementById('kpiGrossRevenue'),
    kpiTotalUnits: document.getElementById('kpiTotalUnits'),
    kpiPendingRevenue: document.getElementById('kpiPendingRevenue'),
    kpiTotalOrders: document.getElementById('kpiTotalOrders'),

    // User section
    userDisplayName: document.getElementById('userDisplayName'),
    userAvatarText: document.getElementById('userAvatarText'),
    btnLogout: document.getElementById('btnLogout'),
    toastContainer: document.getElementById('toastContainer')
  };

  // Currency formatter
  function formatCurrency(amount) {
    const val = Number(amount) || 0;
    return '₹' + val.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Toast notification
  function showToast(message, icon = '✓') {
    if (!elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  // Session check
  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();

      if (data.user && (data.user.role === 'seller' || data.user.role === 'admin' || data.user.role === 'super_admin')) {
        state.currentUser = data.user;
        updateUserUI();
      } else {
        // Auto-login as default TechMart Seller (seller@marketplace.com) for development testing
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'seller@marketplace.com',
            password: 'Marketplace@123'
          })
        });
        const loginData = await loginRes.json();
        if (loginData.user) {
          state.currentUser = loginData.user;
          updateUserUI();
        }
      }
    } catch (err) {
      console.warn('Session check failed:', err);
    }
  }

  function updateUserUI() {
    if (!state.currentUser) return;
    if (elements.userDisplayName) {
      elements.userDisplayName.textContent = state.currentUser.name || 'Seller';
    }
    if (elements.userAvatarText) {
      elements.userAvatarText.textContent = (state.currentUser.name || 'S')[0].toUpperCase();
    }
    if (elements.btnLogout) {
      elements.btnLogout.style.display = 'flex';
    }
  }

  // Fetch Reports
  async function loadReports() {
    try {
      const res = await fetch('/api/seller/reports');
      if (!res.ok) throw new Error('Failed to load sales reports');
      const data = await res.json();
      state.reports = data;
      renderReports();
    } catch (err) {
      console.error('Failed to load reports:', err.message);
    }
  }

  function renderReports() {
    if (!state.reports) return;
    const { summary, top_products } = state.reports;

    if (elements.kpiCompletedSales) elements.kpiCompletedSales.textContent = formatCurrency(summary.completed_sales);
    if (elements.kpiCompletedUnits) elements.kpiCompletedUnits.textContent = `${summary.completed_units} units delivered`;
    if (elements.kpiGrossRevenue) elements.kpiGrossRevenue.textContent = formatCurrency(summary.gross_revenue);
    if (elements.kpiTotalUnits) elements.kpiTotalUnits.textContent = `${summary.total_units_sold} units ordered`;
    if (elements.kpiPendingRevenue) elements.kpiPendingRevenue.textContent = formatCurrency(summary.pending_revenue);
    if (elements.kpiTotalOrders) elements.kpiTotalOrders.textContent = summary.total_orders;

    // Render top products
    if (elements.topProductsTableBody) {
      if (!top_products || top_products.length === 0) {
        elements.topProductsTableBody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-dim);">
              No completed sales recorded yet.
            </td>
          </tr>
        `;
        return;
      }

      elements.topProductsTableBody.innerHTML = top_products.map(p => `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <img 
                src="${p.image || '../images/headphones.jpg'}" 
                alt="${p.product_name}" 
                style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-glass);"
                onerror="this.src='../images/headphones.jpg'"
              >
              <strong>${p.product_name}</strong>
            </div>
          </td>
          <td>${formatCurrency(p.price)}</td>
          <td><strong>${p.units_sold}</strong> units</td>
          <td><strong style="color: var(--emerald);">${formatCurrency(p.total_revenue)}</strong></td>
          <td>${p.stock_quantity > 0 ? p.stock_quantity + ' in stock' : '<span style="color:var(--rose);">Out of stock</span>'}</td>
        </tr>
      `).join('');
    }
  }

  // Fetch Seller Orders
  async function loadOrders() {
    if (elements.ordersTableBody) {
      elements.ordersTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-dim);">
            Loading your orders...
          </td>
        </tr>
      `;
    }

    try {
      const params = new URLSearchParams();
      if (state.currentStatusFilter && state.currentStatusFilter !== 'all') {
        params.append('status', state.currentStatusFilter);
      }
      if (state.searchQuery && state.searchQuery.trim()) {
        params.append('search', state.searchQuery.trim());
      }

      const res = await fetch(`/api/seller/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load orders');
      const data = await res.json();
      state.orders = data.orders || [];
      renderOrders();
    } catch (err) {
      console.error('Failed to load orders:', err.message);
      if (elements.ordersTableBody) {
        elements.ordersTableBody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 2rem; color: var(--rose);">
              Unable to load orders. Please check your network or login session.
            </td>
          </tr>
        `;
      }
    }
  }

  // Permitted next status options
  const STATUS_FLOW = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: []
  };

  // Render Orders Table
  function renderOrders() {
    if (!elements.ordersTableBody) return;

    if (state.orders.length === 0) {
      elements.ordersTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-dim);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">📦</div>
            <strong>No orders found matching this filter.</strong>
            <p style="font-size: 0.8rem; margin-top: 0.25rem;">Orders containing your products will appear here once placed by customers.</p>
          </td>
        </tr>
      `;
      return;
    }

    elements.ordersTableBody.innerHTML = state.orders.map(item => {
      const currentStatus = (item.item_status || 'confirmed').toLowerCase();
      const nextOptions = STATUS_FLOW[currentStatus] || [];
      const orderDate = item.order_date ? new Date(item.order_date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : 'Recent';

      const customerAddress = [item.address_line, item.city, item.state, item.postal_code].filter(Boolean).join(', ') || 'Address on file';

      let statusSelectHtml = '';
      if (nextOptions.length === 0) {
        statusSelectHtml = `<span style="font-size: 0.8rem; color: var(--text-dim);">Finalized</span>`;
      } else {
        const optionTags = [
          `<option value="" disabled selected>Update to...</option>`,
          ...nextOptions.map(opt => `<option value="${opt}">${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`)
        ].join('');

        statusSelectHtml = `
          <select class="action-select status-updater" data-item-id="${item.order_item_id}">
            ${optionTags}
          </select>
        `;
      }

      return `
        <tr id="order-row-${item.order_item_id}">
          <td>
            <div style="font-weight: 700; color: var(--text-main);">#ORD-${item.order_id}</div>
            <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.15rem;">${orderDate}</div>
            <div style="font-size: 0.75rem; color: var(--text-dim);">Pay: ${item.payment_method || 'COD'}</div>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <img 
                src="${item.image || item.image_url || '../images/headphones.jpg'}" 
                alt="${item.product_name}" 
                style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-glass);"
                onerror="this.src='../images/headphones.jpg'"
              >
              <div>
                <strong style="color: var(--text-main); font-size: 0.9rem;">${item.product_name}</strong>
                <div style="font-size: 0.75rem; color: var(--text-dim);">Item ID: #${item.order_item_id}</div>
              </div>
            </div>
          </td>
          <td>
            <div class="customer-pill">
              <span class="customer-name">${item.customer_name || 'Customer'}</span>
              <span class="customer-sub">${item.customer_phone || item.customer_email || ''}</span>
              <span class="customer-sub" title="${customerAddress}" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                📍 ${customerAddress}
              </span>
            </div>
          </td>
          <td><strong>${item.quantity}</strong></td>
          <td>${formatCurrency(item.price)}</td>
          <td><strong style="color: var(--text-main);">${formatCurrency(item.subtotal)}</strong></td>
          <td>
            <span class="status-badge status-${currentStatus}">
              ● ${currentStatus}
            </span>
          </td>
          <td>
            ${statusSelectHtml}
          </td>
        </tr>
      `;
    }).join('');
  }

  // Handle Status Update
  if (elements.ordersTableBody) {
    elements.ordersTableBody.addEventListener('change', async (e) => {
      const select = e.target.closest('.status-updater');
      if (!select) return;

      const itemId = Number(select.getAttribute('data-item-id'));
      const newStatus = select.value;

      if (!itemId || !newStatus) return;

      select.disabled = true;

      try {
        const res = await fetch(`/api/seller/orders/${itemId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to update order status');
        }

        showToast(`Item #${itemId} updated to ${newStatus}`, '✓');
        // Refresh orders and reports
        loadOrders();
        loadReports();
      } catch (err) {
        showToast(err.message || 'Status update failed', '⚠️');
        select.disabled = false;
        select.value = '';
      }
    });
  }

  // Filter Pills Handler
  if (elements.statusFilterPills) {
    elements.statusFilterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        elements.statusFilterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.currentStatusFilter = pill.getAttribute('data-status');
        loadOrders();
      });
    });
  }

  // Search Input with Debounce
  let searchTimeout = null;
  if (elements.ordersSearchInput) {
    elements.ordersSearchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadOrders();
      }, 250);
    });
  }

  // Refresh Button
  if (elements.btnRefreshOrders) {
    elements.btnRefreshOrders.addEventListener('click', () => {
      loadOrders();
      loadReports();
      showToast('Data refreshed', '🔄');
    });
  }

  // Logout Handler
  if (elements.btnLogout) {
    elements.btnLogout.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
      } catch (err) {
        console.error('Logout error:', err);
      }
    });
  }

  // Initialize
  async function init() {
    await checkSession();
    await loadReports();
    await loadOrders();
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
  }
})();
