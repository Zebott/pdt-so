// ITX PDT Stock Opname (SO) Core Engine
(function () {
  'use strict';

  // --- Audio Synthesizer for PDT BEEP ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playBeepSuccess() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1500, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {}
    if (navigator.vibrate) {
      try { navigator.vibrate(60); } catch (e) {}
    }
  }

  function playBeepError() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
    if (navigator.vibrate) {
      try { navigator.vibrate([100, 50, 100]); } catch (e) {}
    }
  }

  // --- Date & Timestamp Formatter for Stock Opname ---
  // Format M/D/YY h:mm:ss A (e.g. 6/17/17 9:01:10 PM)
  function formatSoTimestamp(d = new Date()) {
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const yy = String(d.getFullYear()).slice(-2);
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    return `${m}/${day}/${yy} ${h}:${mins}:${secs} ${ampm}`;
  }

  // Returns 8-digit YYYYMMDD
  function formatYYYYMMDD(dateStr) {
    if (!dateStr) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return `${y}${m}${d}`;
    }
    return dateStr.replace(/[^0-9]/g, '').slice(0, 8);
  }

  // Returns 6-digit YYMMDD for Filename
  function formatYYMMDD(dateStr) {
    const ymd = formatYYYYMMDD(dateStr);
    return ymd.slice(2, 8);
  }

  // --- State & Storage ---
  const STORAGE_KEY = 'ITX_PDT_SO_SESSION_V1';
  const ARCHIVE_KEY = 'ITX_PDT_SO_ARCHIVES_V1';
  const RACKS_STORAGE_KEY = 'ITX_PDT_SO_REGISTERED_RACKS_V1';

  let database = { items: {}, lokasi: [], barcodes: {} };

  let state = {
    tanggal: '',
    lokasiToko: '55022',
    userSo: 'YONO',
    kodeRak: 'AB/001',
    deviceId: '1',
    docBatch: '12814',
    items: [],
    activePendingItem: null,
    registeredRacks: []
  };

  // --- DOM Elements ---
  const elDate = document.getElementById('inputDate');
  const elUserSo = document.getElementById('inputUserSo');
  const elLokToko = document.getElementById('inputLokToko');
  const badgeLokToko = document.getElementById('badgeLokToko');
  const suggestLokToko = document.getElementById('suggestLokToko');
  const elKodeRak = document.getElementById('inputKodeRak');
  const elDeviceId = document.getElementById('inputDeviceId');
  const elDocBatch = document.getElementById('inputDocBatch');

  const elMainQty = document.getElementById('inputMainQty');
  const elBtnQtyTouchMinus = document.getElementById('btnQtyTouchMinus');
  const elBtnQtyTouchPlus = document.getElementById('btnQtyTouchPlus');

  const elScanInput = document.getElementById('inputScanCode');
  const elBtnManualSubmit = document.getElementById('btnManualSubmit');
  const elSuggestBox = document.getElementById('suggestBox');
  const elLiveCard = document.getElementById('liveItemCard');
  const elLiveIcon = document.getElementById('liveItemIcon');
  const elLiveName = document.getElementById('liveItemName');
  const elLiveMeta = document.getElementById('liveItemMeta');

  const elTotalLines = document.getElementById('totalLines');
  const elTotalQty = document.getElementById('totalQty');
  const elActiveRack = document.getElementById('activeRackDisplay');
  const elItemList = document.getElementById('itemList') || document.getElementById('scannedItemList');
  const elEmptyState = document.getElementById('emptyState');

  const elModalPreview = document.getElementById('modalPreview');
  const elTxtPreview = document.getElementById('txtPreview') || document.getElementById('txtPreviewArea');
  const elModalCam = document.getElementById('camWrapper') || document.getElementById('modalCam');
  const elModalCamPerm = document.getElementById('modalCamPermission');
  const elCamFileInput = document.getElementById('cameraSnapInput') || document.getElementById('camFileInput');

  let html5QrCode = null;


  // --- MASTER RACK REGISTRATION & STRICT VALIDATION ---
  function getDefaultRacks() {
    const def = [];
    for (let i = 1; i <= 100; i++) {
      def.push('AA/' + String(i).padStart(3, '0'));
    }
    def.push('D001');
    return def;
  }

  function getRackInfo(rackCode) {
    if (!database || !database.racks) return null;
    const clean = (rackCode || '').trim().toUpperCase();
    return database.racks.find(r => (typeof r === 'string' ? r : r.r).toUpperCase() === clean) || null;
  }

  function checkRackPeserta(rackCode) {
    const info = getRackInfo(rackCode);
    if (info) {
      if (info.p && info.p.trim()) {
        state.userSo = info.p.trim();
        if (elUserSo) elUserSo.value = state.userSo;
      }
      const elPendamping = document.getElementById('displayPendamping');
      if (elPendamping) {
        elPendamping.textContent = info.d || '-';
      }
      saveSession();
    }
  }

  function syncRacksFromDatabase() {
    if (!database.racks || database.racks.length === 0) return;
    const dbRacks = database.racks.map(r => (typeof r === 'string' ? r : r.r).trim().toUpperCase());
    
    // Always prioritize official racks from RAK.DBF
    state.registeredRacks = dbRacks;
    saveRegisteredRacks();

    if (!isRackValid(state.kodeRak) && state.registeredRacks.length > 0) {
      state.kodeRak = state.registeredRacks[0];
      if (elKodeRak) elKodeRak.value = state.kodeRak;
      saveSession();
    }
    checkRackPeserta(state.kodeRak);
    updateRackUI();
  }

  function loadRegisteredRacks() {
    // If database already loaded with racks from RAK.DBF, prioritize RAK.DBF
    if (database && database.racks && database.racks.length > 0) {
      state.registeredRacks = database.racks.map(r => (typeof r === 'string' ? r : r.r).trim().toUpperCase());
      saveRegisteredRacks();
      return;
    }
    try {
      const raw = localStorage.getItem(RACKS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.registeredRacks = parsed;
          return;
        }
      }
    } catch (e) {}
    state.registeredRacks = getDefaultRacks();
    saveRegisteredRacks();
  }

  function saveRegisteredRacks() {
    try {
      localStorage.setItem(RACKS_STORAGE_KEY, JSON.stringify(state.registeredRacks));
    } catch (e) {}
  }

  function isRackValid(code) {
    if (!code) return false;
    const clean = code.trim().toUpperCase();
    if (!state.registeredRacks || state.registeredRacks.length === 0) {
      return false;
    }
    return state.registeredRacks.includes(clean);
  }

  function updateRackUI() {
    // Populate datalist
    const listEl = document.getElementById('listRegisteredRacks');
    if (listEl) {
      listEl.innerHTML = state.registeredRacks.map(r => `<option value="${r}">`).join('');
    }

    // Status badge
    const badgeEl = document.getElementById('rackValidationStatus');
    if (badgeEl) {
      const isValid = isRackValid(state.kodeRak);
      if (isValid) {
        const info = getRackInfo(state.kodeRak);
        const meta = (info && info.p) ? ` | Peserta: <strong>${info.p}</strong>${info.d ? ' (Pendamping: ' + info.d + ')' : ''}` : '';
        badgeEl.className = 'rack-status-badge valid';
        badgeEl.innerHTML = `✓ Rak Sah: <strong>${state.kodeRak}</strong>${meta} (Total ${state.registeredRacks.length} rak)`;
      } else {
        badgeEl.className = 'rack-status-badge invalid';
        badgeEl.innerHTML = `⛔ Rak <strong>${state.kodeRak || '(Kosong)'}</strong> TIDAK TERDAFTAR (Ditolak)`;
      }
    }

    // Stat bar
    if (elActiveRack) {
      elActiveRack.textContent = state.kodeRak || '-';
    }
    if (elKodeRak && elKodeRak.value !== state.kodeRak) {
      elKodeRak.value = state.kodeRak;
    }
  }

  // Rejection Modal
  const modalRackRejected = document.getElementById('modalRackRejected');
  const elRejectedRackName = document.getElementById('rejectedRackName');
  const btnCloseRackRejected = document.getElementById('btnCloseRackRejected');
  const btnDismissRackRejected = document.getElementById('btnDismissRackRejected');

  function showRackRejectedModal(rejectedCode) {
    if (elRejectedRackName) {
      elRejectedRackName.textContent = rejectedCode || '(Kosong)';
    }
    if (modalRackRejected) {
      modalRackRejected.classList.add('active');
    }
  }

  function closeRackRejectedModal() {
    if (modalRackRejected) {
      modalRackRejected.classList.remove('active');
    }
    if (elKodeRak) {
      elKodeRak.value = state.kodeRak;
      elKodeRak.focus();
    }
  }

  if (btnCloseRackRejected) btnCloseRackRejected.addEventListener('click', closeRackRejectedModal);
  if (btnDismissRackRejected) btnDismissRackRejected.addEventListener('click', closeRackRejectedModal);

  // --- Toast ---
  function showToast(msg, isErr = false) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = isErr ? '#dc2626' : '#0f172a';
    t.classList.add('show');
    setTimeout(() => { t.classList.remove('show'); }, 2000);
  }

  // --- Live Database Master Indicator ---
  function updateDbStatusDisplay(ready) {
    const elBar = document.getElementById('dbStatusBar');
    const elStats = document.getElementById('dbDetailStats');
    if (!elBar) return;
    if (ready) {
      elBar.className = 'db-status-bar ready';
      elBar.style.background = '#ecfdf5';
      elBar.style.borderColor = '#a7f3d0';
      elBar.style.color = '#065f46';
      const itCnt = database.items ? Object.keys(database.items).length : 0;
      const rkCnt = database.racks ? database.racks.length : 0;
      elBar.innerHTML = `<span>✅ Database Master Aktif</span><span id="dbDetailStats" style="font-size:0.72rem;color:#047857;">${itCnt.toLocaleString()} Produk | ${rkCnt} Rak Resmi</span>`;
    } else {
      elBar.className = 'db-status-bar loading';
      elBar.style.background = '#fffbeb';
      elBar.style.borderColor = '#fde68a';
      elBar.style.color = '#92400e';
      elBar.innerHTML = `<span>⏳ Sedang Menyiapkan Database Master...</span>`;
    }
  }

  function applyDatabaseReady(data) {
    database = data;
    if (!database.barcodes) database.barcodes = {};
    if (!database.articles) database.articles = {};
    if (database.racks && database.racks.length > 0) {
      syncRacksFromDatabase();
    }
    updateLocationBadge();
    updateDbStatusDisplay(true);
    updateRackUI();
    renderUI();
  }

  // --- Load Master DB (Fast Poll & Bulletproof Fallback) ---
  function initDatabase() {
    if (window.PDT_DATABASE && window.PDT_DATABASE.items) {
      applyDatabaseReady(window.PDT_DATABASE);
      return;
    }

    updateDbStatusDisplay(false);

    // Poll every 150ms for window.PDT_DATABASE
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (window.PDT_DATABASE && window.PDT_DATABASE.items) {
        clearInterval(interval);
        applyDatabaseReady(window.PDT_DATABASE);
      } else if (attempts > 30) {
        clearInterval(interval);
        fetch('so_data.json')
          .then(res => res.json())
          .then(data => {
            applyDatabaseReady(data);
          })
          .catch(err => {
            showToast('Database so_data.js tidak termuat!', true);
            updateDbStatusDisplay(false);
          });
      }
    }, 150);
  }

  // Lookup location by code or abbreviation
  function findLocation(query) {
    if (!query || !database.lokasi) return null;
    const q = query.trim().toUpperCase();
    for (let i = 0; i < database.lokasi.length; i++) {
      const lok = database.lokasi[i];
      if (lok.c === q || (lok.s && lok.s.toUpperCase() === q)) {
        return lok;
      }
    }
    return null;
  }

  function searchLocations(query) {
    if (!query || !database.lokasi) return [];
    const q = query.trim().toUpperCase();
    const results = [];
    for (let i = 0; i < database.lokasi.length; i++) {
      const lok = database.lokasi[i];
      if (lok.c.includes(q) || lok.n.toUpperCase().includes(q) || (lok.s && lok.s.toUpperCase().includes(q))) {
        results.push(lok);
        if (results.length >= 8) break;
      }
    }
    return results;
  }

  function updateLocationBadge() {
    const lokObj = findLocation(state.lokasiToko);
    if (lokObj) {
      badgeLokToko.textContent = `🏬 ${lokObj.c} - ${lokObj.n} (${lokObj.s})`;
      badgeLokToko.className = 'lokasi-verified-badge';
    } else {
      badgeLokToko.textContent = `📍 Kode Toko/Gudang: ${state.lokasiToko || '-'}`;
      badgeLokToko.className = 'lokasi-verified-badge unknown';
    }
  }

  // --- Save / Load Session ---
  function saveSession() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tanggal: state.tanggal,
        lokasiToko: state.lokasiToko,
        userSo: state.userSo,
        kodeRak: state.kodeRak,
        deviceId: state.deviceId,
        docBatch: state.docBatch,
        items: state.items
      }));
    } catch (e) {}
  }

  function loadSession() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const obj = JSON.parse(saved);
        if (obj.tanggal) state.tanggal = obj.tanggal;
        if (obj.lokasiToko) state.lokasiToko = obj.lokasiToko;
        if (obj.userSo) state.userSo = obj.userSo;
        if (obj.kodeRak) state.kodeRak = obj.kodeRak;
        if (obj.deviceId) state.deviceId = obj.deviceId;
        if (obj.docBatch) state.docBatch = obj.docBatch;
        if (Array.isArray(obj.items)) state.items = obj.items;
      }
    } catch (e) {}

    // Default date to today if empty
    if (!state.tanggal) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      state.tanggal = `${yyyy}-${mm}-${dd}`;
    }

    loadRegisteredRacks();
    // Sanitize stale values from previous versions
    if (state.lokasiToko === '58015') {
      state.lokasiToko = '55022';
    }
    if (state.kodeRak === 'D001' || state.kodeRak === 'AA/001') {
      if (state.registeredRacks.length > 0 && !state.registeredRacks.includes(state.kodeRak)) {
        state.kodeRak = state.registeredRacks[0];
      }
    }
    if (!isRackValid(state.kodeRak) && state.registeredRacks.length > 0) {
      state.kodeRak = state.registeredRacks[0];
    }
    checkRackPeserta(state.kodeRak);

    elDate.value = state.tanggal;
    elLokToko.value = state.lokasiToko;
    elUserSo.value = state.userSo;
    elKodeRak.value = state.kodeRak;
    elDeviceId.value = state.deviceId;
    elDocBatch.value = state.docBatch;

    updateLocationBadge();
    updateRackUI();
    renderUI();
  }

  // --- Render UI ---
  function renderUI() {
    elTotalLines.textContent = state.items.length;
    updateRackUI();

    const sumQty = state.items.reduce((acc, it) => acc + (parseFloat(it.qty) || 0), 0);
    elTotalQty.textContent = sumQty.toFixed(2);

    // Banner Susulan Check
    const elBannerSusulan = document.getElementById('bannerSusulan');
    const elBannerText = document.getElementById('bannerSusulanText');
    if (elBannerSusulan) {
      const cntDl = state.items.filter(it => it.downloaded).length;
      const cntNew = state.items.filter(it => !it.downloaded).length;
      if (cntDl > 0 && cntNew > 0) {
        elBannerText.textContent = `${cntDl} item sudah diunduh, ${cntNew} item baru (rak susulan).`;
        elBannerSusulan.style.display = 'flex';
      } else {
        elBannerSusulan.style.display = 'none';
      }
    }

    if (state.items.length === 0) {
      elEmptyState.style.display = 'block';
      elItemList.innerHTML = '';
      return;
    }

    elEmptyState.style.display = 'none';
    let html = '';
    // Render in reverse order so latest scanned items appear on top
    for (let i = state.items.length - 1; i >= 0; i--) {
      const item = state.items[i];
      html += `
        <div class="item-card ${item.downloaded ? 'is-downloaded' : ''}" data-idx="${i}">
          <div class="item-card-left">
            <span class="item-badge-seq">#${item.seq}</span>
            <div class="item-info">
              <div class="item-title">${escapeHtml(item.name)}</div>
              <div class="item-sub">
                <span class="badge-rack-tag">📍 Rak: ${escapeHtml(item.rack)}</span>
                ${item.article ? `<span class="badge-art-tag">Art: ${escapeHtml(item.article)}</span>` : ''}
                <span>PLU: <strong>${escapeHtml(item.plu)}</strong></span>
                ${item.scannedCode && item.scannedCode !== item.plu ? `<span>🏷️ ${escapeHtml(item.scannedCode)}</span>` : ''}
                <span>⏱️ ${escapeHtml(item.time)}</span>
                ${item.downloaded ? '<span class="badge-dl-status downloaded">✅ Diunduh</span>' : '<span class="badge-dl-status new">✨ Baru</span>'}
              </div>
            </div>
          </div>
          <div class="item-card-right">
            <span class="item-qty-tag clickable" title="Klik untuk Ubah QTY" onclick="window.ITX_SO.editQty(${i})">
              ${parseFloat(item.qty).toFixed(2)}
            </span>
            <button class="btn-card-del" title="Hapus Baris" onclick="window.ITX_SO.deleteItem(${i})">✕</button>
          </div>
        </div>
      `;
    }
    elItemList.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- Real-time Live Item Preview as user types/scans ---
  function updateLiveItemPreview(code) {
    if (!elLiveCard) return null;
    const rawVal = (code || '').trim();
    if (!rawVal) {
      elLiveCard.className = 'live-item-card';
      elLiveIcon.textContent = '📦';
      elLiveName.textContent = 'Nama barang akan otomatis muncul di sini...';
      elLiveMeta.textContent = 'Ketik atau tembak barcode kemasan / PLU barang di atas';
      return null;
    }

    const found = lookupItem(rawVal);
    if (found) {
      elLiveCard.className = 'live-item-card found';
      elLiveIcon.textContent = '✅';
      elLiveName.textContent = found.name;
      const artTag = found.article ? ` | Art: ${found.article}` : '';
      if (found.fromBarcode && found.scannedCode) {
        elLiveMeta.textContent = `Barcode: ${found.scannedCode} ➔ PLU: ${found.plu}${artTag} (Terdaftar)`;
      } else {
        elLiveMeta.textContent = `PLU: ${found.plu}${artTag} (Terdaftar di master.dbf)`;
      }
      return found;
    } else if (rawVal.length >= 3) {
      elLiveCard.className = 'live-item-card not-found';
      elLiveIcon.textContent = '⚠️';
      elLiveName.textContent = `[Kode: ${rawVal}] Belum terdaftar di master.dbf / barcode.dbf`;
      elLiveMeta.textContent = 'Akan dicatat sebagai item manual jika ditambahkan';
      return null;
    } else {
      elLiveCard.className = 'live-item-card';
      elLiveIcon.textContent = '🔍';
      elLiveName.textContent = `Mencari kode '${rawVal}'...`;
      elLiveMeta.textContent = 'Lanjutkan mengetik nomor PLU, barcode, atau nama barang';
      return null;
    }
  }

  // --- Lookup Item (Barcode -> PLU -> Article / Kode Item -> Nama Barang) ---
  function lookupItem(code) {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();
    const noSpace = cleanCode.replace(/\s+/g, '');

    // 1. Check if scanned code is in database.barcodes
    if (database.barcodes) {
      const mappedPlu = database.barcodes[noSpace] || database.barcodes[cleanCode];
      if (mappedPlu) {
        const itemObj = database.items[mappedPlu] || database.items[mappedPlu.padStart(7, '0')] || null;
        const name = itemObj ? (itemObj.n || itemObj) : `[PLU: ${mappedPlu}]`;
        const article = itemObj ? (itemObj.a || '') : '';
        return {
          plu: mappedPlu,
          name: name,
          article: article,
          scannedCode: cleanCode,
          fromBarcode: true
        };
      }
    }

    // 2. Check if code is in database.articles (Article / Kode Item e.g. 68612 or ITTX-68612)
    if (database.articles) {
      const mappedPlu = database.articles[noSpace] || database.articles[cleanCode];
      if (mappedPlu && database.items && database.items[mappedPlu]) {
        const itemObj = database.items[mappedPlu];
        return {
          plu: mappedPlu,
          name: itemObj.n || itemObj,
          article: itemObj.a || cleanCode,
          scannedCode: cleanCode,
          fromBarcode: true
        };
      }
    }

    // 3. Check if code is directly a PLU in database.items
    if (database.items) {
      if (database.items[cleanCode]) {
        const itemObj = database.items[cleanCode];
        return {
          plu: cleanCode,
          name: itemObj.n || itemObj,
          article: itemObj.a || '',
          scannedCode: cleanCode,
          fromBarcode: false
        };
      }
      if (database.items[noSpace]) {
        const itemObj = database.items[noSpace];
        return {
          plu: noSpace,
          name: itemObj.n || itemObj,
          article: itemObj.a || '',
          scannedCode: cleanCode,
          fromBarcode: false
        };
      }

      // Check padded 7-digit PLU
      if (/^\d+$/.test(noSpace)) {
        const padded = noSpace.padStart(7, '0');
        if (database.items[padded]) {
          const itemObj = database.items[padded];
          return {
            plu: padded,
            name: itemObj.n || itemObj,
            article: itemObj.a || '',
            scannedCode: cleanCode,
            fromBarcode: false
          };
        }
        const unpadded = noSpace.replace(/^0+/, '');
        for (let k in database.items) {
          if (k.replace(/^0+/, '') === unpadded) {
            const itemObj = database.items[k];
            return {
              plu: k,
              name: itemObj.n || itemObj,
              article: itemObj.a || '',
              scannedCode: cleanCode,
              fromBarcode: false
            };
          }
        }
      }
    }

    return null;
  }

  // --- Add Item to Stock Opname Session ---
  function addItemToSession(plu, name, qty, scannedCode = '', article = '') {
    if (!isRackValid(state.kodeRak)) {
      playBeepError();
      showRackRejectedModal(state.kodeRak || '(Kosong)');
      return;
    }
    const nextSeq = state.items.length + 1;
    const nowTime = formatSoTimestamp(new Date());
    const rack = state.kodeRak.trim().toUpperCase() || 'D001';
    const finalQty = parseFloat(qty) || 1.0;

    state.items.push({
      seq: nextSeq,
      rack: rack,
      plu: plu,
      name: name,
      article: article || '',
      scannedCode: scannedCode || plu,
      qty: finalQty,
      time: nowTime
    });

    saveSession();
    renderUI();
    playBeepSuccess();
    showToast(`[+${finalQty} pcs] ${name.slice(0, 22)}...`);

    // Flash success on live card
    if (elLiveCard) {
      elLiveCard.className = 'live-item-card found';
      elLiveIcon.textContent = '✅';
      elLiveName.textContent = `Berhasil Masuk (+${finalQty}): ${name}`;
      const artTag = article ? ` | Art: ${article}` : '';
      elLiveMeta.textContent = `PLU: ${plu}${artTag} | Rak: ${rack} | Total: ${finalQty} pcs`;
    }

    // Reset input barcode
    elScanInput.value = '';
    elScanInput.focus();
  }

  // --- Handle Scan / Submit ---
  function handleScanInput() {
    const rawVal = elScanInput.value.trim();
    elSuggestBox.style.display = 'none';

    // 1. STRICT CHECK: Is the active rack valid & registered?
    if (!state.kodeRak || !isRackValid(state.kodeRak)) {
      playBeepError();
      showRackRejectedModal(state.kodeRak || '(Kosong)');
      showToast('Nomor rak tidak sah! Pilih rak terdaftar dahulu.', true);
      return;
    }

    if (!rawVal) {
      showToast('Ketik atau scan barcode / PLU terlebih dahulu!', true);
      elScanInput.focus();
      return;
    }

    const currentQty = parseFloat(elMainQty.value) || 1.0;
    const found = lookupItem(rawVal);

    if (found) {
      addItemToSession(found.plu, found.name, currentQty, found.scannedCode || rawVal, found.article || '');
    } else {
      playBeepError();
      showToast(`Barcode / PLU '${rawVal}' tidak ditemukan di database!`, true);
      addItemToSession(rawVal, `[ITEM MANUAL ${rawVal}]`, currentQty, rawVal, '');
    }

    // Reset QTY back to 1 for the next scan
    if (elMainQty) elMainQty.value = '1';
  }

  // --- Autocomplete search as user types & Live Item Preview ---
  elScanInput.addEventListener('input', function () {
    const rawVal = elScanInput.value;

    // Auto-detect newline from hardware barcode scanner (Honeywell EDA50 CR/LF suffix)
    if (rawVal.includes('\n') || rawVal.includes('\r')) {
      elScanInput.value = rawVal.replace(/[\r\n]+/g, '').trim();
      handleScanInput();
      return;
    }

    const q = rawVal.trim().toUpperCase();
    updateLiveItemPreview(q);

    if (q.length < 2) {
      elSuggestBox.style.display = 'none';
      return;
    }

    const matches = [];

    // Direct barcode match
    if (database.barcodes) {
      const cleanQ = q.replace(/\s+/g, '');
      const bPlu = database.barcodes[cleanQ] || database.barcodes[q];
      if (bPlu) {
        const itemObj = database.items[bPlu] || null;
        const bName = itemObj ? (itemObj.n || itemObj) : `PLU ${bPlu}`;
        const bArt = itemObj ? (itemObj.a || '') : '';
        matches.push({ plu: bPlu, name: bName, article: bArt, barcode: q, isBarcode: true });
      }
    }

    for (let plu in database.items) {
      const itemObj = database.items[plu];
      const name = itemObj.n || itemObj;
      const art = itemObj.a || '';
      if (plu.includes(q) || name.toUpperCase().includes(q) || art.toUpperCase().includes(q)) {
        if (!matches.some(m => m.plu === plu)) {
          matches.push({ plu, name, article: art });
        }
        if (matches.length >= 10) break;
      }
    }

    if (matches.length > 0) {
      let html = '';
      matches.forEach(m => {
        const bPrefix = m.isBarcode ? `🏷️ ${m.barcode} ➔ ` : '';
        const artBadge = m.article ? `<span class="suggest-art">${escapeHtml(m.article)}</span> ` : '';
        html += `
          <div class="suggest-item" data-plu="${m.plu}" data-name="${escapeHtml(m.name)}" data-art="${escapeHtml(m.article || '')}" data-barcode="${m.barcode || ''}">
            <span class="suggest-plu">${bPrefix}${m.plu}</span> ${artBadge}- <span class="suggest-name">${escapeHtml(m.name)}</span>
          </div>
        `;
      });
      elSuggestBox.innerHTML = html;
      elSuggestBox.style.display = 'block';
    } else {
      elSuggestBox.style.display = 'none';
    }
  });

  elSuggestBox.addEventListener('click', function (e) {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    const plu = item.getAttribute('data-plu');
    const name = item.getAttribute('data-name');
    const art = item.getAttribute('data-art') || '';
    const barcode = item.getAttribute('data-barcode') || '';
    elSuggestBox.style.display = 'none';

    const currentQty = parseFloat(elMainQty.value) || 1.0;
    elScanInput.value = plu;
    updateLiveItemPreview(plu);
    addItemToSession(plu, name, currentQty, barcode || plu, art);
  });

  // Enter key on scan input (Support Honeywell EDA50 Android key codes: 13, 66, and 'Done')
  elScanInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13 || e.keyCode === 66 || e.key === 'Done') {
      e.preventDefault();
      handleScanInput();
    }
  });

  // Global scanner redirect: if laser is pressed while focus was lost on white space, refocus scan input
  document.addEventListener('keydown', function (e) {
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    if (!isInput && e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      elScanInput.focus();
    }
  });

  // Enter key on QTY input switches focus to scan input
  elMainQty.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      elScanInput.focus();
      elScanInput.select();
    }
  });

  // Submit button
  elBtnManualSubmit.addEventListener('click', handleScanInput);

  // Quick QTY buttons (+ and -)
  elBtnQtyTouchMinus.addEventListener('click', function () {
    let q = parseFloat(elMainQty.value) || 1;
    if (q > 1) elMainQty.value = q - 1;
  });

  elBtnQtyTouchPlus.addEventListener('click', function () {
    let q = parseFloat(elMainQty.value) || 0;
    elMainQty.value = q + 1;
  });

  // Quick QTY chips
  document.querySelectorAll('.qty-chip').forEach(chip => {
    chip.addEventListener('click', function () {
      const q = this.getAttribute('data-qty');
      elMainQty.value = q;
      showToast(`QTY diset ke: ${q}`);
      elScanInput.focus();
    });
  });

  // --- Change Kode Rak / Area SO (Strict Rejection Rule) ---
  elKodeRak.addEventListener('change', function () {
    const val = elKodeRak.value.trim().toUpperCase();
    if (!isRackValid(val)) {
      playBeepError();
      showRackRejectedModal(val);
      elKodeRak.value = state.kodeRak;
      updateRackUI();
      return;
    }
    state.kodeRak = val;
    saveSession();
    updateRackUI();
    renderUI();
    showToast(`Rak aktif diubah ke: ${state.kodeRak}`);
  });

  // --- Modal Pilih / Ganti Rak Cepat (Registered Only) ---
  const modalSelectRack = document.getElementById('modalSelectRack');
  const btnCloseSelectRack = document.getElementById('btnCloseSelectRack');
  const inputFilterRack = document.getElementById('inputFilterRack');
  const btnConfirmCustomRack = document.getElementById('btnConfirmCustomRack');
  const rackSelectContainer = document.getElementById('rackSelectContainer');

  function openSelectRackModal() {
    renderSelectRackList('');
    if (inputFilterRack) inputFilterRack.value = '';
    if (modalSelectRack) modalSelectRack.classList.add('active');
    setTimeout(() => { if (inputFilterRack) inputFilterRack.focus(); }, 150);
  }

  function renderSelectRackList(filterText = '') {
    if (!rackSelectContainer) return;
    const q = (filterText || '').trim().toUpperCase();
    const filtered = state.registeredRacks.filter(r => !q || r.includes(q));

    if (filtered.length === 0) {
      rackSelectContainer.innerHTML = `<div style="padding: 10px; color: #94a3b8; font-size: 0.85rem; width: 100%; text-align: center;">Tidak ada nomor rak terdaftar yang cocok dengan '${filterText}'</div>`;
      return;
    }

    rackSelectContainer.innerHTML = filtered.map(r => {
      const info = getRackInfo(r);
      const sub = (info && info.p) ? `<small style="display:block;font-size:0.68rem;color:#0369a1;font-weight:700;">${info.p}</small>` : '';
      return `
        <button type="button" class="rack-select-item ${r === state.kodeRak ? 'selected' : ''}" data-rack="${r}" style="text-align:center;">
          ${r}
          ${sub}
        </button>
      `;
    }).join('');

    rackSelectContainer.querySelectorAll('.rack-select-item').forEach(btn => {
      btn.addEventListener('click', function () {
        const selected = this.getAttribute('data-rack');
        selectActiveRack(selected);
      });
    });
  }

  function selectActiveRack(rack) {
    if (!isRackValid(rack)) {
      playBeepError();
      showRackRejectedModal(rack);
      return;
    }
    state.kodeRak = rack;
    if (elKodeRak) elKodeRak.value = rack;
    checkRackPeserta(rack);
    saveSession();
    updateRackUI();
    renderUI();
    const info = getRackInfo(rack);
    if (info && info.p) {
      showToast(`Rak: ${state.kodeRak} (Peserta: ${info.p})`);
    } else {
      showToast(`Rak aktif: ${state.kodeRak}`);
    }
    if (modalSelectRack) modalSelectRack.classList.remove('active');
    if (elScanInput) elScanInput.focus();
  }

  const elBtnNewRack = document.getElementById('btnNewRack');
  if (elBtnNewRack) elBtnNewRack.addEventListener('click', openSelectRackModal);
  if (btnCloseSelectRack) btnCloseSelectRack.addEventListener('click', () => modalSelectRack.classList.remove('active'));

  if (inputFilterRack) {
    inputFilterRack.addEventListener('input', () => {
      renderSelectRackList(inputFilterRack.value);
    });
    inputFilterRack.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = inputFilterRack.value.trim().toUpperCase();
        selectActiveRack(val);
      }
    });
  }

  if (btnConfirmCustomRack) {
    btnConfirmCustomRack.addEventListener('click', () => {
      const val = inputFilterRack.value.trim().toUpperCase();
      selectActiveRack(val);
    });
  }

  // --- Modal Kelola & Daftarkan Rak SO ---
  const modalManageRacks = document.getElementById('modalManageRacks');
  const btnOpenManageRacks = document.getElementById('btnOpenManageRacks');
  const btnCloseManageRacks = document.getElementById('btnCloseManageRacks');
  const btnSaveManageRacks = document.getElementById('btnSaveManageRacks');

  const genRackPrefix = document.getElementById('genRackPrefix');
  const genRackStart = document.getElementById('genRackStart');
  const genRackEnd = document.getElementById('genRackEnd');
  const genRackDigits = document.getElementById('genRackDigits');
  const btnGenerateRange = document.getElementById('btnGenerateRange');

  const txtManualRacks = document.getElementById('txtManualRacks');
  const btnAddManualRacks = document.getElementById('btnAddManualRacks');
  const cloudRegisteredRacks = document.getElementById('cloudRegisteredRacks');
  const countRegisteredRacks = document.getElementById('countRegisteredRacks');
  const btnClearAllRacks = document.getElementById('btnClearAllRacks');

  function openManageRacksModal() {
    renderRegisteredRacksCloud();
    if (modalManageRacks) modalManageRacks.classList.add('active');
  }

  function renderRegisteredRacksCloud() {
    if (countRegisteredRacks) countRegisteredRacks.textContent = state.registeredRacks.length;
    if (!cloudRegisteredRacks) return;

    if (state.registeredRacks.length === 0) {
      cloudRegisteredRacks.innerHTML = '<div style="padding: 12px; color: #dc2626; font-size: 0.85rem; width: 100%; text-align: center; font-weight: 700;">⚠️ Belum ada rak yang didaftarkan! Masukkan rentang rak di atas.</div>';
      return;
    }

    cloudRegisteredRacks.innerHTML = state.registeredRacks.map(r => `
      <span class="rack-tag">
        ${r}
        <span class="rack-tag-del" data-rack="${r}" title="Hapus rak ini">×</span>
      </span>
    `).join('');

    cloudRegisteredRacks.querySelectorAll('.rack-tag-del').forEach(delBtn => {
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const rToDel = this.getAttribute('data-rack');
        state.registeredRacks = state.registeredRacks.filter(r => r !== rToDel);
        saveRegisteredRacks();
        renderRegisteredRacksCloud();
        updateRackUI();
      });
    });
  }

  if (btnOpenManageRacks) btnOpenManageRacks.addEventListener('click', openManageRacksModal);
  if (btnCloseManageRacks) btnCloseManageRacks.addEventListener('click', () => modalManageRacks.classList.remove('active'));
  if (btnSaveManageRacks) {
    btnSaveManageRacks.addEventListener('click', () => {
      modalManageRacks.classList.remove('active');
      updateRackUI();
      showToast(`Daftar ${state.registeredRacks.length} rak berhasil diterapkan!`);
    });
  }

  // Generate Range handler (e.g. AA/001 - AA/100)
  if (btnGenerateRange) {
    btnGenerateRange.addEventListener('click', function () {
      const prefix = (genRackPrefix.value || 'AA/').trim().toUpperCase();
      const start = parseInt(genRackStart.value) || 1;
      const end = parseInt(genRackEnd.value) || 100;
      const digits = parseInt(genRackDigits.value) || 3;

      if (start > end) {
        alert('Nomor mulai tidak boleh lebih besar dari nomor selesai!');
        return;
      }
      if (end - start > 5000) {
        alert('Maksimal rentang sekaligus adalah 5.000 nomor rak!');
        return;
      }

      let addedCount = 0;
      for (let i = start; i <= end; i++) {
        const code = prefix + String(i).padStart(digits, '0');
        if (!state.registeredRacks.includes(code)) {
          state.registeredRacks.push(code);
          addedCount++;
        }
      }

      state.registeredRacks.sort();
      saveRegisteredRacks();
      renderRegisteredRacksCloud();
      updateRackUI();
      showToast(`Berhasil menambahkan ${addedCount} nomor rak ke master!`);
    });
  }

  // Manual Add handler
  if (btnAddManualRacks) {
    btnAddManualRacks.addEventListener('click', function () {
      const raw = (txtManualRacks.value || '').trim();
      if (!raw) return;
      const parts = raw.split(/[\r\n,;\t]+/);
      let addedCount = 0;
      parts.forEach(p => {
        const clean = p.trim().toUpperCase();
        if (clean && !state.registeredRacks.includes(clean)) {
          state.registeredRacks.push(clean);
          addedCount++;
        }
      });
      txtManualRacks.value = '';
      state.registeredRacks.sort();
      saveRegisteredRacks();
      renderRegisteredRacksCloud();
      updateRackUI();
      showToast(`Berhasil menambahkan ${addedCount} nomor rak ke master!`);
    });
  }

  // Clear all racks
  if (btnClearAllRacks) {
    btnClearAllRacks.addEventListener('click', function () {
      if (confirm('Yakin ingin menghapus seluruh daftar nomor rak resmi?')) {
        state.registeredRacks = [];
        saveRegisteredRacks();
        renderRegisteredRacksCloud();
        updateRackUI();
        showToast('Seluruh daftar rak telah dikosongkan.');
      }
    });
  }

  // Header inputs change listeners
  elDate.addEventListener('change', () => { state.tanggal = elDate.value; saveSession(); });
  elUserSo.addEventListener('input', () => { state.userSo = elUserSo.value.trim(); saveSession(); });
  elDeviceId.addEventListener('input', () => { state.deviceId = elDeviceId.value.trim(); saveSession(); });
  elDocBatch.addEventListener('input', () => { state.docBatch = elDocBatch.value.trim(); saveSession(); });

  // Autocomplete Lokasi Toko
  elLokToko.addEventListener('input', function () {
    const q = elLokToko.value.trim().toUpperCase();
    state.lokasiToko = q;
    saveSession();
    updateLocationBadge();

    if (q.length >= 1) {
      const matches = searchLocations(q);
      if (matches.length > 0) {
        let html = '';
        matches.forEach(m => {
          html += `
            <div class="suggest-item" data-code="${m.c}">
              <span class="suggest-plu">${m.c}</span> - <span class="suggest-name">${escapeHtml(m.n)} (${escapeHtml(m.s)})</span>
            </div>
          `;
        });
        suggestLokToko.innerHTML = html;
        suggestLokToko.style.display = 'block';
      } else {
        suggestLokToko.style.display = 'none';
      }
    } else {
      suggestLokToko.style.display = 'none';
    }
  });

  suggestLokToko.addEventListener('click', function (e) {
    const it = e.target.closest('.suggest-item');
    if (!it) return;
    const code = it.getAttribute('data-code');
    elLokToko.value = code;
    state.lokasiToko = code;
    saveSession();
    updateLocationBadge();
    suggestLokToko.style.display = 'none';
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#suggestLokToko') && e.target !== elLokToko) {
      suggestLokToko.style.display = 'none';
    }
    if (!e.target.closest('#suggestBox') && e.target !== elScanInput) {
      elSuggestBox.style.display = 'none';
    }
  });

  // Header Card Toggle
  const toggleHeaderBtn = document.getElementById('btnToggleHeader');
  const headerBody = document.getElementById('headerCardBody');
  const headerToggleIcon = document.getElementById('headerToggleIcon');
  if (toggleHeaderBtn) {
    toggleHeaderBtn.addEventListener('click', function () {
      if (headerBody.style.display === 'none') {
        headerBody.style.display = 'block';
        headerToggleIcon.textContent = '▼ Sembunyikan';
      } else {
        headerBody.style.display = 'none';
        headerToggleIcon.textContent = '▲ Tampilkan';
      }
    });
  }

  // --- Strict Stock Opname TXT Generator (11 Columns Fixed-Width) ---
  // Format: 20170617  |58015|SUKRON              |D001  |    |8902915200068|200068         |5532857|55.00| |6/17/17 9:01:10 PM
  function generateSoTxt(itemsToExport = state.items) {
    const tgl8 = formatYYYYMMDD(state.tanggal);
    const col0 = tgl8.padEnd(10, ' ');
    const col1 = (state.lokasiToko || '58015').slice(0, 5).padEnd(5, ' ');
    const col2 = (state.userSo || 'USER').toUpperCase().slice(0, 20).padEnd(20, ' ');
    const col4 = '    '; // 4 spaces
    const col9 = ' ';    // 1 space

    let lines = [];
    itemsToExport.forEach(it => {
      const col3 = (it.rack || state.kodeRak || 'D001').toUpperCase().slice(0, 6).padEnd(6, ' ');
      const col5 = (it.scannedCode || it.plu || '').slice(0, 13).padEnd(13, ' ');
      const col6 = (it.article || '').slice(0, 15).padEnd(15, ' ');
      const col7 = (it.plu || '').slice(0, 7).padEnd(7, ' ');
      const col8 = (parseFloat(it.qty) || 0).toFixed(2);
      const col10 = it.time;

      const row = `${col0}|${col1}|${col2}|${col3}|${col4}|${col5}|${col6}|${col7}|${col8}|${col9}|${col10}`;
      lines.push(row);
    });

    return lines.join('\r\n') + (lines.length > 0 ? '\r\n' : '');
  }

  // Generate Filename: dc_[dev]_op_[toko]_[YYMMDD]_[batch].txt
  function getSoFilename(isSusulan = false) {
    const dev = (state.deviceId || '1').trim();
    const toko = (state.lokasiToko || '58015').trim();
    const yymmdd = formatYYMMDD(state.tanggal);
    const batch = (state.docBatch || '12814').trim();

    let fn = `dc_${dev}_op_${toko}_${yymmdd}_${batch}.txt`;
    if (isSusulan) {
      fn = `dc_${dev}_op_${toko}_${yymmdd}_${batch}_SUSULAN.txt`;
    }
    return fn;
  }

  // --- Blob Download Trigger ---
  function triggerBlobDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Copy Preview
  function copyTxtToClipboard() {
    if (state.items.length === 0) {
      alert('Belum ada item opname yang di-scan!');
      return;
    }
    const content = generateSoTxt();
    navigator.clipboard.writeText(content)
      .then(() => showToast('Isi file SO berhasil disalin ke clipboard!'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Isi file SO berhasil disalin!');
      });
  }

  document.getElementById('btnPreviewTxt').addEventListener('click', function () {
    const content = generateSoTxt();
    elTxtPreview.textContent = content || '(Belum ada data opname)';
    document.getElementById('previewFilenameDisplay').textContent = getSoFilename();
    elModalPreview.classList.add('active');
  });

  document.getElementById('btnClosePreview').addEventListener('click', function () {
    elModalPreview.classList.remove('active');
  });

  document.getElementById('btnCopyPreview').addEventListener('click', copyTxtToClipboard);

  // --- Reset Session ---
  document.getElementById('btnResetSession').addEventListener('click', function () {
    if (state.items.length === 0) {
      showToast('Sesi opname sudah kosong.');
      return;
    }
    if (confirm('Yakin ingin mereset/menghapus seluruh hasil scan opname sesi ini? (Data yang sudah didownload tetap aman di arsip)')) {
      state.items = [];
      saveSession();
      renderUI();
      showToast('Sesi opname berhasil direset.');
      elScanInput.focus();
    }
  });

  // --- ARCHIVE & SMART DOWNLOAD SYSTEM FOR STOCK OPNAME ---
  function getArchives() {
    try {
      const data = localStorage.getItem(ARCHIVE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveArchives(list) {
    try {
      const trimmed = list.slice(0, 50);
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(trimmed));
    } catch (e) {}
  }

  function addSessionToArchive(filename, items, isSusulan = false) {
    const list = getArchives();
    const now = new Date();
    const dateFormatted = formatSoTimestamp(now);
    const uniqueRacks = Array.from(new Set(items.map(it => it.rack)));
    const sumQty = items.reduce((acc, it) => acc + (parseFloat(it.qty) || 0), 0);

    const record = {
      id: 'SO_' + Date.now(),
      filename: filename,
      savedAt: dateFormatted,
      tanggal: state.tanggal,
      lokasiToko: state.lokasiToko,
      userSo: state.userSo,
      deviceId: state.deviceId,
      docBatch: state.docBatch,
      isSusulan: isSusulan,
      totalLines: items.length,
      totalQty: sumQty.toFixed(2),
      racks: uniqueRacks,
      items: JSON.parse(JSON.stringify(items))
    };

    list.unshift(record);
    saveArchives(list);
  }

  // Render Archive List
  const elModalArchive = document.getElementById('modalArchive');
  const elArchiveContainer = document.getElementById('archiveListContainer');
  const elEmptyArchive = document.getElementById('emptyArchiveState');
  const elSearchArchive = document.getElementById('inputSearchArchive');

  function renderArchiveList(filterText = '') {
    const list = getArchives();
    const q = (filterText || '').trim().toUpperCase();

    const filtered = list.filter(item => {
      if (!q) return true;
      const fn = (item.filename || '').toUpperCase();
      const toko = (item.lokasiToko || '').toUpperCase();
      const user = (item.userSo || '').toUpperCase();
      const racks = (item.racks || []).join(' ').toUpperCase();
      return fn.includes(q) || toko.includes(q) || user.includes(q) || racks.includes(q);
    });

    if (filtered.length === 0) {
      elEmptyArchive.style.display = 'block';
      elArchiveContainer.innerHTML = '';
      return;
    }

    elEmptyArchive.style.display = 'none';
    let html = '';
    filtered.forEach((arc) => {
      const susulanBadge = arc.isSusulan ? '<span class="badge-dl-status new">SUSULAN</span>' : '';
      html += `
        <div class="archive-card">
          <div class="archive-card-header">
            <div>
              <div class="archive-filename">${escapeHtml(arc.filename)} ${susulanBadge}</div>
              <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">
                Toko: <strong>${escapeHtml(arc.lokasiToko)}</strong> | Pelaksana: <strong>${escapeHtml(arc.userSo)}</strong>
              </div>
            </div>
            <span class="archive-date">⏱️ ${escapeHtml(arc.savedAt)}</span>
          </div>

          <div style="font-size: 0.82rem; color: #334155; margin: 4px 0 10px 0; line-height: 1.4;">
            📊 <strong>${arc.totalLines} baris</strong> | Total Qty: <strong>${arc.totalQty} pcs</strong> | Rak: <code>${(arc.racks || []).join(', ')}</code>
          </div>

          <div class="archive-actions">
            <button type="button" class="btn-archive-dl" onclick="window.ITX_SO.downloadArchive('${arc.id}')">
              💾 Download File TXT
            </button>
            <button type="button" class="btn-archive-restore" onclick="window.ITX_SO.restoreArchive('${arc.id}')">
              🔄 Buka Kembali Sesi Ini
            </button>
            <button type="button" class="btn-archive-del" title="Hapus dari Arsip" onclick="window.ITX_SO.deleteArchive('${arc.id}')">
              ✕
            </button>
          </div>
        </div>
      `;
    });

    elArchiveContainer.innerHTML = html;
  }

  // Archive Listeners
  const btnOpenArchive = document.getElementById('btnOpenArchive');
  if (btnOpenArchive) {
    btnOpenArchive.addEventListener('click', function () {
      renderArchiveList();
      elModalArchive.classList.add('active');
    });
  }

  const btnCloseArchive = document.getElementById('btnCloseArchive');
  const btnCloseArchiveBottom = document.getElementById('btnCloseArchiveBottom');
  if (btnCloseArchive) btnCloseArchive.addEventListener('click', () => elModalArchive.classList.remove('active'));
  if (btnCloseArchiveBottom) btnCloseArchiveBottom.addEventListener('click', () => elModalArchive.classList.remove('active'));

  if (elSearchArchive) {
    elSearchArchive.addEventListener('input', () => renderArchiveList(elSearchArchive.value));
  }

  const btnClearAllArchives = document.getElementById('btnClearAllArchives');
  if (btnClearAllArchives) {
    btnClearAllArchives.addEventListener('click', function () {
      if (confirm('Yakin ingin menghapus SELURUH riwayat arsip dokumen Stock Opname lama?')) {
        localStorage.removeItem(ARCHIVE_KEY);
        renderArchiveList();
        showToast('Seluruh arsip SO berhasil dibersihkan.');
      }
    });
  }

  // --- Smart Download Logic with Double-Upload Prevention ---
  const elModalSmartDl = document.getElementById('modalSmartDownload');
  const elBtnCloseSmartDl = document.getElementById('btnCloseSmartDl');
  const elBtnDlOnlyNew = document.getElementById('btnDlOnlyNew');
  const elBtnDlAllMerged = document.getElementById('btnDlAllMerged');
  const elCntDownloaded = document.getElementById('cntDownloaded');
  const elCntNew = document.getElementById('cntNew');
  const elBtnNewCnt = document.getElementById('btnNewCnt');
  const elBtnAllCnt = document.getElementById('btnAllCnt');

  const elModalPostDl = document.getElementById('modalPostDownload');
  const elBtnClosePostDl = document.getElementById('btnClosePostDl');
  const elPostDlFilename = document.getElementById('postDlFilename');
  const elBtnArchiveAndClear = document.getElementById('btnArchiveAndClear');
  const elBtnKeepSession = document.getElementById('btnKeepSession');

  if (elBtnCloseSmartDl) elBtnCloseSmartDl.addEventListener('click', () => elModalSmartDl.classList.remove('active'));
  if (elBtnClosePostDl) elBtnClosePostDl.addEventListener('click', () => elModalPostDl.classList.remove('active'));
  if (elBtnKeepSession) elBtnKeepSession.addEventListener('click', () => elModalPostDl.classList.remove('active'));

  if (elBtnArchiveAndClear) {
    elBtnArchiveAndClear.addEventListener('click', function () {
      elModalPostDl.classList.remove('active');
      state.items = [];
      saveSession();
      renderUI();
      showToast('Sesi diarsipkan. Layar bersih siap scan opname baru!');
      elScanInput.focus();
    });
  }

  function executeDownload(itemsToDownload, isSusulan = false) {
    if (!itemsToDownload || itemsToDownload.length === 0) return;

    const content = generateSoTxt(itemsToDownload);
    const filename = getSoFilename(isSusulan);

    triggerBlobDownload(content, filename);

    // Mark these items as downloaded
    itemsToDownload.forEach(it => { it.downloaded = true; });
    saveSession();
    renderUI();

    // Add to archive
    addSessionToArchive(filename, itemsToDownload, isSusulan);

    // Show Post Download Modal
    if (elPostDlFilename) elPostDlFilename.textContent = filename;
    if (elModalPostDl) elModalPostDl.classList.add('active');

    showToast(`File ${filename} berhasil diunduh!`);
  }

  function handleDownloadClick() {
    if (state.items.length === 0) {
      alert('Belum ada item opname yang di-scan!');
      return;
    }

    const downloadedItems = state.items.filter(it => it.downloaded);
    const newItems = state.items.filter(it => !it.downloaded);

    // CASE 1: All items are new (First download)
    if (downloadedItems.length === 0) {
      executeDownload(state.items, false);
      return;
    }

    // CASE 2: There are both downloaded items and new items (RAK SUSULAN)
    if (newItems.length > 0 && downloadedItems.length > 0) {
      elCntDownloaded.textContent = downloadedItems.length;
      elCntNew.textContent = newItems.length;
      elBtnNewCnt.textContent = newItems.length;
      elBtnAllCnt.textContent = state.items.length;
      elModalSmartDl.classList.add('active');
      return;
    }

    // CASE 3: All items have already been downloaded
    if (confirm(`Seluruh ${state.items.length} barang opname pada sesi ini sudah pernah diunduh sebelumnya.\n\nApakah Anda ingin mengunduh ulang salinan filenya?`)) {
      executeDownload(state.items, false);
    }
  }

  if (elBtnDlOnlyNew) {
    elBtnDlOnlyNew.addEventListener('click', function () {
      elModalSmartDl.classList.remove('active');
      const newItems = state.items.filter(it => !it.downloaded);
      executeDownload(newItems, true);
    });
  }

  if (elBtnDlAllMerged) {
    elBtnDlAllMerged.addEventListener('click', function () {
      elModalSmartDl.classList.remove('active');
      executeDownload(state.items, false);
    });
  }

  const btnDownloadTxt = document.getElementById('btnDownloadTxt');
  if (btnDownloadTxt) btnDownloadTxt.addEventListener('click', handleDownloadClick);

  const btnDownloadFromPreview = document.getElementById('btnDownloadFromPreview');
  if (btnDownloadFromPreview) btnDownloadFromPreview.addEventListener('click', handleDownloadClick);

  // --- Camera Scanner ---
  const btnOpenCam = document.getElementById('btnOpenCam');
  if (btnOpenCam) {
    btnOpenCam.addEventListener('click', function () {
      if (elModalCam) elModalCam.style.display = 'block';
      startCameraScanner();
    });
  }

  const btnCloseCam = document.getElementById('btnCloseCam');
  if (btnCloseCam) {
    btnCloseCam.addEventListener('click', function () {
      stopCameraScanner();
      if (elModalCam) elModalCam.style.display = 'none';
    });
  }

  const btnCloseCamPerm = document.getElementById('btnCloseCamPerm');
  if (btnCloseCamPerm && elModalCamPerm) {
    btnCloseCamPerm.addEventListener('click', () => elModalCamPerm.classList.remove('active'));
  }

  const btnTriggerSnap = document.getElementById('btnTriggerSnap');
  function triggerNativeCameraCapture() {
    if (elCamFileInput) elCamFileInput.click();
  }

  if (btnTriggerSnap) btnTriggerSnap.addEventListener('click', triggerNativeCameraCapture);

  if (elCamFileInput) {
    elCamFileInput.addEventListener('change', function (e) {
      if (!e.target.files || !e.target.files.length) return;
      const file = e.target.files[0];
      showToast('Memindai foto barcode...');

      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode('reader');
      }

      html5QrCode.scanFile(file, true)
        .then(decodedText => {
          stopCameraScanner();
          if (elModalCam) elModalCam.style.display = 'none';
          if (elModalCamPerm) elModalCamPerm.classList.remove('active');
          elScanInput.value = decodedText;
          updateLiveItemPreview(decodedText);
          handleScanInput();
        })
        .catch(err => {
          playBeepError();
          alert('Barcode tidak terbaca dari foto. Coba arahkan lebih jelas / lebih dekat.');
        });
    });
  }

  function startCameraScanner() {
    if (!window.Html5Qrcode) {
      alert('Modul kamera scanner belum dimuat.');
      return;
    }
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode('reader');
    }

    const config = {
      fps: 15,
      qrbox: { width: 260, height: 160 },
      aspectRatio: 1.0
    };

    html5QrCode.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        playBeepSuccess();
        stopCameraScanner();
        if (elModalCam) elModalCam.style.display = 'none';
        if (elModalCamPerm) elModalCamPerm.classList.remove('active');
        elScanInput.value = decodedText;
        updateLiveItemPreview(decodedText);
        handleScanInput();
      },
      () => {}
    ).catch(err => {
      console.warn('Camera stream blocked:', err);
      if (elModalCamPerm) elModalCamPerm.classList.add('active');
    });
  }

  function stopCameraScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
      html5QrCode.stop().catch(() => {});
    }
  }

  // --- Window Global Helpers for ITX_SO ---
  window.ITX_SO = {
    editQty: function (idx) {
      const item = state.items[idx];
      if (!item) return;
      const cur = parseFloat(item.qty) || 1.0;
      const newQtyStr = prompt(`Ubah QTY untuk ${item.name} (PLU: ${item.plu}):`, cur);
      if (newQtyStr !== null) {
        const val = parseFloat(newQtyStr);
        if (!isNaN(val) && val > 0) {
          item.qty = val;
          saveSession();
          renderUI();
          showToast(`QTY diperbarui ke: ${val}`);
        } else {
          alert('Input QTY tidak valid!');
        }
      }
    },
    deleteItem: function (idx) {
      const item = state.items[idx];
      if (!item) return;
      if (confirm(`Hapus baris #${item.seq} (${item.name}) dari daftar opname?`)) {
        state.items.splice(idx, 1);
        // Recalculate sequence numbers
        state.items.forEach((it, i) => { it.seq = i + 1; });
        saveSession();
        renderUI();
        showToast('Baris berhasil dihapus.');
      }
    },
    downloadArchive: function (arcId) {
      const list = getArchives();
      const target = list.find(a => a.id === arcId);
      if (!target) return;

      const tgl8 = formatYYYYMMDD(target.tanggal);
      const col0 = tgl8.padEnd(10, ' ');
      const col1 = (target.lokasiToko || '58015').slice(0, 5).padEnd(5, ' ');
      const col2 = (target.userSo || 'USER').toUpperCase().slice(0, 20).padEnd(20, ' ');
      const col4 = '    ';
      const col9 = ' ';

      let lines = [];
      target.items.forEach(it => {
        const col3 = (it.rack || target.kodeRak || 'D001').toUpperCase().slice(0, 6).padEnd(6, ' ');
        const col5 = (it.scannedCode || it.plu || '').slice(0, 13).padEnd(13, ' ');
        const col6 = (it.article || '').slice(0, 15).padEnd(15, ' ');
        const col7 = (it.plu || '').slice(0, 7).padEnd(7, ' ');
        const col8 = (parseFloat(it.qty) || 0).toFixed(2);
        const col10 = it.time;

        const row = `${col0}|${col1}|${col2}|${col3}|${col4}|${col5}|${col6}|${col7}|${col8}|${col9}|${col10}`;
        lines.push(row);
      });

      const content = lines.join('\r\n') + '\r\n';
      triggerBlobDownload(content, target.filename);
      showToast(`Arsip ${target.filename} berhasil diunduh ulang!`);
    },
    restoreArchive: function (arcId) {
      const list = getArchives();
      const target = list.find(a => a.id === arcId);
      if (!target) return;

      if (state.items.length > 0) {
        if (!confirm('Layar opname saat ini masih berisi data. Menimpa layar dengan sesi arsip ini?')) return;
      }

      state.tanggal = target.tanggal;
      state.lokasiToko = target.lokasiToko;
      state.userSo = target.userSo;
      state.deviceId = target.deviceId || '1';
      state.docBatch = target.docBatch || '12814';
      state.kodeRak = (target.racks && target.racks.length) ? target.racks[target.racks.length - 1] : 'D001';
      state.items = JSON.parse(JSON.stringify(target.items));

      saveSession();
      loadSession();
      renderUI();
      elModalArchive.classList.remove('active');
      showToast(`Sesi opname ${target.filename} berhasil dibuka kembali!`);
    },
    deleteArchive: function (arcId) {
      if (confirm('Hapus dokumen ini dari riwayat arsip Stock Opname?')) {
        let list = getArchives();
        list = list.filter(a => a.id !== arcId);
        saveArchives(list);
        renderArchiveList();
        showToast('Arsip SO dihapus.');
      }
    }
  };

  // --- Startup ---
  window.addEventListener('DOMContentLoaded', () => {
    initDatabase();
    loadSession();
    setTimeout(() => { elScanInput.focus(); }, 300);
  });

})();
