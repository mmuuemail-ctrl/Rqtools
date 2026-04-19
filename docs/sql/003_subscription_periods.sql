create table if not exists public.subscription_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_type text not null check (plan_type in ('day', 'month', 'year')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null default 'stripe_checkout',
  stripe_event_id text,
  created_at timestamptz not null default now()
);

create index if not exists subscription_periods_user_id_idx
  on public.subscription_periods(user_id);

create index if not exists subscription_periods_user_id_starts_at_idx
  on public.subscription_periods(user_id, starts_at);

create index if not exists subscription_periods_user_id_ends_at_idx
  on public.subscription_periods(user_id, ends_at);

alter table public.subscription_periods enable row level security;

drop policy if exists "Users can view own subscription periods" on public.subscription_periods;
create policy "Users can view own subscription periods"
on public.subscription_periods
for select
to authenticated
using (auth.uid() = user_id);
