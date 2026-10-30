"use client";

import VideoTile from "./VideoTile";
import AiTeacherTile from "./AiTeacherTile";

/** The AI teacher has its own tile; everyone else is a camera/screen. */
function Tile(props) {
  return props.tile.ai ? <AiTeacherTile {...props} /> : <VideoTile {...props} />;
}

function gridCols(n) {
  if (n <= 1) return "grid-cols-1";
  if (n <= 4) return "grid-cols-2";
  if (n <= 9) return "grid-cols-2 md:grid-cols-3";
  return "grid-cols-3 md:grid-cols-4";
}

/**
 * Video area. "strip" is the compact filmstrip above the code editor;
 * "stage" fills the page with either a big tile plus a side strip (when a
 * screen is shared or someone is pinned) or an even grid.
 */
export default function CallStage({ tiles, pinned, onPin, mode }) {
  const stageKey = pinned && tiles.some((t) => t.key === pinned) ? pinned : tiles.find((t) => t.isScreen)?.key || null;
  const stage = tiles.find((t) => t.key === stageKey);
  const rest = tiles.filter((t) => t.key !== stageKey);
  const ordered = stage ? [stage, ...rest] : tiles;

  if (mode === "strip") {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
        {ordered.map((t) => (
          <Tile key={t.key} tile={t} pinned={t.key === pinned} onPin={onPin} className={`aspect-video shrink-0 ${t.ai ? "h-36 sm:h-44" : "h-24 sm:h-28"}`} />
        ))}
      </div>
    );
  }

  if (stage) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <Tile tile={stage} big pinned={stage.key === pinned} onPin={onPin} className="min-h-[40vh] flex-1 lg:min-h-0" />
        {rest.length > 0 && (
          <div className="flex gap-2 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden" style={{ scrollbarWidth: "thin" }}>
            {rest.map((t) => (
              <Tile key={t.key} tile={t} pinned={false} onPin={onPin} className="aspect-video h-24 shrink-0 lg:h-auto lg:w-full" />
            ))}
          </div>
        )}
      </div>
    );
  }

  // One or two people: keep video proportions and centre them instead of
  // stretching tiles across the whole stage.
  if (tiles.length <= 2) {
    return (
      <div className={`qc-stage flex min-h-0 flex-1 items-center justify-center gap-3 ${tiles.length === 2 ? "qc-duo" : ""}`}>
        {tiles.map((t) => (
          <Tile key={t.key} tile={t} big pinned={false} onPin={onPin} className="qc-stage-tile aspect-video shrink-0" />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid min-h-0 flex-1 auto-rows-fr gap-3 ${gridCols(tiles.length)}`}>
      {tiles.map((t) => (
        <Tile key={t.key} tile={t} big={tiles.length <= 2} pinned={false} onPin={onPin} className="min-h-[160px]" />
      ))}
    </div>
  );
}
