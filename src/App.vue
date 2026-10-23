<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { init, use, type ECharts } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { User } from '@supabase/supabase-js'
import { aggregateProvinces, type Province } from './domain'
import { contactDetails, filterRecordsByProvince, paginateRecords, paymentDetails, personalInfo, remarksDetails, schoolDetails, statusLabel, summarizeRecords, REVIEW_PAGE_SIZE, type ReviewRecord } from './sheets'
import { auth, authClient, authConfigured, googleClientId, googleSignInConfigured, turnstileConfigured, turnstileSiteKey } from './auth'
import { accessState, isSuperAdmin, type UserProfile } from './access'

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

// Local-only shortcut: `npm run dev` on localhost skips Google sign-in. import.meta.env.DEV is false in production
// builds, so this branch is removed from the deployed bundle.
const devBypass = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname)

type Role = 'regional' | 'provincial'
type View = 'overview' | 'province' | 'reports' | 'approvals'

const provinces = reactive<Province[]>([
  { id: 'sur', name: 'Davao del Sur', target: 1240, accomplished: 986, today: 42 },
  { id: 'norte', name: 'Davao del Norte', target: 1380, accomplished: 1128, today: 51 },
  { id: 'oriental', name: 'Davao Oriental', target: 1120, accomplished: 792, today: 37 },
  { id: 'oro', name: 'Davao de Oro', target: 980, accomplished: 741, today: 29 },
  { id: 'occidental', name: 'Davao Occidental', target: 760, accomplished: 604, today: 26 },
])

// The trend charts show the real count for each of the last 7 days (Asia/Manila); days with none are 0.
const manilaDate = (daysAgo: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(Date.now() - daysAgo * 86_400_000))
function lastSevenDays(values: Record<string, number>): Array<[string, number]> {
  const dates = Array.from({ length: 7 }, (_, index) => manilaDate(6 - index))
  return dates.map((date) => {
    const day = new Date(`${date}T00:00:00+08:00`)
    const weekday = new Intl.DateTimeFormat('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' }).format(day)
    const monthDay = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(day)
    return [`${weekday}\n${monthDay}`, values[date] ?? 0]
  })
}
const daily = ref<Array<[string, number]>>(lastSevenDays({}))
const completionOf = (item: { target: number; accomplished: number }) => item.target ? Math.round(item.accomplished / item.target * 1000) / 10 : 0

