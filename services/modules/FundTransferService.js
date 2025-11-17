// services/modules/FundTransferService.js
import Registry from "../../models/modules/Registry.js";
import AccountType from "../../models/modules/AccountType.js";
import FundTransfer from "../../models/modules/FundTransfer.js";
import { createAppError } from "../../utils/errorHandler.js";

class FundTransferService {
  // ============================================================
  // GET DEFAULT CASH BALANCE (always update this row)
  // ============================================================
  static getDefaultCashBalance(account) {
    let def = account.balances.cashBalance.find((b) => b.isDefault);

    // If not found → create one
    if (!def) {
      def = {
        currency: null,
        code: "AED",
        amount: 0,
        isDefault: true,
        lastUpdated: new Date(),
      };
      account.balances.cashBalance.push(def);
    }

    return def;
  }

  // ============================================================
  // FUND TRANSFER ENTRY POINT
  // ============================================================
  static async accountToAccountTransfer(
    senderId,
    receiverId,
    value,
    assetType,
    adminId,
    voucher
  ) {
    try {
      if (value === 0) {
        throw createAppError("Transfer value cannot be zero", 400);
      }

      const senderAccount = await AccountType.findById(senderId);
      const receiverAccount = await AccountType.findById(receiverId);

      if (!senderAccount || !receiverAccount) {
        throw createAppError("Sender or receiver account not found", 404);
      }

      // CASH TRANSFER
      if (assetType === "CASH") {
        await handleCashTransfer(
          senderAccount,
          receiverAccount,
          value,
          adminId,
          voucher
        );
      }

      // GOLD TRANSFER
      if (assetType === "GOLD") {
        await handleGoldTransfer(
          senderAccount,
          receiverAccount,
          value,
          adminId,
          voucher
        );
      }
    } catch (error) {
      throw error;
    }
  }

