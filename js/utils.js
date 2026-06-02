/**
 * ============================================
 * AmanaExam — Shared Utility Functions
 * ============================================
 * File ini berisi fungsi-fungsi utilitas yang digunakan
 * di beberapa halaman (siswa-ujian, admin-proktor, siswa-login).
 * Diimpor melalui <script src="js/utils.js"> di semua halaman.
 */

/**
 * Deterministic hash code from string.
 * Used as seed for seeded random number generation (question shuffling).
 * @param {string} str - Input string (e.g., NISN)
 * @returns {number} Positive integer hash
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Seeded random number generator (Linear Congruential Generator).
 * Produces deterministic pseudo-random numbers given the same seed.
 * @param {number} seed - Seed value for the generator
 * @returns {function} A function that returns a pseudo-random number between 0 and 1
 */
function seededRandom(seed) {
  let m = 0x80000000;
  let a = 1103515245;
  let c = 12345;
  let state = seed ? seed : Math.floor(Math.random() * (m - 1));
  return function() {
    state = (a * state + c) % m;
    return state / (m - 1);
  };
}

/**
 * Seeded Fisher-Yates shuffle.
 * Produces a deterministic permutation of the array given the same seed.
 * @param {Array} array - Array to shuffle
 * @param {number} seed - Seed for the random generator
 * @returns {Array} New shuffled array (original is not modified)
 */
function shuffleArray(array, seed) {
  const rand = seededRandom(seed);
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deserializes the serialized tahun|semester|guru string in session metadata.
 * The proktor dashboard stores semester and guru inside the tahun column
 * as "tahunAjaran|semester|guru" for backward compatibility.
 * @param {Object} session - Active exam session object
 * @returns {Object} The same session object with tahun, semester, guru deserialized
 */
function deserializeSession(session) {
  if (!session) return null;
  const meta = session.metadata ? session.metadata : session;
  if (meta && meta.tahun && typeof meta.tahun === 'string' && meta.tahun.includes('|')) {
    const parts = meta.tahun.split('|');
    meta.tahun = parts[0] || '';
    meta.semester = parts[1] || '-';
    meta.guru = parts[2] || '-';
  }
  return session;
}

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Use this whenever rendering user-provided text via innerHTML.
 * @param {string} str - Untrusted string input
 * @returns {string} HTML-safe string with special chars escaped
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
