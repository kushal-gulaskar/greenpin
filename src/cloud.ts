import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Tree } from "./data";
import type { Action, Entry } from "./journal";

const env = import.meta.env;
export const cloud = env.VITE_DATA_SOURCE !== "local" || !env.DEV;
const url = env.VITE_SUPABASE_URL ?? "",
  key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
export function validConfig(endpoint: string, publicKey: string) {
  try {
    const u = new URL(endpoint);
    return (
      !u.username &&
      !u.password &&
      (u.protocol === "https:" ||
        (u.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(u.hostname))) &&
      /^sb_publishable_[\w-]+$/.test(publicKey)
    );
  } catch {
    return false;
  }
}
export const client =
  cloud && validConfig(url, key) ? createClient(url, key) : null;
export function mobile(value: string) {
  const digits = value
    .replace(/[ ()-]/g, "")
    .replace(/^(?:\+91|91)(?=[6-9]\d{9}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits))
    throw Error("Enter a valid 10-digit Indian mobile number.");
  return "+91" + digits;
}
export function safeError(
  error: { status?: number; code?: string } | null,
  fallback: string,
) {
  if (error?.status === 429)
    return "Too many attempts. Wait before trying again.";
  if (error?.code === "otp_expired")
    return "The code is incorrect or expired. Request a new code.";
  if (error?.status === 401) return "Your session has expired. Sign in again.";
  return fallback;
}
export const auth = {
  async request(number: string) {
    const { error } = await client!.auth.signInWithOtp({
      phone: mobile(number),
    });
    if (error)
      throw Error(
        safeError(
          error,
          "Code delivery is unavailable. Check the number and project phone configuration.",
        ),
      );
  },
  async verify(number: string, token: string) {
    const { error } = await client!.auth.verifyOtp({
      phone: mobile(number),
      token,
      type: "sms",
    });
    if (error)
      throw Error(
        safeError(
          error,
          "Verification failed. Check the code or request another.",
        ),
      );
  },
  async logout() {
    const { error } = await client!.auth.signOut({ scope: "local" });
    if (error) throw Error("Sign-out failed. Please retry.");
  },
};
async function scoped(uid: string) {
  const { data } = await client!.auth.getSession();
  if (!data.session || data.session.user.id !== uid)
    throw Error("Sign in to the intended account again.");
  const token = data.session.access_token;
  return createClient(url, key, { accessToken: async () => token });
}
function check(error: unknown) {
  if (error)
    throw Error(
      "Cloud operation failed. Check your connection, session and permissions, then retry.",
    );
}
type TableRow = Record<string, any>;
async function read(
  db: SupabaseClient,
  table: string,
  sort = "id",
): Promise<TableRow[]> {
  const rows: TableRow[] = [];
  for (let start = 0; ;) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order(sort)
      .range(start, start + 199);
    check(error);
    if (!data?.length) return rows;
    rows.push(...data);
    start += data.length;
  }
}
export interface Profile {
  display_name: string;
  city: string;
  state: string;
  preferred_language: string;
}
export async function profile(uid: string, update?: Profile): Promise<Profile> {
  const db = await scoped(uid);
  if (update) {
    check((await db.from("profiles").update(update).eq("id", uid)).error);
  } else {
    check(
      (
        await db
          .from("profiles")
          .upsert({ id: uid }, { ignoreDuplicates: true })
      ).error,
    );
  }
  const { data, error } = await db
    .from("profiles")
    .select("display_name,city,state,preferred_language")
    .eq("id", uid)
    .single();
  check(error);
  return data!;
}
export async function jpeg(blob: Blob) {
  if (
    blob.size > 10485760 ||
    !["image/jpeg", "image/webp", "image/png"].includes(blob.type)
  )
    throw Error("Choose a JPG, PNG or WebP under 10 MB.");
  const image = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 1920 / Math.max(image.width, image.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("Image conversion failed."))),
        "image/jpeg",
        0.85,
      ),
    );
  } finally {
    image.close();
  }
}
export async function equalBytes(a: Blob, b: Blob) {
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const bytes = new Uint8Array(y);
  return new Uint8Array(x).every((v, i) => v === bytes[i]);
}
async function upload(
  db: SupabaseClient,
  uid: string,
  t: string,
  id: string,
  photo: Blob,
) {
  const path = [uid, t, id + ".jpg"].join("/"),
    bucket = db.storage.from("tree-photos");
  const compressed = await jpeg(photo);
  const { error } = await bucket.upload(path, compressed, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) {
    const previous = await bucket.download(path);
    if (!previous.data || !(await equalBytes(previous.data, compressed)))
      throw Error(
        "Photograph upload failed. Retry with the original photograph.",
      );
  }
  return path;
}
async function image(db: SupabaseClient, path: string) {
  const { data, error } = await db.storage.from("tree-photos").download(path);
  check(error);
  return data!;
}
export async function register(
  uid: string,
  tree: Tree,
  progress?: (message: string) => void,
) {
  const db = await scoped(uid);
  if (!(tree.photo instanceof Blob))
    throw Error("Registration requires a local photograph.");
  progress?.("Preparing and uploading photograph…");
  const p = await upload(db, uid, tree.id, tree.id, tree.photo);
  progress?.("Saving tree and private location…");
  const { photo: _, ...d } = tree;
  check((await db.rpc("gp_register", { t: tree.id, d, p })).error);
}
export async function writeEntry(
  uid: string,
  t: string,
  action: Action,
  id: string = crypto.randomUUID(),
  created?: string,
  healthId?: string,
) {
  const db = await scoped(uid);
  if (
    action.kind === "request" ||
    action.kind === "decide" ||
    action.kind === "release"
  ) {
    check(
      (
        await db.rpc("gp_care", {
          t,
          e: "id" in action ? action.id : id,
          op: action.kind === "decide" ? action.status : action.kind,
        })
      ).error,
    );
    return;
  }
  const d = { ...action, created, healthId, photo: undefined };
  const p =
    "photo" in action && action.photo
      ? await upload(db, uid, t, id, action.photo)
      : null;
  check((await db.rpc("gp_observe", { t, e: id, d, p })).error);
}
export async function loadCloud(uid: string) {
  const db = await scoped(uid);
  const [
    trees,
    coords,
    photos,
    catalog,
    requests,
    assignments,
    growth,
    maintenance,
    health,
  ] = await Promise.all(
    [
      "trees",
      "gp_coordinates",
      "tree_photos",
      "species",
      "adoption_requests",
      "tree_caretakers",
      "tree_growth_records",
      "tree_maintenance",
      "tree_health_observations",
    ].map((table) =>
      read(db, table, table === "gp_coordinates" ? "tree_id" : "id"),
    ),
  );
  const records: Tree[] = await Promise.all(
    trees.map(async (t) => {
      const at = coords.find((c) => c.tree_id === t.id),
        pic = photos.find(
          (p) => p.tree_id === t.id && p.photo_type === "registration",
        );
      if (!pic || !at) throw Error("A tree record is incomplete.");
      return {
        id: t.id,
        owner: t.registered_by,
        name: t.name,
        scientific: t.scientific ?? "",
        species: catalog.find((s) => s.id === t.species_id)?.common_name ?? "",
        kind: t.registration_type,
        planted: t.planting_date ?? "",
        age: String(t.estimated_age ?? ""),
        photo: await image(db, pic.storage_path),
        lat: at.lat,
        lng: at.lng,
        location: t.location_description,
        health: t.health_status,
        notes: t.notes ?? "",
        created: t.created_at,
        demo: false,
        adopted: assignments.some((a) => a.tree_id === t.id && !a.ended_at),
      };
    }),
  );
  const base = (r: TableRow) => ({
    id: r.id,
    treeId: r.tree_id,
    userId: r.requested_by ?? r.user_id ?? r.recorded_by ?? r.performed_by,
    created: r.created_at ?? r.requested_at ?? r.assigned_at,
  });
  const rows: Entry[] = [
    ...requests.map((r) => ({
      ...base(r),
      kind: "request" as const,
      status: r.status,
      decided: r.reviewed_at,
    })),
    ...assignments.map((r) => ({
      ...base(r),
      kind: "assignment" as const,
      requestId: r.request_id,
      released: r.ended_at,
    })),
    ...(await Promise.all(
      growth.map(async (r) => ({
        ...base(r),
        kind: "growth" as const,
        height: Number(r.height_cm),
        circumference: Number(r.circumference_cm),
        leaves: r.leaf_condition,
        day: r.observation_date,
        health: r.health_status,
        notes: r.notes,
        photo: r.photo_path ? await image(db, r.photo_path) : undefined,
      })),
    )),
    ...(await Promise.all(
      maintenance.map(async (r) => ({
        ...base(r),
        kind: "maintenance" as const,
        activity: r.activity_type,
        when: r.activity_date,
        notes: r.notes,
        photo: r.photo_path ? await image(db, r.photo_path) : undefined,
      })),
    )),
    ...health.map((r) => ({
      ...base(r),
      kind: "health" as const,
      health: r.health_status,
      notes: r.observations,
      day: r.observed_at,
      growthId: r.growth_id,
    })),
  ];
  return {
    trees: records,
    rows,
    species: catalog.map((s) => String(s.common_name)),
  };
}
