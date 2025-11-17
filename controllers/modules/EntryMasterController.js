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

// Helper to check today's date
const isToday = (date) => {
  const d = new Date(date);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
};

const createEntry = async (req, res) => {
  try {
    const { type, stocks, cash, ...rest } = req.body;

    if (!validTypes.includes(type))
      return res.status(400).json({ success: false, message: "Invalid type" });

    const stockItems = stocks;
    const isCheque = cash?.some((c) => c.cashType === "cheque");

    // Validate type logic
    if (type.includes("metal")) {
      if (!stockItems?.length)
        return res.status(400).json({ success: false, message: "stockItems required" });
      if (cash?.length)
        return res.status(400).json({ success: false, message: "cash not allowed" });
    } else {
      if (!cash?.length)
        return res.status(400).json({ success: false, message: "cash required" });
      if (stockItems?.length)
        return res.status(400).json({ success: false, message: "stockItems not allowed" });
    }

    // Cheque status logic
    if (isCheque) {
      const cheque = cash.find((c) => c.cashType === "cheque");
      if (cheque && cheque.chequeDate && isToday(cheque.chequeDate)) {
        rest.status = "approved"; // cheque date today = auto-approved
      } else {
        rest.status = "draft"; // otherwise draft
      }
    }

    const entry = new Entry({
      type,
      stockItems: type.includes("metal") ? stockItems : undefined,
      cash: !type.includes("metal") ? cash : undefined,
      enteredBy: req.admin.id,
      ...rest,
    });

    await entry.save();

    // Apply registry only if approved
    if (entry.status === "approved") {
      const handlers = {
        "metal-receipt": () => EntryService.handleMetalReceipt(entry),
        "metal-payment": () => EntryService.handleMetalPayment(entry),
        "cash-receipt": () => EntryService.handleCashTransaction(entry, true),
        "cash-payment": () => EntryService.handleCashTransaction(entry, false),
        "currency-receipt": () => EntryService.handleCashTransaction(entry, true),
      };

      if (handlers[type]) await handlers[type]();
    }

    res.status(201).json({ success: true, data: entry });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};



const editEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, stocks, cash, ...rest } = req.body;

    const entry = await Entry.findById(id);
    if (!entry)
      return res.status(404).json({ success: false, message: "Not found" });

    const isCheque = cash?.some((c) => c.cashType === "cheque");

    // Reverse existing registry if approved
    if (entry.status === "approved") {
      await EntryService.cleanup(entry.voucherCode);

      if (entry.type.includes("metal")) {
        await EntryService.reverseMetal(entry, entry.type === "metal-receipt");
      } else {
        await EntryService.reverseCashTransaction(
          entry,
          entry.type.includes("receipt")
        );
      }
    }

    // Update entry
    Object.assign(entry, {
      type,
      stockItems: type.includes("metal") ? stocks : undefined,
      cash: !type.includes("metal") ? cash : undefined,
      enteredBy: req.admin.id,
      ...rest,
    });

    // Cheque status rules
    if (isCheque) {
      const cheque = cash.find((c) => c.cashType === "cheque");
      if (cheque && cheque.chequeDate && isToday(cheque.chequeDate)) {
        entry.status = "approved";
      } else {
        entry.status = "draft";
      }
    }

    await entry.save();

    // Apply new registry only if approved
    if (entry.status === "approved") {
      const handlers = {
        "metal-receipt": () => EntryService.handleMetalReceipt(entry),
        "metal-payment": () => EntryService.handleMetalPayment(entry),
        "cash-receipt": () => EntryService.handleCashTransaction(entry, true),
        "cash-payment": () => EntryService.handleCashTransaction(entry, false),
        "currency-receipt": () => EntryService.handleCashTransaction(entry, true),
      };

      if (handlers[type]) await handlers[type]();
    }

    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};



const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const entry = await Entry.findById(id);
    if (!entry)
      return res.status(404).json({ success: false, message: "Not found" });

    const isCheque = entry.cash?.some((c) => c.cashType === "cheque");

    // Cheque protection rule
    if (isCheque) {
      const cheque = entry.cash.find((c) => c.cashType === "cheque");

      if (!cheque.chequeDate || !isToday(cheque.chequeDate)) {
        return res.status(400).json({
          success: false,
          message: "Cheque can only be approved if chequeDate is today.",
        });
      }
    }

    // draft → approved
    if (entry.status === "draft" && status === "approved") {
      const handlers = {
        "metal-receipt": () => EntryService.handleMetalReceipt(entry),
        "metal-payment": () => EntryService.handleMetalPayment(entry),
        "cash-receipt": () => EntryService.handleCashTransaction(entry, true),
        "cash-payment": () => EntryService.handleCashTransaction(entry, false),
        "currency-receipt": () => EntryService.handleCashTransaction(entry, true),
      };

      if (handlers[entry.type]) await handlers[entry.type]();
    }

    // approved → draft
    if (entry.status === "approved" && status === "draft") {
      await EntryService.cleanup(entry.voucherCode);

      if (entry.type.includes("metal")) {
        await EntryService.reverseMetal(entry, entry.type === "metal-receipt");
      } else {
        await EntryService.reverseCashTransaction(
          entry,
          entry.type.includes("receipt")
        );
      }
    }

    entry.status = status;
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

    if (entry.status === "approved") {
      if (entry.type.includes("metal")) {
        await EntryService.reverseMetal(entry, entry.type === "metal-receipt");
      } else {
        await EntryService.reverseCashTransaction(
          entry,
          entry.type.includes("receipt")
        );
      }
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
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};



const listHandler = (type) => async (req, res) => {
  try {
    const { page, limit, search, startDate, endDate, status } = req.query;

    const result = await EntryService.getEntriesByType({
      type,
      page,
      limit,
      search,
      startDate,
      endDate,
      status,
    });

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
  updateStatus,
  getCashReceipts: listHandler("cash-receipt"),
  getCashPayments: listHandler("cash-payment"),
  getMetalReceipts: listHandler("metal-receipt"),
  getMetalPayments: listHandler("metal-payment"),
};
