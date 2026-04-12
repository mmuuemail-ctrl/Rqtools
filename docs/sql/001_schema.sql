create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan_type text not null default 'free',
  subscription_status text not null default 'inactive',
  subscription_expires_at timestamptz null,
  billing_period text null,
  free_views_remaining bigint not null default 0,
  credit_points_balance numeric(18,6) not null default 0,
  low_views_alert_threshold bigint not null default 0,
  fallback_text_default text not null default 'QR kód teď není funkční.',
  views_exhausted_text text not null default 'QR kód teď není aktivní, protože došly views.',
  stripe_customer_id text null,
  stripe_subscription_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_plan_type_check
    check (plan_type in ('free', 'day', 'month', 'year')),
  constraint profiles_subscription_status_check
    check (subscription_status in ('inactive', 'active', 'expired', 'canceled'))
);

create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  public_code text not null unique,
  title text not null default 'Můj QR kód',
  content_type text not null default 'text',
  text_content text null,
  custom_url text null,
  file_name text null,
  file_key text null,
  mime_type text null,
  public_url text null,
  file_size bigint not null default 0,
  activation_mode text not null default 'subscription_period',
  activation_days integer null,
  activation_started_at timestamptz null,
  activation_ends_at timestamptz null,
  max_views_total bigint null,
  max_views_enabled boolean not null default false,
  fallback_text text not null default 'QR kód teď není funkční.',
  views_exhausted_text text not null default 'QR kód teď není aktivní, protože došly views.',
  is_active boolean not null default true,
  total_valid_views bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_codes_content_type_check
    check (content_type in ('text', 'url', 'media')),
  constraint qr_codes_activation_mode_check
    check (activation_mode in ('days', 'subscription_period', 'unlimited'))
);

create table if not exists public.view_events (
  id uuid primary key default gen_random_uuid(),
  qr_id uuid not null references public.qr_codes(id) on delete cascade,
  device_hash text not null,
  viewed_at timestamptz not null default now(),
  was_counted boolean not null default false,
  blocked_reason text null,
  charged_from text null,
  charged_amount numeric(18,6) not null default 0,
  created_at timestamptz not null default now(),
  constraint view_events_charged_from_check
    check (charged_from in ('free_views', 'credit_points', 'none') or charged_from is null)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  alert_type text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  purchased_points numeric(18,6) not null,
  price_paid_usd numeric(18,6) not null,
  source text not null default 'manual_checkout',
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_profiles_plan_type
  on public.profiles(plan_type);

create index if not exists idx_profiles_subscription_status
  on public.profiles(subscription_status);

create index if not exists idx_profiles_subscription_expires_at
  on public.profiles(subscription_expires_at);

create index if not exists idx_qr_codes_user_id
  on public.qr_codes(user_id);

create index if not exists idx_qr_codes_public_code
  on public.qr_codes(public_code);

create index if not exists idx_qr_codes_is_active
  on public.qr_codes(is_active);

create index if not exists idx_view_events_qr_id
  on public.view_events(qr_id);

create index if not exists idx_view_events_device_hash
  on public.view_events(device_hash);

create index if not exists idx_view_events_viewed_at
  on public.view_events(viewed_at);

create index if not exists idx_alerts_user_id
  on public.alerts(user_id);

create index if not exists idx_alerts_is_read
  on public.alerts(is_read);

create index if not exists idx_credit_purchases_user_id
  on public.credit_purchases(user_id);
