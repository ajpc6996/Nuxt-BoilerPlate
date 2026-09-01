<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-[var(--ink)]">Transform</h3>
      <p class="mt-1 text-xs text-[var(--mute)]">
        Ordered field actions after the parent node. Rows are never dropped.
      </p>
    </div>

    <div class="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-medium text-[var(--mute)]">Sample object (for field lists)</p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="text-xs text-[var(--accent-ink)] hover:underline disabled:opacity-50"
            :disabled="loadingSample"
            @click="emit('fetch-sample')"
          >
            {{ loadingSample ? 'Fetching…' : 'Load from parent' }}
          </button>
          <button
            type="button"
            class="text-xs text-[var(--mute)] hover:underline"
            @click="applyPaste"
          >
            Apply pasted JSON
          </button>
        </div>
      </div>
      <textarea
        v-model="pasteText"
        rows="4"
        placeholder='Paste one object, e.g. { "first_name": "Ada", "tags": "a,b" }'
        class="w-full rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1.5 font-mono text-xs text-[var(--ink)]"
      />
      <p
        v-if="sampleError"
        class="text-xs text-[var(--danger)]"
      >
        {{ sampleError }}
      </p>
      <p
        v-else-if="availableFields.length"
        class="text-xs text-[var(--mute-soft)]"
      >
        Fields: <span class="font-mono text-[var(--accent-ink)]">{{ availableFields.join(', ') }}</span>
      </p>
      <div
        v-if="previewRow"
        class="mt-2"
      >
        <p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--mute)]">Live preview</p>
        <pre class="max-h-32 overflow-auto rounded bg-[var(--surface-raised)] p-2 font-mono text-[10px] text-[var(--mute)]">{{ previewJson }}</pre>
      </div>
    </div>

    <div>
      <div class="mb-2">
        <label class="text-xs font-medium text-[var(--mute)]">Add action</label>
      </div>
      <div class="mb-3 space-y-2">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-[var(--mute-soft)]">Core</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="opt in coreActionOptions"
            :key="opt.op"
            type="button"
            class="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-[11px] text-[var(--ink)] hover:border-[var(--accent)]"
            @click="addActionByOp(opt.op)"
          >
            {{ opt.label }}
          </button>
        </div>
        <p class="text-[10px] font-semibold uppercase tracking-wide text-[var(--mute-soft)]">v1.1</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="opt in v11ActionOptions"
            :key="opt.op"
            type="button"
            class="rounded border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-1 text-[11px] text-[var(--ink)] hover:border-[var(--accent)]"
            @click="addActionByOp(opt.op)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div
        v-if="!actions.length"
        class="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--mute)]"
      >
        No actions — rows pass through unchanged.
      </div>

      <div
        v-else
        class="space-y-3"
      >
        <div
          v-for="(action, idx) in actions"
          :key="idx"
          class="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-semibold text-[var(--ink)]">
              {{ idx + 1 }}. {{ opLabel(action.op) }}
            </p>
            <div class="flex gap-2">
              <button
                type="button"
                class="text-[10px] text-[var(--mute)] hover:text-[var(--ink)] disabled:opacity-30"
                :disabled="idx === 0"
                @click="moveAction(idx, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="text-[10px] text-[var(--mute)] hover:text-[var(--ink)] disabled:opacity-30"
                :disabled="idx === actions.length - 1"
                @click="moveAction(idx, 1)"
              >
                ↓
              </button>
              <button
                type="button"
                class="text-xs text-[var(--danger)] hover:underline"
                @click="removeAction(idx)"
              >
                Remove
              </button>
            </div>
          </div>

          <template v-if="action.op === 'trim'">
            <label class="block text-[10px] text-[var(--mute)]">Field</label>
            <select
              v-if="availableFields.length"
              v-model="action.field"
              class="field-input font-mono"
              @change="emitUpdate"
            >
              <option value="" disabled>field…</option>
              <option
                v-for="f in availableFields"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select>
            <input
              v-else
              v-model="action.field"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Mode</label>
            <select
              v-model="action.mode"
              class="field-input"
              @change="emitUpdate"
            >
              <option value="start">Before (leading)</option>
              <option value="end">After (trailing)</option>
              <option value="both">Both ends</option>
              <option value="remove_spaces">All spaces (strip every space)</option>
            </select>
            <label class="block text-[10px] text-[var(--mute)]">Write to (optional)</label>
            <input
              v-model="action.targetField"
              type="text"
              placeholder="same field"
              class="field-input font-mono"
              @input="emitUpdate"
            >
          </template>

          <template v-else-if="action.op === 'case'">
            <label class="block text-[10px] text-[var(--mute)]">Field</label>
            <select
              v-if="availableFields.length"
              v-model="action.field"
              class="field-input font-mono"
              @change="emitUpdate"
            >
              <option value="" disabled>field…</option>
              <option
                v-for="f in availableFields"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select>
            <input
              v-else
              v-model="action.field"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Style (value transform)</label>
            <select
              v-model="action.style"
              class="field-input"
              @change="emitUpdate"
            >
              <option value="camel">camelCase</option>
              <option value="pascal">PascalCase</option>
              <option value="snake">snake_case</option>
              <option value="kebab">kebab-case</option>
              <option value="lower">lower</option>
              <option value="upper">UPPER</option>
            </select>
            <label class="block text-[10px] text-[var(--mute)]">Write value to (optional)</label>
            <input
              v-model="action.targetField"
              type="text"
              placeholder="same field"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Rename field to (optional)</label>
            <input
              v-model="action.renameTo"
              type="text"
              placeholder="leave blank to keep key"
              class="field-input font-mono"
              @input="emitUpdate"
            >
          </template>

          <template v-else-if="action.op === 'join'">
            <label class="block text-[10px] text-[var(--mute)]">Fields (order matters)</label>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="(f, fi) in action.fields"
                :key="`${f}-${fi}`"
                class="inline-flex items-center gap-1 rounded bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-xs"
              >
                {{ f }}
                <button
                  type="button"
                  class="text-[var(--danger)]"
                  @click="removeJoinField(action, fi)"
                >
                  ×
                </button>
              </span>
              <select
                v-if="availableFields.length"
                class="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-xs"
                :value="''"
                @change="onAddJoinField(action, $event)"
              >
                <option value="" disabled>Add…</option>
                <option
                  v-for="f in availableFields"
                  :key="f"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
            </div>
            <label class="block text-[10px] text-[var(--mute)]">Separator</label>
            <input
              v-model="action.separator"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">New field name</label>
            <input
              v-model="action.targetField"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
          </template>

          <template v-else-if="action.op === 'split'">
            <label class="block text-[10px] text-[var(--mute)]">Field</label>
            <select
              v-if="availableFields.length"
              v-model="action.field"
              class="field-input font-mono"
              @change="emitUpdate"
            >
              <option value="" disabled>field…</option>
              <option
                v-for="f in availableFields"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select>
            <input
              v-else
              v-model="action.field"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Separator (default comma)</label>
            <input
              v-model="action.separator"
              type="text"
              placeholder=","
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Array field name</label>
            <input
              v-model="action.targetField"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
          </template>

          <template v-else-if="action.op === 'join_array'">
            <label class="block text-[10px] text-[var(--mute)]">Array field</label>
            <select
              v-if="availableFields.length"
              v-model="action.field"
              class="field-input font-mono"
              @change="emitUpdate"
            >
              <option value="" disabled>field…</option>
              <option
                v-for="f in availableFields"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select>
            <input
              v-else
              v-model="action.field"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Delimiter (default comma)</label>
            <input
              v-model="action.separator"
              type="text"
              placeholder=","
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Write to (optional)</label>
            <input
              v-model="action.targetField"
              type="text"
              placeholder="same field"
              class="field-input font-mono"
              @input="emitUpdate"
            >
          </template>

          <template v-else-if="action.op === 'regex'">
            <label class="block text-[10px] text-[var(--mute)]">Field</label>
            <select
              v-if="availableFields.length"
              v-model="action.field"
              class="field-input font-mono"
              @change="emitUpdate"
            >
              <option value="" disabled>field…</option>
              <option
                v-for="f in availableFields"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select>
            <input
              v-else
              v-model="action.field"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Pattern</label>
            <input
              v-model="action.pattern"
              type="text"
              placeholder="e.g. \\s+"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Flags</label>
            <input
              v-model="action.flags"
              type="text"
              placeholder="g"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Replacement</label>
            <input
              v-model="action.replacement"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Write to (optional)</label>
            <input
              v-model="action.targetField"
              type="text"
              placeholder="same field"
              class="field-input font-mono"
              @input="emitUpdate"
            >
          </template>

          <template v-else-if="action.op === 'rename' || action.op === 'copy'">
            <label class="block text-[10px] text-[var(--mute)]">From</label>
            <select
              v-if="availableFields.length"
              v-model="action.field"
              class="field-input font-mono"
              @change="emitUpdate"
            >
              <option value="" disabled>field…</option>
              <option
                v-for="f in availableFields"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select>
            <input
              v-else
              v-model="action.field"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">To</label>
            <input
              v-model="action.targetField"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
          </template>

          <template v-else-if="action.op === 'drop'">
            <label class="block text-[10px] text-[var(--mute)]">Fields to drop</label>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="(f, fi) in action.fields"
                :key="`${f}-${fi}`"
                class="inline-flex items-center gap-1 rounded bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-xs"
              >
                {{ f }}
                <button
                  type="button"
                  class="text-[var(--danger)]"
                  @click="removeDropField(action, fi)"
                >
                  ×
                </button>
              </span>
              <select
                v-if="availableFields.length"
                class="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-xs"
                :value="''"
                @change="onAddDropField(action, $event)"
              >
                <option value="" disabled>Add…</option>
                <option
                  v-for="f in availableFields"
                  :key="f"
                  :value="f"
                >
                  {{ f }}
                </option>
              </select>
            </div>
          </template>

          <template v-else-if="action.op === 'cast'">
            <label class="block text-[10px] text-[var(--mute)]">Field</label>
            <select
              v-if="availableFields.length"
              v-model="action.field"
              class="field-input font-mono"
              @change="emitUpdate"
            >
              <option value="" disabled>field…</option>
              <option
                v-for="f in availableFields"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select>
            <input
              v-else
              v-model="action.field"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">To type</label>
            <select
              v-model="action.to"
              class="field-input"
              @change="emitUpdate"
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="date">date (ISO)</option>
            </select>
            <label class="block text-[10px] text-[var(--mute)]">On error</label>
            <select
              v-model="action.onError"
              class="field-input"
              @change="emitUpdate"
            >
              <option value="null">Set null</option>
              <option value="keep">Keep previous</option>
            </select>
            <label class="block text-[10px] text-[var(--mute)]">Write to (optional)</label>
            <input
              v-model="action.targetField"
              type="text"
              placeholder="same field"
              class="field-input font-mono"
              @input="emitUpdate"
            >
          </template>

          <template v-else-if="action.op === 'default'">
            <label class="block text-[10px] text-[var(--mute)]">Field</label>
            <select
              v-if="availableFields.length"
              v-model="action.field"
              class="field-input font-mono"
              @change="emitUpdate"
            >
              <option value="" disabled>field…</option>
              <option
                v-for="f in availableFields"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select>
            <input
              v-else
              v-model="action.field"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">When</label>
            <select
              v-model="action.when"
              class="field-input"
              @change="emitUpdate"
            >
              <option value="null">If null</option>
              <option value="null_or_empty">Null or empty</option>
              <option value="empty">Empty string only</option>
              <option value="always">Always overwrite</option>
            </select>
            <label class="block text-[10px] text-[var(--mute)]">Default value</label>
            <select
              v-if="defaultValueOptions(action).length"
              :value="formatDefaultValue(action.value)"
              class="field-input"
              @change="onDefaultValueSelect(action, $event.target.value)"
            >
              <option value="" disabled>Select value…</option>
              <option
                v-for="opt in defaultValueOptions(action)"
                :key="String(opt.value)"
                :value="String(opt.value)"
              >
                {{ opt.label }}
              </option>
            </select>
            <input
              v-else
              :value="formatDefaultValue(action.value)"
              type="text"
              class="field-input"
              :placeholder="defaultValuePlaceholder(action)"
              @input="onDefaultValueInput(action, $event.target.value)"
            >
            <p
              v-if="defaultValueHint(action)"
              class="text-[10px] text-[var(--mute-soft)]"
            >
              {{ defaultValueHint(action) }}
            </p>
          </template>

          <template v-else-if="action.op === 'template'">
            <label class="block text-[10px] text-[var(--mute)]">Template</label>
            <input
              v-model="action.template"
              type="text"
              placeholder="{first_name} {last_name}"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <p class="text-[10px] text-[var(--mute-soft)]">
              Use <span class="font-mono">{field}</span> or <span class="font-mono">${field}</span> placeholders.
            </p>
            <label class="block text-[10px] text-[var(--mute)]">New field name</label>
            <input
              v-model="action.targetField"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
          </template>

          <template v-else-if="action.op === 'conditional'">
            <label class="block text-[10px] text-[var(--mute)]">When field</label>
            <select
              v-if="availableFields.length"
              v-model="action.field"
              class="field-input font-mono"
              @change="emitUpdate"
            >
              <option value="" disabled>field…</option>
              <option
                v-for="f in availableFields"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select>
            <input
              v-else
              v-model="action.field"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Match</label>
            <select
              v-model="action.matchOp"
              class="field-input"
              @change="emitUpdate"
            >
              <option value="eq">equals</option>
              <option value="neq">not equals</option>
              <option value="contains">contains</option>
              <option value="not_contains">not contains</option>
              <option value="empty">is empty</option>
              <option value="not_empty">is not empty</option>
            </select>
            <label
              v-if="action.matchOp !== 'empty' && action.matchOp !== 'not_empty'"
              class="block text-[10px] text-[var(--mute)]"
            >Value</label>
            <input
              v-if="action.matchOp !== 'empty' && action.matchOp !== 'not_empty'"
              v-model="action.value"
              type="text"
              class="field-input"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Set field</label>
            <input
              v-model="action.targetField"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Then value</label>
            <input
              v-model="action.thenValue"
              type="text"
              class="field-input"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Else value (optional)</label>
            <input
              :value="action.elseValue ?? ''"
              type="text"
              placeholder="leave blank = no change on else"
              class="field-input"
              @input="onElseValueInput(action, $event)"
            >
          </template>

          <template v-else-if="action.op === 'map'">
            <label class="block text-[10px] text-[var(--mute)]">Field</label>
            <select
              v-if="availableFields.length"
              v-model="action.field"
              class="field-input font-mono"
              @change="emitUpdate"
            >
              <option value="" disabled>field…</option>
              <option
                v-for="f in availableFields"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select>
            <input
              v-else
              v-model="action.field"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Mapping (one per line: from=to)</label>
            <textarea
              v-model="action.mappingText"
              rows="4"
              placeholder="A=Active&#10;I=Inactive"
              class="field-input font-mono text-xs"
              @input="onMappingTextInput(action)"
            />
            <label class="block text-[10px] text-[var(--mute)]">Write to (optional)</label>
            <input
              v-model="action.targetField"
              type="text"
              placeholder="same field"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">If no match</label>
            <select
              v-model="action.fallback"
              class="field-input"
              @change="emitUpdate"
            >
              <option value="keep">Keep original</option>
              <option value="null">Set null</option>
              <option value="value">Use fallback value</option>
            </select>
            <input
              v-if="action.fallback === 'value'"
              v-model="action.fallbackValue"
              type="text"
              placeholder="fallback value"
              class="field-input"
              @input="emitUpdate"
            >
          </template>

          <template v-else-if="action.op === 'date_format'">
            <label class="block text-[10px] text-[var(--mute)]">Field</label>
            <select
              v-if="availableFields.length"
              v-model="action.field"
              class="field-input font-mono"
              @change="emitUpdate"
            >
              <option value="" disabled>field…</option>
              <option
                v-for="f in availableFields"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select>
            <input
              v-else
              v-model="action.field"
              type="text"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">Output format</label>
            <select
              v-model="action.format"
              class="field-input"
              @change="emitUpdate"
            >
              <option value="iso">ISO datetime</option>
              <option value="date">Date (YYYY-MM-DD)</option>
              <option value="datetime">Datetime UTC</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            </select>
            <label class="block text-[10px] text-[var(--mute)]">Write to (optional)</label>
            <input
              v-model="action.targetField"
              type="text"
              placeholder="same field"
              class="field-input font-mono"
              @input="emitUpdate"
            >
            <label class="block text-[10px] text-[var(--mute)]">On parse error</label>
            <select
              v-model="action.onError"
              class="field-input"
              @change="emitUpdate"
            >
              <option value="null">Set null</option>
              <option value="keep">Keep previous</option>
            </select>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { previewTransformRow } from '~~/shared/pipelineTransform.js'
