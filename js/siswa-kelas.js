// Storage Cache Data Master
let cacheKelas = [];
let cacheSiswa = [];
let cacheGuru = [];
let cacheTA = [];
let cacheKategori = [];
let cachePerilaku = [];
let pendingImportData = [];

document.addEventListener('DOMContentLoaded', () => {
    initDataMaster();
});

async function initDataMaster() {
    if (!window.db) return;
    await Promise.all([
        loadTahunAjaran(),
        loadGuru(),
        loadKategoriKarakter(),
        loadKelas(),
        loadSiswa(),
        loadKarakter()
    ]);
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('hidden');
}

// ==========================================
// 1. DATA GURU
// ==========================================
async function loadGuru() {
    if (!window.db) return;
    try {
        const { data, error } = await window.db
            .from('guru')
            .select('id, nip, no_hp, status_aktif, profile_id, profiles(nama_lengkap)');

        if (error) throw error;
        cacheGuru = data || [];
        renderTableGuru();
    } catch (err) {
        if (window.showToast) showToast("Gagal memuat data guru: " + err.message, "error");
    }
}

function renderTableGuru() {
    const tbody = document.getElementById('table-guru');
    if (!tbody) return;

    if (cacheGuru.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Belum ada data guru.</td></tr>`;
        return;
    }

    tbody.innerHTML = cacheGuru.map(g => `
        <tr>
            <td>${g.nip || '-'}</td>
            <td><strong>${g.profiles?.nama_lengkap || 'Tanpa Nama'}</strong></td>
            <td>${g.no_hp || '-'}</td>
            <td><span class="badge text-success">Aktif</span></td>
            <td>
                <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="openModalGuru('${g.id}')">Edit</button>
            </td>
        </tr>
    `).join('');
}

function openModalGuru(guruId = null) {
    const modal = document.getElementById('modal-guru');
    if (!modal) return;

    const form = document.getElementById('form-guru');
    if (form) form.reset();

    if (guruId) {
        document.getElementById('modal-guru-title').innerText = "Edit Data Guru";
        const g = cacheGuru.find(item => item.id === guruId);
        if (g) {
            document.getElementById('guru-id').value = g.id;
            document.getElementById('guru-nip').value = g.nip || '';
            document.getElementById('guru-nama').value = g.profiles?.nama_lengkap || '';
            document.getElementById('guru-hp').value = g.no_hp || '';
        }
    } else {
        document.getElementById('modal-guru-title').innerText = "Tambah Data Guru";
        document.getElementById('guru-id').value = '';
    }

    modal.classList.remove('hidden');
}

async function saveGuru(e) {
    e.preventDefault();
    if (!window.db) return;

    const id = document.getElementById('guru-id').value;
    const nip = document.getElementById('guru-nip').value.trim();
    const nama = document.getElementById('guru-nama').value.trim();
    const no_hp = document.getElementById('guru-hp').value.trim();

    try {
        if (id) {
            // Update data guru & profil yang sudah ada
            const g = cacheGuru.find(item => item.id === id);
            if (g && g.profile_id) {
                await window.db.from('profiles').update({ nama_lengkap: nama }).eq('id', g.profile_id);
            }
            const { error } = await window.db.from('guru').update({ nip, no_hp }).eq('id', id);
            if (error) throw error;
            if (window.showToast) showToast("Data guru diperbarui.", "success");
        } else {
            // Hasilkan ID UUID baru secara manual untuk profiles
            const newProfileId = crypto.randomUUID();

            const { error: errProf } = await window.db.from('profiles').insert([{
                id: newProfileId,
                nama_lengkap: nama,
                role: 'guru'
            }]);

            if (errProf) throw errProf;

            const { error: errGuru } = await window.db.from('guru').insert([{
                profile_id: newProfileId,
                nip,
                no_hp
            }]);
            if (errGuru) throw errGuru;

            if (window.showToast) showToast("Guru baru berhasil ditambahkan.", "success");
        }
        closeModal('modal-guru');
        await loadGuru();
    } catch (err) {
        if (window.showToast) showToast("Gagal menyimpan guru: " + err.message, "error");
    }
}
// ==========================================
// 2. DATA KARAKTER & PERILAKU
// ==========================================
async function loadKategoriKarakter() {
    if (!window.db) return;
    const { data } = await window.db.from('kategori_karakter').select('*');
    cacheKategori = data || [];

    // Buat data kategori bawaan jika di database masih kosong
    if (cacheKategori.length === 0) {
        const defaultKat = [
            { nama_kategori: 'Kedisiplinan' },
            { nama_kategori: 'Kejujuran' },
            { nama_kategori: 'Tanggung Jawab' },
            { nama_kategori: 'Sopan Santun' }
        ];
        const { data: inserted } = await window.db.from('kategori_karakter').insert(defaultKat).select();
        cacheKategori = inserted || [];
    }
}

async function loadKarakter() {
    if (!window.db) return;
    try {
        const { data, error } = await window.db
            .from('master_perilaku')
            .select('id, nama_perilaku, jenis, kategori_id, kategori_karakter(nama_kategori)');

        if (error) throw error;
        cachePerilaku = data || [];
        renderTableKarakter();
    } catch (err) {
        if (window.showToast) showToast("Gagal memuat data perilaku: " + err.message, "error");
    }
}

function renderTableKarakter() {
    const tbody = document.getElementById('table-karakter');
    if (!tbody) return;

    if (cachePerilaku.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Belum ada data perilaku.</td></tr>`;
        return;
    }

    tbody.innerHTML = cachePerilaku.map(p => `
        <tr>
            <td>${p.kategori_karakter?.nama_kategori || '-'}</td>
            <td><strong>${p.nama_perilaku}</strong></td>
            <td>
                <span class="badge ${p.jenis === 'positif' ? 'text-success' : 'text-danger'}">
                    ${p.jenis.toUpperCase()}
                </span>
            </td>
            <td>
                <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="openModalKarakter('${p.id}')">Edit</button>
            </td>
        </tr>
    `).join('');
}

