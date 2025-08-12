export const convertBrazilianDateToUTCRange = (brazilianDate) => {
    const startUTC = new Date(`${brazilianDate}T00:00:00-03:00`);
    const endUTC = new Date(`${brazilianDate}T23:59:59.999-03:00`);
    
    return { startUTC, endUTC };
}

export const convertBrazilianDateToISO = (brazilianDate) => {
    const [day, month, year] = brazilianDate.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}