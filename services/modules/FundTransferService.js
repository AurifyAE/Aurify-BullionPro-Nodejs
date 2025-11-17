import Registry from "../../models/modules/Registry.js";
import AccountType from "../../models/modules/AccountType.js";
import FundTransfer from "../../models/modules/FundTransfer.js";
import { createAppError } from "../../utils/errorHandler.js"; // Assuming createAppError is exported from a utility file

class FundTransferService {
  static async accountToAccountTransfer(
    senderId,
    receiverId,
    value,
    assetType,
    adminId,
    voucher
  ) {
    try {
      // Remove or modify the negative value validation
      // Allow negative values for reverse transfers
      if (value === 0) {
        throw createAppError(
          "Transfer value cannot be zero",
          400,
          "INVALID_VALUE"
        );
      }

      const senderAccount = await AccountType.findById(senderId);
      const receiverAccount = await AccountType.findById(receiverId);

      if (!senderAccount || !receiverAccount) {
        throw createAppError(
          "Sender or receiver account not found",
          404,
          "ACCOUNT_NOT_FOUND"
        );
      }

      // Check if accounts have sufficient balance for the transfer
      const transferAmount = Math.abs(value);
      const isNegativeTransfer = value < 0;
      if (assetType === "CASH") {

        await handleCashTransfer(
          senderAccount,
          receiverAccount,
          value,
          adminId,
          voucher
        );
      }

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
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((err) => err.message);
        throw createAppError(messages.join(", "), 400, "VALIDATION_ERROR");
      }
      throw error;
    }
  }

  static async openingBalanceTransfer(receiverId, value, adminId, assetType, voucher) {
    
    try {
      // ✅ Move these up top to avoid ReferenceError
      const isCredit = value > 0;
      const isDebit = value < 0;
      const absoluteValue = Math.abs(value);

      const receiverAccount = await AccountType.findById(receiverId);
      if (!receiverAccount) {
        throw createAppError("Receiver account not found", 404, "ACCOUNT_NOT_FOUND");
      }

      // Check if opening balance already exists
      const existingOpening = await Registry.findOne({
        party: receiverId,
        type: assetType === "CASH" ? "OPENING_CASH_BALANCE" : "OPENING_GOLD_BALANCE",
      });

      if (existingOpening) {
        if (!voucher?.isConfirmed) {
          const error = new Error("Opening balance already exists for this party.");
          error.code = "OPENING_EXISTS";
          error.status = 200;
          error.data = { alreadyExists: true };
          throw error;
        }

        // 🟡 Step 2: Revert previous value
        const revertValue = existingOpening.credit || -existingOpening.debit;

        if (assetType === "CASH") {
          receiverAccount.balances.cashBalance.amount -= revertValue;
          receiverAccount.balances.cashBalance.amount += value;
        } else {
          receiverAccount.balances.goldBalance.totalGrams -= revertValue;
          receiverAccount.balances.goldBalance.totalGrams += value;
        }

        const updatedRunningBalance =
          assetType === "CASH"
            ? receiverAccount.balances.cashBalance.amount
            : receiverAccount.balances.goldBalance.totalGrams;

        const previousBalance = updatedRunningBalance - value;
        // 🟡 Step 3: Update Registry
        const a = await Registry.updateMany(
          {
            party: receiverId,
          },
          {
            $set: {
              value: absoluteValue,
              credit: isCredit ? absoluteValue : 0,
              debit: isDebit ? absoluteValue : 0,
              runningBalance: updatedRunningBalance,
              previousBalance: previousBalance,
              updatedAt: new Date(),
            },
          }
        );
       

        // 🟡 Step 4: Update FundTransfer
        await FundTransfer.updateMany(
          {
            'receivingParty.party': receiverId, 
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
              updatedAt: new Date(),
            },
          }
        );

        await receiverAccount.save();
        return;
      }

      // ➕ Handle new opening balance
      if (assetType === "CASH") {
        const previousBalance = receiverAccount.balances.cashBalance.amount;
        receiverAccount.balances.cashBalance.amount += value;
        const runningBalance = receiverAccount.balances.cashBalance.amount;

        const fundTransfer = new FundTransfer({
          transactionId: await FundTransfer.generateTransactionId(),
          description: `OPENING CASH BALANCE FOR ${receiverAccount.customerName}`,
          value: absoluteValue,
          assetType: "CASH",
          receivingParty: {
            party: receiverAccount._id,
            credit: isCredit ? absoluteValue : 0,
          },
          sendingParty: {
            party: null,
            debit: isDebit ? absoluteValue : 0,
          },
          voucherNumber: voucher.voucherCode,
          voucherType: voucher.voucherType,
          isBullion: false,
          createdBy: adminId,
          type: "OPENING-BALANCE",
        });

        const transaction = new Registry({
          transactionId: await Registry.generateTransactionId(),
          type: "PARTY_CASH_BALANCE",
          description: `OPENING BALANCE FOR ${receiverAccount.customerName}`,
          value: absoluteValue,
          runningBalance: runningBalance,
          previousBalance: previousBalance,
          credit: isCredit ? absoluteValue : 0,
          debit: isDebit ? absoluteValue : 0,
          reference: voucher.voucherCode,
          createdBy: adminId,
          party: receiverAccount._id,
          TransferTransactionId: fundTransfer._id,
        });

        const transactionForParty = new Registry({
          transactionId: await Registry.generateTransactionId(),
          type: "OPENING_CASH_BALANCE",
          description: `OPENING BALANCE FOR ${receiverAccount.customerName}`,
          value: absoluteValue,
          runningBalance: runningBalance,
          previousBalance: previousBalance,
          credit: isCredit ? absoluteValue : 0,
          debit: isDebit ? absoluteValue : 0,
          reference: voucher.voucherCode,
          createdBy: adminId,
          party: receiverAccount._id,
          TransferTransactionId: fundTransfer._id,
        });

        await receiverAccount.save();
        await fundTransfer.save();
        await transactionForParty.save();
        await transaction.save();

      } else if (assetType === "GOLD") {
        const previousBalance = receiverAccount.balances.goldBalance.totalGrams;
        receiverAccount.balances.goldBalance.totalGrams += value;
        const runningBalance = receiverAccount.balances.goldBalance.totalGrams;

        const fundTransfer = new FundTransfer({
          transactionId: await FundTransfer.generateTransactionId(),
          description: `OPENING GOLD BALANCE FOR ${receiverAccount.customerName}`,
          value: absoluteValue,
          assetType: "GOLD",
          receivingParty: {
            party: receiverAccount._id,
            credit: isCredit ? absoluteValue : 0,
          },
          sendingParty: {
            party: null,
            debit: isDebit ? absoluteValue : 0,
          },
          voucherNumber: voucher.voucherCode,
          voucherType: voucher.voucherType,
          isBullion: false,
          createdBy: adminId,
          type: "OPENING-BALANCE",
        });

        const transaction = new Registry({
          transactionId: await Registry.generateTransactionId(),
          type: "PARTY_GOLD_BALANCE",
          description: `OPENING GOLD FOR ${receiverAccount.customerName}`,
          value: absoluteValue,
          runningBalance: runningBalance,
          previousBalance: previousBalance,
          credit: isCredit ? absoluteValue : 0,
          debit: isDebit ? absoluteValue : 0,
          reference: voucher.voucherCode,
          createdBy: adminId,
          party: receiverAccount._id,
          TransferTransactionId: fundTransfer._id,
        });

        const transactionForParty = new Registry({
          transactionId: await Registry.generateTransactionId(),
          type: "OPENING_GOLD_BALANCE",
          description: `OPENING GOLD FOR ${receiverAccount.customerName}`,
          value: absoluteValue,
          runningBalance: runningBalance,
          previousBalance: previousBalance,
          credit: isCredit ? absoluteValue : 0,
          debit: isDebit ? absoluteValue : 0,
          reference: voucher.voucherCode,
          createdBy: adminId,
          party: receiverAccount._id,
          TransferTransactionId: fundTransfer._id,
        });

        await receiverAccount.save();
        await fundTransfer.save();
        await transactionForParty.save();
        await transaction.save();
      }

    } catch (error) {
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((err) => err.message);
        throw createAppError(messages.join(", "), 400, "VALIDATION_ERROR");
      }
      throw error;
    }
  }


  static async getFundTransfers() {
    try {
      return await FundTransfer.find({})
        .populate("receivingParty.party")
        .populate("sendingParty.party")
        .populate("createdBy")
        .populate("updatedBy")
        .sort({ createdAt: -1 });
    } catch (error) {
      throw createAppError("Error fetching fund transfers", 500, "FETCH_ERROR");
    }
  }
}

