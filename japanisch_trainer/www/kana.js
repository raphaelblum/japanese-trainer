// Kana data. Only hiragana is listed; katakana is derived by shifting the
// code point by 0x60 (ぁ-ゖ → ァ-ヶ), which holds for every character below.
(() => {
  'use strict';

  const GROUPS = [
    { id: 'basic', label: 'Grundzeichen', hint: 'Gojūon', cols: ['a', 'i', 'u', 'e', 'o'] },
    { id: 'dakuten', label: 'Dakuten & Handakuten', hint: 'が · ぱ', cols: ['a', 'i', 'u', 'e', 'o'] },
    { id: 'yoon', label: 'Kombinationen', hint: 'Yōon', cols: ['ya', 'yu', 'yo'] },
  ];

  // Cell format: "<kana> <romaji>[|<alternative>...]"; null marks a gap in the grid.
  // The first romaji is the Hepburn spelling shown to the user; alternatives are also accepted.
  const ROWS = [
    ['basic', 'a', 'あ a', 'い i', 'う u', 'え e', 'お o'],
    ['basic', 'ka', 'か ka', 'き ki', 'く ku', 'け ke', 'こ ko'],
    ['basic', 'sa', 'さ sa', 'し shi|si', 'す su', 'せ se', 'そ so'],
    ['basic', 'ta', 'た ta', 'ち chi|ti', 'つ tsu|tu', 'て te', 'と to'],
    ['basic', 'na', 'な na', 'に ni', 'ぬ nu', 'ね ne', 'の no'],
    ['basic', 'ha', 'は ha', 'ひ hi', 'ふ fu|hu', 'へ he', 'ほ ho'],
    ['basic', 'ma', 'ま ma', 'み mi', 'む mu', 'め me', 'も mo'],
    ['basic', 'ya', 'や ya', null, 'ゆ yu', null, 'よ yo'],
    ['basic', 'ra', 'ら ra', 'り ri', 'る ru', 'れ re', 'ろ ro'],
    ['basic', 'wa', 'わ wa', null, null, null, 'を wo|o'],
    ['basic', 'n', 'ん n|nn', null, null, null, null],

    ['dakuten', 'ga', 'が ga', 'ぎ gi', 'ぐ gu', 'げ ge', 'ご go'],
    ['dakuten', 'za', 'ざ za', 'じ ji|zi', 'ず zu', 'ぜ ze', 'ぞ zo'],
    ['dakuten', 'da', 'だ da', 'ぢ ji|di|zi', 'づ zu|du', 'で de', 'ど do'],
    ['dakuten', 'ba', 'ば ba', 'び bi', 'ぶ bu', 'べ be', 'ぼ bo'],
    ['dakuten', 'pa', 'ぱ pa', 'ぴ pi', 'ぷ pu', 'ぺ pe', 'ぽ po'],

    ['yoon', 'kya', 'きゃ kya', 'きゅ kyu', 'きょ kyo'],
    ['yoon', 'sha', 'しゃ sha|sya', 'しゅ shu|syu', 'しょ sho|syo'],
    ['yoon', 'cha', 'ちゃ cha|tya|cya', 'ちゅ chu|tyu|cyu', 'ちょ cho|tyo|cyo'],
    ['yoon', 'nya', 'にゃ nya', 'にゅ nyu', 'にょ nyo'],
    ['yoon', 'hya', 'ひゃ hya', 'ひゅ hyu', 'ひょ hyo'],
    ['yoon', 'mya', 'みゃ mya', 'みゅ myu', 'みょ myo'],
    ['yoon', 'rya', 'りゃ rya', 'りゅ ryu', 'りょ ryo'],
    ['yoon', 'gya', 'ぎゃ gya', 'ぎゅ gyu', 'ぎょ gyo'],
    ['yoon', 'ja', 'じゃ ja|zya|jya', 'じゅ ju|zyu|jyu', 'じょ jo|zyo|jyo'],
    ['yoon', 'bya', 'びゃ bya', 'びゅ byu', 'びょ byo'],
    ['yoon', 'pya', 'ぴゃ pya', 'ぴゅ pyu', 'ぴょ pyo'],
  ];

  const toKatakana = (s) =>
    s.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));

  const ROW_DEFS = ROWS.map(([group, id, ...cells]) => ({
    group,
    id,
    cells: cells.map((cell) => {
      if (!cell) return null;
      const [hira, romaji] = cell.split(' ');
      const accept = romaji.split('|');
      return { hira, kata: toKatakana(hira), romaji: accept[0], accept };
    }),
  }));

  const KANA = [];
  for (const script of ['h', 'k']) {
    for (const row of ROW_DEFS) {
      for (const cell of row.cells) {
        if (!cell) continue;
        const char = script === 'h' ? cell.hira : cell.kata;
        KANA.push({
          id: char,
          char,
          script,
          romaji: cell.romaji,
          accept: cell.accept,
          row: row.id,
          group: row.group,
        });
      }
    }
  }

  const KANA_BY_ID = Object.fromEntries(KANA.map((k) => [k.id, k]));

  window.KanaData = { GROUPS, ROW_DEFS, KANA, KANA_BY_ID, toKatakana };
})();
