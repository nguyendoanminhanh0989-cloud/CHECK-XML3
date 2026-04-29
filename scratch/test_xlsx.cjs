const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([['NGAY_YL'], ["'202604200736"]]);
const data = XLSX.utils.sheet_to_json(ws);
console.log(data);
