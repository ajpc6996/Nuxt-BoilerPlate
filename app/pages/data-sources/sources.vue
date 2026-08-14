<template>
  <div class="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">
    <div>
      <h1 class="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Data Flows
      </h1>
      <p class="mt-2 max-w-2xl text-[var(--mute)]">
        Endpoint ingest jobs (Retrieve → Filter → Ingest) or multi-source merges (Fetch → Merge → Ingest).
        Fork Transform to Export for a Temp Stage hand-off alongside ingest.
        Credentials come from the linked connection. Active org:
        <span class="text-[var(--accent-ink)]">{{ activeOrganization?.name || 'None' }}</span>
      </p>
    </div>

    <AppListToolbar>
      <AppListFilter
        v-model="listFilter"
        placeholder="Filter data flows…"
      />
      <button
        type="button"
        class="btn-primary !px-4 !py-2"
        :disabled="!activeOrganization?.id || !inboundConnections.length"
        @click="openCreate"
      >
        Add
      </button>
      <NuxtLink
        to="/data-sources"
        class="btn-secondary !px-4 !py-2"
      >
        Back
      </NuxtLink>
    </AppListToolbar>

    <p
      v-if="activeOrganization?.id && !inboundConnections.length && !pending"
      class="panel mt-6 px-4 py-3 text-sm text-[var(--mute)]"
    >
      Create an
      <NuxtLink
        to="/data-sources/connections"
        class="text-[var(--accent-ink)] underline"
      >inbound connection</NuxtLink>
      first, then add a data flow that retrieves from it.
    </p>

    <p
      v-if="error"
      class="panel mt-6 whitespace-pre-wrap border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]"
    >
      {{ error }}
    </p>

    <p
      v-if="notice"
      class="panel mt-6 whitespace-pre-wrap border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink)]"
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
      v-else-if="activeOrganization?.id"
      class="mt-8 overflow-x-auto"
    >
      <table class="min-w-full text-left text-sm">
        <thead class="border-b border-[var(--border)] text-[var(--mute)]">
          <tr>
            <th class="px-3 py-2 font-medium">Name</th>
            <th class="px-3 py-2 font-medium">Connection</th>
            <th class="px-3 py-2 font-medium">Destination</th>
            <th class="px-3 py-2 font-medium">Status</th>
            <th class="px-3 py-2 font-medium">Last run</th>
            <th class="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filteredItems"
            :key="row.id"
            class="border-b border-[var(--border-soft)]"
          >
            <td class="px-3 py-3 text-[var(--ink)]">{{ row.name }}</td>
            <td class="px-3 py-3 text-[var(--mute)]">
              {{ row.connections?.name || '—' }}
            </td>
            <td class="px-3 py-3 font-mono text-[var(--accent-ink)]">
              {{ row.destination_table }}
            </td>
            <td class="px-3 py-3">
              <div class="flex flex-col gap-1">
                <span
                  class="w-fit rounded px-2 py-0.5 text-xs font-medium"
                  :class="statusClass(row.status)"
                  :title="row.status === 'error' ? row.last_error : ''"
                >
                  {{ row.status }}
                </span>
                <p
                  v-if="row.status === 'error' && row.last_error"
                  class="max-w-[26rem] whitespace-pre-wrap break-words text-xs text-[var(--danger)]"
                >
                  {{ truncateError(row.last_error) }}
                </p>
              </div>
            </td>
            <td class="px-3 py-3 text-[var(--mute)]">
              {{ formatDate(row.last_run_at) }}
            </td>
            <td class="px-3 py-3">
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn-secondary !px-2 !py-1 text-xs"
                  :disabled="Boolean(busyId)"
                  @click="openEdit(row)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="btn-secondary !px-2 !py-1 text-xs"
                  :disabled="Boolean(busyId)"
                  @click="runSource(row, 'test')"
                >
                  {{ busyId === row.id && busyMode === 'test' ? 'Testing…' : 'Test' }}
                </button>
                <button
                  type="button"
                  class="btn-primary !px-2 !py-1 text-xs"
                  :disabled="Boolean(busyId)"
                  @click="runSource(row, 'run')"
                >
                  {{ busyId === row.id && busyMode === 'run' ? 'Running…' : 'Run' }}
                </button>
                <button
                  type="button"
                  class="text-xs text-[var(--danger)] hover:underline"
                  :disabled="Boolean(busyId)"
                  @click="removeSource(row)"
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!filteredItems.length">
            <td
              colspan="6"
              class="px-3 py-8 text-center text-[var(--mute)]"
            >
              {{ items.length ? 'No sources match this filter.' : 'No sources yet.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="wizardOpen"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--modal-scrim)] p-4"
      @click.self="closeWizard"
    >
      <div class="panel max-h-[90vh] w-full max-w-lg overflow-y-auto px-6 py-5">
        <h2 class="font-display text-xl font-semibold text-[var(--ink)]">
          New source
        </h2>
        <p class="mt-1 text-sm text-[var(--mute)]">
          Set name, connection, and destination before opening the pipeline canvas.
        </p>

        <div class="mt-5 space-y-4">
          <fieldset class="space-y-2">
            <legend class="text-xs font-medium text-[var(--mute)]">
              Template
            </legend>
            <label class="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--border)] px-3 py-2 hover:border-[var(--accent)]">
              <input
                v-model="wizard.template"
                type="radio"
                value="retrieve"
                class="mt-1 accent-[var(--accent)]"
              >
              <span>
                <span class="block text-sm text-[var(--ink)]">Simple</span>
                <span class="block text-[10px] text-[var(--mute-soft)]">
                  Retrieve from the connection endpoint, then filter / transform / ingest.
                </span>
              </span>
            </label>
            <label class="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--border)] px-3 py-2 hover:border-[var(--accent)]">
              <input
                v-model="wizard.template"
                type="radio"
                value="merge"
                class="mt-1 accent-[var(--accent)]"
              >
              <span>
                <span class="block text-sm text-[var(--ink)]">Merge</span>
                <span class="block text-[10px] text-[var(--mute-soft)]">
                  Join 2+ existing sources (default: last ingest; optional Refresh now).
                </span>
              </span>
            </label>
          </fieldset>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Name</label>
            <input
              v-model="wizard.name"
              type="text"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
              placeholder="My data flow"
            >
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Inbound connection</label>
            <select
              v-model="wizard.connectionId"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="" disabled>
                Select…
              </option>
              <option
                v-for="c in inboundConnections"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name }}
              </option>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-[var(--mute)]">Destination table</label>
            <input
              v-model="wizard.destinationTable"
              type="text"
              class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
              placeholder="my_table"
            >
            <p class="text-[10px] text-[var(--mute-soft)]">
              Physical table: ingest.{{ wizard.destinationTable || '…' }}
            </p>
          </div>
          <p
            v-if="wizardError"
            class="text-sm text-[var(--danger)]"
          >
            {{ wizardError }}
          </p>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn-secondary !px-4 !py-2"
            @click="closeWizard"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary !px-4 !py-2"
            @click="continueWizard"
          >
            Continue to canvas
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="editorOpen"
      class="fixed inset-0 z-50 flex flex-col bg-[var(--surface)]"
    >
      <header class="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <div class="min-w-0 flex-1">
          <h2 class="font-display text-lg font-semibold text-[var(--ink)]">
            {{ editingId ? 'Edit data flow' : 'New data flow' }}
            <span
              v-if="isDirty"
              class="ml-2 text-xs font-normal text-[var(--mute)]"
            >(unsaved)</span>
          </h2>
          <p class="text-xs text-[var(--mute)]">
            {{ isMergeSource
              ? 'Double-click a node to configure. Use the palette categories for Data sources, Operators, and Storage.'
              : 'Double-click a node to configure. Use the palette categories for Operators and Storage.' }}
          </p>
        </div>
        <input
          v-model="form.name"
          type="text"
          placeholder="Flow name"
          class="w-44 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--ink)]"
        >
        <select
          v-model="form.connectionId"
          class="max-w-[14rem] rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--ink)]"
          @change="onConnectionChange"
        >
          <option value="" disabled>Inbound connection…</option>
          <option
            v-for="c in ingestConnectionChoices"
            :key="c.id"
            :value="c.id"
          >
            {{ c.name }}
          </option>
        </select>
        <input
          v-model="form.destinationTable"
          type="text"
          placeholder="destination_table"
          class="w-44 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 font-mono text-sm text-[var(--ink)]"
        >
        <button
          type="button"
          class="btn-secondary !px-3 !py-1.5"
          :disabled="editorBusy"
          @click="runFromEditor('test')"
        >
          {{ editorBusyMode === 'test' ? 'Testing…' : 'Test' }}
        </button>
        <button
          type="button"
          class="btn-primary !px-3 !py-1.5"
          :disabled="editorBusy"
          @click="runFromEditor('run')"
        >
          {{ editorBusyMode === 'run' ? 'Running…' : 'Run' }}
        </button>
        <button
          type="button"
          class="btn-secondary !px-3 !py-1.5"
          :disabled="editorBusy"
          @click="closeEditor"
        >
          {{ isDirty ? 'Cancel' : 'Close' }}
        </button>
        <button
          type="button"
          class="btn-primary !px-3 !py-1.5"
          :disabled="editorBusy || saving"
          @click="saveSource()"
        >
          {{ saving || editorBusyMode === 'save' ? 'Saving…' : 'Save' }}
        </button>
      </header>

      <div class="relative flex min-h-0 flex-1 flex-col">
        <div
          v-if="editorBusy"
          class="absolute inset-0 z-30 flex items-center justify-center bg-[var(--surface)]/70 backdrop-blur-[1px]"
        >
          <div class="panel flex items-center gap-3 px-5 py-4 text-sm text-[var(--ink)]">
            <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            <span>{{ editorBusyLabel }}</span>
          </div>
        </div>

        <div class="relative min-h-0 flex-1 overflow-hidden p-3 pb-0">
          <ClientOnly>
            <div class="h-full min-h-0">
              <SourcePipelineCanvas
                ref="pipelineCanvas"
                v-model="form.pipeline"
                :destination-table="form.destinationTable"
                :locked="editorBusy"
                class="h-full min-h-0"
                @edit-node="onEditPipelineNode"
              >
              <template #node-config="{ node, close, updateFilter, removeFilter, updateTransform, removeTransform, updateFetch, removeFetch, updateMerge, removeMerge, updateIngest, removeIngest, updateExport, removeExport }">
                <div
                  v-if="node.type === 'retrieve'"
                  class="space-y-3"
                >
                  <p class="text-xs text-[var(--mute)]">
                    Shared credentials come from the connection above. Configure the endpoint here.
                  </p>
                  <div v-if="selectedType">
                    <SchemaFormFields
                      v-model="form.config"
                      :schema="selectedType.config_schema"
                      :omit-keys="lookupOmitKeys"
                    />
                    <div
                      v-if="supportsLookup"
                      class="mt-4"
                    >
                      <ConnectionLookupConfig
                        v-model="form.config"
                        :path-template="String(form.config.path || '')"
                        :organization-id="activeOrganization?.id || ''"
                      />
                    </div>
                  </div>
                  <p
                    v-else
                    class="text-sm text-[var(--mute)]"
                  >
                    Select a connection first.
                  </p>
                  <button
                    type="button"
                    class="btn-secondary !px-3 !py-1.5 text-sm"
                    @click="close"
                  >
                    Done
                  </button>
                </div>

                <div
                  v-else-if="node.type === 'fetch'"
                  class="space-y-4"
                >
                  <PipelineFetchConfigPanel
                    ref="fetchConfigPanel"
                    :model-value="node.data || {}"
                    :sources="items"
                    :exclude-source-id="editingId || ''"
                    @update:model-value="updateFetch"
                  />
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="btn-secondary !px-3 !py-1.5 text-sm"
                      @click="close"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      class="text-sm text-[var(--danger)] hover:underline"
                      @click="removeFetch"
                    >
                      Remove Fetch node
                    </button>
                  </div>
                </div>

                <div
                  v-else-if="node.type === 'merge'"
                  class="space-y-4"
                >
                  <PipelineMergeConfigPanel
                    ref="mergeConfigPanel"
                    :model-value="node.data || {}"
                    :left-fields="mergeLeftFields"
                    :right-fields="mergeRightFields"
                    :left-info="mergeLeftInfo"
                    :right-info="mergeRightInfo"
                    :loading-fields="loadingMergeFields"
                    :fields-error="mergeFieldsError"
                    @update:model-value="updateMerge"
                    @fetch-fields="loadMergeFields(node.id)"
                  />
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="btn-secondary !px-3 !py-1.5 text-sm"
                      @click="close"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      class="text-sm text-[var(--danger)] hover:underline"
                      @click="removeMerge"
                    >
                      Remove Merge node
                    </button>
                  </div>
                </div>

                <div
                  v-else-if="node.type === 'filter'"
                  class="space-y-4"
                >
                  <PipelineFilterConfigPanel
                    ref="filterConfigPanel"
                    :model-value="node.data || {}"
                    :sample-object="retrieveSample"
                    :loading-sample="loadingRetrieveSample"
                    @update:model-value="updateFilter"
                    @fetch-sample="loadRetrieveSample"
                  />
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="btn-secondary !px-3 !py-1.5 text-sm"
                      @click="close"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      class="text-sm text-[var(--danger)] hover:underline"
                      @click="removeFilter"
                    >
                      Remove Filter node
                    </button>
                  </div>
                </div>

                <div
                  v-else-if="node.type === 'transform'"
                  class="space-y-4"
                >
                  <PipelineTransformConfigPanel
                    ref="transformConfigPanel"
                    :model-value="node.data || {}"
                    :sample-object="operatorSample"
                    :loading-sample="loadingOperatorSample"
                    @update:model-value="updateTransform"
                    @fetch-sample="loadParentSample(node.id)"
                  />
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="btn-secondary !px-3 !py-1.5 text-sm"
                      @click="close"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      class="text-sm text-[var(--danger)] hover:underline"
                      @click="removeTransform"
                    >
                      Remove Transform node
                    </button>
                  </div>
                </div>

                <div
                  v-else-if="node.type === 'ingest'"
                  class="space-y-3"
                >
                  <p class="text-xs text-[var(--mute)]">
                    Pipeline output is written to the destination table set in the header.
                    Connect an Export node from the same Transform to also Temp-Stage that output.
                  </p>
                  <div class="flex flex-col gap-1">
                    <label class="text-xs font-medium text-[var(--mute)]">Destination table</label>
                    <input
                      v-model="form.destinationTable"
                      type="text"
                      class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
                    >
                    <p class="text-xs text-[var(--mute-soft)]">
                      Physical table:
                      <span class="font-mono text-[var(--accent-ink)]">ingest.{{ form.destinationTable || '…' }}</span>
                    </p>
                    <p class="text-xs text-[var(--mute-soft)]">
                      Every row is stamped with <span class="font-mono">cycleTime</span> (run timestamp).
                    </p>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-xs font-medium text-[var(--mute)]">Write mode</label>
                    <select
                      class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
                      :disabled="hasExportSink"
                      :value="hasExportSink ? 'append' : (node.data?.writeMode || 'replace')"
                      @change="updateIngest({
                        ...(node.data || {}),
                        writeMode: $event.target.value,
                        destinationTable: form.destinationTable,
                        retentionDays: Number(node.data?.retentionDays) || 7,
                      })"
                    >
                      <option value="replace">Replace existing rows</option>
                      <option value="append">Append (keep history)</option>
                    </select>
                    <p
                      v-if="hasExportSink"
                      class="text-xs text-[var(--mute-soft)]"
                    >
                      Export / Temp Stage is connected, so ingest always appends each batch (replace would wipe earlier batches in the same run).
                    </p>
                  </div>
                  <div
                    v-if="hasExportSink || node.data?.writeMode === 'append'"
                    class="flex flex-col gap-1"
                  >
                    <label class="text-xs font-medium text-[var(--mute)]">Retention (days)</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
                      :value="Number(node.data?.retentionDays) || 7"
                      @change="updateIngest({
                        ...(node.data || {}),
                        writeMode: hasExportSink ? 'append' : (node.data?.writeMode || 'append'),
                        destinationTable: form.destinationTable,
                        retentionDays: Number($event.target.value) || 7,
                      })"
                    >
                    <p class="text-xs text-[var(--mute-soft)]">
                      Rows older than this, by <span class="font-mono">cycleTime</span>, are deleted after each append run. Default 7 days.
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="btn-secondary !px-3 !py-1.5 text-sm"
                      @click="close"
                    >
                      Done
                    </button>
                    <button
                      v-if="canRemoveIngest"
                      type="button"
                      class="text-sm text-[var(--danger)] hover:underline"
                      @click="removeIngest"
                    >
                      Remove Ingest node
                    </button>
                  </div>
                </div>

                <div
                  v-else-if="node.type === 'export'"
                  class="space-y-3"
                >
                  <p class="text-xs text-[var(--mute)]">
                    Temp Stage writes a bounded batch to private <span class="font-mono">staged.batches</span>,
                    then hands off to an outbound connection.
                  </p>
                  <div class="flex flex-col gap-1">
                    <label class="text-xs font-medium text-[var(--mute)]">Outbound connection</label>
                    <select
                      class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
                      :value="node.data?.connectionId || ''"
                      @change="updateExport({
                        ...(node.data || {}),
                        connectionId: $event.target.value,
                      })"
                    >
                      <option value="" disabled>Select outbound connection…</option>
                      <option
                        v-for="c in outboundConnections"
                        :key="c.id"
                        :value="c.id"
                      >
                        {{ c.name }}
                      </option>
                    </select>
                    <p
                      v-if="!outboundConnections.length"
                      class="text-xs text-[var(--mute-soft)]"
                    >
                      Create an outbound connection first (Connections → Direction: Outbound).
                    </p>
                  </div>
                  <p class="text-xs text-[var(--mute-soft)]">
                    With Ingest on the same output, each staged batch is released after ingest.
                    Caps are under Administration → System Settings.
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="btn-secondary !px-3 !py-1.5 text-sm"
                      @click="close"
                    >
                      Done
                    </button>
                    <button
                      v-if="canRemoveExport"
                      type="button"
                      class="text-sm text-[var(--danger)] hover:underline"
                      @click="removeExport"
                    >
                      Remove Export node
                    </button>
                  </div>
                </div>
              </template>
              </SourcePipelineCanvas>
            </div>
            <template #fallback>
              <div class="flex h-full items-center justify-center text-sm text-[var(--mute)]">
                Loading canvas…
              </div>
            </template>
          </ClientOnly>
        </div>

        <SourceOutputPanel
          class="shrink-0"
          :collapsed="outputCollapsed"
          :panel-height="outputHeight"
          :error="editorError"
          :summary="outputSummary"
          :body="outputBody"
          :busy="editorBusy"
          :busy-label="editorBusyLabel"
          @toggle="outputCollapsed = !outputCollapsed"
          @clear="clearOutput"
          @resize="onOutputResize"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  createDefaultPipeline,
  createMergePipeline,
  isMergePipeline,
  normalizePipeline,
} from '~~/shared/pipelineDefaults.js'
import PipelineFilterConfigPanel from '~/components/pipeline/FilterConfigPanel.vue'
import PipelineTransformConfigPanel from '~/components/pipeline/TransformConfigPanel.vue'
import PipelineFetchConfigPanel from '~/components/pipeline/FetchConfigPanel.vue'
import PipelineMergeConfigPanel from '~/components/pipeline/MergeConfigPanel.vue'
import { normalizeConnectionDirection } from '~~/shared/connectionDirection.js'

