require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { oidcMiddleware, requiresAuth } = require('./middleware/auth');
const app = express();
const port = process.env.PORT || 3000;

// Environment variables
const PIN = process.env.DUMBDO_PIN;
const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 10;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(oidcMiddleware);

// Serve static files
app.use(express.static('public'));
app.use(express.static('.'));

// Authentication routes
app.get('/login', (req, res) => {
    if (req.oidc && req.oidc.isAuthenticated()) {
        return res.redirect('/');
    }

    // If it's an API request expecting JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({
            error: 'Authentication required',
            loginUrl: '/auth/login'
        });
    }

    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/auth/login', (req, res) => {
    if (req.oidc && req.oidc.isAuthenticated()) {
        return res.redirect('/');
    }
    
    try {
        req.oidc.login({
            returnTo: '/',
            authorizationParams: {
                prompt: 'login'
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.redirect('/login');
    }
});

app.get('/auth/callback', (req, res) => {
    // This route will be handled by the OIDC middleware
    // After successful authentication, redirect to home
    res.redirect('/');
});

app.get('/logout', (req, res) => {
    if (req.oidc) {
        try {
            return req.oidc.logout({
                returnTo: process.env.BASE_URL
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
    
    // Fallback logout
    res.clearCookie('appSession');
    res.clearCookie('DUMBDO_PIN');
    res.redirect('/login');
});

// API Routes
app.get('/api/auth-status', (req, res) => {
    res.json({
        isAuthenticated: req.oidc ? req.oidc.isAuthenticated() : false,
        user: req.oidc ? req.oidc.user : null,
        pinEnabled: !!PIN
    });
});

// Protected API routes
app.get('/api/user', requiresAuth, (req, res) => {
    if (!req.oidc || !req.oidc.user) {
        return res.status(401).json({ 
            error: 'Not authenticated',
            loginUrl: '/login'
        });
    }
    
    res.json({
        email: req.oidc.user.email,
        name: req.oidc.user.name,
        picture: req.oidc.user.picture
    });
});

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
            res.cookie('DUMBDO_PIN', pin, {
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

// Serve static files that don't need PIN protection
app.get('/login.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.js'));
});

app.get('/styles.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'styles.css'));
});

app.get('/favicon.svg', (req, res) => {
    res.sendFile(path.join(__dirname, 'favicon.svg'));
});

// PIN validation helper
function isValidPin(providedPin) {
    return !PIN || (providedPin && secureCompare(providedPin, PIN));
}

// PIN validation middleware - everything after this requires PIN
app.use((req, res, next) => {
    // Skip PIN validation if user is authenticated via OIDC
    if (req.oidc && req.oidc.isAuthenticated()) {
        return next();
    }
    
    const providedPin = req.cookies.DUMBDO_PIN || req.headers['x-pin'];
    
    if (isValidPin(providedPin)) {
        return next();
    }

    // For API requests
    if (req.xhr || req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ 
            error: 'Authentication required',
            loginUrl: '/login'
        });
    }
    
    // For regular requests
    if (req.path !== '/login' && !req.path.startsWith('/auth/')) {
        return res.redirect('/login');
    }
    
    next();
});

// Protected routes below
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    const providedPin = req.cookies.DUMBDO_PIN || req.headers['x-pin'];
    
    if (isValidPin(providedPin)) {
        res.redirect('/');
    } else {
        res.sendFile(path.join(__dirname, 'login.html'));
    }
});

// Data directory and file path
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'todos.json');

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
    
    console.log('Todo list stored at:', DATA_FILE);
}

// Protected API routes
app.get('/api/todos', requiresAuth, async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading todos:', error);
        res.status(500).json({ error: 'Failed to read todos' });
    }
});

app.post('/api/todos', requiresAuth, async (req, res) => {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving todos:', error);
        res.status(500).json({ error: 'Failed to save todos' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize and start server
initDataFile().then(() => {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
        console.log('PIN protection:', PIN ? 'enabled' : 'disabled');
    });
}); 