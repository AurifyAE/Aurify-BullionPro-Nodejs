import OpeningBalance from "../../models/modules/OpeningBalance.js";

class openingBalanceService {
    static async createPartyOpeningBalance({
        partyId,
        value,
        adminId,
        assetType,
        assetCode,
        voucher,
        voucherDate,
        description,
    }) {
        // ❗ Check opening per party + asset
        const exists = await OpeningBalance.findOne({
            partyId,
            assetType,
            assetCode,
        });

        if (exists) {
            const error = new Error(
                `Opening balance already exists for ${assetType} (${assetCode})`
            );
            error.code = "OPENING_EXISTS";
            throw error;
        }

        const opening = new OpeningBalance({
            partyId,
            value,
            adminId,
            assetType,   // GOLD | CASH
            assetCode,   // XAU | AED | INR
            voucherDate,
            voucherType: voucher.voucherType,
            voucherCode: voucher.voucherCode,
            description,
        });

        await opening.save();
    }
}

export default openingBalanceService;
