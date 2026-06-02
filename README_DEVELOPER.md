# 📘 Cetak Biru Teknis & Panduan Pengembang AmanaExam
> **Versi Dokumen**: 2.0 — Terakhir diperbarui: 2 Juni 2026

Dokumen ini disusun sebagai **Technical Blueprint** (Cetak Biru Teknis) resmi untuk AmanaExam—sebuah platform Computer Assisted Test (CAT) berbasis integritas, modern, dan mandiri untuk ekosistem Madrasah. Panduan ini dirancang untuk mempermudah proses pemeliharaan (*maintenance*), penelusuran bug (*debugging*), dan penambahan fitur baru di masa depan tanpa merusak sistem yang ada.

---

## 📂 1. Arsitektur & Struktur Folder Proyek

AmanaExam menggunakan arsitektur *Single Page App (SPA) static-hybrid* dengan Supabase sebagai *Backend-as-a-Service (BaaS)*. Semua file logika bisnis ditulis dalam vanilla JavaScript modern untuk performa rendering optimal tanpa overhead *virtual DOM*.

Berikut adalah peta struktur direktori dan fungsi masing-masing berkas:

```text
ujian-online/
├── admin-proktor.html      # Halaman dashboard pengawas/proktor
├── siswa-login.html        # Halaman masuk ujian siswa
├── siswa-ujian.html        # Halaman lembar pengerjaan ujian siswa
├── index.html              # Gerbang utama (melakukan auto-redirect ke siswa-login.html)
├── style.css               # Desain sistem global (tokens, layout, responsive grid, printing)
├── README_DEVELOPER.md     # Dokumentasi teknis proyek (file ini)
├── js/
│   ├── utils.js            # ★ Utilitas bersama (hashCode, shuffleArray, escapeHtml, deserializeSession)
│   ├── config.js           # Konfigurasi Supabase, inisialisasi client, & utilitas UI Modal
│   ├── logo-utils.js       # Utilitas rendering logo madrasah dinamis (SVG & Base64 fallbacks)
│   ├── siswa-login.js      # Logika otentikasi NISN siswa & pre-flight check sesi aktif
│   ├── siswa-ujian.js      # Kontrol ujian, anti-cheating, auto-save, & seeded shuffling
│   └── admin-proktor.js    # Pengelolaan sesi proktor, realtime monitor, ekspor excel, & cetak rapot
└── [Media/Assets]          # Gambar logo instansi lokal dan file JSON paket soal contoh
```

