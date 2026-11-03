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

// Fungsi perpindahan halaman antarmuka
function switchPage(pageId, event) {
    if (event) event.preventDefault();

    // Sembunyikan seluruh seksi
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.add('hidden');
    });

    // Tampilkan seksi yang dipilih
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        targetPage.classList.remove('hidden');
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
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    }
}

// Buka/Tutup Sidebar HP
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}
