do $$
declare
  v_email text := 'test@example.com';
  v_user_id uuid;
  v_file_keys text[];
begin
  select id
  into v_user_id
  from auth.users
  where email = v_email
  limit 1;

  if v_user_id is null then
    raise notice 'User with email % not found.', v_email;
    return;
  end if;

  select array_agg(file_key)
  into v_file_keys
  from public.qr_codes
  where user_id = v_user_id
    and file_key is not null;

  delete from public.view_events
  where qr_id in (
    select id
    from public.qr_codes
    where user_id = v_user_id
  );

  delete from public.alerts
  where user_id = v_user_id;

  delete from public.credit_purchases
  where user_id = v_user_id;

  delete from public.qr_codes
  where user_id = v_user_id;

  delete from public.profiles
  where id = v_user_id;

  delete from auth.users
  where id = v_user_id;

  raise notice 'User % with id % was deleted.', v_email, v_user_id;
  raise notice 'If storage files existed, remove them manually from bucket files using the file keys: %', v_file_keys;
end $$;
