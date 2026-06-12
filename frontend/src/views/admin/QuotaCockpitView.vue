<template>
  <AppLayout>
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">
            {{ t('admin.quotaCockpit.title') }}
          </h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ t('admin.quotaCockpit.description') }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn btn-secondary" :disabled="loading" @click="loadData(true)">
            <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
            {{ t('common.refresh') }}
          </button>
          <router-link to="/admin/accounts" class="btn btn-secondary">
            {{ t('admin.quotaCockpit.manageAccounts') }}
          </router-link>
        </div>
      </div>

      <div v-if="loading && !accounts.length" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>

      <div v-else-if="error" class="card p-4 text-sm text-red-600 dark:text-red-400">
        {{ error }}
      </div>

      <template v-else>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div class="card p-3">
            <p class="text-xs text-gray-500">{{ t('admin.quotaCockpit.stats.total') }}</p>
            <p class="text-2xl font-bold">{{ accounts.length }}</p>
          </div>
          <div class="card p-3">
            <p class="text-xs text-gray-500">{{ t('admin.quotaCockpit.stats.rateLimited') }}</p>
            <p class="text-2xl font-bold text-red-500">{{ rateLimitedCount }}</p>
          </div>
          <div class="card p-3">
            <p class="text-xs text-gray-500">{{ t('admin.quotaCockpit.stats.critical') }}</p>
            <p class="text-2xl font-bold text-red-500">{{ criticalCount }}</p>
          </div>
          <div class="card p-3">
            <p class="text-xs text-gray-500">{{ t('admin.quotaCockpit.stats.warn') }}</p>
            <p class="text-2xl font-bold text-amber-500">{{ warnCount }}</p>
          </div>
          <div class="card p-3">
            <p class="text-xs text-gray-500">{{ t('admin.quotaCockpit.stats.companies') }}</p>
            <p class="text-2xl font-bold">{{ companyGroups.length }}</p>
          </div>
        </div>

        <p v-if="lastUpdated" class="text-xs text-gray-400">
          {{ t('admin.quotaCockpit.lastUpdated') }}: {{ lastUpdated }}
        </p>

        <section v-for="group in companyGroups" :key="group.company" class="space-y-3">
          <h2 class="border-b border-gray-200 pb-2 text-lg font-semibold dark:border-gray-700">
            {{ group.company }}
            <span class="ml-2 text-sm font-normal text-gray-500">
              {{ t('admin.quotaCockpit.accountCount', { count: group.accounts.length }) }}
            </span>
          </h2>

          <div class="grid gap-4 lg:grid-cols-2">
            <article
              v-for="account in group.accounts"
              :key="account.id"
              class="card p-4"
            >
              <div class="mb-3 flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h3 class="truncate font-semibold text-gray-900 dark:text-white">
                    {{ account.name }}
                  </h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ detectProvider(account).product }} · {{ account.platform }} / {{ account.type }}
                  </p>
                  <p v-if="account.groups?.length" class="mt-1 text-xs text-gray-400">
                    {{ account.groups.map((g) => g.name).join(', ') }}
                  </p>
                </div>
                <AccountStatusIndicator :account="account" />
              </div>

              <div class="mb-2 text-xs text-gray-500 dark:text-gray-400">
                <template v-if="todayStatsMap[account.id]">
                  {{ t('admin.quotaCockpit.todayUsage') }}:
                  <span class="font-medium text-gray-700 dark:text-gray-200">
                    {{ todayStatsMap[account.id].requests }} req ·
                    {{ formatCompactNumber(todayStatsMap[account.id].tokens) }} tok ·
                    ${{ todayStatsMap[account.id].cost.toFixed(4) }}
                  </span>
                </template>
                <template v-else-if="account.type === 'apikey'">
                  {{ t('admin.quotaCockpit.apiKeyHint') }}
                </template>
              </div>

              <AccountUsageCell
                :account="account"
                :today-stats="todayStatsMap[account.id] ?? null"
                :manual-refresh-token="manualRefreshToken"
              />

              <div
                v-if="hasConfiguredQuota(account)"
                class="mt-3 space-y-1 border-t border-gray-100 pt-3 dark:border-gray-700"
              >
                <p class="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  {{ t('admin.quotaCockpit.configuredQuota') }}
                </p>
                <UsageProgressBar
                  v-if="quotaDailyBar(account)"
                  label="1d $"
                  :utilization="quotaDailyBar(account)!.utilization"
                  :resets-at="quotaDailyBar(account)!.resetsAt"
                  color="indigo"
                />
                <UsageProgressBar
                  v-if="quotaWeeklyBar(account)"
                  label="7d $"
                  :utilization="quotaWeeklyBar(account)!.utilization"
                  :resets-at="quotaWeeklyBar(account)!.resetsAt"
                  color="emerald"
                />
                <UsageProgressBar
                  v-if="quotaTotalBar(account)"
                  label="total $"
                  :utilization="quotaTotalBar(account)!.utilization"
                  color="purple"
                />
              </div>
            </article>
          </div>
        </section>

        <p class="text-xs text-gray-400">
          {{ t('admin.quotaCockpit.footnote') }}
        </p>
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import Icon from '@/components/icons/Icon.vue'
import { AccountUsageCell, AccountStatusIndicator, UsageProgressBar } from '@/components/account'
import { adminAPI } from '@/api/admin'
import type { Account, WindowStats } from '@/types'
import { detectProvider, groupAccountsByCompany, accountMaxQuotaPercent } from '@/utils/quotaCockpit'
import { formatCompactNumber } from '@/utils/format'

