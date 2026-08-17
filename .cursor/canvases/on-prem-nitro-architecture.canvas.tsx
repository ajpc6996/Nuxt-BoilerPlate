import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  CollapsibleSection,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  computeDAGLayout,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

type ViewId = "topology" | "datapath" | "volumes";

export default function OnPremNitroArchitecture() {
  const [view, setView] = useCanvasState<ViewId>("view", "topology");

  return (
    <Stack gap={20}>
      <Stack gap={6}>
        <H1>On-prem Nitro with local ingest warehouse</H1>
        <Text tone="secondary">
          Proposed split: keep hosted Supabase as the control plane (Auth, orgs,
          connections, licences). Run Nitro and a warehouse Postgres on-site so
          bulk rows never cross the WAN. App containers stay disposable; Postgres
          data and TLS certs live on host volumes.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="LAN" label="Bulk extract / ingest / export" tone="success" />
        <Stat value="WAN" label="Auth + metadata only" tone="info" />
        <Stat value="2" label="Docker services that matter" />
        <Stat value="1" label="Volume that must be backed up" tone="warning" />
      </Grid>

      <Callout tone="info" title="Bandwidth rule">
        This layout only keeps large payloads off the internet if Nitro and the
        warehouse Postgres sit on the same LAN as the source and destination
        systems. Cloud Nitro writing to on-site Postgres still ships every row
        across the WAN.
      </Callout>

      <Row gap={8} wrap>
        <Pill active={view === "topology"} onClick={() => setView("topology")}>
          Deployment topology
        </Pill>
        <Pill active={view === "datapath"} onClick={() => setView("datapath")}>
          One migration run
        </Pill>
        <Pill active={view === "volumes"} onClick={() => setView("volumes")}>
          Docker and volumes
        </Pill>
      </Row>

      {view === "topology" ? <TopologyView /> : null}
      {view === "datapath" ? <DataPathView /> : null}
      {view === "volumes" ? <VolumesView /> : null}

      <H2>What stays where</H2>
      <Table
        headers={["Layer", "Location", "Traffic", "Durable data"]}
        striped
        rows={[
          [
            "Browser (SSR UI + Auth JS)",
            "User device / VPN",
            "HTTPS to Nitro; Auth to supabase.co",
            "Session in browser only",
          ],
          [
            "Reverse proxy",
            "On-prem Docker",
            "TLS termination to Nitro",
            "Certs on host volume",
          ],
          [
            "Nitro (.output/server)",
            "On-prem Docker",
            "Hub for every API and connector",
            "None (optional ./exports)",
          ],
          [
            "ingest.* + staged.batches",
            "On-prem Postgres container",
            "LAN only from Nitro",
            "Host pgdata volume",
          ],
          [
            "Auth, orgs, connections, licences",
            "Hosted Supabase",
            "Small JSON over WAN",
            "Supabase-managed Postgres",
          ],
          [
            "Source / destination systems",
            "Customer LAN or vendor APIs",
            "From Nitro; bulk if on-site",
            "Those systems’ own storage",
          ],
        ]}
      />

      <CollapsibleSection title="Operational constraints">
        <Stack gap={8}>
          <Text>
            One Nitro replica is the simple model. Extra replicas need a shared
            warehouse Postgres and care with concurrent replace/append on the
            same ingest table.
          </Text>
          <Text>
            Bake connector drivers into the image. Do not enable
            `ALLOW_PLATFORM_DRIVER_INSTALL` in production. Oracle Instant Client
            belongs in that same image if Oracle is required.
          </Text>
          <Text>
            Fully air-gapped operation is not this design: login and control-plane
            RPCs still need egress to hosted Supabase unless Auth is self-hosted
            later.
          </Text>
        </Stack>
      </CollapsibleSection>
    </Stack>
  );
}

