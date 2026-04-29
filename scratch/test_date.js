const parseDateString = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  
  let strVal = val;
  if (typeof val === 'number') {
    if (val < 100000) {
      const d = new Date((val - 25569) * 86400 * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
    strVal = String(val);
  }
  
  let str = String(strVal).trim();
  console.log('parsing:', str, 'length:', str.length);
  if (str.length === 12 && !isNaN(Number(str))) {
    return new Date(
      parseInt(str.substring(0,4)),
      parseInt(str.substring(4,6))-1,
      parseInt(str.substring(6,8)),
      parseInt(str.substring(8,10)),
      parseInt(str.substring(10,12))
    );
  }
  
  if (str.includes('/')) {
    const parts = str.split(' ');
    const datePart = parts[0];
    const timePart = parts[1] || '00:00';
    const dParts = datePart.split('/');
    if (dParts.length === 3) {
      let year, month, day;
      if (dParts[0].length === 4) {
        year = parseInt(dParts[0]); month = parseInt(dParts[1]) - 1; day = parseInt(dParts[2]);
      } else {
        day = parseInt(dParts[0]); month = parseInt(dParts[1]) - 1; year = parseInt(dParts[2]);
      }
      
      const tParts = timePart.split(':');
      const h = parseInt(tParts[0] || '0');
      const m = parseInt(tParts[1] || '0');
      const s = parseInt(tParts[2] || '0');
      
      const d = new Date(year, month, day, h, m, s);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

console.log(parseDateString("'202604200736"));
console.log(parseDateString("202604200736"));