definePageMeta({
  layout: 'app',
  middleware: ['auth', 'admin'],
})

useHead({ title: 'Data Flows' })

const route = useRoute()
const { activeOrganization } = useOrganization()
const authedFetch = useAuthedFetch()
const { confirm: appConfirm } = useAppConfirm()

const items = ref([])
const listFilter = ref('')
const connections = ref([])
const catalogByTypeId = ref({})
const pending = ref(false)
const error = ref('')
const notice = ref('')
const busyId = ref(null)
/** @type {import('vue').Ref<'test'|'run'|null>} */
const busyMode = ref(null)
const editorOpen = ref(false)
const wizardOpen = ref(false)
const wizardError = ref('')
const wizard = reactive({
  template: 'retrieve',
  name: '',
  connectionId: '',
  destinationTable: '',
})
const editingId = ref(null)
const saving = ref(false)
const editorError = ref('')
const editorNotice = ref('')
const outputSummary = ref('')
const outputBody = ref('')
const outputCollapsed = ref(true)
const outputHeight = ref(220)
const retrieveSample = ref(null)
const loadingRetrieveSample = ref(false)
const operatorSample = ref(null)
const loadingOperatorSample = ref(false)
const mergeLeftFields = ref([])
const mergeRightFields = ref([])
const mergeLeftInfo = ref(null)
const mergeRightInfo = ref(null)
const loadingMergeFields = ref(false)
const mergeFieldsError = ref('')
const mergeFieldsNodeId = ref('')
/** @type {import('vue').Ref<'test'|'run'|'save'|null>} */
const editorBusyMode = ref(null)
const pipelineCanvas = ref(null)
const filterConfigPanel = ref(null)
const transformConfigPanel = ref(null)
const fetchConfigPanel = ref(null)
const mergeConfigPanel = ref(null)
const savedSnapshot = ref('')

