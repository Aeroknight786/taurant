ALTER TABLE "PartySession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartyParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartyBucketItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderFlowEvent" ENABLE ROW LEVEL SECURITY;

REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

DO $$
DECLARE
  _tables text[] := ARRAY[
    'PartySession',
    'PartyParticipant',
    'PartyBucketItem',
    'OrderFlowEvent'
  ];
  _tbl text;
  _role text;
  _policy text;
BEGIN
  FOREACH _tbl IN ARRAY _tables LOOP
    FOREACH _role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      _policy := format('deny_%s_all', _role);

      IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = _tbl
          AND policyname = _policy
      ) THEN
        EXECUTE format('DROP POLICY %I ON public.%I', _policy, _tbl);
      END IF;

      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', _tbl, _role);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO %I USING (false) WITH CHECK (false)',
        _policy,
        _tbl,
        _role
      );
    END LOOP;
  END LOOP;
END $$;