async function handleCashTransfer(
  senderAccount,
  receiverAccount,
  value,
  adminId,
  voucher
) {
  // Calculate the actual amounts to debit/credit based on value sign
  const transferAmount = Math.abs(value);
  const isNegativeTransfer = value < 0;

  // Store previous balances for registry logging
  const senderPreviousBalance = senderAccount.balances.cashBalance.amount;
  const receiverPreviousBalance = receiverAccount.balances.cashBalance.amount;
  if (isNegativeTransfer) {
    // Negative transfer: sender gets credited, receiver gets debited
    // Example: value = -2000, sender balance = -1000
    // Result: sender = -1000 + 2000 = 1000, receiver = current - 2000
    senderAccount.balances.cashBalance.amount -= transferAmount;
    receiverAccount.balances.cashBalance.amount += transferAmount;
  } else {

    // Positive transfer: sender gets debited, receiver gets credited
    // Example: value = 2000, sender balance = -1000
    // Result: sender = -1000 - 2000 = -3000, receiver = current + 2000
    senderAccount.balances.cashBalance.amount -= transferAmount;
    receiverAccount.balances.cashBalance.amount += transferAmount;
  }

  // Create fund transfer record
  const fundTransfer = new FundTransfer({
    transactionId: await FundTransfer.generateTransactionId(),
    description: `CASH TRANSFER FROM ${senderAccount.customerName} TO ${receiverAccount.customerName}`,
    value: value, // Keep original value (including sign)
    assetType: "CASH",
    receivingParty: {
      party: isNegativeTransfer ? senderAccount._id : receiverAccount._id,
      credit: transferAmount,
    },
    sendingParty: {
      party: isNegativeTransfer ? receiverAccount._id : senderAccount._id,
      debit: transferAmount,
    },
    voucherNumber: voucher.voucherCode,
    voucherType: voucher.voucherType,
    isBullion: false,
    createdBy: adminId,
  });

  // Log transaction in registry for sender
  const transaction = new Registry({
    transactionId: await Registry.generateTransactionId(),
    type: "PARTY_CASH_BALANCE",
    description: `FUND TRANSFER FROM ${senderAccount.customerName} TO ${receiverAccount.customerName}`,
    value: Math.abs(value), // Use absolute value for registry
    runningBalance: senderAccount.balances.cashBalance.amount,
    previousBalance: senderPreviousBalance,
    debit: transferAmount,
    credit: 0,
    reference: voucher.voucherCode,
    createdBy: adminId,
    party: senderAccount._id,
    TransferTransactionId: fundTransfer._id,
  });

  // Log transaction in registry for receiver
  const receiverTransaction = new Registry({
    transactionId: await Registry.generateTransactionId(),
    type: "PARTY_CASH_BALANCE",
    description: `FUND TRANSFER TO ${receiverAccount.customerName} FROM ${senderAccount.customerName}`,
    value: Math.abs(value), // Use absolute value for registry
    runningBalance: receiverAccount.balances.cashBalance.amount,
    previousBalance: receiverPreviousBalance,
    debit: 0,
    credit: transferAmount,
    reference: voucher.voucherCode,
    createdBy: adminId,
    party: receiverAccount._id,
    TransferTransactionId: fundTransfer._id,
  });

  await receiverAccount.save();
  await senderAccount.save();
  await fundTransfer.save();
  await transaction.save();
  await receiverTransaction.save();
}

