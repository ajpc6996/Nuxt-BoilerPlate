<template>
  <svg
    class="shrink-0"
    :class="sizeClass"
    :viewBox="def.viewBox || '0 0 24 24'"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      v-for="(path, index) in def.paths"
      :key="index"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      :fill-rule="path.fillRule"
      :d="path.d"
    />
  </svg>
</template>

<script setup>
import { getNavIcon } from '~/utils/navIcons.js'

const props = defineProps({
  /** Key from `NAV_ICONS` / nav group `icon` field. */
  name: {
    type: String,
    default: 'folder',
  },
  /** Tailwind size classes. */
  sizeClass: {
    type: String,
    default: 'h-5 w-5',
  },
})

const def = computed(() => getNavIcon(props.name))
</script>