function openModalKarakter(perilakuId = null) {
    const modal = document.getElementById('modal-karakter');
    if (!modal) return;

    const form = document.getElementById('form-karakter');
    if (form) form.reset();

    const selectKat = document.getElementById('perilaku-kategori');
    if (selectKat) {
        selectKat.innerHTML = `<option value="">-- Pilih Kategori --</option>` + 
            cacheKategori.map(k => `<option value="${k.id}">${k.nama_kategori}</option>`).join('');
    }

    if (perilakuId) {
        document.getElementById('modal-karakter-title').innerText = "Edit Perilaku Sikap";
        const p = cachePerilaku.find(item => item.id === perilakuId);
        if (p) {
            document.getElementById('perilaku-id').value = p.id;
            document.getElementById('perilaku-kategori').value = p.kategori_id || '';
            document.getElementById('perilaku-nama').value = p.nama_perilaku;
            document.getElementById('perilaku-jenis').value = p.jenis;
        }
    } else {
        document.getElementById('modal-karakter-title').innerText = "Tambah Perilaku Sikap";
        document.getElementById('perilaku-id').value = '';
    }

    modal.classList.remove('hidden');
}

async function saveKarakter(e) {
    e.preventDefault();
    if (!window.db) return;

    const id = document.getElementById('perilaku-id').value;
    const kategori_id = document.getElementById('perilaku-kategori').value;
    const nama_perilaku = document.getElementById('perilaku-nama').value.trim();
    const jenis = document.getElementById('perilaku-jenis').value;

    try {
        if (id) {
            const { error } = await window.db.from('master_perilaku').update({ kategori_id, nama_perilaku, jenis }).eq('id', id);
            if (error) throw error;
            if (window.showToast) showToast("Perilaku berhasil diperbarui.", "success");
        } else {
            const { error } = await window.db.from('master_perilaku').insert([{ kategori_id, nama_perilaku, jenis }]);
            if (error) throw error;
            if (window.showToast) showToast("Perilaku baru berhasil ditambahkan.", "success");
        }
        closeModal('modal-karakter');
        await loadKarakter();
    } catch (err) {
        if (window.showToast) showToast("Gagal menyimpan perilaku: " + err.message, "error");
    }
}

