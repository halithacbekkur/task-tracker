/* ============================================
   TaskGrid — Application Logic
   ============================================ */

(() => {
  'use strict';

  // ── Constants ──────────────────────────────────────
  const STORAGE_KEY = 'taskgrid_data';
  const THEME_KEY = 'taskgrid_theme';
  const NUM_DAYS = 7;

  const CATEGORY_COLORS = [
    '#7c5cfc', '#5ce0d8', '#f472b6', '#fbbf24',
    '#34d399', '#60a5fa', '#f87171', '#a78bfa',
    '#fb923c', '#22d3ee', '#e879f9', '#84cc16',
  ];

  const DAY_NAMES_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

  // ── DOM References ─────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const tableHead = $('#table-head');
  const tableBody = $('#table-body');
  const tableFoot = $('#table-foot');
  const weekPercentEl = $('#week-percent');
  const weekBarFill = $('#week-bar-fill');

  // Category modal
  const categoryOverlay = $('#modal-overlay');
  const categoryNameInput = $('#input-category-name');
  const colorPickerEl = $('#color-picker');

  // Task modal
  const taskOverlay = $('#modal-task-overlay');
  const taskNameInput = $('#input-task-name');

  // ── State ──────────────────────────────────────────
  let state = {
    categories: [],
    // completions: { "taskId:YYYY-MM-DD": true }
    completions: {},
    // weekHistory: [{ id, startDate, endDate, percent, done, total, archivedAt }]
    weekHistory: [],
    // currentWeekStart: "YYYY-MM-DD" — Monday of the active week
    currentWeekStart: null,
  };

  let selectedColor = CATEGORY_COLORS[0];
  let addingTaskToCategoryId = null;

  // ── Date Helpers ───────────────────────────────────
  function getWeekDates() {
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < NUM_DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    return dates;
  }

  function getMonday(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
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
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
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
    // If no days specified (empty array or undefined), task is active every day
    if (!task.days || task.days.length === 0) return true;
    return task.days.includes(date.getDay());
  }

  // ── ID Generator ───────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── Persistence ────────────────────────────────────
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.categories)) {
          state = parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
  }

  // ── Theme ──────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      // Default to dark
      document.documentElement.setAttribute('data-theme', 'dark');
    }
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
  }

  // ── Category CRUD ──────────────────────────────────
  function addCategory(name, color) {
    const cat = {
      id: uid(),
      name: name.trim(),
      color: color,
      tasks: [],
    };
    state.categories.push(cat);
    saveState();
    render();
    showToast(`"${cat.name}" kategorisi oluşturuldu`);
  }

  function deleteCategory(catId) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return;
    // Clean up completions for tasks in this category
    cat.tasks.forEach(task => {
      Object.keys(state.completions).forEach(key => {
        if (key.startsWith(task.id + ':')) {
          delete state.completions[key];
        }
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
    const task = {
      id: uid(),
      name: name.trim(),
      days: days || [], // array of day numbers (0=Paz, 1=Pzt, etc.), empty = her gün
    };
    cat.tasks.push(task);
    saveState();
    render();
    showToast(`"${task.name}" görevi eklendi`);
  }

  function deleteTask(catId, taskId) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return;
    const task = cat.tasks.find(t => t.id === taskId);
    if (!task) return;
    // Clean up completions
    Object.keys(state.completions).forEach(key => {
      if (key.startsWith(taskId + ':')) {
        delete state.completions[key];
      }
    });
    cat.tasks = cat.tasks.filter(t => t.id !== taskId);
    saveState();
    render();
    showToast(`"${task.name}" görevi kaldırıldı`);
  }

  // ── Toggle Completion ──────────────────────────────
  function toggleCompletion(taskId, dateKey) {
    const key = taskId + ':' + dateKey;
    if (state.completions[key]) {
      delete state.completions[key];
    } else {
      state.completions[key] = true;
    }
    saveState();
    render();
  }

  // ── Statistics ─────────────────────────────────────
  function getAllTasks() {
    const tasks = [];
    state.categories.forEach(cat => {
      cat.tasks.forEach(t => tasks.push(t));
    });
    return tasks;
  }

  function getDayStats(dateKey, date) {
    const tasks = getAllTasks();
    if (tasks.length === 0) return { done: 0, total: 0, percent: 0 };
    // Only count tasks scheduled for this day
    const scheduled = tasks.filter(t => isTaskScheduledForDate(t, date));
    if (scheduled.length === 0) return { done: 0, total: 0, percent: 0 };
    let done = 0;
    scheduled.forEach(t => {
      if (state.completions[t.id + ':' + dateKey]) done++;
    });
    return {
      done,
      total: scheduled.length,
      percent: Math.round((done / scheduled.length) * 100),
    };
  }

  function getWeekStats(dates) {
    const tasks = getAllTasks();
    if (tasks.length === 0) return 0;
    let totalChecks = 0;
    let maxChecks = 0;
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
    let done = 0;
    let total = 0;
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
    return {
      done,
      total,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }

  function archiveCurrentWeek() {
    if (!state.currentWeekStart) return;
    const stats = computeWeekStatsForDates(state.currentWeekStart, 7);
    // Only archive if there were any scheduled tasks
    if (stats.total === 0) return;
    const startDate = state.currentWeekStart;
    const endD = new Date(startDate);
    endD.setDate(endD.getDate() + 6);
    const endDate = formatDateKey(endD);
    // Avoid duplicate archives for the same week
    const exists = state.weekHistory.some(w => w.startDate === startDate);
    if (exists) return;
    state.weekHistory.push({
      id: uid(),
      startDate,
      endDate,
      percent: stats.percent,
      done: stats.done,
      total: stats.total,
      archivedAt: new Date().toISOString(),
    });
  }

  function checkAutoArchive() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonday = getMonday(today);
    const thisMondayStr = formatDateKey(thisMonday);

    if (!state.currentWeekStart) {
      // First time — set to this Monday
      state.currentWeekStart = thisMondayStr;
      saveState();
      return;
    }

    // If current week start is before this Monday, archive past weeks
    const savedMonday = new Date(state.currentWeekStart);
    if (savedMonday < thisMonday) {
      // Archive the old week
      archiveCurrentWeek();
      // Also archive any skipped weeks in between (if the user was away)
      const nextWeek = new Date(savedMonday);
      nextWeek.setDate(nextWeek.getDate() + 7);
      while (nextWeek < thisMonday) {
        const weekStart = formatDateKey(nextWeek);
        const stats = computeWeekStatsForDates(weekStart, 7);
        if (stats.total > 0) {
          const endD = new Date(nextWeek);
          endD.setDate(endD.getDate() + 6);
          const exists = state.weekHistory.some(w => w.startDate === weekStart);
          if (!exists) {
            state.weekHistory.push({
              id: uid(),
              startDate: weekStart,
              endDate: formatDateKey(endD),
              percent: stats.percent,
              done: stats.done,
              total: stats.total,
              archivedAt: new Date().toISOString(),
            });
          }
        }
        nextWeek.setDate(nextWeek.getDate() + 7);
      }
      // Update to this Monday
      state.currentWeekStart = thisMondayStr;
      saveState();
    }
  }

  function deleteHistoryEntry(id) {
    state.weekHistory = state.weekHistory.filter(w => w.id !== id);
    saveState();
    renderHistory();
  }

  // ── Render ─────────────────────────────────────────
  function render() {
    const dates = getWeekDates();

    renderHead(dates);
    renderBody(dates);
    renderFoot(dates);
    renderWeekSummary(dates);
    renderHistory();
  }

  function renderHead(dates) {
    let html = '<tr>';
    html += '<th>Görev</th>';
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
      tableBody.innerHTML = `
        <tr>
          <td colspan="${dates.length + 1}">
            <div class="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
              <h3>Henüz kategori yok</h3>
              <p>Görevlerinizi takip etmeye başlamak için "Kategori Ekle" butonuna tıklayın.</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    let html = '';

    state.categories.forEach(cat => {
      // Category header row
      html += `<tr class="category-row fade-in-up">`;
      html += `<td colspan="${dates.length + 1}">
        <div class="category-header">
          <div class="category-color-dot" style="background:${cat.color}"></div>
          <span class="category-name">${escapeHtml(cat.name)}</span>
          <div class="category-actions">
            <button class="cat-btn add" data-cat-id="${cat.id}" title="Görev ekle">
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
        html += `<tr class="task-row fade-in-up">
          <td colspan="${dates.length + 1}">
            <span style="font-size:0.8rem; color:var(--text-tertiary); padding-left: 1rem;">Görev yok — eklemek için + butonuna tıklayın</span>
          </td>
        </tr>`;
      } else {
        cat.tasks.forEach(task => {
          // Build day badges if task has specific days
          let dayBadges = '';
          if (task.days && task.days.length > 0) {
            dayBadges = '<span class="task-days">' + task.days.map(d => `<span class="task-day-badge">${DAY_NAMES_SHORT[d]}</span>`).join('') + '</span>';
          }
          html += `<tr class="task-row fade-in-up">`;
          html += `<td>
            <div class="task-label">
              <div class="task-color-bar" style="background:${cat.color}"></div>
              <span class="task-name">${escapeHtml(task.name)}</span>
              ${dayBadges}
              <button class="task-delete-btn" data-cat-id="${cat.id}" data-task-id="${task.id}" title="Görevi sil">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </td>`;
          dates.forEach(d => {
            const dk = formatDateKey(d);
            const todayClass = isToday(d) ? ' today-col' : '';
            if (isTaskScheduledForDate(task, d)) {
              const checked = state.completions[task.id + ':' + dk] ? ' checked' : '';
              html += `<td class="${todayClass}">
                <div class="cell-check${checked}" data-task-id="${task.id}" data-date="${dk}"></div>
              </td>`;
            } else {
              html += `<td class="${todayClass}">
                <div class="cell-inactive"></div>
              </td>`;
            }
          });
          html += `</tr>`;
        });
      }
    });

    tableBody.innerHTML = html;

    // Attach event listeners
    tableBody.querySelectorAll('.cell-check').forEach(el => {
      el.addEventListener('click', () => {
        toggleCompletion(el.dataset.taskId, el.dataset.date);
      });
    });

    tableBody.querySelectorAll('.cat-btn.add').forEach(el => {
      el.addEventListener('click', () => {
        addingTaskToCategoryId = el.dataset.catId;
        taskNameInput.value = '';
        // Reset day picker
        $$('#day-picker .day-chip').forEach(c => c.classList.remove('selected'));
        openModal(taskOverlay);
      });
    });

    tableBody.querySelectorAll('.cat-btn.delete').forEach(el => {
      el.addEventListener('click', () => {
        const catId = el.dataset.catId;
        const cat = state.categories.find(c => c.id === catId);
        if (cat && confirm(`"${cat.name}" kategorisini ve tüm görevlerini silmek istiyor musunuz?`)) {
          deleteCategory(catId);
        }
      });
    });

    tableBody.querySelectorAll('.task-delete-btn').forEach(el => {
      el.addEventListener('click', () => {
        const taskId = el.dataset.taskId;
        const catId = el.dataset.catId;
        deleteTask(catId, taskId);
      });
    });
  }

  function renderFoot(dates) {
    const tasks = getAllTasks();
    if (tasks.length === 0) {
      tableFoot.innerHTML = '';
      return;
    }

    // Daily stats row
    let html = '<tr>';
    html += '<td>Günlük Skor</td>';
    dates.forEach(d => {
      const dk = formatDateKey(d);
      const stats = getDayStats(dk, d);
      const pClass = stats.percent >= 75 ? 'high' : stats.percent >= 40 ? 'mid' : 'low';
      html += `<td>
        <span class="stat-fraction">${stats.done}/${stats.total}</span>
        <span class="stat-percent ${pClass}">${stats.percent}%</span>
      </td>`;
    });
    html += '</tr>';

    // Weekly score row
    const weekPct = getWeekStats(dates);
    const pClass = weekPct >= 75 ? 'high' : weekPct >= 40 ? 'mid' : 'low';
    html += '<tr class="weekly-row">';
    html += '<td>Haftalık Skor</td>';
    html += `<td colspan="${dates.length}">
      <span class="stat-percent ${pClass}" style="font-size:1.1rem;">${weekPct}%</span>
    </td>`;
    html += '</tr>';

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

    if (history.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    countEl.textContent = history.length + ' hafta';

    // Sort newest first
    const sorted = [...history].sort((a, b) => b.startDate.localeCompare(a.startDate));

    let html = '';
    sorted.forEach(week => {
      const pClass = week.percent >= 75 ? 'high' : week.percent >= 40 ? 'mid' : 'low';
      const emoji = week.percent >= 90 ? '🏆' : week.percent >= 75 ? '🔥' : week.percent >= 50 ? '💪' : week.percent >= 25 ? '📈' : '🌱';
      html += `
        <div class="history-card fade-in-up">
          <button class="history-card-delete" data-history-id="${week.id}" title="Sil">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div class="history-card-top">
            <span class="history-card-dates">${formatDateRange(week.startDate, week.endDate)}</span>
            <span class="history-card-emoji">${emoji}</span>
          </div>
          <div class="history-card-score">
            <span class="history-card-percent ${pClass}">${week.percent}%</span>
            <span class="history-card-detail">${week.done}/${week.total} tamamlandı</span>
          </div>
          <div class="history-card-bar">
            <div class="history-card-bar-fill ${pClass}" style="width:${week.percent}%"></div>
          </div>
        </div>`;
    });

    listEl.innerHTML = html;

    // Delete buttons
    listEl.querySelectorAll('.history-card-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteHistoryEntry(btn.dataset.historyId);
      });
    });
  }

  // ── Helpers ────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Event Bindings ─────────────────────────────────
  function bindEvents() {
    // Theme toggle
    $('#btn-theme-toggle').addEventListener('click', toggleTheme);
    // History toggle
    $('#history-toggle').addEventListener('click', () => {
      const btn = $('#history-toggle');
      const panel = $('#history-panel');
      btn.classList.toggle('open');
      panel.classList.toggle('open');
    });

    // Add category button
    $('#btn-add-category').addEventListener('click', () => {
      categoryNameInput.value = '';
      selectedColor = CATEGORY_COLORS[0];
      $$('.color-swatch').forEach((s, i) => {
        s.classList.toggle('selected', i === 0);
      });
      openModal(categoryOverlay);
    });

    // Category modal
    $('#modal-close').addEventListener('click', () => closeModal(categoryOverlay));
    $('#btn-cancel-category').addEventListener('click', () => closeModal(categoryOverlay));
    $('#btn-confirm-category').addEventListener('click', () => {
      const name = categoryNameInput.value.trim();
      if (!name) {
        categoryNameInput.focus();
        return;
      }
      addCategory(name, selectedColor);
      closeModal(categoryOverlay);
    });
    categoryNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        $('#btn-confirm-category').click();
      }
    });
    categoryOverlay.addEventListener('click', (e) => {
      if (e.target === categoryOverlay) closeModal(categoryOverlay);
    });

    // Task modal
    $('#modal-task-close').addEventListener('click', () => closeModal(taskOverlay));
    $('#btn-cancel-task').addEventListener('click', () => closeModal(taskOverlay));
    // Day picker toggle
    $$('#day-picker .day-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (chip.dataset.day === 'all') {
          // Toggle all: if all are selected → deselect all, otherwise → select all
          const dayChips = $$('#day-picker .day-chip:not(.day-chip-all)');
          const allSelected = [...dayChips].every(c => c.classList.contains('selected'));
          dayChips.forEach(c => c.classList.toggle('selected', !allSelected));
          chip.classList.toggle('selected', !allSelected);
        } else {
          chip.classList.toggle('selected');
          // Sync "Tümü" button state
          const dayChips = $$('#day-picker .day-chip:not(.day-chip-all)');
          const allSelected = [...dayChips].every(c => c.classList.contains('selected'));
          $('#day-picker .day-chip-all').classList.toggle('selected', allSelected);
        }
      });
    });

    $('#btn-confirm-task').addEventListener('click', () => {
      const name = taskNameInput.value.trim();
      if (!name) {
        taskNameInput.focus();
        return;
      }
      // Collect selected days
      const selectedDays = [];
      $$('#day-picker .day-chip.selected').forEach(chip => {
        selectedDays.push(parseInt(chip.dataset.day));
      });
      if (addingTaskToCategoryId) {
        addTask(addingTaskToCategoryId, name, selectedDays);
      }
      closeModal(taskOverlay);
    });
    taskNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        $('#btn-confirm-task').click();
      }
    });
    taskOverlay.addEventListener('click', (e) => {
      if (e.target === taskOverlay) closeModal(taskOverlay);
    });

    // Reset week (archive first, then clear)
    $('#btn-reset-week').addEventListener('click', () => {
      if (confirm('Bu haftayı arşivleyip sıfırlamak istiyor musunuz?')) {
        // Archive current week before resetting
        archiveCurrentWeek();
        state.completions = {};
        // Reset week start to this Monday
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        state.currentWeekStart = formatDateKey(getMonday(today));
        saveState();
        render();
        showToast('Hafta arşivlendi ve sıfırlandı');
      }
    });

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal(categoryOverlay);
        closeModal(taskOverlay);
      }
    });
  }

  // ── Midnight Auto-Refresh ──────────────────────────
  function scheduleMidnightRefresh() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 5, 0); // 00:00:05 next day (5s buffer)
    const msUntilMidnight = midnight - now;
    setTimeout(() => {
      checkAutoArchive();
      render();
      showToast('Yeni gün başladı — tarihler güncellendi ✨');
      scheduleMidnightRefresh(); // Schedule next one
    }, msUntilMidnight);
  }

  // ── Initialize ─────────────────────────────────────
  function init() {
    initTheme();
    initColorPicker();
    loadState();
    // Ensure weekHistory array exists (migration from older data)
    if (!state.weekHistory) state.weekHistory = [];
    checkAutoArchive();
    bindEvents();
    render();
    scheduleMidnightRefresh();
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
