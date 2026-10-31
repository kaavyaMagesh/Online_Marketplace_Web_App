/**
 * GoodsPlatz Seller Central — Dashboard & Product Management Logic
 * Strict XSS prevention: Uses textContent for all dynamic text inputs.
 */

// Application State
const state = {
  currentUser: null,
  products: [],
  categories: [],
  activeFilters: {
    search: '',
    category: 'all',
    status: 'all'
  },
  pendingDeactivateId: null
};

// DOM Elements
const elements = {
  // Navigation & User
  userDisplayName: document.getElementById('userDisplayName'),
  userRoleBadge: document.getElementById('userRoleBadge'),
  userAvatarText: document.getElementById('userAvatarText'),
  btnSwitchSeller: document.getElementById('btnSwitchSeller'),
  switchSessionBtnLabel: document.getElementById('switchSessionBtnLabel'),
  btnLogout: document.getElementById('btnLogout'),

  // Header Actions
  btnRefreshCatalog: document.getElementById('btnRefreshCatalog'),
  btnOpenAddModal: document.getElementById('btnOpenAddModal'),

  // Metrics
  statTotalProducts: document.getElementById('statTotalProducts'),
  statActiveProducts: document.getElementById('statActiveProducts'),
  statLowStock: document.getElementById('statLowStock'),
  statInventoryValue: document.getElementById('statInventoryValue'),

  // Filters
  searchProductsInput: document.getElementById('searchProductsInput'),
  filterCategorySelect: document.getElementById('filterCategorySelect'),
  filterStatusSelect: document.getElementById('filterStatusSelect'),

  // Table & Empty State
  sellerProductsTable: document.getElementById('sellerProductsTable'),
  productsTableBody: document.getElementById('productsTableBody'),
  emptyStateContainer: document.getElementById('emptyStateContainer'),
  btnEmptyStateAction: document.getElementById('btnEmptyStateAction'),

  // Product Modal & Form
  productModal: document.getElementById('productModal'),
  productModalTitle: document.getElementById('productModalTitle'),
  btnCloseProductModal: document.getElementById('btnCloseProductModal'),
  btnCancelProductModal: document.getElementById('btnCancelProductModal'),
  productForm: document.getElementById('productForm'),
  formAlertBanner: document.getElementById('formAlertBanner'),
  formProductId: document.getElementById('formProductId'),
  formProductName: document.getElementById('formProductName'),
  formCategoryId: document.getElementById('formCategoryId'),
  formPrice: document.getElementById('formPrice'),
  formStockQuantity: document.getElementById('formStockQuantity'),
  formStatus: document.getElementById('formStatus'),
  formImage: document.getElementById('formImage'),
  imagePreviewContainer: document.getElementById('imagePreviewContainer'),
  imagePreviewThumb: document.getElementById('imagePreviewThumb'),
  formDescription: document.getElementById('formDescription'),
  btnSubmitProductForm: document.getElementById('btnSubmitProductForm'),
  btnSubmitText: document.getElementById('btnSubmitText'),
  btnSubmitSpinner: document.getElementById('btnSubmitSpinner'),

  // Field error elements
  errProductName: document.getElementById('errProductName'),
  errCategoryId: document.getElementById('errCategoryId'),
  errPrice: document.getElementById('errPrice'),
  errStockQuantity: document.getElementById('errStockQuantity'),

  // Deactivate Modal
  deactivateModal: document.getElementById('deactivateModal'),
  deactivateProductName: document.getElementById('deactivateProductName'),
  btnCloseDeactivateModal: document.getElementById('btnCloseDeactivateModal'),
  btnCancelDeactivate: document.getElementById('btnCancelDeactivate'),
  btnConfirmDeactivate: document.getElementById('btnConfirmDeactivate'),

  // Login Modal
  loginModal: document.getElementById('loginModal'),
  btnCloseLoginModal: document.getElementById('btnCloseLoginModal'),
  btnQuickSeller1: document.getElementById('btnQuickSeller1'),
  btnQuickSeller2: document.getElementById('btnQuickSeller2'),
  btnQuickCustomer: document.getElementById('btnQuickCustomer'),
  customLoginForm: document.getElementById('customLoginForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  loginAlertBanner: document.getElementById('loginAlertBanner'),

  // Toast Container
  toastContainer: document.getElementById('toastContainer')
};

/**
 * Toast Notification System
 */
function showToast(message, type = 'info') {
  if (!elements.toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = document.createElement('span');
  icon.textContent = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

  const text = document.createElement('span');
  text.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(text);

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Currency Formatter
 */
function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(num);
}

/**
 * Check User Session Status
 */
async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Auth check failed');
    const data = await res.json();

    if (data.authenticated && data.user) {
      state.currentUser = data.user;
      elements.userDisplayName.textContent = data.user.name || data.user.email;
      elements.userRoleBadge.textContent = `${(data.user.role || '').toUpperCase()} PORTAL`;
      elements.userAvatarText.textContent = (data.user.name ? data.user.name[0] : 'S').toUpperCase();
      elements.btnLogout.style.display = 'inline-flex';
      elements.switchSessionBtnLabel.textContent = 'Switch Account';
    } else {
      state.currentUser = null;
      elements.userDisplayName.textContent = 'Not Logged In';
      elements.userRoleBadge.textContent = 'Guest / Demo Mode';
      elements.userAvatarText.textContent = '?';
      elements.btnLogout.style.display = 'none';
      elements.switchSessionBtnLabel.textContent = 'Seller Login';
    }
  } catch (err) {
    console.warn('Could not determine session user:', err);
  }
}

