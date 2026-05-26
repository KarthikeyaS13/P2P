import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useAuth } from '../context/AuthContext';
import {
  useReactTable,
  getCoreRowModel,
  getGroupedRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function NewPO() {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    if (dateStr instanceof Date) {
      const dd = String(dateStr.getDate()).padStart(2, '0');
      const mm = String(dateStr.getMonth() + 1).padStart(2, '0');
      const yyyy = dateStr.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    }
    const cleanStr = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : String(dateStr);

    if (cleanStr.includes('-')) {
      const parts = cleanStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          const dd = parts[2].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const yyyy = parts[0];
          return `${dd}-${mm}-${yyyy}`;
        }
        if (parts[2].length === 4) {
          const dd = parts[0].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const yyyy = parts[2];
          return `${dd}-${mm}-${yyyy}`;
        }
      }
    }

    if (cleanStr.includes('/')) {
      const parts = cleanStr.split('/');
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          const dd = parts[0].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const yyyy = parts[2];
          return `${dd}-${mm}-${yyyy}`;
        }
        if (parts[0].length === 4) {
          const dd = parts[2].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const yyyy = parts[0];
          return `${dd}-${mm}-${yyyy}`;
        }
      }
    }

    try {
      const d = new Date(cleanStr);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
      }
    } catch (e) { }

    return cleanStr;
  };

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
    contactPhone: '',
    projectSpocName: '',
    projectSpocEmail: '',
    projectSpocPhone: '',
    needSalesInvoiceApproval: 'yes'
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
  const [projectUsers, setProjectUsers] = useState([]);
  const [manualEntryMode, setManualEntryMode] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteRows, setPasteRows] = useState(Array(10).fill({}).map(() => ({
    ref_no: '', package_name: '', heading: '', sub_heading: '', item_name: '', description: '', uom: '',
    supply_qty: '', supply_rate: '', supply_gst_rate: '', service_qty: '', service_rate: '', service_gst_rate: ''
  })));
  const [poError, setPoError] = useState('');

  // Modal for Viewing File
  const [viewFileUrl, setViewFileUrl] = useState('');

  const isCustomerPhoneInvalid = basicDetails.locationId ? (!basicDetails.contactPhone || !/^[0-9]{10}$/.test(basicDetails.contactPhone.trim())) : false;
  const isProjectPhoneInvalid = basicDetails.projectSpocName ? (!basicDetails.projectSpocPhone || !/^[0-9]{10}$/.test(basicDetails.projectSpocPhone.trim())) : false;

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('/api/customers', { headers });
        setCustomers(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to fetch customers', err);
      }
    };
    const fetchProjectUsers = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('/api/project-users', { headers });
        setProjectUsers(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to fetch project users', err);
      }
    };
    fetchCustomers();
    fetchProjectUsers();
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
          const res = await axios.get(`/api/locations?customer_id=${basicDetails.customerId}`, { headers });
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
    } else if (name === 'projectSpocName') {
      const user = projectUsers.find(u => u.full_name === value);
      setBasicDetails(prev => ({
        ...prev,
        projectSpocName: value,
        projectSpocEmail: user ? (user.email || '') : '',
        projectSpocPhone: user ? (user.phone || '') : ''
      }));
    } else {
      setBasicDetails(prev => ({ ...prev, [name]: value }));
      if (name === 'poNumber') setPoError('');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (basicDetails.poNumber) {
        checkPoUnique();
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [basicDetails.poNumber]);

  const checkPoUnique = async () => {
    if (!basicDetails.poNumber) return;
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`/api/pos/check-unique?po_number=${encodeURIComponent(basicDetails.poNumber)}`, { headers });
      if (!res.data.unique) {
        setPoError('This PO number already exists in the system.');
      } else {
        setPoError('');
      }
    } catch (err) {
      console.error('Uniqueness check failed', err);
    }
  };

  const handleDateChange = (name, date) => {
    setBasicDetails(prev => ({
      ...prev,
      [name]: date ? date.toISOString().split('T')[0] : ''
    }));
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
      const res = await axios.post('/api/upload-multi', formData, { headers });
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
      'Taxable Value of Supply', 'GST on Supply', 'Invoice Value of Supply',
      'Taxable Value of SERVICE', 'GST on SERVICE', 'Invoice Value of SERVICE',
      'TOTAL Taxable Value', 'TOTAL GST', 'TOTAL Invoice Value'
    ];

    const tableHeaderRow = worksheet.getRow(1);
    tableHeaderRow.values = headers;
    tableHeaderRow.eachCell((cell, colNum) => {
      const isAutoCal = colNum >= 15;
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
      else column.width = 18;
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

      // O: Taxable Supply (I*J)
      row.getCell(15).value = { formula: `I${i}*J${i}` };
      // P: GST Supply (O*K/100)
      row.getCell(16).value = { formula: `O${i}*(K${i}/100)` };
      // Q: Invoice Supply (O+P)
      row.getCell(17).value = { formula: `O${i}+P${i}` };

      // R: Taxable Service (L*M)
      row.getCell(18).value = { formula: `L${i}*M${i}` };
      // S: GST Service (R*N/100)
      row.getCell(19).value = { formula: `R${i}*(N${i}/100)` };
      // T: Invoice Service (R+S)
      row.getCell(20).value = { formula: `R${i}+S${i}` };

      // U: Total Taxable (O+R)
      row.getCell(21).value = { formula: `O${i}+R${i}` };
      // V: Total GST (P+S)
      row.getCell(22).value = { formula: `P${i}+S${i}` };
      // W: Total Invoice (U+V)
      row.getCell(23).value = { formula: `U${i}+V${i}` };

      for (let colNum = 1; colNum <= 23; colNum++) {
        const cell = row.getCell(colNum);
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
        };

        if (colNum === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
          cell.alignment = { horizontal: 'center' };
        } else if (colNum >= 15) {
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
        ref_no: r['Ref No'] || r['ref_no'] || r['REF NO'] || '',
        package_name: r.Package || r['Package Name'] || r['PACKAGE'] || r['PACKAGE NAME'] || '',
        heading: r.Heading || r.HEADING || '',
        sub_heading: r['Sub Heading (Optional)'] || r['Sub Heading'] || r['SUB HEADING'] || '',
        item_name: r['Item Name'] || r.Item || r['ITEM NAME'] || r['ITEM'] || '',
        description: r['Item Description'] || r.Description || r['ITEM DESCRIPTION'] || r['DESCRIPTION'] || '',
        uom: r.UOM || r.uom || '',
        supply_qty: r['Supply Qty'] || r['Supply QTY'] || r['SUPPLY QTY'] || '',
        supply_rate: r['Supply Rate'] || r['SUPPLY RATE'] || '',
        supply_gst_rate: r['Supply GST'] || r['SUPPLY GST'] || r['Supply GST%'] || '18',
        service_qty: r['Service Qty'] || r['Service QTY'] || r['SERVICE QTY'] || '',
        service_rate: r['Service Rate'] || r['SERVICE RATE'] || '',
        service_gst_rate: r['Service GST'] || r['SERVICE GST'] || r['Service GST%'] || '18'
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
            ref_no: r['Ref No'] || r['ref_no'] || r['REF NO'] || '',
            package_name: r.Package || r['Package Name'] || r['PACKAGE'] || r['PACKAGE NAME'] || '',
            heading: r.Heading || r.HEADING || '',
            sub_heading: r['Sub Heading (if Any)'] || r['Sub Heading'] || r['SUB HEADING'] || '',
            item_name: r['Item Name'] || r.Item || r['ITEM NAME'] || r['ITEM'] || '',
            description: r['Item Description'] || r.Description || r['ITEM DESCRIPTION'] || r['DESCRIPTION'] || '',
            uom: r.UOM || r.uom || '',
            supply_qty: cleanNum(r['Supply Qty'] || r['Supply QTY'] || r['SUPPLY QTY']),
            supply_rate: cleanNum(r['Supply Rate'] || r['SUPPLY RATE']),
            supply_gst_rate: cleanNum(r['Supply GST'] || r['SUPPLY GST'] || r['Supply GST%']) || 0,
            service_qty: cleanNum(r['Service Qty'] || r['Service QTY'] || r['SERVICE QTY']),
            service_rate: cleanNum(r['Service Rate'] || r['SERVICE RATE']),
            service_gst_rate: cleanNum(r['Service GST'] || r['SERVICE GST'] || r['Service GST%']) || 0
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
              obj['col13'] = row[13];
              obj['col14'] = row[14];
              obj['col15'] = row[15];
              obj['col16'] = row[16];
              obj['col17'] = row[17];
              obj['col18'] = row[18];
              obj['col19'] = row[19];
              obj['col20'] = row[20];
              obj['col21'] = row[21];
              obj['col22'] = row[22];
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
    let s_qty = parseFloat(row.supply_qty) || 0;
    let s_rate = parseFloat(row.supply_rate) || 0;
    let s_gst_pct = parseFloat(row.supply_gst_rate) || 0;
    let sv_qty = parseFloat(row.service_qty) || 0;
    let sv_rate = parseFloat(row.service_rate) || 0;
    let sv_gst_pct = parseFloat(row.service_gst_rate) || 0;

    // GST validation logic: If either Qty or Rate is 0, GST is NA (0)
    if (s_qty === 0 || s_rate === 0) {
      s_gst_pct = 0;
    }
    if (sv_qty === 0 || sv_rate === 0) {
      sv_gst_pct = 0;
    }

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
      supply_qty: s_qty,
      supply_rate: s_rate,
      supply_gst_rate: s_gst_pct,
      service_qty: sv_qty,
      service_rate: sv_rate,
      service_gst_rate: sv_gst_pct,
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

  const deleteRow = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
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
        return Swal.fire({ icon: 'warning', title: 'Incomplete Details', text: 'Please fill all basic details including SPOC contact' });
      }

      if (!basicDetails.projectSpocName.trim() || !basicDetails.projectSpocEmail.trim() || !basicDetails.projectSpocPhone.trim()) {
        return Swal.fire({ icon: 'warning', title: 'Incomplete Details', text: 'Please fill all Project SPOC details.' });
      }

      if (!basicDetails.needSalesInvoiceApproval) {
        return Swal.fire({ icon: 'warning', title: 'Incomplete Details', text: 'Please select whether Sales approval is needed for the invoice.' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(basicDetails.projectSpocEmail.trim())) {
        return Swal.fire({ icon: 'warning', title: 'Invalid Email', text: 'Please enter a valid Project SPOC email address.' });
      }

      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(basicDetails.contactPhone.trim())) {
        return Swal.fire({ icon: 'warning', title: 'Invalid Customer Phone', text: 'Customer SPOC phone must be exactly 10 digits. Please update it in Customer/Location Master.' });
      }

      if (!phoneRegex.test(basicDetails.projectSpocPhone.trim())) {
        return Swal.fire({ icon: 'warning', title: 'Invalid Project SPOC Phone', text: 'Project SPOC Contact Number must be exactly 10 digits. Please update it in Project User Master.' });
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
              ref_no: r['Ref No'] || r['ref_no'] || r['REF NO'] || '',
              package_name: r.Package || r['Package Name (*)'] || r['PACKAGE (*)'] || r['PACKAGE NAME (*)'] || '',
              heading: r.Heading || r.HEADING['(*)'] || '',
              sub_heading: r['Sub Heading (Optional)'] || r['Sub Heading'] || r['SUB HEADING'] || '',
              item_name: r['Item Name (*)'] || r.Item || r['ITEM NAME'] || r['ITEM'] || '',
              description: r['Item Description (Optional)'] || r.Description || r['ITEM DESCRIPTION'] || r['DESCRIPTION'] || '',
              uom: r.UOM || r.uom['(*)'] || '',
              supply_qty: cleanNum(r['Supply Qty (*)'] || r['Supply QTY'] || r['SUPPLY QTY']),
              supply_rate: cleanNum(r['Supply Rate (*)'] || r['SUPPLY RATE']),
              supply_gst_rate: cleanNum(r['Supply GST (*)'] || r['SUPPLY GST'] || r['Supply GST%']) || 0,
              service_qty: cleanNum(r['Service Qty (*)'] || r['Service QTY'] || r['SERVICE QTY']),
              service_rate: cleanNum(r['Service Rate (*)'] || r['SERVICE RATE']),
              service_gst_rate: cleanNum(r['Service GST (*)'] || r['SERVICE GST'] || r['Service GST%']) || 0
            });
          });

          if (mapped.length > 0) {
            setItems(mapped);
            Swal.fire({ icon: 'success', title: 'Parsed', text: 'Excel uploaded successfully. Click Next to review.', timer: 2000, showConfirmButton: false });
          } else {
            Swal.fire({ icon: 'error', title: 'Empty Excel', text: 'No valid items found in the Excel file. Please check the columns.' });
          }
        } catch (err) {
          console.error(err);
          Swal.fire({ icon: 'error', title: 'Parsing Error', text: 'Error parsing Excel file.' });
        }
      }
      setLoading(false);

      // FIX: Use local check because setItems is async
      const hasItems = items.length > 0 || (attachments.po_annex && !loading);

      if (hasItems || manualEntryMode) {
        setStep(2);
      } else {
        Swal.fire({ icon: 'info', title: 'Items Required', text: 'Please upload a PO Annex or use Manual Entry.' });
      }
    } else if (step === 2) {
      if (items.length === 0) return Swal.fire({ icon: 'warning', title: 'No Items', text: 'Please add at least one item.' });

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const heading = it.item_name || it.package_name || it.ref_no || `Row ${i + 1}`;
        const s_qty = parseFloat(it.supply_qty) || 0;
        const s_rate = parseFloat(it.supply_rate) || 0;
        const sv_qty = parseFloat(it.service_qty) || 0;
        const sv_rate = parseFloat(it.service_rate) || 0;

        const supplyActive = s_qty > 0 || s_rate > 0;
        const serviceActive = sv_qty > 0 || sv_rate > 0;

        if (!supplyActive && !serviceActive) {
          return Swal.fire({ icon: 'error', title: 'Incomplete Row', text: `Row for "${heading}" must have either supply or service details.` });
        }

        if (supplyActive) {
          if (s_qty === 0 || s_rate === 0) {
            return Swal.fire({ icon: 'error', title: 'Supply Incomplete', text: `Both Qty and Rate must be non-zero for Supply in "${heading}".` });
          }
          if (it.supply_gst_rate === '' || it.supply_gst_rate === null || it.supply_gst_rate === undefined) {
            return Swal.fire({ icon: 'error', title: 'GST Mandatory', text: `Please select Supply GST for "${heading}".` });
          }
        }

        if (serviceActive) {
          if (sv_qty > 0) {
            if (it.service_gst_rate === '' || it.service_gst_rate === null || it.service_gst_rate === undefined) {
              return Swal.fire({ icon: 'error', title: 'GST Mandatory', text: `Please select Service GST for "${heading}".` });
            }
          }
        }
      }
      setStep(3);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      if (!basicDetails.customerId || !basicDetails.locationId || !basicDetails.poNumber) {
        return Swal.fire({ icon: 'warning', title: 'Missing Details', text: 'Please fill in all basic details (Customer, Location, Sales Order Number)' });
      }

      if (isCustomerPhoneInvalid) {
        return Swal.fire({ icon: 'warning', title: 'Invalid Customer Phone', text: 'Customer SPOC phone must be exactly 10 digits.' });
      }

      if (isProjectPhoneInvalid) {
        return Swal.fire({ icon: 'warning', title: 'Invalid Project SPOC Phone', text: 'Project SPOC Contact Number must be exactly 10 digits.' });
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
        items,
        project_spoc_name: basicDetails.projectSpocName.trim(),
        project_spoc_email: basicDetails.projectSpocEmail.trim(),
        project_spoc_phone: basicDetails.projectSpocPhone.trim(),
        need_sales_invoice_approval: basicDetails.needSalesInvoiceApproval
      };

      await axios.post('/api/pos', payload, { headers });
      sessionStorage.removeItem('new_po_draft');
      Swal.fire({ icon: 'success', title: 'Created', text: 'Sales Order created successfully!', timer: 2000, showConfirmButton: false });
      navigate('/dashboard');
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.error || 'Failed to create PO' });
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
    <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        
        .compact-form-input {
          width: 100%;
          height: 36px !important;
          padding: 0 12px 0 32px !important;
          border-radius: 6px !important;
          border: 1px solid #CBD5E1 !important;
          font-size: 13px !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0.2s ease !important;
          background: #F8FAFC !important;
        }
        .compact-form-select, .compact-form-input-text {
          width: 100%;
          height: 36px !important;
          padding: 0 10px !important;
          border-radius: 6px !important;
          border: 1px solid #CBD5E1 !important;
          font-size: 13px !important;
          box-sizing: border-box !important;
          outline: none !important;
          transition: all 0.2s ease !important;
          background: #F8FAFC !important;
        }
        .compact-form-input:focus, .compact-form-select:focus, .compact-form-input-text:focus {
          border-color: #3B82F6 !important;
          background: white !important;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1) !important;
        }
        .compact-form-input:hover, .compact-form-select:hover, .compact-form-input-text:hover {
          border-color: #94A3B8 !important;
        }
        .react-datepicker-wrapper {
          width: 100% !important;
        }
      `}</style>
      {renderFileViewer()}

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <button onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)} className="btn-back" style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
          Back
        </button>
        <h2 style={{ margin: 0 }}>Sales Order</h2>
      </div>

      <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>

        {/* STEP 1: Basic & Attachments */}
        {step === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <h3 style={{ fontSize: '14px', borderBottom: '1px solid #E5E7EB', paddingBottom: '6px', marginBottom: '12px', fontWeight: 700, color: '#334155' }}>1. Basic Details</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Customer</label>
                  <select name="customerId" value={basicDetails.customerId} onChange={handleCustomerChange} className="compact-form-select">
                    <option value="">Select Customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Location</label>
                  <select name="locationId" value={basicDetails.locationId} onChange={handleBasicChange} className="compact-form-select">
                    <option value="">Select Location</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Sales Order Number(User Input - Enter the PO/WO Number by the Customer)</label>
                  <input
                    name="poNumber"
                    value={basicDetails.poNumber}
                    onChange={handleBasicChange}
                    className="compact-form-input-text"
                    style={{ borderColor: poError ? '#EF4444' : '#CBD5E1' }}
                  />
                  {poError && <p style={{ color: '#EF4444', fontSize: '0.7rem', marginTop: '4px', fontWeight: 600 }}>{poError}</p>}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginTop: '6px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Customer SPOC</span>
                  <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 400, textTransform: 'none' }}>(Primary SPOC from Location — Edit under Customer/Location Master)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Name <span style={{ color: 'red' }}>*</span></label>
                    <input name="contactName" value={basicDetails.contactName} onChange={handleBasicChange} placeholder="Primary Contact Name" className="compact-form-input-text" readOnly style={{ background: '#E2E8F0', color: '#64748B', cursor: 'not-allowed' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: isCustomerPhoneInvalid ? '#EF4444' : '#475569', marginBottom: '4px' }}>Phone <span style={{ color: 'red' }}>*</span></label>
                    <input 
                      name="contactPhone" 
                      value={basicDetails.contactPhone} 
                      onChange={handleBasicChange} 
                      placeholder="Primary Phone" 
                      className="compact-form-input-text" 
                      readOnly 
                      style={{ 
                        background: isCustomerPhoneInvalid ? '#FEF2F2' : '#E2E8F0', 
                        color: isCustomerPhoneInvalid ? '#DC2626' : '#64748B', 
                        border: isCustomerPhoneInvalid ? '1px solid #EF4444' : '1px solid #CBD5E1', 
                        cursor: 'not-allowed' 
                      }} 
                    />
                    {isCustomerPhoneInvalid && (
                      <p style={{ color: '#EF4444', fontSize: '11px', marginTop: '4px', fontWeight: 500 }}>
                        Must be exactly 10 digits. Update under Customer/Location Master.
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginTop: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Project SPOC</span>
                  <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 400, textTransform: 'none' }}>(From Master or Customer Address — Edit under Master or Customer Address)</span>
                </div>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Project SPOC Name <span style={{ color: 'red' }}>*</span></label>
                    <select
                      name="projectSpocName"
                      value={basicDetails.projectSpocName || ''}
                      onChange={handleBasicChange}
                      className="compact-form-input-text"
                      style={{ width: '100%', height: '30px', padding: '0 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px', background: 'white' }}
                    >
                      <option value="">Select Project SPOC</option>
                      {projectUsers.map(user => (
                        <option key={user.id} value={user.full_name}>{user.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Project SPOC Email ID <span style={{ color: 'red' }}>*</span></label>
                      <input name="projectSpocEmail" type="email" value={basicDetails.projectSpocEmail} onChange={handleBasicChange} placeholder="Project SPOC Email ID" className="compact-form-input-text" readOnly style={{ background: '#E2E8F0', color: '#64748B', cursor: 'not-allowed' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: isProjectPhoneInvalid ? '#EF4444' : '#475569', marginBottom: '4px' }}>Project SPOC Contact Number <span style={{ color: 'red' }}>*</span></label>
                      <input 
                        name="projectSpocPhone" 
                        value={basicDetails.projectSpocPhone} 
                        onChange={handleBasicChange} 
                        placeholder="Project SPOC Contact Number" 
                        className="compact-form-input-text" 
                        readOnly 
                        style={{ 
                          background: isProjectPhoneInvalid ? '#FEF2F2' : '#E2E8F0', 
                          color: isProjectPhoneInvalid ? '#DC2626' : '#64748B', 
                          border: isProjectPhoneInvalid ? '1px solid #EF4444' : '1px solid #CBD5E1', 
                          cursor: 'not-allowed' 
                      }} 
                      />
                      {isProjectPhoneInvalid && (
                        <p style={{ color: '#EF4444', fontSize: '11px', marginTop: '4px', fontWeight: 500 }}>
                          Must be exactly 10 digits. Update under Project User Master.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginTop: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Attach Invoice with DC? (Select "No" if Sales has to request for Invoice) <span style={{ color: 'red' }}>*</span></span>
                </div>
                <div style={{ display: 'flex', gap: '24px', marginTop: '6px', marginBottom: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="needSalesInvoiceApproval"
                      value="yes"
                      checked={basicDetails.needSalesInvoiceApproval === 'yes'}
                      onChange={(e) => setBasicDetails(prev => ({ ...prev, needSalesInvoiceApproval: e.target.value }))}
                      style={{ cursor: 'pointer' }}
                    />
                    Yes
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="needSalesInvoiceApproval"
                      value="no"
                      checked={basicDetails.needSalesInvoiceApproval === 'no'}
                      onChange={(e) => setBasicDetails(prev => ({ ...prev, needSalesInvoiceApproval: e.target.value }))}
                      style={{ cursor: 'pointer' }}
                    />
                    No
                  </label>
                </div>

                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Sales Order Date</label>
                    <div className="date-picker-container" style={{ position: 'relative' }}>
                      <DatePicker
                        selected={basicDetails.poDate ? new Date(basicDetails.poDate) : null}
                        onChange={(date) => handleDateChange('poDate', date)}
                        dateFormat="dd/MM/yyyy"
                        className="form-input compact-form-input"
                        placeholderText="DD/MM/YYYY"
                      />
                      <span className="material-symbols-outlined calendar-icon" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: '#64748B', pointerEvents: 'none' }}>calendar_today</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Start Date</label>
                      <div className="date-picker-container" style={{ position: 'relative' }}>
                        <DatePicker
                          selected={basicDetails.startDate ? new Date(basicDetails.startDate) : null}
                          onChange={(date) => handleDateChange('startDate', date)}
                          dateFormat="dd/MM/yyyy"
                          className="form-input compact-form-input"
                          placeholderText="DD/MM/YYYY"
                        />
                        <span className="material-symbols-outlined calendar-icon" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: '#64748B', pointerEvents: 'none' }}>calendar_today</span>
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Est. End Date</label>
                      <div className="date-picker-container" style={{ position: 'relative' }}>
                        <DatePicker
                          selected={basicDetails.endDate ? new Date(basicDetails.endDate) : null}
                          onChange={(date) => handleDateChange('endDate', date)}
                          dateFormat="dd/MM/yyyy"
                          className="form-input compact-form-input"
                          placeholderText="DD/MM/YYYY"
                        />
                        <span className="material-symbols-outlined calendar-icon" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: '#64748B', pointerEvents: 'none' }}>calendar_today</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '14px', borderBottom: '1px solid #E5E7EB', paddingBottom: '6px', marginBottom: '12px', fontWeight: 700, color: '#334155' }}>2. Attachments</h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                {['po_copy', 'po_annex', 'other'].map(type => (
                  <div key={type} style={{ border: '1px solid #E5E7EB', padding: '8px 12px', borderRadius: '6px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', textTransform: 'capitalize' }}>
                      {type === 'po_copy' ? 'PO Copy' : type === 'po_annex' ? 'PO Annex' : 'Other'}
                    </label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.xlsm,.csv" onChange={(e) => handleFileChange(type, e.target.files[0])} style={{ flex: 1, fontSize: '12px' }} />
                      {attachments[type] && (
                        <button onClick={() => setShowViewer(type)} style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
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

              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={async () => {
                    await handleDownloadTemplate();
                    handleManualEntry();
                  }}
                  className="btn-primary"
                  style={{ height: '36px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', width: 'auto', borderRadius: '6px' }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '18px' }}
                  >
                    download
                  </span>

                  Download Template
                </button>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #E5E7EB', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={nextStep}
                disabled={
                  loading || 
                  !basicDetails.customerId || 
                  !basicDetails.locationId || 
                  !basicDetails.poNumber || 
                  !basicDetails.contactName || 
                  !basicDetails.contactPhone ||
                  isCustomerPhoneInvalid ||
                  isProjectPhoneInvalid
                }
                style={{
                  height: '36px',
                  padding: '0 24px',
                  background: (
                    loading || 
                    !basicDetails.customerId || 
                    !basicDetails.locationId || 
                    !basicDetails.poNumber || 
                    !basicDetails.contactName || 
                    !basicDetails.contactPhone ||
                    isCustomerPhoneInvalid ||
                    isProjectPhoneInvalid
                  ) ? '#9CA3AF' : '#3B82F6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: (
                    loading || 
                    !basicDetails.customerId || 
                    !basicDetails.locationId || 
                    !basicDetails.poNumber ||
                    isCustomerPhoneInvalid ||
                    isProjectPhoneInvalid
                  ) ? 'not-allowed' : 'pointer'
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#334155' }}>2. Items Review & Calculation</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => !loading && fileInputRef.current.click()}
                  disabled={loading}
                  style={{ height: '32px', padding: '0 12px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.8 : 1, fontSize: '12px' }}
                >
                  {loading ? (
                    <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  ) : (
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
                  )}
                  {loading ? 'Processing...' : 'Excel Upload'}
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".xlsx,.xls"
                  onChange={handleDirectExcelUpload}
                />
                <button onClick={addRow} style={{ height: '32px', padding: '0 12px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600, fontSize: '12px' }}>+ Add Row</button>
              </div>
            </div>

            {loading && (
              <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div className="spinner" style={{ margin: '0 auto 12px', width: '28px', height: '28px', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <h3 style={{ margin: 0, color: '#1e293b', fontSize: '14px' }}>Parsing Excel File...</h3>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '12px' }}>Please wait while we process the rows.</p>
              </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px', maxHeight: '400px', background: 'white', display: loading ? 'none' : 'block' }}>
              <table className="no-hover" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 40, background: '#F9FAFB' }}>
                  <tr style={{ whiteSpace: 'nowrap', height: '36px' }}>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', width: '35px', fontSize: '11px', fontWeight: 800, position: 'sticky', left: 0, zIndex: 50, color: '#111827', borderRight: '2px solid #D1D5DB', height: '36px' }}>Sl</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', width: '70px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Ref No</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '150px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Package</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '180px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Heading</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '200px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Sub Heading</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '250px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Item Name</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '300px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Item Description <span style={{ fontSize: '8px', color: '#4B5563' }}>(click to view description)</span></th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', width: '50px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>UOM</th>

                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', width: '70px', fontSize: '11px', fontWeight: 800, color: '#065f46', height: '36px' }}>Supply Qty</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', width: '85px', fontSize: '11px', fontWeight: 800, color: '#065f46', height: '36px' }}>Supply Rate</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', width: '60px', fontSize: '11px', fontWeight: 800, color: '#065f46', height: '36px' }}>Supply GST</th>

                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#EFF6FF', width: '70px', fontSize: '11px', fontWeight: 800, color: '#1e40af', height: '36px' }}>Service Qty</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#EFF6FF', width: '85px', fontSize: '11px', fontWeight: 800, color: '#1e40af', height: '36px' }}>Service Rate</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#EFF6FF', width: '60px', fontSize: '11px', fontWeight: 800, color: '#1e40af', height: '36px' }}>Service GST</th>

                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '100px', fontSize: '11px', fontWeight: 700, height: '36px' }}>Taxable Supply</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '100px', fontSize: '11px', fontWeight: 700, height: '36px' }}>GST Supply</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '100px', fontSize: '11px', fontWeight: 700, height: '36px' }}>Total Supply</th>

                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '100px', fontSize: '11px', fontWeight: 700, height: '36px' }}>Taxable Service</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '100px', fontSize: '11px', fontWeight: 700, height: '36px' }}>GST Service</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F3F4F6', minWidth: '100px', fontSize: '11px', fontWeight: 700, height: '36px' }}>Total Service</th>

                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '110px', fontSize: '11px', fontWeight: 800, color: '#92400e', textAlign: 'right', height: '36px' }}>Total Taxable</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '110px', fontSize: '11px', fontWeight: 800, color: '#92400e', textAlign: 'right', height: '36px' }}>Total GST</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '120px', fontSize: '11px', fontWeight: 800, color: '#92400e', textAlign: 'right', height: '36px' }}>Grand Total</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F87171', width: '50px', fontSize: '11px', fontWeight: 800, color: '#FFFFFF', textAlign: 'center', height: '36px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ height: '32px' }}>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'center', color: '#1e293b', fontWeight: 800, background: '#f1f5f9', fontSize: '0.7rem', position: 'sticky', left: 0, zIndex: 10, borderRight: '2px solid #D1D5DB', height: '32px' }}>{idx + 1}</td>
                      <td style={{ padding: '0', border: '1px solid #E5E7EB', height: '32px' }}>
                        <input value={it.ref_no} onChange={(e) => updateItem(idx, 'ref_no', e.target.value)} style={{ width: '100%', border: 'none', padding: '0 8px', fontSize: '0.7rem', height: '32px', background: 'transparent' }} />
                      </td>
                      <td style={{ padding: '0', border: '1px solid #E5E7EB', height: '32px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', height: '32px' }}>
                          <input value={it.package_name} onChange={(e) => updateItem(idx, 'package_name', e.target.value)} style={{ width: '100%', border: 'none', padding: '0 8px', fontSize: '0.7rem', height: '32px', background: 'transparent' }} />
                          {it.package_name && it.package_name.length > 20 && (
                            <span className="material-symbols-outlined" style={{ fontSize: '13px', cursor: 'pointer', color: '#3b82f6', opacity: 0.6, marginRight: '4px' }} onClick={() => Swal.fire({ title: 'Package', text: it.package_name })}>open_in_new</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0', border: '1px solid #E5E7EB' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input value={it.heading} onChange={(e) => updateItem(idx, 'heading', e.target.value)} style={{ width: '100%', border: 'none', padding: '0 8px', height: '32px', fontSize: '0.7rem', background: 'transparent' }} />
                          {it.heading && it.heading.length > 25 && (
                            <span className="material-symbols-outlined" style={{ fontSize: '13px', cursor: 'pointer', color: '#3b82f6', opacity: 0.6, marginRight: '4px' }} onClick={() => Swal.fire({ title: 'Heading', text: it.heading })}>open_in_new</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0', border: '1px solid #E5E7EB' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input value={it.sub_heading} onChange={(e) => updateItem(idx, 'sub_heading', e.target.value)} style={{ width: '100%', border: 'none', padding: '0 8px', height: '32px', fontSize: '0.7rem', background: 'transparent' }} />
                          {it.sub_heading && it.sub_heading.length > 30 && (
                            <span className="material-symbols-outlined" style={{ fontSize: '13px', cursor: 'pointer', color: '#3b82f6', opacity: 0.6, marginRight: '4px' }} onClick={() => Swal.fire({ title: 'Sub Heading', text: it.sub_heading })}>open_in_new</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0', border: '1px solid #E5E7EB' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input value={it.item_name} onChange={(e) => updateItem(idx, 'item_name', e.target.value)} style={{ width: '100%', border: 'none', padding: '0 8px', height: '32px', fontSize: '0.7rem', fontWeight: 600, background: 'transparent' }} />
                          {it.item_name && it.item_name.length > 35 && (
                            <span className="material-symbols-outlined" style={{ fontSize: '13px', cursor: 'pointer', color: '#3b82f6', opacity: 0.6, marginRight: '4px' }} onClick={() => Swal.fire({ title: 'Item Name', text: it.item_name })}>open_in_new</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0', border: '1px solid #E5E7EB' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} style={{ width: '100%', border: 'none', padding: '0 8px', height: '32px', fontSize: '0.7rem', color: '#4b5563', background: 'transparent' }} />
                          {it.description && it.description.length > 40 && (
                            <span className="material-symbols-outlined" style={{ fontSize: '13px', cursor: 'pointer', color: '#3b82f6', opacity: 0.6, marginRight: '4px' }} onClick={() => Swal.fire({ title: 'Description', text: it.description })}>open_in_new</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0', border: '1px solid #E5E7EB' }}>
                        <input value={it.uom} onChange={(e) => updateItem(idx, 'uom', e.target.value)} style={{ width: '100%', border: 'none', padding: '0 8px', height: '32px', fontSize: '0.7rem', textAlign: 'center', background: 'transparent' }} />
                      </td>

                      <td style={{ padding: '0', border: '1px solid #E5E7EB', background: '#ECFDF5' }}><input type="number" value={it.supply_qty} onChange={(e) => updateItem(idx, 'supply_qty', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '0 8px', height: '32px', fontSize: '0.7rem', background: 'transparent' }} /></td>
                      <td style={{ padding: '0', border: '1px solid #E5E7EB', background: '#ECFDF5' }}><input type="number" value={it.supply_rate} onChange={(e) => updateItem(idx, 'supply_rate', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '0 8px', height: '32px', fontSize: '0.7rem', background: 'transparent' }} /></td>
                      <td style={{ padding: '0', border: '1px solid #E5E7EB', background: '#ECFDF5' }}>
                        <select
                          value={it.supply_gst_rate || ''}
                          onChange={(e) => updateItem(idx, 'supply_gst_rate', e.target.value)}
                          disabled={(parseFloat(it.supply_qty) || 0) === 0 || (parseFloat(it.supply_rate) || 0) === 0}
                          style={{ width: '100%', border: 'none', padding: '0 8px', fontSize: '0.7rem', background: ((parseFloat(it.supply_qty) || 0) === 0 || (parseFloat(it.supply_rate) || 0) === 0) ? '#f3f4f6' : 'transparent', outline: 'none', height: '32px' }}
                        >
                          <option value="">GST</option>
                          <option value="0">0%</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18%</option>
                        </select>
                      </td>

                      <td style={{ padding: '0', border: '1px solid #E5E7EB', background: '#EFF6FF' }}><input type="number" value={it.service_qty} onChange={(e) => updateItem(idx, 'service_qty', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '0 8px', height: '32px', fontSize: '0.7rem', background: 'transparent' }} /></td>
                      <td style={{ padding: '0', border: '1px solid #E5E7EB', background: '#EFF6FF' }}><input type="number" value={it.service_rate} onChange={(e) => updateItem(idx, 'service_rate', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '0 8px', height: '32px', fontSize: '0.7rem', background: 'transparent' }} /></td>
                      <td style={{ padding: '0', border: '1px solid #E5E7EB', background: '#EFF6FF' }}>
                        <select
                          value={it.service_gst_rate || ''}
                          onChange={(e) => updateItem(idx, 'service_gst_rate', e.target.value)}
                          disabled={(parseFloat(it.service_qty) || 0) === 0 || (parseFloat(it.service_rate) || 0) === 0}
                          style={{ width: '100%', border: 'none', padding: '0 8px', fontSize: '0.7rem', background: ((parseFloat(it.service_qty) || 0) === 0 || (parseFloat(it.service_rate) || 0) === 0) ? '#f3f4f6' : 'transparent', outline: 'none', height: '32px' }}
                        >
                          <option value="">GST</option>
                          <option value="0">0%</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18%</option>
                        </select>
                      </td>

                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#64748b', fontSize: '0.7rem', height: '32px' }}>₹{(it.taxable_supply || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#64748b', fontSize: '0.7rem', height: '32px' }}>₹{(it.gst_supply || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#64748b', fontSize: '0.7rem', height: '32px' }}>₹{(it.total_supply || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>

                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#64748b', fontSize: '0.7rem', height: '32px' }}>₹{(it.taxable_service || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#64748b', fontSize: '0.7rem', height: '32px' }}>₹{(it.gst_service || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', color: '#64748b', fontSize: '0.7rem', height: '32px' }}>₹{(it.total_service || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>

                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB', fontSize: '0.75rem', height: '32px' }}>₹{(it.total_taxable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB', fontSize: '0.75rem', height: '32px' }}>₹{(it.total_gst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, background: '#FEF3C7', fontSize: '0.9rem', height: '32px' }}>₹{(it.total_invoice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'center', height: '32px' }}><button onClick={() => deleteRow(idx)} style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 20, background: '#0f172a', color: '#ffffff', fontWeight: 700 }}>
                  <tr>
                    <td colSpan="20" style={{ padding: '4px 8px', textAlign: 'right', fontSize: '0.85rem', borderTop: '2px solid #334155', color: '#ffffff' }}>GRAND TOTALS:</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', fontSize: '0.85rem', borderTop: '2px solid #334155', color: '#ffffff', whiteSpace: 'nowrap' }}>₹{getSummaryTotals().taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.75rem', color: '#cbd5e1', marginLeft: '4px' }}>(Taxable)</span></td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', fontSize: '0.85rem', borderTop: '2px solid #334155', color: '#ffffff', whiteSpace: 'nowrap' }}>₹{getSummaryTotals().gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.75rem', color: '#cbd5e1', marginLeft: '4px' }}>(GST)</span></td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', background: '#059669', fontSize: '0.9rem', color: '#ffffff', borderTop: '2px solid #065f46', whiteSpace: 'nowrap' }}>₹{getSummaryTotals().grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.75rem', color: '#d1fae5', marginLeft: '4px' }}>(Total)</span></td>
                    <td style={{ borderTop: '2px solid #334155' }}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="form-footer-actions" style={{ marginTop: '16px' }}>
              <button
                onClick={() => setStep(1)}
                className="btn-secondary"
                style={{ height: '36px', padding: '0 20px', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                ← Back
              </button>
              <button
                onClick={nextStep}
                className="btn-primary"
                style={{ height: '36px', padding: '0 20px', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                Review
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Final Summary */}
        {step === 3 && (
          <div>
            <h3 style={{ fontSize: '1.15rem', marginBottom: '12px', color: '#1E293B', fontWeight: 700 }}>3. Final Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: '6px', border: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Sales Order Number</span>
                  <span style={{ fontSize: '13px', color: '#1E293B', fontWeight: 600 }}>{basicDetails.poNumber}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Date</span>
                  <span style={{ fontSize: '13px', color: '#1E293B', fontWeight: 600 }}>{formatDate(basicDetails.poDate)}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Customer</span>
                  <span style={{ fontSize: '13px', color: '#1E293B', fontWeight: 600 }}>{customers.find(c => c.id == basicDetails.customerId)?.name}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Location</span>
                  <span style={{ fontSize: '13px', color: '#1E293B', fontWeight: 600 }}>{locations.find(l => l.id == basicDetails.locationId)?.label}</span>
                </div>
              </div>
              <div style={{ background: '#ECFDF5', padding: '12px 16px', borderRadius: '6px', border: '1px solid #A7F3D0', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#065F46', fontWeight: 500 }}>Overall Subtotal</span>
                  <span style={{ fontSize: '13px', color: '#065F46', fontWeight: 600 }}>₹{getSummaryTotals().taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#065F46', fontWeight: 500 }}>Overall GST</span>
                  <span style={{ fontSize: '13px', color: '#065F46', fontWeight: 600 }}>₹{getSummaryTotals().gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ height: '1px', background: '#A7F3D0', margin: '4px 0' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#065F46', fontWeight: 700 }}>Grand Total</span>
                  <span style={{ fontSize: '16px', color: '#065F46', fontWeight: 800 }}>₹{getSummaryTotals().grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <SummaryTable data={items} totals={getSummaryTotals()} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <button onClick={() => setStep(2)} style={{ height: '36px', padding: '0 20px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>← Edit Items</button>
              <button onClick={handleSubmit} disabled={submitting} style={{ height: '36px', padding: '0 24px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
                {submitting ? 'Creating PO...' : '✓ Confirm & Submit PO'}
              </button>
            </div>
          </div>
        )}

        {showPasteModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', width: '98%', maxWidth: '1400px', maxHeight: '95vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#334155' }}>Interactive Excel Workspace</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <label style={{ padding: '0 10px', height: '28px', background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload_file</span>
                      Load from Excel
                      <input type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={handleModalFileUpload} style={{ display: 'none' }} />
                    </label>
                    <button onClick={handleExportGrid} style={{ padding: '0 10px', height: '28px', background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                      Save as Excel
                    </button>
                  </div>
                </div>
                <button onClick={() => setPasteRows(prev => [...prev, {
                  ref_no: '', package_name: '', heading: '', sub_heading: '', item_name: '', description: '', uom: '',
                  supply_qty: '', supply_rate: '', supply_gst_rate: '', service_qty: '', service_rate: '', service_gst_rate: ''
                }])} style={{ padding: '0 10px', height: '28px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Add Row</button>
              </div>
              <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px' }}>Edit cells directly, use <b>Ctrl+V</b> to paste from your desktop Excel, or <b>Load from Excel</b> to import a whole file. Click <b>Save as Excel</b> to export your current work.</p>

              <div onPaste={handleGridPaste} style={{ flex: 1, overflow: 'auto', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#F9FAFB' }}>
                <table style={{ width: 'max-content', borderCollapse: 'collapse', fontSize: '0.75rem', background: 'white' }}>
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                <button onClick={() => setShowPasteModal(false)} style={{ height: '32px', padding: '0 16px', background: '#F3F4F6', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>Cancel</button>
                <button onClick={handleBulkPaste} disabled={pasteRows.every(r => !r.item_name && !r.ref_no)} style={{ height: '32px', padding: '0 20px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '12px', opacity: pasteRows.every(r => !r.item_name && !r.ref_no) ? 0.5 : 1 }}>
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
      header: 'Taxable Value of Supply',
      accessorKey: 'supply_taxable',
      cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      header: 'GST Value of Supply',
      accessorKey: 'supply_gst',
      cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      header: 'Taxable Value of Service',
      accessorKey: 'service_taxable',
      cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      header: 'GST Value of Service',
      accessorKey: 'service_gst',
      cell: info => `₹${info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      header: 'Total Taxable Value',
      accessorKey: 'total_taxable',
      cell: info => <span style={{ fontWeight: 600 }}>₹{info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
    },
    {
      header: 'Total GST Value',
      accessorKey: 'total_gst',
      cell: info => <span style={{ fontWeight: 600 }}>₹{info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
    },
    {
      header: 'Grand Total Invoice Value',
      accessorKey: 'total_invoice',
      cell: info => <span style={{ fontWeight: 700, color: '#2563EB' }}>₹{info.getValue().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
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
    <div style={{ marginBottom: '24px' }}>
      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: '16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead style={{ background: '#F8FAFC' }}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} style={{ height: '36px' }}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} style={{ padding: '4px 8px', textAlign: header.id === 'package_name' ? 'left' : 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', height: '36px' }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} style={{ height: '32px' }}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '4px 8px', textAlign: cell.column.id === 'package_name' ? 'left' : 'right', border: '1px solid #E2E8F0', height: '32px' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot style={{ background: '#F8FAFC', fontWeight: 800, borderTop: '2px solid #E2E8F0' }}>
            <tr style={{ height: '32px' }}>
              <td style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #E2E8F0', height: '32px' }}>TOTAL</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.supply_taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.supply_gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.service_taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.service_gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.total_taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.total_gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', color: '#2563EB', border: '1px solid #E2E8F0', height: '32px' }}>₹{grandTotals.total_invoice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
