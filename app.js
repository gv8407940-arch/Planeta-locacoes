(function () {
  "use strict";

  const ACTIVE_STATUSES = ["reserved", "delivered"];
  const RENTAL_STATUS = {
    quote: "Orçamento",
    reserved: "Reservado",
    delivered: "Entregue/alugado",
    returned: "Devolvido",
    cancelled: "Cancelado",
  };
  const PAYMENT_STATUS = {
    unpaid: "Não pago",
    partial: "Sinal pago",
    paid: "Pago completo",
  };
  const EXPENSE_STATUS = {
    paid: "Pago",
    partial: "Parcialmente pago",
    pending: "Pendente",
    overdue: "Atrasado",
    installment: "Parcelado",
  };
  const EXPENSE_TYPE = {
    investment: "Investimento",
    cost: "Custo",
  };
  const FINANCE_TYPE = {
    income: "Entrada",
    "pending-income": "A receber",
    "paid-expense": "Gasto pago",
    "pending-expense": "Gasto pendente",
    "future-expense": "Gasto futuro",
    "supplier-offset": "Abatimento ao fornecedor",
  };
  const FINANCE_PERIOD_PRESETS = {
    "30d": { label: "último mês", days: 30 },
    "3m": { label: "últimos 3 meses", months: 3 },
    "6m": { label: "últimos 6 meses", months: 6 },
    "12m": { label: "últimos 12 meses", months: 12 },
  };
  const CONTRACT_TEMPLATE_URL = "contrato_aluguel_planeta_locacoes_template.html?v=37";
  const CONTRACT_PIX = "gv8407940@gmail.com";
  const CONTRACT_PIX_HOLDER = "Gabriel Victor Souza Silva";
  const DEMO_ITEM_NAMES = [
    "conjunto mesa com 4 cadeiras",
    "mesa plastica avulsa",
    "cadeira plastica avulsa",
    "forro branco",
    "forro preto",
    "forro vermelho",
    "forro rosa",
    "forro amarelo",
    "forro verde",
  ];

  const state = {
    items: [],
    stockMovements: [],
    clients: [],
    rentals: [],
    expenses: [],
    payments: [],
    kits: [],
    currentRentalItems: [],
    editingRentalId: null,
    deferredInstallPrompt: null,
    contractTemplate: null,
    preparedContractPdf: null,
    stockViewMode: "detailed",
    dailyPricingEnabled: false,
    dailyPricingRows: [],
    availabilityStartDate: "",
    availabilityEndDate: "",
    financePeriodMode: "month",
    financeMonth: "",
    financePreset: "30d",
  };

  const moneyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    try {
      await PlanetaDB.open();
      await PlanetaDB.seedIfEmpty();
      await removeSeededDemoDataIfSafe();
      await migrateFinanceData();
      await loadPreferences();
      resetAvailabilityPeriod();
      resetFinancePeriod();
      bindEvents();
      await loadAll();
      startNewRental();
      refreshAll();
      registerServiceWorker();
      setupInstallPrompt();

    } catch (error) {
      console.error(error);
      alert("Não foi possível iniciar o sistema local. Verifique se o navegador permite IndexedDB.");
    }
  }

  function bindEvents() {
    $$(".nav-btn").forEach((button) => {
      button.addEventListener("click", () => showView(button.dataset.view));
    });
    $("#menuToggle").addEventListener("click", toggleAppMenu);
    $("#menuClose").addEventListener("click", closeAppMenu);
    $("#menuOverlay").addEventListener("click", closeAppMenu);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeAppMenu();
      }
    });

    $$("[data-shortcut-view]").forEach((button) => {
      button.addEventListener("click", () => showView(button.dataset.shortcutView));
    });

    $("#newItemBtn").addEventListener("click", () => openItemModal());
    $("#newStockEntryBtn").addEventListener("click", () => openStockEntryModal());
    $("#newKitBtn").addEventListener("click", () => openKitModal());
    $("#newClientBtn").addEventListener("click", () => openClientModal());

    $("#stockSearch").addEventListener("input", renderStock);
    $("#stockCategoryFilter").addEventListener("change", renderStock);
    $("#stockColorFilter").addEventListener("change", renderStock);
    $("#stockViewToggle").checked = state.stockViewMode === "detailed";
    $("#stockViewToggle").addEventListener("change", async (event) => {
      state.stockViewMode = event.currentTarget.checked ? "detailed" : "simple";
      await PlanetaDB.setMeta("stockViewMode", state.stockViewMode);
      renderStock();
    });
    $$("[data-availability-start], [data-availability-end]").forEach((input) => {
      input.addEventListener("change", handleAvailabilityDateChange);
    });
    $$("[data-action='apply-availability']").forEach((button) => {
      button.addEventListener("click", handleAvailabilityApply);
    });
    $$("[data-action='availability-today']").forEach((button) => {
      button.addEventListener("click", handleAvailabilityToday);
    });
    $("#clientsSearch").addEventListener("input", renderClients);
    $("#rentalsSearch").addEventListener("input", renderRentals);
    $("#rentalStatusFilter").addEventListener("change", renderRentals);
    $("#rentalDateFilter").addEventListener("change", renderRentals);
    $("#expenseSearch").addEventListener("input", renderExpenses);
    $("#expenseTypeFilter").addEventListener("change", renderExpenses);
    $("#expenseStatusFilter").addEventListener("change", renderExpenses);
    $("#expenseCategoryFilter").addEventListener("change", renderExpenses);
    $$("[data-finance-period-mode]").forEach((button) => {
      button.addEventListener("click", () => setFinancePeriodMode(button.dataset.financePeriodMode));
    });
    $$("[data-finance-preset]").forEach((button) => {
      button.addEventListener("click", () => setFinancePreset(button.dataset.financePreset));
    });
    $("#financeMonthPicker").addEventListener("change", handleFinanceMonthChange);
    $("#financeTypeFilter").addEventListener("change", renderFinance);
    $("#financeCategoryFilter").addEventListener("change", renderFinance);

    $("#stockList").addEventListener("click", handleStockClick);
    $("#stockList").addEventListener("keydown", handleItemSurfaceKeydown);
    $("#kitsList").addEventListener("click", handleKitClick);
    $("#clientsList").addEventListener("click", handleClientClick);
    $("#rentalsList").addEventListener("click", handleRentalClick);
    $("#rentalsList").addEventListener("keydown", handleRentalKeydown);
    $("#receivablesList").addEventListener("click", handleReceivableClick);
    $("#receivablesList").addEventListener("keydown", handleReceivableKeydown);
    $("#expenseList").addEventListener("click", handleExpenseClick);
    $("#financeList").addEventListener("click", handleFinanceClick);
    $("#paymentReviewList").addEventListener("click", handlePaymentReviewClick);

    $("#rentalForm").addEventListener("submit", (event) => {
      event.preventDefault();
      saveRental();
    });
    $("#saveQuoteBtn").addEventListener("click", () => saveRental("quote"));
    $("#saveReservationBtn").addEventListener("click", () => saveRental("reserved"));
    $("#generateContractBtn").addEventListener("click", previewContractFromForm);
    $("#resetRentalBtn").addEventListener("click", startNewRental);
    $("#addRentalItemBtn").addEventListener("click", addCurrentRentalItem);
    $("#addRentalKitBtn").addEventListener("click", addCurrentRentalKit);
    $("#rentalItemsEditor").addEventListener("input", handleRentalLineInput);
    $("#rentalItemsEditor").addEventListener("click", handleRentalLineClick);
    $("#rentalDailyPricingToggle").addEventListener("change", handleDailyPricingToggle);
    $("#dailyPricingEditor").addEventListener("input", handleDailyPricingInput);
    $("#dailyPricingEditor").addEventListener("change", handleDailyPricingInput);
    $("#dailyPricingEditor").addEventListener("click", handleDailyPricingClick);
    $("#rentalDiscount").addEventListener("input", renderRentalTotals);
    $("#rentalFreight").addEventListener("input", renderRentalTotals);
    $("#rentalDeposit").addEventListener("input", renderRentalTotals);
    $("#rentalStartDate").addEventListener("change", handleRentalDateChange);
    $("#rentalEndDate").addEventListener("change", handleRentalDateChange);
    $("#rentalClientCpf").addEventListener("blur", handleRentalCpfLookup);
    $("#rentalClientCpf").addEventListener("input", () => {
      const input = $("#rentalClientCpf");
      input.value = formatDocument(onlyDigits(input.value).slice(0, 14));
      $("#rentalClientId").value = "";
      $("#clientMatchInfo").textContent = "";
    });

    $("#exportBackupBtn").addEventListener("click", exportBackup);
    $("#importBackupInput").addEventListener("change", importBackup);
    $("#clearStockBtn").addEventListener("click", clearStockData);
    $("#clearDataBtn").addEventListener("click", clearAllData);
    $("#newExpenseBtn").addEventListener("click", () => openExpenseModal());
    $("#newInstallmentBtn").addEventListener("click", () => openInstallmentModal());
    $("#newSupplierOffsetBtn").addEventListener("click", () => openSupplierOffsetModal());

    $("#modalRoot").addEventListener("click", (event) => {
      if (event.target.dataset.closeModal === "true") {
        closeModal();
      }
    });
  }

  async function loadAll() {
    const [items, stockMovements, clients, rentals, expenses, payments, kits] = await Promise.all([
      PlanetaDB.getAll("items"),
      PlanetaDB.getAll("stockMovements"),
      PlanetaDB.getAll("clients"),
      PlanetaDB.getAll("rentals"),
      PlanetaDB.getAll("expenses"),
      PlanetaDB.getAll("payments"),
      PlanetaDB.getAll("kits"),
    ]);

    state.items = items.sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
    state.stockMovements = stockMovements.sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
    state.clients = clients.sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
    state.rentals = rentals.sort((a, b) => Number(b.orderNumber) - Number(a.orderNumber));
    state.expenses = expenses.map(normalizeStoredExpense).sort((a, b) => String(getExpenseDate(b)).localeCompare(String(getExpenseDate(a))));
    state.payments = payments.sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
    state.kits = kits.sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
  }

  async function loadPreferences() {
    const stockViewMode = await PlanetaDB.getMeta("stockViewMode", "detailed");
    state.stockViewMode = stockViewMode === "simple" ? "simple" : "detailed";
  }

  async function removeSeededDemoDataIfSafe() {
    const alreadyCleaned = await PlanetaDB.getMeta("demoSeedCleanupV1", false);
    if (alreadyCleaned) {
      return;
    }

    const [items, clients, rentals] = await Promise.all([
      PlanetaDB.getAll("items"),
      PlanetaDB.getAll("clients"),
      PlanetaDB.getAll("rentals"),
    ]);
    const demoItems = items.filter(isDemoItem);

    if (!demoItems.length) {
      await PlanetaDB.setMeta("demoSeedCleanupV1", true);
      await PlanetaDB.setMeta("seededV1", true);
      return;
    }

    const demoRentals = rentals.filter(isDemoRental);
    const demoRentalIds = new Set(demoRentals.map((rental) => Number(rental.id)));
    const realRentals = rentals.filter((rental) => !demoRentalIds.has(Number(rental.id)));
    const realRentalItemIds = new Set(
      realRentals.flatMap((rental) => (Array.isArray(rental.items) ? rental.items.map((line) => Number(line.itemId)) : []))
    );

    for (const rental of demoRentals) {
      await PlanetaDB.remove("rentals", Number(rental.id));
    }

    for (const client of clients.filter(isDemoClient)) {
      const usedByRealRental = realRentals.some((rental) => Number(rental.clientId) === Number(client.id));
      if (!usedByRealRental) {
        await PlanetaDB.remove("clients", Number(client.id));
      }
    }

    for (const item of demoItems) {
      if (!realRentalItemIds.has(Number(item.id))) {
        await PlanetaDB.remove("items", Number(item.id));
      }
    }

    await PlanetaDB.setMeta("seededV1", true);
    await PlanetaDB.setMeta("demoSeedCleanupV1", true);
  }

  function isDemoItem(item) {
    return DEMO_ITEM_NAMES.includes(normalize(item?.name));
  }

  function isDemoClient(client) {
    return normalize(client?.name) === "cliente exemplo" && normalize(client?.notes).includes("teste");
  }

  function isDemoRental(rental) {
    return Number(rental?.orderNumber) === 1001 && normalize(rental?.notes).includes("pedido de exemplo");
  }

  async function migrateFinanceData() {
    const migrated = await PlanetaDB.getMeta("financeMigrationV3", false);
    if (migrated) {
      return;
    }

    const expenses = await PlanetaDB.getAll("expenses");
    for (const expense of expenses) {
      const normalized = normalizeStoredExpense(expense);
      if (normalized.expenseType !== expense.expenseType || normalized.status !== expense.status) {
        await PlanetaDB.put("expenses", normalized);
      }
    }

    await PlanetaDB.setMeta("financeMigrationV3", true);
  }

  function normalizeStoredExpense(expense) {
    const normalized = {
      ...expense,
      expenseType: normalizeExpenseType(expense),
    };

    if (!normalized.status || normalized.status === "installment") {
      normalized.status = "pending";
    }

    return normalized;
  }

  function refreshAll() {
    renderFormOptions();
    renderDashboard();
    renderStockFilters();
    renderStock();
    renderKits();
    renderClients();
    renderRentalItemsEditor();
    renderRentals();
    renderReceivables();
    renderExpenseFilters();
    renderExpenses();
    renderPaymentReview();
    renderFinanceFilters();
    renderFinance();
    renderBackup();
  }

  function showView(viewName) {
    closeAppMenu();
    $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
    $$(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
    if (viewName === "expenses") {
      renderExpenses();
    }
    if (viewName === "finance") {
      renderFinance();
    }
    if (viewName === "payment-review") {
      renderPaymentReview();
    }
    if (viewName === "receivables") {
      renderReceivables();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleAppMenu() {
    setAppMenuOpen(!$("#appMenu").classList.contains("is-open"));
  }

  function closeAppMenu() {
    setAppMenuOpen(false);
  }

  function setAppMenuOpen(isOpen) {
    const menu = $("#appMenu");
    const overlay = $("#menuOverlay");
    const toggle = $("#menuToggle");
    menu.classList.toggle("is-open", isOpen);
    overlay.classList.toggle("is-visible", isOpen);
    menu.setAttribute("aria-hidden", String(!isOpen));
    overlay.setAttribute("aria-hidden", String(!isOpen));
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
    document.body.classList.toggle("menu-open", isOpen);
  }

  function resetAvailabilityPeriod() {
    const today = todayISO();
    state.availabilityStartDate = today;
    state.availabilityEndDate = today;
  }

  function getAvailabilityPeriod() {
    const startDate = state.availabilityStartDate || todayISO();
    const endDate = state.availabilityEndDate || startDate;
    return endDate < startDate ? { startDate: endDate, endDate: startDate } : { startDate, endDate };
  }

  function getAvailabilityPeriodLabel() {
    const { startDate, endDate } = getAvailabilityPeriod();
    return startDate === endDate
      ? `Disponibilidade em ${formatDate(startDate)}`
      : `Disponibilidade de ${formatDate(startDate)} até ${formatDate(endDate)}`;
  }

  function syncAvailabilityControls() {
    const { startDate, endDate } = getAvailabilityPeriod();
    $$("[data-availability-start]").forEach((input) => {
      input.value = startDate;
    });
    $$("[data-availability-end]").forEach((input) => {
      input.value = endDate;
    });
    $$("[data-availability-label]").forEach((label) => {
      label.textContent = getAvailabilityPeriodLabel();
    });
  }

  function setAvailabilityPeriod(startDate, endDate) {
    const fallback = todayISO();
    const start = startDate || fallback;
    const end = endDate || start;
    state.availabilityStartDate = start;
    state.availabilityEndDate = end < start ? start : end;
    syncAvailabilityControls();
    renderDashboard();
    renderStock();
    renderKits();
  }

  function handleAvailabilityDateChange(event) {
    const control = event.target.closest("[data-availability-control]");
    const startDate = control?.querySelector("[data-availability-start]")?.value || state.availabilityStartDate;
    const endDate = control?.querySelector("[data-availability-end]")?.value || startDate;
    setAvailabilityPeriod(startDate, endDate);
  }

  function handleAvailabilityApply(event) {
    const control = event.target.closest("[data-availability-control]");
    const startDate = control?.querySelector("[data-availability-start]")?.value || state.availabilityStartDate;
    const endDate = control?.querySelector("[data-availability-end]")?.value || startDate;
    setAvailabilityPeriod(startDate, endDate);
    showToast(getAvailabilityPeriodLabel());
  }

  function handleAvailabilityToday() {
    const today = todayISO();
    setAvailabilityPeriod(today, today);
  }

  function resetFinancePeriod() {
    state.financePeriodMode = "month";
    state.financeMonth = todayISO().slice(0, 7);
    state.financePreset = "30d";
  }

  function getFinancePeriod() {
    const today = todayISO();
    if (state.financePeriodMode === "month") {
      const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(state.financeMonth)
        ? state.financeMonth
        : today.slice(0, 7);
      const startDate = `${month}-01`;
      return {
        startDate,
        endDate: addDaysToISODate(addMonthsToISODate(startDate, 1), -1),
        label: formatFinanceMonth(month),
      };
    }

    const preset = FINANCE_PERIOD_PRESETS[state.financePreset] || FINANCE_PERIOD_PRESETS["30d"];
    return {
      startDate: preset.days
        ? addDaysToISODate(today, -(preset.days - 1))
        : addMonthsToISODate(today, -preset.months),
      endDate: today,
      label: preset.label,
    };
  }

  function syncFinancePeriodControls(period = getFinancePeriod()) {
    const isMonthMode = state.financePeriodMode === "month";
    $("#financeMonthPicker").value = state.financeMonth || todayISO().slice(0, 7);
    $("#financeMonthControl").hidden = !isMonthMode;
    $("#financePresetControl").hidden = isMonthMode;
    $$("[data-finance-period-mode]").forEach((button) => {
      const isActive = button.dataset.financePeriodMode === state.financePeriodMode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    $$("[data-finance-preset]").forEach((button) => {
      const isActive = !isMonthMode && button.dataset.financePreset === state.financePreset;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    $("#financeTitle").textContent = `Relatório financeiro: ${period.label}`;
    $("#financePeriodRange").textContent = `${formatDate(period.startDate)} até ${formatDate(period.endDate)}`;
  }

  function setFinancePeriodMode(mode) {
    state.financePeriodMode = mode === "preset" ? "preset" : "month";
    renderFinance();
  }

  function setFinancePreset(preset) {
    if (!FINANCE_PERIOD_PRESETS[preset]) {
      return;
    }

    state.financePreset = preset;
    state.financePeriodMode = "preset";
    renderFinance();
  }

  function handleFinanceMonthChange(event) {
    if (event.currentTarget.value) {
      state.financeMonth = event.currentTarget.value;
    }
    state.financePeriodMode = "month";
    renderFinance();
  }

  function renderDashboard() {
    syncAvailabilityControls();
    const { startDate, endDate } = getAvailabilityPeriod();
    const activeRentals = state.rentals.filter(isActiveRental);
    const scheduleEntries = getScheduleEntries(3);
    const upcomingStarts = scheduleEntries.filter((entry) => entry.actionType === "start").length;
    const upcomingEnds = scheduleEntries.filter((entry) => entry.actionType === "end").length;
    const receivable = getPendingRentals()
      .reduce((sum, rental) => sum + getRentalReceivableAmount(rental), 0);
    const availableUnits = state.items.reduce((sum, item) => sum + getItemAvailabilityForPeriod(item, startDate, endDate).available, 0);

    $("#dashboardStats").innerHTML = [
      ["Locações ativas", activeRentals.length],
      ["Entregar/retirar 3 dias", upcomingStarts],
      ["Buscar/devolver 3 dias", upcomingEnds],
      ["Valor a receber", formatMoney(receivable)],
      ["Itens disponíveis no período", availableUnits],
    ]
      .map(([label, value]) => `<article class="kpi-card"><span>${label}</span><strong>${value}</strong></article>`)
      .join("");

    $("#todayList").innerHTML = renderUpcomingAgenda(scheduleEntries);
    $("#reservationReminders").innerHTML = renderReservationReminders(scheduleEntries);
  }

  function getScheduleEntries(days = 3) {
    const today = todayISO();
    const dates = Array.from({ length: days }, (_, index) => addDaysToISODate(today, index));
    const dateSet = new Set(dates);
    const entries = [];

    state.rentals.forEach((rental) => {
      if (["quote", "cancelled", "returned"].includes(rental.status)) {
        return;
      }

      if (rental.status === "reserved" && dateSet.has(rental.startDate)) {
        entries.push(buildScheduleEntry(rental, rental.startDate, "start"));
      }

      if (["reserved", "delivered"].includes(rental.status) && dateSet.has(rental.endDate)) {
        entries.push(buildScheduleEntry(rental, rental.endDate, "end"));
      }
    });

    return entries.sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      if (dateCompare) {
        return dateCompare;
      }
      return Number(a.rental.orderNumber || 0) - Number(b.rental.orderNumber || 0);
    });
  }

  function buildScheduleEntry(rental, date, actionType) {
    const client = getClient(rental.clientId);
    return {
      rental,
      client,
      date,
      actionType,
      actionLabel: getScheduleActionLabel(rental, actionType),
      itemText: getRentalItemSummary(rental),
    };
  }

  function renderUpcomingAgenda(entries) {
    const dates = Array.from({ length: 3 }, (_, index) => addDaysToISODate(todayISO(), index));
    const sections = dates.map((date) => {
      const dayEntries = entries.filter((entry) => entry.date === date);
      return `
        <div class="agenda-day">
          <div class="agenda-day-head">
            <strong>${escapeHtml(getRelativeDateLabel(date))}</strong>
            <span>${formatDate(date)}</span>
          </div>
          <div class="compact-list">
            ${dayEntries.length ? dayEntries.map(renderScheduleEntry).join("") : emptyState("Nenhuma reserva nesta data.")}
          </div>
        </div>
      `;
    });

    return sections.join("");
  }

  function renderReservationReminders(entries) {
    const reminders = entries.slice(0, 8);
    if (!reminders.length) {
      return emptyState("Nenhuma entrega, busca ou devolução nos próximos 3 dias.");
    }

    return reminders
      .map((entry) => {
        const isToday = entry.date === todayISO();
        return `
          <div class="compact-item reminder-item ${isToday ? "today" : ""}">
            <div>
              <strong>${escapeHtml(entry.actionLabel)} - pedido ${escapeHtml(entry.rental.orderNumber)}</strong>
              <span>${formatDate(entry.date)} · ${escapeHtml(entry.client?.name || "Cliente não encontrado")}</span>
              <span>${escapeHtml(entry.itemText)}</span>
            </div>
            <span>${isToday ? "Hoje" : statusLabel(entry.rental.status)}</span>
          </div>
        `;
      })
      .join("");
  }

  function renderScheduleEntry(entry) {
    return `
      <div class="compact-item agenda-item">
        <div>
          <strong>${escapeHtml(entry.actionLabel)} - pedido ${escapeHtml(entry.rental.orderNumber)}</strong>
          <span>${escapeHtml(entry.client?.name || "Cliente não encontrado")} · ${escapeHtml(entry.itemText)}</span>
          <span>Entrega/retirada: ${formatDate(entry.rental.startDate)} · Devolução/busca: ${formatDate(entry.rental.endDate)}</span>
          <span>Status: ${statusLabel(entry.rental.status)} · Pagamento: ${PAYMENT_STATUS[entry.rental.paymentStatus] || entry.rental.paymentStatus || "-"}</span>
        </div>
        <span>${formatMoney(getRentalTotals(entry.rental).total)}</span>
      </div>
    `;
  }

  function getScheduleActionLabel(rental, actionType) {
    if (actionType === "start") {
      return "Entregar/retirar";
    }

    return rental.status === "reserved" ? "Devolução prevista" : "Buscar/devolver";
  }

  function getRentalItemSummary(rental) {
    const lines = Array.isArray(rental.items) ? rental.items : [];
    if (!lines.length) {
      return "Sem itens";
    }

    const visible = lines.slice(0, 2).map((line) => `${line.qty}x ${line.name}`);
    const remaining = lines.length - visible.length;
    return remaining > 0 ? `${visible.join(", ")} +${remaining}` : visible.join(", ");
  }

  function renderStockFilters() {
    fillSelect($("#stockCategoryFilter"), uniqueValues(state.items.map((item) => item.category)), "Todas");
    fillSelect($("#stockColorFilter"), uniqueValues(state.items.map((item) => item.color).filter(Boolean)), "Todas");
  }

  function renderStock() {
    syncAvailabilityControls();
    const search = normalize($("#stockSearch").value);
    const category = $("#stockCategoryFilter").value;
    const color = $("#stockColorFilter").value;
    const items = state.items
      .filter((item) => {
        const text = normalize(`${item.name} ${item.category} ${item.color} ${item.notes}`);
        return (!search || text.includes(search)) && (!category || item.category === category) && (!color || item.color === color);
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));

    if (state.stockViewMode === "simple") {
      $("#stockList").classList.add("stock-simple-list");
      $("#stockList").innerHTML = items.length ? items.map(renderStockNameCard).join("") : emptyState("Nenhum item encontrado.");
      return;
    }

    $("#stockList").classList.remove("stock-simple-list");
    $("#stockList").innerHTML = items.length ? items.map(renderItemCard).join("") : emptyState("Nenhum item encontrado.");
  }

  function renderStockNameCard(item) {
    return `
      <article class="stock-name-card clickable-item" role="button" tabindex="0" data-item-id="${item.id}">
        <strong>${escapeHtml(item.name)}</strong>
      </article>
    `;
  }

  function renderItemCard(item) {
    const stats = getItemStats(item);
    const { startDate, endDate } = getAvailabilityPeriod();
    const periodStats = getItemAvailabilityForPeriod(item, startDate, endDate);
    const conflictText = renderAvailabilityConflictText(item, periodStats.conflicts);
    return `
      <article class="data-card clickable-item" role="button" tabindex="0" data-item-id="${item.id}">
        <div class="card-top">
          <div>
            <h3 class="card-title">${escapeHtml(item.name)}</h3>
            <p class="card-subtitle">${escapeHtml(item.notes || "Sem observações")}</p>
          </div>
          <div class="badge-row">
            <span class="badge">${escapeHtml(item.category || "Item")}</span>
            ${item.color ? `<span class="badge red">${escapeHtml(item.color)}</span>` : ""}
          </div>
        </div>
        <div class="metric-grid">
          <div class="metric"><span>Total</span><strong>${stats.total}</strong></div>
          <div class="metric"><span>Disponível no período</span><strong>${periodStats.available}</strong></div>
          <div class="metric"><span>Ocupado no período</span><strong>${periodStats.occupied}</strong></div>
          <div class="metric"><span>Reservado no período</span><strong>${periodStats.reserved}</strong></div>
          <div class="metric"><span>Entregue/alugado</span><strong>${periodStats.delivered}</strong></div>
          <div class="metric"><span>Reservado futuro</span><strong>${stats.futureReserved}</strong></div>
          <div class="metric"><span>Próxima reserva</span><strong>${stats.nextReservationDate ? formatDate(stats.nextReservationDate) : "-"}</strong></div>
          <div class="metric"><span>Devolvido</span><strong>${stats.returned}</strong></div>
          <div class="metric"><span>Indisponível</span><strong>${stats.unavailable}</strong></div>
        </div>
        ${conflictText ? `<p class="muted-text"><strong>Uso no período:</strong><br>${conflictText}</p>` : `<p class="muted-text">Nenhuma locação ocupando este item no período consultado.</p>`}
        <p class="muted-text">Valor padrão: <strong>${formatMoney(item.defaultPrice || 0)}</strong></p>
        <div class="card-actions">
          <button type="button" data-action="edit-item" data-id="${item.id}">Editar</button>
          <button type="button" class="danger-mini" data-action="delete-item" data-id="${item.id}">Excluir</button>
        </div>
      </article>
    `;
  }

  function renderKits() {
    syncAvailabilityControls();
    $("#kitsList").innerHTML = state.kits.length ? state.kits.map(renderKitCard).join("") : emptyState("Cadastre conjuntos para lançar locações mais rápido.");
  }

  function renderKitCard(kit) {
    const components = Array.isArray(kit.items) ? kit.items : [];
    const { startDate, endDate } = getAvailabilityPeriod();
    const kitAvailability = getKitAvailabilityForPeriod(kit, startDate, endDate);
    const componentText = components.length
      ? components
          .map((component) => {
            const item = getItem(component.itemId);
            const itemAvailability = item ? getItemAvailabilityForPeriod(item, startDate, endDate) : null;
            const availableText = itemAvailability ? ` - ${itemAvailability.available} disponivel` : "";
            return `${escapeHtml(component.qty)}x ${escapeHtml(item?.name || component.name || "Item removido")}${availableText}`;
          })
          .join("<br>")
      : "Sem itens";

    return `
      <article class="data-card">
        <div class="card-top">
          <div>
            <h3 class="card-title">${escapeHtml(kit.name)}</h3>
            <p class="card-subtitle">${escapeHtml(kit.notes || "Sem observações")}</p>
          </div>
          <span class="badge">${components.length} item${components.length === 1 ? "" : "s"}</span>
        </div>
        <div class="metric-grid">
          <div class="metric"><span>Disponível no período</span><strong>${kitAvailability.available}</strong></div>
          <div class="metric"><span>Item limitante</span><strong>${escapeHtml(kitAvailability.limitingItem || "-")}</strong></div>
        </div>
        <p class="muted-text">${componentText}</p>
        <div class="card-actions">
          <button type="button" data-action="edit-kit" data-id="${kit.id}">Editar</button>
          <button type="button" class="danger-mini" data-action="delete-kit" data-id="${kit.id}">Excluir</button>
        </div>
      </article>
    `;
  }

  function renderClients() {
    const search = normalize($("#clientsSearch").value);
    const clients = state.clients.filter((client) => {
      const text = normalize(`${client.name} ${client.phone} ${client.document} ${client.address} ${client.notes}`);
      return !search || text.includes(search);
    });

    $("#clientsList").innerHTML = clients.length ? clients.map(renderClientCard).join("") : emptyState("Nenhum cliente encontrado.");
  }

  function renderClientCard(client) {
    const rentals = state.rentals.filter((rental) => Number(rental.clientId) === Number(client.id));
    const history = rentals.slice(0, 4).map((rental) => `
      <div class="compact-item">
        <div>
          <strong>Pedido ${escapeHtml(rental.orderNumber)}</strong>
          <span>${formatDate(rental.startDate)} a ${formatDate(rental.endDate)}</span>
        </div>
        <span>${statusLabel(rental.status)}</span>
      </div>
    `);

    return `
      <article class="data-card">
        <div class="card-top">
          <div>
            <h3 class="card-title">${escapeHtml(client.name)}</h3>
            <p class="card-subtitle">${escapeHtml(client.phone || "Sem telefone")}</p>
          </div>
          <span class="badge">${rentals.length} locação${rentals.length === 1 ? "" : "es"}</span>
        </div>
        <p class="muted-text">
          ${client.document ? `${getDocumentLabel(client.document)}: ${escapeHtml(client.document)}<br>` : ""}
          ${client.address ? `Endereço: ${escapeHtml(client.address)}<br>` : ""}
          ${client.notes ? `Obs.: ${escapeHtml(client.notes)}` : ""}
        </p>
        <div class="compact-list">${history.length ? history.join("") : emptyState("Sem histórico de locações.")}</div>
        <div class="card-actions">
          <button type="button" data-action="edit-client" data-id="${client.id}">Editar</button>
          <button type="button" class="danger-mini" data-action="delete-client" data-id="${client.id}">Excluir</button>
        </div>
      </article>
    `;
  }

  function renderFormOptions() {
    $("#rentalItemSelect").innerHTML = state.items.length
      ? state.items.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${formatMoney(item.defaultPrice || 0)}</option>`).join("")
      : `<option value="">Cadastre itens no estoque</option>`;
    $("#rentalKitSelect").innerHTML = state.kits.length
      ? state.kits.map((kit) => `<option value="${kit.id}">${escapeHtml(kit.name)}</option>`).join("")
      : `<option value="">Cadastre conjuntos</option>`;
  }

  function startNewRental() {
    state.editingRentalId = null;
    state.currentRentalItems = [];
    state.dailyPricingEnabled = false;
    state.dailyPricingRows = [];
    $("#rentalId").value = "";
    $("#rentalClientId").value = "";
    $("#newRentalTitle").textContent = "Nova locação";
    $("#rentalForm").reset();
    $("#clientMatchInfo").textContent = "";
    $("#rentalOrderDate").value = todayISO();
    $("#rentalStartDate").value = todayISO();
    $("#rentalEndDate").value = todayISO();
    $("#rentalDiscount").value = "0";
    $("#rentalFreight").value = "0";
    $("#rentalDeposit").value = "0";
    $("#rentalPaymentMethod").value = "Pix";
    $("#rentalPaymentStatus").value = "unpaid";
    $("#rentalStatus").value = "quote";
    $("#rentalDailyPricingToggle").checked = false;
    renderDailyPricingEditor();
    renderRentalItemsEditor();
    renderRentalTotals();
  }

  function addCurrentRentalItem() {
    const itemId = Number($("#rentalItemSelect").value);
    const item = getItem(itemId);
    const qty = Math.max(1, toNumber($("#rentalItemQty").value));

    if (!item) {
      alert("Cadastre um item no estoque antes de adicionar à locação.");
      return;
    }

    const existing = state.currentRentalItems.find((line) => Number(line.itemId) === itemId && !line.originType);
    if (existing) {
      existing.qty += qty;
    } else {
      state.currentRentalItems.push({
        itemId: item.id,
        name: item.name,
        qty,
        unitPrice: Number(item.defaultPrice) || 0,
      });
    }

    $("#rentalItemQty").value = "1";
    renderRentalItemsEditor();
  }

  function addCurrentRentalKit() {
    const kitId = Number($("#rentalKitSelect").value);
    const kit = getKit(kitId);
    const qty = Math.max(1, Math.floor(toNumber($("#rentalKitQty").value)));

    if (!kit) {
      alert("Cadastre um conjunto antes de adicionar à locação.");
      return;
    }

    if (!Array.isArray(kit.items) || !kit.items.length) {
      alert("Este conjunto não tem itens cadastrados.");
      return;
    }

    const missingItems = [];
    kit.items.forEach((component) => {
      const item = getItem(component.itemId);
      if (!item) {
        missingItems.push(component.name || `Item ${component.itemId}`);
        return;
      }

      const generatedQty = Math.max(1, toNumber(component.qty)) * qty;
      const existing = state.currentRentalItems.find(
        (line) => Number(line.itemId) === Number(item.id) && line.originType === "kit" && Number(line.originKitId) === Number(kit.id)
      );

      if (existing) {
        existing.qty += generatedQty;
        existing.originKitQty = Math.max(1, toNumber(existing.originKitQty)) + qty;
      } else {
        state.currentRentalItems.push({
          itemId: item.id,
          name: item.name,
          qty: generatedQty,
          unitPrice: Number(item.defaultPrice) || 0,
          originType: "kit",
          originName: kit.name,
          originKitId: kit.id,
          originKitQty: qty,
          kitComponentQty: Math.max(1, toNumber(component.qty)),
        });
      }
    });

    if (missingItems.length) {
      alert(`Alguns itens do conjunto não existem mais no estoque:\n\n${missingItems.join("\n")}`);
    }

    $("#rentalKitQty").value = "1";
    renderRentalItemsEditor();
    const shortages = getCurrentRentalShortages();
    if (shortages.length) {
      alert(`Atenção: o conjunto foi adicionado, mas há falta de estoque no período:\n\n${shortages.join("\n")}`);
    }
  }

  function renderRentalItemsEditor() {
    const container = $("#rentalItemsEditor");
    if (!container) {
      return;
    }

    syncDailyPricingRows();
    renderDailyPricingEditor();

    if (!state.currentRentalItems.length) {
      container.innerHTML = emptyState("Adicione pelo menos um item.");
      renderRentalTotals();
      return;
    }

    const startDate = $("#rentalStartDate").value;
    const endDate = $("#rentalEndDate").value;
    container.innerHTML = state.currentRentalItems
      .map((line, index) => {
        const item = getItem(line.itemId);
        const availabilityText = getRentalLineAvailabilityText(item, line, startDate, endDate);
        const originText = line.originType === "kit" ? `<span class="badge">Origem: ${escapeHtml(line.originName || "Conjunto")}</span>` : "";
        return `
          <div class="line-card">
            <div>
              <h4>${escapeHtml(line.name)}</h4>
              <div class="badge-row">${availabilityText}${originText}</div>
            </div>
            <div class="line-inputs">
              <label>
                Qtde
                <input type="number" min="1" inputmode="numeric" value="${line.qty}" data-line-field="qty" data-index="${index}">
              </label>
              <label>
                Valor unit.
                <input type="number" min="0" step="0.01" inputmode="decimal" value="${line.unitPrice}" data-line-field="unitPrice" data-index="${index}">
              </label>
            </div>
            <div class="mini-actions">
              <button type="button" data-action="remove-line" data-index="${index}">Remover</button>
            </div>
          </div>
        `;
      })
      .join("");

    renderRentalTotals();
  }

  function getRentalLineAvailabilityText(item, line, startDate, endDate) {
    if (!item) {
      return `<span class="badge red">Item não encontrado</span>`;
    }

    if (!startDate || !endDate) {
      return `<span class="badge">Escolha as datas para ver a disponibilidade real</span>`;
    }

    if (endDate < startDate) {
      return `<span class="badge red">Confira as datas da locação</span>`;
    }

    const available = getAvailableForPeriod(item, startDate, endDate, state.editingRentalId);
    const total = Number(item.totalQty) || 0;
    const isShort = available < (Number(line.qty) || 0);
    return `<span class="badge ${isShort ? "red" : "green"}">Disponível no período selecionado: ${available} de ${total}</span>`;
  }

  function handleRentalLineInput(event) {
    const index = Number(event.target.dataset.index);
    const field = event.target.dataset.lineField;

    if (!field || !state.currentRentalItems[index]) {
      return;
    }

    const value = field === "qty" ? Math.max(1, toNumber(event.target.value)) : Math.max(0, toNumber(event.target.value));
    state.currentRentalItems[index][field] = value;
    syncDailyPricingRows();
    renderDailyPricingEditor();
    renderRentalTotals();
  }

  function handleRentalLineClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || button.dataset.action !== "remove-line") {
      return;
    }

    state.currentRentalItems.splice(Number(button.dataset.index), 1);
    renderRentalItemsEditor();
  }

  function handleRentalDateChange() {
    syncDailyPricingRows();
    renderRentalItemsEditor();
    renderDailyPricingEditor();
    renderRentalTotals();
  }

  function handleDailyPricingToggle(event) {
    state.dailyPricingEnabled = event.currentTarget.checked;
    syncDailyPricingRows();
    renderDailyPricingEditor();
    renderRentalTotals();
  }

  function renderDailyPricingEditor() {
    const container = $("#dailyPricingEditor");
    if (!container) {
      return;
    }

    container.hidden = !state.dailyPricingEnabled;
    if (!state.dailyPricingEnabled) {
      container.innerHTML = "";
      return;
    }

    if (!state.currentRentalItems.length) {
    container.innerHTML = emptyState("Adicione itens ou conjuntos para configurar as diárias.");
      return;
    }

    const startDate = $("#rentalStartDate").value;
    const endDate = $("#rentalEndDate").value;
    if (!startDate || !endDate || endDate < startDate) {
      container.innerHTML = emptyState("Escolha datas válidas para configurar a cobrança por dias.");
      return;
    }

    syncDailyPricingRows();
    const rows = state.dailyPricingRows.map((row, rowIndex) => {
      const rowTotal = getDailyPricingRowTotal(row);
      return `
        <div class="daily-row">
          <div class="daily-row-head">
            <div>
              <strong>${escapeHtml(row.label)}</strong>
              <span>${escapeHtml(row.qty)} ${escapeHtml(row.unitLabel || "unidade")}(s)</span>
            </div>
            <strong>${formatMoney(rowTotal)}</strong>
          </div>
          <div class="daily-days">
            ${row.days
              .map((day, dayIndex) => {
                const dayTotal = day.charge ? roundMoney(row.qty * toNumber(day.unitPrice)) : 0;
                return `
                  <div class="daily-day-card">
                    <label class="check-row">
                      <input type="checkbox" ${day.charge ? "checked" : ""} data-daily-field="charge" data-row-index="${rowIndex}" data-day-index="${dayIndex}">
                      <span>Cobrar ${formatDate(day.date)}</span>
                    </label>
                    <label>
                      Valor por ${escapeHtml(row.unitLabel || "unidade")}
                      <input type="number" min="0" step="0.01" inputmode="decimal" value="${escapeAttr(day.unitPrice)}" data-daily-field="unitPrice" data-row-index="${rowIndex}" data-day-index="${dayIndex}">
                    </label>
                    <div class="daily-day-foot">
                      <span>${formatMoney(dayTotal)}</span>
                      <button type="button" data-action="copy-daily-price" data-row-index="${rowIndex}" data-day-index="${dayIndex}">Aplicar próximos</button>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="daily-pricing-note">
        <strong>Subtotal das diarias: ${formatMoney(getDailyPricingSubtotal(getCurrentDailyPricingPayload()))}</strong>
        <span>Desative dias que não serão cobrados ou ajuste os valores manualmente.</span>
      </div>
      ${rows.join("")}
    `;
  }

  function handleDailyPricingInput(event) {
    const field = event.target.dataset.dailyField;
    if (!field) {
      return;
    }

    const row = state.dailyPricingRows[Number(event.target.dataset.rowIndex)];
    const day = row?.days?.[Number(event.target.dataset.dayIndex)];
    if (!row || !day) {
      return;
    }

    if (field === "charge") {
      day.charge = event.target.checked;
      renderDailyPricingEditor();
    } else if (field === "unitPrice") {
      day.unitPrice = Math.max(0, toNumber(event.target.value));
    }

    renderRentalTotals();
  }

  function handleDailyPricingClick(event) {
    const button = event.target.closest("button[data-action='copy-daily-price']");
    if (!button) {
      return;
    }

    const row = state.dailyPricingRows[Number(button.dataset.rowIndex)];
    const sourceDay = row?.days?.[Number(button.dataset.dayIndex)];
    if (!row || !sourceDay) {
      return;
    }

    row.days.forEach((day, index) => {
      if (index > Number(button.dataset.dayIndex)) {
        day.unitPrice = Math.max(0, toNumber(sourceDay.unitPrice));
        day.charge = sourceDay.charge !== false;
      }
    });

    renderDailyPricingEditor();
    renderRentalTotals();
  }

  function syncDailyPricingRows() {
    if (!state.dailyPricingEnabled) {
      state.dailyPricingRows = [];
      return;
    }

    const dates = getRentalDateRange($("#rentalStartDate").value, $("#rentalEndDate").value);
    const sourceRows = buildDailyPricingSourceRows();
    if (!dates.length || !sourceRows.length) {
      state.dailyPricingRows = [];
      return;
    }

    const previousRows = new Map(state.dailyPricingRows.map((row) => [row.key, row]));
    state.dailyPricingRows = sourceRows.map((source) => {
      const previous = previousRows.get(source.key);
      const previousDays = new Map((previous?.days || []).map((day) => [day.date, day]));
      const fallbackDay = previous?.days?.[previous.days.length - 1];
      const fallbackPrice = fallbackDay ? toNumber(fallbackDay.unitPrice) : source.defaultUnitPrice;

      return {
        ...source,
        days: dates.map((date) => {
          const previousDay = previousDays.get(date);
          return {
            date,
            charge: previousDay ? previousDay.charge !== false : true,
            unitPrice: roundMoney(previousDay ? previousDay.unitPrice : fallbackPrice),
          };
        }),
      };
    });
  }

  function buildDailyPricingSourceRows() {
    const groups = new Map();

    state.currentRentalItems.forEach((line) => {
      if (line.originType === "kit") {
        const key = `kit:${line.originKitId || line.originName || line.itemId}`;
        const originQty = Math.max(1, toNumber(line.originKitQty || 1));
        const current = groups.get(key) || {
          key,
          type: "kit",
          label: line.originName || "Conjunto",
          qty: originQty,
          unitLabel: "conjunto",
          componentTotal: 0,
        };
        current.qty = Math.max(current.qty, originQty);
        current.componentTotal += toNumber(line.qty) * toNumber(line.unitPrice);
        groups.set(key, current);
        return;
      }

      const key = `item:${line.itemId}`;
      groups.set(key, {
        key,
        type: "item",
        label: line.name || "Item",
        qty: Math.max(1, toNumber(line.qty)),
        unitLabel: "unidade",
        defaultUnitPrice: Math.max(0, toNumber(line.unitPrice)),
      });
    });

    return Array.from(groups.values()).map((row) => ({
      ...row,
      defaultUnitPrice:
        row.type === "kit" ? roundMoney(toNumber(row.componentTotal) / Math.max(1, toNumber(row.qty))) : roundMoney(row.defaultUnitPrice),
    }));
  }

  function getRentalDateRange(startDate, endDate) {
    if (!startDate || !endDate || endDate < startDate) {
      return [];
    }

    const dates = [];
    let current = startDate;
    while (current <= endDate && dates.length < 120) {
      dates.push(current);
      current = addDaysToISODate(current, 1);
    }
    return dates;
  }

  function getCurrentDailyPricingPayload() {
    if (!state.dailyPricingEnabled) {
      return { enabled: false, rows: [] };
    }

    return {
      enabled: true,
      rows: state.dailyPricingRows.map((row) => ({
        key: row.key,
        type: row.type,
        label: row.label,
        qty: Math.max(1, toNumber(row.qty)),
        unitLabel: row.unitLabel || "unidade",
        defaultUnitPrice: roundMoney(row.defaultUnitPrice),
        days: (row.days || []).map((day) => ({
          date: day.date,
          charge: day.charge !== false,
          unitPrice: Math.max(0, roundMoney(day.unitPrice)),
        })),
      })),
    };
  }

  function getDailyPricingSubtotal(dailyPricing) {
    if (!dailyPricing?.enabled || !Array.isArray(dailyPricing.rows)) {
      return 0;
    }

    return roundMoney(
      dailyPricing.rows.reduce((sum, row) => {
        const qty = Math.max(1, toNumber(row.qty));
        const rowTotal = (row.days || [])
          .filter((day) => day.charge !== false)
          .reduce((daySum, day) => daySum + qty * Math.max(0, toNumber(day.unitPrice)), 0);
        return sum + rowTotal;
      }, 0)
    );
  }

  function getDailyPricingRowTotal(row) {
    return getDailyPricingSubtotal({ enabled: true, rows: [row] });
  }

  function renderRentalTotals() {
    const dailyPricing = getCurrentDailyPricingPayload();
    const totals = calculateTotals(
      state.currentRentalItems,
      toNumber($("#rentalDiscount").value),
      toNumber($("#rentalFreight").value),
      toNumber($("#rentalDeposit").value),
      dailyPricing
    );

    $("#rentalTotals").innerHTML = `
      <div class="totals-row"><span>${dailyPricing.enabled ? "Subtotal das diarias" : "Subtotal"}</span><strong>${formatMoney(totals.subtotal)}</strong></div>
      <div class="totals-row"><span>Desconto</span><strong>${formatMoney(totals.discount)}</strong></div>
      <div class="totals-row"><span>Frete</span><strong>${formatMoney(totals.freight)}</strong></div>
      <div class="totals-row final"><span>Total final</span><strong>${formatMoney(totals.total)}</strong></div>
      <div class="totals-row"><span>Sinal já recebido</span><strong>${formatMoney(totals.deposit)}</strong></div>
      <div class="totals-row"><span>Restante</span><strong>${formatMoney(totals.remaining)}</strong></div>
    `;
  }

  async function saveRental(statusOverride = null) {
    try {
    const rental = buildRentalFromForm(statusOverride);
    if (!rental) {
      return;
    }

    const shortages = checkRentalAvailability(rental, rental.id || null);
    if (shortages.length) {
      const message = `Estoque insuficiente no período:\n\n${shortages.join("\n")}`;
      if (rental.status === "quote") {
        if (!confirm(`${message}\n\nDeseja salvar apenas como orçamento mesmo assim?`)) {
          return;
        }
      } else {
        alert(`${message}\n\nA reserva ou entrega não foi salva.`);
        return;
      }
    }

    const now = new Date().toISOString();
    const existing = rental.id ? state.rentals.find((item) => Number(item.id) === Number(rental.id)) : null;
    const client = await ensureRentalClient(rental.clientDraft, rental.clientId);
    rental.clientId = client.id;
    delete rental.clientDraft;

    if (existing) {
      // Em locações já gravadas, o status passa a ser consequência do histórico.
      // O seletor antigo continua visível para compatibilidade, mas não cria uma
      // quitação sem um recebimento registrado.
      rental.paymentStatus = getRentalSettlement(existing).status;
      rental.orderNumber = existing.orderNumber;
      rental.createdAt = existing.createdAt;
      rental.returnProblems = existing.returnProblems || [];
      rental.paymentReceivedAt = rental.paymentStatus === "paid" ? existing.paymentReceivedAt || now : "";
      rental.paymentReopenedAt = rental.paymentStatus === "paid"
        ? existing.paymentReopenedAt || ""
        : existing.paymentStatus === "paid"
          ? now
          : existing.paymentReopenedAt || "";
      rental.updatedAt = now;
      await PlanetaDB.put("rentals", rental);
      showToast(`Locação ${rental.orderNumber} atualizada.`);
    } else {
      delete rental.id;
      rental.orderNumber = await PlanetaDB.nextOrderNumber();
      rental.createdAt = now;
      rental.updatedAt = now;
      rental.returnProblems = [];
      rental.paymentReceivedAt = rental.paymentStatus === "paid" ? now : "";
      rental.paymentReopenedAt = "";
      const rentalId = await PlanetaDB.add("rentals", rental);
      const initialReceived = rental.paymentStatus === "paid"
        ? getRentalTotals(rental).total
        : rental.paymentStatus === "partial"
          ? Math.min(getRentalTotals(rental).total, toNumber(rental.deposit))
          : 0;
      if (initialReceived > 0) {
        await PlanetaDB.add("payments", {
          recordType: "rental", recordId: rentalId, recordKey: `rental:${rentalId}`,
          kind: "rental-receipt", direction: "inflow", amount: initialReceived,
          date: rental.orderDate || todayISO(), paymentMethod: rental.paymentMethod || "Outro",
          notes: rental.paymentStatus === "paid" ? "Recebimento informado no cadastro" : "Sinal informado no cadastro",
          createdAt: now, updatedAt: now, reconciliationStatus: "unmatched", bankTransactionId: null, inventoryLines: [],
        });
      }
      showToast(`Locação ${rental.orderNumber} salva como ${statusLabel(rental.status)}.`);
    }

    await loadAll();
    startNewRental();
    refreshAll();
    showView("rentals");
    } catch (error) {
      console.error(error);
      const detail = error?.name || error?.message ? `\n\nDetalhe: ${[error?.name, error?.message].filter(Boolean).join(" - ")}` : "";
      alert(`Não foi possível salvar a locação. Verifique os dados e tente novamente.${detail}`);
    }
  }

  function buildRentalFromForm(statusOverride) {
    const clientName = $("#rentalClientName").value.trim();
    const clientCpf = $("#rentalClientCpf").value.trim();
    const clientPhone = $("#rentalClientPhone").value.trim();
    const clientAddress = $("#rentalClientAddress").value.trim();
    const documentDigits = onlyDigits(clientCpf);
    const orderDate = $("#rentalOrderDate").value;
    const startDate = $("#rentalStartDate").value;
    const endDate = $("#rentalEndDate").value;

    if (!clientName) {
      $("#rentalClientName").focus();
      alert("Informe o nome do cliente.");
      return null;
    }

    if (!isValidDocument(clientCpf)) {
      $("#clientMatchInfo").textContent = getDocumentValidationMessage(clientCpf);
      $("#rentalClientCpf").focus();
      alert("Informe um CPF ou CNPJ válido para continuar a locação.");
      return null;
    }

    $("#rentalClientCpf").value = formatDocument(documentDigits);

    if (!orderDate || !startDate || !endDate || endDate < startDate) {
      alert("Informe as datas do pedido, retirada/entrega e devolução corretamente.");
      return null;
    }

    const lines = state.currentRentalItems
      .map((line) => {
        const item = getItem(line.itemId);
        const payload = {
          itemId: Number(line.itemId),
          name: item?.name || line.name,
          qty: Math.max(1, toNumber(line.qty)),
          unitPrice: Math.max(0, toNumber(line.unitPrice)),
          originType: line.originType || "",
          originName: line.originName || "",
        };

        if (line.originKitId) {
          payload.originKitId = Number(line.originKitId);
        }
        if (line.originKitQty) {
          payload.originKitQty = Math.max(1, toNumber(line.originKitQty));
        }
        if (line.kitComponentQty) {
          payload.kitComponentQty = Math.max(1, toNumber(line.kitComponentQty));
        }

        return payload;
      })
      .filter((line) => line.itemId && line.qty > 0);

    if (!lines.length) {
      alert("Adicione pelo menos um item à locação.");
      return null;
    }

    const discount = Math.max(0, toNumber($("#rentalDiscount").value));
    const freight = Math.max(0, toNumber($("#rentalFreight").value));
    const deposit = Math.max(0, toNumber($("#rentalDeposit").value));
    syncDailyPricingRows();
    const dailyPricing = getCurrentDailyPricingPayload();
    const totals = calculateTotals(lines, discount, freight, deposit, dailyPricing);
    let paymentStatus = $("#rentalPaymentStatus").value;

    if (totals.deposit >= totals.total && totals.total > 0) {
      paymentStatus = "paid";
    } else if (totals.deposit > 0 && paymentStatus === "unpaid") {
      paymentStatus = "partial";
    }

    const rental = {
      clientId: Number($("#rentalClientId").value) || undefined,
      clientDraft: {
        name: clientName,
        phone: clientPhone,
        document: formatDocument(documentDigits),
        address: clientAddress,
      },
      orderDate,
      startDate,
      endDate,
      eventLocation: $("#rentalEventLocation").value.trim(),
      items: lines,
      dailyPricing,
      discount,
      freight: totals.freight,
      subtotal: totals.subtotal,
      total: totals.total,
      deposit: totals.deposit,
      paymentMethod: $("#rentalPaymentMethod").value,
      paymentStatus,
      status: statusOverride || $("#rentalStatus").value,
      notes: $("#rentalNotes").value.trim(),
    };

    const rentalId = Number($("#rentalId").value);
    if (rentalId) {
      rental.id = rentalId;
    }

    return rental;
  }

  function previewContractFromForm() {
    const rental = buildRentalFromForm(null);
    if (!rental) {
      return;
    }

    const existing = rental.id ? state.rentals.find((item) => Number(item.id) === Number(rental.id)) : null;
    const client = {
      name: rental.clientDraft.name,
      phone: rental.clientDraft.phone,
      document: rental.clientDraft.document,
      address: rental.clientDraft.address,
    };

    rental.orderNumber = existing?.orderNumber || "Prévia";
    openReceiptModal(rental, client);
  }

  function renderRentals() {
    const search = normalize($("#rentalsSearch").value);
    const status = $("#rentalStatusFilter").value;
    const date = $("#rentalDateFilter").value;

    const rentals = sortRentalsByDateDesc(state.rentals.filter((rental) => {
      const client = getClient(rental.clientId);
      const itemText = rental.items.map((item) => item.name).join(" ");
      const text = normalize(`${rental.orderNumber} ${client?.name} ${client?.document} ${client?.phone} ${itemText} ${rental.eventLocation} ${rental.notes}`);
      const dateMatches = !date || (rental.startDate <= date && rental.endDate >= date);
      return (!search || text.includes(search)) && (!status || rental.status === status) && dateMatches;
    }));

    $("#rentalsList").innerHTML = rentals.length ? rentals.map(renderRentalSummaryCard).join("") : emptyState("Nenhuma locação encontrada.");
  }

  function renderRentalSummaryCard(rental) {
    const client = getClient(rental.clientId);
    const statusClass = getRentalStatusBadgeClass(rental.status);
    return `
      <article class="rental-summary-card clickable-item" role="button" tabindex="0" data-rental-id="${rental.id}">
        <div>
          <h3>${escapeHtml(client?.name || "Cliente não encontrado")}</h3>
          <p>${formatDate(rental.startDate)} até ${formatDate(rental.endDate)}</p>
          <span class="badge ${statusClass}">Status: ${statusLabel(rental.status)}</span>
        </div>
      </article>
    `;
  }

  function getPendingRentals() {
    return sortRentalsByDateDesc(state.rentals.filter(isRentalReceivable));
  }

  function isRentalReceivable(rental) {
    if (!rental || ["quote", "cancelled"].includes(rental.status)) {
      return false;
    }

    const paymentStatus = rental.paymentStatus || "unpaid";
    return ["unpaid", "partial"].includes(paymentStatus) && getRentalReceivableAmount(rental) > 0;
  }

  function renderReceivables() {
    const rentals = getPendingRentals();
    const total = rentals.reduce((sum, rental) => sum + getRentalReceivableAmount(rental), 0);

    $("#receivablesStats").innerHTML = [
      ["Total geral a receber", formatMoney(total)],
      ["Locações pendentes", rentals.length],
    ]
      .map(([label, value]) => `<article class="kpi-card"><span>${label}</span><strong>${value}</strong></article>`)
      .join("");

    $("#receivablesList").innerHTML = rentals.length
      ? rentals.map(renderReceivableCard).join("")
      : emptyState("Nenhum pagamento pendente.");
  }

  function renderReceivableCard(rental) {
    const client = getClient(rental.clientId);
    return `
      <article class="receivable-card clickable-item" role="button" tabindex="0" data-receivable-id="${rental.id}">
        <div>
          <h3>${escapeHtml(client?.name || "Cliente não encontrado")}</h3>
          <p>Entrega: ${formatDate(rental.startDate)}</p>
          <p>Devolução: ${formatDate(rental.endDate)}</p>
        </div>
        <div class="receivable-amount">
          <span>Restante a receber</span>
          <strong>${formatMoney(getRentalReceivableAmount(rental))}</strong>
        </div>
      </article>
    `;
  }

  function renderReceivableDetailsContent(rental) {
    const client = getClient(rental.clientId);
    const totals = getRentalTotals(rental);
    const settlement = getRentalSettlement(rental);
    const items = (rental.items || [])
      .map((line) => `${escapeHtml(line.qty)}x ${escapeHtml(line.name)} (${formatMoney(line.unitPrice)})`)
      .join("<br>");

    return `
      <div class="rental-detail-modal receivable-detail-modal">
        <section class="detail-section">
          <h4>Dados do cliente</h4>
          <div class="detail-grid">
            <div class="metric"><span>Nome</span><strong>${escapeHtml(client?.name || "-")}</strong></div>
            <div class="metric"><span>${getDocumentLabel(client?.document)}</span><strong>${escapeHtml(client?.document || "-")}</strong></div>
            <div class="metric"><span>Telefone</span><strong>${escapeHtml(client?.phone || "-")}</strong></div>
            <div class="metric"><span>Endereço</span><strong>${escapeHtml(client?.address || "-")}</strong></div>
          </div>
        </section>

        <section class="detail-section">
          <h4>Locação</h4>
          <div class="detail-grid">
            <div class="metric"><span>Data de entrega</span><strong>${formatDate(rental.startDate)}</strong></div>
            <div class="metric"><span>Data de devolução</span><strong>${formatDate(rental.endDate)}</strong></div>
            <div class="metric"><span>Status da locação</span><strong>${statusLabel(rental.status)}</strong></div>
            <div class="metric"><span>Local</span><strong>${escapeHtml(rental.eventLocation || "-")}</strong></div>
          </div>
        </section>

        <section class="detail-section">
          <h4>Valores e pagamento</h4>
          <div class="metric-grid">
            <div class="metric"><span>Subtotal</span><strong>${formatMoney(totals.subtotal)}</strong></div>
            <div class="metric"><span>Desconto</span><strong>${formatMoney(totals.discount)}</strong></div>
            <div class="metric"><span>Frete</span><strong>${formatMoney(totals.freight)}</strong></div>
            <div class="metric"><span>Total final</span><strong>${formatMoney(totals.total)}</strong></div>
            <div class="metric"><span>Sinal já recebido</span><strong>${formatMoney(totals.deposit)}</strong></div>
            <div class="metric"><span>Já recebido</span><strong>${formatMoney(settlement.received)}</strong></div>
            <div class="metric"><span>Restante</span><strong>${formatMoney(settlement.remaining)}</strong></div>
            <div class="metric"><span>Forma de pagamento</span><strong>${escapeHtml(rental.paymentMethod || "-")}</strong></div>
            <div class="metric"><span>Status do pagamento</span><strong>${PAYMENT_STATUS[settlement.status] || PAYMENT_STATUS.unpaid}</strong></div>
          </div>
        </section>

        <section class="detail-section">
          <h4>Itens alugados</h4>
          <p class="muted-text">${items || "Sem itens"}</p>
        </section>

        ${rental.notes ? `<section class="detail-section"><h4>Observações</h4><p class="muted-text">${escapeHtml(rental.notes)}</p></section>` : ""}

        <div class="card-actions rental-detail-actions receivable-detail-actions">
          <button class="primary-action" type="button" data-action="register-rental-payment">Registrar recebimento</button>
          <button class="secondary-action" type="button" data-action="open-full-rental">Abrir locação completa</button>
        </div>
      </div>
    `;
  }

  function openReceivableDetailsModal(rental) {
    openModal("Pagamento pendente", renderReceivableDetailsContent(rental));
    $(".receivable-detail-actions", $("#modalRoot")).addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      if (button.dataset.action === "register-rental-payment") {
        openRecordPaymentModal("rental", rental);
        return;
      }

      if (button.dataset.action === "open-full-rental") {
        openRentalDetailsModal(getRental(rental.id) || rental);
      }
    });
  }

  function renderRentalCard(rental) {
    const client = getClient(rental.clientId);
    const totals = getRentalTotals(rental);
    const settlement = getRentalSettlement(rental);
    const kitSummary = getRentalKitSummary(rental);
    const items = rental.items
      .map((line) => {
        const originQty = line.originKitQty ? `${escapeHtml(line.originKitQty)}x ` : "";
        const origin = line.originType === "kit" ? ` · origem: ${originQty}${escapeHtml(line.originName || "Conjunto")}` : "";
        return `${escapeHtml(line.qty)}x ${escapeHtml(line.name)} (${formatMoney(line.unitPrice)})${origin}`;
      })
      .join("<br>");
    const returnProblems = Array.isArray(rental.returnProblems)
      ? rental.returnProblems
          .map((problem) => `${escapeHtml(problem.qty)}x ${escapeHtml(problem.name)} - ${escapeHtml(problem.reason)}`)
          .join("<br>")
      : "";
    const statusClass = rental.status === "cancelled" ? "red" : rental.status === "returned" ? "green" : "yellow";

    return `
      <article class="data-card">
        <div class="card-top">
          <div>
            <h3 class="card-title">Pedido ${escapeHtml(rental.orderNumber)}</h3>
            <p class="card-subtitle">${escapeHtml(client?.name || "Cliente não encontrado")} · ${formatDate(rental.startDate)} a ${formatDate(rental.endDate)}</p>
          </div>
          <div class="badge-row">
            <span class="badge ${statusClass}">${statusLabel(rental.status)}</span>
            <span class="badge">${PAYMENT_STATUS[settlement.status] || settlement.status}</span>
          </div>
        </div>
        <div class="metric-grid">
          <div class="metric"><span>Total final</span><strong>${formatMoney(totals.total)}</strong></div>
          <div class="metric"><span>Frete</span><strong>${formatMoney(totals.freight)}</strong></div>
          <div class="metric"><span>Sinal já recebido</span><strong>${formatMoney(totals.deposit)}</strong></div>
          <div class="metric"><span>Restante</span><strong>${formatMoney(settlement.remaining)}</strong></div>
        </div>
        ${rental.dailyPricing?.enabled ? `<p class="muted-text"><strong>Cobranca por dias ativa:</strong> subtotal ${formatMoney(totals.subtotal)}</p>` : ""}
        ${kitSummary.length ? `<p class="muted-text"><strong>Conjuntos:</strong><br>${kitSummary.map((line) => `${escapeHtml(line.qty)}x ${escapeHtml(line.name)}`).join("<br>")}</p>` : ""}
        <p class="muted-text">${items}</p>
        ${rental.eventLocation ? `<p class="muted-text">Local: ${escapeHtml(rental.eventLocation)}</p>` : ""}
        ${returnProblems ? `<p class="muted-text"><strong>Itens com problema na devolução:</strong><br>${returnProblems}</p>` : ""}
        <div class="card-actions">
          <button type="button" data-action="receipt-rental" data-id="${rental.id}">Gerar contrato</button>
          <button type="button" data-action="edit-rental" data-id="${rental.id}">Editar</button>
          <button type="button" data-action="mark-delivered" data-id="${rental.id}">Marcar entregue</button>
          <button type="button" data-action="mark-returned" data-id="${rental.id}">Marcar devolvida</button>
          <button type="button" data-action="cancel-rental" data-id="${rental.id}">Cancelar</button>
          <button type="button" class="danger-mini" data-action="delete-rental" data-id="${rental.id}">Excluir</button>
        </div>
      </article>
    `;
  }

  function renderRentalDetailsContent(rental) {
    const client = getClient(rental.clientId);
    const totals = getRentalTotals(rental);
    const settlement = getRentalSettlement(rental);
    const kitSummary = getRentalKitSummary(rental);
    const items = (rental.items || [])
      .map((line) => {
        const originQty = line.originKitQty ? `${escapeHtml(line.originKitQty)}x ` : "";
        const origin = line.originType === "kit" ? ` - origem: ${originQty}${escapeHtml(line.originName || "Conjunto")}` : "";
        return `${escapeHtml(line.qty)}x ${escapeHtml(line.name)} (${formatMoney(line.unitPrice)})${origin}`;
      })
      .join("<br>");
    const returnProblems = Array.isArray(rental.returnProblems)
      ? rental.returnProblems
          .map((problem) => `${escapeHtml(problem.qty)}x ${escapeHtml(problem.name)} - ${escapeHtml(problem.reason)}`)
          .join("<br>")
      : "";
    const statusClass = getRentalStatusBadgeClass(rental.status);

    return `
      <div class="rental-detail-modal">
        <div class="card-top">
          <div>
            <h3 class="card-title">Pedido ${escapeHtml(rental.orderNumber || "-")}</h3>
            <p class="card-subtitle">${escapeHtml(client?.name || "Cliente não encontrado")} - ${formatDate(rental.startDate)} até ${formatDate(rental.endDate)}</p>
          </div>
          <div class="badge-row">
            <span class="badge ${statusClass}">${statusLabel(rental.status)}</span>
            <span class="badge">${PAYMENT_STATUS[settlement.status] || settlement.status || "-"}</span>
          </div>
        </div>

        <section class="detail-section">
          <h4>Dados do cliente</h4>
          <div class="detail-grid">
            <div class="metric"><span>Nome</span><strong>${escapeHtml(client?.name || "-")}</strong></div>
            <div class="metric"><span>${getDocumentLabel(client?.document)}</span><strong>${escapeHtml(client?.document || "-")}</strong></div>
            <div class="metric"><span>Telefone</span><strong>${escapeHtml(client?.phone || "-")}</strong></div>
            <div class="metric"><span>Endereco</span><strong>${escapeHtml(client?.address || "-")}</strong></div>
          </div>
        </section>

        <section class="detail-section">
          <h4>Datas e local</h4>
          <div class="detail-grid">
            <div class="metric"><span>Data inicial</span><strong>${formatDate(rental.startDate)}</strong></div>
            <div class="metric"><span>Data final</span><strong>${formatDate(rental.endDate)}</strong></div>
            <div class="metric"><span>Data do pedido</span><strong>${formatDate(rental.orderDate)}</strong></div>
            <div class="metric"><span>Local</span><strong>${escapeHtml(rental.eventLocation || "-")}</strong></div>
          </div>
        </section>

        <section class="detail-section">
          <h4>Valores</h4>
          <div class="metric-grid">
            <div class="metric"><span>Subtotal</span><strong>${formatMoney(totals.subtotal)}</strong></div>
            <div class="metric"><span>Desconto</span><strong>${formatMoney(totals.discount)}</strong></div>
            <div class="metric"><span>Frete</span><strong>${formatMoney(totals.freight)}</strong></div>
            <div class="metric"><span>Total final</span><strong>${formatMoney(totals.total)}</strong></div>
            <div class="metric"><span>Sinal já recebido</span><strong>${formatMoney(totals.deposit)}</strong></div>
            <div class="metric"><span>Já recebido</span><strong>${formatMoney(settlement.received)}</strong></div>
            <div class="metric"><span>Restante</span><strong>${formatMoney(settlement.remaining)}</strong></div>
          </div>
        </section>

        <section class="detail-section">
          <h4>Pagamento</h4>
          <div class="detail-grid">
            <div class="metric"><span>Forma</span><strong>${escapeHtml(rental.paymentMethod || "-")}</strong></div>
            <div class="metric"><span>Status</span><strong>${PAYMENT_STATUS[settlement.status] || PAYMENT_STATUS.unpaid}</strong></div>
            ${rental.paymentReceivedAt ? `<div class="metric"><span>Recebido em</span><strong>${formatReceivedDate(rental.paymentReceivedAt)}</strong></div>` : ""}
          </div>
        </section>

        ${rental.dailyPricing?.enabled ? `<p class="muted-text"><strong>Cobranca por dias ativa:</strong> subtotal ${formatMoney(totals.subtotal)}</p>` : ""}
        ${kitSummary.length ? `<p class="muted-text"><strong>Conjuntos:</strong><br>${kitSummary.map((line) => `${escapeHtml(line.qty)}x ${escapeHtml(line.name)}`).join("<br>")}</p>` : ""}
        <p class="muted-text"><strong>Itens alugados:</strong><br>${items || "Sem itens"}</p>
        <section class="detail-section"><h4>Histórico de recebimentos</h4>${renderPaymentTimeline("rental", rental)}</section>
        ${rental.notes ? `<p class="muted-text"><strong>Observacoes:</strong><br>${escapeHtml(rental.notes)}</p>` : ""}
        ${returnProblems ? `<p class="muted-text"><strong>Itens com problema na devolução:</strong><br>${returnProblems}</p>` : ""}

        <div class="card-actions rental-detail-actions">
          <button type="button" data-action="receipt-rental" data-id="${rental.id}">Gerar contrato</button>
          <button type="button" data-action="edit-rental" data-id="${rental.id}">Editar</button>
          <button type="button" data-action="mark-delivered" data-id="${rental.id}">Marcar entregue</button>
          <button type="button" data-action="mark-returned" data-id="${rental.id}">Marcar devolvida</button>
          <button type="button" data-action="cancel-rental" data-id="${rental.id}">Cancelar</button>
          ${settlement.remaining > 0 && !["quote", "cancelled"].includes(rental.status) ? `<button type="button" data-action="register-rental-payment" data-id="${rental.id}">Registrar recebimento</button>` : ""}
          <button type="button" data-action="show-rental-payments" data-id="${rental.id}">Ver pagamentos</button>
          <button type="button" class="danger-mini" data-action="delete-rental" data-id="${rental.id}">Excluir</button>
        </div>
      </div>
    `;
  }

  function openRentalDetailsModal(rental) {
    openModal("Detalhes da locação", renderRentalDetailsContent(rental));
    $(".rental-detail-actions", $("#modalRoot")).addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      await handleRentalAction(button.dataset.action, rental, true);
    });
    $(".payment-timeline", $("#modalRoot"))?.addEventListener("click", (event) => handlePaymentActionClick(event, "rental", rental));
  }

  function getRentalKitSummary(rental) {
    const grouped = new Map();
    (rental.items || [])
      .filter((line) => line.originType === "kit" && line.originName)
      .forEach((line) => {
        const key = `${line.originKitId || ""}|${line.originName}`;
        const current = grouped.get(key) || {
          name: line.originName,
          qty: 0,
        };
        current.qty = Math.max(current.qty, Math.max(1, toNumber(line.originKitQty || 1)));
        grouped.set(key, current);
      });

    return Array.from(grouped.values());
  }

  async function handleStockClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      handleItemSurfaceClick(event);
      return;
    }

    const id = Number(button.dataset.id);
    const item = getItem(id);
    if (!item) {
      return;
    }

    if (button.dataset.action === "edit-item") {
      openItemModal(item);
      return;
    }

    if (button.dataset.action === "delete-item") {
      const activeUse = state.rentals.some((rental) => ACTIVE_STATUSES.includes(rental.status) && rental.items.some((line) => Number(line.itemId) === id));
      if (activeUse) {
        alert("Este item está em locação ativa. Finalize ou cancele os pedidos antes de excluir.");
        return;
      }

      if (getItemStockEntries(id).length) {
        alert("Este item possui histórico de entradas. Exclua ou corrija as entradas antes de excluir o produto.");
        return;
      }

      if (confirm(`Excluir o item "${item.name}"? Esta ação não pode ser desfeita.`)) {
        await PlanetaDB.remove("items", id);
        await loadAll();
        refreshAll();
        showToast("Item excluído.");
      }
    }
  }

  function handleItemSurfaceClick(event) {
    if (event.target.closest("button, input, select, textarea, a")) {
      return;
    }

    const itemElement = event.target.closest("[data-item-id]");
    if (!itemElement) {
      return;
    }

    const item = getItem(Number(itemElement.dataset.itemId));
    if (item) {
      openItemDetailsModal(item);
    }
  }

  function handleItemSurfaceKeydown(event) {
    if (event.target.closest("button, input, select, textarea, a")) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const itemElement = event.target.closest("[data-item-id]");
    if (!itemElement) {
      return;
    }

    event.preventDefault();
    const item = getItem(Number(itemElement.dataset.itemId));
    if (item) {
      openItemDetailsModal(item);
    }
  }

  async function handleKitClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const kit = getKit(Number(button.dataset.id));
    if (!kit) {
      return;
    }

    if (button.dataset.action === "edit-kit") {
      openKitModal(kit);
      return;
    }

    if (button.dataset.action === "delete-kit" && confirm(`Excluir o conjunto "${kit.name}"? As locações já salvas não serão alteradas.`)) {
      await PlanetaDB.remove("kits", Number(kit.id));
      await loadAll();
      refreshAll();
      showToast("Conjunto excluído.");
    }
  }

  function openKitModal(kit = null) {
    if (!state.items.length) {
      alert("Cadastre itens no estoque antes de criar conjuntos.");
      return;
    }

    const title = kit ? "Editar conjunto" : "Cadastrar conjunto";
    let kitItems = Array.isArray(kit?.items) ? kit.items.map((line) => ({ ...line })) : [];

    openModal(title, `
      <form id="kitForm" class="form-grid">
        <label class="wide">
          Nome do conjunto
          <input name="name" type="text" required value="${escapeAttr(kit?.name || "")}" placeholder="Ex.: Mesa com 4 cadeiras">
        </label>
        <section class="line-editor wide">
          <div class="panel-head">
            <h3>Itens do conjunto</h3>
          </div>
          <div class="add-line">
            <label>
              Item
              <select id="kitItemSelect">
                ${state.items.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}
              </select>
            </label>
            <label>
              Qtde no conjunto
              <input id="kitItemQty" type="number" min="1" inputmode="numeric" value="1">
            </label>
            <button id="addKitItemBtn" class="secondary-action" type="button">Adicionar item</button>
          </div>
          <div id="kitItemsEditor" class="line-list"></div>
        </section>
        <label class="wide">
          Observações
          <textarea name="notes" rows="3">${escapeHtml(kit?.notes || "")}</textarea>
        </label>
        <div class="form-actions wide">
          <button class="secondary-action" type="button" data-close-modal="true">Cancelar</button>
          <button class="primary-action" type="submit">Salvar conjunto</button>
        </div>
      </form>
    `);

    const renderKitItemsEditor = () => {
      $("#kitItemsEditor").innerHTML = kitItems.length
        ? kitItems
            .map((line, index) => {
              const item = getItem(line.itemId);
              return `
                <div class="line-card">
                  <div>
                    <h4>${escapeHtml(item?.name || line.name || "Item removido")}</h4>
                  </div>
                  <div class="line-inputs">
                    <label>
                      Qtde
                      <input type="number" min="1" inputmode="numeric" value="${escapeAttr(line.qty)}" data-kit-field="qty" data-index="${index}">
                    </label>
                  </div>
                  <div class="mini-actions">
                    <button type="button" data-action="remove-kit-line" data-index="${index}">Remover</button>
                  </div>
                </div>
              `;
            })
            .join("")
        : emptyState("Adicione pelo menos um item ao conjunto.");
    };

    $("#addKitItemBtn").addEventListener("click", () => {
      const itemId = Number($("#kitItemSelect").value);
      const item = getItem(itemId);
      const qty = Math.max(1, Math.floor(toNumber($("#kitItemQty").value)));

      if (!item) {
        return;
      }

      const existing = kitItems.find((line) => Number(line.itemId) === Number(item.id));
      if (existing) {
        existing.qty += qty;
      } else {
        kitItems.push({ itemId: item.id, name: item.name, qty });
      }

      $("#kitItemQty").value = "1";
      renderKitItemsEditor();
    });

    $("#kitItemsEditor").addEventListener("input", (event) => {
      const index = Number(event.target.dataset.index);
      if (event.target.dataset.kitField === "qty" && kitItems[index]) {
        kitItems[index].qty = Math.max(1, Math.floor(toNumber(event.target.value)));
      }
    });

    $("#kitItemsEditor").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='remove-kit-line']");
      if (!button) {
        return;
      }
      kitItems.splice(Number(button.dataset.index), 1);
      renderKitItemsEditor();
    });

    $("#kitForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const now = new Date().toISOString();
      const payload = {
        id: kit?.id,
        name: form.name.value.trim(),
        items: kitItems
          .map((line) => {
            const item = getItem(line.itemId);
            return {
              itemId: Number(line.itemId),
              name: item?.name || line.name || "",
              qty: Math.max(1, Math.floor(toNumber(line.qty))),
            };
          })
          .filter((line) => line.itemId && line.qty > 0),
        notes: form.notes.value.trim(),
        createdAt: kit?.createdAt || now,
        updatedAt: now,
      };

      if (!payload.name) {
        alert("Informe o nome do conjunto.");
        return;
      }

      if (!payload.items.length) {
        alert("Adicione pelo menos um item ao conjunto.");
        return;
      }

      if (kit) {
        await PlanetaDB.put("kits", payload);
      } else {
        delete payload.id;
        await PlanetaDB.add("kits", payload);
      }

      closeModal();
      await loadAll();
      refreshAll();
      showToast("Conjunto salvo.");
    });

    renderKitItemsEditor();
  }

  async function handleClientClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const id = Number(button.dataset.id);
    const client = getClient(id);
    if (!client) {
      return;
    }

    if (button.dataset.action === "edit-client") {
      openClientModal(client);
      return;
    }

    if (button.dataset.action === "delete-client") {
      const hasRentals = state.rentals.some((rental) => Number(rental.clientId) === id);
      if (hasRentals) {
        alert("Este cliente tem histórico de locações. Edite o cadastro em vez de excluir.");
        return;
      }

      if (confirm(`Excluir o cliente "${client.name}"?`)) {
        await PlanetaDB.remove("clients", id);
        await loadAll();
        refreshAll();
        showToast("Cliente excluído.");
      }
    }
  }

  async function handleRentalClick(event) {
    const button = event.target.closest("button[data-action]");
    if (button) {
      const rental = getRental(Number(button.dataset.id));
      if (rental) {
        await handleRentalAction(button.dataset.action, rental);
      }
      return;
    }

    const rentalElement = event.target.closest("[data-rental-id]");
    if (rentalElement) {
      const rental = getRental(Number(rentalElement.dataset.rentalId));
      if (rental) {
        openRentalDetailsModal(rental);
      }
    }
  }

  function handleReceivableClick(event) {
    const receivableElement = event.target.closest("[data-receivable-id]");
    if (!receivableElement) {
      return;
    }

    const rental = getRental(Number(receivableElement.dataset.receivableId));
    if (rental && isRentalReceivable(rental)) {
      openReceivableDetailsModal(rental);
    }
  }

  async function handleRentalAction(action, rental, fromModal = false) {
    if (action === "edit-rental") {
      if (fromModal) {
        closeModal();
      }
      loadRentalIntoForm(rental);
    } else if (action === "receipt-rental") {
      openReceiptModal(rental);
    } else if (action === "mark-delivered") {
      await markDelivered(rental);
      if (fromModal) {
        closeModal();
      }
    } else if (action === "mark-returned") {
      openReturnModal(rental);
    } else if (action === "cancel-rental") {
      await cancelRental(rental);
      if (fromModal) {
        closeModal();
      }
    } else if (action === "reopen-payment") {
      const reopened = await reopenRentalPayment(rental);
      if (reopened && fromModal) {
        closeModal();
      }
    } else if (action === "register-rental-payment") {
      openRecordPaymentModal("rental", rental);
    } else if (action === "show-rental-payments") {
      openRentalDetailsModal(getRental(rental.id) || rental);
    } else if (action === "delete-rental") {
      await deleteRental(rental);
      if (fromModal) {
        closeModal();
      }
    }
  }

  function handleRentalKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const rentalElement = event.target.closest("[data-rental-id]");
    if (!rentalElement) {
      return;
    }

    event.preventDefault();
    const rental = getRental(Number(rentalElement.dataset.rentalId));
    if (rental) {
      openRentalDetailsModal(rental);
    }
  }

  function handleReceivableKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const receivableElement = event.target.closest("[data-receivable-id]");
    if (!receivableElement) {
      return;
    }

    event.preventDefault();
    const rental = getRental(Number(receivableElement.dataset.receivableId));
    if (rental && isRentalReceivable(rental)) {
      openReceivableDetailsModal(rental);
    }
  }

  function loadRentalIntoForm(rental) {
    const client = getClient(rental.clientId);
    state.editingRentalId = rental.id;
    state.currentRentalItems = rental.items.map((line) => ({ ...line }));
    state.dailyPricingEnabled = Boolean(rental.dailyPricing?.enabled);
    state.dailyPricingRows = Array.isArray(rental.dailyPricing?.rows) ? rental.dailyPricing.rows.map((row) => ({ ...row, days: (row.days || []).map((day) => ({ ...day })) })) : [];
    $("#newRentalTitle").textContent = `Editando pedido ${rental.orderNumber}`;
    $("#rentalId").value = rental.id;
    $("#rentalClientId").value = rental.clientId || "";
    $("#rentalClientName").value = client?.name || "";
    $("#rentalClientCpf").value = client?.document || "";
    $("#rentalClientPhone").value = client?.phone || "";
    $("#rentalClientAddress").value = client?.address || "";
    $("#clientMatchInfo").textContent = client ? `Cliente associado: ${client.name}` : "";
    $("#rentalOrderDate").value = rental.orderDate || todayISO();
    $("#rentalStartDate").value = rental.startDate;
    $("#rentalEndDate").value = rental.endDate;
    $("#rentalEventLocation").value = rental.eventLocation || "";
    $("#rentalDiscount").value = rental.discount || 0;
    $("#rentalFreight").value = rental.freight || 0;
    $("#rentalDeposit").value = rental.deposit || 0;
    $("#rentalPaymentMethod").value = rental.paymentMethod || "Pix";
    $("#rentalPaymentStatus").value = rental.paymentStatus || "unpaid";
    $("#rentalStatus").value = rental.status || "quote";
    $("#rentalNotes").value = rental.notes || "";
    $("#rentalDailyPricingToggle").checked = state.dailyPricingEnabled;
    renderRentalItemsEditor();
    showView("new-rental");
  }

  async function markDelivered(rental) {
    if (rental.status === "returned" || rental.status === "cancelled") {
      alert("Este pedido já foi encerrado.");
      return;
    }

    const candidate = { ...rental, status: "delivered" };
    const shortages = checkRentalAvailability(candidate, rental.id);
    if (shortages.length) {
      alert(`Não dá para marcar como entregue por falta de estoque:\n\n${shortages.join("\n")}`);
      return;
    }

    if (confirm(`Marcar o pedido ${rental.orderNumber} como entregue/alugado?`)) {
      await PlanetaDB.put("rentals", {
        ...rental,
        status: "delivered",
        updatedAt: new Date().toISOString(),
      });
      await loadAll();
      refreshAll();
      showToast("Pedido marcado como entregue.");
    }
  }

  function openReturnModal(rental) {
    if (rental.status === "returned") {
      alert("Este pedido já foi marcado como devolvido.");
      return;
    }

    if (rental.status !== "delivered") {
      alert("Marque o pedido como entregue/alugado antes de registrar a devolução.");
      return;
    }

    const rows = rental.items
      .map((line, index) => `
        <div class="return-row">
          <strong>${escapeHtml(line.name)} · ${line.qty} alugado(s)</strong>
          <div class="form-grid">
            <label>
              Qtde com problema
              <input type="number" min="0" max="${line.qty}" value="0" data-return-field="qty" data-index="${index}">
            </label>
            <label>
              Motivo
              <select data-return-field="reason" data-index="${index}">
                <option value="Danificado">Danificado</option>
                <option value="Quebrado">Quebrado</option>
                <option value="Perdido">Perdido</option>
                <option value="Indisponível">Indisponível</option>
              </select>
            </label>
          </div>
        </div>
      `)
      .join("");

    openModal("Registrar devolução", `
      <form id="returnForm">
        <p class="muted-text">Informe somente os itens que voltaram quebrados, perdidos ou indisponíveis. O restante volta automaticamente para o estoque disponível.</p>
        ${rows}
        <label class="wide">
          Observação da devolução
          <textarea id="returnNotes" rows="3" placeholder="Ex.: 1 forro manchado, 2 cadeiras quebradas"></textarea>
        </label>
        <div class="form-actions">
          <button class="secondary-action" type="button" data-close-modal="true">Cancelar</button>
          <button class="primary-action red" type="submit">Confirmar devolução</button>
        </div>
      </form>
    `);

    $("#returnForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await confirmReturn(rental);
    });
  }

  async function confirmReturn(rental) {
    const problems = [];
    const rows = $$("[data-return-field='qty']");

    for (const input of rows) {
      const index = Number(input.dataset.index);
      const line = rental.items[index];
      const qty = Math.min(line.qty, Math.max(0, toNumber(input.value)));
      const reason = $(`[data-return-field='reason'][data-index='${index}']`).value;

      if (qty > 0) {
        problems.push({
          itemId: line.itemId,
          name: line.name,
          qty,
          reason,
        });
      }
    }

    for (const problem of problems) {
      const item = await PlanetaDB.get("items", Number(problem.itemId));
      if (item) {
        item.unavailableQty = Math.min(Number(item.totalQty) || 0, (Number(item.unavailableQty) || 0) + problem.qty);
        item.updatedAt = new Date().toISOString();
        await PlanetaDB.put("items", item);
      }
    }

    await PlanetaDB.put("rentals", {
      ...rental,
      status: "returned",
      returnProblems: problems,
      returnNotes: $("#returnNotes").value.trim(),
      returnedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    closeModal();
    await loadAll();
    refreshAll();
    showToast("Devolução registrada.");
  }

  async function cancelRental(rental) {
    if (rental.status === "cancelled") {
      return;
    }

    if (confirm(`Cancelar o pedido ${rental.orderNumber}?`)) {
      await PlanetaDB.put("rentals", {
        ...rental,
        status: "cancelled",
        updatedAt: new Date().toISOString(),
      });
      await loadAll();
      refreshAll();
      showToast("Pedido cancelado.");
    }
  }

  async function markRentalPaymentReceived(rental) {
    if (!isRentalReceivable(rental)) {
      alert("Esta locação não possui pagamento pendente.");
      return false;
    }

    const remaining = getRentalReceivableAmount(rental);
    const clientName = getClient(rental.clientId)?.name || "este cliente";
    if (!confirm(`Confirmar o recebimento de ${formatMoney(remaining)} de ${clientName}?`)) {
      return false;
    }

    const now = new Date().toISOString();
    await PlanetaDB.put("rentals", {
      ...rental,
      paymentStatus: "paid",
      paymentReceivedAt: now,
      updatedAt: now,
    });
    await loadAll();
    refreshAll();
    showToast("Pagamento marcado como recebido.");
    return true;
  }

  async function reopenRentalPayment(rental) {
    if (rental.paymentStatus !== "paid") {
      return false;
    }

    const paymentStatus = getRentalTotals(rental).deposit > 0 ? "partial" : "unpaid";
    const label = PAYMENT_STATUS[paymentStatus];
    if (!confirm(`Reabrir a pendência desta locação como \"${label}\"?`)) {
      return false;
    }

    const now = new Date().toISOString();
    await PlanetaDB.put("rentals", {
      ...rental,
      paymentStatus,
      paymentReceivedAt: "",
      paymentReopenedAt: now,
      updatedAt: now,
    });
    await loadAll();
    refreshAll();
    showToast(`Pendência reaberta como ${label}.`);
    return true;
  }

  async function deleteRental(rental) {
    if (confirm(`Excluir definitivamente o pedido ${rental.orderNumber}?`)) {
      await PlanetaDB.remove("rentals", Number(rental.id));
      await loadAll();
      refreshAll();
      showToast("Pedido excluído.");
    }
  }

  function openItemModal(item = null) {
    const title = item ? "Editar item" : "Cadastrar item";
    openModal(title, `
      <form id="itemForm" class="form-grid">
        <label class="wide">
          Nome
          <input name="name" type="text" required value="${escapeAttr(item?.name || "")}">
        </label>
        <label>
          Categoria
          <input name="category" type="text" list="categoryOptions" required value="${escapeAttr(item?.category || "Outro")}">
          <datalist id="categoryOptions">
            <option value="Mesa"></option>
            <option value="Cadeira"></option>
            <option value="Conjunto"></option>
            <option value="Forro"></option>
            <option value="Outro"></option>
          </datalist>
        </label>
        <label>
          Cor
          <input name="color" type="text" placeholder="Opcional" value="${escapeAttr(item?.color || "")}">
        </label>
        <label>
          Quantidade total
          <input name="totalQty" type="number" min="0" inputmode="numeric" required value="${item?.totalQty ?? 0}">
        </label>
        <label>
          Indisponível
          <input name="unavailableQty" type="number" min="0" inputmode="numeric" value="${item?.unavailableQty ?? 0}">
        </label>
        <label>
          Valor padrão
          <input name="defaultPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${item?.defaultPrice ?? 0}">
        </label>
        <label class="wide">
          Observações
          <textarea name="notes" rows="3">${escapeHtml(item?.notes || "")}</textarea>
        </label>
        <div class="form-actions wide">
          <button class="secondary-action" type="button" data-close-modal="true">Cancelar</button>
          <button class="primary-action" type="submit">Salvar item</button>
        </div>
      </form>
    `);

    $("#itemForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveItemFromForm(event.currentTarget, item);
      closeModal();
      await loadAll();
      refreshAll();
      showToast("Item salvo.");
    });
  }

  async function saveItemFromForm(form, item = null) {
    const totalQty = Math.max(0, toNumber(form.totalQty.value));
    const unavailableQty = Math.min(totalQty, Math.max(0, toNumber(form.unavailableQty.value)));
    const now = new Date().toISOString();
    const payload = {
      id: item?.id,
      name: form.name.value.trim(),
      category: form.category.value.trim() || "Outro",
      color: form.color.value.trim(),
      totalQty,
      unavailableQty,
      defaultPrice: Math.max(0, toNumber(form.defaultPrice.value)),
      notes: form.notes.value.trim(),
      createdAt: item?.createdAt || now,
      updatedAt: now,
    };

    if (!payload.name) {
      alert("Informe o nome do item.");
      return null;
    }

    if (item) {
      await PlanetaDB.put("items", payload);
      return payload;
    }

    delete payload.id;
    const id = await PlanetaDB.add("items", payload);
    return { ...payload, id };
  }

  function getItemStockEntries(itemId) {
    return state.stockMovements
      .filter((movement) => movement.type === "entry" && Number(movement.itemId) === Number(itemId))
      .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
  }

  function getMinimumItemTotal(item) {
    return Math.max(0, toNumber(item?.unavailableQty) + getMaximumCommittedQuantity(item));
  }

  function canSetItemTotal(item, nextTotal) {
    const minimum = getMinimumItemTotal(item);
    if (nextTotal >= minimum) {
      return true;
    }

    alert(`Não é possível reduzir ${item.name} para ${nextTotal} unidade(s). São necessárias pelo menos ${minimum} unidade(s) para cobrir itens indisponíveis e locações ativas.`);
    return false;
  }

  function openStockEntryModal(entry = null, preselectedItemId = null) {
    if (!state.items.length) {
      alert("Cadastre um produto antes de registrar uma entrada.");
      return;
    }

    const selectedItemId = Number(entry?.itemId || preselectedItemId || state.items[0].id);
    const title = entry ? "Corrigir entrada" : "Cadastrar entrada";
    openModal(title, `
      <form id="stockEntryForm" class="form-grid">
        <label class="wide">
          Produto
          <select name="itemId" required>
            ${state.items.map((item) => `<option value="${item.id}" ${Number(item.id) === selectedItemId ? "selected" : ""}>${escapeHtml(item.name)} (total atual: ${toNumber(item.totalQty)})</option>`).join("")}
          </select>
        </label>
        <label>
          Quantidade recebida
          <input name="qty" type="number" min="1" step="1" inputmode="numeric" required value="${escapeAttr(entry?.qty ?? "")}">
        </label>
        <label>
          Data da entrada
          <input name="date" type="date" required value="${escapeAttr(entry?.date || todayISO())}">
        </label>
        <label>
          Fornecedor/origem
          <input name="supplier" type="text" placeholder="Opcional" value="${escapeAttr(entry?.supplier || "")}">
        </label>
        <label class="wide">
          Observação
          <textarea name="notes" rows="3" placeholder="Opcional">${escapeHtml(entry?.notes || "")}</textarea>
        </label>
        <div class="form-actions wide">
          <button class="secondary-action" type="button" data-close-modal="true">Cancelar</button>
          <button class="primary-action" type="submit">${entry ? "Salvar correção" : "Confirmar entrada"}</button>
        </div>
      </form>
    `);

    $("#stockEntryForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const saved = await saveStockEntryFromForm(event.currentTarget, entry);
      if (!saved) {
        return;
      }

      closeModal();
      await loadAll();
      refreshAll();
      showToast(entry ? "Entrada corrigida e estoque atualizado." : "Entrada cadastrada e estoque atualizado.");
      if (entry) {
        const item = getItem(saved.itemId);
        if (item) {
          openItemDetailsModal(item);
        }
      }
    });
  }

  async function saveStockEntryFromForm(form, entry = null) {
    const itemId = Number(form.itemId.value);
    const targetItem = getItem(itemId);
    const qty = toNumber(form.qty.value);

    if (!targetItem) {
      alert("Selecione um produto válido.");
      return null;
    }

    if (!Number.isInteger(qty) || qty <= 0) {
      alert("Informe uma quantidade recebida maior que zero.");
      return null;
    }

    if (!form.date.value) {
      alert("Informe a data da entrada.");
      return null;
    }

    const originalItem = entry ? getItem(entry.itemId) : null;
    if (entry && !originalItem) {
      alert("O produto original desta entrada não foi encontrado.");
      return null;
    }

    const nextTotals = new Map();
    if (!entry) {
      nextTotals.set(targetItem.id, toNumber(targetItem.totalQty) + qty);
    } else if (Number(originalItem.id) === Number(targetItem.id)) {
      nextTotals.set(targetItem.id, toNumber(targetItem.totalQty) - toNumber(entry.qty) + qty);
    } else {
      nextTotals.set(originalItem.id, toNumber(originalItem.totalQty) - toNumber(entry.qty));
      nextTotals.set(targetItem.id, toNumber(targetItem.totalQty) + qty);
    }

    for (const [affectedItemId, nextTotal] of nextTotals) {
      const affectedItem = getItem(affectedItemId);
      if (!affectedItem || !canSetItemTotal(affectedItem, nextTotal)) {
        return null;
      }
    }

    const now = new Date().toISOString();
    for (const [affectedItemId, nextTotal] of nextTotals) {
      const affectedItem = getItem(affectedItemId);
      await PlanetaDB.put("items", { ...affectedItem, totalQty: nextTotal, updatedAt: now });
    }

    const payload = {
      ...(entry || {}),
      type: "entry",
      itemId,
      qty,
      date: form.date.value,
      supplier: form.supplier.value.trim(),
      notes: form.notes.value.trim(),
      createdAt: entry?.createdAt || now,
      updatedAt: now,
    };

    if (entry) {
      await PlanetaDB.put("stockMovements", payload);
    } else {
      delete payload.id;
      const id = await PlanetaDB.add("stockMovements", payload);
      payload.id = id;
    }

    return payload;
  }

  async function deleteStockEntry(entry) {
    const item = getItem(entry.itemId);
    if (!item) {
      alert("O produto desta entrada não foi encontrado.");
      return false;
    }

    const nextTotal = toNumber(item.totalQty) - toNumber(entry.qty);
    if (!canSetItemTotal(item, nextTotal)) {
      return false;
    }

    if (!confirm(`Excluir a entrada de ${entry.qty} unidade(s) de ${item.name}? O total do estoque será reduzido.`)) {
      return false;
    }

    const now = new Date().toISOString();
    await PlanetaDB.put("items", { ...item, totalQty: nextTotal, updatedAt: now });
    await PlanetaDB.remove("stockMovements", Number(entry.id));
    await loadAll();
    refreshAll();
    showToast("Entrada excluída e estoque atualizado.");
    const refreshedItem = getItem(item.id);
    if (refreshedItem) {
      openItemDetailsModal(refreshedItem);
    }
    return true;
  }

  function openItemDetailsModal(item) {
    const stats = getItemStats(item);
    const { startDate, endDate } = getAvailabilityPeriod();
    const periodStats = getItemAvailabilityForPeriod(item, startDate, endDate);
    const conflictText = renderAvailabilityConflictText(item, periodStats.conflicts);
    const rentals = getItemRentalHistory(item.id);
    const rentalsHtml = rentals.length
      ? rentals
          .map(({ rental, qty }) => {
            const client = getClient(rental.clientId);
            return `
              <div class="compact-item item-history-row">
                <div>
                  <strong>Pedido ${escapeHtml(rental.orderNumber || "-")} - ${escapeHtml(client?.name || "Cliente não encontrado")}</strong>
                  <span>${formatDate(rental.startDate)} a ${formatDate(rental.endDate)} - ${escapeHtml(qty)} unidade(s)</span>
                  <span>Status: ${statusLabel(rental.status)} - Pagamento: ${PAYMENT_STATUS[rental.paymentStatus] || rental.paymentStatus || "-"}</span>
                </div>
                <span>${formatMoney(getRentalTotals(rental).total)}</span>
              </div>
            `;
          })
          .join("")
      : emptyState("Nenhuma locação encontrada para este item.");
    const entries = getItemStockEntries(item.id);
    const entriesHtml = entries.length
      ? entries.map((entry) => `
          <div class="compact-item item-history-row">
            <div>
              <strong>+${escapeHtml(entry.qty)} unidade(s) em ${formatDate(entry.date)}</strong>
              <span>${escapeHtml(entry.supplier || "Origem não informada")}</span>
              ${entry.notes ? `<span>${escapeHtml(entry.notes)}</span>` : ""}
            </div>
            <div class="card-actions compact-actions">
              <button type="button" data-action="edit-stock-entry" data-entry-id="${entry.id}">Corrigir</button>
              <button type="button" class="danger-mini" data-action="delete-stock-entry" data-entry-id="${entry.id}">Excluir</button>
            </div>
          </div>
        `).join("")
      : emptyState("Nenhuma entrada registrada para este item.");

    openModal(`Detalhes do item`, `
      <div class="item-detail-modal">
        <div class="item-detail-tabs" role="tablist" aria-label="Detalhes do item">
          <button class="tab-btn active" type="button" data-item-tab="info" aria-selected="true">Informacoes</button>
          <button class="tab-btn" type="button" data-item-tab="stock" aria-selected="false">Estoque</button>
          <button class="tab-btn" type="button" data-item-tab="rentals" aria-selected="false">Locacoes</button>
          <button class="tab-btn" type="button" data-item-tab="entries" aria-selected="false">Entradas</button>
          <button class="tab-btn" type="button" data-item-tab="edit" aria-selected="false">Editar</button>
        </div>

        <section class="item-tab-panel" data-item-tab-panel="info">
          <div class="detail-grid">
            <div class="metric"><span>Nome</span><strong>${escapeHtml(item.name)}</strong></div>
            <div class="metric"><span>Categoria</span><strong>${escapeHtml(item.category || "Item")}</strong></div>
            <div class="metric"><span>Cor</span><strong>${escapeHtml(item.color || "-")}</strong></div>
            <div class="metric"><span>Valor padrao</span><strong>${formatMoney(item.defaultPrice || 0)}</strong></div>
          </div>
          <p class="muted-text detail-note">${escapeHtml(item.notes || "Sem observacoes.")}</p>
        </section>

        <section class="item-tab-panel hidden" data-item-tab-panel="stock">
          <p class="muted-text">${escapeHtml(getAvailabilityPeriodLabel())}</p>
          <div class="metric-grid">
            <div class="metric"><span>Total cadastrado</span><strong>${stats.total}</strong></div>
            <div class="metric"><span>Disponível no período</span><strong>${periodStats.available}</strong></div>
            <div class="metric"><span>Ocupado no período</span><strong>${periodStats.occupied}</strong></div>
            <div class="metric"><span>Reservado no período</span><strong>${periodStats.reserved}</strong></div>
            <div class="metric"><span>Entregue/alugado</span><strong>${periodStats.delivered}</strong></div>
            <div class="metric"><span>Reservado em datas futuras</span><strong>${stats.futureReserved}</strong></div>
            <div class="metric"><span>Próxima reserva</span><strong>${stats.nextReservationDate ? formatDate(stats.nextReservationDate) : "-"}</strong></div>
            <div class="metric"><span>Indisponivel</span><strong>${stats.unavailable}</strong></div>
            <div class="metric"><span>Devolvido</span><strong>${stats.returned}</strong></div>
          </div>
          ${conflictText ? `<p class="muted-text"><strong>Uso no período:</strong><br>${conflictText}</p>` : `<p class="muted-text">Nenhuma locação ocupando este item no período consultado.</p>`}
        </section>

        <section class="item-tab-panel hidden" data-item-tab-panel="rentals">
          <div class="compact-list">${rentalsHtml}</div>
        </section>

        <section class="item-tab-panel hidden" data-item-tab-panel="entries">
          <div class="card-actions">
            <button class="primary-action" type="button" data-action="add-stock-entry">Cadastrar entrada</button>
          </div>
          <div class="compact-list stock-entry-history">${entriesHtml}</div>
        </section>

        <section class="item-tab-panel hidden" data-item-tab-panel="edit">
          <form id="itemDetailsForm" class="form-grid">
            <label class="wide">
              Nome
              <input name="name" type="text" required value="${escapeAttr(item.name || "")}">
            </label>
            <label>
              Categoria
              <input name="category" type="text" list="detailCategoryOptions" required value="${escapeAttr(item.category || "Outro")}">
              <datalist id="detailCategoryOptions">
                <option value="Mesa"></option>
                <option value="Cadeira"></option>
                <option value="Conjunto"></option>
                <option value="Forro"></option>
                <option value="Outro"></option>
              </datalist>
            </label>
            <label>
              Cor
              <input name="color" type="text" placeholder="Opcional" value="${escapeAttr(item.color || "")}">
            </label>
            <label>
              Quantidade total
              <input name="totalQty" type="number" min="0" inputmode="numeric" required value="${item.totalQty ?? 0}">
            </label>
            <label>
              Indisponivel
              <input name="unavailableQty" type="number" min="0" inputmode="numeric" value="${item.unavailableQty ?? 0}">
            </label>
            <label>
              Valor padrao
              <input name="defaultPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${item.defaultPrice ?? 0}">
            </label>
            <label class="wide">
              Observacoes
              <textarea name="notes" rows="3">${escapeHtml(item.notes || "")}</textarea>
            </label>
            <div class="form-actions wide">
              <button class="primary-action" type="submit">Salvar alteracoes</button>
            </div>
          </form>
        </section>
      </div>
    `);

    bindItemDetailsModal(item);
  }

  function bindItemDetailsModal(item) {
    $$(".tab-btn", $("#modalRoot")).forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.itemTab;
        $$(".tab-btn", $("#modalRoot")).forEach((tabButton) => {
          const active = tabButton.dataset.itemTab === tab;
          tabButton.classList.toggle("active", active);
          tabButton.setAttribute("aria-selected", String(active));
        });
        $$("[data-item-tab-panel]", $("#modalRoot")).forEach((panel) => {
          panel.classList.toggle("hidden", panel.dataset.itemTabPanel !== tab);
        });
      });
    });

    $("#itemDetailsForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const saved = await saveItemFromForm(event.currentTarget, item);
      if (!saved) {
        return;
      }

      await loadAll();
      refreshAll();
      showToast("Item atualizado.");
      openItemDetailsModal(getItem(saved.id || item.id) || saved);
    });

    $("[data-item-tab-panel='entries']", $("#modalRoot"))?.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      if (button.dataset.action === "add-stock-entry") {
        openStockEntryModal(null, item.id);
        return;
      }

      const entry = state.stockMovements.find((movement) => Number(movement.id) === Number(button.dataset.entryId));
      if (!entry) {
        return;
      }

      if (button.dataset.action === "edit-stock-entry") {
        openStockEntryModal(entry, item.id);
      } else if (button.dataset.action === "delete-stock-entry") {
        await deleteStockEntry(entry);
      }
    });
  }

  function getItemRentalHistory(itemId) {
    return state.rentals
      .map((rental) => {
        const qty = (Array.isArray(rental.items) ? rental.items : [])
          .filter((line) => Number(line.itemId) === Number(itemId))
          .reduce((sum, line) => sum + toNumber(line.qty), 0);
        return { rental, qty };
      })
      .filter(({ qty }) => qty > 0)
      .sort((a, b) => {
        const startCompare = String(a.rental.startDate || "").localeCompare(String(b.rental.startDate || ""));
        return startCompare || Number(b.rental.orderNumber || 0) - Number(a.rental.orderNumber || 0);
      });
  }

  function openClientModal(client = null) {
    const title = client ? "Editar cliente" : "Cadastrar cliente";
    openModal(title, `
      <form id="clientForm" class="form-grid">
        <label class="wide">
          Nome
          <input name="name" type="text" required value="${escapeAttr(client?.name || "")}">
        </label>
        <label>
          Telefone/WhatsApp
          <input name="phone" type="tel" value="${escapeAttr(client?.phone || "")}">
        </label>
        <label>
          CPF ou CNPJ
          <input name="document" type="text" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00 ou 00.000.000/0000-00" value="${escapeAttr(client?.document || "")}">
        </label>
        <p id="clientDocumentInfo" class="muted-text wide"></p>
        <label class="wide">
          Endereço
          <input name="address" type="text" value="${escapeAttr(client?.address || "")}">
        </label>
        <label class="wide">
          Observações
          <textarea name="notes" rows="3">${escapeHtml(client?.notes || "")}</textarea>
        </label>
        <div class="form-actions wide">
          <button class="secondary-action" type="button" data-close-modal="true">Cancelar</button>
          <button class="primary-action" type="submit">Salvar cliente</button>
        </div>
      </form>
    `);

    const clientForm = $("#clientForm");
    const documentInput = clientForm.elements.document;
    const validateClientDocument = () => {
      const digits = onlyDigits(documentInput.value).slice(0, 14);
      documentInput.value = formatDocument(digits);
      $("#clientDocumentInfo").textContent = digits ? (isValidDocument(digits) ? `${getDocumentLabel(digits)} válido.` : getDocumentValidationMessage(digits)) : "";
      return !digits || isValidDocument(digits);
    };
    documentInput.addEventListener("input", () => {
      documentInput.value = formatDocument(onlyDigits(documentInput.value).slice(0, 14));
      $("#clientDocumentInfo").textContent = "";
    });
    documentInput.addEventListener("blur", validateClientDocument);
    if (documentInput.value) validateClientDocument();

    clientForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const now = new Date().toISOString();
      if (!validateClientDocument()) {
        documentInput.focus();
        alert("Informe um CPF ou CNPJ válido.");
        return;
      }
      const documentDigits = onlyDigits(documentInput.value);
      const duplicate = documentDigits ? findClientByDocumentDigits(documentDigits) : null;
      if (duplicate && Number(duplicate.id) !== Number(client?.id)) {
        $("#clientDocumentInfo").textContent = `${getDocumentLabel(documentDigits)} já cadastrado para ${duplicate.name}.`;
        documentInput.focus();
        alert("Já existe um cliente cadastrado com este CPF ou CNPJ.");
        return;
      }
      const payload = {
        id: client?.id,
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        document: documentDigits ? formatDocument(documentDigits) : "",
        address: form.address.value.trim(),
        notes: form.notes.value.trim(),
        createdAt: client?.createdAt || now,
        updatedAt: now,
      };

      if (!payload.name) {
        alert("Informe o nome do cliente.");
        return;
      }

      if (client) {
        await PlanetaDB.put("clients", payload);
      } else {
        delete payload.id;
        await PlanetaDB.add("clients", payload);
      }

      closeModal();
      await loadAll();
      refreshAll();
      showToast("Cliente salvo.");
    });
  }

  function openReceiptModal(rental, clientOverride = null) {
    void openOfficialContractModal(rental, clientOverride);
    return;

    const client = clientOverride || getClient(rental.clientId);
    const totals = getRentalTotals(rental);
    const lines = rental.items
      .map((line) => `
        <tr>
          <td>${escapeHtml(line.name)}</td>
          <td>${line.qty}</td>
          <td>${formatMoney(line.unitPrice)}</td>
          <td>${formatMoney(line.qty * line.unitPrice)}</td>
        </tr>
      `)
      .join("");
    const returnProblems = Array.isArray(rental.returnProblems)
      ? rental.returnProblems
          .map((problem) => `<li>${escapeHtml(problem.qty)}x ${escapeHtml(problem.name)} - ${escapeHtml(problem.reason)}</li>`)
          .join("")
      : "";

    openModal("Contrato de aluguel", `
      <div class="receipt print-area">
        <header class="receipt-header">
          <div class="brand-mark" aria-hidden="true">PL</div>
          <div>
            <h2>Contrato de aluguel - Planeta Locações</h2>
            <p class="muted-text">Eventos do seu jeito · Anápolis-GO · Pix: gv8407940@gmail.com</p>
            <p class="muted-text">Titular do Pix: Gabriel Victor Souza Silva</p>
          </div>
        </header>

        <div class="receipt-grid">
          <div>
            <strong>Pedido:</strong> ${escapeHtml(rental.orderNumber)}<br>
            <strong>Data do pedido:</strong> ${formatDate(rental.orderDate)}<br>
            <strong>Status:</strong> ${statusLabel(rental.status)}
          </div>
          <div>
            <strong>Cliente:</strong> ${escapeHtml(client?.name || "Cliente não encontrado")}<br>
            <strong>Telefone:</strong> ${escapeHtml(client?.phone || "-")}<br>
            <strong>Documento:</strong> ${escapeHtml(client?.document || "-")}<br>
            <strong>Endereço:</strong> ${escapeHtml(client?.address || "-")}
          </div>
          <div>
            <strong>Período:</strong> ${formatDate(rental.startDate)} a ${formatDate(rental.endDate)}<br>
            <strong>Local:</strong> ${escapeHtml(rental.eventLocation || "-")}
          </div>
          <div>
            <strong>Pagamento:</strong> ${escapeHtml(rental.paymentMethod || "-")}<br>
            <strong>Status:</strong> ${PAYMENT_STATUS[rental.paymentStatus] || rental.paymentStatus}
          </div>
        </div>

        <table class="receipt-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qtde</th>
              <th>Unitário</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${lines}</tbody>
        </table>

        <div class="totals-box">
          <div class="totals-row"><span>Subtotal</span><strong>${formatMoney(totals.subtotal)}</strong></div>
          <div class="totals-row"><span>Desconto</span><strong>${formatMoney(totals.discount)}</strong></div>
          <div class="totals-row"><span>Frete</span><strong>${formatMoney(totals.freight)}</strong></div>
          <div class="totals-row final"><span>Total final</span><strong>${formatMoney(totals.total)}</strong></div>
          <div class="totals-row"><span>Sinal</span><strong>${formatMoney(totals.deposit)}</strong></div>
          <div class="totals-row"><span>Restante</span><strong>${formatMoney(totals.remaining)}</strong></div>
        </div>

        ${rental.notes ? `<p><strong>Observações:</strong> ${escapeHtml(rental.notes)}</p>` : ""}
        ${returnProblems ? `<p><strong>Itens com problema na devolução:</strong></p><ul>${returnProblems}</ul>` : ""}
        ${rental.returnNotes ? `<p><strong>Observação da devolução:</strong> ${escapeHtml(rental.returnNotes)}</p>` : ""}

        <div class="terms-box">
          <strong>Condições do aluguel:</strong>
          O locatário declara receber os itens listados acima para uso no período informado e se responsabiliza pela devolução nas mesmas condições de entrega.
          Danos, perdas, quebras, manchas ou extravios poderão ser cobrados conforme avaliação do locador.
          O valor total, sinal e restante seguem o combinado neste contrato.
        </div>

        <div class="signature-row">
          <div class="signature-line">Locador</div>
          <div class="signature-line">Locatário</div>
        </div>
      </div>

      <div class="form-actions no-print">
        <button class="secondary-action" type="button" data-close-modal="true">Fechar</button>
        <button class="primary-action" type="button" id="printReceiptBtn">Imprimir ou salvar PDF</button>
        <button class="primary-action red" type="button" id="shareReceiptBtn">Compartilhar</button>
      </div>
    `);

    $("#printReceiptBtn").addEventListener("click", () => window.print());
    $("#shareReceiptBtn").addEventListener("click", () => shareReceipt(rental, client));
  }

  async function openOfficialContractModal(rental, clientOverride = null) {
    try {
      const client = clientOverride || getClient(rental.clientId);
      const contractHtml = await renderOfficialContractHtml(rental, client);
      clearPreparedContractPdf();

      openModal("Contrato de aluguel", `
        <div class="contract-preview-wrap">
          <iframe id="contractPreviewFrame" class="contract-frame" title="Prévia do contrato de aluguel"></iframe>
        </div>
        <div class="form-actions no-print">
          <button class="secondary-action" type="button" data-close-modal="true">Fechar</button>
          <button class="primary-action" type="button" id="prepareContractPdfBtn">Preparar PDF</button>
          <button class="primary-action red" type="button" id="shareContractPdfBtn" disabled>Compartilhar / salvar PDF</button>
          <button class="secondary-action" type="button" id="shareReceiptBtn">Compartilhar resumo</button>
        </div>
      `);

      const frame = $("#contractPreviewFrame");
      frame.srcdoc = contractHtml;
      $("#prepareContractPdfBtn").addEventListener("click", () => {
        try {
          prepareOfficialContractPdf(rental, client);
          $("#prepareContractPdfBtn").textContent = "PDF preparado";
          $("#shareContractPdfBtn").disabled = false;
          $("#shareContractPdfBtn").textContent = canSharePreparedPdf()
            ? "Compartilhar / salvar PDF"
            : "Abrir PDF";
          showToast("PDF pronto. Toque em Compartilhar / salvar PDF.");
        } catch (error) {
          console.error(error);
          alert("Não foi possível preparar o PDF. Atualize o aplicativo e tente novamente.");
        }
      });
      $("#shareContractPdfBtn").addEventListener("click", sharePreparedContractPdf);
      $("#shareReceiptBtn").addEventListener("click", () => shareReceipt(rental, client));
    } catch (error) {
      console.error(error);
      alert("Não foi possível gerar o contrato. Verifique se o template oficial está no projeto.");
    }
  }

  async function getContractTemplate() {
    if (state.contractTemplate) {
      return state.contractTemplate;
    }

    const response = await fetch(CONTRACT_TEMPLATE_URL);
    if (!response.ok) {
      throw new Error("Template oficial do contrato não encontrado.");
    }

    state.contractTemplate = await response.text();
    return state.contractTemplate;
  }

  async function renderOfficialContractHtml(rental, client) {
    const template = await getContractTemplate();
    const data = buildContractData(rental, client);
    const html = template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, field) =>
      Object.prototype.hasOwnProperty.call(data, field) ? String(data[field]) : ""
    );
    return applyContractDensity(html, data);
  }

  function buildContractItems(rental) {
    if (rental?.dailyPricing?.enabled && Array.isArray(rental.dailyPricing.rows) && rental.dailyPricing.rows.length) {
      return rental.dailyPricing.rows.map((row) => {
        const quantidade = Math.max(1, toNumber(row.qty));
        const chargedDays = (row.days || []).filter((day) => day.charge !== false);
        const valorUnitario = roundMoney(chargedDays.reduce((sum, day) => sum + toNumber(day.unitPrice), 0));
        const total = roundMoney(quantidade * valorUnitario);
        const dailyText = chargedDays.length
          ? chargedDays.map((day) => `${formatDate(day.date)}: ${formatMoney(day.unitPrice)} por ${row.unitLabel || "unidade"}`).join("; ")
          : "Nenhum dia cobrado";
        return {
          quantidade,
          descricao: `${row.label || "Item"} - cobranca por dias: ${dailyText}`,
          valor_unitario: valorUnitario,
          valor_unitario_formatado: formatMoney(valorUnitario),
          total,
          total_formatado: formatMoney(total),
        };
      });
    }

    return (Array.isArray(rental.items) ? rental.items : []).map((line) => {
      const quantidade = Math.max(1, toNumber(line.qty));
      const valorUnitario = Math.max(0, toNumber(line.unitPrice));
      const total = roundMoney(quantidade * valorUnitario);
      return {
        quantidade,
        descricao: line.name || "Item",
        valor_unitario: valorUnitario,
        valor_unitario_formatado: formatMoney(valorUnitario),
        total,
        total_formatado: formatMoney(total),
      };
    });
  }

  function buildContractData(rental, client) {
    const itens = buildContractItems(rental);
    const totals = getRentalTotals({ ...rental, items: rental.items || [] });
    const settlement = getRentalSettlement(rental);
    const valorTotal = totals.total;
    const sinal = totals.deposit;
    const restante = settlement.remaining;
    const longTextSize =
      itens.reduce((sum, item) => sum + String(item.descricao || "").length, 0) +
      String(rental.notes || "").length +
      String(client?.name || "").length +
      String(client?.address || "").length +
      String(rental.eventLocation || "").length;

    return {
      numero_contrato: escapeHtml(rental.orderNumber || "Prévia"),
      data_emissao: formatDate(todayISO()),
      nome_cliente: escapeHtml(client?.name || ""),
      telefone_cliente: escapeHtml(client?.phone || ""),
      cpf_cnpj: escapeHtml(client?.document || ""),
      endereco_cliente: escapeHtml(client?.address || ""),
      referencia_endereco: "",
      periodo: escapeHtml(`${formatDate(rental.startDate)} a ${formatDate(rental.endDate)}`),
      horario: "",
      local_evento: escapeHtml(rental.eventLocation || ""),
      linhas_itens: itens.map(renderContractItemRow).join(""),
      subtotal_itens: formatMoney(totals.subtotal),
      desconto: formatMoney(totals.discount),
      frete: formatMoney(totals.freight),
      valor_total: formatMoney(valorTotal),
      sinal: formatMoney(sinal),
      restante: formatMoney(restante),
      pix: CONTRACT_PIX,
      titular_pix: CONTRACT_PIX_HOLDER,
      item_count: itens.length,
      content_weight: longTextSize + itens.length * 32,
    };
  }

  function applyContractDensity(html, data) {
    const className = getContractDensityClass(data);

    if (!className) {
      return html;
    }

    return html.replace(/<body([^>]*)>/i, (match, attrs) => {
      if (/class\s*=/.test(attrs)) {
        return match.replace(/class=(["'])(.*?)\1/i, `class=$1$2 ${className}$1`);
      }

      return `<body${attrs} class="${className}">`;
    });
  }

  function getContractDensityClass(data) {
    const itemCount = Number(data.item_count) || 0;
    const contentWeight = Number(data.content_weight) || 0;
    const classes = [];

    if (itemCount >= 6 || contentWeight >= 520) {
      classes.push("density-compact");
    }

    if (itemCount >= 10 || contentWeight >= 760) {
      classes.push("density-tight");
    }

    if (itemCount >= 14 || contentWeight >= 980) {
      classes.push("multi-page");
    }

    return classes.join(" ");
  }

  function renderContractItemRow(item) {
    return `
        <tr>
          <td class="qtd">${escapeHtml(item.quantidade)}</td>
          <td>${escapeHtml(item.descricao)}</td>
          <td class="money">${escapeHtml(item.valor_unitario_formatado)}</td>
          <td class="total">${escapeHtml(item.total_formatado)}</td>
        </tr>
      `;
  }

  function clearPreparedContractPdf() {
    if (state.preparedContractPdf?.url) {
      URL.revokeObjectURL(state.preparedContractPdf.url);
    }
    state.preparedContractPdf = null;
  }

  function prepareOfficialContractPdf(rental, client) {
    clearPreparedContractPdf();

    const document = createOfficialContractPdf(rental, client);
    const blob = document.output("blob");
    const orderNumber = String(rental?.orderNumber || "contrato").replace(/[^a-zA-Z0-9_-]+/g, "-");
    const filename = `contrato-planeta-locacoes-${orderNumber}.pdf`;
    const file = new File([blob], filename, { type: "application/pdf" });

    state.preparedContractPdf = {
      blob,
      file,
      filename,
      url: URL.createObjectURL(blob),
    };
  }

  function canSharePreparedPdf() {
    const file = state.preparedContractPdf?.file;
    return Boolean(file && navigator.canShare?.({ files: [file] }));
  }

  function sharePreparedContractPdf() {
    const prepared = state.preparedContractPdf;
    if (!prepared) {
      alert("Prepare o PDF antes de compartilhar.");
      return;
    }

    // Esta chamada acontece diretamente no clique do usuario. Assim o PWA do
    // iPhone preserva o gesto necessario para abrir a folha de compartilhamento.
    if (canSharePreparedPdf()) {
      navigator
        .share({
          title: prepared.filename.replace(/\.pdf$/i, ""),
          files: [prepared.file],
        })
        .catch((error) => {
          if (error?.name !== "AbortError") {
            console.error(error);
            alert("Não foi possível abrir o compartilhamento do PDF.");
          }
        });
      return;
    }

    const previewWindow = window.open(prepared.url, "_blank");
    if (!previewWindow) {
      window.location.href = prepared.url;
    }
  }

  function createOfficialContractPdf(rental, client) {
    const JsPDF = window.jspdf?.jsPDF;
    if (!JsPDF) {
      throw new Error("Biblioteca de PDF não carregada.");
    }

    const data = buildPdfContractData(rental, client);
    const layout = getPdfContractLayout(data);
    const document = new JsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
      putOnlyUsedFonts: true,
    });

    document.setProperties({
      title: `Contrato ${data.orderNumber} - Planeta Locações`,
      subject: "Contrato de aluguel",
      author: "Planeta Locações",
    });

    if (layout.twoCopiesPerPage) {
      drawPdfContractCopy(document, data, {
        y: 4.5,
        height: 137.5,
        copyLabel: "Via 1",
        scale: layout.scale,
      });
      drawPdfCutLine(document, 145);
      drawPdfContractCopy(document, data, {
        y: 148.5,
        height: 137.5,
        copyLabel: "Via 2",
        scale: layout.scale,
      });
      return document;
    }

    const itemChunks = splitPdfItems(data.items, 28);
    const copies = ["Via 1", "Via 2"];
    let pageIndex = 0;
    copies.forEach((copyLabel) => {
      itemChunks.forEach((items, chunkIndex) => {
        if (pageIndex > 0) {
          document.addPage();
        }
        drawPdfContractCopy(document, { ...data, items }, {
          y: 5,
          height: 287,
          copyLabel: chunkIndex ? `${copyLabel} - continuação` : copyLabel,
          scale: 1,
        });
        pageIndex += 1;
      });
    });

    return document;
  }

  function buildPdfContractData(rental, client) {
    const totals = getRentalTotals({ ...rental, items: rental.items || [] });
    const settlement = getRentalSettlement(rental);
    const items = buildContractItems(rental).map((item) => ({
      qty: String(item.quantidade || "-"),
      name: String(item.descricao || "Item"),
      unitPrice: String(item.valor_unitario_formatado || formatMoney(item.valor_unitario)),
      total: String(item.total_formatado || formatMoney(item.total)),
    }));
    const notes = String(rental?.notes || "").trim();

    return {
      orderNumber: String(rental?.orderNumber || "Prévia"),
      issuedAt: formatDate(todayISO()),
      clientName: String(client?.name || "Cliente não encontrado"),
      phone: String(client?.phone || "-"),
      document: String(client?.document || "-"),
      address: String(client?.address || "-"),
      period: `${formatDate(rental?.startDate)} a ${formatDate(rental?.endDate)}`,
      eventLocation: String(rental?.eventLocation || "-"),
      items,
      totals: { ...totals, received: settlement.received, remaining: settlement.remaining },
      notes,
      contentWeight:
        items.reduce((total, item) => total + item.name.length, 0) +
        String(client?.name || "").length +
        String(client?.address || "").length +
        String(rental?.eventLocation || "").length +
        notes.length,
    };
  }

  function getPdfContractLayout(data) {
    const itemCount = data.items.length;
    const contentWeight = data.contentWeight;

    if (itemCount > 12 || contentWeight > 900) {
      return { twoCopiesPerPage: false, scale: 1 };
    }
    if (itemCount > 8 || contentWeight > 680) {
      return { twoCopiesPerPage: true, scale: 0.76 };
    }
    if (itemCount > 4 || contentWeight > 460) {
      return { twoCopiesPerPage: true, scale: 0.88 };
    }
    return { twoCopiesPerPage: true, scale: 1 };
  }

  function splitPdfItems(items, maximumPerPage) {
    const list = Array.isArray(items) && items.length ? items : [{ qty: "-", name: "Nenhum item informado", unitPrice: "-", total: "-" }];
    const chunks = [];
    for (let index = 0; index < list.length; index += maximumPerPage) {
      chunks.push(list.slice(index, index + maximumPerPage));
    }
    return chunks;
  }

  function drawPdfContractCopy(document, data, options) {
    const x = 4.5;
    const width = 201;
    const y = options.y;
    const height = options.height;
    const scale = options.scale;
    const unit = (value) => value * scale;
    const innerX = x + unit(4);
    const innerWidth = width - unit(8);
    const bottom = y + height - unit(4);

    document.setLineWidth(0.38);
    document.setDrawColor(0, 60, 158);
    document.roundedRect(x, y, width, height, unit(2), unit(2), "S");
    document.setFillColor(215, 0, 0);
    document.rect(x, y, width * 0.3, unit(3), "F");
    document.setFillColor(0, 60, 166);
    document.rect(x + width * 0.3, y, width * 0.7, unit(3), "F");

    let cursor = y + unit(9);
    setPdfFont(document, unit(13.5), "bold", [0, 60, 166]);
    document.text("Planeta", innerX, cursor);
    const planetWidth = document.getTextWidth("Planeta");
    setPdfFont(document, unit(13.5), "bold", [215, 0, 0]);
    document.text("Locações", innerX + planetWidth + unit(5), cursor);
    setPdfFont(document, unit(5.8), "normal", [50, 50, 50]);
    document.text("Eventos do seu jeito | Uma marca da Planeta Móveis", innerX, cursor + unit(3.4));

    const titleWidth = unit(62);
    const titleHeight = unit(10.5);
    const titleX = x + width - unit(4) - titleWidth;
    const titleY = y + unit(4);
    document.setFillColor(0, 60, 166);
    document.roundedRect(titleX, titleY, titleWidth, titleHeight, 0, 0, "F");
    setPdfFont(document, unit(9.6), "bold", [255, 255, 255]);
    document.text("CONTRATO DE ALUGUEL", titleX + titleWidth / 2, titleY + unit(4.2), { align: "center" });
    setPdfFont(document, unit(5.8), "normal", [20, 20, 20]);
    document.text(`${options.copyLabel} - Nº ${data.orderNumber}   Data: ${data.issuedAt}`, titleX + titleWidth, titleY + titleHeight + unit(3), { align: "right" });

    cursor = y + unit(19);
    document.setDrawColor(184, 197, 230);
    document.setFillColor(255, 255, 255);
    document.rect(innerX, cursor, innerWidth, unit(4.5), "FD");
    setPdfFont(document, unit(5.2), "normal", [30, 30, 30]);
    document.text("Av. Fernando Costa nº 44 - V. Jaiara - Anápolis-GO", innerX + unit(1.3), cursor + unit(2.9));
    document.text("Gabriel: (62) 99935-1052 | @planeta_locacoes_anapolis", innerX + innerWidth - unit(1.3), cursor + unit(2.9), { align: "right" });
    cursor += unit(6);

    cursor = drawPdfFieldBox(document, "DADOS DO LOCATÁRIO", [
      [
        { label: "Nome", value: data.clientName, fraction: 0.62 },
        { label: "Telefone", value: data.phone, fraction: 0.38 },
      ],
      [{ label: "CPF/CNPJ", value: data.document, fraction: 1 }],
      [{ label: "Endereço", value: data.address, fraction: 1 }],
    ], innerX, cursor, innerWidth, unit, bottom);

    cursor = drawPdfFieldBox(document, "DADOS DO ALUGUEL", [
      [
        { label: "Data/período", value: data.period, fraction: 0.62 },
        { label: "Horário", value: "", fraction: 0.38 },
      ],
      [{ label: "Local de entrega/evento", value: data.eventLocation, fraction: 1 }],
    ], innerX, cursor, innerWidth, unit, bottom);

    cursor = drawPdfSectionTitle(document, "ITENS ALUGADOS", innerX, cursor, innerWidth, unit);
    cursor = drawPdfItemsTable(document, data.items, innerX, cursor, innerWidth, unit, bottom);
    cursor = drawPdfTotals(document, data.totals, innerX, cursor + unit(1.2), innerWidth, unit);
    cursor = drawPdfPayment(document, innerX, cursor, innerWidth, unit);

    const terms = [
      "Condições: Os itens devem ser devolvidos nas mesmas condições de entrega. Danos, perdas, extravios e atraso na devolução são de responsabilidade do locatário.",
      "O sinal confirma a reserva e o restante deve ser quitado conforme combinado.",
      data.notes ? `Observações: ${data.notes}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    cursor = drawPdfTerms(document, terms, innerX, cursor + unit(1.1), innerWidth, unit);

    const signatureY = Math.min(Math.max(cursor + unit(7), y + height - unit(13)), bottom - unit(4));
    drawPdfSignatures(document, innerX, signatureY, innerWidth, unit);
  }

  function drawPdfSectionTitle(document, title, x, y, width, unit) {
    const height = unit(4);
    document.setFillColor(0, 60, 166);
    document.rect(x, y, width, height, "F");
    setPdfFont(document, unit(6.7), "bold", [255, 255, 255]);
    document.text(title, x + unit(1.3), y + unit(2.75));
    return y + height;
  }

  function drawPdfFieldBox(document, title, rows, x, y, width, unit) {
    let cursor = drawPdfSectionTitle(document, title, x, y, width, unit);
    const fontSize = unit(5.7);
    rows.forEach((cells) => {
      const cellWidths = cells.map((cell, index) => {
        if (index === cells.length - 1) {
          const usedWidth = cells
            .slice(0, index)
            .reduce((sum, previous) => sum + width * Number(previous.fraction || 0), 0);
          return { ...cell, width: width - usedWidth };
        }
        return { ...cell, width: width * cell.fraction };
      });
      const preparedCells = cellWidths.map((cell) => {
        const content = `${cell.label}: ${pdfText(cell.value)}`;
        const lines = document.splitTextToSize(content, Math.max(unit(12), cell.width - unit(2.4)));
        return { ...cell, lines };
      });
      const rowHeight = Math.max(unit(4.4), ...preparedCells.map((cell) => unit(1.7) + cell.lines.length * fontSize * 0.37));
      let cellX = x;
      preparedCells.forEach((cell) => {
        document.setDrawColor(198, 208, 233);
        document.rect(cellX, cursor, cell.width, rowHeight, "S");
        setPdfFont(document, fontSize, "normal", [20, 20, 20]);
        document.text(cell.lines, cellX + unit(1.2), cursor + unit(2.5), { lineHeightFactor: 1.05 });
        cellX += cell.width;
      });
      cursor += rowHeight;
    });
    return cursor + unit(1.1);
  }

  function drawPdfItemsTable(document, items, x, y, width, unit) {
    const quantityWidth = unit(14);
    const unitWidth = unit(29);
    const totalWidth = unit(32);
    const descriptionWidth = width - quantityWidth - unitWidth - totalWidth;
    const columns = [quantityWidth, descriptionWidth, unitWidth, totalWidth];
    const headerHeight = unit(4.4);
    const headers = ["Qtd.", "Descrição dos itens", "Vlr. unit.", "Total"];
    let cursor = y;
    let cellX = x;

    headers.forEach((header, index) => {
      document.setFillColor(238, 244, 255);
      document.setDrawColor(184, 197, 230);
      document.rect(cellX, cursor, columns[index], headerHeight, "FD");
      setPdfFont(document, unit(6.1), "bold", [0, 45, 143]);
      document.text(header, cellX + columns[index] / 2, cursor + unit(2.8), { align: "center" });
      cellX += columns[index];
    });
    cursor += headerHeight;

    const rowFontSize = unit(5.9);
    const safeItems = Array.isArray(items) && items.length ? items : [{ qty: "-", name: "Nenhum item informado", unitPrice: "-", total: "-" }];
    safeItems.forEach((item) => {
      const descriptionLines = document.splitTextToSize(pdfText(item.name), Math.max(unit(22), descriptionWidth - unit(2.4)));
      const rowHeight = Math.max(unit(4.4), unit(1.6) + descriptionLines.length * rowFontSize * 0.37);
      const values = [pdfText(item.qty), descriptionLines, pdfText(item.unitPrice), pdfText(item.total)];
      cellX = x;
      values.forEach((value, index) => {
        document.setDrawColor(184, 197, 230);
        document.rect(cellX, cursor, columns[index], rowHeight, "S");
        setPdfFont(document, rowFontSize, "normal", [20, 20, 20]);
        const textX = index === 1 ? cellX + unit(1.2) : cellX + columns[index] / 2;
        const align = index === 1 ? "left" : "center";
        document.text(value, textX, cursor + unit(2.65), { align, lineHeightFactor: 1.05 });
        cellX += columns[index];
      });
      cursor += rowHeight;
    });
    return cursor;
  }

  function drawPdfTotals(document, totals, x, y, width, unit) {
    const lines = [
      `Subtotal: ${formatMoney(totals.subtotal)}`,
      `Desconto: ${formatMoney(totals.discount)}`,
      `Frete: ${formatMoney(totals.freight)}`,
      `Total final: ${formatMoney(totals.total)}`,
      `Sinal já recebido: ${formatMoney(totals.deposit)}`,
      `Restante: ${formatMoney(totals.remaining)}`,
    ];
    const lineHeight = unit(3.6);
    const height = lineHeight * 2 + unit(1.4);
    document.setDrawColor(184, 197, 230);
    document.rect(x, y, width, height, "S");
    lines.forEach((line, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      setPdfFont(document, unit(5.8), index === 3 ? "bold" : "normal", index === 3 ? [0, 45, 143] : [20, 20, 20]);
      document.text(line, x + unit(1.2) + (width / 3) * column, y + unit(2.6) + lineHeight * row);
    });
    return y + height;
  }

  function drawPdfPayment(document, x, y, width, unit) {
    const height = unit(4.1);
    document.setFillColor(247, 251, 255);
    document.setDrawColor(184, 197, 230);
    document.rect(x, y, width, height, "FD");
    setPdfFont(document, unit(5.8), "normal", [20, 20, 20]);
    document.text(`Pix: ${CONTRACT_PIX}`, x + unit(1.2), y + unit(2.6));
    document.text(`Titular: ${CONTRACT_PIX_HOLDER}`, x + width - unit(1.2), y + unit(2.6), { align: "right" });
    return y + height;
  }

  function drawPdfTerms(document, text, x, y, width, unit) {
    const fontSize = unit(5.2);
    const lines = document.splitTextToSize(pdfText(text), width - unit(2.4));
    const height = Math.max(unit(6.4), unit(1.8) + lines.length * fontSize * 0.37);
    document.setFillColor(255, 243, 243);
    document.setDrawColor(255, 195, 195);
    document.rect(x, y, width, height, "FD");
    setPdfFont(document, fontSize, "normal", [180, 0, 0]);
    document.text(lines, x + unit(1.2), y + unit(2.5), { lineHeightFactor: 1.05 });
    return y + height;
  }

  function drawPdfSignatures(document, x, y, width, unit) {
    const signatureWidth = width * 0.42;
    const leftX = x + width * 0.04;
    const rightX = x + width - width * 0.04 - signatureWidth;
    document.setDrawColor(0, 60, 166);
    document.setLineWidth(0.42);
    document.line(leftX, y, leftX + signatureWidth, y);
    document.line(rightX, y, rightX + signatureWidth, y);
    setPdfFont(document, unit(5.7), "normal", [20, 20, 20]);
    document.text("Assinatura do locador", leftX + signatureWidth / 2, y + unit(2.7), { align: "center" });
    document.text("Assinatura do locatário", rightX + signatureWidth / 2, y + unit(2.7), { align: "center" });
  }

  function drawPdfCutLine(document, y) {
    document.setDrawColor(130, 130, 130);
    document.setLineDashPattern([1.2, 1.2], 0);
    document.line(4.5, y, 205.5, y);
    document.setLineDashPattern([], 0);
    document.setFillColor(255, 255, 255);
    document.rect(94, y - 1.8, 22, 3.6, "F");
    setPdfFont(document, 6.2, "normal", [100, 100, 100]);
    document.text("corte aqui", 105, y + 0.9, { align: "center" });
  }

  function setPdfFont(document, size, style, color) {
    document.setFont("helvetica", style);
    document.setFontSize(size);
    document.setTextColor(...color);
  }

  function pdfText(value) {
    return String(value ?? "-").replace(/\s+/g, " ").trim() || "-";
  }

  async function shareReceipt(rental, client) {
    const totals = getRentalTotals(rental);
    const settlement = getRentalSettlement(rental);
    const text = [
      "Contrato de aluguel - Planeta Locações",
      `Pedido ${rental.orderNumber}`,
      `Cliente: ${client?.name || "-"}`,
      `Período: ${formatDate(rental.startDate)} a ${formatDate(rental.endDate)}`,
      `Subtotal dos itens: ${formatMoney(totals.subtotal)}`,
      `Frete: ${formatMoney(totals.freight)}`,
      `Total: ${formatMoney(totals.total)}`,
      `Sinal já recebido: ${formatMoney(totals.deposit)}`,
      `Restante: ${formatMoney(settlement.remaining)}`,
      "Pix: gv8407940@gmail.com",
    ].join("\n");

    if (navigator.share) {
      await navigator.share({
        title: `Contrato ${rental.orderNumber} - Planeta Locações`,
        text,
      });
      return;
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      showToast("Texto do contrato copiado.");
    } else {
      alert(text);
    }
  }

  function getRecordPayments(recordType, recordId) {
    return state.payments.filter((payment) => payment.recordType === recordType && Number(payment.recordId) === Number(recordId));
  }

  function getExpenseSettlement(expense) {
    const total = Math.max(0, toNumber(expense?.amount));
    const records = getRecordPayments("expense", expense?.id);
    const legacyAmount = !records.length && expense?.status === "paid" ? total : 0;
    const cashPaid = records
      .filter((payment) => payment.kind !== "supplier-offset-sale")
      .reduce((sum, payment) => sum + toNumber(payment.amount), 0) + legacyAmount;
    const offsets = records
      .filter((payment) => payment.kind === "supplier-offset-sale")
      .reduce((sum, payment) => sum + toNumber(payment.amount), 0);
    const settled = Math.min(total, roundMoney(cashPaid + offsets));
    const remaining = Math.max(0, roundMoney(total - settled));
    const status = remaining <= 0
      ? "paid"
      : settled > 0
        ? "partial"
        : getExpenseDate(expense) < todayISO()
          ? "overdue"
          : "pending";

    return { total, records, cashPaid: roundMoney(cashPaid), offsets: roundMoney(offsets), settled, remaining, status, legacyAmount };
  }

  function getRentalSettlement(rental) {
    const total = getRentalTotals(rental).total;
    const records = getRecordPayments("rental", rental?.id);
    const recordedAmount = roundMoney(records.reduce((sum, payment) => sum + toNumber(payment.amount), 0));
    const deposit = Math.min(total, Math.max(0, toNumber(rental?.deposit)));
    const preservesLegacyDeposit = records.some((payment) => payment.preservesLegacyDeposit);
    const hasRecordedDeposit = records.some((payment) =>
      payment.isDeposit ||
      payment.legacyType === "deposit" ||
      payment.source === "rental-deposit" ||
      /\bsinal\b/i.test(String(payment.notes || ""))
    ) || (!preservesLegacyDeposit && deposit > 0 && records.some((payment) => Math.abs(toNumber(payment.amount) - deposit) < 0.005));
    const legacyType = !records.length && rental?.paymentStatus === "paid"
      ? "full-payment"
      : deposit > 0 && recordedAmount < total && !hasRecordedDeposit
        ? "deposit"
        : null;
    const legacyAmount = legacyType === "full-payment" ? total : legacyType === "deposit" ? deposit : 0;
    const received = Math.min(total, roundMoney(recordedAmount + legacyAmount));
    const remaining = Math.max(0, roundMoney(total - received));
    return {
      total,
      records,
      received,
      remaining,
      status: remaining <= 0 ? "paid" : received > 0 ? "partial" : "unpaid",
      legacyAmount,
      legacyType,
      legacyDate: getLegacyRentalReceiptDate(rental),
    };
  }

  function getLegacyRentalReceiptDate(rental) {
    return rental?.paymentReceivedAt?.slice(0, 10) || rental?.orderDate || rental?.startDate || todayISO();
  }

  function getMaximumCommittedQuantity(item) {
    const dates = new Set();
    state.rentals
      .filter((rental) => ACTIVE_STATUSES.includes(rental.status))
      .forEach((rental) => {
        dates.add(rental.startDate);
        dates.add(rental.endDate);
      });
    let highest = 0;
    dates.forEach((date) => {
      const used = getItemPeriodConflicts(item, date, date).reduce((sum, conflict) => sum + conflict.qty, 0);
      highest = Math.max(highest, used);
    });
    return highest;
  }

  function getSafeSaleAvailability(item) {
    if (!item) {
      return 0;
    }
    return Math.max(0, toNumber(item.totalQty) - toNumber(item.unavailableQty) - getMaximumCommittedQuantity(item));
  }

  function renderPaymentTimeline(recordType, record) {
    const payments = getRecordPayments(recordType, record.id);
    const settlement = recordType === "expense" ? getExpenseSettlement(record) : getRentalSettlement(record);
    const legacyAmount = settlement.legacyAmount;
    const lines = payments.map((payment) => `
      <div class="payment-timeline-item">
        <div>
          <strong>${payment.kind === "supplier-offset-sale" ? "Abatimento por venda" : recordType === "rental" ? "Recebimento" : "Pagamento"}</strong>
          <span>${formatDate(payment.date)} · ${escapeHtml(payment.paymentMethod || "Compensado com fornecedor")}${payment.notes ? ` · ${escapeHtml(payment.notes)}` : ""}</span>
        </div>
        <div class="payment-timeline-value">
          <strong>${formatMoney(payment.amount)}</strong>
          <button type="button" data-action="edit-payment" data-payment-id="${payment.id}">Editar</button>
          <button type="button" class="danger-mini" data-action="delete-payment" data-payment-id="${payment.id}">Excluir</button>
        </div>
      </div>`);
    if (legacyAmount > 0) {
      const legacyTitle = recordType === "rental" ? "Recebimento antigo a revisar" : "Migrado - revisar data";
      const legacyDate = recordType === "rental" ? settlement.legacyDate : "";
      lines.unshift(`<div class="payment-timeline-item legacy-payment"><div><strong>${legacyTitle}</strong><span>${legacyDate ? `${formatDate(legacyDate)} · ` : ""}Registro antigo preservado. Use a revisão para criar um lançamento editável.</span></div><strong>${formatMoney(legacyAmount)}</strong></div>`);
    }
    return lines.length ? `<div class="payment-timeline">${lines.join("")}</div>` : `<p class="muted-text">Nenhum pagamento ou abatimento registrado.</p>`;
  }

  function getLegacyPaymentCandidates() {
    const expenses = state.expenses
      .map((expense) => ({ recordType: "expense", record: expense, amount: getExpenseSettlement(expense).legacyAmount, date: expense.paidAt?.slice(0, 10) || getExpenseDate(expense) }))
      .filter((entry) => entry.amount > 0);
    const rentals = state.rentals
      .filter(isRentalFinancialEntry)
      .map((rental) => {
        const settlement = getRentalSettlement(rental);
        return { recordType: "rental", record: rental, amount: settlement.legacyAmount, date: settlement.legacyDate, legacyType: settlement.legacyType };
      })
      .filter((entry) => entry.amount > 0);
    return [...expenses, ...rentals].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function renderPaymentReview() {
    const candidates = getLegacyPaymentCandidates();
    const offsets = state.payments.filter((payment) => payment.kind === "supplier-offset-sale");
    const candidateTotal = candidates.reduce((sum, entry) => sum + entry.amount, 0);
    const offsetTotal = offsets.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
    $("#paymentReviewStats").innerHTML = [
      ["Registros antigos a revisar", candidates.length],
      ["Valor histórico identificado", formatMoney(candidateTotal)],
      ["Abatimentos cadastrados", offsets.length],
      ["Créditos comerciais", formatMoney(offsetTotal)],
    ].map(([label, value]) => `<article class="kpi-card"><span>${label}</span><strong>${value}</strong></article>`).join("");
    const rows = candidates.map((entry) => `
      <article class="data-card">
        <div class="card-top"><div><h3 class="card-title">${escapeHtml(entry.recordType === "expense" ? entry.record.description : `Pedido ${entry.record.orderNumber}`)}</h3><p class="card-subtitle">${entry.recordType === "expense" ? "Gasto/parcela" : "Locação"} · data sugerida ${formatDate(entry.date)}</p></div><span class="badge yellow">${entry.recordType === "rental" ? "Recebimento antigo a revisar" : "Migrado - revisar data"}</span></div>
        <div class="metric-grid"><div class="metric"><span>Valor a criar no histórico</span><strong>${formatMoney(entry.amount)}</strong></div><div class="metric"><span>Data sugerida</span><strong>${formatDate(entry.date)}</strong></div></div>
        <div class="card-actions"><button class="primary-action" type="button" data-action="migrate-legacy-payment" data-record-type="${entry.recordType}" data-id="${entry.record.id}">Criar pagamento histórico</button><button type="button" data-action="open-review-record" data-record-type="${entry.recordType}" data-id="${entry.record.id}">Abrir detalhes</button></div>
      </article>`).join("");
    $("#paymentReviewList").innerHTML = rows || emptyState("Nenhum pagamento antigo aguardando revisão. Os novos pagamentos e abatimentos já são registrados separadamente.");
  }

  async function handlePaymentReviewClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const recordType = button.dataset.recordType;
    const record = recordType === "expense" ? getExpense(button.dataset.id) : getRental(button.dataset.id);
    if (!record) return;
    if (button.dataset.action === "open-review-record") {
      if (recordType === "expense") openExpenseDetailsModal(record);
      else openRentalDetailsModal(record);
      return;
    }
    if (button.dataset.action !== "migrate-legacy-payment") return;
    const summary = recordType === "expense" ? getExpenseSettlement(record) : getRentalSettlement(record);
    if (!summary.legacyAmount || !confirm(`Criar um lançamento histórico de ${formatMoney(summary.legacyAmount)}? Depois você poderá editar a data, o valor ou dividir em vários pagamentos.`)) return;
    const now = new Date().toISOString();
    const date = recordType === "expense" ? record.paidAt?.slice(0, 10) || getExpenseDate(record) : summary.legacyDate;
    await PlanetaDB.add("payments", {
      recordType,
      recordId: Number(record.id),
      recordKey: `${recordType}:${record.id}`,
      kind: recordType === "rental" ? "rental-receipt" : "expense-payment",
      direction: recordType === "rental" ? "inflow" : "outflow",
      amount: summary.legacyAmount,
      date,
      paymentMethod: record.paymentMethod || "Outro",
      notes: recordType === "rental" ? "Recebimento antigo a revisar" : "Migrado - revisar data",
      isDeposit: recordType === "rental" && summary.legacyType === "deposit",
      legacyType: recordType === "rental" ? summary.legacyType : null,
      createdAt: now,
      updatedAt: now,
      migrationStatus: "needs-review",
      reconciliationStatus: "unmatched",
      bankTransactionId: null,
      inventoryLines: [],
    });
    await loadAll();
    const fresh = recordType === "expense" ? getExpense(record.id) : getRental(record.id);
    if (fresh) await syncRecordPaymentStatus(recordType, fresh);
    await loadAll();
    refreshAll();
    showToast("Pagamento histórico criado. Revise a data antes de considerar a conciliação concluída.");
  }

  function renderExpenseFilters() {
    fillSelect($("#expenseCategoryFilter"), uniqueValues(state.expenses.map((expense) => expense.category || "Sem categoria")), "Todas");
  }

  function renderExpenses() {
    const expenses = state.expenses.filter(isExpenseInExpenseFilters);
    const paidTotal = expenses.reduce((sum, expense) => sum + getExpenseSettlement(expense).cashPaid, 0);
    const pendingTotal = expenses.reduce((sum, expense) => sum + getExpenseSettlement(expense).remaining, 0);
    const offsetTotal = expenses.reduce((sum, expense) => sum + getExpenseSettlement(expense).offsets, 0);
    const investmentTotal = expenses
      .filter((expense) => normalizeExpenseType(expense) === "investment")
      .reduce((sum, expense) => sum + toNumber(expense.amount), 0);
    const costTotal = expenses
      .filter((expense) => normalizeExpenseType(expense) === "cost")
      .reduce((sum, expense) => sum + toNumber(expense.amount), 0);
    const installments = expenses.filter((expense) => (expense.kind || "manual") === "installment").length;

    $("#expenseStats").innerHTML = [
      ["Investimentos", formatMoney(investmentTotal)],
      ["Custos", formatMoney(costTotal)],
      ["Gastos pagos", formatMoney(paidTotal)],
      ["Pendentes", formatMoney(pendingTotal)],
      ["Abatimentos", formatMoney(offsetTotal)],
      ["Parcelas", installments],
    ]
      .map(([label, value]) => `<article class="kpi-card"><span>${label}</span><strong>${value}</strong></article>`)
      .join("");

    $("#expenseList").innerHTML = expenses.length
      ? expenses.map(renderExpenseCard).join("")
      : emptyState("Nenhum gasto encontrado para os filtros escolhidos.");
  }

  function isExpenseInExpenseFilters(expense) {
    const search = normalize($("#expenseSearch").value);
    const type = $("#expenseTypeFilter").value;
    const status = $("#expenseStatusFilter").value;
    const category = $("#expenseCategoryFilter").value;
    const effectiveStatus = expenseEffectiveStatus(expense);
    const text = normalize(`${expense.description} ${expense.category} ${expense.paymentMethod} ${expense.notes}`);

    return (
      (!search || text.includes(search)) &&
      (!type || normalizeExpenseType(expense) === type) &&
      (!status || (status === "installment" ? (expense.kind || "manual") === "installment" : effectiveStatus === status)) &&
      (!category || expense.category === category)
    );
  }

  function renderExpenseCard(expense) {
    const settlement = getExpenseSettlement(expense);
    const status = settlement.status;
    const statusClass = status === "paid" ? "green" : status === "overdue" ? "red" : "yellow";
    const isInstallment = (expense.kind || "manual") === "installment";

    return `
      <article class="data-card">
        <div class="card-top">
          <div>
            <h3 class="card-title">${escapeHtml(expense.description || "Gasto")}</h3>
            <p class="card-subtitle">${formatDate(getExpenseDate(expense))} · ${escapeHtml(expense.category || "Sem categoria")}</p>
          </div>
          <div class="badge-row">
            <span class="badge ${normalizeExpenseType(expense) === "investment" ? "" : "yellow"}">${expenseTypeLabel(normalizeExpenseType(expense))}</span>
            <span class="badge ${statusClass}">${EXPENSE_STATUS[status] || status}</span>
            ${isInstallment ? `<span class="badge">Parcela ${expense.installmentNumber || "-"} de ${expense.installmentTotal || "-"}</span>` : ""}
          </div>
        </div>
        <div class="metric-grid">
          <div class="metric"><span>Valor total</span><strong>${formatMoney(settlement.total)}</strong></div>
          <div class="metric"><span>Pago em caixa</span><strong>${formatMoney(settlement.cashPaid)}</strong></div>
          <div class="metric"><span>Abatimentos</span><strong>${formatMoney(settlement.offsets)}</strong></div>
          <div class="metric"><span>Restante</span><strong>${formatMoney(settlement.remaining)}</strong></div>
          <div class="metric"><span>Tipo</span><strong>${isInstallment ? "Parcelado" : "Manual"}</strong></div>
          <div class="metric"><span>Status</span><strong>${EXPENSE_STATUS[status] || status}</strong></div>
        </div>
        ${expense.notes ? `<p class="muted-text">Obs.: ${escapeHtml(expense.notes)}</p>` : ""}
        <div class="card-actions">
          <button type="button" data-action="expense-details" data-id="${expense.id}">Detalhes</button>
          <button type="button" data-action="register-expense-payment" data-id="${expense.id}">Registrar pagamento</button>
          <button type="button" data-action="edit-expense" data-id="${expense.id}">Editar</button>
          <button type="button" class="danger-mini" data-action="delete-expense" data-id="${expense.id}">Excluir</button>
        </div>
      </article>
    `;
  }

  function renderFinanceFilters() {
    const categories = uniqueValues([
      "Locações",
      ...state.expenses.map((expense) => expense.category || "Sem categoria"),
    ]);
    fillSelect($("#financeCategoryFilter"), categories, "Todas");
  }

  function renderFinance() {
    const period = getFinancePeriod();
    syncFinancePeriodControls(period);
    const allMovements = getFinanceMovements();
    const movements = allMovements.filter((movement) => isMovementInFinanceFilters(movement, period));
    const incomeTotal = movements
      .filter((movement) => movement.type === "income")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const receivableTotal = movements
      .filter((movement) => movement.type === "pending-income")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const paidExpenseTotal = movements
      .filter((movement) => movement.type === "paid-expense")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const supplierOffsetTotal = movements
      .filter((movement) => movement.type === "supplier-offset")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const offsetProfitTotal = movements
      .filter((movement) => movement.type === "supplier-offset" && Number.isFinite(toNumber(movement.profit)))
      .reduce((sum, movement) => sum + toNumber(movement.profit), 0);
    const pendingExpenseTotal = movements
      .filter((movement) => movement.type === "pending-expense" || movement.type === "future-expense")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const futureExpenseTotal = movements
      .filter((movement) => movement.type === "future-expense")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const investmentTotal = movements
      .filter((movement) => movement.source === "expense" && movement.expenseType === "investment" && ["paid-expense", "supplier-offset"].includes(movement.type))
      .reduce((sum, movement) => sum + movement.amount, 0);
    const costTotal = movements
      .filter((movement) => movement.source === "expense" && movement.expenseType === "cost" && ["paid-expense", "supplier-offset"].includes(movement.type))
      .reduce((sum, movement) => sum + movement.amount, 0);
    const overdueTotal = movements
      .filter((movement) => movement.source === "expense" && movement.status === "overdue")
      .reduce((sum, movement) => sum + movement.amount, 0);

    $("#financeStats").innerHTML = [
      ["Entradas reais de caixa", formatMoney(incomeTotal)],
      ["Saídas reais de caixa", formatMoney(paidExpenseTotal)],
      ["Vendas com abatimento", formatMoney(supplierOffsetTotal)],
      ["Abatimentos em dívidas", formatMoney(supplierOffsetTotal)],
      ["Lucro das vendas informado", formatMoney(offsetProfitTotal)],
      ["Locações a receber", formatMoney(receivableTotal)],
      ["Total de gastos", formatMoney(investmentTotal + costTotal)],
      ["Total de investimentos", formatMoney(investmentTotal)],
      ["Total de custos", formatMoney(costTotal)],
      ["Total ainda a pagar", formatMoney(pendingExpenseTotal)],
      ["Parcelas futuras", formatMoney(futureExpenseTotal)],
      ["Saldo de caixa", formatMoney(incomeTotal - paidExpenseTotal)],
      ["Atrasados", formatMoney(overdueTotal)],
    ]
      .map(([label, value]) => `<article class="kpi-card"><span>${label}</span><strong>${value}</strong></article>`)
      .join("");

    $("#upcomingFinanceList").innerHTML = renderUpcomingExpenses(period);
    $("#overdueFinanceList").innerHTML = renderOverdueExpenses(period);
    $("#financeList").innerHTML = movements.length
      ? movements.map(renderFinanceMovementCard).join("")
      : emptyState("Nenhuma movimentação encontrada para os filtros escolhidos.");
    renderFinanceCharts(movements, {
      incomeTotal,
      investmentTotal,
      costTotal,
      paidExpenseTotal,
      pendingExpenseTotal,
      supplierOffsetTotal,
    });
  }

  function renderFinanceCharts(movements, totals) {
    const expenseMovements = movements.filter((movement) => movement.source === "expense");
    const incomeMovements = movements.filter((movement) => movement.source === "rental" && movement.type === "income");

    drawPieChart("financeMixChart", "financeMixLegend", [
      { label: "Entradas", value: totals.incomeTotal, color: "#138a43" },
      { label: "Abatimentos", value: totals.supplierOffsetTotal, color: "#6b4fa1" },
      { label: "Custos", value: totals.costTotal, color: "#df1f2d" },
      { label: "Investimentos", value: totals.investmentTotal, color: "#0b4ea2" },
    ]);

    drawPieChart(
      "categoryExpenseChart",
      "categoryExpenseLegend",
      groupChartData(expenseMovements, (movement) => movement.category || "Sem categoria")
    );

    drawPieChart("expenseStatusChart", "expenseStatusLegend", [
      { label: "Pagos", value: totals.paidExpenseTotal, color: "#138a43" },
      { label: "Pendentes", value: totals.pendingExpenseTotal, color: "#b86900" },
    ]);

    drawPieChart(
      "rentalRevenueChart",
      "rentalRevenueLegend",
      groupChartData(incomeMovements, (movement) => movement.paymentMethod || "Sem forma")
    );
  }

  function groupChartData(movements, getLabel) {
    const colors = ["#0b4ea2", "#df1f2d", "#138a43", "#b86900", "#5b45a0", "#007c89", "#8a3ffc"];
    const grouped = new Map();

    movements.forEach((movement) => {
      const label = getLabel(movement);
      grouped.set(label, (grouped.get(label) || 0) + toNumber(movement.amount));
    });

    return Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], index) => ({
        label,
        value,
        color: colors[index % colors.length],
      }));
  }

  function drawPieChart(canvasId, legendId, rows) {
    const canvas = $(`#${canvasId}`);
    const legend = $(`#${legendId}`);
    if (!canvas || !legend) {
      return;
    }

    const data = rows.filter((row) => toNumber(row.value) > 0);
    const total = data.reduce((sum, row) => sum + toNumber(row.value), 0);
    const width = Math.max(260, canvas.parentElement?.clientWidth || 320);
    const height = 230;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = "100%";
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    if (!data.length || !total) {
      context.beginPath();
      context.arc(width / 2, 96, 72, 0, Math.PI * 2);
      context.fillStyle = "#eef4ff";
      context.fill();
      context.fillStyle = "#65728a";
      context.font = "700 14px Arial, Helvetica, sans-serif";
      context.textAlign = "center";
      context.fillText("Sem dados", width / 2, 101);
      legend.innerHTML = `<span class="muted-text">Sem dados suficientes.</span>`;
      return;
    }

    let start = -Math.PI / 2;
    data.forEach((row) => {
      const value = toNumber(row.value);
      const angle = (value / total) * Math.PI * 2;
      context.beginPath();
      context.moveTo(width / 2, 96);
      context.arc(width / 2, 96, 82, start, start + angle);
      context.closePath();
      context.fillStyle = row.color;
      context.fill();
      start += angle;
    });

    context.beginPath();
    context.arc(width / 2, 96, 42, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    context.fillStyle = "#172033";
    context.font = "800 14px Arial, Helvetica, sans-serif";
    context.textAlign = "center";
    context.fillText(formatMoney(total), width / 2, 101);

    legend.innerHTML = data
      .map((row) => {
        const percent = Math.round((toNumber(row.value) / total) * 100);
        return `
          <div class="legend-item">
            <span class="legend-swatch" style="background:${row.color}"></span>
            <strong>${escapeHtml(row.label)}</strong>
            <span>${formatMoney(row.value)} · ${percent}%</span>
          </div>
        `;
      })
      .join("");
  }

  function getFinanceMovements() {
    const movements = [];
    state.rentals.filter(isRentalFinancialEntry).forEach((rental) => {
      const client = getClient(rental.clientId);
      const settlement = getRentalSettlement(rental);
      const base = {
        source: "rental", category: "Locações", title: `Pedido ${rental.orderNumber}`,
        clientName: client?.name || "Cliente não encontrado",
        itemText: (rental.items || []).map((line) => `${line.qty}x ${line.name}`).join(", "),
        startDate: rental.startDate, endDate: rental.endDate, rentalTotal: settlement.total,
        paymentStatus: settlement.status,
      };
      const receipts = [
        ...(settlement.legacyAmount ? [{
          id: `legacy-rental-${rental.id}`, amount: settlement.legacyAmount, date: settlement.legacyDate,
          paymentMethod: rental.paymentMethod || "-", notes: "Recebimento antigo a revisar", legacy: true,
        }] : []),
        ...settlement.records,
      ];
      receipts.forEach((payment) => movements.push({ ...base, id: `rental-income-${payment.id}`, type: "income", amount: toNumber(payment.amount), date: payment.date, paymentMethod: payment.paymentMethod || "-", notes: payment.notes || "", legacy: payment.legacy }));
      if (settlement.remaining > 0) movements.push({ ...base, id: `rental-receivable-${rental.id}`, type: "pending-income", amount: settlement.remaining, date: rental.startDate || rental.orderDate, paymentMethod: "-", notes: "" });
    });

    state.expenses.forEach((expense) => {
      const settlement = getExpenseSettlement(expense);
      const base = {
        source: "expense", expenseId: expense.id, category: expense.category || "Sem categoria",
        expenseType: normalizeExpenseType(expense), title: expense.description || "Gasto sem descrição",
        status: settlement.status, kind: expense.kind || "manual", installmentNumber: expense.installmentNumber,
        installmentTotal: expense.installmentTotal,
      };
      const records = settlement.records.length ? settlement.records : settlement.legacyAmount ? [{
        id: `legacy-expense-${expense.id}`, amount: settlement.legacyAmount, date: expense.paidAt?.slice(0, 10) || getExpenseDate(expense),
        paymentMethod: expense.paymentMethod || "-", notes: "Migrado - revisar data", legacy: true,
      }] : [];
      records.forEach((payment) => movements.push({
        ...base, id: `expense-payment-${payment.id}`, type: payment.kind === "supplier-offset-sale" ? "supplier-offset" : "paid-expense",
        amount: toNumber(payment.amount), date: payment.date, paymentMethod: payment.paymentMethod || "-", notes: payment.notes || "",
        supplier: payment.supplier || "", buyer: payment.buyer || "", profit: payment.profit, legacy: payment.legacy,
      }));
      if (settlement.remaining > 0) movements.push({
        ...base, id: `expense-pending-${expense.id}`, type: financeTypeForExpense({ ...expense, status: settlement.status }),
        amount: settlement.remaining, date: getExpenseDate(expense), paymentMethod: "-", notes: expense.notes || "",
      });
    });
    return movements.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function getRentalReceivedAmount(rental) {
    return getRentalSettlement(rental).received;
  }

  function getRentalReceivableAmount(rental) {
    return getRentalSettlement(rental).remaining;
  }

  function formatReceivedDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return formatDate(String(value || "").slice(0, 10));
    }

    return date.toLocaleDateString("pt-BR");
  }

  function isMovementInFinanceFilters(movement, period = getFinancePeriod()) {
    const type = $("#financeTypeFilter").value;
    const category = $("#financeCategoryFilter").value;
    const date = movement.date || "";

    return (
      Boolean(date) &&
      date >= period.startDate &&
      date <= period.endDate &&
      (!type || movement.type === type) &&
      (!category || movement.category === category)
    );
  }

  function isDateInFinancePeriod(date, period = getFinancePeriod()) {
    return Boolean(date) && date >= period.startDate && date <= period.endDate;
  }

  function renderFinanceMovementCard(movement) {
    if (movement.source === "rental") {
      const isReceived = movement.type === "income";
      return `
        <article class="data-card">
          <div class="card-top">
            <div>
              <h3 class="card-title">${isReceived ? "Entrada" : "A receber"} - ${escapeHtml(movement.title)}</h3>
              <p class="card-subtitle">${escapeHtml(movement.clientName)} · ${formatDate(movement.startDate)} a ${formatDate(movement.endDate)}</p>
            </div>
            <div class="badge-row">
              <span class="badge ${isReceived ? "green" : "yellow"}">${FINANCE_TYPE[movement.type]}</span>
              <span class="badge">${PAYMENT_STATUS[movement.paymentStatus] || movement.paymentStatus}</span>
            </div>
          </div>
          <div class="metric-grid">
            <div class="metric"><span>${isReceived ? "Valor recebido" : "Valor a receber"}</span><strong>${formatMoney(movement.amount)}</strong></div>
            <div class="metric"><span>Total da locação</span><strong>${formatMoney(movement.rentalTotal)}</strong></div>
            <div class="metric"><span>Pagamento</span><strong>${escapeHtml(movement.paymentMethod)}</strong></div>
            <div class="metric"><span>Data</span><strong>${formatDate(movement.date)}</strong></div>
            <div class="metric"><span>Categoria</span><strong>${escapeHtml(movement.category)}</strong></div>
          </div>
          <p class="muted-text">${escapeHtml(movement.itemText || "Sem itens")}</p>
        </article>
      `;
    }

    const statusClass = movement.status === "paid" ? "green" : movement.status === "overdue" ? "red" : "yellow";
    return `
      <article class="data-card">
        <div class="card-top">
          <div>
            <h3 class="card-title">${escapeHtml(movement.title)}</h3>
            <p class="card-subtitle">${escapeHtml(movement.category)} · ${formatDate(movement.date)}</p>
          </div>
          <div class="badge-row">
            <span class="badge ${movement.expenseType === "investment" ? "" : "yellow"}">${expenseTypeLabel(movement.expenseType)}</span>
            <span class="badge ${statusClass}">${EXPENSE_STATUS[movement.status] || movement.status}</span>
            <span class="badge">${FINANCE_TYPE[movement.type]}</span>
          </div>
        </div>
        <div class="metric-grid">
          <div class="metric"><span>Valor</span><strong>${formatMoney(movement.amount)}</strong></div>
          <div class="metric"><span>Pagamento</span><strong>${escapeHtml(movement.paymentMethod)}</strong></div>
          <div class="metric"><span>Natureza</span><strong>${expenseTypeLabel(movement.expenseType)}</strong></div>
          <div class="metric"><span>Tipo</span><strong>${movement.kind === "installment" ? "Parcela" : "Gasto"}</strong></div>
          <div class="metric"><span>Parcela</span><strong>${movement.installmentTotal ? `${movement.installmentNumber}/${movement.installmentTotal}` : "-"}</strong></div>
        </div>
        ${movement.notes ? `<p class="muted-text">Obs.: ${escapeHtml(movement.notes)}</p>` : ""}
        ${movement.type === "supplier-offset" ? `<p class="muted-text"><strong>Compensado com fornecedor:</strong> ${escapeHtml(movement.supplier || "não informado")}${movement.buyer ? ` · comprador: ${escapeHtml(movement.buyer)}` : ""}${movement.profit !== null && movement.profit !== undefined ? ` · lucro informado: ${formatMoney(movement.profit)}` : ""}</p>` : ""}
        <div class="card-actions">
          <button type="button" data-action="edit-expense" data-id="${movement.expenseId}">Editar</button>
          ${movement.status !== "paid" ? `<button type="button" data-action="mark-expense-paid" data-id="${movement.expenseId}">Marcar pago</button>` : ""}
          <button type="button" class="danger-mini" data-action="delete-expense" data-id="${movement.expenseId}">Excluir</button>
        </div>
      </article>
    `;
  }

  function renderUpcomingExpenses(period = getFinancePeriod()) {
    const upcoming = state.expenses
      .filter((expense) => expenseEffectiveStatus(expense) === "pending")
      .filter((expense) => isDateInFinancePeriod(getExpenseDate(expense), period))
      .sort((a, b) => String(getExpenseDate(a)).localeCompare(String(getExpenseDate(b))))
      .slice(0, 6);

    if (!upcoming.length) {
      return emptyState("Nenhum vencimento pendente neste período.");
    }

    return upcoming
      .map((expense) => `
        <div class="compact-item">
          <div>
            <strong>${escapeHtml(expense.description || "Gasto")}</strong>
            <span>${formatDate(getExpenseDate(expense))} · ${escapeHtml(expense.category || "Sem categoria")}</span>
          </div>
          <span>${formatMoney(getExpenseSettlement(expense).remaining)}</span>
        </div>
      `)
      .join("");
  }

  function renderOverdueExpenses(period = getFinancePeriod()) {
    const overdue = state.expenses
      .filter((expense) => expenseEffectiveStatus(expense) === "overdue")
      .filter((expense) => isDateInFinancePeriod(getExpenseDate(expense), period))
      .sort((a, b) => String(getExpenseDate(a)).localeCompare(String(getExpenseDate(b))))
      .slice(0, 6);

    if (!overdue.length) {
      return emptyState("Nenhum gasto atrasado neste período.");
    }

    return overdue
      .map((expense) => `
        <div class="compact-item">
          <div>
            <strong>${escapeHtml(expense.description || "Gasto")}</strong>
            <span>Venceu em ${formatDate(getExpenseDate(expense))}</span>
          </div>
          <span>${formatMoney(getExpenseSettlement(expense).remaining)}</span>
        </div>
      `)
      .join("");
  }

  async function handleExpenseClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    await handleExpenseAction(button);
  }

  async function handleFinanceClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    await handleExpenseAction(button);
  }

  async function handleExpenseAction(button) {
    const expense = state.expenses.find((item) => Number(item.id) === Number(button.dataset.id));
    if (!expense) {
      return;
    }

    if (button.dataset.action === "edit-expense") {
      openExpenseModal(expense);
    } else if (button.dataset.action === "expense-details") {
      openExpenseDetailsModal(expense);
    } else if (button.dataset.action === "register-expense-payment") {
      openRecordPaymentModal("expense", expense);
    } else if (button.dataset.action === "mark-expense-paid") {
      openRecordPaymentModal("expense", expense);
    } else if (button.dataset.action === "delete-expense") {
      await deleteExpense(expense);
    }
  }

  function openExpenseModal(expense = null) {
    const isInstallment = expense?.kind === "installment";
    const title = expense ? (isInstallment ? "Editar parcela" : "Editar gasto") : "Cadastrar gasto";
    const status = expenseEffectiveStatus(expense || { status: "pending" });
    openModal(title, `
      <form id="expenseForm" class="form-grid">
        <label class="wide">
          Descrição do gasto
          <input name="description" type="text" required value="${escapeAttr(expense?.description || "")}">
        </label>
        <label>
          Tipo
          <select name="expenseType">
            <option value="cost" ${normalizeExpenseType(expense || {}) === "cost" ? "selected" : ""}>Custo</option>
            <option value="investment" ${normalizeExpenseType(expense || {}) === "investment" ? "selected" : ""}>Investimento</option>
          </select>
        </label>
        <label>
          Categoria
          <input name="category" type="text" list="expenseCategoryOptions" value="${escapeAttr(expense?.category || "")}" placeholder="Ex.: Manutenção">
          <datalist id="expenseCategoryOptions">
            <option value="Compra de equipamentos"></option>
            <option value="Manutenção"></option>
            <option value="Transporte"></option>
            <option value="Limpeza"></option>
            <option value="Taxas"></option>
            <option value="Outro"></option>
          </datalist>
        </label>
        <label>
          Valor
          <input name="amount" type="number" min="0" step="0.01" inputmode="decimal" required value="${expense?.amount ?? 0}">
        </label>
        <label>
          ${isInstallment ? "Data de vencimento" : "Data"}
          <input name="date" type="date" required value="${escapeAttr(getExpenseDate(expense) || todayISO())}">
        </label>
        <label>
          Forma de pagamento
          <select name="paymentMethod">
            ${["Pix", "Dinheiro", "Cartão", "Boleto", "Outro"].map((method) => `<option ${method === (expense?.paymentMethod || "Pix") ? "selected" : ""}>${method}</option>`).join("")}
          </select>
        </label>
        <label>
          Status
          <select name="status">
            <option value="pending" ${status !== "paid" ? "selected" : ""}>Pendente</option>
            <option value="paid" ${status === "paid" ? "selected" : ""}>Pago</option>
            ${expense ? "" : `<option value="installment">Parcelado</option>`}
          </select>
        </label>
        ${isInstallment ? `<p class="muted-text wide">Parcela ${expense.installmentNumber || "-"} de ${expense.installmentTotal || "-"}</p>` : ""}
        <label class="wide">
          Observações
          <textarea name="notes" rows="3">${escapeHtml(expense?.notes || "")}</textarea>
        </label>
        <div class="form-actions wide">
          <button class="secondary-action" type="button" data-close-modal="true">Cancelar</button>
          <button class="primary-action" type="submit">Salvar</button>
        </div>
      </form>
    `);

    $("#expenseForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const now = new Date().toISOString();

      if (form.status.value === "installment") {
        closeModal();
        openInstallmentModal({
          description: form.description.value.trim(),
          category: form.category.value.trim(),
          expenseType: form.expenseType.value,
          totalAmount: Math.max(0, toNumber(form.amount.value)),
          paymentMethod: form.paymentMethod.value,
          notes: form.notes.value.trim(),
        });
        return;
      }

      const payload = {
        ...(expense || {}),
        kind: expense?.kind || "manual",
        expenseType: form.expenseType.value,
        description: form.description.value.trim(),
        category: form.category.value.trim() || "Outro",
        amount: Math.max(0, toNumber(form.amount.value)),
        paymentMethod: form.paymentMethod.value,
        status: expense ? getExpenseSettlement(expense).status : form.status.value,
        notes: form.notes.value.trim(),
        createdAt: expense?.createdAt || now,
        updatedAt: now,
      };

      if (payload.kind === "installment") {
        payload.dueDate = form.date.value;
      } else {
        payload.date = form.date.value;
        delete payload.dueDate;
      }

      if (!payload.description || !payload.amount || !form.date.value) {
        alert("Informe descrição, valor e data do gasto.");
        return;
      }

      if (payload.status === "paid") {
        payload.paidAt = payload.paidAt || now;
      } else {
        delete payload.paidAt;
      }

      if (expense) {
        await PlanetaDB.put("expenses", payload);
      } else {
        const id = await PlanetaDB.add("expenses", payload);
        if (payload.status === "paid") {
          await PlanetaDB.add("payments", {
            recordType: "expense", recordId: id, recordKey: `expense:${id}`,
            kind: "expense-payment", direction: "outflow", amount: payload.amount,
            date: payload.date || payload.dueDate || todayISO(), paymentMethod: payload.paymentMethod || "Outro",
            notes: "Pagamento informado no cadastro", createdAt: now, updatedAt: now,
            reconciliationStatus: "unmatched", bankTransactionId: null, inventoryLines: [],
          });
        }
      }

      closeModal();
      await loadAll();
      refreshAll();
      showToast("Gasto salvo.");
    });
  }

  function openInstallmentModal(draft = {}) {
    const expenseType = draft.expenseType || "investment";
    const totalAmount = draft.totalAmount || "";
    const installmentTotal = draft.installmentTotal || 1;
    openModal("Cadastrar gasto parcelado", `
      <form id="installmentForm" class="form-grid">
        <label class="wide">
          Descrição
          <input name="description" type="text" required placeholder="Ex.: Compra de mesas e cadeiras" value="${escapeAttr(draft.description || "")}">
        </label>
        <label>
          Tipo
          <select name="expenseType">
            <option value="investment" ${expenseType === "investment" ? "selected" : ""}>Investimento</option>
            <option value="cost" ${expenseType === "cost" ? "selected" : ""}>Custo</option>
          </select>
        </label>
        <label>
          Categoria
          <input name="category" type="text" value="${escapeAttr(draft.category || "Compra de equipamentos")}">
        </label>
        <label>
          Valor total
          <input name="totalAmount" type="number" min="0" step="0.01" inputmode="decimal" required value="${escapeAttr(totalAmount)}">
        </label>
        <label>
          Primeiro vencimento
          <input name="dueDate" type="date" required value="${escapeAttr(draft.dueDate || todayISO())}">
        </label>
        <label>
          Quantidade de parcelas
          <input name="installmentTotal" type="number" min="1" inputmode="numeric" required value="${escapeAttr(installmentTotal)}">
        </label>
        <label>
          Valor de cada parcela
          <input name="amount" type="number" min="0" step="0.01" inputmode="decimal" readonly>
        </label>
        <label>
          Vencimento das próximas parcelas
          <select name="frequency">
            <option value="monthly">Mensal, no mesmo dia</option>
          </select>
        </label>
        <label>
          Forma de pagamento
          <select name="paymentMethod">
            ${["Pix", "Dinheiro", "Cartão", "Boleto", "Outro"].map((method) => `<option ${method === (draft.paymentMethod || "Pix") ? "selected" : ""}>${method}</option>`).join("")}
          </select>
        </label>
        <label>
          Status inicial
          <select name="status">
            <option value="pending">Pendente</option>
            <option value="paid">Paga</option>
          </select>
        </label>
        <label class="wide">
          Observações
          <textarea name="notes" rows="3">${escapeHtml(draft.notes || "")}</textarea>
        </label>
        <div class="form-actions wide">
          <button class="secondary-action" type="button" data-close-modal="true">Cancelar</button>
          <button class="primary-action" type="submit">Criar parcelas</button>
        </div>
      </form>
    `);

    const form = $("#installmentForm");
    const syncInstallmentAmount = () => {
      const total = Math.max(0, toNumber(form.totalAmount.value));
      const installments = Math.max(1, Math.floor(toNumber(form.installmentTotal.value)));
      form.amount.value = installments ? roundMoney(total / installments).toFixed(2) : "0.00";
    };
    form.totalAmount.addEventListener("input", syncInstallmentAmount);
    form.installmentTotal.addEventListener("input", syncInstallmentAmount);
    syncInstallmentAmount();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const total = Math.max(1, Math.floor(toNumber(form.installmentTotal.value)));
      const totalAmountValue = roundMoney(toNumber(form.totalAmount.value));
      const totalCents = Math.round(totalAmountValue * 100);
      const baseCents = Math.floor(totalCents / total);

      if (!form.description.value.trim() || !totalAmountValue || !form.dueDate.value) {
        alert("Confira descrição, valor total, quantidade e primeiro vencimento das parcelas.");
        return;
      }

      const now = new Date().toISOString();
      const seriesId = `parcelas-${Date.now()}`;
      for (let number = 1; number <= total; number += 1) {
        const amount = (number === total ? totalCents - baseCents * (total - 1) : baseCents) / 100;
        const expenseId = await PlanetaDB.add("expenses", {
          kind: "installment",
          seriesId,
          expenseType: form.expenseType.value,
          description: form.description.value.trim(),
          category: form.category.value.trim() || "Compra de equipamentos",
          amount,
          totalAmount: totalAmountValue,
          installmentAmount: baseCents / 100,
          installmentFrequency: form.frequency.value,
          dueDate: addMonthsToISODate(form.dueDate.value, number - 1),
          paymentMethod: form.paymentMethod.value,
          status: form.status.value,
          notes: form.notes.value.trim(),
          installmentNumber: number,
          installmentTotal: total,
          createdAt: now,
          updatedAt: now,
          paidAt: form.status.value === "paid" ? now : undefined,
        });
        if (form.status.value === "paid") {
          await PlanetaDB.add("payments", {
            recordType: "expense", recordId: expenseId, recordKey: `expense:${expenseId}`,
            kind: "expense-payment", direction: "outflow", amount, date: addMonthsToISODate(form.dueDate.value, number - 1),
            paymentMethod: form.paymentMethod.value, notes: "Pagamento informado no cadastro", createdAt: now, updatedAt: now,
            reconciliationStatus: "unmatched", bankTransactionId: null, inventoryLines: [],
          });
        }
      }

      closeModal();
      await loadAll();
      refreshAll();
      showToast("Parcelas cadastradas.");
    });
  }

  async function markExpensePaid(expense) {
    openRecordPaymentModal("expense", expense);
  }

  async function deleteExpense(expense) {
    if (confirm(`Excluir o gasto "${expense.description}"?`)) {
      await PlanetaDB.remove("expenses", Number(expense.id));
      await loadAll();
      refreshAll();
      showToast("Gasto excluído.");
    }
  }

  async function exportBackup() {
    await PlanetaDB.setMeta("lastBackupAt", new Date().toISOString());
    const data = await PlanetaDB.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `planeta-locacoes-backup-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    await loadAll();
    renderBackup();
    showToast("Backup exportado.");
  }

  function importBackup(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const summary = summarizeBackupData(data);
        const choice = prompt(
          `Backup compatível encontrado.\n\n${summary}\n\nDigite MESCLAR para acrescentar sem apagar os dados atuais.\nDigite SUBSTITUIR para apagar os dados atuais e usar somente o backup.`
        );
        const mode = String(choice || "").trim().toUpperCase();

        if (!mode) {
          return;
        }

        if (mode !== "MESCLAR" && mode !== "SUBSTITUIR") {
          alert("Importação cancelada. Use MESCLAR ou SUBSTITUIR.");
          return;
        }

        if (mode === "SUBSTITUIR" && !confirm("SUBSTITUIR apaga os dados atuais deste aparelho antes de importar. Continuar?")) {
          return;
        }

        await PlanetaDB.importData(data, { mode: mode === "MESCLAR" ? "merge" : "replace" });
        await PlanetaDB.setMeta("seededV1", true);
        await PlanetaDB.setMeta("lastImportAt", new Date().toISOString());
        await loadAll();
        startNewRental();
        refreshAll();
        showToast(mode === "MESCLAR" ? "Backup mesclado." : "Backup importado.");
      } catch (error) {
        console.error(error);
        alert("Não foi possível importar o arquivo. Verifique se é um backup JSON válido.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function summarizeBackupData(data) {
    if (!data || typeof data !== "object" || !data.stores || typeof data.stores !== "object") {
      throw new Error("Arquivo de backup inválido.");
    }

    const requiredStores = ["items", "clients", "rentals", "expenses"];
    const invalidStore = requiredStores.find((store) => data.stores[store] && !Array.isArray(data.stores[store]));
    if (invalidStore) {
      throw new Error(`Backup incompatível: ${invalidStore}.`);
    }

    const counts = {
      items: Array.isArray(data.stores.items) ? data.stores.items.length : 0,
      clients: Array.isArray(data.stores.clients) ? data.stores.clients.length : 0,
      rentals: Array.isArray(data.stores.rentals) ? data.stores.rentals.length : 0,
      expenses: Array.isArray(data.stores.expenses) ? data.stores.expenses.length : 0,
      payments: Array.isArray(data.stores.payments) ? data.stores.payments.length : 0,
      kits: Array.isArray(data.stores.kits) ? data.stores.kits.length : 0,
    };

    return [
      `Itens/produtos: ${counts.items}`,
      `Conjuntos/kits: ${counts.kits}`,
      `Clientes: ${counts.clients}`,
      `Locações: ${counts.rentals}`,
      `Gastos/parcelas: ${counts.expenses}`,
      `Pagamentos e abatimentos: ${counts.payments}`,
    ].join("\n");
  }

  async function clearStockData() {
    const wantsBackup = confirm("Antes de limpar o estoque, deseja exportar um backup dos dados atuais?");
    if (wantsBackup) {
      await exportBackup();
    }

    const activeRentals = state.rentals.filter((rental) => ACTIVE_STATUSES.includes(rental.status)).length;
    const warning = activeRentals
      ? `Existem ${activeRentals} locação(ões) ativa(s). Os pedidos continuam salvos, mas o estoque será apagado deste aparelho.`
      : "Clientes, locações e gastos não serão apagados.";
    const answer = prompt(`${warning}\n\nDigite ESTOQUE para limpar apenas os itens cadastrados no estoque.`);

    if (answer !== "ESTOQUE") {
      showToast("Limpeza do estoque cancelada.");
      return;
    }

    await PlanetaDB.clear("items");
    await PlanetaDB.setMeta("seededV1", true);
    await PlanetaDB.setMeta("demoSeedCleanupV1", true);
    state.currentRentalItems = [];
    await loadAll();
    startNewRental();
    refreshAll();
    showToast("Estoque limpo. Cadastre seus itens reais manualmente.");
  }

  async function clearAllData() {
    const answer = prompt('Digite APAGAR para limpar todos os dados deste aparelho.');
    if (answer !== "APAGAR") {
      return;
    }

    await PlanetaDB.clearAll();
    await PlanetaDB.setMeta("seededV1", true);
    await PlanetaDB.setMeta("nextOrderNumber", 1001);
    await loadAll();
    startNewRental();
    refreshAll();
    showToast("Dados locais apagados.");
  }

  async function renderBackup() {
    const lastBackup = await PlanetaDB.getMeta("lastBackupAt", null);
    $("#lastBackupInfo").textContent = lastBackup ? `Último backup: ${formatDateTime(lastBackup)}` : "Nenhum backup exportado neste aparelho.";
  }

  function getItemStats(item) {
    const today = todayISO();
    const stats = {
      total: Number(item.totalQty) || 0,
      unavailable: Number(item.unavailableQty) || 0,
      reservedToday: 0,
      rentedToday: 0,
      futureReserved: 0,
      nextReservationDate: "",
      returned: 0,
      availableToday: 0,
    };

    state.rentals.forEach((rental) => {
      const rentalLines = (Array.isArray(rental.items) ? rental.items : [])
        .filter((line) => Number(line.itemId) === Number(item.id))
      rentalLines.forEach((line) => {
        const qty = Number(line.qty) || 0;

        if (rental.status === "reserved" && datesOverlap(today, today, rental.startDate, rental.endDate)) {
          stats.reservedToday += qty;
        } else if (rental.status === "delivered" && datesOverlap(today, today, rental.startDate, rental.endDate)) {
          stats.rentedToday += qty;
        } else if (rental.status === "returned") {
          stats.returned += qty;
        }

      });
    });

    const future = getFutureReservationStats(item, today);
    stats.futureReserved = future.qty;
    stats.nextReservationDate = future.nextDate;
    stats.availableToday = Math.max(0, stats.total - stats.unavailable - stats.reservedToday - stats.rentedToday);
    return stats;
  }

  function getItemAvailabilityForPeriod(item, startDate, endDate, ignoreRentalId = null) {
    const safeStart = startDate || todayISO();
    const safeEnd = endDate || safeStart;
    const conflicts = getItemPeriodConflicts(item, safeStart, safeEnd, ignoreRentalId);
    const reserved = conflicts
      .filter((conflict) => conflict.rental.status === "reserved")
      .reduce((sum, conflict) => sum + conflict.qty, 0);
    const delivered = conflicts
      .filter((conflict) => conflict.rental.status === "delivered")
      .reduce((sum, conflict) => sum + conflict.qty, 0);
    const occupied = reserved + delivered;
    const total = Number(item?.totalQty) || 0;
    const unavailable = Number(item?.unavailableQty) || 0;

    return {
      total,
      unavailable,
      reserved,
      delivered,
      occupied,
      available: Math.max(0, total - unavailable - occupied),
      conflicts,
    };
  }

  function renderAvailabilityConflictText(item, conflicts) {
    if (!Array.isArray(conflicts) || !conflicts.length) {
      return "";
    }

    return conflicts
      .slice(0, 4)
      .map(({ rental, qty }) => {
        const client = getClient(rental.clientId);
        return `${escapeHtml(qty)} ${escapeHtml(item?.name || "item")} - pedido ${escapeHtml(rental.orderNumber || "-")} - ${escapeHtml(client?.name || "cliente")} - ${formatDate(rental.startDate)} até ${formatDate(rental.endDate)}`;
      })
      .join("<br>");
  }

  function getKitAvailabilityForPeriod(kit, startDate, endDate) {
    const components = Array.isArray(kit?.items) ? kit.items : [];
    if (!components.length) {
      return { available: 0, limitingItem: "" };
    }

    const componentAvailability = components
      .map((component) => {
        const item = getItem(component.itemId);
        const qtyPerKit = Math.max(1, toNumber(component.qty));
        const stats = item ? getItemAvailabilityForPeriod(item, startDate, endDate) : null;
        return {
          item,
          qtyPerKit,
          possible: stats ? Math.floor(stats.available / qtyPerKit) : 0,
        };
      });

    const limiting = componentAvailability.reduce((lowest, current) => (current.possible < lowest.possible ? current : lowest), componentAvailability[0]);

    return {
      available: Math.max(0, limiting?.possible || 0),
      limitingItem: limiting?.item?.name || "Item removido",
    };
  }

  function getFutureReservationStats(item, today) {
    const futureRentals = state.rentals
      .filter((rental) => rental.status === "reserved" && rental.startDate > today)
      .map((rental) => {
        const qty = (Array.isArray(rental.items) ? rental.items : [])
          .filter((line) => Number(line.itemId) === Number(item.id))
          .reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
        return { rental, qty };
      })
      .filter((entry) => entry.qty > 0);

    if (!futureRentals.length) {
      return { qty: 0, nextDate: "" };
    }

    const dates = uniqueValues(futureRentals.map((entry) => entry.rental.startDate));
    const peakQty = dates.reduce((highest, date) => {
      const usedOnDate = futureRentals
        .filter((entry) => datesOverlap(date, date, entry.rental.startDate, entry.rental.endDate))
        .reduce((sum, entry) => sum + entry.qty, 0);
      return Math.max(highest, usedOnDate);
    }, 0);

    return { qty: peakQty, nextDate: dates[0] || "" };
  }

  function getAvailableForPeriod(item, startDate, endDate, ignoreRentalId = null) {
    const used = getItemPeriodConflicts(item, startDate, endDate, ignoreRentalId)
      .reduce((sum, conflict) => sum + conflict.qty, 0);

    return Math.max(0, (Number(item.totalQty) || 0) - (Number(item.unavailableQty) || 0) - used);
  }

  function getItemPeriodConflicts(item, startDate, endDate, ignoreRentalId = null) {
    if (!item || !startDate || !endDate || endDate < startDate) {
      return [];
    }

    return state.rentals
      .filter((rental) => {
        if (ignoreRentalId && Number(rental.id) === Number(ignoreRentalId)) {
          return false;
        }

        return ACTIVE_STATUSES.includes(rental.status) && datesOverlap(startDate, endDate, rental.startDate, rental.endDate);
      })
      .map((rental) => {
        const qty = (Array.isArray(rental.items) ? rental.items : [])
          .filter((line) => Number(line.itemId) === Number(item.id))
          .reduce((lineSum, line) => lineSum + (Number(line.qty) || 0), 0);
        return { rental, qty };
      })
      .filter((conflict) => conflict.qty > 0);
  }

  function formatPeriodConflictSummary(item, startDate, endDate, ignoreRentalId = null) {
    const conflicts = getItemPeriodConflicts(item, startDate, endDate, ignoreRentalId);
    if (!conflicts.length) {
      return "";
    }

    return conflicts
      .slice(0, 3)
      .map(({ rental, qty }) => {
        const client = getClient(rental.clientId);
        return `${qty} ${item.name} em ${statusLabel(rental.status).toLowerCase()} entre ${formatDate(rental.startDate)} e ${formatDate(rental.endDate)}${client ? ` (${client.name})` : ""}`;
      })
      .join("; ");
  }

  function checkRentalAvailability(rental, ignoreRentalId = null) {
    if (!ACTIVE_STATUSES.includes(rental.status)) {
      return [];
    }

    const requestedByItem = new Map();
    rental.items.forEach((line) => {
      requestedByItem.set(Number(line.itemId), (requestedByItem.get(Number(line.itemId)) || 0) + Number(line.qty || 0));
    });

    const shortages = [];
    requestedByItem.forEach((qty, itemId) => {
      const item = getItem(itemId);
      if (!item) {
        shortages.push(`Item ${itemId} não encontrado.`);
        return;
      }

      const available = getAvailableForPeriod(item, rental.startDate, rental.endDate, ignoreRentalId);
      if (qty > available) {
        const conflicts = formatPeriodConflictSummary(item, rental.startDate, rental.endDate, ignoreRentalId);
        shortages.push(
          `${item.name}: pedido ${qty}, disponível ${available} de ${Number(item.totalQty) || 0} no período.${conflicts ? ` Já existem ${conflicts}.` : ""}`
        );
      }
    });

    return shortages;
  }

  function getCurrentRentalShortages() {
    const startDate = $("#rentalStartDate").value;
    const endDate = $("#rentalEndDate").value;
    if (!startDate || !endDate || endDate < startDate) {
      return [];
    }

    const requestedByItem = new Map();
    state.currentRentalItems.forEach((line) => {
      requestedByItem.set(Number(line.itemId), (requestedByItem.get(Number(line.itemId)) || 0) + Number(line.qty || 0));
    });

    const shortages = [];
    requestedByItem.forEach((qty, itemId) => {
      const item = getItem(itemId);
      if (!item) {
        return;
      }

      const available = getAvailableForPeriod(item, startDate, endDate, state.editingRentalId);
      if (qty > available) {
        const conflicts = formatPeriodConflictSummary(item, startDate, endDate, state.editingRentalId);
        shortages.push(
          `${item.name}: pedido ${qty}, disponível ${available} de ${Number(item.totalQty) || 0} no período.${conflicts ? ` Já existem ${conflicts}.` : ""}`
        );
      }
    });

    return shortages;
  }

  function getRentalTotals(rental) {
    return calculateTotals(
      Array.isArray(rental?.items) ? rental.items : [],
      rental?.discount,
      rental?.freight,
      rental?.deposit,
      rental?.dailyPricing
    );
  }

  function calculateTotals(items, discountValue, freightValue, depositValue, dailyPricing = null) {
    const freightInput = depositValue === undefined ? 0 : freightValue;
    const depositInput = depositValue === undefined ? freightValue : depositValue;
    const dailySubtotal = getDailyPricingSubtotal(dailyPricing);
    const subtotal = dailyPricing?.enabled
      ? dailySubtotal
      : (Array.isArray(items) ? items : []).reduce((sum, line) => sum + toNumber(line.qty) * toNumber(line.unitPrice), 0);
    const discount = Math.min(subtotal, Math.max(0, toNumber(discountValue)));
    const freight = Math.max(0, toNumber(freightInput));
    const total = Math.max(0, roundMoney(subtotal - discount + freight));
    const deposit = Math.min(total, Math.max(0, toNumber(depositInput)));
    const remaining = Math.max(0, roundMoney(total - deposit));
    return { subtotal: roundMoney(subtotal), discount, freight, total, deposit, remaining };
  }

  function openModal(title, content) {
    closeAppMenu();
    $("#modalRoot").innerHTML = `
      <div class="modal-backdrop" data-close-modal="true">
        <section class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
          <div class="modal-head">
            <h2>${escapeHtml(title)}</h2>
            <button class="close-btn" type="button" data-close-modal="true" aria-label="Fechar">×</button>
          </div>
          <div class="modal-body">${content}</div>
        </section>
      </div>
    `;
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    $("#modalRoot").innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  function fillSelect(select, values, allLabel) {
    const previous = select.value;
    select.innerHTML = [`<option value="">${allLabel}</option>`, ...values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`)].join("");
    select.value = values.includes(previous) ? previous : "";
  }

  function getClient(id) {
    return state.clients.find((client) => Number(client.id) === Number(id));
  }

  function getRental(id) {
    return state.rentals.find((rental) => Number(rental.id) === Number(id));
  }

  function isActiveRental(rental) {
    return ACTIVE_STATUSES.includes(rental?.status);
  }

  function sortRentalsByDateDesc(rentals) {
    return [...(Array.isArray(rentals) ? rentals : [])].sort((a, b) => {
      const startCompare = String(b.startDate || "").localeCompare(String(a.startDate || ""));
      if (startCompare) {
        return startCompare;
      }

      const endCompare = String(b.endDate || "").localeCompare(String(a.endDate || ""));
      if (endCompare) {
        return endCompare;
      }

      return Number(b.orderNumber || 0) - Number(a.orderNumber || 0);
    });
  }

  function getRentalStatusBadgeClass(status) {
    if (status === "cancelled") {
      return "red";
    }

    if (status === "returned") {
      return "green";
    }

    if (status === "delivered") {
      return "blue";
    }

    return "yellow";
  }

  function findClientByDocumentDigits(documentDigits) {
    return state.clients.find((client) => onlyDigits(client.document) === documentDigits);
  }

  async function ensureRentalClient(clientDraft, currentClientId = null) {
    const now = new Date().toISOString();
    const documentDigits = onlyDigits(clientDraft.document);
    const existingByDocument = findClientByDocumentDigits(documentDigits);
    const currentClient = currentClientId ? getClient(currentClientId) : null;
    const canReuseCurrent = currentClient && (!onlyDigits(currentClient.document) || onlyDigits(currentClient.document) === documentDigits);
    const target = existingByDocument || (canReuseCurrent ? currentClient : null);

    if (target) {
      const payload = {
        ...target,
        name: clientDraft.name || target.name,
        phone: clientDraft.phone || target.phone || "",
        document: clientDraft.document,
        address: clientDraft.address || target.address || "",
        updatedAt: now,
      };
      await PlanetaDB.put("clients", payload);
      return payload;
    }

    const payload = {
      name: clientDraft.name,
      phone: clientDraft.phone,
      document: clientDraft.document,
      address: clientDraft.address,
      notes: "Criado automaticamente pela locação.",
      createdAt: now,
      updatedAt: now,
    };
    const id = await PlanetaDB.add("clients", payload);
    return { ...payload, id };
  }

  function handleRentalCpfLookup() {
    const cpfInput = $("#rentalClientCpf");
    const documentDigits = onlyDigits(cpfInput.value);
    const info = $("#clientMatchInfo");

    $("#rentalClientId").value = "";
    info.textContent = "";

    if (!documentDigits) {
      return;
    }

    if (!isValidDocument(documentDigits)) {
      info.textContent = getDocumentValidationMessage(documentDigits);
      return;
    }

    cpfInput.value = formatDocument(documentDigits);
    const client = findClientByDocumentDigits(documentDigits);

    if (!client) {
      info.textContent = `${getDocumentLabel(documentDigits)} válido. Um novo cliente será criado ao salvar a locação.`;
      return;
    }

    $("#rentalClientId").value = client.id;
    if (!$("#rentalClientName").value.trim()) {
      $("#rentalClientName").value = client.name || "";
    }
    if (!$("#rentalClientPhone").value.trim()) {
      $("#rentalClientPhone").value = client.phone || "";
    }
    if (!$("#rentalClientAddress").value.trim()) {
      $("#rentalClientAddress").value = client.address || "";
    }
    info.textContent = `Cliente encontrado: ${client.name}`;
  }

  function getItem(id) {
    return state.items.find((item) => Number(item.id) === Number(id));
  }

  function getKit(id) {
    return state.kits.find((kit) => Number(kit.id) === Number(id));
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
  }

  function datesOverlap(startA, endA, startB, endB) {
    return startA <= endB && startB <= endA;
  }

  function getExpenseDate(expense) {
    return expense?.dueDate || expense?.date || "";
  }

  function normalizeExpenseType(expense) {
    if (expense?.expenseType === "investment" || expense?.expenseType === "cost") {
      return expense.expenseType;
    }

    const text = normalize(`${expense?.category || ""} ${expense?.description || ""}`);
    const investmentWords = ["investimento", "equipamento", "mesa", "cadeira", "compra", "material duravel", "inteligencia artificial", "melhoria"];
    return investmentWords.some((word) => text.includes(word)) ? "investment" : "cost";
  }

  function expenseTypeLabel(value) {
    return EXPENSE_TYPE[value] || EXPENSE_TYPE.cost;
  }

  function expenseEffectiveStatus(expense) {
    if (!expense) {
      return "pending";
    }
    return getExpenseSettlement(expense).status;
  }

  function openExpenseDetailsModal(expense) {
    const settlement = getExpenseSettlement(expense);
    openModal("Detalhes do gasto", `
      <div class="rental-detail-modal expense-detail-modal">
        <section class="detail-section">
          <h4>${escapeHtml(expense.description || "Gasto")}</h4>
          <div class="detail-grid">
            <div class="metric"><span>Vencimento</span><strong>${formatDate(getExpenseDate(expense))}</strong></div>
            <div class="metric"><span>Status</span><strong>${EXPENSE_STATUS[settlement.status]}</strong></div>
            <div class="metric"><span>Valor total</span><strong>${formatMoney(settlement.total)}</strong></div>
            <div class="metric"><span>Restante</span><strong>${formatMoney(settlement.remaining)}</strong></div>
            <div class="metric"><span>Pago em dinheiro/Pix</span><strong>${formatMoney(settlement.cashPaid)}</strong></div>
            <div class="metric"><span>Abatimentos comerciais</span><strong>${formatMoney(settlement.offsets)}</strong></div>
          </div>
        </section>
        <section class="detail-section">
          <h4>Linha do tempo</h4>
          ${renderPaymentTimeline("expense", expense)}
        </section>
        <div class="card-actions expense-detail-actions">
          <button class="primary-action" type="button" data-action="register-expense-payment" data-id="${expense.id}">Registrar pagamento</button>
          <button type="button" data-action="open-offset" data-id="${expense.id}">Venda com abatimento</button>
          <button type="button" data-action="edit-expense" data-id="${expense.id}">Editar gasto</button>
        </div>
      </div>
    `);
    $(".expense-detail-actions", $("#modalRoot")).addEventListener("click", (event) => handlePaymentActionClick(event, "expense", expense));
    $(".payment-timeline", $("#modalRoot"))?.addEventListener("click", (event) => handlePaymentActionClick(event, "expense", expense));
  }

  function openRecordPaymentModal(recordType, record, payment = null) {
    const summary = recordType === "expense" ? getExpenseSettlement(record) : getRentalSettlement(record);
    if (!payment && recordType === "expense" && summary.legacyAmount > 0) {
      alert("Este registro ainda usa um status antigo. Abra Revisar pagamentos e crie o lançamento \"Migrado - revisar data\" antes de adicionar outro pagamento.");
      return;
    }
    const amountLimit = payment ? summary.remaining + toNumber(payment.amount) : summary.remaining;
    if (!payment && amountLimit <= 0) {
      alert("Este registro já está quitado.");
      return;
    }
    const title = payment ? "Editar pagamento" : recordType === "rental" ? "Registrar recebimento" : "Registrar pagamento";
    const defaultAmount = payment ? toNumber(payment.amount) : amountLimit;
    openModal(title, `
      <form id="recordPaymentForm" class="form-grid">
          <p class="muted-text wide">${recordType === "rental" ? "Locação" : "Gasto/parcela"}: <strong>${escapeHtml(recordType === "rental" ? `Pedido ${record.orderNumber}` : record.description)}</strong><br>Restante atual: <strong>${formatMoney(amountLimit)}</strong></p>
        <label>
          Valor ${recordType === "rental" ? "recebido" : "pago"}
          <input name="amount" type="text" inputmode="decimal" required value="${escapeAttr(defaultAmount.toFixed(2).replace(".", ","))}">
        </label>
        <label>
          Data real do pagamento
          <input name="date" type="date" required value="${escapeAttr(payment?.date || todayISO())}">
        </label>
        <label>
          Forma de pagamento
          <select name="paymentMethod">
            ${["Pix", "Dinheiro", "Cartão", "Boleto", "Outro"].map((method) => `<option ${method === (payment?.paymentMethod || record.paymentMethod || "Pix") ? "selected" : ""}>${method}</option>`).join("")}
          </select>
        </label>
        <label class="wide">
          Observação
          <textarea name="notes" rows="3">${escapeHtml(payment?.notes || "")}</textarea>
        </label>
        <div class="form-actions wide">
          <button class="secondary-action" type="button" data-close-modal="true">Cancelar</button>
          <button class="primary-action" type="submit">${payment ? "Salvar alteração" : "Registrar"}</button>
        </div>
      </form>
    `);
    $("#recordPaymentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const amount = parseMoneyValue(form.amount.value);
      if (!amount || amount <= 0 || amount > amountLimit + 0.005 || !form.date.value) {
        alert(`Informe um valor válido de até ${formatMoney(amountLimit)} e uma data.`);
        return;
      }
      const now = new Date().toISOString();
      const payload = {
        ...(payment || {}),
        recordType,
        recordId: Number(record.id),
        recordKey: `${recordType}:${record.id}`,
        kind: recordType === "rental" ? "rental-receipt" : "expense-payment",
        direction: recordType === "rental" ? "inflow" : "outflow",
        amount: roundMoney(amount),
        date: form.date.value,
        paymentMethod: form.paymentMethod.value,
        notes: form.notes.value.trim(),
        createdAt: payment?.createdAt || now,
        updatedAt: now,
        reconciliationStatus: payment?.reconciliationStatus || "unmatched",
        bankTransactionId: payment?.bankTransactionId || null,
        inventoryLines: payment?.inventoryLines || [],
        preservesLegacyDeposit: payment?.preservesLegacyDeposit || (!payment && recordType === "rental" && summary.legacyType === "deposit"),
      };
      if (payment) {
        await PlanetaDB.put("payments", payload);
      } else {
        delete payload.id;
        await PlanetaDB.add("payments", payload);
      }
      await loadAll();
      const freshRecord = recordType === "expense" ? getExpense(record.id) : getRental(record.id);
      if (freshRecord) await syncRecordPaymentStatus(recordType, freshRecord);
      closeModal();
      await loadAll();
      refreshAll();
      showToast(payment ? "Pagamento atualizado." : "Pagamento registrado.");
    });
  }

  async function syncRecordPaymentStatus(recordType, record) {
    const now = new Date().toISOString();
    if (recordType === "expense") {
      const fresh = await PlanetaDB.get("expenses", Number(record.id));
      if (!fresh) return;
      const summary = getExpenseSettlement({ ...fresh, id: record.id });
      await PlanetaDB.put("expenses", { ...fresh, status: summary.status, paidAt: summary.status === "paid" ? now : "", updatedAt: now });
      return;
    }
    const fresh = await PlanetaDB.get("rentals", Number(record.id));
    if (!fresh) return;
    const summary = getRentalSettlement({ ...fresh, id: record.id });
    await PlanetaDB.put("rentals", { ...fresh, paymentStatus: summary.status, paymentReceivedAt: summary.status === "paid" ? now : "", updatedAt: now });
  }

  function handlePaymentActionClick(event, recordType, record) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "register-expense-payment") {
      openRecordPaymentModal("expense", record);
    } else if (button.dataset.action === "open-offset") {
      openSupplierOffsetModal(record);
    } else if (button.dataset.action === "edit-expense") {
      openExpenseModal(record);
    } else if (button.dataset.action === "edit-payment") {
      const payment = state.payments.find((entry) => Number(entry.id) === Number(button.dataset.paymentId));
      if (payment?.kind === "supplier-offset-sale") openSupplierOffsetModal(getExpense(payment.recordId), payment);
      else if (payment) openRecordPaymentModal(recordType, record, payment);
    } else if (button.dataset.action === "delete-payment") {
      const payment = state.payments.find((entry) => Number(entry.id) === Number(button.dataset.paymentId));
      if (payment) deletePayment(payment);
    }
  }

  function openSupplierOffsetModal(preselectedExpense = null, existingPayment = null) {
    if (!state.items.length) {
      alert("Cadastre o item vendido no estoque antes de registrar o abatimento.");
      return;
    }
    const openExpenses = state.expenses.filter((expense) => getExpenseSettlement(expense).remaining > 0 || Number(expense.id) === Number(preselectedExpense?.id));
    if (!openExpenses.length) {
      alert("Cadastre ou mantenha uma dívida/parcela pendente para aplicar o abatimento.");
      return;
    }
    const firstItem = existingPayment?.inventoryLines?.[0] || {};
    openModal(existingPayment ? "Editar abatimento comercial" : "Venda com abatimento ao fornecedor", `
      <form id="supplierOffsetForm" class="form-grid">
        <p class="muted-text wide">Esta venda reduz uma dívida, mas não entra como Pix, dinheiro em caixa ou entrada bancária.</p>
        <label>
          Produto vendido
          <select name="itemId">
            ${state.items.map((item) => `<option value="${item.id}" ${Number(item.id) === Number(firstItem.itemId) ? "selected" : ""}>${escapeHtml(item.name)} (${getSafeSaleAvailability(item)} livres para venda)</option>`).join("")}
          </select>
        </label>
        <label>
          Quantidade vendida
          <input name="qty" type="number" min="1" inputmode="numeric" required value="${escapeAttr(firstItem.qty || 1)}">
        </label>
        <label>
          Valor total da venda
          <input name="amount" type="text" inputmode="decimal" required value="${escapeAttr((existingPayment?.amount || "").toString().replace(".", ","))}">
        </label>
        <label>
          Data da venda
          <input name="date" type="date" required value="${escapeAttr(existingPayment?.date || todayISO())}">
        </label>
        <label>
          Dívida ou parcela a abater
          <select name="expenseId">
            ${openExpenses.map((expense) => `<option value="${expense.id}" ${Number(expense.id) === Number(preselectedExpense?.id || existingPayment?.recordId) ? "selected" : ""}>${escapeHtml(expense.description)} · restante ${formatMoney(getExpenseSettlement(expense).remaining)}</option>`).join("")}
          </select>
        </label>
        <label>
          Fornecedor
          <input name="supplier" type="text" value="${escapeAttr(existingPayment?.supplier || preselectedExpense?.supplier || "")}" placeholder="Ex.: fornecedor da compra">
        </label>
        <label>
          Cliente/comprador
          <input name="buyer" type="text" value="${escapeAttr(existingPayment?.buyer || "")}" placeholder="Opcional">
        </label>
        <label>
          Custo de aquisição por unidade
          <input name="unitCost" type="text" inputmode="decimal" value="${escapeAttr((firstItem.unitCost || "").toString().replace(".", ","))}" placeholder="Opcional">
        </label>
        <label class="wide">
          Observação
          <textarea name="notes" rows="3">${escapeHtml(existingPayment?.notes || "")}</textarea>
        </label>
        <div class="form-actions wide">
          <button class="secondary-action" type="button" data-close-modal="true">Cancelar</button>
          <button class="primary-action" type="submit">${existingPayment ? "Salvar abatimento" : "Registrar venda com abatimento"}</button>
        </div>
      </form>
    `);
    $("#supplierOffsetForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const item = getItem(Number(form.itemId.value));
      const expense = state.expenses.find((entry) => Number(entry.id) === Number(form.expenseId.value));
      const qty = Math.max(0, Math.floor(toNumber(form.qty.value)));
      const amount = parseMoneyValue(form.amount.value);
      const unitCost = Math.max(0, parseMoneyValue(form.unitCost.value));
      const previousQty = existingPayment?.inventoryLines?.[0]?.itemId === item?.id ? toNumber(existingPayment.inventoryLines[0].qty) : 0;
      const available = getSafeSaleAvailability(item) + previousQty;
      const previousAmount = existingPayment && Number(existingPayment.recordId) === Number(expense?.id) ? toNumber(existingPayment.amount) : 0;
      const debtRemaining = getExpenseSettlement(expense).remaining + previousAmount;
      if (!item || !expense || !qty || !amount || !form.date.value || qty > available) {
        alert(`Confira os dados. Para ${item?.name || "este item"}, há ${available} unidade(s) que podem ser vendidas sem afetar locações.`);
        return;
      }
      if (amount > debtRemaining + 0.005) {
        alert(`O abatimento não pode ser maior que o restante desta dívida: ${formatMoney(debtRemaining)}.`);
        return;
      }
      const now = new Date().toISOString();
      if (existingPayment) {
        await restoreOffsetInventory(existingPayment);
      }
      await PlanetaDB.put("items", { ...item, totalQty: Math.max(0, toNumber(item.totalQty) - qty), updatedAt: now });
      const payload = {
        ...(existingPayment || {}),
        recordType: "expense",
        recordId: Number(expense.id),
        recordKey: `expense:${expense.id}`,
        kind: "supplier-offset-sale",
        direction: "non-cash-offset",
        amount: roundMoney(amount),
        date: form.date.value,
        paymentMethod: "Compensado com fornecedor",
        supplier: form.supplier.value.trim(),
        buyer: form.buyer.value.trim(),
        notes: form.notes.value.trim(),
        inventoryLines: [{ itemId: item.id, name: item.name, qty, unitCost }],
        profit: unitCost ? roundMoney(amount - unitCost * qty) : null,
        createdAt: existingPayment?.createdAt || now,
        updatedAt: now,
        reconciliationStatus: "not-applicable",
        bankTransactionId: null,
      };
      if (existingPayment) await PlanetaDB.put("payments", payload);
      else { delete payload.id; await PlanetaDB.add("payments", payload); }
      await loadAll();
      const freshExpense = getExpense(expense.id);
      if (freshExpense) await syncRecordPaymentStatus("expense", freshExpense);
      await loadAll();
      closeModal();
      refreshAll();
      showToast("Venda compensada com a dívida e estoque atualizado.");
    });
  }

  async function restoreOffsetInventory(payment) {
    for (const line of Array.isArray(payment.inventoryLines) ? payment.inventoryLines : []) {
      const item = getItem(line.itemId) || await PlanetaDB.get("items", Number(line.itemId));
      if (item) {
        await PlanetaDB.put("items", { ...item, totalQty: toNumber(item.totalQty) + toNumber(line.qty), updatedAt: new Date().toISOString() });
      }
    }
  }

  async function deletePayment(payment) {
    const isOffset = payment.kind === "supplier-offset-sale";
    if (!confirm(`${isOffset ? "Excluir este abatimento e restaurar o estoque vendido" : "Excluir este pagamento"}?`)) return;
    if (isOffset) await restoreOffsetInventory(payment);
    await PlanetaDB.remove("payments", Number(payment.id));
    await loadAll();
    const record = payment.recordType === "expense" ? getExpense(payment.recordId) : getRental(payment.recordId);
    if (record && (payment.migrationStatus === "needs-review" || !getRecordPayments(payment.recordType, record.id).length)) {
      const cleared = payment.recordType === "expense"
        ? { ...record, status: "pending", paidAt: "", updatedAt: new Date().toISOString() }
        : { ...record, paymentStatus: getRentalSettlement(record).status, paymentReceivedAt: "", updatedAt: new Date().toISOString() };
      await PlanetaDB.put(payment.recordType === "expense" ? "expenses" : "rentals", cleared);
    } else if (record) {
      await syncRecordPaymentStatus(payment.recordType, record);
    }
    await loadAll();
    closeModal();
    refreshAll();
    showToast(isOffset ? "Abatimento excluído e estoque restaurado." : "Pagamento excluído.");
  }

  function getExpense(id) {
    return state.expenses.find((expense) => Number(expense.id) === Number(id));
  }

  function financeTypeForExpense(expense) {
    const status = expenseEffectiveStatus(expense);
    if (status === "paid") {
      return "paid-expense";
    }

    if ((expense.kind || "manual") === "installment" && status === "pending") {
      return "future-expense";
    }

    return "pending-expense";
  }

  function isRentalFinancialEntry(rental) {
    return rental && !["quote", "cancelled"].includes(rental.status);
  }

  function addMonthsToISODate(value, monthsToAdd) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1 + monthsToAdd, day || 1);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }

  function statusLabel(status) {
    return RENTAL_STATUS[status] || status || "-";
  }

  function todayISO() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  }

  function addDaysToISODate(value, daysToAdd) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day || 1);
    date.setDate(date.getDate() + daysToAdd);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }

  function getRelativeDateLabel(value) {
    const today = todayISO();
    if (value === today) {
      return "Hoje";
    }

    if (value === addDaysToISODate(today, 1)) {
      return "Amanhã";
    }

    return "Depois de amanhã";
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  function formatFinanceMonth(value) {
    const [year, month] = String(value || "").split("-").map(Number);
    if (!year || !month) {
      return "mês selecionado";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(new Date(year, month - 1, 1));
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function formatMoney(value) {
    return moneyFormatter.format(toNumber(value));
  }

  function parseMoneyValue(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    let text = String(value ?? "").trim().replace(/\s/g, "");
    if (!text) return 0;
    if (/[^\d,.-]/.test(text)) return NaN;
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
    } else if (comma >= 0) {
      text = text.replace(",", ".");
    }
    const decimals = text.includes(".") ? text.split(".")[1] : "";
    if (decimals.length > 2 || (text.match(/\./g) || []).length > 1) return NaN;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function toNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function roundMoney(value) {
    return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCpf(value) {
    const digits = onlyDigits(value);
    if (digits.length !== 11) {
      return digits;
    }

    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  function formatCnpj(value) {
    const digits = onlyDigits(value).slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  function formatDocument(value) {
    const digits = onlyDigits(value).slice(0, 14);
    if (digits.length > 11) {
      return formatCnpj(digits);
    }

    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1-$2");
  }

  function getDocumentLabel(value) {
    return onlyDigits(value).length === 14 ? "CNPJ" : "CPF";
  }

  function getDocumentValidationMessage(value) {
    const digits = onlyDigits(value);
    if (digits.length === 11) {
      return "CPF inválido. Confira os dígitos verificadores.";
    }
    if (digits.length === 14) {
      return "CNPJ inválido. Confira os dígitos verificadores.";
    }
    return "Informe 11 dígitos para CPF ou 14 dígitos para CNPJ.";
  }

  function isValidDocument(value) {
    const digits = onlyDigits(value);
    return digits.length === 11 ? isValidCpf(digits) : digits.length === 14 ? isValidCnpj(digits) : false;
  }

  function isValidCpf(value) {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
      return false;
    }

    let sum = 0;
    for (let index = 0; index < 9; index += 1) {
      sum += Number(cpf[index]) * (10 - index);
    }
    let firstDigit = (sum * 10) % 11;
    if (firstDigit === 10) {
      firstDigit = 0;
    }
    if (firstDigit !== Number(cpf[9])) {
      return false;
    }

    sum = 0;
    for (let index = 0; index < 10; index += 1) {
      sum += Number(cpf[index]) * (11 - index);
    }
    let secondDigit = (sum * 10) % 11;
    if (secondDigit === 10) {
      secondDigit = 0;
    }

    return secondDigit === Number(cpf[10]);
  }

  function isValidCnpj(value) {
    const cnpj = onlyDigits(value);
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
      return false;
    }

    const calculateDigit = (digits, weights) => {
      const sum = digits.split("").reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };

    const first = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = calculateDigit(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return first === Number(cnpj[12]) && second === Number(cnpj[13]);
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };
      return map[char];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function registerServiceWorker() {
    const isLocalhost = ["localhost", "127.0.0.1", ""].includes(location.hostname);
    if (!("serviceWorker" in navigator) || !(location.protocol === "https:" || isLocalhost)) {
      return;
    }

    navigator.serviceWorker.register("service-worker.js").catch((error) => {
      console.warn("Falha ao registrar service worker", error);
    });
  }

  function setupInstallPrompt() {
    const installBtn = $("#installBtn");

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      installBtn.hidden = false;
    });

    installBtn.addEventListener("click", async () => {
      if (!state.deferredInstallPrompt) {
        return;
      }

      state.deferredInstallPrompt.prompt();
      await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      installBtn.hidden = true;
    });
  }
})();

