const ScanPage = (() => {
  let currentImageB64 = null;
  let currentMimeType = null;
  let scanResult     = null;
  let selectedCondition = null;
  let estimatedValue = null;

  const CONDITIONS = [
    { label: 'Factory Sealed', icon: '📦', condition: 'Factory Sealed', has_box: 1, has_manual: 1 },
    { label: 'Complete in Box',  icon: '✅', condition: 'Working',        has_box: 1, has_manual: 1 },
    { label: 'Loose / No Box',   icon: '🎮', condition: 'Working',        has_box: 0, has_manual: 0 },
    { label: 'Poor Condition',   icon: '⚠️', condition: 'Poor',           has_box: 0, has_manual: 0 },
  ];

  function showStep(id) {
    document.querySelectorAll('.scan-step').forEach(el => el.style.display = 'none');
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  }

  function reset() {
    currentImageB64 = null;
    currentMimeType = null;
    scanResult = null;
    selectedCondition = null;
    estimatedValue = null;
    document.getElementById('scanPreview').style.display = 'none';
    document.getElementById('scanDropZone').style.display = '';
    document.getElementById('scanIdentifyBtn').disabled = true;
    document.getElementById('scanValueResult').style.display = 'none';
    document.getElementById('scanValueResult').innerHTML = '';
    document.getElementById('scanPricePaid').value = '';
    showStep('scan-step-capture');
  }

  function setImage(file) {
    if (!file || !file.type.startsWith('image/')) { toast('Please select an image file', 'error'); return; }
    currentMimeType = file.type;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      // Strip the data:image/xxx;base64, prefix — Anthropic wants raw base64
      currentImageB64 = dataUrl.split(',')[1];
      document.getElementById('scanPreviewImg').src = dataUrl;
      document.getElementById('scanPreview').style.display = '';
      document.getElementById('scanDropZone').style.display = 'none';
      document.getElementById('scanIdentifyBtn').disabled = false;
    };
    reader.readAsDataURL(file);
  }

  async function identify() {
    if (!currentImageB64) return;
    showStep('scan-step-identifying');
    try {
      const result = await API.scanGame(currentImageB64, currentMimeType);
      scanResult = result;
      populateConfirmStep(result);
      showStep('scan-step-confirm');
    } catch (e) {
      showStep('scan-step-capture');
      toast('Identification failed: ' + e.message, 'error');
    }
  }

  function populateConfirmStep(r) {
    // Confidence badge
    const conf = document.getElementById('scanConfidence');
    const colours = { high: 'var(--green)', medium: 'var(--accent)', low: 'var(--red)' };
    const labels  = { high: '✓ High confidence', medium: '~ Medium confidence', low: '? Low confidence — please verify' };
    conf.innerHTML = `<span class="scan-confidence-badge" style="background:${colours[r.confidence] || colours.medium}">${labels[r.confidence] || r.confidence}</span>`;

    // Fill fields
    document.getElementById('scanTitle').value   = r.title || '';
    document.getElementById('scanEdition').value = r.edition || '';

    // Region
    const regSel = document.getElementById('scanRegion');
    if (r.region) {
      regSel.value = r.region;
      if (!regSel.value) regSel.value = ''; // fallback to blank if not matched
    }

    // Platform — copy options from the game modal select if not done yet
    const platSel = document.getElementById('scanPlatform');
    if (platSel.options.length <= 1) {
      const src = document.getElementById('gamePlatformInput');
      if (src) platSel.innerHTML = src.innerHTML;
    }
    if (r.platform) {
      platSel.value = r.platform;
      if (platSel.value !== r.platform) {
        // Unknown platform — add it dynamically
        platSel.add(new Option(r.platform, r.platform, true, true));
      }
    }

    // Notes
    const notesEl = document.getElementById('scanNotes');
    if (r.notes) {
      notesEl.textContent = '💬 ' + r.notes;
      notesEl.style.display = '';
    } else {
      notesEl.style.display = 'none';
    }
  }

  function goToCondition() {
    const title = document.getElementById('scanTitle').value.trim();
    if (!title) { toast('Please enter a game title', 'error'); return; }
    // Update scanResult with any manual corrections
    scanResult = {
      ...scanResult,
      title,
      platform: document.getElementById('scanPlatform').value,
      region:   document.getElementById('scanRegion').value,
      edition:  document.getElementById('scanEdition').value.trim(),
    };
    showStep('scan-step-condition');
  }

  function selectCondition(idx) {
    selectedCondition = CONDITIONS[idx];
    document.querySelectorAll('.scan-condition-btn').forEach((btn, i) => {
      btn.classList.toggle('selected', i === idx);
    });
    // Short delay so the user sees the selection, then advance
    setTimeout(() => goToValue(), 300);
  }

  function goToValue() {
    if (!selectedCondition) return;
    estimatedValue = null;

    // Build summary
    const ed = scanResult.edition ? ` — ${scanResult.edition}` : '';
    document.getElementById('scanSummary').innerHTML = `
      <div class="scan-summary-row"><span class="scan-summary-label">Title</span><span class="scan-summary-value">${esc(scanResult.title)}${ed ? `<span style="color:var(--text-muted);font-size:12px"> ${esc(scanResult.edition)}</span>` : ''}</span></div>
      <div class="scan-summary-row"><span class="scan-summary-label">Platform</span><span class="scan-summary-value">${platformBadge(scanResult.platform)}</span></div>
      ${scanResult.region ? `<div class="scan-summary-row"><span class="scan-summary-label">Region</span><span class="scan-summary-value">${regionBadge(scanResult.region)}</span></div>` : ''}
      <div class="scan-summary-row"><span class="scan-summary-label">Condition</span><span class="scan-summary-value">${selectedCondition.icon} ${esc(selectedCondition.label)}</span></div>
    `;

    document.getElementById('scanValueResult').style.display = 'none';
    document.getElementById('scanValueResult').innerHTML = '';
    document.getElementById('scanLookupBtn').disabled = false;
    document.getElementById('scanLookupBtn').textContent = '💰 Look Up Value';
    showStep('scan-step-value');
  }

  async function lookupValue() {
    const btn = document.getElementById('scanLookupBtn');
    btn.disabled = true;
    btn.textContent = '⟳ Looking up…';
    try {
      const r = await API.applyPrice({
        query:     scanResult.title,
        platform:  scanResult.platform,
        condition: selectedCondition.condition,
        item_type: 'game',
        item_id:   0, // 0 = preview only — we don't write to DB here
      });
      estimatedValue = r.price;
      const el = document.getElementById('scanValueResult');
      el.innerHTML = `<div class="scan-value-found">Estimated value: <strong class="price-value">${Currency.format(r.price, 'USD')}</strong></div>`;
      el.style.display = '';
      btn.textContent = '↻ Refresh';
      btn.disabled = false;
    } catch (e) {
      const el = document.getElementById('scanValueResult');
      el.innerHTML = `<div style="color:var(--text-muted);font-size:13px">Could not fetch value: ${esc(e.message)}</div>`;
      el.style.display = '';
      btn.textContent = '↻ Retry';
      btn.disabled = false;
    }
  }

  async function addToLibrary() {
    const pricePaid = parseFloat(document.getElementById('scanPricePaid').value) || null;
    const btn = document.getElementById('scanAddBtn');
    btn.disabled = true;
    btn.textContent = '⟳ Adding…';
    try {
      const data = {
        title:       scanResult.title,
        platform:    scanResult.platform,
        region:      scanResult.region || null,
        edition:     scanResult.edition || null,
        condition:   selectedCondition.condition,
        has_box:     selectedCondition.has_box,
        has_manual:  selectedCondition.has_manual,
        price_paid:  pricePaid,
        price_value: estimatedValue || null,
        quantity:    1,
      };
      await API.createGame(data);
      toast(`"${scanResult.title}" added to library!`, 'success');
      App.loadSidebarCounts();
      reset();
    } catch (e) {
      toast('Failed to add: ' + e.message, 'error');
      btn.disabled = false;
      btn.textContent = '+ Add to Library';
    }
  }

  async function checkAvailability() {
    try {
      const { available } = await API.getScanStatus();
      if (!available) {
        document.getElementById('scanUnavailable').style.display = '';
        document.getElementById('scanWizard').style.display = 'none';
      }
    } catch {}
  }

  function init() {
    // File input
    const fileInput = document.getElementById('scanFileInput');
    fileInput?.addEventListener('change', e => { if (e.target.files[0]) setImage(e.target.files[0]); });

    // Drop zone click
    document.getElementById('scanDropZone')?.addEventListener('click', () => fileInput?.click());

    // Drag and drop
    const dropZone = document.getElementById('scanDropZone');
    dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone?.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files[0];
      if (file) setImage(file);
    });

    // Retake
    document.getElementById('scanRetakeBtn')?.addEventListener('click', () => {
      currentImageB64 = null;
      currentMimeType = null;
      document.getElementById('scanPreview').style.display = 'none';
      document.getElementById('scanDropZone').style.display = '';
      document.getElementById('scanIdentifyBtn').disabled = true;
      if (fileInput) fileInput.value = '';
    });

    // Wizard buttons
    document.getElementById('scanIdentifyBtn')?.addEventListener('click', identify);
    document.getElementById('scanBackToCapture')?.addEventListener('click', reset);
    document.getElementById('scanToCondition')?.addEventListener('click', goToCondition);
    document.getElementById('scanBackToConfirm')?.addEventListener('click', () => showStep('scan-step-confirm'));
    document.getElementById('scanBackToCondition')?.addEventListener('click', () => showStep('scan-step-condition'));
    document.getElementById('scanLookupBtn')?.addEventListener('click', lookupValue);
    document.getElementById('scanAddBtn')?.addEventListener('click', addToLibrary);

    // Condition buttons
    document.querySelectorAll('.scan-condition-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => selectCondition(i));
    });
  }

  function load() {
    checkAvailability();
  }

  return { init, load };
})();
