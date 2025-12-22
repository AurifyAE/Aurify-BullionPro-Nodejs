import OpeningBalance from "../../models/modules/OpeningBalance.js";
import { updatePartyOpeningBalance } from "../../utils/updatePartyOpeningBalance.js.js";

class openingBalanceService {
    static async createPartyOpeningBalance({
        partyId,
        value,
        transactionType,
        adminId,
        assetType,
        assetCode,
        voucher,
        voucherDate,
        description,
    }) {
        // ❗ Check opening per party + asset
        // const exists = await OpeningBalance.findOne({
        //     partyId,
        //     assetType,
        //     assetCode,
        // });

        // if (exists) {
        //     const error = new Error(
        //         `Opening balance already exists for ${assetType} (${assetCode})`
        //     );
        //     error.code = "OPENING_EXISTS";
        //     throw error;
        // }
        console.log("Creating opening balance for party:", value, partyId, assetType, assetCode);

        const opening = new OpeningBalance({
            partyId,
            value,
            transactionType,
            adminId,
            assetType,   // GOLD | CASH
            assetCode,   // XAU | AED | INR
            voucherDate,
            voucherType: voucher.voucherType,
            voucherCode: voucher.voucherCode,
            description,
        });

        const signedValue = transactionType === "debit" ? - Math.abs(value) : Math.abs(value);

        // 2️ Update account balances
        await updatePartyOpeningBalance({
            partyId,
            assetType,
            assetCode,
            value: signedValue, 
        });
        await opening.save();
    }

    /**
     * Retrieve all opening balances for all parties
     * @returns {Promise<Array>}
     */
    static async getAllPartyOpeningBalances() {
        // Fetch all opening balances
        // Populate partyId with customerName and accountCode
        const records = await OpeningBalance.find()
            .populate("partyId", "customerName accountCode")
            .populate("adminId", "name")
            .sort({ voucherDate: -1 })
            .lean();
        return records;
    }

    static async updatePartyOpeningBalance({
        voucherId,
        value,
        transactionType,
        assetType,
        assetCode,
        voucherDate,
        description,
    }) {
        // Fetch existing opening
        const existing = await OpeningBalance.find({ voucherCode: voucherId });
        console.log(existing)
        if (!existing) {
            throw createAppError("Opening balance not found", 404);
        }
    }
}

export default openingBalanceService;
