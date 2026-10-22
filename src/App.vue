<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { init, use, type ECharts } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { User } from '@supabase/supabase-js'
import { aggregateProvinces, type Province } from './domain'
import { auth, authClient, authConfigured } from './auth'

use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

type Role = 'regional' | 'provincial'
type View = 'overview' | 'province' | 'reports'

const provinces = reactive<Province[]>([
  { id: 'sur', name: 'Davao del Sur', target: 1240, accomplished: 986, today: 42 },
  { id: 'norte', name: 'Davao del Norte', target: 1380, accomplished: 1128, today: 51 },
  { id: 'oriental', name: 'Davao Oriental', target: 1120, accomplished: 792, today: 37 },
  { id: 'oro', name: 'Davao de Oro', target: 980, accomplished: 741, today: 29 },
  { id: 'occidental', name: 'Davao Occidental', target: 760, accomplished: 604, today: 26 },
])

const daily = ref<Array<[string, number]>>([
  ['Oct 16', 148], ['Oct 17', 162], ['Oct 18', 131], ['Oct 19', 176],
  ['Oct 20', 154], ['Oct 21', 189], ['Oct 22', 185],
])

const currentUser = ref<User | null>(null)
const loggedIn = computed(() => Boolean(currentUser.value))
const authBusy = ref(true)
const authError = ref('')
const role = ref<Role>('regional')
const activeView = ref<View>('overview')
const selectedProvinceId = ref('sur')
const period = ref('This week')
const menuOpen = ref(false)
const refreshing = ref(false)
const lastRefresh = ref('Oct 22, 2026 · 10:48 PM')
const dataConnected = ref(false)
const dataError = ref('')
const chartOne = ref<HTMLElement | null>(null)
const chartTwo = ref<HTMLElement | null>(null)
let firstChart: ECharts | null = null
let secondChart: ECharts | null = null
let refreshTimer: number | undefined
let unsubscribeAuth: (() => void) | undefined

const totals = computed(() => aggregateProvinces(provinces))
const selectedProvince = computed(() => provinces.find((item) => item.id === selectedProvinceId.value) ?? provinces[0])
const isProvinceView = computed(() => activeView.value === 'province' || role.value === 'provincial')
const displayMetrics = computed(() => isProvinceView.value
  ? aggregateProvinces([selectedProvince.value])
  : totals.value)

const number = new Intl.NumberFormat('en-PH')

async function signIn() {
  if (!auth) {
    authError.value = 'Google sign-in is not configured yet. Add the Supabase connection settings to enable it.'
    return
  }
  authBusy.value = true
  authError.value = ''
  try {
    await auth.signInWithGoogle()
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Unable to sign in with Google'
    authBusy.value = false
  }
}

function navigate(view: View) {
  activeView.value = view
  menuOpen.value = false
}

async function refreshData() {
  refreshing.value = true
  await loadGoogleSheets()
  refreshing.value = false
}

