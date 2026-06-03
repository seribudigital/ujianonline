// Initialize Supabase Client with RLS bypass header if proktor is logged in
const proktorPasswordSaved = sessionStorage.getItem('smartexam_proktor_password');

if (proktorPasswordSaved) {
  recreateSupabaseClient({
    'x-proktor-password': proktorPasswordSaved
  });
} else {
  recreateSupabaseClient();
}

// Initialize Lucide icons
lucide.createIcons();

// DOM Elements
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const alertContainer = document.getElementById('alert-container');

const noSessionContent = document.getElementById('no-session-content');
const sessionActiveContent = document.getElementById('session-active-content');
const btnToggleSession = document.getElementById('btn-toggle-session');

// Metadata DOM fields
const valMapelId = document.getElementById('val-mapel-id');
const valMadrasah = document.getElementById('val-madrasah');
const valMapel = document.getElementById('val-mapel');
const valKelas = document.getElementById('val-kelas');
const valSemesterTp = document.getElementById('val-semester-tp');
const valPaket = document.getElementById('val-paket');
const valGuru = document.getElementById('val-guru');
const valDurasi = document.getElementById('val-durasi');
const valSoalPg = document.getElementById('val-soal-pg');
const valSoalUraian = document.getElementById('val-soal-uraian');

// Monitor DOM
const monitorTableBody = document.getElementById('monitor-table-body');
const monitorCount = document.getElementById('monitor-count');

// State
let idUjianAktif = null;
let studentsMap = {}; // State of students listed for monitoring
let realtimeChannel = null;
let isOfflineArchiveMode = false;

// Render alert notification helper
function showAlert(message, type = 'success') {
  alertContainer.innerHTML = `
    <div class="alert alert-${type}">
      <i data-lucide="${type === 'success' ? 'check-circle' : type === 'danger' ? 'alert-triangle' : 'info'}" style="width: 20px; height: 20px; flex-shrink: 0;"></i>
      <div>
        <strong>${type === 'success' ? 'Berhasil!' : type === 'danger' ? 'Error!' : 'Informasi'}</strong>
        <p style="margin-top: 2px;">${message}</p>
      </div>
    </div>
  `;
  lucide.createIcons();
}

// Utility functions (hashCode, seededRandom, shuffleArray, deserializeSession, escapeHtml)
// are now provided globally by utils.js

// ==========================================
// COLLAPSIBLE CARDS LOGIC
// ==========================================
window.toggleCollapse = function(contentId, iconId) {
  const content = document.getElementById(contentId);
  const icon = document.getElementById(iconId);
  if (!content || !icon) return;
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    icon.style.transform = 'rotate(0deg)';
    if (contentId === 'content-session') {
      const subtitle = document.getElementById('session-header-subtitle');
      if (subtitle) subtitle.style.display = 'none';
    }
  } else {
    content.style.display = 'none';
    icon.style.transform = 'rotate(180deg)';
    if (contentId === 'content-session') {
      const subtitle = document.getElementById('session-header-subtitle');
      if (subtitle) subtitle.style.display = 'block';
    }
  }
}

// Load active session from Supabase (or localStorage fallback)
async function loadActiveSession() {
  const activeSessionRaw = localStorage.getItem('smartexam_proktor_active_session');
  if (activeSessionRaw) {
    try {
      let session = JSON.parse(activeSessionRaw);
      session = deserializeSession(session);
      const meta = session.metadata ? session.metadata : session;
      idUjianAktif = session.id;

      // Double check with Supabase database
      if (supabaseClient) {
        const { data, error } = await supabaseClient
          .from('ujian_aktif')
          .select('*')
          .eq('id', idUjianAktif)
          .maybeSingle();

        if (error) {
          console.error("Gagal verifikasi sesi ke Supabase:", error);
        } else if (!data) {
          // Session not found in database, clean local storage
          localStorage.removeItem('smartexam_proktor_active_session');
          showNoSession();
          return;
        } else {
          let dbSession = deserializeSession(data);
          // Ensure local storage is updated with DB values
          localStorage.setItem('smartexam_proktor_active_session', JSON.stringify(dbSession));
          const dbMeta = dbSession.metadata ? dbSession.metadata : dbSession;
          meta.tahun = dbMeta.tahun;
          meta.semester = dbMeta.semester;
          meta.guru = dbMeta.guru;
        }
      }
      
      // Populate details
      valMapelId.textContent = idUjianAktif || '-';
      valMadrasah.textContent = meta.madrasah || '-';
      valMapel.textContent = meta.mapel_nama || '-';
      valKelas.textContent = meta.kelas || '-';
      valSemesterTp.textContent = `${meta.semester || '-'} / ${meta.tahun || '-'}`;
      valPaket.textContent = meta.paket || '-';
      valGuru.textContent = meta.guru || '-';
      valDurasi.textContent = meta.waktu_menit || '0';
      valSoalPg.textContent = session.soal_pg ? session.soal_pg.length : 0;
      valSoalUraian.textContent = session.soal_uraian ? session.soal_uraian.length : 0;

      // Update subtitle
      const subtitle = document.getElementById('session-header-subtitle');
      if (subtitle) subtitle.textContent = `${meta.mapel_nama || ''} (Kelas ${meta.kelas || ''})`;

      const monitorSubtitle = document.getElementById('live-monitor-subtitle');
      if (monitorSubtitle) {
        monitorSubtitle.textContent = `${meta.mapel_nama || ''} (Kelas ${meta.kelas || ''})`;
        monitorSubtitle.style.display = 'block';
      }

      // Enable Excel export button
      const btnExportExcel = document.getElementById('btn-export-excel');
      if (btnExportExcel) btnExportExcel.disabled = false;

      // Update Toggle Session button
      const btnToggleSession = document.getElementById('btn-toggle-session');
      if (btnToggleSession) {
        const isActive = session.is_active !== false; // defaults to true
        if (isActive) {
          btnToggleSession.className = 'btn btn-danger';
          btnToggleSession.style.backgroundColor = '';
          btnToggleSession.style.color = '';
          btnToggleSession.innerHTML = `<i data-lucide="lock"></i> Tutup Sesi Ujian`;
        } else {
          btnToggleSession.className = 'btn';
          btnToggleSession.style.backgroundColor = 'var(--success)';
          btnToggleSession.style.color = '#ffffff';
          btnToggleSession.innerHTML = `<i data-lucide="unlock"></i> Buka Sesi Ujian`;
        }
      }

      // Enable archive buttons that require active session
      const btnDownloadArchive = document.getElementById('btn-download-archive');
      const btnDeletePermanently = document.getElementById('btn-delete-permanently');
      if (btnDownloadArchive) btnDownloadArchive.disabled = false;
      if (btnDeletePermanently) btnDeletePermanently.disabled = false;

      // Toggle view
      noSessionContent.style.display = 'none';
      sessionActiveContent.style.display = 'block';

      // Initialize Live Monitor
      initializeLiveMonitor();

    } catch (e) {
      console.error("Gagal mengurai smartexam_active_session", e);
      localStorage.removeItem('smartexam_proktor_active_session');
      showNoSession();
    }
  } else {
    showNoSession();
  }
}

function showNoSession() {
  noSessionContent.style.display = 'block';
  sessionActiveContent.style.display = 'none';
  
  // Disable Excel export button
  const btnExportExcel = document.getElementById('btn-export-excel');
  if (btnExportExcel) btnExportExcel.disabled = true;

  // Disable archive buttons requiring active session
  const btnDownloadArchive = document.getElementById('btn-download-archive');
  const btnDeletePermanently = document.getElementById('btn-delete-permanently');
  if (btnDownloadArchive) btnDownloadArchive.disabled = true;
  if (btnDeletePermanently) btnDeletePermanently.disabled = true;

  const monitorSubtitle = document.getElementById('live-monitor-subtitle');
  if (monitorSubtitle) monitorSubtitle.style.display = 'none';

  monitorTableBody.innerHTML = `
    <tr>
      <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
        <i data-lucide="users" style="width: 24px; height: 24px; display: block; margin: 0 auto 0.5rem; color: var(--text-muted);"></i>
        Belum ada ujian aktif. Unggah berkas soal untuk mengaktifkan pemantauan.
      </td>
    </tr>
  `;
  monitorCount.textContent = "0 Siswa Terdaftar";
  lucide.createIcons();

  // Open upload card if there is no active session
  const contentUpload = document.getElementById('content-upload');
  const iconUpload = document.getElementById('icon-upload');
  if (contentUpload && iconUpload && contentUpload.style.display === 'none') {
    contentUpload.style.display = 'block';
    iconUpload.style.transform = 'rotate(0deg)';
  }

  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
    realtimeChannel = null;
  }
}

