do $$
declare
  legacy_column text;
begin
  foreach legacy_column in array array['first_name', 'last_name'] loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = legacy_column
    ) then
      execute format(
        'alter table public.profiles alter column %I set default %L',
        legacy_column,
        ''
      );
    end if;
  end loop;
end;
$$;
