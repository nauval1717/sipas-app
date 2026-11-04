// Variable State & Lock Submit
let isSubmittingPenilaian = false;
let isSubmittingEdit = false;
let cachePenilaianDep = {
    kelas: [],
    siswa: [],
    kategori: [],
    perilaku: []
};

// Inisialisasi Otomatis
document.addEventListener('DOMContentLoaded', () => {
    // Dipanggil jika elemen halaman input penilaian ada di DOM
    if (document.getElementById('page-input-penilaian')) {
        initInputPenilaian();
    }
});

async function initInputPenilaian() {
    if (!window.db) return;
    
    // Set Tanggal Default Hari Ini
    const inputTanggal = document.getElementById('input-tanggal');
    if (inputTanggal && !inputTanggal.value) {
        inputTanggal.value = new Date().toISOString().split('T')[0];
    }

    await loadPenilaianDependencies();
    await loadRecentPenilaianTable();
}

// ----------------------------------------------------
// 1. MEMUAT DATA DEPENDENSI & POPULASI DROPDOWN
// ----------------------------------------------------
async function loadPenilaianDependencies() {
    try {
        const [resKelas, resSiswa, resKategori, resPerilaku] = await Promise.all([
            window.db.from('kelas').select('id, nama_kelas').order('nama_kelas'),
            window.db.from('siswa').select('id, nis, nama_lengkap, kelas_id_aktif').order('nama_lengkap'),
            window.db.from('kategori_karakter').select('id, nama_kategori').order('nama_kategori'),
            window.db.from('master_perilaku').select('id, nama_perilaku, jenis, kategori_id').order('nama_perilaku')
        ]);

        if (resKelas.error) throw resKelas.error;
        if (resSiswa.error) throw resSiswa.error;
        if (resKategori.error) throw resKategori.error;
        if (resPerilaku.error) throw resPerilaku.error;

        cachePenilaianDep.kelas = resKelas.data || [];
        cachePenilaianDep.siswa = resSiswa.data || [];
        cachePenilaianDep.kategori = resKategori.data || [];
        cachePenilaianDep.perilaku = resPerilaku.data || [];

        renderSelectKelas();
        renderSelectKategori();
        updatePerilakuDropdown();

    } catch (err) {
        if (window.showToast) showToast("Gagal memuat formulir penilaian: " + err.message, "error");
    }
}

function renderSelectKelas() {
    const el = document.getElementById('select-kelas');
    if (!el) return;
    el.innerHTML = `<option value="">-- Pilih Kelas --</option>` +
        cachePenilaianDep.kelas.map(k => `<option value="${k.id}">${k.nama_kelas}</option>`).join('');
}

function renderSelectKategori() {
    const el = document.getElementById('select-kategori');
    if (!el) return;
    el.innerHTML = `<option value="">-- Semua Kategori --</option>` +
        cachePenilaianDep.kategori.map(k => `<option value="${k.id}">${k.nama_kategori}</option>`).join('');
}

// Event Handler: Pilihan Kelas Berubah -> Saring Daftar Siswa
function onPenilaianKelasChange() {
    const kelasId = document.getElementById('select-kelas').value;
    const elSiswa = document.getElementById('select-siswa');
    if (!elSiswa) return;

    if (!kelasId) {
        elSiswa.innerHTML = `<option value="">-- Pilih Kelas Terlebih Dahulu --</option>`;
        elSiswa.disabled = true;
        return;
    }

    const filteredSiswa = cachePenilaianDep.siswa.filter(s => s.kelas_id_aktif === kelasId);
    if (filteredSiswa.length === 0) {
        elSiswa.innerHTML = `<option value="">-- Tidak Ada Siswa di Kelas Ini --</option>`;
        elSiswa.disabled = true;
    } else {
        elSiswa.innerHTML = `<option value="">-- Pilih Nama Siswa --</option>` +
            filteredSiswa.map(s => `<option value="${s.id}">${s.nama_lengkap} (${s.nis || '-'})</option>`).join('');
        elSiswa.disabled = false;
    }
}

// Event Handler: Pilihan Jenis/Kategori Berubah -> Saring Daftar Perilaku
function updatePerilakuDropdown() {
    const jenisEl = document.getElementById('select-jenis');
    const kategoriEl = document.getElementById('select-kategori');
    const elPerilaku = document.getElementById('select-perilaku');
    if (!elPerilaku) return;

    const jenisVal = jenisEl ? jenisEl.value : 'positif';
    const kategoriVal = kategoriEl ? kategoriEl.value : '';

    let filtered = cachePenilaianDep.perilaku.filter(p => p.jenis === jenisVal);
    if (kategoriVal) {
        filtered = filtered.filter(p => p.kategori_id === kategoriVal);
    }

    if (filtered.length === 0) {
        elPerilaku.innerHTML = `<option value="">-- Tidak ada pilihan perilaku --</option>`;
    } else {
        elPerilaku.innerHTML = `<option value="">-- Pilih Perilaku Sikap --</option>` +
            filtered.map(p => `<option value="${p.id}">${p.nama_perilaku}</option>`).join('');
    }
}