// Toggle active session status in Supabase and locally
if (btnToggleSession) {
  btnToggleSession.addEventListener('click', async () => {
    if (!supabaseClient || !idUjianAktif) {
      showAlert('Tidak ada koneksi database atau sesi ujian aktif.', 'danger');
      return;
    }

    const activeSessionRaw = localStorage.getItem('smartexam_proktor_active_session');
    if (!activeSessionRaw) return;

    let session = JSON.parse(activeSessionRaw);
    session = deserializeSession(session);
    const currentStatus = session.is_active !== false; // default true
    const nextStatus = !currentStatus;

    const actionText = nextStatus ? 'MEMBUKA' : 'MENUTUP';
    const confirmMsg = `Apakah Anda yakin ingin ${actionText} sesi ujian ini untuk siswa?\n\n(Jika ditutup, siswa baru yang mencoba login akan ditolak)`;
    
    const confirmed = await showCustomConfirm(confirmMsg);
    if (confirmed) {
      try {
        showAlert(`Sedang ${nextStatus ? 'membuka' : 'menutup'} sesi di database cloud...`, 'info');
        const { error } = await supabaseClient
          .from('ujian_aktif')
          .update({ is_active: nextStatus })
          .eq('id', idUjianAktif);

        if (error) {
          showAlert('Gagal mengubah status sesi ujian: ' + error.message, 'danger');
          return;
        }

        session.is_active = nextStatus;
        localStorage.setItem('smartexam_proktor_active_session', JSON.stringify(session));
        showAlert(`Sesi ujian berhasil ${nextStatus ? 'dibuka' : 'ditutup'} secara global.`, 'success');
        loadActiveSession();
      } catch (err) {
        showAlert('Koneksi database cloud error: ' + err.message, 'danger');
      }
    }
  });
}

// 1. Download Backup JSON
const btnDownloadArchive = document.getElementById('btn-download-archive');
if (btnDownloadArchive) {
  btnDownloadArchive.addEventListener('click', async () => {
    if (!supabaseClient || !idUjianAktif) {
      showAlert('Tidak ada koneksi database atau sesi ujian aktif.', 'danger');
      return;
    }

    const activeSessionRaw = localStorage.getItem('smartexam_proktor_active_session');
    if (!activeSessionRaw) return;

    try {
      showAlert('Sedang memproses unduhan arsip cadangan...', 'info');

      // Fetch all student answers for the active exam mapel_id
      const { data: studentAnswers, error } = await supabaseClient
        .from('jawaban_siswa')
        .select('*')
        .eq('mapel_id', idUjianAktif);

      if (error) {
        showAlert('Gagal menarik data dari database: ' + error.message, 'danger');
        return;
      }

      let session = JSON.parse(activeSessionRaw);
      session = deserializeSession(session);
      const meta = session.metadata ? session.metadata : session;

      // Build structured archive
      const archivePayload = {
        export_type: 'smartexam_archive',
        export_date: new Date().toISOString(),
        active_session: session,
        jawaban_siswa: studentAnswers || []
      };

      // Build dynamic filename: arsip-[kelas]-[mapel_nama]-[tahun_ajaran].json
      const classSanitized = (meta.kelas || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
      const mapelSanitized = (meta.mapel_nama || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
      const tahunSanitized = (meta.tahun || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `arsip-${classSanitized}-${mapelSanitized}-${tahunSanitized}.json`.toLowerCase();

      // Create JSON Blob and download
      const jsonString = JSON.stringify(archivePayload, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = fileName;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      window.URL.revokeObjectURL(url);

      showAlert(`Berhasil mengunduh arsip cadangan: ${fileName}`, 'success');
    } catch (err) {
      showAlert('Terjadi kesalahan saat mengunduh arsip: ' + err.message, 'danger');
      console.error(err);
    }
  });
}

// 2. Upload & Buka File Arsip (Offline Reader)
const archiveFileInput = document.getElementById('archive-file-input');
const archiveTriggerBtn = document.getElementById('btn-upload-archive-trigger');

if (archiveTriggerBtn && archiveFileInput) {
  archiveTriggerBtn.addEventListener('click', () => {
    archiveFileInput.click();
  });

  archiveFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      showAlert('Format berkas arsip harus berupa file .json!', 'danger');
      archiveFileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const archiveData = JSON.parse(event.target.result);

        let sessionConfig = null;
        let studentAnswers = null;

        // Support both structured and raw array
        if (archiveData && typeof archiveData === 'object' && !Array.isArray(archiveData)) {
          if (archiveData.export_type === 'smartexam_archive') {
            sessionConfig = archiveData.active_session;
            studentAnswers = archiveData.jawaban_siswa;
          } else {
            sessionConfig = archiveData.active_session || null;
            studentAnswers = archiveData.jawaban_siswa || null;
          }
        } else if (Array.isArray(archiveData)) {
          studentAnswers = archiveData;
        }

        if (!studentAnswers || studentAnswers.length === 0) {
          showAlert('File JSON arsip tidak valid atau tidak memiliki data siswa.', 'danger');
          archiveFileInput.value = '';
          return;
        }

        // Disconnect active realtime monitor to prevent cloud updates from overwriting offline view
        if (realtimeChannel) {
          realtimeChannel.unsubscribe();
          realtimeChannel = null;
        }

        isOfflineArchiveMode = true;

        // Show offline banner
        const offlineBanner = document.getElementById('offline-archive-banner');
        if (offlineBanner) offlineBanner.style.display = 'flex';

        // Restore session config if present
        if (sessionConfig) {
          // Save real active session if we haven't already
          if (!sessionStorage.getItem('smartexam_real_active_session')) {
            const currentActive = localStorage.getItem('smartexam_proktor_active_session');
            if (currentActive) {
              sessionStorage.setItem('smartexam_real_active_session', currentActive);
            } else {
              sessionStorage.setItem('smartexam_real_active_session', 'NONE');
            }
          }

          localStorage.setItem('smartexam_proktor_active_session', JSON.stringify(sessionConfig));
          
          idUjianAktif = sessionConfig.id;
          sessionConfig = deserializeSession(sessionConfig);
          const meta = sessionConfig.metadata ? sessionConfig.metadata : sessionConfig;

          valMapelId.textContent = idUjianAktif || '-';
          valMadrasah.textContent = meta.madrasah || '-';
          valMapel.textContent = meta.mapel_nama || '-';
          valKelas.textContent = meta.kelas || '-';
          valSemesterTp.textContent = `${meta.semester || '-'} / ${meta.tahun || '-'}`;
          valPaket.textContent = meta.paket || '-';
          valGuru.textContent = meta.guru || '-';
          valDurasi.textContent = meta.waktu_menit || '0';
          valSoalPg.textContent = sessionConfig.soal_pg ? sessionConfig.soal_pg.length : 0;
          valSoalUraian.textContent = sessionConfig.soal_uraian ? sessionConfig.soal_uraian.length : 0;

          noSessionContent.style.display = 'none';
          sessionActiveContent.style.display = 'block';
        } else {
          // Warning if no config embedded
          const localSessionRaw = localStorage.getItem('smartexam_proktor_active_session');
          if (localSessionRaw) {
            const localSession = JSON.parse(localSessionRaw);
            if (localSession.id !== studentAnswers[0].mapel_id) {
              showAlert('Peringatan: File arsip ini memiliki mapel_id "' + studentAnswers[0].mapel_id + '" yang tidak cocok dengan sesi aktif saat ini. Cetak rapot mungkin tidak menampilkan soal yang benar.', 'warning');
            }
          } else {
            showAlert('Peringatan: Tidak ada sesi soal aktif terdeteksi. Silakan unggah berkas soal (.json) terlebih dahulu agar soal dan kunci jawaban rapot tercetak dengan benar.', 'warning');
          }
        }

        // Populate students map
        studentsMap = {};
        studentAnswers.forEach(student => {
          studentsMap[student.nisn] = student;
        });

        // Render table
        renderMonitorTable();

        // Style badge for offline mode
        monitorCount.textContent = `${studentAnswers.length} Siswa (Arsip Offline)`;
        monitorCount.className = 'badge';
        monitorCount.style.backgroundColor = 'var(--secondary)';
        monitorCount.style.color = '#ffffff';

        // Enable Excel export for offline session
        const btnExportExcel = document.getElementById('btn-export-excel');
        if (btnExportExcel) btnExportExcel.disabled = false;

        showAlert(`Berhasil membuka ${studentAnswers.length} data siswa dari file arsip secara offline.`, 'success');
      } catch (err) {
        showAlert('Gagal menguraikan file arsip JSON: ' + err.message, 'danger');
        console.error(err);
      }
      archiveFileInput.value = '';
    };
    reader.readAsText(file);
  });
}

// 3. Exit Offline Mode
const btnExitOffline = document.getElementById('btn-exit-offline');
if (btnExitOffline) {
  btnExitOffline.addEventListener('click', () => {
    isOfflineArchiveMode = false;
    document.getElementById('offline-archive-banner').style.display = 'none';
    
    // Restore real active session
    const realActive = sessionStorage.getItem('smartexam_real_active_session');
    if (realActive === 'NONE') {
      localStorage.removeItem('smartexam_proktor_active_session');
      sessionStorage.removeItem('smartexam_real_active_session');
    } else if (realActive) {
      localStorage.setItem('smartexam_proktor_active_session', realActive);
      sessionStorage.removeItem('smartexam_real_active_session');
    } else {
      localStorage.removeItem('smartexam_proktor_active_session');
    }

    // Restore badge style
    monitorCount.className = 'badge badge-success';
    monitorCount.style.backgroundColor = '';
    monitorCount.style.color = '';

    loadActiveSession();
    showAlert('Berhasil kembali ke Live Monitor mode.', 'success');
  });
}

