// Variable State & Lock Submit
let isSubmittingPenilaian = false;
let isSubmittingEdit = false;

// Cache Master Dependensi
let cachePenilaianDep = {
    kelas: [],
    siswa: [],
    kategori: [],
    perilaku: []
};

// State Mode Aktif
let currentInputMode = 'single'; // 'single', 'modeA', 'modeB'

// State Mode A (1 Siswa, Banyak Catatan)
let modeARowIdCounter = 0;
let modeARows = []; // array of object: { id, jenis, kategori_id, perilaku_id, tanggal, catatan }

// State Mode B (Banyak Siswa Sekaligus)
let modeBSelectedSiswaIds = new Set();
let modeBPendingRecords = []; // array of object record yang siap disimpan

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('page-input-penilaian')) {
        initInputPenilaian();
    }
});

async function initInputPenilaian() {
    if (!window.db) return;

    // Set default tanggal ke hari ini
    const today = new Date().toISOString().split('T')[0];
    ['input-tanggal', 'modeb-bulk-tanggal'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });

    await loadPenilaianDependencies();
    await loadRecentPenilaianTable();
}

// ----------------------------------------------------
// 1. MEMUAT DATA DEPENDENSI & POPULASI DROPDOWN
// ----------------------------------------------------
async function loadPenilaianDependencies() {
    try {
        const [resKelas, resSiswa, resKategori, resPerilaku] = await Promise.all([
            window.db.from('kelas').select('id, nama_kelas, tahun_ajaran_id').order('nama_kelas'),
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

        renderAllKelasDropdowns();
        renderAllKategoriDropdowns();
        updatePerilakuDropdown();
        updateModeBBulkPerilaku();

    } catch (err) {
        if (window.showToast) showToast("Gagal memuat formulir penilaian: " + err.message, "error");
    }
}

function renderAllKelasDropdowns() {
    const options = `<option value="">-- Pilih Kelas --</option>` +
        cachePenilaianDep.kelas.map(k => `<option value="${k.id}">${k.nama_kelas}</option>`).join('');

    ['select-kelas', 'modea-select-kelas', 'modeb-select-kelas'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = options;
    });
}

function renderAllKategoriDropdowns() {
    const options = `<option value="">-- Semua Kategori --</option>` +
        cachePenilaianDep.kategori.map(k => `<option value="${k.id}">${k.nama_kategori}</option>`).join('');

    ['select-kategori', 'modeb-bulk-kategori'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = options;
    });
}

// ----------------------------------------------------
// 2. NAVIGASI SWITCH MODE INPUT PENILAIAN
// ----------------------------------------------------
function switchModeInputPenilaian(mode) {
    currentInputMode = mode;

    const btnSingle = document.getElementById('btn-tab-mode-single');
    const btnModeA = document.getElementById('btn-tab-mode-a');
    const btnModeB = document.getElementById('btn-tab-mode-b');

    const containerSingle = document.getElementById('container-mode-single');
    const containerModeA = document.getElementById('container-mode-a');
    const containerModeB = document.getElementById('container-mode-b');

    // Reset Style Tombol
    [btnSingle, btnModeA, btnModeB].forEach(b => {
        if (b) {
            b.classList.remove('btn-primary');
            b.classList.add('btn-secondary');
        }
    });

    // Sembunyikan Semua Kontainer
    [containerSingle, containerModeA, containerModeB].forEach(c => {
        if (c) c.classList.add('hidden');
    });

    if (mode === 'single') {
        if (btnSingle) { btnSingle.classList.remove('btn-secondary'); btnSingle.classList.add('btn-primary'); }
        if (containerSingle) containerSingle.classList.remove('hidden');
    } else if (mode === 'modeA') {
        if (btnModeA) { btnModeA.classList.remove('btn-secondary'); btnModeA.classList.add('btn-primary'); }
        if (containerModeA) containerModeA.classList.remove('hidden');
        if (modeARows.length === 0) addModeARow(); // Buat 1 baris pertama jika kosong
    } else if (mode === 'modeB') {
        if (btnModeB) { btnModeB.classList.remove('btn-secondary'); btnModeB.classList.add('btn-primary'); }
        if (containerModeB) containerModeB.classList.remove('hidden');
    }
}

