import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import CustomCustomerSelect from '../components/CustomCustomerSelect';
import { useAuth } from '../context/AuthContext';
import {
  useReactTable,
  getCoreRowModel,
  getGroupedRowModel,
  flexRender,
} from '@tanstack/react-table';

const getInitialDraft = () => {
  try {
    const navEntries = window.performance.getEntriesByType('navigation');
    const navType = navEntries.length > 0 ? navEntries[0].type : '';
    const isReloadOrBack = navType === 'reload' || navType === 'back_forward';

    const draftStr = sessionStorage.getItem('new_po_draft');
    if (draftStr && (isReloadOrBack || navType === '')) {
      return JSON.parse(draftStr);
    } else if (!isReloadOrBack && navType !== '') {
      sessionStorage.removeItem('new_po_draft');
    }
  } catch (e) {
    /* console.error('Failed to parse draft', e); */
  }
  return {};
};

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
  const [draft] = useState(() => getInitialDraft());

  // Flow State
  const [step, setStep] = useState(draft.step || 1); // 1: Basic, 2: Items Review, 3: Final Summary
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Basic State
  const [basicDetails, setBasicDetails] = useState(draft.basicDetails || {
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
    needSalesInvoiceApproval: 'yes',
    remarks: ''
  });

  // Attachments State
  const [attachments, setAttachments] = useState({
    po_copy: null,
    po_annex: null,
    other: null
  });
  const [attachmentPaths, setAttachmentPaths] = useState(draft.attachmentPaths || {
    po_copy: '',
    po_annex: '',
    other: ''
  });
  const [showViewer, setShowViewer] = useState(null); // 'po_copy', 'po_annex', 'other'

  // Data State
  const [items, setItems] = useState(draft.items || []);
  const [customers, setCustomers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [projectUsers, setProjectUsers] = useState([]);
  const [manualEntryMode, setManualEntryMode] = useState(draft.manualEntryMode !== undefined ? draft.manualEntryMode : false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteRows, setPasteRows] = useState(Array(10).fill({}).map(() => ({
    item_type: 'supply', package_name: '', ref_no: '', heading: '', sub_heading: '', item_name: '', description: '', uom: '',
    qty: '', rate: '', gst_rate: ''
  })));
  const [poError, setPoError] = useState('');

  // Modal for Viewing File
  const [viewFileUrl, setViewFileUrl] = useState('');

  const isCustomerPhoneInvalid = basicDetails.locationId ? (!basicDetails.contactPhone || !/^[0-9]{10}$/.test(basicDetails.contactPhone.trim())) : false;
  const isProjectPhoneInvalid = basicDetails.projectSpocName ? (!basicDetails.projectSpocPhone || !/^[0-9]{10}$/.test(basicDetails.projectSpocPhone.trim())) : false;

  const filteredProjectUsers = projectUsers.filter(
    user => user.assigned_role === "Projects" ||
      user.role === "Projects" ||
      user.role?.toLowerCase() === "projects" ||
      user.assigned_role?.toLowerCase() === "projects"
  );

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('/api/customers', { headers });
        setCustomers(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        /* console.error('Failed to fetch customers', err); */
      }
    };
    const fetchProjectUsers = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get('/api/project-users', { headers });
        setProjectUsers(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        /* console.error('Failed to fetch project users', err); */
      }
    };
    fetchCustomers();
    fetchProjectUsers();
  }, []);

  // Draft Persistence
  useEffect(() => {
    const newDraft = { step, basicDetails, attachmentPaths, items, manualEntryMode };
    sessionStorage.setItem('new_po_draft', JSON.stringify(newDraft));
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
          /* console.error('Failed to fetch locations', err); */
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
        contactPhone: loc ? (loc.contact_phone || '') : '',
        contactEmail: loc ? (loc.contact_email || '') : '',
        selectedSpocIndex: '1'
      }));
    } else if (name === 'projectSpocName') {
      const user = filteredProjectUsers.find(u => u.full_name === value);
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
      /* console.error('Uniqueness check failed', err); */
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
      /* console.error('Upload failed', err); */
      return null;
    }
  };

  const handleDownloadTemplate = async () => {
    const link = document.createElement('a');
    link.href = '/Template.xlsx';
    link.setAttribute('download', 'Template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGridPaste = (e) => {
    e.preventDefault();
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedData = clipboardData.getData('Text');
    const rows = pastedData.split('\n').filter(r => r.trim());

    const newPasteRows = rows.map(r => {
      const cols = r.split('\t').map(c => c.trim());
      const isHeader = cols.some(c => {
        const val = c.toLowerCase();
        return val.includes('type') || val.includes('ref no') || val.includes('package') || val.includes('heading') || val.includes('item name');
      });
      if (isHeader) return null;

      const isSlNo = /^\d+$/.test(cols[0]) && cols[0].length < 4;
      const offset = isSlNo ? 1 : 0;
      return {
        item_type: String(cols[0 + offset] || '').trim().toLowerCase() === 'service' ? 'service' : 'supply',
        package_name: cols[1 + offset] || '',
        ref_no: cols[2 + offset] || '',
        heading: cols[3 + offset] || '',
        sub_heading: cols[4 + offset] || '',
        item_name: cols[5 + offset] || '',
        description: cols[6 + offset] || '',
        uom: cols[7 + offset] || '',
        qty: cols[8 + offset] || '',
        rate: cols[9 + offset] || '',
        gst_rate: cols[10 + offset] || ''
      };
    }).filter(Boolean);

    if (newPasteRows.length > 0) setPasteRows(newPasteRows);
  };

  const handleBulkPaste = () => {
    const validRows = pasteRows.filter(r => r.item_name || r.package_name || r.ref_no);
    if (validRows.length === 0) return;

    const newItems = validRows.map((r, idx) => {
      const isService = String(r.item_type || '').trim().toLowerCase() === 'service';
      const parsedQty = cleanNum(r.qty);
      const parsedRate = cleanNum(r.rate);
      const parsedGst = cleanGst(r.gst_rate) || 0;

      return calculateRow({
        line_number: items.length + idx + 1,
        item_type: isService ? 'service' : 'supply',
        ref_no: r.ref_no,
        package_name: r.package_name,
        heading: r.heading,
        sub_heading: r.sub_heading,
        item_name: r.item_name || '',
        description: r.description,
        uom: r.uom,
        supply_qty: isService ? 0 : parsedQty,
        supply_rate: isService ? 0 : parsedRate,
        supply_gst_rate: isService ? 0 : parsedGst,
        service_qty: isService ? parsedQty : 0,
        service_rate: isService ? parsedRate : 0,
        service_gst_rate: isService ? parsedGst : 0
      });
    });

    setItems(prev => [...prev, ...newItems]);
    setPasteRows(Array(10).fill({}).map(() => ({
      item_type: 'supply', package_name: '', ref_no: '', heading: '', sub_heading: '', item_name: '', description: '', uom: '',
      qty: '', rate: '', gst_rate: ''
    })));
    setShowPasteModal(false);
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

            // We require at least 3 matching headers to consider it a valid header row
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

          if (headerIdx === -1 || !detectedType) {
            const err = new Error("Invalid Excel Template. Please use the latest Template.xlsx or the supported legacy format.");
            console.error("Excel import failed: Headers not matched. Validation Error: Invalid template format.");
            reject(err);
            return;
          }

          const headersRaw = rawData[headerIdx] || [];
          const dataRows = rawData.slice(headerIdx + 1);

          // Build dynamic column mapping based on headers found
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
              else if (norm.includes('gst rate') || norm.includes('gst %')) mapping.gst_rate = colIdx;
            } else {
              // Legacy Template mapping
              if (norm === 'ref no' || norm === 'ref_no') mapping.ref_no = colIdx;
              else if (norm === 'package' || norm === 'package name') mapping.package_name = colIdx;
              else if (norm === 'sub heading' || norm === 'subheading') mapping.sub_heading = colIdx;
              else if (norm === 'heading') mapping.heading = colIdx;
              else if (norm === 'item name' || norm === 'item') mapping.item_name = colIdx;
              else if (norm === 'item description' || norm === 'description') mapping.description = colIdx;
              else if (norm === 'uom') mapping.uom = colIdx;
              else if (norm === 'supply qty') mapping.supply_qty = colIdx;
              else if (norm === 'supply rate') mapping.supply_rate = colIdx;
              else if (norm === 'supply gst' || norm === 'supply gst%') mapping.supply_gst_rate = colIdx;
              else if (norm === 'service qty') mapping.service_qty = colIdx;
              else if (norm === 'service rate') mapping.service_rate = colIdx;
              else if (norm === 'service gst' || norm === 'service gst%') mapping.service_gst_rate = colIdx;
            }
          });

          // Check if mandatory headers exist in the mapping
          let mandatoryHeadersMissing = false;
          if (detectedType === 'New Template') {
            if (
              mapping.ref_no === undefined ||
              mapping.item_name === undefined ||
              mapping.quantity === undefined ||
              mapping.rate === undefined
            ) {
              mandatoryHeadersMissing = true;
            }
          } else {
            if (mapping.ref_no === undefined || mapping.item_name === undefined) {
              mandatoryHeadersMissing = true;
            }
          }

          if (mandatoryHeadersMissing) {
            const err = new Error("Invalid Excel Template. Please use the latest Template.xlsx or the supported legacy format.");
            console.error("Excel import failed: Mandatory headers missing.");
            reject(err);
            return;
          }

          // Parse and validate rows
          const parsedItems = [];
          const validationErrors = [];
          
          dataRows.forEach((row, dataIdx) => {
            const rowIndex = headerIdx + 1 + dataIdx + 1; // 1-indexed row number in the excel sheet
            
            // Check if the row contains actual data by checking if any column other than serial number has value
            let hasAnyData = false;
            headersRaw.forEach((h, colIdx) => {
              const norm = normalizeHeader(h);
              if (norm.includes('sl no') || norm.includes('slkey') || norm.includes('slno')) return;
              const val = row[colIdx];
              if (val !== undefined && val !== null && String(val).trim() !== '') {
                hasAnyData = true;
              }
            });

            if (!hasAnyData) return;

            let item = {};
            let errors = [];

            if (detectedType === 'New Template') {
              const rawRefNo = mapping.ref_no !== undefined ? row[mapping.ref_no] : undefined;
              const rawItemName = mapping.item_name !== undefined ? row[mapping.item_name] : undefined;
              const rawQty = mapping.quantity !== undefined ? row[mapping.quantity] : undefined;
              const rawRate = mapping.rate !== undefined ? row[mapping.rate] : undefined;
              const rawGstRate = mapping.gst_rate !== undefined ? row[mapping.gst_rate] : undefined;
              const rawItemType = mapping.item_type !== undefined ? row[mapping.item_type] : undefined;

              // Validation checks
              if (rawRefNo === undefined || rawRefNo === null || String(rawRefNo).trim() === '') {
                errors.push("Missing Ref No");
              }
              if (rawItemName === undefined || rawItemName === null || String(rawItemName).trim() === '') {
                errors.push("Missing Item Name");
              }

              const cleanedQty = cleanNum(rawQty);
              if (cleanedQty <= 0) {
                errors.push(`Qty must be greater than 0 (found: ${rawQty})`);
              }

              const cleanedRate = cleanNum(rawRate);
              if (cleanedRate <= 0) {
                errors.push(`Rate must be greater than 0 (found: ${rawRate})`);
              }

              const typeVal = String(rawItemType || '').trim().toLowerCase();
              if (typeVal !== 'service' && typeVal !== 'supply') {
                errors.push(`Invalid Item Type (must be Service or Supply, found: ${rawItemType})`);
              }

              let cleanGstVal = 0;
              let gstErr = false;
              if (rawGstRate === undefined || rawGstRate === null) {
                gstErr = true;
              } else {
                const gstStr = String(rawGstRate).trim().toLowerCase();
                if (gstStr === '' || gstStr === 'gst' || gstStr === 'abc' || gstStr === 'null' || gstStr === 'undefined') {
                  gstErr = true;
                } else {
                  cleanGstVal = cleanGst(rawGstRate);
                  if (isNaN(cleanGstVal) || ![0, 5, 12, 18, 28].includes(cleanGstVal)) {
                    gstErr = true;
                  }
                }
              }
              if (gstErr) {
                errors.push("Invalid GST Rate found in uploaded Excel");
              }

              if (errors.length > 0) {
                validationErrors.push(`Row ${rowIndex}: ${errors.join(', ')}`);
                return; // skip invalid row
              }

              // Mapping logic for New Template based on item_type
              const isService = typeVal === 'service';

              item = {
                item_type: typeVal,
                ref_no: String(rawRefNo).trim(),
                package_name: mapping.package_name !== undefined ? String(row[mapping.package_name] || '').trim() : '',
                heading: mapping.heading !== undefined ? String(row[mapping.heading] || '').trim() : '',
                sub_heading: mapping.sub_heading !== undefined ? String(row[mapping.sub_heading] || '').trim() : '',
                item_name: String(rawItemName).trim(),
                description: mapping.item_description !== undefined ? String(row[mapping.item_description] || '').trim() : '',
                uom: mapping.uom !== undefined ? String(row[mapping.uom] || '').trim() : '',
                supply_qty: isService ? 0 : cleanedQty,
                supply_rate: isService ? 0 : cleanedRate,
                supply_gst_rate: isService ? 0 : cleanGstVal,
                service_qty: isService ? cleanedQty : 0,
                service_rate: isService ? cleanedRate : 0,
                service_gst_rate: isService ? cleanGstVal : 0
              };

            } else {
              // Legacy Template
              const rawRefNo = row[mapping.ref_no];
              const rawItemName = row[mapping.item_name];
              const rawSupplyQty = mapping.supply_qty !== undefined ? row[mapping.supply_qty] : undefined;
              const rawSupplyRate = mapping.supply_rate !== undefined ? row[mapping.supply_rate] : undefined;
              const rawServiceQty = mapping.service_qty !== undefined ? row[mapping.service_qty] : undefined;
              const rawServiceRate = mapping.service_rate !== undefined ? row[mapping.service_rate] : undefined;

              if (rawRefNo === undefined || rawRefNo === null || String(rawRefNo).trim() === '') {
                errors.push("Missing Ref No");
              }
              if (rawItemName === undefined || rawItemName === null || String(rawItemName).trim() === '') {
                errors.push("Missing Item Name");
              }

              const sQty = cleanNum(rawSupplyQty);
              const sRate = cleanNum(rawSupplyRate);
              const svQty = cleanNum(rawServiceQty);
              const svRate = cleanNum(rawServiceRate);

              const supplyActive = sQty > 0 || sRate > 0;
              const serviceActive = svQty > 0 || svRate > 0;

              if (!supplyActive && !serviceActive) {
                errors.push("Row must have either supply or service details");
              } else {
                if (supplyActive) {
                  if (sQty <= 0) errors.push(`Supply Qty must be greater than 0`);
                  if (sRate <= 0) errors.push(`Supply Rate must be greater than 0`);
                }
                if (serviceActive) {
                  if (svQty <= 0) errors.push(`Service Qty must be greater than 0`);
                  if (svRate <= 0) errors.push(`Service Rate must be greater than 0`);
                }
              }

              if (errors.length > 0) {
                validationErrors.push(`Row ${rowIndex}: ${errors.join(', ')}`);
                return; // skip invalid row
              }

              item = {
                item_type: supplyActive ? 'supply' : 'service',
                ref_no: String(rawRefNo).trim(),
                package_name: mapping.package_name !== undefined ? String(row[mapping.package_name] || '').trim() : '',
                heading: mapping.heading !== undefined ? String(row[mapping.heading] || '').trim() : '',
                sub_heading: mapping.sub_heading !== undefined ? String(row[mapping.sub_heading] || '').trim() : '',
                item_name: String(rawItemName).trim(),
                description: mapping.description !== undefined ? String(row[mapping.description] || '').trim() : '',
                uom: mapping.uom !== undefined ? String(row[mapping.uom] || '').trim() : '',
                supply_qty: sQty,
                supply_rate: sRate,
                supply_gst_rate: mapping.supply_gst_rate !== undefined ? cleanGst(row[mapping.supply_gst_rate]) || 0 : 0,
                service_qty: svQty,
                service_rate: svRate,
                service_gst_rate: mapping.service_gst_rate !== undefined ? cleanGst(row[mapping.service_gst_rate]) || 0 : 0
              };
            }

            // Calculate values
            const calculatedItem = calculateRow(item);
            parsedItems.push(calculatedItem);
          });

          // Log import details as requested in #12
          console.log("=== EXCEL IMPORT LOGS ===");
          console.log("Detected Template Type:", detectedType);
          console.log("Headers Found:", headersRaw);
          console.log("Rows Imported:", parsedItems.length);
          if (validationErrors.length > 0) {
            console.warn("Validation Errors (skipped rows):", validationErrors);
          } else {
            console.log("Validation Errors: None");
          }
          console.log("=========================");

          // Resolve with parsed items
          resolve(parsedItems);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsBinaryString(file);
    });
  };

  const handleModalFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = await parseExcel(file);
      const mapped = parsed.map(it => {
        const isService = String(it.item_type || '').trim().toLowerCase() === 'service';
        const qtyVal = isService ? it.service_qty : it.supply_qty;
        const rateVal = isService ? it.service_rate : it.supply_rate;
        const gstVal = isService ? it.service_gst_rate : it.supply_gst_rate;
        return {
          item_type: isService ? 'service' : 'supply',
          package_name: it.package_name || '',
          ref_no: it.ref_no || '',
          heading: it.heading || '',
          sub_heading: it.sub_heading || '',
          item_name: it.item_name || '',
          description: it.description || '',
          uom: it.uom || '',
          qty: qtyVal !== 0 ? String(qtyVal) : '',
          rate: rateVal !== 0 ? String(rateVal) : '',
          gst_rate: gstVal !== 0 ? String(gstVal) : ''
        };
      });
      setPasteRows(mapped);
      Swal.fire({
        icon: 'success',
        title: 'Uploaded',
        text: `Loaded ${mapped.length} rows to the paste grid. Review and click 'Bulk Paste' to apply.`
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Validation Error',
        text: err.message || 'Error parsing Excel file.'
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleExportGrid = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Exported Items');
    const headers = [
      'Type Select *',
      'Package * Select from Dropdown',
      'Ref No * (Unique Identifier)',
      'Heading (Recommended)',
      'Sub Heading (Optional)',
      'Item Name - Required *',
      'Item Description (Optional)',
      'UOM Select DD',
      'Qty',
      'Rate (Required)',
      'GST Rate (Select DD)'
    ];
    worksheet.addRow(headers);
    pasteRows.forEach(r => {
      worksheet.addRow([
        r.item_type || 'supply',
        r.package_name || '',
        r.ref_no || '',
        r.heading || '',
        r.sub_heading || '',
        r.item_name || '',
        r.description || '',
        r.uom || '',
        r.qty || '',
        r.rate || '',
        r.gst_rate || ''
      ]);
    });
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), 'Exported_Items.xlsx');
  };

  const handleDirectExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const parsed = await parseExcel(file);
      const newItems = parsed.map((item, idx) => ({
        ...item,
        line_number: idx + 1
      }));
      setItems(newItems);
      Swal.fire({
        icon: 'success',
        title: 'Success',
        text: `Successfully imported ${newItems.length} items.`
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Validation Error',
        text: err.message || 'Error parsing Excel file.'
      });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const cleanNum = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    return parseFloat(String(val).replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
  };

  const cleanGst = (val) => {
    if (typeof val === 'number') {
      if (val > 0 && val <= 1) {
        return val * 100;
      }
      return val;
    }
    if (!val) return 0;
    let cleaned = String(val).replace(/,/g, '').trim();
    if (cleaned.endsWith('%')) {
      return parseFloat(cleaned.replace('%', '')) || 0;
    }
    let parsed = parseFloat(cleaned.replace(/[^\d.-]/g, '')) || 0;
    if (parsed > 0 && parsed <= 1) {
      return parsed * 100;
    }
    return parsed;
  };

  const calculateRow = (row) => {
    let s_qty = parseFloat(row.supply_qty) || 0;
    let s_rate = parseFloat(row.supply_rate) || 0;
    let s_gst_pct = cleanGst(row.supply_gst_rate);
    let sv_qty = parseFloat(row.service_qty) || 0;
    let sv_rate = parseFloat(row.service_rate) || 0;
    let sv_gst_pct = cleanGst(row.service_gst_rate);

    // GST validation logic: Keep the rate percentage chosen by the user, don't wipe it out.
    // Calculations of gst_s and gst_sv will naturally be 0 if qty or rate is 0.

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

  const handleManualEntry = () => {
    setItems([]);
    setManualEntryMode(true);
    setStep(2);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    const item = { ...newItems[index] };
    const currentType = item.item_type || ((parseFloat(item.supply_qty) || 0) > 0 || (parseFloat(item.supply_rate) || 0) > 0 ? 'supply' : 'service');

    if (field === 'item_type') {
      const newType = value.toLowerCase();
      item.item_type = newType;
      if (newType === 'service') {
        item.service_qty = item.supply_qty || 0;
        item.service_rate = item.supply_rate || 0;
        item.service_gst_rate = item.supply_gst_rate || 0;
        item.supply_qty = 0;
        item.supply_rate = 0;
        item.supply_gst_rate = 0;
      } else {
        item.supply_qty = item.service_qty || 0;
        item.supply_rate = item.service_rate || 0;
        item.supply_gst_rate = item.service_gst_rate || 0;
        item.service_qty = 0;
        item.service_rate = 0;
        item.service_gst_rate = 0;
      }
    } else if (field === 'qty') {
      const numericVal = parseFloat(value) || 0;
      if (currentType === 'service') {
        item.service_qty = numericVal;
        item.supply_qty = 0;
      } else {
        item.supply_qty = numericVal;
        item.service_qty = 0;
      }
    } else if (field === 'rate') {
      const numericVal = parseFloat(value) || 0;
      if (currentType === 'service') {
        item.service_rate = numericVal;
        item.supply_rate = 0;
      } else {
        item.supply_rate = numericVal;
        item.service_rate = 0;
      }
    } else if (field === 'gst_rate') {
      const numericVal = parseFloat(value) || 0;
      if (currentType === 'service') {
        item.service_gst_rate = numericVal;
        item.supply_gst_rate = 0;
      } else {
        item.supply_gst_rate = numericVal;
        item.service_gst_rate = 0;
      }
    } else {
      item[field] = value;
    }

    newItems[index] = calculateRow(item);
    setItems(newItems);
  };

  const addRow = () => {
    const lastItem = items[items.length - 1];
    const lastItemType = lastItem ? (lastItem.item_type || ((parseFloat(lastItem.supply_qty) || 0) > 0 || (parseFloat(lastItem.supply_rate) || 0) > 0 ? 'supply' : 'service')) : 'supply';
    const newRow = calculateRow({
      line_number: items.length + 1,
      item_type: lastItemType,
      ref_no: '',
      package_name: lastItem?.package_name || '',
      heading: '',
      sub_heading: '',
      item_name: '',
      description: '',
      uom: '',
      supply_qty: 0,
      supply_rate: 0,
      supply_gst_rate: lastItemType === 'supply' ? (lastItem?.supply_gst_rate ?? 18) : 0,
      service_qty: 0,
      service_rate: 0,
      service_gst_rate: lastItemType === 'service' ? (lastItem?.service_gst_rate ?? 18) : 0
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
          const parsed = await parseExcel(attachments.po_annex);
          const mapped = parsed.map((item, idx) => ({
            ...item,
            line_number: idx + 1
          }));

          if (mapped.length > 0) {
            setItems(mapped);
            Swal.fire({ icon: 'success', title: 'Parsed', text: 'Excel uploaded successfully. Click Next to review.', timer: 2000, showConfirmButton: false });
          } else {
            Swal.fire({ icon: 'error', title: 'Empty Excel', text: 'No valid items found in the Excel file. Please check the columns.' });
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error(err);
          Swal.fire({ icon: 'error', title: 'Parsing Error', text: err.message || 'Error parsing Excel file.' });
          setLoading(false);
          return;
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
        const heading = `Sl No: ${i + 1}`;
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
          if (s_rate === 0) {
            return Swal.fire({ icon: 'error', title: 'Supply Incomplete', text: `Rate must be non-zero for Supply in "${heading}".` });
          }
          if (it.supply_gst_rate === '' || it.supply_gst_rate === null || it.supply_gst_rate === undefined) {
            return Swal.fire({ icon: 'error', title: 'GST Mandatory', text: `Please select Supply GST for "${heading}".` });
          }
        }

        if (serviceActive) {
          if (sv_rate === 0) {
            return Swal.fire({ icon: 'error', title: 'Service Incomplete', text: `Rate must be non-zero for Service in "${heading}".` });
          }
          if (it.service_gst_rate === '' || it.service_gst_rate === null || it.service_gst_rate === undefined) {
            return Swal.fire({ icon: 'error', title: 'GST Mandatory', text: `Please select Service GST for "${heading}".` });
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
        spoc_name: basicDetails.contactName ? basicDetails.contactName.trim() : null,
        spoc_phone: basicDetails.contactPhone ? basicDetails.contactPhone.trim() : null,
        spoc_email: basicDetails.contactEmail ? basicDetails.contactEmail.trim() : null,
        need_sales_invoice_approval: basicDetails.needSalesInvoiceApproval,
        remarks: (basicDetails.remarks || '').trim()
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
      parseExcel(file)
        .then(data => setPreviewExcelData(data))
        .catch(err => setPreviewExcelData([{ "Error": err.message || "Invalid template structure." }]));
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

  const selectedLoc = locations.find(l => String(l.id) === String(basicDetails.locationId));
  const hasSecondSpoc = selectedLoc && selectedLoc.spoc2_name && selectedLoc.spoc2_phone;

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
        .tooltip-container {
          position: relative;
          display: inline-block;
        }
        .tooltip-text {
          visibility: hidden;
          opacity: 0;
          position: absolute;
          bottom: 125%;
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          background-color: #1E293B;
          color: #FFF;
          text-align: center;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
          z-index: 100;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s ease;
          pointer-events: none;
        }
        .tooltip-text::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border-width: 5px;
          border-style: solid;
          border-color: #1E293B transparent transparent transparent;
        }
        .tooltip-container:hover .tooltip-text {
          visibility: visible;
          opacity: 1;
          transform: translateX(-50%) translateY(0);
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

              {/* Left Column: Continuous Form Inputs */}
              <div>
                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #E5E7EB', paddingBottom: '6px', marginBottom: '12px', fontWeight: 700, color: '#334155' }}>1. Basic Details</h3>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Customer</label>
                    <CustomCustomerSelect
                      customers={customers}
                      value={basicDetails.customerId}
                      onChange={handleCustomerChange}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Location</label>
                    <select name="locationId" value={basicDetails.locationId} onChange={handleBasicChange} className="compact-form-select">
                      <option value="">Select Location</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                    {basicDetails.customerId && locations.length === 0 && (
                      <p style={{ color: '#D97706', fontSize: '0.75rem', marginTop: '4px', fontWeight: 600 }}>
                        No locations found. Please inform the admin to add a location.
                      </p>
                    )}
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

                  <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#3B82F6' }}>settings_suggest</span>
                      <span>Need Approval by Sales for invoice ? <span style={{ color: 'red' }}>*</span></span>
                    </div>
                    <div style={{ display: 'flex', gap: '24px' }}>
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
                  </div>

                  <div style={{ marginBottom: '4px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Project SPOC Name <span style={{ color: 'red' }}>*</span></label>
                    <select
                      name="projectSpocName"
                      value={basicDetails.projectSpocName || ''}
                      onChange={handleBasicChange}
                      className="compact-form-input-text"
                      style={{ width: '100%', height: '30px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', background: 'white' }}
                    >
                      {filteredProjectUsers.length === 0 ? (
                        <option value="">No Project SPOC Available</option>
                      ) : (
                        <>
                          <option value="">Select Project SPOC</option>
                          {filteredProjectUsers.map(user => (
                            <option key={user.id} value={user.full_name}>{user.full_name}</option>
                          ))}
                        </>
                      )}
                    </select>
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

              {/* Right Column: Info & SPOC Details (Autofilled / Select Info) */}
              <div>
                <h3 style={{ fontSize: '14px', borderBottom: '1px solid #E5E7EB', paddingBottom: '6px', marginBottom: '12px', fontWeight: 700, color: '#334155' }}>SPOC Details</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* Customer SPOC Container */}
                  <div style={{ border: '1px solid #E2E8F0', padding: '14px', borderRadius: '8px', background: '#F8FAFC' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#3B82F6' }}>support_agent</span>
                      <span>Customer SPOC</span>
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 400, textTransform: 'none' }}>(Autofilled from Location)</span>
                    </div>

                    {hasSecondSpoc && (
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Choose Contact Person</label>
                        <select
                          value={basicDetails.selectedSpocIndex || '1'}
                          onChange={(e) => {
                            const val = e.target.value;
                            const name = val === '1' ? selectedLoc.contact_name : selectedLoc.spoc2_name;
                            const phone = val === '1' ? selectedLoc.contact_phone : selectedLoc.spoc2_phone;
                            const email = val === '1' ? selectedLoc.contact_email : selectedLoc.spoc2_email;
                            setBasicDetails(prev => ({
                              ...prev,
                              selectedSpocIndex: val,
                              contactName: name || '',
                              contactPhone: phone || '',
                              contactEmail: email || ''
                            }));
                          }}
                          style={{ width: '100%', maxWidth: '240px', height: '28px', padding: '0 8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', background: 'white', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value="1">{selectedLoc.contact_name || 'Primary SPOC'} (SPOC 1)</option>
                          <option value="2">{selectedLoc.spoc2_name || 'Secondary SPOC'} (SPOC 2)</option>
                        </select>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Name <span style={{ color: 'red' }}>*</span></label>
                        <input name="contactName" value={basicDetails.contactName || ''} readOnly placeholder="Primary Contact Name" className="compact-form-input-text" style={{ background: '#E2E8F0', color: '#64748b', cursor: 'not-allowed' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: isCustomerPhoneInvalid ? '#EF4444' : '#475569', marginBottom: '4px' }}>Phone <span style={{ color: 'red' }}>*</span></label>
                        <input
                          name="contactPhone"
                          value={basicDetails.contactPhone || ''}
                          placeholder="Primary Phone"
                          className="compact-form-input-text"
                          readOnly
                          style={{
                            background: isCustomerPhoneInvalid ? '#FEF2F2' : '#E2E8F0',
                            color: isCustomerPhoneInvalid ? '#DC2626' : '#64748b',
                            border: isCustomerPhoneInvalid ? '1px solid #EF4444' : '1px solid #CBD5E1',
                            cursor: 'not-allowed'
                          }}
                        />
                        {isCustomerPhoneInvalid && (
                          <p style={{ color: '#EF4444', fontSize: '10px', marginTop: '4px', fontWeight: 500 }}>
                            Must be exactly 10 digits. Update under Customer/Location Master.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Project SPOC Container */}
                  <div style={{ border: '1px solid #E2E8F0', padding: '14px', borderRadius: '8px', background: '#F8FAFC' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#10B981' }}>badge</span>
                      <span>Project SPOC</span>
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 400, textTransform: 'none' }}>(Select from Project Users)</span>
                    </div>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Project SPOC Email ID <span style={{ color: 'red' }}>*</span></label>
                          <input name="projectSpocEmail" type="email" value={basicDetails.projectSpocEmail} onChange={handleBasicChange} placeholder="Project SPOC Email ID" className="compact-form-input-text" readOnly style={{ background: '#E2E8F0', color: '#64748B', cursor: 'not-allowed' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: isProjectPhoneInvalid ? '#EF4444' : '#475569', marginBottom: '4px' }}>Project SPOC Contact <span style={{ color: 'red' }}>*</span></label>
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
                            <p style={{ color: '#EF4444', fontSize: '10px', marginTop: '4px', fontWeight: 500 }}>
                              Must be exactly 10 digits. Update under Project User Master.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes / Remarks Container */}
                  <div style={{ border: '1px solid #E2E8F0', padding: '14px', borderRadius: '8px', background: '#F8FAFC' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#64748B' }}>notes</span>
                      <span>Notes</span>
                    </div>
                    <div>
                      <textarea
                        name="remarks"
                        value={basicDetails.remarks || ''}
                        onChange={handleBasicChange}
                        placeholder="Enter any additional notes or instructions for this PO..."
                        className="compact-form-input-text"
                        style={{
                          width: '100%',
                          height: '60px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12px',
                          background: 'white',
                          resize: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                </div>
              </div>

            </div>

            {/* Bottom Row: Attachments */}
            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '20px', marginTop: '8px' }}>
              <h3 style={{ fontSize: '14px', borderBottom: '1px solid #E5E7EB', paddingBottom: '6px', marginBottom: '12px', fontWeight: 700, color: '#334155' }}>2. Attachments</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {['po_copy', 'po_annex', 'other'].map(type => (
                  <div key={type} style={{ border: '1px solid #E5E7EB', padding: '12px', borderRadius: '8px', background: '#F8FAFC' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px', textTransform: 'capitalize' }}>
                      {type === 'po_copy' ? 'PO Copy' : type === 'po_annex' ? 'PO Annex' : 'Other'}
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.xlsm,.csv" onChange={(e) => handleFileChange(type, e.target.files[0])} style={{ fontSize: '11px', width: '100%' }} />
                      {attachments[type] && (
                        <button onClick={() => setShowViewer(type)} style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '12px', width: '100%' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                            {attachments[type].name.toLowerCase().endsWith('.xlsx') || attachments[type].name.toLowerCase().endsWith('.xls') ? 'description' : 'visibility'}
                          </span>
                          View Uploaded File
                        </button>
                      )}
                    </div>
                    {attachments[type] && (
                      <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span>
                        {attachments[type].name}
                      </p>
                    )}
                  </div>
                ))}

                {/* Excel Template Download Card */}
                <div style={{ border: '1px solid #E5E7EB', padding: '12px', borderRadius: '8px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '84px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Excel Template
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div className="tooltip-container" style={{ width: '100%' }}>
                      {/* <span className="tooltip-text">Download Customer Import Template</span> */}
                      <button
                        onClick={async () => {
                          await handleDownloadTemplate();
                          handleManualEntry();
                        }}
                        style={{
                          background: '#F0FDF4',
                          border: '1.5px solid #BBF7D0',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.2s ease',
                          outline: 'none',
                          width: '100%',
                          justifyContent: 'center',
                          height: '36px',
                          boxSizing: 'border-box'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#DCFCE7';
                          e.currentTarget.style.borderColor = '#86EFAC';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#F0FDF4';
                          e.currentTarget.style.borderColor = '#BBF7D0';
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                          <path d="M4 3C4 1.89543 4.89543 1 6 1H14L20 7V21C20 22.1046 19.1046 23 18 23H6C4.89543 23 4 22.1046 4 21V3Z" fill="#107C41" />
                          <path d="M14 1V7H20L14 1Z" fill="#185C37" />
                          <path d="M7 9L10 13L7 17H9L11 14.3333L13 17H15L12 13L15 9H13L11 11.6667L9 9H7Z" fill="white" />
                        </svg>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534' }}>
                          Download Template
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
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
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', width: '90px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Type</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', width: '70px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Ref No</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '150px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Package</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '180px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Heading</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '200px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Sub Heading</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '250px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Item Name</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', minWidth: '300px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>Item Description <span style={{ fontSize: '8px', color: '#4B5563' }}>(click to view description)</span></th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#F9FAFB', width: '50px', fontSize: '11px', fontWeight: 700, color: '#06070aff', height: '36px' }}>UOM</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', width: '80px', fontSize: '11px', fontWeight: 800, color: '#065f46', height: '36px' }}>Qty</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', width: '90px', fontSize: '11px', fontWeight: 800, color: '#065f46', height: '36px' }}>Rate</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#ECFDF5', width: '80px', fontSize: '11px', fontWeight: 800, color: '#065f46', height: '36px' }}>GST Rate</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '110px', fontSize: '11px', fontWeight: 800, color: '#92400e', textAlign: 'right', height: '36px' }}>Taxable Value</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '110px', fontSize: '11px', fontWeight: 800, color: '#92400e', textAlign: 'right', height: '36px' }}>GST</th>
                    <th style={{ padding: '0 8px', border: '1px solid #E5E7EB', background: '#FEF3C7', minWidth: '120px', fontSize: '11px', fontWeight: 800, color: '#92400e', textAlign: 'right', height: '36px' }}>Invoice Value</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const rowType = it.item_type || ((parseFloat(it.supply_qty) || 0) > 0 || (parseFloat(it.supply_rate) || 0) > 0 ? 'supply' : 'service');
                    const qtyVal = rowType === 'service' ? it.service_qty : it.supply_qty;
                    const rateVal = rowType === 'service' ? it.service_rate : it.supply_rate;
                    const gstVal = rowType === 'service' ? it.service_gst_rate : it.supply_gst_rate;

                    return (
                      <tr key={idx} style={{ height: '32px' }}>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'center', color: '#1e293b', fontWeight: 800, background: '#f1f5f9', fontSize: '0.7rem', position: 'sticky', left: 0, zIndex: 10, borderRight: '2px solid #D1D5DB', height: '32px' }}>{idx + 1}</td>
                        <td style={{ padding: '0', border: '1px solid #E5E7EB', height: '32px' }}>
                          <select
                            value={rowType}
                            onChange={(e) => updateItem(idx, 'item_type', e.target.value)}
                            style={{ width: '100%', border: 'none', padding: '0 8px', fontSize: '0.7rem', height: '32px', background: 'transparent', outline: 'none', fontWeight: 600 }}
                          >
                            <option value="supply">Supply</option>
                            <option value="service">Service</option>
                          </select>
                        </td>
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
                        <td style={{ padding: '0', border: '1px solid #E5E7EB', background: '#ECFDF5' }}>
                          <input type="number" value={qtyVal} onChange={(e) => updateItem(idx, 'qty', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '0 8px', height: '32px', fontSize: '0.7rem', background: 'transparent' }} />
                        </td>
                        <td style={{ padding: '0', border: '1px solid #E5E7EB', background: '#ECFDF5' }}>
                          <input type="number" value={rateVal} onChange={(e) => updateItem(idx, 'rate', e.target.value)} style={{ width: '100%', border: 'none', textAlign: 'right', padding: '0 8px', height: '32px', fontSize: '0.7rem', background: 'transparent' }} />
                        </td>
                        <td style={{ padding: '0', border: '1px solid #E5E7EB', background: '#ECFDF5' }}>
                          <select
                            value={gstVal ?? ''}
                            onChange={(e) => updateItem(idx, 'gst_rate', e.target.value)}
                            style={{ width: '100%', border: 'none', padding: '0 8px', fontSize: '0.7rem', background: 'transparent', outline: 'none', height: '32px' }}
                          >
                            <option value="">Select</option>
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                          </select>
                        </td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB', fontSize: '0.75rem', height: '32px' }}>₹{(it.total_taxable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 600, background: '#FFFBEB', fontSize: '0.75rem', height: '32px' }}>₹{(it.total_gst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0 8px', border: '1px solid #E5E7EB', textAlign: 'right', fontWeight: 700, background: '#FEF3C7', fontSize: '0.9rem', height: '32px' }}>₹{(it.total_invoice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 20, background: '#0f172a', color: '#ffffff', fontWeight: 700 }}>
                  <tr>
                    <td colSpan="12" style={{ padding: '4px 8px', textAlign: 'right', fontSize: '0.85rem', borderTop: '2px solid #334155', color: '#ffffff' }}>GRAND TOTALS:</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', fontSize: '0.85rem', borderTop: '2px solid #334155', color: '#ffffff', whiteSpace: 'nowrap' }}>₹{getSummaryTotals().taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.75rem', color: '#cbd5e1', marginLeft: '4px' }}>(Taxable)</span></td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', fontSize: '0.85rem', borderTop: '2px solid #334155', color: '#ffffff', whiteSpace: 'nowrap' }}>₹{getSummaryTotals().gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.75rem', color: '#cbd5e1', marginLeft: '4px' }}>(GST)</span></td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', background: '#059669', fontSize: '0.9rem', color: '#ffffff', borderTop: '2px solid #065f46', whiteSpace: 'nowrap' }}>₹{getSummaryTotals().grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.75rem', color: '#d1fae5', marginLeft: '4px' }}>(Total)</span></td>
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
              </div>
              <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px' }}>Edit cells directly, use <b>Ctrl+V</b> to paste from your desktop Excel, or <b>Load from Excel</b> to import a whole file. Click <b>Save as Excel</b> to export your current work.</p>

              <div onPaste={handleGridPaste} style={{ flex: 1, overflow: 'auto', border: '1px solid #E5E7EB', borderRadius: '8px', background: '#F9FAFB' }}>
                <table style={{ width: 'max-content', borderCollapse: 'collapse', fontSize: '0.75rem', background: 'white' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F3F4F6' }}>
                    <tr>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '40px' }}>#</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '100px' }}>Type Select</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '120px' }}>Package</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '100px' }}>Ref No</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '120px' }}>Heading</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '120px' }}>Sub Heading</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '150px' }}>Item Name</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '200px' }}>Item Description</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '60px' }}>UOM</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '90px', background: '#ECFDF5' }}>Qty</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '100px', background: '#ECFDF5' }}>Rate</th>
                      <th style={{ padding: '8px', border: '1px solid #E5E7EB', minWidth: '100px', background: '#ECFDF5' }}>GST Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pasteRows.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '4px', border: '1px solid #E5E7EB', textAlign: 'center', background: '#F9FAFB' }}>{idx + 1}</td>
                        {(() => {
                          const fields = [
                            { key: 'item_type', label: 'Type', isNumeric: false },
                            { key: 'package_name', label: 'Package', isNumeric: false },
                            { key: 'ref_no', label: 'Ref No', isNumeric: false },
                            { key: 'heading', label: 'Heading', isNumeric: false },
                            { key: 'sub_heading', label: 'Sub Heading', isNumeric: false },
                            { key: 'item_name', label: 'Item Name', isNumeric: false },
                            { key: 'description', label: 'Description', isNumeric: false },
                            { key: 'uom', label: 'UOM', isNumeric: false },
                            { key: 'qty', label: 'Qty', isNumeric: true },
                            { key: 'rate', label: 'Rate', isNumeric: true },
                            { key: 'gst_rate', label: 'GST Rate', isNumeric: false }
                          ];
                          return fields.map(f => {
                            const field = f.key;
                            const isNumeric = f.isNumeric;
                            if (field === 'item_type') {
                              return (
                                <td key={field} style={{ padding: 0, border: '1px solid #E5E7EB' }}>
                                  <select
                                    value={row[field] || 'supply'}
                                    onChange={(e) => {
                                      const newRows = [...pasteRows];
                                      newRows[idx] = { ...newRows[idx], [field]: e.target.value };
                                      setPasteRows(newRows);
                                    }}
                                    style={{ width: '100%', border: 'none', padding: '6px', fontSize: '0.75rem', outline: 'none', background: 'transparent', fontWeight: 600 }}
                                  >
                                    <option value="supply">Supply</option>
                                    <option value="service">Service</option>
                                  </select>
                                </td>
                              );
                            }
                            if (field === 'gst_rate') {
                              return (
                                <td key={field} style={{ padding: 0, border: '1px solid #E5E7EB', background: '#FDFDEA' }}>
                                  <select
                                    value={row[field] || ''}
                                    onChange={(e) => {
                                      const newRows = [...pasteRows];
                                      newRows[idx] = { ...newRows[idx], [field]: e.target.value };
                                      setPasteRows(newRows);
                                    }}
                                    style={{ width: '100%', border: 'none', padding: '6px', fontSize: '0.75rem', outline: 'none', background: 'transparent' }}
                                  >
                                    <option value="">Select</option>
                                    <option value="0">0%</option>
                                    <option value="5">5%</option>
                                    <option value="12">12%</option>
                                    <option value="18">18%</option>
                                    <option value="28">28%</option>
                                  </select>
                                </td>
                              );
                            }
                            return (
                              <td key={field} style={{ padding: 0, border: '1px solid #E5E7EB', background: isNumeric ? '#FDFDEA' : 'white' }}>
                                <input
                                  type={isNumeric ? "number" : "text"}
                                  value={row[field] || ''}
                                  onChange={(e) => {
                                    const newRows = [...pasteRows];
                                    newRows[idx] = { ...newRows[idx], [field]: e.target.value };
                                    setPasteRows(newRows);
                                  }}
                                  style={{ width: '100%', border: 'none', padding: '6px', fontSize: '0.75rem', outline: 'none', background: 'transparent', textAlign: isNumeric ? 'right' : 'left' }}
                                />
                              </td>
                            );
                          });
                        })()}
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
  // 1. Group & filter Supply items
  const supplyData = React.useMemo(() => {
    if (!data) return [];
    const valid = data.filter(it => {
      if (!it) return false;
      const hasNameOrRef = (it.item_name && it.item_name.trim() !== '') || (it.ref_no && it.ref_no.trim() !== '');
      if (!hasNameOrRef) return false;
      const type = String(it.item_type || '').toLowerCase();
      return type === 'supply';
    });

    const summary = valid.reduce((acc, it) => {
      const pkg = it.package_name || 'General';
      if (!acc[pkg]) {
        acc[pkg] = {
          package_name: pkg,
          taxable: 0,
          gst: 0,
          invoice: 0
        };
      }
      acc[pkg].taxable += (it.taxable_supply || 0);
      acc[pkg].gst += (it.gst_supply || 0);
      acc[pkg].invoice += (it.total_supply || 0);
      return acc;
    }, {});
    return Object.values(summary);
  }, [data]);

  // 2. Group & filter Service items
  const serviceData = React.useMemo(() => {
    if (!data) return [];
    const valid = data.filter(it => {
      if (!it) return false;
      const hasNameOrRef = (it.item_name && it.item_name.trim() !== '') || (it.ref_no && it.ref_no.trim() !== '');
      if (!hasNameOrRef) return false;
      const type = String(it.item_type || '').toLowerCase();
      return type === 'service';
    });

    const summary = valid.reduce((acc, it) => {
      const pkg = it.package_name || 'General';
      if (!acc[pkg]) {
        acc[pkg] = {
          package_name: pkg,
          taxable: 0,
          gst: 0,
          invoice: 0
        };
      }
      acc[pkg].taxable += (it.taxable_service || 0);
      acc[pkg].gst += (it.gst_service || 0);
      acc[pkg].invoice += (it.total_service || 0);
      return acc;
    }, {});
    return Object.values(summary);
  }, [data]);

  // 3. Compute Totals
  const supplyTotals = React.useMemo(() => {
    return supplyData.reduce((acc, row) => ({
      taxable: acc.taxable + row.taxable,
      gst: acc.gst + row.gst,
      invoice: acc.invoice + row.invoice
    }), { taxable: 0, gst: 0, invoice: 0 });
  }, [supplyData]);

  const serviceTotals = React.useMemo(() => {
    return serviceData.reduce((acc, row) => ({
      taxable: acc.taxable + row.taxable,
      gst: acc.gst + row.gst,
      invoice: acc.invoice + row.invoice
    }), { taxable: 0, gst: 0, invoice: 0 });
  }, [serviceData]);

  const formatCurrency = (val) => {
    return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '24px' }}>
      {/* SUPPLY SUMMARY */}
      {supplyData.length > 0 && (
        <div>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F766E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>local_shipping</span>
            Supply Summary
          </h4>
          <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr style={{ height: '36px' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em' }}>Package Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '20%' }}>Taxable Value</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '20%' }}>GST Value</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '25%' }}>Grand Total Invoice Value</th>
                </tr>
              </thead>
              <tbody>
                {supplyData.map((row, idx) => (
                  <tr key={idx} style={{ height: '32px' }}>
                    <td style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #E2E8F0', fontWeight: 600, color: '#1E293B' }}>{row.package_name}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', color: '#334155' }}>{formatCurrency(row.taxable)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', color: '#334155' }}>{formatCurrency(row.gst)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', fontWeight: 600, color: '#0F766E' }}>{formatCurrency(row.invoice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ background: '#F0FDFA', fontWeight: 800, borderTop: '2px solid #0F766E' }}>
                <tr style={{ height: '36px', color: '#0F766E' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #E2E8F0' }}>Supply Total</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0' }}>{formatCurrency(supplyTotals.taxable)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0' }}>{formatCurrency(supplyTotals.gst)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', fontSize: '0.85rem' }}>{formatCurrency(supplyTotals.invoice)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* SERVICE SUMMARY */}
      {serviceData.length > 0 && (
        <div>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1E3A8A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>engineering</span>
            Service Summary
          </h4>
          <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr style={{ height: '36px' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em' }}>Package Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '20%' }}>Taxable Value</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '20%' }}>GST Value</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 800, border: '1px solid #E2E8F0', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.02em', width: '25%' }}>Grand Total Invoice Value</th>
                </tr>
              </thead>
              <tbody>
                {serviceData.map((row, idx) => (
                  <tr key={idx} style={{ height: '32px' }}>
                    <td style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #E2E8F0', fontWeight: 600, color: '#1E293B' }}>{row.package_name}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', color: '#334155' }}>{formatCurrency(row.taxable)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', color: '#334155' }}>{formatCurrency(row.gst)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', fontWeight: 600, color: '#1E3A8A' }}>{formatCurrency(row.invoice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ background: '#EFF6FF', fontWeight: 800, borderTop: '2px solid #1E3A8A' }}>
                <tr style={{ height: '36px', color: '#1E3A8A' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #E2E8F0' }}>Service Total</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0' }}>{formatCurrency(serviceTotals.taxable)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0' }}>{formatCurrency(serviceTotals.gst)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #E2E8F0', fontSize: '0.85rem' }}>{formatCurrency(serviceTotals.invoice)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
