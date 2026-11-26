import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import ChecklistClient from './ChecklistClient';

export const metadata: Metadata = {
  title: 'قائمة تجهيز الطلبية | دُكّان',
  description: 'متابعة وتجهيز أصناف الطلبية مباشرة من المستودع',
};

function ChecklistFallback() {
  return (
    <div
      dir="rtl"
      className="min-h-screen w-full bg-[#F5F7F6] text-[#0F172A] flex items-center justify-center p-6"
    >
      <p className="text-base font-bold text-[#475569]">
        جاري فتح قائمة الطلبية...
      </p>
    </div>
  );
}

export default function SupplierChecklistPage() {
  return (
    <Suspense fallback={<ChecklistFallback />}>
      <ChecklistClient />
    </Suspense>
  );
}
