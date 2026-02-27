"use client";

import { useEffect, useState, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getIntensityStyles(intensity: string) {
  switch (intensity) {
    case "busy":
      return "bg-status-danger/15 text-status-danger border-status-danger/30";
    case "moderate":
      return "bg-status-warning/15 text-status-warning border-status-warning/30";
    default:
      return "bg-status-good/15 text-status-good border-status-good/30";
  }
}

function getIntensityBadgeBg(intensity: string) {
  switch (intensity) {
    case "busy":
      return "bg-status-danger text-white";
    case "moderate":
      return "bg-status-warning text-white";
    default:
      return "bg-status-good text-white";
  }
}

export default function SchedulePage() {
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/labor/schedule?weekOffset=${weekOffset}`);
      if (res.ok) {
        const data = await res.json();
        setScheduleData(data);
      }
    } catch (err) {
      console.error("Failed to load schedule:", err);
    }
    setLoading(false);
  }, [weekOffset]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const weekLabel = scheduleData
    ? `${formatShortDate(scheduleData.weekStart)} – ${formatShortDate(scheduleData.weekEnd)}`
    : "";

  return (
    <div className="min-h-screen bg-porch-cream pb-24">
      {/* Header */}
      <div className="bg-white border-b border-porch-cream-dark px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-porch-brown">Staff Schedule</h1>
        <p className="text-sm text-porch-brown-light/60 mt-0.5">
          Recommended headcount by hour
        </p>

        {/* Week Navigation */}
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-2 rounded-lg hover:bg-porch-cream transition-colors"
            aria-label="Previous week"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-porch-brown-light">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
          </button>

          <div className="text-center">
            <p className="text-sm font-semibold text-porch-brown">{weekLabel}</p>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs text-porch-teal font-medium mt-0.5"
              >
                Back to this week
              </button>
            )}
          </div>

          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="p-2 rounded-lg hover:bg-porch-cream transition-colors"
            aria-label="Next week"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-porch-brown-light">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-6">
          <div className="w-5 h-5 border-2 border-porch-teal border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-porch-brown-light/60">
            Loading schedule...
          </span>
        </div>
      )}

      {/* Schedule Grid */}
      {!loading && scheduleData && (
        <div className="px-4 py-4 space-y-4">
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-porch-brown-light/60">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-status-good" />
              Light (1)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-status-warning" />
              Moderate (2)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-status-danger" />
              Busy (3+)
            </div>
          </div>

          {/* Day cards */}
          {scheduleData.schedule.map((day: any) => (
            <div
              key={day.date}
              className={`bg-white rounded-2xl border overflow-hidden ${
                day.isToday
                  ? "border-porch-teal/40 ring-1 ring-porch-teal/20"
                  : "border-porch-cream-dark"
              }`}
            >
              {/* Day header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-porch-cream-dark/50">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-porch-brown">
                    {day.dayNameShort}
                  </span>
                  <span className="text-sm text-porch-brown-light/60">
                    {formatShortDate(day.date)}
                  </span>
                  {day.isToday && (
                    <span className="text-[10px] font-semibold bg-porch-teal text-white px-1.5 py-0.5 rounded-full">
                      TODAY
                    </span>
                  )}
                </div>
                {!day.isClosed && (
                  <div className="text-right">
                    <p className="text-sm font-medium text-porch-brown">
                      ${day.predictedRevenue.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-porch-brown-light/50">
                      {day.totalRecommendedHours} staff hrs
                    </p>
                  </div>
                )}
              </div>

              {/* Event badge */}
              {day.event && (
                <div className="px-4 py-2 bg-porch-teal/5 border-b border-porch-cream-dark/50">
                  <span className="text-xs font-medium text-porch-teal">
                    {day.event.name} ({day.event.adjustmentPct > 0 ? "+" : ""}{day.event.adjustmentPct}%)
                  </span>
                </div>
              )}

              {/* Closed state */}
              {day.isClosed && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-medium text-porch-brown-light/40">Closed</p>
                </div>
              )}

              {/* Hourly grid */}
              {!day.isClosed && day.hours.length > 0 && (
                <div className="px-4 py-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {day.hours.map((h: any) => (
                      <div
                        key={h.hour}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 ${getIntensityStyles(h.intensity)}`}
                      >
                        <span className="text-xs font-medium opacity-80">
                          {h.hourLabel}
                        </span>
                        <span
                          className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${getIntensityBadgeBg(h.intensity)}`}
                        >
                          {h.recommendedStaff}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Week summary */}
          <div className="bg-white rounded-2xl border border-porch-cream-dark px-4 py-4">
            <h3 className="text-sm font-semibold text-porch-brown mb-2">Week Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-bold text-porch-brown">
                  {scheduleData.weekTotals.totalStaffHours}
                </p>
                <p className="text-xs text-porch-brown-light/60">Total staff hours</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-porch-brown">
                  ${scheduleData.weekTotals.totalPredictedRevenue.toLocaleString()}
                </p>
                <p className="text-xs text-porch-brown-light/60">Predicted revenue</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