// ----------------------------------------------------
// 3. LOGIKA MODE STANDAR (SINGLE INPUT)
// ----------------------------------------------------
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

async function savePenilaian(event) {
    event.preventDefault();
    if (isSubmittingPenilaian) return;

    const btnSubmit = document.getElementById('btn-simpan-penilaian');
    const tanggal = document.getElementById('input-tanggal').value;
    const kelas_id = document.getElementById('select-kelas').value;
    const siswa_id = document.getElementById('select-siswa').value;
    const jenis_sikap = document.getElementById('select-jenis').value;
    const perilaku_id = document.getElementById('select-perilaku').value;
    const catatan = document.getElementById('input-catatan').value.trim();

    if (!tanggal || !kelas_id || !siswa_id || !perilaku_id) {
        if (window.showToast) showToast("Lengkapi seluruh bidang wajib!", "error");
        return;
    }

    const kelasObj = cachePenilaianDep.kelas.find(k => k.id === kelas_id);
    const tahun_ajaran_id = kelasObj ? kelasObj.tahun_ajaran_id : null;
    const pencatat_id = window.currentProfile?.id || null;

    try {
        isSubmittingPenilaian = true;
        if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = `<span>⏳ Menyimpan...</span>`; }

        const { error } = await window.db.from('penilaian_sikap').insert([{
            tanggal,
            siswa_id,
            kelas_id,
            tahun_ajaran_id,
            perilaku_id,
            jenis_sikap,
            catatan: catatan || null,
            pencatat_id,
            guru_id: pencatat_id
        }]);

        if (error) throw error;

        if (window.showToast) showToast("Penilaian sikap berhasil dicatat!", "success");

        document.getElementById('select-siswa').value = '';
        document.getElementById('select-perilaku').value = '';
        document.getElementById('input-catatan').value = '';

        await loadRecentPenilaianTable();

    } catch (err) {
        if (window.showToast) showToast("Gagal menyimpan penilaian: " + err.message, "error");
    } finally {
        isSubmittingPenilaian = false;
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<span>💾 Simpan Penilaian</span>`; }
    }
}

function resetFormPenilaian() {
    const form = document.getElementById('form-penilaian');
    if (form) form.reset();
    const inputTanggal = document.getElementById('input-tanggal');
    if (inputTanggal) inputTanggal.value = new Date().toISOString().split('T')[0];
    onPenilaianKelasChange();
    updatePerilakuDropdown();
    if (window.showToast) showToast("Formulir direset.", "info");
}

// ----------------------------------------------------
// 4. LOGIKA MODE A: 1 SISWA, BANYAK CATATAN
// ----------------------------------------------------
function onModeAKelasChange() {
    const kelasId = document.getElementById('modea-select-kelas').value;
    const elSiswa = document.getElementById('modea-select-siswa');
    if (!elSiswa) return;

    if (!kelasId) {
        elSiswa.innerHTML = `<option value="">-- Pilih Kelas Terlebih Dahulu --</option>`;
        elSiswa.disabled = true;
        updateModeASummary();
        return;
    }

    const filtered = cachePenilaianDep.siswa.filter(s => s.kelas_id_aktif === kelasId);
    if (filtered.length === 0) {
        elSiswa.innerHTML = `<option value="">-- Tidak Ada Siswa di Kelas Ini --</option>`;
        elSiswa.disabled = true;
    } else {
        elSiswa.innerHTML = `<option value="">-- Pilih Nama Siswa --</option>` +
            filtered.map(s => `<option value="${s.id}">${s.nama_lengkap} (${s.nis || '-'})</option>`).join('');
        elSiswa.disabled = false;
    }
    updateModeASummary();
}

function addModeARow() {
    modeARowIdCounter++;
    const rowId = modeARowIdCounter;
    const today = new Date().toISOString().split('T')[0];

    modeARows.push({
        id: rowId,
        jenis: 'positif',
        kategori_id: '',
        perilaku_id: '',
        tanggal: today,
        catatan: ''
    });

    renderModeARows();
}

function removeModeARow(rowId) {
    if (modeARows.length <= 1) {
        if (window.showToast) showToast("Minimal harus ada 1 baris catatan!", "info");
        return;
    }
    modeARows = modeARows.filter(r => r.id !== rowId);
    renderModeARows();
}

function renderModeARows() {
    const container = document.getElementById('modea-rows-container');
    const countSpan = document.getElementById('modea-count-rows');
    if (!container) return;

    if (countSpan) countSpan.innerText = modeARows.length;

    container.innerHTML = modeARows.map((row, index) => {
        // Option Perilaku sesuai jenis & kategori row
        let filteredPerilaku = cachePenilaianDep.perilaku.filter(p => p.jenis === row.jenis);
        if (row.kategori_id) {
            filteredPerilaku = filteredPerilaku.filter(p => p.kategori_id === row.kategori_id);
        }

        const perilakuOptions = `<option value="">-- Pilih Perilaku --</option>` +
            filteredPerilaku.map(p => `<option value="${p.id}" ${p.id === row.perilaku_id ? 'selected' : ''}>${p.nama_perilaku}</option>`).join('');

        const kategoriOptions = `<option value="">-- Semua Kategori --</option>` +
            cachePenilaianDep.kategori.map(k => `<option value="${k.id}" ${k.id === row.kategori_id ? 'selected' : ''}>${k.nama_kategori}</option>`).join('');

        return `
            <div class="card mb-3" style="border: 1px solid #cbd5e1; background: #fafafa;" id="modea-row-${row.id}">
                <div class="card-header flex-between" style="padding: 8px 15px; background: #f1f5f9;">
                    <strong>Catatan #${index + 1}</strong>
                    <button type="button" class="btn btn-danger" style="padding: 2px 8px; font-size: 12px;" onclick="removeModeARow(${row.id})">🗑️ Hapus Baris</button>
                </div>
                <div class="card-body" style="padding: 15px;">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Jenis Penilaian</label>
                            <select class="form-input" onchange="updateModeARowData(${row.id}, 'jenis', this.value)">
                                <option value="positif" ${row.jenis === 'positif' ? 'selected' : ''}>👍 POSITIF (Apresiasi)</option>
                                <option value="negatif" ${row.jenis === 'negatif' ? 'selected' : ''}>👎 NEGATIF (Pelanggaran)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Kategori Karakter</label>
                            <select class="form-input" onchange="updateModeARowData(${row.id}, 'kategori_id', this.value)">
                                ${kategoriOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Perilaku Sikap <span class="text-danger">*</span></label>
                            <select class="form-input" onchange="updateModeARowData(${row.id}, 'perilaku_id', this.value)">
                                ${perilakuOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Tanggal Kejadian</label>
                            <input type="date" class="form-input" value="${row.tanggal}" onchange="updateModeARowData(${row.id}, 'tanggal', this.value)">
                        </div>
                    </div>
                    <div class="form-group mt-2">
                        <label>Keterangan / Catatan Kejadian</label>
                        <input type="text" class="form-input" value="${row.catatan}" placeholder="Catatan singkat..." onchange="updateModeARowData(${row.id}, 'catatan', this.value)">
                    </div>
                </div>
            </div>
        `;
    }).join('');

    updateModeASummary();
}

function updateModeARowData(rowId, field, value) {
    const row = modeARows.find(r => r.id === rowId);
    if (row) {
        row[field] = value;
        if (field === 'jenis' || field === 'kategori_id') {
            row.perilaku_id = ''; // Reset perilaku saat jenis/kategori berubah
            renderModeARows();
        } else {
            updateModeASummary();
        }
    }
}

function updateModeASummary() {
    const elSiswa = document.getElementById('modea-select-siswa');
    const summaryEl = document.getElementById('modea-summary-text');
    if (!summaryEl) return;

    const siswaId = elSiswa ? elSiswa.value : '';
    const siswaObj = cachePenilaianDep.siswa.find(s => s.id === siswaId);
    const siswaNama = siswaObj ? siswaObj.nama_lengkap : 'Belum dipilih';

    summaryEl.innerHTML = `Siswa: <strong>${siswaNama}</strong> | Total <strong>${modeARows.length}</strong> catatan siap disimpan.`;
}

async function savePenilaianModeA(event) {
    event.preventDefault();
    if (isSubmittingPenilaian) return;

    const btnSubmit = document.getElementById('btn-simpan-modea');
    const kelas_id = document.getElementById('modea-select-kelas').value;
    const siswa_id = document.getElementById('modea-select-siswa').value;

    if (!kelas_id || !siswa_id) {
        if (window.showToast) showToast("Pilih kelas dan siswa terlebih dahulu!", "error");
        return;
    }

    if (modeARows.length === 0) {
        if (window.showToast) showToast("Tambahkan minimal 1 baris catatan!", "error");
        return;
    }

    // Validasi Kelengkapan Perilaku per baris
    for (let i = 0; i < modeARows.length; i++) {
        if (!modeARows[i].perilaku_id) {
            if (window.showToast) showToast(`Baris catatan #${i + 1} belum memilih perilaku sikap!`, "error");
            return;
        }
    }

    const kelasObj = cachePenilaianDep.kelas.find(k => k.id === kelas_id);
    const tahun_ajaran_id = kelasObj ? kelasObj.tahun_ajaran_id : null;
    const pencatat_id = window.currentProfile?.id || null;

    // Susun Payload Batch Insert
    const payload = modeARows.map(r => ({
        tanggal: r.tanggal || new Date().toISOString().split('T')[0],
        siswa_id,
        kelas_id,
        tahun_ajaran_id,
        perilaku_id: r.perilaku_id,
        jenis_sikap: r.jenis,
        catatan: r.catatan.trim() || null,
        pencatat_id,
        guru_id: pencatat_id
    }));

    try {
        isSubmittingPenilaian = true;
        if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = `<span>⏳ Menyimpan ${payload.length} Catatan...</span>`; }

        const { data, error } = await window.db.from('penilaian_sikap').insert(payload).select('id');

        if (error) throw error;

        const successCount = data ? data.length : payload.length;
        if (window.showToast) showToast(`Berhasil menyimpan ${successCount} catatan sekaligus!`, "success");

        resetModeA();
        await loadRecentPenilaianTable();

    } catch (err) {
        if (window.showToast) showToast("Gagal menyimpan catatan Mode A: " + err.message, "error");
    } finally {
        isSubmittingPenilaian = false;
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = `<span>💾 Simpan Semua Catatan (Mode A)</span>`; }
    }
}

