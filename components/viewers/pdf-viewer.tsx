"use client";
import { ChevronDown, ChevronUp, Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "../ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const PDF_OPTIONS = {
  wasmUrl: "/pdfjs/wasm/",
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  iccUrl: "/pdfjs/iccs/",
};

const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export default function PdfViewer({
  url,
  initialPage = 1,
  onPageChange,
  toolbarExtra,
}: {
  url: string;
  initialPage?: number;
  onPageChange?: (page: number, total: number) => void;
  toolbarExtra?: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [numPages, setNumPages] = useState(0);
  const [aspect, setAspect] = useState(1.294);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [error, setError] = useState<string>();
  const restored = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Ignore 0 while hidden, or every page unmounts and the scroll position is lost.
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && setContainerWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseWidth = Math.max(240, Math.min(containerWidth - 32, 920));
  const pageWidth = Math.round(baseWidth * zoom);
  const pageHeight = Math.round(pageWidth * aspect);

  const goTo = useCallback(
    (n: number, smooth = false) => {
      const p = Math.max(1, Math.min(numPages || 1, n));
      const el = pageRefs.current[p - 1];
      if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: smooth ? "smooth" : "auto" });
    },
    [numPages],
  );

  // Track the page in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !numPages) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mark = el.scrollTop + el.clientHeight * 0.35;
        let p = 1;
        for (let i = 0; i < numPages; i++) {
          const w = pageRefs.current[i];
          if (w && w.offsetTop <= mark) p = i + 1;
          else break;
        }
        setCurrent(p);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [numPages]);

  useEffect(() => {
    setPageInput(String(current));
    if (numPages) onPageChange?.(current, numPages);
  }, [current, numPages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore last page once layout is ready.
  useEffect(() => {
    if (restored.current || !numPages || !containerWidth) return;
    restored.current = true;
    if (initialPage > 1) requestAnimationFrame(() => goTo(initialPage));
  }, [numPages, containerWidth, initialPage, goTo]);

  // Keep the current page anchored when zooming.
  const zoomTo = (z: number) => {
    const keep = current;
    setZoom(z);
    requestAnimationFrame(() => requestAnimationFrame(() => goTo(keep)));
  };
  const zoomStep = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z >= zoom - 0.001);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i === -1 ? 4 : i) + dir))];
    zoomTo(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-surface px-3 py-1.5">
        <Button variant="ghost" size="icon" onClick={() => goTo(current - 1, true)} disabled={current <= 1} aria-label="Previous page">
          <ChevronUp />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => goTo(current + 1, true)} disabled={current >= numPages} aria-label="Next page">
          <ChevronDown />
        </Button>
        <form
          className="flex items-center gap-1.5 text-sm text-muted"
          onSubmit={(e) => {
            e.preventDefault();
            goTo(parseInt(pageInput) || 1);
          }}
        >
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setPageInput(String(current))}
            className="h-8 w-12 rounded-md border border-border bg-surface-2 text-center text-foreground tabular-nums outline-none focus:border-primary"
            aria-label="Page number"
          />
          <span className="tabular-nums">/ {numPages || "–"}</span>
        </form>
        <div className="mx-2 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" onClick={() => zoomStep(-1)} aria-label="Zoom out">
          <Minus />
        </Button>
        <button onClick={() => zoomTo(1)} className="w-14 rounded-md py-1 text-center text-sm tabular-nums text-muted hover:bg-surface-2" title="Fit width">
          {Math.round(zoom * 100)}%
        </button>
        <Button variant="ghost" size="icon" onClick={() => zoomStep(1)} aria-label="Zoom in">
          <Plus />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => zoomTo(1)} aria-label="Fit width" className="hidden sm:inline-flex">
          <Maximize2 />
        </Button>
        <div className="ml-auto flex items-center gap-1">{toolbarExtra}</div>
      </div>

      <div ref={scrollRef} className="scrollbar-thin relative min-h-0 flex-1 overflow-auto bg-viewer">
        {error ? (
          <p className="p-10 text-center text-sm text-muted">Could not open this PDF: {error}</p>
        ) : (
          <Document
            file={url}
            options={PDF_OPTIONS}
            // Suspending would hide the whole viewer each time a page scrolls into range,
            // collapsing the list and snapping the scroll back to page 1.
            suspense={false}
            onLoadSuccess={async (pdf) => {
              setNumPages(pdf.numPages);
              pageRefs.current = new Array(pdf.numPages).fill(null);
              try {
                const p1 = await pdf.getPage(1);
                const vp = p1.getViewport({ scale: 1 });
                setAspect(vp.height / vp.width);
              } catch {}
            }}
            onLoadError={(e) => setError(e.message)}
            loading={<PdfSkeleton width={baseWidth} />}
            className="flex flex-col items-center gap-4 px-4 py-4"
          >
            {containerWidth > 0 &&
              Array.from({ length: numPages }, (_, i) => {
                const n = i + 1;
                const near = Math.abs(n - current) <= 2 || (n - current >= 0 && n - current <= 3);
                return (
                  <div
                    key={n}
                    ref={(el) => {
                      pageRefs.current[i] = el;
                    }}
                    data-page={n}
                    style={{ width: pageWidth, minHeight: pageHeight }}
                    className="relative shrink-0"
                  >
                    {near ? (
                      <Page
                        pageNumber={n}
                        width={pageWidth}
                        loading={<div className="skeleton rounded" style={{ width: pageWidth, height: pageHeight }} />}
                      />
                    ) : (
                      <div className="rounded bg-surface/60" style={{ width: pageWidth, height: pageHeight }} />
                    )}
                  </div>
                );
              })}
          </Document>
        )}
      </div>
    </div>
  );
}

function PdfSkeleton({ width }: { width: number }) {
  return <div className="skeleton rounded" style={{ width, height: width * 1.294 }} />;
}
