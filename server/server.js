require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const fsP = require('fs').promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Admin token guard ──────────────────────────────────────────────────────────
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
  console.error('\n❌  ERROR: ADMIN_TOKEN environment variable is required.');
  console.error('   Create a .env file with: ADMIN_TOKEN=your_secret_token\n');
  process.exit(1);
}

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'manga-autos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, quality: 'auto', fetch_format: 'auto' }],
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../client')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Auth helpers ───────────────────────────────────────────────────────────────
function getToken(req) {
  const auth = req.headers['authorization'] || '';
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  const query = (req.query.admin_token || req.query.token || '').trim();
  const cookie = (req.headers.cookie || '').split(';')
    .map(c => c.trim()).find(c => c.startsWith('admin_token='));
  const cookieVal = cookie ? cookie.split('=')[1] : '';
  return bearer || query || cookieVal;
}

function requireAdmin(req, res, next) {
  if (getToken(req) !== ADMIN_TOKEN)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function isAdmin(req) { return getToken(req) === ADMIN_TOKEN; }

// ── Data helpers ───────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const dataPath = (file) => path.join(DATA_DIR, file);

async function readData(file) {
  try {
    const raw = await fsP.readFile(dataPath(file), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function writeData(file, data) {
  await fsP.writeFile(dataPath(file), JSON.stringify(data, null, 2), 'utf8');
}

// ── Validators ─────────────────────────────────────────────────────────────────
function validateVehicle(p) {
  const e = [];
  if (!p) return ['payload required'];
  if (!p.brand || typeof p.brand !== 'string') e.push('brand required');
  if (!p.model || typeof p.model !== 'string') e.push('model required');
  if (p.price === undefined || isNaN(Number(p.price))) e.push('price must be a number');
  if (p.year && isNaN(parseInt(p.year, 10))) e.push('year must be a number');
  return e;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const raw = String(phone).replace(/[^0-9+]/g, '');
  let d = raw.replace(/^\+/, '');
  if (d.startsWith('234')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  if (!/^\d{10}$/.test(d)) return null;
  return '+234' + d;
}

function validateBooking(p) {
  const e = [];
  if (!p) return ['payload required'];
  if (!p.name || typeof p.name !== 'string') e.push('name required');
  if (!p.phone) {
    e.push('phone required');
  } else {
    const n = normalizePhone(p.phone);
    if (!n) e.push('phone format invalid (use Nigerian number e.g. 08012345678)');
    else p.phone_e164 = n;
  }
  return e;
}

// ── IMAGE UPLOAD ───────────────────────────────────────────────────────────────
app.post('/api/upload', requireAdmin, upload.array('images', 10), (req, res) => {
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ error: 'No files uploaded' });
  const urls = req.files.map(f => `/uploads/${f.filename}`);
  res.json({ urls });
});

// ── VEHICLE ROUTES ─────────────────────────────────────────────────────────────
app.get('/api/vehicles', async (req, res) => {
  try {
    let vehicles = await readData('vehicles.json');
    const {
      brand, minPrice, maxPrice, year, minYear, maxYear,
      fuelType, transmission, condition, search, sort,
      page = 1, limit = 12, featured,
    } = req.query;

    const arr = (v) => Array.isArray(v) ? v : v ? [v] : [];
    const brands = arr(brand), conditions = arr(condition),
      fuels = arr(fuelType), transmissions = arr(transmission);

    if (brands.length) vehicles = vehicles.filter(v =>
      brands.some(b => v.brand?.toLowerCase() === b.toLowerCase()));
    if (fuels.length) vehicles = vehicles.filter(v =>
      fuels.some(f => v.fuelType?.toLowerCase() === f.toLowerCase()));
    if (transmissions.length) vehicles = vehicles.filter(v =>
      transmissions.some(t => v.transmission?.toLowerCase() === t.toLowerCase()));
    if (conditions.length) vehicles = vehicles.filter(v =>
      conditions.some(c => v.condition?.toLowerCase() === c.toLowerCase()));
    if (year) vehicles = vehicles.filter(v => v.year === parseInt(year, 10));
    if (minYear) vehicles = vehicles.filter(v => v.year >= parseInt(minYear, 10));
    if (maxYear) vehicles = vehicles.filter(v => v.year <= parseInt(maxYear, 10));
    if (minPrice) vehicles = vehicles.filter(v => v.price >= Number(minPrice));
    if (maxPrice) vehicles = vehicles.filter(v => v.price <= Number(maxPrice));
    if (featured === 'true') vehicles = vehicles.filter(v => v.featured);
    if (search) {
      const q = search.toLowerCase();
      vehicles = vehicles.filter(v =>
        (v.name || '').toLowerCase().includes(q) ||
        (v.brand || '').toLowerCase().includes(q) ||
        (v.model || '').toLowerCase().includes(q));
    }

    if (sort === 'price_asc') vehicles.sort((a, b) => a.price - b.price);
    else if (sort === 'price_desc') vehicles.sort((a, b) => b.price - a.price);
    else if (sort === 'year_desc') vehicles.sort((a, b) => b.year - a.year);
    else if (sort === 'views') vehicles.sort((a, b) => (b.views || 0) - (a.views || 0));
    else vehicles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const pg = Math.max(1, parseInt(page, 10) || 1);
    const sz = Math.max(1, Math.min(50, parseInt(limit, 10) || 12));
    const total = vehicles.length;
    const totalPages = Math.max(1, Math.ceil(total / sz));
    const start = (pg - 1) * sz;

    res.json({ vehicles: vehicles.slice(start, start + sz), total, totalPages, currentPage: pg });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/vehicles/:id', async (req, res) => {
  try {
    const vehicles = await readData('vehicles.json');
    const v = vehicles.find(v => v.id === req.params.id);
    if (!v) return res.status(404).json({ error: 'Vehicle not found' });

    // increment views
    v.views = (v.views || 0) + 1;
    await writeData('vehicles.json', vehicles);

    res.json(v);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/vehicles', requireAdmin, async (req, res) => {
  try {
    const errors = validateVehicle(req.body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    const vehicles = await readData('vehicles.json');
    const vehicle = {
      id: 'v' + Date.now(),
      name: `${req.body.brand} ${req.body.model}`,
      ...req.body,
      price: Number(req.body.price),
      year: parseInt(req.body.year, 10) || new Date().getFullYear(),
      views: 0,
      createdAt: new Date().toISOString(),
    };
    vehicles.push(vehicle);
    await writeData('vehicles.json', vehicles);
    res.status(201).json(vehicle);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/vehicles/:id', requireAdmin, async (req, res) => {
  try {
    const errors = validateVehicle(req.body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    const vehicles = await readData('vehicles.json');
    const idx = vehicles.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Vehicle not found' });
    vehicles[idx] = {
      ...vehicles[idx],
      ...req.body,
      price: Number(req.body.price),
      year: parseInt(req.body.year, 10) || vehicles[idx].year,
      name: `${req.body.brand} ${req.body.model}`,
      updatedAt: new Date().toISOString(),
    };
    await writeData('vehicles.json', vehicles);
    res.json(vehicles[idx]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/vehicles/:id', requireAdmin, async (req, res) => {
  try {
    let vehicles = await readData('vehicles.json');
    const before = vehicles.length;
    vehicles = vehicles.filter(v => v.id !== req.params.id);
    if (vehicles.length === before) return res.status(404).json({ error: 'Vehicle not found' });
    await writeData('vehicles.json', vehicles);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── BOOKING ROUTES ─────────────────────────────────────────────────────────────
app.post('/api/bookings', async (req, res) => {
  try {
    const errors = validateBooking(req.body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    const bookings = await readData('bookings.json');
    const booking = {
      id: 'b' + Date.now(),
      ...req.body,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    bookings.push(booking);
    await writeData('bookings.json', bookings);
    res.status(201).json({ success: true, bookingId: booking.id });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/bookings', requireAdmin, async (req, res) => {
  try {
    const bookings = await readData('bookings.json');
    res.json(bookings);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/bookings/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const bookings = await readData('bookings.json');
    const idx = bookings.findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Booking not found' });
    bookings[idx].status = status;
    bookings[idx].updatedAt = new Date().toISOString();
    await writeData('bookings.json', bookings);
    res.json(bookings[idx]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/bookings/:id', requireAdmin, async (req, res) => {
  try {
    let bookings = await readData('bookings.json');
    bookings = bookings.filter(b => b.id !== req.params.id);
    await writeData('bookings.json', bookings);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── TESTIMONIALS ───────────────────────────────────────────────────────────────
app.get('/api/testimonials', async (req, res) => {
  try { res.json(await readData('testimonials.json')); }
  catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/testimonials', requireAdmin, async (req, res) => {
  try {
    const { name, role, location, rating, text, vehicle } = req.body;
    if (!name || !text) return res.status(400).json({ error: 'name and text required' });
    const testimonials = await readData('testimonials.json');
    const t = {
      id: 't' + Date.now(),
      name, role, location,
      rating: parseInt(rating, 10) || 5,
      text, vehicle,
      date: new Date().toISOString().split('T')[0],
      verified: true,
    };
    testimonials.push(t);
    await writeData('testimonials.json', testimonials);
    res.status(201).json(t);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/testimonials/:id', requireAdmin, async (req, res) => {
  try {
    let t = await readData('testimonials.json');
    t = t.filter(x => x.id !== req.params.id);
    await writeData('testimonials.json', t);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── STATS ──────────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [vehicles, bookings] = await Promise.all([
      readData('vehicles.json'), readData('bookings.json')
    ]);
    res.json({
      totalVehicles: vehicles.length,
      carsAvailable: vehicles.filter(v => !v.sold).length,
      pendingBookings: bookings.filter(b => b.status === 'pending').length,
      totalBookings: bookings.length,
      yearsFounded: new Date().getFullYear() - 2018,
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── ADMIN AUTH CHECK ───────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { token } = req.body;
  if (token === ADMIN_TOKEN) {
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ valid: true });
});

// ── HTML PAGES ─────────────────────────────────────────────────────────────────
const page = (name) => (req, res) =>
  res.sendFile(path.join(__dirname, `../client/${name}.html`));

app.get('/', page('index'));
app.get('/inventory', page('inventory'));
app.get('/details', page('details'));
app.get('/about', page('about'));
app.get('/contact', page('contact'));
app.get('/admin/login', page('admin-login'));
app.get('/admin', (req, res) => {
  if (isAdmin(req)) return res.sendFile(path.join(__dirname, '../client/admin.html'));
  res.redirect('/admin/login');
});

// ── 404 ────────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '../client/404.html')));

// ── START ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n🚗  Manga Autos server started');
  console.log(`📍  Local:   http://localhost:${PORT}`);
  console.log(`🔐  Admin:   http://localhost:${PORT}/admin/login`);
  console.log(`📦  API:     http://localhost:${PORT}/api/vehicles\n`);
});