function resetModeA() {
    document.getElementById('modea-select-kelas').value = '';
    onModeAKelasChange();
    modeARows = [];
    modeARowIdCounter = 0;
    addModeARow();
}

// ----------------------------------------------------
// 5. LOGIKA MODE B: BANYAK SISWA SEKALIGUS (MASSAL)
// ----------------------------------------------------
function onModeBKelasChange() {
    const kelasId = document.getElementById('modeb-select-kelas').value;
    const contentArea = document.getElementById('modeb-content-area');
    const checkboxGrid = document.getElementById('modeb-siswa-checkbox-grid');
    if (!contentArea || !checkboxGrid) return;

    modeBSelectedSiswaIds.clear();
    modeBPendingRecords = [];

    if (!kelasId) {
        contentArea.classList.add('hidden');
        return;
    }

    const filteredSiswa = cachePenilaianDep.siswa.filter(s => s.kelas_id_aktif === kelasId);
    if (filteredSiswa.length === 0) {
        checkboxGrid.innerHTML = `<p class="text-muted text-center" style="grid-column: 1/-1;">Tidak ada siswa di kelas ini.</p>`;
    } else {
        checkboxGrid.innerHTML = filteredSiswa.map(s => `
            <label style="display: flex; align-items: center; gap: 8px; background: #fff; padding: 6px 10px; border-radius: 4px; border: 1px solid #e2e8f0; font-size: 13px; cursor: pointer;">
                <input type="checkbox" value="${s.id}" onchange="toggleSingleModeBSiswa('${s.id}', this.checked)">
                <span>${s.nama_lengkap} <small class="text-muted">(${s.nis || '-'})</small></span>
            </label>
        `).join('');
    }

    contentArea.classList.remove('hidden');
    updateModeBPreviewTable();
}

