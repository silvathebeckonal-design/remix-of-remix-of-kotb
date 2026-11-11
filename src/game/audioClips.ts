// Every original AudioClip, decoded from the game's FSB5 bank (sharedassets0.resource) once,
// without FMOD loop repeats, keyed by clip name.
import a0 from "@/assets/audio/ascension_fall.mp3.asset.json";
import a1 from "@/assets/audio/ascension_rise.mp3.asset.json";
import a2 from "@/assets/audio/ascension_rumble.mp3.asset.json";
import a3 from "@/assets/audio/ascension_troll_kill.mp3.asset.json";
import a4 from "@/assets/audio/chess_accusation_chesspiece.mp3.asset.json";
import a5 from "@/assets/audio/chess_accusation_confirm.mp3.asset.json";
import a6 from "@/assets/audio/chess_accusation_correct.mp3.asset.json";
import a7 from "@/assets/audio/chess_accusation_false.mp3.asset.json";
import a8 from "@/assets/audio/chess_accusation_in.mp3.asset.json";
import a9 from "@/assets/audio/chess_accusation_rulebreak.mp3.asset.json";
import a10 from "@/assets/audio/chess_piece_capture.mp3.asset.json";
import a11 from "@/assets/audio/chess_piece_castle_merge.mp3.asset.json";
import a12 from "@/assets/audio/chess_piece_castle_scraps.mp3.asset.json";
import a13 from "@/assets/audio/chess_piece_drop.mp3.asset.json";
import a14 from "@/assets/audio/chess_piece_grab.mp3.asset.json";
import a15 from "@/assets/audio/chess_piece_king_respawn.mp3.asset.json";
import a16 from "@/assets/audio/chess_piece_landmine_explode.mp3.asset.json";
import a17 from "@/assets/audio/chess_piece_landmine_spawn.mp3.asset.json";
import a18 from "@/assets/audio/chess_piece_pawn_ascention.mp3.asset.json";
import a19 from "@/assets/audio/chess_piece_queen_worldflip.mp3.asset.json";
import a20 from "@/assets/audio/chess_piece_rook_eat.mp3.asset.json";
import a21 from "@/assets/audio/chess_piece_slip.mp3.asset.json";
import a22 from "@/assets/audio/chess_rulebook_fog_dissipate.mp3.asset.json";
import a23 from "@/assets/audio/chess_rulebook_fog_rumble.mp3.asset.json";
import a24 from "@/assets/audio/chess_rulebook_link_hover.mp3.asset.json";
import a25 from "@/assets/audio/chess_rulebook_page_flip.mp3.asset.json";
import a26 from "@/assets/audio/chess_rulebook_slide_in.mp3.asset.json";
import a27 from "@/assets/audio/chess_rulebook_slide_out.mp3.asset.json";
import a28 from "@/assets/audio/duck_flap.mp3.asset.json";
import a29 from "@/assets/audio/duck_honk-01.mp3.asset.json";
import a30 from "@/assets/audio/duck_honk-02.mp3.asset.json";
import a31 from "@/assets/audio/duck_honk-03.mp3.asset.json";
import a32 from "@/assets/audio/duck_honk-04.mp3.asset.json";
import a33 from "@/assets/audio/duck_walk-01.mp3.asset.json";
import a34 from "@/assets/audio/duck_walk-02.mp3.asset.json";
import a35 from "@/assets/audio/duck_walk-03.mp3.asset.json";
import a36 from "@/assets/audio/duck_walk-04.mp3.asset.json";
import a37 from "@/assets/audio/overworld_bridge_ambience.mp3.asset.json";
import a38 from "@/assets/audio/overworld_lilypad.mp3.asset.json";
import a39 from "@/assets/audio/overworld_manhole_blast.mp3.asset.json";
import a40 from "@/assets/audio/player_heart_pounce.mp3.asset.json";
import a41 from "@/assets/audio/titel_impact.mp3.asset.json";
import a42 from "@/assets/audio/transition_fade_in.mp3.asset.json";
import a43 from "@/assets/audio/transition_fade_out.mp3.asset.json";
import a44 from "@/assets/audio/troll_critical_hit.mp3.asset.json";
import a45 from "@/assets/audio/troll_dialog_voice.mp3.asset.json";
export const CLIP_URLS: Record<string, string> = {
  "ascension_fall": a0.url,
  "ascension_rise": a1.url,
  "ascension_rumble": a2.url,
  "ascension_troll_kill": a3.url,
  "chess_accusation_chesspiece": a4.url,
  "chess_accusation_confirm": a5.url,
  "chess_accusation_correct": a6.url,
  "chess_accusation_false": a7.url,
  "chess_accusation_in": a8.url,
  "chess_accusation_rulebreak": a9.url,
  "chess_piece_capture": a10.url,
  "chess_piece_castle_merge": a11.url,
  "chess_piece_castle_scraps": a12.url,
  "chess_piece_drop": a13.url,
  "chess_piece_grab": a14.url,
  "chess_piece_king_respawn": a15.url,
  "chess_piece_landmine_explode": a16.url,
  "chess_piece_landmine_spawn": a17.url,
  "chess_piece_pawn_ascention": a18.url,
  "chess_piece_queen_worldflip": a19.url,
  "chess_piece_rook_eat": a20.url,
  "chess_piece_slip": a21.url,
  "chess_rulebook_fog_dissipate": a22.url,
  "chess_rulebook_fog_rumble": a23.url,
  "chess_rulebook_link_hover": a24.url,
  "chess_rulebook_page_flip": a25.url,
  "chess_rulebook_slide_in": a26.url,
  "chess_rulebook_slide_out": a27.url,
  "duck_flap": a28.url,
  "duck_honk-01": a29.url,
  "duck_honk-02": a30.url,
  "duck_honk-03": a31.url,
  "duck_honk-04": a32.url,
  "duck_walk-01": a33.url,
  "duck_walk-02": a34.url,
  "duck_walk-03": a35.url,
  "duck_walk-04": a36.url,
  "overworld_bridge_ambience": a37.url,
  "overworld_lilypad": a38.url,
  "overworld_manhole_blast": a39.url,
  "player_heart_pounce": a40.url,
  "titel_impact": a41.url,
  "transition_fade_in": a42.url,
  "transition_fade_out": a43.url,
  "troll_critical_hit": a44.url,
  "troll_dialog_voice": a45.url,
};