// 4. Hapus Permanen dari Cloud (Garda Terakhir)
const btnDeletePermanently = document.getElementById('btn-delete-permanently');
if (btnDeletePermanently) {
  btnDeletePermanently.addEventListener('click', async () => {
    if (!supabaseClient || !idUjianAktif) {
      showAlert('Tidak ada koneksi database atau sesi ujian aktif.', 'danger');
      return;
    }

    const confirm1 = await showCustomConfirm("PERINGATAN! Apakah Anda benar-benar sudah mendownload file arsip JSON? Tindakan ini akan menghapus seluruh data pengerjaan siswa di cloud secara permanen untuk sesi ini!");
    if (!confirm1) return;

    const confirm2 = await showCustomConfirm("Peringatan Terakhir! Tindakan ini tidak dapat dibatalkan. Apakah Anda yakin ingin menghapus seluruh data pengerjaan siswa di cloud secara permanen untuk sesi ini?");
    if (!confirm2) return;

    try {
      showAlert('Sedang menghapus seluruh data pengerjaan siswa di cloud...', 'info');
      const { error } = await supabaseClient
        .from('jawaban_siswa')
        .delete()
        .eq('mapel_id', idUjianAktif);

      if (error) {
        showAlert('Gagal menghapus data di cloud: ' + error.message, 'danger');
        return;
      }

      // Clear local tracking state and table
      studentsMap = {};
      renderMonitorTable();
      showAlert('Seluruh data pengerjaan siswa di cloud untuk sesi ini telah berhasil dihapus secara permanen.', 'success');
    } catch (err) {
      showAlert('Terjadi kesalahan saat menghapus data: ' + err.message, 'danger');
      console.error(err);
    }
  });
}

// File Drop & Select handlers
if (uploadZone) {
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleExamFile(files[0]);
    }
  });
}

if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleExamFile(files[0]);
    }
  });
}

// Validate and process the uploaded file
function handleExamFile(file) {
  if (!file.name.endsWith('.json')) {
    showAlert('Format berkas harus berupa file .json!', 'danger');
    return;
  }

  const reader = new FileReader();
  reader.onload = async function(event) {
    let rawData;
    try {
      rawData = JSON.parse(event.target.result);
    } catch (e) {
      showAlert('Gagal mengurai file JSON. Pastikan format file Anda benar.', 'danger');
      console.error(e);
      return;
    }

    // Show upload loading state
    const uploadBtn = uploadZone;
    if (uploadBtn) uploadBtn.style.pointerEvents = 'none';
    if (uploadBtn) uploadBtn.style.opacity = '0.6';

    const meta = rawData.metadata ? rawData.metadata : rawData;
    
    // Validation checklist
    const requiredKeys = ['madrasah', 'mapel_nama', 'kelas', 'semester', 'tahun', 'waktu_menit', 'guru', 'paket'];
    const missingKeys = [];

    requiredKeys.forEach(key => {
      if (meta[key] === undefined) {
        missingKeys.push(key);
      }
    });

    if (missingKeys.length > 0) {
      showAlert(`File JSON tidak valid. Kunci berikut hilang pada metadata: ${missingKeys.join(', ')}`, 'danger');
      if (uploadBtn) uploadBtn.style.pointerEvents = '';
      if (uploadBtn) uploadBtn.style.opacity = '';
      return;
    }

    if (!rawData.soal_pg) rawData.soal_pg = [];
    if (!rawData.soal_uraian) rawData.soal_uraian = [];

    // Generate mapel_id unique
    const mapelId = (meta.mapel_nama + '_' + meta.kelas + '_' + meta.paket + '_' + meta.tahun).toLowerCase().replace(/[^a-z0-9]/g, '_');
    rawData.id = mapelId;

    // Upsert to Supabase
    if (supabaseClient) {
      try {
        const { error } = await supabaseClient
          .from('ujian_aktif')
          .upsert({
            id: mapelId,
            madrasah: meta.madrasah,
            mapel_nama: meta.mapel_nama,
            kelas: meta.kelas,
            tahun: `${meta.tahun || ''}|${meta.semester || ''}|${meta.guru || ''}`,
            paket: meta.paket,
            waktu_menit: parseInt(meta.waktu_menit) || 90,
            soal_pg: rawData.soal_pg,
            soal_uraian: rawData.soal_uraian,
            is_active: true
          });

        if (error) {
          showAlert('Gagal mengunggah soal ke Supabase: ' + error.message, 'danger');
          if (uploadBtn) uploadBtn.style.pointerEvents = '';
          if (uploadBtn) uploadBtn.style.opacity = '';
          return;
        }
      } catch (err) {
        showAlert('Koneksi database cloud error: ' + err.message, 'danger');
        console.error(err);
        if (uploadBtn) uploadBtn.style.pointerEvents = '';
        if (uploadBtn) uploadBtn.style.opacity = '';
        return;
      }
    }

    rawData.is_active = true;
    localStorage.setItem('smartexam_proktor_active_session', JSON.stringify(rawData));
    showAlert('Sesi soal ujian berhasil diunggah dan disinkronkan ke Supabase!', 'success');
    if (uploadBtn) uploadBtn.style.pointerEvents = '';
    if (uploadBtn) uploadBtn.style.opacity = '';
    loadActiveSession();
  };
  
  reader.readAsText(file);
}

// Initialize Live Monitor with Supabase Realtime Channels
async function initializeLiveMonitor() {
  if (!supabaseClient || !idUjianAktif) return;

  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
  }

  // Fetch initial student list
  const { data, error } = await supabaseClient
    .from('jawaban_siswa')
    .select('*')
    .eq('mapel_id', idUjianAktif);

  if (error) {
    console.error("Gagal mengambil data awal monitoring:", error);
  } else {
    studentsMap = {};
    if (data) {
      data.forEach(item => {
        studentsMap[item.nisn] = item;
      });
    }
    renderMonitorTable();
  }

  // Subscribe to Realtime DB updates
  realtimeChannel = supabaseClient
    .channel('room_ujian')
    .on('postgres_changes', { 
      event: '*', 
      filter: `mapel_id=eq.${idUjianAktif}`, 
      schema: 'public', 
      table: 'jawaban_siswa' 
    }, payload => {
      const oldData = studentsMap[payload.new?.nisn || payload.old?.nisn];
      const newData = payload.new;

      if (payload.eventType === 'DELETE') {
        delete studentsMap[payload.old.nisn];
      } else {
        // Check for violation count increase
        if (oldData && newData && newData.violation_count > oldData.violation_count) {
          newData.isBlinking = true;
          // Clear blink state after 5 seconds
          setTimeout(() => {
            if (studentsMap[newData.nisn]) {
              studentsMap[newData.nisn].isBlinking = false;
              renderMonitorTable();
            }
          }, 5000);
        }
        studentsMap[newData.nisn] = newData;
      }
      renderMonitorTable();
    })
    .subscribe();
}

