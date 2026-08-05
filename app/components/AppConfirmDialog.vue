<template>
  <Teleport to="body">
    <div
      v-if="active"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--modal-scrim)] p-4"
      role="presentation"
      @keydown.esc.prevent="onCancel"
      @click.self="onCancel"
    >
      <div
        class="panel w-full max-w-md px-5 py-4 shadow-lg"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="messageId"
      >
        <h2
          :id="titleId"
          class="font-display text-lg font-semibold text-[var(--ink)]"
        >
          {{ active.title }}
        </h2>
        <p
          :id="messageId"
          class="mt-2 whitespace-pre-wrap text-sm text-[var(--mute)]"
        >
          {{ active.message }}
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <button
            v-if="active.mode === 'confirm'"
            ref="cancelBtn"
            type="button"
            class="btn-secondary !px-3 !py-1.5 text-sm"
            @click="onCancel"
          >
            {{ active.cancelLabel }}
          </button>
          <button
            ref="confirmBtn"
            type="button"
            class="!px-3 !py-1.5 text-sm"
            :class="active.danger ? 'rounded-md bg-[var(--danger)] px-3 py-1.5 font-medium text-white hover:opacity-90' : 'btn-primary'"
            @click="onConfirm"
          >
            {{ active.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
const { active, settle } = useAppConfirm()

const titleId = 'app-confirm-title'
const messageId = 'app-confirm-message'
const confirmBtn = ref(null)
const cancelBtn = ref(null)

watch(active, async (val) => {
  if (!val) return
  await nextTick()
  const focusEl = val.mode === 'confirm' && !val.danger
    ? (cancelBtn.value || confirmBtn.value)
    : confirmBtn.value
  focusEl?.focus?.()
})

function onConfirm() {
  settle(true)
}

function onCancel() {
  if (!active.value) return
  settle(active.value.mode === 'alert')
}
</script>
