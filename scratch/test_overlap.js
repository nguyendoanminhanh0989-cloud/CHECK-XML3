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
  
  const str = String(strVal).replace(/[\u200B-\u200D\uFEFF]/g, '').trim().replace(/^['"]+|['"]+$/g, '');
  if (str.length === 12 && !isNaN(Number(str))) {
    return new Date(
      parseInt(str.substring(0,4)),
      parseInt(str.substring(4,6))-1,
      parseInt(str.substring(6,8)),
      parseInt(str.substring(8,10)),
      parseInt(str.substring(10,12))
    );
  }
  
  return null;
};

const t1_yl = parseDateString('202604280908');
const t1_th = parseDateString('202604280950');
const t1_kq = parseDateString('202604281010');

const t2_yl = parseDateString('202604280908');
const t2_th = parseDateString('202604280930');
const t2_kq = parseDateString('202604280955');

console.log('r1_th:', t1_th);
console.log('r1_kq:', t1_kq);
console.log('r2_th:', t2_th);
console.log('r2_kq:', t2_kq);

function checkTimeOverlap(start1, end1, start2, end2) {
  return start1.getTime() < end2.getTime() && end1.getTime() > start2.getTime();
}

console.log('checkTimeOverlap:', checkTimeOverlap(t1_th, t1_kq, t2_th, t2_kq));
