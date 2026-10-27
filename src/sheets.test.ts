import { describe, expect, it } from 'vitest'
import { applyFirstSeen, summarizeRecords, contactDetails, paymentDetails, personalInfo, remarksDetails, schoolDetails, statusLabel, extractReviewRecords, filterRecordsByProvince, getAccomplishmentSnapshot, paginateRecords, sortRecordsByValidatedDate, summarizeWorksheet } from './sheets'

const blankPersonal = { sex: '', birthday: '', contact: '', email: '', pwd: '', soloParent: '', indigenous: '', firstGen: '' }
const blankEducation = { member: '', hei: '', heiType: '', degree: '', yearLevel: '', academicYear: '' }

describe('payment modes', () => {
  it('counts every payment mode as accomplished (GCash, PayMaya, PISO Plus, Visa) and skips blanks', () => {
    const csv = [
      'Entry_id,ACCOUNT DESCRIPTION/Mode of Payment',
      'E-1,GCash', 'E-2,PayMaya', 'E-3,PISO Plus', 'E-4,Visa', 'E-5,',
    ].join('\n')

    expect(summarizeWorksheet(csv)).toMatchObject({ target: 5, accomplished: 4 })
  })
})

describe('sortRecordsByValidatedDate', () => {
  it('puts the latest validated record first across provinces and leaves undated records last', () => {
    const records = [
      { id: 'old', province: 'Davao Oriental', validatedDate: '2026-10-23' },
      { id: 'latest', province: 'Davao del Sur', validatedDate: '2026-10-26' },
      { id: 'undated', province: 'Davao del Norte' },
      { id: 'middle', province: 'Davao City', validatedDate: '2026-10-24' },
    ]

    expect(sortRecordsByValidatedDate(records).map((record) => record.id)).toEqual(['latest', 'middle', 'old', 'undated'])
  })
})

describe('summarizeWorksheet', () => {
  it('groups qualifying rows by Date Requested without returning personal fields', () => {
    const csv = [
      'PROVINCE,Entry_id,MEMBER First name,ACCOUNT DESCRIPTION/Mode of Payment,Date Requested',
      'DAVAO DEL SUR,E-001,Ana,Cash Card,10/20/2026',
      'DAVAO DEL SUR,E-002,Ben,E-Wallet,10/20/2026',
      'DAVAO DEL SUR,E-003,Cara,,10/21/2026',
    ].join('\n')

    expect(summarizeWorksheet(csv)).toEqual({
      target: 3,
      accomplished: 2,
      daily: { '2026-10-20': 2 },
    })
  })

  it('counts only the payment-mode column and prefers Date Claimed for the daily date', () => {
    const csv = [
      'PROVINCE,Entry_id,ACCOUNT DESCRIPTION/Mode of Payment,Date Requested,Date Claimed/Account Opened,REMARKS',
      'DAVAO DEL SUR,E-001,Cash Card,10/01/2026,10/05/2026,',
      'DAVAO DEL SUR,E-002,,10/02/2026,10/06/2026,E-Wallet mentioned in notes',
    ].join('\n')

    expect(summarizeWorksheet(csv)).toEqual({
      target: 2,
      accomplished: 1,
      daily: { '2026-10-05': 1 },
    })
  })

  it('counts any value in the payment column, including the dropdown options GCash, Paymaya, PISO Plus and VISA', () => {
    const csv = [
      'PROVINCE,Entry_id,ACCOUNT DESCRIPTION/Mode of Payment',
      'DAVAO DEL SUR,E-001,GCash',
      'DAVAO DEL SUR,E-002,Paymaya',
      'DAVAO DEL SUR,E-003,PISO Plus',
      'DAVAO DEL SUR,E-004,VISA',
      'DAVAO DEL SUR,E-005,',
    ].join('\n')

    expect(summarizeWorksheet(csv)).toMatchObject({ target: 5, accomplished: 4 })
    expect(extractReviewRecords(csv, 'Davao del Sur').map((record) => record.accomplished)).toEqual([true, true, true, true, false])
  })

  it('uses only rows with an Entry_id as provincial targets', () => {
    const csv = [
      'PROVINCE,Entry_id,ACCOUNT DESCRIPTION/Mode of Payment',
      'DAVAO DEL SUR,E-001,Cash Card',
      'DAVAO DEL SUR,E-002,',
      'DAVAO DEL SUR,,E-Wallet',
      ',,',
    ].join('\n')

    expect(summarizeWorksheet(csv)).toEqual({ target: 2, accomplished: 1, daily: {} })
  })
})