const form = reactive({
  name: '',
  connectionId: '',
  destinationTable: '',
  config: {},
  pipeline: createDefaultPipeline(),
})

const isMergeSource = computed(() => isMergePipeline(form.pipeline))

const ingestNodeCount = computed(() =>
  (form.pipeline?.nodes || []).filter((n) => n.type === 'ingest').length,
)

const exportNodeCount = computed(() =>
  (form.pipeline?.nodes || []).filter((n) => n.type === 'export').length,
)

const hasExportSink = computed(() => exportNodeCount.value > 0)

const canRemoveIngest = computed(() =>
  ingestNodeCount.value > 1 || (ingestNodeCount.value === 1 && exportNodeCount.value >= 1),
)

const canRemoveExport = computed(() =>
  exportNodeCount.value > 1 || (exportNodeCount.value === 1 && ingestNodeCount.value >= 1),
)

const editorBusy = computed(() => Boolean(editorBusyMode.value) || saving.value)

const filteredItems = computed(() => {
  const q = listFilter.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((row) => {
    const hay = [
      row.name,
      row.destination_table,
      row.status,
      row.connections?.name,
      row.connections?.connector_types?.name,
      row.last_error,
    ].map((v) => String(v || '').toLowerCase()).join(' ')
    return hay.includes(q)
  })
})

