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
  };
  const DASHBOARD_STATUS_ORDER = ["reserved", "delivered", "returned", "cancelled"];
  const CONTRACT_TEMPLATE_URL = "contrato_aluguel_planeta_locacoes_template.html?v=22";
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
    clients: [],
    rentals: [],
    expenses: [],
    kits: [],
    currentRentalItems: [],
    editingRentalId: null,
    deferredInstallPrompt: null,
    contractTemplate: null,
    stockViewMode: "detailed",
    dailyPricingEnabled: false,
    dailyPricingRows: [],
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

    $$("[data-shortcut-view]").forEach((button) => {
      button.addEventListener("click", () => showView(button.dataset.shortcutView));
    });

    $("#newItemBtn").addEventListener("click", () => openItemModal());
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
    $("#clientsSearch").addEventListener("input", renderClients);
    $("#rentalsSearch").addEventListener("input", renderRentals);
    $("#rentalStatusFilter").addEventListener("change", renderRentals);
    $("#rentalDateFilter").addEventListener("change", renderRentals);
    $("#expenseSearch").addEventListener("input", renderExpenses);
    $("#expenseTypeFilter").addEventListener("change", renderExpenses);
    $("#expenseStatusFilter").addEventListener("change", renderExpenses);
    $("#expenseCategoryFilter").addEventListener("change", renderExpenses);
    $("#financeStartFilter").addEventListener("change", renderFinance);
    $("#financeEndFilter").addEventListener("change", renderFinance);
    $("#financeMonthFilter").addEventListener("change", renderFinance);
    $("#financeYearFilter").addEventListener("input", renderFinance);
    $("#financeTypeFilter").addEventListener("change", renderFinance);
    $("#financeCategoryFilter").addEventListener("change", renderFinance);

    $("#inventorySummary").addEventListener("click", handleItemSurfaceClick);
    $("#inventorySummary").addEventListener("keydown", handleItemSurfaceKeydown);
    $("#dashboardStatusBoards").addEventListener("click", handleDashboardStatusClick);
    $("#dashboardStatusBoards").addEventListener("keydown", handleDashboardStatusKeydown);
    $("#stockList").addEventListener("click", handleStockClick);
    $("#stockList").addEventListener("keydown", handleItemSurfaceKeydown);
    $("#kitsList").addEventListener("click", handleKitClick);
    $("#clientsList").addEventListener("click", handleClientClick);
    $("#rentalsList").addEventListener("click", handleRentalClick);
    $("#rentalsList").addEventListener("keydown", handleRentalKeydown);
    $("#expenseList").addEventListener("click", handleExpenseClick);
    $("#financeList").addEventListener("click", handleFinanceClick);

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
      $("#rentalClientId").value = "";
      $("#clientMatchInfo").textContent = "";
    });

    $("#exportBackupBtn").addEventListener("click", exportBackup);
    $("#importBackupInput").addEventListener("change", importBackup);
    $("#clearStockBtn").addEventListener("click", clearStockData);
    $("#clearDataBtn").addEventListener("click", clearAllData);
    $("#newExpenseBtn").addEventListener("click", () => openExpenseModal());
    $("#newInstallmentBtn").addEventListener("click", () => openInstallmentModal());

    $("#modalRoot").addEventListener("click", (event) => {
      if (event.target.dataset.closeModal === "true") {
        closeModal();
      }
    });
  }

  async function loadAll() {
    const [items, clients, rentals, expenses, kits] = await Promise.all([
      PlanetaDB.getAll("items"),
      PlanetaDB.getAll("clients"),
      PlanetaDB.getAll("rentals"),
      PlanetaDB.getAll("expenses"),
      PlanetaDB.getAll("kits"),
    ]);

    state.items = items.sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
    state.clients = clients.sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
    state.rentals = rentals.sort((a, b) => Number(b.orderNumber) - Number(a.orderNumber));
    state.expenses = expenses.map(normalizeStoredExpense).sort((a, b) => String(getExpenseDate(b)).localeCompare(String(getExpenseDate(a))));
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
    renderExpenseFilters();
    renderExpenses();
    renderFinanceFilters();
    renderFinance();
    renderBackup();
  }

  function showView(viewName) {
    $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
    $$(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
    if (viewName === "expenses") {
      renderExpenses();
    }
    if (viewName === "finance") {
      renderFinance();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderDashboard() {
    const activeRentals = state.rentals.filter(isActiveRental);
    const scheduleEntries = getScheduleEntries(3);
    const upcomingStarts = scheduleEntries.filter((entry) => entry.actionType === "start").length;
    const upcomingEnds = scheduleEntries.filter((entry) => entry.actionType === "end").length;
    const receivable = state.rentals
      .filter((rental) => !["returned", "cancelled"].includes(rental.status) && rental.paymentStatus !== "paid")
      .reduce((sum, rental) => sum + getRentalTotals(rental).remaining, 0);
    const availableUnits = state.items.reduce((sum, item) => sum + getItemStats(item).availableToday, 0);

    $("#dashboardStats").innerHTML = [
      ["Locações ativas", activeRentals.length],
      ["Entregar/retirar 3 dias", upcomingStarts],
      ["Buscar/devolver 3 dias", upcomingEnds],
      ["Valor a receber", formatMoney(receivable)],
      ["Itens disponíveis", availableUnits],
    ]
      .map(([label, value]) => `<article class="kpi-card"><span>${label}</span><strong>${value}</strong></article>`)
      .join("");

    $("#todayList").innerHTML = renderUpcomingAgenda(scheduleEntries);
    $("#reservationReminders").innerHTML = renderReservationReminders(scheduleEntries);
    $("#dashboardAlerts").innerHTML = renderAlerts();
    $("#dashboardStatusBoards").innerHTML = renderDashboardStatusBoards();
    $("#inventorySummary").innerHTML = state.items.length
      ? state.items
          .slice(0, 12)
          .map((item) => {
            const stats = getItemStats(item);
            return `
              <div class="inventory-pill clickable-item" role="button" tabindex="0" data-item-id="${item.id}">
                <div>
                  <strong>${escapeHtml(item.name)}</strong>
                  <span>${escapeHtml(item.category || "Sem categoria")}${item.color ? ` · ${escapeHtml(item.color)}` : ""}</span>
                </div>
                  <strong>${stats.availableToday}</strong>
              </div>
            `;
          })
          .join("")
      : emptyState("Cadastre os primeiros itens para ver a disponibilidade.");
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

  function renderAlerts() {
    const alerts = state.items
      .map((item) => ({ item, stats: getItemStats(item) }))
      .filter(({ stats }) => stats.availableToday <= 2 || stats.unavailable > 0)
      .slice(0, 10);

    if (!alerts.length) {
      return emptyState("Nenhum alerta de estoque no momento.");
    }

    return alerts
      .map(({ item, stats }) => `
        <div class="compact-item">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${stats.availableToday <= 2 ? "Disponibilidade baixa hoje" : "Tem item indisponível"}</span>
          </div>
          <span>${stats.availableToday} hoje</span>
        </div>
      `)
      .join("");
  }

  function renderDashboardStatusBoards() {
    return DASHBOARD_STATUS_ORDER.map((status) => {
      const rentals = sortRentalsByDateDesc(state.rentals.filter((rental) => rental.status === status)).slice(0, 10);
      return `
        <section class="status-board">
          <button class="status-board-title" type="button" data-dashboard-status="${status}">
            <span>${statusLabel(status)}</span>
            <small>Ver todas</small>
          </button>
          <div class="compact-list">
            ${rentals.length ? rentals.map(renderDashboardStatusRental).join("") : emptyState("Nenhuma locacao neste status.")}
          </div>
        </section>
      `;
    }).join("");
  }

  function renderDashboardStatusRental(rental) {
    const client = getClient(rental.clientId);
    const totals = getRentalTotals(rental);
    return `
      <div class="compact-item status-rental-item clickable-item" role="button" tabindex="0" data-rental-id="${rental.id}">
        <div>
          <strong>${escapeHtml(client?.name || "Cliente nao encontrado")}</strong>
          <span>${formatDate(rental.startDate)} ate ${formatDate(rental.endDate)}</span>
        </div>
        <span>${formatMoney(totals.total)}</span>
      </div>
    `;
  }

  function handleDashboardStatusClick(event) {
    const statusButton = event.target.closest("[data-dashboard-status]");
    if (statusButton) {
      $("#rentalStatusFilter").value = statusButton.dataset.dashboardStatus;
      $("#rentalDateFilter").value = "";
      renderRentals();
      showView("rentals");
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

  function handleDashboardStatusKeydown(event) {
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

  function renderStockFilters() {
    fillSelect($("#stockCategoryFilter"), uniqueValues(state.items.map((item) => item.category)), "Todas");
    fillSelect($("#stockColorFilter"), uniqueValues(state.items.map((item) => item.color).filter(Boolean)), "Todas");
  }

  function renderStock() {
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
          <div class="metric"><span>Disponível hoje</span><strong>${stats.availableToday}</strong></div>
          <div class="metric"><span>Reservado hoje</span><strong>${stats.reservedToday}</strong></div>
          <div class="metric"><span>Alugado hoje</span><strong>${stats.rentedToday}</strong></div>
          <div class="metric"><span>Reservado futuro</span><strong>${stats.futureReserved}</strong></div>
          <div class="metric"><span>Próxima reserva</span><strong>${stats.nextReservationDate ? formatDate(stats.nextReservationDate) : "-"}</strong></div>
          <div class="metric"><span>Devolvido</span><strong>${stats.returned}</strong></div>
          <div class="metric"><span>Indisponível</span><strong>${stats.unavailable}</strong></div>
        </div>
        <p class="muted-text">Valor padrão: <strong>${formatMoney(item.defaultPrice || 0)}</strong></p>
        <div class="card-actions">
          <button type="button" data-action="edit-item" data-id="${item.id}">Editar</button>
          <button type="button" class="danger-mini" data-action="delete-item" data-id="${item.id}">Excluir</button>
        </div>
      </article>
    `;
  }

  function renderKits() {
    $("#kitsList").innerHTML = state.kits.length ? state.kits.map(renderKitCard).join("") : emptyState("Cadastre conjuntos para lançar locações mais rápido.");
  }

  function renderKitCard(kit) {
    const components = Array.isArray(kit.items) ? kit.items : [];
    const componentText = components.length
      ? components
          .map((component) => {
            const item = getItem(component.itemId);
            return `${escapeHtml(component.qty)}x ${escapeHtml(item?.name || component.name || "Item removido")}`;
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
          ${client.document ? `Documento: ${escapeHtml(client.document)}<br>` : ""}
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
      container.innerHTML = emptyState("Adicione itens ou conjuntos para configurar as diarias.");
      return;
    }

    const startDate = $("#rentalStartDate").value;
    const endDate = $("#rentalEndDate").value;
    if (!startDate || !endDate || endDate < startDate) {
      container.innerHTML = emptyState("Escolha datas validas para configurar a cobranca por dias.");
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
                      <button type="button" data-action="copy-daily-price" data-row-index="${rowIndex}" data-day-index="${dayIndex}">Aplicar proximos</button>
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
        <span>Desative dias que nao serao cobrados ou ajuste os valores manualmente.</span>
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
      <div class="totals-row"><span>Sinal</span><strong>${formatMoney(totals.deposit)}</strong></div>
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
      rental.orderNumber = existing.orderNumber;
      rental.createdAt = existing.createdAt;
      rental.returnProblems = existing.returnProblems || [];
      rental.updatedAt = now;
      await PlanetaDB.put("rentals", rental);
      showToast(`Locação ${rental.orderNumber} atualizada.`);
    } else {
      delete rental.id;
      rental.orderNumber = await PlanetaDB.nextOrderNumber();
      rental.createdAt = now;
      rental.updatedAt = now;
      rental.returnProblems = [];
      await PlanetaDB.add("rentals", rental);
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
    const cpfDigits = onlyDigits(clientCpf);
    const orderDate = $("#rentalOrderDate").value;
    const startDate = $("#rentalStartDate").value;
    const endDate = $("#rentalEndDate").value;

    if (!clientName) {
      $("#rentalClientName").focus();
      alert("Informe o nome do cliente.");
      return null;
    }

    if (!isValidCpf(clientCpf)) {
      $("#clientMatchInfo").textContent = "CPF inválido. Confira os 11 dígitos antes de salvar a locação.";
      $("#rentalClientCpf").focus();
      alert("Informe um CPF válido para continuar a locação. O CPF precisa ter 11 dígitos e dígitos verificadores corretos.");
      return null;
    }

    $("#rentalClientCpf").value = formatCpf(cpfDigits);

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
        document: formatCpf(cpfDigits),
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
          <h3>${escapeHtml(client?.name || "Cliente nao encontrado")}</h3>
          <p>${formatDate(rental.startDate)} ate ${formatDate(rental.endDate)}</p>
          <span class="badge ${statusClass}">Status: ${statusLabel(rental.status)}</span>
        </div>
      </article>
    `;
  }

  function renderRentalCard(rental) {
    const client = getClient(rental.clientId);
    const totals = getRentalTotals(rental);
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
            <span class="badge">${PAYMENT_STATUS[rental.paymentStatus] || rental.paymentStatus}</span>
          </div>
        </div>
        <div class="metric-grid">
          <div class="metric"><span>Total final</span><strong>${formatMoney(totals.total)}</strong></div>
          <div class="metric"><span>Frete</span><strong>${formatMoney(totals.freight)}</strong></div>
          <div class="metric"><span>Sinal</span><strong>${formatMoney(totals.deposit)}</strong></div>
          <div class="metric"><span>Restante</span><strong>${formatMoney(totals.remaining)}</strong></div>
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
            <p class="card-subtitle">${escapeHtml(client?.name || "Cliente nao encontrado")} - ${formatDate(rental.startDate)} ate ${formatDate(rental.endDate)}</p>
          </div>
          <div class="badge-row">
            <span class="badge ${statusClass}">${statusLabel(rental.status)}</span>
            <span class="badge">${PAYMENT_STATUS[rental.paymentStatus] || rental.paymentStatus || "-"}</span>
          </div>
        </div>

        <section class="detail-section">
          <h4>Dados do cliente</h4>
          <div class="detail-grid">
            <div class="metric"><span>Nome</span><strong>${escapeHtml(client?.name || "-")}</strong></div>
            <div class="metric"><span>CPF/CNPJ</span><strong>${escapeHtml(client?.document || "-")}</strong></div>
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
            <div class="metric"><span>Sinal</span><strong>${formatMoney(totals.deposit)}</strong></div>
            <div class="metric"><span>Restante</span><strong>${formatMoney(totals.remaining)}</strong></div>
          </div>
        </section>

        ${rental.dailyPricing?.enabled ? `<p class="muted-text"><strong>Cobranca por dias ativa:</strong> subtotal ${formatMoney(totals.subtotal)}</p>` : ""}
        ${kitSummary.length ? `<p class="muted-text"><strong>Conjuntos:</strong><br>${kitSummary.map((line) => `${escapeHtml(line.qty)}x ${escapeHtml(line.name)}`).join("<br>")}</p>` : ""}
        <p class="muted-text"><strong>Itens alugados:</strong><br>${items || "Sem itens"}</p>
        ${rental.notes ? `<p class="muted-text"><strong>Observacoes:</strong><br>${escapeHtml(rental.notes)}</p>` : ""}
        ${returnProblems ? `<p class="muted-text"><strong>Itens com problema na devolucao:</strong><br>${returnProblems}</p>` : ""}

        <div class="card-actions rental-detail-actions">
          <button type="button" data-action="receipt-rental" data-id="${rental.id}">Gerar contrato</button>
          <button type="button" data-action="edit-rental" data-id="${rental.id}">Editar</button>
          <button type="button" data-action="mark-delivered" data-id="${rental.id}">Marcar entregue</button>
          <button type="button" data-action="mark-returned" data-id="${rental.id}">Marcar devolvida</button>
          <button type="button" data-action="cancel-rental" data-id="${rental.id}">Cancelar</button>
          <button type="button" class="danger-mini" data-action="delete-rental" data-id="${rental.id}">Excluir</button>
        </div>
      </div>
    `;
  }

  function openRentalDetailsModal(rental) {
    openModal("Detalhes da locacao", renderRentalDetailsContent(rental));
    $(".rental-detail-actions", $("#modalRoot")).addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      await handleRentalAction(button.dataset.action, rental, true);
    });
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

  function openItemDetailsModal(item) {
    const stats = getItemStats(item);
    const rentals = getItemRentalHistory(item.id);
    const rentalsHtml = rentals.length
      ? rentals
          .map(({ rental, qty }) => {
            const client = getClient(rental.clientId);
            return `
              <div class="compact-item item-history-row">
                <div>
                  <strong>Pedido ${escapeHtml(rental.orderNumber || "-")} - ${escapeHtml(client?.name || "Cliente nao encontrado")}</strong>
                  <span>${formatDate(rental.startDate)} a ${formatDate(rental.endDate)} - ${escapeHtml(qty)} unidade(s)</span>
                  <span>Status: ${statusLabel(rental.status)} - Pagamento: ${PAYMENT_STATUS[rental.paymentStatus] || rental.paymentStatus || "-"}</span>
                </div>
                <span>${formatMoney(getRentalTotals(rental).total)}</span>
              </div>
            `;
          })
          .join("")
      : emptyState("Nenhuma locacao encontrada para este item.");

    openModal(`Detalhes do item`, `
      <div class="item-detail-modal">
        <div class="item-detail-tabs" role="tablist" aria-label="Detalhes do item">
          <button class="tab-btn active" type="button" data-item-tab="info" aria-selected="true">Informacoes</button>
          <button class="tab-btn" type="button" data-item-tab="stock" aria-selected="false">Estoque</button>
          <button class="tab-btn" type="button" data-item-tab="rentals" aria-selected="false">Locacoes</button>
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
          <div class="metric-grid">
            <div class="metric"><span>Total cadastrado</span><strong>${stats.total}</strong></div>
            <div class="metric"><span>Disponivel hoje</span><strong>${stats.availableToday}</strong></div>
            <div class="metric"><span>Reservado hoje</span><strong>${stats.reservedToday}</strong></div>
            <div class="metric"><span>Alugado/entregue hoje</span><strong>${stats.rentedToday}</strong></div>
            <div class="metric"><span>Reservado em datas futuras</span><strong>${stats.futureReserved}</strong></div>
            <div class="metric"><span>Proxima reserva</span><strong>${stats.nextReservationDate ? formatDate(stats.nextReservationDate) : "-"}</strong></div>
            <div class="metric"><span>Indisponivel</span><strong>${stats.unavailable}</strong></div>
            <div class="metric"><span>Devolvido</span><strong>${stats.returned}</strong></div>
          </div>
        </section>

        <section class="item-tab-panel hidden" data-item-tab-panel="rentals">
          <div class="compact-list">${rentalsHtml}</div>
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
          <input name="document" type="text" value="${escapeAttr(client?.document || "")}">
        </label>
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

    $("#clientForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const now = new Date().toISOString();
      const payload = {
        id: client?.id,
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        document: form.document.value.trim(),
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

      openModal("Contrato de aluguel", `
        <div class="contract-preview-wrap">
          <iframe id="contractPreviewFrame" class="contract-frame" title="Prévia do contrato de aluguel"></iframe>
        </div>
        <div class="form-actions no-print">
          <button class="secondary-action" type="button" data-close-modal="true">Fechar</button>
          <button class="primary-action" type="button" id="printReceiptBtn">Gerar PDF / imprimir</button>
          <button class="primary-action red" type="button" id="shareReceiptBtn">Compartilhar resumo</button>
        </div>
      `);

      const frame = $("#contractPreviewFrame");
      frame.srcdoc = contractHtml;
      $("#printReceiptBtn").addEventListener("click", () => printContractFrame(frame));
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
    const valorTotal = totals.total;
    const sinal = totals.deposit;
    const restante = totals.remaining;
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

  function printContractFrame(frame) {
    if (!frame?.contentWindow) {
      alert("A prévia do contrato ainda não carregou. Tente novamente em alguns segundos.");
      return;
    }

    frame.contentWindow.focus();
    frame.contentWindow.print();
  }

  async function shareReceipt(rental, client) {
    const totals = getRentalTotals(rental);
    const text = [
      "Contrato de aluguel - Planeta Locações",
      `Pedido ${rental.orderNumber}`,
      `Cliente: ${client?.name || "-"}`,
      `Período: ${formatDate(rental.startDate)} a ${formatDate(rental.endDate)}`,
      `Subtotal dos itens: ${formatMoney(totals.subtotal)}`,
      `Frete: ${formatMoney(totals.freight)}`,
      `Total: ${formatMoney(totals.total)}`,
      `Sinal: ${formatMoney(totals.deposit)}`,
      `Restante: ${formatMoney(totals.remaining)}`,
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

  function renderExpenseFilters() {
    fillSelect($("#expenseCategoryFilter"), uniqueValues(state.expenses.map((expense) => expense.category || "Sem categoria")), "Todas");
  }

  function renderExpenses() {
    const expenses = state.expenses.filter(isExpenseInExpenseFilters);
    const paidTotal = expenses
      .filter((expense) => expenseEffectiveStatus(expense) === "paid")
      .reduce((sum, expense) => sum + toNumber(expense.amount), 0);
    const pendingTotal = expenses
      .filter((expense) => expenseEffectiveStatus(expense) !== "paid")
      .reduce((sum, expense) => sum + toNumber(expense.amount), 0);
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
    const status = expenseEffectiveStatus(expense);
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
          <div class="metric"><span>Valor</span><strong>${formatMoney(expense.amount)}</strong></div>
          <div class="metric"><span>Pagamento</span><strong>${escapeHtml(expense.paymentMethod || "-")}</strong></div>
          <div class="metric"><span>Tipo</span><strong>${isInstallment ? "Parcelado" : "Manual"}</strong></div>
          <div class="metric"><span>Status</span><strong>${EXPENSE_STATUS[status] || status}</strong></div>
        </div>
        ${expense.notes ? `<p class="muted-text">Obs.: ${escapeHtml(expense.notes)}</p>` : ""}
        <div class="card-actions">
          <button type="button" data-action="edit-expense" data-id="${expense.id}">Editar</button>
          ${status !== "paid" ? `<button type="button" data-action="mark-expense-paid" data-id="${expense.id}">Marcar pago</button>` : ""}
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
    const allMovements = getFinanceMovements();
    const movements = allMovements.filter(isMovementInFinanceFilters);
    const incomeTotal = movements
      .filter((movement) => movement.type === "income")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const receivableTotal = movements
      .filter((movement) => movement.type === "pending-income")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const paidExpenseTotal = movements
      .filter((movement) => movement.type === "paid-expense")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const pendingExpenseTotal = movements
      .filter((movement) => movement.type === "pending-expense" || movement.type === "future-expense")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const futureExpenseTotal = movements
      .filter((movement) => movement.type === "future-expense")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const investmentTotal = movements
      .filter((movement) => movement.source === "expense" && movement.expenseType === "investment")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const costTotal = movements
      .filter((movement) => movement.source === "expense" && movement.expenseType === "cost")
      .reduce((sum, movement) => sum + movement.amount, 0);
    const overdueTotal = movements
      .filter((movement) => movement.source === "expense" && movement.status === "overdue")
      .reduce((sum, movement) => sum + movement.amount, 0);

    $("#financeStats").innerHTML = [
      ["Total de entradas", formatMoney(incomeTotal)],
      ["Locações a receber", formatMoney(receivableTotal)],
      ["Total de gastos", formatMoney(investmentTotal + costTotal)],
      ["Total de investimentos", formatMoney(investmentTotal)],
      ["Total de custos", formatMoney(costTotal)],
      ["Total de gastos pagos", formatMoney(paidExpenseTotal)],
      ["Total de gastos pendentes", formatMoney(pendingExpenseTotal)],
      ["Parcelas futuras", formatMoney(futureExpenseTotal)],
      ["Saldo final", formatMoney(incomeTotal - paidExpenseTotal)],
      ["Atrasados", formatMoney(overdueTotal)],
    ]
      .map(([label, value]) => `<article class="kpi-card"><span>${label}</span><strong>${value}</strong></article>`)
      .join("");

    $("#upcomingFinanceList").innerHTML = renderUpcomingExpenses();
    $("#overdueFinanceList").innerHTML = renderOverdueExpenses();
    $("#financeList").innerHTML = movements.length
      ? movements.map(renderFinanceMovementCard).join("")
      : emptyState("Nenhuma movimentação encontrada para os filtros escolhidos.");
    renderFinanceCharts(movements, {
      incomeTotal,
      investmentTotal,
      costTotal,
      paidExpenseTotal,
      pendingExpenseTotal,
    });
  }

  function renderFinanceCharts(movements, totals) {
    const expenseMovements = movements.filter((movement) => movement.source === "expense");
    const incomeMovements = movements.filter((movement) => movement.source === "rental" && movement.type === "income");

    drawPieChart("financeMixChart", "financeMixLegend", [
      { label: "Entradas", value: totals.incomeTotal, color: "#138a43" },
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
    const rentalMovements = state.rentals
      .filter(isRentalFinancialEntry)
      .flatMap((rental) => {
        const client = getClient(rental.clientId);
        const totals = getRentalTotals(rental);
        const receivedAmount = getRentalReceivedAmount(rental);
        const receivableAmount = getRentalReceivableAmount(rental);
        const baseMovement = {
          source: "rental",
          category: "Locações",
          date: rental.startDate || rental.orderDate,
          title: `Pedido ${rental.orderNumber}`,
          clientName: client?.name || "Cliente não encontrado",
          itemText: (Array.isArray(rental.items) ? rental.items : []).map((line) => `${line.qty}x ${line.name}`).join(", "),
          startDate: rental.startDate,
          endDate: rental.endDate,
          paymentMethod: rental.paymentMethod || "-",
          paymentStatus: rental.paymentStatus || "unpaid",
          rentalTotal: totals.total,
        };

        const movements = [];
        if (receivedAmount > 0) {
          movements.push({
            ...baseMovement,
            id: `rental-income-${rental.id}`,
            type: "income",
            amount: receivedAmount,
          });
        }

        if (receivableAmount > 0) {
          movements.push({
            ...baseMovement,
            id: `rental-receivable-${rental.id}`,
            type: "pending-income",
            amount: receivableAmount,
          });
        }

        return movements;
      });

    const expenses = state.expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      source: "expense",
      expenseId: expense.id,
      type: financeTypeForExpense(expense),
      category: expense.category || "Sem categoria",
      expenseType: normalizeExpenseType(expense),
      date: getExpenseDate(expense),
      amount: toNumber(expense.amount),
      title: expense.description || "Gasto sem descrição",
      paymentMethod: expense.paymentMethod || "-",
      status: expenseEffectiveStatus(expense),
      notes: expense.notes || "",
      kind: expense.kind || "manual",
      installmentNumber: expense.installmentNumber,
      installmentTotal: expense.installmentTotal,
    }));

    return [...rentalMovements, ...expenses].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function getRentalReceivedAmount(rental) {
    const totals = getRentalTotals(rental);
    const paymentStatus = rental?.paymentStatus || "unpaid";

    if (paymentStatus === "paid") {
      return totals.total;
    }

    if (paymentStatus === "partial") {
      return Math.min(totals.total, totals.deposit);
    }

    return 0;
  }

  function getRentalReceivableAmount(rental) {
    const totals = getRentalTotals(rental);
    return Math.max(0, roundMoney(totals.total - getRentalReceivedAmount(rental)));
  }

  function isMovementInFinanceFilters(movement) {
    const start = $("#financeStartFilter").value;
    const end = $("#financeEndFilter").value;
    const month = $("#financeMonthFilter").value;
    const year = $("#financeYearFilter").value;
    const type = $("#financeTypeFilter").value;
    const category = $("#financeCategoryFilter").value;
    const date = movement.date || "";

    return (
      (!start || date >= start) &&
      (!end || date <= end) &&
      (!month || date.slice(5, 7) === month) &&
      (!year || date.slice(0, 4) === String(year)) &&
      (!type || movement.type === type) &&
      (!category || movement.category === category)
    );
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
        <div class="card-actions">
          <button type="button" data-action="edit-expense" data-id="${movement.expenseId}">Editar</button>
          ${movement.status !== "paid" ? `<button type="button" data-action="mark-expense-paid" data-id="${movement.expenseId}">Marcar pago</button>` : ""}
          <button type="button" class="danger-mini" data-action="delete-expense" data-id="${movement.expenseId}">Excluir</button>
        </div>
      </article>
    `;
  }

  function renderUpcomingExpenses() {
    const today = todayISO();
    const upcoming = state.expenses
      .filter((expense) => expenseEffectiveStatus(expense) === "pending" && getExpenseDate(expense) >= today)
      .sort((a, b) => String(getExpenseDate(a)).localeCompare(String(getExpenseDate(b))))
      .slice(0, 6);

    if (!upcoming.length) {
      return emptyState("Nenhum vencimento futuro cadastrado.");
    }

    return upcoming
      .map((expense) => `
        <div class="compact-item">
          <div>
            <strong>${escapeHtml(expense.description || "Gasto")}</strong>
            <span>${formatDate(getExpenseDate(expense))} · ${escapeHtml(expense.category || "Sem categoria")}</span>
          </div>
          <span>${formatMoney(expense.amount)}</span>
        </div>
      `)
      .join("");
  }

  function renderOverdueExpenses() {
    const overdue = state.expenses
      .filter((expense) => expenseEffectiveStatus(expense) === "overdue")
      .sort((a, b) => String(getExpenseDate(a)).localeCompare(String(getExpenseDate(b))))
      .slice(0, 6);

    if (!overdue.length) {
      return emptyState("Nenhum gasto atrasado no momento.");
    }

    return overdue
      .map((expense) => `
        <div class="compact-item">
          <div>
            <strong>${escapeHtml(expense.description || "Gasto")}</strong>
            <span>Venceu em ${formatDate(getExpenseDate(expense))}</span>
          </div>
          <span>${formatMoney(expense.amount)}</span>
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
    } else if (button.dataset.action === "mark-expense-paid") {
      await markExpensePaid(expense);
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
        status: form.status.value,
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
        await PlanetaDB.add("expenses", payload);
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
      const baseAmount = roundMoney(totalAmountValue / total);

      if (!form.description.value.trim() || !totalAmountValue || !form.dueDate.value) {
        alert("Confira descrição, valor total, quantidade e primeiro vencimento das parcelas.");
        return;
      }

      const now = new Date().toISOString();
      const seriesId = `parcelas-${Date.now()}`;
      for (let number = 1; number <= total; number += 1) {
        const amount = number === total ? roundMoney(totalAmountValue - baseAmount * (total - 1)) : baseAmount;
        await PlanetaDB.add("expenses", {
          kind: "installment",
          seriesId,
          expenseType: form.expenseType.value,
          description: form.description.value.trim(),
          category: form.category.value.trim() || "Compra de equipamentos",
          amount,
          totalAmount: totalAmountValue,
          installmentAmount: baseAmount,
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
      }

      closeModal();
      await loadAll();
      refreshAll();
      showToast("Parcelas cadastradas.");
    });
  }

  async function markExpensePaid(expense) {
    if (confirm(`Marcar "${expense.description}" como pago?`)) {
      await PlanetaDB.put("expenses", {
        ...expense,
        status: "paid",
        paidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await loadAll();
      refreshAll();
      showToast("Gasto marcado como pago.");
    }
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
      kits: Array.isArray(data.stores.kits) ? data.stores.kits.length : 0,
    };

    return [
      `Itens/produtos: ${counts.items}`,
      `Conjuntos/kits: ${counts.kits}`,
      `Clientes: ${counts.clients}`,
      `Locações: ${counts.rentals}`,
      `Gastos/parcelas: ${counts.expenses}`,
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

  function findClientByCpfDigits(cpfDigits) {
    return state.clients.find((client) => onlyDigits(client.document) === cpfDigits);
  }

  async function ensureRentalClient(clientDraft, currentClientId = null) {
    const now = new Date().toISOString();
    const cpfDigits = onlyDigits(clientDraft.document);
    const existingByCpf = findClientByCpfDigits(cpfDigits);
    const currentClient = currentClientId ? getClient(currentClientId) : null;
    const canReuseCurrent = currentClient && (!onlyDigits(currentClient.document) || onlyDigits(currentClient.document) === cpfDigits);
    const target = existingByCpf || (canReuseCurrent ? currentClient : null);

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
    const cpfDigits = onlyDigits(cpfInput.value);
    const info = $("#clientMatchInfo");

    $("#rentalClientId").value = "";
    info.textContent = "";

    if (!cpfDigits) {
      return;
    }

    if (!isValidCpf(cpfDigits)) {
      info.textContent = "CPF inválido. Confira os 11 dígitos antes de salvar a locação.";
      return;
    }

    cpfInput.value = formatCpf(cpfDigits);
    const client = findClientByCpfDigits(cpfDigits);

    if (!client) {
      info.textContent = "CPF válido. Um novo cliente será criado ao salvar a locação.";
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

    if (expense.status === "paid") {
      return "paid";
    }

    return getExpenseDate(expense) < todayISO() ? "overdue" : "pending";
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
