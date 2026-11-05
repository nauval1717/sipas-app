let dashboardChartInstance = null;
let cacheMasterKelasDashboard = [];
let dashboardRealtimeChannel = null;   // [BARU]
let dashboardRealtimeTimer = null;     // [BARU]

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('page-dashboard')) {
        initDashboard();
    }
});

async function initDashboard() {
    if (!window.db) return;
    await populateDashboardFilters();
    bindDashboardDateFilters();        // [BARU]
    await loadDashboardData();
    startDashboardRealtime();          // [BARU]
}

// ----------------------------------------------------
// [BARU] FILTER TANGGAL: otomatis muat ulang saat tanggal diganti
// ----------------------------------------------------
function bindDashboardDateFilters() {
    ['dash-date-start', 'dash-date-end'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.bound) {
            el.addEventListener('change', () => loadDashboardData());
            el.dataset.bound = '1';
        }
    });
}

// ----------------------------------------------------
// [BARU] REALTIME LISTENER: refresh dashboard saat guru lain input data
// ----------------------------------------------------
function startDashboardRealtime() {
    if (!window.db || dashboardRealtimeChannel) return; // cegah subscribe ganda

    dashboardRealtimeChannel = window.db
        .channel('realtime-penilaian-sikap')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'penilaian_sikap' }, (payload) => {
            console.log('Ada pembaruan data penilaian!', payload);
            // Debounce: banyak perubahan beruntun cukup 1x refresh
            clearTimeout(dashboardRealtimeTimer);
            dashboardRealtimeTimer = setTimeout(() => {
                if (document.getElementById('page-dashboard')) loadDashboardData();
            }, 500);
        })
        .subscribe();
}

// ----------------------------------------------------
// 1. MEMUAT FILTER TAHUN AJARAN
// ----------------------------------------------------
async function populateDashboardFilters() {
    const selectTA = document.getElementById('dash-filter-ta');
    if (!selectTA) return;

    try {
        const { data: taData } = await window.db.from('tahun_ajaran').select('id, tahun').order('tahun', { ascending: false });
        if (taData && taData.length > 0) {
            const currentVal = selectTA.value; // [DIUBAH] pilihan tidak hilang saat dipanggil ulang
            const taUnique = Array.from(new Set(taData.map(t => t.tahun)));
            selectTA.innerHTML = `<option value="">-- Semua Tahun Ajaran --</option>` +
                taUnique.map(t => `<option value="${t}">${t}</option>`).join('');
            selectTA.value = currentVal;
        }
    } catch (err) {
        console.error("Gagal memuat filter dashboard:", err);
    }
}

