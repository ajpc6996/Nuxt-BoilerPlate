<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <NuxtLink
          to="/migrations"
          class="text-sm text-[var(--accent-ink)] hover:underline"
        >
          ← Migrations
        </NuxtLink>
        <h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
          {{ project?.name || 'Migration' }}
        </h1>
        <p
          v-if="project?.description"
          class="mt-2 max-w-2xl text-sm text-[var(--mute)]"
        >
          {{ project.description }}
        </p>
        <p class="mt-1 text-xs text-[var(--mute-soft)]">
          Status: {{ project?.status || '—' }} · Hybrid model: raw ingest + mapped dual-sink export
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn-secondary !px-3 !py-2 text-sm"
          :disabled="pageBusy"
          @click="saveProject"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button
          type="button"
          class="btn-primary !px-3 !py-2 text-sm"
          :disabled="pageBusy"
          @click="materialize"
        >
          {{ materializing ? 'Materializing…' : 'Materialize flows' }}
        </button>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="rounded-md px-3 py-1.5 text-sm transition"
        :class="activeTab === tab.id
          ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
          : 'text-[var(--mute)] hover:text-[var(--ink)]'"
        :disabled="pageBusy"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div
      v-if="busyMessage"
      class="sticky top-0 z-30 mt-6 flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--accent)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--ink)] shadow-lg"
      role="status"
      aria-live="assertive"
      aria-busy="true"
    >
      <div class="flex items-center gap-3">
        <span
          class="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"
          aria-hidden="true"
        />
        <span class="font-medium">{{ busyMessage }}</span>
        <span class="ml-auto text-xs text-[var(--mute)]">Please wait — actions are locked</span>
      </div>

      <div
        v-if="runProgress.active && runProgress.steps.length"
        class="space-y-2 border-t border-[var(--border-soft)] pt-3"
      >
        <div class="flex items-center justify-between text-xs text-[var(--mute)]">
          <span>Stage {{ runProgressCurrentNumber }} of {{ runProgress.steps.length }}</span>
          <span>{{ runProgressPercent }}%</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
          <div
            class="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
            :style="{ width: `${runProgressPercent}%` }"
          />
        </div>
        <ul class="max-h-48 space-y-1 overflow-y-auto text-xs">
          <li
            v-for="(step, idx) in runProgress.steps"
            :key="step.id"
            class="flex items-center gap-2 rounded px-2 py-1"
            :class="step.status === 'running'
              ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
              : step.status === 'failed'
                ? 'text-[var(--danger)]'
                : step.status === 'done'
                  ? 'text-emerald-300'
                  : 'text-[var(--mute)]'"
          >
            <span
              class="inline-flex h-4 w-4 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <span
                v-if="step.status === 'running'"
                class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              <span v-else-if="step.status === 'done'">✓</span>
              <span v-else-if="step.status === 'failed'">✕</span>
              <span v-else>{{ idx + 1 }}</span>
            </span>
            <span class="min-w-0 flex-1 truncate">
              {{ step.name }}
              <span
                v-if="step.entityKey"
                class="font-mono text-[var(--mute-soft)]"
              > · {{ step.entityKey }}</span>
            </span>
            <span class="shrink-0 capitalize">{{ step.stageType }}</span>
          </li>
        </ul>
      </div>
    </div>

    <p
      v-if="error"
      class="panel mt-6 border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>
    <p
      v-if="notice && !busyMessage"
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

    <div
      v-else-if="project"
      class="mt-8"
      :class="pageBusy ? 'pointer-events-none opacity-60' : ''"
      :aria-busy="pageBusy ? 'true' : undefined"
    >
      <!-- Setup -->
      <section v-show="activeTab === 'setup'" class="flex max-w-3xl flex-col gap-6">
        <MigrationConnectionSetup
          v-model="form.sourceConnectionId"
          v-model:system-id="form.sourceSystemId"
          title="Source system"
          subtitle="Legacy or upstream system — data is retrieved via an inbound connection."
          direction="inbound"
          role="source"
          :connections="connections"
          :catalog="connectorCatalog"
          :registered-runners="registeredRunners"
          :organization-id="activeOrganization?.id || ''"
          :inference-text="inferenceText"
          :capability-status="capabilityStatus"
          @connection-created="loadConnections"
        />

        <MigrationConnectionSetup
          v-model="form.destinationConnectionId"
          v-model:system-id="form.destinationSystemId"
          title="Destination system"
          subtitle="Target system — mapped rows export via an outbound connection (dual-sink)."
          direction="outbound"
          role="destination"
          :connections="connections"
          :catalog="connectorCatalog"
          :registered-runners="registeredRunners"
          :organization-id="activeOrganization?.id || ''"
          :inference-text="inferenceText"
          :capability-status="capabilityStatus"
          @connection-created="loadConnections"
        />

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-[var(--ink)]">Default run mode</label>
            <select
              v-model="form.defaultRunMode"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="sample">Sample (test, no write on sample)</option>
              <option value="pilot">Pilot (limited run)</option>
              <option value="full">Full</option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-[var(--ink)]">Sample limit</label>
            <input
              v-model.number="form.sampleLimit"
              type="number"
              min="1"
              max="500"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
          </div>
        </div>
        <label class="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-3">
          <input
            v-model="form.resetIngestBeforeRun"
            type="checkbox"
            class="mt-0.5 h-4 w-4 rounded border-[var(--border)]"
          >
          <span class="text-sm text-[var(--ink)]">
            <span class="font-medium">Reset ingest before pilot/full run</span>
            <span class="mt-1 block text-[var(--mute)]">
              Clears this migration&apos;s <span class="font-mono text-xs">mig_raw_*</span> and
              <span class="font-mono text-xs">mig_mapped_*</span> tables for your org at the start of each pilot or full run.
              Other migrations are not affected.
            </span>
          </span>
        </label>
      </section>

      <!-- Plan -->
      <section v-show="activeTab === 'plan'" class="flex flex-col gap-4">
        <div class="panel px-4 py-4">
          <h2 class="font-display text-lg font-semibold text-[var(--ink)]">
            Migration Plan
          </h2>
          <p class="mt-1 text-sm text-[var(--mute)]">
            Generate with AI, or add extraction and mapping steps yourself. Both use the same
            entity keys, table names, and materialize path.
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              class="btn-primary !px-4 !py-2 text-sm"
              :disabled="pageBusy"
              @click="openProposeDialog"
            >
              {{ proposing ? 'Generating…' : 'Generate plan with AI' }}
            </button>
            <button
              type="button"
              class="btn-secondary !px-4 !py-2 text-sm"
              :disabled="pageBusy"
              @click="openStageEditor({ stageType: 'extract' })"
            >
              Add extraction
            </button>
            <button
              type="button"
              class="btn-secondary !px-4 !py-2 text-sm"
              :disabled="pageBusy"
              @click="openStageEditor({ stageType: 'transform' })"
            >
              Add mapping
            </button>
            <button
              type="button"
              class="btn-secondary !px-4 !py-2 text-sm"
              :disabled="pageBusy || !stages.length"
              @click="introspectSchemas"
            >
              {{ introspecting ? 'Introspecting…' : 'Introspect schemas' }}
            </button>
            <button
              type="button"
              class="btn-secondary !px-4 !py-2 text-sm"
              :disabled="pageBusy || !stages.length"
              @click="validatePlan"
            >
              {{ validating ? 'Validating…' : 'Validate plan' }}
            </button>
          </div>
          <details
            v-if="validationResult"
            class="mt-4 rounded-md border px-3 py-3 text-sm"
            :class="validationResult.valid
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]'
              : 'border-[var(--danger)] bg-[var(--surface)] text-[var(--danger)]'"
          >
            <summary class="cursor-pointer font-medium">
              {{ validationResult.valid ? 'Plan validation passed' : 'Plan validation failed' }}
              <span class="ml-2 font-normal text-[var(--mute)]">
                ({{ validationResult.summary?.errorCount || 0 }} errors,
                {{ validationResult.summary?.warningCount || 0 }} warnings)
              </span>
            </summary>
            <ul
              v-if="validationIssues.length"
              class="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs"
            >
              <li
                v-for="issue in validationIssues"
                :key="issue.id"
                :class="issue.severity === 'error' ? 'text-[var(--danger)]' : 'text-[var(--mute)]'"
              >
                <span class="font-mono">[{{ issue.code }}]</span>
                {{ issue.message }}
                <span
                  v-if="issue.hint"
                  class="block text-[var(--mute-soft)]"
                >{{ issue.hint }}</span>
              </li>
            </ul>
            <p
              v-else
              class="mt-2 text-xs text-[var(--mute)]"
            >
              No issues listed.
            </p>
          </details>
          <p
            v-if="planNotes"
            class="mt-4 whitespace-pre-wrap text-sm text-[var(--mute)]"
          >
            {{ planNotes }}
          </p>
          <details
            v-if="constraintChecklist.length"
            class="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3"
          >
            <summary class="cursor-pointer text-sm font-semibold text-[var(--ink)]">
              Destination constraint checklist
              <span class="ml-2 font-normal text-[var(--mute)]">
                ({{ constraintChecklist.length }})
              </span>
            </summary>
            <ul class="mt-2 space-y-3 text-xs text-[var(--mute)]">
              <li
                v-for="(item, idx) in constraintChecklist"
                :key="`${item.entityKey}-${idx}`"
              >
                <div class="font-mono text-[var(--accent-ink)]">
                  {{ item.entityKey || 'entity' }}
                  <span v-if="item.destinationTable">→ {{ item.destinationTable }}</span>
                </div>
                <div v-if="item.requiredColumns?.length">
                  Required: {{ item.requiredColumns.join(', ') }}
                </div>
                <div v-if="item.mitigations?.length">
                  Mitigations: {{ item.mitigations.join('; ') }}
                </div>
                <div
                  v-if="item.residualRisks?.length"
                  class="text-[var(--danger)]"
                >
                  Residual risks: {{ item.residualRisks.join('; ') }}
                </div>
              </li>
            </ul>
          </details>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="border-b border-[var(--border)] text-[var(--mute)]">
              <tr>
                <th class="w-8 px-1 py-2" aria-label="Reorder" />
                <th class="px-3 py-2">#</th>
                <th class="px-3 py-2">Stage</th>
                <th class="px-3 py-2">Type</th>
                <th class="px-3 py-2">Entity</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Data flow</th>
                <th class="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(stage, idx) in stages"
                :key="stage.id"
                class="border-b border-[var(--border-soft)] transition-colors"
                :class="{
                  'opacity-50': dragStageIndex === idx,
                  'shadow-[inset_0_2px_0_0_var(--accent)]': dropBeforeIndex === idx && dragStageIndex >= 0,
                }"
                @dragover.prevent="onStageDragOver(idx, $event)"
                @drop.prevent="onStageDrop"
              >
                <td class="px-1 py-2 align-middle">
                  <span
                    class="inline-flex h-7 w-7 cursor-grab select-none items-center justify-center rounded text-[var(--mute-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)] active:cursor-grabbing"
                    :class="pageBusy || stages.length < 2 ? 'pointer-events-none opacity-40' : ''"
                    draggable="true"
                    title="Drag to reorder"
                    role="button"
                    tabindex="0"
                    aria-label="Drag to reorder stage"
                    @dragstart="onStageDragStart(idx, $event)"
                    @dragend="onStageDragEnd"
                  >
                    <span aria-hidden="true">⠿</span>
                  </span>
                </td>
                <td class="px-3 py-2 text-[var(--mute)]">{{ idx + 1 }}</td>
                <td class="px-3 py-2 text-[var(--ink)]">
                  <div>{{ stage.name }}</div>
                  <div
                    v-if="stage.description"
                    class="text-xs text-[var(--mute)]"
                  >
                    {{ stage.description }}
                  </div>
                </td>
                <td class="px-3 py-2 text-[var(--mute)]">{{ stageTypeLabel(stage.stage_type) }}</td>
                <td class="px-3 py-2 font-mono text-xs text-[var(--accent-ink)]">
                  {{ stage.entity_key || '—' }}
                </td>
                <td class="px-3 py-2 text-[var(--mute)]">{{ stage.status }}</td>
                <td class="px-3 py-2">
                  <NuxtLink
                    v-if="stage.data_source_id"
                    :to="openFlowLink(stage.data_source_id, { returnTab: 'plan' })"
                    class="text-[var(--accent-ink)] hover:underline"
                  >
                    Open flow
                  </NuxtLink>
                  <span v-else class="text-[var(--mute-soft)]">—</span>
                </td>
                <td class="px-3 py-2">
                  <div class="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      v-if="stage.stage_type === 'extract' || stage.stage_type === 'transform'"
                      type="button"
                      class="text-[var(--accent-ink)] hover:underline"
                      :disabled="pageBusy"
                      @click="openStageEditor({ stage })"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="group relative inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:opacity-50"
                      :disabled="pageBusy"
                      aria-label="Insert extract before this step"
                      @click="openStageEditor({ stageType: 'extract', insertAt: stage.sort_order ?? idx })"
                    >
                      <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                        <path stroke-linecap="round" d="M8 2.5v5M5.5 5H10.5" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.5 9.5h9v3.5H3.5z" />
                        <path stroke-linecap="round" d="M6 11h4" />
                      </svg>
                      <span
                        class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-[10px] font-medium text-[var(--ink)] opacity-0 shadow-md transition-opacity duration-75 group-hover:opacity-100 group-focus-visible:opacity-100"
                      >
                        Insert extract before this step
                      </span>
                    </button>
                    <button
                      type="button"
                      class="group relative inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:opacity-50"
                      :disabled="pageBusy"
                      aria-label="Insert mapping before this step"
                      @click="openStageEditor({ stageType: 'transform', insertAt: stage.sort_order ?? idx })"
                    >
                      <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                        <path stroke-linecap="round" d="M8 2v4M6 4h4" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.5 10.5h4l-1.2-1.2M7.5 10.5l-1.2 1.2" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12.5 10.5h-4l1.2-1.2M8.5 10.5l1.2 1.2" />
                      </svg>
                      <span
                        class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-[10px] font-medium text-[var(--ink)] opacity-0 shadow-md transition-opacity duration-75 group-hover:opacity-100 group-focus-visible:opacity-100"
                      >
                        Insert mapping before this step
                      </span>
                    </button>
                    <button
                      type="button"
                      class="group relative inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
                      :disabled="pageBusy"
                      aria-label="Remove plan step"
                      @click="deleteStage(stage)"
                    >
                      <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.5 4.5h9M6 4.5V3.25A.75.75 0 016.75 2.5h2.5a.75.75 0 01.75.75V4.5m-5.5 0l.6 8.25a1 1 0 001 .9h4.3a1 1 0 001-.9l.6-8.25M6.75 7v4.5M9.25 7v4.5" />
                      </svg>
                      <span
                        class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-[10px] font-medium text-[var(--ink)] opacity-0 shadow-md transition-opacity duration-75 group-hover:opacity-100 group-focus-visible:opacity-100"
                      >
                        Remove plan step
                      </span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr
                v-if="stages.length && dragStageIndex >= 0"
                class="h-0"
                aria-hidden="true"
                @dragover.prevent="dropBeforeIndex = stages.length"
                @drop.prevent="onStageDrop"
              >
                <td
                  colspan="8"
                  class="p-0"
                >
                  <div
                    class="h-0.5 transition-opacity"
                    :class="dropBeforeIndex === stages.length ? 'bg-[var(--accent)] opacity-100' : 'opacity-0'"
                  />
                </td>
              </tr>
              <tr v-if="!stages.length">
                <td
                  colspan="8"
                  class="px-3 py-6 text-center text-[var(--mute)]"
                >
                  No stages yet. Generate a plan with AI, or add an extraction / mapping step.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Mapping -->
      <section v-show="activeTab === 'mapping'" class="flex flex-col gap-6">
        <div
          v-for="stage in transformStages"
          :key="stage.id"
          class="panel px-4 py-4"
        >
          <details>
            <summary class="cursor-pointer font-display text-lg font-semibold text-[var(--ink)]">
              {{ stage.name }}
              <span class="ml-2 font-mono text-xs font-normal text-[var(--accent-ink)]">
                {{ stage.entity_key }}
              </span>
            </summary>
            <div class="mt-4">
              <MigrationFieldMapping
                :model-value="stage.config?.fieldMappings || []"
                :source-fields="entitySourceFields(stage)"
                :destination-fields="entityDestFields(stage)"
                :source-field-types="entitySourceFieldTypes(stage)"
                :destination-field-types="entityDestFieldTypes(stage)"
                :destination-system-id="destinationSystemId"
                :entity-key="stage.entity_key"
                @update:model-value="(val) => updateStageMappings(stage, val)"
                @known-fields="(payload) => rememberKnownFields(stage, payload)"
              />
              <button
                type="button"
                class="btn-secondary mt-4 !px-3 !py-1.5 text-xs"
                :disabled="pageBusy"
                @click="saveStage(stage)"
              >
                {{ savingStageId === stage.id ? 'Saving mappings…' : 'Save mappings' }}
              </button>
            </div>
          </details>
        </div>
        <p
          v-if="!transformStages.length"
          class="text-sm text-[var(--mute)]"
        >
          No transform stages. Generate a plan first.
        </p>
      </section>

      <!-- Run -->
      <section v-show="activeTab === 'run'" class="flex flex-col gap-4">
        <div class="panel px-4 py-4">
          <h2 class="font-display text-lg font-semibold text-[var(--ink)]">
            Run migration
          </h2>
          <p class="mt-1 text-sm text-[var(--mute)]">
            Sample uses test mode (preview rows). Pilot and full write to ingest and export via dual-sink.
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              class="btn-secondary !px-4 !py-2 text-sm"
              :disabled="pageBusy"
              @click="runMigration('sample')"
            >
              {{ runningMode === 'sample' ? 'Sample running…' : 'Sample run' }}
            </button>
            <button
              type="button"
              class="btn-secondary !px-4 !py-2 text-sm"
              :disabled="pageBusy"
              @click="runMigration('pilot')"
            >
              {{ runningMode === 'pilot' ? 'Pilot running…' : 'Pilot run' }}
            </button>
            <button
              type="button"
              class="btn-primary !px-4 !py-2 text-sm"
              :disabled="pageBusy"
              @click="confirmFullRun"
            >
              {{ runningMode === 'full' ? 'Full run in progress…' : 'Full run' }}
            </button>
            <button
              type="button"
              class="btn-secondary !px-4 !py-2 text-sm"
              :disabled="pageBusy || clearingIngest"
              @click="clearMigrationIngest"
            >
              {{ clearingIngest ? 'Clearing ingest…' : 'Clear ingest' }}
            </button>
            <button
              v-if="runs.length"
              type="button"
              class="btn-secondary !px-4 !py-2 text-sm"
              :disabled="pageBusy || clearingRuns"
              @click="clearRunHistory"
            >
              {{ clearingRuns ? 'Clearing…' : 'Clear run history' }}
            </button>
          </div>
        </div>

        <div
          v-if="runs.length"
          class="overflow-x-auto"
        >
          <table class="min-w-full text-left text-sm">
            <thead class="border-b border-[var(--border)] text-[var(--mute)]">
              <tr>
                <th class="px-3 py-2">Started</th>
                <th class="px-3 py-2">Mode</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              <template
                v-for="run in runs"
                :key="run.id"
              >
                <tr class="border-b border-[var(--border-soft)]">
                  <td class="px-3 py-2 text-[var(--mute)]">{{ formatDate(run.started_at) }}</td>
                  <td class="px-3 py-2">{{ run.run_mode }}</td>
                  <td class="px-3 py-2">{{ run.status }}</td>
                  <td class="px-3 py-2">
                    <div class="flex items-start gap-2">
                      <span
                        class="min-w-0 flex-1"
                        :class="run.status === 'failed' ? 'text-[var(--danger)]' : 'text-[var(--mute)]'"
                      >
                        {{ runSummary(run) }}
                      </span>
                      <button
                        type="button"
                        class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-xs font-semibold text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
                        :aria-expanded="expandedRunId === run.id"
                        :aria-label="expandedRunId === run.id ? 'Hide run details' : 'Show run details'"
                        :title="expandedRunId === run.id ? 'Hide details' : 'More info'"
                        @click="toggleRunDetails(run.id)"
                      >
                        i
                      </button>
                    </div>
                  </td>
                </tr>
                <tr
                  v-if="expandedRunId === run.id"
                  class="border-b border-[var(--border-soft)] bg-[var(--surface)]"
                >
                  <td
                    colspan="4"
                    class="px-3 py-3"
                  >
                    <div class="space-y-3 text-xs">
                      <p
                        v-if="run.last_error"
                        class="text-[var(--danger)]"
                      >
                        {{ run.last_error }}
                      </p>
                      <div
                        v-for="(sr, sIdx) in runStageResults(run)"
                        :key="`${run.id}-${sIdx}`"
                        class="rounded-md border border-[var(--border)] px-3 py-2"
                        :class="sr.ok === false ? 'border-[var(--danger)]' : ''"
                      >
                        <div class="flex flex-wrap items-center justify-between gap-2">
                          <div class="font-medium text-[var(--ink)]">
                            {{ sr.stageName || `Stage ${sIdx + 1}` }}
                            <span class="ml-2 font-mono text-[var(--mute)]">{{ sr.stageType }}</span>
                            <span
                              v-if="sr.entityKey"
                              class="ml-2 font-mono text-[var(--accent-ink)]"
                            >{{ sr.entityKey }}</span>
                          </div>
                          <span :class="sr.ok === false ? 'text-[var(--danger)]' : 'text-emerald-300'">
                            {{ sr.ok === false ? 'Failed' : 'OK' }}
                          </span>
                        </div>
                        <p
                          v-if="sr.error"
                          class="mt-1 text-[var(--danger)]"
                        >
                          {{ sr.error }}
                        </p>
                        <p
                          v-if="sr.hint"
                          class="mt-1 text-[var(--mute)]"
                        >
                          {{ sr.hint }}
                        </p>
                        <p
                          v-if="sr.ok !== false"
                          class="mt-1 text-[var(--mute)]"
                        >
                          fetched {{ sr.rowsFetched ?? '—' }}
                          · after pipeline {{ sr.rowsAfterPipeline ?? '—' }}
                          · wrote {{ sr.rowsWritten ?? 0 }}
                          · outbound {{ sr.outboundWritten ?? 0 }}
                        </p>
                        <div class="mt-2 flex flex-wrap gap-2">
                          <NuxtLink
                            v-if="sr.dataSourceId"
                            :to="openFlowLink(sr.dataSourceId, { returnTab: 'run' })"
                            class="text-[var(--accent-ink)] hover:underline"
                          >
                            Open data flow
                          </NuxtLink>
                          <button
                            v-if="sr.entityKey"
                            type="button"
                            class="text-[var(--accent-ink)] hover:underline"
                            @click="openMappingForEntity(sr.entityKey)"
                          >
                            Edit mappings
                          </button>
                        </div>
                      </div>
                      <p
                        v-if="!runStageResults(run).length"
                        class="text-[var(--mute)]"
                      >
                        No stage detail recorded for this run.
                      </p>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div
      v-if="proposeDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--modal-scrim)] p-4"
      @click.self="!proposing && (proposeDialogOpen = false)"
    >
      <form
        class="panel max-h-[90vh] w-full max-w-xl overflow-y-auto px-6 py-5"
        @submit.prevent="proposePlan"
      >
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
          Generate plan with AI
        </h2>
        <p class="mt-1 text-sm text-[var(--mute)]">
          Add operator guidance and documentation links the model should treat as authoritative
          (schema docs, API references, internal runbooks).
        </p>

        <div
          v-if="proposing"
          class="mt-4 flex items-center gap-3 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-3 text-sm text-[var(--ink)]"
          role="status"
          aria-live="assertive"
        >
          <span
            class="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"
            aria-hidden="true"
          />
          <span class="font-medium">Generating AI migration plan… This can take a while.</span>
        </div>

        <div class="mt-4 flex flex-col gap-1.5">
          <label class="text-sm font-medium text-[var(--ink)]">Additional guidance</label>
          <textarea
            v-model="proposeForm.operatorNotes"
            rows="5"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            placeholder="e.g. Zammad admin user id is 2; only migrate active RT users; tickets after 2024-01-01; preserve RT Queue names as Zammad Groups…"
            :disabled="proposing"
          />
          <p class="text-xs text-[var(--mute-soft)]">
            Combined with the project description. Include constraints, exclusions, and known IDs.
          </p>
        </div>

        <div class="mt-4 flex flex-col gap-1.5">
          <label class="text-sm font-medium text-[var(--ink)]">Documentation links</label>
          <textarea
            v-model="proposeForm.docsUrlsText"
            rows="4"
            class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
            placeholder="https://docs.zammad.org/...&#10;https://docs.bestpractical.com/rt/...&#10;(one URL per line)"
            :disabled="proposing"
          />
          <p class="text-xs text-[var(--mute-soft)]">
            One http(s) URL per line. Official schema/API docs work best.
          </p>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn-secondary !px-4 !py-2"
            :disabled="proposing"
            @click="proposeDialogOpen = false"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn-primary !px-4 !py-2"
            :disabled="proposing"
          >
            {{ proposing ? 'Generating plan…' : 'Generate plan' }}
          </button>
        </div>
      </form>
    </div>

    <MigrationStageEditor
      v-if="stageEditorOpen && stageDraft"
      :draft="stageDraft"
      :saving="savingStageEditor"
      :source-fields="entitySourceFields(stageDraftAsStage)"
      :destination-fields="entityDestFields(stageDraftAsStage)"
      :source-field-types="entitySourceFieldTypes(stageDraftAsStage)"
      :destination-field-types="entityDestFieldTypes(stageDraftAsStage)"
      :destination-system-id="destinationSystemId"
      :has-extract-pair="stageEditorHasExtractPair"
      @close="closeStageEditor"
      @save="saveStageEditor"
      @known-fields="onStageDraftKnownFields"
    />
  </div>
