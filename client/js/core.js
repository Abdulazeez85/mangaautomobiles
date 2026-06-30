// ═══════════════════════════════════════════════════════
//  MANGA AUTOS — Core JS v2
// ═══════════════════════════════════════════════════════

// ── Formatting ─────────────────────────────────────────
function formatPrice(n) {
  const num = Number(n);
  if (num >= 1_000_000_000) return '₦' + (num / 1_000_000_000).toFixed(2) + 'B';
  if (num >= 1_000_000)     return '₦' + (num / 1_000_000).toFixed(1) + 'M';
  return '₦' + num.toLocaleString('en-NG');
}

function formatMileage(n) {
  return Number(n).toLocaleString('en-NG') + ' km';
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── API helpers ────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = sessionStorage.getItem('admin_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Toast ──────────────────────────────────────────────
function getToastContainer() {
  let el = document.getElementById('toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    document.body.appendChild(el);
  }
  return el;
}

function showToast(message, type = 'info', duration = 4000) {
  const container = getToastContainer();
  const icons = { success: '✓', error: '✕', info: '●' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || '●'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ── Vehicle card builder ───────────────────────────────
function buildVehicleCard(v) {
  const img = v.images && v.images [0] || 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80';
  const badges = [];
  if (v.sold) badges.push(`<span class="vehicle-badge badge-sold">Sold</span>`);
  else if (v.featured) badges.push(`<span class="vehicle-badge badge-featured">Featured</span>`);

  const card = document.createElement('div');
  card.className = 'card vehicle-card fade-in';
  card.innerHTML = `
    <div class="vehicle-img-wrap">
      <img src="${img}" alt="${v.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80'">
      ${badges.join('')}
    </div>
    <div class="vehicle-body">
      <div class="vehicle-brand">${v.brand}</div>
      <div class="vehicle-name">${v.model} ${v.year}</div>
      <div class="vehicle-specs">
        <span class="spec-chip">${v.year}</span>
        <span class="spec-chip">${v.fuelType || 'Petrol'}</span>
        <span class="spec-chip">${v.transmission || 'Automatic'}</span>
        <span class="spec-chip">${v.condition || 'Foreign Used'}</span>
        ${v.mileage ? `<span class="spec-chip">${formatMileage(v.mileage)}</span>` : ''}
      </div>
      <div class="vehicle-price-row">
        <div>
          <div class="vehicle-price">${formatPrice(v.price)}</div>
          <div class="vehicle-price-sub">Negotiable · ${v.location || 'Abuja'}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window.location.href='/details?id=${v.id}'">View</button>
      </div>
    </div>`;
  card.addEventListener('click', () => window.location.href = `/details?id=${v.id}`);
  return card;
}

// ── Navbar ─────────────────────────────────────────────
function initNavbar() {
  const nav = document.querySelector('.navbar');
  const burger = document.querySelector('.nav-burger');
  const mobileNav = document.querySelector('.nav-mobile');
  if (!nav) return;

  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
  nav.classList.toggle('scrolled', window.scrollY > 60);

  if (burger && mobileNav) {
    burger.addEventListener('click', () => mobileNav.classList.toggle('open'));
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileNav.classList.remove('open')));
  }

  // Mark active link
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a, .nav-mobile a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (href !== '/' && path.startsWith(href))) {
      a.classList.add('active');
    }
  });
}

// ── Loan calculator ────────────────────────────────────
function initCalculator() {
  const priceInput    = document.getElementById('calc-price');
  const downInput     = document.getElementById('calc-down');
  const rateInput     = document.getElementById('calc-rate');
  const tenureInput   = document.getElementById('calc-tenure');
  const downVal       = document.getElementById('calc-down-val');
  const rateVal       = document.getElementById('calc-rate-val');
  const tenureVal     = document.getElementById('calc-tenure-val');
  const resultEl      = document.getElementById('calc-result');
  const totalEl       = document.getElementById('calc-total');
  const interestEl    = document.getElementById('calc-interest');
  const loanAmtEl     = document.getElementById('calc-loan-amount');

  if (!priceInput) return;

  function calc() {
    const price     = parseFloat(priceInput.value) || 0;
    const downPct   = parseFloat(downInput.value) || 20;
    const tenure    = parseInt(tenureInput.value) || 48;
    const rate     = parseFloat(rateInput.value) || 15;

    if (downVal) downVal.textContent = downPct + '%';
    if (rateVal) rateVal.textContent = rate + '%';
    if (tenureVal) tenureVal.textContent = tenure + ' mo';

    const down    = price * (downPct / 100);
    const loan    = price - down;
    const monthly = rate / 100 / 12;
    const payment = loan > 0 && monthly > 0
      ? loan * (monthly * Math.pow(1 + monthly, tenure)) / (Math.pow(1 + monthly, tenure) - 1)
      : 0;
    const total    = payment * tenure;
    const interest = total - loan;

    if (resultEl)   resultEl.textContent  = formatPrice(Math.round(payment));
    if (totalEl)    totalEl.textContent   = formatPrice(Math.round(total));
    if (interestEl) interestEl.textContent = formatPrice(Math.round(interest));
    if (loanAmtEl)  loanAmtEl.textContent  = formatPrice(Math.round(loan));
  }

  [priceInput, downInput, rateInput, tenureInput].forEach(el => el && el.addEventListener('input', calc));
  calc();
}

// ── Booking form ───────────────────────────────────────
function initBookingForm() {
  const form = document.getElementById('booking-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const data = Object.fromEntries(new FormData(form));
    btn.textContent = 'Submitting…'; btn.disabled = true;
    try {
      await apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify(data) });
      showToast('Booking submitted! We will contact you shortly.', 'success');
      form.reset();
    } catch (err) {
      showToast(err.message || 'Submission failed. Please try again.', 'error');
    } finally {
      btn.textContent = 'Book Appointment'; btn.disabled = false;
    }
  });
}

// ── Testimonials loader ────────────────────────────────
async function loadTestimonials(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  try {
    const data = await apiFetch('/api/testimonials');
    container.innerHTML = '';
    data.forEach(t => {
      const stars = '★'.repeat(t.rating || 5);
      const initials = t.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const card = document.createElement('div');
      card.className = 'testimonial-card fade-in';
      card.innerHTML = `
        <div class="testimonial-stars">${stars}</div>
        <p class="testimonial-text">"${t.text}"</p>
        <div class="testimonial-author">
          <div class="testimonial-avatar">${initials}</div>
          <div>
            <div class="testimonial-name">${t.name}</div>
            <div class="testimonial-role">${t.role || ''}</div>
            ${t.vehicle ? `<div class="testimonial-vehicle">${t.vehicle}</div>` : ''}
          </div>
        </div>`;
      container.appendChild(card);
    });
  } catch (e) {
    console.warn('Could not load testimonials', e);
  }
}

// ── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initCalculator();
  initBookingForm();
});
