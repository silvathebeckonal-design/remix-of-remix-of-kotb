// Canvas renderer for the chess scene. World units: 1 unit = 32 source pixels (sprite PPU),
// camera orthographic size 7 (14 units tall).
import {
  COLORS,
  CONSTANTS,
  ESTIMATED,
  SCENE_BACKGROUND,
  SCENE_BOOK,
  type ColorName,
} from "../data";
import { assetUrl, SPRITES, cssColor, getImage, getTinted, rgbOf, tex } from "../assets";
import { evaluateCurve } from "../animationCurve";
import { linkPosition } from "../rulebook";
import { at } from "../rng";
import { doScreenshake } from "../settings";
import type { ChessScene, PieceObj } from "./ChessScene";
import { drawSrc, frameOf, rect, sprite, type View } from "./draw";
import {
  LILY_CLUSTERS,
  LilyPads,
  clusterOf,
  drawBridgeSequence,
  drawWater,
  isLily,
  visibleSequences,
} from "./overworld";
import { drawDuck } from "./duck";

export type { View } from "./draw";
export { screenToWorld } from "./draw";

export function makeView(scene: ChessScene, w: number, h: number): View {
  let camX = scene.camX;
  let camY = 0;
  if (scene.cameraShakeUntil > scene.time && doScreenshake()) {
    camX += (Math.random() * 2 - 1) * scene.cameraShakeMag;
    camY += (Math.random() * 2 - 1) * scene.cameraShakeMag;
  }
  return { w, h, ppu: h / (CONSTANTS.cameraOrthoSize * 2), camX, camY };
}

function bgColor(name: string | null): ColorName | null {
  return name && name in COLORS ? (name as ColorName) : null;
}

export function render(ctx: CanvasRenderingContext2D, scene: ChessScene, v: View) {
  const t = scene.time;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = cssColor(COLORS.Black);
  ctx.fillRect(0, 0, v.w, v.h);

  // ---- Canal water, swimming duck, then the bridge arena (scene sprites, sorted by sortingOrder)
  drawWater(ctx, v, t);
  if (scene.duck.layer === "Background")
    drawDuck(ctx, v, scene.duck, t, () => drawDuckPiece(ctx, v, scene));
  drawArena(ctx, v, t, scene.lilies);

  // ---- Board squares
  for (const sq of scene.boardSquares) {
    if (!sq.inBoard && !scene.oobVisible) continue;
    sprite(ctx, v, "board_tile", sq.x, sq.y, { color: sq.color, alpha: sq.inBoard ? 1 : 0.1 });
  }
  drawTapRings(ctx, v, scene);
  scene.ambience.draw(ctx, v, 0, 0);
  for (const s of scene.slippery)
    if (s.active) sprite(ctx, v, "slippery_tile_v2", s.x, s.y, { color: "Outline" });

  // ---- Ghost outlines at origin while grabbed
  for (const g of scene.ghosts) {
    sprite(
      ctx,
      v,
      g.piece.trollIdle ? SPRITES.trollIdleOutline[0] : g.piece.data.outline,
      g.x,
      g.y + 0.25,
      {
        color: pieceFillColor(g.piece),
        alpha: 0.45,
        flipX: g.piece.flipX,
      },
    );
  }

  const pieces = scene.all.filter((p) => !p.removed || p.halo > 0).sort((a, b) => b.y - a.y);
  for (const p of pieces) if (!p.onTop && !p.isDuckBound) drawPiece(ctx, v, scene, p);
  if (scene.duck.layer === "Fill")
    drawDuck(ctx, v, scene.duck, t, () => drawDuckPiece(ctx, v, scene));

  // ---- Text balloon above the troll king
  if (scene.textBalloon && !scene.textBalloon.removed) {
    const k = scene.textBalloon;
    const by = k.y + 0.25 + CONSTANTS.textBalloonOffsetY;
    sprite(ctx, v, "troll_speak_fill1", k.x, by, { color: "White" });
    const f = SPRITES.trollSpeakOutline[Math.floor((t - scene.textBalloonStart) * 4) % 4];
    sprite(ctx, v, f, k.x, by, { color: "Outline" });
  }

  drawBook(ctx, v, scene);

  // ---- Flash overlay (king kill / accusation)
  if (scene.flash) {
    ctx.fillStyle = cssColor(COLORS[scene.flash]);
    ctx.fillRect(0, 0, v.w, v.h);
  }
  for (const p of pieces) if (p.onTop && !p.isDuckBound) drawPiece(ctx, v, scene, p);
  if (scene.duck.layer === "Top")
    drawDuck(ctx, v, scene.duck, t, () => drawDuckPiece(ctx, v, scene));

  // ---- Damage numbers ("X2", "+1 Scrap!")
  for (const d of scene.damageNumbers) {
    const k = (t - d.start) / 1.5;
    const x = (d.piece.x - v.camX) * v.ppu + v.w / 2;
    const y = v.h / 2 - (d.piece.y + 1.2 + k * 0.8 - v.camY) * v.ppu;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
    ctx.font = `${Math.round(v.ppu * 0.6)}px Alagard, monospace`;
    ctx.textAlign = "center";
    ctx.lineWidth = Math.max(2, v.ppu * 0.12);
    ctx.strokeStyle = cssColor(COLORS.Outline);
    ctx.fillStyle = cssColor(COLORS.White);
    ctx.strokeText(d.text, x, y);
    ctx.fillText(d.text, x, y);
    ctx.restore();
  }
  drawHourglass(ctx, v, scene);
}

