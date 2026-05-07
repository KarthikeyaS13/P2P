import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useAuth } from '../context/AuthContext';
import {
  useReactTable,
  getCoreRowModel,
  getGroupedRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function NewPO() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  // Flow State
  const [step, setStep] = useState(1); // 1: Basic, 2: Items Review, 3: Final Summary
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isRestored = useRef(false);

  // Basic State
  const [basicDetails, setBasicDetails] = useState({
    customerId: '',
    locationId: '',
    poNumber: '',
    poDate: new Date().toISOString().split('T')[0],
    startDate: '',
    endDate: '',
    contactName: '',
    contactPhone: ''
  });

  // Attachments State
  const [attachments, setAttachments] = useState({
    po_copy: null,
    po_annex: null,
    other: null
  });
  const [attachmentPaths, setAttachmentPaths] = useState({
    po_copy: '',
    po_annex: '',
    other: ''
  });
  const [showViewer, setShowViewer] = useState(null); // 'po_copy', 'po_annex', 'other'

  // Data State
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [manualEntryMode, setManualEntryMode] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteRows, setPasteRows] = useState(Array(10).fill({}).map(() => ({
    ref_no: '', package_name: '', heading: '', sub_heading: '', item_name: '', description: '', uom: '',
    supply_qty: '', supply_rate: '', supply_gst_rate: '', service_qty: '', service_rate: '', service_gst_rate: ''
  })));

  // Modal for Viewing File
  const [viewFileUrl, setViewFileUrl] = useState('');

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('http://localhost:3000/api/customers', { headers });
        setCustomers(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to fetch customers', err);
      }
    };
    fetchCustomers();
  }, []);

  // Draft Persistence
  useEffect(() => {
    const navEntries = window.performance.getEntriesByType('navigation');
    const navType = navEntries.length > 0 ? navEntries[0].type : '';
    const isReloadOrBack = navType === 'reload' || navType === 'back_forward';

    const draft = sessionStorage.getItem('new_po_draft');
    if (draft && (isReloadOrBack || navType === '')) {
      try {
        const d = JSON.parse(draft);
        if (d.step) setStep(d.step);
        if (d.basicDetails) setBasicDetails(d.basicDetails);
        if (d.attachmentPaths) setAttachmentPaths(d.attachmentPaths);
        if (d.items) setItems(d.items);
        if (d.manualEntryMode !== undefined) setManualEntryMode(d.manualEntryMode);
      } catch (e) { console.error('Draft restore failed', e); }
    } else if (!isReloadOrBack && navType !== '') {
      // Fresh navigation - clear old drafts
      sessionStorage.removeItem('new_po_draft');
    }
    isRestored.current = true;
  }, []);

  useEffect(() => {
    if (!isRestored.current) return;
    const draft = { step, basicDetails, attachmentPaths, items, manualEntryMode };
    sessionStorage.setItem('new_po_draft', JSON.stringify(draft));
  }, [step, basicDetails, attachmentPaths, items, manualEntryMode]);

  useEffect(() => {
    const fetchLocations = async () => {
      if (basicDetails.customerId) {
        try {
          const token = sessionStorage.getItem('token');
          const headers = { Authorization: `Bearer ${token}` };
          const res = await axios.get(`http://localhost:3000/api/locations?customer_id=${basicDetails.customerId}`, { headers });
          setLocations(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
          console.error('Failed to fetch locations', err);
        }
      }
    };
    fetchLocations();
  }, [basicDetails.customerId]);

  const handleCustomerChange = (e) => {
    const val = e.target.value;
    setBasicDetails(prev => ({ ...prev, customerId: val, locationId: '' }));
    setLocations([]);
  };

  const handleBasicChange = (e) => {
    const { name, value } = e.target;
    if (name === 'locationId') {
      const loc = locations.find(l => String(l.id) === String(value));
      setBasicDetails(prev => ({
        ...prev,
        locationId: value,
        contactName: loc ? (loc.contact_name || '') : '',
        contactPhone: loc ? (loc.contact_phone || '') : ''
      }));
    } else {
      setBasicDetails(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (type, file) => {
    setAttachments(prev => ({ ...prev, [type]: file }));
  };

  const uploadAttachments = async () => {
    const formData = new FormData();
    if (attachments.po_copy) formData.append('po_copy', attachments.po_copy);
    if (attachments.po_annex) formData.append('po_annex', attachments.po_annex);
    if (attachments.other) formData.append('other', attachments.other);

    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' };
      const res = await axios.post('http://localhost:3000/api/upload-multi', formData, { headers });
      setAttachmentPaths(res.data);
      return res.data;
    } catch (err) {
      console.error('Upload failed', err);
      return null;
    }
  };

  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PO Format for UPLOAD');

    // Table Header (Row 1)
    const headers = [
      'Sl no (SYS GEN)', 'Ref No', 'Package', 'Heading', 'Sub Heading (if Any)',
      'Item Name', 'Item Description', 'UOM', 'Supply QTY', 'Supply Rate',
      'Supply GST', 'Service QTY', 'Service Rate', 'Service GST',
      '', // Empty column for spacing (O)
      'Taxable Value of Supply', 'GST on Supply', 'Invoice Value of Supply',
      'Taxable Value of SERVICE', 'GST on SERVICE', 'Invoice Value of SERVICE',
      'TOTAL Taxable Value', 'TOTAL GST', 'TOTAL Invoice Value'
    ];

    const tableHeaderRow = worksheet.getRow(1);
    tableHeaderRow.values = headers;
    tableHeaderRow.eachCell((cell, colNum) => {
      const isAutoCal = colNum >= 16;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAutoCal ? 'FF4F81BD' : 'FF0070C0' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
      };

      // Set width for table columns
      const column = worksheet.getColumn(colNum);
      if (colNum === 1) column.width = 10;
      else if (colNum >= 2 && colNum <= 5) column.width = 15;
      else if (colNum === 6) column.width = 25;
      else if (colNum === 7) column.width = 30;
      else if (colNum >= 9 && colNum <= 14) column.width = 12;
      else if (colNum >= 16) column.width = 15;
      else column.width = 15;
    });
    tableHeaderRow.height = 45;

    // Data rows style and Auto-index (Rows 2 to 101)
    for (let i = 2; i <= 101; i++) {
      const row = worksheet.getRow(i);
      // Set Sl no (index)
      row.getCell(1).value = i - 1;

      // Formulas for Auto-calculation
      // I: Supply QTY, J: Supply Rate, K: Supply GST
      // L: Service QTY, M: Service Rate, N: Service GST

      // P: Taxable Supply (I*J)
      row.getCell(16).value = { formula: `I${i}*J${i}` };
      // Q: GST Supply (P*K/100)
      row.getCell(17).value = { formula: `P${i}*(K${i}/100)` };
      // R: Invoice Supply (P+Q)
      row.getCell(18).value = { formula: `P${i}+Q${i}` };

      // S: Taxable Service (L*M)
      row.getCell(19).value = { formula: `L${i}*M${i}` };
      // T: GST Service (S*N/100)
      row.getCell(20).value = { formula: `S${i}*(N${i}/100)` };
      // U: Invoice Service (S+T)
      row.getCell(21).value = { formula: `S${i}+T${i}` };

      // V: Total Taxable (P+S)
      row.getCell(22).value = { formula: `P${i}+S${i}` };
      // W: Total GST (Q+T)
      row.getCell(23).value = { formula: `Q${i}+T${i}` };
      // X: Total Invoice (V+W)
      row.getCell(24).value = { formula: `V${i}+W${i}` };

      for (let colNum = 1; colNum <= 24; colNum++) {
        if (colNum === 15) continue; // Skip empty column O

        const cell = row.getCell(colNum);
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
        };

        if (colNum === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
          cell.alignment = { horizontal: 'center' };
        } else if (colNum >= 16) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; // Light grey for auto-cal
          cell.numFmt = '#,##0.00';
        }
      }
    }

    // Generate and Save
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), 'PO_Template.xlsx');
  };

  const handleGridPaste = (e) => {
    e.preventDefault();
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedData = clipboardData.getData('Text');
    const rows = pastedData.split('\n').filter(r => r.trim());

    const newPasteRows = rows.map(r => {
      const cols = r.split('\t').map(c => c.trim());
      if (cols[0].toLowerCase().includes('ref') || cols[0].toLowerCase().includes('sl')) return null;
      const isSlNo = /^\d+$/.test(cols[0]) && cols[0].length < 4;
      const offset = isSlNo ? 1 : 0;
      return {
        ref_no: cols[0 + offset] || '',
        package_name: cols[1 + offset] || '',
        heading: cols[2 + offset] || '',
        sub_heading: cols[3 + offset] || '',
        item_name: cols[4 + offset] || '',
        description: cols[5 + offset] || '',
        uom: cols[6 + offset] || '',
        supply_qty: cols[7 + offset] || '',
        supply_rate: cols[8 + offset] || '',
        supply_gst_rate: cols[9 + offset] || '',
        service_qty: cols[10 + offset] || '',
        service_rate: cols[11 + offset] || '',
        service_gst_rate: cols[12 + offset] || ''
      };
    }).filter(Boolean);

    if (newPasteRows.length > 0) setPasteRows(newPasteRows);
  };

  const handleBulkPaste = () => {
    const validRows = pasteRows.filter(r => r.item_name || r.package_name || r.ref_no);
    if (validRows.length === 0) return;

    const newItems = validRows.map((r, idx) => calculateRow({
      line_number: items.length + idx + 1,
      ref_no: r.ref_no,
      package_name: r.package_name,
      heading: r.heading,
      sub_heading: r.sub_heading,
      item_name: r.item_name || '',
      description: r.description,
      uom: r.uom,
      supply_qty: cleanNum(r.supply_qty),
      supply_rate: cleanNum(r.supply_rate),
      supply_gst_rate: cleanNum(r.supply_gst_rate) || 0,
      service_qty: cleanNum(r.service_qty),
      service_rate: cleanNum(r.service_rate),
      service_gst_rate: cleanNum(r.service_gst_rate) || 0
    }));

    setItems(prev => [...prev, ...newItems]);
    setPasteRows(Array(10).fill({}).map(() => ({
      ref_no: '', package_name: '', heading: '', sub_heading: '', item_name: '', description: '', uom: '',
      supply_qty: '', supply_rate: '', supply_gst_rate: '', service_qty: '', service_rate: '', service_gst_rate: ''
    })));
    setShowPasteModal(false);
  };

  const handleModalFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const raw = await parseExcel(file);
    const mapped = raw.map(r => {
      if (r._is_headerless) {
        const isSlNo = /^\d+$/.test(r.col0) && String(r.col0).length < 4;
        const offset = isSlNo ? 1 : 0;
        return {
          ref_no: r[`col${0 + offset}`] || '',
          package_name: r[`col${1 + offset}`] || '',
          heading: r[`col${2 + offset}`] || '',
          sub_heading: r[`col${3 + offset}`] || '',
          item_name: r[`col${4 + offset}`] || '',
          description: r[`col${5 + offset}`] || '',
          uom: r[`col${6 + offset}`] || '',
          supply_qty: r[`col${7 + offset}`] || '',
          supply_rate: r[`col${8 + offset}`] || '',
          supply_gst_rate: r[`col${9 + offset}`] || '18',
          service_qty: r[`col${10 + offset}`] || '',
          service_rate: r[`col${11 + offset}`] || '',
          service_gst_rate: r[`col${12 + offset}`] || '18'
        };
      }
      return {
        ref_no: r['Ref No'] || r['ref_no'] || '',
        package_name: r.Package || r['Package Name'] || '',
        heading: r.Heading || '',
        sub_heading: r['Sub Heading (if Any)'] || r['Sub Heading'] || '',
        item_name: r['Item Name'] || r.Item || '',
        description: r['Item Description'] || r.Description || '',
        uom: r.UOM || '',
        supply_qty: r['Supply Qty'] || r['Supply QTY'] || '',
        supply_rate: r['Supply Rate'] || '',
        supply_gst_rate: r['Supply GST'] || '18',
        service_qty: r['Service Qty'] || '',
        service_rate: r['Service Rate'] || '',
        service_gst_rate: r['Service GST'] || '18'
      };
    });
    setPasteRows(mapped);
  };

  const handleDirectExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const raw = await parseExcel(file);
      const newItems = raw.map((r, idx) => {
        let data = {};
        if (r._is_headerless) {
          const isSlNo = /^\d+$/.test(r.col0) && String(r.col0).length < 4;
          const offset = isSlNo ? 1 : 0;
          data = {
            ref_no: r[`col${0 + offset}`] || '',
            package_name: r[`col${1 + offset}`] || '',
            heading: r[`col${2 + offset}`] || '',
            sub_heading: r[`col${3 + offset}`] || '',
            item_name: r[`col${4 + offset}`] || '',
            description: r[`col${5 + offset}`] || '',
            uom: r[`col${6 + offset}`] || '',
            supply_qty: cleanNum(r[`col${7 + offset}`]),
            supply_rate: cleanNum(r[`col${8 + offset}`]),
            supply_gst_rate: cleanNum(r[`col${9 + offset}`]) || 0,
            service_qty: cleanNum(r[`col${10 + offset}`]),
            service_rate: cleanNum(r[`col${11 + offset}`]),
            service_gst_rate: cleanNum(r[`col${12 + offset}`]) || 0
          };
        } else {
          data = {
            ref_no: r['Ref No'] || r['ref_no'] || '',
            package_name: r.Package || r['Package Name'] || '',
            heading: r.Heading || '',
            sub_heading: r['Sub Heading (if Any)'] || r['Sub Heading'] || '',
            item_name: r['Item Name'] || r.Item || '',
            description: r['Item Description'] || r.Description || '',
            uom: r.UOM || '',
            supply_qty: cleanNum(r['Supply Qty'] || r['Supply QTY']),
            supply_rate: cleanNum(r['Supply Rate']),
            supply_gst_rate: cleanNum(r['Supply GST']) || 0,
            service_qty: cleanNum(r['Service Qty']),
            service_rate: cleanNum(r['Service Rate']),
            service_gst_rate: cleanNum(r['Service GST']) || 0
          };
        }
        return calculateRow({
          ...data,
          line_number: idx + 1
        });
      });
      setItems(newItems);
    } catch (err) {
      console.error('Direct upload failed', err);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleExportGrid = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Exported Items');
    const headers = ['Ref No', 'Package', 'Heading', 'Sub Heading', 'Item Name', 'Description', 'UOM', 'S.Qty', 'S.Rate', 'S.GST%', 'Sv.Qty', 'Sv.Rate', 'Sv.GST%'];
    worksheet.addRow(headers);
    pasteRows.forEach(r => {
      worksheet.addRow([r.ref_no, r.package_name, r.heading, r.sub_heading, r.item_name, r.description, r.uom, r.supply_qty, r.supply_rate, r.supply_gst_rate, r.service_qty, r.service_rate, r.service_gst_rate]);
    });
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), 'Exported_Items.xlsx');
  };

  const parseExcel = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const bstr = e.target.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

          let headerIdx = 0;
          let maxScore = -1;
          for (let i = 0; i < Math.min(rawData.length, 20); i++) {
            const row = rawData[i] || [];
            const s = row.map(c => String(c || '').toLowerCase()).join(' ');
            let sc = 0;
            if (s.includes('item')) sc += 2;
            if (s.includes('qty')) sc += 2;
            if (s.includes('rate')) sc += 2;
            if (s.includes('package')) sc += 2;
            if (sc > maxScore) { maxScore = sc; headerIdx = i; }
          }

          const headersRaw = rawData[headerIdx] || [];
          const dataRows = (maxScore < 2) ? rawData : rawData.slice(headerIdx + 1);

          const formatted = dataRows.map(row => {
            const obj = {};
            if (maxScore >= 2) {
              headersRaw.forEach((h, idx) => { if (h) obj[String(h).trim()] = row[idx]; });
            } else {
              // Fixed position mapping for headerless files
              obj['_is_headerless'] = true;
              obj['col0'] = row[0];
              obj['col1'] = row[1];
              obj['col2'] = row[2];
              obj['col3'] = row[3];
              obj['col4'] = row[4];
              obj['col5'] = row[5];
              obj['col6'] = row[6];
              obj['col7'] = row[7];
              obj['col8'] = row[8];
              obj['col9'] = row[9];
              obj['col10'] = row[10];
              obj['col11'] = row[11];
              obj['col12'] = row[12];
            }
            return obj;
          }).filter(row => row['Item Name'] || row['Item'] || row['Package'] || row.col2 || row.col5);

          resolve(formatted);
        } catch (err) { reject(err); }
      };
      reader.readAsBinaryString(file);
    });
  };

  const calculateRow = (row) => {
    const s_qty = parseFloat(row.supply_qty) || 0;
    const s_rate = parseFloat(row.supply_rate) || 0;
    const s_gst_pct = parseFloat(row.supply_gst_rate) || 0;
    const sv_qty = parseFloat(row.service_qty) || 0;
    const sv_rate = parseFloat(row.service_rate) || 0;
    const sv_gst_pct = parseFloat(row.service_gst_rate) || 0;

    const taxable_s = s_qty * s_rate;
    const gst_s = taxable_s * (s_gst_pct / 100);
    const total_s = taxable_s + gst_s;

    const taxable_sv = sv_qty * sv_rate;
    const gst_sv = taxable_sv * (sv_gst_pct / 100);
    const total_sv = taxable_sv + gst_sv;

    const total_taxable = taxable_s + taxable_sv;
    const total_gst = gst_s + gst_sv;
    const total_invoice = total_s + total_sv;

    return {
      ...row,
      line_number: row.line_number,
      ref_no: row.ref_no || '',
      package_name: row.package_name || '',
      heading: row.heading || '',
      sub_heading: row.sub_heading || '',
      item_name: row.item_name || '',
      description: row.description || '',
      uom: row.uom || '',
      supply_qty: row.supply_qty,
      supply_rate: row.supply_rate,
      supply_gst_rate: row.supply_gst_rate,
      service_qty: row.service_qty,
      service_rate: row.service_rate,
      service_gst_rate: row.service_gst_rate,
      taxable_supply: taxable_s,
      gst_supply: gst_s,
      total_supply: total_s,
      taxable_service: taxable_sv,
      gst_service: gst_sv,
      total_service: total_sv,
      total_taxable,
      total_gst,
      total_invoice
    };
  };

  const cleanNum = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    return parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
  };

  const handleManualEntry = () => {
    const firstRow = calculateRow({
      line_number: 1,
      ref_no: '',
      package_name: '',
      heading: '',
      sub_heading: '',
      item_name: '',
      description: '',
      uom: '',
      supply_qty: 0,
      supply_rate: 0,
      supply_gst_rate: 0,
      service_qty: 0,
      service_rate: 0,
      service_gst_rate: 0
    });
    setItems([firstRow]);
    setManualEntryMode(true);
    setStep(2);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    newItems[index] = calculateRow(newItems[index]);
    setItems(newItems);
  };

  const addRow = () => {
    const lastItem = items[items.length - 1];
    const newRow = calculateRow({
      line_number: items.length + 1,
      ref_no: '',
      package_name: lastItem?.package_name || '',
      heading: '',
      sub_heading: '',
      item_name: '',
      description: '',
      uom: '',
      supply_qty: 0,
      supply_rate: 0,
      supply_gst_rate: 0,
      service_qty: 0,
      service_rate: 0,
      service_gst_rate: 0
    });
    setItems([...items, newRow]);
  };



  const getSummaryTotals = () => {
    return items.reduce((acc, it) => ({
      taxable: acc.taxable + it.total_taxable,
      gst: acc.gst + it.total_gst,
      grandTotal: acc.grandTotal + it.total_invoice
    }), { taxable: 0, gst: 0, grandTotal: 0 });
  };

  const nextStep = async () => {
    if (step === 1) {
      if (!basicDetails.customerId || !basicDetails.locationId || !basicDetails.poNumber || !basicDetails.contactName || !basicDetails.contactPhone) {
        return alert('Please fill all basic details including SPOC contact');
      }

      setLoading(true);
      const paths = await uploadAttachments();
      if (!paths) { setLoading(false); return; }

      // If we have an Excel file in PO Annex, parse it (only if not already in manual mode)
      if (attachments.po_annex && items.length === 0) {
        try {
          const raw = await parseExcel(attachments.po_annex);
          const mapped = raw.map((r, i) => {
            if (r._is_headerless) {
              const isSlNo = /^\d+$/.test(r.col0) && String(r.col0).length < 4;
              const offset = isSlNo ? 1 : 0;
              return calculateRow({
                line_number: i + 1,
                ref_no: r[`col${0 + offset}`] || '',
                package_name: r[`col${1 + offset}`] || '',
                heading: r[`col${2 + offset}`] || '',
                sub_heading: r[`col${3 + offset}`] || '',
                item_name: r[`col${4 + offset}`] || '',
                description: r[`col${5 + offset}`] || '',
                uom: r[`col${6 + offset}`] || '',
                supply_qty: cleanNum(r[`col${7 + offset}`]),
                supply_rate: cleanNum(r[`col${8 + offset}`]),
                supply_gst_rate: cleanNum(r[`col${9 + offset}`]) || 0,
                service_qty: cleanNum(r[`col${10 + offset}`]),
                service_rate: cleanNum(r[`col${11 + offset}`]),
                service_gst_rate: cleanNum(r[`col${12 + offset}`]) || 0
              });
            }
            return calculateRow({
              line_number: i + 1,
              ref_no: r['Ref No'] || r['ref_no'] || '',
              package_name: r.Package || r['Package Name'] || '',
              heading: r.Heading || '',
              sub_heading: r['Sub Heading (if Any)'] || r['Sub Heading'] || '',
              item_name: r['Item Name'] || r.Item || '',
              description: r['Item Description'] || r.Description || '',
              uom: r.UOM || '',
              supply_qty: cleanNum(r['Supply Qty'] || r['Supply QTY']),
              supply_rate: cleanNum(r['Supply Rate']),
              supply_gst_rate: cleanNum(r['Supply GST']) || 0,
              service_qty: cleanNum(r['Service Qty']),
              service_rate: cleanNum(r['Service Rate']),
              service_gst_rate: cleanNum(r['Service GST']) || 0
            });
          });

          if (mapped.length > 0) {
            setItems(mapped);
            alert('Excel uploaded successfully. Click Next to review.');
          } else {
            alert('No valid items found in the Excel file. Please check the columns.');
          }
        } catch (err) {
          console.error(err);
          alert('Error parsing Excel file.');
        }
      }
      setLoading(false);

      // FIX: Use local check because setItems is async
      const hasItems = items.length > 0 || (attachments.po_annex && !loading);

      if (hasItems || manualEntryMode) {
        setStep(2);
      } else {
        alert('Please upload a PO Annex or use Manual Entry.');
      }
    } else if (step === 2) {
      if (items.length === 0) return alert('No items to review');
      setStep(3);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      if (!basicDetails.customerId || !basicDetails.locationId || !basicDetails.poNumber) {
        return alert('Please fill in all basic details (Customer, Location, PO Number)');
      }

      const subtotal = items.reduce((acc, it) => acc + it.total_taxable, 0);
      const gst_total = items.reduce((acc, it) => acc + it.total_gst, 0);
      const grand_total = items.reduce((acc, it) => acc + it.total_invoice, 0);

      const payload = {
        customer_id: parseInt(basicDetails.customerId),
        location_id: parseInt(basicDetails.locationId),
        po_number: basicDetails.poNumber,
        po_date: basicDetails.poDate,
        start_date: basicDetails.startDate,
        end_date: basicDetails.endDate,
        po_copy_path: attachmentPaths.po_copy,
        po_annex_path: attachmentPaths.po_annex,
        other_attachment_path: attachmentPaths.other,
        subtotal,
        gst_total,
        grand_total,
        items
      };

      await axios.post('http://localhost:3000/api/pos', payload, { headers });
      sessionStorage.removeItem('new_po_draft');
      alert('Purchase Order created successfully!');
      navigate('/dashboard');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create PO');
    } finally {
      setSubmitting(false);
    }
  };

  const [previewExcelData, setPreviewExcelData] = useState(null);

  const renderFileViewer = () => {
    if (!showViewer) return null;
    const file = attachments[showViewer];
    if (!file) return null;

    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.xlsm') || file.name.toLowerCase().endsWith('.csv');
    const url = URL.createObjectURL(file);

    // Auto-parse if Excel and not yet parsed
    if (isExcel && !previewExcelData) {
      parseExcel(file).then(data => setPreviewExcelData(data));
    }

    // Get all unique keys from all rows to ensure consistent headers
    const allHeaders = previewExcelData ? Array.from(new Set(previewExcelData.flatMap(row => Object.keys(row)))) : [];

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '95%', height: '90%', position: 'relative', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Preview: {file.name}</h3>
            <button
              onClick={() => {
                setShowViewer(null);
                setPreviewExcelData(null);
                URL.revokeObjectURL(url);
              }}
              style={{ padding: '8px 16px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
            >
              Close Preview
            </button>
          </div>
          <div style={{ flex: 1, background: '#F3F4F6', borderRadius: '8px', overflow: 'auto' }}>
            {isExcel ? (
              previewExcelData ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', background: 'white' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#F9FAFB', zIndex: 10 }}>
                    <tr>
                      {allHeaders.map(h => (
                        <th key={h} style={{ padding: '10px', border: '1px solid #E5E7EB', textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewExcelData.map((row, i) => (
                      <tr key={i}>
                        {allHeaders.map((h, j) => (
                          <td key={j} style={{ padding: '8px', border: '1px solid #E5E7EB' }}>
                            {row[h] !== undefined && row[h] !== null ? String(row[h]) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <p>Parsing Excel data...</p>
                </div>
              )
            ) : (
              <iframe src={url} width="100%" height="100%" title="File Viewer" style={{ border: 'none' }} />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '8px', maxWidth: '100%', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
      {renderFileViewer()}

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <button onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)} style={{ padding: '8px 16px', background: '#374151', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Back</button>
        <h2 style={{ margin: 0 }}>Purchase Order Ingestion</h2>
      </div>

      <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>

        {/* STEP 1: Basic & Attachments */}
        {step === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            <div>
              <h3 style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: '8px' }}>1. Basic Details</h3>
              <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Customer</label>
                  <select name="customerId" value={basicDetails.customerId} onChange={handleCustomerChange} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.8rem' }}>
                    <option value="">Select Customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Location</label>
                  <select name="locationId" value={basicDetails.locationId} onChange={handleBasicChange} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.8rem' }}>
                    <option value="">Select Location</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>PO Number</label>
                  <input name="poNumber" value={basicDetails.poNumber} onChange={handleBasicChange} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.8rem' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>SPOC Name <span style={{ color: 'red' }}>*</span></label>
                    <input name="contactName" value={basicDetails.contactName} onChange={handleBasicChange} placeholder="Primary Contact Name" style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.8rem' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>SPOC Phone <span style={{ color: 'red' }}>*</span></label>
                    <input name="contactPhone" value={basicDetails.contactPhone} onChange={handleBasicChange} placeholder="Primary Phone" style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.8rem' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>PO Date</label>
                    <input type="date" name="poDate" value={basicDetails.poDate} onChange={handleBasicChange} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.8rem' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Start Date</label>
                    <input type="date" name="startDate" value={basicDetails.startDate} onChange={handleBasicChange} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.8rem' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Est. End Date</label>
                    <input type="date" name="endDate" value={basicDetails.endDate} onChange={handleBasicChange} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.8rem' }} />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: '8px' }}>2. Attachments</h3>
              <div style={{ display: 'grid', gap: '20px' }}>
                {['po_copy', 'po_annex', 'other'].map(type => (
                  <div key={type} style={{ border: '1px solid #E5E7EB', padding: '12px', borderRadius: '8px' }}>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px', textTransform: 'capitalize' }}>
                      {type.replace('_', ' ')}
                    </label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.xlsm,.csv" onChange={(e) => handleFileChange(type, e.target.files[0])} style={{ flex: 1 }} />
                      {attachments[type] && (
                        <button onClick={() => setShowViewer(type)} style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                            {attachments[type].name.toLowerCase().endsWith('.xlsx') || attachments[type].name.toLowerCase().endsWith('.xls') ? 'description' : 'visibility'}
                          </span>
                          View
                        </button>
                      )}
                    </div>
                    {attachments[type] && (
                      <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
                        {attachments[type].name.toLowerCase().endsWith('.xlsx') || attachments[type].name.toLowerCase().endsWith('.xls') ? 'Excel Uploaded' : 'File Uploaded'}: {attachments[type].name}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '32px', textAlign: 'center' }}>
                <button
                  onClick={async () => {
                    await handleDownloadTemplate();
                    handleManualEntry();
                  }}
                  style={{ width: '100%', padding: '12px', background: '#374151', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>download</span>
                  Download Template
                </button>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #E5E7EB', paddingTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={nextStep}
                disabled={loading || !basicDetails.customerId || !basicDetails.locationId || !basicDetails.poNumber || !basicDetails.contactName || !basicDetails.contactPhone}
                style={{
                  padding: '12px 32px',
                  background: (loading || !basicDetails.customerId || !basicDetails.locationId || !basicDetails.poNumber || !basicDetails.contactName || !basicDetails.contactPhone) ? '#9CA3AF' : '#3B82F6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: (loading || !basicDetails.customerId || !basicDetails.locationId || !basicDetails.poNumber) ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Uploading...' : 'Review'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Items Review */}
        {step === 2 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Step 2: Items Review & Calculation</h3>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => fileInputRef.current.click()}
                  style={{ padding: '8px 16px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>upload_file</span>
                  Excel Upload
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".xlsx,.xls"
                  onChange={handleDirectExcelUpload}
                />
                <button onClick={addRow} style={{ padding: '8px 16px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600 }}>+ Add Row</button>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '12px' }}>
              <strong>Tip:</strong> You can edit any cell. Use "Bulk Paste" to add many rows at once from your spreadsheet.
            </p>

            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px', maxHeight: '550px', background: 'white' }}>
              <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.6rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: '#F9FAFB' }}>
                  <tr style={{ whiteSpace: 'nowrap' }}>
                    <th rowSpan="2" style={{ padding: '2px 3px', border: '1px solid #E5E7EB', background: '#F9FAFB', width: '30px' }}>Sl no</th>
                    <th rowSpan="2" style={{ padding: '2px 3px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '60px' }}>Ref No</th>
                    <th rowSpan="2" style={{ padding: '2px 3px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '100px' }}>Package</th>
                    <th rowSpan="2" style={{ padding: '2px 3px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '100px' }}>Heading</th>
                    <th rowSpan="2" style={{ padding: '2px 3px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '100px' }}>Sub Heading (if Any)</th>
                    <th rowSpan="2" style={{ padding: '2px 3px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '130px' }}>Item Name</th>
                    <th rowSpan="2" style={{ padding: '2px 3px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '150px' }}>Item Description</th>
                    <th rowSpan="2" style={{ padding: '2px 3px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '40px' }}>UOM</th>

                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#ECFDF5', textAlign: 'center', fontSize: '0.65rem' }}>Supply Details</th>
                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#EFF6FF', textAlign: 'center', fontSize: '0.65rem' }}>Service Details</th>

                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#F3F4F6', textAlign: 'center', fontSize: '0.65rem' }}>Calc. Supply</th>
                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#F3F4F6', textAlign: 'center', fontSize: '0.65rem' }}>Calc. Service</th>

                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#FEF3C7', textAlign: 'center', fontSize: '0.65rem' }}>TOTALS</th>
                  </tr>
                  <tr style={{ whiteSpace: 'nowrap' }}>
                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '70px' }}>Qty</th>
                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '80px' }}>Rate</th>
                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#ECFDF5', minWidth: '50px' }}>GST%</th>

                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#EFF6FF', minWidth: '70px' }}>Qty</th>
                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#EFF6FF', minWidth: '80px' }}>Rate</th>
                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#EFF6FF', minWidth: '50px' }}>GST%</th>

                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>Taxable</th>
                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>GST</th>
                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>Total</th>

                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>Taxable</th>
                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>GST</th>
                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '80px' }}>Total</th>

                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '80px' }}>Taxable</th>
                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '80px' }}>GST</th>
                    <th style={{ padding: '3px 6px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '90px' }}>Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '2px 3px', border: '1px solid #E5E7EB', textAlign: 'center', color: '#6B7280' }}>{idx + 1}</td>
                      <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.ref_no} onChange={(e) => updateItem(idx, 'ref_no', e.target.value)} style={{ width: '100%', border: 'none', padding: '1px 3px', fontSize: '0.6rem' }} /></td>
                      <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.package_name} onChange={(e) => updateItem(idx, 'package_name', e.target.value)} style={{ width: '100%', border: 'none', padding: '1px 3px', fontSize: '0.6rem' }} /></td>
                      <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.heading} onChange={(e) => updateItem(idx, 'heading', e.target.value)} style={{ width: '100%', border: 'none', padding: '1px 3px', fontSize: '0.6rem' }} /></td>
                      <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.sub_heading} onChange={(e) => updateItem(idx, 'sub_heading', e.target.value)} style={{ width: '100%', border: 'none', padding: '1px 3px', fontSize: '0.6rem' }} /></td>
                      <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.item_name} onChange={(e) => updateItem(idx, 'item_name', e.target.value)} style={{ width: '100%', border: 'none', padding: '1px 3px', fontSize: '0.6rem' }} /></td>
                      <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ width: '100%', border: 'none', padding: '1px 3px', fontSize: '0.6rem' }} /></td>
                      <td style={{ padding: '1px', border: '1px solid #E5E7EB' }}><input value={it.uom} onChange={(e) => updateItem(idx, 'uom', e.target.value)} style={{ width: '100%', border: 'none', padding: '1px 3px', fontSize: '0.6rem' }} /></td>

                      <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#ECFDF5' }}><input type="number" value={it.supply_qty} onChange={(e) => updateItem(idx, 'supply_qty', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '1px 3px', fontSize: '0.6rem', background: 'transparent' }} /></td>
                      <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#ECFDF5' }}><input type="number" value={it.supply_rate} onChange={(e) => updateItem(idx, 'supply_rate', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '1px 3px', fontSize: '0.6rem', background: 'transparent' }} /></td>
                      <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#ECFDF5' }}>
                        <select
                          value={it.supply_gst_rate || ''}
                          onChange={(e) => updateItem(idx, 'supply_gst_rate', e.target.value)}
                          style={{ width: '100%', border: 'none', padding: '1px 3px', fontSize: '0.6rem', background: 'transparent', outline: 'none' }}
                        >
                          <option value="">Select GST</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18%</option>
                        </select>
                      </td>

                      <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#EFF6FF' }}><input type="number" value={it.service_qty} onChange={(e) => updateItem(idx, 'service_qty', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '1px 3px', fontSize: '0.6rem', background: 'transparent' }} /></td>
                      <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#EFF6FF' }}><input type="number" value={it.service_rate} onChange={(e) => updateItem(idx, 'service_rate', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '1px 3px', fontSize: '0.6rem', background: 'transparent' }} /></td>
                      <td style={{ padding: '1px', border: '1px solid #E5E7EB', background: '#EFF6FF' }}>
                        <select
                          value={it.service_gst_rate || ''}
                          onChange={(e) => updateItem(idx, 'service_gst_rate', e.target.value)}
                          style={{ width: '100%', border: 'none', padding: '1px 3px', fontSize: '0.6rem', background: 'transparent', outline: 'none' }}
                        >
                          <option value="">Select GST</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18%</option>
                        </select>
                      </td>

                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.taxable_supply || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.gst_supply || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.total_supply || 0).toLocaleString()}</td>

                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.taxable_service || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.gst_service || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#6B7280', fontSize: '0.65rem' }}>₹{(it.total_service || 0).toLocaleString()}</td>

                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB', fontSize: '0.65rem' }}>₹{(it.total_taxable || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB', fontSize: '0.65rem' }}>₹{(it.total_gst || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, background: '#FEF3C7', fontSize: '0.7rem' }}>₹{(it.total_invoice || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 20, background: '#374151', color: 'white', fontWeight: 700 }}>
                  <tr>
                    <td colSpan="8" style={{ padding: '4px 10px', textAlign: 'right', fontSize: '0.7rem' }}>GRAND TOTALS:</td>
                    <td colSpan="3"></td>
                    <td colSpan="3"></td>
                    <td colSpan="3" style={{ textAlign: 'right', padding: '4px 10px', fontSize: '0.7rem' }}>₹{getSummaryTotals().taxable.toLocaleString()} <span style={{ fontSize: '0.55rem', opacity: 0.8 }}>(Taxable)</span></td>
                    <td colSpan="3" style={{ textAlign: 'right', padding: '4px 10px', fontSize: '0.7rem' }}>₹{getSummaryTotals().gst.toLocaleString()} <span style={{ fontSize: '0.55rem', opacity: 0.8 }}>(GST)</span></td>
                    <td colSpan="3" style={{ textAlign: 'right', padding: '4px 10px', background: '#059669', fontSize: '0.8rem' }}>₹{getSummaryTotals().grandTotal.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
              <button onClick={() => setStep(1)} style={{ padding: '12px 24px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', cursor: 'pointer' }}>← Back</button>
              <button onClick={nextStep} style={{ padding: '12px 32px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Review</button>
            </div>
          </div>
        )}

        {/* STEP 3: Final Summary */}
        {step === 3 && (
          <div>
            <h3 style={{ marginBottom: '24px' }}>3. Final Summary & Confirmation</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '32px' }}>
              <div style={{ background: '#F9FAFB', padding: '20px', borderRadius: '8px' }}>
                <p><strong>PO Number:</strong> {basicDetails.poNumber}</p>
                <p><strong>Customer:</strong> {customers.find(c => c.id == basicDetails.customerId)?.name}</p>
                <p><strong>Location:</strong> {locations.find(l => l.id == basicDetails.locationId)?.label}</p>
                <p><strong>Date:</strong> {basicDetails.poDate}</p>
              </div>
              <div style={{ background: '#ECFDF5', padding: '20px', borderRadius: '8px', border: '1px solid #A7F3D0', textAlign: 'right' }}>
                <p style={{ margin: '0 0 4px', color: '#065F46' }}><strong>Overall Subtotal:</strong> ₹{getSummaryTotals().taxable.toLocaleString()}</p>
                <p style={{ margin: '0 0 4px', color: '#065F46' }}><strong>Overall GST:</strong> ₹{getSummaryTotals().gst.toLocaleString()}</p>
                <p style={{ fontSize: '1.5rem', color: '#065F46', margin: 0 }}><strong>Grand Total:</strong> ₹{getSummaryTotals().grandTotal.toLocaleString()}</p>
              </div>
            </div>

            <SummaryTable data={items} totals={getSummaryTotals()} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
              <button onClick={() => setStep(2)} style={{ padding: '12px 24px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', cursor: 'pointer' }}>← Edit Items</button>
              <button onClick={handleSubmit} disabled={submitting} style={{ padding: '12px 40px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                {submitting ? 'Creating PO...' : '✓ Confirm & Submit PO'}
              </button>
            </div>
          </div>
        )}

        {showPasteModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '98%', maxWidth: '1400px', maxHeight: '95vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <h3 style={{ margin: 0 }}>Interactive Excel Workspace</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <label style={{ padding: '6px 12px', background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
                      Load from Excel
                      <input type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={handleModalFileUpload} style={{ display: 'none' }} />
                    </label>
                    <button onClick={handleExportGrid} style={{ padding: '6px 12px', background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
                      Save as Excel
                    </button>
                  </div>
                </div>
                <button onClick={() => setPasteRows(prev => [...prev, {
                  ref_no: '', package_name: '', heading: '', sub_heading: '', item_name: '', description: '', uom: '',
                  supply_qty: '', supply_rate: '', supply_gst_rate: '', service_qty: '', service_rate: '', service_gst_rate: ''
                }])} style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>+ Add Row</button>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '16px' }}>Edit cells directly, use <b>Ctrl+V</b> to paste from your desktop Excel, or <b>Load from Excel</b> to import a whole file. Click <b>Save as Excel</b> to export your current work.</p>

              <div onPaste={handleGridPaste} style={{ flex: 1, overflow: 'auto', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#F9FAFB' }}>
                <table style={{ width: 'max-content', borderCollapse: 'collapse', fontSize: '0.65rem', background: 'white' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F3F4F6' }}>
                    <tr>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '40px' }}>#</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '100px' }}>Ref No</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '120px' }}>Package</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '120px' }}>Heading</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '120px' }}>Sub Heading (if Any)</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '150px' }}>Item Name</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '200px' }}>Item Description</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '60px' }}>UOM</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '100px', background: '#ECFDF5' }}>Supply Qty</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '110px', background: '#ECFDF5' }}>Supply Rate</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '100px', background: '#ECFDF5' }}>Supply GST %</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '100px', background: '#EFF6FF' }}>Service Qty</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '110px', background: '#EFF6FF' }}>Service Rate</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '100px', background: '#EFF6FF' }}>Service GST %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pasteRows.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '4px', border: '1px solid #E5E7EB', textAlign: 'center', background: '#F9FAFB' }}>{idx + 1}</td>
                        {Object.keys(row).map(field => {
                          const isNumeric = ['supply_qty', 'supply_rate', 'supply_gst_rate', 'service_qty', 'service_rate', 'service_gst_rate'].includes(field);
                          return (
                            <td key={field} style={{ padding: 0, border: '1px solid #E5E7EB', background: isNumeric ? '#FDFDEA' : 'white' }}>
                              {['supply_gst_rate', 'service_gst_rate'].includes(field) ? (
                                <select
                                  value={row[field] || ''}
                                  onChange={(e) => {
                                    const newRows = [...pasteRows];
                                    newRows[idx] = { ...newRows[idx], [field]: e.target.value };
                                    setPasteRows(newRows);
                                  }}
                                  style={{ width: '100%', border: 'none', padding: '6px', fontSize: '0.75rem', outline: 'none', background: 'transparent' }}
                                >
                                  <option value="">Select GST</option>
                                  <option value="5">5</option>
                                  <option value="12">12</option>
                                  <option value="18">18</option>
                                </select>
                              ) : (
                                <input
                                  type={isNumeric ? "number" : "text"}
                                  value={row[field]}
                                  onChange={(e) => {
                                    const newRows = [...pasteRows];
                                    newRows[idx] = { ...newRows[idx], [field]: e.target.value };
                                    setPasteRows(newRows);
                                  }}
                                  style={{ width: '100%', border: 'none', padding: '6px', fontSize: '0.75rem', outline: 'none', background: 'transparent', textAlign: isNumeric ? 'right' : 'left' }}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button onClick={() => setShowPasteModal(false)} style={{ padding: '10px 20px', background: '#F3F4F6', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button onClick={handleBulkPaste} disabled={pasteRows.every(r => !r.item_name && !r.ref_no)} style={{ padding: '10px 24px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', opacity: pasteRows.every(r => !r.item_name && !r.ref_no) ? 0.5 : 1 }}>
                  Process & Sync {pasteRows.filter(r => r.item_name || r.ref_no).length} Items
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Helper Component: Summary Table using TanStack ---
function SummaryTable({ data }) {
  const summarizedData = React.useMemo(() => {
    const summary = data.reduce((acc, it) => {
      const pkg = it.package_name || 'General';
      if (!acc[pkg]) {
        acc[pkg] = { 
          package_name: pkg, 
          supply_taxable: 0, 
          supply_gst: 0, 
          service_taxable: 0, 
          service_gst: 0, 
          total_taxable: 0, 
          total_gst: 0, 
          total_invoice: 0 
        };
      }
      acc[pkg].supply_taxable += (it.taxable_supply || 0);
      acc[pkg].supply_gst += (it.gst_supply || 0);
      acc[pkg].service_taxable += (it.taxable_service || 0);
      acc[pkg].service_gst += (it.gst_service || 0);
      acc[pkg].total_taxable += (it.total_taxable || 0);
      acc[pkg].total_gst += (it.total_gst || 0);
      acc[pkg].total_invoice += (it.total_invoice || 0);
      return acc;
    }, {});
    return Object.values(summary);
  }, [data]);

  const columns = React.useMemo(() => [
    {
      header: 'Package Name',
      accessorKey: 'package_name',
      cell: info => <span style={{ fontWeight: 600, color: '#111827' }}>{info.getValue()}</span>,
    },
    {
      header: 'Supply Tax Value',
      accessorKey: 'supply_taxable',
      cell: info => `₹${info.getValue().toLocaleString()}`,
    },
    {
      header: 'Supply GST',
      accessorKey: 'supply_gst',
      cell: info => `₹${info.getValue().toLocaleString()}`,
    },
    {
      header: 'Service Tax Value',
      accessorKey: 'service_taxable',
      cell: info => `₹${info.getValue().toLocaleString()}`,
    },
    {
      header: 'Service GST',
      accessorKey: 'service_gst',
      cell: info => `₹${info.getValue().toLocaleString()}`,
    },
    {
      header: 'Total Tax Value',
      accessorKey: 'total_taxable',
      cell: info => <span style={{ fontWeight: 600 }}>₹{info.getValue().toLocaleString()}</span>,
    },
    {
      header: 'Total GST',
      accessorKey: 'total_gst',
      cell: info => <span style={{ fontWeight: 600 }}>₹{info.getValue().toLocaleString()}</span>,
    },
    {
      header: 'Total Invoice',
      accessorKey: 'total_invoice',
      cell: info => <span style={{ fontWeight: 700, color: '#2563EB' }}>₹{info.getValue().toLocaleString()}</span>,
    }
  ], []);

  const table = useReactTable({
    data: summarizedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const grandTotals = summarizedData.reduce((acc, row) => ({
    supply_taxable: acc.supply_taxable + row.supply_taxable,
    supply_gst: acc.supply_gst + row.supply_gst,
    service_taxable: acc.service_taxable + row.service_taxable,
    service_gst: acc.service_gst + row.service_gst,
    total_taxable: acc.total_taxable + row.total_taxable,
    total_gst: acc.total_gst + row.total_gst,
    total_invoice: acc.total_invoice + row.total_invoice
  }), { supply_taxable: 0, supply_gst: 0, service_taxable: 0, service_gst: 0, total_taxable: 0, total_gst: 0, total_invoice: 0 });

  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E5E7EB', overflow: 'hidden', marginBottom: '16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} style={{ padding: '12px', textAlign: 'left', color: '#4B5563', fontWeight: 700, borderRight: '1px solid #F3F4F6' }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '10px 12px', borderRight: '1px solid #F3F4F6' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot style={{ background: '#F9FAFB', fontWeight: 700, borderTop: '2px solid #E5E7EB' }}>
            <tr>
              <td style={{ padding: '12px' }}>TOTAL</td>
              <td style={{ padding: '12px' }}>₹{grandTotals.supply_taxable.toLocaleString()}</td>
              <td style={{ padding: '12px' }}>₹{grandTotals.supply_gst.toLocaleString()}</td>
              <td style={{ padding: '12px' }}>₹{grandTotals.service_taxable.toLocaleString()}</td>
              <td style={{ padding: '12px' }}>₹{grandTotals.service_gst.toLocaleString()}</td>
              <td style={{ padding: '12px' }}>₹{grandTotals.total_taxable.toLocaleString()}</td>
              <td style={{ padding: '12px' }}>₹{grandTotals.total_gst.toLocaleString()}</td>
              <td style={{ padding: '12px', color: '#2563EB' }}>₹{grandTotals.total_invoice.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ background: '#F0F9FF', padding: '16px 24px', borderRadius: '12px', border: '1px solid #BAE6FD', textAlign: 'right', minWidth: '300px' }}>
          <p style={{ margin: '0 0 4px', color: '#0369A1', fontSize: '0.85rem', fontWeight: 600 }}>Final Grand Total</p>
          <p style={{ margin: 0, color: '#0369A1', fontSize: '2rem', fontWeight: 900 }}>₹{grandTotals.total_invoice.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
