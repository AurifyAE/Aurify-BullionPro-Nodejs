import MetalTransaction from '../models/modules/MetalTransaction.js';

export const generateHedgeVoucherNumber = async (transactionType) => {
  let prefix = "";

  switch (transactionType) {
    case "purchase":
      prefix = "HPM";
      break;
    case "sale":
      prefix = "HSM";
      break;
        case "saleReturn":
      prefix = "HSM";
      break;
    case "purchaseReturn":
      prefix = "HPR";
      break;
    case "importPurchase":
      prefix = "HIP";
      break;
       case "importPurchaseReturn":
      prefix = "HIPR";
      break;
    case "exportSale":
      prefix = "HES";
      break;
       case "exportSaleReturn":
      prefix = "HESR";
      break;
    default:
      prefix = "HXX"; // fallback
  }

  // Count how many hedge vouchers already exist with this prefix
  const count = await MetalTransaction.countDocuments({
    hedge: true,
    hedgeVoucherNumber: { $ne: null },
    hedgeVoucherNumber: new RegExp(`^${prefix}\\d+$`) // starts with HPM, HSM, etc.
  });

  const nextSeq = count + 1;
  return `${prefix}${String(nextSeq).padStart(3, "0")}`; // HPM001, HSM023, etc.
};