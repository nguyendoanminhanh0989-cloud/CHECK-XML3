import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2, Download, Trash2, Settings2,
  Search, Filter, ShieldCheck, Database, Users, Activity, Server, Play, Lock, LogOut, Loader2, Cloud
} from 'lucide-react';
import { DVKTRecord, ErrorLog, ValidationConfig, Staff, Machine, ServiceCatalog } from './types';
import { validateRecords } from './validator';
import { cn, formatDate } from './lib/utils';
import { supabase } from './lib/supabase';

const defaultConfig: ValidationConfig = {
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
};

export default function App() {
  // Auth State
  const [clinicCode, setClinicCode] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'loading' | 'auth' | 'unauth'>('loading');
  const [inputCode, setInputCode] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // App State
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

  const [config, setConfig] = useState<ValidationConfig>(() => {
    try {
      const saved = localStorage.getItem('check_xml_config_v3');
      if (saved) return JSON.parse(saved);
    } catch (e) { console.error(e); }
    return defaultConfig;
  });

  // INITIAL LOAD
  useEffect(() => {
    const code = localStorage.getItem('clinic_code');
    if (code) {
      checkClinicAuth(code);
    } else {
      setAuthStatus('unauth');
    }
  }, []);

  const checkClinicAuth = async (code: string) => {
    setAuthStatus('loading');
    setAuthMessage('');
    try {
      if (code === 'GUEST') {
        setClinicCode('GUEST');
        setAuthStatus('auth');
        return;
      }
      
      const { data, error } = await supabase.from('clinics').select('status, config').eq('id', code).single();
      
      if (error && error.code === 'PGRST116') {
        // Not found => Tự động tạo kho dữ liệu mới cho mã này
        const { error: insertErr } = await supabase.from('clinics').insert([{ id: code, status: 'approved', config: defaultConfig }]);
        if (insertErr) {
          setAuthMessage('Chưa có bảng "clinics" trên Supabase. Vui lòng chạy lệnh SQL tạo bảng trước!');
          setAuthStatus('unauth');
          return;
        }
        setClinicCode(code);
        localStorage.setItem('clinic_code', code);
        setConfig(defaultConfig);
        localStorage.setItem('check_xml_config_v3', JSON.stringify(defaultConfig));
        setAuthStatus('auth');
      } else {
        // Đã tồn tại => Tải cấu hình và vào thẳng
        setClinicCode(code);
        localStorage.setItem('clinic_code', code);
        if (data?.config) {
           setConfig(data.config);
           localStorage.setItem('check_xml_config_v3', JSON.stringify(data.config));
        }
        setAuthStatus('auth');
      }
    } catch (err: any) {
      console.error(err);
      setAuthMessage('Lỗi kết nối máy chủ Supabase. Vui lòng thử lại.');
      setAuthStatus('unauth');
    }
  };

  const handleLogin = () => {
    if (!inputCode.trim()) return;
    checkClinicAuth(inputCode.trim().toUpperCase());
  };

  const handleGuest = () => {
    setClinicCode('GUEST');
    localStorage.setItem('clinic_code', 'GUEST');
    setAuthStatus('auth');
  };

  const handleLogout = () => {
    setClinicCode(null);
    localStorage.removeItem('clinic_code');
    setAuthStatus('unauth');
  };

  // SYNC CONFIG TO CLOUD
  const updateConfig = async (newConfig: ValidationConfig) => {
    setConfig(newConfig);
    localStorage.setItem('check_xml_config_v3', JSON.stringify(newConfig));
    if (clinicCode && clinicCode !== 'GUEST') {
      setIsSyncing(true);
      await supabase.from('clinics').update({ config: newConfig }).eq('id', clinicCode);
      setTimeout(() => setIsSyncing(false), 500); // UI feedback
    }
  };

  // PARSERS
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
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const catalog = data.map((r: any) => ({
        cchn: String(getCol(r, ['MACCHN', 'CCHN', 'MaNV', 'Mã NV', 'MA_NV'])),
        name: String(getCol(r, ['HO_TEN', 'TEN_NV', 'TenNV', 'Tên NV', 'HoTen', 'Họ tên']))
      })).filter(x => x.cchn && x.cchn !== 'undefined');
      updateConfig({ ...config, staffCatalog: catalog });
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
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const catalog = data.map((r: any) => ({
        code: String(getCol(r, ['MA_MAY', 'Mã máy', 'MaMay'])),
        name: String(getCol(r, ['TEN_TB', 'TEN_MAY', 'Tên máy', 'TenMay'])),
        allowOverlap: Boolean(getCol(r, ['CHO_PHEP_TRUNG', 'ChoPhepTrung', 'AllowOverlap']))
      })).filter(x => x.code && x.code !== 'undefined');
      updateConfig({ ...config, machineCatalog: catalog });
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
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const catalog = data.map((r: any) => ({
        code: String(getCol(r, ['MA_DICH_VU', 'MA_DVKT', 'Mã DV', 'MaDVKT'])),
        name: String(getCol(r, ['TEN_DICH_VU', 'TEN_DVKT', 'Tên DVKT'])),
        allowStaffOverlap: Boolean(getCol(r, ['CHO_PHEP_NV_TRUNG', 'ChoPhepTrung', 'AllowStaffOverlap']))
      })).filter(x => x.code && x.code !== 'undefined');
      updateConfig({ ...config, serviceCatalog: catalog });
    };
    reader.readAsBinaryString(file);
    if (serviceInputRef.current) serviceInputRef.current.value = '';
  };

  const handleValidate = () => {
    setIsValidating(true);
    setTimeout(() => {
      setErrors(validateRecords(records, config));
      setIsValidating(false);
    }, 400);
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataWithStatus), "Kết quả Đối Chiếu");
    const wsErrors = XLSX.utils.json_to_sheet(errors.map(e => ({
      'Mã LK': e.MA_LK, 'Mã DV': e.MA_DICH_VU, 'Nội dung lỗi': e.NoiDung, 'Loại': e.Loai === 'heavy' ? 'Lỗi nặng' : 'Cảnh báo'
    })));
    XLSX.utils.book_append_sheet(wb, wsErrors, "Chi Tiết Lỗi");
    XLSX.writeFile(wb, `Ket_Qua_Kiem_Tra_${new Date().getTime()}.xlsx`);
  };

  const filteredRecords = useMemo(() => {
    if (!searchTerm) return records;
    const s = searchTerm.toLowerCase();
    return records.filter(r => 
      r.MA_LK.toLowerCase().includes(s) || r.MA_DICH_VU.toLowerCase().includes(s) || r.TEN_DICH_VU.toLowerCase().includes(s)
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

  const NavButton = ({ id, icon: Icon, label }: { id: any, icon: any, label: string }) => (
    <button 
      onClick={() => setActiveTab(id)} 
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all font-semibold w-full text-left shadow-sm border", 
        activeTab === id 
          ? "bg-gradient-to-r from-emerald-500 to-green-500 text-white border-transparent shadow-[0_4px_12px_rgba(16,185,129,0.3)]" 
          : "bg-white text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 border-slate-100"
      )}
    >
      <Icon size={18} className={activeTab === id ? "text-white" : "text-emerald-600"} />
      {label}
    </button>
  );

  // AUTH SCREEN
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#f1f6f4] flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500 mb-4" size={48} />
        <h2 className="text-xl font-bold text-slate-700">Đang kết nối Máy chủ Đám mây...</h2>
      </div>
    );
  }

  if (authStatus === 'unauth') {
    return (
      <div className="min-h-screen bg-[#f1f6f4] flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full p-8 rounded-3xl shadow-xl border border-emerald-100/50">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-gradient-to-br from-emerald-400 to-green-600 p-4 rounded-2xl shadow-lg text-white mb-4">
              <ShieldCheck size={40} />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">CHECK-XML3-ANHIT</h1>
            <p className="text-sm font-medium text-slate-500 mt-2 text-center">Mỗi Mã đăng ký là một Không gian dữ liệu riêng biệt</p>
          </div>

          {authMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-800 text-center flex flex-col gap-2">
              <AlertTriangle className="mx-auto text-red-500" size={24} />
              {authMessage}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nhập Mã Cơ Sở (KCB)</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Ví dụ: 48225, 49917..."
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono font-bold tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all uppercase"
                />
              </div>
            </div>

            <button 
              onClick={handleLogin}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2"
            >
              <Cloud size={18} /> Đăng Nhập / Đăng Ký Cloud
            </button>
            
            <div className="relative py-4 flex items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-medium uppercase tracking-wider">Hoặc</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button 
              onClick={handleGuest}
              className="w-full py-3 bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-600 hover:text-slate-800 rounded-xl font-bold transition-all"
            >
              Dùng Chế độ Khách (Không có Data Danh Mục)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MAIN APP SCREEN
  return (
    <div className="min-h-screen bg-[#f1f6f4] text-slate-800 font-sans selection:bg-emerald-200 selection:text-emerald-900 pb-12">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-emerald-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-emerald-400 to-green-600 p-2 rounded-xl shadow-md text-white relative">
            <ShieldCheck size={24} />
            {isSyncing && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>}
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-slate-800 leading-none">CHECK-XML3-ANHIT</h1>
            <p className="text-[11px] font-bold text-emerald-600 tracking-wider mt-1 uppercase flex items-center gap-1.5">
              NGUYỄN ĐOÀN MINH ÁNH - IT Y TẾ - ĐÀ NẴNG
              {clinicCode !== 'GUEST' && <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded flex items-center gap-1"><Cloud size={10} /> ĐÃ KẾT NỐI: {clinicCode}</span>}
              {clinicCode === 'GUEST' && <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">CHẾ ĐỘ KHÁCH</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx, .xls, .csv" multiple />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-emerald-500 hover:bg-emerald-50 text-emerald-700 rounded-xl transition-all text-sm font-bold shadow-sm"
          >
            <UploadCloud size={18} />
            <span>Tải Lên File Excel</span>
          </button>
          
          <button 
            onClick={handleValidate}
            disabled={records.length === 0 || isValidating}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl transition-all text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(16,185,129,0.3)]"
          >
            {isValidating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play size={16} className="fill-current" />}
            <span>Thực Hiện Đối Chiếu</span>
          </button>

          <div className="w-px h-6 bg-slate-200 mx-2"></div>

          <button 
            onClick={handleExport}
            disabled={records.length === 0}
            className="flex items-center justify-center p-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white rounded-xl transition-all disabled:opacity-50 shadow-md"
            title="Xuất File Báo Cáo"
          >
            <Download size={18} />
          </button>

          <button 
            onClick={() => { setRecords([]); setErrors([]); }}
            className="flex items-center justify-center p-2.5 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors border border-transparent hover:border-red-100"
            title="Xóa Tất Cả Dữ Liệu"
          >
            <Trash2 size={18} />
          </button>

          <button 
            onClick={handleLogout}
            className="flex items-center justify-center p-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-xl transition-colors ml-2"
            title="Đăng Xuất Khỏi Tài Khoản Phòng Khám"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 mt-2">
        <div className="lg:col-span-3 space-y-6">
          <div className="space-y-2 bg-white p-3 rounded-2xl shadow-sm border border-emerald-100/50">
            <NavButton id="main" icon={Database} label="Dữ Liệu & Đối Chiếu" />
            <NavButton id="staff" icon={Users} label="Danh Mục Nhân Viên" />
            <NavButton id="service" icon={Activity} label="Danh Mục DVKT (Bảng 5)" />
            <NavButton id="machine" icon={Server} label="Danh Mục TTB (Bảng 6)" />
          </div>

          {activeTab === 'main' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1">Tổng Quan Dữ Liệu</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white border-l-4 border-emerald-500 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-slate-500 text-xs font-semibold mb-1 uppercase tracking-wide">Số Bản Ghi</p>
                    <p className="text-2xl font-black text-slate-800">{records.length}</p>
                  </div>
                  <div className="bg-white border-l-4 border-red-500 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-slate-500 text-xs font-semibold mb-1 uppercase tracking-wide">Lỗi Phát Hiện</p>
                    <p className={cn("text-2xl font-black", errors.length > 0 ? "text-red-600" : "text-slate-800")}>{errors.length}</p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 pl-1">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cấu Hình Ràng Buộc</h3>
                  <button onClick={() => setShowConfig(!showConfig)} className="text-emerald-500 hover:text-emerald-600 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-lg transition-colors">
                    <Settings2 size={16} />
                  </button>
                </div>
                
                {showConfig && (
                  <div className="mb-4 p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-3 shadow-inner">
                    <h4 className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Cài Đặt Giờ Hành Chính (Lưu Trên Cloud)</h4>
                    <div className="flex gap-3">
                      <div className="w-full space-y-1">
                        <label className="text-[10px] text-emerald-600 font-bold uppercase">Sáng Bắt Đầu</label>
                        <input type="time" className="text-xs p-2 border border-emerald-200 rounded-lg w-full font-mono focus:ring-2 focus:ring-emerald-400 outline-none" value={config.operatingHours.morningStart} onChange={e => updateConfig({...config, operatingHours: {...config.operatingHours, morningStart: e.target.value}})} />
                      </div>
                      <div className="w-full space-y-1">
                        <label className="text-[10px] text-emerald-600 font-bold uppercase">Sáng Kết Thúc</label>
                        <input type="time" className="text-xs p-2 border border-emerald-200 rounded-lg w-full font-mono focus:ring-2 focus:ring-emerald-400 outline-none" value={config.operatingHours.morningEnd} onChange={e => updateConfig({...config, operatingHours: {...config.operatingHours, morningEnd: e.target.value}})} />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-full space-y-1">
                        <label className="text-[10px] text-emerald-600 font-bold uppercase">Chiều Bắt Đầu</label>
                        <input type="time" className="text-xs p-2 border border-emerald-200 rounded-lg w-full font-mono focus:ring-2 focus:ring-emerald-400 outline-none" value={config.operatingHours.afternoonStart} onChange={e => updateConfig({...config, operatingHours: {...config.operatingHours, afternoonStart: e.target.value}})} />
                      </div>
                      <div className="w-full space-y-1">
                        <label className="text-[10px] text-emerald-600 font-bold uppercase">Chiều Kết Thúc</label>
                        <input type="time" className="text-xs p-2 border border-emerald-200 rounded-lg w-full font-mono focus:ring-2 focus:ring-emerald-400 outline-none" value={config.operatingHours.afternoonEnd} onChange={e => updateConfig({...config, operatingHours: {...config.operatingHours, afternoonEnd: e.target.value}})} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white border border-emerald-100/80 rounded-2xl shadow-sm p-3 space-y-1">
                  {[
                    { key: 'checkExactTimeYL', label: 'Bác sĩ: Trùng khớp giờ Y Lệnh (100%)' },
                    { key: 'checkExactTimeTH', label: 'Nhân viên: Trùng khớp giờ TH (100%)' },
                    { key: 'checkExactTimeKQ', label: 'Nhân viên: Trùng khớp giờ KQ (100%)' },
                    { key: 'checkStaffOverlap', label: 'Nhân viên: Chồng chéo ca làm' },
                    { key: 'checkPatientOverlap', label: 'Bệnh nhân: Chồng chéo thời gian (Trừ XN)' },
                    { key: 'checkMachine', label: 'Máy móc: Chồng chéo thiết bị' },
                    { key: 'checkTimeLogic', label: 'Logic: Y Lệnh ≤ TH ≤ KQ' },
                    { key: 'checkOperatingHours', label: 'Giờ HC: Cảnh báo làm ngoài giờ' }
                  ].map((item) => (
                    <label key={item.key} className="flex items-center gap-3 p-2.5 hover:bg-emerald-50/50 rounded-xl cursor-pointer transition-all group border border-transparent hover:border-emerald-100">
                      <div className="relative flex items-center">
                        <input 
                          type="checkbox" 
                          checked={config[item.key as keyof ValidationConfig] as boolean}
                          onChange={(e) => updateConfig({ ...config, [item.key]: e.target.checked })}
                          className="peer sr-only"
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-emerald-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                      </div>
                      <span className="text-sm text-slate-700 font-medium group-hover:text-emerald-800">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-9">
          
          {activeTab === 'main' && (
            <div className="flex flex-col gap-4">
              <div className="bg-white border border-emerald-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Tìm kiếm theo mã Lượt Khám, mã DVKT hoặc Tên Dịch Vụ..." 
                    className="w-full pl-12 pr-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 transition-all text-sm font-medium text-slate-700 placeholder:text-slate-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-emerald-700 font-bold px-5 py-2.5 border border-emerald-200 rounded-xl bg-emerald-50 shadow-sm whitespace-nowrap">
                  <Filter size={16} className="text-emerald-500" />
                  <span>{filteredRecords.length} Bản Ghi</span>
                </div>
              </div>

              <div className="bg-white border border-emerald-100/80 rounded-2xl shadow-sm overflow-hidden w-full">
                <div className="overflow-x-hidden max-h-[calc(100vh-220px)] custom-scrollbar">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10 border-b border-emerald-100 shadow-sm">
                      <tr>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[14%]">Mã LK</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[18%]">Dịch Vụ</th>
                        <th className="px-2 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[8%] bg-slate-100/30 text-center">Y Lệnh</th>
                        <th className="px-2 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider w-[8%] bg-emerald-50/50 border-x border-emerald-100/50 text-center">Thực Hiện</th>
                        <th className="px-2 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[8%] bg-slate-100/30 text-center">Kết Quả</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[12%]">Nhân Sự</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[12%]">Thiết Bị</th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-[20%]">Lỗi / Cảnh Báo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-6 py-28 text-center">
                            <div className="flex flex-col items-center gap-4 text-slate-400">
                              <div className="bg-slate-50 p-6 rounded-full border border-slate-100">
                                <FileSpreadsheet size={48} className="text-emerald-300" />
                              </div>
                              <p className="text-sm font-medium text-slate-500">Chưa có dữ liệu. Vui lòng Tải file đầu vào để bắt đầu đối chiếu.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredRecords.map((rec) => {
                          const recErrors = errors.filter(e => e.recordId === rec.id);
                          const isHeavy = recErrors.some(e => e.Loai === 'heavy');
                          const isWarning = recErrors.some(e => e.Loai === 'warning');

                          return (
                            <tr key={rec.id} className={cn("hover:bg-slate-50/60 transition-colors", isHeavy ? "bg-red-50/30" : isWarning ? "bg-amber-50/20" : "")}>
                              <td className="px-3 py-3 align-top">
                                <div className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1.5 rounded-md border border-emerald-100/50 break-all leading-relaxed shadow-sm">{rec.MA_LK}</div>
                              </td>
                              <td className="px-3 py-3 align-top">
                                <div className="text-[12px] font-semibold text-slate-800 leading-snug mb-1.5 line-clamp-3" title={rec.TEN_DICH_VU}>{rec.TEN_DICH_VU}</div>
                                <div className="text-[10px] font-mono font-medium text-slate-500 bg-slate-50 px-1 py-0.5 rounded border border-slate-100 inline-block">{rec.MA_DICH_VU}</div>
                              </td>
                              
                              <td className="px-2 py-3 align-top font-mono text-[10px] text-slate-600 text-center">{formatDate(rec.NGAY_YL) || '—'}</td>
                              <td className="px-2 py-3 align-top font-mono text-[10px] text-emerald-800 font-bold bg-emerald-50/30 border-x border-emerald-50/50 text-center">{formatDate(rec.NGAY_TH_YL) || '—'}</td>
                              <td className="px-2 py-3 align-top font-mono text-[10px] text-slate-600 text-center">{formatDate(rec.NGAY_KQ) || '—'}</td>
                              
                              <td className="px-3 py-3 align-top">
                                <div className="text-[11px] font-medium text-slate-800 mb-1.5 flex flex-col"><span className="text-[9px] font-bold text-emerald-600 w-fit bg-emerald-50 px-1 rounded mb-0.5">TH:</span><span className="break-all">{rec.NGUOI_THUC_HIEN || '—'}</span></div>
                                <div className="text-[11px] font-medium text-slate-800 flex flex-col"><span className="text-[9px] font-bold text-blue-500 w-fit bg-blue-50 px-1 rounded mb-0.5">YL:</span><span className="break-all">{rec.MA_BAC_SI || '—'}</span></div>
                              </td>
                              <td className="px-3 py-3 align-top">
                                <div className={cn(
                                  "text-[10px] font-mono font-bold px-1.5 py-1 rounded border break-all",
                                  rec.MA_MAY ? "text-slate-600 bg-slate-100/80 border-slate-200" : "text-red-500 bg-red-50 border-red-100 inline-block"
                                )}>
                                  {rec.MA_MAY || 'THIẾU'}
                                </div>
                              </td>
                              <td className="px-3 py-3 align-top">
                                <div className="space-y-1.5">
                                  {recErrors.length > 0 ? (
                                    recErrors.map((err) => (
                                      <div key={err.id} className={cn("flex items-start gap-1.5 text-[11px] font-medium p-2 rounded border", err.Loai === 'heavy' ? "text-red-700 bg-red-50 border-red-100" : "text-amber-800 bg-amber-50 border-amber-100")}>
                                        <AlertTriangle size={12} className="shrink-0 mt-[2px]" />
                                        <span className="leading-snug">{err.NoiDung}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1.5 rounded w-fit">
                                      <CheckCircle2 size={12} />
                                      <span>Hợp Lệ</span>
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

          {activeTab === 'staff' && (
            <div className="bg-white border border-emerald-100 rounded-2xl shadow-sm p-8 h-full flex flex-col">
              <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Users className="text-emerald-500"/> Danh Mục Nhân Viên (Bảng 2)</h2>
                  <p className="text-sm text-slate-500 mt-2 font-medium">Tải lên file danh sách nhân sự. Sẽ được đồng bộ lên máy chủ Cloud theo mã phòng khám của bạn.</p>
                </div>
                <input type="file" ref={staffInputRef} onChange={handleImportStaff} className="hidden" accept=".xlsx, .xls" />
                <button disabled={clinicCode === 'GUEST'} onClick={() => staffInputRef.current?.click()} className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-sm transition-all shadow-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  <UploadCloud size={16}/> Tải Danh Mục
                </button>
              </div>
              {clinicCode === 'GUEST' && <div className="bg-amber-50 p-3 rounded-lg text-amber-700 text-sm mb-4">Bạn đang dùng chế độ Khách. Tính năng tải lên Danh mục đã bị khóa.</div>}
              <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 shadow-sm">
                <div className="overflow-y-auto h-full custom-scrollbar max-h-[500px]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10">
                      <tr>
                        <th className="px-6 py-4 font-bold text-slate-500 text-xs w-64 uppercase tracking-wider">Mã NV / CCHN</th>
                        <th className="px-6 py-4 font-bold text-slate-500 text-xs uppercase tracking-wider">Họ và Tên Nhân Sự</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {config.staffCatalog.length === 0 ? (
                        <tr><td colSpan={2} className="px-6 py-16 text-center text-slate-400 font-medium text-sm">Chưa có dữ liệu. Vui lòng tải file để hiển thị.</td></tr>
                      ) : (
                        config.staffCatalog.map((s, i) => (
                          <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-3 font-mono font-bold text-emerald-700 text-xs">{s.cchn}</td>
                            <td className="px-6 py-3 text-slate-800 font-medium text-sm">{s.name}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'service' && (
            <div className="bg-white border border-emerald-100 rounded-2xl shadow-sm p-8 h-full flex flex-col">
              <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Activity className="text-emerald-500"/> Danh Mục DVKT (Bảng 5)</h2>
                  <p className="text-sm text-slate-500 mt-2 font-medium">Sẽ được đồng bộ lên máy chủ Cloud. Bạn có thể bật tắt Cho Phép Làm Chồng Chéo Giờ ở đây.</p>
                </div>
                <input type="file" ref={serviceInputRef} onChange={handleImportService} className="hidden" accept=".xlsx, .xls" />
                <button disabled={clinicCode === 'GUEST'} onClick={() => serviceInputRef.current?.click()} className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-sm transition-all shadow-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  <UploadCloud size={16}/> Tải Bảng 5
                </button>
              </div>
              {clinicCode === 'GUEST' && <div className="bg-amber-50 p-3 rounded-lg text-amber-700 text-sm mb-4">Bạn đang dùng chế độ Khách. Tính năng tải lên Danh mục đã bị khóa.</div>}
              <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 shadow-sm">
                <div className="overflow-y-auto h-full custom-scrollbar max-h-[500px]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10">
                      <tr>
                        <th className="px-6 py-4 font-bold text-slate-500 text-xs w-48 uppercase tracking-wider">Mã Dịch Vụ</th>
                        <th className="px-6 py-4 font-bold text-slate-500 text-xs uppercase tracking-wider">Tên Dịch Vụ</th>
                        <th className="px-6 py-4 font-bold text-emerald-600 text-xs text-center w-64 uppercase tracking-wider bg-emerald-50/50">Cho Phép NV Làm Chồng Chéo Giờ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {groupedServices.length === 0 ? (
                        <tr><td colSpan={3} className="px-6 py-16 text-center text-slate-400 font-medium text-sm">Chưa có dữ liệu Bảng 5.</td></tr>
                      ) : (
                        groupedServices.map(([groupCode, services]) => (
                          <React.Fragment key={groupCode}>
                            <tr className="bg-slate-800 border-y border-slate-900 sticky top-[48px] z-[5]">
                              <td colSpan={3} className="px-6 py-2 text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-3">
                                <span className="bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded">NHÓM {groupCode}</span>
                                <span className="text-slate-400">({services.length} Dịch Vụ)</span>
                              </td>
                            </tr>
                            {services.map((s, i) => (
                              <tr key={`${groupCode}-${i}`} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-6 py-3 font-mono text-slate-500 text-xs">{s.code}</td>
                                <td className="px-6 py-3 text-slate-800 font-medium text-sm">{s.name}</td>
                                <td className="px-6 py-3 text-center flex justify-center bg-emerald-50/20 border-l border-emerald-50">
                                  <label className="relative flex items-center cursor-pointer">
                                    <input 
                                      type="checkbox" 
                                      disabled={clinicCode === 'GUEST'}
                                      checked={s.allowStaffOverlap} 
                                      onChange={(e) => {
                                        const newCat = [...config.serviceCatalog];
                                        const itemIdx = newCat.findIndex(x => x.code === s.code);
                                        if(itemIdx > -1) {
                                          newCat[itemIdx].allowStaffOverlap = e.target.checked;
                                          updateConfig({...config, serviceCatalog: newCat});
                                        }
                                      }}
                                      className="sr-only peer disabled:cursor-not-allowed"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
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

          {activeTab === 'machine' && (
            <div className="bg-white border border-emerald-100 rounded-2xl shadow-sm p-8 h-full flex flex-col">
              <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Server className="text-emerald-500"/> Danh Mục Thiết Bị (Bảng 6)</h2>
                  <p className="text-sm text-slate-500 mt-2 font-medium">Bật cấu hình này nếu Thiết bị đó cho phép nhiều bệnh nhân sử dụng cùng lúc.</p>
                </div>
                <input type="file" ref={machineInputRef} onChange={handleImportMachine} className="hidden" accept=".xlsx, .xls" />
                <button disabled={clinicCode === 'GUEST'} onClick={() => machineInputRef.current?.click()} className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-sm transition-all shadow-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  <UploadCloud size={16}/> Tải Bảng 6
                </button>
              </div>
              {clinicCode === 'GUEST' && <div className="bg-amber-50 p-3 rounded-lg text-amber-700 text-sm mb-4">Bạn đang dùng chế độ Khách. Tính năng tải lên Danh mục đã bị khóa.</div>}
              <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 shadow-sm">
                <div className="overflow-y-auto h-full custom-scrollbar max-h-[500px]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10">
                      <tr>
                        <th className="px-6 py-4 font-bold text-slate-500 text-xs w-48 uppercase tracking-wider">Mã Thiết Bị</th>
                        <th className="px-6 py-4 font-bold text-slate-500 text-xs uppercase tracking-wider">Tên Thiết Bị / Máy Móc</th>
                        <th className="px-6 py-4 font-bold text-emerald-600 text-xs text-center w-64 uppercase tracking-wider bg-emerald-50/50">Cho Phép Nhiều BN Chồng Chéo Giờ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {config.machineCatalog.length === 0 ? (
                        <tr><td colSpan={3} className="px-6 py-16 text-center text-slate-400 font-medium text-sm">Chưa có dữ liệu Bảng 6.</td></tr>
                      ) : (
                        config.machineCatalog.map((m, i) => (
                          <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-3 font-mono text-slate-500 text-xs">{m.code}</td>
                            <td className="px-6 py-3 text-slate-800 font-medium text-sm">{m.name}</td>
                            <td className="px-6 py-3 text-center flex justify-center bg-emerald-50/20 border-l border-emerald-50">
                              <label className="relative flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  disabled={clinicCode === 'GUEST'}
                                  checked={m.allowOverlap} 
                                  onChange={(e) => {
                                    const newCat = [...config.machineCatalog];
                                    newCat[i].allowOverlap = e.target.checked;
                                    updateConfig({...config, machineCatalog: newCat});
                                  }}
                                  className="sr-only peer disabled:cursor-not-allowed"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
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
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
}
