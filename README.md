# 🏫 AmanaExam - Platform Ujian Online Mandiri Madrasah

AmanaExam adalah platform **Computer Assisted Test (CAT)** berbasis web modern yang dirancang khusus untuk ekosistem Madrasah (MTs/MA). Mengusung prinsip **integritas tinggi, kemandirian, dan ketahanan data**, platform ini memungkinkan pelaksanaan ujian secara daring tanpa memerlukan infrastruktur server lokal yang rumit, melainkan memanfaatkan arsitektur *static-hybrid serverless* berbasis cloud database.

Didesain dengan antarmuka yang bersih, responsif, dan premium, AmanaExam memastikan siswa dapat fokus mengerjakan ujian dengan nyaman sekaligus menutup celah kecurangan secara maksimal melalui sistem keamanan berlapis.

---

## 📂 1. Arsitektur & Struktur Folder Proyek

AmanaExam menggunakan arsitektur *Single Page Application (SPA) static-hybrid* dengan **Supabase** sebagai *Backend-as-a-Service (BaaS)*. Seluruh logika aplikasi ditulis dalam Vanilla JavaScript modern (ES6+) untuk menjamin performa rendering yang instan, meminimalkan latensi, serta menghindari overhead kompilasi framework modern.

Berikut adalah bagan struktur direktori proyek beserta peran masing-masing komponen:

```text
ujian-online/
├── index.html              # Gerbang utama (pengalihan otomatis ke halaman login)
├── siswa-login.html        # Portal masuk ujian untuk siswa (validasi NISN)
├── siswa-ujian.html        # Lembar pengerjaan ujian siswa (terproteksi anti-cheat)
├── admin-proktor.html      # Dashboard pengawas/proktor (realtime monitor & penilaian)
├── style.css               # CSS Global (desain sistem, layout grid, print rapot)
├── README.md               # Dokumentasi utama proyek (file ini)
├── README_DEVELOPER.md     # Cetak biru teknis dan catatan pengembangan pengembang
├── js/
│   ├── utils.js            # Fungsi utilitas bersama (hash, shuffle, escape HTML, dll.)
│   ├── config.js           # Konfigurasi Supabase client & UI Dialog Modal Kustom
│   ├── logo-utils.js       # Utilitas pemrosesan dan rendering logo madrasah (SVG/Base64)
│   ├── siswa-login.js      # Logika autentikasi login siswa & cek sesi
│   ├── siswa-ujian.js      # Logika lembar ujian, anti-cheat, sinkronisasi cloud
│   └── admin-proktor.js    # Logika dashboard proktor, realtime monitoring, ekspor & cetak rapot
└── [Assets/Media]          # Logo sekolah (mts/ma) dan contoh berkas paket soal JSON
```

### Urutan Pemuatan Script (Loading Order)
Untuk menjamin seluruh dependensi tersedia sebelum logika bisnis dieksekusi, semua file HTML memuat file JavaScript dengan urutan ketat berikut:
1.  **`js/utils.js`** — Menyediakan utilitas dasar (seperti `hashCode`, `escapeHtml`) yang dibutuhkan file lain.
2.  **`js/config.js`** — Menginisialisasi koneksi cloud database Supabase dan memuat modal kustom UI.
3.  **`js/logo-utils.js`** — Mengatur rendering lambang madrasah di navbar/kop surat.
4.  **`js/[logika-spesifik-halaman].js`** — Mengeksekusi alur kerja spesifik dari halaman tersebut.

---

## 🛠️ 2. Teknologi & Library yang Digunakan

AmanaExam dibangun di atas teknologi berbasis web yang ringan namun kuat:

| Teknologi / Library | Kegunaan | Sumber / CDN |
| :--- | :--- | :--- |
| **HTML5 & CSS3** | Struktur semantik dan styling antarmuka dengan variabel CSS (design tokens). | Native |
| **Vanilla JavaScript** | Seluruh logika penanganan data, state management, dan UI reactivity. | Native ES6+ |
| **Supabase JS Client** | Menghubungkan client web ke cloud database PostgreSQL secara realtime. | `supabase-js@2.49.4` |
| **MathJax v3** | Render persamaan matematika, rumus kimia, dan notasi ilmiah LaTeX. | `mathjax@3` (stable) |
| **Lucide Icons** | Set ikon vektor modern dengan performa tinggi. | `lucide@0.460.0` |
| **SheetJS (XLSX)** | Melakukan ekspor data rekapitulasi nilai siswa dari dashboard ke format Excel. | `xlsx@0.18.5` |

