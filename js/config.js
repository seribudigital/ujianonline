// Supabase Configuration
const SUPABASE_URL = "https://cuqskujuehhgndnazydq.supabase.co/rest/v1/";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1cXNrdWp1ZWhoZ25kbmF6eWRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjk0MDQsImV4cCI6MjA5NTgwNTQwNH0.Uacs4kd4qPtO3ig1P_cKM0Rkv0UVsScoGuvx_AxKoPY";

// Clean URL to handle rest/v1 suffixes automatically
let cleanUrl = SUPABASE_URL.trim();
if (cleanUrl.endsWith('/rest/v1/')) {
  cleanUrl = cleanUrl.slice(0, -9);
} else if (cleanUrl.endsWith('/rest/v1')) {
  cleanUrl = cleanUrl.slice(0, -8);
}
if (cleanUrl.endsWith('/')) {
  cleanUrl = cleanUrl.slice(0, -1);
}

// Global Supabase Client Instance
let supabaseClient = window.supabase ? window.supabase.createClient(cleanUrl, SUPABASE_KEY) : null;

/**
 * Recreates the global supabaseClient with optional custom headers (e.g. for RLS policies).
 * @param {Object} customHeaders - Additional headers to pass to the Supabase client
 * @returns {Object} The re-created Supabase client instance
 */
function recreateSupabaseClient(customHeaders = {}) {
  if (window.supabase) {
    if (Object.keys(customHeaders).length > 0) {
      supabaseClient = window.supabase.createClient(cleanUrl, SUPABASE_KEY, {
        global: {
          headers: customHeaders
        }
      });
    } else {
      supabaseClient = window.supabase.createClient(cleanUrl, SUPABASE_KEY);
    }
  }
  return supabaseClient;
}

/**
 * Shows a beautiful custom alert modal overlay on the screen.
 * @param {string} message - The warning/info message
 * @param {string} type - 'success', 'danger', 'warning', 'info'
 * @returns {Promise} Resolves when the user clicks 'OK'
 */
function showCustomAlert(message, type = 'danger') {
  return new Promise((resolve) => {
    // Check if there is already an active alert modal, remove it
    const existing = document.getElementById('custom-alert-modal');
    if (existing) {
      existing.remove();
    }

    // Create the modal overlay
    const modal = document.createElement('div');
    modal.id = 'custom-alert-modal';
    
    // Style the modal overlay (fixed fullscreen, flex center, dark backdrop)
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.backgroundColor = 'rgba(15, 23, 42, 0.6)';
    modal.style.backdropFilter = 'blur(4px)';
    modal.style.zIndex = '9999999';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.padding = '1.5rem';
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.25s ease';

    // Set icon and colors based on alert type
    let iconName = 'alert-triangle';
    let iconColor = 'var(--danger)';
    let title = 'Perhatian';
    let bgIcon = '#fee2e2';
    let borderTheme = '2px solid var(--danger)';

    if (type === 'success') {
      iconName = 'check-circle';
      iconColor = 'var(--success)';
      title = 'Berhasil';
      bgIcon = '#d1fae5';
      borderTheme = '2px solid var(--success)';
    } else if (type === 'warning') {
      iconName = 'alert-octagon';
      iconColor = 'var(--warning)';
      title = 'Peringatan';
      bgIcon = '#fffbeb';
      borderTheme = '2px solid var(--warning)';
    } else if (type === 'info') {
      iconName = 'info';
      iconColor = 'var(--secondary)';
      title = 'Informasi';
      bgIcon = '#e0f2fe';
      borderTheme = '2px solid var(--secondary)';
    }

    // Modal Card Content
    modal.innerHTML = `
      <div class="card" style="
        max-width: 420px;
        width: 100%;
        border-radius: var(--radius-lg);
        border: ${borderTheme};
        padding: 2rem;
        text-align: center;
        background-color: #ffffff;
        box-shadow: var(--shadow-xl);
        transform: scale(0.9);
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      ">
        <div style="
          width: 56px;
          height: 56px;
          background-color: ${bgIcon};
          color: ${iconColor};
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.25rem;
        ">
          <i data-lucide="${iconName}" style="width: 28px; height: 28px;"></i>
        </div>
        <h3 style="color: var(--text-dark); margin-bottom: 0.5rem; font-family: var(--font-display);">${title}</h3>
        <p style="color: var(--text-body); margin-bottom: 1.5rem; font-size: 0.9rem; line-height: 1.5;">${message}</p>
        <button class="btn btn-primary" id="custom-alert-ok-btn" style="width: 100%; padding: 0.75rem;">OK</button>
      </div>
    `;

    document.body.appendChild(modal);
    
    // Trigger Lucide icons inside modal
    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Fade-in animation
    setTimeout(() => {
      modal.style.opacity = '1';
      const cardEl = modal.querySelector('.card');
      if (cardEl) cardEl.style.transform = 'scale(1)';
    }, 10);

    // OK Click handler
    const okBtn = modal.querySelector('#custom-alert-ok-btn');
    const closeModal = () => {
      modal.style.opacity = '0';
      const cardEl = modal.querySelector('.card');
      if (cardEl) cardEl.style.transform = 'scale(0.9)';
      setTimeout(() => {
        modal.remove();
        resolve();
      }, 250);
    };

    okBtn.addEventListener('click', closeModal);
  });
}