</template>

<script setup>
import {
  collectDestinationFieldOptions,
  collectSourceFieldOptions,
} from '~~/shared/migrationFieldOptions.js'
import {
  cleanEntityKey,
  migrationFlowName,
  normalizePlanConfig,
  upsertPlanEntity,
} from '~~/shared/migration.js'
import { getMigrationSystem, databaseLabel } from '~~/shared/migrationSystems.js'

definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

const route = useRoute()
const { activeOrganization } = useOrganization()
const { confirm } = useAppConfirm()
const authedFetch = useAuthedFetch()

const projectId = computed(() => String(route.params.id || ''))

/**
 * Deep-link into Data Flows with migration visibility + filter pre-set.
 * @param {string} dataSourceId
 * @param {{ returnTab?: string }} [opts]
 */
function openFlowLink(dataSourceId, opts = {}) {
  const id = String(dataSourceId || '').trim()
  const migrationId = projectId.value
  const returnTab = String(opts.returnTab || 'plan').trim() || 'plan'
  const params = new URLSearchParams({
    showMigrations: '1',
    migrationId,
    returnTo: `/migrations/${migrationId}?tab=${returnTab}`,
  })
  if (id) params.set('edit', id)
  return `/data-sources/sources?${params.toString()}`
}

const tabs = [
  { id: 'setup', label: 'Setup' },
  { id: 'plan', label: 'Plan' },
  { id: 'mapping', label: 'Mapping' },
  { id: 'run', label: 'Run' },
]