import {
  coerceHintValue,
  formatMappingValue,
  getFieldHintByName,
} from '~~/shared/destinationFieldHints.js'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  sampleObject: { type: Object, default: null },
  loadingSample: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'fetch-sample'])

const actions = ref([])
const hydrating = ref(false)
const pasteText = ref('')
const sampleError = ref('')
const localSample = ref(null)

const actionOptions = [
  { op: 'trim', label: 'Trim spaces', group: 'core' },
  { op: 'case', label: 'Change case', group: 'core' },
  { op: 'join', label: 'Join fields', group: 'core' },
  { op: 'split', label: 'Split → array', group: 'core' },
  { op: 'join_array', label: 'Array → string', group: 'core' },
  { op: 'regex', label: 'Regex replace', group: 'core' },
  { op: 'rename', label: 'Rename field', group: 'core' },
  { op: 'copy', label: 'Copy field', group: 'core' },
  { op: 'drop', label: 'Drop fields', group: 'core' },
  { op: 'cast', label: 'Cast type', group: 'core' },
  { op: 'default', label: 'Default / fill null', group: 'core' },
  { op: 'template', label: 'Template string', group: 'v11' },
  { op: 'conditional', label: 'Conditional set', group: 'v11' },
  { op: 'map', label: 'Map values', group: 'v11' },
  { op: 'date_format', label: 'Date format', group: 'v11' },
]