async function logout() {
  authBusy.value = true
  try {
    await auth?.signOut()
    currentUser.value = null
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
      tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: daily.value.map(d => d[0]), axisLabel: text },
      yAxis: { type: 'value', axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [{ type: 'bar', data: daily.value.map((d) => Math.round(d[1] * (totals.value.accomplished ? p.accomplished / totals.value.accomplished : 0))),
        barWidth: '48%', itemStyle: { color: '#17795f', borderRadius: [5, 5, 0, 0] }, label: { show: true, position: 'top', color: '#24364b', fontWeight: 700 } }],
    })
    secondChart.setOption({
      grid: { left: 48, right: 20, top: 38, bottom: 36 }, tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['Target', 'Accomplished', 'Remaining'], axisLabel: text },
      yAxis: { type: 'value', axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [{ type: 'bar', barWidth: '42%', data: [
        { value: p.target, itemStyle: { color: '#1d5b91' } },
        { value: p.accomplished, itemStyle: { color: '#17795f' } },
        { value: p.target - p.accomplished, itemStyle: { color: '#d29b2d' } },
      ], label: { show: true, position: 'top', color: '#24364b', fontWeight: 700 } }],
    })
  } else {
    firstChart.setOption({
      legend: { data: ['Target', 'Actual'], top: 0, right: 8, textStyle: text }, grid: { left: 50, right: 18, top: 48, bottom: 62 },
      tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => number.format(Number(value)) },
      xAxis: { type: 'category', data: provinces.map(p => p.name.replace('Davao ', '')), axisLabel: { ...text, interval: 0, rotate: 22 } },
      yAxis: { type: 'value', axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [
        { name: 'Target', type: 'bar', data: provinces.map(p => p.target), itemStyle: { color: '#b8c8d8', borderRadius: [4, 4, 0, 0] } },
        { name: 'Actual', type: 'bar', data: provinces.map(p => p.accomplished), itemStyle: { color: '#17795f', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', color: '#24364b', fontWeight: 700 } },
      ],
    })
    secondChart.setOption({
      grid: { left: 48, right: 18, top: 40, bottom: 38 }, tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: daily.value.map(d => d[0]), axisLabel: text }, yAxis: { type: 'value', axisLabel: text, splitLine: { lineStyle: { color: '#edf1f5' } } },
      series: [{ type: 'bar', data: daily.value.map(d => d[1]), barWidth: '48%', itemStyle: { color: '#1d5b91', borderRadius: [5, 5, 0, 0] }, label: { show: true, position: 'top', color: '#24364b', fontWeight: 700 } }],
    })
  }
}

function handleResize() { firstChart?.resize(); secondChart?.resize() }