const activeTab = ref('setup')
const dragStageIndex = ref(-1)
const dropBeforeIndex = ref(-1)
const reorderingStages = ref(false)
const pending = ref(true)
const error = ref('')
const notice = ref('')
const project = ref(null)
const stages = ref([])
const runs = ref([])
const connections = ref([])
const connectorCatalog = ref([])
const capabilityStatus = ref(null)

const saving = ref(false)
const proposing = ref(false)
const validating = ref(false)
const introspecting = ref(false)
const validationResult = ref(null)
const materializing = ref(false)
const running = ref(false)
const runningMode = ref('')
const clearingRuns = ref(false)
const clearingIngest = ref(false)
const runProgress = ref({
  active: false,
  mode: '',
  steps: [],
  currentIndex: -1,
})
const savingStageId = ref('')
const savingStageEditor = ref(false)
const stageEditorOpen = ref(false)
const stageDraft = ref(null)
const stageInsertAt = ref(null)
const expandedRunId = ref(null)
const proposeDialogOpen = ref(false)
const proposeForm = reactive({
  operatorNotes: '',
  docsUrlsText: '',
})

const pageBusy = computed(() =>
  Boolean(
    saving.value
    || proposing.value
    || validating.value
    || introspecting.value
    || materializing.value
    || running.value
    || savingStageId.value
    || savingStageEditor.value
    || reorderingStages.value,
  ),
)

