// controllers/modules/EntryMasterController.js
import Entry from "../../models/modules/EntryModel.js";
import EntryService from "../../services/modules/EntryService.js";

const validTypes = [
  "metal-receipt",
  "metal-payment",
  "cash-receipt",
  "cash-payment",
  "currency-receipt",
];

const createEntry = async (req, res) => {
  try {
    // console.log(req.body)
    const { type, stocks, cash, ...rest } = req.body;
    const stockItems = stocks;

    if (!validTypes.includes(type))
      return res.status(400).json({ success: false, message: "Invalid type" });

    if (type.includes("metal")) {
      if (!stockItems?.length)
        return res
          .status(400)
          .json({ success: false, message: "stockItems required" });
      if (cash?.length)
        return res
          .status(400)
          .json({ success: false, message: "cash not allowed" });
    } else {
      if (!cash?.length)
        return res
          .status(400)
          .json({ success: false, message: "cash required" });
      if (stockItems?.length)
        return res
          .status(400)
          .json({ success: false, message: "stockItems not allowed" });
    }

    const entry = new Entry({
      type,
      stockItems: type.includes("metal") ? stockItems : undefined,
      cash: !type.includes("metal") ? cash : undefined,
      enteredBy: req.admin.id,
      ...rest,
    });

    const handlers = {
      "metal-receipt": () => EntryService.handleMetalReceipt(entry),
      "metal-payment": () => EntryService.handleMetalPayment(entry),
      "cash-receipt": () => EntryService.handleCashTransaction(entry, true),
      "cash-payment": () => EntryService.handleCashTransaction(entry, false),
      "currency-receipt": () => EntryService.handleCashTransaction(entry, true),
    };

    if (handlers[type]) await handlers[type]();
    await entry.save();

    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// controllers/modules/EntryMasterController.js
const editEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, stocks, cash, ...rest } = req.body;
    const stockItems = stocks;

    // Validate type
    if (!validTypes.includes(type))
      return res.status(400).json({ success: false, message: "Invalid type" });

    // Find existing entry
    const entry = await Entry.findById(id);
    if (!entry)
      return res.status(404).json({ success: false, message: "Not found" });

    // Validate data based on type
    if (type.includes("metal")) {
      if (!stockItems?.length)
        return res
          .status(400)
          .json({ success: false, message: "stockItems required" });
      if (cash?.length)
        return res
          .status(400)
          .json({ success: false, message: "cash not allowed" });
    } else {
      if (!cash?.length)
        return res
          .status(400)
          .json({ success: false, message: "cash required" });
      if (stockItems?.length)
        return res
          .status(400)
          .json({ success: false, message: "stockItems not allowed" });
    }

    // Cleanup old registry and inventory entries
    await EntryService.cleanup(entry.voucherCode);

    // Reverse old transactions based on ORIGINAL entry type
    if (entry.type.includes("metal")) {
      await EntryService.reverseMetal(entry, entry.type === "metal-receipt");
    } else {
      await EntryService.reverseCashTransaction(
        entry,
        entry.type.includes("receipt")
      );
    }

    // Update entry with new data
    Object.assign(entry, {
      type,
      stockItems: type.includes("metal") ? stockItems : undefined,
      cash: !type.includes("metal") ? cash : undefined,
      enteredBy: req.admin.id,
      ...rest,
    });

    // Clear opposite array based on NEW type
    if (type.includes("metal")) {
      entry.cash = [];
    } else {
      entry.stockItems = [];
    }

    // Apply new transactions based on NEW type
    const handlers = {
      "metal-receipt": () => EntryService.handleMetalReceipt(entry),
      "metal-payment": () => EntryService.handleMetalPayment(entry),
      "cash-receipt": () => EntryService.handleCashTransaction(entry, true),
      "cash-payment": () => EntryService.handleCashTransaction(entry, false),
      "currency-receipt": () => EntryService.handleCashTransaction(entry, true),
    };

    if (handlers[type]) await handlers[type]();
    await entry.save();

    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteEntryById = async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id);
    if (!entry)
      return res.status(404).json({ success: false, message: "Not found" });

    await EntryService.cleanup(entry.voucherCode);
    if (entry.type.includes("metal")) {
      await EntryService.reverseMetal(entry, entry.type === "metal-receipt");
    } else {
      await EntryService.reverseCashTransaction(
        entry,
        entry.type.includes("receipt")
      );
    }
    await entry.deleteOne();
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getEntryById = async (req, res) => {
  try {
    const entry = await EntryService.getEntryById(req.params.id);
    res.json({ success: true, data: entry });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ success: false, message: err.message });
  }
};

const listHandler = (type) => async (req, res) => {
  console.log("object");
  console.log(type);
  try {
    const { page, limit, search, startDate, endDate } = req.query;
    const result = await EntryService.getEntriesByType({
      type,
      page,
      limit,
      search,
      startDate,
      endDate,
    });
    console.log("testing");
    console.log(result);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export default {
  createEntry,
  editEntry,
  deleteEntryById,
  getEntryById,
  getCashReceipts: listHandler("cash-receipt"),
  getCashPayments: listHandler("cash-payment"),
  getMetalReceipts: listHandler("metal-receipt"),
  getMetalPayments: listHandler("metal-payment"),
};
