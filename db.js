(function () {
  "use strict";

  const DB_NAME = "planeta-locacoes";
  const DB_VERSION = 4;
  const STORES = ["items", "clients", "rentals", "expenses", "kits", "meta"];

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains("items")) {
          const store = db.createObjectStore("items", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("name", "name", { unique: false });
          store.createIndex("category", "category", { unique: false });
          store.createIndex("color", "color", { unique: false });
        }

        if (!db.objectStoreNames.contains("clients")) {
          const store = db.createObjectStore("clients", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("name", "name", { unique: false });
          store.createIndex("phone", "phone", { unique: false });
        }

        if (!db.objectStoreNames.contains("rentals")) {
          const store = db.createObjectStore("rentals", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("orderNumber", "orderNumber", { unique: false });
          store.createIndex("clientId", "clientId", { unique: false });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("paymentStatus", "paymentStatus", { unique: false });
          store.createIndex("startDate", "startDate", { unique: false });
          store.createIndex("endDate", "endDate", { unique: false });
        }

        if (!db.objectStoreNames.contains("expenses")) {
          const store = db.createObjectStore("expenses", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("kind", "kind", { unique: false });
          store.createIndex("category", "category", { unique: false });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("date", "date", { unique: false });
          store.createIndex("dueDate", "dueDate", { unique: false });
          store.createIndex("seriesId", "seriesId", { unique: false });
        }

        if (!db.objectStoreNames.contains("kits")) {
          const store = db.createObjectStore("kits", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("name", "name", { unique: false });
        }

        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("O banco local está aberto em outra aba."));
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function add(storeName, value) {
    const db = await open();
    const tx = db.transaction(storeName, "readwrite");
    const done = transactionDone(tx);
    const id = await requestToPromise(tx.objectStore(storeName).add(value));
    await done;
    db.close();
    return id;
  }

  async function put(storeName, value) {
    const db = await open();
    const tx = db.transaction(storeName, "readwrite");
    const done = transactionDone(tx);
    const id = await requestToPromise(tx.objectStore(storeName).put(value));
    await done;
    db.close();
    return id;
  }

  async function get(storeName, key) {
    const db = await open();
    const tx = db.transaction(storeName, "readonly");
    const value = await requestToPromise(tx.objectStore(storeName).get(key));
    db.close();
    return value;
  }

  async function getAll(storeName) {
    const db = await open();
    const tx = db.transaction(storeName, "readonly");
    const values = await requestToPromise(tx.objectStore(storeName).getAll());
    db.close();
    return values;
  }

  async function remove(storeName, key) {
    const db = await open();
    const tx = db.transaction(storeName, "readwrite");
    const done = transactionDone(tx);
    await requestToPromise(tx.objectStore(storeName).delete(key));
    await done;
    db.close();
  }

  async function clear(storeName) {
    const db = await open();
    const tx = db.transaction(storeName, "readwrite");
    const done = transactionDone(tx);
    await requestToPromise(tx.objectStore(storeName).clear());
    await done;
    db.close();
  }

  async function count(storeName) {
    const db = await open();
    const tx = db.transaction(storeName, "readonly");
    const value = await requestToPromise(tx.objectStore(storeName).count());
    db.close();
    return value;
  }

  async function getMeta(key, fallback = null) {
    const record = await get("meta", key);
    return record ? record.value : fallback;
  }

  async function setMeta(key, value) {
    return put("meta", { key, value });
  }

  async function nextOrderNumber() {
    const rentals = await getAll("rentals");
    const maxOrder = rentals.reduce((highest, rental) => {
      const current = Number(rental.orderNumber) || 0;
      return Math.max(highest, current);
    }, 1000);
    const savedNext = Number(await getMeta("nextOrderNumber", 1001)) || 1001;
    const next = Math.max(savedNext, maxOrder + 1);
    await setMeta("nextOrderNumber", next + 1);
    return next;
  }

  async function exportData() {
    const stores = {};
    for (const store of STORES) {
      stores[store] = await getAll(store);
    }

    return {
      app: "Planeta Locações",
      schemaVersion: DB_VERSION,
      exportedAt: new Date().toISOString(),
      stores,
    };
  }

  async function clearAll() {
    for (const store of STORES) {
      await clear(store);
    }
  }

  async function importData(data, options = {}) {
    if (!data || typeof data !== "object" || !data.stores) {
      throw new Error("Arquivo de backup inválido.");
    }

    const mode = options.mode === "merge" ? "merge" : "replace";
    if (mode === "merge") {
      await mergeData(data);
      return;
    }

    await clearAll();

    for (const store of STORES) {
      const records = Array.isArray(data.stores[store]) ? data.stores[store] : [];
      for (const record of records) {
        await add(store, record);
      }
    }
  }

  async function mergeData(data) {
    const clientIdMap = await mergeClients(data.stores.clients || []);
    const itemIdMap = await mergeItems(data.stores.items || []);
    await mergeKits(data.stores.kits || [], itemIdMap);
    await mergeRentals(data.stores.rentals || [], clientIdMap, itemIdMap);
    await mergeExpenses(data.stores.expenses || []);
    await setMeta("lastMergedBackupAt", new Date().toISOString());
  }

  async function mergeClients(records) {
    const idMap = new Map();
    const existing = await getAll("clients");

    for (const record of Array.isArray(records) ? records : []) {
      const match = existing.find((client) => clientKey(client) && clientKey(client) === clientKey(record));
      if (match) {
        idMap.set(record.id, match.id);
        continue;
      }

      const payload = { ...record };
      delete payload.id;
      const id = await add("clients", payload);
      idMap.set(record.id, id);
      existing.push({ ...payload, id });
    }

    return idMap;
  }

  async function mergeItems(records) {
    const idMap = new Map();
    const existing = await getAll("items");

    for (const record of Array.isArray(records) ? records : []) {
      const match = existing.find((item) => itemKey(item) === itemKey(record));
      if (match) {
        idMap.set(record.id, match.id);
        continue;
      }

      const payload = { ...record };
      delete payload.id;
      const id = await add("items", payload);
      idMap.set(record.id, id);
      existing.push({ ...payload, id });
    }

    return idMap;
  }

  async function mergeRentals(records, clientIdMap, itemIdMap) {
    const existing = await getAll("rentals");

    for (const record of Array.isArray(records) ? records : []) {
      const payload = {
        ...record,
        clientId: clientIdMap.get(record.clientId) || record.clientId,
        items: Array.isArray(record.items)
          ? record.items.map((line) => ({
              ...line,
              itemId: itemIdMap.get(line.itemId) || line.itemId,
            }))
          : [],
      };
      delete payload.id;

      const duplicate = existing.some((rental) => rentalKey(rental) === rentalKey(payload));
      if (duplicate) {
        continue;
      }

      const id = await add("rentals", payload);
      existing.push({ ...payload, id });
    }
  }

  async function mergeKits(records, itemIdMap) {
    const existing = await getAll("kits");

    for (const record of Array.isArray(records) ? records : []) {
      const payload = {
        ...record,
        items: Array.isArray(record.items)
          ? record.items.map((line) => ({
              ...line,
              itemId: itemIdMap.get(line.itemId) || line.itemId,
            }))
          : [],
      };
      delete payload.id;

      const duplicate = existing.some((kit) => kitKey(kit) === kitKey(payload));
      if (duplicate) {
        continue;
      }

      const id = await add("kits", payload);
      existing.push({ ...payload, id });
    }
  }

  async function mergeExpenses(records) {
    const existing = await getAll("expenses");

    for (const record of Array.isArray(records) ? records : []) {
      const duplicate = existing.some((expense) => expenseKey(expense) === expenseKey(record));
      if (duplicate) {
        continue;
      }

      const payload = { ...record };
      delete payload.id;
      const id = await add("expenses", payload);
      existing.push({ ...payload, id });
    }
  }

  function clientKey(client) {
    const document = onlyDigits(client?.document);
    if (document) {
      return `document:${document}`;
    }

    return `name:${normalizeKey(client?.name)}|phone:${onlyDigits(client?.phone)}`;
  }

  function itemKey(item) {
    return `${normalizeKey(item?.name)}|${normalizeKey(item?.category)}|${normalizeKey(item?.color)}`;
  }

  function kitKey(kit) {
    const items = Array.isArray(kit?.items)
      ? kit.items
          .map((line) => `${line.itemId}:${Number(line.qty) || 0}`)
          .sort()
          .join("|")
      : "";
    return `${normalizeKey(kit?.name)}|${items}`;
  }

  function rentalKey(rental) {
    return `${rental?.orderNumber}|${rental?.clientId}|${rental?.startDate}|${rental?.endDate}|${Number(rental?.total) || 0}`;
  }

  function expenseKey(expense) {
    return `${normalizeKey(expense?.description)}|${expense?.date || expense?.dueDate || ""}|${Number(expense?.amount) || 0}|${expense?.seriesId || ""}|${expense?.installmentNumber || ""}`;
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function nowStamp() {
    return new Date().toISOString();
  }

  async function seedIfEmpty() {
    await setMeta("seededV1", true);
    return false;

    const alreadySeeded = await getMeta("seededV1", false);
    const itemCount = await count("items");
    const clientCount = await count("clients");
    const rentalCount = await count("rentals");

    if (alreadySeeded || itemCount || clientCount || rentalCount) {
      return false;
    }

    const createdAt = nowStamp();
    const items = [
      {
        name: "Conjunto mesa com 4 cadeiras",
        category: "Conjunto",
        color: "",
        totalQty: 30,
        unavailableQty: 0,
        defaultPrice: 13,
        notes: "Valor base para locação avulsa.",
        createdAt,
        updatedAt: createdAt,
      },
      {
        name: "Mesa plástica avulsa",
        category: "Mesa",
        color: "Branca",
        totalQty: 20,
        unavailableQty: 0,
        defaultPrice: 5,
        notes: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        name: "Cadeira plástica avulsa",
        category: "Cadeira",
        color: "Branca",
        totalQty: 120,
        unavailableQty: 0,
        defaultPrice: 3,
        notes: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        name: "Forro branco",
        category: "Forro",
        color: "Branco",
        totalQty: 20,
        unavailableQty: 0,
        defaultPrice: 3,
        notes: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        name: "Forro preto",
        category: "Forro",
        color: "Preto",
        totalQty: 12,
        unavailableQty: 0,
        defaultPrice: 3,
        notes: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        name: "Forro vermelho",
        category: "Forro",
        color: "Vermelho",
        totalQty: 10,
        unavailableQty: 0,
        defaultPrice: 3,
        notes: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        name: "Forro rosa",
        category: "Forro",
        color: "Rosa",
        totalQty: 8,
        unavailableQty: 0,
        defaultPrice: 3,
        notes: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        name: "Forro amarelo",
        category: "Forro",
        color: "Amarelo",
        totalQty: 8,
        unavailableQty: 0,
        defaultPrice: 3,
        notes: "",
        createdAt,
        updatedAt: createdAt,
      },
      {
        name: "Forro verde",
        category: "Forro",
        color: "Verde",
        totalQty: 8,
        unavailableQty: 0,
        defaultPrice: 3,
        notes: "",
        createdAt,
        updatedAt: createdAt,
      },
    ];

    const itemIds = [];
    for (const item of items) {
      itemIds.push(await add("items", item));
    }

    const clientId = await add("clients", {
      name: "Cliente exemplo",
      phone: "(62) 99999-0000",
      document: "",
      address: "Anápolis-GO",
      notes: "Cadastro de teste. Pode editar ou excluir quando quiser.",
      createdAt,
      updatedAt: createdAt,
    });

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const nextDay = new Date(today);
    nextDay.setDate(today.getDate() + 2);
    const toISODate = (date) => {
      const copy = new Date(date);
      copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
      return copy.toISOString().slice(0, 10);
    };

    await add("rentals", {
      orderNumber: 1001,
      clientId,
      orderDate: toISODate(today),
      startDate: toISODate(tomorrow),
      endDate: toISODate(nextDay),
      eventLocation: "Anápolis-GO",
      items: [
        {
          itemId: itemIds[0],
          name: "Conjunto mesa com 4 cadeiras",
          qty: 5,
          unitPrice: 13,
        },
        {
          itemId: itemIds[3],
          name: "Forro branco",
          qty: 5,
          unitPrice: 3,
        },
      ],
      discount: 0,
      subtotal: 80,
      total: 80,
      deposit: 20,
      paymentMethod: "Pix",
      paymentStatus: "partial",
      status: "quote",
      notes: "Pedido de exemplo para testar o recibo.",
      returnProblems: [],
      createdAt,
      updatedAt: createdAt,
    });

    await setMeta("nextOrderNumber", 1002);
    await setMeta("seededV1", true);
    return true;
  }

  window.PlanetaDB = {
    open,
    add,
    put,
    get,
    getAll,
    remove,
    clear,
    count,
    getMeta,
    setMeta,
    nextOrderNumber,
    exportData,
    importData,
    clearAll,
    seedIfEmpty,
  };
})();
