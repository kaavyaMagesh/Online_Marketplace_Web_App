document.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.getElementById('orders-table-body');
  const search = document.getElementById('order-search');
  const filter = document.getElementById('order-status-filter');

  let orders = [];

  function renderOrders() {
    const query = search.value.trim().toLowerCase();
    const status = filter.value;

    const filtered = orders.filter(order => {
      const matchesSearch =
        String(order.order_id).includes(query) ||
        String(order.customer_name || '').toLowerCase().includes(query) ||
        String(order.customer_email || '').toLowerCase().includes(query);

      return matchesSearch && (!status || order.status === status);
    });

    tbody.replaceChildren();

    if (!filtered.length) {
      const row = tbody.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 6;
      cell.textContent = 'No matching orders found.';
      return;
    }

    for (const order of filtered) {
      const row = tbody.insertRow();
      const date = order.created_at
        ? new Date(order.created_at).toLocaleDateString()
        : '—';

      const values = [
        order.order_id,
        `${order.customer_name || 'Unknown'} (${order.customer_email || 'No email'})`,
        order.total_items,
        Number(order.total_amount).toFixed(2),
        order.status,
        date
      ];

      for (const value of values) {
        const cell = row.insertCell();
        cell.textContent = String(value ?? '—');
      }
    }
  }

  search.addEventListener('input', renderOrders);
  filter.addEventListener('change', renderOrders);

  try {
    const response = await fetch('/api/admin/orders', {
      credentials: 'same-origin'
    });

    if (!response.ok) {
      throw new Error(`Unable to load orders (${response.status})`);
    }

    const data = await response.json();
    orders = Array.isArray(data.orders) ? data.orders : [];
    renderOrders();
  } catch (error) {
    tbody.replaceChildren();
    const row = tbody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.textContent = error.message;
  }
});