/** SpeedChessManager UI: border / out (top sand, fillAmount 1-k) / in (bottom sand, fillAmount k), flips per turn. */
function drawHourglass(ctx: CanvasRenderingContext2D, v: View, scene: ChessScene) {
  const hg = scene.hourglass;
  if (!hg) return;
  const E = ESTIMATED.speedChess;
  const u = v.h / 1080; // 1920x1080 reference canvas
  const size = { w: 48 * E.uiScale * u, h: 64 * E.uiScale * u };
  let cx = v.w / 2 + E.uiX * u;
  let cy = v.h / 2 - E.uiY * u;
  if (hg.shakeUntil > scene.time) {
    cx += (Math.random() * 2 - 1) * E.shakePx * E.uiScale * u;
    cy += (Math.random() * 2 - 1) * E.shakePx * E.uiScale * u;
  }
  const k = hg.time > 0 ? Math.min(1, hg.elapsed / hg.time) : 0;
  const flipLen = E.flipRotationCurve.at(-1)?.time ?? 1;
  const f = hg.flip;
  const fk = f ? Math.min(1, (scene.time - f.start) / flipLen) : 1;
  const rot = f
    ? f.from + (f.to - f.from) * evaluateCurve(E.flipRotationCurve, scene.time - f.start)
    : 0;
  const border = f ? mixRgb(f.fromColor, f.toColor, fk) : rgbOf("White");
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-rot * Math.PI) / 180);
  ctx.imageSmoothingEnabled = false;
  const draw = (name: string, color: [number, number, number], alpha = 1, fill = 1) => {
    const img = getImage(tex(name));
    const tinted = getTinted(tex(name), color);
    if (!img || !tinted || fill <= 0) return;
    const sh = img.naturalHeight * fill;
    ctx.globalAlpha = alpha;
    // Image.fillAmount (vertical, origin bottom)
    ctx.drawImage(
      tinted,
      0,
      img.naturalHeight - sh,
      img.naturalWidth,
      sh,
      -size.w / 2,
      size.h / 2 - size.h * fill,
      size.w,
      size.h * fill,
    );
  };
  draw("hourglass_out", rgbOf("Utility"), hg.opacity, 1 - k);
  draw("hourglass_in", rgbOf("Utility"), hg.opacity, k);
  draw("hourglass_fill", border);
  draw("hourglass", rgbOf("Outline"));
  ctx.restore();
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  k: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Chess arena scenery: the bridge board plus the BridgeSequence prefab (with live lily pads). */
function drawArena(ctx: CanvasRenderingContext2D, v: View, t: number, lilies: LilyPads) {
  const clusters = new Map(LILY_CLUSTERS.map((c) => [c.key, c]));
  for (const s of BG_SORTED) {
    if (s.sprite === "Square") {
      const c = bgColor(s.color);
      rect(ctx, v, s.x, s.y, s.sx ?? 1, s.sy ?? 1, cssColor(c ? COLORS[c] : s.tint));
      continue;
    }
    const c = isLily(s) ? clusters.get(clusterOf(s)) : undefined;
    const y = c ? s.y + lilies.offset(0, c, t) : s.y;
    sprite(ctx, v, s.sprite, s.x, y, { color: bgColor(s.color), sx: s.sx, sy: s.sy });
  }
}

