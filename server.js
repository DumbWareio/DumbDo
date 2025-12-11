require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const app = express();
const { getCorsOptions, originValidationMiddleware } = require('./scripts/cors');
const { convertLogoToPng } = require('./scripts/convert-logo');
const { generatePWAManifest } = require('./scripts/pwa-manifest-generator');
const rateLimit = require('express-rate-limit');

// Create a rate limiter for API endpoints
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 120, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});


// Environment variables
const PORT = process.env.PORT || 3000;
const PIN = process.env.DUMBBIN_PIN;
const SITE_TITLE = process.env.DUMBBIN_SITE_TITLE || 'DumbBin';
const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 10;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ASSETS_DIR = path.join(PUBLIC_DIR, 'assets');

// Generate PWA assets
convertLogoToPng();
generatePWAManifest(SITE_TITLE);

// Trust proxy - required for secure cookies behind a reverse proxy
app.set('trust proxy', 1);

// Cors Setup
const corsOptions = getCorsOptions();

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Apply origin validation to all /api routes
app.use('/api', originValidationMiddleware);

// Brute force protection
const loginAttempts = new Map();  // Stores IP addresses and their attempt counts
const MAX_ATTEMPTS = 5;           // Maximum allowed attempts
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

// Reset attempts for an IP
function resetAttempts(ip) {
    loginAttempts.delete(ip);
}

// Check if an IP is locked out
function isLockedOut(ip) {
    const attempts = loginAttempts.get(ip);
    if (!attempts) return false;
    
    if (attempts.count >= MAX_ATTEMPTS) {
        const timeElapsed = Date.now() - attempts.lastAttempt;
        if (timeElapsed < LOCKOUT_TIME) {
            return true;
        }
        resetAttempts(ip);
    }
    return false;
}

// Record an attempt for an IP
function recordAttempt(ip) {
    const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    attempts.count += 1;
    attempts.lastAttempt = Date.now();
    loginAttempts.set(ip, attempts);
}

// Cleanup old lockouts periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, attempts] of loginAttempts.entries()) {
        if (now - attempts.lastAttempt >= LOCKOUT_TIME) {
            loginAttempts.delete(ip);
        }
    }
}, 60000); // Clean up every minute

// Constant-time string comparison
function secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    
    return crypto.timingSafeEqual(
        Buffer.from(a.padEnd(MAX_PIN_LENGTH, '0')), 
        Buffer.from(b.padEnd(MAX_PIN_LENGTH, '0'))
    );
}

// Public PIN Routes - these don't require authentication
app.get('/api/pin-required', (req, res) => {
    const lockoutTime = isLockedOut(req.ip);
    const attempts = loginAttempts.get(req.ip);
    const attemptsLeft = attempts ? MAX_ATTEMPTS - attempts.count : MAX_ATTEMPTS;
    
    res.json({ 
        required: !!PIN,
        length: PIN ? PIN.length : MIN_PIN_LENGTH,
        locked: isLockedOut(req.ip),
        attemptsLeft: Math.max(0, attemptsLeft),
        lockoutMinutes: lockoutTime ? Math.ceil((LOCKOUT_TIME - (Date.now() - attempts.lastAttempt)) / 1000 / 60) : 0
    });
});

app.post('/api/verify-pin', (req, res) => {
    const { pin } = req.body;
    const ip = req.ip;
    
    // Check if IP is locked out
    if (isLockedOut(ip)) {
        const attempts = loginAttempts.get(ip);
        const timeLeft = Math.ceil((LOCKOUT_TIME - (Date.now() - attempts.lastAttempt)) / 1000 / 60);
        return res.status(429).json({ 
            error: `Too many attempts. Please try again in ${timeLeft} minutes.`,
            locked: true,
            lockoutMinutes: timeLeft
        });
    }
    
    // Validate PIN length
    if (PIN && (pin.length < MIN_PIN_LENGTH || pin.length > MAX_PIN_LENGTH)) {
        recordAttempt(ip);
        const attempts = loginAttempts.get(ip);
        return res.status(401).json({ 
            valid: false,
            error: `PIN must be between ${MIN_PIN_LENGTH} and ${MAX_PIN_LENGTH} digits`,
            attemptsLeft: MAX_ATTEMPTS - attempts.count
        });
    }
    
    // Add artificial delay to further prevent timing attacks
    const delay = crypto.randomInt(50, 150);
    setTimeout(() => {
        if (!PIN || secureCompare(pin, PIN)) {
            // Reset attempts on successful login
            resetAttempts(ip);
            
            // Set secure cookie
            res.cookie('DUMBBIN_PIN', pin, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });
            
            res.json({ valid: true });
        } else {
            // Record failed attempt
            recordAttempt(ip);
            
            const attempts = loginAttempts.get(ip);
            const attemptsLeft = MAX_ATTEMPTS - attempts.count;
            
            res.status(401).json({ 
                valid: false,
                error: `Invalid PIN. ${attemptsLeft} attempts remaining before lockout.`,
                attemptsLeft
            });
        }
    }, delay);
});

// Get site configuration
app.get('/api/config', apiLimiter, (req, res) => {
    res.json({
        siteTitle: SITE_TITLE
    });
});