  // ============================================================
  // OPENING BALANCE TRANSFER
  // ============================================================
  static async openingBalanceTransfer(
    receiverId,
    value,
    adminId,
    assetType,
    voucher
  ) {
    try {
      const isCredit = value > 0;
      const isDebit = value < 0;
      const absoluteValue = Math.abs(value);

      const receiverAccount = await AccountType.findById(receiverId);
      if (!receiverAccount)
        throw createAppError("Receiver account not found", 404);

      // CHECK EXISTING OPENING BALANCE
      const existingOpening = await Registry.findOne({
        party: receiverId,
        type:
          assetType === "CASH"
            ? "OPENING_CASH_BALANCE"
            : "OPENING_GOLD_BALANCE",
      });

      // ============================================================
      // UPDATE EXISTING OPENING BALANCE
      // ============================================================
      if (existingOpening) {
        const revertValue = existingOpening.credit || -existingOpening.debit;

        if (assetType === "CASH") {
          const cash =
            FundTransferService.getDefaultCashBalance(receiverAccount);
          cash.amount -= revertValue;
          cash.amount += value;
          cash.lastUpdated = new Date();
        } else {
          receiverAccount.balances.goldBalance.totalGrams -= revertValue;
          receiverAccount.balances.goldBalance.totalGrams += value;
        }

        const updatedRunningBalance =
          assetType === "CASH"
            ? FundTransferService.getDefaultCashBalance(receiverAccount).amount
            : receiverAccount.balances.goldBalance.totalGrams;

        const previousBalance = updatedRunningBalance - value;

        await Registry.updateMany(
          { party: receiverId },
          {
            $set: {
              value: absoluteValue,
              credit: isCredit ? absoluteValue : 0,
              debit: isDebit ? absoluteValue : 0,
              runningBalance: updatedRunningBalance,
              previousBalance,
              updatedAt: new Date(),
            },
          }
        );

        await FundTransfer.updateMany(
          {
            "receivingParty.party": receiverId,
          },
          {
            $set: {
              value: absoluteValue,
              receivingParty: {
                party: receiverId,
                credit: isCredit ? absoluteValue : 0,
              },
              sendingParty: {
                party: null,
                debit: isDebit ? absoluteValue : 0,
              },
            },
          }
        );

        await receiverAccount.save();
        return;
      }

      // ============================================================
      // NEW OPENING BALANCE (CASH)
      // ============================================================
      if (assetType === "CASH") {
        const cash = FundTransferService.getDefaultCashBalance(receiverAccount);

        const previousBalance = cash.amount;
        cash.amount += value;
        cash.lastUpdated = new Date();

        const runningBalance = cash.amount;

        const fundTransfer = new FundTransfer({
          transactionId: await FundTransfer.generateTransactionId(),
          description: `OPENING CASH BALANCE FOR ${receiverAccount.customerName}`,
          value: absoluteValue,
          assetType: "CASH",
          receivingParty: { party: receiverAccount._id, credit: absoluteValue },
          sendingParty: { party: null, debit: isDebit ? absoluteValue : 0 },
          voucherNumber: voucher.voucherCode,
          voucherType: voucher.voucherType,
          isBullion: false,
          createdBy: adminId,
          type: "OPENING-BALANCE",
        });

        const regCash = new Registry({
          transactionType: "OPENING-BALANCE",
          transactionId: await Registry.generateTransactionId(),
          type: "OPENING_CASH_BALANCE",
          description: `OPENING BALANCE FOR ${receiverAccount.customerName}`,
          value: absoluteValue,
          runningBalance,
          previousBalance,
          credit: isCredit ? absoluteValue : 0,
          debit: isDebit ? absoluteValue : 0,
          reference: voucher.voucherCode,
          createdBy: adminId,
          party: receiverAccount._id,
          TransferTransactionId: fundTransfer._id,
        });

        await receiverAccount.save();
        await fundTransfer.save();
        await regCash.save();
      }

      // ============================================================
      // NEW OPENING BALANCE (GOLD)
      // ============================================================
      if (assetType === "GOLD") {
        const previousBalance = receiverAccount.balances.goldBalance.totalGrams;
        receiverAccount.balances.goldBalance.totalGrams += value;
        const runningBalance = receiverAccount.balances.goldBalance.totalGrams;

        const fundTransfer = new FundTransfer({
          transactionId: await FundTransfer.generateTransactionId(),
          description: `OPENING GOLD BALANCE FOR ${receiverAccount.customerName}`,
          value: absoluteValue,
          assetType: "GOLD",
          receivingParty: { party: receiverAccount._id, credit: absoluteValue },
          sendingParty: { party: null, debit: isDebit ? absoluteValue : 0 },
          voucherNumber: voucher.voucherCode,
          voucherType: voucher.voucherType,
          isBullion: false,
          createdBy: adminId,
          type: "OPENING-BALANCE",
        });

        const regGold = new Registry({
          transactionType: "OPENING-BALANCE",
          transactionId: await Registry.generateTransactionId(),
          type: "OPENING_GOLD_BALANCE",
          description: `OPENING GOLD FOR ${receiverAccount.customerName}`,
          value: absoluteValue,
          runningBalance,
          previousBalance,
          credit: isCredit ? absoluteValue : 0,
          debit: isDebit ? absoluteValue : 0,
          reference: voucher.voucherCode,
          createdBy: adminId,
          party: receiverAccount._id,
          TransferTransactionId: fundTransfer._id,
        });

        await receiverAccount.save();
        await fundTransfer.save();
        await regGold.save();
      }
    } catch (error) {
      throw error;
    }
  }

  // ============================================================
  // GET ALL TRANSFERS
  // ============================================================
  static async getFundTransfers() {
    return await FundTransfer.find({})
      .populate("receivingParty.party")
      .populate("sendingParty.party")
      .populate("createdBy")
      .populate("updatedBy")
      .sort({ createdAt: -1 });
  }
}