/** A piece carried by the duck is drawn right behind it (sortingOrder - 2 / - 1). */
function drawDuckPiece(ctx: CanvasRenderingContext2D, v: View, scene: ChessScene) {
  const p = scene.duck.heldPiece as PieceObj | null;
  if (p && !p.removed) drawPiece(ctx, v, scene, p);
}

const backdropLilies = new LilyPads();

/** Bridge scenery alone (title / dialogue backdrops): water + tiled BridgeSequence. */
export function renderBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  camY = 0,
) {
  const v: View = { w, h, ppu: h / (CONSTANTS.cameraOrthoSize * 2), camX: 0, camY };
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = cssColor(COLORS.Black);
  ctx.fillRect(0, 0, w, h);
  drawWater(ctx, v, t);
  for (const seq of visibleSequences(v)) drawBridgeSequence(ctx, v, t, backdropLilies, seq);
}

function pieceFillColor(p: PieceObj): ColorName {
  if (p.highlighted) return "Danger";
  if (p.color === "White") return "White";
  if (p.color === "Black") return "Black";
  return "Utility";
}

function drawPiece(ctx: CanvasRenderingContext2D, v: View, scene: ChessScene, p: PieceObj) {
  const t = scene.time;
  let x = p.x;
  let y = p.y + CONSTANTS.pieceImageOffsetY + p.liftY;
  if (p.shakeUntil > t) {
    x += (Math.random() * 2 - 1) * p.shakeMag;
    y += (Math.random() * 2 - 1) * p.shakeMag;
  }
  if (p.bob && !p.dragging) y += Math.sin(t * 4 + p.bobNoise * 10) * 0.05;
  const wob = p.bob ? 1 + Math.sin(t * 2 + p.scaleNoise * 10) * 0.025 : 1;
  const s = p.scale * wob;
  const alpha = p.alpha * scene.piecesFogAlpha;
  const outlineColor: ColorName = p.color === "Utility" ? "Black" : "Outline";
  let fill: string | undefined = p.data.fill;
  let outline: string | undefined = p.data.outline;
  if (p.trollIdle) {
    const i = Math.floor(t * 8) % SPRITES.trollIdleFill.length;
    fill = SPRITES.trollIdleFill[i];
    outline = SPRITES.trollIdleOutline[i];
  }
  if (p.halo > 0) {
    sprite(ctx, v, "halo_fill", x, y + 0.75, { color: "White", alpha: p.halo });
    sprite(ctx, v, "halo_outline", x, y + 0.75, { color: "Outline", alpha: p.halo });
  }
  if (p.removed) return;
  const o = { flipX: p.flipX, rot: p.rot, sx: s, sy: s, alpha };
  if (p.fillAnim) sprite(ctx, v, frameOf(p.fillAnim, t), x, y, { ...o, color: null });
  else if (!p.fillHidden) sprite(ctx, v, fill, x, y, { ...o, color: pieceFillColor(p) });
  if (p.outlineAnim) sprite(ctx, v, frameOf(p.outlineAnim, t), x, y, { ...o, color: "Outline" });
  else if (!p.outlineHidden) sprite(ctx, v, outline, x, y, { ...o, color: outlineColor });
  if (p.isSleeping && scene.turnCount > p.sleepTurn + CONSTANTS.sleepAfterTurn) {
    const k = (t * 0.5 + p.bobNoise) % 1;
    sprite(ctx, v, "sleepyZ", x + 0.3 + Math.sin(k * 6) * 0.1, y + 0.6 + k * 0.8, {
      color: "White",
      alpha: 1 - k,
    });
  }
}

