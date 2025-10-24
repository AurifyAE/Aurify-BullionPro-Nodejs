export const normalizeDateRange = (startDate, endDate, defaultMonthsBack = 1) => {
    try {
      let normalizedStart = startDate ? new Date(startDate) : new Date();
      let normalizedEnd = endDate ? new Date(endDate) : new Date();
  
      // Set default start date to N months ago if not provided
      if (!startDate) {
        normalizedStart.setMonth(normalizedStart.getMonth() - defaultMonthsBack);
        normalizedStart.setHours(0, 0, 0, 0); // Start of day
      }
  
      // Set end date to end of day for inclusivity
      normalizedEnd.setHours(23, 59, 59, 999);
  
      // Validate dates
      if (isNaN(normalizedStart.getTime()) || isNaN(normalizedEnd.getTime())) {
        throw new Error('Invalid date format provided');
      }
  
      // Ensure startDate <= endDate
      if (normalizedStart > normalizedEnd) {
        throw new Error('startDate cannot be later than endDate');
      }
  
      return {
        startDate: normalizedStart,
        endDate: normalizedEnd,
      };
    } catch (error) {
      console.error('Date normalization error:', error.message);
      throw new Error(`Date processing failed: ${error.message}`);
    }
  };