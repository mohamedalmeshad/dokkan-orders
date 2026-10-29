'use client';

import React, { useState } from 'react';
import ItemManager from '@/components/ItemManager';
import OrderCreator from '@/components/OrderCreator';
import OrdersHistory from '@/components/OrdersHistory';
import { ToastProvider } from '@/components/Toast';
import {
  Package,
  ShoppingCart,
  ClipboardList,
} from 'lucide-react';

type Tab = 'orders' | 'history' | 'items';

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('orders');

  return (
    <>
      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo-group">
            <div className="logo-icon">🏪</div>
            <div>
              <div className="logo-text">دُكّان</div>
              <div className="logo-subtitle">إدارة طلبات الجملة</div>
            </div>
          </div>

          <nav className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              <ShoppingCart size={16} />
              إنشاء طلب
            </button>
            <button
              className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <ClipboardList size={16} />
              سجل الطلبيات
            </button>
            <button
              className={`nav-tab ${activeTab === 'items' ? 'active' : ''}`}
              onClick={() => setActiveTab('items')}
            >
              <Package size={16} />
              إدارة المنتجات
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        {activeTab === 'orders' && <OrderCreator />}
        {activeTab === 'history' && <OrdersHistory />}
        {activeTab === 'items' && (
          <div className="app-container" style={{ padding: '1.5rem 1rem' }}>
            <div className="card">
              <ItemManager />
            </div>
          </div>
        )}
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

export default function Home() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
