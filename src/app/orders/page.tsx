"use client";

import { useEffect, useState, useMemo } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Ingredient {
  id: number;
  name: string;
  unit: string;
  package_size: number;
  package_unit: string;
  package_price: number;
  current_price: number;
  supplier: string;
  category: string;
  ingredient_type: string;
  current_stock: number;
  par_level: number;
  reorder_point: number;
  needsReorder: boolean;
  orderQty: number;
  packagesToBuy: number;
  estimatedCost: number;
  cost_per_unit: number;
  orderDisplay: string;
}

interface Order {
  supplier: string;
  items: Ingredient[];
  totalItems: number;
  itemsNeedingReorder: number;
  totalCost: number;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch('/api/orders')
      .then((res) => res.json())
      .then((data) => {
        setOrders(data.orders || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load orders:', err);
        setLoading(false);
      });
  }, []);

  const totalOrderCost = useMemo(() => orders.reduce((sum, order) => sum + order.totalCost, 0), [orders]);
  const totalItemsNeedingReorder = useMemo(() => orders.reduce((sum, order) => sum + order.itemsNeedingReorder, 0), [orders]);
  const totalItems = useMemo(() => orders.reduce((sum, order) => sum + order.totalItems, 0), [orders]);

  // Filter orders based on showAll toggle
  const displayedOrders = useMemo(() => {
    if (showAll) return orders;
    return orders
      .map((order) => ({
        ...order,
        items: order.items.filter((item) => item.needsReorder),
      }))
      .filter((order) => order.items.length > 0);
  }, [orders, showAll]);

  const toggleSupplier = (supplier: string) => {
    const newExpanded = new Set(expandedSuppliers);
    if (newExpanded.has(supplier)) {
      newExpanded.delete(supplier);
    } else {
      newExpanded.add(supplier);
    }
    setExpandedSuppliers(newExpanded);
  };

  const toggleExpandAll = () => {
    if (expandedSuppliers.size === displayedOrders.length) {
      setExpandedSuppliers(new Set());
    } else {
      setExpandedSuppliers(new Set(displayedOrders.map((o) => o.supplier)));
    }
  };

  const printOrder = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-6">
        <p className="text-gray-500">Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="bg-black text-white p-6 print:bg-white print:text-black print:border-b print:border-gray-300">
        <h1 className="text-2xl font-bold">Shopping Lists</h1>
        <p className="text-gray-400 text-sm mt-1 print:text-gray-600">
          Items to reorder by supplier
        </p>
      </div>

      {/* Summary Bar */}
      <div className="p-6 border-b border-gray-200 bg-gray-50 print:bg-white">
        {totalItemsNeedingReorder > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <span className="text-red-700 font-semibold">
              {totalItemsNeedingReorder} item{totalItemsNeedingReorder !== 1 ? 's' : ''} need{totalItemsNeedingReorder === 1 ? 's' : ''} reordering
            </span>
            <span className="text-red-500 text-sm ml-2">out of {totalItems} total</span>
          </div>
        )}
        {totalItemsNeedingReorder === 0 && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <span className="text-green-700 font-semibold">
              All items are above their reorder points
            </span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Items Needing Reorder</div>
            <div className="text-2xl font-bold">{totalItemsNeedingReorder}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Estimated Reorder Cost</div>
            <div className="text-2xl font-bold">
              ${totalOrderCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4 print:hidden">
          <button
            onClick={toggleExpandAll}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            {expandedSuppliers.size === displayedOrders.length ? 'Collapse All' : 'Expand All'}
          </button>
          <button
            onClick={printOrder}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Print Shopping Lists
          </button>
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            {showAll ? 'Show Only Low Stock' : 'Show All Items'}
          </button>
        </div>
      </div>

      {/* Orders by Supplier */}
      {displayedOrders.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          <p>No items need reordering at this time.</p>
          <p className="text-sm mt-2">All ingredients are above their reorder points.</p>
        </div>
      ) : (
        <div className="p-6">
          {displayedOrders.map((order) => (
            <div key={order.supplier} className="mb-6 break-inside-avoid">
              {/* Supplier Header */}
              <button
                onClick={() => toggleSupplier(order.supplier)}
                className={`w-full p-4 rounded-lg flex justify-between items-center transition-colors print:bg-white print:border print:border-gray-300 ${
                  order.itemsNeedingReorder > 0
                    ? 'bg-red-50 hover:bg-red-100 border border-red-200'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl print:hidden">
                    {expandedSuppliers.has(order.supplier) ? '\u25BC' : '\u25B6'}
                  </span>
                  <div className="text-left">
                    <h2 className="text-lg font-bold">{order.supplier}</h2>
                    <p className="text-sm text-gray-600">
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                      {order.itemsNeedingReorder > 0 && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {order.itemsNeedingReorder} to reorder
                        </span>
                      )}
                      {' '} Est. $
                      {order.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </button>

              {/* Supplier Items */}
              {(expandedSuppliers.has(order.supplier) || (typeof window !== 'undefined' && window.matchMedia('print').matches)) && (
                <div className="mt-4 space-y-2">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className={`p-4 rounded-lg border flex justify-between items-center ${
                        item.needsReorder
                          ? 'bg-red-50 border-red-200'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{item.name}</span>
                          {item.needsReorder && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Low Stock
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Current Stock: {item.package_size > 0 ? `${(item.current_stock / item.package_size).toFixed(1)} pkg` : `${item.current_stock ?? 0} ${item.unit}`} {'\u2022'} Reorder Point: {item.reorder_point ?? 0} {item.unit} {'\u2022'} Par Level: {item.par_level ?? 0} {item.unit}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {item.category} {'\u2022'} {item.ingredient_type}
                          {item.packagesToBuy > 0 && (
                            <span className="ml-2 text-gray-600">
                              {'\u2022'} {item.packagesToBuy} package{item.packagesToBuy !== 1 ? 's' : ''} of {item.package_size} {item.package_unit || item.unit}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        {item.needsReorder ? (
                          <>
                            <div className="text-lg font-bold text-red-600">
                              {item.orderDisplay || `${item.orderQty} ${item.unit}`}
                            </div>
                            <div className="text-sm text-gray-600">
                              ${item.estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </>
                        ) : (
                          <div className="text-sm font-medium text-green-600">
                            Stocked
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 print:hidden">
        <div className="flex justify-around max-w-md mx-auto">
          <a href="/" className="flex flex-col items-center text-gray-600">
            <span className="text-2xl">🏠</span>
            <span className="text-xs mt-1">Home</span>
          </a>
          <a href="/expenses" className="flex flex-col items-center text-gray-600">
            <span className="text-2xl">💰</span>
            <span className="text-xs mt-1">P&L</span>
          </a>
          <a href="/kpis" className="flex flex-col items-center text-gray-600">
            <span className="text-2xl">📊</span>
            <span className="text-xs mt-1">KPIs</span>
          </a>
          <a href="/orders" className="flex flex-col items-center text-black">
            <span className="text-2xl">🛒</span>
            <span className="text-xs mt-1">Orders</span>
          </a>
          <a href="/recipes" className="flex flex-col items-center text-gray-600">
            <span className="text-2xl">📖</span>
            <span className="text-xs mt-1">Recipes</span>
          </a>
        </div>
      </div>
    </div>
  );
}