/**
 * Fetch Categories from backend
 */
async function loadCategories() {
  try {
    const res = await fetch('/api/categories', { credentials: 'same-origin' });
    if (!res.ok) return;

    state.categories = await res.json();

    // Populate category dropdown in modal
    elements.formCategoryId.innerHTML = '<option value="">Select Category</option>';
    elements.filterCategorySelect.innerHTML = '<option value="all">All Categories</option>';

    state.categories.forEach(cat => {
      // Modal select
      const optModal = document.createElement('option');
      optModal.value = cat.category_id;
      optModal.textContent = cat.category_name;
      elements.formCategoryId.appendChild(optModal);

      // Filter select
      const optFilter = document.createElement('option');
      optFilter.value = cat.category_id;
      optFilter.textContent = cat.category_name;
      elements.filterCategorySelect.appendChild(optFilter);
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

/**
 * GET: Load Seller's Products from /api/seller/products
 */
async function loadSellerProducts() {
  try {
    elements.productsTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          ⏳ Loading your product catalog...
        </td>
      </tr>
    `;

    const response = await fetch('/api/seller/products', {
      credentials: 'same-origin'
    });

    if (response.status === 401 || response.status === 403) {
      elements.productsTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2.5rem; color: #fda4af;">
            🔒 Seller authentication required. Please log in with a seller account.
          </td>
        </tr>
      `;
      showLoginModal();
      return;
    }

    if (!response.ok) {
      showToast('Could not load products.', 'error');
      elements.productsTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2.5rem; color: #fda4af;">
            ❌ Unable to load inventory. Please try again.
          </td>
        </tr>
      `;
      return;
    }

    const data = await response.json();
    state.products = Array.isArray(data) ? data : (data.products || []);

    updateSummaryCards(state.products);
    renderProductsTable();
  } catch (error) {
    console.error('Failed to load products:', error);
    showToast('Network error loading products.', 'error');
  }
}

/**
 * Update KPI Summary Cards
 */
function updateSummaryCards(products) {
  const total = products.length;
  const active = products.filter(p => p.status === 'active').length;
  const lowStock = products.filter(p => Number(p.stock_quantity) <= 5).length;
  const totalValue = products.reduce((acc, p) => {
    return acc + (Number(p.price) || 0) * (Number(p.stock_quantity) || 0);
  }, 0);

  elements.statTotalProducts.textContent = total;
  elements.statActiveProducts.textContent = active;
  elements.statLowStock.textContent = lowStock;
  elements.statInventoryValue.textContent = formatCurrency(totalValue);
}

/**
 * Filter products according to search input, category, and status
 */
function getFilteredProducts() {
  const { search, category, status } = state.activeFilters;
  const query = (search || '').trim().toLowerCase();

  return state.products.filter(product => {
    // Search filter
    if (query) {
      const name = (product.product_name || '').toLowerCase();
      const desc = (product.description || '').toLowerCase();
      if (!name.includes(query) && !desc.includes(query)) return false;
    }

    // Category filter
    if (category !== 'all') {
      if (String(product.category_id) !== String(category)) return false;
    }

    // Status filter
    if (status === 'active') {
      if (product.status !== 'active') return false;
    } else if (status === 'inactive') {
      if (product.status !== 'inactive') return false;
    } else if (status === 'low-stock') {
      if (Number(product.stock_quantity) > 5) return false;
    } else if (status === 'out-of-stock') {
      if (Number(product.stock_quantity) > 0) return false;
    }

    return true;
  });
}

/**
 * Low-stock status helper
 * Defines < 5 units as low stock, 0 as out of stock, else in stock.
 */
function getStockStatus(quantity) {
  if (quantity === 0) {
    return "Out of stock";
  }

  if (quantity < 5) {
    return "Low stock";
  }

  return "In stock";
}

/**
 * Render Product Table using strictly textContent for untrusted user strings
 */
function renderProductsTable() {
  const filtered = getFilteredProducts();

  elements.productsTableBody.innerHTML = '';

  if (filtered.length === 0) {
    elements.sellerProductsTable.style.display = 'none';
    elements.emptyStateContainer.style.display = 'block';

    const hasFilters = state.activeFilters.search || state.activeFilters.category !== 'all' || state.activeFilters.status !== 'all';
    document.getElementById('emptyStateTitle').textContent = hasFilters ? 'No Matching Products' : 'No Products Listed Yet';
    document.getElementById('emptyStateMessage').textContent = hasFilters
      ? 'Try modifying your search or filter criteria to see your products.'
      : 'Start listing your items on GoodsPlatz marketplace to start generating sales.';
    return;
  }

  elements.sellerProductsTable.style.display = 'table';
  elements.emptyStateContainer.style.display = 'none';

  filtered.forEach(product => {
    const row = document.createElement('tr');
    row.id = `product-row-${product.product_id}`;

    // 1. Product Cell (Image + Name + Description + ID)
    const tdProduct = document.createElement('td');
    const cellWrapper = document.createElement('div');
    cellWrapper.className = 'product-cell-wrapper';

    // Image thumbnail or fallback
    if (product.image) {
      const img = document.createElement('img');
      img.src = product.image.startsWith('http') || product.image.startsWith('/')
        ? product.image
        : `/${product.image}`;
      img.alt = product.product_name;
      img.className = 'product-thumb';
      img.onerror = () => {
        img.replaceWith(createFallbackIcon(product.product_name));
      };
      cellWrapper.appendChild(img);
    } else {
      cellWrapper.appendChild(createFallbackIcon(product.product_name));
    }

    const infoBlock = document.createElement('div');
    infoBlock.className = 'product-info-block';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'product-name-text';

    const idTag = document.createElement('span');
    idTag.className = 'product-id-tag';
    idTag.textContent = `#${product.product_id}`;
    nameDiv.appendChild(idTag);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = product.product_name; // textContent used strictly
    nameDiv.appendChild(nameSpan);

    const descDiv = document.createElement('div');
    descDiv.className = 'product-desc-snippet';
    descDiv.textContent = product.description || 'No description provided.'; // textContent used strictly

    infoBlock.appendChild(nameDiv);
    infoBlock.appendChild(descDiv);
    cellWrapper.appendChild(infoBlock);
    tdProduct.appendChild(cellWrapper);
    row.appendChild(tdProduct);

    // 2. Category Cell
    const tdCategory = document.createElement('td');
    const catPill = document.createElement('span');
    catPill.className = 'category-pill';

    const catDot = document.createElement('span');
    catDot.className = 'category-dot';
    catPill.appendChild(catDot);

    const catText = document.createElement('span');
    const catObj = state.categories.find(c => c.category_id === product.category_id);
    catText.textContent = catObj ? catObj.category_name : (product.category_name || `Category ${product.category_id}`);
    catPill.appendChild(catText);

    tdCategory.appendChild(catPill);
    row.appendChild(tdCategory);

    // 3. Price Cell
    const tdPrice = document.createElement('td');
    const priceSpan = document.createElement('span');
    priceSpan.className = 'price-tag';
    priceSpan.textContent = formatCurrency(product.price);
    tdPrice.appendChild(priceSpan);
    row.appendChild(tdPrice);

    // 4. Stock Cell
    const tdStock = document.createElement('td');
    const stockWrapper = document.createElement('div');
    stockWrapper.className = 'stock-wrapper';

    const stockNumberRow = document.createElement('div');
    stockNumberRow.className = 'stock-number-row';

    const stockQtySpan = document.createElement('span');
    stockQtySpan.textContent = `${product.stock_quantity} in stock`;
    stockNumberRow.appendChild(stockQtySpan);

    const stockTag = document.createElement('span');
    const qty = Number(product.stock_quantity);
    const stockStatusLabel = getStockStatus(qty);
    stockTag.textContent = stockStatusLabel;
    if (stockStatusLabel === 'Out of stock') {
      stockTag.className = 'stock-tag out-of-stock';
    } else if (stockStatusLabel === 'Low stock') {
      stockTag.className = 'stock-tag low-stock';
    } else {
      stockTag.className = 'stock-tag in-stock';
    }
    stockNumberRow.appendChild(stockTag);
    stockWrapper.appendChild(stockNumberRow);

    // Progress bar representation
    const barBg = document.createElement('div');
    barBg.className = 'stock-bar-bg';
    const barFill = document.createElement('div');
    barFill.className = `stock-bar-fill ${qty === 0 ? 'empty' : qty < 5 ? 'low' : ''}`;

    barFill.style.width = `${Math.min(100, Math.max(5, (qty / 30) * 100))}%`;
    barBg.appendChild(barFill);
    stockWrapper.appendChild(barBg);

    tdStock.appendChild(stockWrapper);
    row.appendChild(tdStock);

    // 5. Status Cell
    const tdStatus = document.createElement('td');
    const statusPill = document.createElement('span');
    const isActive = product.status === 'active';
    statusPill.className = `status-pill status-${isActive ? 'active' : 'inactive'}`;

    const pulse = document.createElement('span');
    pulse.className = 'pulse-indicator';
    statusPill.appendChild(pulse);

    const statusText = document.createElement('span');
    statusText.textContent = isActive ? 'Active' : 'Inactive';
    statusPill.appendChild(statusText);

    tdStatus.appendChild(statusPill);
    row.appendChild(tdStatus);

    // 6. Actions Cell
    const tdActions = document.createElement('td');
    tdActions.style.textAlign = 'right';

    const actionCluster = document.createElement('div');
    actionCluster.className = 'actions-cluster';
    actionCluster.style.justifyContent = 'flex-end';

    // Edit Button
    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn-action btn-action-edit';
    btnEdit.id = `btnEditProduct_${product.product_id}`;
    btnEdit.title = 'Edit Product';
    btnEdit.innerHTML = '✏️';
    btnEdit.onclick = () => openEditModal(product);
    actionCluster.appendChild(btnEdit);

    // Deactivate Button (or Reactivate button if already inactive)
    if (isActive) {
      const btnDeactivate = document.createElement('button');
      btnDeactivate.type = 'button';
      btnDeactivate.className = 'btn-action btn-action-deactivate';
      btnDeactivate.id = `btnDeactivateProduct_${product.product_id}`;
      btnDeactivate.title = 'Deactivate Product';
      btnDeactivate.innerHTML = '🚫';
      btnDeactivate.onclick = () => confirmDeactivate(product);
      actionCluster.appendChild(btnDeactivate);
    } else {
      const btnReactivate = document.createElement('button');
      btnReactivate.type = 'button';
      btnReactivate.className = 'btn-action btn-action-activate';
      btnReactivate.id = `btnReactivateProduct_${product.product_id}`;
      btnReactivate.title = 'Reactivate Product';
      btnReactivate.innerHTML = '🔄';
      btnReactivate.onclick = () => reactivateProduct(product);
      actionCluster.appendChild(btnReactivate);
    }

    tdActions.appendChild(actionCluster);
    row.appendChild(tdActions);

    elements.productsTableBody.appendChild(row);
  });
}

function createFallbackIcon(name) {
  const icon = document.createElement('div');
  icon.className = 'product-thumb-fallback';
  icon.textContent = (name && name[0]) ? name[0].toUpperCase() : '📦';
  return icon;
}

/**
 * Open Modal in Add Mode
 */
function openAddModal() {
  resetForm();
  elements.productModalTitle.textContent = 'Add New Product';
  elements.btnSubmitText.textContent = 'Publish Product';
  elements.formStatus.value = 'active';
  showModal(elements.productModal);
}

/**
 * Open Modal in Edit Mode
 */
function openEditModal(product) {
  resetForm();
  elements.productModalTitle.textContent = `Edit Product #${product.product_id}`;
  elements.btnSubmitText.textContent = 'Save Changes';

  elements.formProductId.value = product.product_id;
  elements.formProductName.value = product.product_name;
  elements.formCategoryId.value = product.category_id || '';
  elements.formPrice.value = Number(product.price).toFixed(2);
  elements.formStockQuantity.value = product.stock_quantity;
  elements.formStatus.value = product.status || 'active';
  elements.formImage.value = product.image || '';
  elements.formDescription.value = product.description || '';

  if (product.image) {
    elements.imagePreviewThumb.src = product.image.startsWith('http') || product.image.startsWith('/')
      ? product.image
      : `/${product.image}`;
    elements.imagePreviewContainer.style.display = 'flex';
  }

  showModal(elements.productModal);
}

/**
 * Reset form inputs and clear validation errors
 */
function resetForm() {
  elements.productForm.reset();
  elements.formProductId.value = '';
  elements.formAlertBanner.className = 'form-alert-banner';
  elements.formAlertBanner.style.display = 'none';
  elements.formAlertBanner.textContent = '';
  elements.imagePreviewContainer.style.display = 'none';

  // Clear field errors
  [elements.errProductName, elements.errCategoryId, elements.errPrice, elements.errStockQuantity].forEach(el => {
    el.classList.remove('visible');
  });
  [elements.formProductName, elements.formCategoryId, elements.formPrice, elements.formStockQuantity].forEach(input => {
    input.classList.remove('is-invalid');
  });
}

/**
 * Validate product form inputs
 */
function validateProductForm() {
  let isValid = true;

  const name = elements.formProductName.value.trim();
  const categoryId = Number(elements.formCategoryId.value);
  const price = Number(elements.formPrice.value);
  const stock = Number(elements.formStockQuantity.value);

  // Name check
  if (!name) {
    elements.formProductName.classList.add('is-invalid');
    elements.errProductName.classList.add('visible');
    isValid = false;
  } else {
    elements.formProductName.classList.remove('is-invalid');
    elements.errProductName.classList.remove('visible');
  }

  // Category check
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    elements.formCategoryId.classList.add('is-invalid');
    elements.errCategoryId.classList.add('visible');
    isValid = false;
  } else {
    elements.formCategoryId.classList.remove('is-invalid');
    elements.errCategoryId.classList.remove('visible');
  }

  // Price check
  if (isNaN(price) || price < 0 || elements.formPrice.value === '') {
    elements.formPrice.classList.add('is-invalid');
    elements.errPrice.classList.add('visible');
    isValid = false;
  } else {
    elements.formPrice.classList.remove('is-invalid');
    elements.errPrice.classList.remove('visible');
  }

  // Stock check
  if (!Number.isInteger(stock) || stock < 0 || elements.formStockQuantity.value === '') {
    elements.formStockQuantity.classList.add('is-invalid');
    elements.errStockQuantity.classList.add('visible');
    isValid = false;
  } else {
    elements.formStockQuantity.classList.remove('is-invalid');
    elements.errStockQuantity.classList.remove('visible');
  }

  return isValid;
}

/**
 * Form Submit Handler: POST /api/seller/products or PUT /api/seller/products/:id
 */
elements.productForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!validateProductForm()) {
    showFormBanner('Please resolve the highlighted validation errors.', 'error');
    return;
  }

  const editId = elements.formProductId.value;
  const isEditing = Boolean(editId);

  const payload = {
    product_name: elements.formProductName.value.trim(),
    category_id: Number(elements.formCategoryId.value),
    price: Number(elements.formPrice.value),
    stock_quantity: Number(elements.formStockQuantity.value),
    status: elements.formStatus.value,
    image: elements.formImage.value.trim() || null,
    description: elements.formDescription.value.trim() || null
  };

  // Loading state
  elements.btnSubmitProductForm.disabled = true;
  elements.btnSubmitSpinner.style.display = 'inline';

  try {
    const url = isEditing
      ? `/api/seller/products/${editId}`
      : '/api/seller/products';
    const method = isEditing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      const errorMsg = data.message || data.error || 'Operation failed. Please review your input.';
      showFormBanner(errorMsg, 'error');
      showToast(errorMsg, 'error');
      return;
    }

    hideModal(elements.productModal);
    showToast(isEditing ? 'Product updated successfully.' : 'Product added successfully.', 'success');
    await loadSellerProducts();
  } catch (err) {
    console.error('Submit error:', err);
    showFormBanner('A network error occurred. Please try again.', 'error');
  } finally {
    elements.btnSubmitProductForm.disabled = false;
    elements.btnSubmitSpinner.style.display = 'none';
  }
});

