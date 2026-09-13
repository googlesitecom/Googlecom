// ============================================================
// EMERGENCY STRIKE — Battle Royale instance holder (v9)
// Lets the BR HUD reach the (lazy) BR game instance.
// ============================================================
import type { BattleRoyaleGame } from './battle-royale'

let brGame: BattleRoyaleGame | null = null

export function setBrGame(g: BattleRoyaleGame | null): void { brGame = g }
export function getBrGame(): BattleRoyaleGame | null { return brGame }