const editorBusyLabel = computed(() => {
  if (editorBusyMode.value === 'test') return 'Testing source…'
  if (editorBusyMode.value === 'run') return 'Running source…'
  if (editorBusyMode.value === 'save' || saving.value) return 'Saving…'
  return 'Working…'
})

const isDirty = computed(() => {
  if (!editorOpen.value) return false
  return currentSnapshot() !== savedSnapshot.value
})

const selectedConnection = computed(() =>
  connections.value.find((c) => c.id === form.connectionId) || null,
)

const inboundConnections = computed(() =>
  connections.value.filter((c) => normalizeConnectionDirection(c.direction) === 'inbound'),
)

const outboundConnections = computed(() =>
  connections.value.filter((c) => normalizeConnectionDirection(c.direction) === 'outbound'),
)

const ingestConnectionChoices = computed(() => {
  const list = [...inboundConnections.value]
  const current = connections.value.find((c) => c.id === form.connectionId)
  if (current && !list.some((c) => c.id === current.id)) list.unshift(current)
  return list
})

const selectedType = computed(() => {
  const typeId = selectedConnection.value?.connector_type_id
    || selectedConnection.value?.connector_types?.id
  if (!typeId) return null
  return catalogByTypeId.value[typeId] || selectedConnection.value?.connector_types || null
})