// Render the monitoring table body
function renderMonitorTable() {
  const studentsList = Object.values(studentsMap);
  
  if (studentsList.length === 0) {
    monitorTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
          <i data-lucide="users" style="width: 24px; height: 24px; display: block; margin: 0 auto 0.5rem; color: var(--text-muted);"></i>
          Belum ada siswa yang login untuk mata pelajaran aktif ini.
        </td>
      </tr>
    `;
    monitorCount.textContent = "0 Siswa Terdaftar";
    lucide.createIcons();
    return;
  }

  // Sort by name
  studentsList.sort((a, b) => a.nama_siswa.localeCompare(b.nama_siswa));
  monitorCount.textContent = `${studentsList.length} Siswa Terdaftar`;

  monitorTableBody.innerHTML = '';
  studentsList.forEach((student, index) => {
    const tr = document.createElement('tr');
    if (student.isBlinking) {
      tr.className = 'blink-violation';
    }

    // Determine Status Visuals
    let statusBadge = '';
    if (student.status_pengumpulan === 'normal') {
      statusBadge = `<span class="badge badge-warning" style="background-color: #fef3c7; color: #92400e;">Sedang Mengerjakan</span>`;
    } else if (student.status_pengumpulan === 'selesai') {
      statusBadge = `<span class="badge badge-success" style="background-color: #d1fae5; color: #065f46;">Selesai</span>`;
    } else if (student.status_pengumpulan === 'timer_expired') {
      statusBadge = `<span class="badge badge-success" style="background-color: #d1fae5; color: #065f46;">Selesai (Waktu Habis)</span>`;
    } else if (student.status_pengumpulan === 'violation_locked') {
      statusBadge = `<span class="badge badge-danger" style="background-color: #fee2e2; color: #991b1b; font-weight: 800;">Terkunci (Melanggar)</span>`;
    }

    // Violation Warning Style
    let violationStyle = '';
    if (student.violation_count > 0) {
      violationStyle = `color: var(--danger); font-weight: bold;`;
    }

    // Format time
    const startLocal = new Date(student.waktu_mulai);
    const formatWaktu = startLocal.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

    // Set up the print report button
    let actionBtn = '';
    if (student.status_pengumpulan !== 'normal') {
      actionBtn = `
        <button class="btn" onclick="openPrintModal('${student.nisn}')" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; display: flex; align-items: center; gap: 0.25rem; background-color: var(--primary-light); color: var(--primary); border: 1px solid var(--primary-light); border-radius: var(--radius-sm); cursor: pointer; font-weight: 600; transition: all 0.2s ease;">
          <i data-lucide="printer" style="width: 12px; height: 12px;"></i> Cetak Rapot
        </button>
      `;
    } else {
      actionBtn = `<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">Sedang Mengerjakan</span>`;
    }

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><code style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(student.nisn)}</code></td>
      <td style="font-weight: 600;">${escapeHtml(student.nama_siswa)}</td>
      <td>${statusBadge}</td>
      <td style="${violationStyle}">${student.violation_count} / 3</td>
      <td>${formatWaktu}</td>
      <td>${actionBtn}</td>
    `;
    monitorTableBody.appendChild(tr);
  });
  lucide.createIcons();
}

// Helper function to calculate PG score automatically based on answer keys
function calculateScore(studentAnswers, questions) {
  if (!questions || questions.length === 0) return 0;
  let correctCount = 0;
  questions.forEach(q => {
    const studentAns = studentAnswers ? studentAnswers[q.id] : null;
    const correctAns = q.jawaban_benar || q.kunci;
    if (studentAns && correctAns && String(studentAns).trim().toUpperCase() === String(correctAns).trim().toUpperCase()) {
      correctCount++;
    }
  });
  return Math.round((correctCount / questions.length) * 100);
}

// Mass export to Excel logic using SheetJS
const btnExportExcel = document.getElementById('btn-export-excel');
if (btnExportExcel) {
  btnExportExcel.addEventListener('click', async () => {
    if (!idUjianAktif) {
      showAlert('Tidak ada sesi ujian aktif.', 'danger');
      return;
    }

    try {
      let studentData = [];
      if (isOfflineArchiveMode) {
        studentData = Object.values(studentsMap);
      } else {
        if (!supabaseClient) {
          showAlert('Koneksi Supabase tidak tersedia.', 'danger');
          return;
        }
        // Show progress alert
        showAlert('Sedang menarik data hasil ujian dari Supabase...', 'info');

        // Fetch all student answers for the active exam mapel_id
        const { data, error } = await supabaseClient
          .from('jawaban_siswa')
          .select('*')
          .eq('mapel_id', idUjianAktif);

        if (error) {
          showAlert('Gagal menarik data dari database: ' + error.message, 'danger');
          return;
        }

        studentData = data || [];
      }

      if (!studentData || studentData.length === 0) {
        showAlert('Belum ada data jawaban siswa untuk diekspor.', 'info');
        return;
      }

      // Get the active session questions for scoring
      const activeSessionRaw = localStorage.getItem('smartexam_proktor_active_session');
      let questionsPG = [];
      let questionsUraian = [];
      let mapelName = 'Ujian';
      if (activeSessionRaw) {
        let sessionObj = JSON.parse(activeSessionRaw);
        sessionObj = deserializeSession(sessionObj);
        questionsPG = sessionObj.soal_pg || [];
        questionsUraian = sessionObj.soal_uraian || [];
        const meta = sessionObj.metadata || sessionObj;
        mapelName = meta.mapel_nama || 'Ujian';
      }

      // Map data to the excel format
      const excelData = studentData.map((student, idx) => {
        // Calculate PG metrics
        let correctCount = 0;
        let unansweredCount = 0;
        let wrongCount = 0;
        
        questionsPG.forEach(q => {
          const studentAns = student.jawaban_pg ? student.jawaban_pg[q.id] : null;
          const correctAns = q.jawaban_benar || q.kunci;
          
          if (!studentAns || String(studentAns).trim() === '') {
            unansweredCount++;
          } else if (correctAns && String(studentAns).trim().toUpperCase() === String(correctAns).trim().toUpperCase()) {
            correctCount++;
          } else {
            wrongCount++;
          }
        });

        const totalQuestions = questionsPG.length;
        const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

        // Format essay answers
        let essayText = '';
        if (questionsUraian && questionsUraian.length > 0) {
          essayText = questionsUraian.map((q, qidx) => {
            const ans = student.jawaban_uraian ? student.jawaban_uraian[q.id] : '';
            return `${qidx + 1}. ${ans || '-'}`;
          }).join('\n');
        } else {
          essayText = '-';
        }

        return {
          'No': idx + 1,
          'NISN': student.nisn,
          'Nama Siswa': student.nama_siswa,
          'Jumlah Soal': totalQuestions,
          'Jawaban Benar': correctCount,
          'Jawaban Salah': wrongCount,
          'Tidak Dikerjakan': unansweredCount,
          'Nilai PG': score,
          'Total Pelanggaran': student.violation_count || 0,
          'Teks Jawaban Uraian': essayText
        };
      });

      // Convert array to worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      
      // Create workbook and append worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil Ujian");

      // Set column widths for better design readability
      const max_widths = [
        { wch: 5 },   // No
        { wch: 15 },  // NISN
        { wch: 25 },  // Nama Siswa
        { wch: 12 },  // Jumlah Soal
        { wch: 15 },  // Jawaban Benar
        { wch: 15 },  // Jawaban Salah
        { wch: 16 },  // Tidak Dikerjakan
        { wch: 10 },  // Nilai PG
        { wch: 18 },  // Total Pelanggaran
        { wch: 50 }   // Teks Jawaban Uraian
      ];
      worksheet['!cols'] = max_widths;

      // Generate Excel file and trigger download using robust Blob array buffer
      const fileName = `Rekap_Hasil_Ujian_${mapelName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = fileName;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      window.URL.revokeObjectURL(url);
      
      showAlert('Berhasil mengekspor semua hasil ujian ke Excel.', 'success');
    } catch (err) {
      showAlert('Terjadi kesalahan saat ekspor Excel: ' + err.message, 'danger');
      console.error(err);
    }
  });
}

// Global variable to store currently loading student for print
let currentStudentForPrint = null;

