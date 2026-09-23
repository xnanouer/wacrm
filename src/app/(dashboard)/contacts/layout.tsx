import type { ReactNode } from 'react';

import { ContactsNavigation } from '@/components/contacts/contacts-navigation';

export default function ContactsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <ContactsNavigation />
      {children}
    </div>
  );
}