const supportsLookup = computed(() =>
  selectedType.value?.runner_key === 'rest_generic'
  || Boolean(selectedType.value?.capabilities?.lookupExpansion),
)

const lookupOmitKeys = computed(() =>
  supportsLookup.value
    ? ['lookupEnabled', 'lookupTable', 'maxExpansions']
    : [],
)

function statusClass(status) {
  if (status === 'ready') return 'bg-emerald-500/15 text-emerald-300'
  if (status === 'error') return 'bg-red-500/15 text-[var(--danger)]'
  return 'bg-[var(--accent-soft)] text-[var(--mute)]'
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  }
  catch {
    return value
  }
}

function truncateError(value) {
  const s = String(value || '')
  if (!s) return ''
  return s.length > 900 ? `${s.slice(0, 900)}…` : s
}

function defaultsFromSchema(schema) {
  const out = {}
  const properties = schema?.properties || {}
  Object.entries(properties).forEach(([key, def]) => {
    if (def.default !== undefined) out[key] = def.default
  })
  return out
}

function onConnectionChange() {
  form.config = defaultsFromSchema(selectedType.value?.config_schema)
}

function flushEditorState() {
  filterConfigPanel.value?.flush?.()
  transformConfigPanel.value?.flush?.()
  fetchConfigPanel.value?.flush?.()
  mergeConfigPanel.value?.flush?.()
  pipelineCanvas.value?.flush?.()
}


function currentSnapshot() {
  return JSON.stringify({
    name: form.name,
    connectionId: form.connectionId,
    destinationTable: form.destinationTable,
    config: form.config,
    pipeline: form.pipeline,
  })
}

function markSaved() {
  savedSnapshot.value = currentSnapshot()
}