const coreActionOptions = computed(() => actionOptions.filter((o) => o.group === 'core'))
const v11ActionOptions = computed(() => actionOptions.filter((o) => o.group === 'v11'))

const availableFields = computed(() => {
  const obj = localSample.value || props.sampleObject
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
  return Object.keys(obj).filter((k) => !String(k).startsWith('_')).sort()
})

const previewRow = computed(() => {
  const base = localSample.value || props.sampleObject
  if (!base || typeof base !== 'object') return null
  try {
    return previewTransformRow(base, actions.value)
  }
  catch {
    return null
  }
})

const previewJson = computed(() =>
  previewRow.value ? JSON.stringify(previewRow.value, null, 2) : '',
)

watch(
  () => props.sampleObject,
  (val) => {
    if (val && typeof val === 'object') {
      localSample.value = val
      pasteText.value = JSON.stringify(val, null, 2)
      sampleError.value = ''
    }
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  (val) => {
    hydrating.value = true
    actions.value = Array.isArray(val?.actions)
      ? val.actions.map((a) => normalizeAction(a))
      : []
    nextTick(() => {
      hydrating.value = false
    })
  },
  { immediate: true, deep: true },
)

/**
 * @param {Record<string, unknown>} raw
 */
function normalizeAction(raw) {
  const op = String(raw?.op || 'trim')
  if (op === 'trim') {
    return { op, field: raw.field || '', mode: raw.mode || 'both', targetField: raw.targetField || '' }
  }
  if (op === 'case') {
    return {
      op,
      field: raw.field || '',
      style: raw.style || 'camel',
      targetField: raw.targetField || '',
      renameTo: raw.renameTo || '',
    }
  }
  if (op === 'join') {
    return {
      op,
      fields: Array.isArray(raw.fields) ? [...raw.fields] : [],
      separator: raw.separator != null ? raw.separator : ' ',
      targetField: raw.targetField || '',
    }
  }
  if (op === 'split') {
    return {
      op,
      field: raw.field || '',
      separator: raw.separator != null ? raw.separator : ',',
      targetField: raw.targetField || '',
    }
  }
  if (op === 'join_array') {
    return {
      op,
      field: raw.field || '',
      separator: raw.separator != null ? raw.separator : ',',
      targetField: raw.targetField || '',
    }
  }
  if (op === 'regex') {
    return {
      op,
      field: raw.field || '',
      pattern: raw.pattern || '',
      flags: raw.flags || 'g',
      replacement: raw.replacement != null ? raw.replacement : '',
      targetField: raw.targetField || '',
    }
  }
  if (op === 'rename' || op === 'copy') {
    return { op, field: raw.field || '', targetField: raw.targetField || '' }
  }
  if (op === 'drop') {
    return { op, fields: Array.isArray(raw.fields) ? [...raw.fields] : [] }
  }
  if (op === 'cast') {
    return {
      op,
      field: raw.field || '',
      to: raw.to || 'string',
      onError: raw.onError || 'null',
      targetField: raw.targetField || '',
    }
  }
  if (op === 'default') {
    return {
      op,
      field: raw.field || '',
      when: raw.when || 'null_or_empty',
      value: raw.value != null ? raw.value : '',
    }
  }
  if (op === 'template') {
    return {
      op,
      template: raw.template || '',
      targetField: raw.targetField || '',
    }
  }
  if (op === 'conditional') {
    return {
      op,
      field: raw.field || '',
      matchOp: raw.matchOp || 'eq',
      value: raw.value != null ? raw.value : '',
      targetField: raw.targetField || '',
      thenValue: raw.thenValue != null ? raw.thenValue : '',
      elseValue: Object.prototype.hasOwnProperty.call(raw, 'elseValue') ? raw.elseValue : '',
      _hasElse: Object.prototype.hasOwnProperty.call(raw, 'elseValue'),
    }
  }
  if (op === 'map') {
    const mappingText = typeof raw.mapping === 'string'
      ? raw.mapping
      : raw.mappingText
        || mappingObjectToText(raw.mapping)
    return {
      op,
      field: raw.field || '',
      mappingText,
      mapping: mappingText,
      targetField: raw.targetField || '',
      fallback: raw.fallback || 'keep',
      fallbackValue: raw.fallbackValue != null ? raw.fallbackValue : '',
    }
  }
  if (op === 'date_format') {
    return {
      op,
      field: raw.field || '',
      format: raw.format || 'iso',
      targetField: raw.targetField || '',
      onError: raw.onError || 'null',
    }
  }
  return { op, ...(raw || {}) }
}

/**
 * @param {unknown} mapping
 */
function mappingObjectToText(mapping) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return ''
  return Object.entries(mapping).map(([k, v]) => `${k}=${v}`).join('\n')
}