const currentUser = ref<User | null>(null)
const loggedIn = computed(() => Boolean(currentUser.value))
const profile = ref<UserProfile | null>(null)
const profileBusy = ref(false)
const profileError = ref('')
const profileForm = reactive({ fullName: '', position: '', province: '' })
const pendingProfiles = ref<UserProfile[]>([])
const approvalsBusy = ref(false)
const appAccess = computed(() => accessState(profile.value))
const superAdmin = computed(() => isSuperAdmin(profile.value))
const authBusy = ref(true)
const authError = ref('')
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
const dataConnected = ref(false)
const dataError = ref('')
const reviewRecords = ref<ReviewRecord[]>([])
const reviewProvinceId = ref('all')
const reviewQuery = ref('')
const reviewStatus = ref<'all' | 'accomplished' | 'pending'>('all')
const reviewPage = ref(1)
const selectedReviewRecord = ref<ReviewRecord | null>(null)
const chartOne = ref<HTMLElement | null>(null)
const chartTwo = ref<HTMLElement | null>(null)
let firstChart: ECharts | null = null
let secondChart: ECharts | null = null
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
const filteredReviewRecords = computed(() => {
  const query = reviewQuery.value.trim().toLowerCase()
  return filterRecordsByProvince(reviewRecords.value, reviewProvinceName.value).filter((record) => {
    if (municipalityActive.value && record.municipality !== municipality.value) return false
    const matchesStatus = !isProvinceView.value ? record.accomplished : reviewStatus.value === 'all'
      || (reviewStatus.value === 'accomplished' ? record.accomplished : !record.accomplished)
    const matchesQuery = !query || [record.name, record.householdId, record.accountNumber, record.municipality, record.barangay]
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

async function loadPendingProfiles() {
  if (!superAdmin.value || !authClient) return
  approvalsBusy.value = true
  const { data, error } = await authClient.from('user_profiles')
    .select('id, email, full_name, position, province, status, is_super_admin')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
  if (error) profileError.value = 'Unable to load approval requests.'
  else pendingProfiles.value = (data ?? []).map(toProfile)
  approvalsBusy.value = false
}

async function decideProfile(request: UserProfile, status: 'approved' | 'denied') {
  if (!authClient || !currentUser.value) return
  approvalsBusy.value = true
  const { error } = await authClient.from('user_profiles')
    .update({ status, decided_at: new Date().toISOString(), decided_by: currentUser.value.id })
    .eq('id', request.id)
  if (error) profileError.value = 'Unable to save this decision. Please try again.'
  else await loadPendingProfiles()
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

function navigate(view: View) {
  activeView.value = view
  menuOpen.value = false
  if (view === 'approvals') loadPendingProfiles()
}

async function refreshData() {
  refreshing.value = true
  await loadGoogleSheets(true)
  refreshing.value = false
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
  firstChart?.dispose(); secondChart?.dispose()
}

function makeCharts() {
  firstChart?.dispose(); secondChart?.dispose()
  if (!chartOne.value || !chartTwo.value || activeView.value === 'reports') return
  firstChart = init(chartOne.value)
  secondChart = init(chartTwo.value)
  const text = { color: '#526377', fontFamily: 'Inter, ui-sans-serif, system-ui' }
  if (isProvinceView.value) {
    const p = selectedProvince.value
    firstChart.setOption({
      grid: { left: 44, right: 18, top: 38, bottom: 36 },
      tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: daily.value.map(d => d[0]), axisLabel: { ...text, interval: 0 } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [{
        name: 'Province accomplishments', type: 'line', data: lastSevenDays(scopeSummary.value?.daily ?? p.daily ?? {}).map((d) => d[1]), smooth: 0.3, symbol: 'circle', symbolSize: 9,
        lineStyle: { width: 3, color: '#17795f' }, itemStyle: { color: '#17795f', borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(23,121,95,.28)' }, { offset: 1, color: 'rgba(23,121,95,0)' }] } },
        label: { show: true, position: 'top', color: '#24364b', fontWeight: 700 },
      }],
    })
    secondChart.setOption({
      grid: { left: 48, right: 20, top: 38, bottom: 36 }, tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['Target', 'Accomplished', 'Remaining'], axisLabel: text },
      yAxis: { type: 'value', axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [{ type: 'bar', barWidth: '42%', data: [
        { value: displayMetrics.value.target, itemStyle: { color: '#1d5b91' } },
        { value: displayMetrics.value.accomplished, itemStyle: { color: '#17795f' } },
        { value: displayMetrics.value.remaining, itemStyle: { color: '#d29b2d' } },
      ], label: { show: true, position: 'top', color: '#24364b', fontWeight: 700 } }],
    })
  } else {
    // Vertical grouped bars, one pair per province, with the full province name under each pair (wrapped on two lines).
    firstChart.setOption({
      legend: { data: ['Target', 'Actual'], top: 0, right: 8, textStyle: text },
      grid: { left: 52, right: 16, top: 64, bottom: 44 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: unknown) => number.format(Number(value)) },
      xAxis: {
        type: 'category', data: provinces.map((p) => p.name), axisTick: { show: false },
        axisLabel: { ...text, interval: 0, fontWeight: 600, lineHeight: 16, formatter: (name: string) => name.replace(/^Davao /, 'Davao\n').replace(/\b(de|del)\b/, (word) => word[0].toUpperCase() + word.slice(1)) },
      },
      yAxis: { type: 'value', minInterval: 1, axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [
        { name: 'Target', type: 'bar', barGap: '12%', barMaxWidth: 34, data: provinces.map((p) => p.target), itemStyle: { color: '#b8c8d8', borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: 'top', color: '#5b6f84', fontWeight: 700, formatter: (item: { value: unknown }) => number.format(Number(item.value)) } },
        { name: 'Actual', type: 'bar', barMaxWidth: 34, data: provinces.map((p) => p.accomplished), itemStyle: { color: '#17795f', borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: 'top', color: '#0f5f49', fontWeight: 800, formatter: (item: { value: unknown; dataIndex: number }) => number.format(Number(item.value)) + '\n' + completionOf(provinces[item.dataIndex]) + '%' } },
      ],
    })
    secondChart.setOption({
      grid: { left: 48, right: 18, top: 40, bottom: 38 }, tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: daily.value.map(d => d[0]), axisLabel: { ...text, interval: 0 } }, yAxis: { type: 'value', minInterval: 1, axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [{
        name: 'Region accomplishments', type: 'line', data: daily.value.map(d => d[1]), smooth: 0.3, symbol: 'circle', symbolSize: 9,
        lineStyle: { width: 3, color: '#1d5b91' }, itemStyle: { color: '#1d5b91', borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(29,91,145,.28)' }, { offset: 1, color: 'rgba(29,91,145,0)' }] } },
        label: { show: true, position: 'top', color: '#24364b', fontWeight: 700 },
      }],
    })
  }
}

function handleResize() { firstChart?.resize(); secondChart?.resize() }

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
    const snapshot = await response.json() as {
      provinces: Province[]
      daily: Array<{ date: string; value: number }>
      records: ReviewRecord[]
      lastRefresh: string
    }
    provinces.splice(0, provinces.length, ...snapshot.provinces)
    reviewRecords.value = snapshot.records ?? []
    daily.value = lastSevenDays(Object.fromEntries(snapshot.daily.map((item) => [item.date, item.value])))
    lastRefresh.value = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(snapshot.lastRefresh))
    dataConnected.value = true
    dataError.value = ''
    await nextTick()
    makeCharts()
  } catch (error) {
    dataConnected.value = false
    dataError.value = error instanceof Error ? error.message : 'Unable to connect to Google Sheets'
  }
}

// appAccess/profileBusy decide when the dashboard actually mounts, so charts must redraw then too.
watch([activeView, selectedProvinceId, municipality, loggedIn, appAccess, profileBusy], async () => { await nextTick(); makeCharts() })
watch(appAccess, (access) => { if (access === 'approved') loadGoogleSheets() })
watch(selectedProvinceId, () => { municipality.value = 'all' })
watch([selectedProvinceId, municipality, reviewProvinceId, reviewQuery, reviewStatus], () => { reviewPage.value = 1 })
watch(reviewTotalPages, (totalPages) => { if (reviewPage.value > totalPages) reviewPage.value = totalPages })
onMounted(async () => {
  window.addEventListener('resize', handleResize)
  document.addEventListener('click', closeAccountMenu)
  document.addEventListener('keydown', closeAccountMenu)
  clockTimer = window.setInterval(() => { now.value = new Date() }, 1000)
  loadGoogleSheets()
  if (devBypass) {
    currentUser.value = { id: 'local-dev', email: 'dev@localhost', user_metadata: { full_name: 'Local Developer' } } as unknown as User
    profile.value = { id: 'local-dev', email: 'dev@localhost', fullName: 'Local Developer', position: 'Super Administrator', province: 'Regional Office', status: 'approved', isSuperAdmin: true }
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
  refreshTimer = window.setInterval(() => {
    if (loggedIn.value) refreshDataInBackground()
  }, 15_000)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('click', closeAccountMenu)
  document.removeEventListener('keydown', closeAccountMenu)
  if (refreshTimer) window.clearInterval(refreshTimer)
  window.clearInterval(clockTimer)
  unsubscribeAuth?.()
  firstChart?.dispose(); secondChart?.dispose()
})
</script>

<template>
  <main v-if="!loggedIn" class="login-shell">
    <section class="login-panel" aria-labelledby="login-title">
      <div class="seal" aria-hidden="true">XI</div>
      <p class="eyebrow">Regional Program Management Office</p>
      <h1 id="login-title">4Ps Enhanced Support Services Intervention</h1>
      <p class="login-copy">Secure access to regional and provincial performance dashboards.</p>
      <div class="sample-notice"><strong>Phase 1 prototype</strong><span>{{ dataConnected ? 'Live Google Sheets data is connected.' : 'Connecting to Google Sheets…' }}</span></div>
      <div v-if="authError" class="auth-error" role="alert">{{ authError }}</div>
      <div class="captcha-block">
        <div ref="turnstileMount" aria-label="Security verification"></div>
        <p class="security-note">{{ captchaMessage }}</p>
      </div>
      <div v-show="captchaToken && !authBusy" ref="googleButtonMount" class="google-button-mount" aria-label="Continue with Google"></div>
      <p class="security-note">Use your Gmail or Google Workspace corporate email.</p>
      <p v-if="!authConfigured || !googleSignInConfigured || !turnstileConfigured" class="setup-note">Administrator setup is required before Google sign-in can be used.</p>
    </section>
    <aside class="login-context" aria-label="System overview">
      <div><span class="context-kicker">One clear regional view</span><h2>From daily encoding to decisions.</h2><p>Provincial teams keep their existing Google Sheets workflow. Regional leaders get a consolidated, always-current picture.</p></div>
      <ul><li>Read-only accomplishment data</li><li>Province-scoped access controls</li><li>Print-ready government reports</li></ul>
    </aside>
  </main>

  <main v-else-if="profileBusy" class="login-shell">
    <section class="login-panel"><p class="eyebrow">Checking access</p><h1>One moment…</h1><p class="login-copy">We are securely checking your account status.</p></section>
    <aside class="login-context" aria-label="System overview"></aside>
  </main>

  <main v-else-if="appAccess === 'profile'" class="login-shell">
    <section class="login-panel" aria-labelledby="profile-title">
      <div class="seal" aria-hidden="true">XI</div>
      <p class="eyebrow">First-time sign-in</p>
      <h1 id="profile-title">Tell us about yourself</h1>
      <p class="login-copy">Your account will be reviewed by the Super Administrator before dashboard access is granted.</p>
      <div v-if="profileError" class="auth-error" role="alert">{{ profileError }}</div>
      <form class="profile-form" @submit.prevent="submitProfile">
        <label>Full name<input v-model="profileForm.fullName" required autocomplete="name" /></label>
        <label>Position<input v-model="profileForm.position" required autocomplete="organization-title" /></label>
        <label>Province<select v-model="profileForm.province" required><option disabled value="">Select your province</option><option v-for="item in provinces" :key="item.id" :value="item.name">{{ item.name }}</option></select></label>
        <button class="primary-button" :disabled="profileBusy">{{ profileBusy ? 'Submitting…' : 'Submit for approval' }}</button>
      </form>
      <button class="secondary-button" @click="logout">Sign out</button>
    </section>
    <aside class="login-context" aria-label="Approval process"><div><span class="context-kicker">Secure access</span><h2>Approved people only.</h2><p>Complete the short profile form. The Super Administrator will review your request in the application.</p></div></aside>
  </main>

  <main v-else-if="appAccess === 'pending'" class="login-shell">
    <section class="login-panel"><div class="seal" aria-hidden="true">XI</div><p class="eyebrow">Request received</p><h1>Waiting for approval</h1><p class="login-copy">Your request has been submitted. You will be able to use the dashboard after the Super Administrator approves your account.</p><button class="secondary-button" @click="() => loadProfile()">Check again</button><button class="secondary-button" @click="logout">Sign out</button></section>
    <aside class="login-context" aria-label="Approval process"><div><span class="context-kicker">Secure access</span><h2>Your request is in review.</h2></div></aside>
  </main>

  <main v-else-if="appAccess === 'denied'" class="login-shell">
    <section class="login-panel"><div class="seal" aria-hidden="true">XI</div><p class="eyebrow">Access unavailable</p><h1>Request not approved</h1><p class="login-copy">This account does not currently have access to the dashboard. Please contact the Regional Program Management Office if you need assistance.</p><button class="secondary-button" @click="logout">Sign out</button></section>
    <aside class="login-context" aria-label="Access unavailable"></aside>
  </main>

  <div v-else class="app-shell">
    <header class="topbar">
      <button class="icon-button mobile-only" aria-label="Open navigation" @click="menuOpen = !menuOpen"><span></span><span></span><span></span></button>
      <div class="brand"><div class="mini-seal">XI</div><div><strong>4Ps Enhanced Support Services Intervention</strong><span>Regional Program Management Office</span></div></div>
      <div class="topbar-actions"><div class="clock" aria-label="Current date and time"><strong>{{ clockTime }}</strong><span>{{ clockDate }}</span></div><span class="sample-pill" :class="{ live: dataConnected }">{{ dataConnected ? 'Live Google Sheets' : 'Connecting…' }}</span><div class="account"><button class="avatar" aria-label="Open account menu" aria-haspopup="menu" :aria-expanded="accountMenuOpen" @click="accountMenuOpen = !accountMenuOpen">{{ accountInitials || (role === 'regional' ? 'RA' : 'DS') }}</button><div v-if="accountMenuOpen" class="account-menu" role="menu"><div class="account-id"><strong>{{ accountName }}</strong><span>{{ currentUser?.email ?? 'Google account' }}</span></div><button class="account-logout" role="menuitem" @click="accountMenuOpen = false; logout()"><i>↪</i>Log out</button></div></div></div>
    </header>
    <aside class="sidebar" :class="{ open: menuOpen }">
      <nav aria-label="Main navigation">
        <button v-if="role === 'regional'" :class="{ active: activeView === 'overview' }" @click="navigate('overview')"><i>⌂</i>Regional overview</button>
        <button :class="{ active: activeView === 'province' }" @click="navigate('province')"><i>▦</i>{{ role === 'regional' ? 'Provincial view' : 'Provincial dashboard' }}</button>
        <button :class="{ active: activeView === 'reports' }" @click="navigate('reports')"><i>▤</i>Reports & printing</button>
        <button v-if="superAdmin" :class="{ active: activeView === 'approvals' }" @click="navigate('approvals')"><i>✓</i>Approvals</button>
      </nav>
    </aside>

    <main class="content">
      <template v-if="activeView !== 'reports' && activeView !== 'approvals'">
        <section class="page-heading">
          <div><p class="breadcrumb">Dashboard / {{ isProvinceView ? selectedProvince.name + (municipalityActive ? ' / ' + municipality : '') : 'Regional overview' }}</p><h1>{{ isProvinceView ? `${selectedProvince.name} Dashboard` : 'Regional Overview' }}</h1><p>Monitor targets and verified daily accomplishments for {{ period.toLowerCase() }}.</p></div>
          <div class="heading-actions">
            <label v-if="role === 'regional' && isProvinceView">Province<select id="province" v-model="selectedProvinceId"><option v-for="item in provinces" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
            <label v-if="isProvinceView">Municipality<select v-model="municipality"><option value="all">All municipalities</option><option v-for="item in municipalities" :key="item" :value="item">{{ item }}</option></select></label>
            <label>Reporting period<select v-model="period"><option>Today</option><option>This week</option><option>This month</option></select></label>
            <button class="refresh-button" :disabled="refreshing" @click="refreshData">{{ refreshing ? 'Refreshing…' : 'Refresh data' }}</button>
          </div>
        </section>
        <div v-if="dataError" class="connection-error" role="alert">Live Google Sheets connection failed: {{ dataError }}. The last available values remain on screen.</div>
        <section class="metrics" aria-label="Performance summary">
          <article><span>{{ isProvinceView ? (municipalityActive ? 'Municipal target' : 'Provincial target') : 'Regional target' }}</span><strong>{{ displayMetrics.target ? number.format(displayMetrics.target) : 'Not set' }}</strong><small>{{ displayMetrics.target ? 'Valid beneficiary records' : 'No valid beneficiary records' }}</small></article>
          <article><span>Accomplished</span><strong class="green">{{ number.format(displayMetrics.accomplished) }}</strong><small>{{ displayMetrics.percentage === null ? 'Cash Card + E-Wallet rows' : `${displayMetrics.percentage}% of target` }}</small></article>
          <article><span>Remaining</span><strong>{{ displayMetrics.target ? number.format(displayMetrics.remaining) : '—' }}</strong><small>{{ displayMetrics.target ? 'To reach target' : 'Target required' }}</small></article>
          <article><span>Completion</span><strong class="blue">{{ displayMetrics.percentage === null ? '—' : `${displayMetrics.percentage}%` }}</strong><div class="progress"><span :style="{ width: `${displayMetrics.percentage ?? 0}%` }"></span></div></article>
          <article><span>Today's accomplishment</span><strong>{{ number.format(displayMetrics.today) }}</strong><small>As of latest refresh</small></article>
        </section>
        <section class="chart-grid">
          <article class="card"><header><div><h2>{{ isProvinceView ? 'Daily accomplishment' : 'Provincial performance' }}</h2><p>{{ isProvinceView ? `Verified output per day, last 7 days · total ${number.format(displayMetrics.accomplished)}` : 'Target compared with actual' }}</p></div><span class="status-dot">Current</span></header><div ref="chartOne" class="chart"></div><p v-if="isProvinceView" class="chart-note">Dates come from the sheet's Date column. Rows with no date are counted on the day they were first detected.</p></article>
          <article class="card"><header><div><h2>{{ isProvinceView ? 'Target vs. actual' : 'Regional daily output' }}</h2><p>{{ isProvinceView ? period : `Accomplishments per day, last 7 days · total ${number.format(totals.accomplished)}` }}</p></div></header><div ref="chartTwo" class="chart"></div><p v-if="!isProvinceView" class="chart-note">Dates come from the sheet's Date column. Rows with no date are counted on the day they were first detected.</p></article>
        </section>
        <section v-if="!isProvinceView" class="card performance-table"><header><div><h2>Provincial performance</h2><p>Detailed regional comparison</p></div><button @click="navigate('reports')">Open report</button></header><div class="table-scroll"><table><thead><tr><th>Province</th><th>Target</th><th>Accomplished</th><th>Remaining</th><th>Completion</th></tr></thead><tbody><tr v-for="item in provinces" :key="item.id" @click="selectedProvinceId = item.id; navigate('province')"><td><strong>{{ item.name }}</strong></td><td>{{ item.target ? number.format(item.target) : 'Not set' }}</td><td>{{ number.format(item.accomplished) }}</td><td>{{ item.target ? number.format(item.target - item.accomplished) : '—' }}</td><td class="completion-cell"><div class="completion-wrap"><div class="mini-bar"><span :style="{ width: `${completionOf(item)}%` }"></span></div><strong>{{ item.target ? `${completionOf(item)}%` : '—' }}</strong></div></td></tr></tbody><tfoot><tr><th>Regional total</th><th>{{ totals.target ? number.format(totals.target) : 'Not set' }}</th><th>{{ number.format(totals.accomplished) }}</th><th>{{ totals.target ? number.format(totals.remaining) : '—' }}</th><th>{{ totals.percentage === null ? '—' : `${totals.percentage}%` }}</th></tr></tfoot></table></div></section>
        <section class="card review-table" aria-labelledby="review-title">
          <header><div><h2 id="review-title">Beneficiary review</h2><p>Live records from the provincial Google Sheets</p></div><strong>{{ number.format(filteredReviewRecords.length) }} records</strong></header>
          <div class="review-filters">
            <label>Province<select v-if="!isProvinceView" v-model="reviewProvinceId"><option value="all">All provinces</option><option v-for="item in provinces" :key="item.id" :value="item.id">{{ item.name }}</option></select><input v-else :value="selectedProvince.name" readonly aria-label="Selected province" /></label>
            <label v-if="isProvinceView">Status<select v-model="reviewStatus"><option value="all">All records</option><option value="accomplished">Validated</option><option value="pending">For Validation</option></select></label>
            <label class="review-search">Search<input v-model="reviewQuery" placeholder="Name, household ID, or account" /></label>
          </div>
          <p v-if="filteredReviewRecords.length === 0" class="empty-state">No beneficiary records match these filters.</p>
          <div v-else class="table-scroll"><table><thead><tr><th>Province</th><th>Beneficiary</th><th>Location</th><th>Household / account</th><th>Payment mode</th><th>Date</th><th>Status</th><th>Remarks</th></tr></thead><tbody><tr v-for="record in pagedReviewRecords" :key="`${record.province}-${record.id}`" class="clickable-row" @click="selectedReviewRecord = record"><td>{{ record.province }}</td><td><button class="beneficiary-link" @click="selectedReviewRecord = record">{{ record.name || 'Name not provided' }}</button></td><td>{{ [record.municipality, record.barangay].filter(Boolean).join(', ') || '—' }}</td><td>{{ record.accountNumber || record.householdId || '—' }}</td><td>{{ record.paymentMode || '—' }}</td><td>{{ record.date ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${record.date}T00:00:00+08:00`)) : '—' }}</td><td><span class="review-status" :class="{ complete: record.accomplished }">{{ statusLabel(record) }}</span></td><td class="remarks-cell">{{ record.payment.remarks || '—' }}</td></tr></tbody></table></div>
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
        <section class="page-heading"><div><p class="breadcrumb">Reports & printing</p><h1>Report Center</h1><p>Configure and preview an official accomplishment report.</p></div><button class="primary-button compact" onclick="window.print()">Print / Save as PDF</button></section>
        <section class="report-layout">
          <aside class="report-controls card"><h2>Report settings</h2><label>Report type<select><option>Accomplishment Summary</option><option>Target vs. Actual</option><option>Daily Accomplishment</option></select></label><label v-if="role === 'regional'">Reporting scope<select><option>Regional – All provinces</option><option v-for="item in provinces" :key="item.id">{{ item.name }}</option></select></label><label>Paper size<select><option>A4</option><option>Legal</option></select></label><label>Orientation<select><option>Portrait</option><option>Landscape</option></select></label><div class="sample-notice"><strong>Preview mode</strong><span>Uses sample data in Phase 1.</span></div></aside>
          <article class="report-paper">
            <header><div class="report-seal">XI</div><div><small>Republic of the Philippines</small><strong>REGIONAL OPERATIONS OFFICE</strong><span>Davao Region</span></div></header>
            <div class="report-title"><h2>{{ role === 'regional' ? 'REGIONAL ACCOMPLISHMENT SUMMARY' : 'PROVINCIAL ACCOMPLISHMENT SUMMARY' }}</h2><p>Reporting Period: October 16–22, 2026</p></div>
            <table><thead><tr><th>Province</th><th>Target</th><th>Actual</th><th>Remaining</th><th>%</th></tr></thead><tbody><tr v-for="item in (role === 'regional' ? provinces : [selectedProvince])" :key="item.id"><td>{{ item.name }}</td><td>{{ item.target ? number.format(item.target) : 'Not set' }}</td><td>{{ number.format(item.accomplished) }}</td><td>{{ item.target ? number.format(item.target-item.accomplished) : '—' }}</td><td>{{ item.target ? `${Math.round(item.accomplished/item.target*100)}%` : '—' }}</td></tr></tbody></table>
            <div class="report-total"><span>Total accomplished</span><strong>{{ number.format(displayMetrics.accomplished) }}</strong><span>Completion</span><strong>{{ displayMetrics.percentage === null ? '—' : `${displayMetrics.percentage}%` }}</strong></div>
            <div class="signatures"><div><span>Prepared by:</span><i></i><strong>Name and Signature</strong></div><div><span>Reviewed / Approved by:</span><i></i><strong>Name and Signature</strong></div></div>
            <footer>Generated October 22, 2026 · 10:48 PM (Asia/Manila)<span>Page 1 of 1</span></footer>
          </article>
        </section>
      </template>

      <template v-else>
        <section class="page-heading"><div><p class="breadcrumb">Super Administrator / Approvals</p><h1>Access approvals</h1><p>Review new account requests. Approved users receive full dashboard access.</p></div><button class="refresh-button" :disabled="approvalsBusy" @click="loadPendingProfiles">{{ approvalsBusy ? 'Refreshing…' : 'Refresh requests' }}</button></section>
        <section class="card approvals-card"><div v-if="profileError" class="connection-error" role="alert">{{ profileError }}</div><p v-if="!approvalsBusy && pendingProfiles.length === 0" class="empty-state">There are no pending approval requests.</p><div v-else class="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Position</th><th>Province</th><th>Action</th></tr></thead><tbody><tr v-for="request in pendingProfiles" :key="request.id"><td><strong>{{ request.fullName }}</strong></td><td>{{ request.email }}</td><td>{{ request.position }}</td><td>{{ request.province }}</td><td class="approval-actions"><button class="approve-button" :disabled="approvalsBusy" @click="decideProfile(request, 'approved')">Approve</button><button class="deny-button" :disabled="approvalsBusy" @click="decideProfile(request, 'denied')">Deny</button></td></tr></tbody></table></div></section>
      </template>
    </main>
  </div>
</template>
