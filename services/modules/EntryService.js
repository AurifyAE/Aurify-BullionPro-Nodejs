import Registry from "../../models/modules/Registry.js";
import Account from "../../models/modules/AccountType.js";
import CurrencyMaster from "../../models/modules/CurrencyMaster.js";
import RegistryService from "./RegistryService.js";
import InventoryService from "./inventoryService.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import { createAppError } from "../../utils/errorHandler.js";
import Entry from "../../models/modules/EntryModel.js";

class EntryService {
  // Helper to check if date is today
  static isToday(date) {
    const d = new Date(date);
    const today = new Date();
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  }

  // Helper to check if date is in the future (post-dated)
  static isPostDated(date) {
    if (!date) return false;
    const d = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d > today;
  }

  // Calculate FX Gain/Loss
  // For cash-payment: if fxBaseRate > fxRate = Loss (paying less than market)
  // For cash-receipt: if fxBaseRate > fxRate = Gain (receiving more than market)
  static calculateFxGainLoss(amount, fxRate, fxBaseRate, isPayment = true) {
    const givenValue = amount * fxRate;
    const marketValue = amount * fxBaseRate;
    const diff = marketValue - givenValue;

    if (isPayment) {
      // Payment: positive diff = loss (we paid less, party received less)
      // negative diff = gain (we paid more, party received more)
      return {
        fxGain: diff < 0 ? Math.abs(diff) : 0,
        fxLoss: diff > 0 ? diff : 0,
      };
    } else {
      // Receipt: positive diff = gain (we received more value)
      // negative diff = loss (we received less value)
      return {
        fxGain: diff > 0 ? diff : 0,
        fxLoss: diff < 0 ? Math.abs(diff) : 0,
      };
    }
  }

  // Ensure a balance record exists
  static async ensureCashBalance(account, currencyId) {
    let bal = account.balances.cashBalance.find(
      (b) => b.currency.toString() === currencyId.toString()
    );

    if (!bal) {
      bal = { currency: currencyId, amount: 0, lastUpdated: new Date() };
      account.balances.cashBalance.push(bal);
    }

    return bal;
  }

  static async updateAccountCashBalance(accountId, currencyId, amount) {
    if (!accountId) return;
    const acc = await Account.findById(accountId);
    if (!acc) return;

    const bal = await this.ensureCashBalance(acc, currencyId);

    bal.amount += amount;
    bal.lastUpdated = new Date();

    await acc.save();
  }

  // ------------------------------------------------------------------------
  // METAL RECEIPT
  // ------------------------------------------------------------------------
  static async handleMetalReceipt(entry) {
    if (entry.status !== "approved") return;

    const account = await Account.findById(entry.party);
    if (!account) throw createAppError("Party not found", 404);

    for (const item of entry.stockItems) {
      const prev = account.balances.goldBalance?.totalGrams || 0;

      account.balances.goldBalance = {
        totalGrams: prev + item.purityWeight,
        lastUpdated: new Date(),
      };

      const txId = await Registry.generateTransactionId();
      const desc = item.remarks || "Metal receipt";

      await Registry.create([
        {
          transactionType: entry.type,
          transactionId: txId,
          EntryTransactionId: entry._id,
          type: "GOLD_STOCK",
          description: desc,
          value: item.grossWeight,
          credit: item.grossWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
        },
        {
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "GOLD",
          description: desc,
          value: item.purityWeight,
          debit: item.purityWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
        },
        {
          transactionType: entry.type,
          transactionId: txId,
          EntryTransactionId: entry._id,
          type: "PARTY_GOLD_BALANCE",
          description: desc,
          value: item.purityWeight,
          credit: item.purityWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
        },
      ]);

      await InventoryService.updateInventory(
        {
          stockItems: [
            {
              stockCode: { _id: item.stock },
              grossWeight: item.grossWeight,
              purity: item.purity,
              pieces: item.pieces || 0,
              voucherNumber: entry.voucherCode,
              transactionType: "metalReceipt",
            },
          ],
        },
        false,
        entry.enteredBy
      );
    }

    await account.save();
  }

