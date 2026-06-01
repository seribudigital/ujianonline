// Initialize Lucide Icons
lucide.createIcons();

// DOM References
const studentPill = document.getElementById('student-pill');
const studentNamePill = document.getElementById('student-name-pill');
const studentNisnPill = document.getElementById('student-nisn-pill');
const btnLogout = document.getElementById('btn-logout');

const kopMadrasah = document.getElementById('kop-madrasah');
const kopJenisUjian = document.getElementById('kop-jenis-ujian');
const identitasMapel = document.getElementById('identitas-mapel');
const identitasKelasPaket = document.getElementById('identitas-kelas-paket');
const identitasSemesterTp = document.getElementById('identitas-semester-tp');
const identitasGuru = document.getElementById('identitas-guru');

const identitasStudentNama = document.getElementById('identitas-student-nama');
const identitasStudentNisn = document.getElementById('identitas-student-nisn');
const identitasDurasi = document.getElementById('identitas-durasi');

const timerHour = document.getElementById('timer-hour');
const timerMin = document.getElementById('timer-min');
const timerSec = document.getElementById('timer-sec');
const timerDisplay = document.getElementById('timer-display');
const timerAlertLabel = document.getElementById('timer-alert-label');

const soalContainer = document.getElementById('soal-container');
const navGrid = document.getElementById('nav-grid');
const answeredBadge = document.getElementById('answered-badge');

const btnSubmitExamBottom = document.getElementById('btn-submit-exam-bottom');
const btnSubmitExamSidebar = document.getElementById('btn-submit-exam-sidebar');

// Overlay DOMs
const startOverlay = document.getElementById('start-overlay');
const startExamMetaLabel = document.getElementById('start-exam-meta-label');
const btnStartExam = document.getElementById('btn-start-exam');

const fullscreenBlockOverlay = document.getElementById('fullscreen-block-overlay');
const btnRestoreFullscreen = document.getElementById('btn-restore-fullscreen');

const warningModalOverlay = document.getElementById('warning-modal-overlay');
const warningModalMessage = document.getElementById('warning-modal-message');
const btnCloseWarning = document.getElementById('btn-close-warning');

const lockOverlay = document.getElementById('lock-overlay');
const lockTitle = document.getElementById('lock-title');
const lockMessage = document.getElementById('lock-message');
const lockIconContainer = document.getElementById('lock-icon-container');
const lockIconGraphic = document.getElementById('lock-icon-graphic');

const lockValNama = document.getElementById('lock-val-nama');
const lockValNisn = document.getElementById('lock-val-nisn');
const lockValPelanggaran = document.getElementById('lock-val-pelanggaran');
const lockValTerisi = document.getElementById('lock-val-terisi');
const lockValMapel = document.getElementById('lock-val-mapel');
const lockValWaktu = document.getElementById('lock-val-waktu');
const btnReturnLogin = document.getElementById('btn-return-login');

const mainExamView = document.getElementById('main-exam-view');

// Global session state
let activeSession = null;
let studentSession = null;
let questionsList = []; // Normalized questions
let timerInterval = null;
let examStarted = false;
let examSubmitted = false;
let isTabAway = false; // Debounce flag for tab visibility trigger

// Student Answers State (loaded from localStorage on init)
let jawabanSiswa = {
  pg: {},
  uraian: {}
};

// Load session data
function loadSessionData() {
  const activeSessionRaw = localStorage.getItem('smartexam_active_session');
  const studentSessionRaw = localStorage.getItem('smartexam_student_session');
  const submittedRaw = localStorage.getItem('smartexam_exam_submitted');

  // If active session or student session doesn't exist, redirect to login
  if (!activeSessionRaw || !studentSessionRaw) {
    window.location.href = 'siswa-login.html';
    return false;
  }

  try {
    activeSession = JSON.parse(activeSessionRaw);
    studentSession = JSON.parse(studentSessionRaw);
    
    if (submittedRaw === 'true') {
      examSubmitted = true;
    }
    
    return true;
  } catch (e) {
    console.error("Gagal memuat sesi data", e);
    localStorage.removeItem('smartexam_student_session');
    window.location.href = 'siswa-login.html';
    return false;
  }
}