async function closeEditor() {
  if (editorBusy.value) return
  if (isDirty.value) {
    const ok = await appConfirm({
      title: 'Discard changes?',
      message: 'You have unsaved changes. Discard them and close the editor?',
      confirmLabel: 'Discard',
      danger: true,
    })
    if (!ok) return
  }
  editorOpen.value = false
  editorError.value = ''
  editorNotice.value = ''
  outputSummary.value = ''
  outputBody.value = ''
  editorBusyMode.value = null
  clearMergeFields()
}

function clearOutput() {
  editorError.value = ''
  editorNotice.value = ''
  outputSummary.value = ''
  outputBody.value = ''
}

/**
 * @param {number} height
 */
function onOutputResize(height) {
  outputHeight.value = height
  if (outputCollapsed.value) outputCollapsed.value = false
}

/**
 * @param {string} message
 */
function createErrorLocal(message) {
  const err = new Error(message)
  err.data = { statusMessage: message }
  return err
}

/**
 * @param {Record<string, unknown>} res
 * @param {'test'|'run'} mode
 */
function formatRunResult(res, mode) {
  const summary = res.pipelineSummary || {}
  const stats = [
    `retrieved ${summary.retrieved ?? res.rowsFetched ?? 0}`,
    `kept ${summary.afterPipeline ?? res.rowsAfterPipeline ?? 0}`,
    `filtered out ${summary.filteredOut ?? 0}`,
  ]
  if (mode === 'run') {
    stats.push(`wrote ${res.rowsWritten}`)
  }
  const summaryLine = `${mode === 'test' ? 'Test' : 'Run'} OK — ${stats.join(' · ')}`
  /** @type {Record<string, unknown>} */
  const detail = {
    sample: res.sample || [],
  }
  if (res.pipelineSteps?.length) {
    detail.pipelineSteps = res.pipelineSteps
  }
  if (mode === 'run') {
    detail.physicalTable = res.physicalTable || res.destinationTable
  }
  return {
    summary: summaryLine,
    body: JSON.stringify(detail, null, 2),
  }
}

function applyOutput(summary, body, errorMsg = '') {
  outputCollapsed.value = false
  outputSummary.value = summary || ''
  outputBody.value = body || ''
  editorNotice.value = summary || ''
  editorError.value = errorMsg || ''
}

async function loadRetrieveSample() {
  if (!activeOrganization.value?.id || !form.connectionId) {
    applyOutput('', '', 'Select a connection first')
    return
  }
  loadingRetrieveSample.value = true
  editorError.value = ''
  try {
    const res = await authedFetch('/api/data-sources/preview-retrieve', {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        connectionId: form.connectionId,
        config: form.config,
      },
    })
    retrieveSample.value = res.sample
    if (!res.sample) {
      applyOutput('', '', 'Retrieve returned no object sample')
    }
  }
  catch (err) {
    applyOutput('', '', err?.data?.statusMessage || err?.message || 'Failed to load sample')
  }
  finally {
    loadingRetrieveSample.value = false
  }
}

/**
 * First object from the inbound parent of a Filter/Transform node.
 * @param {string} nodeId
 */
async function loadParentSample(nodeId) {
  if (!activeOrganization.value?.id || !form.connectionId) {
    applyOutput('', '', 'Select a connection first')
    return
  }
  if (!nodeId) return
  flushEditorState()
  await nextTick()
  loadingOperatorSample.value = true
  editorError.value = ''
  try {
    const res = await authedFetch('/api/data-sources/preview-pipeline-sample', {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        connectionId: form.connectionId,
        dataSourceId: editingId.value || undefined,
        config: form.config,
        pipeline: form.pipeline,
        nodeId,
      },
    })
    operatorSample.value = res.sample
    if (!res.sample) {
      applyOutput('', '', 'Parent returned no object sample')
    }
  }
  catch (err) {
    applyOutput('', '', err?.data?.statusMessage || err?.message || 'Failed to load parent sample')
  }
  finally {
    loadingOperatorSample.value = false
  }
}

/**
 * @param {{ id?: string, type?: string } | null} node
 */
function onEditPipelineNode(node) {
  if (node?.type === 'merge' && node.id) {
    loadMergeFields(node.id)
  }
}

function clearMergeFields() {
  mergeLeftFields.value = []
  mergeRightFields.value = []
  mergeLeftInfo.value = null
  mergeRightInfo.value = null
  mergeFieldsError.value = ''
  mergeFieldsNodeId.value = ''
}

/**
 * Load join-key field lists from the Merge node’s two inbound parents (async).
 * @param {string} mergeNodeId
 */
