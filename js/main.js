// Kamus judul halaman
const pageTitles = {
    'dashboard': 'Dashboard',
    'input-penilaian': 'Input Penilaian Sikap',
    'siswa': 'Data Siswa',
    'guru': 'Data Guru',
    'kelas': 'Data Kelas',
    'karakter': 'Data Karakter & Perilaku',
    'skor-siswa': 'Skor & Rekapitulasi Siswa',
    'pelanggaran': 'Daftar Pelanggaran Siswa',
    'laporan': 'Laporan & Ekspor Data',
    'pengaturan': 'Pengaturan Aplikasi'
};

// Fungsi perpindahan halaman antarmuka (Dilengkapi validasi hak akses role)
function switchPage(pageId, event) {
    if (event) event.preventDefault();

    // Validasi Akses Halaman Khusus Admin
    if (typeof isPageAllowed === 'function' && !isPageAllowed(pageId)) {
        alert("Akses ditolak: Anda tidak memiliki hak akses untuk membuka halaman ini.");
        return;
    }

    // Sembunyikan seluruh seksi
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.add('hidden');
    });

    // Tampilkan seksi yang dipilih
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }

    // Inisialisasi halaman Input Penilaian saat dibuka
    if (pageId === 'input-penilaian' && window.initInputPenilaian) {
        window.initInputPenilaian();
    }

    // Muat data Karakter & Perilaku saat halaman Data Karakter dibuka
    if (pageId === 'karakter' && window.loadKarakter) {
        window.loadKarakter();
    }

    // Perbarui judul halaman di bar topbar
    const titleElement = document.getElementById('page-title');
    if (titleElement && pageTitles[pageId]) {
        titleElement.innerText = pageTitles[pageId];
    }

    // Perbarui menu aktif di sidebar
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    // Tutup sidebar jika dibuka pada layar ponsel
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    }
}

// Buka/Tutup Sidebar HP
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
}