// Initialize layout and parameters
async function initExam() {
  if (!loadSessionData()) return;

  // Reinitialize supabaseClient with student NISN header for RLS
  if (studentSession && studentSession.nisn) {
    recreateSupabaseClient({
      'x-student-nisn': studentSession.nisn
    });
  }

  // Force fetch active session from Supabase to ensure guru and semester metadata are always fresh
  if (supabaseClient && activeSession && activeSession.id) {
    try {
      const { data, error } = await supabaseClient
        .from('view_soal_siswa')
        .select('*')
        .eq('id', activeSession.id)
        .maybeSingle();

      if (data) {
        activeSession = data;
        localStorage.setItem('smartexam_active_session', JSON.stringify(data));
      }
    } catch (e) {
      console.error("Gagal sinkronisasi data aktif dari Supabase:", e);
    }
  }

  const meta = activeSession.metadata ? activeSession.metadata : activeSession;

  // Deserialize year, semester, and guru from the tahun column if serialized
  if (meta.tahun && typeof meta.tahun === 'string' && meta.tahun.includes('|')) {
    const parts = meta.tahun.split('|');
    meta.tahun = parts[0] || '';
    meta.semester = parts[1] || '-';
    meta.guru = parts[2] || '-';
  }

  // Populate Top bar
  studentNamePill.textContent = studentSession.nama;
  studentNisnPill.textContent = `NISN: ${studentSession.nisn}`;

  // Populate Letterhead (Kop Surat) & Metadata Box
  kopMadrasah.textContent = meta.madrasah || 'MADRASAH ALIYAH';
  
  // Populate dynamic school logo
  displayMadrasahLogo('kop-logo-container', activeSession, 'amanaShieldGradKop', 'amanaGoldGradKop');

  if (meta.semester && meta.tahun) {
    kopJenisUjian.textContent = `UJIAN SEMESTER ${meta.semester.toUpperCase()} TAHUN PELAJARAN ${meta.tahun}`;
  }
  
  identitasMapel.textContent = meta.mapel_nama || '-';
  identitasKelasPaket.textContent = `${meta.kelas || '-'} / Paket ${meta.paket || 'A'}`;
  identitasSemesterTp.textContent = `${meta.semester || '-'} / ${meta.tahun || '-'}`;
  identitasGuru.textContent = meta.guru || '-';

  identitasStudentNama.textContent = studentSession.nama;
  identitasStudentNisn.textContent = studentSession.nisn;
  identitasDurasi.textContent = `${meta.waktu_menit || '0'} Menit`;

  // Load existing answers from local storage
  const savedAnswers = localStorage.getItem('smartexam_jawaban_siswa');
  if (savedAnswers) {
    try {
      jawabanSiswa = JSON.parse(savedAnswers);
      // Safety structure fallback
      if (!jawabanSiswa.pg) jawabanSiswa.pg = {};
      if (!jawabanSiswa.uraian) jawabanSiswa.uraian = {};
    } catch (e) {
      console.error("Gagal mengurai jawaban tersimpan", e);
    }
  }

  // Check if already submitted previously
  if (examSubmitted) {
    const storedType = localStorage.getItem('smartexam_exam_submit_type') || 'manual';
    showSubmittedOverlay(storedType);
    return;
  }

  // Prepare and normalize questions list (PG then Essays)
  let currentGlobalIndex = 1;
  const soalPgList = activeSession.soal_pg || [];
  const soalUraianList = activeSession.soal_uraian || [];

  // Loop PG
  soalPgList.forEach((q) => {
    questionsList.push({
      globalIndex: currentGlobalIndex++,
      type: 'pg',
      id: q.id,
      pertanyaan: q.pertanyaan,
      pilihan: q.pilihan || {},
      bobot: q.bobot || 'Mudah',
      bab: q.bab || 'Umum'
    });
  });

  // Loop Essays
  soalUraianList.forEach((q) => {
    questionsList.push({
      globalIndex: currentGlobalIndex++,
      type: 'uraian',
      id: q.id,
      pertanyaan: q.pertanyaan,
      bobot: q.bobot || 'Sedang',
      bab: q.bab || 'Umum'
    });
  });

  // Render items
  renderQuestions();
  renderNavigationGrid();
  updateAnswerProgress();

  // Show Landing Screen start-exam overlay to trigger programmatic fullscreen
  startExamMetaLabel.textContent = `Mata Pelajaran: ${meta.mapel_nama} | Kelas: ${meta.kelas} | Durasi: ${meta.waktu_menit} Menit`;
  startOverlay.style.display = 'flex';
  
  // Hook anti-cheating events (keyboard blocker, click blocker)
  hookAntiCheatKeyboards();
}

