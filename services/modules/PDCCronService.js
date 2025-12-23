import EntryService from "./EntryService.js";

/**
 * PDC Cron Service
 * 
 * This service should be called by a cron job (e.g., daily at midnight)
 * to process matured PDCs and post them to bank accounts.
 * 
 * Usage:
 * - Set up a cron job to call processMaturedPDCs() daily
 * - Example with node-cron:
 *   cron.schedule('0 0 * * *', async () => {
 *     await PDCCronService.processMaturedPDCs();
 *   });
 */
class PDCCronService {
  /**
   * Process all matured PDCs
   * This method is idempotent and safe to run multiple times
   * 
   * @param {ObjectId} adminId - Optional admin ID for audit trail
   * @returns {Object} Results object with processed count, errors, and skipped count
   */
  static async processMaturedPDCs(adminId = null) {
    try {
      console.log(`[PDC Cron] Starting PDC maturity processing at ${new Date().toISOString()}`);
      
      const results = await EntryService.processMaturedPDCs(adminId);
      
      console.log(`[PDC Cron] Completed: ${results.processed} processed, ${results.skipped} skipped, ${results.errors.length} errors`);
      
      if (results.errors.length > 0) {
        console.error(`[PDC Cron] Errors:`, results.errors);
      }
      
      return results;
    } catch (error) {
      console.error(`[PDC Cron] Fatal error:`, error);
      throw error;
    }
  }
}

export default PDCCronService;