function TopologyView() {
  const theme = useHostTheme();

  return (
    <Stack gap={12}>
      <Text tone="secondary" size="small">
        Solid accent lines are LAN bulk paths. Dashed lines are small WAN
        control-plane calls. Nitro is the only process that talks to both
        databases.
      </Text>
      <svg
        viewBox="0 0 1100 720"
        width="100%"
        role="img"
        aria-label="On-prem Docker host, LAN systems, and hosted Supabase"
        style={{ display: "block" }}
      >
        <defs>
          <marker
            id="arr-accent"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={theme.accent.primary} />
          </marker>
          <marker
            id="arr-muted"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={theme.stroke.secondary} />
          </marker>
        </defs>

        <rect
          x="8"
          y="8"
          width="724"
          height="704"
          fill={theme.fill.tertiary}
          stroke={theme.stroke.tertiary}
          rx="6"
        />
        <text x="24" y="32" fill={theme.text.tertiary} fontSize="11" fontWeight="600">
          ON-PREM SITE (LAN / VPN)
        </text>

        <rect
          x="748"
          y="8"
          width="344"
          height="704"
          fill={theme.bg.chrome}
          stroke={theme.stroke.tertiary}
          rx="6"
        />
        <text x="764" y="32" fill={theme.text.tertiary} fontSize="11" fontWeight="600">
          WAN / CLOUD
        </text>

        <Box
          x="24"
          y="48"
          w="200"
          h="64"
          title="Users"
          lines={["Browser", "intranet or VPN"]}
          fill={theme.bg.elevated}
          stroke={theme.stroke.secondary}
          text={theme.text.primary}
          muted={theme.text.tertiary}
        />

        <rect
          x="24"
          y="132"
          width="420"
          height="560"
          fill={theme.bg.editor}
          stroke={theme.stroke.secondary}
          rx="5"
        />
        <text x="40" y="156" fill={theme.text.secondary} fontSize="11" fontWeight="600">
          DOCKER HOST
        </text>
        <text x="40" y="172" fill={theme.text.quaternary} fontSize="10">
          compose network — Postgres not published to internet
        </text>

        <Box
          x="40"
          y="188"
          w="240"
          h="70"
          title="proxy"
          lines={["Caddy / nginx / Traefik", "TLS termination"]}
          fill={theme.bg.elevated}
          stroke={theme.stroke.secondary}
          text={theme.text.primary}
          muted={theme.text.tertiary}
        />
        <VolumeTag
          x="292"
          y="204"
          label="certs/"
          fill={theme.fill.secondary}
          stroke={theme.stroke.tertiary}
          text={theme.text.secondary}
        />

        <Box
          x="40"
          y="280"
          w="240"
          h="118"
          title="nitro"
          lines={[
            "Nuxt .output/server",
            "SSR + /api/* + connectors",
            "stateless app container",
          ]}
          fill={theme.fill.primary}
          stroke={theme.accent.primary}
          text={theme.text.primary}
          muted={theme.text.secondary}
          emphasis
        />
        <VolumeTag
          x="292"
          y="300"
          label="env / secrets"
          fill={theme.fill.secondary}
          stroke={theme.stroke.tertiary}
          text={theme.text.secondary}
        />
        <VolumeTag
          x="292"
          y="336"
          label="exports/ (opt.)"
          fill={theme.fill.secondary}
          stroke={theme.stroke.tertiary}
          text={theme.text.secondary}
        />

        <Box
          x="40"
          y="424"
          w="240"
          h="118"
          title="postgres-ingest"
          lines={[
            "ingest.<tables>",
            "staged.batches",
            "no Auth / no public schema",
          ]}
          fill={theme.bg.elevated}
          stroke={theme.stroke.primary}
          text={theme.text.primary}
          muted={theme.text.tertiary}
        />
        <VolumeTag
          x="292"
          y="456"
          label="pgdata  ← backup"
          fill={theme.fill.secondary}
          stroke={theme.accent.primary}
          text={theme.text.primary}
        />

        <text x="40" y="572" fill={theme.text.quaternary} fontSize="10">
          Image includes baked drivers (mysql2, pg, mssql, s3, sftp…)
        </text>
        <text x="40" y="588" fill={theme.text.quaternary} fontSize="10">
          Oracle Instant Client in the same image if needed
        </text>
        <text x="40" y="660" fill={theme.text.tertiary} fontSize="10">
          Restarting nitro or postgres containers does not
        </text>
        <text x="40" y="676" fill={theme.text.tertiary} fontSize="10">
          drop warehouse rows if pgdata is a host volume.
        </text>

        <rect
          x="460"
          y="132"
          width="256"
          height="560"
          fill={theme.bg.editor}
          stroke={theme.stroke.secondary}
          rx="5"
        />
        <text x="476" y="156" fill={theme.text.secondary} fontSize="11" fontWeight="600">
          LAN SYSTEMS
        </text>
        <text x="476" y="172" fill={theme.text.quaternary} fontSize="10">
          reached only by Nitro, not by the browser
        </text>

        <Box
          x="476"
          y="188"
          w="224"
          h="150"
          title="Sources (inbound)"
          lines={[
            "MySQL / MariaDB",
            "Postgres / MSSQL / Oracle",
            "Mongo / Elasticsearch",
            "S3, SFTP, REST, CSV/JSON",
          ]}
          fill={theme.bg.elevated}
          stroke={theme.stroke.secondary}
          text={theme.text.primary}
          muted={theme.text.tertiary}
        />
        <Box
          x="476"
          y="360"
          w="224"
          h="150"
          title="Destinations (outbound)"
          lines={[
            "Same connector set",
            "Nitro writes after transform",
            "dual-sink: ingest + export",
          ]}
          fill={theme.bg.elevated}
          stroke={theme.stroke.secondary}
          text={theme.text.primary}
          muted={theme.text.tertiary}
        />

        <Box
          x="764"
          y="48"
          w="312"
          h="88"
          title="Supabase Auth"
          lines={["Login, session, MFA (aal2)", "browser talks here directly"]}
          fill={theme.bg.elevated}
          stroke={theme.stroke.secondary}
          text={theme.text.primary}
          muted={theme.text.tertiary}
        />
        <Box
          x="764"
          y="156"
          w="312"
          h="150"
          title="Supabase Postgres (control plane)"
          lines={[
            "organizations, roles, licences",
            "connections + encrypted secrets",
            "data_sources, pipelines, runs",
            "migration_projects (metadata)",
          ]}
          fill={theme.bg.elevated}
          stroke={theme.stroke.secondary}
          text={theme.text.primary}
          muted={theme.text.tertiary}
        />
        <Box
          x="764"
          y="326"
          w="312"
          h="88"
          title="Optional LLM"
          lines={["Gemini / OpenAI", "connector-type assist only"]}
          fill={theme.bg.elevated}
          stroke={theme.stroke.secondary}
          text={theme.text.primary}
          muted={theme.text.tertiary}
        />
        <text x="764" y="450" fill={theme.text.tertiary} fontSize="10">
          Not dockerized on-site. Do not put ingest.* here.
        </text>
        <text x="764" y="468" fill={theme.text.tertiary} fontSize="10">
          Self-hosting full Supabase is a separate, larger stack.
        </text>

        <Arrow
          x1="224"
          y1="80"
          x2="160"
          y2="188"
          color={theme.accent.primary}
          marker="arr-accent"
          label="HTTPS"
          labelFill={theme.text.tertiary}
        />
        <path
          d="M160 258 L160 280"
          fill="none"
          stroke={theme.accent.primary}
          strokeWidth="2"
          markerEnd="url(#arr-accent)"
        />
        <path
          d="M160 398 L160 424"
          fill="none"
          stroke={theme.accent.primary}
          strokeWidth="2.5"
          markerEnd="url(#arr-accent)"
        />
        <text x="168" y="416" fill={theme.text.tertiary} fontSize="9">
          bulk rows
        </text>

        <path
          d="M280 339 L476 263"
          fill="none"
          stroke={theme.accent.primary}
          strokeWidth="2.5"
          markerEnd="url(#arr-accent)"
        />
        <path
          d="M280 355 L476 435"
          fill="none"
          stroke={theme.accent.primary}
          strokeWidth="2.5"
          markerEnd="url(#arr-accent)"
        />
        <text x="330" y="328" fill={theme.text.tertiary} fontSize="9">
          inbound
        </text>
        <text x="330" y="400" fill={theme.text.tertiary} fontSize="9">
          outbound
        </text>

        <path
          d="M224 80 C 500 20, 700 40, 764 92"
          fill="none"
          stroke={theme.stroke.secondary}
          strokeWidth="1.5"
          strokeDasharray="5 4"
          markerEnd="url(#arr-muted)"
        />
        <text x="520" y="36" fill={theme.text.tertiary} fontSize="9">
          login / session (small)
        </text>

        <path
          d="M280 320 C 560 300, 680 240, 764 220"
          fill="none"
          stroke={theme.stroke.secondary}
          strokeWidth="1.5"
          strokeDasharray="5 4"
          markerEnd="url(#arr-muted)"
        />
        <text x="560" y="268" fill={theme.text.tertiary} fontSize="9">
          metadata / secrets / licences
        </text>

        <path
          d="M280 310 C 560 340, 680 360, 764 370"
          fill="none"
          stroke={theme.stroke.secondary}
          strokeWidth="1.25"
          strokeDasharray="5 4"
          markerEnd="url(#arr-muted)"
        />
      </svg>
    </Stack>
  );
}

