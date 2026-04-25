import { DVKTRecord, ErrorLog, ValidationConfig } from './types';

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

export function validateRecords(records: DVKTRecord[], config: ValidationConfig): ErrorLog[] {
  const errors: ErrorLog[] = [];

  // ============================================
  // 0. Check Thiếu Mã Máy (Trừ khi DVKT không yêu cầu máy)
  // ============================================
  records.forEach(rec => {
    let noMachine = false;
    if (config.serviceCatalog) {
      const svcCat = config.serviceCatalog.find(s => s.code === rec.MA_DICH_VU);
      if (svcCat?.noMachineRequired) noMachine = true;
    }
    if (!noMachine && !rec.MA_MAY) {
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
                NoiDung: `Trùng giờ Y Lệnh lúc ${formatTimeOnly(r1.NGAY_YL)} của bác sĩ với BN khác (Mã LK: ${r2.MA_LK})`,
                Loai: 'heavy'
              });
              errors.push({
                id: Math.random().toString(36).substr(2, 9),
                recordId: r2.id,
                MA_LK: r2.MA_LK,
                MA_DICH_VU: r2.MA_DICH_VU,
                NoiDung: `Trùng giờ Y Lệnh lúc ${formatTimeOnly(r2.NGAY_YL)} của bác sĩ với BN khác (Mã LK: ${r1.MA_LK})`,
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
      const match = config.staffCatalog.find(s => s.cchn === staff);
      if (match) staffName = match.name;
    }

    for (let i = 0; i < staffRecords.length; i++) {
      for (let j = i + 1; j < staffRecords.length; j++) {
        const r1 = staffRecords[i];
        const r2 = staffRecords[j];

        // 2a. Trùng giờ Thực hiện
        if (config.checkExactTimeTH && r1.NGAY_TH_YL && r2.NGAY_TH_YL && r1.MA_LK !== r2.MA_LK) {
          if (checkExactMatch(r1.NGAY_TH_YL, r2.NGAY_TH_YL)) {
            errors.push({
              id: Math.random().toString(36).substr(2, 9),
              recordId: r1.id,
              MA_LK: r1.MA_LK,
              MA_DICH_VU: r1.MA_DICH_VU,
              NoiDung: `Trùng đúng giờ Thực hiện lúc ${formatTimeOnly(r1.NGAY_TH_YL)} của NV '${staffName}' với BN khác (Mã LK: ${r2.MA_LK})`,
              Loai: 'heavy'
            });
            errors.push({
              id: Math.random().toString(36).substr(2, 9),
              recordId: r2.id,
              MA_LK: r2.MA_LK,
              MA_DICH_VU: r2.MA_DICH_VU,
              NoiDung: `Trùng đúng giờ Thực hiện lúc ${formatTimeOnly(r2.NGAY_TH_YL)} của NV '${staffName}' với BN khác (Mã LK: ${r1.MA_LK})`,
              Loai: 'heavy'
            });
          }
        }

        // 2b. Trùng giờ Kết quả
        if (config.checkExactTimeKQ && r1.NGAY_KQ && r2.NGAY_KQ && r1.MA_LK !== r2.MA_LK) {
          if (checkExactMatch(r1.NGAY_KQ, r2.NGAY_KQ)) {
            errors.push({
              id: Math.random().toString(36).substr(2, 9),
              recordId: r1.id,
              MA_LK: r1.MA_LK,
              MA_DICH_VU: r1.MA_DICH_VU,
              NoiDung: `Trùng đúng giờ Kết quả lúc ${formatTimeOnly(r1.NGAY_KQ)} của NV '${staffName}' với BN khác (Mã LK: ${r2.MA_LK})`,
              Loai: 'heavy'
            });
            errors.push({
              id: Math.random().toString(36).substr(2, 9),
              recordId: r2.id,
              MA_LK: r2.MA_LK,
              MA_DICH_VU: r2.MA_DICH_VU,
              NoiDung: `Trùng đúng giờ Kết quả lúc ${formatTimeOnly(r2.NGAY_KQ)} của NV '${staffName}' với BN khác (Mã LK: ${r1.MA_LK})`,
              Loai: 'heavy'
            });
          }
        }

        // 2c. Chồng chéo thời gian (được bypass nếu allowStaffOverlap = true)
        if (config.checkStaffOverlap && r1.NGAY_TH_YL && r2.NGAY_TH_YL && r1.NGAY_KQ && r2.NGAY_KQ) {
          // Bỏ qua nếu là exact match để tránh double error
          if (!checkExactMatch(r1.NGAY_TH_YL, r2.NGAY_TH_YL) && !checkExactMatch(r1.NGAY_KQ, r2.NGAY_KQ)) {
            if (checkTimeOverlap(r1.NGAY_TH_YL, r1.NGAY_KQ, r2.NGAY_TH_YL, r2.NGAY_KQ)) {
              let isAllowed = false;
              if (config.serviceCatalog) {
                const s1 = config.serviceCatalog.find(s => s.code === r1.MA_DICH_VU);
                const s2 = config.serviceCatalog.find(s => s.code === r2.MA_DICH_VU);
                // Nếu một trong hai DV cho phép đi làm việc khác
                if (s1?.allowStaffOverlap || s2?.allowStaffOverlap) {
                  isAllowed = true;
                }
              }

              if (!isAllowed) {
                const scope1 = r1.MA_LK === r2.MA_LK ? "cùng BN này" : `BN khác (Mã LK: ${r2.MA_LK})`;
                const scope2 = r1.MA_LK === r2.MA_LK ? "cùng BN này" : `BN khác (Mã LK: ${r1.MA_LK})`;
                errors.push({
                  id: Math.random().toString(36).substr(2, 9),
                  recordId: r1.id,
                  MA_LK: r1.MA_LK,
                  MA_DICH_VU: r1.MA_DICH_VU,
                  NoiDung: `Thời gian làm (${formatTimeOnly(r1.NGAY_TH_YL)} - ${formatTimeOnly(r1.NGAY_KQ)}) bị chồng chéo với ${scope1} (DV: ${r2.TEN_DICH_VU})`,
                  Loai: 'heavy'
                });
                errors.push({
                  id: Math.random().toString(36).substr(2, 9),
                  recordId: r2.id,
                  MA_LK: r2.MA_LK,
                  MA_DICH_VU: r2.MA_DICH_VU,
                  NoiDung: `Thời gian làm (${formatTimeOnly(r2.NGAY_TH_YL)} - ${formatTimeOnly(r2.NGAY_KQ)}) bị chồng chéo với ${scope2} (DV: ${r1.TEN_DICH_VU})`,
                  Loai: 'heavy'
                });
              }
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
                NoiDung: `Máy cấm trùng '${machineName}' bị sử dụng đồng thời (${formatTimeOnly(r1.NGAY_TH_YL)} - ${formatTimeOnly(r1.NGAY_KQ)}) cho BN khác (Mã LK: ${r2.MA_LK})`,
                Loai: 'heavy'
              });
              errors.push({
                id: Math.random().toString(36).substr(2, 9),
                recordId: r2.id,
                MA_LK: r2.MA_LK,
                MA_DICH_VU: r2.MA_DICH_VU,
                NoiDung: `Máy cấm trùng '${machineName}' bị sử dụng đồng thời (${formatTimeOnly(r2.NGAY_TH_YL)} - ${formatTimeOnly(r2.NGAY_KQ)}) cho BN khác (Mã LK: ${r1.MA_LK})`,
                Loai: 'heavy'
              });
            }
          }
        }
      }
    }
  });

  // ============================================
  // 4. Group by Bệnh Nhân (Check Bệnh nhân bị chồng chéo, loại trừ nhóm 21, 22, 23)
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
              // Xét xem mã DVKT có bắt đầu bằng 21, 22, 23 không
              const isR1Lab = r1.MA_DICH_VU.startsWith('21') || r1.MA_DICH_VU.startsWith('22') || r1.MA_DICH_VU.startsWith('23');
              const isR2Lab = r2.MA_DICH_VU.startsWith('21') || r2.MA_DICH_VU.startsWith('22') || r2.MA_DICH_VU.startsWith('23');

              // Nếu CẢ HAI đều là xét nghiệm thì CHO PHÉP
              if (isR1Lab && isR2Lab) {
                continue; // bypass
              }

              errors.push({
                id: Math.random().toString(36).substr(2, 9),
                recordId: r1.id,
                MA_LK: maLK,
                MA_DICH_VU: r1.MA_DICH_VU,
                NoiDung: `Bệnh nhân này bị chồng chéo thời gian làm (${formatTimeOnly(r1.NGAY_TH_YL)} - ${formatTimeOnly(r1.NGAY_KQ)}) với chính DV khác '${r2.TEN_DICH_VU}'`,
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
          NoiDung: 'Thời gian Y lệnh diễn ra sau thời gian Thực hiện',
          Loai: 'heavy'
        });
      }
      if (rec.NGAY_TH_YL && rec.NGAY_KQ && rec.NGAY_TH_YL.getTime() > rec.NGAY_KQ.getTime()) {
        errors.push({
          id: Math.random().toString(36).substr(2, 9),
          recordId: rec.id,
          MA_LK: rec.MA_LK,
          MA_DICH_VU: rec.MA_DICH_VU,
          NoiDung: 'Thời gian Thực hiện diễn ra sau thời gian Kết quả',
          Loai: 'heavy'
        });
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
          NoiDung: 'Dịch vụ thực hiện ngoài giờ hành chính',
          Loai: 'warning'
        });
      }
    }
  });

  return errors;
}