// Start Exam click trigger (User gesture)
btnStartExam.addEventListener('click', () => {
  examStarted = true;
  startOverlay.style.display = 'none';
  mainExamView.style.display = 'block';

  // Enter fullscreen
  enterFullscreen();

  // Start Countdown Timer
  const meta = activeSession.metadata ? activeSession.metadata : activeSession;
  startCountdown(parseInt(meta.waktu_menit) || 90);

  // Trigger LaTeX Rendering via MathJax
  triggerMathJaxRendering();

  // Hook Focus detection for tab switching
  hookTabFocusMonitoring();
});

// Enter Fullscreen mode
function enterFullscreen() {
  const docEl = document.documentElement;
  try {
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen();
    } else if (docEl.webkitRequestFullscreen) { /* Safari */
      docEl.webkitRequestFullscreen();
    } else if (docEl.msRequestFullscreen) { /* IE11 */
      docEl.msRequestFullscreen();
    }
  } catch (err) {
    console.error("Gagal masuk mode fullscreen:", err);
  }
}

// Monitor Fullscreen changes
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('msfullscreenchange', handleFullscreenChange);

function handleFullscreenChange() {
  if (!examStarted || examSubmitted) return;

  const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
  
  if (!isFullscreen) {
    // Exited fullscreen, show red overlay blocker
    fullscreenBlockOverlay.style.display = 'flex';
  } else {
    // Entered fullscreen, hide overlay blocker
    fullscreenBlockOverlay.style.display = 'none';
  }
}

btnRestoreFullscreen.addEventListener('click', () => {
  enterFullscreen();
});

// Start Countdown Timer
function startCountdown(durationMinutes) {
  // Calculate or read exam end time from local storage
  let examEndTime = localStorage.getItem('smartexam_exam_end_time');
  
  if (!examEndTime) {
    examEndTime = Date.now() + (durationMinutes * 60 * 1000);
    localStorage.setItem('smartexam_exam_end_time', examEndTime);
  } else {
    examEndTime = parseInt(examEndTime);
  }

  function updateTimer() {
    const remainingMs = examEndTime - Date.now();
    
    if (remainingMs <= 0) {
      clearInterval(timerInterval);
      timerHour.textContent = '00';
      timerMin.textContent = '00';
      timerSec.textContent = '00';
      // Auto-submit exam on timeout
      submitUjian(true, 'timer_expired');
      return;
    }

    const remainingSec = Math.floor(remainingMs / 1000);
    const hrs = Math.floor(remainingSec / 3600);
    const mins = Math.floor((remainingSec % 3600) / 60);
    const secs = remainingSec % 60;

    timerHour.textContent = String(hrs).padStart(2, '0');
    timerMin.textContent = String(mins).padStart(2, '0');
    timerSec.textContent = String(secs).padStart(2, '0');

    // Urgency color (under 5 minutes)
    if (remainingSec < 300) {
      timerDisplay.style.color = 'var(--danger)';
      timerAlertLabel.style.color = 'var(--danger)';
      timerAlertLabel.innerHTML = '<i data-lucide="alert-triangle" style="width: 12px; height: 12px; vertical-align: middle;"></i> Waktu hampir habis!';
      lucide.createIcons();
    }
  }

  updateTimer(); // Initial call
  timerInterval = setInterval(updateTimer, 1000);
}

