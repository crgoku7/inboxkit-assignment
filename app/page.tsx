"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const keyFor = (row: number, col: number) => `${row}:${col}`;
const BASE_CELL = 18;
const MIN_SCALE = 0.4;
const MAX_SCALE = 3.5;
const EDGE_PADDING = 18;

type ViewState = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type HoverState = {
  row: number;
  col: number;
  ownerName?: string;
  ownedByMe: boolean;
  ownedByOther: boolean;
};

export default function Home() {
  const { user, isSignedIn } = useUser();
  const grid = useQuery(api.blocks.getGrid);
  const claimBlock = useMutation(api.blocks.claimBlock);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>({
    scale: 1,
    offsetX: 20,
    offsetY: 20,
  });
  const [hover, setHover] = useState<HoverState | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const initializedRef = useRef(false);
  const dragRef = useRef({
    isDown: false,
    moved: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  });

  const clampView = useCallback(
    (next: ViewState) => {
      if (!grid) {
        return next;
      }
      const { width, height } = containerSize;
      if (!width || !height) {
        return next;
      }

      const boardWidth = grid.cols * BASE_CELL * next.scale;
      const boardHeight = grid.rows * BASE_CELL * next.scale;
      let offsetX = next.offsetX;
      let offsetY = next.offsetY;

      if (boardWidth + EDGE_PADDING * 2 <= width) {
        offsetX = (width - boardWidth) / 2;
      } else {
        const minX = width - boardWidth - EDGE_PADDING;
        const maxX = EDGE_PADDING;
        offsetX = Math.min(maxX, Math.max(minX, offsetX));
      }

      if (boardHeight + EDGE_PADDING * 2 <= height) {
        offsetY = (height - boardHeight) / 2;
      } else {
        const minY = height - boardHeight - EDGE_PADDING;
        const maxY = EDGE_PADDING;
        offsetY = Math.min(maxY, Math.max(minY, offsetY));
      }

      return { scale: next.scale, offsetX, offsetY };
    },
    [containerSize, grid]
  );

  const blockMap = useMemo(() => {
    if (!grid) {
      return new Map();
    }
    return new Map(grid.blocks.map((block) => [block.key, block]));
  }, [grid]);

  const stats = useMemo(() => {
    if (!grid) {
      return { total: 0, claimed: 0, mine: 0 };
    }
    const total = grid.rows * grid.cols;
    const claimed = grid.blocks.length;
    const mine = grid.blocks.filter((block) => block.ownerId === user?.id)
      .length;
    return { total, claimed, mine };
  }, [grid, user?.id]);

  const measureContainer = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    setContainerSize({ width: rect.width, height: rect.height });
  }, []);

  useLayoutEffect(() => {
    measureContainer();
  }, [measureContainer]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });

    observer.observe(containerRef.current);
    window.addEventListener("resize", measureContainer);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureContainer);
    };
  }, [measureContainer]);

  useEffect(() => {
    if (!grid || initializedRef.current || !containerSize.width) {
      return;
    }

    const boardWidth = grid.cols * BASE_CELL;
    const boardHeight = grid.rows * BASE_CELL;
    const scale = Math.min(
      containerSize.width / boardWidth,
      containerSize.height / boardHeight,
      1
    );
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * 0.9));
    const offsetX = (containerSize.width - boardWidth * nextScale) / 2;
    const offsetY = (containerSize.height - boardHeight * nextScale) / 2;

    const nextView = clampView({ scale: nextScale, offsetX, offsetY });
    setView(nextView);
    initializedRef.current = true;
  }, [clampView, grid, containerSize]);

  useEffect(() => {
    if (!grid || !containerSize.width) {
      return;
    }
    setView((prev) => {
      const next = clampView(prev);
      if (
        next.scale === prev.scale &&
        next.offsetX === prev.offsetX &&
        next.offsetY === prev.offsetY
      ) {
        return prev;
      }
      return next;
    });
  }, [clampView, containerSize.width, grid]);

  useEffect(() => {
    if (!grid || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const { width, height } = containerSize;
    if (!width || !height) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f7f1e9";
    ctx.fillRect(0, 0, width, height);

    const cellSize = BASE_CELL * view.scale;
    if (cellSize <= 0) {
      return;
    }

    const startCol = Math.max(0, Math.floor(-view.offsetX / cellSize) - 1);
    const endCol = Math.min(
      grid.cols - 1,
      Math.ceil((width - view.offsetX) / cellSize) + 1
    );
    const startRow = Math.max(0, Math.floor(-view.offsetY / cellSize) - 1);
    const endRow = Math.min(
      grid.rows - 1,
      Math.ceil((height - view.offsetY) / cellSize) + 1
    );

    const stroke = "rgba(27, 27, 29, 0.2)";
    const freeFill = "#ffffff";
    const meFill = "#ff6b4a";
    const otherFill = "#1b4d7a";

    const boardWidth = grid.cols * cellSize;
    const boardHeight = grid.rows * cellSize;
    ctx.strokeStyle = "rgba(27, 27, 29, 0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      view.offsetX + 1,
      view.offsetY + 1,
      boardWidth - 2,
      boardHeight - 2
    );

    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const key = keyFor(row, col);
        const block = blockMap.get(key);
        const ownedByMe = block?.ownerId && block.ownerId === user?.id;
        const ownedByOther = block?.ownerId && block.ownerId !== user?.id;
        const fill = ownedByMe ? meFill : ownedByOther ? otherFill : freeFill;
        const x = view.offsetX + col * cellSize;
        const y = view.offsetY + row * cellSize;

        ctx.fillStyle = fill;
        ctx.fillRect(x, y, cellSize, cellSize);

        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);

        if (key === claimingKey) {
          ctx.strokeStyle = "rgba(255, 107, 74, 0.6)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        }
      }
    }

    if (hover) {
      const x = view.offsetX + hover.col * cellSize;
      const y = view.offsetY + hover.row * cellSize;
      ctx.strokeStyle = "rgba(27, 27, 29, 0.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    }
  }, [blockMap, claimingKey, containerSize, grid, hover, user?.id, view]);

  const handleClaim = async (row: number, col: number) => {
    if (!isSignedIn) {
      return;
    }
    const key = keyFor(row, col);
    setClaimingKey(key);
    try {
      await claimBlock({ row, col });
    } finally {
      setClaimingKey(null);
    }
  };

  const getCellFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!grid || !canvasRef.current) {
        return null;
      }
      const rect = canvasRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const cellSize = BASE_CELL * view.scale;
      const col = Math.floor((x - view.offsetX) / cellSize);
      const row = Math.floor((y - view.offsetY) / cellSize);
      if (row < 0 || col < 0 || row >= grid.rows || col >= grid.cols) {
        return null;
      }
      return { row, col };
    },
    [grid, view]
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) {
      return;
    }

    containerRef.current.setPointerCapture(event.pointerId);
    dragRef.current = {
      isDown: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: view.offsetX,
      startOffsetY: view.offsetY,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.isDown) {
      const cell = getCellFromPoint(event.clientX, event.clientY);
      if (!cell) {
        setHover(null);
        return;
      }
      const key = keyFor(cell.row, cell.col);
      const block = blockMap.get(key);
      const ownedByMe = block?.ownerId && block.ownerId === user?.id;
      const ownedByOther = block?.ownerId && block.ownerId !== user?.id;
      setHover({
        row: cell.row,
        col: cell.col,
        ownerName: block?.ownerName,
        ownedByMe: Boolean(ownedByMe),
        ownedByOther: Boolean(ownedByOther),
      });
      return;
    }

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true;
    }
    setView((prev) => {
      const next = clampView({
        ...prev,
        offsetX: dragRef.current.startOffsetX + dx,
        offsetY: dragRef.current.startOffsetY + dy,
      });
      if (
        next.scale === prev.scale &&
        next.offsetX === prev.offsetX &&
        next.offsetY === prev.offsetY
      ) {
        return prev;
      }
      return next;
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) {
      return;
    }
    containerRef.current.releasePointerCapture(event.pointerId);
    const wasDrag = dragRef.current.moved;
    dragRef.current.isDown = false;

    if (!wasDrag) {
      const cell = getCellFromPoint(event.clientX, event.clientY);
      if (cell) {
        handleClaim(cell.row, cell.col);
      }
    }
  };

  const handlePointerLeave = () => {
    setHover(null);
  };

  const zoomAt = useCallback(
    (nextScale: number, clientX: number, clientY: number) => {
      if (!canvasRef.current) {
        return;
      }
      const rect = canvasRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const cellSize = BASE_CELL * view.scale;
      const worldX = (x - view.offsetX) / cellSize;
      const worldY = (y - view.offsetY) / cellSize;
      const nextCellSize = BASE_CELL * nextScale;
      const offsetX = x - worldX * nextCellSize;
      const offsetY = y - worldY * nextCellSize;
      const next = clampView({ scale: nextScale, offsetX, offsetY });
      setView(next);
    },
    [clampView, view]
  );

  const handleWheelDelta = useCallback(
    (deltaY: number, clientX: number, clientY: number) => {
      const delta = -deltaY * 0.001;
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, view.scale * (1 + delta))
      );
      zoomAt(nextScale, clientX, clientY);
    },
    [view.scale, zoomAt]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      handleWheelDelta(event.deltaY, event.clientX, event.clientY);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [handleWheelDelta]);

  const handleZoomButton = (direction: "in" | "out") => {
    const factor = direction === "in" ? 1.15 : 0.85;
    const nextScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, view.scale * factor)
    );
    const centerX = containerSize.width / 2;
    const centerY = containerSize.height / 2;
    zoomAt(nextScale, centerX, centerY);
  };

  const handleResetView = () => {
    initializedRef.current = false;
    if (grid) {
      const boardWidth = grid.cols * BASE_CELL;
      const boardHeight = grid.rows * BASE_CELL;
      const scale = Math.min(
        containerSize.width / boardWidth,
        containerSize.height / boardHeight,
        1
      );
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * 0.9));
      const offsetX = (containerSize.width - boardWidth * nextScale) / 2;
      const offsetY = (containerSize.height - boardHeight * nextScale) / 2;
      setView(clampView({ scale: nextScale, offsetX, offsetY }));
      initializedRef.current = true;
    }
  };

  if (!grid) {
    return (
      <div className="page">
        <div className="shell">
          <header className="hero">
            <div>
              <p className="eyebrow">Live shared grid</p>
              <h1>Claim blocks together in real time.</h1>
              <p className="lead">
                Syncing the board, resolving ownership, and keeping everyone in
                lockstep.
              </p>
            </div>
            <div className="auth">
              <span className="pill">Connecting...</span>
            </div>
          </header>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="shell">
        <header className="hero">
          <div>
            <p className="eyebrow">Live shared grid</p>
            <h1>Claim blocks together in real time.</h1>
            <p className="lead">
              Every click runs through a backend-authoritative mutation so
              ownership stays consistent under heavy concurrency.
            </p>
          </div>
          <div className="auth">
            {isSignedIn ? (
              <div className="auth-meta">
                <span className="pill">Signed in</span>
                <UserButton />
              </div>
            ) : (
              <SignInButton>
                <button className="cta">Sign in to claim</button>
              </SignInButton>
            )}
          </div>
        </header>

        <section className="board">
          <div className="board-panel">
            <div className="panel-card">
              <h2>Board status</h2>
              <div className="stats">
                <div>
                  <span className="stat-label">Claimed</span>
                  <span className="stat-value">
                    {stats.claimed} / {stats.total}
                  </span>
                </div>
                <div>
                  <span className="stat-label">Your blocks</span>
                  <span className="stat-value">{stats.mine}</span>
                </div>
              </div>
              <div className="legend">
                <div>
                  <span className="swatch swatch-free" />
                  <span>Unclaimed</span>
                </div>
                <div>
                  <span className="swatch swatch-me" />
                  <span>Owned by you</span>
                </div>
                <div>
                  <span className="swatch swatch-other" />
                  <span>Owned by others</span>
                </div>
              </div>
              {!isSignedIn && (
                <p className="panel-note">
                  Sign in to claim blocks and see your ownership color.
                </p>
              )}
            </div>
            <div className="panel-card">
              <h3>How it works</h3>
              <ul className="steps">
                <li>Pick any open block in the grid.</li>
                <li>Ownership is written once on the server.</li>
                <li>Every connected client updates instantly.</li>
              </ul>
            </div>
          </div>

          <div className="grid-stage">
            <div className="grid-tools">
              <button
                className="tool-button"
                type="button"
                onClick={() => handleZoomButton("in")}
              >
                +
              </button>
              <button
                className="tool-button"
                type="button"
                onClick={() => handleZoomButton("out")}
              >
                -
              </button>
              <button
                className="tool-button"
                type="button"
                onClick={handleResetView}
              >
                Reset
              </button>
            </div>
            <div className="grid-hud">
              {hover ? (
                <div>
                  <strong>
                    {hover.row + 1},{hover.col + 1}
                  </strong>
                  <span>
                    {hover.ownerName
                      ? `Owned by ${hover.ownerName}`
                      : "Unclaimed"}
                  </span>
                </div>
              ) : (
                <div>
                  <strong>Pan</strong>
                  <span>Drag to move, scroll to zoom.</span>
                </div>
              )}
            </div>
            <div
              ref={containerRef}
              className="grid-viewport"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
            >
              <canvas ref={canvasRef} className="grid-canvas" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
