import { describe, expect, it } from 'vitest'
import { beneficiaryDetails, educationDetails, paymentDetails, personalDetails, countAccomplishments, extractReviewRecords, filterRecordsByProvince, getAccomplishmentSnapshot, paginateRecords, summarizeWorksheet } from './sheets'

const blankPersonal = { sex: '', birthday: '', contact: '', email: '', pwd: '', soloParent: '', indigenous: '', firstGen: '' }
const blankEducation = { member: '', hei: '', heiType: '', degree: '', yearLevel: '', academicYear: '' }

describe('countAccomplishments', () => {
  it('counts a row once when it contains Cash Card or E-Wallet', () => {
    const rows = [
      ['XI', 'Davao del Sur', 'Cash Card', '2026-10-20'],
      ['XI', 'Davao del Sur', 'E-Wallet', '2026-10-21'],
      ['XI', 'Davao del Sur', 'Cash Card / E-Wallet', '2026-10-22'],
      ['XI', 'Davao del Sur', '', '2026-10-22'],
    ]

    expect(countAccomplishments(rows)).toBe(3)
  })

  it('accepts spacing, hyphen, and letter-case variations', () => {
    expect(countAccomplishments([
      ['cash card'],
      [' CASH   CARD '],
      ['e-wallet'],
      ['E Wallet'],
      ['bank transfer'],
    ])).toBe(4)
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
  it('returns valid beneficiary rows with province, payment status, and safe review fields', () => {
    const csv = [
      'PROVINCE,Entry_id,GRANTEE FIRST_NAME,GRANTEE LAST_NAME,MUNICIPALITY,BARANGAY,Household ID,Account Number,ACCOUNT DESCRIPTION/Mode of Payment,Date Claimed/Account Opened',
      'DAVAO DEL SUR,E-001,Ana,Cruz,Digos,San Jose,HH-001,AC-001,Cash Card,10/05/2026',
      'DAVAO DEL SUR,E-002,Ben,Santos,Bansalan,Poblacion,HH-002,AC-002,,,',
      'DAVAO DEL SUR,,Cara,Reyes,Digos,Aplaya,HH-003,AC-003,E-Wallet,10/06/2026',
    ].join('\n')

    expect(extractReviewRecords(csv, 'Davao del Sur')).toEqual([
      {
        id: 'E-001', province: 'Davao del Sur', name: 'Ana Cruz', municipality: 'Digos', barangay: 'San Jose',
        householdId: 'HH-001', accountNumber: 'AC-001', paymentMode: 'Cash Card', date: '2026-10-05', accomplished: true,
        payment: { servicingBranch: '', dateRequested: null, dateClaimed: '2026-10-05', controlNo: '', snapshot: '', accountNumber2: '', remarks: '' },
        personal: blankPersonal, education: blankEducation,
      },
      {
        id: 'E-002', province: 'Davao del Sur', name: 'Ben Santos', municipality: 'Bansalan', barangay: 'Poblacion',
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

describe('beneficiaryDetails', () => {
  it('prepares every available review field for the beneficiary detail window', () => {
    const record = {
      id: 'E-001', province: 'Davao de Oro', name: 'Jonny Lausa', municipality: 'Maco', barangay: 'Anislagan',
      householdId: '1100000121350', accountNumber: '', paymentMode: '', date: null, accomplished: false,
      payment: { servicingBranch: '', dateRequested: null, dateClaimed: null, controlNo: '', snapshot: '', accountNumber2: '', remarks: '' },
      personal: blankPersonal, education: blankEducation,
    }

    expect(beneficiaryDetails(record)).toEqual([
      ['Entry ID', 'E-001'], ['Province', 'Davao de Oro'], ['Municipality', 'Maco'], ['Barangay', 'Anislagan'],
      ['Household ID', '1100000121350'], ['Account number', '—'],
      ['Status', 'For Validation'],
    ])
  })

  it('shows the payment section fields read from the sheet, with dashes for blanks', () => {
    const csv = [
      'PROVINCE,Entry_id,SERVICING BRANCH,Date Requested (LBP servicing Branch),ACCOUNT DESCRIPTION/Mode of Payment,Date Claimed/ Account Opened,Control No.,SNAPSHOT,Account Number2,MRB/PRB REMARKS',
      'DAVAO DEL SUR,E-001,LBP Digos,10/01/2026,GCash,10/05/2026,CN-9,Snap A,AC-22,',
    ].join('\n')
    const [record] = extractReviewRecords(csv, 'Davao del Sur')

    expect(paymentDetails(record)).toEqual([
      ['Servicing branch', 'LBP Digos'], ['Date requested', '2026-10-01'], ['Mode of payment', 'GCash'],
      ['Date claimed / account opened', '2026-10-05'], ['Control no.', 'CN-9'], ['Snapshot', 'Snap A'],
      ['Account number 2', 'AC-22'], ['MRB/PRB remarks', '—'],
    ])
  })
})

describe('personal and education details', () => {
  it('reads contact, personal and school fields from the record and dashes blanks', () => {
    const csv = [
      'PROVINCE,Entry_id,MEMBER Last name,MEMBER First name,MEMBER Middle name,Sex,Birthday,Contact,Email,PWD,Solo Parent Dependent,Indigenous Person,First Generation College Student,HEI Name,HEI Type,Degree Program,Year level,Academic Year',
      'DAVAO DEL SUR,E-001,Cruz,Ana,Lim,F,2005-03-04,09171234567,ana@example.com,No,,Yes,No,UP Mindanao,SUC,BS Biology,2nd,2026-2027',
    ].join('\n')
    const [record] = extractReviewRecords(csv, 'Davao del Sur')

    expect(personalDetails(record)).toEqual([
      ['Sex', 'F'], ['Birthday', '2005-03-04'], ['Contact number', '09171234567'], ['Email', 'ana@example.com'],
      ['PWD', 'No'], ['Solo parent dependent', '—'], ['Indigenous person', 'Yes'], ['First-generation college student', 'No'],
    ])
    expect(educationDetails(record)).toEqual([
      ['Household member', 'Ana Lim Cruz'], ['School (HEI)', 'UP Mindanao'], ['HEI type', 'SUC'],
      ['Degree program', 'BS Biology'], ['Year level', '2nd'], ['Academic year', '2026-2027'],
    ])
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

  it('reads every row through the Sheets API when a key is set, so sheet filters cannot hide beneficiaries', async () => {
    const requestedUrls: string[] = []
    const values = [
      ['PROVINCE', 'Entry_id', 'ACCOUNT DESCRIPTION/Mode of Payment'],
      ['DAVAO DEL SUR', 'E-001', 'Cash Card'],
      ['DAVAO DEL SUR', 'E-002', ''],
      ['DAVAO DEL SUR', 'E-003', ''],
    ]
    const fetcher = (async (input: string | URL | Request) => {
      requestedUrls.push(String(input))
      return { ok: true, json: async () => ({ values }) } as Response
    }) as typeof fetch

    const snapshot = await getAccomplishmentSnapshot(fetcher, 'test-key')

    expect(requestedUrls.every((url) => url.startsWith('https://sheets.googleapis.com/v4/') && url.includes('key=test-key'))).toBe(true)
    expect(snapshot.provinces.every((province) => province.target === 3 && province.accomplished === 1)).toBe(true)
  })
})
