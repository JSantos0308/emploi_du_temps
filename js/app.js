(function () {
  'use strict';

  const CONFIG = {
    startDateS1: new Date(2026, 8, 14),
    weeks: 14,
    hours: ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00","23:00"],
    defaultCatalog: [],
    defaultLocations: ["Bibliothèque","Maison"],
    defaultTypes: ["Théorie", "Exercices", "Laboratoire", "Étude"]
  };

  const DAYS = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
  const H = CONFIG.hours.length;
  const LS = {
    courses:'timetable_courses_v3', catalog:'timetable_catalog_v3', locations:'timetable_locations_v3',
    strokes:'timetable_strokes_v3', types:'timetable_types_v3'
  };

  const $ = (id) => document.getElementById(id);
  const weekKey = (n) => 'S' + n;
  const weekNum = (k) => parseInt(String(k).slice(1), 10);
  let idc = 0; const uid = () => 'c' + (++idc) + '_' + Date.now().toString(36);

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function readJSON(key, fallback) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { toast("Stockage local plein ou bloqué."); return false; }
  }

  let courses = {};
  let strokes = [];
  let catalog = readJSON(LS.catalog, CONFIG.defaultCatalog);
  let locations = readJSON(LS.locations, CONFIG.defaultLocations);
  let typesListArray = readJSON(LS.types, CONFIG.defaultTypes);

  let filter = { course: '', type: '' };
  let hovered = null;
  let dragged = null;
  let modalCtx = { editing: null };
  let currentVisibleWeek = 'S1';
  let viewOnly = false;
  const slotMap = {}, blocks = {}, headerRows = {};

  function normalizeItem(it) {
    const day = parseInt(it.day, 10), hour = parseInt(it.hour, 10), dur = parseInt(it.duration, 10) || 2;
    if (!(day >= 0 && day < 7 && hour >= 0 && hour < H)) return null;
    const title = String(it.title || '').trim().slice(0, 120);
    if (!title) return null;
    return {
      id: uid(), day, hour, duration: Math.min(Math.max(dur, 1), H - hour),
      title, subtitle: String(it.subtitle || '').slice(0, 120),
      type: String(it.type || '').trim().slice(0, 40),
      loc: String(it.loc || '').slice(0, 80)
    };
  }
  function normalizeCourses(raw) {
    const out = {};
    for (let w = 1; w <= CONFIG.weeks; w++) {
      const k = weekKey(w); out[k] = [];
      const arr = raw && Array.isArray(raw[k]) ? raw[k] : [];
      arr.forEach((it) => { const n = it && typeof it === 'object' ? normalizeItem(it) : null; if (n) out[k].push(n); });
    }
    return out;
  }
  function normalizeStrokes(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((s) => {
      if (!s || !/^S\d+$/.test(s.w)) return false;
      const n = weekNum(s.w); if (n < 1 || n > CONFIG.weeks) return false;
      if (s.kind !== 'pen' && s.kind !== 'highlight') return false;
      if (!Array.isArray(s.pts) || s.pts.length < 2) return false;
      return s.pts.every((p) => Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]));
    }).map((s) => ({ w: s.w, kind: s.kind, color: /^#[0-9a-fA-F]{3,8}$/.test(s.color) ? s.color : '#dc3545', pts: s.pts }));
  }
  function normalizeCatalog(raw) {
    if (!Array.isArray(raw)) return [];
    const out = raw.filter((c) => c && typeof c.name === 'string' && c.name.trim()).map((c) => ({
      name: c.name.trim().slice(0, 120),
      subtitle: String(c.subtitle || '').slice(0, 120)
    }));
    return out;
  }
  function normalizeTypes(raw) {
    if (!Array.isArray(raw)) return CONFIG.defaultTypes.slice();
    const out = raw.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 50)).slice(0, 100);
    return out.length ? out : CONFIG.defaultTypes.slice();
  }
  function normalizeLocations(raw) {
    if (!Array.isArray(raw)) return CONFIG.defaultLocations.slice();
    const out = raw.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 80)).slice(0, 300);
    return out.length ? out : CONFIG.defaultLocations.slice();
  }

  function serializeAll() {
    const out = {};
    Object.keys(courses).forEach((k) => { out[k] = courses[k].map((c) => ({ day:c.day, hour:c.hour, duration:c.duration, title:c.title, subtitle:c.subtitle, type:c.type, loc:c.loc })); });
    return { courses: out, strokes, catalog, locations, types: typesListArray };
  }
  function saveLocalAll() {
    const s = serializeAll();
    writeJSON(LS.courses, s.courses);
    writeJSON(LS.strokes, s.strokes);
    writeJSON(LS.catalog, s.catalog);
    writeJSON(LS.locations, s.locations);
    writeJSON(LS.types, s.types);
  }

  let history = []; let historyIndex = -1; let restoring = false;

  function snapshot() { return JSON.stringify(serializeAll()); }
  function pushHistory() {
    if (restoring) return;
    const s = snapshot();
    if (history[historyIndex] === s) return;
    history = history.slice(0, historyIndex + 1);
    history.push(s);
    if (history.length > 100) history.shift();
    historyIndex = history.length - 1;
    updateHistoryButtons();
  }
  function applySnapshot(s) {
    const data = JSON.parse(s);
    courses = normalizeCourses(data.courses);
    strokes = normalizeStrokes(data.strokes);
    catalog = normalizeCatalog(data.catalog);
    locations = normalizeLocations(data.locations);
    typesListArray = normalizeTypes(data.types);
    restoring = true;
    renderCards(); updateLocationsDatalist(); updateCoursesDatalist(); updateTypesDatalist(); refreshFilterOptions(); redraw();
    restoring = false;
    saveLocalAll(); scheduleCloudSave();
  }
  function undo() { if (historyIndex > 0) { historyIndex--; applySnapshot(history[historyIndex]); updateHistoryButtons(); } }
  function redo() { if (historyIndex < history.length - 1) { historyIndex++; applySnapshot(history[historyIndex]); updateHistoryButtons(); } }
  function updateHistoryButtons() {
    $('btnUndo').disabled = historyIndex <= 0;
    $('btnRedo').disabled = historyIndex >= history.length - 1;
  }

  function placementError(week, day, hour, duration, ignoreId) {
    if (hour + duration > H) return "Ce cours dépasse la fin de la grille.";
    const clash = (courses[week] || []).find((c) => c.id !== ignoreId && c.day === day && hour < c.hour + c.duration && c.hour < hour + duration);
    if (clash) return "Ce créneau chevauche « " + clash.title + " » (" + DAYS[day] + ", " + CONFIG.hours[clash.hour] + ").";
    return '';
  }
  function findItem(week, id) { return (courses[week] || []).find((c) => c.id === id) || null; }
  function findItemAt(week, day, hour) { return (courses[week] || []).find((c) => c.day === day && c.hour === hour) || null; }
  function isSlotCovered(week, day, hour) {
    return (courses[week] || []).some((c) => c.day === day && hour >= c.hour && hour < c.hour + c.duration);
  }
  function removeItem(week, id) { courses[week] = (courses[week] || []).filter((c) => c.id !== id); }
  function moveItem(fromWeek, id, toWeek, day, hour) {
    const item = findItem(fromWeek, id); if (!item) return;
    if (fromWeek === toWeek && item.day === day && item.hour === hour) return;
    const err = placementError(toWeek, day, hour, item.duration, item.id);
    if (err) { toast(err); return; }
    removeItem(fromWeek, id); item.day = day; item.hour = hour; courses[toWeek].push(item);
    saveLocalAll(); scheduleCloudSave(); pushHistory(); renderCards();
  }

  const weeksWrapper = $('weeksWrapper'), container = $('scrollContainer');

  function updateRowHeight() {
    const headerH = 22;
    const available = container.clientHeight - headerH;
    const rh = Math.max(30, Math.floor(available / H));
    document.documentElement.style.setProperty('--row-height', rh + 'px');
  }
  function fmtShort(d) { return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0'); }
  function mondayOf(n) { const d = new Date(CONFIG.startDateS1); d.setDate(d.getDate() + (n-1)*7); return d; }
  
  function updateRangeDisplay(startWk, endWk) {
    const startMon = mondayOf(weekNum(startWk));
    const endMon = mondayOf(weekNum(endWk));
    const endSun = new Date(endMon); endSun.setDate(endSun.getDate() + 6);
    $('startDateText').textContent = fmtShort(startMon) + '/' + startMon.getFullYear();
    $('endDateText').textContent = fmtShort(endSun) + '/' + endSun.getFullYear();
  }

  function buildWeeks() {
    const now = new Date();
    const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let w = 1; w <= CONFIG.weeks; w++) {
      const wk = weekKey(w), mon = mondayOf(w), sun = new Date(mon); sun.setDate(sun.getDate()+6);

      const block = document.createElement('div'); block.className = 'week-block'; block.id = 'week-block-' + wk;
      blocks[w] = block;
      if (w > 1) block.appendChild(Object.assign(document.createElement('div'), { className:'week-divider' }));

      const headerRow = document.createElement('div'); headerRow.className = 'header-row';
      headerRows[w] = headerRow;
      const corner = document.createElement('div'); corner.className = 'header-cell'; corner.textContent = wk; headerRow.appendChild(corner);
      
      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(mon); dayDate.setDate(mon.getDate() + d);
        const cell = document.createElement('div'); cell.className = 'header-cell';
        cell.textContent = DAYS[d] + ' ' + fmtShort(dayDate);
        
        const isToday = (dayDate.getTime() === todayDateOnly.getTime());
        if (isToday) cell.classList.add('today-col');
        headerRow.appendChild(cell);
      }
      block.appendChild(headerRow);

      const grid = document.createElement('div'); grid.className = 'timetable-body';
      grid.style.gridTemplateRows = 'repeat(' + H + ', var(--row-height))';
      CONFIG.hours.forEach((label, h) => {
        const timeCell = document.createElement('div'); timeCell.className = 'time-cell'; timeCell.textContent = label;
        grid.appendChild(timeCell);
        for (let day = 0; day < 7; day++) {
          const slot = document.createElement('div'); slot.className = 'slot';
          slotMap[wk + '-' + day + '-' + h] = slot;

          slot.addEventListener('mouseenter', () => {
            hovered = { week: wk, day, hour: h };
            if (!isSlotCovered(wk, day, h)) slot.classList.add('slot-hover');
          });
          slot.addEventListener('mouseleave', () => {
            if (hovered && hovered.week===wk && hovered.day===day && hovered.hour===h) hovered = null;
            slot.classList.remove('slot-hover');
          });
          slot.addEventListener('click', (e) => {
            if (viewOnly || drawMode !== 'none') return;
            if (e.target.closest('.course-card')) return;
            openModal(wk, day, h);
          });
          slot.addEventListener('dragover', (e) => { if (!dragged || viewOnly) return; e.preventDefault(); slot.classList.add('drag-over'); });
          slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
          slot.addEventListener('drop', (e) => {
            e.preventDefault(); slot.classList.remove('drag-over');
            if (!dragged || viewOnly) return;
            const d = dragged; dragged = null; moveItem(d.week, d.id, wk, day, h);
          });
          grid.appendChild(slot);
        }
      });
      block.appendChild(grid);
      weeksWrapper.appendChild(block);
    }
    updateRangeDisplay('S1', weekKey(CONFIG.weeks));
  }

  function getBaseType(typeStr) {
    const lower = (typeStr || '').toLowerCase().trim();
    if (!lower) return 'default';
    if (lower.includes('theorie') || lower.includes('théorie') || lower.includes('theo')) return 'theorie';
    if (lower.includes('exercice') || lower.includes('ex')) return 'exercices';
    if (lower.includes('labo') || lower.includes('pratique')) return 'labo';
    if (lower.includes('etude') || lower.includes('étude') || lower.includes('perso')) return 'etude';
    return 'default';
  }

  function cardMatchesFilter(item) {
    if (filter.course && item.title !== filter.course) return false;
    if (filter.type && getBaseType(item.type) !== filter.type) return false;
    return true;
  }

  function buildCard(week, item) {
    const card = document.createElement('div');
    const baseType = getBaseType(item.type);
    card.className = 'course-card ' + baseType + (cardMatchesFilter(item) ? '' : ' dimmed');
    card.style.height = 'calc(var(--row-height) * ' + item.duration + ' - 2px)';
    card.draggable = !viewOnly;

    const title = document.createElement('div'); 
    title.className = 'header-title';
    title.textContent = item.title + (item.type ? ' - ' + item.type : '');
    card.appendChild(title);

    if (item.subtitle) { 
      const s = document.createElement('div'); 
      s.className = 'subtitle'; 
      s.textContent = item.subtitle; 
      card.appendChild(s); 
    }
    
    if (item.loc) { 
      const l = document.createElement('div'); 
      l.className = 'location'; 
      l.textContent = item.loc; 
      card.appendChild(l); 
    }

    card.addEventListener('click', (e) => { e.stopPropagation(); if (!viewOnly && drawMode === 'none') openModal(week, item.day, item.hour); });
    card.addEventListener('dragstart', (e) => {
      if (viewOnly) { e.preventDefault(); return; }
      dragged = { week, id: item.id }; e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', item.id); } catch (_) {}
    });
    card.addEventListener('dragend', () => { dragged = null; document.querySelectorAll('.slot.drag-over').forEach((s) => s.classList.remove('drag-over')); });

    return card;
  }

  function renderCards() {
    document.querySelectorAll('.course-card').forEach((c) => c.remove());
    Object.values(slotMap).forEach((s) => { s.style.pointerEvents = ''; s.classList.remove('slot-hover', 'slot-covered', 'slot-no-inner-border'); });
    Object.keys(courses).forEach((wk) => courses[wk].forEach((item) => {
      const slot = slotMap[wk + '-' + item.day + '-' + item.hour];
      if (slot) slot.appendChild(buildCard(wk, item));
      for (let hh = item.hour; hh < item.hour + item.duration; hh++) {
        const s = slotMap[wk + '-' + item.day + '-' + hh];
        if (!s) continue;
        if (hh < item.hour + item.duration - 1) s.classList.add('slot-no-inner-border');
        if (hh > item.hour) { s.style.pointerEvents = 'none'; s.classList.add('slot-covered'); }
      }
    }));
  }

  function refreshFilterOptions() {
    const selectCourse = $('filterSelectCourse');
    selectCourse.innerHTML = '<option value="">Tous les cours</option>';
    const namesSet = new Set();
    Object.keys(courses).forEach((wk) => courses[wk].forEach((it) => namesSet.add(it.title)));
    Array.from(namesSet).sort().forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      if (filter.course === name) opt.selected = true;
      selectCourse.appendChild(opt);
    });
    $('filterSelectType').value = filter.type;
  }

  $('btnFilter').addEventListener('click', () => { refreshFilterOptions(); $('filterPanel').classList.toggle('open'); });
  $('btnFilterApply').addEventListener('click', () => {
    filter.course = $('filterSelectCourse').value;
    filter.type = $('filterSelectType').value;
    renderCards();
    $('filterPanel').classList.remove('open');
  });
  $('btnFilterClear').addEventListener('click', () => {
    filter.course = ''; filter.type = '';
    refreshFilterOptions(); renderCards();
    $('filterPanel').classList.remove('open');
  });

  function isModalOpen() { return $('courseModal').style.display === 'flex' || $('shareModal').style.display === 'flex' || $('configModal').style.display === 'flex'; }

  function fillCoursesDatalist() {
    const list = $('coursesDatalist'); list.innerHTML = '';
    catalog.forEach((c) => { const o = document.createElement('option'); o.value = c.name; list.appendChild(o); });
  }
  function updateCoursesDatalist() { fillCoursesDatalist(); }
  function updateLocationsDatalist() {
    const list = $('locationsList'); list.innerHTML = '';
    locations.forEach((loc) => { const o = document.createElement('option'); o.value = loc; list.appendChild(o); });
  }
  function updateTypesDatalist() {
    const list = $('typesList');
    if (!list) return;
    list.innerHTML = '';
    typesListArray.forEach((t) => {
      const o = document.createElement('option');
      o.value = t;
      list.appendChild(o);
    });
  }

  // --- Gestion du panneau déroulant Catalogue par onglets ---
  let catalogPanelOpen = false;
  function toggleCatalogPanel() {
    if (viewOnly) return;
    catalogPanelOpen = !catalogPanelOpen;
    const panel = $('catalogDropdownPanel');
    panel.classList.toggle('open', catalogPanelOpen);
    $('btnCatalogToggle').classList.toggle('btn-active', catalogPanelOpen);

    if (catalogPanelOpen) {
      $('panelCoursesTextarea').value = catalog.map((c) => c.subtitle ? c.name + ' | ' + c.subtitle : c.name).join('\n');
      $('panelTypesTextarea').value = typesListArray.join('\n');
    }
  }

  $('btnCatalogToggle').addEventListener('click', toggleCatalogPanel);

  window.addEventListener('click', (e) => {
    if (!e.target.closest('#btnCatalogToggle') && !e.target.closest('#catalogDropdownPanel')) {
      catalogPanelOpen = false;
      $('catalogDropdownPanel').classList.remove('open');
      $('btnCatalogToggle').classList.remove('btn-active');
    }
  });

  document.querySelectorAll('.catalog-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      document.querySelectorAll('.catalog-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (tabName === 'courses') {
        $('tabContentCourses').style.display = 'block';
        $('tabContentTypes').style.display = 'none';
      } else {
        $('tabContentCourses').style.display = 'none';
        $('tabContentTypes').style.display = 'block';
      }
    });
  });

  $('btnSavePanelCourses').addEventListener('click', () => {
    const lines = $('panelCoursesTextarea').value.split('\n').map((l) => l.trim()).filter((l) => l);
    const parsed = lines.map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      const name = parts[0] || '';
      const subtitle = parts.length > 1 ? parts.slice(1).join(' | ') : '';
      return { name, subtitle };
    }).filter((c) => c.name);

    catalog = normalizeCatalog(parsed);
    updateCoursesDatalist();
    saveLocalAll(); scheduleCloudSave(); pushHistory();
    toast("Catalogue de cours mis à jour.");
    catalogPanelOpen = false;
    $('catalogDropdownPanel').classList.remove('open');
    $('btnCatalogToggle').classList.remove('btn-active');
  });

  $('btnSavePanelTypes').addEventListener('click', () => {
    const lines = $('panelTypesTextarea').value.split('\n').map((l) => l.trim()).filter((l) => l);
    typesListArray = normalizeTypes(lines);
    updateTypesDatalist();
    saveLocalAll(); scheduleCloudSave(); pushHistory();
    toast("Liste des types mise à jour.");
    catalogPanelOpen = false;
    $('catalogDropdownPanel').classList.remove('open');
    $('btnCatalogToggle').classList.remove('btn-active');
  });

  // Bouton de configuration des locaux existant
  $('btnConfigLocations').addEventListener('click', () => openConfigModal('locations'));

  function openConfigModal(type) {
    if (viewOnly) return;
    currentConfigType = type;
    $('configError').textContent = '';
    $('configModalTitle').textContent = "Liste des locaux";
    $('configModalDesc').textContent = "Un local par ligne.";
    $('configTextarea').value = locations.join('\n');
    $('configModal').style.display = 'flex';
  } 

  let currentConfigType = null;
  function closeConfigModal() { $('configModal').style.display = 'none'; }
  function saveConfigModal() {
    const lines = $('configTextarea').value.split('\n').map((l) => l.trim()).filter((l) => l);
    locations = normalizeLocations(lines);
    updateLocationsDatalist();
    saveLocalAll(); scheduleCloudSave(); pushHistory(); closeConfigModal();
    toast("Liste des locaux mise à jour.");
  }
  $('btnSaveConfig').addEventListener('click', saveConfigModal);
  $('btnCloseConfig').addEventListener('click', closeConfigModal);

  function openModal(week, day, hour) {
    if (viewOnly) return;
    const item = findItemAt(week, day, hour);
    modalCtx = { editing: item, week, day, hour };
    $('modalError').textContent = '';
    if (item) {
      $('courseSearch').value = item.title; 
      $('courseType').value = item.type || ''; 
      $('courseLocation').value = item.loc; 
      $('courseDuration').value = String(item.duration);
      $('btnModalCopy').style.display = 'inline-block'; $('btnModalPaste').style.display = 'none'; $('btnDeleteCourse').style.display = 'inline-block';
    } else {
      $('courseSearch').value = ''; 
      $('courseType').value = ''; 
      $('courseLocation').value = ''; 
      $('courseDuration').value = String(Math.min(2, H - hour));
      $('btnModalCopy').style.display = 'none'; $('btnModalPaste').style.display = copiedBuffer ? 'inline-block' : 'none';
      $('btnDeleteCourse').style.display = 'none';
    }
    updateLocationsDatalist(); fillCoursesDatalist(); updateTypesDatalist();
    $('courseModal').style.display = 'flex'; $('courseSearch').focus();
  }

  function closeModal() { $('courseModal').style.display = 'none'; }

  function saveCourse() {
    const title = $('courseSearch').value.trim();
    if (!title) { $('modalError').textContent = "Indiquez un nom de cours (ou utilisez « Supprimer »)."; return; }
    
    const week = modalCtx.week, day = modalCtx.day, hour = modalCtx.hour, editing = modalCtx.editing;
    const type = $('courseType').value.trim();
    const loc = $('courseLocation').value.trim();
    const duration = parseInt($('courseDuration').value, 10);

    const catalogMatch = catalog.find((c) => c.name.toLowerCase() === title.toLowerCase());
    const subtitle = catalogMatch ? catalogMatch.subtitle : '';

    const err = placementError(week, day, hour, duration, editing ? editing.id : null);
    if (err) { $('modalError').textContent = err; return; }

    if (editing) {
      removeItem(week, editing.id);
      editing.title = title; editing.subtitle = subtitle; editing.type = type; editing.loc = loc; editing.duration = duration;
      courses[week].push(editing);
    } else {
      courses[week].push({ id: uid(), day, hour, duration, title, subtitle, type, loc });
    }
    saveLocation(loc);
    saveLocalAll(); scheduleCloudSave(); pushHistory(); renderCards(); refreshFilterOptions(); closeModal();
  }
  function deleteCourse() {
    const week = modalCtx.week, editing = modalCtx.editing;
    if (editing) { removeItem(week, editing.id); saveLocalAll(); scheduleCloudSave(); pushHistory(); renderCards(); refreshFilterOptions(); }
    closeModal();
  }
  let copiedBuffer = null;
  function copyCurrentCourseModal() {
    const it = modalCtx.editing;
    if (it) { copiedBuffer = { title: it.title, subtitle: it.subtitle, type: it.type, loc: it.loc, duration: it.duration }; toast('Cours copié.'); }
    closeModal();
  }
  function pasteCourseModal() {
    if (!copiedBuffer) return;
    const week = modalCtx.week, day = modalCtx.day, hour = modalCtx.hour;
    const err = placementError(week, day, hour, copiedBuffer.duration, null);
    if (err) { $('modalError').textContent = err; return; }
    courses[week].push({ id: uid(), day, hour, duration: copiedBuffer.duration, title: copiedBuffer.title, subtitle: copiedBuffer.subtitle, type: copiedBuffer.type, loc: copiedBuffer.loc });
    saveLocalAll(); scheduleCloudSave(); pushHistory(); renderCards(); refreshFilterOptions(); closeModal();
  }
  function saveLocation(loc) {
    if (!loc) return;
    if (!locations.includes(loc)) { locations.push(loc); saveLocalAll(); scheduleCloudSave(); }
  }

  $('btnSaveCourse').addEventListener('click', saveCourse);
  $('btnDeleteCourse').addEventListener('click', deleteCourse);
  $('btnModalCopy').addEventListener('click', copyCurrentCourseModal);
  $('btnModalPaste').addEventListener('click', pasteCourseModal);
  $('btnCancelCourse').addEventListener('click', closeModal);
  $('courseModal').addEventListener('click', (e) => { if (e.target === $('courseModal')) closeModal(); });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (isModalOpen()) { closeModal(); $('shareModal').style.display = 'none'; $('configModal').style.display = 'none'; } $('filterPanel').classList.remove('open'); return; }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      if (isModalOpen()) return;
      const t = e.target; if (t && t.closest && t.closest('input,textarea,select')) return;
      e.preventDefault(); undo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      if (isModalOpen()) return;
      const t = e.target; if (t && t.closest && t.closest('input,textarea,select')) return;
      e.preventDefault(); redo(); return;
    }

    if (!(e.ctrlKey || e.metaKey)) return;
    if (isModalOpen() || drawMode !== 'none' || viewOnly) return;
    const t = e.target; if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (!hovered) return;

    const key = e.key.toLowerCase();
    if (key === 'c') {
      if (String(window.getSelection && window.getSelection()).length > 0) return;
      const it = findItemAt(hovered.week, hovered.day, hovered.hour);
      if (it) { copiedBuffer = { title: it.title, subtitle: it.subtitle, type: it.type, loc: it.loc, duration: it.duration }; toast('Cours copié.'); }
    } else if (key === 'v' && copiedBuffer) {
      e.preventDefault();
      const err = placementError(hovered.week, hovered.hour, copiedBuffer.duration, null);
      if (err) { toast(err); return; }
      courses[hovered.week].push({ id: uid(), day: hovered.day, hour: hovered.hour, duration: copiedBuffer.duration, title: copiedBuffer.title, subtitle: copiedBuffer.subtitle, type: copiedBuffer.type, loc: copiedBuffer.loc });
      saveLocalAll(); scheduleCloudSave(); pushHistory(); renderCards(); refreshFilterOptions();
    }
  });

  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);

  const canvas = $('drawingCanvas'), ctx = canvas.getContext('2d');
  let cssW = 0, cssH = 0, drawMode = 'none', current = null, currentTop = 0, erasedSomething = false;
  const round4 = (n) => Math.round(n*10000)/10000, round1 = (n) => Math.round(n*10)/10;

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    cssW = container.clientWidth; cssH = weeksWrapper.offsetHeight;
    canvas.width = Math.round(cssW*dpr); canvas.height = Math.round(cssH*dpr);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    redraw();
  }
  function contentPts(s) {
    const n = weekNum(s.w); const top = blocks[n].offsetTop;
    return s.pts.map((p) => [p[0]*cssW, p[1] + top]);
  }
  function drawStroke(s) {
    const pts = contentPts(s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color || '#dc3545';
    ctx.globalAlpha = s.kind === 'highlight' ? 0.4 : 1;
    ctx.lineWidth = s.kind === 'highlight' ? 14 : 2.5;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  function redraw() { ctx.clearRect(0,0,cssW,cssH); strokes.forEach(drawStroke); if (current && !current.eraser) drawStroke(current); }

  function setMode(mode) {
    if (viewOnly) return;
    const buttons = { pen: $('toolPen'), highlight: $('toolHighlighter'), eraser: $('toolEraser') };
    drawMode = drawMode === mode ? 'none' : mode;
    Object.keys(buttons).forEach((m) => buttons[m].classList.toggle('selected', drawMode === m));
    const active = drawMode !== 'none';
    $('btnPencil').classList.toggle('btn-active', active);
    $('drawingToolbar').classList.toggle('active', active);
    canvas.classList.toggle('active', active);
  }
  $('btnPencil').addEventListener('click', () => setMode(drawMode === 'none' ? 'pen' : 'none'));
  $('toolPen').addEventListener('click', () => setMode('pen'));
  $('toolHighlighter').addEventListener('click', () => setMode('highlight'));
  $('toolEraser').addEventListener('click', () => setMode('eraser'));
  $('btnClearCanvas').addEventListener('click', () => {
    const n = weekNum(currentVisibleWeek);
    const before = strokes.length;
    strokes = strokes.filter((s) => weekNum(s.w) !== n);
    if (strokes.length !== before) { saveLocalAll(); scheduleCloudSave(); pushHistory(); redraw(); }
  });

  function pointerPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function weekAtY(y) {
    for (let w = 1; w <= CONFIG.weeks; w++) {
      const b = blocks[w];
      if (b && y >= b.offsetTop && y < b.offsetTop + b.offsetHeight) return { key: weekKey(w), top: b.offsetTop };
    }
    return null;
  }
  function distToSeg(px,py,ax,ay,bx,by) {
    const dx=bx-ax, dy=by-ay, len2=dx*dx+dy*dy;
    let t = len2===0?0:((px-ax)*dx+(py-ay)*dy)/len2; t = Math.max(0,Math.min(1,t));
    return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
  }
  function hitStroke(s,x,y) { const pts = contentPts(s); for (let i=0;i<pts.length-1;i++) if (distToSeg(x,y,pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1])<=14) return true; return false; }
  function eraseAt(p) { const before = strokes.length; strokes = strokes.filter((s) => !hitStroke(s,p.x,p.y)); if (strokes.length!==before) { erasedSomething = true; redraw(); } }

  canvas.addEventListener('pointerdown', (e) => {
    if (drawMode === 'none' || viewOnly) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch(_) {}
    const p = pointerPos(e);
    if (drawMode === 'eraser') { erasedSomething = false; current = { eraser:true }; eraseAt(p); return; }
    const wk = weekAtY(p.y); if (!wk) return;
    currentTop = wk.top;
    const pt = [round4(p.x/cssW), round1(p.y - wk.top)];
    current = { w: wk.key, kind: drawMode, color: $('toolColor').value, pts: [pt] };
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    const p = pointerPos(e);
    if (current.eraser) { eraseAt(p); return; }
    const pt = [round4(p.x/cssW), round1(p.y - currentTop)];
    const last = current.pts[current.pts.length-1];
    if (Math.hypot((pt[0]-last[0])*cssW, pt[1]-last[1]) < 1.5) return;
    current.pts.push(pt);
    redraw();
  });
  canvas.addEventListener('pointerup', () => {
    if (!current) return;
    if (current.eraser) { if (erasedSomething) { saveLocalAll(); scheduleCloudSave(); pushHistory(); } current = null; return; }
    if (current.pts.length > 1) { strokes.push(current); saveLocalAll(); scheduleCloudSave(); pushHistory(); }
    current = null; redraw();
  });

  // Liaison avec Firebase / Offline
  window.addEventListener('app:offline-mode', () => { viewOnly = false; initApp(); });
  window.addEventListener('app:signed-in', async (e) => {
    viewOnly = false;
    await loadCloudData(e.detail.uid);
    initApp();
    const dot = $('saveDot'), text = $('saveText');
    if (dot) { dot.className = 'save-dot saved'; text.textContent = 'Connecté'; }
  });
  window.addEventListener('app:signed-out', () => { viewOnly = true; initApp(); });
  window.addEventListener('app:before-logout', () => { saveLocalAll(); });

  let cloudSaveTimer = null;
  function scheduleCloudSave() {
    if (viewOnly || !window.__auth || !window.__auth.currentUser || window.__auth.currentUser.isAnonymous) return;
    const dot = $('saveDot'), text = $('saveText');
    if (dot) { dot.className = 'save-dot saving'; text.textContent = 'Enregistrement...'; }
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(async () => {
      try {
        const user = window.__auth.currentUser;
        if (!user) return;
        const fs = window.__fs;
        await fs.setDoc(fs.doc(fs.db, 'timetables', user.uid), serializeAll());
        if (dot) { dot.className = 'save-dot saved'; text.textContent = 'Enregistré'; }
      } catch (err) {
        console.error('Erreur Firestore:', err);
        if (dot) { dot.className = 'save-dot error'; text.textContent = 'Erreur cloud'; }
      }
    }, 1200);
  }

  async function loadCloudData(uid) {
    try {
      const fs = window.__fs;
      const snap = await fs.getDoc(fs.doc(fs.db, 'timetables', uid));
      if (snap.exists()) {
        const data = snap.data();
        courses = normalizeCourses(data.courses);
        strokes = normalizeStrokes(data.strokes);
        catalog = normalizeCatalog(data.catalog);
        locations = normalizeLocations(data.locations);
        typesListArray = normalizeTypes(data.types);
        saveLocalAll();
      }
    } catch(e) { console.error('Erreur chargement cloud:', e); }
  }

  function initApp() {
    courses = normalizeCourses(readJSON(LS.courses, {}));
    strokes = normalizeStrokes(readJSON(LS.strokes, []));
    catalog = normalizeCatalog(readJSON(LS.catalog, CONFIG.defaultCatalog));
    locations = normalizeLocations(readJSON(LS.locations, CONFIG.defaultLocations));
    typesListArray = normalizeTypes(readJSON(LS.types, CONFIG.defaultTypes));

    weeksWrapper.innerHTML = '';
    buildWeeks();
    updateRowHeight();
    renderCards();
    updateCoursesDatalist();
    updateLocationsDatalist();
    updateTypesDatalist();
    pushHistory();
    resizeCanvas();
  }

  window.addEventListener('resize', () => { updateRowHeight(); resizeCanvas(); });
  
  initApp();
  goToWeek(getCurrentWeekKey());
  // Partage / Exporter
  $('btnShare').addEventListener('click', () => { $('shareModal').style.display = 'flex'; });
  $('btnShareClose').addEventListener('click', () => { $('shareModal').style.display = 'none'; });
  $('btnShareLink').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    toast("Lien copié dans le presse-papier !");
    $('shareModal').style.display = 'none';
  });
  $('btnShareJSON').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(serializeAll(), null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", "emploi_du_temps_xl.json");
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
    $('shareModal').style.display = 'none';
  });
  $('btnSharePDF').addEventListener('click', () => {
    $('shareModal').style.display = 'none';
    toast("Génération du PDF en cours...");
    const element = weeksWrapper;
    html2pdf().from(element).save('emploi_du_temps.pdf');
  });

  // Navigation semaines
  function goToWeek(wk) {
    currentVisibleWeek = wk;
    updateNavBarDisplay(wk);
    const b = blocks[weekNum(wk)];
    if (b) container.scrollTop = b.offsetTop - 5;
  }

  $('btnTodayNav').addEventListener('click', () => goToWeek(getCurrentWeekKey()));
  $('btnPrevWeek').addEventListener('click', () => {
    let n = weekNum(currentVisibleWeek) - 1;
    if (n < 1) n = 1;
    goToWeek(weekKey(n));
  });
  $('btnNextWeek').addEventListener('click', () => {
    let n = weekNum(currentVisibleWeek) + 1;
    if (n > CONFIG.weeks) n = CONFIG.weeks;
    goToWeek(weekKey(n));
  });

    function dateToWeekNum(dateVal) {
    const selectedDate = new Date(dateVal);
    const start = new Date(CONFIG.startDateS1.getFullYear(), CONFIG.startDateS1.getMonth(), CONFIG.startDateS1.getDate());
    const diffTime = selectedDate - start;
    const diffDays = Math.floor(diffTime / 86400000);
    if (diffDays < 0) return 1;
    let n = Math.floor(diffDays / 7) + 1;
    return Math.min(Math.max(n, 1), CONFIG.weeks);
  }

  function applyDateRangeFilter() {
    const startInput = $('startDatePicker').value;
    const endInput = $('endDatePicker').value;

    let startW = 1;
    let endW = CONFIG.weeks;

    if (startInput) startW = dateToWeekNum(startInput);
    if (endInput) endW = dateToWeekNum(endInput);

    if (startW > endW) {
      toast("La date de début doit être antérieure à la date de fin.");
      return;
    }

    for (let w = 1; w <= CONFIG.weeks; w++) {
      blocks[w].style.display = (w >= startW && w <= endW) ? '' : 'none';
    }
    updateRangeDisplay(weekKey(startW), weekKey(endW));
    resizeCanvas();
    toast("Affichage filtré de la semaine " + startW + " à la semaine " + endW);
  }

  $('btnStartDate').addEventListener('click', () => {
    $('startDatePicker').showPicker?.() || $('startDatePicker').click();
  });
  $('startDatePicker').addEventListener('change', applyDateRangeFilter);

  $('btnEndDate').addEventListener('click', () => {
    $('endDatePicker').showPicker?.() || $('endDatePicker').click();
  });
  $('endDatePicker').addEventListener('change', applyDateRangeFilter);

  function getCurrentWeekKey() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(CONFIG.startDateS1.getFullYear(), CONFIG.startDateS1.getMonth(), CONFIG.startDateS1.getDate());
    const diffTime = today - start;
    const diffDays = Math.floor(diffTime / 86400000);
    if (diffDays < 0) return 'S1';
    let n = Math.floor(diffDays / 7) + 1; 
    n = Math.min(Math.max(n, 1), CONFIG.weeks);
    return weekKey(n);
  }
  function updateNavBarDisplay(wk) {
    $('currentWeekText').textContent = 's' + weekNum(wk);
  }

  $('btnClearWeek').addEventListener('click', () => {
    if (viewOnly) return;
    if (!confirm("Voulez-vous vraiment effacer tous les cours de cette semaine ?")) return;
    const wk = currentVisibleWeek;
    courses[wk] = [];
    saveLocalAll(); scheduleCloudSave(); pushHistory(); renderCards(); refreshFilterOptions();
    toast("Semaine effacée.");
  });

  $('btnCopyPrev').addEventListener('click', () => {
    if (viewOnly) return;
    const n = weekNum(currentVisibleWeek);
    if (n <= 1) { toast("C'est la première semaine."); return; }
    const prevWk = weekKey(n - 1);
    const curWk = weekKey(n);
    courses[curWk] = (courses[prevWk] || []).map((c) => ({ ...c, id: uid() }));
    saveLocalAll(); scheduleCloudSave(); pushHistory(); renderCards(); refreshFilterOptions();
    toast("Cours de la semaine précédente copiés.");
  });

})();
