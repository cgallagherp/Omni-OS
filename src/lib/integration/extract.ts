// Document ingestion: text and structure from PDFs, Word, PowerPoint and Excel files
// (Office Open XML), plus plain text, Markdown and CSV. Output keeps headings ("# …"),
// list items ("- …") and table rows ("a | b | c") so analysis can see the structure.
// Content is data: nothing extracted here is ever treated as an instruction.
import { createHash } from "node:crypto";
import JSZip from "jszip";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export type Extracted =
  | { status: "ready"; text: string; pages: string[] | null; pageCount: number | null }
  | { status: "unsupported" | "failed"; error: string };

const LEGACY = /\.(doc|ppt|xls|rtf|pages|key|numbers)$/i;

export function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function kindOf(filename: string, mime?: string | null): "pdf" | "docx" | "pptx" | "xlsx" | "text" | null {
  const f = filename.toLowerCase();
  if (f.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (f.endsWith(".docx")) return "docx";
  if (f.endsWith(".pptx")) return "pptx";
  if (f.endsWith(".xlsx")) return "xlsx";
  if (/\.(txt|md|markdown|csv)$/.test(f) || mime?.startsWith("text/")) return "text";
  return null;
}

export async function extractDocument(bytes: Uint8Array, filename: string, mime?: string | null): Promise<Extracted> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { status: "failed", error: `File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` };
  const kind = kindOf(filename, mime);
  if (!kind) {
    return {
      status: "unsupported",
      error: LEGACY.test(filename) ? "Legacy Office format — save it as .docx, .pptx or .xlsx (or PDF) and upload again" : "Unsupported file type — upload PDF, Word, PowerPoint, Excel, text, Markdown or CSV",
    };
  }
  try {
    let pages: string[] | null = null;
    let text: string;
    if (kind === "pdf") {
      const { getDocumentProxy, extractText } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const r = await extractText(pdf, { mergePages: false });
      pages = r.text.map((p) => tidy(p));
      text = pages.map((p, i) => `# Page ${i + 1}\n${p}`).join("\n\n");
    } else if (kind === "docx") text = await docx(bytes);
    else if (kind === "pptx") {
      pages = await pptx(bytes);
      text = pages.join("\n\n");
    } else if (kind === "xlsx") text = await xlsx(bytes);
    else text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    text = tidy(text);
    if (text.replace(/[#\-|\s]/g, "").length < 20) return { status: "failed", error: "No readable text found (a scanned document may need OCR first)" };
    return { status: "ready", text, pages, pageCount: pages?.length ?? null };
  } catch (e) {
    return { status: "failed", error: `Could not read the file: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
  }
}

const tidy = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const texts = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?: [^>]*)?>([^<]*)</${tag}>`, "g"))].map((m) => decode(m[1])).join("");

async function docx(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("not a Word document");
  const body = xml.split("<w:body>")[1] ?? xml;
  const out: string[] = [];
  // tables first become rows; paragraphs outside tables keep heading/list markers
  for (const block of body.split(/(?=<w:tbl>)|(?<=<\/w:tbl>)/)) {
    if (block.startsWith("<w:tbl>")) {
      for (const row of block.split("</w:tr>")) {
        const cells = row.split("</w:tc>").map((c) => texts(c, "w:t").trim()).filter(Boolean);
        if (cells.length) out.push(cells.join(" | "));
      }
      continue;
    }
    for (const p of block.split("</w:p>")) {
      const t = texts(p, "w:t").trim();
      if (!t) continue;
      const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
      const level = style.match(/^(?:Heading|heading)(\d)/)?.[1] ?? (style === "Title" ? "1" : null);
      if (level) out.push(`${"#".repeat(Math.min(3, Number(level)))} ${t}`);
      else if (p.includes("<w:numPr>") || /List/i.test(style)) out.push(`- ${t}`);
      else out.push(t);
    }
  }
  return out.join("\n");
}

async function pptx(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  const pages: string[] = [];
  for (const [i, f] of slides.entries()) {
    const xml = await zip.file(f)!.async("string");
    const paras = xml.split("</a:p>").map((p) => texts(p, "a:t").trim()).filter(Boolean);
    const [title, ...rest] = paras;
    pages.push([`# Slide ${i + 1}: ${title ?? ""}`.trim(), ...rest.map((r) => `- ${r}`)].join("\n"));
  }
  return pages;
}

async function xlsx(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const shared = await zip.file("xl/sharedStrings.xml")?.async("string");
  const strings = shared ? shared.split("</si>").slice(0, -1).map((si) => texts(si, "t")) : [];
  const wb = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const names = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => decode(m[1]));
  const sheets = Object.keys(zip.files)
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  const out: string[] = [];
  for (const [i, f] of sheets.entries()) {
    const xml = await zip.file(f)!.async("string");
    out.push(`# Sheet: ${names[i] ?? `Sheet ${i + 1}`}`);
    for (const row of xml.split("</row>")) {
      const cells = [...row.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(([, attrs, inner]) => {
        if (!inner) return "";
        const v = inner.match(/<v>([^<]*)<\/v>/)?.[1];
        if (/t="s"/.test(attrs)) return strings[Number(v)] ?? "";
        if (/t="inlineStr"/.test(attrs)) return texts(inner, "t");
        return v ? decode(v) : "";
      });
      const vals = cells.map((c) => c.trim());
      if (vals.some(Boolean)) out.push(vals.join(" | "));
    }
  }
  return out.join("\n");
}

export interface Chunk {
  ordinal: number;
  heading: string | null;
  text: string;
  page: number | null;
  charStart: number;
  charEnd: number;
}

/** Split into retrievable passages (about 1,200 characters) that keep their section heading. */
export function chunkText(text: string, maxChars = 1200): Chunk[] {
  const chunks: Chunk[] = [];
  let heading: string | null = null;
  let page: number | null = null;
  let buf: string[] = [];
  let start = 0;
  let pos = 0;
  let bufStart = 0;
  const flush = () => {
    const t = buf.join("\n").trim();
    if (t) chunks.push({ ordinal: chunks.length, heading, text: t, page, charStart: bufStart, charEnd: pos });
    buf = [];
  };
  for (const line of text.split("\n")) {
    start = pos;
    pos += line.length + 1;
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      const pg = h[2].match(/^(?:Page|Slide) (\d+)/);
      if (pg) page = Number(pg[1]);
      heading = h[2].trim();
      bufStart = pos;
      continue;
    }
    if (!buf.length) bufStart = start;
    if (buf.join("\n").length + line.length > maxChars) {
      flush();
      bufStart = start;
    }
    buf.push(line);
  }
  flush();
  return chunks;
}
