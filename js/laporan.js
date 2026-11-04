// Storage Master Cache Laporan
let cacheLaporanKelas = [];
let cacheLaporanSiswa = [];
let cacheLaporanTA = [];
let cacheLaporanKategori = [];
let isGeneratingExcel = false;

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('page-laporan')) {
        initLaporanPage();
    }
});

async function initLaporanPage() {
    if (!window.db) return;
    await loadLaporanFilters();
}

async function loadLaporanFilters() {
    try {
        const [resKelas, resTA, resSiswa, resKat] = await Promise.all([
            window.db.from('kelas').select('id, nama_kelas').order('nama_kelas'),
            window.db.from('tahun_ajaran').select('id, tahun, semester').order('tahun', { ascending: false }),
            window.db.from('siswa').select('id, nis, nama_lengkap, kelas_id_aktif').order('nama_lengkap'),
            window.db.from('kategori_karakter').select('id, nama_kategori').order('nama_kategori')
        ]);

        cacheLaporanKelas = resKelas.data || [];
        cacheLaporanTA = resTA.data || [];
        cacheLaporanSiswa = resSiswa.data || [];
        cacheLaporanKategori = resKat.data || [];

        // Populate Dropdown Kelas
        const selectKelas = document.getElementById('laporan-filter-kelas');
        if (selectKelas) {
            selectKelas.innerHTML = `<option value="">-- Pilih Kelas --</option>` +
                cacheLaporanKelas.map(k => `<option value="${k.id}">${k.nama_kelas}</option>`).join('');
        }

        // Populate Dropdown Tahun Ajaran
        const selectTA = document.getElementById('laporan-filter-ta');
        if (selectTA) {
            const taUnique = Array.from(new Set(cacheLaporanTA.map(t => t.tahun)));
            selectTA.innerHTML = `<option value="">-- Semua Tahun Ajaran --</option>` +
                taUnique.map(t => `<option value="${t}">${t}</option>`).join('');
        }

    } catch (err) {
        console.error("Gagal memuat filter laporan:", err);
    }
}

// Handler Saat Scope Laporan Berubah
function onLaporanScopeChange() {
    const scope = document.getElementById('laporan-scope').value;
    const selectKelas = document.getElementById('laporan-filter-kelas');
    const selectSiswa = document.getElementById('laporan-filter-siswa');

    if (scope === 'sekolah') {
        selectKelas.disabled = true;
        selectKelas.value = '';
        selectSiswa.disabled = true;
        selectSiswa.value = '';
    } else if (scope === 'kelas') {
        selectKelas.disabled = false;
        selectSiswa.disabled = true;
        selectSiswa.value = '';
    } else if (scope === 'siswa') {
        selectKelas.disabled = false;
        selectSiswa.disabled = false;
    }
}

// Handler Saat Kelas Dipilih di Filter Laporan
function onLaporanKelasChange() {
    const scope = document.getElementById('laporan-scope').value;
    if (scope !== 'siswa') return;

    const kelasId = document.getElementById('laporan-filter-kelas').value;
    const selectSiswa = document.getElementById('laporan-filter-siswa');
    if (!selectSiswa) return;

    const filtered = cacheLaporanSiswa.filter(s => s.kelas_id_aktif === kelasId);
    if (filtered.length === 0) {
        selectSiswa.innerHTML = `<option value="">-- Tidak Ada Siswa --</option>`;
    } else {
        selectSiswa.innerHTML = `<option value="">-- Pilih Siswa --</option>` +
            filtered.map(s => `<option value="${s.id}">${s.nama_lengkap} (${s.nis || '-'})</option>`).join('');
    }
}

