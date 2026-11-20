import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";

test("PostGIS migrations, tenant isolation, private object policies and transactional workflows", async () => {
  const pg = new PGlite({ extensions: { postgis } });
  try {
    // Model the Supabase-managed schemas in an ephemeral database. No network or live records.
    await pg.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 alter table storage.objects enable row level security;
 grant usage on schema auth,storage to authenticated,anon;
 grant select,insert on storage.objects to authenticated;
 `);
    for (const name of ["001_trees", "002_cloud_registry"])
      await pg.exec(
        await readFile(
          new URL("../supabase/migrations/" + name + ".sql", import.meta.url),
          "utf8",
        ),
      );
    const a = crypto.randomUUID(),
      b = crypto.randomUUID(),
      tree = crypto.randomUUID(),
      request = crypto.randomUUID(),
      path = a + "/" + tree + "/" + tree + ".jpg";
    await pg.query("insert into auth.users values ($1),($2)", [a, b]);
    await pg.exec(
      "grant usage on schema extensions to authenticated;set role authenticated",
    );
    const user = (uid) =>
      pg.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    const query = (s, args = []) => pg.query(s, args);
    const count = async (sql, args = []) =>
      (await query(sql, args)).rows.length;
    await user(a);
    await query("insert into profiles(id) values($1)", [a]);
    await query(
      "insert into storage.objects(bucket_id,name) values('tree-photos',$1)",
      [path],
    );
    const data = {
      name: "Neem",
      kind: "Existing tree",
      species: "Neem",
      lat: 12,
      lng: 77,
      health: "Healthy",
      location: "Private garden",
    };
    const reg = () =>
      query("select gp_register($1,$2,$3)", [tree, JSON.stringify(data), path]);
    await reg();
    await reg();
    assert.equal(await count("select * from trees"), 1);
    assert.equal(
      (await query("select lng,lat from gp_coordinates")).rows[0].lng,
      77,
    );
    await query("update trees set notes='New observation' where id=$1", [tree]);
    await user(b);
    assert.equal(await count("select * from trees"), 0);
    assert.equal(await count("select * from gp_coordinates"), 0);
    assert.equal(await count("select * from storage.objects"), 0);
    assert.equal(await count("update trees set notes='test' returning id"), 0);
    assert.equal(
      await count("update profiles set city='test' returning id"),
      0,
    );
    await assert.rejects(query("insert into profiles(id) values($1)", [a]));
    await assert.rejects(query("update trees set registered_by=$1", [b]));
    await assert.rejects(
      query(
        "insert into audit_events(entity_type,entity_id,action) values('test',$1,'test')",
        [tree],
      ),
    );
    await assert.rejects(query("update species set category='test'"));
    const care = (op, id = request) =>
      query("select gp_care($1,$2,$3)", [tree, id, op]);
    const observe = (id, d) =>
      query("select gp_observe($1,$2,$3,null)", [tree, id, JSON.stringify(d)]);
    const g = {
      kind: "growth",
      height: 150,
      circumference: 16,
      leaves: "Green",
      day: "2025-01-01",
      health: "Healthy",
    };
    await assert.rejects(observe(crypto.randomUUID(), g));
    await care("request");
    await assert.rejects(care("approved"));
    await user(a);
    await care("approved");
    await assert.rejects(care("approved"));
    await user(b);
    assert.equal(await count("select * from gp_coordinates"), 1);
    assert.equal(await count("select * from storage.objects"), 1);
    const id = crypto.randomUUID();
    await observe(id, g);
    await observe(id, g);
    await assert.rejects(observe(crypto.randomUUID(), { ...g, height: -1 }));
    assert.equal(await count("select * from tree_growth_records"), 1);
    assert.equal(await count("select * from tree_health_observations"), 1);
    await observe(crypto.randomUUID(), {
      kind: "maintenance",
      activity: "Watering",
      when: "2025-01-02T09:00:00Z",
    });
    assert.equal(await count("select * from tree_maintenance"), 1);
    const assignment = (await query("select id from tree_caretakers")).rows[0]
      .id;
    await care("release", assignment);
    assert.equal(await count("select * from storage.objects"), 0);
    await pg.exec("reset role");
    assert.ok((await count("select * from audit_events")) > 0);
  } finally {
    await pg.close();
  }
});