async function handleGoldTransfer(
  senderAccount,
  receiverAccount,
  value,
  adminId,
  voucher
) {
  // Calculate the actual amounts to debit/credit based on value sign
  const transferAmount = Math.abs(value);
  const isNegativeTransfer = value < 0;

  // Store previous balances for registry logging
  const senderPreviousBalance = senderAccount.balances.goldBalance.totalGrams;
  const receiverPreviousBalance =
    receiverAccount.balances.goldBalance.totalGrams;

  if (isNegativeTransfer) {
    // Negative transfer: sender gets credited, receiver gets debited
    // Example: value = -2000, sender balance = -1000
    // Result: sender = -1000 + 2000 = 1000, receiver = current - 2000
    senderAccount.balances.goldBalance.totalGrams -= transferAmount;
    receiverAccount.balances.goldBalance.totalGrams += transferAmount;
  } else {
    // Positive transfer: sender gets debited, receiver gets credited
    // Example: value = 2000, sender balance = -1000
    // Result: sender = -1000 - 2000 = -3000, receiver = current + 2000
    senderAccount.balances.goldBalance.totalGrams -= transferAmount;
    receiverAccount.balances.goldBalance.totalGrams += transferAmount;
  }

  // Create fund transfer record
  const fundTransfer = new FundTransfer({
    transactionId: await FundTransfer.generateTransactionId(),
    description: `GOLD TRANSFER FROM ${senderAccount.customerName} TO ${receiverAccount.customerName}`,
    value: value, // Keep original value (including sign)
    assetType: "GOLD",
    receivingParty: {
      party: isNegativeTransfer ? senderAccount._id : receiverAccount._id,
      credit: transferAmount,
    },
    sendingParty: {
      party: isNegativeTransfer ? receiverAccount._id : senderAccount._id,
      debit: transferAmount,
    },
    voucherNumber: voucher.voucherCode,
    voucherType: voucher.voucherType,
    isBullion: false,
    createdBy: adminId,
  });

  // Log transaction in registry for sender
  const transaction = new Registry({
    transactionId: await Registry.generateTransactionId(),
    type: "PARTY_GOLD_BALANCE",
    description: `GOLD TRANSFER FROM ${senderAccount.customerName} TO ${receiverAccount.customerName}`,
    value: Math.abs(value), // Use absolute value for registry
    runningBalance: senderAccount.balances.goldBalance.totalGrams,
    previousBalance: senderPreviousBalance,
    debit: transferAmount,
    credit: 0,
    reference: voucher.voucherCode,
    createdBy: adminId,
    party: senderAccount._id,
    TransferTransactionId: fundTransfer._id,
  });


  // Log transaction in registry for receiver
  const receiverTransaction = new Registry({
    transactionId: await Registry.generateTransactionId(),
    type: "PARTY_GOLD_BALANCE",
    description: `GOLD TRANSFER TO ${receiverAccount.customerName} FROM ${senderAccount.customerName}`,
    value: Math.abs(value), // Use absolute value for registry
    runningBalance: receiverAccount.balances.goldBalance.totalGrams,
    previousBalance: receiverPreviousBalance,
    debit: 0,
    credit: transferAmount,
    reference: voucher.voucherCode,
    createdBy: adminId,
    party: receiverAccount._id,
    TransferTransactionId: fundTransfer._id,
  });

  await receiverAccount.save();
  await senderAccount.save();
  await fundTransfer.save();
  await transaction.save();
  await receiverTransaction.save();
}

export default FundTransferService;