// ----------------------------------------------------
// GENERATOR LAPORAN EXCEL MULTI-SHEET (.XLSX)
// ----------------------------------------------------
async function generateLaporanExcel() {
    if (isGeneratingExcel) return;
    if (!window.db || typeof XLSX === 'undefined') {
        if (window.showToast) showToast("Pustaka Excel belum siap atau koneksi terputus.", "error");
        return;
    }

    const btn = document.getElementById('btn-export-excel');
    const scope = document.getElementById('laporan-scope').value;
    const kelasId = document.getElementById('laporan-filter-kelas').value;
    const siswaId = document.getElementById('laporan-filter-siswa').value;
    const taFilter = document.getElementById('laporan-filter-ta').value;
    const semesterFilter = document.getElementById('laporan-filter-semester').value;
    const dateStart = document.getElementById('laporan-date-start').value;
    const dateEnd = document.getElementById('laporan-date-end').value;

    // Validasi Pemilihan Scope
    if (scope === 'kelas' && !kelasId) {
        if (window.showToast) showToast("Silakan pilih kelas terlebih dahulu!", "error");
        return;
    }
    if (scope === 'siswa' && (!kelasId || !siswaId)) {
        if (window.showToast) showToast("Silakan pilih kelas dan siswa terlebih dahulu!", "error");
        return;
    }

    try {
        isGeneratingExcel = true;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span>⏳ Mengolah Laporan Excel...</span>`;
        }

        // 1. Ambil Nama Sekolah dari Pengaturan (Atau Default)
        let namaSekolah = "SD / SMP / SMA SIPAS SCH";
        try {
            const { data: setRes } = await window.db.from('pengaturan').select('nama_sekolah').limit(1).single();
            if (setRes && setRes.nama_sekolah) namaSekolah = setRes.nama_sekolah;
        } catch (e) { }

        // 2. Query Utama Penilaian Sikap dari Supabase
        let query = window.db
            .from('penilaian_sikap')
            .select(`
                id,
                tanggal,
                jenis_sikap,
                catatan,
                siswa_id,
                kelas_id,
                tahun_ajaran_id,
                siswa:siswa_id (id, nis, nisn, nama_lengkap, kelas_id_aktif),
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
            .order('tanggal', { ascending: true });

        if (scope === 'kelas') query = query.eq('kelas_id', kelasId);
        if (scope === 'siswa') query = query.eq('siswa_id', siswaId);

        const { data: rawRecords, error } = await query;
        if (error) throw error;

        // Apply Filter Tambahan (Tahun Ajaran, Semester, Tanggal)
        const records = (rawRecords || []).filter(r => {
            if (taFilter && r.tahun_ajaran?.tahun !== taFilter) return false;
            if (semesterFilter && r.tahun_ajaran?.semester !== semesterFilter) return false;
            if (dateStart && r.tanggal < dateStart) return false;
            if (dateEnd && r.tanggal > dateEnd) return false;
            return true;
        });

        // Query Master Siswa untuk Rekap
        let siswaQuery = window.db.from('siswa').select('id, nis, nama_lengkap, kelas_id_aktif, kelas:kelas_id_aktif(nama_kelas)');
        if (scope === 'kelas') siswaQuery = siswaQuery.eq('kelas_id_aktif', kelasId);
        if (scope === 'siswa') siswaQuery = siswaQuery.eq('id', siswaId);

        const { data: listSiswa } = await siswaQuery;
        const targetSiswa = listSiswa || [];

        // Query Master Perilaku Karakter
        const { data: listPerilaku } = await window.db
            .from('master_perilaku')
            .select('id, nama_perilaku, jenis, kategori_karakter:kategori_id(nama_kategori)');
        const targetPerilaku = listPerilaku || [];

        // Hitung Total Agregat
        const totalPositif = records.filter(r => r.jenis_sikap === 'positif').length;
        const totalNegatif = records.filter(r => r.jenis_sikap === 'negatif').length;

        // ----------------------------------------------------
        // BUILD SHEET 1: RINGKASAN
        // ----------------------------------------------------
        const selectedKelasObj = cacheLaporanKelas.find(k => k.id === kelasId);
        const selectedSiswaObj = cacheLaporanSiswa.find(s => s.id === siswaId);

        let lingkupStr = "Seluruh Sekolah";
        if (scope === 'kelas') lingkupStr = `Kelas ${selectedKelasObj ? selectedKelasObj.nama_kelas : ''}`;
        if (scope === 'siswa') lingkupStr = `Siswa: ${selectedSiswaObj ? selectedSiswaObj.nama_lengkap : ''}`;

        const dataSheet1 = [
            ["LAPORAN RINGKASAN PENILAIAN SIKAP SISWA (SIPAS)"],
            [""],
            ["Nama Sekolah", ": " + namaSekolah],
            ["Tahun Ajaran", ": " + (taFilter || "Semua Tahun Ajaran")],
            ["Semester", ": " + (semesterFilter || "Semua Semester")],
            ["Lingkup Laporan", ": " + lingkupStr],
            ["Rentang Tanggal", ": " + (dateStart || "Awal") + " s/d " + (dateEnd || "Akhir")],
            ["Tanggal Cetak", ": " + new Date().toLocaleDateString('id-ID')],
            [""],
            ["METRIK KINERJA SIKAP"],
            ["Parameter", "Jumlah"],
            ["Jumlah Siswa Tercover", targetSiswa.length],
            ["Total Penilaian Positif (Apresiasi)", totalPositif],
            ["Total Penilaian Negatif (Pelanggaran)", totalNegatif],
            ["Total Seluruh Catatan Kejadian", records.length]
        ];

        const ws1 = XLSX.utils.aoa_to_sheet(dataSheet1);
        ws1['!cols'] = [{ wch: 35 }, { wch: 40 }];
        ws1['!pageSetup'] = { paperSize: 9, orientation: 'portrait' }; // PaperSize 9 = A4

        // ----------------------------------------------------
        // BUILD SHEET 2: REKAP SISWA
        // ----------------------------------------------------
        const dataSheet2 = [
            ["REKAPITULASI SIKAP PER SISWA"],
            [""],
            ["No", "NIS", "Nama Siswa", "Kelas", "Jumlah Positif", "Jumlah Negatif", "Total Catatan"]
        ];

        // Map Penghitungan per Siswa
        const mapSiswaRekap = new Map();
        targetSiswa.forEach(s => {
            mapSiswaRekap.set(s.id, {
                nis: s.nis || '-',
                nama: s.nama_lengkap,
                kelas: s.kelas?.nama_kelas || '-',
                positif: 0,
                negatif: 0
            });
        });

        records.forEach(r => {
            if (mapSiswaRekap.has(r.siswa_id)) {
                const item = mapSiswaRekap.get(r.siswa_id);
                if (r.jenis_sikap === 'positif') item.positif++;
                else if (r.jenis_sikap === 'negatif') item.negatif++;
            }
        });

        let idxSiswa = 1;
        mapSiswaRekap.forEach(val => {
            dataSheet2.push([
                idxSiswa++,
                val.nis,
                val.nama,
                val.kelas,
                val.positif,
                val.negatif,
                val.positif + val.negatif
            ]);
        });

        const ws2 = XLSX.utils.aoa_to_sheet(dataSheet2);
        ws2['!cols'] = [
            { wch: 6 },  // No
            { wch: 15 }, // NIS
            { wch: 30 }, // Nama Siswa
            { wch: 15 }, // Kelas
            { wch: 16 }, // Positif
            { wch: 16 }, // Negatif
            { wch: 15 }  // Total
        ];
        ws2['!pageSetup'] = { paperSize: 9, orientation: 'portrait' };

        // ----------------------------------------------------
        // BUILD SHEET 3: RINCIAN PENILAIAN
        // ----------------------------------------------------
        const dataSheet3 = [
            ["RINCIAN LOG CATATAN PENILAIAN SIKAP"],
            [""],
            ["No", "Tanggal", "NIS", "Nama Siswa", "Kelas", "Jenis Penilaian", "Kategori Karakter", "Nama Perilaku", "Guru Pencatat", "Keterangan / Catatan"]
        ];

        records.forEach((r, idx) => {
            dataSheet3.push([
                idx + 1,
                r.tanggal ? new Date(r.tanggal).toLocaleDateString('id-ID') : '-',
                r.siswa?.nis || '-',
                r.siswa?.nama_lengkap || '-',
                r.kelas?.nama_kelas || '-',
                (r.jenis_sikap || 'positif').toUpperCase(),
                r.master_perilaku?.kategori_karakter?.nama_kategori || 'Umum',
                r.master_perilaku?.nama_perilaku || '-',
                r.pencatat?.nama_lengkap || 'Sistem',
                r.catatan || '-'
            ]);
        });

        const ws3 = XLSX.utils.aoa_to_sheet(dataSheet3);
        ws3['!cols'] = [
            { wch: 6 },  // No
            { wch: 14 }, // Tanggal
            { wch: 15 }, // NIS
            { wch: 28 }, // Nama Siswa
            { wch: 12 }, // Kelas
            { wch: 16 }, // Jenis
            { wch: 22 }, // Kategori
            { wch: 30 }, // Perilaku
            { wch: 25 }, // Guru
            { wch: 45 }  // Catatan
        ];
        ws3['!pageSetup'] = { paperSize: 9, orientation: 'landscape' };

        // ----------------------------------------------------
        // BUILD SHEET 4: REKAP KARAKTER
        // ----------------------------------------------------
        const dataSheet4 = [
            ["REKAPITULASI FREKUENSI PERILAKU KARAKTER"],
            [""],
            ["No", "Kategori Karakter", "Nama Perilaku", "Tipe Sifat", "Jumlah Positif", "Jumlah Negatif"]
        ];

        const mapPerilakuRekap = new Map();
        targetPerilaku.forEach(p => {
            mapPerilakuRekap.set(p.id, {
                kategori: p.kategori_karakter?.nama_kategori || 'Umum',
                perilaku: p.nama_perilaku,
                jenisDef: p.jenis,
                positif: 0,
                negatif: 0
            });
        });

        records.forEach(r => {
            if (r.master_perilaku && mapPerilakuRekap.has(r.master_perilaku.id)) {
                const item = mapPerilakuRekap.get(r.master_perilaku.id);
                if (r.jenis_sikap === 'positif') item.positif++;
                else if (r.jenis_sikap === 'negatif') item.negatif++;
            }
        });

        let idxPerilaku = 1;
        mapPerilakuRekap.forEach(val => {
            dataSheet4.push([
                idxPerilaku++,
                val.kategori,
                val.perilaku,
                val.jenisDef.toUpperCase(),
                val.positif,
                val.negatif
            ]);
        });

        const ws4 = XLSX.utils.aoa_to_sheet(dataSheet4);
        ws4['!cols'] = [
            { wch: 6 },  // No
            { wch: 25 }, // Kategori
            { wch: 35 }, // Perilaku
            { wch: 12 }, // Tipe
            { wch: 16 }, // Positif
            { wch: 16 }  // Negatif
        ];
        ws4['!pageSetup'] = { paperSize: 9, orientation: 'portrait' };

        // ----------------------------------------------------
        // MEMBUAT WORKBOOK DAN MENGGABUNGKAN SELURUH SHEET
        // ----------------------------------------------------
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws1, "RINGKASAN");
        XLSX.utils.book_append_sheet(wb, ws2, "REKAP SISWA");
        XLSX.utils.book_append_sheet(wb, ws3, "RINCIAN PENILAIAN");
        XLSX.utils.book_append_sheet(wb, ws4, "REKAP KARAKTER");

        // Nama Berkas Excel Sesuai Tanggal & Scope
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `Laporan_SIPAS_${scope.toUpperCase()}_${dateStr}.xlsx`;

        // Unduh File
        XLSX.writeFile(wb, fileName);

        if (window.showToast) showToast("Laporan Excel berhasil dibuat dan diunduh!", "success");

    } catch (err) {
        if (window.showToast) showToast("Gagal membuat laporan Excel: " + err.message, "error");
    } finally {
        isGeneratingExcel = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `📊 Unduh Laporan Excel Multi-Sheet (.xlsx)`;
        }
    }
}

// Hubungkan ke Switch Page Main
const prevSwitchPageLaporan = window.switchPage;
window.switchPage = function(pageId, event) {
    if (prevSwitchPageLaporan) prevSwitchPageLaporan(pageId, event);
    if (pageId === 'laporan') {
        initLaporanPage();
    }
};

window.onLaporanScopeChange = onLaporanScopeChange;
window.onLaporanKelasChange = onLaporanKelasChange;
window.generateLaporanExcel = generateLaporanExcel;
