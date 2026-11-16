import type { ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`}>{token.slice(2, -2)}</strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={`${keyPrefix}-c-${i}`}>{token.slice(1, -1)}</code>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const href = link[2];
        const external = href.startsWith("http");
        nodes.push(
          <a
            key={`${keyPrefix}-a-${i}`}
            href={href}
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {link[1]}
          </a>,
        );
      }
    }
    last = m.index + token.length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function stripMd(text: string): string {
  return text.replace(/\*\*/g, "").replace(/`/g, "");
}

type Options = {
  /** Skip the first H1 (page hero already shows the title) */
  skipFirstH1?: boolean;
};

/** Minimal markdown renderer for the handbook page (no extra deps). */
export function SimpleMarkdown({
  source,
  skipFirstH1 = false,
}: {
  source: string;
  skipFirstH1?: boolean;
}) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  let sawH1 = false;
  const opts: Options = { skipFirstH1 };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (line.trim() === "---") {
      i += 1;
      continue;
    }

    // Callouts: > **Critical:** / > **Note:** / > **OK:**
    if (line.trim().startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      const text = quote.join(" ").trim();
      let kind = "callout";
      let label = "Note";
      let body = text;
      const m = text.match(/^\*\*(Critical|Note|OK):\*\*\s*(.*)$/i);
      if (m) {
        const tag = m[1].toLowerCase();
        label = m[1];
        body = m[2];
        if (tag === "critical") kind = "callout warn";
        else if (tag === "ok") kind = "callout ok";
        else kind = "callout";
      }
      blocks.push(
        <div className={kind} key={`co-${key++}`}>
          <strong className="label">{label}</strong>
          <div>{inline(body, `co-${key}`)}</div>
        </div>,
      );
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre key={`pre-${key++}`} data-lang={lang || undefined}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      if (level === 1 && opts.skipFirstH1 && !sawH1) {
        sawH1 = true;
        i += 1;
        // Also skip the lede paragraph right under H1 if present — hero shows it
        continue;
      }
      if (level === 1) sawH1 = true;
      const id = slugify(stripMd(text));
      const kids = inline(text, `h-${key}`);
      if (level === 1) blocks.push(<h1 key={`h-${key++}`} id={id}>{kids}</h1>);
      else if (level === 2)
        blocks.push(
          <h2 key={`h-${key++}`} id={id}>
            {kids}
          </h2>,
        );
      else
        blocks.push(
          <h3 key={`h-${key++}`} id={id}>
            {kids}
          </h3>,
        );
      i += 1;
      continue;
    }

    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const raw = lines[i].trim();
        const cells = raw
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        const isSeparator = cells.every((c) => /^:?-{3,}:?$/.test(c));
        if (!isSeparator) rows.push(cells);
        i += 1;
      }
      if (rows.length) {
        const [head, ...body] = rows;
        blocks.push(
          <div className="md-table-wrap" key={`table-${key++}`}>
            <table>
              <thead>
                <tr>
                  {head.map((c, idx) => (
                    <th key={idx}>{inline(c, `th-${key}-${idx}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((c, cIdx) => (
                      <td key={cIdx}>
                        {inline(c, `td-${key}-${rIdx}-${cIdx}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    if (/^\d+\.\s+/.test(line) || /^[-*]\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        (ordered ? /^\d+\.\s+/.test(lines[i]) : /^[-*]\s+/.test(lines[i]))
      ) {
        items.push(lines[i].replace(/^\d+\.\s+|^[-*]\s+/, ""));
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={`list-${key++}`}>
          {items.map((item, idx) => (
            <li key={idx}>{inline(item, `li-${key}-${idx}`)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].trim().startsWith("|") &&
      !lines[i].trim().startsWith(">") &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      lines[i].trim() !== "---"
    ) {
      para.push(lines[i]);
      i += 1;
    }

    blocks.push(
      <p key={`p-${key++}`}>{inline(para.join(" "), `p-${key}`)}</p>,
    );
  }

  // Drop leading lede <p> when hero already shows it
  let out = blocks;
  if (skipFirstH1 && out.length) {
    const first = out[0] as { type?: unknown };
    if (first?.type === "p") out = out.slice(1);
  }

  return <>{out}</>;
}
