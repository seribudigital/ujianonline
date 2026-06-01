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