  // ------------------------------------------------------------------------
  // METAL PAYMENT
  // ------------------------------------------------------------------------
  static async handleMetalPayment(entry) {
    if (entry.status !== "approved") return;

    const account = await Account.findById(entry.party);
    if (!account) throw createAppError("Party not found", 404);

    for (const item of entry.stockItems) {
      const prev = account.balances.goldBalance?.totalGrams || 0;

      account.balances.goldBalance = {
        totalGrams: prev - item.purityWeight,
        lastUpdated: new Date(),
      };

      const txId = await Registry.generateTransactionId();
      const desc = item.remarks || "Metal payment";

      await Registry.create([
        {
          transactionType: entry.type,
          transactionId: txId,
          EntryTransactionId: entry._id,
          type: "GOLD_STOCK",
          description: desc,
          value: item.grossWeight,
          debit: item.grossWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
        },
        {
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "GOLD",
          description: desc,
          value: item.purityWeight,
          credit: item.purityWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
        },
        {
          transactionType: entry.type,
          transactionId: txId,
          EntryTransactionId: entry._id,
          type: "PARTY_GOLD_BALANCE",
          description: desc,
          value: item.purityWeight,
          debit: item.purityWeight,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
        },
      ]);

      await InventoryService.updateInventory(
        {
          stockItems: [
            {
              stockCode: { _id: item.stock },
              grossWeight: item.grossWeight,
              purity: item.purity,
              pieces: item.pieces || 0,
              voucherNumber: entry.voucherCode,
              transactionType: "metalPayment",
            },
          ],
        },
        true,
        entry.enteredBy
      );
    }

    await account.save();
  }

