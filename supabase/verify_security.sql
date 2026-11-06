-- Run against the target Supabase project after all migrations.
-- Empty results are expected for the first four queries.

SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = FALSE
ORDER BY tablename;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  AND NOT (
    (table_name = 'profiles' AND grantee = 'authenticated' AND privilege_type = 'SELECT')
    OR (table_name = 'platforms' AND grantee IN ('anon', 'authenticated') AND privilege_type = 'SELECT')
  )
ORDER BY table_name, grantee, privilege_type;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    ('anon' = ANY(roles) AND tablename <> 'platforms')
    OR qual IN ('true', '(true)')
    OR with_check IN ('true', '(true)')
  )
ORDER BY tablename, policyname;

SELECT p.oid::regprocedure AS function_name
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE');

-- Review configured buckets and all Storage policies manually; this app currently
-- has no upload route and should not rely on publicly readable buckets.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
