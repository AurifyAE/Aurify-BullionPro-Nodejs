import moment from "moment";

// UAE timezone constant (UTC+4)
const UAE_TIMEZONE_OFFSET = 4; // hours

/**
 * Convert a date string (assumed to be in UAE local time) to UTC Date for MongoDB
 * @param {string} dateString - Date string in format YYYY-MM-DD (treated as UAE local time)
 * @param {string} timeOfDay - 'start' or 'end' to get start/end of day
 * @returns {Date} UTC Date object for MongoDB queries
 */
export const uaeDateToUTC = (dateString, timeOfDay = 'start') => {
  if (!dateString) return null;
  
  // Parse date string (YYYY-MM-DD) and treat it as UAE local time (UTC+4)
  // When user selects Dec 21, they mean Dec 21 in UAE time
  // Dec 21 00:00:00 UAE = Dec 20 20:00:00 UTC (UAE is UTC+4, so subtract 4 hours)
  // Dec 21 23:59:59.999 UAE = Dec 21 19:59:59.999 UTC
  
  // Parse the date string and create moment in UAE timezone
  // moment(dateString) creates a moment in local timezone, but we want UAE timezone
  // So we parse it, then set the UTC offset to +4 (UAE)
  let uaeMoment;
  
  if (typeof dateString === 'string') {
    // If it's a date string like "2025-12-21", parse it and set to UAE timezone
    uaeMoment = moment(dateString, 'YYYY-MM-DD').utcOffset(UAE_TIMEZONE_OFFSET);
  } else {
    // If it's already a Date object, convert to moment and set UAE timezone
    uaeMoment = moment(dateString).utcOffset(UAE_TIMEZONE_OFFSET);
  }
  
  // Set to start or end of day in UAE timezone
  if (timeOfDay === 'end') {
    uaeMoment.endOf('day'); // Sets to 23:59:59.999 in UAE time
  } else {
    uaeMoment.startOf('day'); // Sets to 00:00:00 in UAE time
  }
  
  // Convert to UTC for MongoDB query
  const utcDate = uaeMoment.utc().toDate();
  
  return utcDate;
};

/**
 * Convert UTC Date from MongoDB to UAE local time string
 * @param {Date} utcDate - UTC Date from MongoDB
 * @returns {string} Date string in UAE local time
 */
export const utcToUAEDate = (utcDate) => {
  if (!utcDate) return null;
  return moment.utc(utcDate).utcOffset(UAE_TIMEZONE_OFFSET).format('YYYY-MM-DD');
};

/**
 * Get previous day end in UAE timezone, converted to UTC for MongoDB
 * @param {string} dateString - Date string in format YYYY-MM-DD (treated as UAE local time)
 * @returns {Date} UTC Date object representing end of previous day in UAE time
 */
export const getPreviousDayEndInUTC = (dateString) => {
  if (!dateString) return null;
  
  // Parse date as UAE local time, subtract 1 day, get end of that day, convert to UTC
  const previousDayEnd = moment(dateString)
    .utcOffset(UAE_TIMEZONE_OFFSET)
    .subtract(1, 'day')
    .endOf('day')
    .utc()
    .toDate();
  
  return previousDayEnd;
};

/**
 * Normalize date range with UAE timezone support
 */
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