'use client';

import React, { useState, useEffect } from 'react';
import ItemManager from '@/components/ItemManager';
import OrderCreator from '@/components/OrderCreator';
import OrdersHistory from '@/components/OrdersHistory';
import CartManager from '@/components/CartManager';
import { ToastProvider } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import {
  Package,
  ShoppingCart,
  ClipboardList,
  Store,
} from 'lucide-react';

type Tab = 'orders' | 'cart' | 'history' | 'items';

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [cartCount, setCartCount] = useState<number>(0);

  // Sync cart count for top navigation badge
  useEffect(() => {
    const fetchCartCount = async () => {
      try {
        const { count, error } = await supabase
          .from('active_cart_items')
          .select('*', { count: 'exact', head: true });
        if (!error && count !== null) {
          setCartCount(count);
        }
      } catch {
        // silent
      }
    };

    fetchCartCount();

    const channel = supabase
      .channel('app_cart_badge_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_cart_items' },
        () => {
          fetchCartCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
              <Store size={16} />
              كتالوج الطلب
            </button>
            <button
              className={`nav-tab ${activeTab === 'cart' ? 'active' : ''}`}
              onClick={() => setActiveTab('cart')}
              style={{ position: 'relative' }}
            >
              <ShoppingCart size={16} />
              السلة
              {cartCount > 0 && (
                <span
                  style={{
                    background: activeTab === 'cart' ? '#ffffff' : 'var(--accent-primary)',
                    color: activeTab === 'cart' ? 'var(--accent-primary)' : '#ffffff',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.45rem',
                    borderRadius: 'var(--radius-full)',
                    marginRight: '0.2rem',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  }}
                >
                  {cartCount}
                </span>
              )}
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
        {activeTab === 'orders' && (
          <OrderCreator onNavigateToCart={() => setActiveTab('cart')} />
        )}
        {activeTab === 'cart' && (
          <CartManager onNavigateToOrders={() => setActiveTab('orders')} />
        )}
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