function DataPathView() {
  const theme = useHostTheme();
  const layout = computeDAGLayout({
    direction: "vertical",
    nodeWidth: 200,
    nodeHeight: 52,
    rankGap: 56,
    nodeGap: 36,
    padding: 16,
    nodes: [
      { id: "operator" },
      { id: "nitro" },
      { id: "source" },
      { id: "transform" },
      { id: "ingest" },
      { id: "stage" },
      { id: "dest" },
      { id: "control" },
    ],
    edges: [
      { from: "operator", to: "nitro" },
      { from: "nitro", to: "source" },
      { from: "source", to: "transform" },
      { from: "transform", to: "ingest" },
      { from: "transform", to: "stage" },
      { from: "stage", to: "dest" },
      { from: "nitro", to: "control" },
    ],
  });

  const labels: Record<string, { title: string; sub: string; zone: string }> = {
    operator: { title: "Operator", sub: "Run migration / data flow", zone: "User" },
    nitro: { title: "Nitro on-prem", sub: "executeDataSource()", zone: "LAN" },
    source: { title: "Inbound connector", sub: "SELECT / GET / GetObject", zone: "LAN bulk" },
    transform: { title: "Pipeline", sub: "Filter / map / dual-sink", zone: "Nitro memory" },
    ingest: { title: "ingest.*", sub: "Raw + mapped warehouse", zone: "Local Postgres" },
    stage: { title: "staged.batches", sub: "Bounded export buffer", zone: "Local Postgres" },
    dest: { title: "Outbound connector", sub: "INSERT / PUT / upload", zone: "LAN bulk" },
    control: { title: "Hosted Supabase", sub: "run row, sync_state", zone: "WAN small" },
  };

  return (
    <Stack gap={12}>
      <Text tone="secondary" size="small">
        Hybrid model on this topology: raw always lands in local ingest; mapped
        rows dual-sink to local ingest and outbound. Hosted Supabase only records
        that the run happened.
      </Text>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height + 8}`}
        width="100%"
        role="img"
        aria-label="Data path for one hybrid migration run"
        style={{ display: "block" }}
      >
        {layout.edges.map((e) => {
          const wan = e.to === "control" || e.from === "control";
          return (
            <line
              key={`${e.from}-${e.to}`}
              x1={e.sourceX}
              y1={e.sourceY}
              x2={e.targetX}
              y2={e.targetY}
              stroke={wan ? theme.stroke.secondary : theme.accent.primary}
              strokeWidth={wan ? 1.5 : 2}
              strokeDasharray={wan ? "5 4" : undefined}
            />
          );
        })}
        {layout.nodes.map((n) => {
          const meta = labels[n.id];
          const wan = n.id === "control";
          return (
            <g key={n.id}>
              <rect
                x={n.x}
                y={n.y}
                width={200}
                height={52}
                rx="4"
                fill={n.id === "nitro" ? theme.fill.primary : theme.bg.elevated}
                stroke={wan ? theme.stroke.secondary : theme.accent.primary}
              />
              <text
                x={n.x + 10}
                y={n.y + 18}
                fill={theme.text.primary}
                fontSize="12"
                fontWeight="600"
              >
                {meta.title}
              </text>
              <text x={n.x + 10} y={n.y + 34} fill={theme.text.tertiary} fontSize="10">
                {meta.sub}
              </text>
              <text x={n.x + 10} y={n.y + 46} fill={theme.text.quaternary} fontSize="9">
                {meta.zone}
              </text>
            </g>
          );
        })}
      </svg>
      <Table
        headers={["Step", "Where bytes move", "Crosses internet?"]}
        striped
        rows={[
          ["1. Operator starts a run", "Browser → Nitro API", "Only if user is off-site"],
          [
            "2. Inbound retrieve",
            "Source system → Nitro memory",
            "No, if source is on LAN",
          ],
          ["3. Transform / map", "Inside Nitro process", "No"],
          [
            "4. ingest_append / replace",
            "Nitro → local ingest.*",
            "No",
          ],
          [
            "5. staged_append then outbound write",
            "Nitro → staged.* → destination",
            "No, if destination is on LAN",
          ],
          [
            "6. Run status + licence counters",
            "Nitro → hosted public tables",
            "Yes — row counts / timestamps, not payloads",
          ],
        ]}
      />
      <Text size="small" tone="tertiary">
        Reports and dashboards follow the same rule: Nitro reads local ingest,
        then returns a page of results. The browser never queries ingest.*
        directly.
      </Text>
    </Stack>
  );
}

function VolumesView() {
  return (
    <Stack gap={16}>
      <Text tone="secondary">
        Conceptual Compose shape. Data that must survive `docker compose down`
        lives on the host, not in a container writable layer.
      </Text>

      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill size="sm" active>stateless</Pill>}>
            nitro
          </CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small">
                Image: Node 22/24 + `nuxt build` output + baked drivers.
              </Text>
              <Text size="small">
                Command: `node .output/server/index.mjs`
              </Text>
              <Text size="small">
                Mounts: env/secrets file; optional `./exports` for CSV/JSON
                `localPath`.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill size="sm" active>stateful</Pill>}>
            postgres-ingest
          </CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small">
                Image: official Postgres. Schemas `ingest` and `staged` only.
              </Text>
              <Text size="small">
                Mount: host `./pgdata` or named volume → `/var/lib/postgresql/data`.
              </Text>
              <Text size="small">
                Publish 5432 only on the compose network, not to the internet.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H2>Host mounts</H2>
      <Table
        headers={["Volume / bind", "Container path", "Keep outside Docker?", "Why"]}
        striped
        rows={[
          [
            "./pgdata",
            "/var/lib/postgresql/data",
            "Required",
            "Warehouse rows; the only backup target that matters",
          ],
          [
            "./certs",
            "proxy cert/key paths",
            "Required if you terminate TLS",
            "Certificates survive proxy rebuilds",
          ],
          [
            "./secrets.env",
            "env_file on nitro",
            "Required",
            "SUPABASE_SECRET_KEY, CONNECTOR_SECRETS_KEY, future INGEST_DATABASE_URL",
          ],
          [
            "./exports",
            "/var/lib/zorro/exports",
            "Optional",
            "Only if outbound CSV/JSON uses destMode localPath",
          ],
          [
            "logs",
            "stdout or ./logs",
            "Optional",
            "Prefer journald/stdout; bind-mount if you need files",
          ],
          [
            "node_modules / .output",
            "inside image",
            "No",
            "Bake into the image; do not npm-install at runtime",
          ],
        ]}
      />

      <Callout tone="warning" title="Do not volume these">
        Connection credentials stay encrypted in hosted `connection_secrets`.
        Do not copy ingest tables into the Nitro image. Do not use
        `docker commit` as a backup of Postgres.
      </Callout>

      <H2>What is not a Docker service here</H2>
      <Table
        headers={["Component", "Run as Docker on-site?", "Notes"]}
        rows={[
          ["Hosted Supabase (Auth + control plane)", "No", "SaaS; small WAN calls from Nitro and browser"],
          ["Self-hosted full Supabase", "Possible later", "Many containers; still keep ingest on a separate volume"],
          ["Redis / queue / cron", "Not used", "Runs are API-driven today"],
          ["Source MySQL / SFTP / S3", "Only if those systems already are", "Their data volumes are theirs"],
          ["Oracle Instant Client", "In the Nitro image", "Native libs, not a data volume"],
        ]}
      />
    </Stack>
  );
}

function Box({
  x,
  y,
  w,
  h,
  title,
  lines,
  fill,
  stroke,
  text,
  muted,
  emphasis,
}: {
  x: number | string;
  y: number | string;
  w: number | string;
  h: number | string;
  title: string;
  lines: string[];
  fill: string;
  stroke: string;
  text: string;
  muted: string;
  emphasis?: boolean;
}) {
  const px = Number(x);
  const py = Number(y);
  return (
    <g>
      <rect x={px} y={py} width={Number(w)} height={Number(h)} rx="4" fill={fill} stroke={stroke} strokeWidth={emphasis ? 2 : 1} />
      <text x={px + 12} y={py + 20} fill={text} fontSize="12" fontWeight="600">
        {title}
      </text>
      {lines.map((line, i) => (
        <text key={line} x={px + 12} y={py + 38 + i * 14} fill={muted} fontSize="10">
          {line}
        </text>
      ))}
    </g>
  );
}

function VolumeTag({
  x,
  y,
  label,
  fill,
  stroke,
  text,
}: {
  x: number | string;
  y: number | string;
  label: string;
  fill: string;
  stroke: string;
  text: string;
}) {
  const px = Number(x);
  const py = Number(y);
  return (
    <g>
      <rect x={px} y={py} width="132" height="28" rx="3" fill={fill} stroke={stroke} />
      <text x={px + 8} y={py + 18} fill={text} fontSize="10">
        {label}
      </text>
    </g>
  );
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
  color,
  marker,
  label,
  labelFill,
}: {
  x1: number | string;
  y1: number | string;
  x2: number | string;
  y2: number | string;
  color: string;
  marker: string;
  label?: string;
  labelFill?: string;
}) {
  const ax1 = Number(x1);
  const ay1 = Number(y1);
  const ax2 = Number(x2);
  const ay2 = Number(y2);
  return (
    <g>
      <line
        x1={ax1}
        y1={ay1}
        x2={ax2}
        y2={ay2}
        stroke={color}
        strokeWidth="2"
        markerEnd={`url(#${marker})`}
      />
      {label ? (
        <text x={(ax1 + ax2) / 2 + 8} y={(ay1 + ay2) / 2} fill={labelFill} fontSize="9">
          {label}
        </text>
      ) : null}
    </g>
  );
}
