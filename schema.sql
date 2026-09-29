create table leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  email text not null,
  company text,
  message text,
  status text not null default 'new' check (status in ('new','contacted','qualified','won','lost')),
  score int,
  reason text,
  icebreaker text
);
alter table leads enable row level security;
-- Demo only: anyone with the anon key can read and write. Add auth before real use.
create policy "demo open access" on leads for all using (true) with check (true);
