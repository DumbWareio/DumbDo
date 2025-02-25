const { auth } = require('express-openid-connect');
const dotenv = require('dotenv');

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'SESSION_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.warn(`Warning: Missing required environment variables: ${missingVars.join(', ')}`);
    console.warn('OIDC authentication will be disabled. Only PIN authentication will work.');
}

// Extract domain from BASE_URL for cookie settings
let cookieDomain;
if (process.env.NODE_ENV === 'production' && process.env.BASE_URL) {
    try {
        const url = new URL(process.env.BASE_URL);
        // Extract domain and add a dot prefix for subdomain support
        cookieDomain = url.hostname;
        console.log(`Cookie domain set to: ${cookieDomain}`);
    } catch (error) {
        console.warn(`Failed to parse BASE_URL: ${process.env.BASE_URL}`, error);
    }
}

const config = {
    authRequired: false,
    auth0Logout: true,
    baseURL: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
    clientID: process.env.OIDC_CLIENT_ID,
    issuerBaseURL: process.env.OIDC_ISSUER_URL,
    secret: process.env.SESSION_SECRET,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    routes: {
        login: false,
        callback: '/auth/callback',
        postLogoutRedirect: '/'
    },
    authorizationParams: {
        response_type: 'code',
        scope: 'openid profile email',
        audience: process.env.OIDC_AUDIENCE
    },
    session: {
        absoluteDuration: 24 * 60 * 60, // 24 hours
        cookie: {
            domain: cookieDomain,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax'
        }
    },
    idpLogout: true, // Enables logout from identity provider
    attemptSilentLogin: true // Try silent login if session exists
};

// Create middleware with error handling
const createOidcMiddleware = () => {
    if (missingVars.length > 0) {
        // Return a pass-through middleware if OIDC is not configured
        return (req, res, next) => {
            req.oidc = { 
                isAuthenticated: () => false,
                user: null,
                login: () => res.redirect('/login')
            };
            next();
        };
    }
    
    try {
        const middleware = auth(config);
        return (req, res, next) => {
            middleware(req, res, (err) => {
                if (err) {
                    console.error('OIDC Middleware Error:', err);
                    // Initialize default oidc object on error
                    req.oidc = {
                        isAuthenticated: () => false,
                        user: null,
                        login: () => res.redirect('/login')
                    };
                }
                next(err);
            });
        };
    } catch (error) {
        console.error('Failed to initialize OIDC middleware:', error);
        // Return a pass-through middleware on error
        return (req, res, next) => {
            req.oidc = { 
                isAuthenticated: () => false,
                user: null,
                login: () => res.redirect('/login')
            };
            next();
        };
    }
};

const oidcMiddleware = createOidcMiddleware();

// Enhanced requiresAuth middleware with proper error handling
const requiresAuth = (req, res, next) => {
    try {
        if (!req.oidc) {
            console.error('OIDC middleware not properly initialized');
            return res.status(401).json({ 
                error: 'Authentication required',
                loginUrl: '/login'
            });
        }

        if (!req.oidc.isAuthenticated()) {
            return res.status(401).json({ 
                error: 'Authentication required',
                loginUrl: '/login'
            });
        }

        next();
    } catch (error) {
        console.error('Authentication middleware error:', error);
        res.status(401).json({ 
            error: 'Authentication required',
            loginUrl: '/login',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    oidcMiddleware,
    requiresAuth
}; 