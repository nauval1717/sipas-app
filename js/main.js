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

// Halaman yang sedang aktif (dipakai oleh realtime listener)
let currentPageId = 'dashboard';

// Muat ulang data sesuai halaman
function loadPageData(pageId) {
    if (pageId === 'dashboard' && window.loadDashboardData) window.loadDashboardData();
    if (pageId === 'input-penilaian' && window.initInputPenilaian) window.initInputPenilaian();
    if (pageId === 'karakter' && window.loadKarakter) window.loadKarakter();
    if (pageId === 'skor-siswa' && window.loadSkorSiswa) window.loadSkorSiswa();
    if (pageId === 'pelanggaran' && window.loadPelanggaran) window.loadPelanggaran();
}

// Fungsi perpindahan halaman antarmuka
function switchPage(pageId, event) {
    if (event) event.preventDefault();

    // Validasi akses halaman khusus admin
    if (typeof isPageAllowed === 'function' && !isPageAllowed(pageId)) {
        alert("Akses ditolak: Anda tidak memiliki hak akses untuk membuka halaman ini.");
        return;
    }

    currentPageId = pageId;

    // Sembunyikan seluruh seksi
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.add('hidden');
    });

    // Tampilkan seksi yang dipilih
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.remove('hidden');

    // Auto-load data dari Supabase saat menu diklik
    loadPageData(pageId);

    // Perbarui judul halaman di topbar
    const titleElement = document.getElementById('page-title');
    if (titleElement && pageTitles[pageId]) {
        titleElement.innerText = pageTitles[pageId];
    }

    // Perbarui menu aktif di sidebar
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    if (event && event.currentTarget && event.currentTarget.classList.contains('menu-item')) {
        event.currentTarget.classList.add('active');
    }

    // Perbarui tab aktif di Mobile Tab Bar
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.page === pageId);
    });

    // Tutup sidebar jika dibuka pada layar HP
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }
}

// Buka/Tutup Sidebar HP
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
}

// ===== REALTIME LISTENER SUPABASE (letakkan di paling bawah) =====
let realtimeTimer = null;

function initRealtime() {
    if (typeof supabaseClient === 'undefined') {
        console.warn('supabaseClient belum tersedia, realtime tidak aktif.');
        return;
    }

    supabaseClient
        .channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'penilaian' }, () => {
            // Debounce: banyak input beruntun hanya memicu satu kali refresh
            clearTimeout(realtimeTimer);
            realtimeTimer = setTimeout(() => {
                // Refresh hanya halaman yang sedang dibuka
                // (kecuali input-penilaian, supaya form yang sedang diisi tidak ter-reset)
                if (currentPageId !== 'input-penilaian') {
                    loadPageData(currentPageId);
                }
            }, 500);
        })
        .subscribe();
}

document.addEventListener('DOMContentLoaded', initRealtime);
