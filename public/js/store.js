/**
 * GoodsPlatz Online Marketplace - Storefront Logic
 * Clean, lightweight, responsive client-side controller.
 */

(function () {
  'use strict';

  // State Management
  const state = {
    products: [],
    categories: [],
    activeCategory: 'all',
    searchQuery: '',
    sortBy: 'featured',
    cart: JSON.parse(localStorage.getItem('goodsplatz_cart') || '[]'),
    activeQuickViewProduct: null,
    quickViewQty: 1
  };

  // DOM Elements
  const elements = {
    productsGrid: document.getElementById('productsGrid'),
    categoryPillsContainer: document.getElementById('categoryPillsContainer'),
    storeSearchInput: document.getElementById('storeSearchInput'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    resultsCountLabel: document.getElementById('resultsCountLabel'),
    sortSelect: document.getElementById('sortSelect'),

    // Cart Elements
    cartBadge: document.getElementById('cartBadge'),
    btnOpenCart: document.getElementById('btnOpenCart'),
    btnCloseCart: document.getElementById('btnCloseCart'),
    cartDrawer: document.getElementById('cartDrawer'),
    cartOverlay: document.getElementById('cartOverlay'),
    cartItemsList: document.getElementById('cartItemsList'),
    cartEmptyMessage: document.getElementById('cartEmptyMessage'),
    cartSubtotal: document.getElementById('cartSubtotal'),
    cartDelivery: document.getElementById('cartDelivery'),
    cartTotal: document.getElementById('cartTotal'),
    btnOpenCheckout: document.getElementById('btnOpenCheckout'),

    // Quick View Modal
    productModal: document.getElementById('productModal'),
    btnCloseProductModal: document.getElementById('btnCloseProductModal'),
    modalProductTitle: document.getElementById('modalProductTitle'),
    modalProductImg: document.getElementById('modalProductImg'),
    modalProductCategory: document.getElementById('modalProductCategory'),
    modalProductPrice: document.getElementById('modalProductPrice'),
    modalProductStockBadge: document.getElementById('modalProductStockBadge'),
    modalProductDesc: document.getElementById('modalProductDesc'),
    modalQtyMinus: document.getElementById('modalQtyMinus'),
    modalQtyPlus: document.getElementById('modalQtyPlus'),
    modalQtyValue: document.getElementById('modalQtyValue'),
    modalBtnAddToCart: document.getElementById('modalBtnAddToCart'),

    // Checkout Modal
    checkoutModal: document.getElementById('checkoutModal'),
    btnCloseCheckoutModal: document.getElementById('btnCloseCheckoutModal'),
    checkoutForm: document.getElementById('checkoutForm'),
    checkoutPayableTotal: document.getElementById('checkoutPayableTotal'),

    // Order Success Modal
    orderSuccessModal: document.getElementById('orderSuccessModal'),
    confirmedOrderId: document.getElementById('confirmedOrderId'),
    btnContinueShopping: document.getElementById('btnContinueShopping'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer')
  };

  // Helper: Currency Formatter
  function formatCurrency(amount) {
    const val = Number(amount) || 0;
    return '₹' + val.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Toast Notification
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

  // Save Cart to LocalStorage
  function saveCart() {
    localStorage.setItem('goodsplatz_cart', JSON.stringify(state.cart));
    updateCartUI();
  }

  // Update Cart UI (Badge, items list, totals)
  function updateCartUI() {
    const totalCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    if (elements.cartBadge) {
      elements.cartBadge.textContent = totalCount;
    }

    if (!elements.cartItemsList) return;

    if (state.cart.length === 0) {
      elements.cartItemsList.innerHTML = `
        <div class="cart-empty-message" id="cartEmptyMessage">
          <div class="cart-empty-icon">🛍️</div>
          <p>Your cart is empty.</p>
          <p style="font-size: 0.8rem; margin-top: 0.25rem; color: var(--text-muted);">Browse products to add items.</p>
        </div>
      `;
      if (elements.cartSubtotal) elements.cartSubtotal.textContent = '₹0.00';
      if (elements.cartDelivery) elements.cartDelivery.textContent = 'Free';
      if (elements.cartTotal) elements.cartTotal.textContent = '₹0.00';
      if (elements.btnOpenCheckout) elements.btnOpenCheckout.disabled = true;
      return;
    }

    let subtotal = 0;
    elements.cartItemsList.innerHTML = '';

    state.cart.forEach((item, index) => {
      const lineTotal = item.price * item.quantity;
      subtotal += lineTotal;

      const card = document.createElement('div');
      card.className = 'cart-item-card';
      card.innerHTML = `
        <img src="${item.image || 'images/headphones.jpg'}" alt="${item.product_name}" class="cart-item-thumb" onerror="this.src='images/headphones.jpg'">
        <div class="cart-item-details">
          <div>
            <div class="cart-item-title">${item.product_name}</div>
            <div class="cart-item-price">${formatCurrency(item.price)}</div>
          </div>
          <div class="cart-item-actions">
            <div class="qty-stepper">
              <button type="button" class="qty-btn" data-action="decrease" data-index="${index}">-</button>
              <span class="qty-count">${item.quantity}</span>
              <button type="button" class="qty-btn" data-action="increase" data-index="${index}">+</button>
            </div>
            <button type="button" class="btn-remove-item" data-action="remove" data-index="${index}">Remove</button>
          </div>
        </div>
      `;
      elements.cartItemsList.appendChild(card);
    });

    const isFreeDelivery = subtotal >= 499 || subtotal === 0;
    const deliveryFee = isFreeDelivery ? 0 : 49;
    const grandTotal = subtotal + deliveryFee;

    if (elements.cartSubtotal) elements.cartSubtotal.textContent = formatCurrency(subtotal);
    if (elements.cartDelivery) elements.cartDelivery.textContent = isFreeDelivery ? 'Free' : formatCurrency(deliveryFee);
    if (elements.cartTotal) elements.cartTotal.textContent = formatCurrency(grandTotal);
    if (elements.btnOpenCheckout) elements.btnOpenCheckout.disabled = false;
  }

  // Handle Cart Item Actions (+, -, remove)
  if (elements.cartItemsList) {
    elements.cartItemsList.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (!target) return;

      const action = target.getAttribute('data-action');
      const index = parseInt(target.getAttribute('data-index'), 10);
      if (isNaN(index) || !state.cart[index]) return;

      const item = state.cart[index];

      if (action === 'increase') {
        if (item.quantity < item.stock_quantity) {
          item.quantity += 1;
          saveCart();
        } else {
          showToast(`Only ${item.stock_quantity} available in stock`, '⚠️');
        }
      } else if (action === 'decrease') {
        if (item.quantity > 1) {
          item.quantity -= 1;
          saveCart();
        } else {
          state.cart.splice(index, 1);
          saveCart();
          showToast('Item removed from cart');
        }
      } else if (action === 'remove') {
        state.cart.splice(index, 1);
        saveCart();
        showToast('Item removed from cart');
      }
    });
  }

  // Add Item to Cart
  function addToCart(product, quantity = 1) {
    if (!product || product.stock_quantity <= 0) {
      showToast('Product is currently out of stock.', '⚠️');
      return;
    }

    const existingIndex = state.cart.findIndex(i => i.product_id === product.product_id);
    if (existingIndex > -1) {
      const existing = state.cart[existingIndex];
      const newQty = existing.quantity + quantity;
      if (newQty > product.stock_quantity) {
        showToast(`Cannot add more. Max available stock is ${product.stock_quantity}.`, '⚠️');
        return;
      }
      existing.quantity = newQty;
    } else {
      state.cart.push({
        product_id: product.product_id,
        product_name: product.product_name,
        price: parseFloat(product.price) || 0,
        image: product.image || product.image_url || 'images/headphones.jpg',
        stock_quantity: product.stock_quantity,
        quantity: Math.min(quantity, product.stock_quantity)
      });
    }

    saveCart();
    showToast(`Added "${product.product_name}" to cart! 🛍️`);
  }

  // Drawer Toggle Controls
  function openCartDrawer() {
    if (elements.cartDrawer) elements.cartDrawer.classList.add('active');
    if (elements.cartOverlay) elements.cartOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeCartDrawer() {
    if (elements.cartDrawer) elements.cartDrawer.classList.remove('active');
    if (elements.cartOverlay) elements.cartOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (elements.btnOpenCart) elements.btnOpenCart.addEventListener('click', openCartDrawer);
  if (elements.btnCloseCart) elements.btnCloseCart.addEventListener('click', closeCartDrawer);
  if (elements.cartOverlay) elements.cartOverlay.addEventListener('click', closeCartDrawer);

  // Quick View Modal Controls
  function openQuickView(product) {
    state.activeQuickViewProduct = product;
    state.quickViewQty = 1;

    if (!elements.productModal) return;

    elements.modalProductTitle.textContent = product.product_name;
    elements.modalProductImg.src = product.image || product.image_url || 'images/headphones.jpg';
    elements.modalProductImg.alt = product.product_name;
    elements.modalProductCategory.textContent = product.category_name || 'General';
    elements.modalProductPrice.textContent = formatCurrency(product.price);
    elements.modalProductDesc.textContent = product.description || 'No description provided for this product.';
    elements.modalQtyValue.textContent = '1';

    const stock = Number(product.stock_quantity) || 0;
    if (stock <= 0) {
      elements.modalProductStockBadge.innerHTML = `<span class="badge-stock stock-out">Out of Stock</span>`;
      elements.modalBtnAddToCart.disabled = true;
    } else if (stock <= 5) {
      elements.modalProductStockBadge.innerHTML = `<span class="badge-stock stock-low">Only ${stock} left in stock</span>`;
      elements.modalBtnAddToCart.disabled = false;
    } else {
      elements.modalProductStockBadge.innerHTML = `<span class="badge-stock stock-in">In Stock (${stock} units)</span>`;
      elements.modalBtnAddToCart.disabled = false;
    }

    elements.productModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeQuickView() {
    if (elements.productModal) elements.productModal.classList.remove('active');
    document.body.style.overflow = '';
    state.activeQuickViewProduct = null;
  }

  if (elements.btnCloseProductModal) elements.btnCloseProductModal.addEventListener('click', closeQuickView);
  if (elements.productModal) {
    elements.productModal.addEventListener('click', (e) => {
      if (e.target === elements.productModal) closeQuickView();
    });
  }

  if (elements.modalQtyMinus) {
    elements.modalQtyMinus.addEventListener('click', () => {
      if (state.quickViewQty > 1) {
        state.quickViewQty -= 1;
        elements.modalQtyValue.textContent = state.quickViewQty;
      }
    });
  }

  if (elements.modalQtyPlus) {
    elements.modalQtyPlus.addEventListener('click', () => {
      const max = state.activeQuickViewProduct ? state.activeQuickViewProduct.stock_quantity : 99;
      if (state.quickViewQty < max) {
        state.quickViewQty += 1;
        elements.modalQtyValue.textContent = state.quickViewQty;
      } else {
        showToast(`Maximum available stock reached (${max})`, '⚠️');
      }
    });
  }

  if (elements.modalBtnAddToCart) {
    elements.modalBtnAddToCart.addEventListener('click', () => {
      if (state.activeQuickViewProduct) {
        addToCart(state.activeQuickViewProduct, state.quickViewQty);
        closeQuickView();
      }
    });
  }

  // Checkout Modal Controls
  if (elements.btnOpenCheckout) {
    elements.btnOpenCheckout.addEventListener('click', () => {
      closeCartDrawer();
      const totalAmount = elements.cartTotal ? elements.cartTotal.textContent : '₹0.00';
      if (elements.checkoutPayableTotal) elements.checkoutPayableTotal.textContent = totalAmount;
      if (elements.checkoutModal) elements.checkoutModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  }

  if (elements.btnCloseCheckoutModal) {
    elements.btnCloseCheckoutModal.addEventListener('click', () => {
      if (elements.checkoutModal) elements.checkoutModal.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  if (elements.checkoutForm) {
    elements.checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btnPlaceOrder');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing Order...';
      }

      try {
        const custAddress = (document.getElementById('custAddress')?.value || '').trim();
        const payload = {
          shipping_address: custAddress,
          items: state.cart.map(i => ({ product_id: i.product_id, quantity: i.quantity }))
        };

        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || 'Checkout failed.');
        }

        if (elements.confirmedOrderId) {
          elements.confirmedOrderId.textContent = `#ORD-${data.order_id}`;
        }

        // Reset cart and reload updated products/stock
        state.cart = [];
        saveCart();
        loadProducts();

        if (elements.checkoutModal) elements.checkoutModal.classList.remove('active');
        if (elements.orderSuccessModal) elements.orderSuccessModal.classList.add('active');
      } catch (err) {
        showToast(err.message || 'Failed to place order', '⚠️');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm & Place Order';
        }
      }
    });
  }

  if (elements.btnContinueShopping) {
    elements.btnContinueShopping.addEventListener('click', () => {
      if (elements.orderSuccessModal) elements.orderSuccessModal.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  // Fetch Categories from Backend API
  async function loadCategories() {
    try {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Failed to load categories');
      state.categories = await res.json();
      renderCategoryPills();
    } catch (err) {
      console.warn('Categories API unavailable:', err.message);
    }
  }

  // Render Category Filter Pills
  function renderCategoryPills() {
    if (!elements.categoryPillsContainer) return;
    elements.categoryPillsContainer.innerHTML = `
      <button type="button" class="category-pill ${state.activeCategory === 'all' ? 'active' : ''}" data-category="all">
        All Products
      </button>
    `;

    state.categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `category-pill ${state.activeCategory === String(cat.category_id) ? 'active' : ''}`;
      btn.setAttribute('data-category', String(cat.category_id));
      btn.textContent = cat.category_name;
      elements.categoryPillsContainer.appendChild(btn);
    });
  }

  // Handle Category Filter Click
  if (elements.categoryPillsContainer) {
    elements.categoryPillsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.category-pill');
      if (!btn) return;

      const catId = btn.getAttribute('data-category');
      state.activeCategory = catId;

      document.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      loadProducts();
    });
  }

  // Fetch Products from Backend API
  async function loadProducts() {
    if (elements.resultsCountLabel) elements.resultsCountLabel.textContent = 'Updating...';

    try {
      const params = new URLSearchParams();
      if (state.searchQuery && state.searchQuery.trim()) {
        params.append('search', state.searchQuery.trim());
      }
      if (state.activeCategory && state.activeCategory !== 'all') {
        params.append('category', state.activeCategory);
      }

      const url = `/api/products?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      state.products = data.products || [];

      sortAndRenderProducts();
    } catch (err) {
      console.error('Failed to load products:', err);
      if (elements.productsGrid) {
        elements.productsGrid.innerHTML = `
          <div class="empty-catalog">
            <div class="empty-catalog-icon">⚠️</div>
            <h2>Unable to load products</h2>
            <p>Please check your network connection or server status.</p>
            <button type="button" class="btn-reset-filters" id="btnRetryLoad">Retry</button>
          </div>
        `;
        document.getElementById('btnRetryLoad')?.addEventListener('click', loadProducts);
      }
    }
  }

  // Sort and Render Products
  function sortAndRenderProducts() {
    let list = [...state.products];

    // Apply Sorting
    if (state.sortBy === 'price-asc') {
      list.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    } else if (state.sortBy === 'price-desc') {
      list.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    } else if (state.sortBy === 'name-asc') {
      list.sort((a, b) => a.product_name.localeCompare(b.product_name));
    }

    if (elements.resultsCountLabel) {
      elements.resultsCountLabel.textContent = `${list.length} item${list.length === 1 ? '' : 's'} available`;
    }

    if (!elements.productsGrid) return;

    if (list.length === 0) {
      elements.productsGrid.innerHTML = `
        <div class="empty-catalog">
          <div class="empty-catalog-icon">🔍</div>
          <h2>No matching products found</h2>
          <p>Try searching for different keywords or clear the category filters.</p>
          <button type="button" class="btn-reset-filters" id="btnClearAllFilters">Reset All Filters</button>
        </div>
      `;
      document.getElementById('btnClearAllFilters')?.addEventListener('click', () => {
        state.searchQuery = '';
        state.activeCategory = 'all';
        if (elements.storeSearchInput) elements.storeSearchInput.value = '';
        if (elements.btnClearSearch) elements.btnClearSearch.style.display = 'none';
        renderCategoryPills();
        loadProducts();
      });
      return;
    }

    elements.productsGrid.innerHTML = '';

    list.forEach(p => {
      const stock = Number(p.stock_quantity) || 0;
      let stockBadgeHtml = '';
      if (stock <= 5) {
        stockBadgeHtml = `<span class="badge-stock stock-low">Only ${stock} left</span>`;
      } else {
        stockBadgeHtml = `<span class="badge-stock stock-in">In Stock</span>`;
      }

      const card = document.createElement('article');
      card.className = 'product-card';
      card.innerHTML = `
        <div class="product-image-container" data-id="${p.product_id}">
          <img 
            src="${p.image || p.image_url || 'images/headphones.jpg'}" 
            alt="${p.product_name}" 
            class="product-image"
            loading="lazy"
            onerror="this.src='images/headphones.jpg'"
          >
          ${stockBadgeHtml}
        </div>
        <div class="product-body">
          <div class="product-meta-row">
            <span class="product-category-tag">${p.category_name || 'Marketplace'}</span>
          </div>
          <h3 class="product-title" data-id="${p.product_id}" title="${p.product_name}">
            ${p.product_name}
          </h3>
          <p class="product-desc" title="${p.description || ''}">
            ${p.description || 'Premium quality product verified by GoodsPlatz marketplace standards.'}
          </p>
          <div class="product-card-footer">
            <div class="product-price-box">
              <span class="price-currency">Price</span>
              <span class="product-price">${formatCurrency(p.price)}</span>
            </div>
            <button 
              type="button" 
              class="btn-add-cart" 
              data-id="${p.product_id}" 
              ${stock <= 0 ? 'disabled' : ''}
              aria-label="Add ${p.product_name} to cart"
            >
              <span>🛒</span>
              <span>Add</span>
            </button>
          </div>
        </div>
      `;
      elements.productsGrid.appendChild(card);
    });
  }

  // Product Grid Click Handler (Delegated for Quick View & Add to Cart)
  if (elements.productsGrid) {
    elements.productsGrid.addEventListener('click', (e) => {
      const addBtn = e.target.closest('.btn-add-cart');
      if (addBtn) {
        const id = parseInt(addBtn.getAttribute('data-id'), 10);
        const prod = state.products.find(p => p.product_id === id);
        if (prod) addToCart(prod, 1);
        return;
      }

      const cardTrigger = e.target.closest('.product-image-container, .product-title');
      if (cardTrigger) {
        const id = parseInt(cardTrigger.getAttribute('data-id'), 10);
        const prod = state.products.find(p => p.product_id === id);
        if (prod) openQuickView(prod);
      }
    });
  }

  // Search Input with Debounce
  let searchDebounceTimeout = null;
  if (elements.storeSearchInput) {
    elements.storeSearchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      state.searchQuery = val;

      if (elements.btnClearSearch) {
        elements.btnClearSearch.style.display = val.length > 0 ? 'block' : 'none';
      }

      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = setTimeout(() => {
        loadProducts();
      }, 250);
    });
  }

  if (elements.btnClearSearch) {
    elements.btnClearSearch.addEventListener('click', () => {
      if (elements.storeSearchInput) elements.storeSearchInput.value = '';
      elements.btnClearSearch.style.display = 'none';
      state.searchQuery = '';
      loadProducts();
    });
  }

  // Sort Dropdown
  if (elements.sortSelect) {
    elements.sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      sortAndRenderProducts();
    });
  }

  // Initial Load
  function init() {
    updateCartUI();
    loadCategories();
    loadProducts();
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
  }
})();