---

## 🗄️ 3. Skema Database & Row Level Security (RLS)

AmanaExam mengandalkan database PostgreSQL di Supabase. Keamanan data dilindungi langsung di level database menggunakan fitur **Row Level Security (RLS)** untuk mencegah akses ilegal antar-siswa.

### A. Struktur Tabel Utama

#### 1. Tabel: `ujian_aktif`
Menyimpan paket soal dan metadata ujian yang sedang diselenggarakan.
*   `id` (UUID, Primary Key) — ID unik mata pelajaran/ujian.
*   `madrasah` (Text) — Nama Madrasah.
*   `mapel_nama` (Text) — Nama mata pelajaran.
*   `kelas` (Text) — Tingkat kelas (contoh: "11 MA").
*   `semester` (Text) — Semester aktif ("Ganjil" atau "Genap").
*   `tahun` (Text) — Tahun pelajaran (menyimpan metadata terenkripsi `"tahunAjaran|semester|guru"`).
*   `waktu_menit` (Integer) — Alokasi waktu ujian (dalam menit).
*   `guru` (Text) — Nama guru pengampu.
*   `paket` (Text) — Nama paket soal (misal: "Paket A - Acak").
*   `soal_pg` (JSONB) — Array soal pilihan ganda beserta pilihan dan kunci jawaban.
*   `soal_uraian` (JSONB) — Array soal uraian/esai.
*   `is_active` (Boolean) — Status aktif/tidaknya ujian untuk diakses siswa.
*   `created_at` (Timestamp) — Waktu pembuatan.

#### 2. Tabel: `jawaban_siswa`
Menyimpan data pengerjaan, jawaban, dan log aktivitas dari setiap peserta ujian.
*   `mapel_id` (UUID, Foreign Key ke `ujian_aktif.id`) — Relasi ke paket ujian.
*   `nisn` (Text, Primary Key bersama `mapel_id`) — 10 digit NISN siswa.
*   `nama_siswa` (Text) — Nama lengkap peserta.
*   `jawaban_pg` (JSONB) — Peta pilihan ganda siswa (format: `{ "qid": "kunci_pilihan" }`).
*   `jawaban_uraian` (JSONB) — Peta jawaban esai siswa (format: `{ "qid": "teks_jawaban" }`).
*   `essay_scores` (JSONB) — Nilai esai yang diberikan oleh proktor secara manual.
*   `violation_count` (Integer) — Jumlah pelanggaran *tab-away* / keluar layar penuh.
*   `status_pengumpulan` (Text) — Status pengerjaan (`"normal"`, `"selesai"`, `"timer_expired"`, `"violation_locked"`).
*   `waktu_mulai` (Timestamp) — Waktu pertama kali siswa masuk ke ruang ujian.
*   `waktu_submit` (Timestamp) — Waktu siswa mengumpulkan ujian.

### B. Proteksi Kebocoran Jawaban dengan Database View
Untuk memblokir siswa nakal yang mencari kunci jawaban melalui Tab Network di Chrome DevTools, siswa **tidak diperbolehkan** membaca tabel `ujian_aktif` secara langsung. Sebagai gantinya, siswa hanya diberi hak akses ke database view bernama `view_soal_siswa`.

```text
Database Supabase:
Tabel Asli [ujian_aktif] (Memiliki kolom soal_pg dengan objek "jawaban_benar")
      │
      ▼ (SQL SELECT Query di Postgres)
Database View [view_soal_siswa]
      │
      ├── Menghapus atribut 'jawaban_benar' / 'kunci' secara dinamis dari JSONB soal_pg
      └── Menyajikan data soal bersih (Hanya pertanyaan & pilihan opsi) ke browser siswa
```
*Dengan skema ini, kunci jawaban PG secara fisik tidak pernah dikirimkan ke perangkat siswa.*

### C. Row Level Security (RLS) & Custom Headers
Akses database dikontrol dengan mengirimkan header HTTP kustom melalui Supabase Client:
1.  **Akses Siswa**: Dilakukan dengan menyisipkan header `'x-student-nisn'`. Kebijakan RLS membatasi baris di `jawaban_siswa` sehingga siswa hanya bisa membaca dan mengubah baris jawaban yang `nisn`-nya cocok dengan isi header tersebut.
2.  **Akses Proktor**: Dilakukan dengan menyisipkan header `'x-proktor-password'`. Jika header ini cocok dengan hash password proktor di database, RLS akan membuka akses penuh untuk mengelola sesi dan melihat seluruh hasil pekerjaan siswa.

