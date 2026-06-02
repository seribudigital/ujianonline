// Initialize Lucide icons
lucide.createIcons();

const form = document.getElementById('login-form');
const nisnInput = document.getElementById('nisn');
const namaInput = document.getElementById('nama');
const btnSubmit = document.getElementById('btn-submit');
const sessionStatusBanner = document.getElementById('session-status-banner');

let activeSession = null;

// Check if exam session and student session already active
async function checkSessions() {
  // Show loading status
  sessionStatusBanner.innerHTML = `
    <div class="alert alert-info" style="margin-bottom: 0;">
      <i data-lucide="refresh-cw" class="lucide-icon" style="width: 18px; height: 18px; flex-shrink: 0; animation: spin 1.5s linear infinite;"></i>
      <div>
        <strong>Menghubungkan ke Cloud...</strong>
      </div>
    </div>
  `;
  lucide.createIcons();

  if (!supabaseClient) {
    showNoSessionBanner("Supabase client belum diinisialisasi.");
    return;
  }

  try {
    // Fetch the latest active exam session from Supabase (using view_soal_siswa to hide keys)
    const { data, error } = await supabaseClient
      .from('view_soal_siswa')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      activeSession = data;
      
      // Deserialize year, semester, and guru from the tahun column
      deserializeSession(activeSession);

      const meta = data;
      
      // Display exam details
      sessionStatusBanner.innerHTML = `
        <div class="alert alert-info" style="margin-bottom: 0;">
          <i data-lucide="book-open" style="width: 18px; height: 18px; flex-shrink: 0; color: var(--secondary);"></i>
          <div>
            <strong style="color: var(--text-dark);">${meta.mapel_nama}</strong>
            <p style="font-size: 0.75rem; margin-top: 2px;">
              Madrasah: ${meta.madrasah}<br>
              Kelas: ${meta.kelas} | Paket: ${meta.paket}
            </p>
          </div>
        </div>
      `;

      // Save active session locally
      localStorage.setItem('smartexam_active_session', JSON.stringify(activeSession));
      displayLogo();

      // Auto-redirect if student session already present
      const studentSessionRaw = localStorage.getItem('smartexam_student_session');
      if (studentSessionRaw) {
        window.location.href = 'siswa-ujian.html';
      }
    } else {
      showNoSessionBanner("Silakan hubungi proktor/pengawas ruang untuk mengunggah soal ujian terlebih dahulu.");
    }
  } catch (e) {
    console.error("Gagal membaca active session dari Supabase", e);
    showNoSessionBanner("Gagal terhubung ke database. " + e.message);
  }
  lucide.createIcons();
}

function showNoSessionBanner(message) {
  sessionStatusBanner.innerHTML = `
    <div class="alert alert-danger" style="margin-bottom: 0;">
      <i data-lucide="alert-octagon" style="width: 18px; height: 18px; flex-shrink: 0;"></i>
      <div>
        <strong>Sesi Ujian Belum Aktif</strong>
        <p style="font-size: 0.75rem; margin-top: 2px;">
          ${message}
        </p>
      </div>
    </div>
  `;
  // Disable login button
  btnSubmit.disabled = true;
  btnSubmit.style.opacity = '0.5';
  btnSubmit.style.cursor = 'not-allowed';
}

// Input validations for NISN (numeric and ideally 10 digits)
nisnInput.addEventListener('input', (e) => {
  // Clean non-digits
  const cleanValue = e.target.value.replace(/\D/g, '');
  e.target.value = cleanValue;

  const hint = document.getElementById('nisn-hint');
  if (cleanValue.length > 0 && cleanValue.length !== 10) {
    hint.style.color = 'var(--danger)';
    hint.textContent = `NISN harus 10 digit (saat ini: ${cleanValue.length} digit)`;
  } else if (cleanValue.length === 10) {
    hint.style.color = 'var(--success)';
    hint.textContent = 'NISN valid (10 digit)';
  } else {
    hint.style.color = 'var(--text-muted)';
    hint.textContent = 'Masukkan 10 digit NISN Anda';
  }
});

// Form submit handler
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!activeSession) {
    showCustomAlert('Sesi ujian belum siap. Silakan hubungi proktor.', 'warning');
    return;
  }

  const nisnVal = nisnInput.value.trim();
  const namaVal = namaInput.value.trim();

  if (nisnVal.length !== 10) {
    showCustomAlert('NISN harus tepat 10 digit angka!', 'warning');
    return;
  }

  if (namaVal.length < 2) {
    showCustomAlert('Silakan masukkan nama lengkap Anda dengan benar!', 'warning');
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i data-lucide="loader" class="lucide-icon" style="animation: spin 1s linear infinite;"></i> Menghubungkan...`;
  lucide.createIcons();

  try {
    // Reinitialize supabaseClient with custom header for RLS validation
    recreateSupabaseClient({
      'x-student-nisn': nisnVal
    });

    // Fetch or create student row in Supabase
    let { data: studentData, error: selectError } = await supabaseClient
      .from('jawaban_siswa')
      .select('*')
      .eq('mapel_id', activeSession.id)
      .eq('nisn', nisnVal)
      .maybeSingle();

    if (selectError) throw selectError;

    if (!studentData) {
      // Check if session is active
      if (activeSession && activeSession.is_active === false) {
        await showCustomAlert("Maaf, sesi ujian untuk mata pelajaran ini sedang ditutup oleh Proktor.", "warning");
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i data-lucide="log-in"></i> Masuk Ruang Ujian`;
        lucide.createIcons();
        return;
      }

      // New login, create a record
      const { data: newRow, error: insertError } = await supabaseClient
        .from('jawaban_siswa')
        .insert({
          mapel_id: activeSession.id,
          nisn: nisnVal,
          nama_siswa: namaVal,
          status_pengumpulan: 'normal',
          jawaban_pg: {},
          jawaban_uraian: {},
          violation_count: 0
        })
        .select()
        .single();

      if (insertError) throw insertError;
      studentData = newRow;
    }

    // Save Student info to localStorage (including state from database)
    const studentSession = {
      nisn: nisnVal,
      nama: namaVal,
      waktu_login: studentData.waktu_mulai
    };

    localStorage.setItem('smartexam_student_session', JSON.stringify(studentSession));
    localStorage.setItem('smartexam_jawaban_siswa', JSON.stringify({
      pg: studentData.jawaban_pg || {},
      uraian: studentData.jawaban_uraian || {}
    }));
    localStorage.setItem('smartexam_violation_count', studentData.violation_count || 0);

    // Redirect to exam screen
    window.location.href = 'siswa-ujian.html';
  } catch (err) {
    await showCustomAlert("Gagal masuk ruang ujian: " + err.message, "danger");
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<i data-lucide="log-in"></i> Masuk Ruang Ujian`;
    lucide.createIcons();
  }
});

// Display dynamic school logo with fallbacks
function displayLogo() {
  displayMadrasahLogo('login-logo-container', activeSession, 'amanaShieldGrad', 'amanaGoldGrad');
}

// Run session checks
displayLogo();
checkSessions();