// Render questions to DOM (Separated from jawaban_benar property)
function renderQuestions() {
  soalContainer.innerHTML = '';

  questionsList.forEach((q) => {
    const card = document.createElement('div');
    card.className = 'card soal-item';
    card.id = `soal-card-${q.globalIndex}`;

    if (q.type === 'pg') {
      // Render PG options
      let optionsHtml = '';
      const keys = Object.keys(q.pilihan).sort(); // A, B, C, D, E...
      
      keys.forEach((key) => {
        const isSelected = jawabanSiswa.pg[q.id] === key;
        optionsHtml += `
          <label class="opsi-item ${isSelected ? 'selected' : ''}" id="label-${q.id}-${key}">
            <input type="radio" 
                   name="jawaban_${q.id}" 
                   value="${key}" 
                   data-qid="${q.id}" 
                   data-gidx="${q.globalIndex}" 
                   ${isSelected ? 'checked' : ''} 
                   onchange="saveAnswerPG('${q.id}', '${key}', ${q.globalIndex})">
            <span class="opsi-label">${key}.</span>
            <span class="opsi-teks">${q.pilihan[key]}</span>
          </label>
        `;
      });

      card.innerHTML = `
        <div class="soal-header">
          <span class="soal-badge">Pilihan Ganda - Soal ${q.globalIndex}</span>
          <span class="soal-bobot">Bab: ${q.bab} | Bobot: ${q.bobot}</span>
        </div>
        <div class="soal-tanya">${q.pertanyaan}</div>
        <div class="opsi-list">
          ${optionsHtml}
        </div>
      `;
    } else {
      // Render Essay Textarea
      const savedEssayAnswer = jawabanSiswa.uraian[q.id] || '';
      card.innerHTML = `
        <div class="soal-header">
          <span class="soal-badge Uraian">Uraian / Esai - Soal ${q.globalIndex}</span>
          <span class="soal-bobot">Bab: ${q.bab} | Bobot: ${q.bobot}</span>
        </div>
        <div class="soal-tanya">${q.pertanyaan}</div>
        <div>
          <textarea class="essay-box" 
                    id="essay-${q.id}" 
                    placeholder="Ketikkan lembar jawaban uraian Anda di sini..." 
                    oninput="saveAnswerEssay('${q.id}', this.value, ${q.globalIndex})">${savedEssayAnswer}</textarea>
        </div>
      `;
    }

    soalContainer.appendChild(card);
  });
}

// Render navigation sidebar grid
function renderNavigationGrid() {
  navGrid.innerHTML = '';
  
  questionsList.forEach((q) => {
    const btn = document.createElement('button');
    btn.className = `nav-num ${q.type === 'uraian' ? 'uraian-type' : ''}`;
    btn.id = `nav-num-${q.globalIndex}`;
    btn.textContent = q.globalIndex;

    // Check if already answered to color it
    let isAnswered = false;
    if (q.type === 'pg') {
      isAnswered = !!jawabanSiswa.pg[q.id];
    } else {
      isAnswered = !!jawabanSiswa.uraian[q.id] && jawabanSiswa.uraian[q.id].trim().length > 0;
    }

    if (isAnswered) {
      btn.classList.add('answered');
    }

    // Click handler to scroll to question smooth
    btn.addEventListener('click', () => {
      const targetCard = document.getElementById(`soal-card-${q.globalIndex}`);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Set active focus style
        document.querySelectorAll('.nav-num').forEach((n) => n.classList.remove('active'));
        btn.classList.add('active');
      }
    });

    navGrid.appendChild(btn);
  });
}