function showFormBanner(message, type) {
  elements.formAlertBanner.className = `form-alert-banner ${type}`;
  elements.formAlertBanner.textContent = message;
  elements.formAlertBanner.style.display = 'flex';
}

/**
 * Confirm Deactivate Dialog
 */
function confirmDeactivate(product) {
  state.pendingDeactivateId = product.product_id;
  elements.deactivateProductName.textContent = `"${product.product_name}" (ID #${product.product_id})`;
  showModal(elements.deactivateModal);
}

/**
 * DELETE /api/seller/products/:id
 */
elements.btnConfirmDeactivate.addEventListener('click', async () => {
  if (!state.pendingDeactivateId) return;

  elements.btnConfirmDeactivate.disabled = true;
  elements.btnConfirmDeactivate.textContent = 'Deactivating...';

  try {
    const res = await fetch(`/api/seller/products/${state.pendingDeactivateId}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || data.error || 'Could not deactivate product.', 'error');
      return;
    }

    hideModal(elements.deactivateModal);
    showToast('Product deactivated successfully.', 'success');
    await loadSellerProducts();
  } catch (err) {
    console.error('Deactivation error:', err);
    showToast('Network error while deactivating product.', 'error');
  } finally {
    elements.btnConfirmDeactivate.disabled = false;
    elements.btnConfirmDeactivate.textContent = 'Deactivate';
    state.pendingDeactivateId = null;
  }
});

/**
 * Quick Reactivate Action (PUT /api/seller/products/:id with status: 'active')
 */
async function reactivateProduct(product) {
  try {
    const res = await fetch(`/api/seller/products/${product.product_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ status: 'active' })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || 'Could not reactivate product.', 'error');
      return;
    }

    showToast(`"${product.product_name}" is now active in the store!`, 'success');
    await loadSellerProducts();
  } catch (err) {
    showToast('Failed to reactivate product.', 'error');
  }
}