/** Exact clip length in seconds (AudioClip.m_Length); decoded MP3s are trimmed to it so loops stay seamless. */
export const CLIP_SECONDS: Record<string, number> = {
  "ascension_fall": 5.38075,
  "ascension_rise": 5.38075,
  "ascension_rumble": 36.0096,
  "ascension_troll_kill": 6.39996,
  "chess_accusation_chesspiece": 3.22322,
  "chess_accusation_confirm": 3.22322,
  "chess_accusation_correct": 3.95088,
  "chess_accusation_false": 3.64286,
  "chess_accusation_in": 3.95088,
  "chess_accusation_rulebreak": 3.39286,
  "chess_piece_capture": 0.44302,
  "chess_piece_castle_merge": 1.25444,
  "chess_piece_castle_scraps": 0.63125,
  "chess_piece_drop": 0.23667,
  "chess_piece_grab": 0.23667,
  "chess_piece_king_respawn": 0.56104,
  "chess_piece_landmine_explode": 0.56583,
  "chess_piece_landmine_spawn": 0.37485,
  "chess_piece_pawn_ascention": 3.87902,
  "chess_piece_queen_worldflip": 1.45646,
  "chess_piece_rook_eat": 0.38,
  "chess_piece_slip": 1.26862,
  "chess_rulebook_fog_dissipate": 4.18549,
  "chess_rulebook_fog_rumble": 0.59537,
  "chess_rulebook_link_hover": 0.24843,
  "chess_rulebook_page_flip": 0.55202,
  "chess_rulebook_slide_in": 0.81243,
  "chess_rulebook_slide_out": 0.8188,
  "duck_flap": 0.52406,
  "duck_honk-01": 0.26379,
  "duck_honk-02": 0.25474,
  "duck_honk-03": 0.30172,
  "duck_honk-04": 0.45483,
  "duck_walk-01": 0.18552,
  "duck_walk-02": 0.42965,
  "duck_walk-03": 0.30596,
  "duck_walk-04": 0.15623,
  "overworld_bridge_ambience": 151.35265,
  "overworld_lilypad": 0.42991,
  "overworld_manhole_blast": 1.96388,
  "player_heart_pounce": 0.36447,
  "titel_impact": 3.80268,
  "transition_fade_in": 3.28215,
  "transition_fade_out": 3.12347,
  "troll_critical_hit": 2.22744,
  "troll_dialog_voice": 0.13177,
};