async function loadGoogleSheets() {
  try {
    const response = await fetch('/sheet-data')
    if (!response.ok) throw new Error('Google Sheets returned an error')
    const snapshot = await response.json() as {
      provinces: Province[]
      daily: Array<{ date: string; value: number }>
      lastRefresh: string
    }
    provinces.splice(0, provinces.length, ...snapshot.provinces)
    daily.value = snapshot.daily.slice(-14).map((item) => [
      new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${item.date}T00:00:00+08:00`)),
      item.value,
    ])
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

watch([activeView, selectedProvinceId, loggedIn], async () => { await nextTick(); makeCharts() })
onMounted(async () => {
  window.addEventListener('resize', handleResize)
  loadGoogleSheets()
  if (auth) {
    try {
      currentUser.value = await auth.getUser()
    } catch (error) {
      authError.value = error instanceof Error ? error.message : 'Unable to restore your sign-in session'
    }
    const listener = authClient?.auth.onAuthStateChange((_event, session) => {
      currentUser.value = session?.user ?? null
      authBusy.value = false
    })
    unsubscribeAuth = () => listener?.data.subscription.unsubscribe()
  }
  authBusy.value = false
  refreshTimer = window.setInterval(() => {
    if (loggedIn.value && document.visibilityState === 'visible') refreshData()
  }, 60_000)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (refreshTimer) window.clearInterval(refreshTimer)
  unsubscribeAuth?.()
  firstChart?.dispose(); secondChart?.dispose()
})
</script>

<template>
  <main v-if="!loggedIn" class="login-shell">
    <section class="login-panel" aria-labelledby="login-title">
      <div class="seal" aria-hidden="true">XI</div>
      <p class="eyebrow">Regional Operations Office</p>
      <h1 id="login-title">Daily Accomplishment Monitor</h1>
      <p class="login-copy">Secure access to regional and provincial performance dashboards.</p>
      <div class="sample-notice"><strong>Phase 1 prototype</strong><span>{{ dataConnected ? 'Live Google Sheets data is connected.' : 'Connecting to Google Sheets…' }}</span></div>
      <div v-if="authError" class="auth-error" role="alert">{{ authError }}</div>
      <button class="google-button" type="button" :disabled="authBusy || !authConfigured" @click="signIn">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h5.4a4.6 4.6 0 0 1-2 3v2.8h3.5c2-1.9 3.2-4.6 3.2-7.9Z"/><path fill="#34A853" d="M12 22c2.9 0 5.3-.9 7-2.6l-3.5-2.8c-.9.6-2.1 1-3.5 1a6.2 6.2 0 0 1-5.8-4.2H2.6v2.8A10.6 10.6 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.2 13.4A6.3 6.3 0 0 1 6.2 9V6.2H2.6A10.6 10.6 0 0 0 2.6 16l3.6-2.7Z"/><path fill="#EA4335" d="M12 4.4c1.6 0 3 .5 4.1 1.6l3.1-3A10.3 10.3 0 0 0 2.6 6.2L6.2 9A6.2 6.2 0 0 1 12 4.4Z"/></svg>
        {{ authBusy ? 'Checking account…' : 'Continue with Google' }}
      </button>
      <p class="security-note">Use your Gmail or Google Workspace corporate email.</p>
      <p v-if="!authConfigured" class="setup-note">Administrator setup is required before Google sign-in can be used.</p>
    </section>
    <aside class="login-context" aria-label="System overview">
      <div><span class="context-kicker">One clear regional view</span><h2>From daily encoding to decisions.</h2><p>Provincial teams keep their existing Google Sheets workflow. Regional leaders get a consolidated, always-current picture.</p></div>
      <ul><li>Read-only accomplishment data</li><li>Province-scoped access controls</li><li>Print-ready government reports</li></ul>
    </aside>
  </main>

  <div v-else class="app-shell">
    <header class="topbar">
      <button class="icon-button mobile-only" aria-label="Open navigation" @click="menuOpen = !menuOpen"><span></span><span></span><span></span></button>
      <div class="brand"><div class="mini-seal">XI</div><div><strong>Accomplishment Monitor</strong><span>Regional Operations Office</span></div></div>
      <div class="topbar-actions"><span class="sample-pill" :class="{ live: dataConnected }">{{ dataConnected ? 'Live Google Sheets' : 'Connecting…' }}</span><button class="avatar" aria-label="Open account menu">{{ role === 'regional' ? 'RA' : 'DS' }}</button></div>
    </header>
    <aside class="sidebar" :class="{ open: menuOpen }">
      <div class="role-card"><span>Signed in as</span><strong>{{ currentUser?.email ?? 'Google account' }}</strong></div>
      <nav aria-label="Main navigation">
        <button v-if="role === 'regional'" :class="{ active: activeView === 'overview' }" @click="navigate('overview')"><i>⌂</i>Regional overview</button>
        <button :class="{ active: activeView === 'province' }" @click="navigate('province')"><i>▦</i>{{ role === 'regional' ? 'Provincial view' : 'Provincial dashboard' }}</button>
        <button :class="{ active: activeView === 'reports' }" @click="navigate('reports')"><i>▤</i>Reports & printing</button>
      </nav>
      <button class="logout" @click="logout"><i>↪</i>Log out</button>
    </aside>

    <main class="content">
      <template v-if="activeView !== 'reports'">
        <section class="page-heading">
          <div><p class="breadcrumb">Dashboard / {{ isProvinceView ? selectedProvince.name : 'Regional overview' }}</p><h1>{{ isProvinceView ? `${selectedProvince.name} Dashboard` : 'Regional Overview' }}</h1><p>Monitor targets and verified daily accomplishments for {{ period.toLowerCase() }}.</p></div>
          <div class="heading-actions">
            <label>Reporting period<select v-model="period"><option>Today</option><option>This week</option><option>This month</option></select></label>
            <button class="refresh-button" :disabled="refreshing" @click="refreshData">{{ refreshing ? 'Refreshing…' : 'Refresh data' }}</button>
          </div>
        </section>
        <div v-if="role === 'regional' && isProvinceView" class="province-picker"><label for="province">Viewing province</label><select id="province" v-model="selectedProvinceId"><option v-for="item in provinces" :key="item.id" :value="item.id">{{ item.name }}</option></select></div>
        <div v-if="dataError" class="connection-error" role="alert">Live Google Sheets connection failed: {{ dataError }}. The last available values remain on screen.</div>
        <section class="metrics" aria-label="Performance summary">
          <article><span>{{ isProvinceView ? 'Provincial target' : 'Regional target' }}</span><strong>{{ displayMetrics.target ? number.format(displayMetrics.target) : 'Not set' }}</strong><small>{{ displayMetrics.target ? 'Valid beneficiary records' : 'No valid beneficiary records' }}</small></article>
          <article><span>Accomplished</span><strong class="green">{{ number.format(displayMetrics.accomplished) }}</strong><small>{{ displayMetrics.percentage === null ? 'Cash Card + E-Wallet rows' : `${displayMetrics.percentage}% of target` }}</small></article>
          <article><span>Remaining</span><strong>{{ displayMetrics.target ? number.format(displayMetrics.remaining) : '—' }}</strong><small>{{ displayMetrics.target ? 'To reach target' : 'Target required' }}</small></article>
          <article><span>Completion</span><strong class="blue">{{ displayMetrics.percentage === null ? '—' : `${displayMetrics.percentage}%` }}</strong><div class="progress"><span :style="{ width: `${displayMetrics.percentage ?? 0}%` }"></span></div></article>
          <article><span>Today's accomplishment</span><strong>{{ number.format(displayMetrics.today) }}</strong><small>As of latest refresh</small></article>
        </section>
        <section class="chart-grid">
          <article class="card"><header><div><h2>{{ isProvinceView ? 'Daily accomplishment' : 'Provincial performance' }}</h2><p>{{ isProvinceView ? 'Verified output by date' : 'Target compared with actual' }}</p></div><span class="status-dot">Current</span></header><div ref="chartOne" class="chart"></div></article>
          <article class="card"><header><div><h2>{{ isProvinceView ? 'Target vs. actual' : 'Regional daily output' }}</h2><p>{{ period }}</p></div></header><div ref="chartTwo" class="chart"></div></article>
        </section>
        <section v-if="!isProvinceView" class="card performance-table"><header><div><h2>Provincial performance</h2><p>Detailed regional comparison</p></div><button @click="navigate('reports')">Open report</button></header><div class="table-scroll"><table><thead><tr><th>Province</th><th>Target</th><th>Accomplished</th><th>Remaining</th><th>Completion</th></tr></thead><tbody><tr v-for="item in provinces" :key="item.id" @click="selectedProvinceId = item.id; navigate('province')"><td><strong>{{ item.name }}</strong></td><td>{{ item.target ? number.format(item.target) : 'Not set' }}</td><td>{{ number.format(item.accomplished) }}</td><td>{{ item.target ? number.format(item.target - item.accomplished) : '—' }}</td><td><span class="table-percent">{{ item.target ? `${Math.round(item.accomplished / item.target * 100)}%` : '—' }}</span></td></tr></tbody><tfoot><tr><th>Regional total</th><th>{{ totals.target ? number.format(totals.target) : 'Not set' }}</th><th>{{ number.format(totals.accomplished) }}</th><th>{{ totals.target ? number.format(totals.remaining) : '—' }}</th><th>{{ totals.percentage === null ? '—' : `${totals.percentage}%` }}</th></tr></tfoot></table></div></section>
        <footer class="refresh-note"><span class="live-dot" :class="{ connected: dataConnected }"></span>{{ dataConnected ? 'Live from Google Sheets' : 'Not connected' }} · Last successful refresh: {{ lastRefresh }} (Asia/Manila)</footer>
      </template>

      <template v-else>
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
    </main>
  </div>
</template>
