"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { usePosStore } from "@/stores/pos-store";
import {
  getStats,
  getSummaryByDate,
  getSummaryByCategory,
  updateOrderStatus,
  deleteOrder,
  clearAllOrders,
  loadData,
} from "@/lib/repositories";
import { showToast } from "@/components/pos/Toast";
import { confirmDialog } from "@/components/pos/ConfirmModal";
import {
  formatOrderId,
  businessMonthOf,
  businessDateOf,
  currentBusinessMonth,
  currentBusinessDate,
} from "@/lib/pos-utils";
import type { Stats, DateSummaryPoint, CategorySummary, Order, Product, Category } from "@/types/pos";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Legend, BarChart, Bar, Cell,
} from "recharts";

type ViewMode = "list" | "visual";

const CHART_COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

export function SalesTab() {
  const orders = usePosStore((s) => s.orders);
  const setOrders = usePosStore((s) => s.setOrders);
  const products = usePosStore((s) => s.products);
  const categories = usePosStore((s) => s.categories);
  const activeMonth = usePosStore((s) => s.activeMonth);
  const setActiveMonth = usePosStore((s) => s.setActiveMonth);
  const activeSalesStatus = usePosStore((s) => s.activeSalesStatus);
  const setActiveSalesStatus = usePosStore((s) => s.setActiveSalesStatus);
  const setPendingOrder = usePosStore((s) => s.setPendingOrder);
  const setReceiptModalOpen = usePosStore((s) => s.setReceiptModalOpen);

  const [view, setView] = useState<ViewMode>("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [trendScope, setTrendScope] = useState<"month" | "year">("month");

  const [stats, setStats] = useState<Stats>({ revenue: 0, orders: 0, returnedValue: 0, returnedCount: 0 });
  const [monthStats, setMonthStats] = useState<Stats>({ revenue: 0, orders: 0, returnedValue: 0, returnedCount: 0 });
  const [trendData, setTrendData] = useState<DateSummaryPoint[]>([]);
  const [catSummary, setCatSummary] = useState<CategorySummary>({ categories: [], products: [] });

  // Reset filters on tab open (mirrors original resetSalesFilters)
  useEffect(() => {
    const m = currentBusinessMonth();
    setActiveMonth(m);
    setDateFilter(currentBusinessDate());
    setActiveSalesStatus("completed");
  }, []);

  // Recompute stats + trend whenever filters change
  const refresh = useCallback(async () => {
    const s = await getStats({ status: activeSalesStatus, month: activeMonth, date: dateFilter || undefined });
    const ms = await getStats({ status: activeSalesStatus, month: activeMonth });
    setStats(s);
    setMonthStats(ms);

    if (view === "visual") {
      const trend = await getSummaryByDate({
        month: activeMonth,
        scope: trendScope,
        year: activeMonth?.split("-")[0],
      });
      // Fill gaps for a "live" feel (matches original renderAnalytics)
      const processed = fillTrendGaps(trend, trendScope, activeMonth);
      setTrendData(processed);
      const cs = await getSummaryByCategory({ month: activeMonth }, products, categories);
      setCatSummary(cs);
    }
  }, [activeSalesStatus, activeMonth, dateFilter, view, trendScope, products, categories]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Filtered orders for the table
  const filteredOrders = useMemo(() => {
    let list = orders.filter((o) => o.status === activeSalesStatus);
    if (searchTerm) {
      const t = searchTerm.trim().toLowerCase();
      list = list.filter((o) => formatOrderId(o.id).toLowerCase().includes(t));
    } else {
      if (activeMonth) {
        list = list.filter((o) => businessMonthOf(o.timestamp) === activeMonth);
      }
      if (dateFilter) {
        list = list.filter((o) => businessDateOf(o.timestamp) === dateFilter);
      }
    }
    return [...list].sort((a, b) => b.timestamp - a.timestamp);
  }, [orders, activeSalesStatus, activeMonth, dateFilter, searchTerm]);

  // Month navigation
  const shiftMonth = (delta: number) => {
    const [y, m] = activeMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setActiveMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setDateFilter("");
  };
  const shiftDate = (delta: number) => {
    if (!dateFilter) return;
    const [y, m, d] = dateFilter.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    const newVal = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
      dt.getDate()
    ).padStart(2, "0")}`;
    setDateFilter(newVal);
    setActiveMonth(newVal.substring(0, 7));
  };

  const avgOrder = stats.orders > 0 ? stats.revenue / stats.orders : 0;

  const handleReturn = (orderId: number) => {
    confirmDialog({
      message: "Are you sure you want to mark this order as RETURNED?",
      onConfirm: async () => {
        await updateOrderStatus(orderId, "returned");
        const data = await loadData();
        setOrders(data.orders);
        showToast("Order marked as Returned", "success");
        refresh();
      },
    });
  };

  const handleDelete = (orderId: number) => {
    confirmDialog({
      message: "Are you sure you want to mark this order as DELETED? (Move to deleted tab)",
      onConfirm: async () => {
        await updateOrderStatus(orderId, "deleted");
        const data = await loadData();
        setOrders(data.orders);
        showToast("Order moved to Deleted", "success");
        refresh();
      },
    });
  };

  const handleViewReceipt = (order: Order) => {
    setPendingOrder(order);
    setReceiptModalOpen(true);
  };

  const handleReprint = (order: Order) => {
    setPendingOrder(order);
    setReceiptModalOpen(true);
    showToast("Reprinting order...", "info");
  };

  const handleExport = () => {
    const rows = filteredOrders.map((o) => ({
      OrderID: formatOrderId(o.id),
      DateTime: new Date(o.timestamp).toLocaleString(),
      Items: o.items.length,
      Total: o.total,
      Payment: o.paymentMethod || "Cash",
      Status: o.status,
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => (r as any)[h]).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales_${activeSalesStatus}_${activeMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Sales exported", "success");
  };

  const handleClearAll = () => {
    confirmDialog({
      message:
        "Are you sure you want to PERMANENTLY delete ALL sales history? This cannot be undone.",
      onConfirm: async () => {
        await clearAllOrders();
        const data = await loadData();
        setOrders(data.orders);
        showToast("All orders deleted. Next order will be ORD-001", "success");
        refresh();
      },
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="sales-header">
        <div className="sales-title-group">
          <h2>Sales History</h2>
          <div className="sales-view-toggle">
            <button
              id="btnListView"
              className={`toggle-btn ${view === "list" ? "active" : ""}`}
              onClick={() => setView("list")}
            >
              <i className="fas fa-list"></i> List
            </button>
            <button
              id="btnChartsView"
              className={`toggle-btn ${view === "visual" ? "active" : ""}`}
              onClick={() => setView("visual")}
            >
              <i className="fas fa-chart-pie"></i> Visual
            </button>
          </div>
          <div className="sales-search-wrapper">
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              id="salesSearchInput"
              placeholder="Search Order ID..."
              className="sales-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="sales-controls-modern">
          <div className="month-navigation">
            <button id="prevMonthBtn" className="month-nav-btn" onClick={() => shiftMonth(-1)}>
              ◀ Previous
            </button>
            <input
              type="month"
              id="activeMonthFilter"
              className="active-month-display"
              value={activeMonth}
              onChange={(e) => {
                setActiveMonth(e.target.value);
                setDateFilter("");
              }}
            />
            <button id="nextMonthBtn" className="month-nav-btn" onClick={() => shiftMonth(1)}>
              Next ▶
            </button>
          </div>

          <div className="date-filter-section">
            <label htmlFor="dateWithinMonthFilter">Within Month:</label>
            <div className="date-navigation-group">
              <button id="prevDateBtn" className="month-nav-btn small" onClick={() => shiftDate(-1)}>
                ◀
              </button>
              <input
                type="date"
                id="dateWithinMonthFilter"
                className="filter-select"
                placeholder="Select Date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  if (e.target.value) setActiveMonth(e.target.value.substring(0, 7));
                }}
              />
              <button id="nextDateBtn" className="month-nav-btn small" onClick={() => shiftDate(1)}>
                ▶
              </button>
            </div>
            <button id="clearDateFilter" className="btn-secondary" onClick={() => setDateFilter("")}>
              Clear
            </button>
          </div>

          <button className="btn-secondary" id="exportSalesBtn" onClick={handleExport}>
            <i className="fas fa-download"></i> Export
          </button>
          {activeSalesStatus === "deleted" && (
            <button className="btn-danger" onClick={handleClearAll}>
              <i className="fas fa-trash"></i> Clear All
            </button>
          )}
        </div>
      </div>

      {/* List View */}
      {view === "list" && (
        <div id="salesDataView" className="sales-view-container">
          <div className="sales-summary" id="salesSummary">
            <div className="summary-card" style={{ borderLeft: "4px solid #3B82F6" }}>
              <h3>REVENUE</h3>
              <div className="value">Rs. {stats.revenue.toLocaleString()}</div>
              <div className="change" style={{ color: "#3B82F6" }}>Selected View</div>
            </div>
            <div className="summary-card" style={{ borderLeft: "4px solid #F59E0B" }}>
              <h3>MONTH TOTAL</h3>
              <div className="value">Rs. {monthStats.revenue.toLocaleString()}</div>
              <div className="change" style={{ color: "#F59E0B" }}>Full Month Stats</div>
            </div>
            <div className="summary-card" style={{ borderLeft: "4px solid #10B981" }}>
              <h3>ORDERS</h3>
              <div className="value">{stats.orders}</div>
              <div className="change" style={{ color: "#10B981" }}>Transactions</div>
            </div>
            <div className="summary-card" style={{ borderLeft: "4px solid #8B5CF6" }}>
              <h3>AVG ORDER</h3>
              <div className="value">Rs. {Math.floor(avgOrder).toLocaleString()}</div>
              <div className="change" style={{ color: "#8B5CF6" }}>Average Value</div>
            </div>
            <div className="summary-card" style={{ borderLeft: "4px solid #EF4444" }}>
              <h3>RETURNED</h3>
              <div className="value">{stats.returnedCount}</div>
              <div className="change" style={{ color: "#EF4444" }}>
                Rs. {stats.returnedValue.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="sales-subtabs">
            {(["completed", "returned", "deleted"] as const).map((st) => (
              <button
                key={st}
                className={`sales-subtab ${activeSalesStatus === st ? "active" : ""}`}
                data-status={st}
                onClick={() => setActiveSalesStatus(st)}
              >
                {st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>

          <div className="sales-table-container">
            <table className="sales-table" id="salesTable">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Date & Time</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="salesTableBody">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "24px", color: "#9CA3AF" }}>
                      No orders found
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{formatOrderId(order.id)}</td>
                      <td>{new Date(order.timestamp).toLocaleString()}</td>
                      <td>{order.items.length} items</td>
                      <td>Rs. {order.total}</td>
                      <td>{order.paymentMethod || "Cash"}</td>
                      <td>
                        <span className={`badge badge-${order.status}`}>{order.status}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "5px" }}>
                          <button
                            className="btn-secondary btn-small"
                            title="View"
                            onClick={() => handleViewReceipt(order)}
                          >
                            <i className="fas fa-eye"></i>
                          </button>
                          <button
                            className="btn-primary btn-small"
                            title="Reprint"
                            onClick={() => handleReprint(order)}
                          >
                            <i className="fas fa-print"></i>
                          </button>
                          {activeSalesStatus === "completed" && (
                            <>
                              <button
                                className="btn-warning btn-small"
                                style={{ background: "#f59e0b", color: "white", border: "none" }}
                                title="Return"
                                onClick={() => handleReturn(order.id)}
                              >
                                <i className="fas fa-undo"></i>
                              </button>
                              <button
                                className="btn-danger btn-small"
                                title="Delete"
                                onClick={() => handleDelete(order.id)}
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Visual View */}
      {view === "visual" && (
        <div id="salesVisualView" className="sales-view-container">
          <div className="analytics-dashboard">
            <div className="charts-top-row">
              <div className="chart-card large">
                <div className="chart-header">
                  <h3>Revenue Trend</h3>
                  <select
                    id="trendChartScope"
                    className="chart-filter"
                    value={trendScope}
                    onChange={(e) => setTrendScope(e.target.value as "month" | "year")}
                  >
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                  </select>
                </div>
                <div className="canvas-wrapper" style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={(v) => "Rs." + Number(v).toLocaleString()}
                      />
                      <Tooltip
                        formatter={(v: number) => [`Rs. ${Number(v).toLocaleString()}`, "Revenue"]}
                        contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", border: "none", borderRadius: 8, color: "#fff" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#2563EB"
                        strokeWidth={3}
                        dot={{ r: 4, fill: "#2563EB" }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="chart-card small">
                <h3>Sales by Category</h3>
                <div className="canvas-wrapper" style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={catSummary.categories.map((c) => ({ name: c.name, value: c.value }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={50}
                        label
                      >
                        {catSummary.categories.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => `Rs. ${Number(v).toLocaleString()}`}
                        contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "none", borderRadius: 8, color: "#fff" }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="charts-bottom-row">
              <div className="chart-card full">
                <h3>Top Products Performance</h3>
                <div className="canvas-wrapper" style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={catSummary.products} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => "Rs." + Number(v).toLocaleString()} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={140} />
                      <Tooltip
                        formatter={(v: number) => [`Rs. ${Number(v).toLocaleString()}`, "Total"]}
                        contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "none", borderRadius: 8, color: "#fff" }}
                      />
                      <Bar dataKey="value" fill="#10B981" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Fill gaps in trend data for a "live" feel (matches original renderAnalytics gap-filling).
function fillTrendGaps(
  raw: DateSummaryPoint[],
  scope: "month" | "year",
  monthFilter?: string
): DateSummaryPoint[] {
  if (!monthFilter) return raw;
  const out: DateSummaryPoint[] = [];
  if (scope === "month") {
    const [year, month] = monthFilter.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const now = new Date();
    const businessNow = new Date(now.getTime() - 9 * 60 * 60 * 1000);
    const isCurrentMonth = businessNow.getFullYear() === year && businessNow.getMonth() + 1 === month;
    const limitDay = isCurrentMonth ? businessNow.getDate() : daysInMonth;
    for (let d = 1; d <= limitDay; d++) {
      const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const existing = raw.find((x) => x.label === dateKey);
      out.push({ label: String(d), revenue: existing ? existing.revenue : 0, orders: existing ? existing.orders : 0 });
    }
  } else {
    const yearStr = monthFilter.split("-")[0];
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${yearStr}-${String(m).padStart(2, "0")}`;
      const existing = raw.find((x) => x.label === monthKey);
      const monthName = new Date(2000, m - 1, 1).toLocaleString("default", { month: "short" });
      out.push({ label: monthName, revenue: existing ? existing.revenue : 0, orders: existing ? existing.orders : 0 });
    }
  }
  return out;
}
