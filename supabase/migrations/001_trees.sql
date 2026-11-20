begin;
create table public.trees (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check (length(trim(name)) > 0), scientific text, species text not null,
 kind text not null check (kind in ('Existing tree','New plantation')), planted date,
 age numeric check (age >= 0), photo_path text not null,
 lat double precision not null check (lat between -90 and 90),
 lng double precision not null check (lng between -180 and 180),
 location text not null, health text not null check (health in ('Healthy','Needs attention','Recovering')),
 notes text, adopted boolean not null default false, created timestamptz not null default now()
);
alter table public.trees enable row level security;
revoke all on public.trees from public, anon, authenticated;
grant select,insert on public.trees to authenticated;
create policy read_own on public.trees for select to authenticated using(owner_id=auth.uid());
create policy register_own on public.trees for insert to authenticated with check(owner_id=auth.uid() and split_part(photo_path,'/',1)=auth.uid()::text);
insert into storage.buckets(id,name,public) values ('tree-photos','tree-photos',false);
create policy read_own_photos on storage.objects for select to authenticated using(bucket_id='tree-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy upload_own_photos on storage.objects for insert to authenticated with check(bucket_id='tree-photos' and (storage.foldername(name))[1]=auth.uid()::text);
commit;