// ----------------------------------------------------
// 2. AMBIL DAN PROSES DATA UTAMA SUPABASE
// ----------------------------------------------------
async function loadDashboardData() {
    if (!window.db) return;

    const filterTA = document.getElementById('dash-filter-ta')?.value || '';
    const filterSem = document.getElementById('dash-filter-semester')?.value || '';
    const filterTglMulai = document.getElementById('dash-date-start')?.value || '';   // [BARU]
    const filterTglSampai = document.getElementById('dash-date-end')?.value || '';    // [BARU]
    const userRole = window.currentUserRole || 'admin';

    // Sesuaikan Label Peran
    const badgeEl = document.getElementById('dash-role-badge');
    if (badgeEl) {
        badgeEl.innerHTML = userRole === 'admin' 
            ? `<span class="badge" style="background: #e0e7ff; color: #3730a3;">Mode Akses: Administrator (Akses Penuh)</span>`
            : `<span class="badge" style="background: #fef3c7; color: #92400e;">Mode Akses: Guru / Pencatat Sikap</span>`;
    }

    try {
        // A. Ambil Jumlah Total Master Data
        const [resSiswa, resKelas, resGuru, resMasterKelas] = await Promise.all([
            window.db.from('siswa').select('id', { count: 'exact', head: true }),
            window.db.from('kelas').select('id', { count: 'exact', head: true }),
            window.db.from('guru').select('id', { count: 'exact', head: true }),
            window.db.from('kelas').select('id, nama_kelas').order('nama_kelas')
        ]);

        document.getElementById('stat-siswa').innerText = resSiswa.count || 0;
        document.getElementById('stat-kelas').innerText = resKelas.count || 0;
        document.getElementById('stat-guru').innerText = resGuru.count || 0;
        cacheMasterKelasDashboard = resMasterKelas.data || [];

        // B. Query Transaksi Penilaian Sikap (Tanpa Embed kelas_id yang Rentan Error)
        let query = window.db                                                          // [DIUBAH] dari const { data, error } = await ...
            .from('penilaian_sikap')
            .select(`
                id,
                tanggal,
                jenis_sikap,
                catatan,
                created_at,
                siswa_id,
                kelas_id,
                tahun_ajaran_id,
                siswa:siswa_id (nama_lengkap),
                tahun_ajaran:tahun_ajaran_id (tahun, semester),
                master_perilaku:perilaku_id (id, nama_perilaku, jenis),
                pencatat:pencatat_id (nama_lengkap)
            `);

        // [BARU] Filter rentang tanggal di sisi server
        if (filterTglMulai) query = query.gte('tanggal', filterTglMulai);
        if (filterTglSampai) query = query.lte('tanggal', filterTglSampai);

        const { data: records, error } = await query.order('created_at', { ascending: false }); // [DIUBAH]

        if (error) throw error;

        // Gabungkan nama kelas secara otomatis dari data master kelas
        const mapKelas = new Map(cacheMasterKelasDashboard.map(k => [k.id, k]));
        const processedRecords = (records || []).map(r => ({
            ...r,
            kelas: mapKelas.get(r.kelas_id) || { nama_kelas: '-' }
        }));

        // Penyaringan berdasarkan Filter Tahun Ajaran & Semester
        const filtered = processedRecords.filter(r => {
            if (filterTA && r.tahun_ajaran?.tahun !== filterTA) return false;
            if (filterSem && r.tahun_ajaran?.semester !== filterSem) return false;
            return true;
        });

        // Hitung Sikap Positif & Negatif
        const totalPositif = filtered.filter(r => r.jenis_sikap === 'positif').length;
        const totalNegatif = filtered.filter(r => r.jenis_sikap === 'negatif').length;

        document.getElementById('stat-positif').innerText = totalPositif;
        document.getElementById('stat-negatif').innerText = totalNegatif;

        // Render Komponen Dashboard
        renderDashboardChart(totalPositif, totalNegatif);
        renderTopPerilaku(filtered);
        renderRekapKelasDashboard(filtered);
        renderRecentAssessmentsTable(filtered.slice(0, 7));

    } catch (err) {
        console.error("Gagal memperbarui dashboard:", err);
    }
}

