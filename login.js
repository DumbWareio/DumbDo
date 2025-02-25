// DOM Elements
const pinInputs = [...document.querySelectorAll('.pin-input')];
const pinError = document.getElementById('pinError');
const themeToggle = document.getElementById('themeToggle');
const oidcLoginBtn = document.getElementById('oidcLoginBtn');
const pinSection = document.getElementById('pinSection');
let currentAttempts = 5;

// Theme Management
function updateThemeIcons() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    moonIcon.style.display = isDark ? 'none' : 'block';
    sunIcon.style.display = isDark ? 'block' : 'none';
}

// Initialize theme icons
updateThemeIcons();

themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcons();
});

async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth-status');
        const data = await response.json();
        
        if (data.isAuthenticated) {
            window.location.replace('/');
            return true;
        }
        
        // Show PIN section if enabled
        if (data.pinEnabled) {
            pinSection.style.display = 'block';
        }
        
        return false;
    } catch (error) {
        console.error('Failed to check auth status:', error);
        return false;
    }
}

// OIDC Login handler
oidcLoginBtn.addEventListener('click', async () => {
    try {
        window.location.href = '/auth/login';
    } catch (error) {
        console.error('OIDC login failed:', error);
        pinError.textContent = 'OIDC login failed. Please try PIN authentication or try again later.';
    }
});

function setupPinAuth() {
    pinInputs.forEach((input, index) => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                if (input.value === '') {
                    if (index > 0) {
                        pinInputs[index - 1].focus();
                        pinInputs[index - 1].value = '';
                    }
                } else {
                    input.value = '';
                }
                e.preventDefault();
            }
        });

        input.addEventListener('input', (e) => {
            const value = e.target.value;
            pinError.textContent = '';
            
            if (value.length === 1) {
                if (index < pinInputs.length - 1) {
                    pinInputs[index + 1].focus();
                } else {
                    const pin = pinInputs.map(input => input.value).join('');
                    verifyPin(pin);
                }
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').slice(0, 4);
            if (/^\d+$/.test(pastedData)) {
                pastedData.split('').forEach((digit, i) => {
                    if (i < pinInputs.length) {
                        pinInputs[i].value = digit;
                    }
                });
                if (pastedData.length === 4) {
                    verifyPin(pastedData);
                }
            }
        });
    });
}

async function verifyPin(pin) {
    try {
        const response = await fetch('/api/verify-pin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pin })
        });

        const data = await response.json();

        if (response.ok && data.valid) {
            window.location.replace('/');
            return;
        }

        currentAttempts--;
        if (currentAttempts <= 0) {
            pinError.textContent = 'Too many attempts. Please try again later or use OIDC login.';
            pinInputs.forEach(input => {
                input.disabled = true;
            });
        } else {
            pinError.textContent = `Invalid PIN. ${currentAttempts} attempts remaining.`;
            pinInputs.forEach(input => input.value = '');
            pinInputs[0].focus();
        }
    } catch (error) {
        console.error('Error:', error);
        pinError.textContent = 'An error occurred. Please try again.';
    }
}

function setupTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    const currentTheme = localStorage.getItem('theme') || (prefersDark.matches ? 'dark' : 'light');

    document.documentElement.setAttribute('data-theme', currentTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) {
        setupPinAuth();
        setupTheme();
    }
}); 