// Auto-Save Multiple Choice answers
window.saveAnswerPG = async function(qid, value, globalIndex) {
  if (examSubmitted) return;

  // Update local storage answers object
  jawabanSiswa.pg[qid] = value;
  localStorage.setItem('smartexam_jawaban_siswa', JSON.stringify(jawabanSiswa));

  // Visual updates: highlight selected container
  const parentList = document.querySelector(`#soal-card-${globalIndex} .opsi-list`);
  if (parentList) {
    parentList.querySelectorAll('.opsi-item').forEach((item) => {
      item.classList.remove('selected');
    });
  }
  
  const selectedLabel = document.getElementById(`label-${qid}-${value}`);
  if (selectedLabel) {
    selectedLabel.classList.add('selected');
  }

  // Mark sidebar button as answered
  const navBtn = document.getElementById(`nav-num-${globalIndex}`);
  if (navBtn) {
    navBtn.classList.add('answered');
  }

  updateAnswerProgress();

  // Sync PG to Supabase
  if (supabaseClient && activeSession && studentSession) {
    try {
      await supabaseClient
        .from('jawaban_siswa')
        .update({ jawaban_pg: jawabanSiswa.pg })
        .eq('mapel_id', activeSession.id)
        .eq('nisn', studentSession.nisn);
    } catch (e) {
      console.error("Gagal sinkronisasi PG ke Supabase:", e);
    }
  }
};

// Debounce for Essay updates to avoid DB request spam
let essayDebounceTimeout = null;
function debounceSaveEssay() {
  if (essayDebounceTimeout) clearTimeout(essayDebounceTimeout);
  essayDebounceTimeout = setTimeout(async () => {
    if (supabaseClient && activeSession && studentSession && !examSubmitted) {
      try {
        await supabaseClient
          .from('jawaban_siswa')
          .update({ jawaban_uraian: jawabanSiswa.uraian })
          .eq('mapel_id', activeSession.id)
          .eq('nisn', studentSession.nisn);
      } catch (e) {
        console.error("Gagal sinkronisasi Uraian ke Supabase:", e);
      }
    }
  }, 1000);
}

// Auto-Save Essay answers
window.saveAnswerEssay = function(qid, value, globalIndex) {
  if (examSubmitted) return;

  // Update state
  if (value.trim().length > 0) {
    jawabanSiswa.uraian[qid] = value;
  } else {
    delete jawabanSiswa.uraian[qid];
  }
  
  localStorage.setItem('smartexam_jawaban_siswa', JSON.stringify(jawabanSiswa));

  // Update sidebar color state
  const navBtn = document.getElementById(`nav-num-${globalIndex}`);
  if (navBtn) {
    if (value.trim().length > 0) {
      navBtn.classList.add('answered');
    } else {
      navBtn.classList.remove('answered');
    }
  }

  updateAnswerProgress();

  // Debounced Sync to Supabase
  debounceSaveEssay();
};

// Update answered progress numbers
function updateAnswerProgress() {
  let totalAnswered = 0;
  
  // count PG
  questionsList.forEach((q) => {
    if (q.type === 'pg') {
      if (jawabanSiswa.pg[q.id]) totalAnswered++;
    } else {
      if (jawabanSiswa.uraian[q.id] && jawabanSiswa.uraian[q.id].trim().length > 0) totalAnswered++;
    }
  });

  answeredBadge.textContent = `${totalAnswered} / ${questionsList.length} Terisi`;
}

// MathJax Typeset Trigger
function triggerMathJaxRendering() {
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise().catch((err) => console.error("MathJax typesetting error:", err));
  }
}


// ==========================================
// PHASE 3: ANTI-CHEATING CONTROL SYSTEMS
// ==========================================

