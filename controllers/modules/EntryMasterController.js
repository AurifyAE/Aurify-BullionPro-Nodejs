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

// Helper to check if date is post-dated (future date)
const isPostDated = (date) => {
  if (!date) return false;
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d > today;
};

const createEntry = async (req, res) => {
  try {
    const { type, stocks, cash, invoiceReference, invoiceDate, ...rest } = req.body;
console.log(req.body)
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

    // Process cash items with FX gain/loss calculation
    const processedCash = cash?.map((c) => {
      const fxRate = Number(c.fxRate) || 1;
      const fxBaseRate = Number(c.fxBaseRate) || 1;
      const amount = Number(c.amount) || 0;
      const isPayment = type === "cash-payment";

      // Calculate FX Gain/Loss
      // givenValue = amount * fxRate (what was actually transacted)
      // marketValue = amount * fxBaseRate (what it should be at base rate)
      const givenValue = amount * fxRate;
      const marketValue = amount * fxBaseRate;
      const diff = marketValue - givenValue;

      let fxGain = 0;
      let fxLoss = 0;

      if (isPayment) {
        // For payment: if we pay less than market value = loss for party
        // diff > 0 means marketValue > givenValue = loss
        fxGain = diff < 0 ? Math.abs(diff) : 0;
        fxLoss = diff > 0 ? diff : 0;
      } else {
        // For receipt: if we receive more than market value = gain
        // diff > 0 means marketValue > givenValue = gain
        fxGain = diff > 0 ? diff : 0;
        fxLoss = diff < 0 ? Math.abs(diff) : 0;
      }

      // Check if this is a post-dated cheque
      const isPDC = c.cashType === "cheque" && isPostDated(c.chequeDate);

      return {
        ...c,
        fxRate,
        fxBaseRate,
        fxGain,
        fxLoss,
        isPDC,
        pdcStatus: isPDC ? "pending" : null,
      };
    });

    // Determine entry status based on cheque dates
    let entryStatus = "approved";
    
    // if (isCheque) {
    //   const hasPostDatedCheque = processedCash?.some((c) => c.isPDC);
    //   const allChequesToday = processedCash
    //     ?.filter((c) => c.cashType === "cheque")
    //     .every((c) => isToday(c.chequeDate));

    //   if (hasPostDatedCheque && !allChequesToday) {
    //     // If there are post-dated cheques, still approve but mark PDC items
    //     entryStatus = "approved";
    //   }
    // }

    const entry = new Entry({
      type,
      stockItems: type.includes("metal") ? stockItems : undefined,
      cash: !type.includes("metal") ? processedCash : undefined,
      enteredBy: req.admin.id,
      status: entryStatus,
      invoiceReference: invoiceReference?.trim() || null,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
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
        "currency-payment": () => EntryService.handleCashTransaction(entry, false),
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
    const { type, stocks, cash, invoiceReference, invoiceDate, ...rest } = req.body;

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
      invoiceReference: invoiceReference?.trim() || null,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
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
        "currency-payment": () => EntryService.handleCashTransaction(entry, false),
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



// ------------------------------------------------------------------------
// PDC (Post-Dated Cheque) Management
// ------------------------------------------------------------------------

/**
 * Clear a post-dated cheque when the cheque date arrives
 * This transfers the amount from PDC account to actual bank account
 */
const clearPDC = async (req, res) => {
  try {
    const { id } = req.params;
    const { cashItemIndex } = req.body;

    if (cashItemIndex === undefined || cashItemIndex === null) {
      return res.status(400).json({
        success: false,
        message: "cashItemIndex is required",
      });
    }

    const entry = await EntryService.clearPDC(id, cashItemIndex, req.admin.id);

    res.json({
      success: true,
      message: "PDC cleared successfully",
      data: entry,
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

/**
 * Mark a post-dated cheque as bounced
 * This reverses the party balance and PDC account entries
 */
const bouncePDC = async (req, res) => {
  try {
    const { id } = req.params;
    const { cashItemIndex } = req.body;

    if (cashItemIndex === undefined || cashItemIndex === null) {
      return res.status(400).json({
        success: false,
        message: "cashItemIndex is required",
      });
    }

    const entry = await EntryService.bouncePDC(id, cashItemIndex, req.admin.id);

    res.json({
      success: true,
      message: "PDC marked as bounced",
      data: entry,
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

/**
 * Get all pending PDCs (post-dated cheques)
 */
const getPendingPDCs = async (req, res) => {
  try {
    const entries = await Entry.find({
      "cash.isPDC": true,
      "cash.pdcStatus": "pending",
    })
      .populate("party", "customerName accountCode")
      .populate("cash.currency", "currencyCode")
      .populate("cash.chequeBank", "customerName accountCode")
      .sort({ "cash.chequeDate": 1 });

    // Extract PDC items with entry info
    const pdcItems = [];
    entries.forEach((entry) => {
      entry.cash.forEach((cashItem, index) => {
        if (cashItem.isPDC && cashItem.pdcStatus === "pending") {
          pdcItems.push({
            entryId: entry._id,
            voucherCode: entry.voucherCode,
            type: entry.type,
            party: entry.party,
            cashItemIndex: index,
            chequeNo: cashItem.chequeNo,
            chequeDate: cashItem.chequeDate,
            amount: cashItem.amount,
            currency: cashItem.currency,
            chequeBank: cashItem.chequeBank,
            fxRate: cashItem.fxRate,
            fxBaseRate: cashItem.fxBaseRate,
            fxGain: cashItem.fxGain,
            fxLoss: cashItem.fxLoss,
          });
        }
      });
    });

    res.json({ success: true, data: pdcItems });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get PDCs due today (for reminder/auto-processing)
 */
const getPDCsDueToday = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const entries = await Entry.find({
      "cash.isPDC": true,
      "cash.pdcStatus": "pending",
      "cash.chequeDate": { $gte: today, $lt: tomorrow },
    })
      .populate("party", "customerName accountCode")
      .populate("cash.currency", "currencyCode")
      .populate("cash.chequeBank", "customerName accountCode");

    const pdcItems = [];
    entries.forEach((entry) => {
      entry.cash.forEach((cashItem, index) => {
        if (
          cashItem.isPDC &&
          cashItem.pdcStatus === "pending" &&
          cashItem.chequeDate >= today &&
          cashItem.chequeDate < tomorrow
        ) {
          pdcItems.push({
            entryId: entry._id,
            voucherCode: entry.voucherCode,
            type: entry.type,
            party: entry.party,
            cashItemIndex: index,
            chequeNo: cashItem.chequeNo,
            chequeDate: cashItem.chequeDate,
            amount: cashItem.amount,
            currency: cashItem.currency,
            chequeBank: cashItem.chequeBank,
          });
        }
      });
    });

    res.json({ success: true, data: pdcItems });
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
  // PDC Management
  clearPDC,
  bouncePDC,
  getPendingPDCs,
  getPDCsDueToday,
};
