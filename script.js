// Supabase configuration - REPLACE THESE WITH YOUR ACTUAL VALUES
const SUPABASE_URL = 'https://bailbskrujksalxwnehh.supabase.co'; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWxic2tydWprc2FseHduZWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2ODgyODQsImV4cCI6MjA3NTI2NDI4NH0.gGi4rCMYNI1LqEJplZdVSI7gxc_wa0zxSv-5GeUtqWQ'; // Replace with your Supabase anon key

// Initialize Supabase client (we'll load this from CDN)
let supabase;

// Load Supabase library
(function() {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = function() {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase initialized');
    };
    document.head.appendChild(script);
})();

// Get form elements
const subscribeForm = document.getElementById('subscribeForm');
const emailInput = document.getElementById('emailInput');
const subscribeBtn = document.getElementById('subscribeBtn');
const messageDiv = document.getElementById('message');

// Email validation function
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Show message to user
function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    // Hide message after 5 seconds
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

// Handle form submission
subscribeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = emailInput.value.trim().toLowerCase();
    
    // Validate email
    if (!isValidEmail(email)) {
        showMessage('Please enter a valid email address.', 'error');
        return;
    }
    
    // Disable button during submission
    subscribeBtn.disabled = true;
    subscribeBtn.textContent = 'Subscribing...';
    
    try {
        // Check if Supabase is initialized
        if (!supabase) {
            throw new Error('Database connection not ready. Please refresh and try again.');
        }
        
        // Check if email already exists
        const { data: existingUser, error: checkError } = await supabase
            .from('subscribers')
            .select('email')
            .eq('email', email)
            .single();
        
        if (existingUser) {
            showMessage('This email is already subscribed!', 'error');
            subscribeBtn.disabled = false;
            subscribeBtn.textContent = 'Subscribe Free';
            return;
        }
        
        // Insert new subscriber
        const { data, error } = await supabase
            .from('subscribers')
            .insert([
                { 
                    email: email,
                    subscribed_at: new Date().toISOString(),
                    is_active: true
                }
            ]);
        
        if (error && error.code !== 'PGRST116') {
            // PGRST116 means no rows returned, which is fine for insert
            throw error;
        }
        
        // Success!
        showMessage('🎉 Successfully subscribed! Check your inbox at 7 AM ET tomorrow.', 'success');
        emailInput.value = '';
        
    } catch (error) {
        console.error('Subscription error:', error);
        showMessage('Something went wrong. Please try again later.', 'error');
    } finally {
        subscribeBtn.disabled = false;
        subscribeBtn.textContent = 'Subscribe Free';
    }
});

// Handle Enter key in email input
emailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        subscribeForm.dispatchEvent(new Event('submit'));
    }
});