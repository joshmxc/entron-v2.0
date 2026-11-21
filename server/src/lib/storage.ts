import fs from "fs/promises";
import path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";

type StorageBucket = "public" | "private";

let supabase: SupabaseClient | undefined;

function getSupabase(): SupabaseClient {
  if (!config.storage.supabaseUrl || !config.storage.supabaseServiceRoleKey) {
    throw new Error("Supabase storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!supabase) {
    supabase = createClient(config.storage.supabaseUrl, config.storage.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabase;
}

function bucketName(bucket: StorageBucket): string {
  return bucket === "public" ? config.storage.publicBucket : config.storage.privateBucket;
}

function validateObjectPath(objectPath: string): string {
  const normalized = objectPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (!normalized || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Invalid storage object path");
  }
  return normalized;
}

function localRoot(bucket: StorageBucket): string {
  return path.resolve(config.storage.uploadDir, ...(bucket === "private" ? ["..", "private"] : []));
}

function localObjectPath(bucket: StorageBucket, objectPath: string): string {
  const root = localRoot(bucket);
  const resolved = path.resolve(root, ...validateObjectPath(objectPath).split("/"));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error("Invalid storage object path");
  }
  return resolved;
}

function objectPathFromReference(reference: string, bucket: StorageBucket): string {
  if (reference.startsWith("/uploads/")) {
    return validateObjectPath(reference.slice("/uploads/".length));
  }
  if (/^https?:\/\//i.test(reference)) {
    const url = new URL(reference);
    const marker = `/storage/v1/object/public/${bucketName(bucket)}/`;
    const index = url.pathname.indexOf(marker);
    if (index < 0) throw new Error("Stored file URL does not match the configured Supabase bucket");
    return validateObjectPath(decodeURIComponent(url.pathname.slice(index + marker.length)));
  }
  return validateObjectPath(reference);
}

function isLegacyAbsolutePath(reference: string): boolean {
  return !reference.startsWith("/uploads/") && path.isAbsolute(reference);
}

export async function storeFile(
  bucket: StorageBucket,
  objectPath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const safePath = validateObjectPath(objectPath);
  if (config.storage.type === "local") {
    const destination = localObjectPath(bucket, safePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, buffer);
    return bucket === "public" ? `/uploads/${safePath}` : safePath;
  }

  const { error } = await getSupabase().storage.from(bucketName(bucket)).upload(safePath, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Could not upload file to Supabase Storage: ${error.message}`);
  return bucket === "public" ? publicFileUrl(safePath) : safePath;
}

export function publicFileUrl(objectPath: string): string {
  const safePath = validateObjectPath(objectPath);
  if (config.storage.type === "local") return `/uploads/${safePath}`;
  const { data } = getSupabase().storage.from(config.storage.publicBucket).getPublicUrl(safePath);
  return data.publicUrl;
}

export async function readStoredFile(reference: string, bucket: StorageBucket): Promise<Buffer> {
  if (config.storage.type === "local") {
    const objectPath = objectPathFromReference(reference, bucket);
    const fullPath = isLegacyAbsolutePath(reference)
      ? path.resolve(reference)
      : localObjectPath(bucket, objectPath);
    if (isLegacyAbsolutePath(reference)) {
      const root = localRoot(bucket);
      const relative = path.relative(root, fullPath);
      if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
        throw new Error("Stored file path is outside the configured storage directory");
      }
    }
    return fs.readFile(fullPath);
  }

  const objectPath = objectPathFromReference(reference, bucket);
  const { data, error } = await getSupabase().storage.from(bucketName(bucket)).download(objectPath);
  if (error) throw new Error(`Could not download file from Supabase Storage: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteStoredFile(reference: string, bucket: StorageBucket): Promise<void> {
  if (config.storage.type === "local") {
    const objectPath = objectPathFromReference(reference, bucket);
    const fullPath = isLegacyAbsolutePath(reference)
      ? path.resolve(reference)
      : localObjectPath(bucket, objectPath);
    if (isLegacyAbsolutePath(reference)) {
      const root = localRoot(bucket);
      const relative = path.relative(root, fullPath);
      if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
        throw new Error("Stored file path is outside the configured storage directory");
      }
    }
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return;
  }

  const objectPath = objectPathFromReference(reference, bucket);
  const { error } = await getSupabase().storage.from(bucketName(bucket)).remove([objectPath]);
  if (error) throw new Error(`Could not delete file from Supabase Storage: ${error.message}`);
}

export async function createSignedUpload(bucket: StorageBucket, objectPath: string) {
  if (config.storage.type === "local") return { storageType: "local" as const };

  const safePath = validateObjectPath(objectPath);
  const { data, error } = await getSupabase()
    .storage.from(bucketName(bucket))
    .createSignedUploadUrl(safePath, { upsert: true });
  if (error) throw new Error(`Could not create Supabase upload URL: ${error.message}`);
  return {
    storageType: "supabase" as const,
    bucket: bucketName(bucket),
    path: data.path,
    token: data.token,
  };
}