/**
 * Modal Visibility Helpers
 */
function showModal(modalEl) {
  modalEl.classList.add('active');
}

function hideModal(modalEl) {
  modalEl.classList.remove('active');
}

// Modal Close Listeners
elements.btnCloseProductModal.onclick = () => hideModal(elements.productModal);
elements.btnCancelProductModal.onclick = () => hideModal(elements.productModal);
elements.btnCloseDeactivateModal.onclick = () => hideModal(elements.deactivateModal);
elements.btnCancelDeactivate.onclick = () => hideModal(elements.deactivateModal);
elements.btnCloseLoginModal.onclick = () => hideModal(elements.loginModal);
elements.btnOpenAddModal.onclick = openAddModal;
elements.btnEmptyStateAction.onclick = openAddModal;
elements.btnRefreshCatalog.onclick = loadSellerProducts;

// Close modals when clicking backdrop
[elements.productModal, elements.deactivateModal, elements.loginModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideModal(modal);
  });
});

// Image URL live preview
elements.formImage.addEventListener('input', () => {
  const url = elements.formImage.value.trim();
  if (url) {
    elements.imagePreviewThumb.src = url.startsWith('http') || url.startsWith('/') ? url : `/${url}`;
    elements.imagePreviewContainer.style.display = 'flex';
  } else {
    elements.imagePreviewContainer.style.display = 'none';
  }
});