function hookAntiCheatKeyboards() {
  // 1. Right Click blocker
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // 2. Text Selection / Copy / Paste blocker
  document.addEventListener('copy', (e) => {
    e.preventDefault();
  });
  document.addEventListener('paste', (e) => {
    e.preventDefault();
  });

  // 3. Hotkeys blocker
  document.addEventListener('keydown', (e) => {
    if (!examStarted || examSubmitted) return;

    // F12 Blocker
    if (e.key === 'F12') {
      e.preventDefault();
      return;
    }

    // Ctrl + Shift + I (Inspect Element) or Ctrl + Shift + J
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      return;
    }

    // Ctrl + C / Ctrl + V blocker
    if (e.ctrlKey && (e.key === 'C' || e.key === 'c' || e.key === 'V' || e.key === 'v')) {
      e.preventDefault();
      return;
    }

    // Ctrl + U blocker (View Page Source)
    if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
      e.preventDefault();
      return;
    }

    // Ctrl + S (Save Page)
    if (e.ctrlKey && (e.key === 'S' || e.key === 's')) {
      e.preventDefault();
      return;
    }
  });
}

function hookTabFocusMonitoring() {
  // Visibility Change (Tab Switching / minimizing)
  document.addEventListener('visibilitychange', handleTabFocusSwitch);
  
  // Window Blur (Focusing other windows/apps)
  window.addEventListener('blur', handleTabFocusSwitch);
}

function handleTabFocusSwitch() {
  if (!examStarted || examSubmitted) return;

  if (isTabAway) return; // Prevent double trigger
  isTabAway = true;

  // Small delay debounce
  setTimeout(() => {
    const isHidden = document.hidden;
    const isBlurred = !document.hasFocus();

    if (isHidden || isBlurred) {
      triggerViolation();
    } else {
      isTabAway = false;
    }
  }, 150);
}

// Reset tab-away when browser focus returns
window.addEventListener('focus', () => {
  isTabAway = false;
});

function triggerViolation() {
  if (examSubmitted) return;

  let storedViolations = parseInt(localStorage.getItem('smartexam_violation_count')) || 0;
  storedViolations++;
  localStorage.setItem('smartexam_violation_count', storedViolations);

  // Sync violation count to Supabase immediately
  if (supabaseClient && activeSession && studentSession) {
    supabaseClient
      .from('jawaban_siswa')
      .update({ violation_count: storedViolations })
      .eq('mapel_id', activeSession.id)
      .eq('nisn', studentSession.nisn)
      .then(({ error }) => {
        if (error) console.error("Gagal sinkronisasi violation ke Supabase:", error);
      });
  }

  if (storedViolations >= 3) {
    // Disqualification (Lock exam sepihak)
    submitUjian(true, 'violation_locked');
  } else {
    // Show Warning Modal Popup
    showTabWarningModal(storedViolations);
  }
}

function showTabWarningModal(violationNo) {
  warningModalMessage.innerHTML = `Anda terdeteksi meninggalkan halaman ujian atau membuka jendela aplikasi lain. Pelanggaran ke-<strong>${violationNo}</strong> dari 3.<br><br><span style="color: var(--danger); font-weight: bold;">PERINGATAN: Pada pelanggaran ke-3, lembar ujian Anda akan otomatis dikunci dan dikumpulkan sepihak!</span>`;
  warningModalOverlay.style.display = 'flex';
}

// Warning Close Button (Must re-enter fullscreen)
btnCloseWarning.addEventListener('click', () => {
  warningModalOverlay.style.display = 'none';
  isTabAway = false;
  enterFullscreen();
});


// ==========================================
// SUBMISSION & JSON RESULTS EXPORT
// ==========================================

