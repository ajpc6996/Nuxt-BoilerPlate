<template>
  <div class="mx-auto w-full max-w-[90rem] flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
          {{ form.name || 'Edit dashboard' }}
        </h1>
        <p class="mt-2 text-sm text-[var(--mute)]">
          Configure visibility, then build the canvas by dropping widget types.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <NuxtLink
          :to="`/dashboards/${route.params.id}`"
          class="btn-secondary !px-3 !py-1.5 text-sm"
        >
          View
        </NuxtLink>
        <NuxtLink
          to="/dashboards/configure"
          class="btn-secondary !px-3 !py-1.5 text-sm"
        >
          Back
        </NuxtLink>
        <button
          type="button"
          class="btn-primary !px-3 !py-1.5 text-sm"
          :disabled="saving"
          @click="saveDashboard"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>

    <p
      v-if="error"
      class="panel mt-6 border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      class="panel mt-6 border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink)]"
    >
      {{ notice }}
    </p>

    <div
      v-if="pending"
      class="mt-8 text-sm text-[var(--mute)]"
    >
      Loading…
    </div>

    <template v-else>
      <section class="panel mt-6 overflow-hidden">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface-raised)]"
          :aria-expanded="settingsOpen"
          @click="settingsOpen = !settingsOpen"
        >
          <div class="min-w-0">
            <p class="text-sm font-semibold text-[var(--ink)]">
              Dashboard settings
            </p>
            <p class="truncate text-[11px] text-[var(--mute)]">
              {{ form.name || 'Untitled' }}
              · {{ form.visibility }}
              <span v-if="toolsMenuEnabled"> · tools on</span>
            </p>
          </div>
          <span
            class="shrink-0 text-xs text-[var(--mute)]"
            aria-hidden="true"
          >{{ settingsOpen ? '▾' : '▸' }}</span>
        </button>

        <div
          v-show="settingsOpen"
          class="space-y-3 border-t border-[var(--border-soft)] px-4 py-3"
        >
          <div class="grid gap-2 sm:grid-cols-3">
            <div class="flex flex-col gap-0.5 sm:col-span-1">
              <label class="text-[10px] font-medium uppercase tracking-wide text-[var(--mute-soft)]">Name</label>
              <input
                v-model="form.name"
                type="text"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
              >
            </div>
            <div class="flex flex-col gap-0.5">
              <label class="text-[10px] font-medium uppercase tracking-wide text-[var(--mute-soft)]">Visibility</label>
              <select
                v-model="form.visibility"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
              >
                <option value="private">Private</option>
                <option value="role">Role-limited</option>
                <option value="public">Public in org</option>
              </select>
            </div>
            <label class="flex items-end gap-2 pb-1.5 text-xs text-[var(--ink)]">
              <input
                v-model="toolsMenuEnabled"
                type="checkbox"
                class="rounded border-[var(--border)]"
              >
              Enable view tools menu
            </label>
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] font-medium uppercase tracking-wide text-[var(--mute-soft)]">Description</label>
            <input
              v-model="form.description"
              type="text"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
              placeholder="Optional — shown via info on the view"
            >
          </div>
          <div
            v-if="form.visibility === 'role'"
            class="flex flex-col gap-1.5"
          >
            <label class="text-[10px] font-medium uppercase tracking-wide text-[var(--mute-soft)]">Roles that can view</label>
            <div class="flex flex-wrap gap-1.5">
              <label
                v-for="role in orgRoles"
                :key="role.id"
                class="flex items-center gap-1.5 rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--ink)]"
              >
                <input
                  v-model="form.roleIds"
                  type="checkbox"
                  :value="role.id"
                  class="accent-[var(--accent)]"
                >
                {{ role.name }}
              </label>
            </div>
          </div>
        </div>
      </section>

      <section class="mt-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-[var(--ink)]">
              Canvas
            </h2>
            <p class="mt-1 text-xs text-[var(--mute)]">
              Drag a type onto the canvas to add a widget (opens configure). Double-click a widget to edit. Drag the handle to move, corner to resize.
            </p>
          </div>
          <button
            v-if="layoutDirty"
            type="button"
            class="btn-primary !px-3 !py-1.5 text-sm"
            :disabled="savingLayout"
            @click="saveLayout"
          >
            {{ savingLayout ? 'Saving layout…' : 'Save layout' }}
          </button>
        </div>

        <div class="mt-4 flex flex-col gap-4 lg:flex-row">
          <aside class="panel w-full shrink-0 space-y-2 px-3 py-3 lg:w-48">
            <p class="text-[10px] font-semibold uppercase tracking-wide text-[var(--mute-soft)]">
              Widget types
            </p>
            <div
              v-for="t in DASHBOARD_WIDGET_TYPES"
              :key="t"
              role="button"
              tabindex="0"
              draggable="true"
              class="flex w-full cursor-grab select-none items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-left text-sm text-[var(--ink)] active:cursor-grabbing hover:border-[var(--accent)]"
              @dragstart="onPaletteDragStart($event, t)"
              @dragend="onPaletteDragEnd"
              @keydown.enter.prevent="addWidgetAtDefault(t)"
            >
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--surface-white)] text-[0.65rem] font-semibold text-[var(--mute)]">
                {{ widgetMeta(t).label.slice(0, 1) }}
              </span>
              <span class="truncate">{{ widgetMeta(t).label }}</span>
            </div>
          </aside>

          <div
            class="panel min-w-0 flex-1 overflow-hidden px-3 py-3"
            @dragover.prevent="onCanvasPanelDragOver"
            @drop.prevent="onCanvasPanelDrop"
          >
            <ClientOnly>
              <DashboardBoard
                ref="boardRef"
                :widgets="widgets"
                :cols="form.layout?.cols || 12"
                :locked="false"
                accept-palette-drop
                configure-mode
                @palette-drop="onPaletteDrop"
                @widget-dblclick="onWidgetDblClick"
                @change="onLayoutChange"
              >
                <template #widget="{ widget }">
                  <div class="flex h-full min-h-0 flex-col rounded-md border border-[var(--border-soft)] bg-[var(--surface-raised)]">
                    <div class="dashboard-widget__drag flex cursor-grab items-center justify-between gap-2 border-b border-[var(--border-soft)] px-2.5 py-2 active:cursor-grabbing">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-[var(--ink)]">
                          {{ widget.title }}
                        </p>
                        <p class="truncate text-[10px] text-[var(--mute)]">
                          {{ widgetMeta(widget.widget_type).label }}
                          <span v-if="!widgetConfigured(widget)"> · needs setup</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        class="shrink-0 text-xs text-[var(--danger)] hover:underline"
                        @click.stop="removeWidget(widget)"
                      >
                        Remove
                      </button>
                    </div>
                    <button
                      type="button"
                      class="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-4 text-center text-xs text-[var(--mute)] hover:bg-[var(--accent-soft)]/40 hover:text-[var(--accent-ink)]"
                      @dblclick.stop="openWidgetEditor(widget)"
                    >
                      <span>{{ widgetConfigured(widget) ? 'Double-click to edit' : 'Dropped — configure data' }}</span>
                      <span class="font-mono text-[10px] text-[var(--mute-soft)]">
                        {{ widget.grid_w }}×{{ widget.grid_h }} @ ({{ widget.grid_x }},{{ widget.grid_y }})
                      </span>
                    </button>
                  </div>
                </template>
              </DashboardBoard>
            </ClientOnly>
          </div>
        </div>
      </section>
    </template>

    <div
      v-if="widgetEditorOpen"
      class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[var(--modal-scrim)] p-4"
      @click.self="widgetEditorOpen = false"
    >
      <div class="panel my-6 w-full max-w-2xl px-6 py-5">
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
          Configure widget
        </h2>

        <div class="mt-4 space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Title</label>
              <input
                v-model="widgetForm.title"
                type="text"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              >
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Display type</label>
              <select
                v-model="widgetForm.widgetType"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              >
                <option
                  v-for="t in DASHBOARD_WIDGET_TYPES"
                  :key="t"
                  :value="t"
                >
                  {{ widgetMeta(t).label }}
                </option>
              </select>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Description</label>
            <textarea
              v-model="widgetForm.subtitle"
              rows="2"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              placeholder="Optional — shown via info on the widget"
            />
          </div>

          <div class="space-y-2 rounded-md border border-[var(--border-soft)] p-3">
            <p class="text-xs font-medium text-[var(--mute)]">
              Display options
            </p>
            <label class="flex items-center gap-2 text-sm text-[var(--ink)]">
              <input
                v-model="widgetForm.displayConfig.showWidgetType"
                type="checkbox"
                class="rounded border-[var(--border)]"
              >
              Show widget type on the dashboard
            </label>
            <label
              v-if="supportsChartToolbar"
              class="flex items-center gap-2 text-sm text-[var(--ink)]"
            >
              <input
                v-model="widgetToolsEnabled"
                type="checkbox"
                class="rounded border-[var(--border)]"
              >
              Enable chart toolbar on view
            </label>
            <label
              v-if="!isScalarWidget && widgetForm.widgetType !== 'table'"
              class="flex items-center gap-2 text-sm text-[var(--ink)]"
            >
              <input
                v-model="widgetForm.displayConfig.showLegend"
                type="checkbox"
                class="rounded border-[var(--border)]"
              >
              Show legend
            </label>
            <label
              v-if="!isScalarWidget && widgetForm.widgetType !== 'table'"
              class="flex items-center gap-2 text-sm text-[var(--ink)]"
            >
              <input
                v-model="widgetForm.displayConfig.showSeriesIndicators"
                type="checkbox"
                class="rounded border-[var(--border)]"
              >
              Show series markers / data labels
            </label>
          </div>

          <div
            v-if="widgetForm.widgetType === 'kpi'"
            class="space-y-2 rounded-md border border-[var(--border-soft)] p-3"
          >
            <p class="text-xs font-medium text-[var(--mute)]">
              KPI card options
            </p>
            <p class="text-[10px] text-[var(--mute-soft)]">
              Match the demo Revenue card: optional % change and sparkline. Pick a trend field (period/category) when enabling those.
            </p>
            <div class="grid gap-2 sm:grid-cols-3">
              <div class="flex flex-col gap-0.5">
                <label class="text-[10px] text-[var(--mute-soft)]">Prefix</label>
                <input
                  v-model="widgetForm.displayConfig.kpiPrefix"
                  type="text"
                  maxlength="16"
                  placeholder="$"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                >
              </div>
              <div class="flex flex-col gap-0.5">
                <label class="text-[10px] text-[var(--mute-soft)]">Suffix</label>
                <input
                  v-model="widgetForm.displayConfig.kpiSuffix"
                  type="text"
                  maxlength="16"
                  placeholder="%"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                >
              </div>
              <div class="flex flex-col gap-0.5">
                <label class="text-[10px] text-[var(--mute-soft)]">Number format</label>
                <select
                  v-model="widgetForm.displayConfig.kpiFormat"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                >
                  <option value="number">Full</option>
                  <option value="compact">Compact (12.4K)</option>
                </select>
              </div>
            </div>
            <label class="flex items-center gap-2 text-sm text-[var(--ink)]">
              <input
                v-model="widgetForm.displayConfig.showDelta"
                type="checkbox"
                class="rounded border-[var(--border)]"
              >
              Show % change vs prior period
            </label>
            <label class="flex items-center gap-2 text-sm text-[var(--ink)]">
              <input
                v-model="widgetForm.displayConfig.showSparkline"
                type="checkbox"
                class="rounded border-[var(--border)]"
              >
              Show sparkline
            </label>
            <div
              v-if="widgetForm.displayConfig.showDelta || widgetForm.displayConfig.showSparkline"
              class="flex flex-col gap-0.5"
            >
              <label class="text-[10px] text-[var(--mute-soft)]">Trend field (period / category)</label>
              <select
                v-model="widgetForm.dataConfig.kpiTrendField"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
              >
                <option value="">
                  Select…
                </option>
                <option
                  v-for="f in allQualifiedFields"
                  :key="f"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
              <p
                v-if="!widgetForm.dataConfig.kpiTrendField"
                class="text-[10px] text-[var(--danger)]"
              >
                Required for delta / sparkline.
              </p>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium text-[var(--mute)]">
                  Source table (ingest)
                </p>
                <p class="text-[10px] text-[var(--mute-soft)]">
                  Required for all widgets, including KPI / gauge.
                </p>
              </div>
              <button
                v-if="!isScalarWidget"
                type="button"
                class="text-xs text-[var(--accent-ink)] hover:underline"
                @click="addSource"
              >
                + Table
              </button>
            </div>
            <div
              v-for="(src, idx) in widgetForm.dataConfig.sources"
              :key="idx"
              class="flex flex-wrap items-end gap-2 rounded-md border border-[var(--border-soft)] p-2"
            >
              <div
                v-if="!isScalarWidget"
                class="min-w-[8rem] flex-1 flex flex-col gap-1"
              >
                <label class="text-[10px] text-[var(--mute-soft)]">Alias</label>
                <input
                  v-model="src.alias"
                  type="text"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
                  @change="loadFieldsForAlias(src.alias, src.table)"
                >
              </div>
              <div class="min-w-[10rem] flex-[2] flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Table</label>
                <select
                  v-model="src.table"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                  @change="onSourceTableChange(src)"
                >
                  <option value="">
                    Select…
                  </option>
                  <option
                    v-for="t in ingestTables"
                    :key="t"
                    :value="t"
                  >
                    {{ t }}
                  </option>
                </select>
              </div>
              <button
                v-if="!isScalarWidget"
                type="button"
                class="text-xs text-[var(--danger)] hover:underline"
                :disabled="widgetForm.dataConfig.sources.length <= 1"
                @click="removeSource(idx)"
              >
                Remove
              </button>
            </div>
            <p
              v-if="!ingestTables.length"
              class="text-xs text-[var(--danger)]"
            >
              No ingest tables found for this org. Run a source first, then refresh.
            </p>
          </div>

          <div
            v-if="!isScalarWidget && widgetForm.dataConfig.sources.length > 1"
            class="space-y-2"
          >
            <div class="flex items-center justify-between">
              <p class="text-xs font-medium text-[var(--mute)]">
                Joins
              </p>
              <button
                type="button"
                class="text-xs text-[var(--accent-ink)] hover:underline"
                @click="widgetForm.dataConfig.joins.push({ left: '', right: '' })"
              >
                + Join
              </button>
            </div>
            <div
              v-for="(join, idx) in widgetForm.dataConfig.joins"
              :key="idx"
              class="flex flex-wrap items-end gap-2"
            >
              <select
                v-model="join.left"
                class="min-w-[10rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
              >
                <option value="">
                  Left field…
                </option>
                <option
                  v-for="f in allQualifiedFields"
                  :key="`L-${f}`"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
              <span class="pb-2 text-xs text-[var(--mute)]">=</span>
              <select
                v-model="join.right"
                class="min-w-[10rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
              >
                <option value="">
                  Right field…
                </option>
                <option
                  v-for="f in allQualifiedFields"
                  :key="`R-${f}`"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
            </div>
          </div>

          <div
            v-if="!isScalarWidget"
            class="grid gap-3 sm:grid-cols-2"
          >
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Dimension / X-axis</label>
              <p class="text-[10px] text-[var(--mute-soft)]">
                Category labels (e.g. coin name).
              </p>
              <select
                v-model="widgetForm.dataConfig.dimensions[0]"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
              >
                <option value="">
                  None
                </option>
                <option
                  v-for="f in allQualifiedFields"
                  :key="`d-${f}`"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-[var(--mute)]">Series split (optional)</label>
              <p class="text-[10px] text-[var(--mute-soft)]">
                Split one metric by a column’s values. Leave empty when adding multiple metrics as separate lines.
              </p>
              <select
                v-model="widgetForm.dataConfig.seriesField"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
              >
                <option value="">
                  None
                </option>
                <option
                  v-for="f in allQualifiedFields"
                  :key="`s-${f}`"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-xs font-medium text-[var(--mute)]">
                  {{ isScalarWidget ? 'Value metric' : 'Metrics (Y values)' }}
                </p>
                <p class="text-[10px] text-[var(--mute-soft)]">
                  <template v-if="isScalarWidget">
                    One aggregate value for the KPI / gauge (e.g. count rows, or max of a field).
                  </template>
                  <template v-else>
                    For a multi-line chart, add one metric per line (e.g. low_24h and high_24h). Use max/min/sum as needed.
                  </template>
                </p>
              </div>
              <button
                v-if="!isScalarWidget"
                type="button"
                class="text-xs text-[var(--accent-ink)] hover:underline"
                @click="addMetric"
              >
                + Metric
              </button>
            </div>
            <div
              v-for="(metric, mIdx) in widgetForm.dataConfig.metrics"
              :key="mIdx"
              class="grid gap-2 rounded-md border border-[var(--border-soft)] p-2 sm:grid-cols-[1fr_7rem_1fr_auto]"
            >
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Field</label>
                <select
                  v-model="metric.field"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
                  @change="onMetricFieldChange(metric)"
                >
                  <option value="*">
                    * (count rows)
                  </option>
                  <option
                    v-for="f in allQualifiedFields"
                    :key="`m-${mIdx}-${f}`"
                    :value="f"
                  >
                    {{ f }}
                  </option>
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Aggregate</label>
                <select
                  v-model="metric.agg"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                >
                  <option
                    v-for="a in DASHBOARD_AGGS"
                    :key="a"
                    :value="a"
                  >
                    {{ a }}
                  </option>
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Series name</label>
                <input
                  v-model="metric.as"
                  type="text"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
                  placeholder="low_24h"
                >
              </div>
              <button
                type="button"
                class="self-end pb-2 text-xs text-[var(--danger)] hover:underline disabled:opacity-40"
                :disabled="widgetForm.dataConfig.metrics.length <= 1"
                @click="removeMetric(mIdx)"
              >
                Remove
              </button>
            </div>
          </div>

          <div
            v-if="!isScalarWidget"
            class="space-y-2 rounded-md border border-[var(--border-soft)] p-3"
          >
            <p class="text-xs font-medium text-[var(--mute)]">
              Sort &amp; top N
            </p>
            <p class="text-[10px] text-[var(--mute-soft)]">
              Example: sort by difference of high_24h − low_24h (desc) and limit 20 for the widest ranges.
            </p>
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Row limit</label>
                <input
                  v-model.number="widgetForm.dataConfig.limit"
                  type="number"
                  min="1"
                  max="5000"
                  placeholder="All (500)"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                >
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Sort by</label>
                <select
                  v-model="widgetForm.dataConfig.orderBy.mode"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                >
                  <option value="none">None</option>
                  <option value="metric">A metric</option>
                  <option value="diff">Difference (A − B)</option>
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Direction</label>
                <select
                  v-model="widgetForm.dataConfig.orderBy.dir"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                  :disabled="widgetForm.dataConfig.orderBy.mode === 'none'"
                >
                  <option value="desc">Highest first</option>
                  <option value="asc">Lowest first</option>
                </select>
              </div>
            </div>
            <div
              v-if="widgetForm.dataConfig.orderBy.mode === 'metric'"
              class="flex flex-col gap-1"
            >
              <label class="text-[10px] text-[var(--mute-soft)]">Metric to sort</label>
              <select
                v-model="widgetForm.dataConfig.orderBy.metricAs"
                class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
              >
                <option value="">
                  Select…
                </option>
                <option
                  v-for="m in widgetForm.dataConfig.metrics"
                  :key="m.as"
                  :value="m.as"
                >
                  {{ m.as }}
                </option>
              </select>
            </div>
            <div
              v-if="widgetForm.dataConfig.orderBy.mode === 'diff'"
              class="grid gap-2 sm:grid-cols-[1fr_auto_1fr_7rem] sm:items-end"
            >
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Left (e.g. high)</label>
                <select
                  v-model="widgetForm.dataConfig.orderBy.left"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
                >
                  <option value="">
                    Select…
                  </option>
                  <option
                    v-for="f in allQualifiedFields"
                    :key="`ol-${f}`"
                    :value="f"
                  >
                    {{ f }}
                  </option>
                </select>
              </div>
              <span class="hidden pb-2 text-center text-xs text-[var(--mute)] sm:block">−</span>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Right (e.g. low)</label>
                <select
                  v-model="widgetForm.dataConfig.orderBy.right"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--ink)]"
                >
                  <option value="">
                    Select…
                  </option>
                  <option
                    v-for="f in allQualifiedFields"
                    :key="`or-${f}`"
                    :value="f"
                  >
                    {{ f }}
                  </option>
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-[var(--mute-soft)]">Agg</label>
                <select
                  v-model="widgetForm.dataConfig.orderBy.agg"
                  class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                >
                  <option value="max">max</option>
                  <option value="min">min</option>
                  <option value="sum">sum</option>
                </select>
              </div>
            </div>
          </div>

          <p
            v-if="suggestedTypes.length"
            class="text-xs text-[var(--mute-soft)]"
          >
            Suggested display types for this shape:
            <span class="text-[var(--accent-ink)]">{{ suggestedTypes.join(', ') }}</span>
          </p>

          <p
            v-if="widgetError"
            class="text-sm text-[var(--danger)]"
          >
            {{ widgetError }}
          </p>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn-secondary !px-4 !py-2"
            @click="widgetEditorOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary !px-4 !py-2"
            :disabled="savingWidget"
            @click="saveWidget"
          >
            {{ savingWidget ? 'Saving…' : 'Save widget' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  DASHBOARD_AGGS,
  DASHBOARD_WIDGET_TYPES,
  createEmptyDataConfig,
  defaultWidgetGrid,
  normalizeDataConfig,
  suggestedDisplayTypes,
  widgetMeta,
} from '~~/shared/dashboard.js'
import { normalizeDisplayConfig, normalizeDashboardLayout, resolveLayoutCollisions } from '~~/shared/dashboardLayout.js'

definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

const route = useRoute()
const { activeOrganization } = useOrganization()
const authedFetch = useAuthedFetch()
const { confirm: appConfirm } = useAppConfirm()

const pending = ref(true)
const saving = ref(false)
const savingWidget = ref(false)
const error = ref('')
const notice = ref('')
const widgets = ref([])
const orgRoles = ref([])
const ingestTables = ref([])
/** @type {import('vue').Ref<Record<string, string[]>>} */
const fieldsByAlias = ref({})

const form = reactive({
  name: '',
  description: '',
  visibility: 'private',
  roleIds: [],
  layout: normalizeDashboardLayout({ version: 1, cols: 12 }),
})

/** Top-level flag — nested layout.tools.enabled was not reliably persisting via the checkbox. */
const toolsMenuEnabled = ref(false)
/** Top-level flag — nested displayConfig.showTools checkbox was not reliably persisting. */
const widgetToolsEnabled = ref(false)
/** Dashboard name / visibility / tools panel — collapsed by default for canvas space. */
const settingsOpen = ref(false)
const widgetEditorOpen = ref(false)
const editingWidgetId = ref(null)
const widgetError = ref('')
const boardRef = ref(null)
const layoutDirty = ref(false)
const savingLayout = ref(false)
/** @type {import('vue').Ref<Array<{ id: string, grid_x: number, grid_y: number, grid_w: number, grid_h: number }>>} */
const pendingLayout = ref([])
const dropping = ref(false)
/** Fallback when browser dataTransfer is empty on drop. */
const paletteDragType = ref('')

const widgetForm = reactive({
  title: 'Widget',
  subtitle: '',
  widgetType: 'bar',
  gridX: 0,
  gridY: 0,
  gridW: 6,
  gridH: 4,
  dataConfig: createEmptyDataConfig(),
  displayConfig: normalizeDisplayConfig({}),
})

const allQualifiedFields = computed(() => {
  /** @type {string[]} */
  const out = []
  Object.entries(fieldsByAlias.value).forEach(([alias, fields]) => {
    ;(fields || []).forEach((f) => out.push(`${alias}.${f}`))
  })
  return out.sort()
})

const suggestedTypes = computed(() =>
  suggestedDisplayTypes({
    dimensionCount: widgetForm.dataConfig.dimensions.filter(Boolean).length,
    metricCount: widgetForm.dataConfig.metrics.length,
    hasSeries: Boolean(widgetForm.dataConfig.seriesField),
  }),
)

const isScalarWidget = computed(() =>
  ['kpi', 'gauge'].includes(widgetForm.widgetType),
)

/** Chart types that expose vue-data-ui user-options toolbar. */
const supportsChartToolbar = computed(() =>
  ['line', 'bar', 'pie', 'donut', 'gauge'].includes(widgetForm.widgetType),
)

useHead(() => ({ title: form.name || 'Edit dashboard' }))

async function loadIngestTables() {
  if (!activeOrganization.value?.id) return
  try {
    const res = await authedFetch('/api/ingest/tables', {
      query: { organizationId: activeOrganization.value.id },
    })
    ingestTables.value = (res.items || []).map((t) =>
      typeof t === 'string' ? t : (t.name || t.table_name || ''),
    ).filter(Boolean)
  }
  catch {
    ingestTables.value = []
  }
}

async function loadRoles() {
  if (!activeOrganization.value?.id) return
  try {
    const client = useSupabaseClient()
    const { data } = await client
      .from('roles')
      .select('id, name')
      .eq('organization_id', activeOrganization.value.id)
      .order('name')
    orgRoles.value = data || []
  }
  catch {
    orgRoles.value = []
  }
}

/**
 * @param {string} alias
 * @param {string} table
 */
async function loadFieldsForAlias(alias, table) {
  if (!alias || !table || !activeOrganization.value?.id) return
  try {
    const res = await authedFetch('/api/ingest/columns', {
      query: {
        organizationId: activeOrganization.value.id,
        table,
      },
    })
    const cols = (res.items || [])
      .map((c) => (typeof c === 'string' ? c : c.name || c.column_name))
      .filter(Boolean)
    fieldsByAlias.value = {
      ...fieldsByAlias.value,
      [alias]: cols,
    }
  }
  catch {
    fieldsByAlias.value = { ...fieldsByAlias.value, [alias]: [] }
  }
}

async function refreshAllFields() {
  fieldsByAlias.value = {}
  await Promise.all(
    widgetForm.dataConfig.sources.map((s) => loadFieldsForAlias(s.alias, s.table)),
  )
}

function addSource() {
  const i = widgetForm.dataConfig.sources.length
  widgetForm.dataConfig.sources.push({
    kind: 'ingest',
    table: '',
    alias: `t${i}`,
  })
}

/**
 * @param {{ alias: string, table: string }} src
 */
function onSourceTableChange(src) {
  if (!src.alias) src.alias = 't0'
  loadFieldsForAlias(src.alias, src.table)
}

/**
 * @param {number} idx
 */
function removeSource(idx) {
  if (widgetForm.dataConfig.sources.length <= 1) return
  widgetForm.dataConfig.sources.splice(idx, 1)
}

function addMetric() {
  const i = widgetForm.dataConfig.metrics.length
  widgetForm.dataConfig.metrics.push({
    field: '*',
    agg: 'max',
    as: `metric_${i}`,
  })
}

/**
 * @param {number} idx
 */
function removeMetric(idx) {
  if (widgetForm.dataConfig.metrics.length <= 1) return
  widgetForm.dataConfig.metrics.splice(idx, 1)
}

/**
 * Prefer a clean series name from the selected field (t0.low_24h → low_24h).
 * @param {{ field: string, as: string }} metric
 */
function onMetricFieldChange(metric) {
  const field = String(metric.field || '')
  if (!field || field === '*') return
  const leaf = field.includes('.') ? field.split('.').pop() : field
  const safe = String(leaf || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^[^a-z]+/, '')
  if (safe && (!metric.as || /^metric_\d+$/.test(metric.as) || metric.as === 'value')) {
    metric.as = safe.slice(0, 63)
  }
}

/**
 * @param {Record<string, unknown>} widget
 */
function widgetConfigured(widget) {
  const cfg = normalizeDataConfig(widget?.data_config)
  return Boolean(cfg.sources[0]?.table)
}

/**
 * @param {DragEvent} event
 * @param {string} type
 */
function onPaletteDragStart(event, type) {
  paletteDragType.value = type
  if (!event.dataTransfer) return
  try {
    event.dataTransfer.setData('text/plain', type)
    event.dataTransfer.setData('application/x-dashboard-widget-type', type)
  }
  catch {
    // Some browsers throw on setData during certain drag starts
  }
  event.dataTransfer.effectAllowed = 'copy'
}

function onPaletteDragEnd() {
  // Keep type briefly so drop can still read it if dataTransfer was cleared
  setTimeout(() => {
    paletteDragType.value = ''
  }, 50)
}

/**
 * @param {DragEvent} event
 */
function onCanvasPanelDragOver(event) {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

/**
 * Panel-level fallback if the board missesthe drop.
 * @param {DragEvent} event
 */
function onCanvasPanelDrop(event) {
  const type = String(
    event.dataTransfer?.getData('text/plain')
    || paletteDragType.value
    || '',
  ).trim()
  if (!type) return
  onPaletteDrop({
    widgetType: type,
    clientX: event.clientX,
    clientY: event.clientY,
  })
}

/**
 * Click / keyboard fallback when drag-drop is unavailable.
 * @param {string} type
 */
function addWidgetAtDefault(type) {
  onPaletteDrop({
    widgetType: type,
    clientX: 0,
    clientY: 0,
  })
}

/**
 * @param {{ widgetType: string, clientX: number, clientY: number }} payload
 */
async function onPaletteDrop(payload) {
  if (!activeOrganization.value?.id || dropping.value) return
  const type = String(payload.widgetType || paletteDragType.value || '').trim()
  paletteDragType.value = ''
  if (!DASHBOARD_WIDGET_TYPES.includes(type)) return

  const size = defaultWidgetGrid(type)
  let grid = { grid_x: 0, grid_y: 0, ...size }
  if (payload.clientX || payload.clientY) {
    grid = boardRef.value?.clientToGrid?.(payload.clientX, payload.clientY, size)
      || grid
  }
  else {
    // Stack below existing widgets when added via keyboard
    const maxY = widgets.value.reduce(
      (m, w) => Math.max(m, (Number(w.grid_y) || 0) + (Number(w.grid_h) || 4)),
      0,
    )
    grid = { grid_x: 0, grid_y: maxY, ...size }
  }

  dropping.value = true
  error.value = ''
  try {
    const res = await authedFetch(`/api/dashboards/${route.params.id}/widgets`, {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        title: widgetMeta(type).label,
        widgetType: type,
        gridX: grid.grid_x,
        gridY: grid.grid_y,
        gridW: grid.grid_w ?? size.grid_w,
        gridH: grid.grid_h ?? size.grid_h,
        dataConfig: createEmptyDataConfig(),
        displayConfig: {},
      },
    })
    await load()
    if (res.item) {
      // Insert-style: push overlapping widgets down around the new one.
      const layoutItems = widgets.value.map((w) => ({
        id: w.id,
        grid_x: Number(w.grid_x) || 0,
        grid_y: Number(w.grid_y) || 0,
        grid_w: Math.max(1, Number(w.grid_w) || 6),
        grid_h: Math.max(1, Number(w.grid_h) || 4),
      }))
      const before = JSON.stringify(layoutItems)
      resolveLayoutCollisions(layoutItems, res.item.id)
      if (JSON.stringify(layoutItems) !== before) {
        onLayoutChange(layoutItems)
        await saveLayout()
      }
      openWidgetEditor(res.item)
      notice.value = 'Widget added — configure its data'
    }
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Drop failed'
  }
  finally {
    dropping.value = false
  }
}

/**
 * @param {Record<string, unknown>} widget
 */
function onWidgetDblClick(widget) {
  openWidgetEditor(widget)
}

/**
 * @param {Array<{ id: string, grid_x: number, grid_y: number, grid_w: number, grid_h: number }>} next
 */
function onLayoutChange(next) {
  pendingLayout.value = next
  layoutDirty.value = true
  widgets.value = widgets.value.map((w) => {
    const patch = next.find((n) => n.id === w.id)
    return patch ? { ...w, ...patch } : w
  })
}

async function saveLayout() {
  if (!activeOrganization.value?.id) return
  savingLayout.value = true
  error.value = ''
  try {
    await authedFetch(`/api/dashboards/${route.params.id}/layout`, {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        widgets: pendingLayout.value.length
          ? pendingLayout.value
          : widgets.value.map((w) => ({
              id: w.id,
              grid_x: w.grid_x,
              grid_y: w.grid_y,
              grid_w: w.grid_w,
              grid_h: w.grid_h,
            })),
      },
    })
    layoutDirty.value = false
    notice.value = 'Layout saved'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to save layout'
  }
  finally {
    savingLayout.value = false
  }
}