const busyMessage = computed(() => {
  if (reorderingStages.value) return 'Saving stage order…'
  if (validating.value) return 'Validating migration plan…'
  if (introspecting.value) return 'Introspecting source and destination schemas…'
  if (proposing.value) return 'Generating AI migration plan… This can take a while.'
  if (materializing.value) return 'Materializing data flows from stages…'
  if (runProgress.value.active) {
    const step = runProgress.value.steps[runProgress.value.currentIndex]
    const label = runProgress.value.mode || runningMode.value || 'run'
    if (step?.name) {
      return `${label} run: ${step.name}${step.entityKey ? ` (${step.entityKey})` : ''}…`
    }
    return `${label} run in progress…`
  }
  if (runningMode.value === 'sample') return 'Sample run in progress…'
  if (runningMode.value === 'pilot') return 'Pilot run in progress…'
  if (runningMode.value === 'full') return 'Full migration run in progress…'
  if (running.value) return 'Migration run in progress…'
  if (saving.value) return 'Saving project…'
  if (savingStageEditor.value) return 'Saving plan step…'
  if (savingStageId.value) return 'Saving field mappings…'
  return ''
})

const runProgressCurrentNumber = computed(() => {
  if (!runProgress.value.active || runProgress.value.currentIndex < 0) return 0
  return runProgress.value.currentIndex + 1
})

const runProgressPercent = computed(() => {
  const total = runProgress.value.steps.length
  if (!total || runProgress.value.currentIndex < 0) return 0
  const done = runProgress.value.steps.filter((step) => step.status === 'done').length
  const runningStep = runProgress.value.steps.some((step) => step.status === 'running') ? 0.5 : 0
  return Math.min(100, Math.round(((done + runningStep) / total) * 100))
})

/**
 * @returns {Array<Record<string, unknown>>}
 */
function getRunnableStages() {
  return (stages.value || [])
    .filter((stage) => stage.data_source_id && stage.stage_type !== 'validate' && stage.stage_type !== 'manual')
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
}

/**
 * Flip busy UI immediately, then yield until the browser paints the spinner
 * before starting the network call (avoids a “dead” UI during long requests).
 * @param {() => void} setBusy
 */
async function beginBusy(setBusy) {
  error.value = ''
  notice.value = ''
  setBusy()
  await nextTick()
  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
}

const form = reactive({
  sourceConnectionId: '',
  destinationConnectionId: '',
  sourceSystemId: 'custom',
  destinationSystemId: 'custom',
  defaultRunMode: 'sample',
  sampleLimit: 25,
  resetIngestBeforeRun: false,
})

const inferenceText = computed(() => {
  const parts = [project.value?.name, project.value?.description].filter(Boolean)
  return parts.join(' ')
})

const registeredRunners = computed(() => {
  const operational = (capabilityStatus.value?.drivers || [])
    .filter((d) => d.operational)
    .map((d) => d.key)
  const builtIn = capabilityStatus.value?.builtInRunners || ['rest_generic', 'csv_file', 'json_file']
  return [...new Set([...builtIn, ...operational])]
})

const planNotes = computed(() => {
  const cfg = project.value?.plan_config
  if (!cfg || typeof cfg !== 'object') return ''
  return cfg.aiNotes || cfg.sourceSummary || ''
})

