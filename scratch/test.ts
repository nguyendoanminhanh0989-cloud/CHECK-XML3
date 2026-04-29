import { validateRecords } from '../src/validator';
import { DVKTRecord, ValidationConfig } from '../src/types';

const config: ValidationConfig = {
  checkExactTimeYL: true,
  checkExactTimeTH: true,
  checkExactTimeKQ: true,
  checkStaffOverlap: true,
  checkPatientOverlap: true,
  checkMachine: true,
  checkOperatingHours: false,
  checkTimeLogic: false,
  operatingHours: {
    morningStart: '07:00',
    morningEnd: '11:30',
    afternoonStart: '13:00',
    afternoonEnd: '17:00'
  },
  staffCatalog: [],
  machineCatalog: [],
  serviceCatalog: [
    { code: '08.0483.0280', name: 'Xoa bóp bấm huyệt bằng tay', allowStaffOverlap: false },
    { code: '08.0005.0230', name: 'Điện châm [kim ngắn]', allowStaffOverlap: false }
  ]
};

const makeDate = (s: string) => {
  return new Date(
    parseInt(s.substring(0,4)),
    parseInt(s.substring(4,6))-1,
    parseInt(s.substring(6,8)),
    parseInt(s.substring(8,10)),
    parseInt(s.substring(10,12))
  );
};

const records: DVKTRecord[] = [
  {
    id: 'r1',
    MA_LK: 'CC HN',
    HO_TEN: 'Nguyễn Văn Phụng',
    MA_DICH_VU: '08.0483.0280',
    TEN_DICH_VU: 'Xoa bóp bấm huyệt bằng tay',
    NGAY_YL: makeDate('202604280908'),
    NGAY_TH_YL: makeDate('202604280950'),
    NGAY_KQ: makeDate('202604281010'),
    MA_BAC_SI: 'BS1',
    NGUOI_THUC_HIEN: 'NV1',
    MA_MAY: '',
    LOAI_BIEU: 'CLS',
    originalRow: {}
  },
  {
    id: 'r2',
    MA_LK: 'CC HN',
    HO_TEN: 'Nguyễn Văn Phụng',
    MA_DICH_VU: '08.0005.0230',
    TEN_DICH_VU: 'Điện châm [kim ngắn]',
    NGAY_YL: makeDate('202604280908'),
    NGAY_TH_YL: makeDate('202604280930'),
    NGAY_KQ: makeDate('202604280955'),
    MA_BAC_SI: 'BS1',
    NGUOI_THUC_HIEN: 'NV2',
    MA_MAY: 'MAY1',
    LOAI_BIEU: 'CLS',
    originalRow: {}
  }
];

const errors = validateRecords(records, config);
console.log(JSON.stringify(errors, null, 2));
