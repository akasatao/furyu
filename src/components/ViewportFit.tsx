"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * 子の自然高さが親に収まるよう、全体を均一に縮小する（上基準）。
 * minScale が 1 以上のときだけ縮小せず、収まりきらなければスクロールする。
 * fill のときは縮めず、子が親の高さいっぱいを使う（中の領域でスクロールする）。
 */
export function ViewportFit({
  children,
  className = "",
  minScale = 0.68,
  fill = false,
}: {
  children: ReactNode;
  className?: string;
  minScale?: number;
  fill?: boolean;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [scrollable, setScrollable] = useState(false);

  useLayoutEffect(() => {
    if (fill) {
      setScale(1);
      setScrollable(false);
      return;
    }
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const availableH = outer.clientHeight;
      const availableW = outer.clientWidth;
      const prevTransform = inner.style.transform;
      const prevMargin = inner.style.marginBottom;
      inner.style.transform = "none";
      inner.style.marginBottom = "0";
      const neededH = inner.scrollHeight;
      const neededW = inner.scrollWidth;
      inner.style.transform = prevTransform;
      inner.style.marginBottom = prevMargin;

      if (neededH <= 0 || availableH <= 0) {
        setScale(1);
        setNaturalHeight(neededH);
        setScrollable(false);
        return;
      }

      const next = Math.min(
        1,
        availableH / neededH,
        neededW > 0 ? availableW / neededW : 1,
      );
      setNaturalHeight(neededH);
      if (next >= 1) {
        setScale(1);
        setScrollable(false);
      } else if (minScale >= 1) {
        setScale(1);
        setScrollable(true);
      } else {
        setScale(next);
        setScrollable(false);
      }
    };

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(update);
    });
    ro.observe(outer);
    ro.observe(inner);
    update();
    return () => ro.disconnect();
  }, [fill, minScale]);

  const fitted = scale < 1 && !scrollable;

  return (
    <div
      ref={outerRef}
      className={`flex min-h-0 w-full flex-1 flex-col overflow-x-hidden ${
        fill || !scrollable
          ? "overflow-hidden"
          : "overflow-y-auto overscroll-contain"
      } ${className}`}
    >
      <div
        ref={innerRef}
        className={
          fill
            ? "flex h-full min-h-0 w-full flex-1 flex-col"
            : "w-full origin-top"
        }
        style={
          fitted
            ? {
                transform: `scale(${scale})`,
                transformOrigin: "top center",
                marginBottom: naturalHeight * (scale - 1),
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