// ===================================================================
// INTERNAL — HANDLE CASH TRANSFER
// ===================================================================
async function handleCashTransfer(
  senderAccount,
  receiverAccount,
  value,
  adminId,
  voucher
) {
  const amount = Math.abs(value);
  const isNegative = value < 0;

  const senderCash = FundTransferService.getDefaultCashBalance(senderAccount);
  const receiverCash =
    FundTransferService.getDefaultCashBalance(receiverAccount);

  const prevSenderBal = senderCash.amount;
  const prevReceiverBal = receiverCash.amount;

  // APPLY TRANSFER
  if (isNegative) {
    senderCash.amount += amount;
    receiverCash.amount -= amount;
  } else {
    senderCash.amount -= amount;
    receiverCash.amount += amount;
  }

  senderCash.lastUpdated = new Date();
  receiverCash.lastUpdated = new Date();

  // FUND TRANSFER RECORD
  const fundTransfer = new FundTransfer({
    transactionId: await FundTransfer.generateTransactionId(),
    description: `CASH TRANSFER FROM ${senderAccount.customerName} TO ${receiverAccount.customerName}`,
    value,
    assetType: "CASH",
    receivingParty: {
      party: isNegative ? senderAccount._id : receiverAccount._id,
      credit: amount,
    },
    sendingParty: {
      party: isNegative ? receiverAccount._id : senderAccount._id,
      debit: amount,
    },
    voucherNumber: voucher.voucherCode,
    voucherType: voucher.voucherType,
    createdBy: adminId,
  });

  // REGISTRY — SENDER
  const regSender = new Registry({
    transactionType: "TRANSFER",
    transactionId: await Registry.generateTransactionId(),
    type: "PARTY_CASH_BALANCE",
    description: fundTransfer.description,
    value: amount,
    previousBalance: prevSenderBal,
    runningBalance: senderCash.amount,
    debit: amount,
    reference: voucher.voucherCode,
    createdBy: adminId,
    party: senderAccount._id,
    TransferTransactionId: fundTransfer._id,
  });

  // REGISTRY — RECEIVER
  const regReceiver = new Registry({
    transactionType: "TRANSFER",
    transactionId: await Registry.generateTransactionId(),
    type: "PARTY_CASH_BALANCE",
    description: fundTransfer.description,
    value: amount,
    previousBalance: prevReceiverBal,
    runningBalance: receiverCash.amount,
    credit: amount,
    reference: voucher.voucherCode,
    createdBy: adminId,
    party: receiverAccount._id,
    TransferTransactionId: fundTransfer._id,
  });

  await senderAccount.save();
  await receiverAccount.save();
  await fundTransfer.save();
  await regSender.save();
  await regReceiver.save();
}

// ===================================================================
// INTERNAL — HANDLE GOLD TRANSFER (UNCHANGED LOGIC)
// ===================================================================
async function handleGoldTransfer(
  senderAccount,
  receiverAccount,
  value,
  adminId,
  voucher
) {
  const amount = Math.abs(value);
  const isNegative = value < 0;

  const prevSender = senderAccount.balances.goldBalance.totalGrams;
  const prevReceiver = receiverAccount.balances.goldBalance.totalGrams;

  if (isNegative) {
    senderAccount.balances.goldBalance.totalGrams += amount;
    receiverAccount.balances.goldBalance.totalGrams -= amount;
  } else {
    senderAccount.balances.goldBalance.totalGrams -= amount;
    receiverAccount.balances.goldBalance.totalGrams += amount;
  }

  const fundTransfer = new FundTransfer({
    transactionId: await FundTransfer.generateTransactionId(),
    description: `GOLD TRANSFER FROM ${senderAccount.customerName} TO ${receiverAccount.customerName}`,
    value,
    assetType: "GOLD",
    receivingParty: {
      party: isNegative ? senderAccount._id : receiverAccount._id,
      credit: amount,
    },
    sendingParty: {
      party: isNegative ? receiverAccount._id : senderAccount._id,
      debit: amount,
    },
    voucherNumber: voucher.voucherCode,
    voucherType: voucher.voucherType,
    createdBy: adminId,
  });

  const regSender = new Registry({
    transactionType: "TRANSFER",
    transactionId: await Registry.generateTransactionId(),
    type: "PARTY_GOLD_BALANCE",
    description: fundTransfer.description,
    value: amount,
    previousBalance: prevSender,
    runningBalance: senderAccount.balances.goldBalance.totalGrams,
    debit: amount,
    reference: voucher.voucherCode,
    createdBy: adminId,
    party: senderAccount._id,
    TransferTransactionId: fundTransfer._id,
  });

  const regReceiver = new Registry({
    transactionType: "TRANSFER",
    transactionId: await Registry.generateTransactionId(),
    type: "PARTY_GOLD_BALANCE",
    description: fundTransfer.description,
    value: amount,
    previousBalance: prevReceiver,
    runningBalance: receiverAccount.balances.goldBalance.totalGrams,
    credit: amount,
    reference: voucher.voucherCode,
    createdBy: adminId,
    party: receiverAccount._id,
    TransferTransactionId: fundTransfer._id,
  });

  await senderAccount.save();
  await receiverAccount.save();
  await fundTransfer.save();
  await regSender.save();
  await regReceiver.save();
}

export default FundTransferService;
