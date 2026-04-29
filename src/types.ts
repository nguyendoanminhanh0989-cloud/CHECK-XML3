export interface DVKTRecord {
  id: string;
  MA_LK: string;
  HO_TEN: string;
  MA_DICH_VU: string;
  TEN_DICH_VU: string;
  NGAY_YL: Date | null;
  NGAY_TH_YL: Date | null;
  NGAY_KQ: Date | null;
  MA_BAC_SI: string;
  NGUOI_THUC_HIEN: string; // CCHN hoặc mã nhân viên
  MA_MAY: string;
  LOAI_BIEU: 'THUOC' | 'CLS' | 'KHAC';
  originalRow: any; // Keep original for export
}

export interface ErrorLog {
  id: string;
  recordId: string;
  MA_LK: string;
  MA_DICH_VU: string;
  NoiDung: string;
  Loai: 'heavy' | 'warning';
}

export interface Staff {
  cchn: string;
  name: string;
}

export interface Machine {
  code: string;
  name: string;
  allowOverlap: boolean; // Máy ĐƯỢC PHÉP dùng cho nhiều người cùng lúc không (true = được trùng, false = không được)
}

export interface ServiceCatalog {
  code: string;
  name: string;
  allowStaffOverlap?: boolean; // Cho phép trùng lặp nhân viên
  noMachineRequired?: boolean; // Không cần máy móc
  
  // Advanced configuration
  totalTime?: number; // Tổng thời gian DVKT (phút)
  operationTime?: number; // T.Gian thao tác (không được trùng) (phút)
  bedTime?: number; // Thời gian giữ giường
  equipmentCapacity?: number; // Sức chứa thiết bị (BN/lần)
  requireSeparateEquipment?: boolean; // Yêu cầu thiết bị/máy móc riêng
  occupyStaffFully?: boolean; // Chiếm trọn vẹn nhân viên
  forbidOverlap?: boolean; // Cấm lồng kết quả
  allowOverlapWith?: string[]; // Cho phép lồng vào giờ chờ của (mảng mã DV)
  forbidOverlapWith?: string[]; // Cấm tuyệt đối lồng vào giờ chờ của (mảng mã DV)
}

export interface OperatingHours {
  morningStart: string; // "07:00"
  morningEnd: string;   // "11:30"
  afternoonStart: string; // "13:00"
  afternoonEnd: string; // "17:00"
}

export interface ValidationConfig {
  checkExactTimeYL: boolean; // Trùng giờ Y Lệnh (cùng Bác sĩ)
  checkExactTimeTH: boolean; // Trùng giờ Thực hiện (cùng Nhân viên)
  checkExactTimeKQ: boolean; // Trùng giờ Kết quả (cùng Nhân viên)
  checkStaffOverlap: boolean; // Chồng chéo giờ TH-KQ (cùng Nhân viên)
  checkPatientOverlap: boolean; // Chồng chéo giờ (cùng Bệnh nhân)
  checkMachine: boolean;
  checkOperatingHours: boolean;
  checkTimeLogic: boolean; // Y lệnh <= Thực hiện <= Kết quả
  operatingHours: OperatingHours;
  staffCatalog: Staff[];
  machineCatalog: Machine[];
  serviceCatalog: ServiceCatalog[];
}