function emitUpdate() {
  if (hydrating.value) return
  emit('update:modelValue', {
    ...props.modelValue,
    label: props.modelValue?.label || 'Transform',
    actions: actions.value.map((a) => serializeAction(a)),
  })
}

/**
 * @param {Record<string, unknown>} action
 */
function serializeAction(action) {
  const op = action.op
  if (op === 'map') {
    return {
      op,
      field: action.field || '',
      mapping: action.mappingText || '',
      targetField: action.targetField || '',
      fallback: action.fallback || 'keep',
      fallbackValue: action.fallbackValue ?? '',
    }
  }
  if (op === 'conditional') {
    /** @type {Record<string, unknown>} */
    const out = {
      op,
      field: action.field || '',
      matchOp: action.matchOp || 'eq',
      value: action.value ?? '',
      targetField: action.targetField || '',
      thenValue: action.thenValue ?? '',
    }
    if (action._hasElse || (action.elseValue != null && action.elseValue !== '')) {
      out.elseValue = action.elseValue ?? ''
    }
    return out
  }
  if (op === 'template') {
    return {
      op,
      template: action.template || '',
      targetField: action.targetField || '',
    }
  }
  if (op === 'date_format') {
    return {
      op,
      field: action.field || '',
      format: action.format || 'iso',
      targetField: action.targetField || '',
      onError: action.onError || 'null',
    }
  }
  const { mappingText, _hasElse, ...rest } = action
  return { ...rest }
}

