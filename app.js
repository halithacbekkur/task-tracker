/* ============================================
   TaskGrid — Application Logic v2
   ============================================ */

(() => {
  'use strict';

  const STORAGE_KEY = 'taskgrid_data';
  const THEME_KEY = 'taskgrid_theme';
  const NUM_DAYS = 7;

  const CATEGORY_COLORS = [
    '#7c5cfc', '#5ce0d8', '#f472b6', '#fbbf24',
    '#34d399', '#60a5fa', '#f87171', '#a78bfa',
    '#fb923c', '#22d3ee', '#e879f9', '#84cc16',
  ];

  const DAY_NAMES_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const tableHead = $('#table-head');
  const tableBody = $('#table-body');
  const tableFoot = $('#table-foot');
  const weekPercentEl = $('#week-percent');
  const weekBarFill = $('#week-bar-fill');
  const categoryOverlay = $('#modal-overlay');
  const categoryNameInput = $('#input-category-name');
  const colorPickerEl = $('#color-picker');
  const taskOverlay = $('#modal-task-overlay');
  const taskNameInput = $('#input-task-name');

  // ── State ──────────────────────────────────────────
  let state = {
    categories: [],
    completions: {},
    weekHistory: [],
    currentWeekStart: null,
    // notes: [{ id, title, content, color, pinned, tags, createdAt, updatedAt }]
    notes: [],
  };

  let selectedColor = CATEGORY_COLORS[0];
  let addingTaskToCategoryId = null;

  // Edit mode tracking
  let editingCategoryId = null;
  let editingTaskId = null;
  let editingTaskCatId = null;

  // Drag state
  let dragSrcTaskId = null;
  let dragSrcCatId = null;

  // Notes state
  let editingNoteId = null;
  let noteSelectedColor = '';
  let notePinned = false;
  let noteSearchQuery = '';

  // ── Date Helpers ───────────────────────────────────
  function getWeekDates() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = getMonday(today);
    const dates = [];
    for (let i = 0; i < NUM_DAYS; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
    return dates;
  }

  function getMonday(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return date;
  }

  function formatDateRange(startStr, endStr) {
    const s = new Date(startStr);
    const e = new Date(endStr);
    return s.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' – ' +
           e.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDateKey(date) {
    return date.toISOString().split('T')[0];
  }

  function formatDayName(date) {
    return date.toLocaleDateString('tr-TR', { weekday: 'short' });
  }

  function formatDateShort(date) {
    return date.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' });
  }

  function isToday(date) {
    const now = new Date();
    return date.getDate() === now.getDate() &&
           date.getMonth() === now.getMonth() &&
           date.getFullYear() === now.getFullYear();
  }

  function isTaskScheduledForDate(task, date) {
    if (!task.days || task.days.length === 0) return true;
    return task.days.includes(date.getDay());
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── Persistence ────────────────────────────────────
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.categories)) state = parsed;
      }
    } catch (e) {}
  }

  // ── Theme ──────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    document.documentElement.setAttribute('data-theme', saved || 'dark');
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
  }

  // ── Toast ──────────────────────────────────────────
  function showToast(message) {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ── Color Picker Setup ─────────────────────────────
  function initColorPicker() {
    colorPickerEl.innerHTML = '';
    CATEGORY_COLORS.forEach((color, i) => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch' + (i === 0 ? ' selected' : '');
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.addEventListener('click', () => {
        $$('.color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        selectedColor = color;
      });
      colorPickerEl.appendChild(swatch);
    });
  }

  function selectColorInPicker(color) {
    selectedColor = color;
    $$('.color-swatch').forEach(s => {
      s.classList.toggle('selected', s.dataset.color === color);
    });
  }

  // ── Modal Helpers ──────────────────────────────────
  function openModal(overlay) {
    overlay.classList.add('active');
    setTimeout(() => {
      const input = overlay.querySelector('input[type="text"]');
      if (input) input.focus();
    }, 100);
  }

  function closeModal(overlay) {
    overlay.classList.remove('active');
    // Reset edit mode
    if (overlay === categoryOverlay) {
      editingCategoryId = null;
      $('#cat-modal-title').textContent = 'Yeni Kategori';
      $('#btn-confirm-category').textContent = 'Oluştur';
    }
    if (overlay === taskOverlay) {
      editingTaskId = null;
      editingTaskCatId = null;
      $('#task-modal-title').textContent = 'Yeni Görev';
      $('#btn-confirm-task').textContent = 'Görev Ekle';
    }
  }

  // ── Category CRUD ──────────────────────────────────
  function addCategory(name, color) {
    const cat = { id: uid(), name: name.trim(), color, tasks: [] };
    state.categories.push(cat);
    saveState();
    render();
    showToast(`"${cat.name}" kategorisi oluşturuldu`);
  }

  function updateCategory(catId, name, color) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return;
    cat.name = name.trim();
    cat.color = color;
    saveState();
    render();
    showToast(`"${cat.name}" güncellendi`);
  }

  function deleteCategory(catId) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return;
    cat.tasks.forEach(task => {
      Object.keys(state.completions).forEach(key => {
        if (key.startsWith(task.id + ':')) delete state.completions[key];
      });
    });
    state.categories = state.categories.filter(c => c.id !== catId);
    saveState();
    render();
    showToast(`"${cat.name}" kategorisi silindi`);
  }

  // ── Task CRUD ──────────────────────────────────────
  function addTask(catId, name, days) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return;
    const task = { id: uid(), name: name.trim(), days: days || [] };
    cat.tasks.push(task);
    saveState();
    render();
    showToast(`"${task.name}" görevi eklendi`);
  }

  function updateTask(catId, taskId, name, days) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return;
    const task = cat.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.name = name.trim();
    task.days = days || [];
    saveState();
    render();
    showToast(`"${task.name}" güncellendi`);
  }

  function deleteTask(catId, taskId) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return;
    const task = cat.tasks.find(t => t.id === taskId);
    if (!task) return;
    Object.keys(state.completions).forEach(key => {
      if (key.startsWith(taskId + ':')) delete state.completions[key];
    });
    cat.tasks = cat.tasks.filter(t => t.id !== taskId);
    saveState();
    render();
    showToast(`"${task.name}" görevi kaldırıldı`);
  }

  function moveTask(catId, taskId, direction) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return;
    const idx = cat.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= cat.tasks.length) return;
    // Swap
    [cat.tasks[idx], cat.tasks[newIdx]] = [cat.tasks[newIdx], cat.tasks[idx]];
    saveState();
    render();
  }

  // ── Toggle Completion ──────────────────────────────
  function toggleCompletion(taskId, dateKey) {
    const key = taskId + ':' + dateKey;
    if (state.completions[key]) delete state.completions[key];
    else state.completions[key] = true;
    saveState();
    render();
  }

  // ── Statistics ─────────────────────────────────────
  function getAllTasks() {
    const tasks = [];
    state.categories.forEach(cat => cat.tasks.forEach(t => tasks.push(t)));
    return tasks;
  }

  function getDayStats(dateKey, date) {
    const tasks = getAllTasks();
    if (tasks.length === 0) return { done: 0, total: 0, percent: 0 };
    const scheduled = tasks.filter(t => isTaskScheduledForDate(t, date));
    if (scheduled.length === 0) return { done: 0, total: 0, percent: 0 };
    let done = 0;
    scheduled.forEach(t => { if (state.completions[t.id + ':' + dateKey]) done++; });
    return { done, total: scheduled.length, percent: Math.round((done / scheduled.length) * 100) };
  }

  function getWeekStats(dates) {
    const tasks = getAllTasks();
    if (tasks.length === 0) return 0;
    let totalChecks = 0, maxChecks = 0;
    dates.forEach(d => {
      const dk = formatDateKey(d);
      tasks.forEach(t => {
        if (isTaskScheduledForDate(t, d)) {
          maxChecks++;
          if (state.completions[t.id + ':' + dk]) totalChecks++;
        }
      });
    });
    return maxChecks > 0 ? Math.round((totalChecks / maxChecks) * 100) : 0;
  }

  // ── Week Archive ───────────────────────────────────
  function computeWeekStatsForDates(startDateStr, numDays) {
    const tasks = getAllTasks();
    if (tasks.length === 0) return { done: 0, total: 0, percent: 0 };
    let done = 0, total = 0;
    for (let i = 0; i < numDays; i++) {
      const d = new Date(startDateStr);
      d.setDate(d.getDate() + i);
      const dk = formatDateKey(d);
      tasks.forEach(t => {
        if (isTaskScheduledForDate(t, d)) {
          total++;
          if (state.completions[t.id + ':' + dk]) done++;
        }
      });
    }
    return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  function archiveCurrentWeek() {
    if (!state.currentWeekStart) return;
    const stats = computeWeekStatsForDates(state.currentWeekStart, 7);
    if (stats.total === 0) return;
    const startDate = state.currentWeekStart;
    const endD = new Date(startDate); endD.setDate(endD.getDate() + 6);
    const endDate = formatDateKey(endD);
    if (state.weekHistory.some(w => w.startDate === startDate)) return;

    // Build detailed per-category, per-task, per-day data
    const detailCategories = [];
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      weekDates.push({ date: formatDateKey(d), dayName: DAY_NAMES_SHORT[d.getDay()] });
    }

    state.categories.forEach(cat => {
      const tasks = [];
      cat.tasks.forEach(task => {
        const days = {};
        weekDates.forEach(wd => {
          const d = new Date(wd.date);
          const scheduled = isTaskScheduledForDate(task, d);
          const completed = !!state.completions[task.id + ':' + wd.date];
          days[wd.date] = { scheduled, completed };
        });
        tasks.push({ name: task.name, days });
      });
      if (tasks.length > 0) {
        detailCategories.push({ name: cat.name, color: cat.color, tasks });
      }
    });

    state.weekHistory.push({
      id: uid(), startDate, endDate,
      percent: stats.percent, done: stats.done, total: stats.total,
      archivedAt: new Date().toISOString(),
      weekDates,
      detail: detailCategories,
    });
  }

  function checkAutoArchive() {
    const today = new Date(); today.setHours(0,0,0,0);
    const thisMonday = getMonday(today);
    const thisMondayStr = formatDateKey(thisMonday);
    if (!state.currentWeekStart) { state.currentWeekStart = thisMondayStr; saveState(); return; }
    const savedMonday = new Date(state.currentWeekStart);
    if (savedMonday < thisMonday) {
      archiveCurrentWeek();
      const nextWeek = new Date(savedMonday); nextWeek.setDate(nextWeek.getDate() + 7);
      while (nextWeek < thisMonday) {
        const weekStart = formatDateKey(nextWeek);
        const stats = computeWeekStatsForDates(weekStart, 7);
        if (stats.total > 0 && !state.weekHistory.some(w => w.startDate === weekStart)) {
          const endD = new Date(nextWeek); endD.setDate(endD.getDate() + 6);
          state.weekHistory.push({ id: uid(), startDate: weekStart, endDate: formatDateKey(endD), percent: stats.percent, done: stats.done, total: stats.total, archivedAt: new Date().toISOString() });
        }
        nextWeek.setDate(nextWeek.getDate() + 7);
      }
      state.currentWeekStart = thisMondayStr; saveState();
    }
  }

  function deleteHistoryEntry(id) {
    state.weekHistory = state.weekHistory.filter(w => w.id !== id);
    saveState(); renderHistory();
  }

  // ── Helpers ────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function formatRelativeDate(isoStr) {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Az önce';
    if (diffMin < 60) return `${diffMin} dk önce`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} saat önce`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay} gün önce`;
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ── Notes CRUD ────────────────────────────────────
  function addNote(title, content, color, pinned, tags, dueDate) {
    const note = {
      id: uid(),
      title: title.trim(),
      content: content.trim(),
      color: color || '',
      pinned: !!pinned,
      tags: tags || [],
      dueDate: dueDate || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.notes.push(note);
    saveState();
    renderNotes();
    showToast(`"${note.title}" notu eklendi`);
  }

  function updateNote(noteId, title, content, color, pinned, tags, dueDate) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;
    note.title = title.trim();
    note.content = content.trim();
    note.color = color || '';
    note.pinned = !!pinned;
    note.tags = tags || [];
    note.dueDate = dueDate || '';
    note.updatedAt = new Date().toISOString();
    saveState();
    renderNotes();
    showToast(`"${note.title}" güncellendi`);
  }

  function deleteNote(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;
    state.notes = state.notes.filter(n => n.id !== noteId);
    saveState();
    renderNotes();
    showToast(`"${note.title}" silindi`);
  }

  function toggleNotePin(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;
    note.pinned = !note.pinned;
    note.updatedAt = new Date().toISOString();
    saveState();
    renderNotes();
  }

  // ── Render ─────────────────────────────────────────
  function render() {
    const dates = getWeekDates();
    renderHead(dates);
    renderBody(dates);
    renderFoot(dates);
    renderWeekSummary(dates);
    renderNotes();
    renderHistory();
  }

  function renderHead(dates) {
    let html = '<tr><th>Görev</th>';
    dates.forEach(d => {
      const todayClass = isToday(d) ? ' today' : '';
      html += `<th class="${todayClass}">
        <span class="date-day">${formatDayName(d)}</span>
        <span class="date-label">${formatDateShort(d)}</span>
      </th>`;
    });
    html += '</tr>';
    tableHead.innerHTML = html;
  }

  function renderBody(dates) {
    if (state.categories.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="${dates.length + 1}">
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          <h3>Henüz kategori yok</h3>
          <p>Görevlerinizi takip etmeye başlamak için "Kategori Ekle" butonuna tıklayın.</p>
        </div></td></tr>`;
      return;
    }

    let html = '';

    state.categories.forEach((cat, catIdx) => {
      const colorBg = hexToRgba(cat.color, 0.08);
      const colorBorder = hexToRgba(cat.color, 0.3);

      // Spacer row between categories
      if (catIdx > 0) {
        html += `<tr class="cat-spacer"><td colspan="${dates.length + 1}"></td></tr>`;
      }

      // Category header row
      html += `<tr class="category-row fade-in-up" style="--cat-color:${cat.color}; --cat-bg:${colorBg}; --cat-border:${colorBorder}">`;
      html += `<td colspan="${dates.length + 1}" style="background:${colorBg}; border-left:4px solid ${cat.color}">
        <div class="category-header">
          <div class="category-color-dot" style="background:${cat.color}"></div>
          <span class="category-name cat-edit-btn" data-cat-id="${cat.id}" title="Düzenlemek için tıkla">${escapeHtml(cat.name)}</span>
          <div class="category-actions">
            <button class="cat-btn edit" data-cat-id="${cat.id}" title="Düzenle" style="color:${cat.color}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="cat-btn add" data-cat-id="${cat.id}" title="Görev ekle" style="color:${cat.color}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="cat-btn delete" data-cat-id="${cat.id}" title="Kategoriyi sil">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      </td>`;
      html += `</tr>`;

      // Task rows
      if (cat.tasks.length === 0) {
        html += `<tr class="task-row fade-in-up" style="--cat-color:${cat.color}">
          <td colspan="${dates.length + 1}" style="border-left:4px solid ${hexToRgba(cat.color, 0.15)}">
            <span style="font-size:0.8rem; color:var(--text-tertiary); padding-left: 1rem;">Görev yok — eklemek için + butonuna tıklayın</span>
          </td></tr>`;
      } else {
        cat.tasks.forEach((task, taskIdx) => {
          let dayBadges = '';
          if (task.days && task.days.length > 0) {
            dayBadges = '<span class="task-days">' + task.days.map(d => `<span class="task-day-badge">${DAY_NAMES_SHORT[d]}</span>`).join('') + '</span>';
          }
          html += `<tr class="task-row fade-in-up" data-task-id="${task.id}" data-cat-id="${cat.id}" draggable="true">`;
          html += `<td style="border-left:4px solid ${hexToRgba(cat.color, 0.15)}">
            <div class="task-label">
              <span class="drag-handle" title="Sıralamak için sürükle">⠿</span>
              <div class="task-color-bar" style="background:${cat.color}"></div>
              <span class="task-name task-edit-btn" data-cat-id="${cat.id}" data-task-id="${task.id}" title="Düzenlemek için tıkla">${escapeHtml(task.name)}</span>
              ${dayBadges}
              <div class="task-row-actions">
                <button class="task-move-btn" data-cat-id="${cat.id}" data-task-id="${task.id}" data-dir="-1" title="Yukarı taşı" ${taskIdx === 0 ? 'disabled' : ''}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"/></svg>
                </button>
                <button class="task-move-btn" data-cat-id="${cat.id}" data-task-id="${task.id}" data-dir="1" title="Aşağı taşı" ${taskIdx === cat.tasks.length - 1 ? 'disabled' : ''}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <button class="task-delete-btn" data-cat-id="${cat.id}" data-task-id="${task.id}" title="Görevi sil">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
          </td>`;
          dates.forEach(d => {
            const dk = formatDateKey(d);
            const todayClass = isToday(d) ? ' today-col' : '';
            if (isTaskScheduledForDate(task, d)) {
              const checked = state.completions[task.id + ':' + dk] ? ' checked' : '';
              html += `<td class="${todayClass}" style="border-left:none"><div class="cell-check${checked}" data-task-id="${task.id}" data-date="${dk}" style="--check-active:${cat.color}"></div></td>`;
            } else {
              html += `<td class="${todayClass}"><div class="cell-inactive"></div></td>`;
            }
          });
          html += `</tr>`;
        });
      }
    });

    tableBody.innerHTML = html;

    // ── Attach Events ──
    tableBody.querySelectorAll('.cell-check').forEach(el => {
      el.addEventListener('click', () => toggleCompletion(el.dataset.taskId, el.dataset.date));
    });

    // Category add task
    tableBody.querySelectorAll('.cat-btn.add').forEach(el => {
      el.addEventListener('click', () => {
        editingTaskId = null; editingTaskCatId = null;
        addingTaskToCategoryId = el.dataset.catId;
        taskNameInput.value = '';
        $('#task-modal-title').textContent = 'Yeni Görev';
        $('#btn-confirm-task').textContent = 'Görev Ekle';
        $$('#day-picker .day-chip').forEach(c => c.classList.remove('selected'));
        openModal(taskOverlay);
      });
    });

    // Category edit
    tableBody.querySelectorAll('.cat-btn.edit, .cat-edit-btn').forEach(el => {
      el.addEventListener('click', () => {
        const catId = el.dataset.catId;
        const cat = state.categories.find(c => c.id === catId);
        if (!cat) return;
        editingCategoryId = catId;
        categoryNameInput.value = cat.name;
        selectColorInPicker(cat.color);
        $('#cat-modal-title').textContent = 'Kategori Düzenle';
        $('#btn-confirm-category').textContent = 'Kaydet';
        openModal(categoryOverlay);
      });
    });

    // Category delete
    tableBody.querySelectorAll('.cat-btn.delete').forEach(el => {
      el.addEventListener('click', () => {
        const catId = el.dataset.catId;
        const cat = state.categories.find(c => c.id === catId);
        if (cat && confirm(`"${cat.name}" kategorisini ve tüm görevlerini silmek istiyor musunuz?`)) {
          deleteCategory(catId);
        }
      });
    });

    // Task edit (click on name)
    tableBody.querySelectorAll('.task-edit-btn').forEach(el => {
      el.addEventListener('click', () => {
        const catId = el.dataset.catId;
        const taskId = el.dataset.taskId;
        const cat = state.categories.find(c => c.id === catId);
        if (!cat) return;
        const task = cat.tasks.find(t => t.id === taskId);
        if (!task) return;
        editingTaskId = taskId;
        editingTaskCatId = catId;
        addingTaskToCategoryId = null;
        taskNameInput.value = task.name;
        $('#task-modal-title').textContent = 'Görev Düzenle';
        $('#btn-confirm-task').textContent = 'Kaydet';
        // Set day picker
        $$('#day-picker .day-chip').forEach(c => c.classList.remove('selected'));
        if (task.days && task.days.length > 0) {
          task.days.forEach(d => {
            const chip = $(`#day-picker .day-chip[data-day="${d}"]`);
            if (chip) chip.classList.add('selected');
          });
          // Sync "Tümü"
          const dayChips = $$('#day-picker .day-chip:not(.day-chip-all)');
          const allSelected = [...dayChips].every(c => c.classList.contains('selected'));
          $('#day-picker .day-chip-all').classList.toggle('selected', allSelected);
        }
        openModal(taskOverlay);
      });
    });

    // Task delete
    tableBody.querySelectorAll('.task-delete-btn').forEach(el => {
      el.addEventListener('click', () => deleteTask(el.dataset.catId, el.dataset.taskId));
    });

    // Task move buttons
    tableBody.querySelectorAll('.task-move-btn').forEach(el => {
      el.addEventListener('click', () => {
        moveTask(el.dataset.catId, el.dataset.taskId, parseInt(el.dataset.dir));
      });
    });

    // Drag & drop for reordering
    setupDragAndDrop();
  }

  // ── Drag & Drop ────────────────────────────────────
  function setupDragAndDrop() {
    // Only bind dragstart/dragend to new rows (per render)
    const rows = tableBody.querySelectorAll('.task-row[draggable]');
    rows.forEach(row => {
      row.addEventListener('dragstart', (e) => {
        dragSrcTaskId = row.dataset.taskId;
        dragSrcCatId = row.dataset.catId;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.dataset.taskId);
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        tableBody.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
        dragSrcTaskId = null;
        dragSrcCatId = null;
      });
    });
  }

  // Called once from bindEvents — event delegation for drop targets  
  function initDragDelegation() {
    tableBody.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const targetRow = e.target.closest('.task-row[draggable]');
      if (!targetRow) return;
      if (!targetRow.dataset.taskId || targetRow.dataset.catId !== dragSrcCatId) return;
      if (targetRow.dataset.taskId === dragSrcTaskId) return;
      tableBody.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
      targetRow.classList.add('drag-over');
    });

    tableBody.addEventListener('dragleave', (e) => {
      const targetRow = e.target.closest('.task-row[draggable]');
      if (targetRow) targetRow.classList.remove('drag-over');
    });

    tableBody.addEventListener('drop', (e) => {
      e.preventDefault();
      tableBody.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
      if (!dragSrcTaskId || !dragSrcCatId) return;
      const targetRow = e.target.closest('.task-row[draggable]');
      if (!targetRow || !targetRow.dataset.taskId) return;
      if (targetRow.dataset.catId !== dragSrcCatId) return;
      if (targetRow.dataset.taskId === dragSrcTaskId) return;
      const cat = state.categories.find(c => c.id === dragSrcCatId);
      if (!cat) return;
      const fromIdx = cat.tasks.findIndex(t => t.id === dragSrcTaskId);
      const toIdx = cat.tasks.findIndex(t => t.id === targetRow.dataset.taskId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = cat.tasks.splice(fromIdx, 1);
      cat.tasks.splice(toIdx, 0, moved);
      dragSrcTaskId = null;
      dragSrcCatId = null;
      saveState();
      render();
    });
  }

  function renderFoot(dates) {
    const tasks = getAllTasks();
    if (tasks.length === 0) { tableFoot.innerHTML = ''; return; }

    let html = '<tr><td>Günlük Skor</td>';
    dates.forEach(d => {
      const dk = formatDateKey(d);
      const stats = getDayStats(dk, d);
      const pClass = stats.percent >= 75 ? 'high' : stats.percent >= 40 ? 'mid' : 'low';
      html += `<td><span class="stat-fraction">${stats.done}/${stats.total}</span><span class="stat-percent ${pClass}">${stats.percent}%</span></td>`;
    });
    html += '</tr>';

    const weekPct = getWeekStats(dates);
    const pClass = weekPct >= 75 ? 'high' : weekPct >= 40 ? 'mid' : 'low';
    html += `<tr class="weekly-row"><td>Haftalık Skor</td><td colspan="${dates.length}"><span class="stat-percent ${pClass}" style="font-size:1.1rem;">${weekPct}%</span></td></tr>`;
    tableFoot.innerHTML = html;
  }

  function renderWeekSummary(dates) {
    const weekPct = getWeekStats(dates);
    weekPercentEl.textContent = weekPct + '%';
    weekBarFill.style.width = weekPct + '%';
  }

  function renderHistory() {
    const section = $('#history-section');
    const listEl = $('#history-list');
    const countEl = $('#history-count');
    const history = state.weekHistory || [];
    if (history.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    countEl.textContent = history.length + ' hafta';
    const sorted = [...history].sort((a, b) => b.startDate.localeCompare(a.startDate));
    let html = '';
    sorted.forEach(week => {
      const pClass = week.percent >= 75 ? 'high' : week.percent >= 40 ? 'mid' : 'low';
      const emoji = week.percent >= 90 ? '🏆' : week.percent >= 75 ? '🔥' : week.percent >= 50 ? '💪' : week.percent >= 25 ? '📈' : '🌱';
      html += `<div class="history-card fade-in-up">
        <button class="history-card-delete" data-history-id="${week.id}" title="Sil"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <div class="history-card-top"><span class="history-card-dates">${formatDateRange(week.startDate, week.endDate)}</span><span class="history-card-emoji">${emoji}</span></div>
        <div class="history-card-score"><span class="history-card-percent ${pClass}">${week.percent}%</span><span class="history-card-detail">${week.done}/${week.total} tamamlandı</span></div>
        <div class="history-card-bar"><div class="history-card-bar-fill ${pClass}" style="width:${week.percent}%"></div></div>
        <button class="history-card-view-btn" data-history-id="${week.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Detay Gör
        </button>
      </div>`;
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll('.history-card-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteHistoryEntry(btn.dataset.historyId));
    });
    listEl.querySelectorAll('.history-card-view-btn').forEach(btn => {
      btn.addEventListener('click', () => showHistoryDetail(btn.dataset.historyId));
    });
  }

  // ── Render Notes ──────────────────────────────────
  function renderNotes() {
    const grid = $('#notes-grid');
    const countEl = $('#notes-count');
    const notes = state.notes || [];

    countEl.textContent = notes.length > 0 ? notes.length + ' not' : '';

    if (notes.length === 0 && !noteSearchQuery) {
      grid.innerHTML = `<div class="notes-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h3>Henüz not yok</h3>
        <p>Önemli notlarınızı kaydetmek için "Yeni Not" butonuna tıklayın.</p>
      </div>`;
      return;
    }

    // Filter by search
    let filtered = [...notes];
    if (noteSearchQuery) {
      const q = noteSearchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        (n.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    // Sort: pinned first, then by updatedAt desc
    filtered.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="notes-empty"><p>"${escapeHtml(noteSearchQuery)}" için sonuç bulunamadı.</p></div>`;
      return;
    }

    let html = '';
    filtered.forEach(note => {
      const accentBg = note.color ? note.color : 'var(--accent-primary)';
      const accentOpacity = note.color ? '1' : '0.3';
      const tagHtml = (note.tags || []).map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join('');
      const pinHtml = note.pinned ? `<svg class="note-card-pin" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v5.76z"/></svg>` : '';

      // Due date badge
      let dueDateHtml = '';
      if (note.dueDate) {
        const dueD = new Date(note.dueDate + 'T00:00:00');
        const today = new Date(); today.setHours(0,0,0,0);
        const diffDays = Math.round((dueD - today) / 86400000);
        let dueClass = 'future';
        let dueLabel = '';
        if (diffDays < 0) { dueClass = 'past'; dueLabel = Math.abs(diffDays) + ' gün geçti'; }
        else if (diffDays === 0) { dueClass = 'today'; dueLabel = 'Bugün!'; }
        else if (diffDays === 1) { dueClass = 'future'; dueLabel = 'Yarın'; }
        else { dueLabel = dueD.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }); }
        dueDateHtml = `<span class="note-card-due ${dueClass}">📅 ${dueLabel}</span>`;
      }

      // Created date
      const createdStr = new Date(note.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      html += `<div class="note-card fade-in-up" data-note-id="${note.id}">
        <div class="note-card-accent" style="background:${accentBg}; opacity:${accentOpacity}"></div>
        <div class="note-card-body">
          <div class="note-card-top">
            <span class="note-card-title">${escapeHtml(note.title || 'Başlıksız')}</span>
            ${pinHtml}
          </div>
          ${dueDateHtml}
          ${note.content ? `<div class="note-card-content">${escapeHtml(note.content)}</div>` : ''}
          <div class="note-card-footer">
            <div class="note-card-tags">${tagHtml}</div>
            <span class="note-card-date">${formatRelativeDate(note.updatedAt)}</span>
          </div>
          <div class="note-card-meta">
            <span class="note-card-created">Oluşturulma: ${createdStr}</span>
          </div>
        </div>
      </div>`;
    });

    grid.innerHTML = html;

    // Click to edit
    grid.querySelectorAll('.note-card').forEach(card => {
      card.addEventListener('click', () => openNoteEditor(card.dataset.noteId));
    });
  }

  function openNoteEditor(noteId) {
    const noteOverlay = $('#modal-note-overlay');
    const titleInput = $('#input-note-title');
    const contentInput = $('#input-note-content');
    const tagsInput = $('#input-note-tags');
    const dateInput = $('#input-note-date');
    const pinBtn = $('#note-pin-toggle');
    const deleteBtn = $('#btn-delete-note');

    if (noteId) {
      // Edit mode
      const note = state.notes.find(n => n.id === noteId);
      if (!note) return;
      editingNoteId = noteId;
      titleInput.value = note.title;
      contentInput.value = note.content;
      tagsInput.value = (note.tags || []).join(', ');
      dateInput.value = note.dueDate || '';
      noteSelectedColor = note.color || '';
      notePinned = note.pinned;
      $('#note-modal-title').textContent = 'Notu Düzenle';
      deleteBtn.style.display = 'inline-flex';
    } else {
      // New note
      editingNoteId = null;
      titleInput.value = '';
      contentInput.value = '';
      tagsInput.value = '';
      dateInput.value = '';
      noteSelectedColor = '';
      notePinned = false;
      $('#note-modal-title').textContent = 'Yeni Not';
      deleteBtn.style.display = 'none';
    }

    // Sync color picker
    $$('#note-color-picker .note-color-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.color === noteSelectedColor);
    });
    // Sync pin
    pinBtn.classList.toggle('active', notePinned);

    openModal(noteOverlay);
  }

  function showHistoryDetail(weekId) {
    const week = (state.weekHistory || []).find(w => w.id === weekId);
    if (!week) return;

    const historyOverlay = $('#modal-history-overlay');
    const pClass = week.percent >= 75 ? 'high' : week.percent >= 40 ? 'mid' : 'low';

    // Title
    $('#history-detail-title').textContent = formatDateRange(week.startDate, week.endDate);

    // Summary
    $('#history-detail-summary').innerHTML = `
      <span class="history-detail-big-percent ${pClass}">${week.percent}%</span>
      <div class="history-detail-meta">
        <strong>${week.done}/${week.total}</strong> görev tamamlandı
      </div>`;

    // Detail table
    const tableEl = $('#history-detail-table');
    if (!week.detail || !week.weekDates) {
      tableEl.innerHTML = '<tr><td style="padding:1rem; color:var(--text-tertiary)">Bu haftanın detay verisi bulunmuyor (eski arşiv).</td></tr>';
    } else {
      let html = '<thead><tr><th>Görev</th>';
      week.weekDates.forEach(wd => {
        html += `<th>${wd.dayName}</th>`;
      });
      html += '</tr></thead><tbody>';

      week.detail.forEach(cat => {
        html += `<tr class="cat-label-row"><td colspan="${week.weekDates.length + 1}" style="border-left:4px solid ${cat.color}">
          <span style="color:${cat.color}">●</span> ${escapeHtml(cat.name)}</td></tr>`;
        cat.tasks.forEach(task => {
          html += `<tr><td>${escapeHtml(task.name)}</td>`;
          week.weekDates.forEach(wd => {
            const info = task.days[wd.date];
            if (!info || !info.scheduled) {
              html += `<td><span class="detail-check na">—</span></td>`;
            } else if (info.completed) {
              html += `<td><span class="detail-check done">✓</span></td>`;
            } else {
              html += `<td><span class="detail-check missed">✗</span></td>`;
            }
          });
          html += '</tr>';
        });
      });
      html += '</tbody>';
      tableEl.innerHTML = html;
    }

    openModal(historyOverlay);
  }

  // ── Event Bindings ─────────────────────────────────
  function bindEvents() {
    $('#btn-theme-toggle').addEventListener('click', toggleTheme);

    // Init drag delegation once
    initDragDelegation();

    $('#history-toggle').addEventListener('click', () => {
      $('#history-toggle').classList.toggle('open');
      $('#history-panel').classList.toggle('open');
    });

    // Add category (new)
    $('#btn-add-category').addEventListener('click', () => {
      editingCategoryId = null;
      categoryNameInput.value = '';
      selectedColor = CATEGORY_COLORS[0];
      $$('.color-swatch').forEach((s, i) => s.classList.toggle('selected', i === 0));
      $('#cat-modal-title').textContent = 'Yeni Kategori';
      $('#btn-confirm-category').textContent = 'Oluştur';
      openModal(categoryOverlay);
    });

    // Category modal confirm (add or edit)
    $('#modal-close').addEventListener('click', () => closeModal(categoryOverlay));
    $('#btn-cancel-category').addEventListener('click', () => closeModal(categoryOverlay));
    $('#btn-confirm-category').addEventListener('click', () => {
      const name = categoryNameInput.value.trim();
      if (!name) { categoryNameInput.focus(); return; }
      if (editingCategoryId) {
        updateCategory(editingCategoryId, name, selectedColor);
      } else {
        addCategory(name, selectedColor);
      }
      closeModal(categoryOverlay);
    });
    categoryNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-confirm-category').click(); });
    categoryOverlay.addEventListener('click', (e) => { if (e.target === categoryOverlay) closeModal(categoryOverlay); });

    // Task modal
    $('#modal-task-close').addEventListener('click', () => closeModal(taskOverlay));
    $('#btn-cancel-task').addEventListener('click', () => closeModal(taskOverlay));

    $$('#day-picker .day-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (chip.dataset.day === 'all') {
          const dayChips = $$('#day-picker .day-chip:not(.day-chip-all)');
          const allSelected = [...dayChips].every(c => c.classList.contains('selected'));
          dayChips.forEach(c => c.classList.toggle('selected', !allSelected));
          chip.classList.toggle('selected', !allSelected);
        } else {
          chip.classList.toggle('selected');
          const dayChips = $$('#day-picker .day-chip:not(.day-chip-all)');
          const allSelected = [...dayChips].every(c => c.classList.contains('selected'));
          $('#day-picker .day-chip-all').classList.toggle('selected', allSelected);
        }
      });
    });

    // Task modal confirm (add or edit)
    $('#btn-confirm-task').addEventListener('click', () => {
      const name = taskNameInput.value.trim();
      if (!name) { taskNameInput.focus(); return; }
      const selectedDays = [];
      $$('#day-picker .day-chip.selected:not(.day-chip-all)').forEach(chip => {
        selectedDays.push(parseInt(chip.dataset.day));
      });
      if (editingTaskId && editingTaskCatId) {
        updateTask(editingTaskCatId, editingTaskId, name, selectedDays);
      } else if (addingTaskToCategoryId) {
        addTask(addingTaskToCategoryId, name, selectedDays);
      }
      closeModal(taskOverlay);
    });
    taskNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-confirm-task').click(); });
    taskOverlay.addEventListener('click', (e) => { if (e.target === taskOverlay) closeModal(taskOverlay); });

    // Reset week
    $('#btn-reset-week').addEventListener('click', () => {
      if (confirm('Bu haftayı arşivleyip sıfırlamak istiyor musunuz?')) {
        archiveCurrentWeek();
        state.completions = {};
        const today = new Date(); today.setHours(0,0,0,0);
        state.currentWeekStart = formatDateKey(getMonday(today));
        saveState(); render();
        showToast('Hafta arşivlendi ve sıfırlandı');
      }
    });
    // History detail modal
    const historyOverlay = $('#modal-history-overlay');
    $('#modal-history-close').addEventListener('click', () => closeModal(historyOverlay));
    $('#btn-close-history-detail').addEventListener('click', () => closeModal(historyOverlay));
    historyOverlay.addEventListener('click', (e) => { if (e.target === historyOverlay) closeModal(historyOverlay); });

    // ── Notes ──
    const noteOverlay = $('#modal-note-overlay');

    $('#btn-add-note').addEventListener('click', () => openNoteEditor(null));

    $('#modal-note-close').addEventListener('click', () => closeModal(noteOverlay));
    $('#btn-cancel-note').addEventListener('click', () => closeModal(noteOverlay));
    noteOverlay.addEventListener('click', (e) => { if (e.target === noteOverlay) closeModal(noteOverlay); });

    // Note color picker
    $$('#note-color-picker .note-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#note-color-picker .note-color-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        noteSelectedColor = btn.dataset.color;
      });
    });

    // Note pin toggle
    $('#note-pin-toggle').addEventListener('click', () => {
      notePinned = !notePinned;
      $('#note-pin-toggle').classList.toggle('active', notePinned);
    });

    // Note save
    $('#btn-confirm-note').addEventListener('click', () => {
      const title = $('#input-note-title').value.trim();
      const content = $('#input-note-content').value.trim();
      if (!title && !content) { $('#input-note-title').focus(); return; }
      const tagsRaw = $('#input-note-tags').value.trim();
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(t => t) : [];
      const dueDate = $('#input-note-date').value;
      if (editingNoteId) {
        updateNote(editingNoteId, title || 'Başlıksız', content, noteSelectedColor, notePinned, tags, dueDate);
      } else {
        addNote(title || 'Başlıksız', content, noteSelectedColor, notePinned, tags, dueDate);
      }
      closeModal(noteOverlay);
    });

    // Note delete
    $('#btn-delete-note').addEventListener('click', () => {
      if (editingNoteId && confirm('Bu notu silmek istiyor musunuz?')) {
        deleteNote(editingNoteId);
        closeModal(noteOverlay);
      }
    });

    // Notes search (live)
    $('#notes-search').addEventListener('input', (e) => {
      noteSearchQuery = e.target.value.trim();
      renderNotes();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeModal(categoryOverlay); closeModal(taskOverlay); closeModal(historyOverlay); closeModal(noteOverlay); }
    });
  }

  // ── Midnight Auto-Refresh ──────────────────────────
  function scheduleMidnightRefresh() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 5, 0);
    setTimeout(() => {
      checkAutoArchive(); render();
      showToast('Yeni gün başladı — tarihler güncellendi ✨');
      scheduleMidnightRefresh();
    }, midnight - now);
  }

  // ── Visitor Counter ─────────────────────────────────
  function trackVisitor() {
    const el = $('#visitor-count');
    const COUNTER_KEY = 'taskgrid-halid-visitor';

    // Use CounterAPI (free, no signup)
    fetch(`https://api.counterapi.dev/v1/${COUNTER_KEY}/up`, {
      method: 'GET',
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.count !== undefined) {
          el.textContent = data.count.toLocaleString('tr-TR');
          el.title = `Toplam ${data.count} ziyaret`;
        }
      })
      .catch(() => {
        // Fallback: hide badge if API is unreachable
        el.textContent = '—';
      });
  }

  // ── Initialize ─────────────────────────────────────
  function init() {
    initTheme();
    initColorPicker();
    loadState();
    if (!state.weekHistory) state.weekHistory = [];
    if (!state.notes) state.notes = [];
    checkAutoArchive();
    bindEvents();
    render();
    scheduleMidnightRefresh();
    trackVisitor();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