  // ------------------------------------------------------------------------
  // CASH RECEIPT/PAYMENT with FX Gain/Loss and PDC handling
  // ------------------------------------------------------------------------
  static async handleCashTransaction(entry, isReceipt = true) {
    if (entry.status !== "approved") return;

    const registryRows = [];

    for (const c of entry.cash) {
      const currency = await CurrencyMaster.findById(c.currency);
      const amount = Number(c.amount);
      const fxRate = Number(c.fxRate) || 1;
      const fxBaseRate = Number(c.fxBaseRate) || 1;

      // Check if this is a post-dated cheque
      const isCheque = c.cashType === "cheque";
      const isPostDatedCheque = isCheque && this.isPostDated(c.chequeDate);

      // For post-dated cheques, use PDC accounts instead of actual bank account
      if (isPostDatedCheque) {
        // Get PDC accounts from the cheque bank's bankDetails
        const chequeBank = await Account.findById(c.chequeBank);
        if (chequeBank && chequeBank.bankDetails?.length > 0) {
          const bankDetail = chequeBank.bankDetails[0];
          c.pdcIssueAccount = bankDetail.pdcIssue;
          c.pdcReceiptAccount = bankDetail.pdcReceipt;
        }
        c.isPDC = true;
        c.pdcStatus = "pending";
      }

      // Calculate FX Gain/Loss
      const { fxGain, fxLoss } = this.calculateFxGainLoss(
        amount,
        fxRate,
        fxBaseRate,
        !isReceipt // isPayment = !isReceipt
      );
      c.fxGain = fxGain;
      c.fxLoss = fxLoss;

      const partyChange = isReceipt ? amount : -amount;
      const oppChange = isReceipt ? -amount : amount;

      // Party balance update (always update party balance)
      await this.updateAccountCashBalance(entry.party, c.currency, partyChange);

      // Determine opposite account based on PDC status
      let opposite = null;
      let pdcAccount = null;

      if (isCheque) {
        if (isPostDatedCheque) {
          // For PDC: use PDC Issue (payment) or PDC Receipt (receipt) account
          pdcAccount = isReceipt ? c.pdcReceiptAccount : c.pdcIssueAccount;
          // Don't update actual bank account yet - update PDC account
          if (pdcAccount) {
            await this.updateAccountCashBalance(pdcAccount, c.currency, oppChange);
          }
        } else {
          // Current date cheque - use actual bank account
          opposite = c.chequeBank || c.account;
          if (opposite) {
            await this.updateAccountCashBalance(opposite, c.currency, oppChange);
          }
        }
      } else if (["cash", "bank", "card"].includes(c.cashType)) {
        opposite = c.chequeBank || c.account;
        if (opposite) {
          await this.updateAccountCashBalance(opposite, c.currency, oppChange);
        }
      } else if (c.cashType === "transfer") {
        opposite = c.transferAccount;
        if (opposite) {
          await this.updateAccountCashBalance(opposite, c.currency, oppChange);
        }
      }

      // Build description with remarks
      const remarksPart = c.remarks ? ` - ${c.remarks}` : "";
      const desc = `${isReceipt ? "Received" : "Paid"} ${amount} ${
        currency.currencyCode
      } via ${c.cashType}${isPostDatedCheque ? " (PDC)" : ""}${remarksPart}`;

      // Registry Party
      registryRows.push({
        transactionType: entry.type,
        transactionId: await Registry.generateTransactionId(),
        EntryTransactionId: entry._id,
        type: "PARTY_CASH_BALANCE",
        description: desc,
        value: amount,
        [isReceipt ? "credit" : "debit"]: amount,
        reference: entry.voucherCode,
        createdBy: entry.enteredBy,
        party: entry.party,
        currency: c.currency,
      });

      // Registry for opposite account (Bank/Cash/PDC)
      if (isPostDatedCheque && pdcAccount) {
        // PDC Account registry entry - use PDC_ENTRY type
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "PDC_ENTRY",
          description: `${desc} - ${isReceipt ? "PDC Receipt" : "PDC Issue"}`,
          value: amount,
          [isReceipt ? "debit" : "credit"]: amount,
          [isReceipt ? "cashDebit" : "cashCredit"]: amount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: pdcAccount,
          currency: c.currency,
        });
      } else if (opposite) {
        // Opposite account registry (Bank/Cash account) - BULLION_ENTRY
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "BULLION_ENTRY",
          description: desc,
          value: amount,
          [isReceipt ? "debit" : "credit"]: amount,
          [isReceipt ? "cashDebit" : "cashCredit"]: amount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: opposite,
          currency: c.currency,
        });
      }

      // FX Gain/Loss registry entries - use FX_EXCHANGE type
      if (fxGain > 0) {
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "FX_EXCHANGE",
          description: `Foreign Exchange Gain - ${isReceipt ? "Receipt from" : "Payment to"} Party (Rate: ${fxRate} vs Base: ${fxBaseRate})`,
          value: fxGain,
          credit: fxGain,
          cashCredit: fxGain,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
          currency: c.currency,
        });
      }

      if (fxLoss > 0) {
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "FX_EXCHANGE",
          description: `Foreign Exchange Loss - ${isReceipt ? "Receipt from" : "Payment to"} Party (Rate: ${fxRate} vs Base: ${fxBaseRate})`,
          value: fxLoss,
          debit: fxLoss,
          cashDebit: fxLoss,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
          currency: c.currency,
        });
      }

      // VAT
      if (c.vatAmount > 0) {
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "VAT_AMOUNT",
          description: `VAT ${c.vatPercentage}%`,
          value: c.vatAmount,
          [isReceipt ? "debit" : "credit"]: c.vatAmount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
          party: entry.party,
        });
      }

      // Card charge
      if (c.cashType === "card" && c.cardChargeAmount > 0) {
        registryRows.push({
          transactionType: entry.type,
          transactionId: await Registry.generateTransactionId(),
          EntryTransactionId: entry._id,
          type: "CARD_CHARGE",
          description: `Card charge ${c.cardChargePercent}%`,
          value: c.cardChargeAmount,
          debit: c.cardChargeAmount,
          reference: entry.voucherCode,
          createdBy: entry.enteredBy,
        });
      }
    }

    await Registry.create(registryRows);
    
    // Save updated cash items with FX and PDC info
    await entry.save();
  }

  // ------------------------------------------------------------------------
  // CLEAR POST-DATED CHEQUE (when cheque date arrives)
  // ------------------------------------------------------------------------
  static async clearPDC(entryId, cashItemIndex, adminId) {
    const entry = await Entry.findById(entryId);
    if (!entry) throw createAppError("Entry not found", 404);

    const cashItem = entry.cash[cashItemIndex];
    if (!cashItem) throw createAppError("Cash item not found", 404);

    if (!cashItem.isPDC || cashItem.pdcStatus !== "pending") {
      throw createAppError("This is not a pending PDC", 400);
    }

    const currency = await CurrencyMaster.findById(cashItem.currency);
    const amount = Number(cashItem.amount);
    const isReceipt = entry.type.includes("receipt");

    const registryRows = [];

    // Reverse PDC account balance
    const pdcAccount = isReceipt ? cashItem.pdcReceiptAccount : cashItem.pdcIssueAccount;
    if (pdcAccount) {
      // Reverse the PDC account entry
      const pdcReverseChange = isReceipt ? amount : -amount;
      await this.updateAccountCashBalance(pdcAccount, cashItem.currency, pdcReverseChange);

      // Registry: Reverse PDC account entry - use PDC_ENTRY type
      registryRows.push({
        transactionType: entry.type,
        transactionId: await Registry.generateTransactionId(),
        EntryTransactionId: entry._id,
        type: "PDC_ENTRY",
        description: `PDC Cleared - ${isReceipt ? "PDC Receipt" : "PDC Issue"} reversed - ${currency.currencyCode} ${amount}`,
        value: amount,
        [isReceipt ? "credit" : "debit"]: amount,
        [isReceipt ? "cashCredit" : "cashDebit"]: amount,
        reference: entry.voucherCode,
        createdBy: adminId,
        party: pdcAccount,
        currency: cashItem.currency,
      });
    }

    // Credit actual bank account
    const bankAccount = cashItem.chequeBank || cashItem.account;
    if (bankAccount) {
      const bankChange = isReceipt ? -amount : amount;
      await this.updateAccountCashBalance(bankAccount, cashItem.currency, bankChange);

      // Registry: Credit bank account - use BULLION_ENTRY type
      registryRows.push({
        transactionType: entry.type,
        transactionId: await Registry.generateTransactionId(),
        EntryTransactionId: entry._id,
        type: "BULLION_ENTRY",
        description: `PDC Cleared to Bank - ${currency.currencyCode} ${amount}`,
        value: amount,
        [isReceipt ? "debit" : "credit"]: amount,
        [isReceipt ? "cashDebit" : "cashCredit"]: amount,
        reference: entry.voucherCode,
        createdBy: adminId,
        party: bankAccount,
        currency: cashItem.currency,
      });
    }

    await Registry.create(registryRows);

    // Update PDC status
    cashItem.pdcStatus = "cleared";
    await entry.save();

    return entry;
  }

  // ------------------------------------------------------------------------
  // BOUNCE POST-DATED CHEQUE
  // ------------------------------------------------------------------------
  static async bouncePDC(entryId, cashItemIndex, adminId) {
    const entry = await Entry.findById(entryId);
    if (!entry) throw createAppError("Entry not found", 404);

    const cashItem = entry.cash[cashItemIndex];
    if (!cashItem) throw createAppError("Cash item not found", 404);

    if (!cashItem.isPDC || cashItem.pdcStatus !== "pending") {
      throw createAppError("This is not a pending PDC", 400);
    }

    const currency = await CurrencyMaster.findById(cashItem.currency);
    const amount = Number(cashItem.amount);
    const isReceipt = entry.type.includes("receipt");

    const registryRows = [];

    // Reverse PDC account balance
    const pdcAccount = isReceipt ? cashItem.pdcReceiptAccount : cashItem.pdcIssueAccount;
    if (pdcAccount) {
      const pdcReverseChange = isReceipt ? amount : -amount;
      await this.updateAccountCashBalance(pdcAccount, cashItem.currency, pdcReverseChange);

      // PDC Bounced - use PDC_ENTRY type
      registryRows.push({
        transactionType: entry.type,
        transactionId: await Registry.generateTransactionId(),
        EntryTransactionId: entry._id,
        type: "PDC_ENTRY",
        description: `PDC Bounced - ${isReceipt ? "PDC Receipt" : "PDC Issue"} reversed - ${currency.currencyCode} ${amount}`,
        value: amount,
        [isReceipt ? "credit" : "debit"]: amount,
        [isReceipt ? "cashCredit" : "cashDebit"]: amount,
        reference: entry.voucherCode,
        createdBy: adminId,
        party: pdcAccount,
        currency: cashItem.currency,
      });
    }

    // Reverse party balance
    const partyReverseChange = isReceipt ? -amount : amount;
    await this.updateAccountCashBalance(entry.party, cashItem.currency, partyReverseChange);

    // Party balance reversal - use PARTY_CASH_BALANCE type
    registryRows.push({
      transactionType: entry.type,
      transactionId: await Registry.generateTransactionId(),
      EntryTransactionId: entry._id,
      type: "PARTY_CASH_BALANCE",
      description: `PDC Bounced - Party balance reversed - ${currency.currencyCode} ${amount}`,
      value: amount,
      [isReceipt ? "debit" : "credit"]: amount,
      [isReceipt ? "cashDebit" : "cashCredit"]: amount,
      reference: entry.voucherCode,
      createdBy: adminId,
      party: entry.party,
      currency: cashItem.currency,
    });

    await Registry.create(registryRows);

    // Update PDC status
    cashItem.pdcStatus = "bounced";
    await entry.save();

    return entry;
  }

  // ------------------------------------------------------------------------
  // REVERSE CASH
  // ------------------------------------------------------------------------
  static async reverseCashTransaction(entry, isReceipt = true) {
    const partyAcc = await Account.findById(entry.party);
    if (!partyAcc) return;

    for (const c of entry.cash) {
      if (c.cashType === "cheque") continue;

      const partyBal = await this.ensureCashBalance(partyAcc, c.currency);
      partyBal.amount += isReceipt ? -c.amount : c.amount;
      partyBal.lastUpdated = new Date();

      let opposite = null;
      if (["cash", "bank", "card", "cheque"].includes(c.cashType)) {
        opposite = c.chequeBank || c.account;
      }
      if (c.cashType === "transfer") {
        opposite = c.transferAccount;
      }

      if (opposite) {
        await this.updateAccountCashBalance(
          opposite,
          c.currency,
          isReceipt ? c.amount : -c.amount
        );
      }
    }

    await partyAcc.save();
  }

  // ------------------------------------------------------------------------
  // REVERSE METAL
  // ------------------------------------------------------------------------
  static async reverseMetal(entry, isReceipt = true) {
    const account = await Account.findById(entry.party);
    if (!account) return;

    for (const item of entry.stockItems) {
      const prev = account.balances.goldBalance?.totalGrams || 0;

      account.balances.goldBalance = {
        totalGrams: prev + (isReceipt ? -item.purityWeight : item.purityWeight),
        lastUpdated: new Date(),
      };

      await InventoryService.updateInventory(
        {
          stockItems: [
            {
              stockCode: { _id: item.stock },
              grossWeight: item.grossWeight,
              purity: item.purity,
              pieces: item.pieces || 0,
              voucherNumber: entry.voucherCode,
              transactionType: isReceipt ? "metalPayment" : "metalReceipt",
            },
          ],
        },
        isReceipt,
        entry.enteredBy
      );
    }

    await account.save();
  }

  // ------------------------------------------------------------------------
  // CLEANUP REGISTRY + INVENTORY LOGS
  // ------------------------------------------------------------------------
  static async cleanup(voucherCode) {
    await Promise.all([
      RegistryService.deleteRegistryByVoucher(voucherCode),
      InventoryLog.deleteMany({ voucherCode }),
    ]);
  }

  // ------------------------------------------------------------------------
  // FETCH ENTRY BY ID
  // ------------------------------------------------------------------------
  static async getEntryById(id) {
    return await Entry.findById(id)
      .lean()
      .populate("party", "customerName accountCode")
      .populate("enteredBy", "name")
      .populate("cash.currency", "currencyCode")
      .populate("cash.account", "customerName accountCode")
      .populate("cash.chequeBank", "customerName accountCode")
      .populate("cash.transferAccount", "customerName accountCode")
      .populate("stockItems.stock", "code name")
      .populate("attachments.uploadedBy", "name");
  }

  // ------------------------------------------------------------------------
  // FILTER LIST
  // ------------------------------------------------------------------------
  static async getEntriesByType({
    type,
    page = 1,
    limit = 20,
    search,
    startDate,
    endDate,
    status,
  }) {
    const q = { type };

    if (status) q.status = status;

    if (startDate || endDate) {
      q.voucherDate = {};
      if (startDate) q.voucherDate.$gte = new Date(startDate);
      if (endDate) q.voucherDate.$lte = new Date(endDate);
    }

    if (search) {
      const partyIds = await Account.find({
        customerName: { $regex: search, $options: "i" },
      }).select("_id");

      q.$or = [
        { voucherCode: { $regex: search, $options: "i" } },
        { party: { $in: partyIds.map((p) => p._id) } },
      ];
    }

    const [entries, total] = await Promise.all([
      Entry.find(q)
        .lean()
        .populate("party", "customerName")
        .populate("enteredBy", "name")
        .populate("cash.currency", "currencyCode")
        .populate("stockItems.stock", "code")
        .sort({ voucherDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit),

      Entry.countDocuments(q),
    ]);

    return { entries, total, page, pages: Math.ceil(total / limit) };
  }
}

export default EntryService;
