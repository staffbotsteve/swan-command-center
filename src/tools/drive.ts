import { defineTool } from "./registry";
import { getPrimaryGoogleAccessToken } from "@/lib/google-tokens";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

async function driveFetch<T = unknown>(path: string, init?: RequestInit, base = API): Promise<T> {
  const token = await getPrimaryGoogleAccessToken();
  const res = await fetch(base + path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`drive ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

// ─── drive.list_files ───────────────────────────────────────────────────────

export interface DriveListFilesInput {
  query?: string;
  page_size?: number;
}

export const listFiles = defineTool<DriveListFilesInput, unknown>({
  name: "drive.list_files",
  description:
    'List or search Drive files. query uses Drive search syntax (e.g. "name contains \'Q2\' and mimeType=\'application/pdf\'"). page_size 1-100.',
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      page_size: { type: "integer", minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  },
  async handler({ query, page_size = 25 }) {
    const params = new URLSearchParams({
      pageSize: String(page_size),
      fields: "files(id,name,mimeType,createdTime,modifiedTime,webViewLink,owners(emailAddress)),nextPageToken",
    });
    if (query) params.set("q", query);
    return driveFetch(`/files?${params}`);
  },
});

// ─── drive.read_file ────────────────────────────────────────────────────────

export interface DriveReadFileInput {
  file_id: string;
  export_mime_type?: string;
  max_chars?: number;
}

interface DriveReadFileOutput {
  id: string;
  name: string;
  mime_type: string;
  text: string;
  truncated: boolean;
}

export const readFile = defineTool<DriveReadFileInput, DriveReadFileOutput>({
  name: "drive.read_file",
  description:
    "Read a Drive file's text content. Google Docs are exported as text/plain by default; override with export_mime_type for other formats. Cap text at max_chars (default 50k).",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      file_id: { type: "string" },
      export_mime_type: { type: "string" },
      max_chars: { type: "integer", minimum: 1000, maximum: 500_000 },
    },
    required: ["file_id"],
    additionalProperties: false,
  },
  async handler({ file_id, export_mime_type, max_chars = 50_000 }) {
    const token = await getPrimaryGoogleAccessToken();

    // Get metadata first
    const metaRes = await fetch(
      `${API}/files/${encodeURIComponent(file_id)}?fields=id,name,mimeType`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaRes.ok) throw new Error(`drive metadata: ${metaRes.status}`);
    const meta = (await metaRes.json()) as { id: string; name: string; mimeType: string };

    let downloadUrl: string;
    let effectiveMime = meta.mimeType;

    if (meta.mimeType.startsWith("application/vnd.google-apps")) {
      const exportTo = export_mime_type ?? "text/plain";
      effectiveMime = exportTo;
      downloadUrl = `${API}/files/${encodeURIComponent(file_id)}/export?mimeType=${encodeURIComponent(exportTo)}`;
    } else {
      downloadUrl = `${API}/files/${encodeURIComponent(file_id)}?alt=media`;
    }

    const dlRes = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!dlRes.ok) throw new Error(`drive download: ${dlRes.status} ${(await dlRes.text()).slice(0, 200)}`);

    const text = await dlRes.text();
    const truncated = text.length > max_chars;
    return {
      id: meta.id,
      name: meta.name,
      mime_type: effectiveMime,
      text: truncated ? text.slice(0, max_chars) : text,
      truncated,
    };
  },
});

// ─── drive.write_file ───────────────────────────────────────────────────────

export interface DriveWriteFileInput {
  name: string;
  content: string;
  parent_folder_id?: string;
  mime_type?: string;
}

export const writeFile = defineTool<DriveWriteFileInput, unknown>({
  name: "drive.write_file",
  description:
    "Create a new file in Drive with the given text content. Defaults to text/plain. parent_folder_id optional (defaults to root or app folder).",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      content: { type: "string" },
      parent_folder_id: { type: "string" },
      mime_type: { type: "string" },
    },
    required: ["name", "content"],
    additionalProperties: false,
  },
  async handler({ name, content, parent_folder_id, mime_type = "text/plain" }) {
    const token = await getPrimaryGoogleAccessToken();
    const boundary = "swan-" + Math.random().toString(36).slice(2);
    const metadata: Record<string, unknown> = { name, mimeType: mime_type };
    if (parent_folder_id) metadata.parents = [parent_folder_id];

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\n` +
      `Content-Type: ${mime_type}\r\n\r\n` +
      content +
      `\r\n--${boundary}--`;

    const res = await fetch(
      `${UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink,mimeType`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    if (!res.ok) throw new Error(`drive upload: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  },
});

export default listFiles;
