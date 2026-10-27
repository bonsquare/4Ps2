import { describe, expect, it } from 'vitest'
import { concernDrilldown, getConcerns, parseConcerns } from './concerns'

const csv = [
  'AREA/s OF CONCERN,PROVINCE,QUESTIONS/ISSUES/CONCERNS/ RECOMMENDATIONS ,RESPONSE,REMARKS',
  'IDENTIFICATION AND ELIGIBILITY,,Can we open this to tertiary students?,Focus on the list first,Responded',
  ',Davao Oriental,Is the list coming today?,"Yes, within the day",Resolved',
  ',,,,',
  'ACCOUNT OPENING,,Need an endorsement letter?,,',
  ',,Any LBP branch?,Any nearest branch,',
].join('\n')

describe('parseConcerns', () => {
  it('fills the area down the group, skips blank rows and keeps the province when given', () => {
    const concerns = parseConcerns(csv)

    expect(concerns.map((item) => [item.area, item.province, item.concern])).toEqual([
      ['IDENTIFICATION AND ELIGIBILITY', '', 'Can we open this to tertiary students?'],
      ['IDENTIFICATION AND ELIGIBILITY', 'Davao Oriental', 'Is the list coming today?'],
      ['ACCOUNT OPENING', '', 'Need an endorsement letter?'],
      ['ACCOUNT OPENING', '', 'Any LBP branch?'],
    ])
  })

  it('marks a concern Resolved, Responded (has a response) or Open (no response yet)', () => {
    expect(parseConcerns(csv).map((item) => item.status)).toEqual(['Responded', 'Resolved', 'Open', 'Responded'])
  })

  it('numbers each concern by its sheet row so it can be found in the sheet', () => {
    expect(parseConcerns(csv).map((item) => item.id)).toEqual(['2', '3', '5', '6'])
  })
})

describe('answer link', () => {
  it('points at the RESPONSE cell of the concern row in the sheet', () => {
    const [first, , open] = parseConcerns(csv)

    expect(first.answerUrl).toMatch(/\/edit\?gid=1361573843#gid=1361573843&range=D2$/)
    expect(open.answerUrl).toMatch(/range=D5$/)
  })
})

describe('concern summary drilldown', () => {
  it.each(['Open', 'Responded', 'Resolved'] as const)('filters all concerns into the %s group and targets the list', (status) => {
    expect(concernDrilldown(status)).toEqual({
      status,
      area: 'all',
      province: 'all',
      query: '',
      page: 1,
      targetId: 'concern-list',
    })
  })
})

describe('getConcerns', () => {
  it('reads the concerns sheet through the gid CSV export', async () => {
    const urls: string[] = []
    const fetcher = (async (input: string | URL | Request) => {
      urls.push(String(input))
      return { ok: true, text: async () => csv } as Response
    }) as typeof fetch

    const result = await getConcerns(fetcher)

    expect(urls[0]).toMatch(/\/export\?format=csv&gid=1361573843$/)
    expect(result.concerns).toHaveLength(4)
  })
})