const constraintChecklist = computed(() => {
  const cfg = project.value?.plan_config
  return Array.isArray(cfg?.constraintChecklist) ? cfg.constraintChecklist : []
})

const validationIssues = computed(() => {
  const list = validationResult.value?.issues
  return Array.isArray(list) ? list : []
})

function buildPlanConfigPatch() {
  const existing = project.value?.plan_config && typeof project.value.plan_config === 'object'
    ? project.value.plan_config
    : {}
  const source = getMigrationSystem(form.sourceSystemId)
  const dest = getMigrationSystem(form.destinationSystemId)
  return {
    ...existing,
    sourceSystemId: form.sourceSystemId,
    destinationSystemId: form.destinationSystemId,
    sourceSummary: `${source.label} (${databaseLabel(source.database)})`,
    destinationSummary: `${dest.label} (${databaseLabel(dest.database)})`,
  }
}
const transformStages = computed(() =>
  stages.value.filter((s) => s.stage_type === 'transform'),
)

const stageDraftAsStage = computed(() => {
  const d = stageDraft.value
  if (!d) return { entity_key: '', config: {} }
  return {
    entity_key: d.entityKey,
    config: {
      sourceEntity: d.sourceEntity,
      destinationEntity: d.destinationEntity,
      fieldMappings: d.fieldMappings,
    },
  }
})

const stageEditorHasExtractPair = computed(() => {
  const d = stageDraft.value
  if (!d || d.stageType === 'extract') return true
  const key = cleanEntityKey(d.entityKey)
  if (!key) return false
  return (stages.value || []).some((s) => (
    s.stage_type === 'extract' && cleanEntityKey(s.entity_key) === key
  ))
})

/**
 * @param {string} type
 */
function stageTypeLabel(type) {
  if (type === 'extract') return 'extraction'
  if (type === 'transform') return 'mapping'
  return type || '—'
}

/**
 * @param {{
 *   stage?: Record<string, unknown>,
 *   stageType?: string,
 *   insertAt?: number | null,
 * }} opts
 */
function openStageEditor(opts = {}) {
  const existing = opts.stage
  const stageType = existing?.stage_type || opts.stageType || 'extract'
  stageInsertAt.value = opts.insertAt == null || opts.insertAt === ''
    ? null
    : Number(opts.insertAt)
  if (existing) {
    const cfg = existing.config && typeof existing.config === 'object' ? existing.config : {}
    stageDraft.value = {
      id: existing.id,
      stageType,
      name: existing.name || '',
      description: existing.description || '',
      entityKey: existing.entity_key || '',
      sourceEntity: cfg.sourceEntity || '',
      destinationEntity: cfg.destinationEntity || '',
      fieldMappings: Array.isArray(cfg.fieldMappings)
        ? cfg.fieldMappings.map((row) => ({ ...row }))
        : [],
    }
  }
  else {
    const entityKey = ''
    const draft = {
      id: '',
      stageType,
      name: migrationFlowName({ stageType, entityKey: 'entity' }),
      description: '',
      entityKey,
      sourceEntity: '',
      destinationEntity: '',
      fieldMappings: [],
    }
    if (stageType === 'transform') {
      const firstExtract = (stages.value || []).find((s) => s.stage_type === 'extract')
      if (firstExtract) {
        draft.entityKey = firstExtract.entity_key || ''
        draft.sourceEntity = firstExtract.config?.sourceEntity || ''
        draft.name = migrationFlowName({
          stageType: 'transform',
          entityKey: draft.entityKey || 'entity',
        })
      }
    }
    stageDraft.value = draft
  }
  stageEditorOpen.value = true
  activeTab.value = 'plan'
}

function closeStageEditor() {
  stageEditorOpen.value = false
  stageDraft.value = null
  stageInsertAt.value = null
  activeTab.value = 'plan'
}

const planConfigForFields = computed(() => {
  const raw = project.value?.plan_config && typeof project.value.plan_config === 'object'
    ? project.value.plan_config
    : {}
  return normalizePlanConfig({
    ...raw,
    sourceSystemId: raw.sourceSystemId || raw.source_system_id || form.sourceSystemId,
    destinationSystemId:
      raw.destinationSystemId || raw.destination_system_id || form.destinationSystemId,
  })
})

const entitiesCatalog = computed(() => {
  const cfg = planConfigForFields.value
  return Array.isArray(cfg?.entities) ? cfg.entities : []
})

const destinationSystemId = computed(() => {
  const cfg = planConfigForFields.value
  return String(cfg?.destinationSystemId || form.destinationSystemId || '').trim()
})

const catalogEntity = (entityKey) => {
  const key = cleanEntityKey(entityKey)
  const list = entitiesCatalog.value
  return list.find((e) => e.key === entityKey)
    || list.find((e) => cleanEntityKey(e.key) === key)
    || null
}

const mappingExtraFields = (stage) => {
  const mappings = Array.isArray(stage?.config?.fieldMappings) ? stage.config.fieldMappings : []
  const sources = []
  const destinations = []
  for (const row of mappings) {
    if (Array.isArray(row?.sources)) sources.push(...row.sources)
    if (row?.destination) destinations.push(row.destination)
  }
  return { sources, destinations }
}

/**
 * Keep discovered and typed field names on the plan entity (additive only).
 * @param {Record<string, unknown>} stage
 * @param {{
 *   sourceFields?: unknown[],
 *   destinationFields?: unknown[],
 *   sourceFieldTypes?: Record<string, string>,
 *   destinationFieldTypes?: Record<string, string>,
 * }} payload
 */
function rememberKnownFields(stage, payload) {
  const entityKey = stage?.entity_key || stage?.entityKey
  if (!entityKey) return
  const cfg = stage?.config && typeof stage.config === 'object' ? stage.config : {}
  const extra = mappingExtraFields(stage)
  const prevPlan = project.value?.plan_config
  const nextPlan = upsertPlanEntity(prevPlan, {
    key: entityKey,
    label: entityKey,
    sourceEntity: cfg.sourceEntity,
    destinationEntity: cfg.destinationEntity,
    sourceFields: [...(payload?.sourceFields || []), ...extra.sources],
    destinationFields: [...(payload?.destinationFields || []), ...extra.destinations],
    sourceFieldTypes: payload?.sourceFieldTypes || {},
    destinationFieldTypes: payload?.destinationFieldTypes || {},
  })
  const prevEnt = Array.isArray(prevPlan?.entities) ? prevPlan.entities : []
  const nextEnt = Array.isArray(nextPlan.entities) ? nextPlan.entities : []
  if (JSON.stringify(prevEnt) === JSON.stringify(nextEnt)) return
  if (project.value) {
    project.value = { ...project.value, plan_config: nextPlan }
  }
}

function onStageDraftKnownFields(payload) {
  const d = stageDraft.value
  if (!d) return
  rememberKnownFields({
    entity_key: d.entityKey,
    config: {
      sourceEntity: d.sourceEntity,
      destinationEntity: d.destinationEntity,
      fieldMappings: d.fieldMappings,
    },
  }, payload)
}

const entitySourceFields = (stage) => {
  const entityKey = stage?.entity_key || stage?.entityKey
  const cfg = stage?.config && typeof stage.config === 'object' ? stage.config : {}
  const ent = catalogEntity(entityKey)
  const extra = mappingExtraFields(stage)
  return collectSourceFieldOptions({
    planConfig: planConfigForFields.value,
    entityKey,
    tableHint: cfg.sourceEntity || ent?.sourceEntity || '',
    catalogFields: ent?.sourceFields || [],
    extraFields: extra.sources,
  })
}

const entityDestFields = (stage) => {
  const entityKey = stage?.entity_key || stage?.entityKey
  const cfg = stage?.config && typeof stage.config === 'object' ? stage.config : {}
  const ent = catalogEntity(entityKey)
  const extra = mappingExtraFields(stage)
  return collectDestinationFieldOptions({
    planConfig: planConfigForFields.value,
    entityKey,
    tableHint: cfg.destinationEntity || cfg.destinationTable || ent?.destinationEntity || '',
    catalogFields: ent?.destinationFields || [],
    extraFields: extra.destinations,
  })
}

