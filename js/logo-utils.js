/**
 * Returns the AmanaExam SVG Logo code.
 * @param {string} shieldGradId - Linear gradient ID for the shield
 * @param {string} goldGradId - Linear gradient ID for the gold outline/cap
 * @param {string} width - SVG width style
 * @param {string} height - SVG height style
 * @returns {string} SVG HTML string
 */
function getAmanaLogoSvg(shieldGradId = "amanaShieldGrad", goldGradId = "amanaGoldGrad", width = "100%", height = "100%") {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="amana-logo" style="width: ${width}; height: ${height};">
      <defs>
        <linearGradient id="${shieldGradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#059669" />
          <stop offset="100%" stop-color="#047857" />
        </linearGradient>
        <linearGradient id="${goldGradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F59E0B" />
          <stop offset="100%" stop-color="#D97706" />
        </linearGradient>
      </defs>
      <path d="M50 6 C75 6 88 16 88 44 C88 71 50 92 50 92 C50 92 12 71 12 44 C12 16 25 6 50 6 Z" fill="url(#${shieldGradId})" />
      <path d="M50 12 C70 12 82 20 82 44 C82 67 50 85 50 85 C50 85 18 67 18 44 C18 20 30 12 50 12 Z" fill="none" stroke="url(#${goldGradId})" stroke-width="2.5" opacity="0.8" />
      <path d="M50 22 L74 31 L50 40 L26 31 Z" fill="url(#${goldGradId})" />
      <path d="M36 34.5 V42 C36 46 64 46 64 42 V34.5" fill="url(#${goldGradId})" />
      <path d="M50 31 L68 33.5 V43" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" />
      <circle cx="68" cy="44.5" r="1.5" fill="#FFFFFF" />
      <path d="M32 54 C41 49.5 48 51.5 50 53.5 C52 51.5 59 49.5 68 54 L68 68 C59 63.5 52 65.5 50 67.5 C48 65.5 41 63.5 32 68 Z" fill="#FFFFFF" />
      <line x1="50" y1="53.5" x2="50" y2="67.5" stroke="url(#${goldGradId})" stroke-width="1.5" />
      <path d="M42.5 59 L47.5 64 L57.5 53.5" fill="none" stroke="#059669" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

/**
 * Detects whether the school jenjang is MTs or MA.
 * @param {Object} session - Active exam session object
 * @returns {string} 'mts' or 'ma'
 */
function detectLogoType(session) {
  if (!session) return 'ma'; // default
  const meta = session.metadata ? session.metadata : session;
  
  const mapelLower = (meta.mapel_nama || '').toLowerCase();
  const kelasLower = (meta.kelas || '').toLowerCase();
  const madrasahLower = (meta.madrasah || '').toLowerCase();
  
  const isMts = mapelLower.includes('mts') || 
                /\b(7|8|9|vii|viii|ix)\b/.test(kelasLower) || 
                madrasahLower.includes('mts') || 
                madrasahLower.includes('tsanawiyah');
                
  const isMa = mapelLower.includes('ma') || 
               mapelLower.includes('aliyah') || 
               /\b(10|11|12|x|xi|xii)\b/.test(kelasLower) || 
               madrasahLower.includes('ma') || 
               madrasahLower.includes('aliyah');

  if (isMts && !isMa) {
    return 'mts';
  }
  return 'ma';
}

/**
 * Resolves the logo image URL from localStorage or local defaults.
 * @param {string} logoType - 'mts' or 'ma'
 * @param {string} madrasahName - Name of the madrasah
 * @returns {string|null} Resolved URL/Base64 string or null
 */
function getMadrasahLogoUrl(logoType, madrasahName = '') {
  const savedLogo = localStorage.getItem(`smartexam_logo_${logoType}`);
  if (savedLogo) return savedLogo;

  const madrasahLower = madrasahName.toLowerCase();
  const isAlkhoir = madrasahLower.includes('alkhoir') || madrasahLower.includes('al-khoir') || madrasahLower.includes('al khoir');
  
  if (isAlkhoir) {
    return logoType === 'mts' ? 'logo mts Alkhoir.png' : 'logo MA Alkhoir.jpg';
  }
  return null;
}

/**
 * Displays the Madrasah logo or Amana fallback in the specified container.
 * @param {string} containerId - Element ID of the logo container
 * @param {Object} session - Active exam session (optional)
 * @param {string} fallbackShieldGradId - Gradient ID for Amana shield
 * @param {string} fallbackGoldGradId - Gradient ID for Amana gold elements
 */
function displayMadrasahLogo(containerId, session = null, fallbackShieldGradId = "amanaShieldGrad", fallbackGoldGradId = "amanaGoldGrad") {
  const container = document.getElementById(containerId);
  if (!container) return;

  let logoType = 'ma';
  let madrasahName = '';
  let activeSession = session;

  if (!activeSession) {
    const activeSessionRaw = localStorage.getItem('smartexam_active_session');
    if (activeSessionRaw) {
      try {
        activeSession = JSON.parse(activeSessionRaw);
      } catch (e) {
        console.error("Gagal membaca active session untuk logo", e);
      }
    }
  }

  if (activeSession) {
    logoType = detectLogoType(activeSession);
    const meta = activeSession.metadata ? activeSession.metadata : activeSession;
    madrasahName = meta.madrasah || '';
  }

  const logoUrl = getMadrasahLogoUrl(logoType, madrasahName);

  if (logoUrl) {
    container.innerHTML = `<img src="${logoUrl}" style="width: 100%; height: 100%; object-fit: contain; border-radius: inherit;" alt="Logo Madrasah">`;
    container.style.border = 'none';
  } else {
    // Fallback to AmanaExam SVG Logo
    container.innerHTML = getAmanaLogoSvg(fallbackShieldGradId, fallbackGoldGradId);
    container.style.border = 'none';
  }
}