async function loadMergeFields(mergeNodeId) {
  if (!activeOrganization.value?.id) {
    mergeFieldsError.value = 'Select an organization first'
    return
  }
  if (!mergeNodeId) return
  flushEditorState()
  await nextTick()
  mergeFieldsNodeId.value = mergeNodeId
  loadingMergeFields.value = true
  mergeFieldsError.value = ''
  try {
    const res = await authedFetch('/api/data-sources/preview-merge-fields', {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        connectionId: form.connectionId || undefined,
        dataSourceId: editingId.value || undefined,
        pipeline: form.pipeline,
        mergeNodeId,
      },
    })
    if (mergeFieldsNodeId.value !== mergeNodeId) return
    mergeLeftInfo.value = res.left || null
    mergeRightInfo.value = res.right || null
    mergeLeftFields.value = Array.isArray(res.left?.fields) ? res.left.fields : []
    mergeRightFields.value = Array.isArray(res.right?.fields) ? res.right.fields : []
    if (!mergeLeftFields.value.length && !mergeRightFields.value.length) {
      mergeFieldsError.value = 'No fields found — run the child sources once (or check Fetch source selection), then refresh.'
    }
  }
  catch (err) {
    if (mergeFieldsNodeId.value !== mergeNodeId) return
    mergeLeftFields.value = []
    mergeRightFields.value = []
    mergeLeftInfo.value = null
    mergeRightInfo.value = null
    mergeFieldsError.value = err?.data?.statusMessage || err?.message || 'Failed to load merge fields'
  }
  finally {
    if (mergeFieldsNodeId.value === mergeNodeId) {
      loadingMergeFields.value = false
    }
  }
}

function openCreate() {
  wizardError.value = ''
  wizard.template = 'retrieve'
  wizard.name = ''
  wizard.connectionId = String(route.query.connectionId || inboundConnections.value[0]?.id || '')
  const picked = connections.value.find((c) => c.id === wizard.connectionId)
  if (picked && normalizeConnectionDirection(picked.direction) !== 'inbound') {
    wizard.connectionId = inboundConnections.value[0]?.id || ''
  }
  wizard.destinationTable = ''
  wizardOpen.value = true
}

function closeWizard() {
  wizardOpen.value = false
  wizardError.value = ''
}

function continueWizard() {
  wizardError.value = ''
  const name = wizard.name.trim()
  const connectionId = wizard.connectionId
  const destinationTable = wizard.destinationTable.trim().toLowerCase()
  if (!name) {
    wizardError.value = 'Name is required'
    return
  }
  if (!connectionId) {
    wizardError.value = 'Select an inbound connection'
    return
  }
  const conn = connections.value.find((c) => c.id === connectionId)
  if (!conn || normalizeConnectionDirection(conn.direction) !== 'inbound') {
    wizardError.value = 'Data flows must use an inbound connection'
    return
  }
  if (!destinationTable || !/^[a-z][a-z0-9_]{0,62}$/.test(destinationTable)) {
    wizardError.value = 'Destination must be a lowercase SQL identifier (e.g. my_table)'
    return
  }

  const typeId = conn?.connector_type_id || conn?.connector_types?.id
  const typeDef = typeId ? catalogByTypeId.value[typeId] : null

  editingId.value = null
  editorError.value = ''
  editorNotice.value = ''
  outputSummary.value = ''
  outputBody.value = ''
  retrieveSample.value = null
  operatorSample.value = null
  form.name = name
  form.connectionId = connectionId
  form.destinationTable = destinationTable
  form.config = defaultsFromSchema(typeDef?.config_schema)
  form.pipeline = wizard.template === 'merge'
    ? createMergePipeline()
    : createDefaultPipeline()
  clearMergeFields()
  wizardOpen.value = false
  editorOpen.value = true
  nextTick(() => {
    savedSnapshot.value = ''
    scheduleCanvasFit()
  })
}

/**
 * @param {Record<string, unknown>} row
 */
async function openEdit(row) {
  error.value = ''
  editorError.value = ''
  editorNotice.value = ''
  outputSummary.value = ''
  outputBody.value = ''
  retrieveSample.value = null
  operatorSample.value = null
  clearMergeFields()
  try {
    const res = await authedFetch(`/api/data-sources/${row.id}`, {
      query: { organizationId: activeOrganization.value.id },
    })
    const item = res.item
    editingId.value = item.id
    form.name = item.name
    form.connectionId = item.connection_id
    form.destinationTable = item.destination_table
    form.config = { ...(item.config || {}) }
    form.pipeline = normalizePipeline(item.pipeline)
    editorOpen.value = true
    await nextTick()
    markSaved()
    scheduleCanvasFit()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load source'
  }
}

function scheduleCanvasFit() {
  // Wait for ClientOnly + Vue Flow layout, then fit like the Controls fit-view button.
  nextTick(() => {
    setTimeout(() => {
      if (pipelineCanvas.value?.resetViewFit) {
        pipelineCanvas.value.resetViewFit()
      }
      else {
        pipelineCanvas.value?.fitToScreen?.(0)
      }
    }, 80)
  })
}

async function load() {
  if (!activeOrganization.value?.id) {
    items.value = []
    connections.value = []
    catalogByTypeId.value = {}
    pending.value = false
    return
  }
  pending.value = true
  error.value = ''
  try {
    const [connRes, catalogRes, srcRes] = await Promise.all([
      authedFetch('/api/connections', {
        query: { organizationId: activeOrganization.value.id },
      }),
      authedFetch('/api/connector-types/catalog', {
        query: { organizationId: activeOrganization.value.id },
      }),
      authedFetch('/api/data-sources', {
        query: { organizationId: activeOrganization.value.id },
      }),
    ])
    connections.value = connRes.items || []
    const map = {}
    ;(catalogRes.items || []).forEach((t) => {
      map[t.id] = t
    })
    catalogByTypeId.value = map
    items.value = srcRes.items || []
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load sources'
    items.value = []
  }
  finally {
    pending.value = false
  }
}

