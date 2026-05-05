import React, { useState, useEffect } from 'react';
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

export default function NewNTPO() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // STATE
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Selection State
  const [customers, setCustomers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [hasOriginalPO, setHasOriginalPO] = useState(null);
  const [originalPOs, setOriginalPOs] = useState([]);
  const [selectedOriginalPO, setSelectedOriginalPO] = useState(null);
  const [linkedPoId, setLinkedPoId] = useState(null);

  // PO Basic Details
  const [poNumber, setPONumber] = useState('');
  const [isTemporary, setIsTemporary] = useState(false);
  const [poDate, setPODate] = useState(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Attachments State
  const [attachments, setAttachments] = useState({
    po_copy: null, // Customer Approval
    po_annex: null, // PO Annex
    other: null     // Other
  });
  const [attachmentPaths, setAttachmentPaths] = useState({
    po_copy: '',
    po_annex: '',
    other: ''
  });
  const [showViewer, setShowViewer] = useState(null);
  const [previewExcelData, setPreviewExcelData] = useState(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteRows, setPasteRows] = useState(Array(10).fill({}).map(() => ({
    ref_no: '', package_name: '', heading: '', sub_heading: '', item_name: '', description: '', uom: '',
    supply_qty: '', supply_rate: '', supply_gst_rate: '', service_qty: '', service_rate: '', service_gst_rate: ''
  })));

  // Items State
  const [entryMethod, setEntryMethod] = useState(null);
  const [items, setItems] = useState([]);

  // --- Helper Functions ---

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

  // --- API Calls ---

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('http://localhost:3000/api/customers', { headers });
        setCustomers(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error(err);
      }
    };
    fetchCustomers();
  }, []);

  const handleCustomerChange = async (e) => {
    const val = e.target.value;
    setSelectedCustomer(val);
    setSelectedLocation('');
    setLocations([]);

    if (val) {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get(`http://localhost:3000/api/locations?customer_id=${val}`, { headers });
        setLocations(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleOriginalPoOption = async (hasIt) => {
    setHasOriginalPO(hasIt);
    if (hasIt) {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('http://localhost:3000/api/pos?type=original', { headers });
        setOriginalPOs(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error(err);
      }
    } else {
      setPONumber('');
      setLinkedPoId(null);
    }
  };

  const handleOriginalPOSelect = (e) => {
    const poId = e.target.value;
    const po = originalPOs.find(p => p.id.toString() === poId);
    if (po) {
      setSelectedOriginalPO(po);
      setLinkedPoId(po.id);
      setPODate(po.po_date || new Date().toISOString().split('T')[0]);
      setStartDate(po.start_date || '');
      setEndDate(po.end_date || '');

      // Clean PO number and add sequence
      const nextIdx = (po.nt_count || 0) + 1;
      const cleanPO = (po.po_number || po.order_id).replace(/-(\d{10,})$/, '');
      const tempNum = `${cleanPO}-NT-${nextIdx}`;
      setPONumber(tempNum);
      setIsTemporary(true);
    } else {
      setSelectedOriginalPO(null);
      setLinkedPoId(null);
      setPONumber('');
      setIsTemporary(false);
    }
  };

  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PO Format for UPLOAD');
    const masterSheet = workbook.addWorksheet('MasterData', { state: 'veryHidden' });

    // Populate Master Data
    masterSheet.getCell('A1').value = 'Customers';
    customers.forEach((c, i) => {
      masterSheet.getCell(`A${i + 2}`).value = c.name || c.customer_name || String(c);
    });

    masterSheet.getCell('B1').value = 'Locations';
    locations.forEach((l, i) => {
      masterSheet.getCell(`B${i + 2}`).value = l.name || l.location_name || String(l);
    });

    // Define columns width
    worksheet.columns = [
      { width: 15 }, // A: Label
      { width: 25 }, // B: Input
      { width: 15 }, // C: empty
      { width: 15 }, // D: Label
      { width: 15 }, // E: Button
      { width: 15 }, // F: empty
      { width: 15 }, // G: empty
      { width: 15 }, // H: empty
      { width: 30 }, // I: Help
    ];

    // Header Section (Row 1)
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Table for NEW PO';
    titleCell.font = { size: 20, bold: true, color: { argb: 'FFFF0000' } };

    worksheet.mergeCells('F1:H1');
    const reviewBtn = worksheet.getCell('F1');
    reviewBtn.value = 'REVIEW/SUBMIT';
    reviewBtn.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
    reviewBtn.alignment = { horizontal: 'center', vertical: 'middle' };
    reviewBtn.font = { color: { argb: 'FFFFFFFF' }, bold: true };

    const headerFields = [
      ['Select Customer', 'Selects from Master - If customer is not in Master, then Master to be updated first'],
      ['Select Location', 'Selects from Master - If customer is not in Master, then Master to be updated first'],
      ['Enter PO No', 'Sales enters the PO number as per the Customer Issued Document'],
      ['PO Number Displayed', 'This is System Generated - CUST ID/Location ID/PO NO'],
      ['PO Date', 'Calender', 'Attach PO Copy'],
      ['Start Date', 'Calender', 'Attach PO Annex'],
      ['Est End Date', 'Calender', 'Other Attachment']
    ];

    headerFields.forEach((field, i) => {
      const rowNum = i + 2;
      const labelCell = worksheet.getCell(`A${rowNum}`);
      labelCell.value = field[0];
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF1DE' } };
      labelCell.font = { bold: true };
      labelCell.border = { outline: true, top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

      const inputCell = worksheet.getCell(`B${rowNum}`);
      inputCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow for input
      inputCell.border = { outline: true, top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

      const helpCell = worksheet.getCell(`I${rowNum}`);
      helpCell.value = field[field.length - 1];
      helpCell.font = { size: 9, italic: true };

      // Add Dropdowns
      if (field[0] === 'Select Customer' && customers.length > 0) {
        inputCell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`MasterData!$A$2:$A$${customers.length + 1}`]
        };
      }
      if (field[0] === 'Select Location' && locations.length > 0) {
        inputCell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`MasterData!$B$2:$B$${locations.length + 1}`]
        };
      }

      if (field[1] === 'Calender') {
        const calLabel = worksheet.getCell(`D${rowNum}`);
        calLabel.value = 'Calender';
        calLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        calLabel.border = { outline: true, top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        const btnCell = worksheet.getCell(`E${rowNum}`);
        btnCell.value = field[2];
        btnCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
        btnCell.font = { color: { argb: 'FFFFFFFF' }, size: 9 };
        btnCell.alignment = { horizontal: 'center' };
        btnCell.border = { outline: true, top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      }
    });

    // Table Header (Row 11)
    const tableHeaderRow = worksheet.getRow(11);
    const headers = [
      'Sl no (SYS GEN)', 'Ref No', 'Package', 'Heading', 'Sub Heading (if Any)',
      'Item Name', 'Item Description', 'UOM', 'Supply QTY', 'Supply Rate',
      'Supply GST', 'Service QTY', 'Service Rate', 'Service GST'
    ];

    tableHeaderRow.values = headers;
    tableHeaderRow.eachCell((cell, colNum) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
      };
      // Set width for table columns
      const column = worksheet.getColumn(colNum);
      if (colNum > 8) column.width = 15;
      else if (colNum === 6) column.width = 30;
      else if (colNum === 7) column.width = 40;
    });
    tableHeaderRow.height = 35;

    // Data rows style (12 to 50)
    for (let i = 12; i <= 50; i++) {
      const row = worksheet.getRow(i);
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum <= headers.length) {
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
          };
          if (colNum === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        }
      });
    }

    // Add Note
    worksheet.mergeCells('A52:N52');
    const noteCell = worksheet.getCell('A52');
    noteCell.value = 'NOTE: The User will click the Review Button after entering the details into the form. The system will display a summary by Package for the entered details.';
    noteCell.font = { bold: true, size: 10 };

    // EDIT Section (Row 55...)
    worksheet.mergeCells('A55:G55');
    const editTitleCell = worksheet.getCell('A55');
    editTitleCell.value = 'Table for EDIT PO or EDIT NT PO';
    editTitleCell.font = { size: 20, bold: true, color: { argb: 'FFFF0000' } };

    // Generate and Save
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), 'NT_PO_Template.xlsx');
  };

  const uploadAttachments = async () => {
    const formData = new FormData();
    if (attachments.po_copy) formData.append('po_copy', attachments.po_copy);
    if (attachments.po_annex) formData.append('po_annex', attachments.po_annex);
    if (attachments.other) formData.append('other', attachments.other);

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' };
      const res = await axios.post('http://localhost:3000/api/upload-multi', formData, { headers });
      setAttachmentPaths(res.data);
      return res.data;
    } catch (err) {
      console.error('Upload failed', err);
      alert('File upload failed');
      return null;
    }
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

  // --- Handlers ---

  const handleManualEntry = () => {
    setItems([calculateRow({
      line_number: 1, ref_no: '', package_name: '', heading: '', sub_heading: '',
      item_name: '', description: '', uom: '',
      supply_qty: 0, supply_rate: 0, supply_gst_rate: 18,
      service_qty: 0, service_rate: 0, service_gst_rate: 18
    })]);
    setEntryMethod('manual');
    setStep(5);
  };

  const handleGridPaste = (e) => {
    e.preventDefault();
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedData = clipboardData.getData('Text');
    const rows = pastedData.split('\n').filter(r => r.trim());

    const newPasteRows = rows.map(r => {
      const cols = r.split('\t').map(c => c.trim());
      // Skip header if it looks like one
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

    if (newPasteRows.length > 0) {
      setPasteRows(newPasteRows);
    }
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
        sub_heading: r['Sub Heading'] || '',
        item_name: r['Item Name'] || r.Item || '',
        description: r.Description || '',
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

  const handleBulkPaste = () => {
    const validRows = pasteRows.filter(r => r.item_name || r.package_name || r.ref_no);
    if (validRows.length === 0) return;

    const newItems = validRows.map((r, idx) => {
      return calculateRow({
        line_number: items.length + idx + 1,
        ref_no: r.ref_no,
        package_name: r.package_name,
        heading: r.heading,
        sub_heading: r.sub_heading,
        item_name: r.item_name || 'Item',
        description: r.description,
        uom: r.uom,
        supply_qty: cleanNum(r.supply_qty),
        supply_rate: cleanNum(r.supply_rate),
        supply_gst_rate: cleanNum(r.supply_gst_rate) || 18,
        service_qty: cleanNum(r.service_qty),
        service_rate: cleanNum(r.service_rate),
        service_gst_rate: cleanNum(r.service_gst_rate) || 18
      });
    });

    setItems(prev => [...prev, ...newItems]);
    setPasteRows(Array(10).fill({}).map(() => ({
      ref_no: '', package_name: '', heading: '', sub_heading: '', item_name: '', description: '', uom: '',
      supply_qty: '', supply_rate: '', supply_gst_rate: '', service_qty: '', service_rate: '', service_gst_rate: ''
    })));
    setShowPasteModal(false);
  };

  const updateItem = (idx, field, val) => {
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = calculateRow({ ...updated[idx], [field]: val });
      return updated;
    });
  };

  const addRow = () => {
    const lastItem = items[items.length - 1];
    setItems([...items, calculateRow({
      line_number: items.length + 1, ref_no: '',
      package_name: lastItem?.package_name || '', heading: '', sub_heading: '',
      item_name: '', description: '', uom: '',
      supply_qty: 0, supply_rate: 0, supply_gst_rate: 18,
      service_qty: 0, service_rate: 0, service_gst_rate: 18
    })]);
  };

  const deleteRow = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const nextStep = async () => {
    if (step === 3) {
      setLoading(true);
      const paths = await uploadAttachments();
      setLoading(false);
      if (paths) setStep(4);
    } else {
      setStep(s => s + 1);
    }
  };

  const prevStep = () => {
    if (step === 1) navigate('/dashboard');
    else setStep(s => s - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const subtotal = items.reduce((acc, it) => acc + (it.total_taxable || 0), 0);
      const gst_total = items.reduce((acc, it) => acc + (it.total_gst || 0), 0);
      const grand_total = items.reduce((acc, it) => acc + (it.total_invoice || 0), 0);

      const payload = {
        customer_id: parseInt(selectedCustomer),
        location_id: parseInt(selectedLocation),
        po_number: poNumber,
        po_date: poDate,
        start_date: startDate,
        end_date: endDate,
        po_copy_path: attachmentPaths.po_copy,
        po_annex_path: attachmentPaths.po_annex,
        other_attachment_path: attachmentPaths.other,
        is_nt_po: 1,
        is_temporary: isTemporary ? 1 : 0,
        linked_po_id: linkedPoId,
        subtotal,
        gst_total,
        grand_total,
        items
      };

      await axios.post('http://localhost:3000/api/pos', payload, { headers });
      alert('NT Purchase Order created successfully!');
      navigate('/dashboard');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create NT PO');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Renderers ---

  const renderFileViewer = () => {
    if (!showViewer) return null;
    const file = attachments[showViewer];
    if (!file) return null;

    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.xlsm') || file.name.toLowerCase().endsWith('.csv');
    const url = URL.createObjectURL(file);

    if (isExcel && !previewExcelData) {
      parseExcel(file).then(data => setPreviewExcelData(data));
    }

    const allHeaders = previewExcelData ? Array.from(new Set(previewExcelData.flatMap(row => Object.keys(row)))) : [];

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '95%', height: '90%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Preview: {file.name}</h3>
            <button onClick={() => { setShowViewer(null); setPreviewExcelData(null); URL.revokeObjectURL(url); }} style={{ padding: '8px 16px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close Preview</button>
          </div>
          <div style={{ flex: 1, background: '#F3F4F6', borderRadius: '8px', overflow: 'auto' }}>
            {isExcel ? (
              previewExcelData ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', background: 'white' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#F9FAFB', zIndex: 10 }}>
                    <tr>{allHeaders.map(h => <th key={h} style={{ padding: '10px', border: '1px solid #E5E7EB', textAlign: 'left' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {previewExcelData.map((row, i) => (
                      <tr key={i}>{allHeaders.map((h, j) => <td key={j} style={{ padding: '8px', border: '1px solid #E5E7EB' }}>{row[h] !== undefined ? String(row[h]) : '-'}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ textAlign: 'center', padding: '40px' }}>Parsing Excel...</p>
            ) : <iframe src={url} width="100%" height="100%" title="File Viewer" style={{ border: 'none' }} />}
          </div>
        </div>
      </div>
    );
  };

  const steps = [
    { id: 1, title: 'Customer' },
    { id: 2, title: 'Original PO' },
    { id: 3, title: 'Dates & Files' },
    { id: 4, title: 'Method' },
    { id: 5, title: 'Items' },
    { id: 6, title: 'Confirm' }
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {renderFileViewer()}

      {/* Step Indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', background: 'white', padding: '15px 20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        {steps.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', opacity: step >= s.id ? 1 : 0.4 }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '50%',
              background: step === s.id ? '#3B82F6' : step > s.id ? '#10B981' : '#E5E7EB',
              color: step >= s.id ? 'white' : '#6B7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold',
              marginRight: '8px'
            }}>{step > s.id ? '✓' : s.id}</div>
            <span style={{ fontWeight: step === s.id ? 600 : 400 }}>{s.title}</span>
            {s.id < 6 && <div style={{ height: '2px', width: '40px', background: '#E5E7EB', margin: '0 15px' }} />}
          </div>
        ))}
      </div>

      <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <button onClick={prevStep} style={{ marginBottom: '20px', padding: '8px 16px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer' }}>← Back</button>

        {step === 1 && (
          <div style={{ maxWidth: '500px' }}>
            <h3>1. Select Customer & Location</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <label style={{ fontWeight: 600 }}>Customer</label>
              <select value={selectedCustomer} onChange={handleCustomerChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }}>
                <option value="">-- Select Customer --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label style={{ fontWeight: 600 }}>Location</label>
              <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} disabled={!selectedCustomer}>
                <option value="">-- Select Location --</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.label} - {loc.city}</option>)}
              </select>
              <button onClick={nextStep} disabled={!selectedCustomer || !selectedLocation} style={{ marginTop: '20px', padding: '12px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: (!selectedCustomer || !selectedLocation) ? 0.5 : 1 }}>Next Step →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3>2. Original PO Selection</h3>
            <p>Do you have the original PO from the customer?</p>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
              <button onClick={() => handleOriginalPoOption(true)} style={{ flex: 1, padding: '20px', background: hasOriginalPO === true ? '#EFF6FF' : 'white', border: `2px solid ${hasOriginalPO === true ? '#3B82F6' : '#E5E7EB'}`, borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Yes, I have original PO</button>
              <button onClick={() => handleOriginalPoOption(false)} style={{ flex: 1, padding: '20px', background: hasOriginalPO === false ? '#EFF6FF' : 'white', border: `2px solid ${hasOriginalPO === false ? '#3B82F6' : '#E5E7EB'}`, borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>No, create internal PO</button>
            </div>
            {hasOriginalPO === true && (
              <div style={{ maxWidth: '500px', marginTop: '20px' }}>
                <label style={{ fontWeight: 600 }}>Select Original PO</label>
                <select value={linkedPoId || ''} onChange={handleOriginalPOSelect} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB', marginTop: '8px' }}>
                  <option value="">-- Select Original PO --</option>
                  {originalPOs.map(po => <option key={po.id} value={po.id}>{po.po_number || po.order_id} - {po.customer_name}</option>)}
                </select>
                {linkedPoId && <div style={{ background: '#D1FAE5', padding: '12px', borderRadius: '6px', border: '1px solid #6EE7B7', marginTop: '16px' }}><strong>Generated NT PO:</strong> {poNumber}</div>}
              </div>
            )}
            {hasOriginalPO === false && (
              <div style={{ maxWidth: '500px', marginTop: '20px' }}>
                <label style={{ fontWeight: 600 }}>Enter Internal NT PO Number</label>
                <input type="text" value={poNumber} onChange={(e) => setPONumber(e.target.value)} placeholder="e.g. INT-PO-001" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB', marginTop: '8px' }} />
              </div>
            )}
            <button onClick={nextStep} disabled={hasOriginalPO === null || (hasOriginalPO === true && !linkedPoId) || (hasOriginalPO === false && !poNumber)} style={{ marginTop: '30px', padding: '12px 24px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Next Step →</button>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            <div>
              <h3>Dates</h3>
              <div style={{ display: 'grid', gap: '15px' }}>
                <div><label style={{ fontWeight: 600, display: 'block', marginBottom: '5px' }}>PO Date</label><input type="date" value={poDate} onChange={(e) => setPODate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} /></div>
                <div><label style={{ fontWeight: 600, display: 'block', marginBottom: '5px' }}>Start Date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} /></div>
                <div><label style={{ fontWeight: 600, display: 'block', marginBottom: '5px' }}>Est. End Date</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #D1D5DB' }} /></div>
              </div>
            </div>
            <div>
              <h3>Attachments</h3>
              <div style={{ display: 'grid', gap: '15px' }}>
                {['po_copy', 'po_annex', 'other'].map(type => (
                  <div key={type} style={{ border: '1px solid #E5E7EB', padding: '12px', borderRadius: '8px' }}>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'capitalize' }}>{type === 'po_copy' ? 'Customer Approval' : type === 'po_annex' ? 'PO Annex' : 'Other Attachment'}</label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.xlsm,.csv" onChange={(e) => setAttachments(prev => ({ ...prev, [type]: e.target.files[0] }))} style={{ flex: 1 }} />
                      {attachments[type] && <button onClick={() => setShowViewer(type)} style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem' }}>View</button>}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={nextStep} style={{ marginTop: '30px', width: '100%', padding: '12px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600 }}>{loading ? 'Uploading Files...' : 'Next: Entry Method →'}</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h3>Data Entry Method</h3>
            <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
              {/* <div style={{ flex: 1, padding: '30px', border: '2px dashed #D1D5DB', borderRadius: '8px', textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 15px' }}>Upload Excel</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <input type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const raw = await parseExcel(file);
                      setItems(raw.map((r, i) => {
                        // Smart mapping for positional data
                        if (r._is_headerless) {
                          const isSlNo = /^\d+$/.test(r.col0) && String(r.col0).length < 4;
                          const offset = isSlNo ? 1 : 0;
                          
                          return calculateRow({
                            line_number: i + 1,
                            ref_no: r[`col${0 + offset}`] || '',
                            package_name: r[`col${1 + offset}`] || '',
                            heading: r[`col${2 + offset}`] || '',
                            sub_heading: r[`col${3 + offset}`] || '',
                            item_name: r[`col${4 + offset}`] || 'Item',
                            description: r[`col${5 + offset}`] || '',
                            uom: r[`col${6 + offset}`] || '',
                            supply_qty: cleanNum(r[`col${7 + offset}`]),
                            supply_rate: cleanNum(r[`col${8 + offset}`]),
                            supply_gst_rate: cleanNum(r[`col${9 + offset}`]) || 18,
                            service_qty: cleanNum(r[`col${10 + offset}`]),
                            service_rate: cleanNum(r[`col${11 + offset}`]),
                            service_gst_rate: cleanNum(r[`col${12 + offset}`]) || 18
                          });
                        }

                        // Named mapping
                        return calculateRow({
                          line_number: i + 1, 
                          ref_no: r['Ref No'] || r['ref_no'] || r['Reference'] || '', 
                          package_name: r.Package || r['Package Name'] || '',
                          heading: r.Heading || '', 
                          sub_heading: r['Sub Heading'] || '',
                          item_name: r['Item Name'] || r.Item || 'Item', 
                          description: r.Description || '', 
                          uom: r.UOM || '',
                          supply_qty: cleanNum(r['Supply Qty'] || r['Supply QTY']),
                          supply_rate: cleanNum(r['Supply Rate']),
                          supply_gst_rate: cleanNum(r['Supply GST']) || 18,
                          service_qty: cleanNum(r['Service Qty']),
                          service_rate: cleanNum(r['Service Rate']),
                          service_gst_rate: cleanNum(r['Service GST']) || 18
                        });
                      }));
                      setEntryMethod('upload'); setStep(5);
                    }
                  }} />
                  <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '15px' }}>
                    <button 
                      onClick={handleDownloadTemplate}
                      style={{ background: '#F9FAFB', border: '1px solid #D1D5DB', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
                      Download Excel Template
                    </button>
                  </div>
                </div>
              </div> */}
              <div style={{ flex: 1, padding: '30px', border: '2px solid #E5E7EB', borderRadius: '8px', textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 15px' }}>Enter Manually</h4>
                <button onClick={handleManualEntry} style={{ padding: '12px 24px', background: '#374151', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600 }}>Start Manual Entry</button>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>5. Line Items Review</h3>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowPasteModal(true)}
                  style={{ padding: '8px 16px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>table_chart</span>
                  Excel Upload
                </button>
                <button onClick={addRow} style={{ padding: '8px 16px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600 }}>+ Add Row</button>
              </div>
            </div>

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

                  <div
                    onPaste={handleGridPaste}
                    style={{ flex: 1, overflow: 'auto', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#F9FAFB' }}
                  >
                    <table style={{ width: 'max-content', borderCollapse: 'collapse', fontSize: '0.75rem', background: 'white' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F3F4F6' }}>
                        <tr>
                          <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '40px' }}>#</th>
                          <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '100px' }}>Ref No</th>
                          <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '120px' }}>Package</th>
                          <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '120px' }}>Heading</th>
                          <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '120px' }}>Sub Heading</th>
                          <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '150px' }}>Item Name</th>
                          <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '200px' }}>Description</th>
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
                    <button
                      onClick={handleBulkPaste}
                      disabled={pasteRows.every(r => !r.item_name && !r.ref_no)}
                      style={{ padding: '10px 24px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', opacity: pasteRows.every(r => !r.item_name && !r.ref_no) ? 0.5 : 1 }}
                    >
                      Process & Sync {pasteRows.filter(r => r.item_name || r.ref_no).length} Items
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
              <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.7rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F9FAFB' }}>
                  <tr style={{ whiteSpace: 'nowrap' }}>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>Sl no</th>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>Ref No</th>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>Package</th>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>Heading</th>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>Sub Heading</th>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>Item Name</th>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>Description</th>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>UOM</th>
                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#ECFDF5', textAlign: 'center' }}>Supply Details</th>
                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#EFF6FF', textAlign: 'center' }}>Service Details</th>
                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#F3F4F6', textAlign: 'center' }}>Auto Cal (Supply)</th>
                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#F3F4F6', textAlign: 'center' }}>Auto Cal (Service)</th>
                    <th colSpan="3" style={{ padding: '3px', border: '1px solid #E5E7EB', background: '#FEF3C7', textAlign: 'center' }}>TOTALS</th>
                    <th rowSpan="2" style={{ padding: '4px 6px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}>Del</th>
                  </tr>
                  <tr style={{ whiteSpace: 'nowrap' }}>
                    <th style={{ background: '#ECFDF5' }}>Qty</th><th style={{ background: '#ECFDF5' }}>Rate</th><th style={{ background: '#ECFDF5' }}>GST%</th>
                    <th style={{ background: '#EFF6FF' }}>Qty</th><th style={{ background: '#EFF6FF' }}>Rate</th><th style={{ background: '#EFF6FF' }}>GST%</th>
                    <th style={{ background: '#F3F4F6' }}>Taxable</th><th style={{ background: '#F3F4F6' }}>GST</th><th style={{ background: '#F3F4F6' }}>Total</th>
                    <th style={{ background: '#F3F4F6' }}>Taxable</th><th style={{ background: '#F3F4F6' }}>GST</th><th style={{ background: '#F3F4F6' }}>Total</th>
                    <th style={{ background: '#FEF3C7' }}>Taxable</th><th style={{ background: '#FEF3C7' }}>GST</th><th style={{ background: '#FEF3C7' }}>Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB' }}><input value={it.ref_no} onChange={e => updateItem(idx, 'ref_no', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB' }}><input value={it.package_name} onChange={e => updateItem(idx, 'package_name', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB' }}><input value={it.heading} onChange={e => updateItem(idx, 'heading', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB' }}><input value={it.sub_heading} onChange={e => updateItem(idx, 'sub_heading', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB' }}><input value={it.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB' }}><input value={it.description} onChange={e => updateItem(idx, 'description', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB' }}><input value={it.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#ECFDF5' }}><input type="number" value={it.supply_qty} onChange={e => updateItem(idx, 'supply_qty', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px', background: 'transparent', textAlign: 'right' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#ECFDF5' }}><input type="number" value={it.supply_rate} onChange={e => updateItem(idx, 'supply_rate', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px', background: 'transparent', textAlign: 'right' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#ECFDF5' }}><input type="number" value={it.supply_gst_rate} onChange={e => updateItem(idx, 'supply_gst_rate', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px', background: 'transparent', textAlign: 'right' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#EFF6FF' }}><input type="number" value={it.service_qty} onChange={e => updateItem(idx, 'service_qty', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px', background: 'transparent', textAlign: 'right' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#EFF6FF' }}><input type="number" value={it.service_rate} onChange={e => updateItem(idx, 'service_rate', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px', background: 'transparent', textAlign: 'right' }} /></td>
                      <td style={{ padding: 0, border: '1px solid #E5E7EB', background: '#EFF6FF' }}><input type="number" value={it.service_gst_rate} onChange={e => updateItem(idx, 'service_gst_rate', e.target.value)} style={{ width: '100%', border: 'none', padding: '4px', background: 'transparent', textAlign: 'right' }} /></td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F3F4F6' }}>{(it.taxable_supply || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F3F4F6' }}>{(it.gst_supply || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F3F4F6' }}>{(it.total_supply || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F3F4F6' }}>{(it.taxable_service || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F3F4F6' }}>{(it.gst_service || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#F3F4F6' }}>{(it.total_service || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#FFFBEB', fontWeight: 600 }}>{(it.total_taxable || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#FFFBEB', fontWeight: 600 }}>{(it.total_gst || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'right', background: '#FEF3C7', fontWeight: 700 }}>{(it.total_invoice || 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', border: '1px solid #E5E7EB', textAlign: 'center' }}><button onClick={() => deleteRow(idx)} style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={nextStep} style={{ marginTop: '20px', padding: '12px 24px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600 }}>Review & Submit →</button>
          </div>
        )}

        {step === 6 && (
          <div>
            <h3>6. Final Summary</h3>
            <div style={{ background: '#F9FAFB', padding: '24px', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '24px' }}>
              <div>
                <p style={{ margin: '0 0 8px' }}><strong>PO Number:</strong> {poNumber}</p>
                <p style={{ margin: '0 0 8px' }}><strong>Customer:</strong> {customers.find(c => c.id == selectedCustomer)?.name}</p>
                <p style={{ margin: '0 0 8px' }}><strong>Location:</strong> {locations.find(l => l.id == selectedLocation)?.label}</p>
                <p style={{ margin: 0 }}><strong>Dates:</strong> {poDate} (PO) | {startDate} to {endDate}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: '0 0 4px' }}><strong>Overall Subtotal:</strong> ₹{items.reduce((s, i) => s + (i.total_taxable || 0), 0).toLocaleString()}</p>
                <p style={{ margin: '0 0 4px' }}><strong>Overall GST:</strong> ₹{items.reduce((s, i) => s + (i.total_gst || 0), 0).toLocaleString()}</p>
                <p style={{ fontSize: '1.5rem', color: '#111827', margin: 0 }}><strong>Grand Total:</strong> ₹{items.reduce((s, i) => s + (i.total_invoice || 0), 0).toLocaleString()}</p>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E5E7EB', overflow: 'hidden', marginBottom: '32px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 5 }}>
                  <tr>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#4B5563', fontWeight: 700 }}>Item Description</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#4B5563', fontWeight: 700, width: '110px' }}>Supply (Tax)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#4B5563', fontWeight: 700, width: '110px' }}>Service (Tax)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#4B5563', fontWeight: 700, width: '90px' }}>GST</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#4B5563', fontWeight: 700, width: '110px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(items.reduce((acc, it) => {
                    const pkg = it.package_name || 'General';
                    if (!acc[pkg]) acc[pkg] = { items: [], total: 0 };
                    acc[pkg].items.push(it);
                    acc[pkg].total += (it.total_invoice || 0);
                    return acc;
                  }, {})).map(([pkgName, pkgData], pIdx) => (
                    <React.Fragment key={pkgName}>
                      <tr style={{ background: '#F3F4F6' }}>
                        <td colSpan="4" style={{ padding: '4px 12px', fontWeight: 700, color: '#374151', borderBottom: '1px solid #E5E7EB', textAlign: 'left' }}>
                          {pkgName}
                        </td>
                        <td style={{ padding: '4px 12px', textAlign: 'right', fontWeight: 700, color: '#2563EB', borderBottom: '1px solid #E5E7EB' }}>
                          ₹{pkgData.total.toLocaleString()}
                        </td>
                      </tr>
                      {pkgData.items.map((it, iIdx) => (
                        <tr key={iIdx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '6px 12px', paddingLeft: '24px', textAlign: 'left' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                              <span style={{ fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>{it.item_name}</span>
                              <span style={{ color: '#6B7280', fontSize: '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.description}</span>
                            </div>
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#4B5563' }}>₹{(it.taxable_supply || 0).toLocaleString()}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#4B5563' }}>₹{(it.taxable_service || 0).toLocaleString()}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#4B5563' }}>₹{(it.total_gst || 0).toLocaleString()}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>₹{(it.total_invoice || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
              <button onClick={() => setStep(5)} style={{ padding: '12px 24px', background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '6px', fontWeight: 600 }}>← Edit Items</button>
              <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: '12px 24px', background: '#10B981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '1.1rem', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>{submitting ? 'Creating NT PO...' : '✓ Confirm & Create NT PO'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