/**
 * @param {Record<string, unknown> | null} widget
 */
function openWidgetEditor(widget) {
  widgetError.value = ''
  if (!widget) return
  editingWidgetId.value = widget.id
  widgetForm.title = widget.title || 'Widget'
  widgetForm.subtitle = widget.subtitle || ''
  widgetForm.widgetType = widget.widget_type || 'bar'
  widgetForm.gridX = widget.grid_x || 0
  widgetForm.gridY = widget.grid_y || 0
  widgetForm.gridW = widget.grid_w || 6
  widgetForm.gridH = widget.grid_h || 4
  widgetForm.dataConfig = normalizeDataConfig(widget.data_config)
  widgetForm.displayConfig = normalizeDisplayConfig(widget.display_config)
  widgetToolsEnabled.value = widgetForm.displayConfig.showTools === true

  // normalizeDataConfig drops sources with empty table — keep a blank row for the form.
  if (!widgetForm.dataConfig.sources.length) {
    widgetForm.dataConfig.sources = [{ kind: 'ingest', table: '', alias: 't0' }]
  }
  if (!widgetForm.dataConfig.metrics.length) {
    widgetForm.dataConfig.metrics = [{ field: '*', agg: 'count', as: 'value' }]
  }
  if (!widgetForm.dataConfig.dimensions.length) {
    widgetForm.dataConfig.dimensions = ['']
  }
  if (!widgetForm.dataConfig.seriesField) {
    widgetForm.dataConfig.seriesField = ''
  }
  if (!widgetForm.dataConfig.orderBy) {
    widgetForm.dataConfig.orderBy = { mode: 'none', dir: 'desc', metricAs: '', left: '', right: '', agg: 'max' }
  }
  else {
    widgetForm.dataConfig.orderBy.metricAs = widgetForm.dataConfig.orderBy.metricAs || ''
    widgetForm.dataConfig.orderBy.left = widgetForm.dataConfig.orderBy.left || ''
    widgetForm.dataConfig.orderBy.right = widgetForm.dataConfig.orderBy.right || ''
  }
  if (widgetForm.dataConfig.kpiTrendField == null) {
    widgetForm.dataConfig.kpiTrendField = ''
  }
  widgetEditorOpen.value = true
  refreshAllFields()
}

