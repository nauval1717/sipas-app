let cacheRawPenilaian = [];
let cacheSiswaMaster = [];
let cacheKelasMaster = [];
let cacheTAMaster = [];

document.addEventListener('DOMContentLoaded', () => {
    initSkorDanPelanggaran();
});

async function initSkorDanPelanggaran() {
    if (!window.db) return;
    await loadMasterFilters();
    await fetchPenilaianData();
}

async function loadMasterFilters() {
    try {
        const [resKelas, resTA, resSiswa] = await Promise.all([
            window.db.from('kelas').select('id, nama_kelas').order('nama_kelas'),
            window.db.from('tahun_ajaran').select('id, tahun, semester').order('tahun', { ascending: false }),
            window.db.from('siswa').select('id, nis, nisn, nama_lengkap, kelas_id_aktif, kelas:kelas_id_aktif(nama_kelas)').order('nama_lengkap')
        ]);

        cacheKelasMaster = resKelas.data || [];
        cacheTAMaster = resTA.data || [];
        cacheSiswaMaster = resSiswa.data || [];

        populateFilterDropdowns();
    } catch (err) {
        console.error("Gagal memuat filter master:", err);
    }
}

function populateFilterDropdowns() {
    const kelasOptions = `<option value="">-- Semua Kelas --</option>` +
        cacheKelasMaster.map(k => `<option value="${k.id}">${k.nama_kelas}</option>`).join('');

    const taSet = new Set(cacheTAMaster.map(t => t.tahun));
    const taOptions = `<option value="">-- Semua Tahun Ajaran --</option>` +
        Array.from(taSet).map(t => `<option value="${t}">${t}</option>`).join('');

    ['skor-filter-kelas', 'pelanggaran-filter-kelas'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = kelasOptions;
    });

    ['skor-filter-ta', 'pelanggaran-filter-ta'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = taOptions;
    });
}

async function fetchPenilaianData() {
    try {
        const { data, error } = await window.db
            .from('penilaian_sikap')
            .select(`
                id,
                tanggal,
                jenis_sikap,
                catatan,
                siswa_id,
                kelas_id,
                tahun_ajaran_id,
                siswa:siswa_id (id, nis, nisn, nama_lengkap),
                kelas:kelas_id (id, nama_kelas),
                tahun_ajaran:tahun_ajaran_id (id, tahun, semester),
                master_perilaku:perilaku_id (
                    id, 
                    nama_perilaku, 
                    jenis,
                    kategori_karakter:kategori_id (nama_kategori)
                ),
                pencatat:pencatat_id (nama_lengkap)
            `)
            .order('tanggal', { ascending: false });

        if (error) throw error;
        cacheRawPenilaian = data || [];

        filterSkorSiswa();
        filterPelanggaran();
    } catch (err) {
        console.error("Gagal mengambil data penilaian:", err);
    }
}

// ----------------------------------------------------
// 1. LOGIKA SKOR SISWA (HITUNG POSITIF & NEGATIF TERPISAH)
// ----------------------------------------------------
function filterSkorSiswa() {
    const search = (document.getElementById('skor-search')?.value || '').toLowerCase();
    const filterKelas = document.getElementById('skor-filter-kelas')?.value || '';
    const filterTA = document.getElementById('skor-filter-ta')?.value || '';
    const filterSemester = document.getElementById('skor-filter-semester')?.value || '';
    const dateStart = document.getElementById('skor-date-start')?.value || '';
    const dateEnd = document.getElementById('skor-date-end')?.value || '';

    // Filter Penilaian Mentah Terlebih Dahulu
    const filteredRecords = cacheRawPenilaian.filter(r => {
        if (filterKelas && r.kelas_id !== filterKelas) return false;
        if (filterTA && r.tahun_ajaran?.tahun !== filterTA) return false;
        if (filterSemester && r.tahun_ajaran?.semester !== filterSemester) return false;
        if (dateStart && r.tanggal < dateStart) return false;
        if (dateEnd && r.tanggal > dateEnd) return false;
        return true;
    });

    // Kelompokkan Data per Siswa
    const mapSiswa = new Map();

    cacheSiswaMaster.forEach(s => {
        const matchSearch = (s.nama_lengkap || '').toLowerCase().includes(search) ||
                            (s.nis || '').toLowerCase().includes(search);
        const matchKelas = filterKelas ? s.kelas_id_aktif === filterKelas : true;

        if (matchSearch && matchKelas) {
            mapSiswa.set(s.id, {
                siswa: s,
                positif: 0,
                negatif: 0,
                records: []
            });
        }
    });

    filteredRecords.forEach(r => {
        if (mapSiswa.has(r.siswa_id)) {
            const item = mapSiswa.get(r.siswa_id);
            item.records.push(r);
            if (r.jenis_sikap === 'positif') {
                item.positif++;
            } else if (r.jenis_sikap === 'negatif') {
                item.negatif++;
            }
        }
    });

    renderTableSkor(Array.from(mapSiswa.values()));
}

