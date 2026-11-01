'use client';

import React from 'react';
import Link from 'next/link';
import CartManager from '@/components/CartManager';
import { ToastProvider } from '@/components/Toast';
import { ShoppingCart, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

function CartPageContent() {
  const router = useRouter();

  return (
    <>
      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <Link href="/" className="logo-group" style={{ textDecoration: 'none' }}>
            <div className="logo-icon">🏪</div>
            <div>
              <div className="logo-text">دُكّان</div>
              <div className="logo-subtitle">إدارة طلبات الجملة</div>
            </div>
          </Link>

          <nav className="nav-tabs">
            <Link href="/" className="nav-tab" style={{ textDecoration: 'none' }}>
              <ArrowRight size={16} />
              العودة للرئيسية
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Cart Content */}
      <main style={{ flex: 1 }}>
        <CartManager onNavigateToOrders={() => router.push('/')} />
      </main>

      {/* Footer */}
      <footer
        style={{
          textAlign: 'center',
          padding: '1rem',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        دُكّان © ٢٠٢٦ — إدارة طلبات الجملة للميني ماركت
      </footer>
    </>
  );
}

export default function CartPage() {
  return (
    <ToastProvider>
      <CartPageContent />
    </ToastProvider>
  );
}