async function saveWidget() {
  widgetError.value = ''
  // Clear chart-only fields for KPI / gauge (keep KPI trend field when used).
  if (isScalarWidget.value) {
    const trend = widgetForm.widgetType === 'kpi'
      ? (widgetForm.dataConfig.kpiTrendField || null)
      : null
    widgetForm.dataConfig.dimensions = []
    widgetForm.dataConfig.seriesField = ''
    widgetForm.dataConfig.joins = []
    widgetForm.dataConfig.sources = widgetForm.dataConfig.sources.slice(0, 1)
    widgetForm.dataConfig.metrics = widgetForm.dataConfig.metrics.slice(0, 1)
    widgetForm.dataConfig.orderBy = { mode: 'none', dir: 'desc', metricAs: '', left: '', right: '', agg: 'max' }
    widgetForm.dataConfig.limit = null
    widgetForm.dataConfig.kpiTrendField = trend
    if (
      widgetForm.widgetType === 'kpi'
      && (widgetForm.displayConfig.showDelta || widgetForm.displayConfig.showSparkline)
      && !trend
    ) {
      widgetError.value = 'Select a trend field for KPI delta / sparkline'
      return
    }
  }
  const dataConfig = normalizeDataConfig({
    ...widgetForm.dataConfig,
    dimensions: (widgetForm.dataConfig.dimensions || []).filter(Boolean),
    seriesField: widgetForm.dataConfig.seriesField || null,
    kpiTrendField: widgetForm.dataConfig.kpiTrendField || null,
  })
  if (!dataConfig.sources.length || !dataConfig.sources[0].table) {
    widgetError.value = 'Select an ingest source table'
    return
  }
  if (!dataConfig.metrics.length) {
    widgetError.value = 'Configure at least one metric'
    return
  }
  savingWidget.value = true
  try {
    const body = {
      organizationId: activeOrganization.value.id,
      title: widgetForm.title,
      subtitle: widgetForm.subtitle || null,
      widgetType: widgetForm.widgetType,
      gridX: widgetForm.gridX,
      gridY: widgetForm.gridY,
      gridW: widgetForm.gridW,
      gridH: widgetForm.gridH,
      dataConfig,
      displayConfig: normalizeDisplayConfig({
        ...widgetForm.displayConfig,
        showTools: supportsChartToolbar.value && widgetToolsEnabled.value === true,
        showDelta: widgetForm.widgetType === 'kpi' && widgetForm.displayConfig.showDelta === true,
        showSparkline: widgetForm.widgetType === 'kpi' && widgetForm.displayConfig.showSparkline === true,
        kpiPrefix: widgetForm.displayConfig.kpiPrefix || '',
        kpiSuffix: widgetForm.displayConfig.kpiSuffix || '',
        kpiFormat: widgetForm.displayConfig.kpiFormat || 'number',
      }),
      // Explicit top-level flag (same pattern as dashboard toolsMenuEnabled).
      showTools: supportsChartToolbar.value && widgetToolsEnabled.value === true,
    }
    if (editingWidgetId.value) {
      await authedFetch(
        `/api/dashboards/${route.params.id}/widgets/${editingWidgetId.value}`,
        { method: 'PUT', body },
      )
    }
    else {
      widgetError.value = 'Drop a widget on the canvas first'
      return
    }
    widgetEditorOpen.value = false
    notice.value = 'Widget saved'
    await load()
  }
  catch (err) {
    widgetError.value = err?.data?.statusMessage || err?.message || 'Save widget failed'
  }
  finally {
    savingWidget.value = false
  }
}