const BG_SORTED = [...SCENE_BACKGROUND].sort((a, b) => a.order - b.order);
const BOOK_MAP = new Map(SCENE_BOOK.map((b) => [b.name ?? b.sprite, b]));
const book = (name: string): { x: number; y: number } => BOOK_MAP.get(name) ?? { x: 15, y: 0 };
const BOOK_REST = 15;

export const BOOK_BUTTONS = {
  close: { dx: book("rulebook_arrow").x - BOOK_REST, y: book("rulebook_arrow").y },
  toc: { dx: book("returntofirstpage").x - BOOK_REST, y: book("returntofirstpage").y },
  prev: { dx: book("bookflipcorner_left").x - BOOK_REST, y: book("bookflipcorner_left").y },
  next: { dx: book("bookflipcorner_right").x - BOOK_REST, y: book("bookflipcorner_right").y },
};
export const PAGE_Y = 0.37;

function pageImage(path: string) {
  return assetUrl(path);
}

function drawBook(ctx: CanvasRenderingContext2D, v: View, scene: ChessScene) {
  const t = scene.time;
  let bx = scene.bookX;
  let byOff = 0;
  if (scene.bookShakeUntil > t) {
    bx += (Math.random() * 2 - 1) * 0.05;
    byOff += (Math.random() * 2 - 1) * 0.05;
  }
  const bookAt = (name: string) => ({
    x: bx + (book(name).x - BOOK_REST),
    y: book(name).y + byOff,
  });
  let p = bookAt("book_backdrop");
  sprite(ctx, v, "book_backdrop", p.x, p.y);
  p = bookAt("book_icon");
  sprite(ctx, v, "book_icon", p.x, p.y, { color: "White" });
  p = bookAt("book_divider");
  sprite(ctx, v, "book_divider", p.x, p.y, { color: "Outline", alpha: 0.5 });
  p = bookAt("book_icon_outline");
  sprite(ctx, v, "book_icon_outline", p.x, p.y, { color: "Outline" });

  // pages: each page sprite covers the full spread; left/right halves are separate textures
  const pageY = PAGE_Y + byOff;
  const shake = (side: "left" | "right") =>
    scene.pageShake && scene.pageShake.side === side && scene.pageShake.until > t
      ? (Math.random() * 2 - 1) * 0.025
      : 0;
  const lx = bx + shake("left");
  const rx = bx + shake("right");
  drawSrc(ctx, v, pageImage(scene.leftPage.image), lx, pageY + shake("left"), {
    color: scene.pageColorLeft,
  });
  drawSrc(ctx, v, pageImage(scene.rightPage.image), rx, pageY + shake("right"), {
    color: scene.pageColorRight,
  });
  if (scene.hoverPage) {
    sprite(ctx, v, "book_page_highlight", bx, pageY, {
      color: "White",
      alpha: 0.35,
      flipX: scene.hoverPage === "right",
    });
  }

  // fog over unread pages
  for (const side of ["left", "right"] as const) {
    const page = side === "left" ? scene.leftPage : scene.rightPage;
    let alpha = 0;
    if (scene.isFogged(page)) alpha = 1;
    else if (scene.fogClearing && scene.fogClearing.side === side)
      alpha = Math.max(0, 1 - (t - scene.fogClearing.start) / 2);
    if (alpha <= 0) continue;
    const cx = bx + (side === "left" ? -2.45 : 2.45);
    for (let i = 0; i < 12; i++) {
      const gx = (i % 3) - 1;
      const gy = Math.floor(i / 3) - 1.5;
      const drift = Math.sin(t * 0.6 + i * 1.7) * 0.2;
      sprite(
        ctx,
        v,
        "fog_cloud",
        cx + gx * 1.4 + drift,
        pageY + gy * 2.2 + Math.cos(t * 0.5 + i) * 0.15,
        {
          color: "White",
          alpha,
          flipX: i % 2 === 0,
        },
      );
    }
  }

  // table of contents links
  const screen = at(scene.screens, scene.currentScreen);
  if (screen.isTableOfContents && !scene.isFlipping) {
    screen.links.forEach((link, i) => {
      const lp = linkPosition(link);
      const fogged = scene.isFogged(link.page);
      sprite(ctx, v, link.sprite, bx + lp.x, lp.y + byOff, {
        color: scene.hoverLink === i ? "Danger" : "Outline",
        alpha: fogged ? 0.35 : 1,
      });
    });
  }

  // page flip animation
  if (scene.flipAnim) {
    const i = Math.min(3, Math.floor(((t - scene.flipAnim.start) / CONSTANTS.bookFlipSeconds) * 4));
    const f = bookAt("PageFlipper(off)");
    sprite(ctx, v, SPRITES.bookFlip[i], f.x, f.y, { color: "White", flipX: scene.flipAnim.flipX });
    const fo = bookAt("PageFlipperOutline(off)");
    sprite(ctx, v, SPRITES.bookFlipOutline[i], fo.x, fo.y, {
      color: "Outline",
      flipX: scene.flipAnim.flipX,
    });
  }

  // buttons
  const atStart = scene.currentScreen <= 0;
  const atEnd = scene.currentScreen >= scene.screens.length - 1;
  p = bookAt("bookflipcorner_left");
  sprite(ctx, v, "bookflipcorner_left", p.x, p.y, { alpha: atStart ? 0.25 : 1 });
  p = bookAt("bookflipcorner_right");
  sprite(ctx, v, "bookflipcorner_right", p.x, p.y, { alpha: atEnd ? 0.25 : 1 });
  p = bookAt("returntofirstpage");
  sprite(ctx, v, "table_of_contents_icon", p.x, p.y);
  if (scene.isInspectingBook) {
    p = bookAt("rulebook_arrow");
    sprite(ctx, v, "rulebook_arrow", p.x, p.y);
  }
}