/**
 * @param {Record<string, unknown>} stage
 * @returns {Record<string, string>}
 */
const entitySourceFieldTypes = (stage) => {
  const ent = catalogEntity(stage?.entity_key || stage?.entityKey)
  return ent?.sourceFieldTypes && typeof ent.sourceFieldTypes === 'object'
    ? ent.sourceFieldTypes
    : {}
}

/**
 * @param {Record<string, unknown>} stage
 * @returns {Record<string, string>}
 */
const entityDestFieldTypes = (stage) => {
  const ent = catalogEntity(stage?.entity_key || stage?.entityKey)
  return ent?.destinationFieldTypes && typeof ent.destinationFieldTypes === 'object'
    ? ent.destinationFieldTypes
    : {}
}

const formatDate = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

/**
 * @param {Record<string, unknown>} run
 */
function runStageResults(run) {
  return Array.isArray(run?.stage_results) ? run.stage_results : []
}

/**
 * @param {Record<string, unknown>} run
 */
function runSummary(run) {
  if (run?.last_error) return run.last_error
  const results = runStageResults(run)
  if (!results.length) return run?.status === 'completed' ? 'Completed' : '—'
  const failed = results.find((r) => r && r.ok === false)
  if (failed) {
    return `Failed on “${failed.stageName || 'stage'}”${failed.entityKey ? ` (${failed.entityKey})` : ''}`
  }
  return `Completed · ${results.length} stage${results.length === 1 ? '' : 's'}`
}

/**
 * @param {string} runId
 */
function toggleRunDetails(runId) {
  expandedRunId.value = expandedRunId.value === runId ? null : runId
}

/**
 * @param {string} entityKey
 */
function openMappingForEntity(entityKey) {
  activeTab.value = 'mapping'
  notice.value = entityKey
    ? `Review mappings for entity “${entityKey}”, then rematerialize before retrying.`
    : 'Review mappings, then rematerialize before retrying.'
}

const loadConnections = async () => {
  if (!activeOrganization.value?.id) return
  try {
    const [connRes, catalogRes, capRes] = await Promise.all([
      authedFetch('/api/connections', {
        query: { organizationId: activeOrganization.value.id },
      }),
      authedFetch('/api/connector-types/catalog', {
        query: { organizationId: activeOrganization.value.id },
      }),
      authedFetch('/api/connector-capabilities/status', {
        query: { organizationId: activeOrganization.value.id },
      }),
    ])
    connections.value = connRes.items || []
    connectorCatalog.value = catalogRes.items || []
    capabilityStatus.value = capRes
  }
  catch {
    connections.value = []
    connectorCatalog.value = []
    capabilityStatus.value = null
  }
}

const load = async () => {
  if (!activeOrganization.value?.id || !projectId.value) return
  pending.value = true
  error.value = ''
  try {
    const res = await authedFetch(`/api/migrations/${projectId.value}`, {
      query: { organizationId: activeOrganization.value.id },
    })
    project.value = res.item
    stages.value = res.stages || []
    runs.value = res.runs || []
    form.sourceConnectionId = res.item.source_connection_id || ''
    form.destinationConnectionId = res.item.destination_connection_id || ''
    form.defaultRunMode = res.item.default_run_mode || 'sample'
    form.sampleLimit = res.item.sample_limit || 25
    form.resetIngestBeforeRun = Boolean(res.item.reset_ingest_before_run)
    const cfg = res.item.plan_config && typeof res.item.plan_config === 'object'
      ? res.item.plan_config
      : {}
    form.sourceSystemId = cfg.sourceSystemId || 'custom'
    form.destinationSystemId = cfg.destinationSystemId || 'custom'
    validationResult.value = cfg.lastValidation || null
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Load failed'
  }
  finally {
    pending.value = false
  }
}

watch([() => activeOrganization.value?.id, projectId], () => {
  loadConnections()
  load()
}, { immediate: true })

function applyTabFromRoute() {
  const tab = String(route.query.tab || '').trim()
  if (tabs.some((t) => t.id === tab)) {
    activeTab.value = tab
  }
}

watch(() => route.query.tab, applyTabFromRoute, { immediate: true })

/**
 * @param {number} idx
 * @param {DragEvent} event
 */
function onStageDragStart(idx, event) {
  if (pageBusy.value || (stages.value || []).length < 2) {
    event.preventDefault()
    return
  }
  dragStageIndex.value = idx
  dropBeforeIndex.value = idx
  event.dataTransfer?.setData('text/plain', String(stages.value[idx]?.id || idx))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

/**
 * @param {number} idx
 * @param {DragEvent} event
 */
function onStageDragOver(idx, event) {
  if (dragStageIndex.value < 0) return
  const row = event.currentTarget
  if (!(row instanceof HTMLElement) || idx >= (stages.value || []).length) {
    dropBeforeIndex.value = idx
    return
  }
  const rect = row.getBoundingClientRect()
  const before = event.clientY < rect.top + rect.height / 2
  dropBeforeIndex.value = before ? idx : idx + 1
}

function onStageDragEnd() {
  dragStageIndex.value = -1
  dropBeforeIndex.value = -1
}

async function onStageDrop() {
  const from = dragStageIndex.value
  let insertAt = dropBeforeIndex.value
  dragStageIndex.value = -1
  dropBeforeIndex.value = -1
  if (from < 0 || insertAt < 0 || pageBusy.value) return
  if (insertAt > from) insertAt -= 1
  if (insertAt === from) return

  const previous = [...(stages.value || [])]
  const next = [...previous]
  const [item] = next.splice(from, 1)
  if (!item) return
  next.splice(insertAt, 0, item)
  stages.value = next.map((stage, i) => ({ ...stage, sort_order: i }))

  reorderingStages.value = true
  error.value = ''
  try {
    if (!activeOrganization.value?.id) {
      throw new Error('Organization required')
    }
    const res = await authedFetch(`/api/migrations/${projectId.value}/stages/reorder`, {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        stageIds: next.map((stage) => stage.id),
      },
    })
    if (Array.isArray(res.stages)) {
      stages.value = res.stages
    }
  }
  catch (err) {
    stages.value = previous
    error.value = err?.data?.statusMessage || err?.message || 'Failed to reorder stages'
  }
  finally {
    reorderingStages.value = false
  }
}

useHead(() => ({ title: project.value?.name ? `${project.value.name} · Migration` : 'Migration' }))

const saveProject = async (opts = {}) => {
  if (!activeOrganization.value?.id) return
  const quiet = Boolean(opts.quiet)
  if (!quiet) {
    await beginBusy(() => {
      saving.value = true
    })
  }
  try {
    const res = await authedFetch(`/api/migrations/${projectId.value}`, {
      method: 'PUT',
      body: {
        organizationId: activeOrganization.value.id,
        sourceConnectionId: form.sourceConnectionId || null,
        destinationConnectionId: form.destinationConnectionId || null,
        defaultRunMode: form.defaultRunMode,
        sampleLimit: form.sampleLimit,
        resetIngestBeforeRun: form.resetIngestBeforeRun,
        planConfig: buildPlanConfigPatch(),
      },
    })
    project.value = res.item
    if (!quiet) notice.value = 'Project saved.'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Save failed'
    if (quiet) throw err
  }
  finally {
    if (!quiet) saving.value = false
  }
}

const proposePlan = async () => {
  if (!activeOrganization.value?.id || pageBusy.value) return
  await beginBusy(() => {
    proposing.value = true
  })
  try {
    await saveProject({ quiet: true })
    const docsUrls = String(proposeForm.docsUrlsText || '')
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((u) => /^https?:\/\//i.test(u))
    const operatorNotes = String(proposeForm.operatorNotes || '').trim()
    const res = await authedFetch(`/api/migrations/${projectId.value}/apply-plan`, {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        sourceSystemId: form.sourceSystemId,
        destinationSystemId: form.destinationSystemId,
        sourceSummary: `${getMigrationSystem(form.sourceSystemId).label} (${databaseLabel(getMigrationSystem(form.sourceSystemId).database)})`,
        destinationSummary: `${getMigrationSystem(form.destinationSystemId).label} (${databaseLabel(getMigrationSystem(form.destinationSystemId).database)})`,
        operatorNotes,
        docsUrls,
      },
    })
    project.value = res.item
    stages.value = res.stages || []
    validationResult.value = res.item?.plan_config?.lastValidation || null
    proposeDialogOpen.value = false
    notice.value = 'AI plan applied. Review constraint checklist, stages, and mappings, then materialize.'
    activeTab.value = 'plan'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Plan generation failed'
  }
  finally {
    proposing.value = false
  }
}