function toggleSelectAllModeBSiswa(checked) {
    const kelasId = document.getElementById('modeb-select-kelas').value;
    const filteredSiswa = cachePenilaianDep.siswa.filter(s => s.kelas_id_aktif === kelasId);
    const checkboxes = document.querySelectorAll('#modeb-siswa-checkbox-grid input[type="checkbox"]');

    checkboxes.forEach(cb => cb.checked = checked);

    if (checked) {
        filteredSiswa.forEach(s => modeBSelectedSiswaIds.add(s.id));
    } else {
        modeBSelectedSiswaIds.clear();
    }

    document.getElementById('modeb-selected-count').innerText = modeBSelectedSiswaIds.size;
}

function toggleSingleModeBSiswa(siswaId, checked) {
    if (checked) {
        modeBSelectedSiswaIds.add(siswaId);
    } else {
        modeBSelectedSiswaIds.delete(siswaId);
    }

    document.getElementById('modeb-selected-count').innerText = modeBSelectedSiswaIds.size;

    const kelasId = document.getElementById('modeb-select-kelas').value;
    const filteredSiswa = cachePenilaianDep.siswa.filter(s => s.kelas_id_aktif === kelasId);
    const checkAll = document.getElementById('modeb-check-all');
    if (checkAll) checkAll.checked = (modeBSelectedSiswaIds.size === filteredSiswa.length && filteredSiswa.length > 0);
}

