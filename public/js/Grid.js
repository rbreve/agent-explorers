// ── Grid coordinate system ──────────────────────────────────────────
// Converts between pixel (world) coordinates and tile (grid) coordinates.
// Grid origin (0,0) is bottom-left, matching the Three.js coordinate system.

export const TILE_SIZE = 40;   // pixels per tile
export const GRID_COLS = 30;   // 1200 / 40
export const GRID_ROWS = 20;   // 800 / 40
export const WORLD_WIDTH = TILE_SIZE * GRID_COLS;   // 1200
export const WORLD_HEIGHT = TILE_SIZE * GRID_ROWS;  // 800

export class Grid {
  // Pixel → grid tile (floored)
  static toGrid(px, py) {
    return {
      col: Math.floor(px / TILE_SIZE),
      row: Math.floor(py / TILE_SIZE),
    };
  }

  // Grid tile → pixel center of that tile
  static toPixel(col, row) {
    return {
      x: col * TILE_SIZE + TILE_SIZE / 2,
      y: row * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  // Pixel → grid coordinate string "(col, row)"
  static toLabel(px, py) {
    const { col, row } = Grid.toGrid(px, py);
    return `(${col},${row})`;
  }

  // Grid → pixel (top-left corner of tile)
  static toPixelCorner(col, row) {
    return {
      x: col * TILE_SIZE,
      y: row * TILE_SIZE,
    };
  }

  // Manhattan distance in grid tiles between two pixel positions
  static tileDistance(x1, y1, x2, y2) {
    const g1 = Grid.toGrid(x1, y1);
    const g2 = Grid.toGrid(x2, y2);
    return Math.abs(g1.col - g2.col) + Math.abs(g1.row - g2.row);
  }

  // Euclidean distance in tiles (from pixel coords)
  static tileDist(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2) / TILE_SIZE;
  }

  // Clamp grid coords to valid range
  static clamp(col, row) {
    return {
      col: Math.max(0, Math.min(GRID_COLS - 1, col)),
      row: Math.max(0, Math.min(GRID_ROWS - 1, row)),
    };
  }

  // Check if grid coords are in bounds
  static inBounds(col, row) {
    return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
  }

  // Snap pixel position to the center of its tile
  static snap(px, py) {
    const { col, row } = Grid.toGrid(px, py);
    return Grid.toPixel(col, row);
  }
}
