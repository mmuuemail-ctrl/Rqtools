create or replace function public.generate_public_qr_code()
returns text
language plpgsql
as $$
declare
  v_code text;
begin
  loop
    v_code := encode(gen_random_bytes(18), 'hex');

    exit when not exists (
      select 1
      from public.qr_codes
      where public_code = v_code
    );
  end loop;

  return v_code;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch_updated_at on public.profiles;
create trigger trg_profiles_touch_updated_at
before update on public.profiles
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_qr_codes_touch_updated_at on public.qr_codes;
create trigger trg_qr_codes_touch_updated_at
before update on public.qr_codes
for each row
execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (
    id,
    plan_type,
    subscription_status,
    free_views_remaining,
    credit_points_balance,
    low_views_alert_threshold,
    fallback_text_default,
    views_exhausted_text
  )
  values (
    new.id,
    'free',
    'inactive',
    0,
    0,
    0,
    'QR kód teď není funkční.',
    'QR kód teď není aktivní, protože došly views.'
  );

  insert into public.qr_codes (
    user_id,
    public_code,
    title,
    content_type,
    text_content,
    activation_mode,
    activation_days,
    activation_started_at,
    activation_ends_at,
    max_views_total,
    max_views_enabled,
    fallback_text,
    views_exhausted_text,
    is_active
  )
  values (
    new.id,
    public.generate_public_qr_code(),
    'Můj QR kód',
    'text',
    '',
    'subscription_period',
    null,
    now(),
    null,
    null,
    false,
    'QR kód teď není funkční.',
    'QR kód teď není aktivní, protože došly views.',
    true
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

create or replace function public.create_user_alert(
  p_user_id uuid,
  p_alert_type text,
  p_message text
)
returns void
language plpgsql
as $$
begin
  insert into public.alerts (
    user_id,
    alert_type,
    message
  )
  values (
    p_user_id,
    p_alert_type,
    p_message
  );
end;
$$;

create or replace function public.user_has_active_subscription(
  p_user_id uuid
)
returns boolean
language sql
stable
as $$
  select
    case
      when p.plan_type in ('day', 'month', 'year')
       and p.subscription_status = 'active'
       and p.subscription_expires_at is not null
       and p.subscription_expires_at > now()
      then true
      else false
    end
  from public.profiles p
  where p.id = p_user_id
$$;