function updateModeBBulkPerilaku() {
    const jenis = document.getElementById('modeb-bulk-jenis').value;
    const kategoriId = document.getElementById('modeb-bulk-kategori').value;
    const selectPerilaku = document.getElementById('modeb-bulk-perilaku');
    if (!selectPerilaku) return;

    let filtered = cachePenilaianDep.perilaku.filter(p => p.jenis === jenis);
    if (kategoriId) filtered = filtered.filter(p => p.kategori_id === kategoriId);

    if (filtered.length === 0) {
        selectPerilaku.innerHTML = `<option value="">-- Tidak ada perilaku --</option>`;
    } else {
        selectPerilaku.innerHTML = `<option value="">-- Pilih Perilaku --</option>` +
            filtered.map(p => `<option value="${p.id}">${p.nama_perilaku}</option>`).join('');
    }
}

function addBulkNoteToSelectedModeBSiswa() {
    if (modeBSelectedSiswaIds.size === 0) {
        if (window.showToast) showToast("Pilih minimal 1 siswa terlebih dahulu!", "error");
        return;
    }

    const tanggal = document.getElementById('modeb-bulk-tanggal').value;
    const jenis = document.getElementById('modeb-bulk-jenis').value;
    const perilakuId = document.getElementById('modeb-bulk-perilaku').value;
    const catatan = document.getElementById('modeb-bulk-catatan').value.trim();

    if (!tanggal || !perilakuId) {
        if (window.showToast) showToast("Lengkapi tanggal dan perilaku sikap!", "error");
        return;
    }

    const perilakuObj = cachePenilaianDep.perilaku.find(p => p.id === perilakuId);
    const perilakuNama = perilakuObj ? perilakuObj.nama_perilaku : '-';

    let addedCount = 0;
    modeBSelectedSiswaIds.forEach(siswaId => {
        const siswaObj = cachePenilaianDep.siswa.find(s => s.id === siswaId);
        if (siswaObj) {
            modeBPendingRecords.push({
                tempId: Date.now() + Math.random(),
                siswa_id: siswaId,
                siswa_nama: siswaObj.nama_lengkap,
                tanggal,
                jenis_sikap: jenis,
                perilaku_id: perilakuId,
                perilaku_nama: perilakuNama,
                catatan
            });
            addedCount++;
        }
    });

    if (window.showToast) showToast(`Berhasil menambahkan ${addedCount} catatan ke antrean.`, "success");

    document.getElementById('modeb-bulk-catatan').value = '';
    updateModeBPreviewTable();
}