/**
 * Filter and Search Event Handlers
 */
elements.searchProductsInput.addEventListener('input', (e) => {
  state.activeFilters.search = e.target.value;
  renderProductsTable();
});

elements.filterCategorySelect.addEventListener('change', (e) => {
  state.activeFilters.category = e.target.value;
  renderProductsTable();
});

elements.filterStatusSelect.addEventListener('change', (e) => {
  state.activeFilters.status = e.target.value;
  renderProductsTable();
});

/**
 * Quick Login / Switch Account Helpers
 */
function showLoginModal() {
  elements.loginAlertBanner.style.display = 'none';
  showModal(elements.loginModal);
}

elements.btnSwitchSeller.onclick = showLoginModal;

async function executeLogin(email, password) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      elements.loginAlertBanner.textContent = data.message || 'Login failed.';
      elements.loginAlertBanner.className = 'form-alert-banner error';
      elements.loginAlertBanner.style.display = 'flex';
      return;
    }

    hideModal(elements.loginModal);
    showToast(`Logged in as ${data.user.name} (${data.user.role})`, 'success');
    await checkAuthSession();
    await loadSellerProducts();
  } catch (err) {
    elements.loginAlertBanner.textContent = 'Network error during login.';
    elements.loginAlertBanner.className = 'form-alert-banner error';
    elements.loginAlertBanner.style.display = 'flex';
  }
}

elements.btnQuickSeller1.onclick = () => executeLogin('seller@marketplace.com', 'Marketplace@123');
elements.btnQuickSeller2.onclick = () => executeLogin('seller2@marketplace.com', 'Marketplace@123');
elements.btnQuickCustomer.onclick = () => executeLogin('customer@marketplace.com', 'Marketplace@123');

elements.customLoginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  executeLogin(elements.loginEmail.value.trim(), elements.loginPassword.value);
});

elements.btnLogout.onclick = async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    showToast('Logged out of seller session.', 'info');
    await checkAuthSession();
    await loadSellerProducts();
  } catch (e) {
    console.error(e);
  }
};

/**
 * Initial Application Boot
 */
async function initDashboard() {
  await checkAuthSession();
  await loadCategories();
  await loadSellerProducts();
}

// Start dashboard on load
document.addEventListener('DOMContentLoaded', initDashboard);