describe('extractReviewRecords', () => {
  it('maps MRB and RPMO validation fields from their sheet headers', () => {
    const csv = [
      'Entry_id,Name of MRB,MRB/PRB REMARKS,RPMO Level validation (Name of Validator),RPMO Validator Remarks',
      'E-001,Maria Reviewer,Fully verified,Pedro Validator,Confirmed by RPMO',
    ].join('\n')

    const [record] = extractReviewRecords(csv, 'Davao del Sur')

    expect(record.payment).toMatchObject({
      validatedBy: 'Maria Reviewer',
      remarks: 'Fully verified',
      rpmoValidator: 'Pedro Validator',
      rpmoRemarks: 'Confirmed by RPMO',
    })
  })

  it('formats the student beneficiary from the member name fields', () => {
    const csv = [
      'Entry_id,MEMBER Last name,MEMBER First name,MEMBER Middle name',
      'E-001,Cruz,Ana,Lim',
      'E-002,Santos,Ben,',
    ].join('\n')

    expect(extractReviewRecords(csv, 'Davao del Sur').map((record) => record.studentName)).toEqual([
      'Cruz, Ana Lim',
      'Santos, Ben',
    ])
  })

  it('returns valid beneficiary rows with province, payment status, and safe review fields', () => {
    const csv = [
      'PROVINCE,Entry_id,GRANTEE FIRST_NAME,GRANTEE LAST_NAME,MUNICIPALITY,BARANGAY,Household ID,Account Number,ACCOUNT DESCRIPTION/Mode of Payment,Date Claimed/Account Opened',
      'DAVAO DEL SUR,E-001,Ana,Cruz,Digos,San Jose,HH-001,AC-001,Cash Card,10/05/2026',
      'DAVAO DEL SUR,E-002,Ben,Santos,Bansalan,Poblacion,HH-002,AC-002,,,',
      'DAVAO DEL SUR,,Cara,Reyes,Digos,Aplaya,HH-003,AC-003,E-Wallet,10/06/2026',
    ].join('\n')

    expect(extractReviewRecords(csv, 'Davao del Sur')).toEqual([
      {
        id: 'E-001', province: 'Davao del Sur', name: 'Ana Cruz', studentName: '', municipality: 'Digos', barangay: 'San Jose',
        householdId: 'HH-001', accountNumber: 'AC-001', paymentMode: 'Cash Card', date: '2026-10-05', accomplished: true,
        payment: { servicingBranch: '', dateRequested: null, dateClaimed: '2026-10-05', controlNo: '', snapshot: '', accountNumber2: '', remarks: '' },
        personal: blankPersonal, education: blankEducation,
      },
      {
        id: 'E-002', province: 'Davao del Sur', name: 'Ben Santos', studentName: '', municipality: 'Bansalan', barangay: 'Poblacion',
        householdId: 'HH-002', accountNumber: 'AC-002', paymentMode: '', date: null, accomplished: false,
        payment: { servicingBranch: '', dateRequested: null, dateClaimed: null, controlNo: '', snapshot: '', accountNumber2: '', remarks: '' },
        personal: blankPersonal, education: blankEducation,
      },
    ])
  })
})

describe('paginateRecords', () => {
  it('returns only twenty records for the selected page', () => {
    const records = Array.from({ length: 45 }, (_, index) => `person-${index + 1}`)

    expect(paginateRecords(records, 2)).toEqual(records.slice(20, 40))
  })

  it('uses the final available page when the requested page is too high', () => {
    const records = Array.from({ length: 21 }, (_, index) => `person-${index + 1}`)

    expect(paginateRecords(records, 9)).toEqual(['person-21'])
  })
})

