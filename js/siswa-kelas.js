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
                <button class="btn btn-danger" style="padding: 4px 8px;" onclick="deleteGuru('${g.id}', '${(g.profiles?.nama_lengkap || 'Guru').replace(/'/g, "\\'")}')">Hapus</button>
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

// --- SAVING GURU DENGAN CEK DUPLIKASI NIP ---
async function saveGuru(e) {
    e.preventDefault();
    if (!window.db) return;

    const id = document.getElementById('guru-id').value;
    const nip = document.getElementById('guru-nip').value.trim();
    const nama = document.getElementById('guru-nama').value.trim();
    const no_hp = document.getElementById('guru-hp').value.trim();

    try {
        // Cek Duplikasi NIP
        if (!id && nip) {
            const { data: existNip } = await window.db
                .from('guru')
                .select('id')
                .eq('nip', nip)
                .maybeSingle();

            if (existNip) {
                if (window.showToast) showToast(`Gagal: NIP '${nip}' sudah terdaftar!`, "error");
                return;
            }
        }

        if (id) {
            const g = cacheGuru.find(item => item.id === id);
            if (g && g.profile_id) {
                await window.db.from('profiles').update({ nama_lengkap: nama }).eq('id', g.profile_id);
            }
            const { error } = await window.db.from('guru').update({ nip, no_hp }).eq('id', id);
            if (error) throw error;
            if (window.showToast) showToast("Data guru diperbarui.", "success");
        } else {
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

// ==========================================
// MEMUAT & MENAMPILKAN DATA KARAKTER & PERILAKU
// ==========================================
async function loadKarakter() {
    if (!window.db) return;
    try {
        const { data, error } = await window.db
            .from('master_perilaku')
            .select(`
                id,
                nama_perilaku,
                jenis,
                kategori_id,
                kategori_karakter:kategori_id (nama_kategori)
            `)
            .order('nama_perilaku');

        if (error) throw error;

        // Simpan ke cache (dipakai oleh openModalKarakter untuk mode edit)
        cachePerilaku = data || [];

        const tbody = document.getElementById('table-karakter');
        if (!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Belum ada data perilaku.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(p => {
            const jenisBadge = p.jenis === 'positif' 
                ? '<span class="badge bg-green">👍 POSITIF</span>' 
                : '<span class="badge bg-red">👎 NEGATIF</span>';
            
            const namaClean = (p.nama_perilaku || '').replace(/'/g, "\\'");

            return `
                <tr>
                    <td>${p.kategori_karakter?.nama_kategori || '-'}</td>
                    <td><strong>${p.nama_perilaku}</strong></td>
                    <td>${jenisBadge}</td>
                    <td>
                        <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px;" onclick="openModalKarakter('${p.id}')">
                            ✏️ Edit
                        </button>
                        <button class="btn btn-danger" style="padding: 3px 8px; font-size: 11px;" onclick="deletePerilaku('${p.id}', '${namaClean}')">
                            🗑️ Hapus
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Gagal memuat data karakter:", err);
        const tbody = document.getElementById('table-karakter');
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Gagal memuat data: ${err.message}</td></tr>`;
    }
}

// ==========================================
// FUNGSI HAPUS PERILAKU SIKAP
// ==========================================
async function deletePerilaku(id, nama) {
    if (!confirm(`Apakah Anda yakin ingin menghapus perilaku "${nama}"?`)) return;

    try {
        const { error } = await window.db.from('master_perilaku').delete().eq('id', id);
        if (error) throw error;

        if (window.showToast) showToast(`Perilaku "${nama}" berhasil dihapus.`, "success");
        await loadKarakter();
    } catch (err) {
        if (window.showToast) showToast("Gagal menghapus perilaku: " + err.message, "error");
    }
}

// Daftarkan ke Global Window Scope
window.loadKarakter = loadKarakter;
window.deletePerilaku = deletePerilaku;

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
// FUNGSI LOAD KELAS (KEBAL ERROR EMBED)
async function loadKelas() {
    if (!window.db) return;
    try {
        // Ambil data kelas, guru, tahun ajaran, dan siswa secara terpisah untuk menghindari error relasi
        const [resKelas, resGuru, resTA, resSiswa] = await Promise.all([
            window.db.from('kelas').select('*').order('nama_kelas'),
            window.db.from('guru').select('id, profile_id, profiles:profile_id(nama_lengkap)'),
            window.db.from('tahun_ajaran').select('id, tahun, semester'),
            window.db.from('siswa').select('id, kelas_id_aktif')
        ]);

        if (resKelas.error) throw resKelas.error;

        const dataKelas = resKelas.data || [];
        const dataGuru = resGuru.data || [];
        const dataTA = resTA.data || [];

        // Pemetaan Nama Wali Kelas & Tahun Ajaran
        const mapGuru = new Map(dataGuru.map(g => [g.id, g.profiles?.nama_lengkap || '-']));
        const mapTA = new Map(dataTA.map(t => [t.id, t]));

        // Isi cacheKelas (dipakai modal edit, dropdown, impor siswa, dll.)
        cacheKelas = dataKelas.map(k => ({
            ...k,
            tahun_ajaran: mapTA.get(k.tahun_ajaran_id) || null,
            guru: k.wali_kelas_id
                ? { profiles: { nama_lengkap: mapGuru.get(k.wali_kelas_id) || '-' } }
                : null
        }));

        renderTableKelas();
        populateDropdownKelas();

    } catch (err) {
        console.error("Gagal memuat kelas:", err);
        const tbody = document.getElementById('table-kelas-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Gagal memuat kelas: ${err.message}</td></tr>`;
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
    const taInput = document.getElementById('kelas-ta').value.trim();

    try {
        let tahun_ajaran_id = null;

        if (taInput) {
            // 1. Cek apakah teks Tahun Ajaran sudah ada di tabel tahun_ajaran
            let { data: taExist } = await window.db
                .from('tahun_ajaran')
                .select('id')
                .eq('tahun', taInput)
                .maybeSingle();

            if (taExist) {
                tahun_ajaran_id = taExist.id;
            } else {
                // 2. Jika belum ada, buat otomatis untuk mengambil ID UUID-nya
                const { data: taNew, error: errTa } = await window.db
                    .from('tahun_ajaran')
                    .insert([{ tahun: taInput, semester: 'Ganjil', is_aktif: true }])
                    .select('id')
                    .single();

                if (errTa) throw errTa;
                tahun_ajaran_id = taNew.id;
            }
        }

        // 3. Simpan data kelas menggunakan tahun_ajaran_id (UUID) yang valid
        if (id) {
            const { error } = await window.db.from('kelas').update({ 
                nama_kelas, 
                wali_kelas_id, 
                tahun_ajaran_id 
            }).eq('id', id);
            if (error) throw error;
            if (window.showToast) showToast("Kelas berhasil diperbarui.", "success");
        } else {
            const { error } = await window.db.from('kelas').insert([{ 
                nama_kelas, 
                wali_kelas_id, 
                tahun_ajaran_id 
            }]);
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
                <button class="btn btn-danger" style="padding: 4px 8px;" onclick="deleteSiswa('${s.id}', '${(s.nama_lengkap || '').replace(/'/g, "\\'")}')">Hapus</button>
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

// --- SAVING SISWA DENGAN CEK DUPLIKASI NIS ---
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
        // Cek Duplikasi NIS pada pendaftaran baru
        if (!id && nis) {
            const { data: existNis } = await window.db
                .from('siswa')
                .select('id')
                .eq('nis', nis)
                .maybeSingle();

            if (existNis) {
                if (window.showToast) showToast(`Gagal: NIS '${nis}' sudah terdaftar di sistem!`, "error");
                return;
            }
        }

        if (id) {
            const { error } = await window.db.from('siswa').update({
                nis, nisn, nama_lengkap, jenis_kelamin, kelas_id_aktif
            }).eq('id', id);

            if (error) throw error;
            if (window.showToast) showToast("Data siswa berhasil diperbarui.", "success");
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

// --- SINKRONISASI DASHBOARD UTAMA ---
async function loadDashboardStats() {
    if (!window.db) return;
    try {
        const { count: totalSiswa } = await window.db.from('siswa').select('*', { count: 'exact', head: true });
        const { count: totalKelas } = await window.db.from('kelas').select('*', { count: 'exact', head: true });
        const { count: totalPositif } = await window.db.from('penilaian_sikap').select('*', { count: 'exact', head: true }).eq('jenis_sikap', 'positif');
        const { count: totalNegatif } = await window.db.from('penilaian_sikap').select('*', { count: 'exact', head: true }).eq('jenis_sikap', 'negatif');

        if (document.getElementById('stat-siswa')) document.getElementById('stat-siswa').innerText = totalSiswa || 0;
        if (document.getElementById('stat-kelas')) document.getElementById('stat-kelas').innerText = totalKelas || 0;
        if (document.getElementById('stat-positif')) document.getElementById('stat-positif').innerText = totalPositif || 0;
        if (document.getElementById('stat-negatif')) document.getElementById('stat-negatif').innerText = totalNegatif || 0;
    } catch (err) {
        console.error("Gagal memuat statistik dashboard:", err);
    }
}

// Tambahkan pemicu dashboard pada init
const originalInit = initDataMaster;
initDataMaster = async function() {
    await originalInit();
    await loadDashboardStats();
};

// --- UNDUH TEMPLATE EXCEL SISWA ---
function downloadTemplateSiswa() {
    const data = [{ "NIS": "1001", "NISN": "0012345678", "Nama Lengkap": "Budi Santoso", "Kelas": "VII A" }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_Siswa");
    XLSX.writeFile(wb, "Template_Data_Siswa.xlsx");
}

// --- KATEGORI KARAKTER DINAMIS ---
function openModalKategoriKarakter() {
    const modal = document.getElementById('modal-kategori-karakter');
    if (modal) modal.classList.remove('hidden');
}

async function saveKategoriKarakter(e) {
    e.preventDefault();
    if (!window.db) return;
    const nama_kategori = document.getElementById('kategori-nama').value.trim();
    try {
        const { error } = await window.db.from('kategori_karakter').insert([{ nama_kategori }]);
        if (error) throw error;
        if (window.showToast) showToast("Kategori karakter ditambahkan.", "success");
        closeModal('modal-kategori-karakter');
        await loadKategoriKarakter();
    } catch (err) {
        if (window.showToast) showToast("Gagal menyimpan kategori: " + err.message, "error");
    }
}

// Export fungsi ke window
window.downloadTemplateSiswa = downloadTemplateSiswa;
window.openModalKategoriKarakter = openModalKategoriKarakter;
window.saveKategoriKarakter = saveKategoriKarakter;

// --- FUNGSI HAPUS SISWA ---
async function deleteSiswa(siswaId, nama) {
    if (!confirm(`Apakah Anda yakin ingin menghapus data siswa "${nama}"?\n\nCatatan: Seluruh riwayat kelas dan penilaian sikap siswa ini juga akan terhapus.`)) {
        return;
    }

    try {
        const { error } = await window.db.from('siswa').delete().eq('id', siswaId);
        if (error) throw error;

        if (window.showToast) showToast(`Data siswa ${nama} berhasil dihapus.`, "success");
        await loadSiswa();
    } catch (err) {
        if (window.showToast) showToast("Gagal menghapus siswa: " + err.message, "error");
    }
}

// Daftarkan fungsi ke scope global window
window.deleteSiswa = deleteSiswa;

// --- FUNGSI HAPUS GURU ---
async function deleteGuru(guruId, nama) {
    if (!confirm(`Apakah Anda yakin ingin menghapus data guru "${nama}"?`)) {
        return;
    }

    try {
        const g = cacheGuru.find(item => item.id === guruId);
        const profileId = g ? g.profile_id : null;

        // 1. Hapus dari tabel guru
        const { error: errGuru } = await window.db.from('guru').delete().eq('id', guruId);
        if (errGuru) throw errGuru;

        // 2. Bersihkan akun profil terikat di tabel profiles jika ada
        if (profileId) {
            await window.db.from('profiles').delete().eq('id', profileId);
        }

        if (window.showToast) showToast(`Data guru ${nama} berhasil dihapus.`, "success");
        await loadGuru();
    } catch (err) {
        if (window.showToast) showToast("Gagal menghapus guru: " + err.message, "error");
    }
}

// Daftarkan fungsi ke scope global window
window.deleteGuru = deleteGuru;

// ==========================================
// FITUR IMPOR GURU VIA EXCEL
// ==========================================
function openModalImportGuru() {
    const modal = document.getElementById('modal-import-guru');
    if (modal) modal.classList.remove('hidden');
}

function downloadTemplateGuru() {
    const dataTemplate = [
        ["NIP", "Nama Lengkap", "No HP"],
        ["198501012010011001", "Drs. Ahmad Dahlan, M.Pd.", "081234567890"],
        ["199002022015022002", "Siti Rahmawati, S.Pd.", "085712345678"]
    ];

    const ws = XLSX.utils.aoa_to_sheet(dataTemplate);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_Guru");
    XLSX.writeFile(wb, "Template_Impor_Guru_SIPAS.xlsx");
}

async function processExcelGuru(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (!rows || rows.length === 0) {
                if (window.showToast) showToast("Berkas Excel kosong!", "error");
                return;
            }

            let successCount = 0;
            let failCount = 0;

            for (const row of rows) {
                const nip = String(row["NIP"] || row["nip"] || "").trim();
                const nama = String(row["Nama Lengkap"] || row["Nama"] || row["nama"] || "").trim();
                const no_hp = String(row["No HP"] || row["no_hp"] || row["No. HP"] || "").trim();

                if (!nama) {
                    failCount++;
                    continue;
                }

                // Cek duplikasi NIP
                if (nip) {
                    const { data: exist } = await window.db.from('guru').select('id').eq('nip', nip).maybeSingle();
                    if (exist) {
                        failCount++;
                        continue;
                    }
                }

                // Buat ID Profil Baru
                const newProfileId = crypto.randomUUID();

                const { error: errProf } = await window.db.from('profiles').insert([{
                    id: newProfileId,
                    nama_lengkap: nama,
                    role: 'guru'
                }]);

                if (errProf) {
                    failCount++;
                    continue;
                }

                const { error: errGuru } = await window.db.from('guru').insert([{
                    profile_id: newProfileId,
                    nip: nip || null,
                    no_hp: no_hp || null
                }]);

                if (errGuru) failCount++;
                else successCount++;
            }

            if (window.showToast) {
                showToast(`Impor Guru Selesai: ${successCount} berhasil, ${failCount} gagal/duplikat.`, successCount > 0 ? "success" : "error");
            }

            closeModal('modal-import-guru');
            event.target.value = '';
            await loadGuru();

        } catch (err) {
            if (window.showToast) showToast("Gagal memproses file Excel: " + err.message, "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// FITUR HAPUS KATEGORI KARAKTER
// ==========================================
async function deleteKategoriKarakter(id, nama) {
    if (!confirm(`Apakah Anda yakin ingin menghapus kategori "${nama}"?\n\nSemua perilaku di bawah kategori ini juga akan terhapus!`)) return;

    try {
        const { error } = await window.db.from('kategori_karakter').delete().eq('id', id);
        if (error) throw error;

        if (window.showToast) showToast(`Kategori "${nama}" berhasil dihapus.`, "success");
        await loadKategoriKarakter();
        await loadKarakter();
    } catch (err) {
        if (window.showToast) showToast("Gagal menghapus kategori: " + err.message, "error");
    }
}

// Global Export
window.downloadTemplateGuru = downloadTemplateGuru;
window.processExcelGuru = processExcelGuru;
window.deleteKategoriKarakter = deleteKategoriKarakter;
window.loadKelas = loadKelas;
window.openModalImportGuru = openModalImportGuru;
