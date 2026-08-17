<template>
  <div class="mx-auto w-full max-w-4xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold text-[var(--ink)]">
          Connector drivers
        </h1>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Install and enable database drivers for inbound/outbound migrations. Platform admin + MFA required.
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
      Loading drivers…
    </div>

    <div
      v-else
      class="mt-8 space-y-4"
    >
      <p
        v-if="!status?.allowRemoteInstall"
        class="panel px-4 py-3 text-sm text-[var(--mute)]"
      >
        In-app install is off on this host. Use the manual commands below, or set
        <span class="font-mono text-[var(--accent-ink)]">ALLOW_PLATFORM_DRIVER_INSTALL=true</span>
        for self-hosted installs.
      </p>

      <article
        v-for="driver in status?.drivers || []"
        :key="driver.key"
        class="panel px-4 py-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="font-display text-lg font-semibold text-[var(--ink)]">
              {{ driver.label }}
            </h2>
            <p class="mt-1 text-sm text-[var(--mute)]">
              {{ driver.description }}
            </p>
            <p class="mt-2 font-mono text-xs text-[var(--mute-soft)]">
              npm: {{ driver.npmPackage }}@{{ driver.npmVersion }} ·
              {{ driver.directions.join(', ') }}
            </p>
          </div>
          <span
            class="rounded px-2 py-0.5 text-xs font-medium"
            :class="statusClass(driver.status)"
          >
            {{ statusLabel(driver.status) }}
          </span>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-if="driver.canInstallFromUi && !driver.installed"
            type="button"
            class="btn-primary !px-3 !py-1.5 text-sm"
            :disabled="busyKey === driver.key"
            @click="installDriver(driver.key)"
          >
            Install &amp; enable
          </button>
          <button
            v-else-if="driver.canEnable"
            type="button"
            class="btn-primary !px-3 !py-1.5 text-sm"
            :disabled="busyKey === driver.key"
            @click="enableDriver(driver.key)"
          >
            Enable
          </button>
          <button
            v-if="driver.enabled"
            type="button"
            class="btn-secondary !px-3 !py-1.5 text-sm"
            :disabled="busyKey === driver.key"
            @click="disableDriver(driver.key)"
          >
            Disable
          </button>
        </div>

        <details
          v-if="!driver.operational"
          class="mt-4"
        >
          <summary class="cursor-pointer text-sm text-[var(--accent-ink)]">
            Manual install instructions
          </summary>
          <pre class="mt-2 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--mute)]">{{ driver.installInstructions }}</pre>
        </details>
      </article>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin', 'platform-admin'],
})

useHead({ title: 'Connector drivers' })

const authedFetch = useAuthedFetch()
const { confirm } = useAppConfirm()

const pending = ref(true)
const error = ref('')
const notice = ref('')
const status = ref(null)
const busyKey = ref('')

function statusClass(code) {
  if (code === 'ready') return 'bg-emerald-500/15 text-emerald-300'
  if (code === 'enabled_needs_install') return 'bg-amber-500/15 text-amber-200'
  return 'bg-[var(--accent-soft)] text-[var(--mute)]'
}

function statusLabel(code) {
  const map = {
    ready: 'Ready',
    missing_package: 'Not installed',
    installed_needs_enable: 'Installed — enable',
    enabled_needs_install: 'Enabled — install package',
  }
  return map[code] || code
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    status.value = await authedFetch('/api/platform/connector-capabilities')
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Load failed'
  }
  finally {
    pending.value = false
  }
}

async function installDriver(key) {
  busyKey.value = key
  error.value = ''
  notice.value = ''
  try {
    await authedFetch(`/api/platform/connector-capabilities/${key}`, {
      method: 'POST',
      body: { action: 'install' },
    })
    notice.value = 'Driver installed and enabled. Connector type is now available for connections.'
    await load()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Install failed'
  }
  finally {
    busyKey.value = ''
  }
}

async function enableDriver(key) {
  busyKey.value = key
  error.value = ''
  notice.value = ''
  try {
    await authedFetch(`/api/platform/connector-capabilities/${key}`, {
      method: 'POST',
      body: { action: 'enable' },
    })
    notice.value = 'Driver enabled.'
    await load()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Enable failed'
  }
  finally {
    busyKey.value = ''
  }
}

async function disableDriver(key) {
  const ok = await confirm({
    title: 'Disable driver?',
    message: 'Connections using this driver will fail until it is enabled again.',
    confirmLabel: 'Disable',
    danger: true,
  })
  if (!ok) return
  busyKey.value = key
  error.value = ''
  try {
    await authedFetch(`/api/platform/connector-capabilities/${key}`, { method: 'DELETE' })
    notice.value = 'Driver disabled.'
    await load()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Disable failed'
  }
  finally {
    busyKey.value = ''
  }
}

onMounted(load)
</script>