/**
 * Open the AI plan dialog, prefilled from previous generation when available.
 */
function openProposeDialog() {
  const cfg = project.value?.plan_config && typeof project.value.plan_config === 'object'
    ? project.value.plan_config
    : {}
  proposeForm.operatorNotes = String(cfg.operatorNotes || '').trim()
  const docs = Array.isArray(cfg.docsUrls) ? cfg.docsUrls : []
  proposeForm.docsUrlsText = docs.join('\n')
  if (!proposeForm.operatorNotes && !proposeForm.docsUrlsText) {
    // Sensible starter hints for RT → Zammad
    if (form.sourceSystemId === 'rt' && form.destinationSystemId === 'zammad') {
      proposeForm.docsUrlsText = [
        'https://docs.zammad.org/en/latest/',
        'https://docs.bestpractical.com/rt/latest/index.html',
      ].join('\n')
    }
  }
  proposeDialogOpen.value = true
}

const validatePlan = async () => {
  if (!activeOrganization.value?.id || pageBusy.value) return
  await beginBusy(() => {
    validating.value = true
  })
  try {
    const res = await authedFetch(`/api/migrations/${projectId.value}/validate-plan`, {
      method: 'POST',
      body: { organizationId: activeOrganization.value.id, persist: true },
    })
    validationResult.value = res
    project.value = {
      ...project.value,
      plan_config: {
        ...(project.value?.plan_config || {}),
        lastValidation: res,
      },
    }
    notice.value = res.valid
      ? 'Plan validation passed. You can materialize flows.'
      : `Plan validation failed (${res.summary?.errorCount || 0} errors).`
    if (!res.valid) error.value = notice.value
    else error.value = ''
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Validation failed'
    if (err?.data?.data) validationResult.value = err.data.data
  }
  finally {
    validating.value = false
  }
}

const introspectSchemas = async () => {
  if (!activeOrganization.value?.id || pageBusy.value) return
  await beginBusy(() => {
    introspecting.value = true
  })
  try {
    const res = await authedFetch(`/api/migrations/${projectId.value}/introspect-schema`, {
      method: 'POST',
      body: { organizationId: activeOrganization.value.id },
    })
    project.value = res.item
    const sourceEntities = res.schemas?.source?.entities && typeof res.schemas.source.entities === 'object'
      ? res.schemas.source.entities
      : {}
    const filled = Object.entries(sourceEntities)
      .map(([key, ent]) => {
        const n = ent?.columns && typeof ent.columns === 'object' ? Object.keys(ent.columns).length : 0
        return n ? `${key} (${n})` : null
      })
      .filter(Boolean)
    notice.value = filled.length
      ? `Schemas introspected. Source columns: ${filled.join(', ')}. Open Mapping to pick fields.`
      : 'Schemas introspected, but no source columns were found. Check stage sourceEntity table names, then retry.'
    activeTab.value = 'plan'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Schema introspection failed'
  }
  finally {
    introspecting.value = false
  }
}

const materialize = async () => {
  if (!activeOrganization.value?.id || pageBusy.value) return
  await beginBusy(() => {
    materializing.value = true
  })
  try {
    await saveProject({ quiet: true })
    await authedFetch(`/api/migrations/${projectId.value}/materialize`, {
      method: 'POST',
      body: { organizationId: activeOrganization.value.id },
    })
    await load()
    notice.value = 'Data flows created/updated for each stage.'
  }
  catch (err) {
    const validation = err?.data?.data
    if (validation?.issues?.length) {
      validationResult.value = validation
      error.value = err?.data?.statusMessage || 'Plan validation failed — fix issues before materializing.'
    }
    else {
      error.value = err?.data?.statusMessage || err?.message || 'Materialize failed'
    }
  }
  finally {
    materializing.value = false
  }
}

const updateStageMappings = (stage, mappings) => {
  stage.config = { ...(stage.config || {}), fieldMappings: mappings }
}

const persistPlanEntities = async () => {
  if (!activeOrganization.value?.id) return
  const res = await authedFetch(`/api/migrations/${projectId.value}`, {
    method: 'PUT',
    body: {
      organizationId: activeOrganization.value.id,
      sourceConnectionId: form.sourceConnectionId || null,
      destinationConnectionId: form.destinationConnectionId || null,
      defaultRunMode: form.defaultRunMode,
      sampleLimit: form.sampleLimit,
      resetIngestBeforeRun: form.resetIngestBeforeRun,
      planConfig: buildPlanConfigPatch(),
    },
  })
  project.value = res.item
}

const saveStage = async (stage) => {
  if (!activeOrganization.value?.id || pageBusy.value) return
  await beginBusy(() => {
    savingStageId.value = stage.id
  })
  try {
    const extra = mappingExtraFields(stage)
    const ent = catalogEntity(stage.entity_key)
    rememberKnownFields(stage, {
      sourceFields: ent?.sourceFields || [],
      destinationFields: ent?.destinationFields || extra.destinations,
      sourceFieldTypes: ent?.sourceFieldTypes || {},
      destinationFieldTypes: ent?.destinationFieldTypes || {},
    })
    const res = await authedFetch(`/api/migrations/${projectId.value}/stages/${stage.id}`, {
      method: 'PUT',
      body: {
        organizationId: activeOrganization.value.id,
        config: stage.config,
      },
    })
    const idx = stages.value.findIndex((s) => s.id === stage.id)
    if (idx >= 0) stages.value[idx] = res.item
    await persistPlanEntities()
    notice.value = `Mappings saved for ${stage.name}.`
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Save stage failed'
  }
  finally {
    savingStageId.value = ''
  }
}

const saveStageEditor = async () => {
  if (!activeOrganization.value?.id || !stageDraft.value) return
  const d = stageDraft.value
  const entityKey = cleanEntityKey(d.entityKey)
  if (!entityKey) {
    error.value = 'Entity key is required.'
    return
  }
  if (d.stageType === 'extract' && !String(d.sourceEntity || '').trim()) {
    error.value = 'Source table is required for extraction.'
    return
  }
  if (d.stageType === 'transform' && !String(d.destinationEntity || '').trim()) {
    error.value = 'Destination table is required for mapping.'
    return
  }

  await beginBusy(() => {
    savingStageEditor.value = true
  })
  error.value = ''
  try {
    const existing = d.id ? (stages.value || []).find((s) => s.id === d.id) : null
    const prevCfg = existing?.config && typeof existing.config === 'object' ? existing.config : {}
    const name = String(d.name || '').trim()
      || migrationFlowName({ stageType: d.stageType, entityKey })
    const config = {
      ...prevCfg,
      entityLabel: entityKey,
      sourceEntity: String(d.sourceEntity || '').trim() || String(prevCfg.sourceEntity || '').trim(),
      destinationEntity: String(d.destinationEntity || '').trim()
        || String(prevCfg.destinationEntity || '').trim(),
      fieldMappings: d.stageType === 'transform'
        ? (Array.isArray(d.fieldMappings) ? d.fieldMappings : [])
        : (Array.isArray(prevCfg.fieldMappings) ? prevCfg.fieldMappings : []),
    }
    if (d.stageType === 'transform' && !config.export) {
      config.export = { mode: 'insert', onConflict: 'skip', conflictTarget: 'primary_key' }
    }

    if (d.id) {
      await authedFetch(`/api/migrations/${projectId.value}/stages/${d.id}`, {
        method: 'PUT',
        body: {
          organizationId: activeOrganization.value.id,
          name,
          description: d.description || '',
          stageType: d.stageType,
          entityKey,
          config,
        },
      })
    }
    else {
      const body = {
        organizationId: activeOrganization.value.id,
        name,
        description: d.description || '',
        stageType: d.stageType,
        entityKey,
        status: 'draft',
        config,
      }
      if (stageInsertAt.value != null && Number.isFinite(Number(stageInsertAt.value))) {
        body.insertAt = Number(stageInsertAt.value)
      }
      await authedFetch(`/api/migrations/${projectId.value}/stages`, {
        method: 'POST',
        body,
      })
    }

    const mappingSources = [
      ...(Array.isArray(d.knownSourceFields) ? d.knownSourceFields : []),
      ...(config.fieldMappings || []).flatMap((row) => row.sources || []),
    ]
    const mappingDests = [
      ...(Array.isArray(d.knownDestinationFields) ? d.knownDestinationFields : []),
      ...(config.fieldMappings || []).map((row) => row.destination).filter(Boolean),
    ]
    const nextPlan = upsertPlanEntity(buildPlanConfigPatch(), {
      key: entityKey,
      label: entityKey,
      sourceEntity: config.sourceEntity,
      destinationEntity: config.destinationEntity,
      sourceFields: mappingSources,
      destinationFields: mappingDests,
      sourceFieldTypes: d.knownSourceFieldTypes || {},
      destinationFieldTypes: d.knownDestinationFieldTypes || {},
    })
    const projRes = await authedFetch(`/api/migrations/${projectId.value}`, {
      method: 'PUT',
      body: {
        organizationId: activeOrganization.value.id,
        sourceConnectionId: form.sourceConnectionId || null,
        destinationConnectionId: form.destinationConnectionId || null,
        defaultRunMode: form.defaultRunMode,
        sampleLimit: form.sampleLimit,
        resetIngestBeforeRun: form.resetIngestBeforeRun,
        planConfig: nextPlan,
      },
    })
    project.value = projRes.item
    await load()
    notice.value = d.id
      ? `Updated “${name}”. Rematerialize if Data Flows already exist.`
      : `Added “${name}”. Materialize flows to create its Data Flow.`
    closeStageEditor()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to save plan step'
  }
  finally {
    savingStageEditor.value = false
  }
}