function renderTableSkor(listData) {
    const tbody = document.getElementById('table-skor-body');
    if (!tbody) return;

    if (listData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Tidak ada data rekapitulasi siswa.</td></tr>`;
        return;
    }

    tbody.innerHTML = listData.map(d => `
        <tr>
            <td><strong>${d.siswa.nama_lengkap}</strong><br><small class="text-muted">NIS: ${d.siswa.nis || '-'}</small></td>
            <td>${d.siswa.kelas?.nama_kelas || 'Tanpa Kelas'}</td>
            <td><span class="badge text-success" style="font-size: 14px;">👍 ${d.positif}</span></td>
            <td><span class="badge text-danger" style="font-size: 14px;">👎 ${d.negatif}</span></td>
            <td>
                <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="openDetailSkorSiswa('${d.siswa.id}')">👁️ Lihat Detail</button>
            </td>
        </tr>
    `).join('');
}

function openDetailSkorSiswa(siswaId) {
    const s = cacheSiswaMaster.find(item => item.id === siswaId);
    if (!s) return;

    const infoDiv = document.getElementById('detail-skor-info');
    if (infoDiv) {
        infoDiv.innerHTML = `
            <p><strong>Nama:</strong> ${s.nama_lengkap}</p>
            <p><strong>NIS / NISN:</strong> ${s.nis || '-'} / ${s.nisn || '-'}</p>
            <p><strong>Kelas Aktif:</strong> ${s.kelas?.nama_kelas || '-'}</p>
        `;
    }

    const records = cacheRawPenilaian.filter(r => r.siswa_id === siswaId);
    const positifList = records.filter(r => r.jenis_sikap === 'positif');
    const negatifList = records.filter(r => r.jenis_sikap === 'negatif');

    document.getElementById('count-detail-positif').innerText = positifList.length;
    document.getElementById('count-detail-negatif').innerText = negatifList.length;

    const tbodyPos = document.getElementById('table-detail-positif');
    const tbodyNeg = document.getElementById('table-detail-negatif');

    tbodyPos.innerHTML = positifList.length === 0 ? `<tr><td colspan="3" class="text-muted text-center">Belum ada catatan positif.</td></tr>` :
        positifList.map(r => `
            <tr>
                <td><small>${new Date(r.tanggal).toLocaleDateString('id-ID')}</small></td>
                <td><strong>${r.master_perilaku?.nama_perilaku || '-'}</strong></td>
                <td><small>${r.catatan || '-'}</small></td>
            </tr>
        `).join('');

    tbodyNeg.innerHTML = negatifList.length === 0 ? `<tr><td colspan="3" class="text-muted text-center">Belum ada catatan negatif.</td></tr>` :
        negatifList.map(r => `
            <tr>
                <td><small>${new Date(r.tanggal).toLocaleDateString('id-ID')}</small></td>
                <td><strong>${r.master_perilaku?.nama_perilaku || '-'}</strong></td>
                <td><small>${r.catatan || '-'}</small></td>
            </tr>
        `).join('');

    const modal = document.getElementById('modal-detail-skor');
    if (modal) modal.classList.remove('hidden');
}

// ----------------------------------------------------
// 2. LOGIKA PELANGGARAN SISWA
// ----------------------------------------------------
function filterPelanggaran() {
    const search = (document.getElementById('pelanggaran-search')?.value || '').toLowerCase();
    const filterKelas = document.getElementById('pelanggaran-filter-kelas')?.value || '';
    const filterTA = document.getElementById('pelanggaran-filter-ta')?.value || '';
    const filterSemester = document.getElementById('pelanggaran-filter-semester')?.value || '';
    const dateStart = document.getElementById('pelanggaran-date-start')?.value || '';
    const dateEnd = document.getElementById('pelanggaran-date-end')?.value || '';

    const filtered = cacheRawPenilaian.filter(r => {
        if (r.jenis_sikap !== 'negatif') return false;

        const matchSearch = (r.siswa?.nama_lengkap || '').toLowerCase().includes(search) ||
                            (r.siswa?.nis || '').toLowerCase().includes(search);
        if (!matchSearch) return false;

        if (filterKelas && r.kelas_id !== filterKelas) return false;
        if (filterTA && r.tahun_ajaran?.tahun !== filterTA) return false;
        if (filterSemester && r.tahun_ajaran?.semester !== filterSemester) return false;
        if (dateStart && r.tanggal < dateStart) return false;
        if (dateEnd && r.tanggal > dateEnd) return false;

        return true;
    });

    renderTablePelanggaran(filtered);
}

function renderTablePelanggaran(data) {
    const tbody = document.getElementById('table-pelanggaran-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Tidak ada catatan pelanggaran yang sesuai filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(p => `
        <tr>
            <td>${new Date(p.tanggal).toLocaleDateString('id-ID')}</td>
            <td><strong>${p.siswa?.nama_lengkap || '-'}</strong></td>
            <td>${p.kelas?.nama_kelas || '-'}</td>
            <td><span class="badge">${p.master_perilaku?.kategori_karakter?.nama_kategori || 'Umum'}</span></td>
            <td><strong class="text-danger">${p.master_perilaku?.nama_perilaku || '-'}</strong></td>
            <td>${p.pencatat?.nama_lengkap || 'Sistem'}</td>
            <td><small>${p.catatan ? `"${p.catatan}"` : '-'}</small></td>
        </tr>
    `).join('');
}

// Hubungkan ke Switch Page
const prevSwitchPage = window.switchPage;
window.switchPage = function(pageId, event) {
    if (prevSwitchPage) prevSwitchPage(pageId, event);
    if (pageId === 'skor-siswa' || pageId === 'pelanggaran') {
        initSkorDanPelanggaran();
    }
};

window.filterSkorSiswa = filterSkorSiswa;
window.filterPelanggaran = filterPelanggaran;
window.openDetailSkorSiswa = openDetailSkorSiswa;
window.initSkorDanPelanggaran = initSkorDanPelanggaran;