// ----------------------------------------------------
// 2. PROSES SIMPAN PENILAIAN BARU (LOCK DOUBLE SUBMIT)
// ----------------------------------------------------
async function savePenilaian(event) {
    event.preventDefault();

    // Prevent Double Click
    if (isSubmittingPenilaian) return;

    const btnSubmit = document.getElementById('btn-simpan-penilaian');
    const tanggal = document.getElementById('input-tanggal').value;
    const kelas_id = document.getElementById('select-kelas').value;
    const siswa_id = document.getElementById('select-siswa').value;
    const jenis_sikap = document.getElementById('select-jenis').value;
    const perilaku_id = document.getElementById('select-perilaku').value;
    const catatan = document.getElementById('input-catatan').value.trim();

    // Validasi Formulir
    if (!tanggal || !kelas_id || !siswa_id || !perilaku_id) {
        if (window.showToast) showToast("Lengkapi seluruh bidang formulir yang wajib diisi!", "error");
        return;
    }

    // Ambil ID Pencatat (Guru yang Login)
    const pencatat_id = window.currentProfile?.id || null;

    try {
        isSubmittingPenilaian = true;
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<span>⏳ Menyimpan...</span>`;
        }

        const { error } = await window.db.from('penilaian_sikap').insert([{
            tanggal,
            siswa_id,
            kelas_id,
            perilaku_id,
            jenis_sikap,
            catatan: catatan || null,
            pencatat_id
        }]);

        if (error) throw error;

        if (window.showToast) showToast("Penilaian sikap berhasil dicatat!", "success");
        
        // Reset hanya data pilihan siswa & perilaku, pertahankan tanggal & kelas agar cepat
        document.getElementById('select-siswa').value = '';
        document.getElementById('select-perilaku').value = '';
        document.getElementById('input-catatan').value = '';

        await loadRecentPenilaianTable();

    } catch (err) {
        if (window.showToast) showToast("Gagal menyimpan penilaian: " + err.message, "error");
    } finally {
        isSubmittingPenilaian = false;
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<span>💾 Simpan Penilaian</span>`;
        }
    }
}

// Reset Formulir Penuh
function resetFormPenilaian() {
    const form = document.getElementById('form-penilaian');
    if (form) form.reset();
    
    // Kembalikan tanggal ke hari ini
    const inputTanggal = document.getElementById('input-tanggal');
    if (inputTanggal) inputTanggal.value = new Date().toISOString().split('T')[0];

    // Reset dropdown terikat
    onPenilaianKelasChange();
    updatePerilakuDropdown();

    if (window.showToast) showToast("Formulir berhasil direset.", "info");
}