function removeModeBPendingRecord(tempId) {
    modeBPendingRecords = modeBPendingRecords.filter(r => r.tempId !== tempId);
    updateModeBPreviewTable();
    renderModalModeBTable();
}

function updateModeBPreviewTable() {
    const tbody = document.getElementById('modeb-table-preview-body');
    const badge = document.getElementById('modeb-preview-badge');
    const summaryText = document.getElementById('modeb-total-summary-text');
    const btnSubmit = document.getElementById('btn-submit-modeb');
    if (!tbody) return;

    const uniqueSiswaCount = new Set(modeBPendingRecords.map(r => r.siswa_id)).size;

    if (badge) badge.innerText = `${modeBPendingRecords.length} Catatan Siap`;
    if (summaryText) summaryText.innerText = `${modeBPendingRecords.length} Catatan untuk ${uniqueSiswaCount} Siswa`;
    if (btnSubmit) btnSubmit.disabled = modeBPendingRecords.length === 0;

    if (modeBPendingRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Belum ada catatan di antrean. Gunakan form di atas untuk menambahkan catatan.</td></tr>`;
        return;
    }

    tbody.innerHTML = modeBPendingRecords.map((r, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><strong>${r.siswa_nama}</strong></td>
            <td><small>${new Date(r.tanggal).toLocaleDateString('id-ID')}</small></td>
            <td>
                <span class="badge ${r.jenis_sikap === 'positif' ? 'text-success' : 'text-danger'}">
                    ${r.jenis_sikap.toUpperCase()}
                </span> - <strong>${r.perilaku_nama}</strong>
            </td>
            <td><small>${r.catatan || '-'}</small></td>
            <td>
                <button type="button" class="btn btn-danger" style="padding: 2px 6px; font-size: 11px;" onclick="removeModeBPendingRecord(${r.tempId})">🗑️ Hapus</button>
            </td>
        </tr>
    `).join('');
}

// ----------------------------------------------------
// 6. MODAL PRATINJAU & BULK SIMPAN MODE B KE SUPABASE
// ----------------------------------------------------
function openModalPreviewModeB() {
    if (modeBPendingRecords.length === 0) return;
    renderModalModeBTable();
    const modal = document.getElementById('modal-preview-mode-b');
    if (modal) modal.classList.remove('hidden');
}

