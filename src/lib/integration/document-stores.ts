// Connected document stores: Microsoft SharePoint and OneDrive (Microsoft Graph) and
// Google Drive (Drive API v3) — official APIs with an access token the company authorised.
// Management browses and selects specific files or folders; nothing is crawled or ingested
// automatically. Untested against live tenants (no credentials in this environment).
export interface StoreItem {
  id: string;
  name: string;
  kind: "folder" | "file";
  size: number | null;
  mime: string | null;
  modified: string | null;
}
export type StoreProvider = "sharepoint" | "onedrive" | "google_drive";

export class StoreError extends Error {}

async function call(url: string, token: string) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 401 || res.status === 403) throw new StoreError("The connection's access token was rejected — reconnect it in Agents → Configuration.");
  if (res.status === 429) throw new StoreError("The document store is rate limiting requests; try again shortly.");
  if (!res.ok) throw new StoreError(`The document store responded ${res.status}.`);
  return res;
}

const graphBase = (provider: StoreProvider, config: Record<string, unknown>) =>
  provider === "sharepoint" && typeof config.site_id === "string" ? `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(config.site_id)}/drive` : "https://graph.microsoft.com/v1.0/me/drive";

export async function listStore(provider: StoreProvider, token: string, config: Record<string, unknown>, folderId?: string | null): Promise<StoreItem[]> {
  if (provider === "google_drive") {
    const q = encodeURIComponent(`'${(folderId ?? "root").replace(/'/g, "")}' in parents and trashed = false`);
    const res = await call(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=200&fields=files(id,name,mimeType,size,modifiedTime)`, token);
    const body = (await res.json()) as { files?: Array<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }> };
    return (body.files ?? []).map((f) => ({ id: f.id, name: f.name, kind: f.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file", size: f.size ? Number(f.size) : null, mime: f.mimeType, modified: f.modifiedTime ?? null }));
  }
  const base = graphBase(provider, config);
  const res = await call(`${base}/${folderId ? `items/${encodeURIComponent(folderId)}` : "root"}/children?$top=200&$select=id,name,size,folder,file,lastModifiedDateTime`, token);
  const body = (await res.json()) as { value?: Array<{ id: string; name: string; size?: number; folder?: unknown; file?: { mimeType?: string }; lastModifiedDateTime?: string }> };
  return (body.value ?? []).map((f) => ({ id: f.id, name: f.name, kind: f.folder ? "folder" : "file", size: f.size ?? null, mime: f.file?.mimeType ?? null, modified: f.lastModifiedDateTime ?? null }));
}

const GOOGLE_EXPORT: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ".docx" },
  "application/vnd.google-apps.presentation": { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: ".pptx" },
  "application/vnd.google-apps.spreadsheet": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ".xlsx" },
};

export async function downloadFromStore(provider: StoreProvider, token: string, config: Record<string, unknown>, item: StoreItem, maxBytes: number): Promise<{ bytes: Uint8Array; filename: string; mime: string | null }> {
  if (item.size && item.size > maxBytes) throw new StoreError(`${item.name} is larger than the upload limit.`);
  let res: Response;
  let filename = item.name;
  let mime = item.mime;
  if (provider === "google_drive") {
    const exp = item.mime ? GOOGLE_EXPORT[item.mime] : undefined;
    if (exp) {
      res = await call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}/export?mimeType=${encodeURIComponent(exp.mime)}`, token);
      filename = `${item.name}${exp.ext}`;
      mime = exp.mime;
    } else res = await call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media`, token);
  } else res = await call(`${graphBase(provider, config)}/items/${encodeURIComponent(item.id)}/content`, token);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new StoreError(`${item.name} is larger than the upload limit.`);
  return { bytes: buf, filename, mime };
}