describe('filterRecordsByProvince', () => {
  it('keeps all records for the regional view and only matching records for a provincial view', () => {
    const records = [
      { province: 'Davao del Sur', name: 'Ana' },
      { province: 'Davao Oriental', name: 'Ben' },
      { province: 'Davao del Sur', name: 'Cara' },
    ]

    expect(filterRecordsByProvince(records)).toEqual(records)
    expect(filterRecordsByProvince(records, 'Davao del Sur')).toEqual([
      { province: 'Davao del Sur', name: 'Ana' },
      { province: 'Davao del Sur', name: 'Cara' },
    ])
  })
})

describe('beneficiary detail sections', () => {
  const csv = [
    'PROVINCE,Entry_id,MUNICIPALITY,BARANGAY,Household ID,Account Number,MEMBER Last name,MEMBER First name,MEMBER Middle name,Sex,Birthday,Contact,Email,PWD,Solo Parent Dependent,Indigenous Person,First Generation College Student,HEI Name,HEI Type,Degree Program,Year level,Academic Year,SERVICING BRANCH,Date Requested (LBP servicing Branch),ACCOUNT DESCRIPTION/Mode of Payment,Date Claimed/ Account Opened,Control No.,SNAPSHOT,Account Number2,MRB/PRB REMARKS',
    'DAVAO DEL SUR,E-001,Padada,Palili,HH-1,AC-1,Cruz,Ana,Lim,F,04/09/2006,09171234567,ana@example.com,No,,Yes,No,UM Digos,Private,BSIT,2nd,2026-2027,LBP Digos,10/01/2026,GCash,10/05/2026,CN-9,https://drive.example/x,AC-22,Verified',
  ].join('\n')
  const [record] = extractReviewRecords(csv, 'Davao del Sur')

  it('groups the record into personal, contact, school, payment and remarks sections', () => {
    expect(personalInfo(record)).toEqual([
      ['Entry ID', 'E-001'], ['Household ID', 'HH-1'], ['Household member', 'Ana Lim Cruz'], ['Sex', 'F'], ['Birthday', '04/09/2006'],
      ['PWD', 'No'], ['Solo parent dependent', '—'], ['Indigenous person', 'Yes'], ['First-generation college student', 'No'],
    ])
    expect(contactDetails(record)).toEqual([
      ['Province', 'Davao del Sur'], ['Municipality', 'Padada'], ['Barangay', 'Palili'],
      ['Contact number', '09171234567'], ['Email', 'ana@example.com'],
    ])
    expect(schoolDetails(record)).toEqual([
      ['School (HEI)', 'UM Digos'], ['HEI type', 'Private'], ['Degree program', 'BSIT'], ['Year level', '2nd'], ['Academic year', '2026-2027'],
    ])
    expect(paymentDetails(record)).toEqual([
      ['Mode of payment', 'GCash'], ['Servicing branch', 'LBP Digos'], ['Date requested', '2026-10-01'],
      ['Date claimed / account opened', '2026-10-05'], ['Date validated', '—'], ['Control no.', 'CN-9'], ['Account number', 'AC-1'],
      ['Account number 2', 'AC-22'], ['Snapshot', 'https://drive.example/x'],
    ])
    expect(remarksDetails(record)).toEqual([['MRB/PRB remarks', 'Verified']])
  })

  it('labels a row with a payment value Validated and an empty one For Validation', () => {
    expect(statusLabel(record)).toBe('Validated')
    expect(statusLabel({ ...record, accomplished: false })).toBe('For Validation')
  })
})