async function submitUjian(isAuto = false, submitType = 'manual') {
  if (examSubmitted) return;

  if (!isAuto) {
    const confirmSubmit = confirm("Apakah Anda yakin ingin menyelesaikan ujian dan mengumpulkan seluruh jawaban? Jawaban tidak dapat diubah kembali.");
    if (!confirmSubmit) return;
  }

  examSubmitted = true;
  clearInterval(timerInterval);

  // Save submission status
  localStorage.setItem('smartexam_exam_submitted', 'true');
  localStorage.setItem('smartexam_exam_submit_type', submitType);
  
  // Clean up timer variables
  localStorage.removeItem('smartexam_exam_end_time');

  // Exit fullscreen safely
  try {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  } catch (err) {
    // ignore
  }

  // Compile Results Payload
  const meta = activeSession.metadata ? activeSession.metadata : activeSession;
  const violationCount = parseInt(localStorage.getItem('smartexam_violation_count')) || 0;

  const resultPayload = {
    siswa: {
      nisn: studentSession.nisn,
      nama: studentSession.nama,
      waktu_login: studentSession.waktu_login
    },
    ujian: {
      madrasah: meta.madrasah,
      mapel_nama: meta.mapel_nama,
      kelas: meta.kelas,
      semester: meta.semester,
      tahun: meta.tahun,
      paket: meta.paket,
      guru: meta.guru,
      waktu_menit: meta.waktu_menit
    },
    jawaban: jawabanSiswa,
    log_aktivitas: {
      violation_count: violationCount,
      submitted_at: new Date().toISOString(),
      status_pengumpulan: submitType // 'manual' | 'timer_expired' | 'violation_locked'
    }
  };

  // Sync final answers and submission status to Supabase
  const dbStatus = submitType === 'manual' ? 'selesai' : submitType; // 'selesai' | 'timer_expired' | 'violation_locked'
  if (supabaseClient && activeSession && studentSession) {
    try {
      await supabaseClient
        .from('jawaban_siswa')
        .update({
          jawaban_pg: jawabanSiswa.pg,
          jawaban_uraian: jawabanSiswa.uraian,
          violation_count: violationCount,
          status_pengumpulan: dbStatus
        })
        .eq('mapel_id', activeSession.id)
        .eq('nisn', studentSession.nisn);
    } catch (e) {
      console.error("Gagal sinkronisasi data submission ke Supabase:", e);
    }
  }

  // Lock all inputs visually
  document.querySelectorAll('input[type="radio"]').forEach(el => el.disabled = true);
  document.querySelectorAll('textarea').forEach(el => el.disabled = true);
  btnSubmitExamBottom.disabled = true;
  btnSubmitExamSidebar.disabled = true;
  btnSubmitExamBottom.style.opacity = '0.5';
  btnSubmitExamSidebar.style.opacity = '0.5';

  // Show overlay modal
  showSubmittedOverlay(submitType);
}

// Trigger JSON File Download helper
function triggerFileDownload(payload) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');

  // Clean metadata names for filename
  const cleanNisn = studentSession.nisn.replace(/\s+/g, '_');
  const cleanNama = studentSession.nama.replace(/\s+/g, '_');
  const cleanMapel = (payload.ujian.mapel_nama || 'Mapel').replace(/\s+/g, '_');
  
  const fileName = `Hasil_Ujian_${cleanNisn}_${cleanNama}_${cleanMapel}.json`;

  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", fileName);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Render Overlay Card details