### Penjelasan Detail Berkas Logika (`js/`):
*   **[utils.js](file:///d:/Guru/myweb/ujian%20online/js/utils.js)** ★: Modul utilitas bersama (*shared utilities*) yang digunakan oleh semua halaman. Berisi fungsi-fungsi yang sebelumnya terduplikasi di beberapa file:
    *   `hashCode(str)` — Mengubah string (NISN) menjadi integer hash deterministik sebagai *seed* pengacakan.
    *   `seededRandom(seed)` — Generator bilangan acak berbasis *Linear Congruential Generator (LCG)*.
    *   `shuffleArray(array, seed)` — Algoritma Fisher-Yates Shuffle dengan *seed* kustom.
    *   `deserializeSession(session)` — Membongkar kolom `tahun` yang berformat `tahunAjaran|semester|guru` menjadi properti terpisah.
    *   `escapeHtml(str)` — Sanitasi input pengguna untuk mencegah serangan *Cross-Site Scripting (XSS)* saat merender teks melalui `innerHTML`.
*   **[config.js](file:///d:/Guru/myweb/ujian%20online/js/config.js)**: Menyimpan `SUPABASE_URL` dan `SUPABASE_KEY` anon. Menyediakan fungsi `recreateSupabaseClient` yang meregenerasi instansi klien Supabase dengan *custom headers* khusus untuk RLS. Juga menyediakan UI dialog kustom (`showCustomAlert` dan `showCustomConfirm`) yang konsisten dengan tema warna madrasah (hijau Zamrud & emas Amber).
*   **[logo-utils.js](file:///d:/Guru/myweb/ujian%20online/js/logo-utils.js)**: Berisi algoritma pendeteksi level madrasah (Mts / MA) untuk merender logo resmi Kementerian Agama atau logo kustom madrasah yang diunggah proktor, lengkap dengan gradasi perisai SVG dinamis.
*   **[siswa-login.js](file:///d:/Guru/myweb/ujian%20online/js/siswa-login.js)**: Menangani pre-flight check sesi aktif di cloud. Jika sesi aktif ditemukan, NISN siswa divalidasi sepanjang 10-digit angka, kemudian membuat baris baru di tabel `jawaban_siswa` dan mengarahkan siswa ke lembar ujian.
*   **[siswa-ujian.js](file:///d:/Guru/myweb/ujian%20online/js/siswa-ujian.js)**: Mengunci browser siswa dalam mode *Mandatory Fullscreen*, menangkap pelanggaran tab switch/blur (toleransi maksimal 2 kali), merender LaTeX menggunakan MathJax, melakukan pengacakan soal berbasis NISN, mengirimkan jawaban siswa secara asinkron (menggunakan debouncing 1 detik untuk soal esai), dan memantau status koneksi internet secara realtime.
*   **[admin-proktor.js](file:///d:/Guru/myweb/ujian%20online/js/admin-proktor.js)**: Menangani otentikasi password proktor secara lokal (tersimpan di `sessionStorage` untuk privasi). Memfasilitasi unggah soal berbasis JSON (dengan *loading state* visual), mendengarkan perubahan data siswa secara realtime melalui *Supabase Postgres Changes Channel*, mengunduh arsip backup terenkripsi, serta memfasilitasi penilaian esai manual dan pencetakan PDF rapot hasil ujian. Seluruh dialog konfirmasi menggunakan modal kustom (`showCustomConfirm`).

### Urutan Pemuatan Script (Loading Order):
Seluruh halaman HTML memuat script dalam urutan yang ketat untuk menjamin ketersediaan dependensi:
```html
<script src="js/utils.js"></script>         <!-- 1. Utilitas bersama (paling dasar) -->
<script src="js/config.js"></script>         <!-- 2. Konfigurasi Supabase & UI helpers -->
<script src="js/logo-utils.js"></script>     <!-- 3. Rendering logo (opsional per halaman) -->
<script src="js/[halaman-spesifik].js"></script> <!-- 4. Logika bisnis halaman -->
```

> **Penting**: `utils.js` **harus** dimuat sebelum semua script lain karena menyediakan fungsi global (`hashCode`, `escapeHtml`, dll.) yang digunakan oleh `config.js`, `siswa-ujian.js`, dan `admin-proktor.js`.

---

## 🔄 2. Aliran Data & Inisialisasi Klien (State Management)

Untuk menjamin keamanan pertukaran data tanpa memerlukan backend server tradisional, AmanaExam mengontrol inisialisasi klien Supabase secara dinamis berbasis state pengguna saat ini.

### Aliran Inisialisasi Klien (`recreateSupabaseClient`):
Setiap kali ada perubahan status keamanan (login siswa baru atau login proktor), klien Supabase dibentuk ulang untuk melampirkan *custom headers* ke dalam request HTTP yang dikirimkan ke REST API Supabase.

```text
Halaman Dimuat
      │
      ▼
Apakah ada Sesi Aktif?
      │
      ├─ Ya, Siswa ────► recreateSupabaseClient dengan Header x-student-nisn ──► supabaseClient Ter-RLS Siswa
      │
      ├─ Ya, Proktor ──► recreateSupabaseClient dengan Header x-proktor-password ──► supabaseClient Bebas-Akses Proktor
      │
      └─ Tidak ────────► recreateSupabaseClient Anonim Standard ──► supabaseClient Terbatas (Read Only)
```

### Kode Implementasi (`js/config.js`):
```javascript
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
```

### Strategi Manajemen State & Ketahanan Sesi (Resiliency):
AmanaExam mengadopsi prinsip *Local-First Cache*. Sesi pengerjaan siswa disimpan secara paralel di `localStorage` klien untuk mencegah hilangnya jawaban akibat putusnya koneksi internet atau ketidaksengajaan memuat ulang halaman (*page refresh*):
*   `smartexam_active_session`: Metadata ujian aktif saat ini.
*   `smartexam_student_session`: Identitas NISN dan nama lengkap siswa yang sedang aktif mengerjakan.
*   `smartexam_jawaban_siswa`: Objek JSON jawaban PG (`pg: { qid: choice }`) dan Uraian (`uraian: { qid: text }`) siswa saat ini.
*   `smartexam_violation_count`: Jumlah pelanggaran tab-away/blur siswa.

Saat siswa kembali terhubung ke internet, setiap klik jawaban PG akan langsung dikirim ke tabel `jawaban_siswa` di Supabase. Untuk jawaban uraian, fungsi `debounce` 1000ms menahan pengiriman hingga siswa berhenti mengetik untuk menekan konsumsi kuota API database.

### Pemantauan Status Koneksi Internet (Network Monitor):
Pada halaman ujian siswa (`siswa-ujian.html`), terdapat indikator koneksi realtime di navbar yang menampilkan status **🟢 Online** atau **🔴 Offline**. Indikator ini memanfaatkan event `online` dan `offline` dari browser:
```javascript
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
```
Fitur ini membantu siswa dan proktor mengetahui apakah jawaban berhasil tersinkronisasi ke database cloud atau tersimpan hanya secara lokal.

---

## 🛡️ 3. Sistem Keamanan & Row Level Security (RLS)

AmanaExam menerapkan arsitektur keamanan berlapis yang memanfaatkan fitur bawaan PostgreSQL pada Supabase untuk melindungi lembar jawaban dan integritas kunci jawaban.

### Mekanisme Custom Headers pada RLS Policies:
Supabase REST API memetakan header HTTP kustom ke variabel konfigurasi sesi PostgreSQL. Kebijakan RLS (Row Level Security) di database memanfaatkan data ini untuk otorisasi akses:

1.  **Header Siswa (`x-student-nisn`)**:
    Digunakan untuk mengizinkan siswa membaca, memasukkan, atau memperbarui baris jawaban milik mereka sendiri di tabel `jawaban_siswa`.
    *   *SQL Policy SELECT/INSERT/UPDATE:*
        ```sql
        (nisn = nullif(current_setting('request.headers', true)::json->>'x-student-nisn', ''))
        ```
2.  **Header Proktor (`x-proktor-password`)**:
    Berfungsi sebagai bypass global untuk pengawas. Jika header ini cocok dengan konfigurasi keamanan proktor yang disimpan secara aman di database, pengawas dapat membaca seluruh jawaban siswa, memantau secara realtime, memasukkan skor uraian, dan mengunduh data cadangan.
    *   *SQL Policy ALL:*
        ```sql
        (nullif(current_setting('request.headers', true)::json->>'x-proktor-password', '') = 'PASTE_PASSWORD_HASH_DISINI')
        ```

### Tag Keamanan SEO (Anti-Index Google):
Sebagai bagian dari pertahanan keamanan dan privasi ujian madrasah, seluruh halaman HTML (`index.html`, `siswa-login.html`, `siswa-ujian.html`, dan `admin-proktor.html`) telah dikonfigurasi dengan meta tag robot berikut di dalam elemen `<head>`:
```html
<meta name="robots" content="noindex, nofollow">
```
Meta tag ini melarang robot mesin pencari publik (seperti Google dan Bing) untuk merayapi, mengindeks, atau memunculkan halaman login, lembar pengerjaan, maupun dashboard proktor ke khalayak umum.

### Proteksi Kebocoran Kunci Jawaban dengan Database View:
Siswa dilarang membaca tabel asli `ujian_aktif` karena di dalam kolom `soal_pg` terdapat data kunci jawaban asli (`jawaban_benar` atau `kunci`). Sebagai gantinya, siswa hanya diperbolehkan mengakses database view bernama `view_soal_siswa`.

```text
Table: ujian_aktif
  ├── id (UUID)
  ├── mapel_nama (Text)
  ├── soal_pg (JSONB) ──► Mengandung: { id, pertanyaan, pilihan, kunci_jawaban }
  └── soal_uraian (JSONB)
          │
          ▼ SQL SELECT View
view_soal_siswa
  ├── id (UUID)
  ├── mapel_nama (Text)
  ├── soal_pg (JSONB) ──► Mengandung: { id, pertanyaan, pilihan } (Kunci dihapus secara dinamis)
  └── soal_uraian (JSONB)
```

View ini secara dinamis menghapus properti kunci jawaban dari objek JSON soal sebelum dikirimkan ke web browser siswa. Dengan demikian, meskipun siswa mahir menggunakan Chrome DevTools (Inspect Element) untuk melihat lalu lintas jaringan API (*network tab*), mereka **tidak akan pernah bisa** menemukan kunci jawaban karena data tersebut memang tidak dikirim oleh server database.

### Proteksi XSS (Cross-Site Scripting):
Seluruh data yang dimasukkan oleh pengguna (nama siswa, NISN, nama mata pelajaran, nama guru, dll.) yang dirender melalui `innerHTML` telah disanitasi menggunakan fungsi `escapeHtml()` dari `utils.js`. Fungsi ini mengonversi karakter berbahaya (seperti `<`, `>`, `"`, `&`) menjadi entitas HTML yang aman:

```javascript
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// Contoh penggunaan di admin-proktor.js:
`<td>${escapeHtml(student.nama_siswa)}</td>`  // ✅ AMAN
`<td>${student.nama_siswa}</td>`               // ❌ RENTAN XSS
```

**Area yang dilindungi**:
*   Tabel monitoring siswa di dashboard proktor (`renderMonitorTable`)
*   Modal preview cetak nilai (`openPrintModal`)
*   Dokumen rapot hasil ujian PDF (handler tombol cetak)

> **⚠️ Catatan Pengembang**: Setiap kali menambahkan template literal baru yang merender data pengguna melalui `innerHTML`, **wajib** membungkus variabel dengan `escapeHtml()` untuk mencegah injeksi kode berbahaya.

---

## 🎲 4. Mekanisme Pengacakan Soal (Seeded Shuffling)

Untuk meminimalisir peluang kecurangan saling menyontek antar siswa yang duduk berdampingan, AmanaExam mendukung fitur pengacakan soal dan opsi jawaban yang konsisten.

### Algoritma Fisher-Yates dengan Seed Kustom:
Pengacakan standar seperti `Math.random()` tidak dapat digunakan karena akan mengacak ulang urutan setiap kali halaman dimuat kembali (*refresh*), yang akan membingungkan siswa dan menghapus jejak jawaban mereka. 

Sebagai gantinya, AmanaExam menggunakan algoritma **Fisher-Yates Shuffle** yang dimodifikasi dengan generator bilangan acak berbasis *Linear Congruential Generator (LCG)* dengan *seed* kustom. Semua fungsi pengacakan tersentralisasi di **`js/utils.js`** untuk menghindari duplikasi kode:

```javascript
// Mengubah NISN siswa menjadi nilai hash integer unik dan konsisten
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Seeded generator yang deterministik
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
```

### Logika Pengacakan Soal & Pilihan:
1.  **Deteksi Pengacakan**: Jika nama paket ujian pada metadata mengandung kata `b`, `acak`, atau `random` (tidak sensitif huruf besar/kecil), pengacakan diaktifkan secara otomatis.
2.  **Urutan Soal**: Urutan soal diacak berdasarkan *seed* dari NISN siswa (`hashCode(studentSession.nisn)`).
3.  **Urutan Opsi Pilihan**: Kunci opsi (A, B, C, D, E) untuk setiap soal PG diacak secara indenpenden menggunakan *seed* gabungan antara NISN siswa dan ID soal unik tersebut (`hashCode(studentSession.nisn + '_' + q.id)`).

### Sinkronisasi Pengacakan di Halaman Proktor (Cetak Rapot):
Agar proktor dapat menilai jawaban siswa dengan adil dan mencetak laporan rapot yang sesuai dengan apa yang dilihat siswa di layarnya, halaman proktor (`admin-proktor.js`) menggunakan metode pembacaan *seed* yang sama persis:
*   Saat mencetak rapot siswa Ahmad dengan NISN `0012345678`, halaman proktor mendeteksi NISN tersebut, menghitung ulang nilai hash-nya, kemudian memanggil fungsi `shuffleArray` dengan *seed* tersebut.
*   Urutan soal dan huruf pilihan jawaban (A, B, C, D, E) pada lembar cetak rapot PDF akan tersusun tepat seperti lembar kerja ujian siswa Ahmad saat pengerjaan.

---

## ⚡ 5. Optimasi Performa & Aksesibilitas

### Optimasi Pemuatan Font (Font Loading):
Font Google (Inter & Outfit) dimuat melalui tag `<link>` di `<head>` HTML dengan strategi `preconnect` untuk menghilangkan latensi DNS dan koneksi TLS:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@...&family=Outfit:wght@...&display=swap">
```
Sebelumnya, font dimuat via `@import` di CSS yang memblokir rendering halaman (*render-blocking*). Pendekatan baru ini memungkinkan browser mulai mengunduh font secara paralel dengan parsing CSS.

### Pinning Versi CDN:
Seluruh library CDN eksternal telah di-*pin* ke versi spesifik untuk mencegah *breaking changes* akibat pembaruan otomatis:
| Library | Versi Pin |
|---|---|
| Lucide Icons | `@0.460.0` |
| Supabase JS | `@2.49.4/dist/umd/supabase.min.js` |
| MathJax | `@3` (stable channel) |

### Optimasi Pemanggilan `lucide.createIcons()`:
Pemanggilan `lucide.createIcons()` (yang men-*scan* seluruh DOM) telah dioptimasi:
*   **Timer darurat**: Hanya dipanggil sekali saat waktu ujian < 5 menit (sebelumnya dipanggil setiap detik), menggunakan flag `dataset.urgencySet` dan parameter `{ nodes: [targetElement] }` untuk *scoped rendering*.
*   **Rendering tabel monitor**: Tetap dipanggil setelah tabel di-*render* ulang karena tabel berisi ikon baru.

### Aksesibilitas (Accessibility / a11y):
Elemen-elemen interaktif telah ditingkatkan untuk kompatibilitas *screen reader* dan navigasi keyboard:
| Elemen | Atribut | Nilai |
|---|---|---|
| Tombol Keluar Sesi (ujian) | `aria-label` | "Keluar dari sesi ujian" |
| Tombol Toggle Password (proktor) | `aria-label` | "Tampilkan atau sembunyikan password" |
| Tombol Tutup Modal Cetak | `aria-label` | "Tutup modal cetak" |
| Overlay Warning Tab-Switch | `role` | "alert" |
| Container Notifikasi Alert | `role`, `aria-live` | "alert", "polite" |

---

## 🛠️ 6. Panduan Perbaikan & Pengembangan Fitur Baru

Bagian ini memuat langkah-langkah praktis bagi pengembang jika ingin melakukan pemeliharaan atau memperluas fungsionalitas aplikasi:

### A. Langkah Menambahkan Tabel Baru di Supabase
Jika Anda ingin membuat fitur baru seperti "Daftar Guru" atau "Umpan Balik Siswa":
1.  Buka konsol dashboard Supabase Anda.
2.  Masuk ke menu **Table Editor** -> klik **New Table**.
3.  Aktifkan opsi **Enable Row Level Security (RLS)** (Sangat penting!).
4.  Tambahkan kolom-kolom yang diperlukan.
5.  Buat kebijakan RLS baru di bawah tab **Authentication -> Policies**:
    *   Jika tabel diakses siswa: Batasi operasi tulis/baca dengan memeriksa keberadaan header `x-student-nisn`.
    *   Jika tabel diakses proktor: Batasi dengan memeriksa kecocokan hash sandi pada header `x-proktor-password`.

### B. Mengubah Password Proktor Default
Sandi keamanan proktor digunakan untuk melindungi dashboard pengawas dari akses siswa.
1.  Untuk mengubahnya di database, buka konsol SQL Editor Supabase.
2.  Temukan kebijakan RLS pada tabel `ujian_aktif` dan `jawaban_siswa`.
3.  Ganti string pencocokan password:
    ```sql
    -- Contoh skenario di mana password di-hash md5 atau dicocokkan string langsung
    (nullif(current_setting('request.headers', true)::json->>'x-proktor-password', '') = 'PASSWORD_BARU_PROKTOR')
    ```
4.  Ubah juga nilai password kustom pada konfigurasi lokal jika diperlukan.

### C. Menambahkan Tipe Soal Kustom Baru (misal: Menjodohkan / Benar-Salah)
Jika ingin mendukung tipe soal selain PG dan Uraian:
1.  **Format JSON**: Modifikasi format pengepakan soal JSON dari aplikasi pembuat soal dengan menambahkan array kunci baru, misalnya `soal_bs` (Benar/Salah).
2.  **Modifikasi Parser Siswa (`js/siswa-ujian.js`)**:
    *   Buka fungsi `initExam` dan tambahkan loop ekstra untuk membaca `soal_bs` ke dalam global `questionsList` dengan properti `type: 'benarsalah'`.
    *   Buka fungsi `renderQuestions` dan tambahkan blok pengkondisian `else if (q.type === 'benarsalah')` untuk merender markup HTML tombol pilihan Benar / Salah.
3.  **Sinkronisasi Jawaban**:
    *   Tambahkan field state baru di objek `jawabanSiswa` (misalnya `jawabanSiswa.benarsalah = {}`).
    *   Pastikan fungsi penyimpanan data mengirim state ini secara asinkron ke kolom database yang sesuai (atau jadikan satu di JSON jawaban siswa).
4.  **Halaman Proktor (`js/admin-proktor.js`)**:
    *   Perbarui fungsi penilaian dan rendering cetak rapot agar mengenali tipe `benarsalah` dan melakukan kalkulasi nilai akhir secara otomatis.

### D. Menambahkan Fungsi Utilitas Baru
Jika Anda perlu menambahkan fungsi utilitas yang digunakan oleh lebih dari satu halaman:
1.  Tambahkan fungsi tersebut ke **`js/utils.js`**.
2.  Pastikan fungsi dideklarasikan sebagai `function` (bukan `const` atau arrow function) agar ter-*hoist* dan tersedia secara global.
3.  Tambahkan dokumentasi JSDoc di atas fungsi untuk memperjelas parameter dan return value.
4.  **Jangan** menduplikasi fungsi di file JS lain—selalu impor dari `utils.js`.

### E. Menampilkan Data Pengguna di innerHTML
Saat menambahkan fitur baru yang menampilkan data dari input pengguna atau database ke HTML melalui template literal + `innerHTML`:
1.  **Selalu** bungkus variabel dengan `escapeHtml()` dari `utils.js`.
2.  Contoh yang **benar**:
    ```javascript
    container.innerHTML = `<p>Nama: ${escapeHtml(siswa.nama)}</p>`;
    ```
3.  Contoh yang **salah** (rentan XSS):
    ```javascript
    container.innerHTML = `<p>Nama: ${siswa.nama}</p>`;
    ```

---

## 📝 7. Changelog (Riwayat Perubahan)

### v2.0 — 2 Juni 2026
*   **[BARU]** `js/utils.js` — Modul utilitas bersama untuk menghilangkan duplikasi kode (~70 baris kode duplikat dihapus).
*   **[KEAMANAN]** Proteksi XSS via `escapeHtml()` pada 15+ template literal di `admin-proktor.js`.
*   **[KEAMANAN]** Pinning versi CDN: Supabase `@2.49.4`, Lucide `@0.460.0`.
*   **[UX]** Indikator status koneksi internet (🟢 Online / 🔴 Offline) di navbar halaman ujian.
*   **[UX]** Semua dialog `confirm()` native diganti dengan `showCustomConfirm()` kustom yang konsisten.
*   **[UX]** Loading state visual saat upload file soal JSON di dashboard proktor.
*   **[PERFORMA]** Font dimuat via `<link rel="preconnect">` (sebelumnya `@import` render-blocking).
*   **[PERFORMA]** `lucide.createIcons()` dioptimasi: hanya dipanggil sekali saat timer darurat, dengan *scoped rendering*.
*   **[AKSESIBILITAS]** Penambahan `aria-label`, `role="alert"`, dan `aria-live="polite"` pada elemen interaktif.
*   **[KODE]** `deserializeSession()` dipindahkan ke `utils.js` dan digunakan di 3 halaman (sebelumnya inline di 3 tempat).
*   **[KODE]** Penghapusan `!important` pada CSS `.nav-num.ragu-*` dengan meningkatkan specificity selector.

### v1.0 — 1 Juni 2026
*   Rilis awal arsitektur modular: pemisahan JS ke folder `js/` dari HTML monolitik.
*   Implementasi `config.js` terpusat untuk Supabase client.
*   Implementasi `logo-utils.js` untuk rendering logo dinamis.
*   Implementasi `showCustomAlert()` dan `showCustomConfirm()` kustom.
*   Implementasi RLS (Row Level Security) dengan custom headers.
*   Implementasi `view_soal_siswa` (Database View) untuk menyembunyikan kunci jawaban.
*   Implementasi pengacakan soal Fisher-Yates dengan seed NISN.
*   Implementasi tag `<meta name="robots" content="noindex, nofollow">`.
*   Pembuatan `README_DEVELOPER.md` (dokumentasi teknis awal).
