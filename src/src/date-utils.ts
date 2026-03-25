export function isValidDateFormat(dateStr: string): boolean {
  if (!dateStr) return false;
  
  // Check for date-only format: YYYY-MM-DD
  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  // Check for datetime format: YYYY-MM-DDTHH:MM
  const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  
  if (!dateOnlyRegex.test(dateStr) && !dateTimeRegex.test(dateStr)) {
    return false;
  }
  
  // Extract date components
  const [datePart, timePart] = dateStr.split('T');
  if (!datePart) return false;
  
  const dateParts = datePart.split('-').map(Number);
  if (dateParts.length !== 3) return false;
  const [year, month, day] = dateParts;
  
  // Validate date components
  if (!year || year < 1000 || year > 9999) return false;
  if (!month || month < 1 || month > 12) return false;
  if (!day || day < 1 || day > 31) return false;
  
  // Check if the date is valid (e.g., no Feb 30)
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return false;
  }
  
  // If time part exists, validate it
  if (timePart) {
    const timeParts = timePart.split(':').map(Number);
    if (timeParts.length !== 2) return false;
    const [hours, minutes] = timeParts;
    
    // Reject 24:00, accept 00:00-23:59
    if (hours === undefined || hours < 0 || hours > 23) return false;
    if (minutes === undefined || minutes < 0 || minutes > 59) return false;
  }
  
  return true;
}

export function compareDates(date1: string | null, date2: string | null): number {
  // Null dates are considered "infinite" (always after non-null dates)
  if (!date1 && !date2) return 0;
  if (!date1) return 1;
  if (!date2) return -1;
  
  // ISO format strings can be compared lexicographically
  if (date1 < date2) return -1;
  if (date1 > date2) return 1;
  return 0;
}