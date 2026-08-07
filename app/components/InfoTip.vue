<template>
  <span
    v-if="text"
    ref="rootEl"
    class="info-tip relative inline-flex max-w-full items-center gap-1.5"
  >
    <span
      ref="titleEl"
      class="relative min-w-0"
      :class="slotHoverable ? 'cursor-help' : ''"
      @mouseenter="onHoverEnter"
      @mouseleave="onHoverLeave"
    >
      <slot />
    </span>

    <button
      type="button"
      class="info-tip__btn relative z-50 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold leading-none hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
      :class="pinned
        ? 'border-[var(--accent)] text-[var(--accent-ink)]'
        : 'border-[var(--border)] text-[var(--mute)]'"
      :aria-expanded="pinned"
      :aria-label="pinned ? 'Close description' : ariaLabel"
      @click.stop="onIconClick"
    >
      i
    </button>

    <!-- Teleport + fixed: avoids parent overflow clipping (dashboard header / main). -->
    <Teleport to="body">
      <div
        v-if="panelVisible"
        ref="panelEl"
        class="info-tip__panel fixed z-[200] w-max max-w-sm rounded-md border-2 border-[var(--accent)] bg-[var(--surface-raised)] text-left text-xs leading-relaxed text-[var(--ink)] shadow-lg"
        :class="pinned ? 'pointer-events-auto' : 'pointer-events-none'"
        :style="panelStyle"
        :role="pinned ? 'dialog' : 'tooltip'"
        @mouseenter="onPanelEnter"
        @mouseleave="onHoverLeave"
        @click.stop
      >
        <div class="flex items-start gap-2 px-3 py-2">
          <p class="min-w-0 flex-1">
            {{ text }}
          </p>
          <button
            v-if="pinned"
            type="button"
            class="info-tip__close inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--border)] text-sm leading-none text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
            aria-label="Close description"
            @click.stop="closePinned"
          >
            ×
          </button>
        </div>
      </div>
    </Teleport>
  </span>
  <span
    v-else
    class="min-w-0"
  >
    <slot />
  </span>
</template>

<script setup>
const props = defineProps({
  text: {
    type: String,
    default: '',
  },
  ariaLabel: {
    type: String,
    default: 'Show description',
  },
  /** When true, hovering the slotted title also opens the tip. */
  slotHoverable: {
    type: Boolean,
    default: true,
  },
})

const rootEl = ref(null)
const titleEl = ref(null)
const panelEl = ref(null)
const hoverOpen = ref(false)
const pinned = ref(false)
/** @type {import('vue').Ref<{ top: string, left: string }>} */
const panelStyle = ref({ top: '0px', left: '0px' })

const panelVisible = computed(() => pinned.value || hoverOpen.value)

/**
 * Place tip over the title when there is room; otherwise below.
 * Uses fixed coords so ancestors with overflow cannot clip it.
 */
function positionPanel() {
  if (!import.meta.client || !titleEl.value) return
  const anchor = titleEl.value.getBoundingClientRect()
  const gap = 6
  const maxWidth = Math.min(384, window.innerWidth - 16)
  const provisionalHeight = panelEl.value?.offsetHeight || 72
  const spaceAbove = anchor.top
  const placeBelow = spaceAbove < provisionalHeight + gap + 8

  let top = placeBelow
    ? anchor.bottom + gap
    : anchor.top - gap - provisionalHeight
  let left = anchor.left

  // Keep within viewport horizontally.
  if (left + maxWidth > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - maxWidth - 8)
  }
  if (left < 8) left = 8

  // Keep within viewport vertically.
  if (top < 8) top = 8
  if (top + provisionalHeight > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - provisionalHeight - 8)
  }

  panelStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
  }
}

async function showAndPosition() {
  await nextTick()
  positionPanel()
  await nextTick()
  // Second pass with real tip height.
  positionPanel()
}

function onHoverEnter() {
  if (!props.slotHoverable || pinned.value) return
  hoverOpen.value = true
  void showAndPosition()
}

function onPanelEnter() {
  // Keep hover open while moving onto the teleported panel.
  if (!pinned.value && props.slotHoverable) hoverOpen.value = true
}

function onHoverLeave() {
  if (pinned.value) return
  hoverOpen.value = false
}

function closePinned() {
  pinned.value = false
  hoverOpen.value = false
}

async function onIconClick() {
  if (pinned.value) {
    closePinned()
    return
  }
  pinned.value = true
  hoverOpen.value = false
  await showAndPosition()
}

function onViewportChange() {
  if (panelVisible.value) positionPanel()
}

onMounted(() => {
  if (!import.meta.client) return
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>