describe('applyFirstSeen', () => {
  const baseRecord = { name: '', municipality: '', barangay: '', householdId: '', accountNumber: '', paymentMode: 'GCash' }
  const snapshot = {
    source: 'Google Sheets', lastRefresh: '',
    provinces: [{ id: 'sur', name: 'Davao del Sur', target: 5, accomplished: 3, daily: { '2026-10-18': 1 }, today: 0 }],
    daily: [{ date: '2026-10-18', value: 1 }],
    records: [
      { ...baseRecord, id: 'E-1', province: 'Davao del Sur', date: '2026-10-18', accomplished: true },
      { ...baseRecord, id: 'E-2', province: 'Davao del Sur', date: null, accomplished: true },
      { ...baseRecord, id: 'E-3', province: 'Davao del Sur', date: null, accomplished: true },
      { ...baseRecord, id: 'E-4', province: 'Davao del Sur', date: null, accomplished: false },
    ],
  } as unknown as Parameters<typeof applyFirstSeen>[0]

  it('counts every accomplished row on its first-seen day, or today when unknown, ignoring the sheet date', () => {
    const result = applyFirstSeen(snapshot, { 'Davao del Sur|E-2': '2026-10-21' }, '2026-10-23')

    expect(result.daily).toEqual([{ date: '2026-10-21', value: 1 }, { date: '2026-10-23', value: 2 }])
    expect(result.provinces[0].daily).toEqual({ '2026-10-21': 1, '2026-10-23': 2 })
    expect(result.provinces[0].today).toBe(2)
    expect(result.daily.reduce((sum, item) => sum + item.value, 0)).toBe(3)
  })

  it('stamps each accomplished record with the day it is counted on, and summarizes any slice of records', () => {
    const result = applyFirstSeen(snapshot, { 'Davao del Sur|E-2': '2026-10-21' }, '2026-10-23')

    expect(result.records.map((record) => record.countedDate)).toEqual(['2026-10-23', '2026-10-21', '2026-10-23', undefined])
    expect(result.records.map((record) => record.validatedDate)).toEqual(['2026-10-23', '2026-10-21', '2026-10-23', undefined])
    expect(summarizeRecords(result.records, '2026-10-23')).toEqual({
      target: 4, accomplished: 3, today: 2, daily: { '2026-10-21': 1, '2026-10-23': 2 },
    })
  })

  it('keeps the first-seen validation timestamp for the date detail', () => {
    const result = applyFirstSeen(snapshot, { 'Davao del Sur|E-2': '2026-10-21' }, '2026-10-23', {
      'Davao del Sur|E-2': '2026-10-21T09:42:00.000Z',
    })

    expect(result.records.find((record) => record.id === 'E-2')?.validatedAt).toBe('2026-10-21T09:42:00.000Z')
  })
})

describe('getAccomplishmentSnapshot', () => {
  it('uses each province worksheet as its target source without reading Initial List', async () => {
    const requestedUrls: string[] = []
    const csv = [
      'PROVINCE,Entry_id,ACCOUNT DESCRIPTION/Mode of Payment,Date Claimed/Account Opened',
      'DAVAO DEL SUR,E-001,Cash Card,10/22/2026',
      'DAVAO DEL SUR,E-002,,',
    ].join('\n')
    const fetcher = (async (input: string | URL | Request) => {
      requestedUrls.push(String(input))
      return { ok: true, text: async () => csv } as Response
    }) as typeof fetch

    const snapshot = await getAccomplishmentSnapshot(fetcher)

    expect(requestedUrls.some((url) => url.includes('Initial%20List'))).toBe(false)
    expect(snapshot.provinces.every((province) => province.target === 2 && province.accomplished === 1)).toBe(true)
    expect(snapshot.records).toHaveLength(12)
    expect(snapshot.records[0]).toMatchObject({ id: 'E-001', province: 'Davao Oriental', accomplished: true })
  })

  it('reads each province through the gid CSV export, which keeps rows hidden by a sheet filter', async () => {
    const requestedUrls: string[] = []
    const fetcher = (async (input: string | URL | Request) => {
      requestedUrls.push(String(input))
      return { ok: true, text: async () => 'PROVINCE,Entry_id,Mode of payment' } as Response
    }) as typeof fetch

    await getAccomplishmentSnapshot(fetcher)

    expect(requestedUrls).toHaveLength(6)
    expect(requestedUrls.every((url) => /\/export\?format=csv&gid=\d+$/.test(url))).toBe(true)
    expect(requestedUrls.some((url) => url.includes('gviz'))).toBe(false)
  })
})