---

## 🔒 4. Sistem Keamanan & Anti-Cheat Siswa

AmanaExam dilengkapi proteksi keamanan klien yang tangguh untuk meminimalisir kecurangan:

1.  **Mandatory Fullscreen (Layar Penuh Wajib)**:
    Ujian harus dikerjakan dalam mode layar penuh. Jika siswa menekan tombol `ESC` atau keluar dari mode layar penuh secara sengaja/tidak sengaja, layar pengerjaan akan diblokir oleh overlay merah raksasa, meminta mereka masuk kembali ke mode fullscreen untuk melanjutkan ujian.
2.  **Anti-Tab Switch & App Switch (Blur Detection)**:
    Browser mendeteksi apabila fokus halaman berpindah (membuka tab baru, meminimalkan browser, membuka aplikasi lain, atau memproses notifikasi OS). 
    *   Jika fokus hilang, counter pelanggaran siswa akan bertambah.
    *   Siswa diberikan **maksimal 2 kali toleransi peringatan**.
    *   Pada pelanggaran ke-3, lembar ujian akan **otomatis dikunci secara sepihak** (`violation_locked`) dan langsung mengumpulkan jawaban terakhir ke database cloud.
3.  **Pemblokiran Input Keyboard & Mouse**:
    *   *Klik Kanan* (`contextmenu`) dinonaktifkan untuk mencegah akses menu Inspect.
    *   *Penyalinan* (`copy`) dan *Penempelan* (`paste`) teks dinonaktifkan di semua area halaman.
    *   Tombol pintas (`hotkeys`) developer seperti `F12`, `Ctrl+Shift+I`, `Ctrl+Shift+J`, `Ctrl+U` (Source Code), `Ctrl+C`, `Ctrl+V`, dan `Ctrl+S` diblokir sepenuhnya.
4.  **Anti-XSS (Cross-Site Scripting)**:
    Semua string input dinamis (Nama Siswa, NISN, Nama Mapel) yang dirender ke DOM menggunakan `innerHTML` disanitasi menggunakan fungsi `escapeHtml()` untuk mencegah eksekusi skrip injeksi berbahaya.

---

## 🎲 5. Mekanisme Pengacakan Soal (Seeded Shuffling)

Untuk mencegah siswa meniru jawaban teman di sebelahnya, AmanaExam menyediakan fitur pengacakan soal yang adil dan deterministik menggunakan algoritma **Fisher-Yates Shuffle** yang dipadukan dengan **Linear Congruential Generator (LCG)**.

*   **Identifikasi Pengacakan**: Jika nama paket ujian pada metadata mengandung kata kunci `b`, `acak`, atau `random` (case-insensitive), sistem pengacakan akan aktif.
*   **Pengacakan Soal**: Urutan soal diacak berdasarkan *seed* deterministik yang dibentuk dari NISN siswa (`hashCode(studentSession.nisn)`).
*   **Pengacakan Opsi PG**: Huruf pilihan jawaban (A, B, C, D, E) untuk tiap soal diacak menggunakan *seed* unik gabungan NISN dan ID soal tersebut (`hashCode(studentSession.nisn + '_' + q.id)`).
*   **Deteksi Konsistensi (Cetak Rapot)**: Skema *seed* yang sama dibaca oleh proktor saat melihat pratinjau jawaban siswa atau mencetak rapot PDF. Dengan demikian, proktor melihat tata letak soal dan opsi yang **sama persis** dengan yang tampil di layar siswa yang bersangkutan.

---

## 📖 6. Panduan Penggunaan & Alur Kerja

### A. Alur Kerja untuk Siswa