/**
 * @param {Record<string, unknown>} action
 * @param {Event} event
 */
function onElseValueInput(action, event) {
  const v = event.target?.value ?? ''
  action.elseValue = v
  action._hasElse = true
  emitUpdate()
}

/**
 * @param {Record<string, unknown>} action
 */
function onMappingTextInput(action) {
  action.mapping = action.mappingText || ''
  emitUpdate()
}

function applyPaste() {
  sampleError.value = ''
  try {
    const parsed = JSON.parse(pasteText.value || '')
    const obj = Array.isArray(parsed) ? parsed[0] : parsed
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('Paste a JSON object (or an array of objects)')
    }
    localSample.value = obj
  }
  catch (err) {
    sampleError.value = err?.message || 'Invalid JSON'
  }
}

/**
 * @param {string} op
 */
function addActionByOp(op) {
  if (!op) return
  const defaultField = availableFields.value[0] || ''
  actions.value.push(normalizeAction({
    op,
    field: defaultField,
    fields: defaultField ? [defaultField] : [],
  }))
  emitUpdate()
}

/**
 * @param {Event} event
 */
function onAddAction(event) {
  const op = event.target?.value
  addActionByOp(op)
  if (event.target) event.target.value = ''
}

/**
 * @param {number} idx
 */
function removeAction(idx) {
  actions.value.splice(idx, 1)
  emitUpdate()
}