// ----------------------------------------------------
// 3. TABEL RIWAYAT PENILAIAN TERBARU & EDIT CATATAN
// ----------------------------------------------------
async function loadRecentPenilaianTable() {
    const tbody = document.getElementById('table-recent-assessments');
    if (!tbody) return;

    try {
        const { data, error } = await window.db
            .from('penilaian_sikap')
            .select(`
                id,
                tanggal,
                jenis_sikap,
                catatan,
                created_at,
                siswa:siswa_id (nama_lengkap),
                kelas:kelas_id (nama_kelas),
                master_perilaku:perilaku_id (nama_perilaku),
                pencatat:pencatat_id (nama_lengkap)
            `)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Belum ada catatan penilaian terbaru.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(p => {
            const isPositif = p.jenis_sikap === 'positif';
            const badgeClass = isPositif ? 'bg-green' : 'bg-red';
            const jenisText = isPositif ? 'POSITIF' : 'NEGATIF';
            const pencatatNama = p.pencatat?.nama_lengkap || 'Sistem';

            return `
                <tr>
                    <td>${new Date(p.tanggal).toLocaleDateString('id-ID')}</td>
                    <td><strong>${p.siswa?.nama_lengkap || '-'}</strong></td>
                    <td>${p.kelas?.nama_kelas || '-'}</td>
                    <td><span class="badge ${badgeClass}">${jenisText}</span></td>
                    <td>
                        <div><strong>${p.master_perilaku?.nama_perilaku || '-'}</strong></div>
                        <small class="text-muted">${p.catatan ? `"${p.catatan}"` : '<em>Tanpa catatan</em>'}</small>
                    </td>
                    <td>
                        <small>${pencatatNama}</small>
                        <div class="mt-1">
                            <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 11px;" onclick="openModalEditPenilaian('${p.id}')">✏️ Edit Catatan</button>
                            <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 11px;" onclick="viewHistoryPerubahan('${p.id}')">📜 Riwayat</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Gagal memuat daftar penilaian: ${err.message}</td></tr>`;
    }
}

// Modal Edit Catatan
async function openModalEditPenilaian(penilaianId) {
    const modal = document.getElementById('modal-edit-penilaian');
    if (!modal) return;

    try {
        const { data, error } = await window.db
            .from('penilaian_sikap')
            .select(`
                id,
                catatan,
                siswa:siswa_id (nama_lengkap),
                master_perilaku:perilaku_id (nama_perilaku)
            `)
            .eq('id', penilaianId)
            .single();

        if (error) throw error;

        document.getElementById('edit-penilaian-id').value = data.id;
        document.getElementById('edit-siswa-info').innerText = `Siswa: ${data.siswa?.nama_lengkap || '-'} (${data.master_perilaku?.nama_perilaku || '-'})`;
        document.getElementById('edit-catatan-lama').value = data.catatan || '';
        document.getElementById('edit-catatan-baru').value = data.catatan || '';

        modal.classList.remove('hidden');
    } catch (err) {
        if (window.showToast) showToast("Gagal membuka data edit: " + err.message, "error");
    }
}

// Simpan Perubahan Catatan & Log Riwayat Perubahan
async function saveEditPenilaian(event) {
    event.preventDefault();
    if (isSubmittingEdit) return;

    const btnSubmit = document.getElementById('btn-simpan-edit-penilaian');
    const id = document.getElementById('edit-penilaian-id').value;
    const catatanLama = document.getElementById('edit-catatan-lama').value;
    const catatanBaru = document.getElementById('edit-catatan-baru').value.trim();
    const diubahOleh = window.currentProfile?.id || null;

    if (catatanLama === catatanBaru) {
        if (window.showToast) showToast("Tidak ada perubahan pada catatan.", "info");
        closeModal('modal-edit-penilaian');
        return;
    }

    try {
        isSubmittingEdit = true;
        if (btnSubmit) btnSubmit.disabled = true;

        // 1. Update data penilaian sikap
        const { error: errUpdate } = await window.db
            .from('penilaian_sikap')
            .update({
                catatan: catatanBaru,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (errUpdate) throw errUpdate;

        // 2. Rekam Jejak Perubahan ke Tabel riwayat_perubahan
        const { error: errLog } = await window.db
            .from('riwayat_perubahan')
            .insert([{
                penilaian_id: id,
                diubah_oleh: diubahOleh,
                catatan_lama: catatanLama || null,
                catatan_baru: catatanBaru || null
            }]);

        if (errLog) console.warn("Peringatan: Gagal mencatat log riwayat:", errLog.message);

        if (window.showToast) showToast("Catatan penilaian berhasil diperbarui!", "success");
        closeModal('modal-edit-penilaian');
        await loadRecentPenilaianTable();

    } catch (err) {
        if (window.showToast) showToast("Gagal memperbarui catatan: " + err.message, "error");
    } finally {
        isSubmittingEdit = false;
        if (btnSubmit) btnSubmit.disabled = false;
    }
}

// Lihat Log Riwayat Perubahan Catatan
async function viewHistoryPerubahan(penilaianId) {
    const modal = document.getElementById('modal-history-penilaian');
    const tbody = document.getElementById('table-history-penilaian');
    if (!modal || !tbody) return;

    tbody.innerHTML = `<tr><td colspan="3" class="text-center">Memuat riwayat perubahan...</td></tr>`;
    modal.classList.remove('hidden');

    try {
        const { data, error } = await window.db
            .from('riwayat_perubahan')
            .select(`
                created_at,
                catatan_lama,
                catatan_baru,
                pengubah:diubah_oleh (nama_lengkap)
            `)
            .eq('penilaian_id', penilaianId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Belum ada riwayat perubahan pada catatan ini.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(h => `
            <tr>
                <td><small>${new Date(h.created_at).toLocaleString('id-ID')}</small><br><strong>${h.pengubah?.nama_lengkap || 'Pengguna'}</strong></td>
                <td><small class="text-danger">${h.catatan_lama || '<em>(Kosong)</em>'}</small></td>
                <td><small class="text-success">${h.catatan_baru || '<em>(Kosong)</em>'}</small></td>
            </tr>
        `).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Gagal memuat log riwayat.</td></tr>`;
    }
}

// Registrasi Fungsi Global
window.onPenilaianKelasChange = onPenilaianKelasChange;
window.updatePerilakuDropdown = updatePerilakuDropdown;
window.savePenilaian = savePenilaian;
window.resetFormPenilaian = resetFormPenilaian;
window.openModalEditPenilaian = openModalEditPenilaian;
window.saveEditPenilaian = saveEditPenilaian;
window.viewHistoryPerubahan = viewHistoryPerubahan;
window.initInputPenilaian = initInputPenilaian;