/**
 * @param {{ close?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function saveSource(opts = {}) {
  const shouldClose = Boolean(opts.close)
  if (!activeOrganization.value?.id) return false
  saving.value = true
  if (!editorBusyMode.value) editorBusyMode.value = 'save'
  editorError.value = ''
  error.value = ''
  notice.value = ''
  try {
    flushEditorState()
    await nextTick()

    if (!String(form.name || '').trim()) {
      throw createErrorLocal('Name is required')
    }
    if (!form.connectionId) {
      throw createErrorLocal('Connection is required')
    }
    if (!String(form.destinationTable || '').trim()) {
      throw createErrorLocal('Destination table is required')
    }

    const body = {
      organizationId: activeOrganization.value.id,
      name: form.name,
      connectionId: form.connectionId,
      destinationTable: form.destinationTable,
      config: form.config,
      pipeline: form.pipeline,
    }
    if (editingId.value) {
      await authedFetch(`/api/data-sources/${editingId.value}`, {
        method: 'PUT',
        body,
      })
      notice.value = 'Source updated'
      editorNotice.value = 'Source saved'
    }
    else {
      const res = await authedFetch('/api/data-sources', {
        method: 'POST',
        body,
      })
      editingId.value = res.item?.id || editingId.value
      notice.value = 'Source created'
      editorNotice.value = 'Source saved'
    }
    markSaved()
    await load()
    if (shouldClose) {
      editorOpen.value = false
    }
    return true
  }
  catch (err) {
    const msg = err?.data?.statusMessage || err?.message || 'Save failed'
    applyOutput('', '', msg)
    error.value = msg
    return false
  }
  finally {
    saving.value = false
    if (editorBusyMode.value === 'save') editorBusyMode.value = null
  }
}

/**
 * @param {'test'|'run'} mode
 */
async function runFromEditor(mode) {
  if (editorBusy.value) return
  editorError.value = ''
  editorNotice.value = ''

  flushEditorState()
  await nextTick()

  const needsSave = !editingId.value || currentSnapshot() !== savedSnapshot.value
  if (needsSave) {
    const ok = await appConfirm({
      title: 'Save before continuing?',
      message: !editingId.value
        ? `Save this new source before ${mode === 'test' ? 'testing' : 'running'}?`
        : `You have unsaved changes. Save before ${mode === 'test' ? 'testing' : 'running'}?`,
      confirmLabel: 'Save & continue',
    })
    if (!ok) return
    editorBusyMode.value = 'save'
    await nextTick()
    const saved = await saveSource({ close: false })
    if (!saved) return
  }

  if (!editingId.value) {
    editorError.value = 'Save the source before testing or running'
    return
  }

  // Immediate busy feedback before the network call
  editorBusyMode.value = mode
  applyOutput(mode === 'test' ? 'Testing…' : 'Running…', '')
  await nextTick()

  try {
    const res = await authedFetch(`/api/data-sources/${editingId.value}/run`, {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        mode,
      },
    })
    const formatted = formatRunResult(res, mode)
    applyOutput(formatted.summary, formatted.body)
    notice.value = formatted.summary
    const retrieveStep = Array.isArray(res.pipelineSteps)
      ? res.pipelineSteps.find((s) => s.type === 'retrieve')
      : null
    if (retrieveStep?.sample?.[0]) {
      retrieveSample.value = retrieveStep.sample[0]
    }
    else if (Array.isArray(res.sample) && res.sample[0]) {
      retrieveSample.value = res.sample[0]
    }
  }
  catch (err) {
    const msg = err?.data?.statusMessage || err?.message || 'Run failed'
    applyOutput('', '', msg)
    error.value = msg
  }
  finally {
    editorBusyMode.value = null
  }
}

/**
 * @param {Record<string, unknown>} row
 * @param {'test'|'run'} mode
 */
async function runSource(row, mode) {
  if (busyId.value) return
  busyId.value = row.id
  busyMode.value = mode
  error.value = ''
  notice.value = mode === 'test' ? 'Testing…' : 'Running…'
  await nextTick()
  try {
    const res = await authedFetch(`/api/data-sources/${row.id}/run`, {
      method: 'POST',
      body: {
        organizationId: activeOrganization.value.id,
        mode,
      },
    })
    notice.value = formatRunResult(res, mode).summary
    await load()
  }
  catch (err) {
    await load()
    error.value = err?.data?.statusMessage || err?.message || 'Run failed'
    notice.value = ''
  }
  finally {
    busyId.value = null
    busyMode.value = null
  }
}

/**
 * @param {Record<string, unknown>} row
 */
async function removeSource(row) {
  const ok = await appConfirm({
    title: 'Delete source?',
    message: `Delete source “${row.name}”? This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  busyId.value = row.id
  error.value = ''
  try {
    await authedFetch(`/api/data-sources/${row.id}`, {
      method: 'DELETE',
      query: { organizationId: activeOrganization.value.id },
    })
    notice.value = 'Source deleted'
    await load()
  }
  catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Delete failed'
  }
  finally {
    busyId.value = null
  }
}

watch(
  () => activeOrganization.value?.id,
  () => {
    load()
  },
  { immediate: true },
)
</script>
