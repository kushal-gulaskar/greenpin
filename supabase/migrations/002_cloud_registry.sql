begin;
revoke create on schema public from public,anon,authenticated;
create schema if not exists extensions;
grant usage on schema extensions to authenticated;
create extension if not exists postgis with schema extensions;
set local search_path=public,extensions,pg_catalog;

-- Retain the original table and abort before changing access to a populated installation.
do $$begin
 if exists(select 1 from public.trees) then raise exception 'Existing SQL registrations require a reviewed backfill. Migration stopped.'; end if;
end$$;
alter table public.trees rename to trees_v1_archive;
revoke all on trees_v1_archive from public,anon,authenticated;
create table profiles(id uuid primary key references auth.users,display_name text not null default 'Caretaker' check(length(trim(display_name)) between 1 and 100),city text not null default '',state text not null default '',preferred_language text not null default '',avatar_path text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table species(id uuid primary key default gen_random_uuid(),common_name text not null unique,scientific_name text,local_names jsonb not null default '{}',category text,description text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
insert into species(common_name,description) select n,'Illustrative catalog entry pending botanical review.' from unnest(array['Neem','Banyan','Peepal','Mango','Gulmohar','Other / unknown']) n;
create domain gp_health as text check(value in ('Healthy','Needs attention','Under treatment','Unknown','Recovering'));
create table trees(id uuid primary key,public_tree_id uuid generated always as (id) stored unique,species_id uuid not null references species,registered_by uuid not null references auth.users,name text not null check(length(trim(name)) between 1 and 120),scientific text,registration_type text not null check(registration_type in ('Existing tree','New plantation')),planting_date date check(planting_date<=current_date),estimated_age numeric check(estimated_age between 0 and 10000),health_status gp_health not null,location_description text not null check(length(trim(location_description))>0),location_visibility text not null default 'private' check(location_visibility='private'),notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index on trees(registered_by);
create table tree_locations(id uuid primary key default gen_random_uuid(),tree_id uuid not null unique references trees,coordinates geography(Point,4326) not null,gps_accuracy numeric check(gps_accuracy>=0),captured_at timestamptz not null,created_at timestamptz not null default now());
create index on tree_locations using gist(coordinates);
create table tree_photos(id uuid primary key default gen_random_uuid(),tree_id uuid not null references trees,uploaded_by uuid not null references auth.users,storage_path text not null unique,photo_type text not null check(photo_type in ('registration','growth','maintenance','rescue')),captured_at timestamptz not null,created_at timestamptz not null default now());
create index on tree_photos(tree_id);
create table adoption_requests(id uuid primary key,tree_id uuid not null references trees,requested_by uuid not null references auth.users,status text not null check(status in ('pending','approved','rejected','withdrawn')),requested_at timestamptz not null default now(),reviewed_at timestamptz);
create unique index pending_request on adoption_requests(tree_id,requested_by) where status='pending';
create table tree_caretakers(id uuid primary key default gen_random_uuid(),tree_id uuid not null references trees,user_id uuid not null references auth.users,request_id uuid not null unique references adoption_requests,caretaker_role text not null default 'primary' check(caretaker_role='primary'),status text not null default 'active' check(status in ('active','ended')),assigned_at timestamptz not null default now(),ended_at timestamptz,check((status='active')=(ended_at is null)));
create unique index primary_caretaker on tree_caretakers(tree_id) where status='active' and caretaker_role='primary';
create table tree_growth_records(id uuid primary key,tree_id uuid not null references trees,recorded_by uuid not null references auth.users,height_cm numeric not null check(height_cm>0 and height_cm<=15000),circumference_cm numeric not null check(circumference_cm>0 and circumference_cm<=6000),leaf_condition text not null check(length(trim(leaf_condition))>0),health_status gp_health not null,observation_date date not null check(observation_date<=(now() at time zone 'Asia/Kolkata')::date),notes text,photo_path text references tree_photos(storage_path),created_at timestamptz not null default now());
create table tree_maintenance(id uuid primary key,tree_id uuid not null references trees,performed_by uuid not null references auth.users,activity_type text not null check(activity_type in ('Watering','Mulching','Compost application','Health inspection','Protection inspection','Soil inspection','Other maintenance')),activity_date timestamptz not null check(activity_date<=now()),notes text,photo_path text references tree_photos(storage_path),created_at timestamptz not null default now());
create table tree_health_observations(id uuid primary key,tree_id uuid not null references trees,recorded_by uuid not null references auth.users,health_status gp_health not null,observations text,observed_at date not null check(observed_at<=(now() at time zone 'Asia/Kolkata')::date),growth_id uuid unique references tree_growth_records,created_at timestamptz not null default now());
create table audit_events(id uuid primary key default gen_random_uuid(),actor uuid,entity_type text not null,entity_id uuid not null,action text not null,created_at timestamptz not null default now());

create function gp_access(t uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from public.trees where id=t and registered_by=auth.uid()) or exists(select from public.tree_caretakers where tree_id=t and user_id=auth.uid() and status='active')
$$;
create function gp_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.audit_events(actor,entity_type,entity_id,action) values(auth.uid(),tg_table_name,new.id,tg_op);return new;
end$$;
create function gp_touch() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
do $$declare t text;begin
 foreach t in array array['profiles','species','trees','tree_locations','tree_photos','tree_caretakers','adoption_requests','tree_growth_records','tree_maintenance','tree_health_observations','audit_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 if t<>'audit_events' then
 execute format('grant select on public.%I to authenticated',t);
 execute format('create trigger audit_write after insert or update on public.%I for each row execute function public.gp_audit()',t);
 end if;
 end loop;
 foreach t in array array['tree_locations','tree_photos','tree_growth_records','tree_maintenance','tree_health_observations'] loop
 execute format('create policy tree_access on public.%I for select to authenticated using(public.gp_access(tree_id))',t);
 end loop;
 foreach t in array array['tree_growth_records','tree_maintenance','tree_health_observations','adoption_requests'] loop execute format('create index on public.%I(tree_id)',t);end loop;
 foreach t in array array['profiles','trees','species'] loop execute format('create trigger touch before update on public.%I for each row execute function public.gp_touch()',t);end loop;
end$$;
create policy profile_read on profiles for select to authenticated using(id=auth.uid());
create policy profile_create on profiles for insert to authenticated with check(id=auth.uid());
create policy profile_edit on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
grant insert(id),update(display_name,city,state,preferred_language) on profiles to authenticated;
create policy catalog_read on species for select to authenticated using(true);
create policy trees_read on trees for select to authenticated using(gp_access(id));
create policy trees_edit on trees for update to authenticated using(registered_by=auth.uid()) with check(registered_by=auth.uid());
grant update(notes,name,location_description) on trees to authenticated;
create policy requests_read on adoption_requests for select to authenticated using(requested_by=auth.uid() or exists(select from trees where id=tree_id and registered_by=auth.uid()));
create policy caretakers_read on tree_caretakers for select to authenticated using(user_id=auth.uid() or gp_access(tree_id));

create view gp_coordinates with(security_invoker=true) as select tree_id,st_x(coordinates::geometry) lng,st_y(coordinates::geometry) lat from tree_locations;
revoke all on gp_coordinates from public,anon,authenticated;
grant select on gp_coordinates to authenticated;

update storage.buckets set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='tree-photos';
drop policy read_own_photos on storage.objects;
drop policy upload_own_photos on storage.objects;
create function gp_photo_read(p text) returns boolean language sql stable security definer set search_path='' as $$
 select case when exists(select from public.tree_photos where storage_path=p)
 then exists(select from public.tree_photos where storage_path=p and public.gp_access(tree_id))
 else split_part(p,'/',1)=auth.uid()::text end
$$;
create policy photo_read on storage.objects for select to authenticated using(bucket_id='tree-photos' and gp_photo_read(name));
create policy photo_stage on storage.objects for insert to authenticated with check(bucket_id='tree-photos' and split_part(name,'/',1)=auth.uid()::text and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.jpg$');
-- Committed photographs are immutable. Orphan cleanup is an operator job through the Storage API.
create function gp_attach(t uuid,k text,p text,at_time timestamptz) returns void language plpgsql set search_path=pg_catalog,public,pg_temp as $$begin
 if split_part(p,'/',1)<>auth.uid()::text or split_part(p,'/',2)<>t::text or not exists(select from storage.objects where bucket_id='tree-photos' and name=p) then raise exception 'Photo unavailable';end if;
 insert into tree_photos(tree_id,uploaded_by,storage_path,photo_type,captured_at) values(t,auth.uid(),p,k,at_time);
end$$;

create function gp_register(t uuid,d jsonb,p text) returns void language plpgsql security definer set search_path=pg_catalog,public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); stamp timestamptz:=coalesce((d->>'created')::timestamptz,now());lon float8:=(d->>'lng')::float8;lat float8:=(d->>'lat')::float8;
begin
 if actor is null then raise exception 'Sign in required';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text,0));
 if exists(select from trees where id=t and registered_by=actor) then return;end if;
 if not (lon between -180 and 180 and lat between -90 and 90) then raise exception 'Invalid coordinates';end if;
 insert into trees(id,species_id,registered_by,name,scientific,registration_type,planting_date,estimated_age,health_status,location_description,notes,created_at)
 values(t,(select id from species where common_name=d->>'species'),actor,d->>'name',d->>'scientific',d->>'kind',nullif(d->>'planted','')::date,nullif(d->>'age','')::numeric,(d->>'health')::gp_health,d->>'location',d->>'notes',stamp);
 insert into tree_locations(tree_id,coordinates,captured_at) values(t,st_setsrid(st_makepoint(lon,lat),4326)::geography,stamp);
 perform gp_attach(t,'registration',p,stamp);
end$$;
create function gp_observe(t uuid,e uuid,d jsonb,p text default null) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare k text:=d->>'kind';actor uuid:=auth.uid();stamp timestamptz:=coalesce((d->>'created')::timestamptz,now());begin
 perform 1 from trees where id=t for update;
 if not gp_access(t) then raise exception 'Access denied';end if;
 if k='growth' and exists(select from tree_growth_records where id=e and tree_id=t and recorded_by=actor) or k='maintenance' and exists(select from tree_maintenance where id=e and tree_id=t and performed_by=actor) or k='health' and exists(select from tree_health_observations where id=e and tree_id=t and recorded_by=actor) then return;end if;
 if p is not null then perform gp_attach(t,k,p,stamp);end if;
 if k='growth' then
 insert into tree_growth_records values(e,t,actor,(d->>'height')::numeric,(d->>'circumference')::numeric,d->>'leaves',(d->>'health')::gp_health,(d->>'day')::date,d->>'notes',p,stamp);
 elsif k='maintenance' then
 insert into tree_maintenance values(e,t,actor,d->>'activity',(d->>'when')::timestamptz,d->>'notes',p,stamp);return;
 elsif k<>'health' or k is null then raise exception 'Unknown observation';end if;
 insert into tree_health_observations values(case when k='growth' then coalesce((d->>'healthId')::uuid,gen_random_uuid()) else e end,t,actor,(d->>'health')::gp_health,d->>'notes',(d->>'day')::date,case when k='growth' then e end,stamp);
 update trees set health_status=(select h.health_status from tree_health_observations h where h.tree_id=t order by observed_at desc,created_at desc,id desc limit 1) where id=t and (d->>'day')::date >= (created_at at time zone 'Asia/Kolkata')::date;
end$$;
create function gp_care(t uuid,e uuid,op text) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid:=auth.uid();owner uuid;req adoption_requests;begin
 select registered_by into owner from trees where id=t for update;
 if actor is null or owner is null then raise exception 'Unavailable';end if;
 if op='request' then
 if actor=owner or exists(select from tree_caretakers where tree_id=t and status='active') then raise exception 'Unavailable';end if;
 insert into adoption_requests(id,tree_id,requested_by,status) values(e,t,actor,'pending');
 elsif op='release' then
 update tree_caretakers set status='ended',ended_at=now() where tree_id=t and id=e and status='active' and (actor=owner or user_id=actor);
 if not found then raise exception 'Unavailable';end if;
 else
 select * into req from adoption_requests where id=e and tree_id=t and status='pending' for update;
 if not found or not ((op='withdrawn' and actor=req.requested_by) or (op in ('approved','rejected') and actor=owner and actor<>req.requested_by)) then raise exception 'Unavailable';end if;
 update adoption_requests set status=op,reviewed_at=now() where id=e;
 if op='approved' then insert into tree_caretakers(tree_id,user_id,request_id) values(t,req.requested_by,e);end if;
 end if;end$$;
do $$declare f regprocedure;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname like 'gp\_%' loop execute format('revoke all on function %s from public,anon,authenticated',f);end loop;
end$$;
grant execute on function gp_access(uuid),gp_photo_read(text),gp_register(uuid,jsonb,text),gp_observe(uuid,uuid,jsonb,text),gp_care(uuid,uuid,text) to authenticated;
commit;