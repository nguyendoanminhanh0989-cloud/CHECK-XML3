import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileUp, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  Download, 
  Trash2, 
  Settings2,
  Search,
  Filter,
  MonitorCheck,
  Database,
  Users,
  Activity,
  Server
} from 'lucide-react';
import { DVKTRecord, ErrorLog, ValidationConfig, Staff, Machine, ServiceCatalog } from './types';
import { validateRecords } from './validator';
import { cn, formatDate } from './lib/utils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'main' | 'staff' | 'service' | 'machine'>('main');
  
  const [records, setRecords] = useState<DVKTRecord[]>([]);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const staffInputRef = useRef<HTMLInputElement>(null);
  const machineInputRef = useRef<HTMLInputElement>(null);
  const serviceInputRef = useRef<HTMLInputElement>(null);

  const [config, setConfig] = useState<ValidationConfig>({
    checkExactTimeYL: true,
    checkExactTimeTH: true,
    checkExactTimeKQ: true,
    checkStaffOverlap: true,
    checkPatientOverlap: true,
    checkMachine: true,
    checkOperatingHours: true,
    checkTimeLogic: true,
    operatingHours: {
      morningStart: '07:00',
      morningEnd: '11:30',
      afternoonStart: '13:00',
      afternoonEnd: '17:00'
    },
    staffCatalog: [],
    machineCatalog: [],
    serviceCatalog: []
  });

  const parseDateString = (val: any): Date | null => {
    if (!val) return null;
    if (val instanceof Date) return val;
    const str = String(val).trim();
    if (str.length === 12 && !isNaN(Number(str))) {
      return new Date(
        parseInt(str.substring(0,4)),
        parseInt(str.substring(4,6))-1,
        parseInt(str.substring(6,8)),
        parseInt(str.substring(8,10)),
        parseInt(str.substring(10,12))
      );
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  const getCol = (row: any, names: string[]) => {
    for (const n of names) {
      if (row[n] !== undefined) return row[n];
    }
    return '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let allMapped: DVKTRecord[] = [];
    let processedCount = 0;

    files.forEach((file, fileIndex) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const mapped: DVKTRecord[] = data.map((row: any, index) => {
          return {
            id: `rec-${fileIndex}-${index}-${Date.now()}`,
            MA_LK: String(getCol(row, ['MA_LK', 'MaBN', 'Mã LK', 'Mã BN'])),
            MA_DICH_VU: String(getCol(row, ['MA_DICH_VU', 'MA_THUOC', 'MaDVKT', 'Mã DVKT'])),
            TEN_DICH_VU: String(getCol(row, ['TEN_DICH_VU', 'TEN_THUOC', 'TenDVKT', 'Tên DVKT'])),
            NGAY_YL: parseDateString(getCol(row, ['NGAYGIO_YL', 'NGAY_YL', 'ThoiGianYLenh', 'Ngày Y lệnh'])),
            NGAY_TH_YL: parseDateString(getCol(row, ['NGAYGIO_TH_YL', 'NGAY_TH_YL', 'ThoiGianThucHien', 'Ngày thực hiện'])),
            NGAY_KQ: parseDateString(getCol(row, ['NGAYGIO_KQ', 'NGAY_KQ', 'ThoiGianKetQua', 'Ngày kết quả'])),
            MA_BAC_SI: String(getCol(row, ['MA_BAC_SI', 'NguoiChiDinh', 'Bác sĩ'])),
            NGUOI_THUC_HIEN: String(getCol(row, ['NGUOI_THUC_HIEN', 'NguoiThucHien', 'Người thực hiện', 'MACCHN', 'CCHN'])),
            MA_MAY: String(getCol(row, ['MA_MAY', 'MaMay', 'Mã máy'])),
            LOAI_BIEU: row['MA_THUOC'] ? 'THUOC' : 'CLS',
            originalRow: row
          };
        });

        allMapped = [...allMapped, ...mapped];
        processedCount++;
        
        if (processedCount === files.length) {
          setRecords(prev => [...prev, ...allMapped]);
          setActiveTab('main');
        }
      };
      reader.readAsBinaryString(file);
    });
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportStaff = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      const catalog = data.map((r: any) => ({
        cchn: String(getCol(r, ['MACCHN', 'CCHN', 'MaNV', 'Mã NV', 'MA_NV'])),
        name: String(getCol(r, ['HO_TEN', 'TEN_NV', 'TenNV', 'Tên NV', 'HoTen', 'Họ tên']))
      })).filter(x => x.cchn && x.cchn !== 'undefined');
      setConfig(prev => ({ ...prev, staffCatalog: catalog }));
      alert(`Đã import ${catalog.length} nhân viên.`);
    };
    reader.readAsBinaryString(file);
    if (staffInputRef.current) staffInputRef.current.value = '';
  };

  const handleImportMachine = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      const catalog = data.map((r: any) => ({
        code: String(getCol(r, ['MA_MAY', 'Mã máy', 'MaMay'])),
        name: String(getCol(r, ['TEN_TB', 'TEN_MAY', 'Tên máy', 'TenMay'])),
        allowOverlap: Boolean(getCol(r, ['CHO_PHEP_TRUNG', 'ChoPhepTrung', 'AllowOverlap']))
      })).filter(x => x.code && x.code !== 'undefined');
      setConfig(prev => ({ ...prev, machineCatalog: catalog }));
      alert(`Đã import ${catalog.length} máy/thiết bị.`);
    };
    reader.readAsBinaryString(file);
    if (machineInputRef.current) machineInputRef.current.value = '';
  };

  const handleImportService = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      const catalog = data.map((r: any) => ({
        code: String(getCol(r, ['MA_DICH_VU', 'MA_DVKT', 'Mã DV', 'MaDVKT'])),
        name: String(getCol(r, ['TEN_DICH_VU', 'TEN_DVKT', 'Tên DVKT'])),
        allowStaffOverlap: Boolean(getCol(r, ['CHO_PHEP_NV_TRUNG', 'ChoPhepTrung', 'AllowStaffOverlap']))
      })).filter(x => x.code && x.code !== 'undefined');
      setConfig(prev => ({ ...prev, serviceCatalog: catalog }));
      alert(`Đã import ${catalog.length} dịch vụ kỹ thuật.`);
    };
    reader.readAsBinaryString(file);
    if (serviceInputRef.current) serviceInputRef.current.value = '';
  };

  const handleValidate = () => {
    setIsValidating(true);
    setTimeout(() => {
      const results = validateRecords(records, config);
      setErrors(results);
      setIsValidating(false);
    }, 600);
  };

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    const dataWithStatus = records.map(rec => {
      const recErrors = errors.filter(e => e.recordId === rec.id);
      return {
        'MA_LK': rec.MA_LK,
        'TEN_DVKT': rec.TEN_DICH_VU,
        'THOI_GIAN_YL': rec.NGAY_YL ? formatDate(rec.NGAY_YL) : '',
        'THOI_GIAN_TH': rec.NGAY_TH_YL ? formatDate(rec.NGAY_TH_YL) : '',
        'THOI_GIAN_KQ': rec.NGAY_KQ ? formatDate(rec.NGAY_KQ) : '',
        'TEN_NGUOI_YL': rec.MA_BAC_SI,
        'TEN_NGUOI_TH': rec.NGUOI_THUC_HIEN,
        'MA_MAY': rec.MA_MAY,
        'GHI_CHU': recErrors.map(e => e.NoiDung).join('; '),
        ...rec.originalRow
      };
    });
    const wsAll = XLSX.utils.json_to_sheet(dataWithStatus);
    XLSX.utils.book_append_sheet(wb, wsAll, "Kết quả Đối chiếu");

    const wsErrors = XLSX.utils.json_to_sheet(errors.map(e => ({
      'Mã LK': e.MA_LK,
      'Mã DV': e.MA_DICH_VU,
      'Nội dung lỗi': e.NoiDung,
      'Loại': e.Loai === 'heavy' ? 'Nặng' : 'Cảnh báo'
    })));
    XLSX.utils.book_append_sheet(wb, wsErrors, "Danh sách lỗi chi tiết");

    XLSX.writeFile(wb, `Ket_Qua_Kiem_Tra_DVKT_${new Date().getTime()}.xlsx`);
  };

  const filteredRecords = useMemo(() => {
    if (!searchTerm) return records;
    const s = searchTerm.toLowerCase();
    return records.filter(r => 
      r.MA_LK.toLowerCase().includes(s) || 
      r.MA_DICH_VU.toLowerCase().includes(s) || 
      r.TEN_DICH_VU.toLowerCase().includes(s)
    );
  }, [records, searchTerm]);

  const groupedServices = useMemo(() => {
    const map = new Map<string, ServiceCatalog[]>();
    config.serviceCatalog.forEach(s => {
      const groupCode = s.code.substring(0, 2);
      if (!map.has(groupCode)) map.set(groupCode, []);
      map.get(groupCode)!.push(s);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [config.serviceCatalog]);

  return (
    <div className="min-h-screen bg-[#e8f1f8] bg-gradient-to-br from-[#e1ecf7] via-[#f4f8fb] to-[#d6e5f3] text-[#1A1A1A] font-sans pb-10">
      
      {/* HEADER: Theme Xanh Dương Mạnh, Nút xanh lá */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-blue-900 to-[#1e3a8a] shadow-lg border-b border-blue-950 px-6 py-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-emerald-400 to-emerald-600 p-2.5 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.4)] border border-emerald-300/30">
            <MonitorCheck size={26} className="text-white" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-blue-100">Check_XML_3</h1>
            <p className="text-[10px] font-bold text-emerald-400 tracking-[0.2em] uppercase mt-0.5">NGUYỄN ĐOÀN MINH ÁNH - IT Y TẾ</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx, .xls, .csv" multiple />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl transition-all text-sm font-medium shadow-sm cursor-pointer backdrop-blur-sm"
          >
            <FileUp size={18} />
            <span>Nhập File Đối Chiếu</span>
          </button>
          
          <button 
            onClick={handleValidate}
            disabled={records.length === 0 || isValidating}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-xl transition-all text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(16,185,129,0.3)] cursor-pointer border border-emerald-400/50"
          >
            {isValidating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search size={18} />}
            <span>Thực Hiện Đối Chiếu</span>
          </button>

          <button 
            onClick={handleExport}
            disabled={records.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-slate-700 cursor-pointer"
          >
            <Download size={18} />
            <span>Xuất Báo Cáo</span>
          </button>

          <button 
            onClick={() => { setRecords([]); setErrors([]); }}
            className="p-2.5 text-blue-200 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer border border-transparent"
            title="Xóa tất cả"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 mt-2">
        
        {/* Left Panel: Navigation & Stats */}
        <div className="lg:col-span-3 space-y-5">
          <div className="bg-white/90 backdrop-blur-md border border-blue-100/50 rounded-2xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col gap-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Menu Tính Năng</h3>
            
            <button 
              onClick={() => setActiveTab('main')} 
              className={cn("flex items-center gap-3 p-3.5 rounded-xl text-left text-sm font-semibold transition-all border", activeTab === 'main' ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm" : "border-transparent hover:bg-slate-50 text-slate-600")}
            >
              <Database size={18} className={activeTab === 'main' ? "text-emerald-600" : "text-slate-400"} />
              Dữ liệu & Kết quả
            </button>
            <button 
              onClick={() => setActiveTab('staff')} 
              className={cn("flex items-center gap-3 p-3.5 rounded-xl text-left text-sm font-semibold transition-all border", activeTab === 'staff' ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm" : "border-transparent hover:bg-slate-50 text-slate-600")}
            >
              <Users size={18} className={activeTab === 'staff' ? "text-emerald-600" : "text-slate-400"} />
              Danh mục Nhân viên (Bảng 2)
            </button>
            <button 
              onClick={() => setActiveTab('service')} 
              className={cn("flex items-center gap-3 p-3.5 rounded-xl text-left text-sm font-semibold transition-all border", activeTab === 'service' ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm" : "border-transparent hover:bg-slate-50 text-slate-600")}
            >
              <Activity size={18} className={activeTab === 'service' ? "text-emerald-600" : "text-slate-400"} />
              Danh mục Dịch vụ (Bảng 5)
            </button>
            <button 
              onClick={() => setActiveTab('machine')} 
              className={cn("flex items-center gap-3 p-3.5 rounded-xl text-left text-sm font-semibold transition-all border", activeTab === 'machine' ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm" : "border-transparent hover:bg-slate-50 text-slate-600")}
            >
              <Server size={18} className={activeTab === 'machine' ? "text-emerald-600" : "text-slate-400"} />
              Danh mục TTB/Máy (Bảng 6)
            </button>
          </div>

          {activeTab === 'main' && (
            <>
              <section className="bg-white/90 backdrop-blur-md border border-blue-100/50 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Thống kê</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                    <p className="text-2xl font-black text-slate-700">{records.length}</p>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Bản ghi</p>
                  </div>
                  <div className="bg-red-50/80 border border-red-100 p-4 rounded-2xl relative overflow-hidden">
                    <div className="absolute -right-4 -bottom-4 opacity-10 text-red-500"><AlertCircle size={64}/></div>
                    <p className="text-2xl font-black text-red-600 relative">{errors.length}</p>
                    <p className="text-xs font-semibold text-red-500 mt-1 relative">Cảnh báo/Lỗi</p>
                  </div>
                </div>
              </section>

              <section className="bg-white/90 backdrop-blur-md border border-blue-100/50 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cấu hình Đối chiếu</h3>
                  <button onClick={() => setShowConfig(!showConfig)} className="text-emerald-600 hover:text-emerald-500 transition-colors bg-emerald-50 p-1.5 rounded-lg">
                    <Settings2 size={16} />
                  </button>
                </div>
                
                {showConfig && (
                  <div className="mb-5 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Giờ hành chính</h4>
                    <div className="flex gap-3">
                      <div className="w-full space-y-1">
                        <label className="text-[10px] text-slate-400 font-semibold uppercase">Sáng Bắt Đầu</label>
                        <input type="time" className="text-xs p-2 border border-slate-200 rounded-lg w-full font-mono bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={config.operatingHours.morningStart} onChange={e => setConfig({...config, operatingHours: {...config.operatingHours, morningStart: e.target.value}})} />
                      </div>
                      <div className="w-full space-y-1">
                        <label className="text-[10px] text-slate-400 font-semibold uppercase">Sáng Kết Thúc</label>
                        <input type="time" className="text-xs p-2 border border-slate-200 rounded-lg w-full font-mono bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={config.operatingHours.morningEnd} onChange={e => setConfig({...config, operatingHours: {...config.operatingHours, morningEnd: e.target.value}})} />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-full space-y-1">
                        <label className="text-[10px] text-slate-400 font-semibold uppercase">Chiều Bắt Đầu</label>
                        <input type="time" className="text-xs p-2 border border-slate-200 rounded-lg w-full font-mono bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={config.operatingHours.afternoonStart} onChange={e => setConfig({...config, operatingHours: {...config.operatingHours, afternoonStart: e.target.value}})} />
                      </div>
                      <div className="w-full space-y-1">
                        <label className="text-[10px] text-slate-400 font-semibold uppercase">Chiều Kết Thúc</label>
                        <input type="time" className="text-xs p-2 border border-slate-200 rounded-lg w-full font-mono bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={config.operatingHours.afternoonEnd} onChange={e => setConfig({...config, operatingHours: {...config.operatingHours, afternoonEnd: e.target.value}})} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {[
                    { key: 'checkExactTimeYL', label: 'Bác sĩ: Trùng khớp giờ Y Lệnh' },
                    { key: 'checkExactTimeTH', label: 'Nhân viên: Trùng khớp giờ Thực hiện' },
                    { key: 'checkExactTimeKQ', label: 'Nhân viên: Trùng khớp giờ Kết quả' },
                    { key: 'checkStaffOverlap', label: 'Nhân viên: Chồng chéo thời gian TH-KQ' },
                    { key: 'checkPatientOverlap', label: 'Bệnh nhân: Chồng chéo (Trừ XN 21,22,23)' },
                    { key: 'checkMachine', label: 'Máy TTB: Sử dụng trùng giờ cho phép' },
                    { key: 'checkTimeLogic', label: 'Logic: Y Lệnh <= Thực hiện <= KQ' },
                    { key: 'checkOperatingHours', label: 'Ngoài giờ: Cảnh báo giờ HC' }
                  ].map((item) => (
                    <label key={item.key} className="flex items-center gap-3 p-2.5 hover:bg-emerald-50/50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-emerald-100 group">
                      <input 
                        type="checkbox" 
                        checked={config[item.key as keyof ValidationConfig] as boolean}
                        onChange={(e) => setConfig({ ...config, [item.key]: e.target.checked })}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-slate-700 font-medium group-hover:text-emerald-800 transition-colors">{item.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-9 space-y-5">
          
          {/* TAB MAIN */}
          {activeTab === 'main' && (
            <div className="flex flex-col h-full gap-5">
              {/* Filter Bar */}
              <div className="bg-white/90 backdrop-blur-md border border-blue-100/50 rounded-2xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center gap-4 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Tìm kiếm theo mã LK, mã DVKT hoặc tên..." 
                    className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all text-sm font-medium text-slate-700"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-emerald-700 font-mono font-bold px-4 border border-emerald-200 rounded-xl h-[42px] bg-emerald-50 shadow-sm">
                  <Filter size={14} className="text-emerald-500" />
                  <span>Rows: {filteredRecords.length}</span>
                </div>
              </div>

              {/* Table Container */}
              <div className="bg-white/90 backdrop-blur-md border border-blue-100/50 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex-1">
                <div className="overflow-x-auto max-h-[calc(100vh-230px)] custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[1200px]">
                    <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10 border-b border-slate-200 shadow-sm">
                      <tr>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">Mã LK</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-64">Dịch vụ (DVKT)</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32 border-l border-slate-200/60 bg-slate-100/30">TG Y Lệnh</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32 bg-slate-100/30">TG Thực hiện</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32 bg-slate-100/30">TG Kết quả</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32 border-l border-slate-200/60">Nhân sự</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">Máy</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-[350px]">Cảnh báo & Lỗi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-6 py-32 text-center">
                            <div className="flex flex-col items-center gap-4 text-slate-400">
                              <div className="bg-slate-50 p-6 rounded-full">
                                <FileSpreadsheet size={48} className="text-slate-300" />
                              </div>
                              <p className="text-sm font-medium">Chưa có dữ liệu đối chiếu. Vui lòng nhập file Excel Dữ liệu đầu vào.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredRecords.map((rec) => {
                          const recErrors = errors.filter(e => e.recordId === rec.id);
                          const isHeavy = recErrors.some(e => e.Loai === 'heavy');
                          const isWarning = recErrors.some(e => e.Loai === 'warning');

                          return (
                            <tr 
                              key={rec.id} 
                              className={cn(
                                "group hover:bg-slate-50/80 transition-colors",
                                isHeavy ? "bg-red-50/40 hover:bg-red-50/60" : isWarning ? "bg-amber-50/40 hover:bg-amber-50/60" : ""
                              )}
                            >
                              <td className="px-5 py-4 align-top">
                                <div className="font-mono text-xs text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded w-fit">{rec.MA_LK}</div>
                              </td>
                              <td className="px-5 py-4 align-top">
                                <div className="font-semibold text-sm line-clamp-2 text-slate-800 leading-snug" title={rec.TEN_DICH_VU}>{rec.TEN_DICH_VU}</div>
                                <div className="text-[10px] text-slate-400 font-mono mt-1.5">{rec.MA_DICH_VU}</div>
                              </td>
                              
                              <td className="px-5 py-4 align-top font-mono text-xs text-slate-600 border-l border-slate-100">{formatDate(rec.NGAY_YL) || '—'}</td>
                              <td className="px-5 py-4 align-top font-mono text-xs text-emerald-700 font-bold">{formatDate(rec.NGAY_TH_YL) || '—'}</td>
                              <td className="px-5 py-4 align-top font-mono text-xs text-slate-600">{formatDate(rec.NGAY_KQ) || '—'}</td>
                              
                              <td className="px-5 py-4 align-top border-l border-slate-100">
                                <div className="text-xs text-slate-700 font-medium mb-1.5"><span className="text-slate-400 text-[10px] uppercase font-bold mr-1">TH:</span> {rec.NGUOI_THUC_HIEN || '—'}</div>
                                <div className="text-xs text-slate-700 font-medium"><span className="text-slate-400 text-[10px] uppercase font-bold mr-1">YL:</span> {rec.MA_BAC_SI || '—'}</div>
                              </td>
                              <td className="px-5 py-4 align-top">
                                <div className={cn(
                                  "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-medium",
                                  rec.MA_MAY ? "bg-slate-100 text-slate-700 border border-slate-200" : "bg-red-50 text-red-600 border border-red-100"
                                )}>
                                  {rec.MA_MAY || 'THIẾU MÃ'}
                                </div>
                              </td>
                              <td className="px-5 py-4 align-top">
                                <div className="space-y-2">
                                  {recErrors.length > 0 ? (
                                    recErrors.map((err) => (
                                      <div 
                                        key={err.id} 
                                        className={cn(
                                          "flex items-start gap-2 text-xs px-3 py-2 rounded-lg border",
                                          err.Loai === 'heavy' ? "bg-red-50 text-red-800 border-red-100 shadow-sm" : "bg-amber-50 text-amber-800 border-amber-100 shadow-sm"
                                        )}
                                      >
                                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                        <span className="leading-snug font-medium">{err.NoiDung}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold px-3 py-2 border border-emerald-100 bg-emerald-50 rounded-lg w-fit shadow-sm">
                                      <CheckCircle2 size={14} />
                                      <span>Dữ liệu hợp lệ</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB STAFF */}
          {activeTab === 'staff' && (
            <div className="bg-white/90 backdrop-blur-md border border-blue-100/50 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-full flex flex-col">
              <div className="flex justify-between items-center mb-8 pb-6 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Danh mục Nhân viên (Bảng 2)</h2>
                  <p className="text-sm text-slate-500 mt-2 font-medium">Tải lên danh sách nhân sự (Yêu cầu cột <span className="font-mono text-emerald-600 bg-emerald-50 px-1 rounded">MACCHN</span> và <span className="font-mono text-emerald-600 bg-emerald-50 px-1 rounded">HO_TEN</span>).</p>
                </div>
                <input type="file" ref={staffInputRef} onChange={handleImportStaff} className="hidden" accept=".xlsx, .xls" />
                <button onClick={() => staffInputRef.current?.click()} className="px-5 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold text-sm transition-all shadow-sm flex items-center gap-2 cursor-pointer">
                  <FileUp size={16}/> Import Bảng 2
                </button>
              </div>
              <div className="border border-slate-200 rounded-2xl overflow-hidden flex-1 min-h-[400px]">
                <div className="overflow-y-auto h-full custom-scrollbar">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-xs w-64">CCHN / Mã NV</th>
                        <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-xs">Họ và tên</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {config.staffCatalog.length === 0 ? (
                        <tr><td colSpan={2} className="px-6 py-16 text-center text-slate-400 font-medium">Chưa có dữ liệu danh mục nhân viên</td></tr>
                      ) : (
                        config.staffCatalog.map((s, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3.5 font-mono text-emerald-700 font-medium bg-emerald-50/30">{s.cchn}</td>
                            <td className="px-6 py-3.5 font-semibold text-slate-700">{s.name}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB SERVICE */}
          {activeTab === 'service' && (
            <div className="bg-white/90 backdrop-blur-md border border-blue-100/50 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-full flex flex-col">
              <div className="flex justify-between items-center mb-8 pb-6 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Danh mục Dịch vụ (Bảng 5)</h2>
                  <p className="text-sm text-slate-500 mt-2 font-medium">Danh mục được chia nhóm theo 2 chữ số đầu mã DVKT. Tích chọn nếu DVKT cho phép NV làm song song DV khác.</p>
                </div>
                <input type="file" ref={serviceInputRef} onChange={handleImportService} className="hidden" accept=".xlsx, .xls" />
                <button onClick={() => serviceInputRef.current?.click()} className="px-5 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold text-sm transition-all shadow-sm flex items-center gap-2 cursor-pointer">
                  <FileUp size={16}/> Import Bảng 5
                </button>
              </div>
              
              <div className="border border-slate-200 rounded-2xl overflow-hidden flex-1 min-h-[400px]">
                <div className="overflow-y-auto h-full custom-scrollbar">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-xs w-48">Mã Dịch vụ</th>
                        <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-xs">Tên Dịch vụ</th>
                        <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-xs text-center w-64" title="Cho phép NV làm DV khác trong lúc thực hiện DV này">NV được chồng chéo giờ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {groupedServices.length === 0 ? (
                        <tr><td colSpan={3} className="px-6 py-16 text-center text-slate-400 font-medium">Chưa có dữ liệu danh mục dịch vụ</td></tr>
                      ) : (
                        groupedServices.map(([groupCode, services]) => (
                          <React.Fragment key={groupCode}>
                            <tr className="bg-emerald-600 sticky top-[49px] z-[5] shadow-sm">
                              <td colSpan={3} className="px-6 py-2.5 font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                                <span className="bg-white/20 px-2 py-0.5 rounded shadow-inner">Nhóm {groupCode}</span>
                                <span>— {services.length} Dịch vụ</span>
                              </td>
                            </tr>
                            {services.map((s, i) => (
                              <tr key={`${groupCode}-${i}`} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-3.5 font-mono text-slate-500 text-xs">{s.code}</td>
                                <td className="px-6 py-3.5 font-medium text-slate-800 leading-relaxed">{s.name}</td>
                                <td className="px-6 py-3.5 text-center bg-slate-50/50 border-l border-slate-100">
                                  <label className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-emerald-50 cursor-pointer transition-colors group">
                                    <input 
                                      type="checkbox" 
                                      checked={s.allowStaffOverlap} 
                                      onChange={(e) => {
                                        const newCat = [...config.serviceCatalog];
                                        const itemIdx = newCat.findIndex(x => x.code === s.code);
                                        if(itemIdx > -1) {
                                          newCat[itemIdx].allowStaffOverlap = e.target.checked;
                                          setConfig({...config, serviceCatalog: newCat});
                                        }
                                      }}
                                      className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer transition-all group-hover:border-emerald-400"
                                    />
                                  </label>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB MACHINE */}
          {activeTab === 'machine' && (
            <div className="bg-white/90 backdrop-blur-md border border-blue-100/50 rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-full flex flex-col">
              <div className="flex justify-between items-center mb-8 pb-6 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Danh mục Máy / TTB (Bảng 6)</h2>
                  <p className="text-sm text-slate-500 mt-2 font-medium">Thiết lập các thiết bị cho phép dùng trùng lặp (ví dụ 1 máy chiếu chụp cho nhiều BN cùng lúc).</p>
                </div>
                <input type="file" ref={machineInputRef} onChange={handleImportMachine} className="hidden" accept=".xlsx, .xls" />
                <button onClick={() => machineInputRef.current?.click()} className="px-5 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold text-sm transition-all shadow-sm flex items-center gap-2 cursor-pointer">
                  <FileUp size={16}/> Import Bảng 6
                </button>
              </div>
              <div className="border border-slate-200 rounded-2xl overflow-hidden flex-1 min-h-[400px]">
                <div className="overflow-y-auto h-full custom-scrollbar">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 sticky top-0 shadow-sm z-10 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-xs w-48">Mã Máy</th>
                        <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-xs">Tên Máy</th>
                        <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-xs text-center w-64">Được phép trùng nhiều BN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {config.machineCatalog.length === 0 ? (
                        <tr><td colSpan={3} className="px-6 py-16 text-center text-slate-400 font-medium">Chưa có dữ liệu danh mục máy</td></tr>
                      ) : (
                        config.machineCatalog.map((m, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3.5 font-mono text-slate-500 text-xs">{m.code}</td>
                            <td className="px-6 py-3.5 font-medium text-slate-800">{m.name}</td>
                            <td className="px-6 py-3.5 text-center bg-slate-50/50 border-l border-slate-100">
                              <label className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-emerald-50 cursor-pointer transition-colors group">
                                <input 
                                  type="checkbox" 
                                  checked={m.allowOverlap} 
                                  onChange={(e) => {
                                    const newCat = [...config.machineCatalog];
                                    newCat[i].allowOverlap = e.target.checked;
                                    setConfig({...config, machineCatalog: newCat});
                                  }}
                                  className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer transition-all group-hover:border-emerald-400"
                                />
                              </label>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
}
