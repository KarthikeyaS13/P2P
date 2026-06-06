import XLSX from 'xlsx';
import path from 'path';

const filePath = '/home/surendra/O2CTest/O2C/public/Template.xlsx';
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log("Raw Data rows:");
rawData.slice(0, 10).forEach((row, i) => {
  console.log(`Row ${i}:`, row);
});
