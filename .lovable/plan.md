Plan: Fix auth hydration mismatch by disabling SSR on /auth route

1. In `src/routes/auth.tsx`, add `ssr: false` to the route options object (matching the pattern already used in `src/routes/_authenticated/route.tsx`).

This prevents server-side rendering of the auth page, eliminating the hydration mismatch that breaks the `supabase.auth.getUser()` redirect flow inside `useEffect`.

No other auth-related files will be touched.