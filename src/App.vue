<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { init, use, type ECharts } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { DataZoomComponent, GraphicComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { User } from '@supabase/supabase-js'
import { aggregateProvinces, type Province } from './domain'
import { contactDetails, filterRecordsByProvince, paginateRecords, paymentDetails, personalInfo, remarksDetails, schoolDetails, statusLabel, summarizeRecords, REVIEW_PAGE_SIZE, type ReviewRecord } from './sheets'
import { beneficiaryList, buildReport, type ReportScope } from './reports'
import { CONCERNS_SHEET_URL, type Concern, type ConcernStatus } from './concerns'
import { auth, authClient, authConfigured, googleClientId, googleSignInConfigured, turnstileConfigured, turnstileSiteKey } from './auth'
import { accessState, isSuperAdmin, type UserProfile } from './access'
import { ACCOMPLISHMENT_TO_DATE, PAYMENT_DONUT_GRAPHIC_Z, PAYMENT_DONUT_LABEL_LAYOUT, paymentDonutRadius } from './charts'

use([BarChart, LineChart, PieChart, DataZoomComponent, GraphicComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

// Local-only shortcut: `npm run dev` on localhost skips Google sign-in. import.meta.env.DEV is false in production
// builds, so this branch is removed from the deployed bundle.
// ?preview=login|profile|pending|denied lets the sign-in screens be viewed locally.
const devPreview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('preview') : null
const devBypass = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname) && devPreview !== 'login'

type Role = 'regional' | 'provincial'
type View = 'overview' | 'province' | 'reports' | 'approvals' | 'concerns'

const provinces = reactive<Province[]>([
  { id: 'sur', name: 'Davao del Sur', target: 1240, accomplished: 986, today: 42 },
  { id: 'norte', name: 'Davao del Norte', target: 1380, accomplished: 1128, today: 51 },
  { id: 'oriental', name: 'Davao Oriental', target: 1120, accomplished: 792, today: 37 },
  { id: 'oro', name: 'Davao de Oro', target: 980, accomplished: 741, today: 29 },
  { id: 'occidental', name: 'Davao Occidental', target: 760, accomplished: 604, today: 26 },
])

// The trend charts run from the earliest accomplishment date (at least the last 7 days) up to today, one point per day.
// A scroll bar under the chart lets you move across the dates; it opens on the latest 7 days.
const manilaDate = (daysAgo: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(Date.now() - daysAgo * 86_400_000))
const MAX_CHART_DAYS = 366
function dateRange(values: Record<string, number>) {
  const floor = manilaDate(MAX_CHART_DAYS)
  const earliest = Object.keys(values).filter((date) => values[date] > 0 && date >= floor).sort()[0]
  const start = earliest && earliest < manilaDate(6) ? earliest : manilaDate(6)
  const end = Date.parse(`${manilaDate(0)}T00:00:00Z`)
  const range: string[] = []
  for (let time = Date.parse(`${start}T00:00:00Z`); time <= end; time += 86_400_000) range.push(new Date(time).toISOString().slice(0, 10))
  return range
}
function dailySeries(values: Record<string, number>): Array<[string, number]> {
  return dateRange(values).map((date) => {
    const day = new Date(`${date}T00:00:00+08:00`)
    const weekday = new Intl.DateTimeFormat('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' }).format(day)
    const monthDay = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(day)
    return [`${weekday}\n${monthDay}`, values[date] ?? 0]
  })
}
const daily = ref<Array<[string, number]>>(dailySeries({}))
const dailyMap = ref<Record<string, number>>({})
// Subtitle that splits the counts into the charted dates and any others (e.g. a future date typed in the sheet),
// so the chart's numbers always add up to the Accomplished total.
function rangeNote(values: Record<string, number>) {
  const range = dateRange(values)
  const shown = new Set(range)
  let inRange = 0
  let other = 0
  for (const [date, value] of Object.entries(values)) {
    if (shown.has(date)) inRange += value
    else other += value
  }
  const format = (value: number) => value.toLocaleString('en-US')
  const label = (iso: string) => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
  return `${label(range[0])} – ${label(range[range.length - 1])}: ${format(inRange)}${other ? ` · other dates: ${format(other)}` : ''} · total ${format(inRange + other)}`
}
// Scroll bar under a trend chart once there are more than 7 days; the window opens on the latest 7.
function zoomFor(count: number) {
  if (count <= 7) return { bottom: 36, zoom: [] }
  const window = { startValue: count - 7, endValue: count - 1 }
  return { bottom: 80, zoom: [
    { type: 'slider', xAxisIndex: 0, bottom: 8, height: 22, ...window, filterMode: 'none', brushSelect: false, showDataShadow: false, borderColor: 'transparent', backgroundColor: '#eef3f7', fillerColor: 'rgba(29,91,145,.22)', handleSize: '120%', textStyle: { color: '#526377' } },
    { type: 'inside', xAxisIndex: 0, ...window, filterMode: 'none', zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true },
  ] }
}
// One colour per province, reused by the bars and the province line so each stays recognisable.
const provinceColors: Record<string, string> = { oriental: '#2563eb', oro: '#f59e0b', norte: '#8b5cf6', city: '#ec4899', sur: '#10b981', occidental: '#06b6d4' }
const colorOf = (id: string) => provinceColors[id] ?? '#2563eb'
const fade = (hex: string, alpha: string) => `${hex}${alpha}`
// Opaque blend of a #rrggbb colour toward another (e.g. white to lighten, black to deepen); amount 0..1.
function mix(hex: string, toward: string, amount: number) {
  const channel = (value: string, index: number) => parseInt(value.slice(1 + index * 2, 3 + index * 2), 16)
  return `#${[0, 1, 2].map((index) => Math.round(channel(hex, index) + (channel(toward, index) - channel(hex, index)) * amount).toString(16).padStart(2, '0')).join('')}`
}
const completionOf = (item: { target: number; accomplished: number }) => item.target ? Math.round(item.accomplished / item.target * 1000) / 10 : 0

const currentUser = ref<User | null>(null)
const loggedIn = computed(() => Boolean(currentUser.value))
const profile = ref<UserProfile | null>(null)
const profileBusy = ref(false)
const profileError = ref('')
const profileForm = reactive({ fullName: '', position: '', province: '' })
const managedProfiles = ref<UserProfile[]>([])
const approvalsBusy = ref(false)
const profileFilter = ref<'all' | UserProfile['status']>('all')
const statusOrder = { pending: 0, approved: 1, denied: 2 }
const profileCounts = computed(() => ({
  all: managedProfiles.value.length,
  pending: managedProfiles.value.filter((item) => item.status === 'pending').length,
  approved: managedProfiles.value.filter((item) => item.status === 'approved').length,
  denied: managedProfiles.value.filter((item) => item.status === 'denied').length,
}))
// Pending requests first, then everyone else by name.
const visibleProfiles = computed(() => managedProfiles.value
  .filter((item) => profileFilter.value === 'all' || item.status === profileFilter.value)
  .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.fullName.localeCompare(b.fullName)))
const canManage = (item: UserProfile) => item.id !== currentUser.value?.id && !item.isSuperAdmin
function removeAccess(item: UserProfile) {
  if (window.confirm(`Remove ${item.fullName}'s access to the dashboard?`)) decideProfile(item, 'denied')
}
const appAccess = computed(() => accessState(profile.value))
const superAdmin = computed(() => isSuperAdmin(profile.value))
const authBusy = ref(true)
const authError = ref('')
const authMode = ref<'signin' | 'register'>('signin')
const captchaToken = ref('')
const captchaMessage = ref('Loading security check…')
const turnstileMount = ref<HTMLElement | null>(null)
const googleButtonMount = ref<HTMLElement | null>(null)
const role = ref<Role>('regional')
const activeView = ref<View>('overview')
const selectedProvinceId = ref('sur')
const period = ref('This week')
const menuOpen = ref(false)
const accountMenuOpen = ref(false)
const isUrl = (value: string) => /^https?:\/\//i.test(value)
const accountName = computed(() => profile.value?.fullName || String(currentUser.value?.user_metadata?.full_name ?? '') || currentUser.value?.email?.split('@')[0] || 'Account')
const accountInitials = computed(() => accountName.value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase())
function closeAccountMenu(event: Event) {
  if (event instanceof KeyboardEvent ? event.key === 'Escape' : !(event.target as Element | null)?.closest('.account')) accountMenuOpen.value = false
}
const refreshing = ref(false)
const now = ref(new Date())
const clockDate = computed(() => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now.value))
const clockTime = computed(() => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(now.value))
let clockTimer: number | undefined
const lastRefresh = ref('Oct 22, 2026 · 10:48 PM')
const lastSyncAt = ref<number | null>(null)
let sheetEtag: string | null = null
const updateAvailable = ref(false)
const syncLabel = computed(() => {
  if (lastSyncAt.value === null) return ''
  const seconds = Math.max(0, Math.round((now.value.getTime() - lastSyncAt.value) / 1000))
  return seconds < 5 ? 'Updated just now' : seconds < 60 ? `Updated ${seconds}s ago` : `Updated ${Math.floor(seconds / 60)}m ago`
})
function markSynced() {
  lastSyncAt.value = Date.now()
  dataConnected.value = true
  dataError.value = ''
}
const dataConnected = ref(false)
const dataError = ref('')
const reviewRecords = ref<ReviewRecord[]>([])
const reviewProvinceId = ref('all')
const reviewQuery = ref('')
const reviewStatus = ref<'all' | 'accomplished' | 'pending'>('all')
const reviewPage = ref(1)
const reviewMunicipality = ref('all')
const reviewBarangay = ref('all')
const reviewMode = ref('all')
const validatedFrom = ref('')
const validatedTo = ref('')
const claimedFrom = ref('')
const claimedTo = ref('')
const reviewRemarks = ref<'all' | 'with' | 'without'>('all')
const selectedReviewRecord = ref<ReviewRecord | null>(null)
const chartOne = ref<HTMLElement | null>(null)
const chartTwo = ref<HTMLElement | null>(null)
const chartMode = ref<HTMLElement | null>(null)
let firstChart: ECharts | null = null
let secondChart: ECharts | null = null
let modeChart: ECharts | null = null
let refreshTimer: number | undefined
let unsubscribeAuth: (() => void) | undefined
let turnstileWidgetId: string | undefined