window.openPrintModal = function(nisn) {
  const student = studentsMap[nisn];
  if (!student) return;

  currentStudentForPrint = student;

  const activeSessionRaw = localStorage.getItem('smartexam_proktor_active_session');
  if (!activeSessionRaw) {
    showAlert("Tidak ada sesi ujian aktif di lokal.", "danger");
    return;
  }

  let session = JSON.parse(activeSessionRaw);
  session = deserializeSession(session);
  const meta = session.metadata || session;
  let questionsPG = [...(session.soal_pg || [])];
  let questionsUraian = [...(session.soal_uraian || [])];

  const paketVal = String(meta.paket || '');
  const isAcak = /b|acak|random/i.test(paketVal);

  if (isAcak && student.nisn) {
    const seed = hashCode(student.nisn);
    questionsPG = shuffleArray(questionsPG, seed);
    questionsUraian = shuffleArray(questionsUraian, seed);
  }

  // Calculate PG score and metrics
  let correctCount = 0;
  let unansweredCount = 0;
  let wrongCount = 0;
  
  questionsPG.forEach(q => {
    const studentAns = student.jawaban_pg ? student.jawaban_pg[q.id] : null;
    const correctAns = q.jawaban_benar || q.kunci;
    
    if (!studentAns || String(studentAns).trim() === '') {
      unansweredCount++;
    } else if (correctAns && String(studentAns).trim().toUpperCase() === String(correctAns).trim().toUpperCase()) {
      correctCount++;
    } else {
      wrongCount++;
    }
  });

  const totalPG = questionsPG.length;
  const pgScore = totalPG > 0 ? Math.round((correctCount / totalPG) * 100) : 0;

  // Populate Modal Content
  let essayListHtml = '';
  if (questionsUraian && questionsUraian.length > 0) {
    essayListHtml = `<h4 style="margin: 1.5rem 0 0.75rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; font-family: var(--font-display); color: var(--text-dark);">Penilaian Jawaban Uraian</h4>`;
    questionsUraian.forEach((q, idx) => {
      const studentAns = student.jawaban_uraian ? student.jawaban_uraian[q.id] : '';
      const correctAns = q.jawaban_benar || q.kunci || '-';
      
      essayListHtml += `
        <div style="background-color: var(--bg-main); padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 1rem;">
          <div style="font-weight: 700; margin-bottom: 0.25rem; color: var(--text-dark);">Soal Uraian ${idx + 1}</div>
          <div style="margin-bottom: 0.5rem; color: var(--text-dark); font-size: 0.9rem;">${q.pertanyaan}</div>
          <div style="margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
            <strong>Kunci Jawaban Guru:</strong> <span style="color: var(--success);">${correctAns}</span>
          </div>
          <div style="margin-bottom: 0.75rem; padding: 0.75rem; background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 0.9rem; border-left: 3px solid var(--secondary); color: var(--text-body);">
            <strong>Jawaban Siswa:</strong> ${studentAns ? studentAns : '<span style="color: var(--danger); font-style: italic;">Tidak Menjawab</span>'}
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-dark);">Skor Uraian (0-100):</label>
            <input type="number" class="essay-score-input" data-qid="${q.id}" min="0" max="100" value="100" style="width: 80px; padding: 0.35rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-weight: 700;" oninput="updateCalculatedScores()">
          </div>
        </div>
      `;
    });
  } else {
    essayListHtml = `<p style="color: var(--text-muted); font-style: italic;">Ujian ini tidak memiliki soal uraian.</p>`;
  }

  const contentDiv = document.getElementById('print-modal-content');
  contentDiv.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; font-size: 0.9rem; color: var(--text-body);">
      <div>
        <div style="margin-bottom: 0.5rem;"><strong>Nama Siswa:</strong> ${escapeHtml(student.nama_siswa)}</div>
        <div style="margin-bottom: 0.5rem;"><strong>NISN:</strong> ${escapeHtml(student.nisn)}</div>
        <div style="margin-bottom: 0.5rem;"><strong>Mata Pelajaran:</strong> ${escapeHtml(meta.mapel_nama)}</div>
      </div>
      <div>
        <div style="margin-bottom: 0.5rem;"><strong>Kelas:</strong> ${escapeHtml(meta.kelas)}</div>
        <div style="margin-bottom: 0.5rem;"><strong>Semester:</strong> ${escapeHtml(meta.semester || '-')}</div>
        <div style="margin-bottom: 0.5rem;"><strong>Catatan Pelanggaran:</strong> <span style="color: ${student.violation_count > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight: 700;">${student.violation_count} kali</span></div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; text-align: center;">
      <div style="border: 1px solid var(--border-color); padding: 0.75rem; border-radius: var(--radius-md); background-color: var(--bg-main);">
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Nilai PG</div>
        <div id="modal-score-pg" style="font-size: 1.75rem; font-weight: 800; color: var(--primary);">${pgScore}</div>
      </div>
      <div style="border: 1px solid var(--border-color); padding: 0.75rem; border-radius: var(--radius-md); background-color: var(--bg-main);">
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Nilai Uraian</div>
        <div id="modal-score-essay" style="font-size: 1.75rem; font-weight: 800; color: var(--secondary);">${questionsUraian.length > 0 ? '100' : '-'}</div>
      </div>
      <div style="border: 1px solid var(--border-color); padding: 0.75rem; border-radius: var(--radius-md); background-color: var(--bg-main); border: 2px solid var(--success);">
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--success); text-transform: uppercase; font-weight: 800;">Nilai Akhir</div>
        <div id="modal-score-final" style="font-size: 1.75rem; font-weight: 800; color: var(--success);">${questionsUraian.length > 0 ? Math.round((pgScore + 100) / 2) : pgScore}</div>
      </div>
    </div>

    ${essayListHtml}
  `;

  // Show print preview modal
  document.getElementById('print-modal-overlay').style.display = 'flex';
  lucide.createIcons();

  // Trigger MathJax LaTeX rendering
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise().catch((err) => console.error("MathJax error:", err));
  }
};

window.updateCalculatedScores = function() {
  const inputs = document.querySelectorAll('.essay-score-input');
  let totalScore = 0;
  let count = 0;
  inputs.forEach(input => {
    let val = parseFloat(input.value);
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;
    if (val > 100) val = 100;
    input.value = val;
    totalScore += val;
    count++;
  });
  
  const pgScore = parseInt(document.getElementById('modal-score-pg').textContent) || 0;
  
  if (count > 0) {
    const avgEssayScore = Math.round(totalScore / count);
    document.getElementById('modal-score-essay').textContent = avgEssayScore;
    document.getElementById('modal-score-final').textContent = Math.round((pgScore + avgEssayScore) / 2);
  } else {
    document.getElementById('modal-score-essay').textContent = '-';
    document.getElementById('modal-score-final').textContent = pgScore;
  }
};

// Close Modal event listeners
const closePrintModalBtn = document.getElementById('btn-close-print-modal');
if (closePrintModalBtn) {
  closePrintModalBtn.addEventListener('click', () => {
    document.getElementById('print-modal-overlay').style.display = 'none';
  });
}

const cancelPrintBtn = document.getElementById('btn-cancel-print');
if (cancelPrintBtn) {
  cancelPrintBtn.addEventListener('click', () => {
    document.getElementById('print-modal-overlay').style.display = 'none';
  });
}

// Print processing
const confirmPrintBtn = document.getElementById('btn-confirm-print');
if (confirmPrintBtn) {
  confirmPrintBtn.addEventListener('click', () => {
    if (!currentStudentForPrint) return;

    const student = currentStudentForPrint;
    const activeSessionRaw = localStorage.getItem('smartexam_proktor_active_session');
    let session = JSON.parse(activeSessionRaw);
    session = deserializeSession(session);
    const meta = session.metadata || session;
    let questionsPG = [...(session.soal_pg || [])];
    let questionsUraian = [...(session.soal_uraian || [])];

    const paketVal = String(meta.paket || '');
    const isAcak = /b|acak|random/i.test(paketVal);

    if (isAcak && student.nisn) {
      const seed = hashCode(student.nisn);
      questionsPG = shuffleArray(questionsPG, seed);
      questionsUraian = shuffleArray(questionsUraian, seed);
    }

    // Calculate PG score and metrics
    let correctCount = 0;
    let unansweredCount = 0;
    let wrongCount = 0;
    
    let pgDetailsHtml = '';
    questionsPG.forEach((q, idx) => {
      const studentAns = student.jawaban_pg ? student.jawaban_pg[q.id] : null;
      const correctAns = q.jawaban_benar || q.kunci;
      
      let isCorrect = false;
      let statusBadge = '';
      
      // Determine display text and choice letter for the report
      let studentAnsText = '(Tidak Dijawab)';
      let correctAnsText = '-';

      if (isAcak && student.nisn) {
        const choiceSeed = hashCode(student.nisn + '_' + q.id);
        let pilihanKeys = Object.keys(q.pilihan || {}).sort();
        pilihanKeys = shuffleArray(pilihanKeys, choiceSeed);

        if (studentAns) {
          const displayIdx = pilihanKeys.indexOf(studentAns);
          if (displayIdx !== -1) {
            const displayLetter = String.fromCharCode(65 + displayIdx);
            studentAnsText = `${displayLetter}. ${q.pilihan[studentAns] || ''}`;
          }
        }
        if (correctAns) {
          const displayIdx = pilihanKeys.indexOf(correctAns);
          if (displayIdx !== -1) {
            const displayLetter = String.fromCharCode(65 + displayIdx);
            correctAnsText = `${displayLetter}. ${q.pilihan[correctAns] || ''}`;
          }
        }
      } else {
        studentAnsText = studentAns ? `${studentAns}. ${q.pilihan[studentAns] || ''}` : '(Tidak Dijawab)';
        correctAnsText = correctAns ? `${correctAns}. ${q.pilihan[correctAns] || ''}` : '-';
      }

      if (!studentAns || String(studentAns).trim() === '') {
        unansweredCount++;
        statusBadge = '<span class="rapot-badge-incorrect">[ Kosong ]</span>';
      } else if (correctAns && String(studentAns).trim().toUpperCase() === String(correctAns).trim().toUpperCase()) {
        correctCount++;
        isCorrect = true;
        statusBadge = '<span class="rapot-badge-correct">[ Benar ]</span>';
      } else {
        wrongCount++;
        statusBadge = '<span class="rapot-badge-incorrect">[ Salah ]</span>';
      }

      pgDetailsHtml += `
        <div class="rapot-soal-item">
          <div class="rapot-soal-header">
            <span>Soal PG ${idx + 1}</span>
            ${statusBadge}
          </div>
          <div class="rapot-soal-text">${q.pertanyaan}</div>
          <div class="rapot-soal-ans">
            <strong>Jawaban Siswa:</strong> ${studentAnsText} <br>
            <strong>Kunci Jawaban:</strong> ${correctAnsText}
          </div>
        </div>
      `;
    });

    const totalPG = questionsPG.length;
    const pgScore = totalPG > 0 ? Math.round((correctCount / totalPG) * 100) : 0;

    // Calculate Essay score and compile details
    let essayDetailsHtml = '';
    let totalEssayScore = 0;
    let essayCount = 0;

    const inputs = document.querySelectorAll('.essay-score-input');
    inputs.forEach((input, idx) => {
      const qid = input.getAttribute('data-qid');
      const score = parseFloat(input.value) || 0;
      
      const q = questionsUraian.find(item => item.id == qid);
      if (q) {
        const studentAns = student.jawaban_uraian ? student.jawaban_uraian[q.id] : '';
        const correctAns = q.jawaban_benar || q.kunci || '-';

        totalEssayScore += score;
        essayCount++;

        essayDetailsHtml += `
          <div class="rapot-soal-item">
            <div class="rapot-soal-header">
              <span>Soal Uraian ${idx + 1}</span>
              <span>Skor: <strong>${score} / 100</strong></span>
            </div>
            <div class="rapot-soal-text">${q.pertanyaan}</div>
            <div class="rapot-soal-ans" style="margin-bottom: 0.5rem;">
              <strong>Kunci Jawaban:</strong> ${correctAns}
            </div>
            <div class="rapot-soal-ans" style="background-color: #f9f9f9; border-left: 3px solid var(--secondary); padding: 0.5rem 0.75rem; border-radius: 4px;">
              <strong>Jawaban Siswa:</strong> ${studentAns ? studentAns : '(Tidak Menjawab)'}
            </div>
          </div>
        `;
      }
    });

    const avgEssayScore = essayCount > 0 ? Math.round(totalEssayScore / essayCount) : 0;
    const finalScore = essayCount > 0 ? Math.round((pgScore + avgEssayScore) / 2) : pgScore;

    const reportDate = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Load configured city name and logos
    const reportCity = localStorage.getItem('smartexam_report_city') || 'Kota Semarang';
    
    const logoType = detectLogoType(session);
    const selectedLogo = getMadrasahLogoUrl(logoType, meta.madrasah);

    let logoHtml = '';
    if (selectedLogo) {
      logoHtml = `<img class="rapot-logo-img" src="${selectedLogo}" alt="Logo Madrasah">`;
    } else {
      // Default AmanaExam SVG Logo
      logoHtml = getAmanaLogoSvg('amanaShieldGradRapot', 'amanaGoldGradRapot', '60px', '60px')
        .replace('class="amana-logo"', 'class="rapot-logo-img" style="opacity: 0.95; width: 60px; height: 60px;"');
    }

    const rapotHtml = `
      <div class="rapot-doc">
        <div class="rapot-kop" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 3px double #000000; padding-bottom: 0.75rem; margin-bottom: 1.5rem;">
          <div class="rapot-logo-container">
            ${logoHtml}
          </div>
          <div style="flex-grow: 1; text-align: center; padding: 0 1rem;">
            <div style="font-weight: 800; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px;">
              Kementerian Agama Republik Indonesia
            </div>
            <div style="font-weight: 900; font-size: 1.35rem; text-transform: uppercase; margin: 0.2rem 0; letter-spacing: 0.5px;">
              ${escapeHtml(meta.madrasah || 'MADRASAH ALIYAH')}
            </div>
            <div style="font-size: 0.8rem; color: #333333; font-weight: 500;">
              Laporan Hasil Penilaian Akhir Semester Online (CBT)
            </div>
          </div>
          <div style="width: 75px; flex-shrink: 0;"></div> <!-- Dummy offset to balance logo for centering -->
        </div>

        <div class="rapot-kop-title">
          Laporan Hasil Evaluasi Belajar Siswa
        </div>

        <div class="rapot-identitas">
          <div>
            <div class="rapot-row">
              <span class="rapot-label">Nama Siswa</span>
              <span class="rapot-titikdua">:</span>
              <span class="rapot-value" style="font-weight: bold; text-transform: uppercase;">${escapeHtml(student.nama_siswa)}</span>
            </div>
            <div class="rapot-row">
              <span class="rapot-label">NISN Siswa</span>
              <span class="rapot-titikdua">:</span>
              <span class="rapot-value">${escapeHtml(student.nisn)}</span>
            </div>
            <div class="rapot-row">
              <span class="rapot-label">Kelas / Semester</span>
              <span class="rapot-titikdua">:</span>
              <span class="rapot-value">${escapeHtml(meta.kelas)} / ${escapeHtml(meta.semester)}</span>
            </div>
          </div>
          <div>
            <div class="rapot-row">
              <span class="rapot-label">Mata Pelajaran</span>
              <span class="rapot-titikdua">:</span>
              <span class="rapot-value">${escapeHtml(meta.mapel_nama)}</span>
            </div>
            <div class="rapot-row">
              <span class="rapot-label">Guru Pengampu</span>
              <span class="rapot-titikdua">:</span>
              <span class="rapot-value">${escapeHtml(meta.guru)}</span>
            </div>
            <div class="rapot-row">
              <span class="rapot-label">Tanggal Cetak</span>
              <span class="rapot-titikdua">:</span>
              <span class="rapot-value">${reportDate}</span>
            </div>
          </div>
        </div>

        <div class="rapot-summary-box">
          <div class="rapot-summary-card">
            <div class="rapot-summary-label">Nilai PG</div>
            <div class="rapot-summary-val">${pgScore}</div>
          </div>
          <div class="rapot-summary-card">
            <div class="rapot-summary-label">Nilai Uraian</div>
            <div class="rapot-summary-val">${essayCount > 0 ? avgEssayScore : '-'}</div>
          </div>
          <div class="rapot-summary-card" style="border: 2px solid #000000; background-color: #f5f5f5;">
            <div class="rapot-summary-label" style="color: #000000; font-weight: 800;">Nilai Akhir</div>
            <div class="rapot-summary-val" style="font-weight: 900;">${finalScore}</div>
          </div>
          <div class="rapot-summary-card">
            <div class="rapot-summary-label">Total Pelanggaran</div>
            <div class="rapot-summary-val" style="color: ${student.violation_count > 0 ? '#991b1b' : 'inherit'}; font-weight: bold;">${student.violation_count} / 3</div>
          </div>
        </div>

        <div class="rapot-section-title">Detail Soal Pilihan Ganda (PG)</div>
        <div>
          ${pgDetailsHtml}
        </div>

        ${essayCount > 0 ? `
          <div class="print-page-break"></div>
          <div class="rapot-section-title" style="margin-top: 2rem;">Detail Soal Uraian / Esai</div>
          <div>
            ${essayDetailsHtml}
          </div>
        ` : ''}

        <div style="margin-top: 4rem; display: flex; justify-content: space-between; font-size: 0.9rem; page-break-inside: avoid;">
          <div style="text-align: center; width: 220px;">
            Mengetahui,<br>Orang Tua / Wali Siswa
            <div style="margin-top: 4rem; border-bottom: 1px solid #000000; font-weight: bold; height: 20px;"></div>
          </div>
          <div style="text-align: center; width: 220px;">
            ${reportCity}, ${reportDate}<br>Guru Pengampu,
            <div style="margin-top: 4rem; border-bottom: 1px solid #000000; font-weight: bold;">${escapeHtml(meta.guru)}</div>
            NIP. ......................................
          </div>
        </div>
      </div>
    `;

    document.getElementById('print-report-container').innerHTML = rapotHtml;
    document.getElementById('print-modal-overlay').style.display = 'none';

    // Set dynamic document title for print filename
    const originalTitle = document.title;
    const cleanForFilename = (str) => {
      return (str || '').toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    };
    const printTitle = `${cleanForFilename(meta.kelas)}-${cleanForFilename(student.nama_siswa)}-${cleanForFilename(meta.mapel_nama)}`;
    document.title = printTitle;

    // Restore original title after printing
    window.addEventListener('afterprint', function restoreTitle() {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restoreTitle);
    });

    // Wait for MathJax to compile formulas in the printed document before printing
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise()
        .then(() => {
          setTimeout(() => {
            window.print();
          }, 250);
        })
        .catch((err) => {
          console.error("MathJax print typesetting error:", err);
          setTimeout(() => {
            window.print();
          }, 250);
        });
    } else {
      setTimeout(() => {
        window.print();
      }, 250);
    }
  });
}

// Initialize Global Print Settings (City name and Logo Uploads)
function initPrintSettings() {
  const cityInput = document.getElementById('global-city-input');
  const mtsFileInput = document.getElementById('logo-mts-file');
  const maFileInput = document.getElementById('logo-ma-file');
  const removeMtsBtn = document.getElementById('btn-remove-logo-mts');
  const removeMaBtn = document.getElementById('btn-remove-logo-ma');

  // 1. Load city name
  const savedCity = localStorage.getItem('smartexam_report_city') || 'Kota Semarang';
  if (cityInput) {
    cityInput.value = savedCity;
    cityInput.addEventListener('input', () => {
      localStorage.setItem('smartexam_report_city', cityInput.value.trim());
    });
  }

  // Helper to update logo preview
  const updateLogoPreview = (type, base64Data) => {
    const previewContainer = document.getElementById(`logo-${type}-preview-container`);
    const removeBtn = document.getElementById(`btn-remove-logo-${type}`);
    
    if (!previewContainer) return;
    
    const defaultLogo = type === 'mts' ? 'logo mts Alkhoir.png' : 'logo MA Alkhoir.jpg';
    const logoUrl = base64Data || defaultLogo;
    
    if (logoUrl) {
      previewContainer.innerHTML = `<img src="${logoUrl}" style="width: 100%; height: 100%; object-fit: contain;" alt="Logo ${type.toUpperCase()}">`;
      if (removeBtn) {
        removeBtn.style.display = base64Data ? 'block' : 'none';
      }
    }
  };

  // 2. Load logos from localStorage
  const savedMtsLogo = localStorage.getItem('smartexam_logo_mts');
  const savedMaLogo = localStorage.getItem('smartexam_logo_ma');
  
  updateLogoPreview('mts', savedMtsLogo);
  updateLogoPreview('ma', savedMaLogo);

  // Handle File Uploads
  const handleLogoUpload = (fileInput, type) => {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Check file type
      if (!file.type.startsWith('image/')) {
        showAlert("File harus berupa gambar!", "danger");
        fileInput.value = '';
        return;
      }

      // Check size (Max 1MB)
      if (file.size > 1 * 1024 * 1024) {
        showAlert("Ukuran gambar maksimal 1MB!", "danger");
        fileInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target.result;
        try {
          localStorage.setItem(`smartexam_logo_${type}`, base64Data);
          updateLogoPreview(type, base64Data);
          showAlert(`Logo ${type.toUpperCase()} berhasil diperbarui!`, "success");
        } catch (err) {
          console.error(err);
          showAlert("Gagal menyimpan logo. Penyimpanan browser penuh.", "danger");
        }
      };
      reader.readAsDataURL(file);
    });
  };

  if (mtsFileInput) handleLogoUpload(mtsFileInput, 'mts');
  if (maFileInput) handleLogoUpload(maFileInput, 'ma');

  // Handle Logo Removals
  if (removeMtsBtn) {
    removeMtsBtn.addEventListener('click', () => {
      localStorage.removeItem('smartexam_logo_mts');
      updateLogoPreview('mts', null);
      if (mtsFileInput) mtsFileInput.value = '';
      showAlert("Logo MTs berhasil dihapus.", "success");
    });
  }

  if (removeMaBtn) {
    removeMaBtn.addEventListener('click', () => {
      localStorage.removeItem('smartexam_logo_ma');
      updateLogoPreview('ma', null);
      if (maFileInput) maFileInput.value = '';
      showAlert("Logo MA berhasil dihapus.", "success");
    });
  }
}

// Proctor Password Hashing helper (SHA-256)
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Check if proktor is authenticated on load
const proktorLoginOverlay = document.getElementById('proktor-login-overlay');
const proktorLoginForm = document.getElementById('proktor-login-form');
const proktorPasswordInput = document.getElementById('proktor-password');
const gatekeeperErrorMsg = document.getElementById('gatekeeper-error-msg');
const btnTogglePwd = document.getElementById('gatekeeper-toggle-pwd');

if (sessionStorage.getItem('smartexam_proktor_logged_in') === 'true') {
  if (proktorLoginOverlay) proktorLoginOverlay.style.display = 'none';
} else {
  if (proktorLoginOverlay) proktorLoginOverlay.style.display = 'flex';
}

// Toggle password visibility
if (btnTogglePwd && proktorPasswordInput) {
  btnTogglePwd.addEventListener('click', () => {
    const type = proktorPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    proktorPasswordInput.setAttribute('type', type);
    if (type === 'text') {
      btnTogglePwd.innerHTML = '<i data-lucide="eye-off" style="width: 20px; height: 20px;"></i>';
    } else {
      btnTogglePwd.innerHTML = '<i data-lucide="eye" style="width: 20px; height: 20px;"></i>';
    }
    lucide.createIcons();
  });
}

// Handle Proctor Login form submit
if (proktorLoginForm) {
  proktorLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwdVal = proktorPasswordInput.value;
    const hash = await sha256(pwdVal);
    
    // Target hash for 'amana123'
    if (hash === '37727923faa2385716694989ac2654b352d0ced5aa78ab542047c6ed87559a15') {
      sessionStorage.setItem('smartexam_proktor_logged_in', 'true');
      sessionStorage.setItem('smartexam_proktor_password', pwdVal);
      
      if (proktorLoginOverlay) proktorLoginOverlay.style.display = 'none';
      
      // Re-initialize supabaseClient with custom header for RLS bypass
      recreateSupabaseClient({
        'x-proktor-password': pwdVal
      });
      
      // Reload dashboard data
      showAlert('Login Proktor Berhasil!', 'success');
      loadActiveSession();
    } else {
      if (gatekeeperErrorMsg) gatekeeperErrorMsg.style.display = 'flex';
      proktorPasswordInput.value = '';
      proktorPasswordInput.focus();
    }
  });
}

// Handle proktor logout
const btnProktorLogout = document.getElementById('btn-proktor-logout');
if (btnProktorLogout) {
  btnProktorLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    const confirmLogout = await showCustomConfirm("Apakah Anda yakin ingin keluar dari Dashboard Proktor?");
    if (confirmLogout) {
      sessionStorage.removeItem('smartexam_proktor_logged_in');
      sessionStorage.removeItem('smartexam_proktor_password');
      window.location.reload();
    }
  });
}

// ==========================================
// HISTORY TAB & LOGIC
// ==========================================
const btnTabMonitor = document.getElementById('btn-tab-monitor');
const btnTabHistory = document.getElementById('btn-tab-history');
const tabMonitor = document.getElementById('tab-monitor');
const tabHistory = document.getElementById('tab-history');

if (btnTabMonitor && btnTabHistory) {
  btnTabMonitor.addEventListener('click', () => {
    btnTabMonitor.classList.add('active');
    btnTabMonitor.style.borderBottomColor = 'var(--primary)';
    btnTabMonitor.style.color = 'var(--primary)';
    
    btnTabHistory.classList.remove('active');
    btnTabHistory.style.borderBottomColor = 'transparent';
    btnTabHistory.style.color = 'var(--text-muted)';
    
    if(tabMonitor) tabMonitor.style.display = 'block';
    if(tabHistory) tabHistory.style.display = 'none';
  });

  btnTabHistory.addEventListener('click', () => {
    btnTabHistory.classList.add('active');
    btnTabHistory.style.borderBottomColor = 'var(--primary)';
    btnTabHistory.style.color = 'var(--primary)';
    
    btnTabMonitor.classList.remove('active');
    btnTabMonitor.style.borderBottomColor = 'transparent';
    btnTabMonitor.style.color = 'var(--text-muted)';
    
    if(tabMonitor) tabMonitor.style.display = 'none';
    if(tabHistory) tabHistory.style.display = 'block';
    
    loadHistorySessions();
  });
}

const historyTableBody = document.getElementById('history-table-body');
const btnRefreshHistory = document.getElementById('btn-refresh-history');

if (btnRefreshHistory) {
  btnRefreshHistory.addEventListener('click', loadHistorySessions);
}

async function loadHistorySessions() {
  if (!supabaseClient) {
    showAlert('Koneksi Supabase tidak tersedia.', 'danger');
    return;
  }
  
  if(historyTableBody) {
    historyTableBody.innerHTML = `<tr>
      <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
        <i data-lucide="loader" style="width: 24px; height: 24px; display: block; margin: 0 auto 0.5rem; color: var(--text-muted); animation: spin 2s linear infinite;"></i>
        Memuat data riwayat...
      </td>
    </tr>`;
  }
  lucide.createIcons();

  try {
    const { data, error } = await supabaseClient
      .from('ujian_aktif')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if(historyTableBody) historyTableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: var(--danger); text-align: center; padding: 1rem;">Gagal memuat: ${escapeHtml(error.message)}</td></tr>`;
      return;
    }

    if (!data || data.length === 0) {
      if(historyTableBody) historyTableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: var(--text-muted); text-align: center; padding: 2rem;">Belum ada riwayat ujian di cloud.</td></tr>`;
      return;
    }

    if(historyTableBody) historyTableBody.innerHTML = '';
    data.forEach((session, index) => {
      const tr = document.createElement('tr');
      const statusText = session.is_active ? '<span class="badge badge-success" style="background-color: #d1fae5; color: #065f46;">Aktif</span>' : '<span class="badge badge-warning" style="background-color: #fef3c7; color: #92400e;">Ditutup</span>';
      const mapelStr = escapeHtml(session.id);
      
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><code style="font-size: 0.85rem; color: var(--text-muted);">${mapelStr}</code></td>
        <td>${escapeHtml(session.madrasah || '-')}</td>
        <td><strong>${escapeHtml(session.mapel_nama || '-')}</strong></td>
        <td>${escapeHtml(session.kelas || '-')}</td>
        <td>${statusText}</td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 0.25rem; justify-content: center;">
            <button class="btn btn-secondary" onclick="viewHistorySession('${mapelStr}')" title="Lihat Data Siswa" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;"><i data-lucide="eye" style="width: 14px; height: 14px;"></i></button>
            <button class="btn btn-secondary" onclick="downloadHistorySession('${mapelStr}')" title="Download JSON Arsip" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;"><i data-lucide="download" style="width: 14px; height: 14px;"></i></button>
            <button class="btn btn-danger" onclick="confirmDeleteHistory('${mapelStr}')" title="Hapus Sesi Permanen" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
          </div>
        </td>
      `;
      if(historyTableBody) historyTableBody.appendChild(tr);
    });
    lucide.createIcons();
  } catch (err) {
    if(historyTableBody) historyTableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: var(--danger); text-align: center; padding: 1rem;">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

window.viewHistorySession = async function(mapelId) {
  if (!supabaseClient) return;
  
  showAlert('Sedang memuat data arsip siswa untuk ' + escapeHtml(mapelId) + '...', 'info');
  
  try {
    const { data: sessionData, error: sessionErr } = await supabaseClient
      .from('ujian_aktif')
      .select('*')
      .eq('id', mapelId)
      .single();

    if (sessionErr) throw sessionErr;

    const { data: answersData, error: ansErr } = await supabaseClient
      .from('jawaban_siswa')
      .select('*')
      .eq('mapel_id', mapelId);

    if (ansErr) throw ansErr;

    // Switch to tab monitor
    if(btnTabMonitor) btnTabMonitor.click();
    
    // Scroll to the Live Monitor card
    setTimeout(() => {
      const monitorCard = document.getElementById('live-monitor-card');
      if (monitorCard) {
        monitorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    
    // Unsubscribe from active realtime if any
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }

    isOfflineArchiveMode = true;
    
    // Show banner
    const offlineBanner = document.getElementById('offline-archive-banner');
    if (offlineBanner) offlineBanner.style.display = 'flex';

    // Populate data
    let sessionConfig = sessionData;
    idUjianAktif = sessionConfig.id; // temporary override
    
    // Populate session info UI
    valMapelId.textContent = escapeHtml(idUjianAktif || '-');
    valMadrasah.textContent = escapeHtml(sessionConfig.madrasah || '-');
    valMapel.textContent = escapeHtml(sessionConfig.mapel_nama || '-');
    valKelas.textContent = escapeHtml(sessionConfig.kelas || '-');
    const tahunStr = sessionConfig.tahun || '||';
    const tahunParts = tahunStr.split('|');
    valSemesterTp.textContent = escapeHtml(`${tahunParts[1] || '-'} / ${tahunParts[0] || '-'}`);
    valPaket.textContent = escapeHtml(sessionConfig.paket || '-');
    valGuru.textContent = escapeHtml(tahunParts[2] || '-');
    valDurasi.textContent = escapeHtml(sessionConfig.waktu_menit || '0');
    valSoalPg.textContent = sessionConfig.soal_pg ? sessionConfig.soal_pg.length : 0;
    valSoalUraian.textContent = sessionConfig.soal_uraian ? sessionConfig.soal_uraian.length : 0;

    // Update subtitle
    const subtitle = document.getElementById('session-header-subtitle');
    if (subtitle) subtitle.textContent = `${sessionConfig.mapel_nama || ''} (Kelas ${sessionConfig.kelas || ''})`;

    const monitorSubtitle = document.getElementById('live-monitor-subtitle');
    if (monitorSubtitle) {
      let dateText = '';
      if (sessionConfig.created_at) {
         const dateObj = new Date(sessionConfig.created_at);
         dateText = ' - ' + dateObj.toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute:'2-digit'}) + ' WIB';
      }
      monitorSubtitle.textContent = `${sessionConfig.mapel_nama || ''} (Kelas ${sessionConfig.kelas || ''})${dateText}`;
      monitorSubtitle.style.display = 'block';
    }

    noSessionContent.style.display = 'none';
    sessionActiveContent.style.display = 'block';

    studentsMap = {};
    if (answersData) {
      answersData.forEach(student => {
        studentsMap[student.nisn] = student;
      });
    }

    renderMonitorTable();

    monitorCount.textContent = `${answersData ? answersData.length : 0} Siswa (Arsip Offline)`;
    monitorCount.className = 'badge';
    monitorCount.style.backgroundColor = 'var(--secondary)';
    monitorCount.style.color = '#ffffff';

    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) btnExportExcel.disabled = false;

    // Build temporary localStorage config for offline mode print
    let meta = {
      madrasah: sessionConfig.madrasah,
      mapel_nama: sessionConfig.mapel_nama,
      kelas: sessionConfig.kelas,
      semester: tahunParts[1] || '',
      tahun: tahunParts[0] || '',
      guru: tahunParts[2] || '',
      paket: sessionConfig.paket,
      waktu_menit: sessionConfig.waktu_menit
    };
    let localConfig = {
      id: idUjianAktif,
      metadata: meta,
      soal_pg: sessionConfig.soal_pg,
      soal_uraian: sessionConfig.soal_uraian,
      is_active: sessionConfig.is_active
    };

    // Save real active session if we haven't already
    if (!sessionStorage.getItem('smartexam_real_active_session')) {
      const currentActive = localStorage.getItem('smartexam_proktor_active_session');
      if (currentActive) {
        sessionStorage.setItem('smartexam_real_active_session', currentActive);
      } else {
        sessionStorage.setItem('smartexam_real_active_session', 'NONE');
      }
    }

    localStorage.setItem('smartexam_proktor_active_session', JSON.stringify(localConfig));
    
    showAlert('Berhasil memuat ' + (answersData ? answersData.length : 0) + ' data siswa dalam Mode Arsip.', 'success');

  } catch (err) {
    showAlert('Gagal memuat arsip: ' + escapeHtml(err.message), 'danger');
  }
}

window.downloadHistorySession = async function(mapelId) {
  if (!supabaseClient) return;
  showAlert('Sedang memproses unduhan arsip ' + escapeHtml(mapelId) + '...', 'info');

  try {
    const { data: sessionData, error: sessionErr } = await supabaseClient
      .from('ujian_aktif')
      .select('*')
      .eq('id', mapelId)
      .single();

    if (sessionErr) throw sessionErr;

    const { data: answersData, error: ansErr } = await supabaseClient
      .from('jawaban_siswa')
      .select('*')
      .eq('mapel_id', mapelId);

    if (ansErr) throw ansErr;

    const archivePayload = {
      export_type: 'smartexam_archive',
      export_date: new Date().toISOString(),
      active_session: sessionData,
      jawaban_siswa: answersData || []
    };

    const classSanitized = (sessionData.kelas || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const mapelSanitized = (sessionData.mapel_nama || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const tahunStr = sessionData.tahun || '||';
    const tahunParts = tahunStr.split('|');
    const tahunSanitized = (tahunParts[0] || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `arsip-${classSanitized}-${mapelSanitized}-${tahunSanitized}.json`.toLowerCase();

    const jsonString = JSON.stringify(archivePayload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = fileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    window.URL.revokeObjectURL(url);

    showAlert(`Berhasil mengunduh arsip cadangan: ${fileName}`, 'success');
  } catch (err) {
    showAlert('Terjadi kesalahan saat mengunduh arsip: ' + escapeHtml(err.message), 'danger');
  }
}

let mapelToDelete = null;
const deleteHistoryModal = document.getElementById('delete-history-modal');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const deletePasswordInput = document.getElementById('delete-password-input');
const deleteErrorMsg = document.getElementById('delete-error-msg');

window.confirmDeleteHistory = function(mapelId) {
  mapelToDelete = mapelId;
  if(deletePasswordInput) deletePasswordInput.value = '';
  if(deleteErrorMsg) deleteErrorMsg.style.display = 'none';
  if(deleteHistoryModal) deleteHistoryModal.style.display = 'flex';
}

if (btnCancelDelete) {
  btnCancelDelete.addEventListener('click', () => {
    if(deleteHistoryModal) deleteHistoryModal.style.display = 'none';
    mapelToDelete = null;
  });
}

if (btnConfirmDelete) {
  btnConfirmDelete.addEventListener('click', async () => {
    const pwd = deletePasswordInput ? deletePasswordInput.value : '';
    if (pwd !== 'amana123') {
      if(deleteErrorMsg) deleteErrorMsg.style.display = 'block';
      if(deletePasswordInput) deletePasswordInput.focus();
      return;
    }

    if(deleteErrorMsg) deleteErrorMsg.style.display = 'none';
    if (!mapelToDelete || !supabaseClient) return;

    btnConfirmDelete.disabled = true;
    btnConfirmDelete.innerHTML = '<i data-lucide="loader" style="width: 14px; height: 14px; animation: spin 2s linear infinite;"></i> Menghapus...';
    lucide.createIcons();

    try {
      // Hapus data jawaban siswa
      await supabaseClient.from('jawaban_siswa').delete().eq('mapel_id', mapelToDelete);
      
      // Hapus sesi ujian
      const { error } = await supabaseClient.from('ujian_aktif').delete().eq('id', mapelToDelete);

      if (error) throw error;

      showAlert('Sesi ujian berhasil dihapus permanen.', 'success');
      if(deleteHistoryModal) deleteHistoryModal.style.display = 'none';
      loadHistorySessions();
      
      // Jika sesi yang dihapus sedang dibuka (mode offline) atau adalah sesi aktif, reset
      if (idUjianAktif === mapelToDelete) {
          isOfflineArchiveMode = false;
          const offlineBanner = document.getElementById('offline-archive-banner');
          if (offlineBanner) offlineBanner.style.display = 'none';
          localStorage.removeItem('smartexam_proktor_active_session');
          loadActiveSession();
      }

    } catch (err) {
      showAlert('Gagal menghapus sesi: ' + escapeHtml(err.message), 'danger');
    } finally {
      btnConfirmDelete.disabled = false;
      btnConfirmDelete.innerHTML = 'Hapus Permanen';
      mapelToDelete = null;
    }
  });
}

// Init load on launch
initPrintSettings();
if (sessionStorage.getItem('smartexam_proktor_logged_in') === 'true') {
  loadActiveSession();
} else {
  showNoSession();
}
