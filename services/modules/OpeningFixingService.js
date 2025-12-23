import mongoose from "mongoose";
import OpeningFixing from "../../models/modules/OpeningFixing.js";
import MetalRate from "../../models/modules/MetalRateMaster.js";
import { createAppError } from "../../utils/errorHandler.js";

class OpeningFixingService {
  static async createOpeningFixing(body, adminId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        voucherNumber,
        voucherType,
        prefix,
        voucherDate,
        divisionId,
        salesmanId,
        position,
        pureWeight,
        weightOz,
        metalRateId,
        accountingImpact,
      } = body;

      // 1️⃣ Fetch metal rate (authoritative source)
      const metalRate = await MetalRate.findById(metalRateId).session(session);
      if (!metalRate) {
        throw createAppError("Invalid metal rate", 400);
      }

      const convFactGms = Number(metalRate.convFactGms || 0);
      if (!convFactGms) {
        throw createAppError("Conversion factor missing in metal rate", 400);
      }

      // 2️⃣ Business calculation (FINAL)
      const metalValue = Number(pureWeight) * convFactGms;

      // 3️⃣ Create document
      const fixing = await OpeningFixing.create(
        [
          {
            voucherNumber,
            voucherType,
            prefix,
            voucherDate,

            division: divisionId,
            salesman: salesmanId,

            position,
            pureWeight,
            weightOz,

            metalRate: metalRateId,
            metalRateValue: convFactGms, // snapshot
            metalValue,

            accountingImpact,
            createdBy: adminId,
          },
        ],
        { session, ordered: true }
      );

      await session.commitTransaction();
      session.endSession();

      return fixing[0];
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  }
}

export default OpeningFixingService;