type TurnstileApi = {
  render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string
  reset: (widgetId?: string) => void
}

type GoogleIdentityApi = {
  accounts: { id: { initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void; renderButton: (element: HTMLElement, options: Record<string, string | number>) => void } }
}

function loadScript(id: string, src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.getElementById(id)) return resolve()
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Unable to load the sign-in security service.'))
    document.head.append(script)
  })
}

function resetCaptcha() {
  captchaToken.value = ''
  captchaMessage.value = 'Complete the security check before continuing.'
  const api = (window as Window & { turnstile?: TurnstileApi }).turnstile
  if (api) api.reset(turnstileWidgetId)
}

function renderGoogleButton() {
  if (!captchaToken.value || !googleButtonMount.value || !googleClientId) return
  const google = (window as Window & { google?: GoogleIdentityApi }).google
  if (!google?.accounts?.id) return
  googleButtonMount.value.replaceChildren()
  google.accounts.id.initialize({ client_id: googleClientId, callback: signInWithGoogleCredential })
  google.accounts.id.renderButton(googleButtonMount.value, { theme: 'outline', size: 'large', width: 320, text: 'continue_with' })
}

async function setupLoginSecurity() {
  if (!turnstileMount.value || !turnstileSiteKey) return
  try {
    await Promise.all([
      loadScript('cloudflare-turnstile', 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'),
      loadScript('google-identity-services', 'https://accounts.google.com/gsi/client'),
    ])
    const api = (window as Window & { turnstile?: TurnstileApi }).turnstile
    if (!api) throw new Error('Unable to start the security check.')
    turnstileWidgetId = api.render(turnstileMount.value, {
      sitekey: turnstileSiteKey,
      callback: (token) => { captchaToken.value = token; captchaMessage.value = 'Security check complete. You can continue with Google.'; nextTick(renderGoogleButton) },
      'expired-callback': resetCaptcha,
      'error-callback': () => { captchaToken.value = ''; captchaMessage.value = 'Security check unavailable. Refresh and try again.' },
    })
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Unable to load sign-in security.'
  }
}

// Regional target is the overall target across every province; accomplished only grows as provinces update.
const totals = computed(() => aggregateProvinces(provinces))
const selectedProvince = computed(() => provinces.find((item) => item.id === selectedProvinceId.value) ?? provinces[0])
const isProvinceView = computed(() => activeView.value === 'province' || role.value === 'provincial')
const municipality = ref('all')
const provinceRecords = computed(() => filterRecordsByProvince(reviewRecords.value, selectedProvince.value?.name))
const municipalities = computed(() => [...new Set(provinceRecords.value.map((record) => record.municipality).filter(Boolean))].sort())
const municipalityActive = computed(() => isProvinceView.value && municipality.value !== 'all')
// With a municipality picked, the province dashboard is recomputed from just that municipality's records.
const scopeSummary = computed(() => municipalityActive.value
  ? summarizeRecords(provinceRecords.value.filter((record) => record.municipality === municipality.value), manilaDate(0))
  : null)
const displayMetrics = computed(() => scopeSummary.value
  ? aggregateProvinces([{ id: 'municipality', name: municipality.value, ...scopeSummary.value }])
  : isProvinceView.value
    ? aggregateProvinces([selectedProvince.value])
    : totals.value)
const reviewProvinceName = computed(() => {
  const provinceId = isProvinceView.value ? selectedProvinceId.value : reviewProvinceId.value
  return provinces.find((province) => province.id === provinceId)?.name
})
// Records in the chosen province, before the other filters, so the municipality / barangay lists follow it.
const reviewScope = computed(() => filterRecordsByProvince(reviewRecords.value, reviewProvinceName.value))
const reviewMunicipalities = computed(() => [...new Set(reviewScope.value.map((record) => record.municipality).filter(Boolean))].sort())
const reviewBarangays = computed(() => [...new Set(reviewScope.value
  .filter((record) => reviewMunicipality.value === 'all' || record.municipality === reviewMunicipality.value)
  .map((record) => record.barangay).filter(Boolean))].sort())
const reviewModes = computed(() => {
  const seen = new Map<string, string>()
  for (const record of reviewRecords.value) if (record.paymentMode) seen.set(record.paymentMode.trim().toLowerCase(), record.paymentMode.trim())
  return [...seen.values()].sort()
})
const inRange = (value: string | null | undefined, from: string, to: string) => !(from || to) || (!!value && (!from || value >= from) && (!to || value <= to))
const reviewFiltersActive = computed(() => [reviewProvinceId.value !== 'all' && !isProvinceView.value, reviewMunicipality.value !== 'all' && !isProvinceView.value, reviewBarangay.value !== 'all', reviewMode.value !== 'all', validatedFrom.value, validatedTo.value, claimedFrom.value, claimedTo.value, reviewRemarks.value !== 'all', reviewQuery.value.trim()].filter(Boolean).length)
function clearReviewFilters() {
  if (!isProvinceView.value) reviewProvinceId.value = 'all'
  reviewMunicipality.value = 'all'; reviewBarangay.value = 'all'; reviewMode.value = 'all'
  validatedFrom.value = ''; validatedTo.value = ''; claimedFrom.value = ''; claimedTo.value = ''
  reviewRemarks.value = 'all'; reviewQuery.value = ''
}
const filteredReviewRecords = computed(() => {
  const query = reviewQuery.value.trim().toLowerCase()
  return reviewScope.value.filter((record) => {
    if (municipalityActive.value && record.municipality !== municipality.value) return false
    if (!isProvinceView.value && reviewMunicipality.value !== 'all' && record.municipality !== reviewMunicipality.value) return false
    if (reviewBarangay.value !== 'all' && record.barangay !== reviewBarangay.value) return false
    if (reviewMode.value !== 'all' && record.paymentMode.trim().toLowerCase() !== reviewMode.value.toLowerCase()) return false
    if (!inRange(record.validatedDate, validatedFrom.value, validatedTo.value)) return false
    if (!inRange(record.payment.dateClaimed, claimedFrom.value, claimedTo.value)) return false
    if (reviewRemarks.value === 'with' && !record.payment.remarks) return false
    if (reviewRemarks.value === 'without' && record.payment.remarks) return false
    const matchesStatus = !isProvinceView.value ? record.accomplished : reviewStatus.value === 'all'
      || (reviewStatus.value === 'accomplished' ? record.accomplished : !record.accomplished)
    const matchesQuery = !query || [record.name, record.householdId, record.accountNumber, record.municipality, record.barangay, record.payment.remarks]
      .some((value) => value.toLowerCase().includes(query))
    return matchesStatus && matchesQuery
  })
})
const reviewTotalPages = computed(() => Math.max(1, Math.ceil(filteredReviewRecords.value.length / REVIEW_PAGE_SIZE)))
const pagedReviewRecords = computed(() => paginateRecords(filteredReviewRecords.value, reviewPage.value))

const number = new Intl.NumberFormat('en-PH')

function toProfile(record: Record<string, unknown>): UserProfile {
  return {
    id: String(record.id),
    email: String(record.email),
    fullName: String(record.full_name),
    position: String(record.position),
    province: String(record.province),
    status: record.status as UserProfile['status'],
    isSuperAdmin: Boolean(record.is_super_admin),
  }
}

async function loadProfile(user = currentUser.value) {
  if (!user || !authClient) return
  profileBusy.value = true
  profileError.value = ''
  const { data, error } = await authClient.from('user_profiles')
    .select('id, email, full_name, position, province, status, is_super_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (error) profileError.value = 'Unable to check your access. Please try again.'
  else profile.value = data ? toProfile(data) : null
  profileBusy.value = false
}

async function submitProfile() {
  if (!currentUser.value?.email || !authClient) return
  profileBusy.value = true
  profileError.value = ''
  const { error } = await authClient.from('user_profiles').insert({
    id: currentUser.value.id,
    email: currentUser.value.email,
    full_name: profileForm.fullName.trim(),
    position: profileForm.position.trim(),
    province: profileForm.province.trim(),
  })
  if (error) profileError.value = error.message
  else await loadProfile()
  profileBusy.value = false
}

// quiet = background poll that keeps the sidebar's pending-request badge current without flashing the busy state.
async function loadProfiles(quiet = false) {
  if (!superAdmin.value || !authClient || devBypass) return
  if (!quiet) approvalsBusy.value = true
  const { data, error } = await authClient.from('user_profiles')
    .select('id, email, full_name, position, province, status, is_super_admin')
    .order('requested_at', { ascending: true })
  if (error) { if (!quiet) profileError.value = 'Unable to load users.' }
  else managedProfiles.value = (data ?? []).map(toProfile)
  if (!quiet) approvalsBusy.value = false
}

async function decideProfile(request: UserProfile, status: 'approved' | 'denied') {
  if (!authClient || !currentUser.value) return
  approvalsBusy.value = true
  const { error } = await authClient.from('user_profiles')
    .update({ status, decided_at: new Date().toISOString(), decided_by: currentUser.value.id })
    .eq('id', request.id)
  if (error) profileError.value = 'Unable to save this decision. Please try again.'
  else await loadProfiles()
  approvalsBusy.value = false
}

async function signInWithGoogleCredential(response: { credential: string }) {
  if (!auth || !captchaToken.value) {
    authError.value = 'Google sign-in is not configured yet. Add the Supabase connection settings to enable it.'
    return
  }
  authBusy.value = true
  authError.value = ''
  try {
    await auth.signInWithGoogleIdToken(response.credential, captchaToken.value)
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Unable to sign in with Google'
  } finally {
    resetCaptcha()
    authBusy.value = false
  }
}

// ---- Report Center: target vs. actual and payment-mode reports for the region, a province or a municipality ----
const reportType = ref<'target' | 'payment'>('target')
// Overview card: accomplished beneficiaries by payment mode. Regional view lists provinces; Provincial view lists the selected province's municipalities.
const paymentReport = computed(() => {
  const report = buildReport(reviewRecords.value, isProvinceView.value ? { province: selectedProvince.value.name } : {})
  if (isProvinceView.value) return report
  const order = (name: string) => provinces.findIndex((item) => item.name === name)
  return { ...report, rows: [...report.rows].sort((a, b) => order(a.name) - order(b.name)) } // same province order as the other chart
})
const modeColors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
const modeColor = (index: number) => modeColors[index % modeColors.length]
function openPaymentReport() {
  reportType.value = 'payment'
  if (isProvinceView.value) { reportLevel.value = 'provincial'; reportProvince.value = selectedProvince.value.name }
  navigate('reports')
}
// Region: open that province. Province: filter the dashboard to that municipality.
function openPaymentRow(name: string) {
  if (isProvinceView.value) { municipality.value = municipality.value === name ? 'all' : name; return }
  selectedProvinceId.value = provinces.find((item) => item.name === name)?.id ?? selectedProvinceId.value
  navigate('province')
}
const reportLevel = ref<'regional' | 'provincial' | 'municipal'>('regional')
const reportProvince = ref('')
const reportMunicipality = ref('')
const reportNames = ref<'none' | 'validated' | 'all'>('none')
const coverageFrom = ref('')
const coverageTo = ref('')
watch(role, (value) => { if (value === 'provincial' && reportLevel.value === 'regional') reportLevel.value = 'provincial' }, { immediate: true })
const reportProvinceName = computed(() => role.value === 'provincial' ? selectedProvince.value?.name : (reportProvince.value || provinces[0]?.name))
const reportMunicipalities = computed(() => [...new Set(filterRecordsByProvince(reviewRecords.value, reportProvinceName.value).map((record) => record.municipality).filter(Boolean))].sort())
const reportMunicipalityName = computed(() => reportMunicipality.value && reportMunicipalities.value.includes(reportMunicipality.value) ? reportMunicipality.value : reportMunicipalities.value[0])
const reportScope = computed<ReportScope>(() => {
  if (reportLevel.value === 'regional') return {}
  if (reportLevel.value === 'provincial') return { province: reportProvinceName.value }
  return { province: reportProvinceName.value, municipality: reportMunicipalityName.value }
})
const coverage = computed(() => ({ from: coverageFrom.value, to: coverageTo.value }))
const report = computed(() => buildReport(reviewRecords.value, reportScope.value, coverage.value))
// Taller reports print with tighter rows so they still fit one folio sheet where possible.
const reportDensity = computed(() => {
  const rows = report.value.rows.length + (reportType.value === 'payment' ? report.value.modeShare.length + report.value.rows.length : 0)
  return rows > 20 ? 'tight' : rows > 11 ? 'dense' : ''
})
const reportList = computed(() => reportNames.value === 'none' ? [] : beneficiaryList(reviewRecords.value, reportScope.value, reportNames.value, coverage.value))
const reportHeading = computed(() => `${report.value.level.toUpperCase()} ${reportType.value === 'target' ? 'TARGET VS. ACTUAL ACCOMPLISHMENT REPORT' : 'PAYMENT MODE BREAKDOWN REPORT'}`)
const reportScopeText = computed(() => reportLevel.value === 'regional'
  ? 'Davao Region · All provinces'
  : reportLevel.value === 'provincial'
    ? `Province of ${reportProvinceName.value}`
    : `Municipality of ${reportMunicipalityName.value}, ${reportProvinceName.value}`)
function setCoverage(preset: 'today' | 'week' | 'month' | 'all') {
  const today = manilaDate(0)
  coverageTo.value = preset === 'all' ? '' : today
  coverageFrom.value = preset === 'today' ? today : preset === 'week' ? manilaDate(6) : preset === 'month' ? `${today.slice(0, 8)}01` : ''
}
const coverageText = computed(() => {
  const { from, to } = coverage.value
  if (!from && !to) return 'All dates to date'
  if (from && to) return from === to ? dayLabel(from) : `${dayLabel(from)} to ${dayLabel(to)}`
  return from ? `From ${dayLabel(from)}` : `Up to ${dayLabel(to)}`
})
const dayLabel = (iso?: string) => iso ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${iso}T00:00:00+08:00`)) : '—'
const reportStamp = computed(() => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(now.value))
watch(reportProvince, () => { reportMunicipality.value = '' })

// ---- Community concerns (second Google Sheet) ----
const concerns = ref<Concern[]>([])
const concernsError = ref('')
const concernsLoading = ref(false)
const concernArea = ref('all')
const concernProvince = ref('all')
const concernStatus = ref<'all' | ConcernStatus>('all')
const concernQuery = ref('')
const concernPage = ref(1)
const CONCERN_PAGE_SIZE = 12
const concernCounts = computed(() => ({
  total: concerns.value.length,
  open: concerns.value.filter((item) => item.status === 'Open').length,
  responded: concerns.value.filter((item) => item.status === 'Responded').length,
  resolved: concerns.value.filter((item) => item.status === 'Resolved').length,
}))
const concernAreas = computed(() => [...new Set(concerns.value.map((item) => item.area))])
const concernProvinces = computed(() => [...new Set(concerns.value.map((item) => item.province).filter(Boolean))].sort())
const areaBreakdown = computed(() => concernAreas.value.map((area) => {
  const items = concerns.value.filter((item) => item.area === area)
  const count = (status: ConcernStatus) => items.filter((item) => item.status === status).length
  return { area, total: items.length, open: count('Open'), responded: count('Responded'), resolved: count('Resolved') }
}))
const filteredConcerns = computed(() => {
  const query = concernQuery.value.trim().toLowerCase()
  return concerns.value.filter((item) =>
    (concernArea.value === 'all' || item.area === concernArea.value)
    && (concernProvince.value === 'all' || item.province === concernProvince.value)
    && (concernStatus.value === 'all' || item.status === concernStatus.value)
    && (!query || `${item.concern} ${item.response} ${item.area} ${item.province}`.toLowerCase().includes(query)))
})
const concernTotalPages = computed(() => Math.max(1, Math.ceil(filteredConcerns.value.length / CONCERN_PAGE_SIZE)))
const pagedConcerns = computed(() => paginateRecords(filteredConcerns.value, concernPage.value, CONCERN_PAGE_SIZE))
watch([concernArea, concernProvince, concernStatus, concernQuery], () => { concernPage.value = 1 })
watch(concernTotalPages, (pages) => { if (concernPage.value > pages) concernPage.value = pages })

// Clicking a concern opens the Google Sheet on its RESPONSE cell, so it can be answered right there.
const openInSheet = (item: Concern) => window.open(item.answerUrl, '_blank', 'noopener,noreferrer')

async function loadConcerns(force = false) {
  concernsLoading.value = true
  try {
    const session = authClient ? (await authClient.auth.getSession()).data.session : null
    if (!session && !devBypass) return
    const response = await fetch(force ? '/concerns-data?fresh=1' : '/concerns-data', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} })
    if (!response.ok) {
      const detail = await response.json().then((body: { error?: string }) => body.error, () => undefined)
      throw new Error(detail ?? 'Unable to load ESSI Community Support')
    }
    concerns.value = (await response.json() as { concerns: Concern[] }).concerns
    concernsError.value = ''
  } catch (error) {
    concernsError.value = error instanceof Error ? error.message : 'Unable to load ESSI Community Support'
  } finally {
    concernsLoading.value = false
  }
}

function navigate(view: View) {
  activeView.value = view
  menuOpen.value = false
  if (view === 'approvals') loadProfiles()
  if (view === 'concerns') loadConcerns()
}

async function refreshData() {
  refreshing.value = true
  await loadGoogleSheets(true)
  refreshing.value = false
}

// A new deploy renames the hashed bundle in index.html. Offer the update instead of needing a manual hard refresh.
const loadedBundle = () => document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') ?? null
async function checkForNewVersion() {
  const current = loadedBundle()
  if (!current || updateAvailable.value) return // the dev server has no hashed bundle
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text()
    const latest = html.match(/\/assets\/index-[^"']+\.js/)?.[0]
    if (latest && latest !== current) updateAvailable.value = true
  } catch {
    // offline: try again on the next check
  }
}
const reloadApp = () => window.location.reload()
// Background tabs do not poll; the moment the tab is visible again everything catches up at once.
function onVisibilityChange() {
  if (document.hidden || !loggedIn.value) return
  loadGoogleSheets()
  loadConcerns()
  if (superAdmin.value) loadProfiles(true)
  checkForNewVersion()
}

async function refreshDataInBackground() {
  await loadGoogleSheets()
}

async function logout() {
  authBusy.value = true
  try {
    await auth?.signOut()
    currentUser.value = null
    profile.value = null
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Unable to log out'
  }
  authBusy.value = false
  menuOpen.value = false
  firstChart?.dispose(); secondChart?.dispose(); modeChart?.dispose()
}

function makeCharts() {
  firstChart?.dispose(); secondChart?.dispose(); modeChart?.dispose()
  if (!chartOne.value || !chartTwo.value || activeView.value === 'reports') return
  firstChart = init(chartOne.value)
  secondChart = init(chartTwo.value)
  makePaymentCharts()
  const text = { color: '#526377', fontFamily: 'Inter, ui-sans-serif, system-ui' }
  if (isProvinceView.value) {
    const p = selectedProvince.value
    const series = dailySeries(scopeSummary.value?.daily ?? p.daily ?? {})
    const zoom = zoomFor(series.length)
    firstChart.setOption({
      grid: { left: 44, right: 18, top: 38, bottom: zoom.bottom }, dataZoom: zoom.zoom,
      tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: series.map((d) => d[0]), axisLabel: { ...text, interval: 0 } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [{
        name: 'Province accomplishments', type: 'line', data: series.map((d) => d[1]), smooth: 0.3, symbol: 'circle', symbolSize: 9,
        lineStyle: { width: 3, color: colorOf(p.id) }, itemStyle: { color: colorOf(p.id), borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: fade(colorOf(p.id), '55') }, { offset: 1, color: fade(colorOf(p.id), '00') }] } },
        label: { show: true, position: 'top', color: '#24364b', fontWeight: 700 },
      }],
    })
    secondChart.setOption({
      grid: { left: 48, right: 20, top: 38, bottom: 36 }, tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['Target', ACCOMPLISHMENT_TO_DATE, 'Remaining Target'], axisLabel: text },
      yAxis: { type: 'value', axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [{ type: 'bar', barWidth: '42%', data: [
        { value: displayMetrics.value.target, itemStyle: { color: '#3b82f6', borderRadius: [6, 6, 0, 0] } },
        { value: displayMetrics.value.accomplished, itemStyle: { color: '#10b981', borderRadius: [6, 6, 0, 0] } },
        { value: displayMetrics.value.remaining, itemStyle: { color: '#f59e0b', borderRadius: [6, 6, 0, 0] } },
      ], label: { show: true, position: 'top', color: '#24364b', fontWeight: 700 } }],
    })
  } else {
    // Vertical grouped bars, one pair per province, with the full province name under each pair (wrapped on two lines).
    firstChart.setOption({
      grid: { left: 52, right: 16, top: 40, bottom: 44 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: unknown) => number.format(Number(value)) },
      xAxis: {
        type: 'category', data: provinces.map((p) => p.name), axisTick: { show: false },
        axisLabel: { ...text, interval: 0, fontWeight: 600, lineHeight: 16, formatter: (name: string) => name.replace(/^Davao /, 'Davao\n').replace(/\b(de|del)\b/, (word) => word[0].toUpperCase() + word.slice(1)) },
      },
      yAxis: { type: 'value', minInterval: 1, axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [
        { name: 'Target', type: 'bar', barGap: '6%', barCategoryGap: '8%', barMaxWidth: 64, data: provinces.map((p) => ({ value: p.target, itemStyle: { color: mix(colorOf(p.id), '#ffffff', 0.4), borderRadius: [6, 6, 0, 0] } })), itemStyle: { color: '#93a8d8', borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: 'top', color: '#5b6f84', fontWeight: 700, formatter: (item: { value: unknown }) => number.format(Number(item.value)) } },
        { name: 'Actual', type: 'bar', barMaxWidth: 64, data: provinces.map((p) => ({ value: p.accomplished, itemStyle: { color: mix(colorOf(p.id), '#000000', 0.22), borderRadius: [6, 6, 0, 0] } })), itemStyle: { color: '#0f7a58', borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: 'top', color: '#0f5f49', fontWeight: 800, formatter: (item: { value: unknown; dataIndex: number }) => number.format(Number(item.value)) + '\n' + completionOf(provinces[item.dataIndex]) + '%' } },
      ],
    })
    const zoom = zoomFor(daily.value.length)
    secondChart.setOption({
      grid: { left: 48, right: 18, top: 40, bottom: zoom.bottom }, dataZoom: zoom.zoom, tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: daily.value.map(d => d[0]), axisLabel: { ...text, interval: 0 } }, yAxis: { type: 'value', minInterval: 1, axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [{
        name: 'Region accomplishments', type: 'line', data: daily.value.map(d => d[1]), smooth: 0.3, symbol: 'circle', symbolSize: 9,
        lineStyle: { width: 3.5, color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#2563eb' }, { offset: 1, color: '#8b5cf6' }] } }, itemStyle: { color: '#7c3aed', borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(124,58,237,.30)' }, { offset: 1, color: 'rgba(37,99,235,0)' }] } },
        label: { show: true, position: 'top', color: '#24364b', fontWeight: 700 },
      }],
    })
  }
}

function makePaymentCharts() {
  if (!chartMode.value) return
  const { modes, modeShare, total } = paymentReport.value
  if (!modes.length) return
  const text = { color: '#526377', fontFamily: 'Inter, ui-sans-serif, system-ui' }
  modeChart = init(chartMode.value)
  const narrow = chartMode.value.clientWidth < 360
  modeChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { ...text, fontWeight: 600, fontSize: 13 }, itemWidth: 14, itemHeight: 14 },
    series: [{
      type: 'pie', radius: paymentDonutRadius(chartMode.value.clientWidth), center: ['50%', '45%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 6 },
      label: { position: 'outside', ...PAYMENT_DONUT_LABEL_LAYOUT, color: '#24364b', fontWeight: 700, fontSize: narrow ? 12 : 13, formatter: '{d}%' },
      labelLine: { show: true, length: 10, length2: 6, lineStyle: { color: '#94a3b8' } },
      data: modeShare.map((item) => ({ name: item.mode, value: item.count, itemStyle: { color: modeColor(modes.indexOf(item.mode)) } })),
    }],
    graphic: [
      { type: 'text', z: PAYMENT_DONUT_GRAPHIC_Z, left: 'center', top: narrow ? '36%' : '32%', style: { text: number.format(total.actual), textAlign: 'center', fill: '#24364b', fontSize: narrow ? 22 : 30, fontWeight: 800 } },
      { type: 'text', z: PAYMENT_DONUT_GRAPHIC_Z, left: 'center', top: narrow ? '45%' : '42%', style: { text: 'validated', textAlign: 'center', fill: '#6d7c8c', fontSize: narrow ? 10 : 13, fontWeight: 600 } },
      { type: 'text', z: PAYMENT_DONUT_GRAPHIC_Z, left: 'center', top: narrow ? '50%' : '47%', style: { text: `${total.percent}%`, textAlign: 'center', fill: '#047857', fontSize: narrow ? 14 : 18, fontWeight: 800 } },
      { type: 'text', z: PAYMENT_DONUT_GRAPHIC_Z, left: 'center', top: narrow ? '55.5%' : '53%', style: { text: 'of target', textAlign: 'center', fill: '#6d7c8c', fontSize: narrow ? 10 : 12, fontWeight: 600 } },
    ],
  })
}

function handleResize() { firstChart?.resize(); secondChart?.resize(); modeChart?.resize() }

// force skips the server cache so the Refresh button always pulls live sheet data.
async function loadGoogleSheets(force = false) {
  try {
    const session = authClient ? (await authClient.auth.getSession()).data.session : null
    if (!session && !devBypass) return // the data is private; it loads once the user is signed in and approved
    const response = await fetch(force ? '/sheet-data?fresh=1' : '/sheet-data', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} })
    if (!response.ok) {
      const detail = await response.json().then((body: { error?: string }) => body.error, () => undefined)
      throw new Error(detail ?? 'Google Sheets returned an error')
    }
    // Nothing new since the last poll (the server answers 304 and the browser replays its copy): skip the parse and redraw.
    const etag = response.headers.get('ETag')
    if (etag && etag === sheetEtag) { markSynced(); return }
    const snapshot = await response.json() as {
      provinces: Province[]
      daily: Array<{ date: string; value: number }>
      records: ReviewRecord[]
      lastRefresh: string
    }
    provinces.splice(0, provinces.length, ...snapshot.provinces)
    reviewRecords.value = snapshot.records ?? []
    dailyMap.value = Object.fromEntries(snapshot.daily.map((item) => [item.date, item.value]))
    daily.value = dailySeries(dailyMap.value)
    lastRefresh.value = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date())
    sheetEtag = etag
    markSynced()
    await nextTick()
    makeCharts()
  } catch (error) {
    dataConnected.value = false
    dataError.value = error instanceof Error ? error.message : 'Unable to connect to Google Sheets'
  }
}

// appAccess/profileBusy decide when the dashboard actually mounts, so charts must redraw then too.
watch([activeView, selectedProvinceId, municipality, loggedIn, appAccess, profileBusy], async () => { await nextTick(); makeCharts() })
watch(appAccess, (access) => { if (access === 'approved') { loadGoogleSheets(); loadConcerns() } })
watch(superAdmin, (isAdmin) => { if (isAdmin) loadProfiles(true) })
watch(selectedProvinceId, () => { municipality.value = 'all' })
watch([reviewProvinceId, selectedProvinceId], () => { reviewMunicipality.value = 'all'; reviewBarangay.value = 'all' })
watch(reviewMunicipality, () => { reviewBarangay.value = 'all' })
watch([selectedProvinceId, municipality, reviewProvinceId, reviewQuery, reviewStatus, reviewMunicipality, reviewBarangay, reviewMode, validatedFrom, validatedTo, claimedFrom, claimedTo, reviewRemarks], () => { reviewPage.value = 1 })
watch(reviewTotalPages, (totalPages) => { if (reviewPage.value > totalPages) reviewPage.value = totalPages })
onMounted(async () => {
  window.addEventListener('resize', handleResize)
  document.addEventListener('click', closeAccountMenu)
  document.addEventListener('keydown', closeAccountMenu)
  clockTimer = window.setInterval(() => { now.value = new Date() }, 1000)
  loadGoogleSheets()
  if (devBypass) {
    managedProfiles.value = [
      { id: 'sample-1', email: 'new.user@example.com', fullName: 'Sample Applicant', position: 'Provincial Link', province: 'Davao del Sur', status: 'pending', isSuperAdmin: false },
      { id: 'sample-2', email: 'jeff@example.com', fullName: 'Sample Member', position: 'Encoder', province: 'Davao Oriental', status: 'approved', isSuperAdmin: false },
    ]
    currentUser.value = { id: 'local-dev', email: 'dev@localhost', user_metadata: { full_name: 'Local Developer' } } as unknown as User
    if (devPreview !== 'profile') profile.value = { id: 'local-dev', email: 'dev@localhost', fullName: 'Local Developer', position: 'Super Administrator', province: 'Regional Office', status: devPreview === 'pending' || devPreview === 'denied' ? devPreview : 'approved', isSuperAdmin: devPreview === null }
  } else if (auth) {
    try {
      currentUser.value = await auth.getUser()
      await loadProfile()
    } catch (error) {
      authError.value = error instanceof Error ? error.message : 'Unable to restore your sign-in session'
    }
    const listener = authClient?.auth.onAuthStateChange((_event, session) => {
      currentUser.value = session?.user ?? null
      if (session?.user) loadProfile(session.user)
      else profile.value = null
      authBusy.value = false
    })
    unsubscribeAuth = () => listener?.data.subscription.unsubscribe()
  }
  authBusy.value = false
  await nextTick()
  if (!devBypass && authConfigured && googleSignInConfigured && turnstileConfigured) await setupLoginSecurity()
  let tick = 0
  refreshTimer = window.setInterval(() => {
    if (document.hidden) return
    tick += 1
    if (loggedIn.value) refreshDataInBackground()
    if (superAdmin.value) loadProfiles(true)
    if (loggedIn.value) loadConcerns()
    if (tick % 4 === 0) checkForNewVersion()
  }, 15_000)
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('click', closeAccountMenu)
  document.removeEventListener('keydown', closeAccountMenu)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (refreshTimer) window.clearInterval(refreshTimer)
  window.clearInterval(clockTimer)
  unsubscribeAuth?.()
  firstChart?.dispose(); secondChart?.dispose(); modeChart?.dispose()
})
</script>

<template>
  <main v-if="!loggedIn" class="login-shell">
    <section class="login-panel" aria-labelledby="login-title">
      <div class="login-card">
        <img class="seal" src="/logo.png" alt="" aria-hidden="true" />
        <p class="eyebrow">Department of Social Welfare and Development</p>
        <h1 id="login-title">4Ps Enhanced Support Services Intervention</h1>
        <div class="auth-tabs" role="tablist" aria-label="Sign in or register"><button type="button" role="tab" :aria-selected="authMode === 'signin'" :class="{ active: authMode === 'signin' }" @click="authMode = 'signin'">Sign in</button><button type="button" role="tab" :aria-selected="authMode === 'register'" :class="{ active: authMode === 'register' }" @click="authMode = 'register'">Register</button></div>
        <p v-if="authMode === 'signin'" class="login-copy">Sign in to view the regional and provincial accomplishment dashboards.</p>
        <p v-else class="login-copy">New here? Verify, continue with Google, then enter your name and position and choose your province or the Regional Program Management Office. The Super Administrator approves your request.</p>
        <span class="live-chip secure"><i></i>Private dashboard · approved accounts only</span>
        <div v-if="authError" class="auth-error" role="alert">{{ authError }}</div>
        <ol class="sign-steps">
          <li :class="{ done: captchaToken }"><span class="step-num">1</span><div class="step-body"><strong>Security check</strong>
            <div class="captcha-block"><div ref="turnstileMount" aria-label="Security verification"></div><p class="security-note">{{ captchaMessage }}</p></div></div></li>
          <li :class="{ ready: captchaToken }"><span class="step-num">2</span><div class="step-body"><strong>{{ authMode === 'signin' ? 'Continue with Google' : 'Register with Google' }}</strong>
            <div v-show="captchaToken && !authBusy" ref="googleButtonMount" class="google-button-mount" aria-label="Continue with Google"></div>
            <p v-if="!captchaToken" class="security-note">Unlocks once the security check is complete.</p></div></li>
        </ol>
        <p class="security-note">Use your Gmail or Google Workspace corporate email.</p>
        <p class="security-note">Department of Social Welfare and Development · Republic of the Philippines</p>
        <p v-if="!authConfigured || !googleSignInConfigured || !turnstileConfigured" class="setup-note">Administrator setup is required before Google sign-in can be used.</p>
      </div>
    </section>
    <aside class="login-context" aria-label="System overview">
      <div class="context-body"><h2>Pantawid Pamilyang Pilipino Program</h2><p class="context-sub">Enhanced Support Services Intervention</p><p class="context-office">Regional Program Management Office Monitoring</p></div>
    </aside>
  </main>

  <main v-else-if="profileBusy" class="login-shell">
    <section class="login-panel"><div class="login-card"><p class="eyebrow">Checking access</p><h1>One moment…</h1><p class="login-copy">We are securely checking your account status.</p></div></section>
    <aside class="login-context" aria-label="System overview"></aside>
  </main>

  <main v-else-if="appAccess === 'profile'" class="login-shell">
    <section class="login-panel" aria-labelledby="profile-title">
      <div class="login-card">
        <img class="seal" src="/logo.png" alt="" aria-hidden="true" />
        <ol class="stepper" aria-label="Registration progress"><li class="done">Sign in</li><li class="current">Your profile</li><li>Approval</li></ol>
        <p class="eyebrow">First-time sign-in</p>
        <h1 id="profile-title">Tell us about yourself</h1>
        <p class="login-copy">Your account will be reviewed by the Super Administrator before dashboard access is granted.</p>
        <div class="signed-chip"><span class="avatar-mini">{{ (currentUser?.email ?? '?')[0].toUpperCase() }}</span><span>Signed in as <strong>{{ currentUser?.email }}</strong></span></div>
        <div v-if="profileError" class="auth-error" role="alert">{{ profileError }}</div>
        <form class="profile-form" @submit.prevent="submitProfile">
          <label>Full name<span class="field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg><input v-model="profileForm.fullName" required autocomplete="name" placeholder="e.g. Maria Santos" /></span></label>
          <label>Position<span class="field"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg><input v-model="profileForm.position" required autocomplete="organization-title" placeholder="e.g. Provincial Link" /></span></label>
          <label>Province or office<span class="field"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg><select v-model="profileForm.province" required><option disabled value="">Select your province or office</option><option value="Regional Program Management Office">Regional Program Management Office</option><option v-for="item in provinces" :key="item.id" :value="item.name">{{ item.name }}</option></select></span></label>
          <button class="primary-button" :disabled="profileBusy">{{ profileBusy ? 'Submitting…' : 'Submit for approval' }}</button>
        </form>
        <button class="link-button" @click="logout">Not you? Sign out</button>
      </div>
    </section>
    <aside class="login-context" aria-label="Approval process">
      <div class="context-body"><span class="context-kicker">Secure access</span><h2>Approved people only.</h2><p>Complete the short profile form. The Super Administrator will review your request in the application.</p></div>
      <ol class="timeline">
        <li class="done"><span>1</span><div><strong>Sign in</strong><small>Your Google account is verified.</small></div></li>
        <li class="current"><span>2</span><div><strong>Submit your profile</strong><small>Name, position and province.</small></div></li>
        <li><span>3</span><div><strong>Review</strong><small>The Super Administrator approves your request.</small></div></li>
        <li><span>4</span><div><strong>Open the dashboard</strong><small>You are signed in automatically once approved.</small></div></li>
      </ol>
    </aside>
  </main>

  <main v-else-if="appAccess === 'pending'" class="login-shell">
    <section class="login-panel"><div class="login-card"><img class="seal" src="/logo.png" alt="" aria-hidden="true" /><p class="eyebrow">Request received</p><h1>Waiting for approval</h1><p class="login-copy">Your request has been submitted. You will be able to use the dashboard after the Super Administrator approves your account.</p><button class="secondary-button" @click="() => loadProfile()">Check again</button><button class="secondary-button" @click="logout">Sign out</button></div></section>
    <aside class="login-context" aria-label="Approval process"><div><span class="context-kicker">Secure access</span><h2>Your request is in review.</h2></div></aside>
  </main>

  <main v-else-if="appAccess === 'denied'" class="login-shell">
    <section class="login-panel"><div class="login-card"><img class="seal" src="/logo.png" alt="" aria-hidden="true" /><p class="eyebrow">Access unavailable</p><h1>Request not approved</h1><p class="login-copy">This account does not currently have access to the dashboard. Please contact the Regional Program Management Office if you need assistance.</p><button class="secondary-button" @click="logout">Sign out</button></div></section>
    <aside class="login-context" aria-label="Access unavailable"></aside>
  </main>

  <div v-else class="app-shell">
    <header class="topbar">
      <button class="icon-button mobile-only" aria-label="Open navigation" @click="menuOpen = !menuOpen"><span></span><span></span><span></span></button>
      <div class="brand"><img class="mini-seal" src="/logo.png" alt="4Ps logo" /><div><small class="brand-kicker">Pantawid Pamilyang Pilipino Program</small><strong>4Ps Enhanced Support Services Intervention</strong><span>Regional Program Management Office</span></div></div>
      <div class="topbar-actions"><div class="clock" aria-label="Current date and time"><strong>{{ clockTime }}</strong><span>{{ clockDate }}</span></div><span class="sample-pill" :class="{ live: dataConnected }">{{ dataConnected ? 'Live Google Sheets' : 'Connecting…' }}<small v-if="dataConnected && syncLabel" class="sync-label">{{ syncLabel }}</small></span><div class="account"><button class="avatar" aria-label="Open account menu" aria-haspopup="menu" :aria-expanded="accountMenuOpen" @click="accountMenuOpen = !accountMenuOpen">{{ accountInitials || (role === 'regional' ? 'RA' : 'DS') }}</button><div v-if="accountMenuOpen" class="account-menu" role="menu"><div class="account-id"><strong>{{ accountName }}</strong><span>{{ currentUser?.email ?? 'Google account' }}</span></div><button class="account-logout" role="menuitem" @click="accountMenuOpen = false; logout()"><i>↪</i>Log out</button></div></div></div>
    </header>
    <aside class="sidebar" :class="{ open: menuOpen }">
      <nav aria-label="Main navigation">
        <button v-if="role === 'regional'" :class="{ active: activeView === 'overview' }" @click="navigate('overview')"><i>⌂</i>Regional Overview</button>
        <button :class="{ active: activeView === 'province' }" @click="navigate('province')"><i>▦</i>{{ role === 'regional' ? 'Provincial Overview' : 'Provincial Dashboard' }}</button>
        <button :class="{ active: activeView === 'reports' }" @click="navigate('reports')"><i>▤</i>Reports & Printing</button>
        <button :class="{ active: activeView === 'concerns' }" @click="navigate('concerns')"><i>✎</i>ESSI Community Support<span v-if="concernCounts.open" class="notify-dot soft" :aria-label="`${concernCounts.open} open concerns`">{{ concernCounts.open }}</span></button>
        <button v-if="superAdmin" :class="{ active: activeView === 'approvals' }" @click="navigate('approvals')"><i>☺</i>User Management<span v-if="profileCounts.pending" class="notify-dot" :aria-label="`${profileCounts.pending} pending access requests`">{{ profileCounts.pending }}</span></button>
      </nav>
    </aside>

    <main class="content">
      <template v-if="activeView !== 'reports' && activeView !== 'approvals' && activeView !== 'concerns'">
        <section class="page-heading">
          <div><p class="breadcrumb">Dashboard / {{ isProvinceView ? selectedProvince.name + (municipalityActive ? ' / ' + municipality : '') : 'Regional Overview' }}</p><h1>{{ isProvinceView ? `${selectedProvince.name} Dashboard` : 'Regional Overview' }}</h1><p>Monitor targets and verified daily accomplishments for {{ period.toLowerCase() }}.</p></div>
          <div class="heading-actions">
            <label v-if="role === 'regional' && isProvinceView">Province<select id="province" v-model="selectedProvinceId"><option v-for="item in provinces" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
            <label v-if="isProvinceView">Municipality<select v-model="municipality"><option value="all">All municipalities</option><option v-for="item in municipalities" :key="item" :value="item">{{ item }}</option></select></label>
            <label>Reporting period<select v-model="period"><option>Today</option><option>This week</option><option>This month</option></select></label>
            <button class="refresh-button" :disabled="refreshing" @click="refreshData"><svg class="refresh-icon" :class="{ spinning: refreshing }" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>{{ refreshing ? 'Refreshing…' : 'Refresh Data' }}</button>
          </div>
        </section>
        <div v-if="dataError" class="connection-error" role="alert">Live Google Sheets connection failed: {{ dataError }}. The last available values remain on screen.</div>
        <section class="metrics" aria-label="Performance summary">
          <article><span>{{ isProvinceView ? (municipalityActive ? 'Municipal target' : 'Provincial Target') : 'Regional Target' }}</span><strong>{{ displayMetrics.target ? number.format(displayMetrics.target) : 'Not set' }}</strong><small>{{ displayMetrics.target ? 'Valid beneficiary records' : 'No valid beneficiary records' }}</small></article>
          <article><span>{{ ACCOMPLISHMENT_TO_DATE }}</span><strong class="green">{{ number.format(displayMetrics.accomplished) }}</strong><small>{{ displayMetrics.percentage === null ? 'Cash Card + E-Wallet rows' : `${displayMetrics.percentage}% of target` }}</small></article>
          <article><span>Remaining Target</span><strong>{{ displayMetrics.target ? number.format(displayMetrics.remaining) : '—' }}</strong><small>{{ displayMetrics.target ? 'To reach target' : 'Target required' }}</small></article>
          <article><span>Completion Rate</span><strong class="blue">{{ displayMetrics.percentage === null ? '—' : `${displayMetrics.percentage}%` }}</strong><div class="progress"><span :style="{ width: `${displayMetrics.percentage ?? 0}%` }"></span></div></article>
          <article><span>Completed Today</span><strong>{{ number.format(displayMetrics.today) }}</strong><small>As of latest refresh</small></article>
        </section>
        <section class="chart-grid">
          <article class="card"><header><div><h2>{{ isProvinceView ? 'Daily Accomplishment' : 'Provincial Performance' }}</h2><p>{{ isProvinceView ? rangeNote(scopeSummary?.daily ?? selectedProvince.daily ?? {}) : 'Target vs. Actual Accomplishments' }}</p></div><span class="status-dot">Current</span></header><div ref="chartOne" class="chart"></div><p v-if="isProvinceView" class="chart-note">The sheet has no validation date, so each record is counted on the day it was first detected as validated.</p></article>
          <article class="card"><header><div><h2>{{ isProvinceView ? 'Target vs. Actual' : 'Regional Daily Output' }}</h2><p>{{ isProvinceView ? period : rangeNote(dailyMap) }}</p></div></header><div ref="chartTwo" class="chart"></div><p v-if="!isProvinceView" class="chart-note">The sheet has no validation date, so each record is counted on the day it was first detected as validated.</p></article>
        </section>
        <section class="card payment-report">
          <header><div><h2>Mode of Payment</h2><p>{{ isProvinceView ? 'Breakdown by municipality · ' + selectedProvince.name : 'Breakdown by province' }} · accomplished beneficiaries per payment mode</p></div><button @click="openPaymentReport()">Open report</button></header>
          <div class="payment-grid">
            <div class="table-scroll"><table class="mode-table"><thead><tr><th>{{ paymentReport.childLabel }}</th><th>Target</th><th v-for="(mode, index) in paymentReport.modes" :key="mode"><i class="mode-dot" :style="{ background: modeColor(index) }"></i>{{ mode }}</th><th>Validated</th><th>For Validation</th></tr></thead>
              <tbody><tr v-for="row in paymentReport.rows" :key="row.name" @click="openPaymentRow(row.name)" :class="{ active: isProvinceView && municipality === row.name }"><td><strong>{{ row.name }}</strong></td><td>{{ number.format(row.target) }}</td><td v-for="mode in paymentReport.modes" :key="mode" :class="{ zero: !(row.modes[mode] ?? 0) }">{{ number.format(row.modes[mode] ?? 0) }}</td><td class="validated-cell"><strong>{{ number.format(row.actual) }}</strong><span class="mode-bar"><i :style="{ width: `${Math.min(row.percent, 100)}%` }"></i></span><small>{{ row.percent }}%</small></td><td class="pending-cell">{{ number.format(row.remaining) }}</td></tr></tbody>
              <tfoot><tr><th>Total</th><th>{{ number.format(paymentReport.total.target) }}</th><th v-for="mode in paymentReport.modes" :key="mode">{{ number.format(paymentReport.total.modes[mode] ?? 0) }}</th><th>{{ number.format(paymentReport.total.actual) }} <small>{{ paymentReport.total.percent }}%</small></th><th>{{ number.format(paymentReport.total.remaining) }}</th></tr></tfoot></table></div>
            <div v-if="paymentReport.modes.length" ref="chartMode" class="chart"></div>
            <p v-else class="chart-note">No validated beneficiaries yet, so there is no payment mode to chart.</p>
          </div>
        </section>
        <section class="card review-table" aria-labelledby="review-title">
          <header><div><h2 id="review-title">Beneficiary review</h2><p>Live records from the provincial Google Sheets</p></div><strong class="record-pill">{{ number.format(filteredReviewRecords.length) }} records</strong></header>
          <div class="filter-panel">
          <div class="review-filters main-filters">
            <label>Province<select v-if="!isProvinceView" v-model="reviewProvinceId"><option value="all">All provinces</option><option v-for="item in provinces" :key="item.id" :value="item.id">{{ item.name }}</option></select><input v-else :value="selectedProvince.name" readonly aria-label="Selected province" /></label>
            <label v-if="!isProvinceView">Municipality<select v-model="reviewMunicipality"><option value="all">All municipalities</option><option v-for="item in reviewMunicipalities" :key="item" :value="item">{{ item }}</option></select></label>
            <label v-if="isProvinceView">Status<select v-model="reviewStatus"><option value="all">All records</option><option value="accomplished">Validated</option><option value="pending">For Validation</option></select></label>
            <label>Payment mode<select v-model="reviewMode"><option value="all">All modes</option><option v-for="item in reviewModes" :key="item" :value="item">{{ item }}</option></select></label>
            <label class="review-search">Search<input v-model="reviewQuery" type="search" placeholder="Name, household ID, account, location or remarks" /></label>
          </div>
          <div class="filter-bar">
          <details class="more-filters" :open="reviewFiltersActive > 0">
            <summary>More filters<span v-if="reviewFiltersActive" class="filter-count">{{ reviewFiltersActive }} active</span></summary>
            <div class="review-filters more-grid">
              <label>Barangay<select v-model="reviewBarangay"><option value="all">All barangays</option><option v-for="item in reviewBarangays" :key="item" :value="item">{{ item }}</option></select></label>
              <label>Remarks<select v-model="reviewRemarks"><option value="all">All</option><option value="with">With remarks</option><option value="without">Without remarks</option></select></label>
              <label>Date validated · from<input v-model="validatedFrom" type="date" /></label>
              <label>Date validated · to<input v-model="validatedTo" type="date" /></label>
              <label>Date claimed / opened · from<input v-model="claimedFrom" type="date" /></label>
              <label>Date claimed / opened · to<input v-model="claimedTo" type="date" /></label>
            </div>
          </details>
          <button class="clear-filters" :disabled="!reviewFiltersActive" @click="clearReviewFilters">Clear all filters</button>
          </div>
          </div>
          <p v-if="filteredReviewRecords.length === 0" class="empty-state">No beneficiary records match these filters.</p>
          <div v-else class="table-scroll"><table><thead><tr><th>Province</th><th>Beneficiary</th><th>Location</th><th>Household / account</th><th>Payment mode</th><th class="claimed-head">Date Claimed/Account Opened (LBP servicing Branch)</th><th>Status</th><th>Date validated</th><th>Remarks</th></tr></thead><tbody><tr v-for="record in pagedReviewRecords" :key="`${record.province}-${record.id}`" class="clickable-row" @click="selectedReviewRecord = record"><td>{{ record.province }}</td><td><button class="beneficiary-link" @click="selectedReviewRecord = record">{{ record.name || 'Name not provided' }}</button></td><td class="location-cell">{{ [record.municipality, record.barangay].filter(Boolean).join(', ') || '—' }}</td><td>{{ record.accountNumber || record.householdId || '—' }}</td><td>{{ record.paymentMode || '—' }}</td><td class="nowrap-cell">{{ record.payment.dateClaimed ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${record.payment.dateClaimed}T00:00:00+08:00`)) : '—' }}</td><td><span class="review-status" :class="{ complete: record.accomplished }">{{ statusLabel(record) }}</span></td><td class="nowrap-cell">{{ record.validatedDate ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${record.validatedDate}T00:00:00+08:00`)) : '—' }}</td><td class="remarks-cell">{{ record.payment.remarks || '—' }}</td></tr></tbody></table></div>
          <div v-if="filteredReviewRecords.length > REVIEW_PAGE_SIZE" class="pagination" aria-label="Beneficiary review pages"><button :disabled="reviewPage === 1" @click="reviewPage -= 1">Previous</button><span>Page {{ reviewPage }} of {{ reviewTotalPages }}</span><button :disabled="reviewPage === reviewTotalPages" @click="reviewPage += 1">Next</button></div>
        </section>
        <div v-if="selectedReviewRecord" class="detail-backdrop" role="presentation" @click.self="selectedReviewRecord = null">
          <section class="beneficiary-dialog" role="dialog" aria-modal="true" aria-labelledby="beneficiary-detail-title">
            <header><div><p class="eyebrow">Beneficiary record</p><h2 id="beneficiary-detail-title">{{ selectedReviewRecord.name || 'Beneficiary record' }}</h2><span class="review-status" :class="{ complete: selectedReviewRecord.accomplished }">{{ statusLabel(selectedReviewRecord) }}</span></div><button class="dialog-close" aria-label="Close beneficiary details" @click="selectedReviewRecord = null">×</button></header>
            <div class="detail-columns">
            <div>
              <h3 class="dialog-section">Personal information</h3>
              <dl><template v-for="[label, value] in personalInfo(selectedReviewRecord)" :key="label"><dt>{{ label }}</dt><dd><a v-if="isUrl(value)" :href="value" target="_blank" rel="noopener noreferrer">Open link</a><template v-else>{{ value }}</template></dd></template></dl>
              <h3 class="dialog-section">Contact details</h3>
              <dl><template v-for="[label, value] in contactDetails(selectedReviewRecord)" :key="label"><dt>{{ label }}</dt><dd><a v-if="isUrl(value)" :href="value" target="_blank" rel="noopener noreferrer">Open link</a><template v-else>{{ value }}</template></dd></template></dl>
            </div>
            <div>
              <h3 class="dialog-section">School</h3>
              <dl><template v-for="[label, value] in schoolDetails(selectedReviewRecord)" :key="label"><dt>{{ label }}</dt><dd><a v-if="isUrl(value)" :href="value" target="_blank" rel="noopener noreferrer">Open link</a><template v-else>{{ value }}</template></dd></template></dl>
              <h3 class="dialog-section">Payment</h3>
              <dl><template v-for="[label, value] in paymentDetails(selectedReviewRecord)" :key="label"><dt>{{ label }}</dt><dd><a v-if="isUrl(value)" :href="value" target="_blank" rel="noopener noreferrer">Open link</a><template v-else>{{ value }}</template></dd></template></dl>
              <h3 class="dialog-section">Remarks</h3>
              <dl><template v-for="[label, value] in remarksDetails(selectedReviewRecord)" :key="label"><dt>{{ label }}</dt><dd><a v-if="isUrl(value)" :href="value" target="_blank" rel="noopener noreferrer">Open link</a><template v-else>{{ value }}</template></dd></template></dl>
            </div>
            </div>
            <button class="primary-button compact" @click="selectedReviewRecord = null">Close</button>
          </section>
        </div>
        <footer class="refresh-note"><span class="live-dot" :class="{ connected: dataConnected }"></span>{{ dataConnected ? 'Live from Google Sheets' : 'Not connected' }} · Last successful refresh: {{ lastRefresh }} (Asia/Manila)</footer>
      </template>

      <template v-else-if="activeView === 'reports'">
        <section class="page-heading"><div><p class="breadcrumb">Reports & Printing</p><h1>Report Center</h1><p>Build a target vs. actual or payment-mode report for the region, a province or a municipality, then print or save it as PDF.</p></div><button class="primary-button compact" onclick="window.print()">Print / Save as PDF</button></section>
        <section class="report-layout">
          <aside class="report-controls card"><h2>Report settings</h2>
            <div class="coverage-box"><span class="coverage-title">Date coverage</span>
              <div class="coverage-presets"><button type="button" @click="setCoverage('today')">Today</button><button type="button" @click="setCoverage('week')">Last 7 days</button><button type="button" @click="setCoverage('month')">This month</button><button type="button" @click="setCoverage('all')">All dates</button></div>
              <div class="coverage-dates"><label>From<input v-model="coverageFrom" type="date" :max="coverageTo || undefined" /></label><label>To<input v-model="coverageTo" type="date" :min="coverageFrom || undefined" /></label></div>
              <small>Actual counts beneficiaries validated within these dates. Target stays the full list.</small></div>
            <label>Report<select v-model="reportType"><option value="target">Target vs. actual accomplishment</option><option value="payment">Payment mode breakdown</option></select></label>
            <label>Level<select v-model="reportLevel"><option v-if="role === 'regional'" value="regional">Regional · by province</option><option value="provincial">Provincial · by municipality</option><option value="municipal">Municipal · by barangay</option></select></label>
            <label v-if="role === 'regional' && reportLevel !== 'regional'">Province<select v-model="reportProvince"><option v-for="item in provinces" :key="item.id" :value="item.name">{{ item.name }}</option></select></label>
            <label v-if="reportLevel === 'municipal'">Municipality<select v-model="reportMunicipality"><option v-for="item in reportMunicipalities" :key="item" :value="item">{{ item }}</option></select></label>
                        <label>Beneficiary names<select v-model="reportNames"><option value="none">Do not include</option><option value="validated">Validated beneficiaries</option><option value="all">All beneficiaries</option></select></label>
            <p class="report-hint soft">Prints on one 8.5 × 13 in landscape sheet (folio). In the print window, keep Scale at 100% and turn off “Headers and footers”.</p>
            <p v-if="reportNames !== 'none'" class="report-hint">{{ number.format(reportList.length) }} names will be printed under the summary.</p>
            <div class="live-note"><strong>Live data</strong><span>Built from the provincial Google Sheets as of {{ reportStamp }}.</span></div>
          </aside>
          <article class="report-paper" :class="reportDensity">
            <header><img class="report-seal" src="/logo.png" alt="4Ps logo" /><div><small>Department of Social Welfare and Development</small><strong>Pantawid Pamilyang Pilipino Program</strong><span>Enhanced Support Services Intervention</span><small class="office-line">Regional Program Management Office · Davao Region</small></div></header>
            <div class="report-title"><h2>{{ reportHeading }}</h2><p>{{ reportScopeText }}</p><p class="report-coverage"><strong>Date coverage:</strong> {{ coverageText }} · As of {{ reportStamp }}</p></div>

            <template v-if="reportType === 'target'">
              <div class="report-kpis"><div><span>Target beneficiaries</span><strong>{{ number.format(report.total.target) }}</strong></div><div><span>Actual (validated{{ coverage.from || coverage.to ? ' in coverage' : '' }})</span><strong>{{ number.format(report.total.actual) }}</strong></div><div><span>Remaining Target</span><strong>{{ number.format(report.total.remaining) }}</strong></div><div><span>Completion Rate</span><strong>{{ report.total.percent }}%</strong></div></div>
              <table class="report-table"><thead><tr><th>{{ report.childLabel }}</th><th>Target</th><th>Actual</th><th>Remaining Target</th><th>Completion Rate</th></tr></thead>
                <tbody><tr v-for="row in report.rows" :key="row.name"><td>{{ row.name }}</td><td>{{ number.format(row.target) }}</td><td>{{ number.format(row.actual) }}</td><td>{{ number.format(row.remaining) }}</td><td class="pct-cell"><span class="pct-bar"><i :style="{ width: `${row.percent}%` }"></i></span>{{ row.percent }}%</td></tr></tbody>
                <tfoot><tr><th>TOTAL</th><th>{{ number.format(report.total.target) }}</th><th>{{ number.format(report.total.actual) }}</th><th>{{ number.format(report.total.remaining) }}</th><th>{{ report.total.percent }}%</th></tr></tfoot></table>
            </template>

            <template v-else>
              <table class="report-table share-table"><thead><tr><th>Payment mode</th><th>Validated beneficiaries</th><th>Share of validated</th></tr></thead>
                <tbody><tr v-for="item in report.modeShare" :key="item.mode"><td>{{ item.mode }}</td><td>{{ number.format(item.count) }}</td><td class="pct-cell"><span class="pct-bar"><i :style="{ width: `${item.percent}%` }"></i></span>{{ item.percent }}%</td></tr><tr v-if="report.modeShare.length === 0"><td colspan="3">No beneficiary has been validated yet.</td></tr></tbody>
                <tfoot><tr><th>TOTAL VALIDATED</th><th>{{ number.format(report.total.actual) }}</th><th>{{ report.total.actual ? '100%' : '—' }}</th></tr></tfoot></table>
              <h3 class="report-subhead">Breakdown by {{ report.childLabel.toLowerCase() }}</h3>
              <table class="report-table"><thead><tr><th>{{ report.childLabel }}</th><th>Target</th><th v-for="mode in report.modes" :key="mode">{{ mode }}</th><th>Validated</th><th>For validation</th></tr></thead>
                <tbody><tr v-for="row in report.rows" :key="row.name"><td>{{ row.name }}</td><td>{{ number.format(row.target) }}</td><td v-for="mode in report.modes" :key="mode">{{ number.format(row.modes[mode] ?? 0) }}</td><td>{{ number.format(row.actual) }}</td><td>{{ number.format(row.remaining) }}</td></tr></tbody>
                <tfoot><tr><th>TOTAL</th><th>{{ number.format(report.total.target) }}</th><th v-for="mode in report.modes" :key="mode">{{ number.format(report.total.modes[mode] ?? 0) }}</th><th>{{ number.format(report.total.actual) }}</th><th>{{ number.format(report.total.remaining) }}</th></tr></tfoot></table>
            </template>

            <template v-if="reportNames !== 'none'">
              <h3 class="report-subhead">{{ reportNames === 'validated' ? 'Validated beneficiaries' : 'All beneficiaries' }} ({{ number.format(reportList.length) }})</h3>
              <table class="report-table names-table"><thead><tr><th>#</th><th>Beneficiary</th><th>Municipality</th><th>Barangay</th><th>Payment mode</th><th>Date validated</th><th>Status</th></tr></thead>
                <tbody><tr v-for="(person, index) in reportList" :key="`${person.province}-${person.id}`"><td>{{ index + 1 }}</td><td>{{ person.name || 'Name not provided' }}<small v-if="reportLevel === 'regional'">{{ person.province }}</small></td><td>{{ person.municipality || '—' }}</td><td>{{ person.barangay || '—' }}</td><td>{{ person.paymentMode || '—' }}</td><td>{{ dayLabel(person.validatedDate) }}</td><td>{{ statusLabel(person) }}</td></tr></tbody></table>
            </template>

            <div class="signatures"><div><span>Prepared by:</span><i></i><strong>Name and Signature</strong></div><div><span>Reviewed / Approved by:</span><i></i><strong>Name and Signature</strong></div></div>
            <footer>Generated {{ reportStamp }} (Asia/Manila)<span>{{ reportHeading }}</span></footer>
          </article>
        </section>
      </template>

      <template v-else-if="activeView === 'concerns'">
        <section class="page-heading"><div><p class="breadcrumb">Dashboard / ESSI Community Support</p><h1>ESSI Community Support</h1><p>Questions, issues and recommendations raised from the field, and the response given.</p></div>
          <div class="heading-actions"><a class="refresh-button link-as-button" :href="CONCERNS_SHEET_URL" target="_blank" rel="noopener noreferrer">Add or edit in Google Sheets ↗</a><button class="refresh-button" :disabled="concernsLoading" @click="loadConcerns(true)"><svg class="refresh-icon" :class="{ spinning: concernsLoading }" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>{{ concernsLoading ? 'Refreshing…' : 'Refresh' }}</button></div></section>
        <div v-if="concernsError" class="connection-error" role="alert">{{ concernsError }}</div>
        <section class="metrics concern-metrics" aria-label="Concern summary">
          <article><span>Total concerns</span><strong>{{ number.format(concernCounts.total) }}</strong><small>{{ concernAreas.length }} areas of concern</small></article>
          <article><span>Open</span><strong>{{ number.format(concernCounts.open) }}</strong><small>Waiting for a response</small></article>
          <article><span>Responded</span><strong>{{ number.format(concernCounts.responded) }}</strong><small>Answered by the team</small></article>
          <article><span>Resolved</span><strong>{{ number.format(concernCounts.resolved) }}</strong><small>Closed out</small></article>
        </section>
        <section class="card area-card"><header><div><h2>Concerns by area</h2><p>Select an area to filter the list below</p></div></header>
          <ul class="area-list"><li v-for="item in areaBreakdown" :key="item.area" :class="{ active: concernArea === item.area }"><button @click="concernArea = concernArea === item.area ? 'all' : item.area"><span class="area-name">{{ item.area }}</span><span class="area-count">{{ item.total }}</span>
            <span class="stack-bar" role="img" :aria-label="`${item.open} open, ${item.responded} responded, ${item.resolved} resolved`"><i class="s-open" :style="{ flex: item.open }"></i><i class="s-responded" :style="{ flex: item.responded }"></i><i class="s-resolved" :style="{ flex: item.resolved }"></i></span></button></li></ul>
          <p class="legend-row"><span><i class="s-open"></i>Open</span><span><i class="s-responded"></i>Responded</span><span><i class="s-resolved"></i>Resolved</span></p></section>
        <section class="card concern-list"><header><div><h2>Concerns and responses</h2><p>Click a row to open it in Google Sheets and type the response</p></div><strong class="count-chip">{{ number.format(filteredConcerns.length) }} concerns</strong></header>
          <div class="review-filters concern-filters">
            <label>Area<select v-model="concernArea"><option value="all">All areas</option><option v-for="item in concernAreas" :key="item" :value="item">{{ item }}</option></select></label>
            <label>Province<select v-model="concernProvince"><option value="all">All provinces</option><option v-for="item in concernProvinces" :key="item" :value="item">{{ item }}</option></select></label>
            <label>Status<select v-model="concernStatus"><option value="all">All statuses</option><option value="Open">Open</option><option value="Responded">Responded</option><option value="Resolved">Resolved</option></select></label>
            <label class="review-search">Search<input v-model="concernQuery" type="search" placeholder="Search a concern or response" /></label>
          </div>
          <p v-if="filteredConcerns.length === 0" class="empty-state">No concerns match these filters.</p>
          <div v-else class="table-scroll"><table class="concern-table"><thead><tr><th>Area of concern</th><th>Province</th><th>Question / issue / concern</th><th>Response</th><th>Status</th><th>Answer</th></tr></thead><tbody>
            <tr v-for="item in pagedConcerns" :key="item.id" class="clickable-row" title="Open this concern in Google Sheets" @click="openInSheet(item)"><td class="area-cell">{{ item.area }}</td><td>{{ item.province || '—' }}</td><td class="text-cell">{{ item.concern }}</td><td class="text-cell">{{ item.response || '—' }}</td><td><span class="concern-status" :class="item.status.toLowerCase()">{{ item.status }}</span></td><td><a class="sheet-link" :class="{ answer: item.status === 'Open' }" :href="item.answerUrl" target="_blank" rel="noopener noreferrer" @click.stop>{{ item.status === 'Open' ? 'Answer in Sheet' : 'Open in Sheet' }} ↗</a></td></tr></tbody></table></div>
          <div v-if="filteredConcerns.length > CONCERN_PAGE_SIZE" class="pagination" aria-label="Concern pages"><button :disabled="concernPage === 1" @click="concernPage -= 1">Previous</button><span>Page {{ concernPage }} of {{ concernTotalPages }}</span><button :disabled="concernPage === concernTotalPages" @click="concernPage += 1">Next</button></div>
        </section>
      </template>

      <template v-else>
        <section class="page-heading"><div><p class="breadcrumb">Super Administrator / Users</p><h1>User Management</h1><p>Approve new requests and manage who can open the dashboard.</p></div><button class="refresh-button" :disabled="approvalsBusy" @click="loadProfiles()"><svg class="refresh-icon" :class="{ spinning: approvalsBusy }" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>{{ approvalsBusy ? 'Refreshing…' : 'Refresh users' }}</button></section>
        <section class="card approvals-card"><div v-if="profileError" class="connection-error" role="alert">{{ profileError }}</div><div class="user-filters" role="tablist" aria-label="Filter users by status"><button v-for="tab in ['all', 'pending', 'approved', 'denied']" :key="tab" role="tab" :aria-selected="profileFilter === tab" :class="{ active: profileFilter === tab }" @click="profileFilter = tab as typeof profileFilter">{{ tab === 'all' ? 'All' : tab[0].toUpperCase() + tab.slice(1) }} <span>{{ profileCounts[tab as keyof typeof profileCounts] }}</span></button></div><p v-if="!approvalsBusy && visibleProfiles.length === 0" class="empty-state">No users in this list.</p><div v-else class="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Position</th><th>Province</th><th>Status</th><th>Action</th></tr></thead><tbody><tr v-for="member in visibleProfiles" :key="member.id"><td><strong>{{ member.fullName }}</strong><small v-if="member.isSuperAdmin" class="admin-tag">Super admin</small></td><td>{{ member.email }}</td><td>{{ member.position }}</td><td>{{ member.province }}</td><td><span class="review-status" :class="{ complete: member.status === 'approved', denied: member.status === 'denied' }">{{ member.status[0].toUpperCase() + member.status.slice(1) }}</span></td><td class="approval-actions"><template v-if="canManage(member)"><button v-if="member.status !== 'approved'" class="approve-button" :disabled="approvalsBusy" @click="decideProfile(member, 'approved')">{{ member.status === 'denied' ? 'Reactivate' : 'Approve' }}</button><button v-if="member.status === 'pending'" class="deny-button" :disabled="approvalsBusy" @click="decideProfile(member, 'denied')">Deny</button><button v-if="member.status === 'approved'" class="deny-button" :disabled="approvalsBusy" @click="removeAccess(member)">Remove access</button></template><span v-else class="muted-note">—</span></td></tr></tbody></table></div></section>
      </template>
    </main>
    <div v-if="updateAvailable" class="update-toast" role="status" aria-live="polite">
      <span>A new version of the dashboard is ready.</span>
      <button class="update-now" @click="reloadApp">Update now</button>
      <button class="update-later" @click="updateAvailable = false">Later</button>
    </div>
  </div>
</template>