const { t } = useI18n()

const loading = ref(false)
const error = ref<string | null>(null)
const accounts = ref<Account[]>([])
const todayStatsMap = ref<Record<number, WindowStats>>({})
const manualRefreshToken = ref(0)
const lastUpdated = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null

function makeQuotaBar(used: number, limit: number, resetsAt?: string | null) {
  if (limit <= 0) return null
  return {
    utilization: Math.min(999, Math.round((used / limit) * 100)),
    resetsAt: resetsAt ?? null
  }
}

function quotaDailyBar(account: Account) {
  const limit = account.quota_daily_limit ?? 0
  if (limit <= 0) return null
  return makeQuotaBar(account.quota_daily_used ?? 0, limit, account.quota_daily_reset_at)
}

function quotaWeeklyBar(account: Account) {
  const limit = account.quota_weekly_limit ?? 0
  if (limit <= 0) return null
  return makeQuotaBar(account.quota_weekly_used ?? 0, limit, account.quota_weekly_reset_at)
}

function quotaTotalBar(account: Account) {
  const limit = account.quota_limit ?? 0
  if (limit <= 0) return null
  return makeQuotaBar(account.quota_used ?? 0, limit)
}

function hasConfiguredQuota(account: Account) {
  return (
    (account.quota_daily_limit ?? 0) > 0 ||
    (account.quota_weekly_limit ?? 0) > 0 ||
    (account.quota_limit ?? 0) > 0
  )
}

const companyGroups = computed(() => groupAccountsByCompany(accounts.value))

const rateLimitedCount = computed(
  () => accounts.value.filter((a) => !!a.rate_limited_at).length
)

const criticalCount = computed(
  () => accounts.value.filter((a) => accountMaxQuotaPercent(a) >= 90).length
)

const warnCount = computed(
  () =>
    accounts.value.filter((a) => {
      const p = accountMaxQuotaPercent(a)
      return p >= 70 && p < 90
    }).length
)

async function loadData(forceUsageRefresh = false) {
  loading.value = true
  error.value = null
  try {
    const all: Account[] = []
    let page = 1
    const pageSize = 100
    while (true) {
      const res = await adminAPI.accounts.list(page, pageSize, {
        sort_by: 'id',
        sort_order: 'asc'
      })
      all.push(...res.items)
      if (all.length >= res.total || res.items.length < pageSize) break
      page++
      if (page > 20) break
    }
    accounts.value = all

    if (all.length > 0) {
      const batch = await adminAPI.accounts.getBatchTodayStats(all.map((a) => a.id))
      const map: Record<number, WindowStats> = {}
      for (const [id, stats] of Object.entries(batch.stats || {})) {
        map[Number(id)] = stats
      }
      todayStatsMap.value = map
    }

    if (forceUsageRefresh) {
      manualRefreshToken.value += 1
    }

    lastUpdated.value = new Date().toLocaleString()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData(false)
  refreshTimer = setInterval(() => loadData(true), 5 * 60 * 1000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>