/**
 * @param {number} idx
 * @param {number} dir
 */
function moveAction(idx, dir) {
  const next = idx + dir
  if (next < 0 || next >= actions.value.length) return
  const copy = [...actions.value]
  const [item] = copy.splice(idx, 1)
  copy.splice(next, 0, item)
  actions.value = copy
  emitUpdate()
}

/**
 * @param {string} op
 */
function opLabel(op) {
  return actionOptions.find((o) => o.op === op)?.label || op
}

/**
 * @param {Record<string, unknown>} action
 * @param {Event} event
 */
function onAddJoinField(action, event) {
  const v = event.target?.value
  if (!v) return
  if (!Array.isArray(action.fields)) action.fields = []
  action.fields.push(v)
  event.target.value = ''
  emitUpdate()
}

/**
 * @param {Record<string, unknown>} action
 * @param {number} fi
 */
function removeJoinField(action, fi) {
  action.fields.splice(fi, 1)
  emitUpdate()
}

/**
 * @param {Record<string, unknown>} action
 * @param {Event} event
 */
function onAddDropField(action, event) {
  const v = event.target?.value
  if (!v) return
  if (!Array.isArray(action.fields)) action.fields = []
  if (!action.fields.includes(v)) action.fields.push(v)
  event.target.value = ''
  emitUpdate()
}

