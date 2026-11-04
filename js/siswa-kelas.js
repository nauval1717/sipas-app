let cacheKelas = [];
let cacheSiswa = [];
let cacheGuru = [];
let cacheTA = [];
let pendingImportData = [];

document.addEventListener('DOMContentLoaded', () => {
    // Inisialisasi data master ketika halaman dimuat
    if (db) {
        initDataMaster();
    }
});

async function initDataMaster() {
    await Promise.all([
        loadTahunAjaran(),
        loadGuruList(),
        loadKelas(),
        loadSiswa()
    ]);
}

// --- UTILITY MODAL ---
function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// --- LOGIKA KELAS ---
async function loadKelas() {
    try {
        const { data, error } = await db
            .from('kelas')
            .select(`
                id,
                nama_kelas,
                tahun_ajaran_id,
                wali_kelas_id,
                tahun_ajaran (tahun, semester),
                guru:wali_kelas_id (profiles(nama_lengkap))
            `);

        if (error) throw error;
        cacheKelas = data || [];
        renderTableKelas();
        populateDropdownKelas();
    } catch (err) {
        showToast("Gagal memuat data kelas: " + err.message, "error");
    }
}

function renderTableKelas() {
    const tbody = document.getElementById('table-kelas-body');
    if (!tbody) return;

    if (cacheKelas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Belum ada data kelas.</td></tr>`;
        return;
    }

    tbody.innerHTML = cacheKelas.map(k => {
        const waliNama = k.guru?.profiles?.nama_lengkap || '-';
        const taInfo = k.tahun_ajaran ? `${k.tahun_ajaran.tahun} (${k.tahun_ajaran.semester})` : '-';
        const jumlahSiswa = cacheSiswa.filter(s => s.kelas_id_aktif === k.id).length;

        return `
            <tr>
                <td><strong>${k.nama_kelas}</strong></td>
                <td>${waliNama}</td>
                <td>${taInfo}</td>
                <td>${jumlahSiswa} Siswa</td>
                <td>
                    <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="openModalKelas('${k.id}')">Edit</button>
                    <button class="btn btn-danger" style="padding: 4px 8px;" onclick="deleteKelas('${k.id}', '${k.nama_kelas}', ${jumlahSiswa})">Hapus</button>
                </td>
            </tr>
        `;
    }).join('');
}

function populateDropdownKelas() {
    const selects = ['filter-kelas-siswa', 'siswa-kelas', 'pindah-kelas-tujuan'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;
        const options = cacheKelas.map(k => `<option value="${k.id}">${k.nama_kelas}</option>`).join('');
        
        if (id === 'filter-kelas-siswa') {
            el.innerHTML = `<option value="">-- Semua Kelas --</option>` + options;
        } else {
            el.innerHTML = `<option value="">-- Pilih Kelas --</option>` + options;
        }
        el.value = currentVal;
    });
}

async function openModalKelas(kelasId = null) {
    const modal = document.getElementById('modal-kelas');
    if (!modal) {
        console.error("Elemen #modal-kelas tidak ditemukan di HTML.");
        return;
    }

    const form = document.getElementById('form-kelas');
    if (form) form.reset();

    // Pastikan array tidak undefined agar tidak crash
    const guruList = Array.isArray(cacheGuru) ? cacheGuru : [];
    const taList = Array.isArray(cacheTA) ? cacheTA : [];

    // isi dropdown Wali Kelas
    const selectWali = document.getElementById('kelas-wali');
    if (selectWali) {
        selectWali.innerHTML = `<option value="">-- Pilih Wali Kelas --</option>` + 
            guruList.map(g => `<option value="${g.id}">${g.profiles?.nama_lengkap || 'Tanpa Nama'}</option>`).join('');
    }

    // Isi dropdown Tahun Ajaran
    const selectTA = document.getElementById('kelas-ta');
    if (selectTA) {
        selectTA.innerHTML = `<option value="">-- Pilih Tahun Ajaran --</option>` + 
            taList.map(t => `<option value="${t.id}">${t.tahun} - ${t.semester}</option>`).join('');
    }

    if (kelasId) {
        const title = document.getElementById('modal-kelas-title');
        if (title) title.innerText = "Edit Kelas";
        
        const k = cacheKelas.find(item => item.id === kelasId);
        if (k) {
            document.getElementById('kelas-id').value = k.id;
            document.getElementById('kelas-nama').value = k.nama_kelas;
            if (selectWali) selectWali.value = k.wali_kelas_id || '';
            if (selectTA) selectTA.value = k.tahun_ajaran_id || '';
        }
    } else {
        const title = document.getElementById('modal-kelas-title');
        if (title) title.innerText = "Tambah Kelas";
        document.getElementById('kelas-id').value = '';
    }

    // Tampilkan modal
    modal.classList.remove('hidden');
}
async function saveKelas(e) {
    e.preventDefault();
    const id = document.getElementById('kelas-id').value;
    const nama_kelas = document.getElementById('kelas-nama').value.trim();
    const wali_kelas_id = document.getElementById('kelas-wali').value || null;
    const tahun_ajaran_id = document.getElementById('kelas-ta').value;

    try {
        if (id) {
            const { error } = await db.from('kelas').update({ nama_kelas, wali_kelas_id, tahun_ajaran_id }).eq('id', id);
            if (error) throw error;
            showToast("Kelas berhasil diperbarui.", "success");
        } else {
            const { error } = await db.from('kelas').insert([{ nama_kelas, wali_kelas_id, tahun_ajaran_id }]);
            if (error) throw error;
            showToast("Kelas berhasil ditambahkan.", "success");
        }
        closeModal('modal-kelas');
        await loadKelas();
    } catch (err) {
        showToast("Gagal menyimpan kelas: " + err.message, "error");
    }
}

async function deleteKelas(id, nama, jumlahSiswa) {
    if (jumlahSiswa > 0) {
        alert(`Kelas ${nama} tidak dapat dihapus karena masih menampung ${jumlahSiswa} siswa. Pindahkan siswa terlebih dahulu.`);
        return;
    }

    if (!confirm(`Apakah Anda yakin ingin menghapus kelas ${nama}?`)) return;

    try {
        const { error } = await db.from('kelas').delete().eq('id', id);
        if (error) throw error;
        showToast("Kelas berhasil dihapus.", "success");
        await loadKelas();
    } catch (err) {
        showToast("Gagal menghapus kelas: " + err.message, "error");
    }
}

// --- LOGIKA SISWA ---
async function loadSiswa() {
    try {
        const { data, error } = await db
            .from('siswa')
            .select(`
                id,
                nisn,
                nis,
                nama_lengkap,
                jenis_kelamin,
                kelas_id_aktif,
                kelas:kelas_id_aktif (nama_kelas)
            `)
            .order('nama_lengkap', { ascending: true });

        if (error) throw error;
        cacheSiswa = data || [];
        filterSiswa();
        renderTableKelas(); // Perbarui statistik jumlah siswa di tabel kelas
    } catch (err) {
        showToast("Gagal memuat data siswa: " + err.message, "error");
    }
}

function filterSiswa() {
    const search = document.getElementById('search-siswa').value.toLowerCase();
    const filterKelas = document.getElementById('filter-kelas-siswa').value;

    const filtered = cacheSiswa.filter(s => {
        const matchSearch = (s.nama_lengkap || '').toLowerCase().includes(search) || 
                            (s.nis || '').toLowerCase().includes(search) ||
                            (s.nisn || '').toLowerCase().includes(search);
        const matchKelas = filterKelas ? s.kelas_id_aktif === filterKelas : true;
        return matchSearch && matchKelas;
    });

    renderTableSiswa(filtered);
}

function renderTableSiswa(data) {
    const tbody = document.getElementById('table-siswa-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Data siswa tidak ditemukan.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(s => `
        <tr>
            <td><strong>${s.nis || '-'}</strong> / <small>${s.nisn || '-'}</small></td>
            <td>${s.nama_lengkap}</td>
            <td>${s.jenis_kelamin}</td>
            <td><span class="badge">${s.kelas?.nama_kelas || 'Tanpa Kelas'}</span></td>
            <td>
                <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="viewDetailSiswa('${s.id}')">Detail</button>
                <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="openModalSiswa('${s.id}')">Edit</button>
                <button class="btn btn-primary" style="padding: 4px 8px;" onclick="openModalPindahKelas('${s.id}')">Pindah Kelas</button>
            </td>
        </tr>
    `).join('');
}

function openModalSiswa(siswaId = null) {
    const modal = document.getElementById('modal-siswa');
    const form = document.getElementById('form-siswa');
    form.reset();

    populateDropdownKelas();

    if (siswaId) {
        document.getElementById('modal-siswa-title').innerText = "Edit Siswa";
        const s = cacheSiswa.find(item => item.id === siswaId);
        if (s) {
            document.getElementById('siswa-id').value = s.id;
            document.getElementById('siswa-nis').value = s.nis || '';
            document.getElementById('siswa-nisn').value = s.nisn || '';
            document.getElementById('siswa-nama').value = s.nama_lengkap;
            document.getElementById('siswa-jk').value = s.jenis_kelamin;
            document.getElementById('siswa-kelas').value = s.kelas_id_aktif || '';
        }
    } else {
        document.getElementById('modal-siswa-title').innerText = "Tambah Siswa";
        document.getElementById('siswa-id').value = '';
    }

    modal.classList.remove('hidden');
}

async function saveSiswa(e) {
    e.preventDefault();
    const id = document.getElementById('siswa-id').value;
    const nis = document.getElementById('siswa-nis').value.trim();
    const nisn = document.getElementById('siswa-nisn').value.trim() || null;
    const nama_lengkap = document.getElementById('siswa-nama').value.trim();
    const jenis_kelamin = document.getElementById('siswa-jk').value;
    const kelas_id_aktif = document.getElementById('siswa-kelas').value || null;

    try {
        if (id) {
            const { error } = await db.from('siswa').update({
                nis, nisn, nama_lengkap, jenis_kelamin, kelas_id_aktif
            }).eq('id', id);

            if (error) throw error;
            showToast("Data siswa diperbarui.", "success");
        } else {
            const { data: newSiswa, error } = await db.from('siswa').insert([{
                nis, nisn, nama_lengkap, jenis_kelamin, kelas_id_aktif
            }]).select().single();

            if (error) throw error;

            // Catat Riwayat Kelas Pertama Siswa
            if (kelas_id_aktif && newSiswa) {
                const k = cacheKelas.find(item => item.id === kelas_id_aktif);
                if (k && k.tahun_ajaran_id) {
                    await db.from('riwayat_kelas_siswa').insert([{
                        siswa_id: newSiswa.id,
                        kelas_id: kelas_id_aktif,
                        tahun_ajaran_id: k.tahun_ajaran_id
                    }]);
                }
            }
            showToast("Siswa baru berhasil ditambahkan.", "success");
        }
        closeModal('modal-siswa');
        await loadSiswa();
    } catch (err) {
        showToast("Gagal menyimpan siswa: " + err.message, "error");
    }
}

// --- LIHAT DETAIL & RIWAYAT KELAS ---
async function viewDetailSiswa(siswaId) {
    const s = cacheSiswa.find(item => item.id === siswaId);
    if (!s) return;

    document.getElementById('detail-siswa-info').innerHTML = `
        <p><strong>Nama:</strong> ${s.nama_lengkap}</p>
        <p><strong>NIS / NISN:</strong> ${s.nis || '-'} / ${s.nisn || '-'}</p>
        <p><strong>Jenis Kelamin:</strong> ${s.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
        <p><strong>Kelas Aktif saat Ini:</strong> ${s.kelas?.nama_kelas || 'Tidak ada'}</p>
    `;

    const tbody = document.getElementById('table-riwayat-kelas');
    tbody.innerHTML = `<tr><td colspan="3" class="text-center">Memuat riwayat...</td></tr>`;
    document.getElementById('modal-detail-siswa').classList.remove('hidden');

    try {
        const { data, error } = await db
            .from('riwayat_kelas_siswa')
            .select(`
                created_at,
                kelas (nama_kelas),
                tahun_ajaran (tahun, semester)
            `)
            .eq('siswa_id', siswaId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Belum ada riwayat kelas.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(r => `
            <tr>
                <td>${r.tahun_ajaran ? `${r.tahun_ajaran.tahun} (${r.tahun_ajaran.semester})` : '-'}</td>
                <td><strong>${r.kelas?.nama_kelas || '-'}</strong></td>
                <td>${new Date(r.created_at).toLocaleDateString('id-ID')}</td>
            </tr>
        `).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Gagal memuat riwayat.</td></tr>`;
    }
}

// --- PINDAH KELAS SISWA ---
function openModalPindahKelas(siswaId) {
    const s = cacheSiswa.find(item => item.id === siswaId);
    if (!s) return;

    document.getElementById('pindah-siswa-id').value = s.id;
    document.getElementById('pindah-siswa-nama').innerText = `Siswa: ${s.nama_lengkap} (Kelas Saat Ini: ${s.kelas?.nama_kelas || '-'})`;
    populateDropdownKelas();

    document.getElementById('modal-pindah-kelas').classList.remove('hidden');
}

async function confirmPindahKelas(e) {
    e.preventDefault();
    const siswaId = document.getElementById('pindah-siswa-id').value;
    const kelasTujuanId = document.getElementById('pindah-kelas-tujuan').value;

    const targetKelas = cacheKelas.find(k => k.id === kelasTujuanId);
    if (!targetKelas) return;

    try {
        // 1. Update kelas aktif siswa
        const { error: errUpdate } = await db
            .from('siswa')
            .update({ kelas_id_aktif: kelasTujuanId })
            .eq('id', siswaId);

        if (errUpdate) throw errUpdate;

        // 2. Catat ke tabel riwayat_kelas_siswa (mengabaikan duplikasi jika tahun ajaran sama)
        if (targetKelas.tahun_ajaran_id) {
            await db.from('riwayat_kelas_siswa').upsert([{
                siswa_id: siswaId,
                kelas_id: kelasTujuanId,
                tahun_ajaran_id: targetKelas.tahun_ajaran_id
            }], { onConflict: 'siswa_id, tahun_ajaran_id' });
        }

        showToast("Siswa berhasil dipindahkan kelas.", "success");
        closeModal('modal-pindah-kelas');
        await loadSiswa();
    } catch (err) {
        showToast("Gagal memindahkan siswa: " + err.message, "error");
    }
}

// --- LOGIKA IMPOR EXCEL SISWA ---
function openModalImportSiswa() {
    document.getElementById('excel-file-input').value = '';
    document.getElementById('import-preview-area').classList.add('hidden');
    document.getElementById('btn-submit-import').classList.add('hidden');
    pendingImportData = [];
    document.getElementById('modal-import-siswa').classList.remove('hidden');
}

function processExcelFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.SheetNames[0];
            const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

            validateAndPreviewImport(rawRows);
        } catch (err) {
            showToast("Gagal membaca file Excel. Pastikan format benar.", "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

function validateAndPreviewImport(rows) {
    pendingImportData = [];
    let validCount = 0;
    let invalidCount = 0;

    const existingNIS = new Set(cacheSiswa.map(s => String(s.nis).toLowerCase()));
    const fileNISSet = new Set();

    const tbody = document.getElementById('table-import-preview');
    tbody.innerHTML = '';

    rows.forEach((row, index) => {
        // Pemetaan nama kolom sensitif
        const nis = String(row.NIS || row.nis || '').trim();
        const nisn = String(row.NISN || row.nisn || '').trim();
        const nama = String(row['Nama Lengkap'] || row.nama_lengkap || row.Nama || '').trim();
        const namaKelas = String(row.Kelas || row.kelas || '').trim();

        let isValid = true;
        let errors = [];

        if (!nis) { isValid = false; errors.push("NIS kosong"); }
        if (!nama) { isValid = false; errors.push("Nama kosong"); }

        // Cek Duplikat NIS di Database
        if (nis && existingNIS.has(nis.toLowerCase())) {
            isValid = false;
            errors.push("NIS sudah ada di database");
        }

        // Cek Duplikat NIS di dalam File
        if (nis && fileNISSet.has(nis.toLowerCase())) {
            isValid = false;
            errors.push("NIS ganda di dalam file Excel");
        } else if (nis) {
            fileNISSet.add(nis.toLowerCase());
        }

        // Pemetaan Kelas
        const matchedKelas = cacheKelas.find(k => k.nama_kelas.toLowerCase() === namaKelas.toLowerCase());
        if (namaKelas && !matchedKelas) {
            errors.push(`Kelas '${namaKelas}' tidak ditemukan (akan dikosongkan)`);
        }

        if (isValid) validCount++; else invalidCount++;

        pendingImportData.push({
            rowNumber: index + 1,
            nis,
            nisn,
            nama_lengkap: nama,
            kelas_id_aktif: matchedKelas ? matchedKelas.id : null,
            isValid,
            errors: errors.join(', ')
        });

        tbody.innerHTML += `
            <tr style="background-color: ${isValid ? '#f0fdf4' : '#fef2f2'}">
                <td>${isValid ? '✅ Valid' : '❌ Gagal'}</td>
                <td>${nis || '-'}</td>
                <td>${nisn || '-'}</td>
                <td>${nama || '-'}</td>
                <td>${matchedKelas ? matchedKelas.nama_kelas : (namaKelas || '-')}</td>
                <td><small class="${isValid ? 'text-success' : 'text-danger'}">${errors.join(', ') || 'Siap diimpor'}</small></td>
            </tr>
        `;
    });

    document.getElementById('import-summary-badge').innerHTML = `
        <span class="badge text-success">Valid: ${validCount}</span> | 
        <span class="badge text-danger">Gagal/Dilewati: ${invalidCount}</span>
    `;

    document.getElementById('import-preview-area').classList.remove('hidden');
    if (validCount > 0) {
        document.getElementById('btn-submit-import').classList.remove('hidden');
    } else {
        document.getElementById('btn-submit-import').classList.add('hidden');
    }
}

async function commitImportSiswa() {
    const validRows = pendingImportData.filter(d => d.isValid).map(d => ({
        nis: d.nis,
        nisn: d.nisn || null,
        nama_lengkap: d.nama_lengkap,
        jenis_kelamin: 'L', // Nilai bawaan jika tidak ada di kolom excel
        kelas_id_aktif: d.kelas_id_aktif
    }));

    if (validRows.length === 0) return;

    try {
        const { error } = await db.from('siswa').insert(validRows);
        if (error) throw error;

        showToast(`Berhasil mengimpor ${validRows.length} data siswa baru.`, "success");
        closeModal('modal-import-siswa');
        await loadSiswa();
    } catch (err) {
        showToast("Gagal menyimpan data impor: " + err.message, "error");
    }
}

// --- HELPER DATA GURU & TAHUN AJARAN ---
async function loadGuruList() {
    const { data } = await db.from('guru').select('id, profiles(nama_lengkap)');
    cacheGuru = data || [];
}

async function loadTahunAjaran() {
    const { data } = await db.from('tahun_ajaran').select('id, tahun, semester');
    cacheTA = data || [];
}
