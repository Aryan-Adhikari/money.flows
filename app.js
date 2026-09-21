/**
 * MONEY FLOWS — CORE ENGINE & FINTECH INTERACTION CONTROLLER
 * Preserves all underlying data structures, math formulas, and local workflows.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------
  // 1. STATE & STORAGE MANAGEMENT
  // Supports automatic fallback migration from legacy storage keys
  // ---------------------------------------------------------
  const STORAGE_KEYS = {
    TRANSACTIONS: 'moneyflows_tx_records_v1',
    STARTING_BALANCE: 'moneyflows_starting_cap_v1',
    CATEGORIES: 'moneyflows_categories_v1',
    THEME: 'moneyflows_theme_pref',
    CURRENCY_MODE: 'moneyflows_currency_mode' // 'symbol' (₹) or 'code' (Rs.)
  };

  const LEGACY_STORAGE_KEYS = {
    TRANSACTIONS: 'apex_tx_records_v2',
    STARTING_BALANCE: 'apex_starting_cap_v2',
    CATEGORIES: 'apex_categories_v2',
    THEME: 'apex_theme_pref',
    CURRENCY_MODE: 'apex_currency_mode'
  };

  const DEFAULT_CATEGORIES = [
    'Food', 'Education', 'Travel', 'Rent', 'Shopping',
    'Bills', 'Entertainment', 'Health', 'Gym/Fitness',
    'Investment', 'Personal', 'Other'
  ];

  let state = {
    transactions: [],
    startingBalance: 0,
    categories: [],
    currencyMode: 'symbol', // 'symbol' = ₹, 'code' = Rs.
    activeTab: 'dashboard',
    charts: {
      daily: null,
      category: null,
      monthly: null,
      balance: null
    }
  };

  // ---------------------------------------------------------
  // 2. FINANCIAL MATH & FORMATTING ENGINE
  // ---------------------------------------------------------
  function loadPersistedData() {
    try {
      // Check current key, fallback to legacy key if existing user
      const tx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS) || localStorage.getItem(LEGACY_STORAGE_KEYS.TRANSACTIONS);
      state.transactions = tx ? JSON.parse(tx) : [];
      
      const sb = localStorage.getItem(STORAGE_KEYS.STARTING_BALANCE) || localStorage.getItem(LEGACY_STORAGE_KEYS.STARTING_BALANCE);
      state.startingBalance = sb !== null ? parseFloat(sb) || 0 : 20000;

      const cats = localStorage.getItem(STORAGE_KEYS.CATEGORIES) || localStorage.getItem(LEGACY_STORAGE_KEYS.CATEGORIES);
      state.categories = cats ? JSON.parse(cats) : [...DEFAULT_CATEGORIES];

      const curMode = localStorage.getItem(STORAGE_KEYS.CURRENCY_MODE) || localStorage.getItem(LEGACY_STORAGE_KEYS.CURRENCY_MODE);
      if (curMode) state.currencyMode = curMode;

      const theme = localStorage.getItem(STORAGE_KEYS.THEME) || localStorage.getItem(LEGACY_STORAGE_KEYS.THEME) || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {
      console.error('Storage Read Exception:', e);
      state.transactions = [];
      state.startingBalance = 0;
      state.categories = [...DEFAULT_CATEGORIES];
    }
  }

  function commitTransactions() {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
  }

  function commitStartingBalance() {
    localStorage.setItem(STORAGE_KEYS.STARTING_BALANCE, state.startingBalance.toString());
  }

  function commitCategories() {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(state.categories));
  }

  /**
   * Currency Formatter
   * Guarantees clean character output.
   * If forPDF is true, uses ASCII "Rs." to prevent jsPDF 0xB9 (superscript 1) degradation.
   */
  function formatINR(val, forPDF = false) {
    const num = Number(val) || 0;
    const isNegative = num < 0;
    const absVal = Math.abs(num);
    const formattedNum = absVal.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });

    const prefix = forPDF
      ? 'Rs. '
      : (state.currencyMode === 'symbol' ? '₹' : 'Rs. ');

    return `${isNegative ? '-' : ''}${prefix}${formattedNum}`;
  }

  // Smooth Count-Up Animation for Cards
  function animateValue(element, targetVal, isCurrency = true) {
    if (!element) return;
    const startVal = parseFloat(element.getAttribute('data-raw-val')) || 0;
    const duration = 600;
    const startTime = performance.now();

    function updateCounter(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease Out Quart
      const ease = 1 - Math.pow(1 - progress, 4);
      const current = startVal + (targetVal - startVal) * ease;

      element.textContent = isCurrency ? formatINR(current) : Math.round(current).toString();

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        element.textContent = isCurrency ? formatINR(targetVal) : targetVal.toString();
        element.setAttribute('data-raw-val', targetVal);
      }
    }
    requestAnimationFrame(updateCounter);
  }

  // Toast Notification Dispatcher
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Date Helpers
  function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getMondayOfCurrentWeek(d = new Date()) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }

  // ---------------------------------------------------------
  // 3. CORE CALCULATIONS
  // ---------------------------------------------------------
  function calculateFinancials() {
    let totalIncome = 0;
    let totalExpenses = 0;

    const todayStr = getLocalDateString();
    const monday = getMondayOfCurrentWeek();
    const mondayStr = getLocalDateString(monday);
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let todaySpending = 0;
    let weekSpending = 0;
    let monthSpending = 0;

    const dailySpendingMap = {};
    const categoryTotals = {};
    let maxExpense = 0;

    state.transactions.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      const tDate = t.date;

      if (t.type === 'income') {
        totalIncome += amt;
      } else if (t.type === 'expense') {
        totalExpenses += amt;
        if (amt > maxExpense) maxExpense = amt;

        // Daily
        if (tDate === todayStr) {
          todaySpending += amt;
        }

        // Weekly (Monday - Sunday)
        if (tDate >= mondayStr && tDate <= todayStr) {
          weekSpending += amt;
        }

        // Monthly
        const parts = tDate.split('-');
        if (parseInt(parts[0], 10) === currentYear && parseInt(parts[1], 10) - 1 === currentMonth) {
          monthSpending += amt;
        }

        // Daily aggregated map
        dailySpendingMap[tDate] = (dailySpendingMap[tDate] || 0) + amt;

        // Category breakdown
        const cat = t.category || 'Other';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      }
    });

    const currentBalance = state.startingBalance + totalIncome - totalExpenses;
    const expenseDaysCount = Object.keys(dailySpendingMap).length || 1;
    const avgDailySpending = totalExpenses / expenseDaysCount;

    // Top Category Calculation
    let topCatName = '—';
    let topCatVal = 0;
    for (const [c, val] of Object.entries(categoryTotals)) {
      if (val > topCatVal) {
        topCatVal = val;
        topCatName = c;
      }
    }

    return {
      currentBalance,
      totalIncome,
      totalExpenses,
      todaySpending,
      weekSpending,
      monthSpending,
      maxExpense,
      avgDailySpending,
      topCatName,
      dailySpendingMap,
      categoryTotals
    };
  }

  // ---------------------------------------------------------
  // 4. CHART.JS VISUAL ENGINE
  // ---------------------------------------------------------
  function renderCharts(calc) {
    if (typeof Chart === 'undefined') return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    const textColor = isDark ? '#8E9BAE' : '#64748B';

    Chart.defaults.color = textColor;
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

    // Chart 1: Daily Spending Velocity
    const dailyCanvas = document.getElementById('chart-daily');
    if (dailyCanvas) {
      const sortedDates = Object.keys(calc.dailySpendingMap).sort();
      const labels = sortedDates.slice(-14);
      const dataPoints = labels.map(d => calc.dailySpendingMap[d]);

      if (state.charts.daily) state.charts.daily.destroy();
      
      const ctx = dailyCanvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 260);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

      state.charts.daily = new Chart(dailyCanvas, {
        type: 'line',
        data: {
          labels: labels.length ? labels : ['No Data'],
          datasets: [{
            label: 'Outflow',
            data: dataPoints.length ? dataPoints : [0],
            borderColor: '#3B82F6',
            backgroundColor: gradient,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#3B82F6',
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` Spent: ${formatINR(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { grid: { color: gridColor } },
            y: { grid: { color: gridColor }, ticks: { callback: v => formatINR(v) } }
          }
        }
      });
    }

    // Chart 2: Asset / Categorical Distribution
    const catCanvas = document.getElementById('chart-category');
    if (catCanvas) {
      const catLabels = Object.keys(calc.categoryTotals);
      const catData = Object.values(calc.categoryTotals);

      if (state.charts.category) state.charts.category.destroy();

      state.charts.category = new Chart(catCanvas, {
        type: 'doughnut',
        data: {
          labels: catLabels.length ? catLabels : ['None'],
          datasets: [{
            data: catData.length ? catData : [1],
            backgroundColor: [
              '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B',
              '#EC4899', '#06B6D4', '#F43F5E', '#64748B'
            ],
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${formatINR(ctx.raw)}`
              }
            }
          },
          cutout: '72%'
        }
      });
    }

    // Chart 3: Monthly Aggregate
    const monthlyCanvas = document.getElementById('chart-monthly');
    if (monthlyCanvas) {
      const monthMap = {};
      state.transactions.forEach(t => {
        if (t.type === 'expense') {
          const ym = t.date.substring(0, 7);
          monthMap[ym] = (monthMap[ym] || 0) + parseFloat(t.amount);
        }
      });
      const mLabels = Object.keys(monthMap).sort();
      const mData = mLabels.map(m => monthMap[m]);

      if (state.charts.monthly) state.charts.monthly.destroy();

      state.charts.monthly = new Chart(monthlyCanvas, {
        type: 'bar',
        data: {
          labels: mLabels.length ? mLabels : ['No Record'],
          datasets: [{
            label: 'Monthly Burn',
            data: mData.length ? mData : [0],
            backgroundColor: '#8B5CF6',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` Spent: ${formatINR(ctx.raw)}` } }
          },
          scales: {
            x: { grid: { display: false } },
            y: { grid: { color: gridColor }, ticks: { callback: v => formatINR(v) } }
          }
        }
      });
    }

    // Chart 4: Liquidity / Balance Trendline
    const balanceCanvas = document.getElementById('chart-balance');
    if (balanceCanvas) {
      const chronological = [...state.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
      let running = state.startingBalance;
      const bDates = ['Baseline'];
      const bVals = [running];

      chronological.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        running += (t.type === 'income' ? amt : -amt);
        bDates.push(t.date);
        bVals.push(running);
      });

      if (state.charts.balance) state.charts.balance.destroy();

      const bCtx = balanceCanvas.getContext('2d');
      const bGrad = bCtx.createLinearGradient(0, 0, 0, 260);
      bGrad.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
      bGrad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

      state.charts.balance = new Chart(balanceCanvas, {
        type: 'line',
        data: {
          labels: bDates,
          datasets: [{
            label: 'Available Reserve',
            data: bVals,
            borderColor: '#10B981',
            backgroundColor: bGrad,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` Reserve: ${formatINR(ctx.raw)}` } }
          },
          scales: {
            x: { grid: { color: gridColor } },
            y: { grid: { color: gridColor }, ticks: { callback: v => formatINR(v) } }
          }
        }
      });
    }
  }

  // ---------------------------------------------------------
  // 5. VIEW POPULATION & DOM RECONCILIATION
  // ---------------------------------------------------------
  function updateDashboardView() {
    const f = calculateFinancials();

    // Metric Cards with animated count
    animateValue(document.getElementById('card-current-balance'), f.currentBalance);
    animateValue(document.getElementById('card-today-spending'), f.todaySpending);
    animateValue(document.getElementById('card-week-spending'), f.weekSpending);
    animateValue(document.getElementById('card-month-spending'), f.monthSpending);
    animateValue(document.getElementById('card-total-received'), f.totalIncome);
    animateValue(document.getElementById('card-total-spent'), f.totalExpenses);

    // Contextual Subtext
    const capRef = document.getElementById('card-starting-balance-ref');
    if (capRef) capRef.textContent = `Baseline Capital: ${formatINR(state.startingBalance)}`;

    // Analytics Strip
    animateValue(document.getElementById('stat-transaction-count'), state.transactions.length, false);
    animateValue(document.getElementById('stat-avg-spending'), f.avgDailySpending);
    animateValue(document.getElementById('stat-max-expense'), f.maxExpense);
    
    const topCatElem = document.getElementById('stat-top-category');
    if (topCatElem) topCatElem.textContent = f.topCatName;

    renderCharts(f);
  }

  function renderTransactionsTable() {
    const tbody = document.getElementById('tx-tbody');
    const emptyState = document.getElementById('tx-empty-state');
    if (!tbody) return;

    const searchTerm = (document.getElementById('tx-search')?.value || '').toLowerCase();
    const filterType = document.getElementById('tx-filter-type')?.value || 'all';
    const filterCat = document.getElementById('tx-filter-category')?.value || 'all';
    const sortBy = document.getElementById('tx-sort')?.value || 'date-desc';

    let filtered = state.transactions.filter(t => {
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterCat !== 'all' && t.category !== filterCat) return false;
      if (searchTerm) {
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();
        const src = (t.source || '').toLowerCase();
        if (!desc.includes(searchTerm) && !cat.includes(searchTerm) && !src.includes(searchTerm)) {
          return false;
        }
      }
      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === 'date-desc') return new Date(b.date) - new Date(a.date);
      if (sortBy === 'date-asc') return new Date(a.date) - new Date(b.date);
      if (sortBy === 'amt-desc') return parseFloat(b.amount) - parseFloat(a.amount);
      if (sortBy === 'amt-asc') return parseFloat(a.amount) - parseFloat(b.amount);
      return 0;
    });

    tbody.innerHTML = '';

    if (filtered.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    filtered.forEach(t => {
      const isInc = t.type === 'income';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="font-tabular">${t.date}</td>
        <td>
          <span class="type-badge ${isInc ? 'income' : 'expense'}">
            ${isInc ? 'Incoming' : 'Outflow'}
          </span>
        </td>
        <td>
          <span class="cat-badge">${isInc ? (t.source || 'General Origin') : (t.category || 'General')}</span>
        </td>
        <td class="text-right font-tabular ${isInc ? 'text-success' : 'text-danger'}" style="font-weight:700;">
          ${isInc ? '+' : '-'}${formatINR(t.amount)}
        </td>
        <td style="color:var(--text-muted);">${t.description || '—'}</td>
        <td class="text-center">
          <div class="row-actions">
            <button class="btn-icon-subtle btn-edit-tx" data-id="${t.id}" title="Edit Transaction">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="btn-icon-subtle delete btn-del-tx" data-id="${t.id}" title="Delete Record">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Attach row events
    tbody.querySelectorAll('.btn-edit-tx').forEach(b => {
      b.onclick = () => openEditModal(b.getAttribute('data-id'));
    });
    tbody.querySelectorAll('.btn-del-tx').forEach(b => {
      b.onclick = () => deleteTransaction(b.getAttribute('data-id'));
    });
  }

  function syncCategoryDropdowns() {
    const expSelect = document.getElementById('exp-category');
    const filterCatSelect = document.getElementById('tx-filter-category');
    const editCatSelect = document.getElementById('edit-category');

    const optionsHtml = state.categories.map(c => `<option value="${c}">${c}</option>`).join('');

    if (expSelect) expSelect.innerHTML = optionsHtml;
    if (editCatSelect) editCatSelect.innerHTML = optionsHtml;
    if (filterCatSelect) {
      filterCatSelect.innerHTML = `<option value="all">All Categories</option>${optionsHtml}`;
    }
  }

  // ---------------------------------------------------------
  // 6. MODALS & DATA ENTRY OPERATIONS
  // ---------------------------------------------------------
  function setupModal(modalId, openBtnId) {
    const modal = document.getElementById(modalId);
    const openBtn = document.getElementById(openBtnId);
    if (!modal) return;

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const dateInput = modal.querySelector('input[type="date"]');
        if (dateInput && !dateInput.value) {
          dateInput.value = getLocalDateString();
        }
        modal.classList.add('active');
      });
    }

    modal.querySelectorAll('[data-close]').forEach(c => {
      c.addEventListener('click', () => modal.classList.remove('active'));
    });
  }

  function openEditModal(id) {
    const t = state.transactions.find(x => x.id === id);
    if (!t) return;

    const modal = document.getElementById('modal-edit');
    document.getElementById('edit-id').value = t.id;
    document.getElementById('edit-type').value = t.type;
    document.getElementById('edit-amount').value = t.amount;
    document.getElementById('edit-date').value = t.date;
    document.getElementById('edit-desc').value = t.description || '';

    const groupCat = document.getElementById('group-edit-category');
    const groupSrc = document.getElementById('group-edit-source');

    if (t.type === 'expense') {
      groupCat.style.display = 'block';
      groupSrc.style.display = 'none';
      document.getElementById('edit-category').value = t.category || state.categories[0];
    } else {
      groupCat.style.display = 'none';
      groupSrc.style.display = 'block';
      document.getElementById('edit-source').value = t.source || '';
    }

    modal.classList.add('active');
  }

  function deleteTransaction(id) {
    if (!confirm('Are you sure you want to permanently remove this transaction?')) return;
    state.transactions = state.transactions.filter(t => t.id !== id);
    commitTransactions();
    refreshAllViews();
    showToast('Transaction record deleted successfully', 'danger');
  }

  // ---------------------------------------------------------
  // 7. AUDIT REPORTS & VECTOR PDF EXPORT (PRESERVING ASCII RS.)
  // ---------------------------------------------------------
  function runAuditReport() {
    const start = document.getElementById('report-start-date').value;
    const end = document.getElementById('report-end-date').value;

    let priorBalance = state.startingBalance;
    let periodIncome = 0;
    let periodExpenses = 0;
    const catMap = {};
    const reportRows = [];

    state.transactions.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      if (start && t.date < start) {
        priorBalance += (t.type === 'income' ? amt : -amt);
      } else if ((!start || t.date >= start) && (!end || t.date <= end)) {
        reportRows.push(t);
        if (t.type === 'income') {
          periodIncome += amt;
        } else {
          periodExpenses += amt;
          const c = t.category || 'Other';
          catMap[c] = (catMap[c] || 0) + amt;
        }
      }
    });

    const netMovement = periodIncome - periodExpenses;
    const endingBalance = priorBalance + netMovement;

    // Display updates
    document.getElementById('rep-disp-range').textContent = (start && end) ? `${start} → ${end}` : 'Complete Ledger Statement';
    document.getElementById('rep-disp-net').textContent = formatINR(netMovement);
    document.getElementById('rep-disp-net').className = `rep-metric-val font-tabular ${netMovement >= 0 ? 'text-success' : 'text-danger'}`;
    document.getElementById('rep-disp-open').textContent = formatINR(priorBalance);
    document.getElementById('rep-disp-income').textContent = formatINR(periodIncome);
    document.getElementById('rep-disp-expense').textContent = formatINR(periodExpenses);
    document.getElementById('rep-disp-close').textContent = formatINR(endingBalance);

    // Category Table
    const catTbody = document.getElementById('rep-category-tbody');
    catTbody.innerHTML = '';
    for (const [cat, sum] of Object.entries(catMap)) {
      const pct = periodExpenses > 0 ? ((sum / periodExpenses) * 100).toFixed(1) : 0;
      const count = reportRows.filter(r => r.type === 'expense' && r.category === cat).length;
      catTbody.innerHTML += `
        <tr>
          <td><span class="cat-badge">${cat}</span></td>
          <td class="text-right font-tabular">${formatINR(sum)}</td>
          <td class="text-right font-tabular">${pct}%</td>
          <td class="text-right font-tabular">${count}</td>
        </tr>
      `;
    }

    // Transactions Table
    const txTbody = document.getElementById('rep-transactions-tbody');
    txTbody.innerHTML = '';
    reportRows.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(r => {
      const isInc = r.type === 'income';
      txTbody.innerHTML += `
        <tr>
          <td class="font-tabular">${r.date}</td>
          <td><span class="type-badge ${isInc ? 'income' : 'expense'}">${isInc ? 'Incoming' : 'Outflow'}</span></td>
          <td>${isInc ? r.source : r.category}</td>
          <td class="text-right font-tabular ${isInc ? 'text-success' : 'text-danger'}">${isInc ? '+' : '-'}${formatINR(r.amount)}</td>
          <td style="color:var(--text-muted);">${r.description || '—'}</td>
        </tr>
      `;
    });

    return { priorBalance, periodIncome, periodExpenses, netMovement, endingBalance, catMap, reportRows, start, end };
  }

  function exportReportToPDF() {
    const reportData = runAuditReport();
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('jsPDF engine is initializing. Please re-try in a moment.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');

    // Branding Header
    doc.setFillColor(12, 17, 28);
    doc.rect(0, 0, 595, 75, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('MONEY FLOWS — FINANCIAL AUDIT STATEMENT', 40, 45);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(142, 155, 174);
    const dateRangeStr = (reportData.start && reportData.end)
      ? `Reconciliation Scope: ${reportData.start} to ${reportData.end}`
      : 'Reconciliation Scope: All Registered Timeline Records';
    doc.text(dateRangeStr, 40, 60);

    // Summary Metric Matrix (Uses formatINR(val, true) to output ASCII "Rs." to avoid superscript '1' error)
    const summaryData = [
      ['Starting Capital Prior to Scope', formatINR(reportData.priorBalance, true)],
      ['Total Funding Receipts (+)', formatINR(reportData.periodIncome, true)],
      ['Total Outflow Expenses (-)', formatINR(reportData.periodExpenses, true)],
      ['Period Net Capital Movement', formatINR(reportData.netMovement, true)],
      ['Closing Reconciled Reserve Balance', formatINR(reportData.endingBalance, true)]
    ];

    doc.autoTable({
      startY: 95,
      head: [['Metric Indicator', 'Capital Valuation']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], fontStyle: 'bold' },
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 6 }
    });

    // Category Breakdown Table
    const catRows = Object.entries(reportData.catMap).map(([cat, amt]) => [
      cat,
      formatINR(amt, true),
      reportData.periodExpenses > 0 ? `${((amt / reportData.periodExpenses) * 100).toFixed(1)}%` : '0%'
    ]);

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 25,
      head: [['Category Classification', 'Total Disbursed', 'Ratio']],
      body: catRows.length ? catRows : [['No expense occurrences within scope', 'Rs. 0', '0%']],
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 }
    });

    // Transaction Line Disclosures
    const txRows = reportData.reportRows.map(t => [
      t.date,
      t.type === 'income' ? 'Deposit' : 'Expense',
      t.type === 'income' ? (t.source || '—') : (t.category || '—'),
      (t.type === 'income' ? '+' : '-') + formatINR(t.amount, true),
      t.description || '—'
    ]);

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 25,
      head: [['Date', 'Class', 'Entity / Source', 'Amount', 'Documentation Memo']],
      body: txRows.length ? txRows : [['No records', '—', '—', 'Rs. 0', '—']],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4 }
    });

    doc.save(`Money_Flows_Statement_${getLocalDateString()}.pdf`);
    showToast('Vector statement PDF exported successfully', 'success');
  }

  // ---------------------------------------------------------
  // 8. EVENT ATTACHMENTS & UI BINDINGS
  // ---------------------------------------------------------
  function refreshAllViews() {
    updateDashboardView();
    renderTransactionsTable();
    runAuditReport();
  }

  function setupEventHandlers() {
    // Navigation Switching
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(`view-${tab}`).classList.add('active');

        // Update Topbar Title
        const heading = document.getElementById('page-heading');
        const subheading = document.getElementById('page-subheading');
        if (tab === 'dashboard') {
          heading.textContent = 'Financial Overview';
          subheading.textContent = 'Real-time local ledger & portfolio cashflow metrics';
          refreshAllViews();
        } else if (tab === 'history') {
          heading.textContent = 'Transaction Ledger';
          subheading.textContent = 'Search, sort, filter and audit itemized entries';
          renderTransactionsTable();
        } else if (tab === 'reports') {
          heading.textContent = 'Statement Generator';
          subheading.textContent = 'Filter boundaries and compile printable PDF exports';
          runAuditReport();
        }
      });
    });

    // Modals
    setupModal('modal-income', 'btn-open-income');
    setupModal('modal-expense', 'btn-open-expense');
    setupModal('modal-starting-balance', 'btn-open-starting-balance');

    // Income Form Submit
    document.getElementById('form-income').addEventListener('submit', (e) => {
      e.preventDefault();
      const amt = parseFloat(document.getElementById('inc-amount').value);
      const src = document.getElementById('inc-source').value.trim();
      const date = document.getElementById('inc-date').value;
      const desc = document.getElementById('inc-desc').value.trim();

      if (!amt || amt <= 0 || !src || !date) {
        showToast('Please specify a positive amount, date, and source channel', 'danger');
        return;
      }

      state.transactions.push({
        id: 'tx_' + Date.now(),
        type: 'income',
        amount: amt,
        source: src,
        category: '',
        date,
        description: desc,
        createdAt: new Date().toISOString()
      });

      commitTransactions();
      refreshAllViews();
      document.getElementById('form-income').reset();
      document.getElementById('modal-income').classList.remove('active');
      showToast(`Inflow of ${formatINR(amt)} deposited to ledger`, 'success');
    });

    // Expense Form Submit
    document.getElementById('form-expense').addEventListener('submit', (e) => {
      e.preventDefault();
      const amt = parseFloat(document.getElementById('exp-amount').value);
      const cat = document.getElementById('exp-category').value;
      const date = document.getElementById('exp-date').value;
      const desc = document.getElementById('exp-desc').value.trim();

      if (!amt || amt <= 0 || !cat || !date) {
        showToast('Please specify a positive amount, date, and category', 'danger');
        return;
      }

      state.transactions.push({
        id: 'tx_' + Date.now(),
        type: 'expense',
        amount: amt,
        source: '',
        category: cat,
        date,
        description: desc,
        createdAt: new Date().toISOString()
      });

      commitTransactions();
      refreshAllViews();
      document.getElementById('form-expense').reset();
      document.getElementById('modal-expense').classList.remove('active');
      showToast(`Expense of ${formatINR(amt)} committed`, 'info');
    });

    // Starting Balance Form Submit
    document.getElementById('form-starting-balance').addEventListener('submit', (e) => {
      e.preventDefault();
      const val = parseFloat(document.getElementById('start-balance-val').value);
      if (isNaN(val) || val < 0) {
        showToast('Starting balance must be greater than or equal to 0', 'danger');
        return;
      }
      state.startingBalance = val;
      commitStartingBalance();
      refreshAllViews();
      document.getElementById('modal-starting-balance').classList.remove('active');
      showToast(`Baseline capital established: ${formatINR(val)}`, 'success');
    });

    // Edit Transaction Submit
    document.getElementById('form-edit').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-id').value;
      const t = state.transactions.find(x => x.id === id);
      if (!t) return;

      const amt = parseFloat(document.getElementById('edit-amount').value);
      const date = document.getElementById('edit-date').value;
      const desc = document.getElementById('edit-desc').value.trim();

      if (!amt || amt <= 0 || !date) {
        showToast('Valid amount and date are required', 'danger');
        return;
      }

      t.amount = amt;
      t.date = date;
      t.description = desc;

      if (t.type === 'expense') {
        t.category = document.getElementById('edit-category').value;
      } else {
        t.source = document.getElementById('edit-source').value.trim();
      }

      commitTransactions();
      refreshAllViews();
      document.getElementById('modal-edit').classList.remove('active');
      showToast('Record changes committed to disk', 'success');
    });

    // Custom Category Adder
    document.getElementById('btn-add-custom-cat').addEventListener('click', () => {
      const newCat = prompt('Enter New Custom Category Name:');
      if (newCat && newCat.trim()) {
        const trimmed = newCat.trim();
        if (!state.categories.includes(trimmed)) {
          state.categories.push(trimmed);
          commitCategories();
          syncCategoryDropdowns();
          document.getElementById('exp-category').value = trimmed;
          showToast(`Category "${trimmed}" added`, 'success');
        }
      }
    });

    // Live Filtering & Search in History
    ['tx-search', 'tx-filter-type', 'tx-filter-category', 'tx-sort'].forEach(id => {
      const elem = document.getElementById(id);
      if (elem) elem.addEventListener('input', renderTransactionsTable);
    });

    // Theme & Currency Toggles
    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_KEYS.THEME, next);
      renderCharts(calculateFinancials());
    });

    document.getElementById('currency-toggle-btn').addEventListener('click', () => {
      state.currencyMode = state.currencyMode === 'symbol' ? 'code' : 'symbol';
      localStorage.setItem(STORAGE_KEYS.CURRENCY_MODE, state.currencyMode);
      refreshAllViews();
      showToast(`Display format switched to ${state.currencyMode === 'symbol' ? '₹ (Symbol)' : 'Rs. (Standard Code)'}`, 'info');
    });

    // Backup & Restore
    document.getElementById('btn-export-backup').addEventListener('click', () => {
      const dump = {
        appName: 'Money Flows',
        transactions: state.transactions,
        startingBalance: state.startingBalance,
        categories: state.categories,
        exportedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Money_Flows_Backup_${getLocalDateString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Local database backup exported to JSON', 'success');
    });

    document.getElementById('input-import-backup').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (Array.isArray(parsed.transactions)) {
            state.transactions = parsed.transactions;
            state.startingBalance = parseFloat(parsed.startingBalance) || 0;
            if (Array.isArray(parsed.categories)) state.categories = parsed.categories;
            commitTransactions();
            commitStartingBalance();
            commitCategories();
            syncCategoryDropdowns();
            refreshAllViews();
            showToast('Backup restored successfully into local storage', 'success');
          } else {
            throw new Error('Invalid JSON format');
          }
        } catch (err) {
          showToast('Failed to parse backup JSON file', 'danger');
        }
      };
      reader.readAsText(file);
    });

    // Reports Execution & PDF
    document.getElementById('btn-apply-report').addEventListener('click', runAuditReport);
    document.getElementById('btn-generate-pdf').addEventListener('click', exportReportToPDF);

    // Hard Purge
    document.getElementById('btn-reset-data').addEventListener('click', () => {
      const conf = prompt('WARNING: Type "DELETE ALL DATA" to purge all local ledger records:');
      if (conf === 'DELETE ALL DATA') {
        localStorage.clear();
        state.transactions = [];
        state.startingBalance = 0;
        state.categories = [...DEFAULT_CATEGORIES];
        syncCategoryDropdowns();
        refreshAllViews();
        showToast('All local storage records have been permanently expunged', 'danger');
      }
    });
  }

  // ---------------------------------------------------------
  // 9. INITIALIZATION BOOTSTRAP
  // ---------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    loadPersistedData();
    syncCategoryDropdowns();
    setupEventHandlers();
    
    // Set default initial date filter to start of month -> today
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const startInput = document.getElementById('report-start-date');
    const endInput = document.getElementById('report-end-date');
    if (startInput) startInput.value = getLocalDateString(firstDay);
    if (endInput) endInput.value = getLocalDateString(now);

    refreshAllViews();
  });
})();