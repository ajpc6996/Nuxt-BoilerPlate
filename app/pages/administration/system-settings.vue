<template>
  <div class="mx-auto w-full max-w-3xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold text-[var(--ink)]">
          System Settings
        </h1>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Temp Stage hard caps for export buffers. Platform admin + MFA required.
        </p>
      </div>
      <NuxtLink
        to="/administration"
        class="btn-secondary !px-4 !py-2"
      >
        Back
      </NuxtLink>
    </div>

    <p
      v-if="error"
      class="mt-4 rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      class="mt-4 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--ink)]"
    >
      {{ notice }}
    </p>

    <div
      v-if="pending"
      class="mt-8 text-sm text-[var(--mute)]"
    >
      Loading settings…
    </div>

    <form
      v-else
      class="panel mt-8 space-y-5 p-5"
      @submit.prevent="save"
    >
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-[var(--ink)]">Max rows per batch</label>
        <input
          v-model.number="form.maxStageRowsPerBatch"
          type="number"
          min="50"
          max="50000"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
        <p class="text-xs text-[var(--mute-soft)]">
          Default 1000. Bounds 50–50,000. Caps ingest/stage RPC payload and Nitro batch size.
        </p>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-[var(--ink)]">Max bytes per batch</label>
        <input
          v-model.number="form.maxStageBytesPerBatch"
          type="number"
          min="65536"
          max="16777216"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
        <p class="text-xs text-[var(--mute-soft)]">
          Default 2,000,000 (≈2 MB). Bounds 64 KB–16 MB.
        </p>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-[var(--ink)]">Max concurrent staged rows per org</label>
        <input
          v-model.number="form.maxConcurrentStageRowsPerOrg"
          type="number"
          min="100"
          max="500000"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
        <p class="text-xs text-[var(--mute-soft)]">
          Default 2000 (about two live batches). Rejects a run that would exceed this in
          <span class="font-mono">staged.batches</span>.
        </p>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-[var(--ink)]">Stale stage TTL (minutes)</label>
        <input
          v-model.number="form.stageStaleTtlMinutes"
          type="number"
          min="5"
          max="1440"
          class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
        >
        <p class="text-xs text-[var(--mute-soft)]">
          Default 30. Orphaned Temp Stage rows older than this are deleted on the next run.
        </p>
      </div>

      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="btn-secondary !px-4 !py-2"
          :disabled="saving"
          @click="resetDefaults"
        >
          Reset defaults
        </button>
        <button
          type="submit"
          class="btn-primary !px-4 !py-2"
          :disabled="saving"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { DEFAULT_SYSTEM_SETTINGS } from '~~/shared/systemSettings.js'

definePageMeta({
  layout: 'app',
  middleware: ['auth', 'platform-admin'],
})

useHead({ title: 'System Settings' })

const authedFetch = useAuthedFetch()
const pending = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const form = reactive({ ...DEFAULT_SYSTEM_SETTINGS })

function applySettings(settings) {
  form.maxStageRowsPerBatch = settings.maxStageRowsPerBatch
  form.maxStageBytesPerBatch = settings.maxStageBytesPerBatch
  form.maxConcurrentStageRowsPerOrg = settings.maxConcurrentStageRowsPerOrg
  form.stageStaleTtlMinutes = settings.stageStaleTtlMinutes
}

function resetDefaults() {
  applySettings(DEFAULT_SYSTEM_SETTINGS)
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    const data = await authedFetch('/api/platform/system-settings')
    applySettings(data.settings || DEFAULT_SYSTEM_SETTINGS)
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load settings'
    applySettings(DEFAULT_SYSTEM_SETTINGS)
  }
  finally {
    pending.value = false
  }
}

async function save() {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const data = await authedFetch('/api/platform/system-settings', {
      method: 'PUT',
      body: { ...form },
    })
    applySettings(data.settings || form)
    notice.value = 'System settings saved.'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to save settings'
  }
  finally {
    saving.value = false
  }
}

onMounted(load)
</script>