function showSubmittedOverlay(submitType) {
  const meta = activeSession.metadata ? activeSession.metadata : activeSession;
  const violationCount = parseInt(localStorage.getItem('smartexam_violation_count')) || 0;
  
  // Count answered
  let totalAnswered = 0;
  const totalQuestions = (activeSession.soal_pg || []).length + (activeSession.soal_uraian || []).length;
  
  Object.keys(jawabanSiswa.pg).forEach((k) => {
    if (jawabanSiswa.pg[k]) totalAnswered++;
  });
  Object.keys(jawabanSiswa.uraian).forEach((k) => {
    if (jawabanSiswa.uraian[k] && jawabanSiswa.uraian[k].trim().length > 0) totalAnswered++;
  });

  // Update overlay fields
  lockValNama.textContent = studentSession.nama;
  lockValNisn.textContent = studentSession.nisn;
  lockValMapel.textContent = meta.mapel_nama;
  lockValTerisi.textContent = `${totalAnswered} dari ${totalQuestions} soal`;
  lockValPelanggaran.textContent = `${violationCount} / 3`;
  
  // Format current timestamp
  const now = new Date();
  lockValWaktu.textContent = now.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) + ' ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

  // Style overlay card depending on type
  if (submitType === 'violation_locked') {
    lockTitle.textContent = "AKSES UJIAN DIKUNCI!";
    lockTitle.style.color = "var(--danger)";
    lockMessage.textContent = "Ujian Anda dikunci sepihak oleh sistem karena terdeteksi meninggalkan halaman ujian sebanyak 3 kali (Tindakan Curang).";
    
    lockIconContainer.style.backgroundColor = '#fee2e2';
    lockIconContainer.style.color = 'var(--danger)';
    lockIconGraphic.setAttribute('data-lucide', 'shield-x');
  } else if (submitType === 'timer_expired') {
    lockTitle.textContent = "Waktu Ujian Habis!";
    lockTitle.style.color = "var(--warning)";
    lockMessage.textContent = "Batas waktu pengerjaan telah habis. Jawaban Anda dikunci dan dikumpulkan otomatis.";
    
    lockIconContainer.style.backgroundColor = '#fef3c7';
    lockIconContainer.style.color = 'var(--warning)';
    lockIconGraphic.setAttribute('data-lucide', 'clock');
  } else {
    lockTitle.textContent = "Ujian Selesai!";
    lockTitle.style.color = "var(--success)";
    lockMessage.textContent = "Terima kasih, lembar jawaban Anda telah sukses disimpan dan dikunci oleh sistem proktor.";
    
    lockIconContainer.style.backgroundColor = '#d1fae5';
    lockIconContainer.style.color = 'var(--success)';
    lockIconGraphic.setAttribute('data-lucide', 'check-circle-2');
  }

  lucide.createIcons();

  // Display overlay
  lockOverlay.style.display = 'flex';
}

// Return to login logic
btnReturnLogin.addEventListener('click', () => {
  // Clear student session details but preserve the active exam session
  localStorage.removeItem('smartexam_student_session');
  localStorage.removeItem('smartexam_jawaban_siswa');
  localStorage.removeItem('smartexam_exam_submitted');
  localStorage.removeItem('smartexam_exam_submit_type');
  localStorage.removeItem('smartexam_violation_count');
  localStorage.removeItem('smartexam_exam_end_time');
  window.location.href = 'siswa-login.html';
});

// Event listener for manual submission
btnSubmitExamBottom.addEventListener('click', () => submitUjian(false, 'manual'));
btnSubmitExamSidebar.addEventListener('click', () => submitUjian(false, 'manual'));

// Handle session exit (Log out)
btnLogout.addEventListener('click', () => {
  if (examSubmitted) {
    localStorage.removeItem('smartexam_student_session');
    localStorage.removeItem('smartexam_jawaban_siswa');
    localStorage.removeItem('smartexam_exam_submitted');
    localStorage.removeItem('smartexam_exam_submit_type');
    localStorage.removeItem('smartexam_violation_count');
    localStorage.removeItem('smartexam_exam_end_time');
    window.location.href = 'siswa-login.html';
  } else {
    if (confirm("Apakah Anda yakin ingin keluar ruangan ujian? Sisa waktu ujian Anda akan tetap berjalan.")) {
      // If they leave without submitting, do NOT clear answers so they can log back in.
      localStorage.removeItem('smartexam_student_session');
      window.location.href = 'siswa-login.html';
    }
  }
});

// Run Initialization
initExam();
