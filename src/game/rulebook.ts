// Rulebook screens (RuleBookScreenManager + RulebookTableOfContents) and fog (RulebookFogManager).
import {
  CONSTANTS,
  PieceType,
  RULEBOOK_SCREENS,
  RULE_BREAK_STRINGS,
  type CheatId,
  type PieceTypeId,
  type RawPage,
} from "./data";
import { at } from "./rng";

export interface RulePage extends RawPage {
  /** Image path relative to /assets. */
  image: string;
}

export interface ContentLink {
  page: RulePage;
  screenIndex: number;
  side: "left" | "right";
  slot: number;
  sprite: string;
}

export interface RuleScreen {
  name: string;
  isTableOfContents: boolean;
  pages: [RulePage, RulePage];
  links: ContentLink[];
}

export interface PageFogEntry {
  pageID: string;
  isFog: boolean;
  turnsToClearFog: number;
  screenIndex: number;
}

const PAGE_DIR = "03Sprites/Rulebook/PageSprites/pages_english/";

function toPage(p: RawPage): RulePage {
  return { ...p, image: PAGE_DIR + (p.sprite ?? "page0.png") };
}

function contentPage(index: number, side: number): RulePage {
  return {
    pageID: "page_contents_" + index,
    sprite: null,
    image: PAGE_DIR + (side === 0 ? "page_contents_0.png" : "page_contents_1.png"),
    cheatReason: 0,
    cheatScore: 0,
    ruleBreak: RULE_BREAK_STRINGS["PageTOCKey"] ?? "is not content?",
    checkPiece: false,
    piece: PieceType.Null,
    trollTopic: null,
    checkFogPiece: false,
    fogPiece: PieceType.Null,
    fogTurns: 0,
    contentSprites: [],
  };
}

export function buildRuleBookScreens(): RuleScreen[] {
  const base: RuleScreen[] = RULEBOOK_SCREENS.map((s) => ({
    name: s.name,
    isTableOfContents: false,
    pages: [toPage(s.pages[0]), toPage(s.pages[1])],
    links: [],
  }));
  const per = CONSTANTS.ruleCountPerContentPage;
  const tocCount = Math.ceil(Math.ceil((base.length * 2) / per) / 2);
  const toc: RuleScreen[] = [];
  let pageCounter = 0;
  let linkIndex = 0;
  for (let i = 0; i < tocCount; i++) {
    const links: ContentLink[] = [];
    for (let j = 0; j < per * 2; j++) {
      if (linkIndex >= base.length * 2) break;
      const screenIdx = Math.floor(linkIndex / 2);
      const page = at(at(base, screenIdx).pages, linkIndex - screenIdx * 2);
      const left = j < per;
      links.push({
        page,
        // index inside the final (TOC-prefixed) list
        screenIndex: screenIdx + tocCount,
        side: left ? "left" : "right",
        slot: left ? j : j - per,
        sprite: at(page.contentSprites, left ? 0 : 1),
      });
      linkIndex++;
    }
    const pages: [RulePage, RulePage] = [contentPage(pageCounter++, 0), contentPage(pageCounter++, 1)];
    toc.push({ name: "Contents" + i, isTableOfContents: true, pages, links });
  }
  return [...toc, ...base];
}

export function linkPosition(link: ContentLink): { x: number; y: number } {
  const s = CONSTANTS.tocStartPositionLeft;
  const o = CONSTANTS.tocOffsetPositionLeft;
  const x = s.x + o.x * link.slot;
  const y = s.y + o.y * link.slot;
  return { x: link.side === "left" ? x : -x, y };
}

/** FindCheatReasonInRuleBook: the page the troll points at when it catches you. */
export function findCheatReasonInRuleBook(
  screens: RuleScreen[],
  cheatReasons: CheatId[] | null,
  cheatType: PieceTypeId,
  doReverseCheat: boolean,
): { page: RulePage; screenIndex: number } {
  let screenIndex = CONSTANTS.startPageIndex + 1;
  let result = at(screens, screenIndex).pages[1];
  let best = 0;
  if (!doReverseCheat && cheatReasons) {
    for (let i = 0; i < screens.length; i++) {
      for (const reason of cheatReasons) {
        for (const page of at(screens, i).pages) {
          let score = 0;
          if (page.cheatReason === reason) {
            score = page.cheatScore;
            if (!page.checkPiece) score *= 2;
          }
          if (page.piece === cheatType && page.checkPiece) score += page.cheatScore;
          if (score > best) {
            result = page;
            screenIndex = i;
            best = score;
          }
        }
      }
    }
  }
  return { page: result, screenIndex };
}

export function generateFogEntries(screens: RuleScreen[]): PageFogEntry[] {
  const out: PageFogEntry[] = [];
  screens.forEach((s, i) => {
    for (const p of s.pages) out.push({ pageID: p.pageID, isFog: p.fogTurns > 0, turnsToClearFog: p.fogTurns, screenIndex: i });
  });
  return out;
}

export function getPageById(screens: RuleScreen[], id: string): RulePage | undefined {
  for (const s of screens) for (const p of s.pages) if (p.pageID === id) return p;
  return undefined;
}

export function isPageFogged(entries: PageFogEntry[], page: RulePage): boolean {
  const e = entries.find((f) => f.pageID === page.pageID);
  return e ? e.isFog : false;
}

/** ProgressFogClearing: decrements fog counters, returns the entry that should clear now (if any). */
export function progressFogClearing(
  screens: RuleScreen[],
  entries: PageFogEntry[],
  movedType: PieceTypeId,
): PageFogEntry | null {
  let toClear: PageFogEntry | null = null;
  for (const e of entries) {
    const page = getPageById(screens, e.pageID);
    if (!e.isFog || !page) continue;
    if (page.checkFogPiece) {
      if (page.fogPiece === movedType) e.turnsToClearFog--;
    } else e.turnsToClearFog--;
    if (!toClear && e.turnsToClearFog < 1) toClear = e;
  }
  return toClear;
}

/** CheckIfPlayerGuessedCheat */
export function isCorrectAccusation(args: {
  accusedPieceId: number;
  accusedPieceType: PieceTypeId;
  lastMovedPieceId: number | null;
  lastTurnCheatReasons: CheatId[];
  page: RulePage;
}): boolean {
  let ok = true;
  const collide = args.lastTurnCheatReasons.includes(3 as CheatId);
  if (args.accusedPieceId !== args.lastMovedPieceId && !collide) ok = false;
  if (!args.lastTurnCheatReasons.includes(args.page.cheatReason)) ok = false;
  if (args.page.checkPiece && args.accusedPieceType !== args.page.piece) ok = false;
  return ok;
}
