import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import ChecklistClient from './ChecklistClient';
import styles from './checklist.module.css';

export const metadata: Metadata = {
  title: 'قائمة تجهيز الطلبية | دُكّان',
  description: 'متابعة وتجهيز أصناف الطلبية مباشرة من المستودع',
};

function ChecklistFallback() {
  return (
    <div dir="rtl" className={styles.statePage}>
      <p className={styles.loadingText}>جاري فتح قائمة الطلبية...</p>
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
