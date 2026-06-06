import XLSX from 'xlsx';

function testParser() {
  const filePath = '/home/surendra/O2CTest/O2C/public/Template.xlsx';
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const normalizeHeader = (str) => {
    return String(str || '')
      .toLowerCase()
      .replace(/[\r\n]+/g, ' ')  // replace newlines with space
      .replace(/[*()]/g, '')     // remove asterisks and parentheses
      .replace(/\s+/g, ' ')      // collapse multiple spaces
      .trim();
  };

  // 1. Find the header row by scoring rows up to index 20
  let headerIdx = -1;
  let detectedType = null; // 'New Template' or 'Legacy Template'
  let maxScore = -1;

  for (let i = 0; i < Math.min(rawData.length, 20); i++) {
    const row = rawData[i] || [];
    const cleanRow = row.map(cell => String(cell || '').trim());
    
    // Score for New Template
    let newScore = 0;
    cleanRow.forEach(cell => {
      const norm = normalizeHeader(cell);
      if (
        norm === 'type select' ||
        norm.includes('package select') ||
        norm.includes('ref no') ||
        norm.includes('heading') ||
        norm.includes('sub heading') ||
        norm.includes('item name') ||
        norm.includes('item description') ||
        norm.includes('uom') ||
        norm === 'qty' ||
        norm === 'rate' || norm === 'rate required' ||
        norm.includes('gst rate')
      ) {
        newScore++;
      }
    });

    // Score for Legacy Template
    let legacyScore = 0;
    cleanRow.forEach(cell => {
      const norm = normalizeHeader(cell);
      if (
        norm === 'ref no' ||
        norm === 'package' ||
        norm === 'heading' ||
        norm === 'sub heading' ||
        norm === 'item name' ||
        norm === 'item description' || norm === 'description' ||
        norm === 'uom' ||
        norm === 'supply qty' ||
        norm === 'supply rate' ||
        norm === 'supply gst' || norm === 'supply gst%' ||
        norm === 'service qty' ||
        norm === 'service rate' ||
        norm === 'service gst' || norm === 'service gst%'
      ) {
        legacyScore++;
      }
    });

    if (newScore >= 3 && newScore > maxScore) {
      maxScore = newScore;
      headerIdx = i;
      detectedType = 'New Template';
    }
    if (legacyScore >= 3 && legacyScore > maxScore && legacyScore > newScore) {
      maxScore = legacyScore;
      headerIdx = i;
      detectedType = 'Legacy Template';
    }
  }

  console.log("Detected Template Type:", detectedType);
  console.log("Max Score:", maxScore);
  console.log("Header Index:", headerIdx);

  if (headerIdx === -1) {
    console.log("Error: Header row not found!");
    return;
  }

  const headersRaw = rawData[headerIdx] || [];
  const dataRows = rawData.slice(headerIdx + 1);

  console.log("Raw Headers:", headersRaw);

  const mapping = {};
  headersRaw.forEach((h, colIdx) => {
    if (h === undefined || h === null) return;
    const norm = normalizeHeader(h);

    if (detectedType === 'New Template') {
      if (norm === 'type select') mapping.item_type = colIdx;
      else if (norm.includes('package select') || norm === 'package') mapping.package_name = colIdx;
      else if (norm.includes('ref no')) mapping.ref_no = colIdx;
      else if (norm.includes('sub heading') || norm === 'subheading') mapping.sub_heading = colIdx;
      else if (norm === 'heading' || norm.includes('heading')) mapping.heading = colIdx;
      else if (norm.includes('item name')) mapping.item_name = colIdx;
      else if (norm.includes('item description') || norm === 'description') mapping.item_description = colIdx;
      else if (norm.includes('uom')) mapping.uom = colIdx;
      else if (norm === 'qty' || norm === 'quantity') mapping.quantity = colIdx;
      else if (norm === 'rate' || norm.includes('rate required') || norm === 'rate required') mapping.rate = colIdx;
      else if (norm.includes('gst rate') || norm.includes('gst %') || norm === 'gst') mapping.gst_rate = colIdx;
    }
  });

  console.log("Dynamic Mapping Result:", mapping);

  // Check if any headers mapped
  let mandatoryHeadersMissing = false;
  if (
    mapping.ref_no === undefined ||
    mapping.item_name === undefined ||
    mapping.quantity === undefined ||
    mapping.rate === undefined
  ) {
    mandatoryHeadersMissing = true;
  }
  console.log("Mandatory Headers Missing:", mandatoryHeadersMissing);

  // Check row-filtering logic on rows 1 to 9 (which only have a serial number)
  let processedCount = 0;
  dataRows.forEach((row, idx) => {
    let hasAnyData = false;
    headersRaw.forEach((h, colIdx) => {
      const norm = normalizeHeader(h);
      if (norm.includes('sl no') || norm.includes('slkey') || norm.includes('slno')) return;
      const val = row[colIdx];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        hasAnyData = true;
      }
    });

    if (hasAnyData) {
      processedCount++;
    }
  });
  console.log(`Of the remaining rows, ${processedCount} rows had actual data (expected: 0 for unmodified template).`);
}

testParser();