const deleteStage = async (stage) => {
  if (!activeOrganization.value?.id || pageBusy.value || !stage?.id) return
  const ok = await confirm({
    title: 'Remove plan step?',
    message: `Remove “${stage.name}”? This does not delete already materialized Data Flows; rematerialize or remove those separately if needed.`,
    confirmLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
  await beginBusy(() => {
    savingStageEditor.value = true
  })
  error.value = ''
  try {
    await authedFetch(`/api/migrations/${projectId.value}/stages/${stage.id}`, {
      method: 'DELETE',
      query: { organizationId: activeOrganization.value.id },
    })
    await load()
    notice.value = `Removed “${stage.name}”.`
    activeTab.value = 'plan'
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to remove step'
  }
  finally {
    savingStageEditor.value = false
  }
}

const runMigration = async (runMode) => {
  if (!activeOrganization.value?.id || pageBusy.value) return

  const runnable = getRunnableStages()
  if (!runnable.length) {
    error.value = 'No materialized stages to run. Materialize the plan first.'
    return
  }

  await beginBusy(() => {
    running.value = true
    runningMode.value = runMode
    runProgress.value = {
      active: true,
      mode: runMode,
      currentIndex: -1,
      steps: runnable.map((stage) => ({
        id: stage.id,
        name: stage.name,
        entityKey: stage.entity_key || '',
        stageType: stage.stage_type || '',
        status: 'pending',
      })),
    }
  })

  /** @type {string | null} */
  let runId = null
  /** @type {Array<Record<string, unknown>>} */
  let allStageResults = []
  let ingestClearedSummary = ''

  try {
    for (let i = 0; i < runnable.length; i += 1) {
      const stage = runnable[i]
      runProgress.value.currentIndex = i
      runProgress.value.steps[i].status = 'running'
      await nextTick()

      const res = await authedFetch(`/api/migrations/${projectId.value}/run`, {
        method: 'POST',
        body: {
          organizationId: activeOrganization.value.id,
          runMode,
          stageIds: [stage.id],
          continueRunId: runId || undefined,
          finalizeRun: i === runnable.length - 1,
        },
      })

      runId = res.runId || runId
      allStageResults = res.stageResults || allStageResults
      if (res.ingestCleared?.tableCount && !ingestClearedSummary) {
        const cleared = res.ingestCleared
        ingestClearedSummary = `Cleared ${cleared.rowsDeleted ?? 0} ingest row(s) across ${cleared.tableCount} table(s) for this migration.`
      }
      runProgress.value.steps[i].status = 'done'
    }

    const parts = []
    if (ingestClearedSummary) parts.push(ingestClearedSummary)
    parts.push(`${runMode} run completed (${allStageResults.length || runnable.length} stages).`)
    notice.value = parts.join(' ')
    await load()
    activeTab.value = 'run'
    if (runId) expandedRunId.value = runId
  }
  catch (err) {
    const idx = runProgress.value.currentIndex
    if (idx >= 0 && runProgress.value.steps[idx]) {
      runProgress.value.steps[idx].status = 'failed'
    }

    const failed = err?.data?.data?.failedStage || err?.data?.failedStage
    if (failed?.stageName) {
      error.value = `Failed on stage “${failed.stageName}”${failed.entityKey ? ` (${failed.entityKey})` : ''}: ${failed.error || err?.data?.statusMessage || err?.message}`
      if (failed.hint) notice.value = failed.hint
    }
    else {
      error.value = err?.data?.statusMessage || err?.message || 'Run failed'
    }
    await load()
    activeTab.value = 'run'
    const latestFailed = (runs.value || []).find((r) => r.status === 'failed')
    if (latestFailed?.id) expandedRunId.value = latestFailed.id
  }
  finally {
    running.value = false
    runningMode.value = ''
    runProgress.value = {
      active: false,
      mode: '',
      steps: [],
      currentIndex: -1,
    }
  }
}

const confirmFullRun = async () => {
  const ok = await confirm({
    title: 'Full migration run?',
    message: 'This will execute all materialized stages in production run mode, writing to ingest and outbound export.',
    confirmLabel: 'Run full migration',
    danger: true,
  })
  if (!ok) return
  await runMigration('full')
}

const clearRunHistory = async () => {
  const ok = await confirm({
    title: 'Clear run history?',
    message: 'Remove all sample, pilot, and full run logs for this migration? This cannot be undone.',
    confirmLabel: 'Clear history',
    danger: true,
  })
  if (!ok || !activeOrganization.value?.id) return
  clearingRuns.value = true
  error.value = ''
  notice.value = ''
  try {
    const res = await authedFetch(`/api/migrations/${projectId.value}/runs`, {
      method: 'DELETE',
      query: { organizationId: activeOrganization.value.id },
    })
    runs.value = []
    expandedRunId.value = ''
    notice.value = `Cleared ${res.deleted || 0} run log(s).`
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to clear run history'
  }
  finally {
    clearingRuns.value = false
  }
}

const clearMigrationIngest = async () => {
  if (!activeOrganization.value?.id || pageBusy.value) return
  const ok = await confirm({
    title: 'Clear ingest for this migration?',
    message: `Delete all raw and mapped ingest rows (mig_raw_* / mig_mapped_*) for “${project.value?.name || 'this migration'}” in your organization? Other migrations are not affected. Run history is kept.`,
    confirmLabel: 'Clear ingest',
    danger: true,
  })
  if (!ok) return
  clearingIngest.value = true
  error.value = ''
  notice.value = ''
  try {
    const res = await authedFetch(`/api/migrations/${projectId.value}/clear-ingest`, {
      method: 'POST',
      body: { organizationId: activeOrganization.value.id },
    })
    const tableCount = res.tableCount || 0
    const rowsDeleted = res.rowsDeleted || 0
    if (!tableCount) {
      notice.value = 'No migration ingest tables found yet. Materialize flows first, or ingest is already empty.'
    }
    else {
      notice.value = `Cleared ${rowsDeleted} ingest row(s) across ${tableCount} table(s) for this migration.`
    }
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to clear ingest'
  }
  finally {
    clearingIngest.value = false
  }
}
</script>