/** Tap ring: a quick double ring pulse with outward sparks where the board was pressed (ESTIMATED.tapRing). */
function drawTapRings(ctx: CanvasRenderingContext2D, v: View, scene: ChessScene) {
  const R = ESTIMATED.tapRing;
  const life = R.duration * 1.4;
  scene.tapRings = scene.tapRings.filter((r) => scene.time - r.start < life);
  const easeOut = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
  for (const r of scene.tapRings) {
    const age = Math.max(0, scene.time - r.start);
    const cx = v.w / 2 + (r.x - v.camX) * v.ppu;
    const cy = v.h / 2 - (r.y - v.camY) * v.ppu;
    ctx.save();
    ctx.strokeStyle = cssColor(COLORS[R.color]);
    ctx.fillStyle = cssColor(COLORS[R.color]);
    // two rings: the second trails slightly behind and ends smaller
    for (const [delay, scale] of [[0, 1], [R.duration * 0.25, 0.65]] as const) {
      const k = (age - delay) / R.duration;
      if (k < 0 || k >= 1) continue;
      const e = easeOut(k);
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = Math.max(1.5, R.lineWidth * v.ppu * (1 - k * 0.7));
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, e * R.maxRadius * scale * v.ppu), 0, Math.PI * 2);
      ctx.stroke();
    }
    // centre dot that pops and shrinks
    const kd = age / (R.duration * 0.5);
    if (kd < 1) {
      ctx.globalAlpha = 1 - kd;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0.5, (1 - kd) * R.lineWidth * 1.6 * v.ppu), 0, Math.PI * 2);
      ctx.fill();
    }
    // 8 square sparks flung outward
    const ks = age / life;
    if (ks < 1) {
      const e = easeOut(ks);
      const sz = Math.max(1, R.lineWidth * v.ppu * (1 - ks));
      ctx.globalAlpha = 1 - ks;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const d = (0.25 + e * 0.75) * R.maxRadius * 1.25 * v.ppu;
        ctx.fillRect(cx + Math.cos(a) * d - sz / 2, cy + Math.sin(a) * d - sz / 2, sz, sz);
      }
    }
    ctx.restore();
  }
}
