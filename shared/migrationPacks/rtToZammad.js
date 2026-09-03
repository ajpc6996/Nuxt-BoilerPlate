/**
 * Proprietary migration pack: Request Tracker → Zammad.
 * Core migration code must stay pack-agnostic; put product knowledge here.
 */

/** @type {import('./types.js').MigrationPack} */
export const rtToZammadPack = {
  id: 'rt-to-zammad',
  label: 'Request Tracker → Zammad',
  sourceSystemId: 'rt',
  destinationSystemId: 'zammad',
  docsUrls: [
    'https://docs.zammad.org/en/latest/',
    'https://docs.bestpractical.com/rt/latest/index.html',
  ],
  promptGuidance: `Zammad-specific (destination):
- Direct PostgreSQL writes require audit columns on most tables: created_by_id, updated_by_id, created_at, updated_at
- Default actor id 1 only if docs/environment imply a system/admin user exists; otherwise note that operators must set a real admin id
- Use "__NOW__" for timestamp constants
- Include active=true (boolean true, never an RT SortOrder/id) where the table requires it
- groups: follow_up_assignment, shared_drafts, active are booleans; follow_up_possible is the string "yes" or "new_ticket" — never map SortOrder or numeric IDs into boolean columns
- tickets: number (NOT NULL — map RT Tickets.id) and title (NOT NULL — map RT Subject) are required; preserve RT Tickets.id as tickets.id so Transactions.ObjectId resolves to ticket_articles.ticket_id
- ticket_articles: ticket_id, type_id, sender_id, body, content_type are required; map RT Transactions.ObjectId→ticket_id, Type→type_id/sender_id, Content→body
- tickets: state_id and priority_id are integers (FK). Never copy RT Status/Priority *names* (e.g. "approved") into them — use transform:"map" from names to Zammad ids (new=1, open=2, closed=4, normal priority=2). Unknown names should fall back to open/normal.
- Map RT Queues→groups, Users→users, Tickets→tickets, Transactions(Create/Correspond/Comment)→articles carefully
- Warn that Zammad may need cache clear / background jobs / Elasticsearch reindex after DB inserts

RT-specific (source):
- Typical MySQL tables are PascalCase (Users, Queues, Tickets, Transactions, Attachments)
- Set sourceEntity to those real table names`,

  destination: {
    defaults: {
      users: [
        { destination: 'created_by_id', constantValue: 1, required: true },
        { destination: 'updated_by_id', constantValue: 1, required: true },
        { destination: 'created_at', constantValue: '__NOW__', required: true },
        { destination: 'updated_at', constantValue: '__NOW__', required: true },
        { destination: 'active', constantValue: true, required: false, force: true },
      ],
      groups: [
        { destination: 'created_by_id', constantValue: 1, required: true },
        { destination: 'updated_by_id', constantValue: 1, required: true },
        { destination: 'created_at', constantValue: '__NOW__', required: true },
        { destination: 'updated_at', constantValue: '__NOW__', required: true },
        { destination: 'active', constantValue: true, required: false, force: true },
        { destination: 'shared_drafts', constantValue: true, required: false, force: true },
        { destination: 'follow_up_assignment', constantValue: true, required: false, force: true },
        { destination: 'follow_up_possible', constantValue: 'yes', required: false },
      ],
      tickets: [
        { destination: 'created_by_id', constantValue: 1, required: true },
        { destination: 'updated_by_id', constantValue: 1, required: true },
        { destination: 'created_at', constantValue: '__NOW__', required: true },
        { destination: 'updated_at', constantValue: '__NOW__', required: true },
        { destination: 'group_id', constantValue: 1, required: true },
        { destination: 'customer_id', constantValue: 1, required: true },
        { destination: 'owner_id', constantValue: 1, required: false },
        { destination: 'state_id', constantValue: 2, required: true },
        { destination: 'priority_id', constantValue: 2, required: true },
      ],
      articles: [
        { destination: 'created_by_id', constantValue: 1, required: true },
        { destination: 'updated_by_id', constantValue: 1, required: true },
        { destination: 'created_at', constantValue: '__NOW__', required: true },
        { destination: 'updated_at', constantValue: '__NOW__', required: true },
        { destination: 'type_id', constantValue: 10, required: true },
        { destination: 'sender_id', constantValue: 2, required: true },
        { destination: 'content_type', constantValue: 'text/plain', required: true },
        { destination: 'internal', constantValue: false, required: true },
      ],
    },
    entityAliases: {
      queues: 'groups',
      queue: 'groups',
      group: 'groups',
      transactions: 'articles',
      transaction: 'articles',
      article: 'articles',
      ticket_articles: 'articles',
      ticket_article: 'articles',
      ticket: 'tickets',
      user: 'users',
    },
    booleanFields: [
      'active',
      'shared_drafts',
      'follow_up_assignment',
      'out_of_office',
      'vip',
    ],
    requiredColumns: {
      tickets: ['number', 'title'],
      articles: ['ticket_id', 'type_id', 'sender_id', 'body', 'content_type'],
    },
    integerExtraFields: [
      'article_count',
      'time_unit',
      'assignment_timeout',
      'reopen_time_in_days',
    ],
    lookupMaps: {
      tickets: {
        state_id: {
          map: {
            new: 1,
            open: 2,
            stalled: 3,
            pending: 3,
            'pending reminder': 3,
            'pending close': 6,
            waiting: 3,
            resolved: 4,
            closed: 4,
            rejected: 4,
            deleted: 4,
            merged: 5,
            approved: 2,
            approval: 2,
            'in progress': 2,
            working: 2,
          },
          defaultConstant: 2,
          notes: 'RT status names → Zammad state_id (default open=2)',
        },
        priority_id: {
          map: {
            low: 1,
            lowest: 1,
            normal: 2,
            medium: 2,
            high: 3,
            highest: 3,
            '0': 1,
            '1': 1,
            '2': 2,
            '3': 3,
            '4': 3,
            '5': 3,
          },
          defaultConstant: 2,
          notes: 'RT priority → Zammad priority_id (default normal=2)',
        },
      },
      articles: {
        type_id: {
          map: {
            create: 10,
            comment: 10,
            correspond: 1,
            status: 10,
            customfield: 10,
            email: 1,
            phone: 5,
            web: 11,
          },
          defaultConstant: 10,
          defaultSources: ['Type'],
          notes: 'RT Transactions.Type → Zammad type_id (default note=10)',
        },
        sender_id: {
          map: {
            create: 2,
            comment: 2,
            correspond: 2,
            status: 1,
            customfield: 2,
            email: 2,
            phone: 2,
            web: 3,
          },
          defaultConstant: 2,
          defaultSources: ['Type'],
          notes: 'RT Transactions.Type → Zammad sender_id (default Agent=2)',
        },
      },
    },
    fieldHints: {
      users: {
        active: {
          type: 'boolean',
          options: [
            { value: true, label: 'true (active)' },
            { value: false, label: 'false (inactive)' },
          ],
        },
        created_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
        updated_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
        created_by_id: { type: 'integer', placeholder: '1', hint: 'Zammad user id (often admin = 1)' },
        updated_by_id: { type: 'integer', placeholder: '1', hint: 'Zammad user id (often admin = 1)' },
      },
      groups: {
        active: {
          type: 'boolean',
          options: [
            { value: true, label: 'true (active)' },
            { value: false, label: 'false (inactive)' },
          ],
        },
        shared_drafts: {
          type: 'boolean',
          options: [
            { value: true, label: 'true (enabled)' },
            { value: false, label: 'false (disabled)' },
          ],
        },
        follow_up_assignment: {
          type: 'boolean',
          options: [
            { value: true, label: 'true (keep owner)' },
            { value: false, label: 'false (reset owner)' },
          ],
        },
        follow_up_possible: {
          type: 'enum',
          options: [
            { value: 'yes', label: 'yes (reopen same ticket)' },
            { value: 'new_ticket', label: 'new_ticket' },
          ],
        },
        created_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
        updated_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
        created_by_id: { type: 'integer', placeholder: '1' },
        updated_by_id: { type: 'integer', placeholder: '1' },
      },
      tickets: {
        number: {
          type: 'string',
          placeholder: 'RT Tickets.id',
          hint: 'Zammad display number (NOT NULL) — usually RT ticket id as text',
        },
        title: {
          type: 'string',
          placeholder: 'RT Subject',
          hint: 'Ticket title (NOT NULL)',
        },
        state_id: {
          type: 'enum',
          placeholder: '2',
          hint: 'Integer ticket_states.id (default open = 2)',
        },
        priority_id: {
          type: 'enum',
          placeholder: '2',
          hint: 'Integer ticket_priorities.id (default normal = 2)',
        },
        group_id: { type: 'integer', placeholder: '1', hint: 'groups.id' },
        customer_id: { type: 'integer', placeholder: '1', hint: 'users.id (requester)' },
        owner_id: { type: 'integer', placeholder: '1', hint: 'users.id (agent)' },
        created_by_id: { type: 'integer', placeholder: '1' },
        updated_by_id: { type: 'integer', placeholder: '1' },
        created_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
        updated_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
      },
      articles: {
        ticket_id: {
          type: 'integer',
          placeholder: 'RT ObjectId',
          hint: 'Must match tickets.id — preserve RT ticket id on ticket export',
        },
        type_id: {
          type: 'enum',
          placeholder: '10',
          hint: 'ticket_article_types.id (default note = 10)',
        },
        sender_id: {
          type: 'enum',
          placeholder: '2',
          hint: 'ticket_article_senders.id (default Agent = 2)',
        },
        body: { type: 'string', placeholder: 'RT Content', hint: 'Article body (NOT NULL)' },
        content_type: { type: 'string', placeholder: 'text/plain' },
        internal: { type: 'boolean', placeholder: 'false' },
        created_by_id: { type: 'integer', placeholder: '1' },
        updated_by_id: { type: 'integer', placeholder: '1' },
        created_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
        updated_at: { type: 'timestamp', options: [{ value: '__NOW__', label: 'Now (__NOW__)' }] },
      },
    },
  },

  crossFieldCopies: {
    tickets: [
      {
        destination: 'id',
        sources: ['id'],
        transform: 'copy',
        cast: 'number',
        force: true,
        required: true,
        destinationType: 'integer',
        notes: 'Preserve RT Tickets.id so ticket_articles.ticket_id (ObjectId) resolves',
      },
      {
        destination: 'number',
        sources: ['id'],
        transform: 'copy',
        cast: 'string',
        force: true,
        required: true,
        destinationType: 'string',
        notes: 'Zammad tickets.number is NOT NULL — map RT Tickets.id',
      },
      {
        destination: 'title',
        sources: ['Subject'],
        transform: 'copy',
        constantValue: 'Migrated ticket',
        required: true,
        destinationType: 'string',
        notes: 'Zammad tickets.title is NOT NULL — map RT Subject with fallback',
      },
    ],
    articles: [
      {
        destination: 'ticket_id',
        sources: ['ObjectId', 'objectid', 'ObjectID', 'object_id'],
        transform: 'copy',
        cast: 'number',
        force: true,
        required: true,
        destinationType: 'integer',
        notes: 'RT Transactions.ObjectId → ticket_articles.ticket_id (needs tickets.id = RT id)',
      },
      {
        destination: 'body',
        sources: ['Content'],
        transform: 'copy',
        constantValue: '(migrated)',
        required: true,
        destinationType: 'string',
        notes: 'Zammad ticket_articles.body is NOT NULL',
      },
      {
        destination: 'type_id',
        sources: ['Type'],
        transform: 'map',
        mapValues: {
          create: 10,
          comment: 10,
          correspond: 1,
          status: 10,
          customfield: 10,
          email: 1,
          phone: 5,
          web: 11,
        },
        constantValue: 10,
        required: true,
        destinationType: 'integer',
        notes: 'RT Transactions.Type → Zammad ticket_article_types.id (default note=10)',
      },
      {
        destination: 'sender_id',
        sources: ['Type'],
        transform: 'map',
        mapValues: {
          create: 2,
          comment: 2,
          correspond: 2,
          status: 1,
          customfield: 2,
          email: 2,
          phone: 2,
          web: 3,
        },
        constantValue: 2,
        required: true,
        destinationType: 'integer',
        notes: 'RT Transactions.Type → Zammad ticket_article_senders.id (default Agent=2)',
      },
    ],
  },

  exportPolicies: {
    tickets: {
      preDeleteByField: 'id',
      preDeleteCascade: [
        { table: 'ticket_articles', matchField: 'ticket_id' },
      ],
      requireFields: ['id'],
      syncSerialSequence: 'id',
    },
    articles: {
      missingTicketParents: 'filter',
      validateArticleForeignKeys: 'filter',
      patchMissingUserRefs: true,
      exportFkValidation: {
        parentLookups: [
          { rowField: 'ticket_id', parentTable: 'tickets', reason: 'ticket_id' },
          { rowField: 'type_id', parentTable: 'ticket_article_types', reason: 'type_id' },
          { rowField: 'sender_id', parentTable: 'ticket_article_senders', reason: 'sender_id' },
        ],
        userRefFields: ['created_by_id', 'updated_by_id', 'origin_by_id'],
        fallbackUserSql: 'SELECT id FROM users WHERE active = true ORDER BY id ASC LIMIT 1',
        fkErrorHints: {
          ticket_id: 'Run Transform Tickets first so RT ids are preserved as tickets.id.',
          type_id: 'Map RT Transactions.Type to valid Zammad ticket_article_types ids (default note=10). Materialize flows and retry.',
          sender_id: 'Map RT Transactions.Type to valid Zammad ticket_article_senders ids (default Agent=2). Materialize flows and retry.',
          created_by_id: 'Run Transform Users first, or ensure Zammad has an active user for created_by_id.',
          updated_by_id: 'Run Transform Users first, or ensure Zammad has an active user for updated_by_id.',
          origin_by_id: 'origin_by_id must reference an existing Zammad user.',
        },
        emptyResultMessage: 'Article FK: none of {total} row(s) are exportable ({detail}). Run Users → Tickets before Articles.',
      },
    },
  },

  extractScope: {
    childEntityKeys: ['articles', 'transactions'],
    parentEntityKey: 'tickets',
    childParentFields: ['ObjectId', 'objectid', 'ObjectID', 'object_id', 'ticket_id'],
    parentIdFields: ['id', 'ID', 'Id'],
  },

  childExportGate: {
    childEntityKeys: ['articles', 'transactions'],
    parentEntityKey: 'tickets',
    missingParentMessage: 'Articles export requires Transform Tickets to succeed in the same run first.',
    missingParentHint: 'Run Transform Tickets before Transform Articles. Extract Transactions can run anytime; only the articles transform/export writes to Zammad.',
    zeroOutboundMessage: 'Transform Tickets wrote 0 rows to Zammad. Articles export needs ticket rows with preserved RT ids first.',
    zeroOutboundHint: 'Open the Transform Tickets data flow, run Test, and confirm outbound rows include id, number, and title. Re-run Extract Tickets if raw ingest is empty, then Transform Tickets.',
  },

  failureHints: [
    {
      test: (msg) => msg.includes('violates not-null') && msg.includes('column "number"'),
      hint: 'Zammad tickets.number is required. Click Materialize flows to map RT Tickets.id → number, then retry Pilot.',
    },
    {
      test: (msg) => msg.includes('violates not-null') && msg.includes('column "title"'),
      hint: 'Zammad tickets.title is required. Click Materialize flows to map RT Subject → title, then retry Pilot.',
    },
    {
      test: (msg) => (msg.includes('foreign key') || msg.includes('article fk'))
        && (msg.includes('created_by_id') || msg.includes('updated_by_id') || msg.includes('origin_by_id')),
      hint: 'Article FK failed on user reference. Run Transform Users first so Zammad has valid user ids, then retry Articles.',
    },
    {
      test: (msg) => (msg.includes('foreign key') || msg.includes('article fk')) && msg.includes('type_id'),
      hint: 'Article FK failed on type_id. Materialize flows so RT Transactions.Type maps to Zammad ticket_article_types, then retry.',
    },
    {
      test: (msg) => (msg.includes('foreign key') || msg.includes('article fk')) && msg.includes('sender_id'),
      hint: 'Article FK failed on sender_id. Materialize flows so RT Transactions.Type maps to Zammad ticket_article_senders, then retry.',
    },
    {
      test: (msg, stage) => (msg.includes('foreign key') || msg.includes('article fk') || msg.includes('ticket_articles'))
        && (msg.includes('ticket_articles')
          || stage.entity_key === 'articles'
          || stage.entity_key === 'transactions'),
      hint: 'Article FK failed (usually ticket_id). Run Transform Tickets first with RT id preserved as tickets.id, then retry Articles.',
    },
    {
      test: (msg) => msg.includes('missing required column') && msg.includes(' id'),
      hint: 'Ticket export rows are missing tickets.id — RT ticket ids were not preserved. Click Materialize flows, then re-pilot Tickets before Articles.',
    },
    {
      test: (msg) => msg.includes('invalid input syntax for type boolean'),
      hint: 'A Zammad boolean column (active, shared_drafts, follow_up_assignment) received a non-boolean like “2” (often RT SortOrder). Click Materialize flows to force boolean constants, then retry Pilot.',
    },
    {
      test: (msg) => msg.includes('invalid input syntax for type integer'),
      hint: 'An integer FK (often state_id/priority_id) received a label like “approved”. Click Materialize flows so status/priority names map to Zammad ids, then retry Pilot. Adjust the state map in Mapping if your Zammad state ids differ.',
    },
  ],
}
