"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const MOBILE_MAX = 640;
/** 每个数据点预留的横向空间（含间距） */
const PX_PER_POINT = 52;
/** Y 轴等边距 */
const CHART_CHROME = 80;

export function ScrollableChart({
  pointCount,
  height,
  children,
}: {
  pointCount: number;
  height: number;
  children: ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState<number | "100%">("100%");
  const [needsScroll, setNeedsScroll] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const update = () => {
      const containerWidth = el.clientWidth;
      if (containerWidth <= 0) return;

      const isMobile = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
      const desired = pointCount * PX_PER_POINT + CHART_CHROME;

      if (isMobile && desired > containerWidth + 8) {
        setChartWidth(desired);
        setNeedsScroll(true);
      } else {
        setChartWidth("100%");
        setNeedsScroll(false);
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [pointCount]);

  return (
    <div>
      {needsScroll && hintVisible ? (
        <div className="mb-2 flex justify-center sm:hidden">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[rgba(18,26,43,0.75)] px-2.5 py-1 text-[11px] text-[var(--muted)]">
            <span aria-hidden className="inline-flex animate-pulse tracking-tight">
              ← →
            </span>
            左右滑动查看完整曲线
          </span>
        </div>
      ) : null}

      <div className="relative">
        <div
          ref={scrollerRef}
          className={
            needsScroll
              ? // 必须同时写 overflow-y，否则 overflow-x 会把 overflow-y 算成 auto，桌面端会冒出竖滚动条
                "overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              : "overflow-hidden"
          }
          onScroll={() => {
            if (hintVisible) setHintVisible(false);
          }}
        >
          <div className="min-w-full" style={{ width: chartWidth, height }}>
            {children}
          </div>
        </div>

        {needsScroll ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[rgba(18,26,43,0.95)] to-transparent sm:hidden"
          />
        ) : null}
      </div>
    </div>
  );
}