```text
[Halaman Login]
  └── Masukkan NISN (10 Digit) & Nama Lengkap
  └── Verifikasi Sesi Aktif di Cloud
        │
        ▼ (Login Sukses)
[Overlay Konfirmasi]
  └── Membaca Aturan & Konsekuensi Anti-Cheat
  └── Klik "Mulai Ujian" -> Otomatis masuk Mode Fullscreen & Wake Lock Aktif
        │
        ▼ (Pengerjaan Ujian)
[Lembar Ujian]
  └── Menjawab soal PG (Otomatis Sync dengan Debounce/Instant ke Supabase)
  └── Mengetik jawaban Esai (Debounce 1 Detik untuk hemat bandwidth)
  └── Navigasi Soal / Ragu-Ragu
        │
        ▼ (Selesai / Durasi Habis / Terkunci Pelanggaran)
[Submission]
  └── Jawaban dikunci & dikirim ke Cloud
  └── Keluar dari Fullscreen & Tampil Ringkasan Hasil
```

*   **Fitur Local Cache (Resiliency)**: Jika koneksi internet terputus di tengah jalan, status pengerjaan dan jawaban disimpan di `localStorage` (`smartexam_jawaban_siswa`). Begitu koneksi kembali normal (indikator di navbar berubah menjadi **🟢 Online**), jawaban lokal akan otomatis tersinkronisasi ke cloud database.

### B. Alur Kerja untuk Proktor (Pengawas)

1.  **Masuk Dashboard**: Buka `admin-proktor.html`, masukkan password proktor untuk otentikasi.
2.  **Memulai Sesi Baru (Upload Soal)**:
    *   Seret & lepas berkas JSON soal hasil ekspor dari aplikasi pembuat soal ke *Upload Zone*.
    *   Sistem memproses berkas, lalu otomatis membuat entri baru di tabel `ujian_aktif` dan mengaktifkannya di cloud.
3.  **Live Monitoring**:
    *   Tabel memantau daftar siswa yang sedang aktif ujian secara real-time.
    *   Menampilkan nama, NISN, status pengumpulan, jumlah pelanggaran, dan waktu pengerjaan.
4.  **Membuka Kunci Pelanggaran (Unblock Student)**:
    *   Jika siswa tidak sengaja terkunci akibat pelanggaran tab-away 3 kali, proktor dapat mengklik tombol aksi **Buka Kunci** di dashboard.
    *   Melalui realtime *Postgres Changes Channel*, browser siswa akan otomatis mendeteksi perubahan status dari cloud, menutup layar blokir, mereset counter pelanggaran, dan mengizinkan siswa masuk kembali ke mode pengerjaan.
5.  **Penilaian Esai & Cetak Rapot PDF**:
    *   Proktor dapat membuka detail jawaban siswa, mengoreksi esai secara langsung, dan memberikan skor manual.
    *   Klik **Cetak Laporan (PDF)** untuk merender rapot formal lengkap dengan kop surat madrasah, logo instansi, detail skor, dan kolom tanda tangan guru.
6.  **Ekspor Nilai**: Klik tombol **Ekspor Semua Hasil (Excel)** untuk mendownload rekap nilai seluruh siswa dalam format spreadsheet (.xlsx).
7.  **Manajemen Sesi**: Jika ujian selesai, proktor mengklik **Tutup Sesi Ujian** agar siswa baru tidak dapat login kembali. Data jawaban yang tersimpan di cloud dapat diunduh sebagai arsip cadangan (JSON) atau dihapus permanen ketika pergantian tahun ajaran baru.

---

## 💻 7. Panduan Pemeliharaan & Pengembangan (Developer Guide)

Jika Anda ingin memelihara aplikasi atau menambahkan fitur baru, berikut adalah instruksi penting:

### A. Penyiapan Awal Cloud Supabase
Pastikan Anda membuat skema tabel berikut di konsol Supabase SQL Editor:
```sql
-- Buat Tabel ujian_aktif
CREATE TABLE ujian_aktif (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  madrasah TEXT NOT NULL,
  mapel_nama TEXT NOT NULL,
  kelas TEXT NOT NULL,
  semester TEXT NOT NULL,
  tahun TEXT NOT NULL,
  waktu_menit INT NOT NULL,
  guru TEXT NOT NULL,
  paket TEXT NOT NULL,
  soal_pg JSONB NOT NULL,
  soal_uraian JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Buat Tabel jawaban_siswa
CREATE TABLE jawaban_siswa (
  mapel_id UUID REFERENCES ujian_aktif(id) ON DELETE CASCADE,
  nisn TEXT NOT NULL,
  nama_siswa TEXT NOT NULL,
  jawaban_pg JSONB DEFAULT '{}'::jsonb,
  jawaban_uraian JSONB DEFAULT '{}'::jsonb,
  essay_scores JSONB DEFAULT '{}'::jsonb,
  violation_count INT DEFAULT 0,
  status_pengumpulan TEXT DEFAULT 'normal',
  waktu_mulai TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  waktu_submit TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (mapel_id, nisn)
);

-- Buat View untuk Siswa (Menghapus Kunci Jawaban)
CREATE OR REPLACE VIEW view_soal_siswa AS
SELECT 
  id, madrasah, mapel_nama, kelas, semester, tahun, waktu_menit, guru, paket, is_active, created_at,
  (
    SELECT jsonb_agg(q - 'jawaban_benar' - 'kunci')
    FROM jsonb_array_elements(soal_pg) AS q
  ) AS soal_pg,
  soal_uraian
FROM ujian_aktif;
```

