import { DVKTRecord, ErrorLog, ValidationConfig, ServiceCatalog, Staff } from './types';

function checkTimeOverlap(start1: Date, end1: Date, start2: Date, end2: Date) {
  return start1.getTime() < end2.getTime() && end1.getTime() > start2.getTime();
}

function checkExactMatch(t1: Date, t2: Date) {
  return t1.getTime() === t2.getTime();
}

function formatTimeOnly(d: Date | null) {
  if (!d) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

// Hiển thị thông tin BN: ưu tiên Họ tên, fallback Mã LK
function fmtBN(rec: DVKTRecord): string {
  if (rec.HO_TEN) return `'${rec.HO_TEN}'`;
  if (rec.MA_LK) return `Mã LK '${rec.MA_LK}'`;
  return '(không xác định)';
}

// Nhóm Xét nghiệm (22, 23, 24) - Tự động được phép trùng/chồng giờ + không cần máy
function isLabService(maDV: string): boolean {
  return maDV.startsWith('22') || maDV.startsWith('23') || maDV.startsWith('24');
}

// Nhóm Chẩn đoán Hình ảnh (18.xxxx) - Chia thành 2 nhóm con: Siêu âm & Chụp
function isImagingService(maDV: string): boolean {
  return maDV.startsWith('18');
}

// Công khám: mã ngắn dạng XX.XX (ví dụ: 02.03) - Không tính là chồng chéo với CĐHA
function isExamService(maDV: string): boolean {
  return /^\d{2}\.\d{2}$/.test(maDV.trim());
}

// Phân loại nhóm con CĐHA dựa trên TÊN dịch vụ
// Nhóm 1: Siêu âm (SA) | Nhóm 2: Chụp (XQ, CT, MRI, Nội soi)
type ImagingGroup = 'SIEU_AM' | 'CHUP' | 'KHAC';
function getImagingGroup(tenDV: string): ImagingGroup {
  const t = tenDV.toLowerCase();
  if (t.includes('siêu âm') || t.includes('sieu am') || t.includes('doppler')) {
    return 'SIEU_AM';
  }
  if (t.includes('chụp') || t.includes('x-quang') || t.includes('xquang') || t.includes('x quang')
    || t.includes('cắt lớp') || t.includes('ct ') || t.includes('ct-') || t.includes('c.t')
    || t.includes('mri') || t.includes('cộng hưởng từ') || t.includes('pet')
    || t.includes('phim') || t.includes('nghiêng') || t.includes('thẳng')) {
    return 'CHUP';
  }
  return 'KHAC';
}

function getImagingGroupLabel(group: ImagingGroup): string {
  switch (group) {
    case 'SIEU_AM': return 'Siêu âm';
    case 'CHUP': return 'Chụp (XQ/CT/MRI)';
    default: return 'CĐHA khác';
  }
}

// So sánh 2 DV hình ảnh có cùng nhóm con không
function isSameImagingGroup(tenDV1: string, tenDV2: string): boolean {
  return getImagingGroup(tenDV1) === getImagingGroup(tenDV2);
}

// =============================================
// Helper tìm kiếm Danh mục DVKT linh hoạt
// So sánh bằng cách chuẩn hóa mã (bỏ dấu chấm, viết hoa)
// VD: "02.03" === "0203", "23.0050.1544" === "2300501544"
// =============================================
function normCode(code: string): string {
  return code.replace(/[.\-\/\s]/g, '').toUpperCase();
}

function findServiceInCatalog(catalog: ServiceCatalog[] | undefined, maDV: string): ServiceCatalog | undefined {
  if (!catalog || catalog.length === 0) return undefined;
  const norm = normCode(maDV);
  return catalog.find(s => normCode(s.code) === norm);
}

// Helper: Kiểm tra DV có được phép chồng chéo KHÁC BN không (dùng cho Staff overlap)
// Chỉ bypass: XN (22,23,24) + DV được tích trong Danh Mục
// KHÔNG bypass nhóm 18 ở đây (nhóm 18 chỉ bypass khi cùng BN)
function isOverlapAllowed(catalog: ServiceCatalog[] | undefined, maDV: string): boolean {
  if (isLabService(maDV)) return true;
  const svc = findServiceInCatalog(catalog, maDV);
  return svc?.allowStaffOverlap === true;
}

// Helper: Kiểm tra DV có cần máy không
function isMachineRequired(catalog: ServiceCatalog[] | undefined, maDV: string): boolean {
  if (isLabService(maDV)) return false; // XN tự động không cần máy
  const svc = findServiceInCatalog(catalog, maDV);
  if (svc?.noMachineRequired) return false;
  return true; // Mặc định cần máy
}

// Chuẩn hóa chuỗi NV để so sánh: bỏ khoảng trắng thừa, uppercase, normalize Unicode
function normStaff(s: string): string {
  return s.normalize('NFC').replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Bỏ chức danh y tế (YS., BS., CN., DD., KTV., ĐD., BSCKI., BSCKII., THS., PGS., GS., TS.) và ký tự thừa (::, ..)
const TITLE_REGEX = /^(YS\.?\s*|BS\.?\s*|BSCKI+\.?\s*|CN\.?\s*|DD\.?\s*|ĐD\.?\s*|KTV\.?\s*|THS\.?\s*|PGS\.?\s*|GS\.?\s*|TS\.?\s*)/i;
function stripTitle(s: string): string {
  return s.replace(TITLE_REGEX, '').replace(/[:;.,]+$/g, '').trim();
}

// Chuẩn hóa cực mạnh: chỉ giữ chữ và số (bỏ /, -, khoảng trắng...)
function normStaffStrict(s: string): string {
  return s.normalize('NFC').replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/g, '').toUpperCase();
}

// Helper: Tìm nhân viên trong danh mục bằng CCHN HOẶC tên
function findStaff(catalog: Staff[] | undefined, value: string): Staff | undefined {
  if (!catalog || catalog.length === 0 || !value) return undefined;
  const v = normStaff(value);
  const vStrict = normStaffStrict(value);
  // Bỏ chức danh rồi so sánh
  const vClean = normStaff(stripTitle(value));
  const vCleanStrict = normStaffStrict(stripTitle(value));

  // Match 1: Exact (chuẩn hóa nhẹ)
  const exact = catalog.find(s => normStaff(s.cchn) === v || normStaff(s.name) === v);
  if (exact) return exact;

  // Match 2: Bỏ chức danh (YS., BS...) rồi so sánh
  if (vClean.length >= 2) {
    const clean = catalog.find(s => normStaff(s.cchn) === vClean || normStaff(s.name) === vClean || normStaff(stripTitle(s.name)) === vClean);
    if (clean) return clean;
  }

  // Match 3: Bỏ hết ký tự đặc biệt
  if (vStrict.length >= 3) {
    const strict = catalog.find(s => normStaffStrict(s.cchn) === vStrict || normStaffStrict(s.name) === vStrict);
    if (strict) return strict;
  }

  // Match 4: Bỏ chức danh + bỏ ký tự đặc biệt
  if (vCleanStrict.length >= 3) {
    const cleanStrict = catalog.find(s => normStaffStrict(s.name) === vCleanStrict || normStaffStrict(stripTitle(s.name)) === vCleanStrict);
    if (cleanStrict) return cleanStrict;
  }

  return undefined;
}

// Helper: Kiểm tra NV có trong danh mục không (bằng CCHN hoặc tên)
function isStaffInCatalog(catalog: Staff[] | undefined, value: string): boolean {
  return !!findStaff(catalog, value);
}

export function validateRecords(records: DVKTRecord[], config: ValidationConfig): ErrorLog[] {
  const errors: ErrorLog[] = [];

  // ============================================
  // 0. Check Thiếu Mã Máy
  // ============================================
  records.forEach(rec => {
    if (!rec.MA_MAY && isMachineRequired(config.serviceCatalog, rec.MA_DICH_VU)) {
      errors.push({
        id: Math.random().toString(36).substr(2, 9),
        recordId: rec.id,
        MA_LK: rec.MA_LK,
        MA_DICH_VU: rec.MA_DICH_VU,
        NoiDung: `Thiếu mã máy thực hiện DVKT (DV: '${rec.TEN_DICH_VU}' yêu cầu phải có mã máy, nếu đây là Khám bệnh hãy tích Không Cần Máy ở Danh Mục)`,
        Loai: 'heavy'
      });
    }
  });

  // ============================================
  // 0b. Check Nhân viên không có trong danh mục
  // ============================================
  if (config.staffCatalog && config.staffCatalog.length > 0) {
    const checkedStaff = new Set<string>();
    records.forEach(rec => {
      if (rec.NGUOI_THUC_HIEN && !isStaffInCatalog(config.staffCatalog, rec.NGUOI_THUC_HIEN) && !checkedStaff.has(rec.NGUOI_THUC_HIEN)) {
        checkedStaff.add(rec.NGUOI_THUC_HIEN);
        errors.push({
          id: Math.random().toString(36).substr(2, 9),
          recordId: rec.id,
          MA_LK: rec.MA_LK,
          MA_DICH_VU: rec.MA_DICH_VU,
          NoiDung: `[THIẾU NV] Người thực hiện '${rec.NGUOI_THUC_HIEN}' không có trong Danh Mục Nhân Viên (Bảng 2)`,
          Loai: 'warning'
        });
      }
      if (rec.MA_BAC_SI && !isStaffInCatalog(config.staffCatalog, rec.MA_BAC_SI) && !checkedStaff.has(rec.MA_BAC_SI)) {
        checkedStaff.add(rec.MA_BAC_SI);
        errors.push({
          id: Math.random().toString(36).substr(2, 9),
          recordId: rec.id,
          MA_LK: rec.MA_LK,
          MA_DICH_VU: rec.MA_DICH_VU,
          NoiDung: `[THIẾU NV] BS Y Lệnh '${rec.MA_BAC_SI}' không có trong Danh Mục Nhân Viên (Bảng 2)`,
          Loai: 'warning'
        });
      }
    });
  }

  // ============================================
  // 1. Group by Bác Sĩ (Check Trùng giờ Y Lệnh)
  // ============================================
  const groupByDoctor = records.reduce((acc, rec) => {
    if (rec.MA_BAC_SI) {
      if (!acc[rec.MA_BAC_SI]) acc[rec.MA_BAC_SI] = [];
      acc[rec.MA_BAC_SI].push(rec);
    }
    return acc;
  }, {} as Record<string, DVKTRecord[]>);

  if (config.checkExactTimeYL) {
    Object.entries(groupByDoctor).forEach(([doctor, docRecords]) => {
      for (let i = 0; i < docRecords.length; i++) {
        for (let j = i + 1; j < docRecords.length; j++) {
          const r1 = docRecords[i];
          const r2 = docRecords[j];
          if (r1.MA_LK !== r2.MA_LK && r1.NGAY_YL && r2.NGAY_YL) {
            if (checkExactMatch(r1.NGAY_YL, r2.NGAY_YL)) {
              errors.push({
                id: Math.random().toString(36).substr(2, 9),
                recordId: r1.id,
                MA_LK: r1.MA_LK,
                MA_DICH_VU: r1.MA_DICH_VU,
                NoiDung: `[TRÙNG Y LỆNH] Bác sĩ '${doctor}' có 2 BN trùng đúng giờ Y Lệnh lúc ${formatTimeOnly(r1.NGAY_YL)}. Trùng với BN: ${fmtBN(r2)} - DV: '${r2.TEN_DICH_VU}'`,
                Loai: 'heavy'
              });
              errors.push({
                id: Math.random().toString(36).substr(2, 9),
                recordId: r2.id,
                MA_LK: r2.MA_LK,
                MA_DICH_VU: r2.MA_DICH_VU,
                NoiDung: `[TRÙNG Y LỆNH] Bác sĩ '${doctor}' có 2 BN trùng đúng giờ Y Lệnh lúc ${formatTimeOnly(r2.NGAY_YL)}. Trùng với BN: ${fmtBN(r1)} - DV: '${r1.TEN_DICH_VU}'`,
                Loai: 'heavy'
              });
            }
          }
        }
      }
    });
  }

  // ============================================
  // 2. Group by Nhân Viên (Check Trùng giờ TH/KQ & Chồng chéo)
  // ============================================
  const groupByStaff = records.reduce((acc, rec) => {
    if (rec.NGUOI_THUC_HIEN) {
      if (!acc[rec.NGUOI_THUC_HIEN]) acc[rec.NGUOI_THUC_HIEN] = [];
      acc[rec.NGUOI_THUC_HIEN].push(rec);
    }
    return acc;
  }, {} as Record<string, DVKTRecord[]>);

  Object.entries(groupByStaff).forEach(([staff, staffRecords]) => {
    let staffName = staff;
    if (config.staffCatalog && config.staffCatalog.length > 0) {
      const match = findStaff(config.staffCatalog, staff);
      if (match) staffName = match.name || match.cchn;
    }

    for (let i = 0; i < staffRecords.length; i++) {
      for (let j = i + 1; j < staffRecords.length; j++) {
        const r1 = staffRecords[i];
        const r2 = staffRecords[j];

        const svc1 = findServiceInCatalog(config.serviceCatalog, r1.MA_DICH_VU);
        const svc2 = findServiceInCatalog(config.serviceCatalog, r2.MA_DICH_VU);

        // Legacy eitherAllowed (từ Bảng 5 cơ bản hoặc nhóm Xét nghiệm)
        const eitherAllowed = isOverlapAllowed(config.serviceCatalog, r1.MA_DICH_VU) || isOverlapAllowed(config.serviceCatalog, r2.MA_DICH_VU);

        // Xác định "Khoảng thời gian thao tác không được trùng" (Nếu có cài đặt operationTime)
        // Nếu không cài, thì mặc định lấy toàn bộ [NGAY_TH_YL, NGAY_KQ]
        let r1OpEnd: Date | null = null;
        if (svc1?.operationTime && svc1.operationTime > 0 && r1.NGAY_TH_YL) {
          r1OpEnd = new Date(r1.NGAY_TH_YL.getTime() + svc1.operationTime * 60000);
        }
        let r2OpEnd: Date | null = null;
        if (svc2?.operationTime && svc2.operationTime > 0 && r2.NGAY_TH_YL) {
          r2OpEnd = new Date(r2.NGAY_TH_YL.getTime() + svc2.operationTime * 60000);
        }

        // 2a. Trùng giờ Thực hiện
        if (config.checkExactTimeTH && r1.NGAY_TH_YL && r2.NGAY_TH_YL && r1.MA_LK !== r2.MA_LK) {
          if (!eitherAllowed && checkExactMatch(r1.NGAY_TH_YL, r2.NGAY_TH_YL)) {
            errors.push({
              id: Math.random().toString(36).substr(2, 9),
              recordId: r1.id, MA_LK: r1.MA_LK, MA_DICH_VU: r1.MA_DICH_VU,
              NoiDung: `[TRÙNG GIỜ TH] NV '${staffName}' thực hiện trùng đúng giờ lúc ${formatTimeOnly(r1.NGAY_TH_YL)} với BN khác. Trùng với: ${fmtBN(r2)} - DV: '${r2.TEN_DICH_VU}'`,
              Loai: 'heavy'
            });
            errors.push({
              id: Math.random().toString(36).substr(2, 9),
              recordId: r2.id, MA_LK: r2.MA_LK, MA_DICH_VU: r2.MA_DICH_VU,
              NoiDung: `[TRÙNG GIỜ TH] NV '${staffName}' thực hiện trùng đúng giờ lúc ${formatTimeOnly(r2.NGAY_TH_YL)} với BN khác. Trùng với: ${fmtBN(r1)} - DV: '${r1.TEN_DICH_VU}'`,
              Loai: 'heavy'
            });
          }
        }

        // 2b. Trùng giờ Kết quả
        if (config.checkExactTimeKQ && r1.NGAY_KQ && r2.NGAY_KQ && r1.MA_LK !== r2.MA_LK) {
          if (!eitherAllowed && checkExactMatch(r1.NGAY_KQ, r2.NGAY_KQ)) {
            errors.push({
              id: Math.random().toString(36).substr(2, 9),
              recordId: r1.id, MA_LK: r1.MA_LK, MA_DICH_VU: r1.MA_DICH_VU,
              NoiDung: `[TRÙNG GIỜ KQ] NV '${staffName}' trả kết quả trùng đúng giờ lúc ${formatTimeOnly(r1.NGAY_KQ)} với BN khác. Trùng với: ${fmtBN(r2)} - DV: '${r2.TEN_DICH_VU}'`,
              Loai: 'heavy'
            });
            errors.push({
              id: Math.random().toString(36).substr(2, 9),
              recordId: r2.id, MA_LK: r2.MA_LK, MA_DICH_VU: r2.MA_DICH_VU,
              NoiDung: `[TRÙNG GIỜ KQ] NV '${staffName}' trả kết quả trùng đúng giờ lúc ${formatTimeOnly(r2.NGAY_KQ)} với BN khác. Trùng với: ${fmtBN(r1)} - DV: '${r1.TEN_DICH_VU}'`,
              Loai: 'heavy'
            });
          }
        }

        // 2c. Chồng chéo thời gian (cùng NV, khác BN)
        if (config.checkStaffOverlap && r1.NGAY_TH_YL && r2.NGAY_TH_YL && r1.NGAY_KQ && r2.NGAY_KQ && r1.MA_LK !== r2.MA_LK) {
          // Bỏ qua exact match (đã bắt ở 2a/2b)
          if (!checkExactMatch(r1.NGAY_TH_YL, r2.NGAY_TH_YL) && !checkExactMatch(r1.NGAY_KQ, r2.NGAY_KQ)) {
            const isFullOverlap = checkTimeOverlap(r1.NGAY_TH_YL, r1.NGAY_KQ, r2.NGAY_TH_YL, r2.NGAY_KQ);
            
            // Nếu có cài đặt Thời gian thao tác -> Kiểm tra CHỒNG CHÉO THAO TÁC NGHIÊM NGẶT
            let opConflictReason = '';
            if (r1OpEnd && checkTimeOverlap(r1.NGAY_TH_YL, r1OpEnd, r2.NGAY_TH_YL, r2OpEnd || r2.NGAY_KQ)) {
              opConflictReason = `Chồng vào thời gian thao tác (${svc1?.operationTime} phút) của DV '${r1.TEN_DICH_VU}'`;
            } else if (r2OpEnd && checkTimeOverlap(r2.NGAY_TH_YL, r2OpEnd, r1.NGAY_TH_YL, r1OpEnd || r1.NGAY_KQ)) {
              opConflictReason = `Chồng vào thời gian thao tác (${svc2?.operationTime} phút) của DV '${r2.TEN_DICH_VU}'`;
            }

            if (opConflictReason) {
              errors.push({
                id: Math.random().toString(36).substr(2, 9), recordId: r1.id, MA_LK: r1.MA_LK, MA_DICH_VU: r1.MA_DICH_VU,
                NoiDung: `[VI PHẠM T.GIAN THAO TÁC] ${opConflictReason}. Bị chồng với BN: ${fmtBN(r2)}`,
                Loai: 'heavy'
              });
              errors.push({
                id: Math.random().toString(36).substr(2, 9), recordId: r2.id, MA_LK: r2.MA_LK, MA_DICH_VU: r2.MA_DICH_VU,
                NoiDung: `[VI PHẠM T.GIAN THAO TÁC] ${opConflictReason}. Bị chồng với BN: ${fmtBN(r1)}`,
                Loai: 'heavy'
              });
            } else if (isFullOverlap && !eitherAllowed) {
              // Fallback nếu không vi phạm thao tác, nhưng lồng chéo cơ bản (và không được phép lồng)
              errors.push({
                id: Math.random().toString(36).substr(2, 9), recordId: r1.id, MA_LK: r1.MA_LK, MA_DICH_VU: r1.MA_DICH_VU,
                NoiDung: `[CHỒNG CHÉO CA] NV '${staffName}' bị chồng giờ (${formatTimeOnly(r1.NGAY_TH_YL)}-${formatTimeOnly(r1.NGAY_KQ)}) với BN khác: ${fmtBN(r2)}. DV bị chồng: '${r2.TEN_DICH_VU}'`,
                Loai: 'heavy'
              });
              errors.push({
                id: Math.random().toString(36).substr(2, 9), recordId: r2.id, MA_LK: r2.MA_LK, MA_DICH_VU: r2.MA_DICH_VU,
                NoiDung: `[CHỒNG CHÉO CA] NV '${staffName}' bị chồng giờ (${formatTimeOnly(r2.NGAY_TH_YL)}-${formatTimeOnly(r2.NGAY_KQ)}) với BN khác: ${fmtBN(r1)}. DV bị chồng: '${r1.TEN_DICH_VU}'`,
                Loai: 'heavy'
              });
            }
          }
        }

      }
    }
  });

  // ============================================
  // 3. Group by Máy (Check Máy độc quyền)
  // ============================================
  const groupByMachine = records.reduce((acc, rec) => {
    if (rec.MA_MAY) {
      if (!acc[rec.MA_MAY]) acc[rec.MA_MAY] = [];
      acc[rec.MA_MAY].push(rec);
    }
    return acc;
  }, {} as Record<string, DVKTRecord[]>);

  Object.entries(groupByMachine).forEach(([machine, machineRecords]) => {
    let machineAllowOverlap = true; // Default allow
    let machineName = machine;
    if (config.machineCatalog && config.machineCatalog.length > 0) {
      const mc = config.machineCatalog.find(m => m.code === machine);
      if (!mc) {
        machineRecords.forEach(rec => {
          errors.push({
            id: Math.random().toString(36).substr(2, 9),
            recordId: rec.id,
            MA_LK: rec.MA_LK,
            MA_DICH_VU: rec.MA_DICH_VU,
            NoiDung: `Mã máy '${machine}' không có trong danh mục bảng 6`,
            Loai: 'warning'
          });
        });
      } else {
        machineAllowOverlap = mc.allowOverlap;
        machineName = mc.name;
      }
    }

    if (config.checkMachine && !machineAllowOverlap) { // Nếu máy cấm trùng
      for (let i = 0; i < machineRecords.length; i++) {
        for (let j = i + 1; j < machineRecords.length; j++) {
          const r1 = machineRecords[i];
          const r2 = machineRecords[j];
          if (r1.MA_LK !== r2.MA_LK && r1.NGAY_TH_YL && r2.NGAY_TH_YL && r1.NGAY_KQ && r2.NGAY_KQ) {
            if (checkTimeOverlap(r1.NGAY_TH_YL, r1.NGAY_KQ, r2.NGAY_TH_YL, r2.NGAY_KQ)) {
              errors.push({
                id: Math.random().toString(36).substr(2, 9),
                recordId: r1.id,
                MA_LK: r1.MA_LK,
                MA_DICH_VU: r1.MA_DICH_VU,
                NoiDung: `[TRÙNG MÁY] Máy cấm trùng '${machineName}' bị sử dụng đồng thời (${formatTimeOnly(r1.NGAY_TH_YL)}-${formatTimeOnly(r1.NGAY_KQ)}). Trùng với BN: ${fmtBN(r2)} - DV: '${r2.TEN_DICH_VU}'`,
                Loai: 'heavy'
              });
              errors.push({
                id: Math.random().toString(36).substr(2, 9),
                recordId: r2.id,
                MA_LK: r2.MA_LK,
                MA_DICH_VU: r2.MA_DICH_VU,
                NoiDung: `[TRÙNG MÁY] Máy cấm trùng '${machineName}' bị sử dụng đồng thời (${formatTimeOnly(r2.NGAY_TH_YL)}-${formatTimeOnly(r2.NGAY_KQ)}). Trùng với BN: ${fmtBN(r1)} - DV: '${r1.TEN_DICH_VU}'`,
                Loai: 'heavy'
              });
            }
          }
        }
      }
    }
  });

  // ============================================
  // 4. Group by Bệnh Nhân (Check Bệnh nhân bị chồng chéo)
  // Bypass nếu: nhóm XN (22,23,24) HOẶC DV được đánh dấu allowStaffOverlap trong danh mục
  // ============================================
  const groupByPatient = records.reduce((acc, rec) => {
    if (!acc[rec.MA_LK]) acc[rec.MA_LK] = [];
    acc[rec.MA_LK].push(rec);
    return acc;
  }, {} as Record<string, DVKTRecord[]>);

  if (config.checkPatientOverlap) {
    Object.entries(groupByPatient).forEach(([maLK, patientRecords]) => {
      for (let i = 0; i < patientRecords.length; i++) {
        for (let j = i + 1; j < patientRecords.length; j++) {
          const r1 = patientRecords[i];
          const r2 = patientRecords[j];

          if (r1.NGAY_TH_YL && r2.NGAY_TH_YL && r1.NGAY_KQ && r2.NGAY_KQ) {
            if (checkTimeOverlap(r1.NGAY_TH_YL, r1.NGAY_KQ, r2.NGAY_TH_YL, r2.NGAY_KQ)) {
              // Bypass nếu MỘT TRONG HAI DV là XN, hoặc CẢ HAI đều được phép chồng chéo (từ Danh Mục)
              const eitherIsLab = isLabService(r1.MA_DICH_VU) || isLabService(r2.MA_DICH_VU);
              const svc1 = findServiceInCatalog(config.serviceCatalog, r1.MA_DICH_VU);
              const svc2 = findServiceInCatalog(config.serviceCatalog, r2.MA_DICH_VU);
              const bothAllowedFromCatalog = (svc1?.allowStaffOverlap === true) && (svc2?.allowStaffOverlap === true);
              const shouldBypass = eitherIsLab || bothAllowedFromCatalog;

              // Xử lý riêng nhóm 18 (CĐHA): chia thành 2 nhóm con Siêu âm & Chụp
              const r1Img = isImagingService(r1.MA_DICH_VU);
              const r2Img = isImagingService(r2.MA_DICH_VU);
              if (r1Img || r2Img) {
                // Cả hai đều là nhóm 18 và CÙNG NHÓM CON (VD: Siêu âm & Siêu âm) -> cho phép
                if (r1Img && r2Img && isSameImagingGroup(r1.TEN_DICH_VU, r2.TEN_DICH_VU)) {
                  continue; // bypass - cùng nhóm con, cho phép chồng
                }
                // Cả hai đều là nhóm 18 nhưng KHÁC NHÓM CON (VD: Siêu âm & Chụp XQ) -> cảnh báo
                if (r1Img && r2Img && !isSameImagingGroup(r1.TEN_DICH_VU, r2.TEN_DICH_VU)) {
                  const g1 = getImagingGroupLabel(getImagingGroup(r1.TEN_DICH_VU));
                  const g2 = getImagingGroupLabel(getImagingGroup(r2.TEN_DICH_VU));
                  errors.push({
                    id: Math.random().toString(36).substr(2, 9),
                    recordId: r1.id,
                    MA_LK: maLK,
                    MA_DICH_VU: r1.MA_DICH_VU,
                    NoiDung: `[CĐHA CHỒNG LOẠI] BN ${fmtBN(r1)} nhóm '${g1}' chồng giờ với nhóm '${g2}' (${formatTimeOnly(r1.NGAY_TH_YL)}-${formatTimeOnly(r1.NGAY_KQ)}). DV bị chồng: '${r2.TEN_DICH_VU}' (${r2.MA_DICH_VU})`,
                    Loai: 'warning'
                  });
                  continue;
                }
                // Một bên là 18, bên kia không phải
                if ((r1Img && !r2Img) || (!r1Img && r2Img)) {
                  const imgRec = r1Img ? r1 : r2;
                  const otherRec = r1Img ? r2 : r1;
                  // Nếu bên kia là công khám (XX.XX) hoặc xét nghiệm -> cho phép, không cảnh báo
                  if (isExamService(otherRec.MA_DICH_VU) || isLabService(otherRec.MA_DICH_VU)) {
                    continue; // bypass - CĐHA chồng với Khám/XN thì OK
                  }
                  const imgGroup = getImagingGroupLabel(getImagingGroup(imgRec.TEN_DICH_VU));
                  errors.push({
                    id: Math.random().toString(36).substr(2, 9),
                    recordId: imgRec.id,
                    MA_LK: maLK,
                    MA_DICH_VU: imgRec.MA_DICH_VU,
                    NoiDung: `[CĐHA CHỒNG KHÁC] BN ${fmtBN(imgRec)} DV nhóm '${imgGroup}': '${imgRec.TEN_DICH_VU}' bị chồng giờ với DV khác nhóm '${otherRec.TEN_DICH_VU}' (${otherRec.MA_DICH_VU})`,
                    Loai: 'warning'
                  });
                  continue;
                }
              }

              if (shouldBypass) {
                continue; // bypass - DV được danh mục cho phép
              }

              errors.push({
                id: Math.random().toString(36).substr(2, 9),
                recordId: r1.id,
                MA_LK: maLK,
                MA_DICH_VU: r1.MA_DICH_VU,
                NoiDung: `[CHỒNG CHÉO BN] BN ${fmtBN(r1)} làm 2 DV bị chồng giờ (${formatTimeOnly(r1.NGAY_TH_YL)}-${formatTimeOnly(r1.NGAY_KQ)}). DV bị chồng: '${r2.TEN_DICH_VU}' (${r2.MA_DICH_VU}) (${formatTimeOnly(r2.NGAY_TH_YL)}-${formatTimeOnly(r2.NGAY_KQ)})`,
                Loai: 'warning'
              });
              errors.push({
                id: Math.random().toString(36).substr(2, 9),
                recordId: r2.id,
                MA_LK: maLK,
                MA_DICH_VU: r2.MA_DICH_VU,
                NoiDung: `[CHỒNG CHÉO BN] BN ${fmtBN(r2)} làm 2 DV bị chồng giờ (${formatTimeOnly(r2.NGAY_TH_YL)}-${formatTimeOnly(r2.NGAY_KQ)}). DV bị chồng: '${r1.TEN_DICH_VU}' (${r1.MA_DICH_VU}) (${formatTimeOnly(r1.NGAY_TH_YL)}-${formatTimeOnly(r1.NGAY_KQ)})`,
                Loai: 'warning'
              });
            }
          }
        }
      }
    });
  }

  // ============================================
  // 5. Logic Ngoài Giờ và Check Time Logic (YL <= TH <= KQ)
  // ============================================
  records.forEach(rec => {
    // Logic thời gian
    if (config.checkTimeLogic) {
      if (rec.NGAY_YL && rec.NGAY_TH_YL && rec.NGAY_YL.getTime() > rec.NGAY_TH_YL.getTime()) {
        errors.push({
          id: Math.random().toString(36).substr(2, 9),
          recordId: rec.id,
          MA_LK: rec.MA_LK,
          MA_DICH_VU: rec.MA_DICH_VU,
          NoiDung: '[SAI LOGIC] Thời gian Y lệnh diễn ra sau thời gian Thực hiện',
          Loai: 'heavy'
        });
      }
      if (rec.NGAY_TH_YL && rec.NGAY_KQ && rec.NGAY_TH_YL.getTime() > rec.NGAY_KQ.getTime()) {
        errors.push({
          id: Math.random().toString(36).substr(2, 9),
          recordId: rec.id,
          MA_LK: rec.MA_LK,
          MA_DICH_VU: rec.MA_DICH_VU,
          NoiDung: '[SAI LOGIC] Thời gian Thực hiện diễn ra sau thời gian Kết quả',
          Loai: 'heavy'
        });
      } else if (rec.NGAY_TH_YL && rec.NGAY_KQ) {
        // Kiểm tra tổng thời gian DVKT
        const svc = findServiceInCatalog(config.serviceCatalog, rec.MA_DICH_VU);
        if (svc?.totalTime && svc.totalTime > 0) {
          const durationMins = (rec.NGAY_KQ.getTime() - rec.NGAY_TH_YL.getTime()) / 60000;
          if (durationMins < svc.totalTime) {
            errors.push({
              id: Math.random().toString(36).substr(2, 9),
              recordId: rec.id,
              MA_LK: rec.MA_LK,
              MA_DICH_VU: rec.MA_DICH_VU,
              NoiDung: `[T.GIAN QUÁ NGẮN] DV '${rec.TEN_DICH_VU}' yêu cầu tổng thời gian tối thiểu ${svc.totalTime} phút, nhưng thực tế chỉ mất ${Math.round(durationMins)} phút.`,
              Loai: 'warning'
            });
          }
        }
      }
    }

    // Ngoài giờ
    if (config.checkOperatingHours && rec.NGAY_TH_YL) {
      const h = rec.NGAY_TH_YL.getHours();
      const m = rec.NGAY_TH_YL.getMinutes();
      const timeNum = h * 60 + m;

      const pMorningStart = config.operatingHours.morningStart.split(':').map(Number);
      const mS = pMorningStart[0] * 60 + pMorningStart[1];
      const pMorningEnd = config.operatingHours.morningEnd.split(':').map(Number);
      const mE = pMorningEnd[0] * 60 + pMorningEnd[1];
      const pAfternoonStart = config.operatingHours.afternoonStart.split(':').map(Number);
      const aS = pAfternoonStart[0] * 60 + pAfternoonStart[1];
      const pAfternoonEnd = config.operatingHours.afternoonEnd.split(':').map(Number);
      const aE = pAfternoonEnd[0] * 60 + pAfternoonEnd[1];

      const isMorning = timeNum >= mS && timeNum <= mE;
      const isAfternoon = timeNum >= aS && timeNum <= aE;

      if (!isMorning && !isAfternoon) {
        errors.push({
          id: Math.random().toString(36).substr(2, 9),
          recordId: rec.id,
          MA_LK: rec.MA_LK,
          MA_DICH_VU: rec.MA_DICH_VU,
          NoiDung: '[NGOÀI GIỜ] Dịch vụ thực hiện ngoài giờ hành chính',
          Loai: 'warning'
        });
      }
    }
  });

  return errors;
}
