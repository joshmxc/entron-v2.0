import { createClient } from "@supabase/supabase-js";
import api from "@/lib/api";

type SignedUploadResponse = {
  storageType: "local" | "supabase";
  bucket?: string;
  path?: string;
  token?: string;
};

const CONTENT_TYPES: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function uploadWithSignedUrl(endpoint: string, file: File): Promise<string | null> {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const contentType = file.type || CONTENT_TYPES[extension] || "";
  const response = await api.post(endpoint, {
    filename: file.name,
    contentType,
    size: file.size,
  });
  const upload = response.data.data as SignedUploadResponse;
  if (upload.storageType === "local") return null;
  if (!upload.bucket || !upload.path || !upload.token) {
    throw new Error("The server returned an incomplete Supabase upload authorization.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase browser credentials are required to upload this file.");
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.storage
    .from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, { contentType });
  if (error) throw new Error(`Could not upload file to Supabase Storage: ${error.message}`);
  return upload.path;
}