// ==========================================
// 3. DATA KELAS
// ==========================================
async function loadKelas() {
    if (!window.db) return;
    try {
        const { data, error } = await window.db
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
        if (window.showToast) showToast("Gagal memuat data kelas: " + err.message, "error");
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
    if (!modal) return;

    const form = document.getElementById('form-kelas');
    if (form) form.reset();

    const selectWali = document.getElementById('kelas-wali');
    if (selectWali) {
        selectWali.innerHTML = `<option value="">-- Pilih Wali Kelas --</option>` + 
            cacheGuru.map(g => `<option value="${g.id}">${g.profiles?.nama_lengkap || 'Tanpa Nama'}</option>`).join('');
    }

    const selectTA = document.getElementById('kelas-ta');
    if (selectTA) {
        selectTA.innerHTML = `<option value="">-- Pilih Tahun Ajaran --</option>` + 
            cacheTA.map(t => `<option value="${t.id}">${t.tahun} - ${t.semester}</option>`).join('');
    }

    if (kelasId) {
        document.getElementById('modal-kelas-title').innerText = "Edit Kelas";
        const k = cacheKelas.find(item => item.id === kelasId);
        if (k) {
            document.getElementById('kelas-id').value = k.id;
            document.getElementById('kelas-nama').value = k.nama_kelas;
            if (selectWali) selectWali.value = k.wali_kelas_id || '';
            if (selectTA) selectTA.value = k.tahun_ajaran_id || '';
        }
    } else {
        document.getElementById('modal-kelas-title').innerText = "Tambah Kelas";
        document.getElementById('kelas-id').value = '';
    }

    modal.classList.remove('hidden');
}

async function saveKelas(e) {
    e.preventDefault();
    if (!window.db) return;

    const id = document.getElementById('kelas-id').value;
    const nama_kelas = document.getElementById('kelas-nama').value.trim();
    const wali_kelas_id = document.getElementById('kelas-wali').value || null;
    const tahun_ajaran_id = document.getElementById('kelas-ta').value;

    try {
        if (id) {
            const { error } = await window.db.from('kelas').update({ nama_kelas, wali_kelas_id, tahun_ajaran_id }).eq('id', id);
            if (error) throw error;
            if (window.showToast) showToast("Kelas berhasil diperbarui.", "success");
        } else {
            const { error } = await window.db.from('kelas').insert([{ nama_kelas, wali_kelas_id, tahun_ajaran_id }]);
            if (error) throw error;
            if (window.showToast) showToast("Kelas berhasil ditambahkan.", "success");
        }
        closeModal('modal-kelas');
        await loadKelas();
    } catch (err) {
        if (window.showToast) showToast("Gagal menyimpan kelas: " + err.message, "error");
    }
}

async function deleteKelas(id, nama, jumlahSiswa) {
    if (jumlahSiswa > 0) {
        alert(`Kelas ${nama} tidak dapat dihapus karena masih menampung ${jumlahSiswa} siswa. Pindahkan siswa terlebih dahulu.`);
        return;
    }

    if (!confirm(`Apakah Anda yakin ingin menghapus kelas ${nama}?`)) return;

    try {
        const { error } = await window.db.from('kelas').delete().eq('id', id);
        if (error) throw error;
        if (window.showToast) showToast("Kelas berhasil dihapus.", "success");
        await loadKelas();
    } catch (err) {
        if (window.showToast) showToast("Gagal menghapus kelas: " + err.message, "error");
    }
}

// ==========================================
// 4. DATA SISWA
// ==========================================
async function loadSiswa() {
    if (!window.db) return;
    try {
        const { data, error } = await window.db
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
        renderTableKelas();
    } catch (err) {
        if (window.showToast) showToast("Gagal memuat data siswa: " + err.message, "error");
    }
}

function filterSiswa() {
    const searchInput = document.getElementById('search-siswa');
    const filterInput = document.getElementById('filter-kelas-siswa');
    
    const search = searchInput ? searchInput.value.toLowerCase() : '';
    const filterKelas = filterInput ? filterInput.value : '';

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
            <td>${s.jenis_kelamin || 'L'}</td>
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
    if (!modal) return;

    const form = document.getElementById('form-siswa');
    if (form) form.reset();

    populateDropdownKelas();

    if (siswaId) {
        document.getElementById('modal-siswa-title').innerText = "Edit Siswa";
        const s = cacheSiswa.find(item => item.id === siswaId);
        if (s) {
            document.getElementById('siswa-id').value = s.id;
            document.getElementById('siswa-nis').value = s.nis || '';
            document.getElementById('siswa-nisn').value = s.nisn || '';
            document.getElementById('siswa-nama').value = s.nama_lengkap;
            document.getElementById('siswa-jk').value = s.jenis_kelamin || 'L';
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
    if (!window.db) return;

    const id = document.getElementById('siswa-id').value;
    const nis = document.getElementById('siswa-nis').value.trim();
    const nisn = document.getElementById('siswa-nisn').value.trim() || null;
    const nama_lengkap = document.getElementById('siswa-nama').value.trim();
    const jenis_kelamin = document.getElementById('siswa-jk').value;
    const kelas_id_aktif = document.getElementById('siswa-kelas').value || null;

    try {
        if (id) {
            const { error } = await window.db.from('siswa').update({
                nis, nisn, nama_lengkap, jenis_kelamin, kelas_id_aktif
            }).eq('id', id);

            if (error) throw error;
            if (window.showToast) showToast("Data siswa diperbarui.", "success");
        } else {
            const { data: newSiswa, error } = await window.db.from('siswa').insert([{
                nis, nisn, nama_lengkap, jenis_kelamin, kelas_id_aktif
            }]).select().single();

            if (error) throw error;

            if (kelas_id_aktif && newSiswa) {
                const k = cacheKelas.find(item => item.id === kelas_id_aktif);
                if (k && k.tahun_ajaran_id) {
                    await window.db.from('riwayat_kelas_siswa').insert([{
                        siswa_id: newSiswa.id,
                        kelas_id: kelas_id_aktif,
                        tahun_ajaran_id: k.tahun_ajaran_id
                    }]);
                }
            }
            if (window.showToast) showToast("Siswa baru berhasil ditambahkan.", "success");
        }
        closeModal('modal-siswa');
        await loadSiswa();
    } catch (err) {
        if (window.showToast) showToast("Gagal menyimpan siswa: " + err.message, "error");
    }
}

async function viewDetailSiswa(siswaId) {
    const s = cacheSiswa.find(item => item.id === siswaId);
    if (!s) return;

    const infoDiv = document.getElementById('detail-siswa-info');
    if (infoDiv) {
        infoDiv.innerHTML = `
            <p><strong>Nama:</strong> ${s.nama_lengkap}</p>
            <p><strong>NIS / NISN:</strong> ${s.nis || '-'} / ${s.nisn || '-'}</p>
            <p><strong>Jenis Kelamin:</strong> ${s.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
            <p><strong>Kelas Aktif saat Ini:</strong> ${s.kelas?.nama_kelas || 'Tidak ada'}</p>
        `;
    }

    const tbody = document.getElementById('table-riwayat-kelas');
    if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="text-center">Memuat riwayat...</td></tr>`;
    
    const modal = document.getElementById('modal-detail-siswa');
    if (modal) modal.classList.remove('hidden');

    try {
        const { data, error } = await window.db
            .from('riwayat_kelas_siswa')
            .select(`
                created_at,
                kelas (nama_kelas),
                tahun_ajaran (tahun, semester)
            `)
            .eq('siswa_id', siswaId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (tbody) {
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
        }
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Gagal memuat riwayat.</td></tr>`;
    }
}

function openModalPindahKelas(siswaId) {
    const s = cacheSiswa.find(item => item.id === siswaId);
    if (!s) return;

    document.getElementById('pindah-siswa-id').value = s.id;
    document.getElementById('pindah-siswa-nama').innerText = `Siswa: ${s.nama_lengkap} (Kelas Saat Ini: ${s.kelas?.nama_kelas || '-'})`;
    populateDropdownKelas();

    const modal = document.getElementById('modal-pindah-kelas');
    if (modal) modal.classList.remove('hidden');
}

async function confirmPindahKelas(e) {
    e.preventDefault();
    if (!window.db) return;

    const siswaId = document.getElementById('pindah-siswa-id').value;
    const kelasTujuanId = document.getElementById('pindah-kelas-tujuan').value;

    const targetKelas = cacheKelas.find(k => k.id === kelasTujuanId);
    if (!targetKelas) return;

    try {
        const { error: errUpdate } = await window.db
            .from('siswa')
            .update({ kelas_id_aktif: kelasTujuanId })
            .eq('id', siswaId);

        if (errUpdate) throw errUpdate;

        if (targetKelas.tahun_ajaran_id) {
            await window.db.from('riwayat_kelas_siswa').upsert([{
                siswa_id: siswaId,
                kelas_id: kelasTujuanId,
                tahun_ajaran_id: targetKelas.tahun_ajaran_id
            }], { onConflict: 'siswa_id, tahun_ajaran_id' });
        }

        if (window.showToast) showToast("Siswa berhasil dipindahkan kelas.", "success");
        closeModal('modal-pindah-kelas');
        await loadSiswa();
    } catch (err) {
        if (window.showToast) showToast("Gagal memindahkan siswa: " + err.message, "error");
    }
}

// ==========================================
// 5. HELPER TAHUN AJARAN & IMPOR EXCEL
// ==========================================
async function loadTahunAjaran() {
    if (!window.db) return;
    const { data } = await window.db.from('tahun_ajaran').select('id, tahun, semester');
    cacheTA = data || [];

    // Buat data Tahun Ajaran bawaan jika di database masih kosong
    if (cacheTA.length === 0) {
        const defaultTA = [
            { tahun: '2025/2026', semester: 'Ganjil', is_aktif: true },
            { tahun: '2025/2026', semester: 'Genap', is_aktif: false }
        ];
        const { data: inserted } = await window.db.from('tahun_ajaran').insert(defaultTA).select();
        cacheTA = inserted || [];
    }
}

function openModalImportSiswa() {
    document.getElementById('excel-file-input').value = '';
    document.getElementById('import-preview-area').classList.add('hidden');
    document.getElementById('btn-submit-import').classList.add('hidden');
    pendingImportData = [];
    const modal = document.getElementById('modal-import-siswa');
    if (modal) modal.classList.remove('hidden');
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
            if (window.showToast) showToast("Gagal membaca file Excel.", "error");
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
    if (!tbody) return;
    tbody.innerHTML = '';

    rows.forEach((row, index) => {
        const nis = String(row.NIS || row.nis || '').trim();
        const nisn = String(row.NISN || row.nisn || '').trim();
        const nama = String(row['Nama Lengkap'] || row.nama_lengkap || row.Nama || '').trim();
        const namaKelas = String(row.Kelas || row.kelas || '').trim();

        let isValid = true;
        let errors = [];

        if (!nis) { isValid = false; errors.push("NIS kosong"); }
        if (!nama) { isValid = false; errors.push("Nama kosong"); }

        if (nis && existingNIS.has(nis.toLowerCase())) {
            isValid = false;
            errors.push("NIS sudah ada di database");
        }

        if (nis && fileNISSet.has(nis.toLowerCase())) {
            isValid = false;
            errors.push("NIS ganda di dalam file Excel");
        } else if (nis) {
            fileNISSet.add(nis.toLowerCase());
        }

        const matchedKelas = cacheKelas.find(k => k.nama_kelas.toLowerCase() === namaKelas.toLowerCase());
        if (namaKelas && !matchedKelas) {
            errors.push(`Kelas '${namaKelas}' tidak ditemukan (akan dikosongkan)`);
        }

        if (isValid) validCount++; else invalidCount++;

        pendingImportData.push({
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
    if (!window.db) return;

    const validRows = pendingImportData.filter(d => d.isValid).map(d => ({
        nis: d.nis,
        nisn: d.nisn || null,
        nama_lengkap: d.nama_lengkap,
        jenis_kelamin: 'L',
        kelas_id_aktif: d.kelas_id_aktif
    }));

    if (validRows.length === 0) return;

    try {
        const { error } = await window.db.from('siswa').insert(validRows);
        if (error) throw error;

        if (window.showToast) showToast(`Berhasil mengimpor ${validRows.length} data siswa.`, "success");
        closeModal('modal-import-siswa');
        await loadSiswa();
    } catch (err) {
        if (window.showToast) showToast("Gagal menyimpan data impor: " + err.message, "error");
    }
}

// Eksplisitkan Seluruh Fungsi Modal ke Scope Window
window.openModalGuru = openModalGuru;
window.saveGuru = saveGuru;
window.openModalKarakter = openModalKarakter;
window.saveKarakter = saveKarakter;
window.openModalKelas = openModalKelas;
window.saveKelas = saveKelas;
window.deleteKelas = deleteKelas;
window.openModalSiswa = openModalSiswa;
window.saveSiswa = saveSiswa;
window.filterSiswa = filterSiswa;
window.viewDetailSiswa = viewDetailSiswa;
window.openModalPindahKelas = openModalPindahKelas;
window.confirmPindahKelas = confirmPindahKelas;
window.openModalImportSiswa = openModalImportSiswa;
window.processExcelFile = processExcelFile;
window.commitImportSiswa = commitImportSiswa;
window.closeModal = closeModal;