// Serve static files that don't need PIN protection
app.get('/login.js', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'login.js'));
});

app.get('/styles.css', (req, res) => {
    res.sendFile(path.join(ASSETS_DIR, 'styles.css'));
});

app.get('/favicon.svg', (req, res) => {
    res.sendFile(path.join(ASSETS_DIR, 'favicon.svg'));
});

// Serve the pwa/asset manifest
app.get('/asset-manifest.json', (req, res) => {
    // generated in pwa-manifest-generator and fetched from service-worker.js
    res.sendFile(path.join(ASSETS_DIR, 'asset-manifest.json'));
  });
app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(ASSETS_DIR, 'manifest.json'));
  });

// PIN validation helper
function isValidPin(providedPin) {
    return !PIN || (providedPin && secureCompare(providedPin, PIN));
}

// PIN validation middleware - everything after this requires PIN
app.use((req, res, next) => {
    const providedPin = req.cookies.DUMBBIN_PIN || req.headers['x-pin'];
    
    if (isValidPin(providedPin)) {
        return next();
    }

    if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Invalid PIN' });
    }
    
    if (req.path !== '/login') {
        return res.redirect('/login');
    }
    
    next();
});

// Protected routes below

app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/login', (req, res) => {
    const providedPin = req.cookies.DUMBBIN_PIN || req.headers['x-pin'];
    
    if (isValidPin(providedPin)) {
        res.redirect('/');
    } else {
        res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
    }
});

// Protect all other static files
app.use(express.static(PUBLIC_DIR));
app.use(express.static('.'));

// Data directory and file path
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'items.json');

// Ensure the data directory and file exist
async function initDataFile() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR);
    }
    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify({}));
    }
    // Remove completed property from all items if present
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        let items = {};
        try {
            items = JSON.parse(data);
        } catch {}
        if (items && typeof items === 'object') {
            let changed = false;
            Object.keys(items).forEach(list => {
                if (Array.isArray(items[list])) {
                    items[list] = items[list].map(item => {
                        if (item && typeof item === 'object' && 'completed' in item) {
                            changed = true;
                            const { completed, ...rest } = item;
                            return rest;
                        }
                        return item;
                    });
                }
            });
            if (changed) {
                await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2));
            }
        }
    } catch {}
    console.log('Pastebin stored at:', DATA_FILE);
}

// Ensure every item has a unique id (UUID)
function ensureItemIds(items) {
    let changed = false;
    Object.keys(items).forEach(list => {
        if (Array.isArray(items[list])) {
            items[list] = items[list].map(item => {
                if (item && typeof item === 'object') {
                    if (!item.id) {
                        changed = true;
                        return { ...item, id: crypto.randomUUID() };
                    }
                }
                return item;
            });
        }
    });
    return changed;
}

// Protected API routes
app.get('/api/items', apiLimiter, async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        let items = {};
        try {
            items = JSON.parse(data);
        } catch {}
        if (items && typeof items === 'object') {
            // Remove completed property and ensure id for all items
            let changed = false;
            Object.keys(items).forEach(list => {
                if (Array.isArray(items[list])) {
                    items[list] = items[list].map(item => {
                        if (item && typeof item === 'object') {
                          let newItem = { ...item };
                          if ('completed' in newItem) {
                            const { completed, ...rest } = newItem;
                            newItem = rest;
                        }
                        if (!newItem.id) {
                          newItem.id = crypto.randomUUID();
                          changed = true;
                        }
                        return newItem;
                        }
                        return item;
                    });
                }
            });
            if (changed) {
                await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2));
            }
        }
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read items' });
    }
});

app.post('/api/items', apiLimiter, async (req, res) => {
    try {
        let items = req.body;
        if (items && typeof items === 'object') {
            // Remove completed property and ensure id for all items
            let changed = false;
            Object.keys(items).forEach(list => {
                if (Array.isArray(items[list])) {
                    items[list] = items[list].map(item => {
                        if (item && typeof item === 'object') {
                          let newItem = { ...item };
                          if ('completed' in newItem) {
                            const { completed, ...rest } = newItem;
                            newItem = rest;
                        }
                        if (!newItem.id) {
                          newItem.id = crypto.randomUUID();
                          changed = true;
                        }
                        return newItem;
                        }
                        return item;
                    });
                }
            });
        }
        await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save items' });
    }
});

// API route to fetch a shared item by id
app.get('/api/shared/:id', apiLimiter, async (req, res) => {
    const { id } = req.params;
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        let items = {};
        try {
            items = JSON.parse(data);
        } catch {}
        if (items && typeof items === 'object') {
            for (const list of Object.values(items)) {
                if (Array.isArray(list)) {
                    const found = list.find(item => item && item.id === id && item.shared);
                    if (found) {
                        return res.json({ text: found.text });
                    }
                }
            }
        }
        res.status(404).json({ error: 'Item not found or not shared' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch shared item' });
    }
});

// Healthcheck endpoint
app.get('/api/status', apiLimiter, (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


// Initialize and start server
initDataFile().then(() => {
    app.listen(PORT, () => {
        console.log(`DumbBin server running at http://localhost:${PORT}`);
        console.log('PIN protection:', PIN ? 'enabled' : 'disabled');
    });
});