/**
 * @param {Record<string, unknown>} widget
 */
async function removeWidget(widget) {
  const ok = await appConfirm({
    title: 'Remove widget?',
    message: `Remove “${widget.title}”?`,
    confirmLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
  try {
    await authedFetch(`/api/dashboards/${route.params.id}/widgets/${widget.id}`, {
      method: 'DELETE',
      query: { organizationId: activeOrganization.value.id },
    })
    notice.value = 'Widget removed'
    await load()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Remove failed'
  }
}

async function saveDashboard() {
  if (!form.name.trim()) {
    error.value = 'Name is required'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const layout = normalizeDashboardLayout({
      version: form.layout?.version || 1,
      cols: form.layout?.cols || 12,
      tools: { enabled: toolsMenuEnabled.value === true },
      showToolsMenu: toolsMenuEnabled.value === true,
    })
    const res = await authedFetch(`/api/dashboards/${route.params.id}`, {
      method: 'PUT',
      body: {
        organizationId: activeOrganization.value.id,
        name: form.name.trim(),
        description: form.description,
        visibility: form.visibility,
        roleIds: form.roleIds,
        toolsMenuEnabled: toolsMenuEnabled.value === true,
        showToolsMenu: toolsMenuEnabled.value === true,
        layout,
      },
    })
    const savedLayout = normalizeDashboardLayout(res?.item?.layout ?? layout)
    form.layout = savedLayout
    toolsMenuEnabled.value = savedLayout.tools.enabled === true
    notice.value = toolsMenuEnabled.value
      ? 'Dashboard saved — tools menu enabled on view'
      : 'Dashboard saved — tools menu disabled on view'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Save failed'
  }
  finally {
    saving.value = false
  }
}

async function load() {
  if (!activeOrganization.value?.id || !route.params.id) return
  pending.value = true
  error.value = ''
  try {
    const res = await authedFetch(`/api/dashboards/${route.params.id}`, {
      query: { organizationId: activeOrganization.value.id },
    })
    const item = res.item
    form.name = item.name
    form.description = item.description || ''
    form.visibility = item.visibility
    form.roleIds = item.roleIds || []
    form.layout = normalizeDashboardLayout(item.layout)
    toolsMenuEnabled.value = form.layout.tools.enabled === true
    widgets.value = item.widgets || []
    layoutDirty.value = false
    pendingLayout.value = []
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load'
  }
  finally {
    pending.value = false
  }
}

watch(
  () => activeOrganization.value?.id,
  async () => {
    await Promise.all([load(), loadIngestTables(), loadRoles()])
  },
  { immediate: true },
)
</script>