/**
 * Shows a beautiful custom confirmation modal overlay on the screen.
 * @param {string} message - The confirmation prompt message
 * @returns {Promise<boolean>} Resolves to true if OK was clicked, false if Cancelled
 */
function showCustomConfirm(message) {
  return new Promise((resolve) => {
    // Check if there is already an active modal, remove it
    const existing = document.getElementById('custom-confirm-modal');
    if (existing) {
      existing.remove();
    }

    // Create the modal overlay
    const modal = document.createElement('div');
    modal.id = 'custom-confirm-modal';
    
    // Style the modal overlay
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.backgroundColor = 'rgba(15, 23, 42, 0.6)';
    modal.style.backdropFilter = 'blur(4px)';
    modal.style.zIndex = '9999999';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.padding = '1.5rem';
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.25s ease';

    // Modal Card Content
    modal.innerHTML = `
      <div class="card" style="
        max-width: 420px;
        width: 100%;
        border-radius: var(--radius-lg);
        border: 2px solid var(--primary);
        padding: 2rem;
        text-align: center;
        background-color: #ffffff;
        box-shadow: var(--shadow-xl);
        transform: scale(0.9);
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      ">
        <div style="
          width: 56px;
          height: 56px;
          background-color: var(--primary-light);
          color: var(--primary);
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.25rem;
        ">
          <i data-lucide="help-circle" style="width: 28px; height: 28px;"></i>
        </div>
        <h3 style="color: var(--text-dark); margin-bottom: 0.5rem; font-family: var(--font-display);">Konfirmasi</h3>
        <p style="color: var(--text-body); margin-bottom: 1.5rem; font-size: 0.9rem; line-height: 1.5;">${message}</p>
        <div style="display: flex; gap: 0.75rem; justify-content: center;">
          <button class="btn btn-secondary" id="custom-confirm-cancel-btn" style="flex: 1; padding: 0.75rem;">Batal</button>
          <button class="btn btn-primary" id="custom-confirm-ok-btn" style="flex: 1; padding: 0.75rem;">Ya, Lanjutkan</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    
    // Trigger Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Fade-in animation
    setTimeout(() => {
      modal.style.opacity = '1';
      const cardEl = modal.querySelector('.card');
      if (cardEl) cardEl.style.transform = 'scale(1)';
    }, 10);

    const okBtn = modal.querySelector('#custom-confirm-ok-btn');
    const cancelBtn = modal.querySelector('#custom-confirm-cancel-btn');

    const closeWithResult = (result) => {
      modal.style.opacity = '0';
      const cardEl = modal.querySelector('.card');
      if (cardEl) cardEl.style.transform = 'scale(0.9)';
      setTimeout(() => {
        modal.remove();
        resolve(result);
      }, 250);
    };

    okBtn.addEventListener('click', () => closeWithResult(true));
    cancelBtn.addEventListener('click', () => closeWithResult(false));
  });
}