function renderModalModeBTable() {
    const tbody = document.getElementById('modal-modeb-table-body');
    const summaryBadge = document.getElementById('modal-modeb-summary-badge');
    if (!tbody) return;

    const uniqueSiswaCount = new Set(modeBPendingRecords.map(r => r.siswa_id)).size;
    if (summaryBadge) summaryBadge.innerText = `${modeBPendingRecords.length} Catatan | ${uniqueSiswaCount} Siswa Terlibat`;

    tbody.innerHTML = modeBPendingRecords.map((r, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><strong>${r.siswa_nama}</strong></td>
            <td><small>${new Date(r.tanggal).toLocaleDateString('id-ID')}</small></td>
            <td>
                <span class="badge ${r.jenis_sikap === 'positif' ? 'bg-green' : 'bg-red'}">
                    ${r.jenis_sikap.toUpperCase()}
                </span>
            </td>
            <td>${r.perilaku_nama}</td>
            <td><small>${r.catatan || '-'}</small></td>
            <td>
                <button type="button" class="btn btn-danger" style="padding: 2px 6px; font-size: 11px;" onclick="removeModeBPendingRecord(${r.tempId})">Hapus</button>
            </td>
        </tr>
    `).join('');
}

async function confirmAndSaveModeB() {
    if (isSubmittingPenilaian) return;
    if (modeBPendingRecords.length === 0) return;

    const btnConfirm = document.getElementById('btn-confirm-save-modeb');
    const kelas_id = document.getElementById('modeb-select-kelas').value;
    const kelasObj = cachePenilaianDep.kelas.find(k => k.id === kelas_id);
    const tahun_ajaran_id = kelasObj ? kelasObj.tahun_ajaran_id : null;
    const pencatat_id = window.currentProfile?.id || null;

    // Susun Payload Akhir dari Antrean Pratinjau
    const payload = modeBPendingRecords.map(r => ({
        tanggal: r.tanggal,
        siswa_id: r.siswa_id,
        kelas_id,
        tahun_ajaran_id,
        perilaku_id: r.perilaku_id,
        jenis_sikap: r.jenis_sikap,
        catatan: r.catatan || null,
        pencatat_id,
        guru_id: pencatat_id
    }));

    try {
        isSubmittingPenilaian = true;
        if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.innerHTML = `<span>⏳ Menyimpan ${payload.length} Records...</span>`; }

        const { data, error } = await window.db.from('penilaian_sikap').insert(payload).select('id');

        if (error) throw error;

        const insertedCount = data ? data.length : payload.length;
        if (window.showToast) showToast(`Berhasil menyimpan ${insertedCount} catatan sikap ke Supabase!`, "success");

        closeModal('modal-preview-mode-b');
        resetModeB();
        await loadRecentPenilaianTable();

    } catch (err) {
        if (window.showToast) showToast("Gagal menyinkronkan data Mode B: " + err.message, "error");
    } finally {
        isSubmittingPenilaian = false;
        if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.innerHTML = `<span>✅ Konfirmasi & Simpan Semua ke Supabase</span>`; }
    }
}

function resetModeB() {
    document.getElementById('modeb-select-kelas').value = '';
    onModeBKelasChange();
    modeBSelectedSiswaIds.clear();
    modeBPendingRecords = [];
    updateModeBPreviewTable();
}

// ----------------------------------------------------
// 7. TABEL RIWAYAT & EDIT CATATAN (MEMELIHARA FITUR EDITS)
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
            const pencatatNama = p.pencatat?.nama_lengkap || 'Sistem';

            return `
                <tr>
                    <td>${new Date(p.tanggal).toLocaleDateString('id-ID')}</td>
                    <td><strong>${p.siswa?.nama_lengkap || '-'}</strong></td>
                    <td>${p.kelas?.nama_kelas || '-'}</td>
                    <td><span class="badge ${badgeClass}">${p.jenis_sikap.toUpperCase()}</span></td>
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

// Global Exports
window.switchModeInputPenilaian = switchModeInputPenilaian;
window.onPenilaianKelasChange = onPenilaianKelasChange;
window.updatePerilakuDropdown = updatePerilakuDropdown;
window.savePenilaian = savePenilaian;
window.resetFormPenilaian = resetFormPenilaian;

window.onModeAKelasChange = onModeAKelasChange;
window.addModeARow = addModeARow;
window.removeModeARow = removeModeARow;
window.updateModeARowData = updateModeARowData;
window.savePenilaianModeA = savePenilaianModeA;
window.resetModeA = resetModeA;

window.onModeBKelasChange = onModeBKelasChange;
window.toggleSelectAllModeBSiswa = toggleSelectAllModeBSiswa;
window.toggleSingleModeBSiswa = toggleSingleModeBSiswa;
window.updateModeBBulkPerilaku = updateModeBBulkPerilaku;
window.addBulkNoteToSelectedModeBSiswa = addBulkNoteToSelectedModeBSiswa;
window.removeModeBPendingRecord = removeModeBPendingRecord;
window.openModalPreviewModeB = openModalPreviewModeB;
window.confirmAndSaveModeB = confirmAndSaveModeB;
window.resetModeB = resetModeB;

window.initInputPenilaian = initInputPenilaian;