### B. Mengubah Password Proktor Default
Sandi proktor digunakan untuk validasi bypass RLS. Lakukan pembaruan string password pada kebijakan RLS di dashboard Supabase atau ganti di sisi JavaScript `admin-proktor.js`. Pastikan menggunakan pencocokan string terenkripsi atau hashing untuk keamanan ekstra.

### C. Menambahkan Tipe Soal Baru (Misalnya: Benar / Salah)
1.  **Format JSON**: Tambahkan array baru `"soal_bs": [...]` pada format impor JSON.
2.  **Siswa Ujian (`js/siswa-ujian.js`)**:
    *   Buka `loadSessionData()` dan masukkan item `soal_bs` ke dalam array global `questionsList` dengan tanda `type: 'benarsalah'`.
    *   Buka `renderQuestions()` dan buat percabangan renderer baru `else if (q.type === 'benarsalah')` untuk menggambar tombol Benar / Salah di layar.
3.  **Dashboard Proktor (`js/admin-proktor.js`)**: Perbarui fungsi rendering cetak nilai & review agar mengenali tipe soal `benarsalah` dan mengkalkulasi skornya secara otomatis.

---

## 🚀 8. Optimasi Performa & Aksesibilitas

Untuk memberikan pengalaman pengguna yang mulus pada perangkat spesifik dengan jaringan terbatas:
*   **Preconnect Fonts**: Font Google (Inter & Outfit) dimuat menggunakan tag `<link rel="preconnect">` untuk mempercepat pemuatan aset teks secara paralel.
*   **Scoped Rendering Icons**: Pemanggilan pembuat ikon `lucide.createIcons()` dibatasi secara lokal (scoped) ke elemen kontainer target yang baru dibuat demi menghemat komputasi memori CPU.
*   **Aksesibilitas (a11y)**: Ditambahkan atribut `aria-label`, `role="alert"`, dan `aria-live="polite"` pada komponen interaktif (seperti tombol logout, indikator koneksi, modal peringatan) untuk memudahkan pembacaan layar (*screen reader*).
*   **Robot SEO Protection**: Menyertakan `<meta name="robots" content="noindex, nofollow">` pada halaman ujian dan proktor untuk memastikan instrumen penilaian tidak terindeks oleh mesin pencari Google atau Bing.

---

## 📝 9. Changelog (Riwayat Perubahan)

### v2.1 (Pembaruan Terkini)
*   **[BARU]** Integrasi Meta Data Open Graph & Twitter Cards di seluruh file HTML utama untuk mendukung sharing preview di WhatsApp/Telegram.
*   **[BARU]** File Dokumentasi Master `README.md` komprehensif untuk pengembang dan pengguna.

### v2.0
*   **[BARU]** Pembuatan file `js/utils.js` yang mengonsolidasikan fungsi utilitas bersama (menghapus duplikasi kode).
*   **[KEAMANAN]** Proteksi celah XSS via `escapeHtml()` pada render dinamis data.
*   **[KEAMANAN]** Penguncian versi library CDN (Supabase `@2.49.4`, Lucide `@0.460.0`).
*   **[UX]** Penambahan indikator status internet realtime (🟢 Online / 🔴 Offline).
*   **[UX]** Modal Dialog Kustom `showCustomConfirm()` & `showCustomAlert()` bertema madrasah.

### v1.0
*   Pemisahan kode JavaScript ke folder `/js` dari berkas HTML monolitik.
*   Implementasi Row Level Security (RLS) berbasis HTTP Custom Headers.
*   Implementasi database view `view_soal_siswa` untuk keamanan kunci jawaban.
*   Penerapan pengacakan soal Seeded Fisher-Yates berbasis NISN.