/**
 * @param {Record<string, unknown>} action
 * @param {number} fi
 */
function removeDropField(action, fi) {
  action.fields.splice(fi, 1)
  emitUpdate()
}

/**
 * @param {Record<string, unknown>} action
 */
function defaultFieldHint(action) {
  return getFieldHintByName(String(action.field || ''))
}

/**
 * @param {Record<string, unknown>} action
 */
function defaultValueOptions(action) {
  return defaultFieldHint(action)?.options || []
}

/**
 * @param {Record<string, unknown>} action
 */
function defaultValuePlaceholder(action) {
  return defaultFieldHint(action)?.placeholder || 'static value'
}

/**
 * @param {Record<string, unknown>} action
 */
function defaultValueHint(action) {
  return defaultFieldHint(action)?.hint || ''
}

/**
 * @param {unknown} value
 */
function formatDefaultValue(value) {
  return formatMappingValue(value)
}

/**
 * @param {Record<string, unknown>} action
 * @param {string} raw
 */
function onDefaultValueSelect(action, raw) {
  action.value = coerceHintValue(raw, defaultFieldHint(action))
  emitUpdate()
}

/**
 * @param {Record<string, unknown>} action
 * @param {string} raw
 */
function onDefaultValueInput(action, raw) {
  action.value = coerceHintValue(raw, defaultFieldHint(action))
  emitUpdate()
}

defineExpose({ flush: emitUpdate })
</script>

<style scoped>
.field-input {
  width: 100%;
  border-radius: 0.375rem;
  border: 1px solid var(--border);
  background: var(--surface-raised);
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  color: var(--ink);
}
</style>
