// Status Pengguna Aktif
let currentUser = null;
let currentProfile = null;

// Daftar halaman khusus Admin
const ADMIN_ONLY_PAGES = ['guru', 'kelas', 'karakter', 'pengaturan'];

// Inisialisasi Sesi saat Aplikasi Diberdayakan
document.addEventListener('DOMContentLoaded', async () => {
    initAuthListener();
    await checkCurrentSession();
});

// Mendengarkan Perubahan Status Otentikasi (Sesi Kedaluwarsa / Logout)
function initAuthListener() {
    if (!db) return;

    db.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            resetAppState();
        } else if (event === 'TOKEN_REFRESHED') {
            currentUser = session.user;
        }
    });
}

// Memeriksa Sesi Pengguna Aktif
async function checkCurrentSession() {
    if (!db) return;

    try {
        const { data: { session }, error } = await db.auth.getSession();
        if (error || !session) {
            resetAppState();
            return;
        }

        currentUser = session.user;
        await loadUserProfile(currentUser.id);
    } catch (err) {
        console.error("Gagal memeriksa sesi:", err);
        resetAppState();
    }
}

// Memuat Data Profil & Role Pengguna dari Database
async function loadUserProfile(userId) {
    showLoginLoading(true);
    try {
        const { data, error } = await db
            .from('profiles')
            .select('id, nama_lengkap, role')
            .eq('id', userId)
            .single();

        if (error || !data) {
            showLoginError("Profil pengguna tidak ditemukan di database.");
            await db.auth.signOut();
            resetAppState();
            return;
        }

        currentProfile = data;

        // Sinkronkan ke window agar bisa diakses file JS lain
        window.currentProfile = data;
        window.currentUserRole = data.role || 'guru';

        renderUserInterface();
    } catch (err) {
        console.error("Gagal memuat profil:", err);
        showLoginError("Terjadi kesalahan saat memuat profil.");
        resetAppState();
    } finally {
        showLoginLoading(false);
    }
}

// Penanganan Formulir Login Email & Password
async function handleLogin(event) {
    event.preventDefault();
    hideLoginError();

    if (!db) {
        showLoginError("Supabase belum dikonfigurasi. Periksa URL dan Anon Key pada js/supabase-config.js.");
        return;
    }

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    showLoginLoading(true);

    try {
        const { data, error } = await db.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            showLoginError(getAuthErrorMessage(error.message));
            showLoginLoading(false);
            return;
        }

        currentUser = data.user;
        await loadUserProfile(currentUser.id);
    } catch (err) {
        showLoginError("Gagal me-respons permintaan login. Periksa koneksi internet Anda.");
        showLoginLoading(false);
    }
}

// --- FUNGSI UPDATE TAMPILAN HEADER PROFIL ---
function updateUserHeaderProfile(profile, email) {
    const elName = document.getElementById('user-name');
    const elRole = document.getElementById('user-role');

    if (elName) {
        // Ambil nama lengkap dari tabel profiles. Jika kosong, gunakan nama depan email
        const namaLengkap = profile?.nama_lengkap;
        const namaEmail = email ? email.split('@')[0] : 'Pengguna';

        elName.innerText = namaLengkap || namaEmail;
    }

    if (elRole) {
        // Tampilkan jabatan/peran resmi
        const role = profile?.role || 'guru';
        elRole.innerText = (role === 'admin') ? 'ADMINISTRATOR' : 'GURU PENCATAT';
    }
}

// --- RENDER ANTARMUKA (TRANSISI BERHASIL MASUK) ---
function renderUserInterface() {
    const loginView = document.getElementById("login-view");
    const appView = document.getElementById("app-view");

    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    appView.classList.add("page-fade-in");

    // Perbarui header profil (nama lengkap & jabatan)
    updateUserHeaderProfile(currentProfile, currentUser?.email);

    applyRoleRestrictions(currentProfile.role);

    if (typeof switchPage === 'function') {
        switchPage('dashboard');
    }

    // Tampilkan Notifikasi Berhasil Masuk
    const namaTampil = currentProfile.nama_lengkap
        || (currentUser?.email ? currentUser.email.split('@')[0] : 'Pengguna');
    showToast(`Berhasil masuk! Selamat datang, ${namaTampil}.`, 'success');
}

// Membatasi Navigasi Sesuai Hak Akses Pengguna
function applyRoleRestrictions(role) {
    const adminElements = document.querySelectorAll('[data-role="admin"]');

    adminElements.forEach(el => {
        if (role === 'admin') {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

// --- LOGIKA MODAL KONFIRMASI LOGOUT ---
function handleLogout() {
    const modal = document.getElementById("logout-modal");
    if (modal) {
        modal.classList.remove("hidden");
    }
}

function closeLogoutModal() {
    const modal = document.getElementById("logout-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
}

async function confirmLogout() {
    closeLogoutModal();

    if (db) {
        await db.auth.signOut();
    }

    resetAppState();
    showToast("Anda telah keluar dari aplikasi.", "info");
}

// Mengembalikan Aplikasi ke Tampilan Login
function resetAppState() {
    currentUser = null;
    currentProfile = null;
    window.currentProfile = null;
    window.currentUserRole = null;

    const loginForm = document.getElementById("login-form");
    if (loginForm) loginForm.reset();

    document.getElementById("app-view").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    showLoginLoading(false);
}

// Menampilkan Pesan Kesalahan Login
function showLoginError(msg) {
    const alertBox = document.getElementById("login-alert");
    if (alertBox) {
        alertBox.innerText = msg;
        alertBox.classList.remove("hidden");
    }
}

function hideLoginError() {
    const alertBox = document.getElementById("login-alert");
    if (alertBox) {
        alertBox.classList.add("hidden");
    }
}

function showLoginLoading(isLoading) {
    const btn = document.querySelector("#login-form button[type='submit']");
    if (btn) {
        btn.disabled = isLoading;
        btn.innerText = isLoading ? "Memproses..." : "Masuk ke Aplikasi";
    }
}

// Menerjemahkan Pesan Kesalahan Supabase Auth ke Bahasa Indonesia
function getAuthErrorMessage(message) {
    if (message.includes("Invalid login credentials")) {
        return "Email atau kata sandi salah.";
    }
    if (message.includes("Email not confirmed")) {
        return "Email Anda belum dikonfirmasi.";
    }
    return "Terjadi kesalahan login: " + message;
}

// --- FUNGSI PEMBANTU NOTIFIKASI TOAST ---
function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const iconMap = {
        'success': '✅',
        'info': 'ℹ️',
        'error': '⚠️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${iconMap[type] || '🔔'}</span> <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, duration);
}
