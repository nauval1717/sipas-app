// Penanganan Login & Navigasi Hak Akses
function handleLogin(event) {
    event.preventDefault();
    
    // Tampilan awal (simulasi sukses sebelum koneksi full database)
    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("app-view").classList.remove("hidden");
    
    document.getElementById("user-name").innerText = "Guru Penguji";
    document.getElementById("user-role").innerText = "Guru";
}

function handleLogout() {
    document.getElementById("app-view").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
}
