/**
 * Parses a local date-time string from the DOM and converts it to an ISO 8601 UTC string.
 * @param localDateTimeStr - Raw date string from DOM (e.g., "15/06/2026 19:30")
 */
export function parseLocalDateTimeToISO(localDateTimeStr: string): string {
    const numbers = localDateTimeStr.match(/\d+/g);
    
    if (!numbers || numbers.length < 5) return '';
    const [day, month, year, hours, minutes] = numbers.map(Number);
    
    const localNativeDate = new Date(year, month - 1, day, hours, minutes);

    return localNativeDate.toISOString(); 
}

/**
 * Converts an ISO UTC date string back into a formatted local date string for the end user.
 * @param isoDateStr - ISO standard UTC string (e.g., "2026-06-15T22:30:00.000Z")
 */
export function formatISODateToLocalDateString(isoDateStr: string): string {
    if (!isoDateStr) return "";
    
    const dateObj = new Date(isoDateStr);
    if (isNaN(dateObj.getTime())) return "Invalid date";

    let weekday = dateObj.toLocaleDateString('es-AR', { weekday: 'long' });
    weekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0'); 
    const year = dateObj.getFullYear();

    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');

    return `${weekday} ${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Destructures an ISO UTC date string into clean local date and time components.
 * @param isoDateStr - ISO standard UTC string
 */
export function getDestructuredLocalDateTime(isoDateStr: string) {
    if (!isoDateStr) return { date: '', time: '' };

    const dateObj = new Date(isoDateStr);
    if (isNaN(dateObj.getTime())) return { date: 'Invalid date', time: 'Invalid time' };

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0'); 
    const year = dateObj.getFullYear();
    
    const formattedDate = `${day}/${month}/${year}`;

    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const formattedTime = `${hours}:${minutes}`;

    return {
        date: formattedDate,
        time: formattedTime
    };
}