'use client';

import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export function BillingSignOut() {
  async function signOut() {
    await createClient().auth.signOut();
    // A full reload clears every account-scoped client provider.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  }

  return (
    <Button variant="outline" onClick={signOut}>
      <LogOut /> Cerrar sesión
    </Button>
  );
}