// ----------------------------------------------------
// 3. RENDER GRAFIK (CHART.JS)
// ----------------------------------------------------
function renderDashboardChart(positifCount, negatifCount) {
    const canvas = document.getElementById('chart-penilaian');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (dashboardChartInstance) {
        dashboardChartInstance.destroy();
    }

    dashboardChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Sikap Positif (Apresiasi)', 'Sikap Negatif (Pelanggaran)'],
            datasets: [{
                label: 'Jumlah Catatan',
                data: [positifCount, negatifCount],
                backgroundColor: ['#22c55e', '#ef4444'],
                borderRadius: 6,
                barThickness: 45
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

// ----------------------------------------------------
// 4. RENDER TOP PERILAKU PALING SERING DICATAT
// ----------------------------------------------------
function renderTopPerilaku(records) {
    const listEl = document.getElementById('list-top-perilaku');
    if (!listEl) return;

    if (records.length === 0) {
        listEl.innerHTML = `<li class="text-muted text-center">Belum ada data catatan.</li>`;
        return;
    }

    const freqMap = new Map();
    records.forEach(r => {
        if (r.master_perilaku) {
            const key = r.master_perilaku.id;
            if (!freqMap.has(key)) {
                freqMap.set(key, {
                    nama: r.master_perilaku.nama_perilaku,
                    jenis: r.jenis_sikap,
                    count: 0
                });
            }
            freqMap.get(key).count++;
        }
    });

    const sorted = Array.from(freqMap.values()).sort((a, b) => b.count - a.count).slice(0, 5);

    listEl.innerHTML = sorted.map(item => `
        <li style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
            <div>
                <strong style="font-size: 13px;">${item.nama}</strong>
                <br>
                <small class="${item.jenis === 'positif' ? 'text-success' : 'text-danger'}">
                    ${item.jenis === 'positif' ? '👍 Positif' : '👎 Negatif'}
                </small>
            </div>
            <span class="badge" style="background: #f1f5f9; color: #334155; font-size: 12px;">${item.count}x</span>
        </li>
    `).join('');
}

// ----------------------------------------------------
// 5. RENDER REKAPITULASI PER KELAS
// ----------------------------------------------------
function renderRekapKelasDashboard(records) {
    const tbody = document.getElementById('table-rekap-kelas-body');
    if (!tbody) return;

    if (cacheMasterKelasDashboard.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Belum ada kelas terdaftar.</td></tr>`;
        return;
    }

    const mapKelas = new Map();
    cacheMasterKelasDashboard.forEach(k => {
        mapKelas.set(k.id, { nama: k.nama_kelas, positif: 0, negatif: 0 });
    });

    records.forEach(r => {
        if (r.kelas_id && mapKelas.has(r.kelas_id)) {
            const item = mapKelas.get(r.kelas_id);
            if (r.jenis_sikap === 'positif') item.positif++;
            else if (r.jenis_sikap === 'negatif') item.negatif++;
        }
    });

    tbody.innerHTML = Array.from(mapKelas.values()).map(k => `
        <tr>
            <td><strong>${k.nama}</strong></td>
            <td><span class="badge text-success">👍 ${k.positif}</span></td>
            <td><span class="badge text-danger">👎 ${k.negatif}</span></td>
            <td><strong>${k.positif + k.negatif}</strong></td>
        </tr>
    `).join('');
}

// ----------------------------------------------------
// 6. RENDER TABEL CATATAN TERBARU
// ----------------------------------------------------
function renderRecentAssessmentsTable(recentList) {
    const tbody = document.getElementById('table-recent-assessments');
    if (!tbody) return;

    if (recentList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Belum ada data penilaian.</td></tr>`;
        return;
    }

    tbody.innerHTML = recentList.map(r => `
        <tr>
            <td><small>${new Date(r.tanggal).toLocaleDateString('id-ID')}</small></td>
            <td><strong>${r.siswa?.nama_lengkap || '-'}</strong></td>
            <td>${r.kelas?.nama_kelas || '-'}</td>
            <td>
                <span class="badge ${r.jenis_sikap === 'positif' ? 'bg-green' : 'bg-red'}">
                    ${r.jenis_sikap === 'positif' ? 'POSITIF' : 'NEGATIF'}
                </span>
            </td>
            <td>${r.master_perilaku?.nama_perilaku || '-'}</td>
            <td><small>${r.pencatat?.nama_lengkap || 'Sistem'}</small></td>
        </tr>
    `).join('');
}

// Pemicu otomatis saat berpindah halaman ke Dashboard
const prevSwitchPageDash = window.switchPage;
window.switchPage = function(pageId, event) {
    if (prevSwitchPageDash) prevSwitchPageDash(pageId, event);
    if (pageId === 'dashboard') {
        initDashboard();
    }
};

window.initDashboard = initDashboard;
window.loadDashboardData = loadDashboardData;
