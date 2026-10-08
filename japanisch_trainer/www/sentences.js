// Words and sentences for the reading mode, plus the logic that splits them into
// kana tokens and grades a typed romaji answer token by token.
//
// Data notation: words are separated by spaces. A standalone は / へ is read as the
// particle (wa / e); inside a word, prefix it with ^ to mark the particle reading
// (こんにち^は → konnichiwa).
(() => {
  'use strict';

  const { KANA_BY_ID } = window.KanaData;

  const WORDS = [
    ['ねこ', 'Katze'],
    ['いぬ', 'Hund'],
    ['さかな', 'Fisch'],
    ['みず', 'Wasser'],
    ['やま', 'Berg'],
    ['そら', 'Himmel'],
    ['あめ', 'Regen'],
    ['ゆき', 'Schnee'],
    ['くるま', 'Auto'],
    ['でんしゃ', 'Zug'],
    ['ともだち', 'Freund/in'],
    ['せんせい', 'Lehrer/in'],
    ['がくせい', 'Student/in'],
    ['にほん', 'Japan'],
    ['とうきょう', 'Tokio'],
    ['ありがとう', 'Danke'],
    ['おはよう', 'Guten Morgen'],
    ['こんにち^は', 'Hallo / Guten Tag'],
    ['こんばん^は', 'Guten Abend'],
    ['さようなら', 'Auf Wiedersehen'],
    ['すみません', 'Entschuldigung'],
    ['おいしい', 'lecker'],
    ['おおきい', 'groß'],
    ['ちいさい', 'klein'],
    ['きっぷ', 'Fahrkarte'],
    ['がっこう', 'Schule'],
    ['ざっし', 'Zeitschrift'],
    ['りょこう', 'Reise'],
    ['きょう', 'heute'],
    ['あした', 'morgen'],
    ['しゅくだい', 'Hausaufgabe'],
    ['ひこうき', 'Flugzeug'],
    ['じてんしゃ', 'Fahrrad'],
    ['しんぶん', 'Zeitung'],
    ['べんきょう', 'Lernen'],
    ['おちゃ', 'grüner Tee'],
    ['ごはん', 'Reis / Mahlzeit'],
    ['ぎゅうにゅう', 'Milch'],
    ['びょういん', 'Krankenhaus'],
    ['えいご', 'Englisch'],
    ['ちょっと', 'ein bisschen'],
    ['ちゃわん', 'Reisschale'],
    ['みっつ', 'drei (Stück)'],
    ['ひらがな', 'Hiragana'],

    ['コーヒー', 'Kaffee'],
    ['テレビ', 'Fernseher'],
    ['パン', 'Brot'],
    ['カメラ', 'Kamera'],
    ['ホテル', 'Hotel'],
    ['タクシー', 'Taxi'],
    ['アイスクリーム', 'Eiscreme'],
    ['ラーメン', 'Ramen'],
    ['ピアノ', 'Klavier'],
    ['ドイツ', 'Deutschland'],
    ['オーストリア', 'Österreich'],
    ['ウィーン', 'Wien'],
    ['ヨーロッパ', 'Europa'],
    ['コンピューター', 'Computer'],
    ['スマホ', 'Smartphone'],
    ['ゲーム', 'Spiel'],
    ['サッカー', 'Fußball'],
    ['ベッド', 'Bett'],
    ['バス', 'Bus'],
    ['ジュース', 'Saft'],
    ['チョコレート', 'Schokolade'],
    ['ケーキ', 'Kuchen'],
    ['メール', 'E-Mail'],
    ['パーティー', 'Party'],
    ['ノート', 'Heft'],
    ['シャツ', 'Hemd'],
    ['ビール', 'Bier'],
    ['ワイン', 'Wein'],
    ['ハンバーガー', 'Hamburger'],
    ['アニメ', 'Anime'],
    ['カタカナ', 'Katakana'],
  ];

  // Third column: difficulty level (1 = leicht, 2 = mittel, 3 = schwer).
  const SENTENCES = [
    // Hiragana
    ['わたし は がくせい です。', 'Ich bin Student/in.', 1],
    ['これ は ねこ です。', 'Das ist eine Katze.', 1],
    ['きょう は あつい です ね。', 'Heute ist es heiß, oder?', 1],
    ['にほんご を べんきょう します。', 'Ich lerne Japanisch.', 1],
    ['えき は どこ です か。', 'Wo ist der Bahnhof?', 1],
    ['いま なんじ です か。', 'Wie spät ist es jetzt?', 1],
    ['おなか が すきました。', 'Ich habe Hunger.', 1],
    ['すみません、 みず を ください。', 'Entschuldigung, Wasser bitte.', 1],
    ['よろしく おねがい します。', 'Freut mich. / Auf gute Zusammenarbeit.', 1],
    ['おげんき です か。', 'Wie geht es dir?', 1],
    ['あめ が ふって います。', 'Es regnet.', 1],
    ['にほん に いきたい です。', 'Ich möchte nach Japan reisen.', 1],
    ['わたし は ねこ が すき です。', 'Ich mag Katzen.', 1],
    ['おやすみなさい。', 'Gute Nacht.', 1],
    ['あした ともだち と えいが を みます。', 'Morgen schaue ich mit Freunden einen Film.', 2],
    ['でんしゃ で がっこう へ いきます。', 'Ich fahre mit dem Zug zur Schule.', 2],
    ['ねこ が いす の うえ に います。', 'Die Katze ist auf dem Stuhl.', 2],
    ['しゅうまつ に やま へ いきたい です。', 'Am Wochenende möchte ich in die Berge.', 2],
    ['ゆっくり はなして ください。', 'Bitte sprich langsam.', 2],
    ['としょかん で ほん を よみます。', 'Ich lese in der Bibliothek ein Buch.', 2],
    ['わたし の しゅみ は りょうり です。', 'Mein Hobby ist Kochen.', 2],
    ['でんわ ばんごう を おしえて ください。', 'Sag mir bitte deine Telefonnummer.', 2],
    ['さむい から まど を しめて ください。', 'Es ist kalt, mach bitte das Fenster zu.', 2],
    ['えいご が すこし わかります。', 'Ich verstehe ein bisschen Englisch.', 2],
    ['きのう は いそがしくて、 しゅくだい を する じかん が ありませんでした。', 'Gestern war ich so beschäftigt, dass ich keine Zeit für die Hausaufgaben hatte.', 3],
    ['にほん へ りょこう する まえ に、 ひらがな を ぜんぶ おぼえたい です。', 'Bevor ich nach Japan reise, möchte ich alle Hiragana lernen.', 3],
    ['びょういん へ いく とき は、 ほけんしょう を わすれないで ください。', 'Wenn du ins Krankenhaus gehst, vergiss die Versicherungskarte nicht.', 3],
    ['ちょっと つかれた ので、 きょう は はやく ねよう と おもいます。', 'Ich bin etwas müde, deshalb gehe ich heute früh schlafen.', 3],
    ['でんしゃ が おくれた ので、 がっこう に まにあいませんでした。', 'Weil der Zug Verspätung hatte, kam ich nicht rechtzeitig zur Schule.', 3],
    ['きょねん の なつ、 きょうと で おいしい まっちゃ を のみました。', 'Letzten Sommer habe ich in Kyoto leckeren Matcha getrunken.', 3],
    ['もし じかん が あったら、 いっしょ に しょくじ しませんか。', 'Wenn du Zeit hast, wollen wir zusammen essen gehen?', 3],
    ['おきゃくさま、 しょうしょう おまち ください。', 'Bitte warten Sie einen Moment (zu Kunden).', 3],
    ['ちゅうごくご は むずかしい けど、 じゅぎょう は たのしい です。', 'Chinesisch ist schwer, aber der Unterricht macht Spaß.', 3],
    ['にゅうがく しけん に ごうかく して、 ほんとう に うれしかった です。', 'Ich habe die Aufnahmeprüfung bestanden und war wirklich froh.', 3],
    ['いらっしゃいませ。', 'Willkommen! (Begrüßung im Geschäft)', 1],
    ['しょうしょう おまち ください。', 'Bitte warten Sie einen Moment.', 1],
    ['ありがとう ございます。', 'Vielen Dank.', 1],
    ['どう いたしまして。', 'Gern geschehen.', 1],
    ['はじめまして。', 'Freut mich, Sie kennenzulernen.', 1],
    ['いただきます。', 'Guten Appetit! (vor dem Essen)', 1],
    ['ごちそうさま でした。', 'Danke für das Essen.', 1],
    ['これ を ください。', 'Das hier, bitte.', 1],
    ['これ は いくら です か。', 'Wie viel kostet das?', 1],
    ['おてあらい は どこ です か。', 'Wo ist die Toilette?', 1],
    ['えいご が はなせます か。', 'Sprechen Sie Englisch?', 1],
    ['わかりません。', 'Ich verstehe das nicht.', 1],
    ['だいじょうぶ です。', 'Alles in Ordnung.', 1],
    ['とても おいしかった です。', 'Es war sehr lecker.', 1],
    ['ふくろ は いりません。', 'Ich brauche keine Tüte.', 1],
    ['きっぷ を いちまい ください。', 'Eine Fahrkarte, bitte.', 1],
    ['なんめいさま です か。', 'Wie viele Personen sind Sie?', 1],
    ['ふたり です。', 'Wir sind zu zweit.', 1],
    ['いい てんき です ね。', 'Schönes Wetter heute, nicht wahr?', 1],
    ['きょう は さむい です ね。', 'Heute ist es kalt, oder?', 1],
    ['どこ から きました か。', 'Woher kommen Sie?', 1],
    ['おなまえ は なん です か。', 'Wie heißen Sie?', 1],
    ['にほん は はじめて です。', 'Ich bin zum ersten Mal in Japan.', 1],
    ['また きます。', 'Ich komme wieder.', 1],
    ['ちょっと まって ください。', 'Warten Sie bitte kurz.', 1],
    ['もう いちど おねがい します。', 'Noch einmal, bitte.', 1],
    ['あたま が いたい です。', 'Ich habe Kopfschmerzen.', 1],
    ['くすりや は どこ です か。', 'Wo ist eine Apotheke?', 1],
    ['さいふ を なくしました。', 'Ich habe meine Geldbörse verloren.', 1],
    ['えき まで おねがい します。', 'Zum Bahnhof, bitte.', 1],
    ['ここ で とめて ください。', 'Halten Sie bitte hier an.', 1],
    ['よやく して います。', 'Ich habe reserviert.', 1],
    ['おすすめ は なん です か。', 'Was empfehlen Sie?', 1],
    ['これ は なん です か。', 'Was ist das?', 1],
    ['からい です か。', 'Ist das scharf?', 1],
    ['にく は たべません。', 'Ich esse kein Fleisch.', 1],
    ['きれい です ね。', 'Wie schön!', 1],
    ['でぐち は あちら です。', 'Der Ausgang ist dort drüben.', 1],
    ['ここ は きんえん です。', 'Hier ist Rauchen verboten.', 1],
    ['げんきん だけ です。', 'Nur Barzahlung.', 1],
    ['まっすぐ いって ください。', 'Gehen Sie bitte geradeaus.', 1],
    ['あるいて いけます か。', 'Kann man zu Fuß hingehen?', 1],
    ['おはよう ございます。', 'Guten Morgen.', 1],
    ['かぜ を ひきました。', 'Ich habe mich erkältet.', 1],
    ['ほんじつ は きゅうぎょう です。', 'Heute haben wir geschlossen (Ruhetag).', 1],
    ['おかわり を ください。', 'Noch eine Portion, bitte. / Nachschenken, bitte.', 1],
    ['わたし は にほん の たべもの が だいすき です。', 'Ich liebe japanisches Essen.', 2],
    ['にほん に いっしゅうかん います。', 'Ich bin eine Woche in Japan.', 2],
    ['にほんご が じょうず です ね。', 'Ihr Japanisch ist aber gut!', 2],
    ['にほんご は すこし だけ はなせます。', 'Ich spreche nur ein bisschen Japanisch.', 2],
    ['しゅみ は しゃしん を とる こと です。', 'Mein Hobby ist Fotografieren.', 2],
    ['かんこう で にほん に きました。', 'Ich bin als Tourist nach Japan gekommen.', 2],
    ['にほん の ひと は とても しんせつ です ね。', 'Die Menschen in Japan sind sehr freundlich.', 2],
    ['いっしょ に しゃしん を とりません か。', 'Wollen wir zusammen ein Foto machen?', 2],
    ['きょうと に いった こと が あります か。', 'Waren Sie schon einmal in Kyoto?', 2],
    ['ここ から ふじさん が みえます か。', 'Kann man von hier den Fuji sehen?', 2],
    ['この へん で おすすめ の ばしょ は あります か。', 'Gibt es hier in der Gegend einen Ort, den Sie empfehlen?', 2],
    ['くうこう まで どうやって いきます か。', 'Wie komme ich zum Flughafen?', 2],
    ['にもつ が まだ でて きません。', 'Mein Gepäck ist noch nicht herausgekommen.', 2],
    ['りょけん を みせて ください。', 'Zeigen Sie bitte Ihren Reisepass.', 2],
    ['りょうがえ は どこ で できます か。', 'Wo kann ich Geld wechseln?', 2],
    ['にほん に なんにち たいざい します か。', 'Wie viele Tage bleiben Sie in Japan?', 2],
    ['この でんしゃ は きょうと に とまります か。', 'Hält dieser Zug in Kyoto?', 2],
    ['つぎ の えき で おります。', 'Ich steige an der nächsten Station aus.', 2],
    ['しぶや で ぎんざせん に のりかえます。', 'In Shibuya steige ich in die Ginza-Linie um.', 2],
    ['していせき を よやく したい です。', 'Ich möchte einen Sitzplatz reservieren.', 2],
    ['この せき は あいて います か。', 'Ist dieser Platz frei?', 2],
    ['とびら が しまります。 ごちゅうい ください。', 'Die Türen schließen. Bitte Vorsicht.', 2],
    ['つぎ は とうきょう、 とうきょう です。', 'Nächster Halt: Tokio, Tokio.', 2],
    ['さんばん のりば から でます。', 'Er fährt von Bahnsteig drei ab.', 2],
    ['えき まで あるいて なんぷん です か。', 'Wie viele Minuten sind es zu Fuß zum Bahnhof?', 2],
    ['この ちかてつ は うえの へ いきます か。', 'Fährt diese U-Bahn nach Ueno?', 2],
    ['この じゅうしょ まで おねがい します。', 'Zu dieser Adresse, bitte.', 2],
    ['くうこう まで いくら ぐらい かかります か。', 'Wie viel kostet es ungefähr bis zum Flughafen?', 2],
    ['すみません、 えき は どちら です か。', 'Entschuldigung, in welcher Richtung ist der Bahnhof?', 2],
    ['みち に まよって しまいました。', 'Ich habe mich verlaufen.', 2],
    ['つぎ の しんごう を みぎ に まがって ください。', 'Biegen Sie an der nächsten Ampel rechts ab.', 2],
    ['にもつ を あずかって もらえます か。', 'Können Sie mein Gepäck aufbewahren?', 2],
    ['ちょうしょく は なんじ から です か。', 'Ab wann gibt es Frühstück?', 2],
    ['へや の かぎ を なくしました。', 'Ich habe den Zimmerschlüssel verloren.', 2],
    ['もう いっぱく したい です。', 'Ich möchte noch eine Nacht bleiben.', 2],
    ['ゆかた の きかた を おしえて ください。', 'Zeigen Sie mir bitte, wie man den Yukata anzieht.', 2],
    ['ゆうしょく は へや で たべられます か。', 'Kann man das Abendessen im Zimmer essen?', 2],
    ['おふとん を しいて も よろしい です か。', 'Darf ich die Futons ausbreiten?', 2],
    ['おんせん に はいりたい です。', 'Ich möchte ins Onsen gehen.', 2],
    ['いれずみ の ある かた は ごえんりょ ください。', 'Personen mit Tattoos werden gebeten, nicht hineinzugehen.', 2],
    ['からだ を あらって から ゆぶね に はいって ください。', 'Bitte waschen Sie sich, bevor Sie ins Becken steigen.', 2],
    ['おとこゆ は みぎ、 おんなゆ は ひだり です。', 'Das Männerbad ist rechts, das Frauenbad links.', 2],
    ['すみません、 ちゅうもん を おねがい します。', 'Entschuldigung, ich möchte bestellen.', 2],
    ['これ と おなじ もの を ください。', 'Bitte das Gleiche wie das hier.', 2],
    ['てんない で おめしあがり です か。', 'Essen Sie hier im Lokal?', 2],
    ['もちかえり で おねがい します。', 'Zum Mitnehmen, bitte.', 2],
    ['ごはん を おおもり に できます か。', 'Kann ich eine große Portion Reis bekommen?', 2],
    ['なまもの は たべられません。', 'Ich kann nichts Rohes essen.', 2],
    ['これ に たまご は はいって います か。', 'Ist in dem hier Ei drin?', 2],
    ['にく が はいって いない りょうり は あります か。', 'Gibt es Gerichte ohne Fleisch?', 2],
    ['さかな は だいじょうぶ です が、 にく は たべません。', 'Fisch ist okay, aber Fleisch esse ich nicht.', 2],
    ['あまり からく しないで ください。', 'Bitte nicht zu scharf machen.', 2],
    ['この みせ は よやく が ひつよう です か。', 'Braucht man für dieses Lokal eine Reservierung?', 2],
    ['ろくじ に ふたり で よやく したい です。', 'Ich möchte für sechs Uhr für zwei Personen reservieren.', 2],
    ['おかいけい は べつべつ で おねがい します。', 'Getrennte Rechnung, bitte.', 2],
    ['りょうしゅうしょ を もらえます か。', 'Kann ich eine Quittung bekommen?', 2],
    ['おべんとう を あたためます か。', 'Soll ich das Bento aufwärmen?', 2],
    ['これ の ほか の いろ は あります か。', 'Gibt es das auch in anderen Farben?', 2],
    ['しちゃく して も いい です か。', 'Darf ich das anprobieren?', 2],
    ['もう すこし やすい の は あります か。', 'Haben Sie etwas Günstigeres?', 2],
    ['めんぜい で かえます か。', 'Kann ich das steuerfrei kaufen?', 2],
    ['ちょっと みて いる だけ です。', 'Ich schaue mich nur um.', 2],
    ['しゃしん を とって も いい です か。', 'Darf ich fotografieren?', 2],
    ['ここ で くつ を ぬいで ください。', 'Ziehen Sie hier bitte die Schuhe aus.', 2],
    ['おまもり は どこ で かえます か。', 'Wo kann man Glücksbringer kaufen?', 2],
    ['おみくじ を ひいて みたい です。', 'Ich möchte ein Orakel (Omikuji) ziehen.', 2],
    ['はいかんりょう は いくら です か。', 'Wie viel kostet der Eintritt?', 2],
    ['なんじ まで あいて います か。', 'Bis wann ist geöffnet?', 2],
    ['しゃしん を とって もらえます か。', 'Könnten Sie ein Foto von mir machen?', 2],
    ['さくら が きれい に さいて います。', 'Die Kirschblüten blühen wunderschön.', 2],
    ['きのう きんかくじ に いきました。', 'Gestern war ich im Kinkaku-ji.', 2],
    ['あした は はれる でしょう か。', 'Ob es morgen wohl sonnig wird?', 2],
    ['きょう は むしあつい です ね。', 'Heute ist es schwül, nicht wahr?', 2],
    ['かさ を もって いった ほう が いい です よ。', 'Nimm lieber einen Regenschirm mit.', 2],
    ['たいふう が ちかづいて います。', 'Ein Taifun kommt näher.', 2],
    ['じゅうでん して も いい です か。', 'Darf ich (mein Handy) hier aufladen?', 2],
    ['けいたい の じゅうでん が きれそう です。', 'Mein Handy-Akku ist fast leer.', 2],
    ['かばん を でんしゃ に わすれました。', 'Ich habe meine Tasche im Zug vergessen.', 2],
    ['こうばん は どこ に あります か。', 'Wo gibt es eine Polizeistation?', 2],
    ['くろい かばん を みませんでした か。', 'Haben Sie eine schwarze Tasche gesehen?', 2],
    ['ねつ が ある みたい です。', 'Ich glaube, ich habe Fieber.', 2],
    ['よく きく かぜぐすり は あります か。', 'Haben Sie ein gut wirkendes Erkältungsmittel?', 2],
    ['すこし きぶん が わるい です。', 'Mir ist etwas übel.', 2],
    ['びょういん に つれて いって ください。', 'Bringen Sie mich bitte ins Krankenhaus.', 2],
    ['きゅうきゅうしゃ を よんで ください。', 'Rufen Sie bitte einen Krankenwagen.', 2],
    ['この くすり は いちにち なんかい のみます か。', 'Wie oft am Tag nehme ich dieses Medikament?', 2],
    ['ここ から さき は たちいり きんし です。', 'Ab hier ist der Zutritt verboten.', 2],
    ['てんじひん に さわらないで ください。', 'Bitte die Ausstellungsstücke nicht berühren.', 2],
    ['きいろい せん の うちがわ まで おさがり ください。', 'Bitte hinter die gelbe Linie zurücktreten.', 2],
    ['ありがとう ございました。 また おこし ください。', 'Vielen Dank, beehren Sie uns bald wieder.', 2],
    ['にゅうこく しんさ の まえ に、 この かみ に なまえ と じゅうしょ を かいて ください。', 'Bitte schreiben Sie vor der Einreisekontrolle Namen und Adresse auf dieses Formular.', 3],
    ['りょこう の もくてき は かんこう で、 いっしゅうかん たいざい する よてい です。', 'Der Reisezweck ist Tourismus, ich bleibe eine Woche.', 3],
    ['にもつ が でて こない ん です が、 どこ に きけば いい です か。', 'Mein Gepäck kommt nicht heraus, wo kann ich nachfragen?', 3],
    ['しんこく する もの は ありません が、 おみやげ の おかし が はいって います。', 'Ich habe nichts zu verzollen, aber es sind Süßigkeiten als Mitbringsel drin.', 3],
    ['くうこう から まち の ちゅうしん まで、 でんしゃ で どのくらい かかります か。', 'Wie lange braucht man mit dem Zug vom Flughafen ins Stadtzentrum?', 3],
    ['のりつぎ の じかん が あまり ない ので、 いそがなければ なりません。', 'Ich habe nicht viel Zeit zum Umsteigen, deshalb muss ich mich beeilen.', 3],
    ['ほあん けんさ の まえ に、 のみもの は すてて ください。', 'Bitte entsorgen Sie Getränke vor der Sicherheitskontrolle.', 3],
    ['ひこうき が おくれた ので、 よやく した でんしゃ に まにあいませんでした。', 'Weil der Flug Verspätung hatte, habe ich den reservierten Zug verpasst.', 3],
    ['まもなく、 にばんせん に とうきょう ゆき の でんしゃ が まいります。', 'In Kürze fährt auf Gleis 2 der Zug nach Tokio ein.', 3],
    ['あぶない です から、 きいろい せん の うちがわ まで おさがり ください。', 'Bitte treten Sie zu Ihrer Sicherheit hinter die gelbe Linie zurück.', 3],
    ['つぎ は しんじゅく、 しんじゅく です。 おでぐち は みぎがわ です。', 'Nächster Halt: Shinjuku. Der Ausstieg ist rechts.', 3],
    ['しんかんせん の していせき を にまい、 まどがわ で おねがい できます か。', 'Kann ich zwei reservierte Shinkansen-Plätze am Fenster bekommen?', 3],
    ['この でんしゃ は かくえき ていしゃ です から、 きゅうこう に のりかえた ほう が はやい です。', 'Dieser Zug hält überall, es ist schneller, in den Express umzusteigen.', 3],
    ['おおさか へ いく に は、 どこ で のりかえれば いい です か。', 'Wo muss ich umsteigen, um nach Osaka zu kommen?', 3],
    ['すみません、 じゆうせき は なんごうしゃ から なんごうしゃ まで です か。', 'Entschuldigung, von welchem bis zu welchem Wagen sind die nicht reservierten Plätze?', 3],
    ['しゅうでん に のりおくれたら こまる ので、 そろそろ かえります。', 'Ich will den letzten Zug nicht verpassen, deshalb gehe ich langsam.', 3],
    ['ただいま でんしゃ が じゅっぷん ほど おくれて おります。 ごめいわく を おかけ して もうしわけ ございません。', 'Der Zug hat derzeit etwa zehn Minuten Verspätung. Wir bitten um Entschuldigung.', 3],
    ['ゆうせんせき の ちかく で は、 けいたい でんわ の でんげん を おきり ください。', 'Bitte schalten Sie in der Nähe der Vorrangsitze Ihr Handy aus.', 3],
    ['ほか の おきゃくさま の ごめいわく に なります ので、 しゃない で の つうわ は ごえんりょ ください。', 'Bitte verzichten Sie im Zug aus Rücksicht auf andere Fahrgäste aufs Telefonieren.', 3],
    ['すみません、 きょうと えき まで おねがい します。 いくら ぐらい かかります か。', 'Zum Bahnhof Kyoto bitte. Wie viel wird es ungefähr kosten? (im Taxi)', 3],
    ['つぎ の かど を みぎ に まがって、 しんごう の てまえ で とめて ください。', 'Biegen Sie an der nächsten Ecke rechts ab und halten Sie vor der Ampel. (im Taxi)', 3],
    ['にもつ が おおきい ので、 うしろ に いれて いただけます か。', 'Mein Gepäck ist groß, könnten Sie es hinten einladen? (im Taxi)', 3],
    ['きよみずでら へ いく に は、 なんばん の のりば から のれば いい です か。', 'Von welcher Haltestelle fahre ich ab, um zum Kiyomizu-Tempel zu kommen?', 3],
    ['おりる とき に りょうきん を はらう ので、 こまかい おかね を じゅんび して おいて ください。', 'Man zahlt beim Aussteigen, halten Sie also bitte Kleingeld bereit.', 3],
    ['いそいで いる ので、 いちばん はやい みち で いって いただけません か。', 'Ich habe es eilig, könnten Sie den schnellsten Weg nehmen? (im Taxi)', 3],
    ['すみません、 りょうしゅうしょ を いただいて も よろしい です か。', 'Entschuldigung, könnte ich bitte eine Quittung bekommen?', 3],
    ['すみません、 いちばん ちかい えき へ は どう いけば いい です か。', 'Entschuldigung, wie komme ich zum nächsten Bahnhof?', 3],
    ['この みち を まっすぐ いって、 にばんめ の しんごう を ひだり に まがって ください。', 'Gehen Sie diese Straße geradeaus und biegen Sie an der zweiten Ampel links ab.', 3],
    ['あるいて じゅうごふん ぐらい かかります から、 ちかてつ で いった ほう が いい です よ。', 'Zu Fuß dauert es etwa 15 Minuten, nehmen Sie lieber die U-Bahn.', 3],
    ['ちず を みて も よく わからない ん です が、 いま どこ に いる か おしえて いただけません か。', 'Ich verstehe die Karte nicht, könnten Sie mir zeigen, wo ich gerade bin?', 3],
    ['ゆうびんきょく は ぎんこう の となり に あって、 えき から すぐ です。', 'Die Post ist neben der Bank, gleich beim Bahnhof.', 3],
    ['みち に まよって しまいました。 この じゅうしょ へ は どう やって いけば いい です か。', 'Ich habe mich verlaufen. Wie komme ich zu dieser Adresse?', 3],
    ['ここ から あるいて いける きょり です か、 それとも でんしゃ に のった ほう が いい です か。', 'Kann man von hier zu Fuß gehen, oder nimmt man besser den Zug?', 3],
    ['かいさつ を でて ひだり に すすむ と、 かんこう あんないじょ が あります。', 'Wenn Sie aus der Fahrkartensperre links gehen, kommt die Touristeninformation.', 3],
    ['こんばん から にはく よやく して いる もの です が、 もう へや に はいれます か。', 'Ich habe ab heute Abend zwei Nächte reserviert. Kann ich schon ins Zimmer?', 3],
    ['へや に はいれる まで、 にもつ を あずかって いただけません か。', 'Könnten Sie mein Gepäck aufbewahren, bis ich ins Zimmer kann?', 3],
    ['ちょうしょく は しちじ から くじ まで、 いっかい の しょくどう で ございます。', 'Das Frühstück gibt es von 7 bis 9 Uhr im Speisesaal im Erdgeschoss.', 3],
    ['だいよくじょう は よる じゅういちじ まで ごりよう いただけます。', 'Das große Gemeinschaftsbad können Sie bis 23 Uhr benutzen.', 3],
    ['へや が すこし さむい ので、 もうふ を もう いちまい いただけます か。', 'Das Zimmer ist etwas kalt, könnte ich noch eine Decke bekommen?', 3],
    ['あした の あさ はやく でる ので、 ろくじ に おこして いただけます か。', 'Ich reise morgen früh ab, könnten Sie mich um 6 Uhr wecken?', 3],
    ['ゆかた の きかた が よく わからない ので、 おしえて いただけません か。', 'Ich weiß nicht genau, wie man den Yukata anzieht, könnten Sie es mir zeigen?', 3],
    ['ゆうしょく は へや に おもち しましょう か、 それとも しょくどう で めしあがります か。', 'Sollen wir das Abendessen aufs Zimmer bringen, oder essen Sie im Speisesaal?', 3],
    ['かぎ を へや の なか に わすれて しまった ん です が、 あけて いただけます か。', 'Ich habe den Schlüssel im Zimmer vergessen, könnten Sie aufsperren?', 3],
    ['おんせん に はいる まえ に、 かならず からだ を あらって ください。', 'Bitte waschen Sie sich unbedingt, bevor Sie ins Onsen steigen.', 3],
    ['いれずみ の ある かた の にゅうよく は おことわり して おります。', 'Personen mit Tattoos ist das Baden leider nicht gestattet.', 3],
    ['ちいさい てぬぐい は ゆぶね に いれないで、 あたま の うえ に のせて ください。', 'Das kleine Handtuch nicht ins Becken tauchen, sondern auf den Kopf legen.', 3],
    ['みずぎ を きた まま おふろ に はいって は いけません。', 'Man darf nicht in Badekleidung ins Bad steigen.', 3],
    ['おとこゆ と おんなゆ は ひ に よって いれかわる ので、 のれん の いろ を よく みて ください。', 'Männer- und Frauenbad wechseln je nach Tag, achten Sie auf die Farbe des Vorhangs.', 3],
    ['ながく はいりすぎる と、 のぼせて しまう かもしれません よ。', 'Wenn man zu lange drin bleibt, kann einem schwindlig werden.', 3],
    ['ろてんぶろ から ふじさん が みえる なんて、 ほんとう に すばらしい です ね。', 'Dass man vom Freiluftbad den Fuji sieht, ist wirklich großartig.', 3],
    ['いらっしゃいませ、 なんめいさま です か。 こちら の おせき へ どうぞ。', 'Willkommen, wie viele Personen? Bitte hier entlang zum Platz.', 3],
    ['よやく は して いない ん です が、 ふたり で はいれます か。', 'Wir haben nicht reserviert, gibt es Platz für zwei?', 3],
    ['おまたせ しました、 こちら が ほんじつ の おすすめ で ございます。', 'Danke fürs Warten, das ist die heutige Empfehlung.', 3],
    ['ごちゅうもん が おきまり に なりましたら、 および ください。', 'Bitte rufen Sie uns, wenn Sie sich für eine Bestellung entschieden haben.', 3],
    ['からい もの が にがて な ので、 からさ を ひかえめ に して もらえます か。', 'Ich vertrage scharfes Essen schlecht, könnten Sie es weniger scharf machen?', 3],
    ['のみもの は おかわり じゆう です ので、 ごえんりょ なく どうぞ。', 'Getränke werden kostenlos nachgefüllt, bedienen Sie sich ruhig.', 3],
    ['おかいけい を おねがい します。 べつべつ に はらって も いい です か。', 'Die Rechnung bitte. Können wir getrennt zahlen?', 3],
    ['とりあえず なま を ふたつ と えだまめ を おねがい します。', 'Fürs Erste zwei Fassbier und Edamame bitte.', 3],
    ['ちゅうもん した もの が まだ きて いない ん です が、 かくにん して いただけます か。', 'Meine Bestellung ist noch nicht gekommen, könnten Sie nachsehen?', 3],
    ['ごはん の おおもり は むりょう です が、 いかが なさいます か。', 'Eine große Portion Reis ist kostenlos, wie hätten Sie es gern?', 3],
    ['ごちそうさま でした。 また ぜひ きたい と おもいます。', 'Danke für das Essen. Ich komme bestimmt wieder.', 3],
    ['たまご を たべる と からだ が かゆく なる ので、 ぬいて いただけます か。', 'Von Eiern bekomme ich Juckreiz, könnten Sie sie weglassen?', 3],
    ['えび や かに が たべられない ん です が、 この りょうり に はいって います か。', 'Ich kann keine Garnelen oder Krabben essen, sind die in diesem Gericht?', 3],
    ['にく を たべない ので、 やさい だけ の りょうり は ありません か。', 'Ich esse kein Fleisch, gibt es ein Gericht nur mit Gemüse?', 3],
    ['ぶたにく が はいって いる か どうか、 おしえて いただけません か。', 'Könnten Sie mir sagen, ob Schweinefleisch drin ist?', 3],
    ['なま の さかな が にがて な ので、 やいた さかな に かえて もらえます か。', 'Ich mag keinen rohen Fisch, könnte ich gegrillten stattdessen bekommen?', 3],
    ['この おかし に は こむぎ が つかわれて います か。', 'Wird in dieser Süßigkeit Weizen verwendet?', 3],
    ['たべられない もの が ございましたら、 さき に おしらせ ください。', 'Falls es etwas gibt, das Sie nicht essen können, sagen Sie es uns bitte vorher.', 3],
    ['そば を たべる と ぐあい が わるく なる ので、 いつも き を つけて います。', 'Von Buchweizennudeln wird mir schlecht, deshalb passe ich immer auf.', 3],
    ['げんきん しか つかえない みせ も まだ おおい ので、 すこし もって いた ほう が いい です。', 'Viele Läden nehmen nur Bargeld, man sollte lieber etwas dabeihaben.', 3],
    ['めんぜい の てつづき を したい ん です が、 どこ で できます か。', 'Ich möchte steuerfrei einkaufen, wo kann ich das erledigen?', 3],
    ['おかいけい は ぜんぶ で さんぜんはっぴゃくえん に なります。', 'Das macht insgesamt 3800 Yen.', 3],
    ['いちまんえん おあずかり します。 ろくせんにひゃくえん の おかえし です。', 'Ich bekomme 10.000 Yen. Hier sind 6200 Yen zurück.', 3],
    ['ふくろ は ごりよう です か。 いちまい ごえん に なります。', 'Brauchen Sie eine Tüte? Eine kostet 5 Yen.', 3],
    ['こまかい おかね が ない ので、 いちまんえんさつ で も だいじょうぶ です か。', 'Ich habe kein Kleingeld, geht auch ein 10.000-Yen-Schein?', 3],
    ['これ は ぜいこみ の ねだん です か、 それとも ぜいぬき です か。', 'Ist das der Preis mit oder ohne Steuer?', 3],
    ['りょうがえ を したい ん です が、 ぎんこう は もう しまって いる みたい です。', 'Ich möchte Geld wechseln, aber die Bank scheint schon geschlossen zu sein.', 3],
    ['おべんとう を あたためて いただけます か。 あと、 おはし も ください。', 'Könnten Sie das Bento aufwärmen? Und Stäbchen bitte auch.', 3],
    ['すみません、 この ふく を しちゃく して みて も いい です か。', 'Entschuldigung, darf ich das anprobieren?', 3],
    ['ちょっと たかすぎる ので、 もう すこし やすい もの は ありません か。', 'Das ist etwas zu teuer, haben Sie etwas Günstigeres?', 3],
    ['おみやげ に したい ので、 べつべつ に つつんで いただけます か。', 'Das sind Mitbringsel, könnten Sie sie einzeln einpacken?', 3],
    ['これ の ほか の いろ は ありません か。 くろ か しろ が いい ん です が。', 'Gibt es das in anderen Farben? Ich hätte gern Schwarz oder Weiß.', 3],
    ['ただいま、 こちら の しょうひん は ぜんぶ さんわりびき に なって おります。', 'Derzeit sind alle diese Artikel um 30 Prozent reduziert.', 3],
    ['りょうしゅうしょ を おもち で あれば、 いっしゅうかん いない に こうかん できます。', 'Mit dem Kassenbeleg können Sie innerhalb einer Woche umtauschen.', 3],
    ['この ちいき の めいぶつ は なん です か。 おみやげ に かって かえりたい です。', 'Was ist die Spezialität dieser Gegend? Ich möchte sie als Mitbringsel kaufen.', 3],
    ['じんじゃ に はいる まえ に、 てみずや で て と くち を きよめます。', 'Bevor man den Schrein betritt, reinigt man am Wasserbecken Hände und Mund.', 3],
    ['おさいせん を いれた あと、 にれい にはくしゅ いちれい で おまいり します。', 'Nach dem Münzopfer betet man mit zwei Verbeugungen, zweimal Klatschen und einer Verbeugung.', 3],
    ['すみません、 ほんどう の なか で しゃしん を とって も いい です か。', 'Entschuldigung, darf man in der Haupthalle fotografieren?', 3],
    ['おみくじ を ひいたら だいきち が でて、 とても うれしかった です。', 'Beim Orakelzettel habe ich großes Glück gezogen und mich sehr gefreut.', 3],
    ['この おてら は ろっぴゃくねん いじょう まえ に たてられた そう です。', 'Dieser Tempel soll vor über 600 Jahren gebaut worden sein.', 3],
    ['はいかんりょう は おとな ごひゃくえん、 こども にひゃくえん です。', 'Der Eintritt kostet 500 Yen für Erwachsene und 200 Yen für Kinder.', 3],
    ['ごしゅいん を いただきたい ん です が、 どこ で おねがい できます か。', 'Ich hätte gern einen Tempelstempel, wo kann ich danach fragen?', 3],
    ['あさ はやく いけば、 ひと が すくなくて ゆっくり みられます よ。', 'Wenn Sie früh am Morgen gehen, sind wenig Leute da und Sie können in Ruhe schauen.', 3],
    ['もみじ の きせつ に は、 この にわ が まっか に なる そう です。', 'In der Zeit des Herbstlaubs soll dieser Garten ganz rot werden.', 3],
    ['すみません、 しゃしん を とって いただけません か。 うしろ の おしろ も いれて ください。', 'Entschuldigung, könnten Sie ein Foto machen? Bitte mit der Burg im Hintergrund.', 3],
    ['あした は たいふう が くる ので、 そと に でない ほう が いい です。', 'Morgen kommt ein Taifun, man sollte lieber nicht hinausgehen.', 3],
    ['てんき よほう に よると、 ごご から あめ が ふる そう です。', 'Laut Wetterbericht soll es ab Nachmittag regnen.', 3],
    ['にほん の なつ は むしあつい ので、 みず を たくさん のんで ください。', 'Der Sommer in Japan ist schwül, trinken Sie bitte viel Wasser.', 3],
    ['さくら が さく の は、 だいたい さんがつ の おわり ごろ です。', 'Die Kirschblüten blühen ungefähr Ende März.', 3],
    ['けさ は とても さむかった けど、 ひる に は あたたかく なりました。', 'Heute Morgen war es sehr kalt, aber zu Mittag wurde es warm.', 3],
    ['つゆ の じき は あめ が おおい ので、 かさ を もって いった ほう が いい です。', 'In der Regenzeit regnet es oft, nimm lieber einen Schirm mit.', 3],
    ['ゆき で でんしゃ が とまる かもしれない ので、 はやめ に でかけましょう。', 'Wegen des Schnees könnten die Züge ausfallen, brechen wir früh auf.', 3],
    ['あき は すずしくて すごしやすい ので、 りょこう に は いちばん いい きせつ です。', 'Der Herbst ist kühl und angenehm, die beste Jahreszeit zum Reisen.', 3],
    ['けいたい の じゅうでん が きれそう な ので、 じゅうでん できる ところ は ありません か。', 'Mein Handyakku ist fast leer, gibt es hier einen Ort zum Aufladen?', 3],
    ['けいたい の でんち が きれて しまった ので、 でんわ を かして いただけません か。', 'Mein Handyakku ist leer, könnte ich Ihr Telefon benutzen?', 3],
    ['じゅうでんき を わすれて きて しまった ので、 かして もらえます か。', 'Ich habe mein Ladegerät vergessen, könnten Sie mir eins leihen?', 3],
    ['でんぱ が わるくて よく きこえない ので、 あと で かけなおします。', 'Der Empfang ist schlecht und ich höre nichts, ich rufe später zurück.', 3],
    ['けいたい の ちず を みながら あるいて いた のに、 みち に まよって しまいました。', 'Obwohl ich mit der Handykarte gegangen bin, habe ich mich verlaufen.', 3],
    ['でんしゃ の なか に さいふ を わすれて しまった ん です が、 どう すれば いい です か。', 'Ich habe meine Geldbörse im Zug vergessen, was soll ich tun?', 3],
    ['くろい かばん を さがして いる ん です が、 わすれもの と して とどいて いません か。', 'Ich suche eine schwarze Tasche, wurde sie als Fundsache abgegeben?', 3],
    ['さいふ を おとして しまった ので、 ちかく の こうばん を おしえて いただけません か。', 'Ich habe meine Geldbörse verloren, könnten Sie mir die nächste Polizeistation zeigen?', 3],
    ['へや の でんき が つかない ので、 だれか みに きて いただけません か。', 'Das Licht im Zimmer geht nicht, könnte jemand nachsehen kommen?', 3],
    ['にほんご が まだ あまり わからない ので、 ゆっくり はなして いただけます か。', 'Ich verstehe noch nicht viel Japanisch, könnten Sie langsam sprechen?', 3],
    ['まちがえて ちがう もの を かって しまった ので、 とりかえて いただけます か。', 'Ich habe versehentlich das Falsche gekauft, könnten Sie es umtauschen?', 3],
    ['きっぷ を なくして しまった ん です が、 もう いちど かわなければ なりません か。', 'Ich habe meine Fahrkarte verloren, muss ich noch einmal eine kaufen?', 3],
    ['あたま が いたい ので、 くすりや で ずつうやく を かいたい です。', 'Ich habe Kopfweh und möchte in der Apotheke ein Mittel dagegen kaufen.', 3],
    ['きのう から ねつ が あって、 のど も すこし いたい です。', 'Ich habe seit gestern Fieber, und der Hals tut auch ein bisschen weh.', 3],
    ['この くすり は いちにち さんかい、 しょくご に のんで ください。', 'Nehmen Sie dieses Medikament dreimal täglich nach dem Essen.', 3],
    ['ちかく に よる おそく まで あいて いる くすりや は あります か。', 'Gibt es in der Nähe eine Apotheke, die bis spät abends offen hat?', 3],
    ['おなか の ちょうし が わるい ん です が、 なにか いい くすり は あります か。', 'Mein Magen ist nicht in Ordnung, haben Sie ein gutes Mittel?', 3],
    ['むし に さされて とても かゆい ん です が、 ぬりぐすり は あります か。', 'Ich wurde von einem Insekt gestochen und es juckt sehr, haben Sie eine Salbe?', 3],
    ['ねむく なる かもしれない ので、 うんてん する まえ に は のまないで ください。', 'Es kann müde machen, nehmen Sie es bitte nicht vor dem Autofahren.', 3],
    ['きゅうきゅうしゃ を よんで ください。 ともだち が きゅう に たおれました。', 'Rufen Sie bitte einen Krankenwagen. Mein Freund ist plötzlich umgefallen.', 3],
    ['どちら から いらっしゃった ん です か。 にほん は はじめて です か。', 'Woher kommen Sie? Sind Sie zum ersten Mal in Japan?', 3],
    ['にほん に きた の は にかいめ で、 こんかい は ひとり で りょこう して います。', 'Ich bin zum zweiten Mal in Japan und reise diesmal allein.', 3],
    ['しごと で は なく、 やすみ を とって りょこう に きました。', 'Ich bin nicht beruflich hier, sondern habe Urlaub genommen, um zu reisen.', 3],
    ['にほん に は どのくらい たいざい する ん です か。', 'Wie lange bleiben Sie in Japan?', 3],
    ['にほんご が じょうず です ね。 どこ で べんきょう した ん です か。', 'Ihr Japanisch ist gut! Wo haben Sie es gelernt?', 3],
    ['いえいえ、 まだ まだ です。 まいにち すこし ずつ べんきょう して います。', 'Ach nein, noch lange nicht. Ich lerne jeden Tag ein bisschen.', 3],
    ['しゅみ は やま に のぼる こと で、 にほん の やま に も のぼって みたい です。', 'Mein Hobby ist Bergsteigen, und ich möchte auch in Japan Berge besteigen.', 3],
    ['にほん で たべた もの の なか で、 いちばん おいしかった の は おすし です。', 'Von allem, was ich in Japan gegessen habe, war Sushi am besten.', 3],
    ['おかげさま で、 とても たのしい りょこう に なりました。 ほんとう に ありがとう ございました。', 'Dank Ihnen war es eine sehr schöne Reise. Vielen herzlichen Dank.', 3],
    ['ひろしま の おこのみやき は、 おおさか の もの と ちがって そば が はいって います。', 'Okonomiyaki aus Hiroshima enthält im Gegensatz zu dem aus Osaka Nudeln.', 3],
    ['いっしょ に しゃしん を とりません か。 よかったら れんらくさき も こうかん しましょう。', 'Wollen wir ein Foto zusammen machen? Wenn Sie mögen, tauschen wir auch Kontakte.', 3],
    ['わたし の くに で は、 なつ でも こんな に むしあつく なりません。', 'In meinem Land wird es selbst im Sommer nicht so schwül.', 3],
    ['にほん の ひと は みんな しんせつ で、 こまった とき に たすけて くれました。', 'Die Leute in Japan sind alle freundlich und haben mir geholfen, als ich Probleme hatte.', 3],
    ['こんど の やすみ に は、 ほっかいどう に いって みたい と おもって います。', 'Im nächsten Urlaub möchte ich gern nach Hokkaido fahren.', 3],
    ['ずっと にほん に きたかった ので、 ゆめ が かなって うれしい です。', 'Ich wollte schon immer nach Japan, ich freue mich, dass mein Traum wahr wurde.', 3],
    ['また にほん に くる とき は、 ぜひ れんらく して ください ね。', 'Wenn Sie wieder nach Japan kommen, melden Sie sich unbedingt.', 3],
    ['えき の ちかく で は、 あるきながら たばこ を すって は いけません。', 'In der Nähe des Bahnhofs darf man nicht im Gehen rauchen.', 3],
    ['この さき は かんけいしゃ いがい たちいり きんし です。', 'Ab hier Zutritt nur für Befugte.', 3],
    ['びじゅつかん の なか で は、 てんじひん に さわらないで ください。', 'Bitte berühren Sie im Museum die Ausstellungsstücke nicht.', 3],
    ['こうえん に は ごみばこ が ない ので、 ごみ は もちかえって ください。', 'Im Park gibt es keine Mülleimer, nehmen Sie Ihren Müll bitte wieder mit.', 3],
    ['ほんじつ は ていきゅうび の ため、 おやすみ させて いただきます。', 'Heute ist Ruhetag, wir haben geschlossen.', 3],
    ['ここ から さき は さつえい きんし と なって おります。', 'Ab hier ist Fotografieren verboten.', 3],
    ['ここ は ちゅうりんじょう で は ない ので、 じてんしゃ を とめないで ください。', 'Das ist kein Fahrradparkplatz, bitte stellen Sie hier keine Fahrräder ab.', 3],
    ['こうじちゅう の ため、 この みち は とおれません。 うかい して ください。', 'Wegen Bauarbeiten ist diese Straße gesperrt. Bitte nehmen Sie einen Umweg.', 3],
    ['ゆか が ぬれて いる ので、 すべらない よう に ちゅうい して ください。', 'Der Boden ist nass, passen Sie auf, dass Sie nicht ausrutschen.', 3],
    ['そと から の のみもの の もちこみ は ごえんりょ ください。', 'Bitte keine mitgebrachten Getränke.', 3],
    ['おてあらい は かいだん を おりて、 みぎ に ございます。', 'Die Toiletten sind die Treppe hinunter rechts.', 3],

    // Mostly hiragana with katakana loanwords (only shown with „Beide“)
    ['トイレ は どこ です か。', 'Wo ist die Toilette?', 1],
    ['まいにち コーヒー を のみます。', 'Ich trinke jeden Tag Kaffee.', 1],
    ['この ラーメン は とても おいしい です。', 'Diese Ramen sind sehr lecker.', 1],
    ['わたし は オーストリア から きました。', 'Ich komme aus Österreich.', 1],
    ['この ケーキ は いくら です か。', 'Wie viel kostet dieser Kuchen?', 1],
    ['ウィーン は きれい な まち です。', 'Wien ist eine schöne Stadt.', 1],
    ['ビール を いっぱい ください。', 'Ein Bier, bitte.', 1],
    ['チョコレート を たべたい です。', 'Ich möchte Schokolade essen.', 1],
    ['ひらがな と カタカナ を れんしゅう して います。', 'Ich übe Hiragana und Katakana.', 2],
    ['きのう テレビ で サッカー を みました。', 'Gestern habe ich im Fernsehen Fußball geschaut.', 2],
    ['チェックアウト は なんじ まで です か。', 'Bis wann ist der Check-out?', 1],
    ['レシート を ください。', 'Die Quittung, bitte.', 1],
    ['ワイファイ は あります か。', 'Gibt es WLAN?', 1],
    ['エレベーター は どちら です か。', 'Wo ist der Aufzug?', 1],
    ['メニュー を みせて ください。', 'Zeigen Sie mir bitte die Speisekarte.', 1],
    ['タクシー を よんで ください。', 'Rufen Sie bitte ein Taxi.', 1],
    ['カード で おねがい します。', 'Mit Karte, bitte.', 1],
    ['レジぶくろ は いりません。', 'Ich brauche keine Tüte.', 1],
    ['コンビニ は どこ です か。', 'Wo ist ein Konbini?', 1],
    ['バスてい は どこ です か。', 'Wo ist die Bushaltestelle?', 1],
    ['アイスコーヒー を ひとつ ください。', 'Einen Eiskaffee, bitte.', 1],
    ['チケット を にまい ください。', 'Zwei Tickets, bitte.', 1],
    ['ホテル まで おねがい します。', 'Zum Hotel, bitte.', 1],
    ['テイクアウト で おねがい します。', 'Zum Mitnehmen, bitte.', 1],
    ['ゲーム が すき です。', 'Ich mag Videospiele.', 1],
    ['アニメ を よく みます。', 'Ich schaue oft Anime.', 1],
    ['ドイツご を はなせます か。', 'Sprechen Sie Deutsch?', 1],
    ['パスポート を みせて ください。', 'Zeigen Sie bitte Ihren Reisepass.', 1],
    ['ストロー は けっこう です。', 'Ich brauche keinen Strohhalm.', 1],
    ['ビール を もう いっぱい ください。', 'Noch ein Bier, bitte.', 1],
    ['トイレ は あちら です。', 'Die Toilette ist dort drüben.', 1],
    ['カフェ で すこし やすみましょう。', 'Machen wir im Café kurz Pause.', 1],
    ['この みせ で クレジットカード は つかえます か。', 'Kann man in diesem Geschäft mit Kreditkarte zahlen?', 2],
    ['しんかんせん の ホーム は どこ です か。', 'Wo ist der Bahnsteig für den Shinkansen?', 2],
    ['トイレ を かりて も いい です か。', 'Darf ich die Toilette benutzen?', 2],
    ['おすすめ の メニュー は どれ です か。', 'Welches Gericht empfehlen Sie?', 2],
    ['すみません、 ワイファイ の パスワード を おしえて ください。', 'Entschuldigung, sagen Sie mir bitte das WLAN-Passwort.', 2],
    ['スマホ を じゅうでん したい です。', 'Ich möchte mein Handy aufladen.', 2],
    ['コンセント は どこ に あります か。', 'Wo ist eine Steckdose?', 2],
    ['にもつ を フロント に あずけたい です。', 'Ich möchte mein Gepäck an der Rezeption abgeben.', 2],
    ['へや の エアコン が つきません。', 'Die Klimaanlage im Zimmer geht nicht an.', 2],
    ['この バス は きょうと えき に いきます か。', 'Fährt dieser Bus zum Bahnhof Kyoto?', 2],
    ['つぎ の バス は なんじ に きます か。', 'Wann kommt der nächste Bus?', 2],
    ['どこ で アイシーカード を かえます か。', 'Wo kann ich eine IC-Karte kaufen?', 2],
    ['この スーツケース を あずけたい です。', 'Ich möchte diesen Koffer aufgeben.', 2],
    ['ちかく に ドラッグストア は あります か。', 'Gibt es in der Nähe eine Drogerie?', 2],
    ['めんぜい カウンター は どこ です か。', 'Wo ist der Tax-free-Schalter?', 2],
    ['めんぜい に は パスポート が ひつよう です。', 'Für Tax-free braucht man den Reisepass.', 2],
    ['もう すこし おおきい サイズ は あります か。', 'Haben Sie das eine Nummer größer?', 2],
    ['この ジャケット を きて みて も いい です か。', 'Darf ich diese Jacke anprobieren?', 2],
    ['おみやげ に チョコレート を かいました。', 'Als Mitbringsel habe ich Schokolade gekauft.', 2],
    ['わたし は ウィーン に すんで います。', 'Ich wohne in Wien.', 2],
    ['オーストリア は ドイツ の みなみ に あります。', 'Österreich liegt südlich von Deutschland.', 2],
    ['にほん の アニメ が だいすき です。', 'Ich liebe japanische Anime.', 2],
    ['しゅうまつ に よく サッカー を します。', 'Am Wochenende spiele ich oft Fußball.', 2],
    ['きのう の よる、 ラーメン を たべに いきました。', 'Gestern Abend bin ich Ramen essen gegangen.', 2],
    ['この レストラン は よやく が ひつよう です か。', 'Braucht man für dieses Restaurant eine Reservierung?', 2],
    ['えいご の メニュー は あります か。', 'Gibt es eine englische Speisekarte?', 2],
    ['わたし は ピーナッツ が たべられません。', 'Ich darf keine Erdnüsse essen.', 2],
    ['たまご の アレルギー が あります。', 'Ich habe eine Eierallergie.', 2],
    ['おかいけい は レジ で おねがい します。', 'Bitte bezahlen Sie an der Kasse.', 2],
    ['ホテル の ちょうしょく は なんじ から です か。', 'Ab wann gibt es im Hotel Frühstück?', 2],
    ['おとな にまい の チケット を ください。', 'Zwei Tickets für Erwachsene, bitte.', 2],
    ['ここ で フラッシュ を つかって も いい です か。', 'Darf man hier mit Blitz fotografieren?', 2],
    ['エスカレーター で にかい に あがって ください。', 'Fahren Sie bitte mit der Rolltreppe in den ersten Stock.', 2],
    ['スマホ を タクシー に わすれました。', 'Ich habe mein Handy im Taxi vergessen.', 2],
    ['シムカード は どこ で かえます か。', 'Wo kann ich eine SIM-Karte kaufen?', 2],
    ['この ホテル に は ジム が あります か。', 'Gibt es in diesem Hotel ein Fitnessstudio?', 2],
    ['ドア が しまります ので、 ごちゅうい ください。', 'Die Türen schließen, bitte Vorsicht.', 2],
    ['コンビニ で おにぎり を ふたつ かいました。', 'Im Konbini habe ich zwei Onigiri gekauft.', 2],
    ['レジぶくろ は ひつよう です か。', 'Brauchen Sie eine Tüte?', 2],
    ['ポイントカード は おもち でしょう か。', 'Haben Sie eine Kundenkarte?', 2],
    ['こちら に サイン を おねがい します。', 'Unterschreiben Sie bitte hier.', 2],
    ['この ちかく に エーティーエム は あります か。', 'Gibt es hier in der Nähe einen Bankomaten?', 2],
    ['オーストリア の ビール も とても おいしい です よ。', 'Österreichisches Bier ist auch gut!', 2],
    ['ルームサービス は なんじ まで たのめます か。', 'Bis wann kann man den Zimmerservice bestellen?', 2],
    ['トランク に スーツケース を いれて いただけます か。', 'Könnten Sie den Koffer in den Kofferraum legen?', 2],
    ['しんじゅく まで タクシー で いくら ぐらい です か。', 'Wie viel kostet ungefähr ein Taxi bis Shinjuku?', 2],
    ['レシート は ふくろ に いれて おきます ね。', 'Ich lege Ihnen die Quittung in die Tüte.', 2],
    ['まど の そば の テーブル に すわりたい です。', 'Ich möchte an einem Tisch beim Fenster sitzen.', 2],
    ['チェックイン の まえ に、 にもつ を あずかって いただけます か。', 'Könnten Sie vor dem Check-in mein Gepäck aufbewahren?', 3],
    ['チェックアウト の あと で、 スーツケース を あずけて も いい です か。', 'Darf ich nach dem Check-out meinen Koffer hier lassen?', 3],
    ['へや の シャワー から おゆ が でない ので、 みて いただけません か。', 'Aus der Dusche im Zimmer kommt kein warmes Wasser, könnten Sie nachsehen?', 3],
    ['ワイファイ に つながらない ので、 パスワード を もう いちど おしえて ください。', 'Ich komme nicht ins WLAN, sagen Sie mir bitte noch einmal das Passwort.', 3],
    ['おまたせ しました、 こちら が ホットコーヒー に なります。', 'Danke fürs Warten, hier ist Ihr heißer Kaffee.', 3],
    ['ごちゅうもん が おきまり に なりましたら、 こちら の ボタン を おして ください。', 'Wenn Sie sich entschieden haben, drücken Sie bitte diesen Knopf.', 3],
    ['たまご の アレルギー が ある ので、 この ケーキ に たまご が はいって いる か おしえて ください。', 'Ich habe eine Eierallergie, sagen Sie mir bitte, ob in diesem Kuchen Ei ist.', 3],
    ['ベジタリアン な ので、 にく を つかって いない メニュー は あります か。', 'Ich bin Vegetarier, gibt es Gerichte ohne Fleisch?', 3],
    ['ごせんえん いじょう おかいあげ の かた は、 めんぜい カウンター へ どうぞ。', 'Kunden mit Einkäufen über 5000 Yen wenden sich bitte an den Tax-free-Schalter.', 3],
    ['コンビニ で おべんとう を かったら、 てんいん さん が あたためて くれました。', 'Als ich im Konbini ein Bento gekauft habe, hat es mir die Verkäuferin aufgewärmt.', 3],
    ['おはし と スプーン の どちら を おつけ しましょう か。', 'Möchten Sie Stäbchen oder einen Löffel dazu?', 3],
    ['しんかんせん に のる まえ に、 ホーム で えきべん を かいたい です。', 'Bevor ich in den Shinkansen steige, möchte ich am Bahnsteig ein Ekiben kaufen.', 3],
    ['この バス に のって、 よっつめ の バスてい で おりて ください。', 'Steigen Sie in diesen Bus und an der vierten Haltestelle aus.', 3],
    ['アイシーカード の ざんだか が たりない ので、 チャージ しなければ なりません。', 'Das Guthaben auf meiner IC-Karte reicht nicht, ich muss sie aufladen.', 3],
    ['かいさつ で アイシーカード が つかえなかったら、 えきいん さん に きいて ください。', 'Wenn die IC-Karte an der Sperre nicht funktioniert, fragen Sie bitte das Bahnpersonal.', 3],
    ['コインロッカー が ぜんぶ いっぱい だった ので、 えき の にもつ あずかりじょ を つかいました。', 'Weil alle Schließfächer voll waren, habe ich die Gepäckaufbewahrung am Bahnhof benutzt.', 3],
    ['おおきい スーツケース は コインロッカー に はいらない かもしれません。', 'Ein großer Koffer passt vielleicht nicht in ein Schließfach.', 3],
    ['くうこう まで は タクシー より リムジンバス の ほう が やすい です よ。', 'Zum Flughafen ist der Flughafenbus billiger als das Taxi.', 3],
    ['ひこうき が おくれた ので、 ホテル に チェックイン する の が おそく なります。', 'Weil mein Flug Verspätung hatte, checke ich später im Hotel ein.', 3],
    ['スーツケース が でて こない ので、 カウンター で きいて みます。', 'Mein Koffer kommt nicht, ich frage mal am Schalter nach.', 3],
    ['ゲート が かわった ので、 アナウンス を よく きいて ください。', 'Das Gate hat sich geändert, achten Sie bitte genau auf die Durchsagen.', 3],
    ['あぶない です から、 きいろい ブロック の うちがわ まで おさがり ください。', 'Bitte treten Sie hinter die gelbe Markierung zurück, es ist gefährlich.', 3],
    ['トイレ は かいだん を おりて、 みぎ に まがった ところ に あります。', 'Die Toilette ist die Treppe hinunter und dann rechts.', 3],
    ['まっすぐ いって、 ふたつめ の しんごう を ひだり に まがる と コンビニ が あります。', 'Gehen Sie geradeaus und biegen Sie an der zweiten Ampel links ab, dann kommt ein Konbini.', 3],
    ['みち に まよった ので、 スマホ の ちず で ホテル を さがして います。', 'Ich habe mich verlaufen, deshalb suche ich das Hotel auf der Karte im Handy.', 3],
    ['スマホ の じゅうでん が きれそう な ので、 どこか で じゅうでん できません か。', 'Mein Handyakku ist fast leer, kann ich ihn irgendwo aufladen?', 3],
    ['ワイファイ が ない ので、 くうこう で シムカード を かった ほう が いい です。', 'Da es kein WLAN gibt, kaufst du am besten am Flughafen eine SIM-Karte.', 3],
    ['でんしゃ の なか で は、 スマホ を マナーモード に して ください。', 'Stellen Sie Ihr Handy im Zug bitte auf lautlos.', 3],
    ['さいふ を タクシー に わすれた かもしれない ので、 タクシーがいしゃ に でんわ して もらえます か。', 'Vielleicht habe ich meine Geldbörse im Taxi vergessen, könnten Sie bei der Taxifirma anrufen?', 3],
    ['この チケット で、 びじゅつかん と おしろ の りょうほう に はいれます か。', 'Komme ich mit diesem Ticket sowohl ins Museum als auch ins Schloss?', 3],
    ['にゅうじょう チケット は オンライン で よやく した ほう が いい です よ。', 'Die Eintrittskarten reservierst du besser online.', 3],
    ['もうしわけ ございません、 きょう の チケット は うりきれ です。', 'Es tut uns leid, die Karten für heute sind ausverkauft.', 3],
    ['おてら の なか で は、 くつ を ぬいで、 フラッシュ は つかわないで ください。', 'Ziehen Sie im Tempel bitte die Schuhe aus und fotografieren Sie nicht mit Blitz.', 3],
    ['コンビニ で かった アイス を、 こうえん で たべながら さんぽ しました。', 'Ich bin durch den Park spaziert und habe dabei ein Eis aus dem Konbini gegessen.', 3],
    ['サッカー が すき なら、 いっしょ に スタジアム へ しあい を みに いきません か。', 'Wenn du Fußball magst, wollen wir zusammen ins Stadion gehen und ein Spiel anschauen?', 3],
    ['わたし は ウィーン から きました が、 にほん は はじめて です。', 'Ich komme aus Wien, bin aber zum ersten Mal in Japan.', 3],
    ['オーストリア は よく オーストラリア と まちがえられます けど、 カンガルー は いません。', 'Österreich wird oft mit Australien verwechselt, aber Kängurus gibt es bei uns keine.', 3],
    ['こども の ころ から にほん の アニメ を みて いた ので、 すこし にほんご が わかります。', 'Weil ich seit meiner Kindheit japanische Anime schaue, verstehe ich ein bisschen Japanisch.', 3],
    ['ゲーム が すき な ので、 あきはばら で ふるい ゲーム を さがしたい です。', 'Weil ich Videospiele mag, möchte ich in Akihabara nach alten Spielen suchen.', 3],
    ['ヨーロッパ に もって かえる ので、 こわれにくい おみやげ を さがして います。', 'Ich nehme es mit nach Europa, deshalb suche ich ein Mitbringsel, das nicht leicht kaputtgeht.', 3],
    ['この クッキー は ひもち が いい ので、 おみやげ に ぴったり です よ。', 'Diese Kekse halten lange, deshalb sind sie ideal als Mitbringsel.', 3],
    ['プレゼント よう に ラッピング して いただけません か。', 'Könnten Sie es als Geschenk einpacken?', 3],
    ['カード を こちら に さして、 あんしょうばんごう を にゅうりょく して ください。', 'Stecken Sie die Karte bitte hier ein und geben Sie Ihre PIN ein.', 3],
    ['おしはらい は げんきん に なさいます か、 カード に なさいます か。', 'Möchten Sie bar oder mit Karte bezahlen?', 3],
    ['げんきん しか つかえない ので、 コンビニ の エーティーエム で おろして きます。', 'Man kann nur bar zahlen, deshalb hole ich am Bankomaten im Konbini Geld.', 3],
    ['りょうしゅうしょ が ひつよう な とき は、 レジ で いって ください。', 'Wenn Sie eine Rechnung brauchen, sagen Sie es bitte an der Kasse.', 3],
    ['かぜ を ひいた ので、 ドラッグストア で くすり を かいたい です。', 'Ich habe mich erkältet, deshalb möchte ich in der Drogerie Medikamente kaufen.', 3],
    ['ずつう が ひどい ので、 ちかく の クリニック を おしえて いただけません か。', 'Ich habe starke Kopfschmerzen, könnten Sie mir eine Arztpraxis in der Nähe nennen?', 3],
    ['のみほうだい の コース は にじかん で、 ラストオーダー は さんじゅっぷん まえ です。', 'Das All-you-can-drink-Menü dauert zwei Stunden, die letzte Bestellung ist 30 Minuten vorher.', 3],
    ['ラストオーダー の おじかん です が、 ごちゅうもん は ございます か。', 'Es ist Zeit für die letzte Bestellung, möchten Sie noch etwas?', 3],
    ['おまたせ いたしました、 ごちゅうもん の カレーライス で ございます。', 'Danke fürs Warten, hier ist Ihr Curryreis.', 3],
    ['ドリンクバー は あちら に ございます ので、 ごじゆう に どうぞ。', 'Die Getränkebar ist dort drüben, bedienen Sie sich gerne.', 3],
    ['しょっけん を かって から、 カウンター の せき に すわって ください。', 'Kaufen Sie bitte zuerst einen Essensbon und setzen Sie sich dann an die Theke.', 3],
    ['この ラーメン は スープ が こくて、 ほんとう に おいしかった です。', 'Die Suppe dieser Ramen war kräftig, sie waren wirklich lecker.', 3],
    ['この バス は まえ から のって、 おりる とき に おかね を はらいます。', 'In diesen Bus steigt man vorne ein und zahlt beim Aussteigen.', 3],
    ['おりる バスてい が ちかづいたら、 この ボタン を おして ください。', 'Wenn Ihre Haltestelle näher kommt, drücken Sie bitte diesen Knopf.', 3],
    ['へや に カードキー を わすれた まま、 ドア を しめて しまいました。', 'Ich habe die Tür zugemacht und die Schlüsselkarte im Zimmer vergessen.', 3],
    ['もう いっぱく したい の です が、 シングル の へや は あいて います か。', 'Ich möchte noch eine Nacht bleiben, ist ein Einzelzimmer frei?', 3],
    ['ちょうしょく は いっかい の レストラン で、 ろくじはん から です。', 'Frühstück gibt es im Restaurant im Erdgeschoss ab halb sieben.', 3],
    ['おふろ に はいる まえ に、 シャワー で からだ を あらって ください。', 'Bevor Sie ins Bad steigen, waschen Sie sich bitte unter der Dusche.', 3],
    ['あさ は とても こむ ので、 ラッシュアワー を さけた ほう が いい です よ。', 'Morgens ist es sehr voll, du meidest besser die Stoßzeit.', 3],
    ['オーストリア の ひと は ハイキング が すき な ひと が おおい です。', 'Viele Österreicher wandern gern.', 3],
    ['ヨーロッパ に は ない あじ な ので、 この ソース が とても きに いりました。', 'Diesen Geschmack gibt es in Europa nicht, deshalb hat mir die Soße sehr gefallen.', 3],
    ['しゅみ は ゲーム と サッカー です が、 さいきん は にほんご の べんきょう も して います。', 'Meine Hobbys sind Videospiele und Fußball, aber in letzter Zeit lerne ich auch Japanisch.', 3],
    ['にほん の コンビニ は べんり で、 なん でも ある ので びっくり しました。', 'Japanische Konbinis sind praktisch, ich war überrascht, dass es dort alles gibt.', 3],
    ['ゴミばこ が あまり ない ので、 ゴミ は ホテル まで もって かえりました。', 'Es gibt kaum Mülleimer, deshalb habe ich den Müll bis ins Hotel mitgenommen.', 3],
    ['セール ちゅう な ので、 この シャツ は さんわりびき に なります。', 'Weil gerade Ausverkauf ist, gibt es auf dieses Hemd 30 Prozent Rabatt.', 3],
    ['サイズ が あわなかった ので、 ほか の サイズ に こうかん できます か。', 'Die Größe hat nicht gepasst, kann ich es gegen eine andere umtauschen?', 3],
    ['かいさつ の まえ で まって います から、 ホーム に ついたら れんらく して ください。', 'Ich warte vor der Sperre, melde dich bitte, wenn du am Bahnsteig angekommen bist.', 3],
    ['しゅうでん に まにあわなかった ので、 タクシー で ホテル に かえりました。', 'Ich habe den letzten Zug verpasst, deshalb bin ich mit dem Taxi ins Hotel zurückgefahren.', 3],
    ['でんしゃ が とまって いる ので、 バス で いった ほう が はやい かもしれません。', 'Da die Züge stehen, ist man mit dem Bus vielleicht schneller.', 3],
    ['くうこう の インフォメーション で、 しない へ の いきかた を ききました。', 'Am Infoschalter des Flughafens habe ich gefragt, wie man in die Stadt kommt.', 3],
    ['てにもつ に は、 えきたい や スプレー を いれないで ください。', 'Bitte keine Flüssigkeiten oder Sprays ins Handgepäck.', 3],
    ['チェックイン は しゅっぱつ の いちじかん まえ まで に すませて ください。', 'Erledigen Sie den Check-in bitte bis eine Stunde vor Abflug.', 3],
    ['どこ から きた の、 と きかれた ので、 オーストリア の ウィーン です、 と こたえました。', 'Ich wurde gefragt, woher ich komme, und habe geantwortet: aus Wien in Österreich.', 3],
    ['ウィーン に きたら、 ザッハトルテ を ぜひ たべて ください。', 'Wenn du nach Wien kommst, musst du unbedingt Sachertorte essen.', 3],
    ['あした の あさ、 くうこう まで の タクシー を よやく して いただけます か。', 'Könnten Sie für morgen früh ein Taxi zum Flughafen reservieren?', 3],
    ['ホーム と でんしゃ の あいだ が ひろく あいて います ので、 あしもと に ごちゅうい ください。', 'Zwischen Bahnsteig und Zug ist eine große Lücke, bitte achten Sie auf Ihre Schritte.', 3],
    ['でんしゃ の なか で は、 リュック を まえ に もつ か、 あみだな に のせて ください。', 'Tragen Sie Ihren Rucksack im Zug bitte vorne oder legen Sie ihn auf die Gepäckablage.', 3],
    ['エスカレーター で は、 きけん です から あるかないで ください。', 'Bitte gehen Sie auf der Rolltreppe nicht, es ist gefährlich.', 3],

    // Mostly katakana
    ['コーヒー と ケーキ を ください。', 'Kaffee und Kuchen, bitte.', 1],
    ['アイスクリーム が すき です。', 'Ich mag Eiscreme.', 1],
    ['ホテル の レストラン は どこ です か。', 'Wo ist das Restaurant des Hotels?', 1],
    ['タクシー で ホテル に いきます。', 'Ich fahre mit dem Taxi zum Hotel.', 1],
    ['ビール と ワイン を ください。', 'Bier und Wein, bitte.', 1],
    ['カメラ と スマホ が あります。', 'Hier sind eine Kamera und ein Smartphone.', 1],
    ['パン と チーズ と ワイン が すき です。', 'Ich mag Brot, Käse und Wein.', 1],
    ['スーパー で パン と ジュース と チーズ を かいました。', 'Im Supermarkt habe ich Brot, Saft und Käse gekauft.', 2],
    ['ホテル の レストラン で ハンバーガー を たべました。', 'Im Hotelrestaurant habe ich einen Hamburger gegessen.', 2],
    ['デパート で シャツ と ネクタイ と ジャケット を かいました。', 'Im Kaufhaus habe ich ein Hemd, eine Krawatte und eine Jacke gekauft.', 2],
    ['コンビニ で サンドイッチ と コーラ を かいます。', 'Im Konbini kaufe ich ein Sandwich und eine Cola.', 2],
    ['レストラン の メニュー に ステーキ と サラダ が あります。', 'Auf der Speisekarte des Restaurants gibt es Steak und Salat.', 2],
    ['インターネット で コンサート の チケット を かいました。', 'Ich habe die Konzertkarten im Internet gekauft.', 2],
    ['エレベーター は ロビー の となり です。', 'Der Aufzug ist neben der Lobby.', 2],
    ['ヨーロッパ の サッカー チーム が すき です。', 'Ich mag europäische Fußballmannschaften.', 2],
    ['パーティー で ファッション ショー を みました。', 'Auf der Party habe ich eine Modenschau gesehen.', 3],
    ['カフェ で ソフトクリーム と エスプレッソ を ちゅうもん しました。', 'Im Café habe ich Softeis und einen Espresso bestellt.', 3],
    ['ウェブサイト の デザイン を チェック して ください。', 'Bitte prüf das Design der Webseite.', 3],
    ['ディズニーランド で フォトスポット を さがしました。', 'Im Disneyland habe ich nach Fotospots gesucht.', 3],
    ['ボランティア の ミーティング は オンライン です。', 'Das Treffen der Freiwilligen ist online.', 3],
    ['フィンランド から きた シェフ が パスタ を つくりました。', 'Ein Koch aus Finnland hat Pasta gekocht.', 3],
    ['スマートフォン の アプリ で ウィーン の マップ を ダウンロード しました。', 'Ich habe mit einer Handy-App eine Karte von Wien heruntergeladen.', 3],
    ['フォーク と ナイフ と スプーン を テーブル に ならべて ください。', 'Leg bitte Gabel, Messer und Löffel auf den Tisch.', 3],
    ['ハロウィン の コスチューム は ドラキュラ です。', 'Mein Halloween-Kostüm ist Dracula.', 3],
    ['アイスコーヒー を ください。', 'Einen Eiskaffee, bitte.', 1],
    ['ドリンク メニュー を ください。', 'Die Getränkekarte, bitte.', 1],
    ['コインロッカー は どこ です か。', 'Wo sind die Schließfächer?', 1],
    ['フリー ワイファイ は あります か。', 'Gibt es kostenloses WLAN?', 1],
    ['クレジットカード は つかえます か。', 'Kann ich mit Kreditkarte zahlen?', 1],
    ['ポイントカード は ありません。', 'Ich habe keine Punktekarte.', 1],
    ['スプーン と フォーク を ください。', 'Einen Löffel und eine Gabel, bitte.', 1],
    ['ミルク と シュガー は いりません。', 'Ich brauche keine Milch und keinen Zucker.', 1],
    ['オーストリア の ウィーン から きました。', 'Ich komme aus Wien in Österreich.', 1],
    ['エアコン の リモコン は どこ です か。', 'Wo ist die Fernbedienung der Klimaanlage?', 1],
    ['ラストオーダー は なんじ です か。', 'Wann ist die letzte Bestellung?', 1],
    ['チーズバーガー と ポテト を ください。', 'Einen Cheeseburger und Pommes, bitte.', 1],
    ['ベジタリアン です。', 'Ich bin Vegetarier.', 1],
    ['ナッツ アレルギー が あります。', 'Ich habe eine Nussallergie.', 1],
    ['スマホ の バッテリー が きれました。', 'Der Akku meines Handys ist leer.', 1],
    ['アニメ と ゲーム が すき です。', 'Ich mag Animes und Videospiele.', 1],
    ['キャッシュレス で はらえます か。', 'Kann ich bargeldlos zahlen?', 1],
    ['ドラッグストア は どこ です か。', 'Wo ist die Drogerie?', 1],
    ['ワイファイ の パスワード は なん です か。', 'Wie lautet das WLAN-Passwort?', 2],
    ['アイシーカード を チャージ したい です。', 'Ich möchte meine IC-Karte aufladen.', 2],
    ['ハイボール と レモンサワー を ください。', 'Einen Highball und einen Zitronen-Sour, bitte.', 2],
    ['コーヒー は ホット と アイス、 どちら に します か。', 'Möchten Sie den Kaffee heiß oder eisgekühlt?', 2],
    ['ホテル の チェックイン は なんじ です か。', 'Um wie viel Uhr ist der Check-in im Hotel?', 2],
    ['ルームサービス の メニュー は あります か。', 'Gibt es eine Speisekarte für den Zimmerservice?', 2],
    ['バスタオル と シャンプー を ください。', 'Ein Badetuch und Shampoo, bitte.', 2],
    ['スーツケース を コインロッカー に いれました。', 'Ich habe den Koffer in ein Schließfach gestellt.', 2],
    ['テーマパーク の チケット を オンライン で かいました。', 'Ich habe die Tickets für den Freizeitpark online gekauft.', 2],
    ['ガイド ツアー は なんじ に スタート します か。', 'Um wie viel Uhr beginnt die Führung?', 2],
    ['ファミレス の ドリンクバー は セルフサービス です。', 'Die Getränkebar im Familienrestaurant ist Selbstbedienung.', 2],
    ['ゲームセンター で クレーンゲーム を しました。', 'In der Spielhalle habe ich am Greifautomaten gespielt.', 2],
    ['ハンバーガー の ピクルス と オニオン を ぬいて ください。', 'Bitte den Hamburger ohne Essiggurken und Zwiebeln.', 2],
    ['エアコン の リモコン の バッテリー が きれた みたい です。', 'Die Batterie der Klimaanlagen-Fernbedienung scheint leer zu sein.', 2],
    ['ドライヤー と アイロン を フロント で レンタル できます か。', 'Kann man an der Rezeption einen Föhn und ein Bügeleisen ausleihen?', 2],
    ['オーディオガイド と パンフレット は あります か。', 'Gibt es einen Audioguide und eine Broschüre?', 2],
    ['パスポート を みせれば、 タックスフリー で かえます。', 'Wenn Sie Ihren Reisepass zeigen, können Sie steuerfrei einkaufen.', 2],
    ['プリペイド の シムカード は どこ で かえます か。', 'Wo kann ich eine Prepaid-SIM-Karte kaufen?', 2],
    ['オーストリア は スキー と ザッハトルテ が ゆうめい です。', 'Österreich ist für Skifahren und Sachertorte bekannt.', 2],
    ['ホテル の シャトルバス は、 えき の ロータリー から でます か。', 'Fährt der Hotel-Shuttlebus vom Bahnhofsvorplatz ab?', 2],
    ['ナイト クルーズ の ツアー は ディナー つき です か。', 'Ist bei der nächtlichen Bootstour ein Abendessen inbegriffen?', 2],
    ['セルフレジ で バーコード を スキャン して、 カード で はらいます。', 'An der Selbstbedienungskasse scanne ich den Barcode und zahle mit Karte.', 2],
    ['ツインルーム を ダブルルーム に かえられます か。', 'Kann ich das Zweibettzimmer in ein Doppelzimmer umtauschen?', 2],
    ['スリッパ と パジャマ は クローゼット の なか に あります。', 'Hausschuhe und Pyjama sind im Kleiderschrank.', 2],
    ['アメニティ は ロビー の コーナー で ごじゆう に どうぞ。', 'Pflegeartikel können Sie sich in der Ecke der Lobby frei nehmen.', 2],
    ['トイレ の ウォシュレット の ボタン が よく わかりません。', 'Ich verstehe die Knöpfe der Dusch-WC-Toilette nicht richtig.', 2],
    ['ジントニック と カシスオレンジ を ください。', 'Einen Gin Tonic und einen Cassis-Orange, bitte.', 2],
    ['スターバックス で アイス キャラメル マキアート の トール サイズ を ちゅうもん しました。', 'Bei Starbucks habe ich einen Iced Caramel Macchiato in Größe Tall bestellt.', 3],
    ['ミルク を ソイミルク に かえて、 エクストラショット を ついか できます か。', 'Kann ich die Milch gegen Sojamilch tauschen und einen Extra-Shot dazunehmen?', 3],
    ['ホイップクリーム は なし で、 キャラメルソース を おおめ に して ください。', 'Bitte ohne Schlagobers und mit extra viel Karamellsauce.', 3],
    ['フライドポテト の セット で、 ドリンク は ジンジャーエール に します。', 'Ich nehme das Menü mit Pommes, und als Getränk ein Ginger Ale.', 3],
    ['ファミリーレストラン の ドリンクバー で メロンソーダ と ホットティー を のみました。', 'An der Getränkebar im Familienrestaurant habe ich Melonensoda und heißen Tee getrunken.', 3],
    ['ビール の ピッチャー と フライドチキン と シーザーサラダ を おねがいします。', 'Einen Krug Bier, frittiertes Hühnchen und einen Caesar Salad, bitte.', 3],
    ['ウーロンハイ を ふたつ と、 グレープフルーツ サワー を ひとつ ください。', 'Zwei Oolong-Highballs und einen Grapefruit-Sour, bitte.', 3],
    ['ワイファイ の パスワード を いれて も、 エラー メッセージ が でます。', 'Auch wenn ich das WLAN-Passwort eingebe, kommt eine Fehlermeldung.', 3],
    ['スマホ の アプリ で タクシー を よんで、 ホテル の エントランス で まって います。', 'Ich habe per Handy-App ein Taxi gerufen und warte am Hoteleingang.', 3],
    ['ルームサービス で サンドイッチ と ホットチョコレート を オーダー できます か。', 'Kann ich beim Zimmerservice ein Sandwich und eine heiße Schokolade bestellen?', 3],
    ['フライト が よる なので、 レイト チェックアウト を リクエスト したい です。', 'Mein Flug ist am Abend, daher möchte ich einen späten Check-out anfragen.', 3],
    ['アイシーカード に チャージ すれば、 バス も モノレール も のれます。', 'Wenn man die IC-Karte auflädt, kann man Bus und Monorail fahren.', 3],
    ['ターミナル の インフォメーション センター で バス の タイムテーブル を もらいました。', 'Im Informationszentrum des Terminals habe ich einen Busfahrplan bekommen.', 3],
    ['コインロッカー の サイズ が ちいさくて、 スーツケース が はいりません。', 'Das Schließfach ist zu klein, der Koffer passt nicht hinein.', 3],
    ['テーマパーク の アプリ で アトラクション の まちじかん を チェック できます。', 'Mit der App des Freizeitparks kann man die Wartezeiten der Attraktionen prüfen.', 3],
    ['ミュージアム ショップ で ポストカード と トートバッグ を かいました。', 'Im Museumsshop habe ich Postkarten und eine Stofftasche gekauft.', 3],
    ['ドラッグストア の セール で シャンプー と コンディショナー と ハンドクリーム を かいました。', 'Im Abverkauf der Drogerie habe ich Shampoo, Spülung und Handcreme gekauft.', 3],
    ['デパート の コスメ コーナー で ファンデーション と リップ を かいました。', 'In der Kosmetikabteilung des Kaufhauses habe ich Foundation und Lippenstift gekauft.', 3],
    ['セーター と マフラー と ニット キャップ を ショッピングモール で かいました。', 'Im Einkaufszentrum habe ich einen Pullover, einen Schal und eine Strickmütze gekauft.', 3],
    ['クレジットカード が エラー に なった ので、 キャッシュ で はらいます。', 'Die Kreditkarte hat einen Fehler angezeigt, deshalb zahle ich bar.', 3],
    ['この カフェ に、 スマホ を チャージ できる コンセント は あります か。', 'Gibt es in diesem Café eine Steckdose, an der ich mein Handy aufladen kann?', 3],
    ['ポケット ワイファイ を レンタル して、 スマホ で マップ アプリ を つかって います。', 'Ich habe einen Pocket-WLAN-Router gemietet und nutze am Handy eine Karten-App.', 3],
    ['ウィーン の クリスマス マーケット で ホットワイン を のみました。', 'Auf dem Wiener Christkindlmarkt habe ich Glühwein getrunken.', 3],
    ['カードキー を ルーム に わすれた まま、 オートロック の ドア が しまりました。', 'Ich habe die Schlüsselkarte im Zimmer vergessen, und die selbstverriegelnde Tür ist zugefallen.', 3],
    ['ルームクリーニング は いりません が、 タオル と トイレットペーパー を ください。', 'Ich brauche keine Zimmerreinigung, aber bitte Handtücher und Toilettenpapier.', 3],
    ['スキー リゾート の ショップ で、 スキー ウェア と ブーツ と ゴーグル を レンタル しました。', 'Im Shop des Skigebiets habe ich Skibekleidung, Schuhe und eine Skibrille ausgeliehen.', 3],
    ['コース メニュー の デザート は、 アイスクリーム か シャーベット を えらべます。', 'Als Dessert zum Menü können Sie zwischen Eis und Sorbet wählen.', 3],
    ['ベジタリアン なので、 ベーコン と ソーセージ を ぬいて もらえます か。', 'Ich bin Vegetarier. Könnten Sie den Speck und die Würstchen weglassen?', 3],
    ['ナッツ アレルギー です。 この デザート に アーモンド や ピーナッツ は はいって います か。', 'Ich habe eine Nussallergie. Sind in diesem Dessert Mandeln oder Erdnüsse?', 3],
    ['タクシー の ドライバー に、 スマホ の マップ で ホテル の ばしょ を みせました。', 'Ich habe dem Taxifahrer auf der Handykarte gezeigt, wo das Hotel ist.', 3],
    ['ロープウェイ の チケット は、 インフォメーション カウンター で かえます。', 'Die Tickets für die Seilbahn bekommt man am Informationsschalter.', 3],
    ['ハイキング コース の スタート は、 ケーブルカー の えき の となり です。', 'Der Wanderweg beginnt neben der Station der Standseilbahn.', 3],
    ['ペットボトル の ゴミ は、 リサイクル ボックス に すてて ください。', 'Bitte werfen Sie PET-Flaschen in die Recyclingbox.', 3],
    ['レジ の ホットスナック の ケース から、 フライドチキン を ひとつ ください。', 'Einmal frittiertes Hühnchen aus der Snack-Vitrine an der Kasse, bitte.', 3],
    ['コンビニ の コーヒーマシン は セルフサービス で、 カップ を セット して ボタン を おします。', 'Die Kaffeemaschine im Konbini ist Selbstbedienung: Man stellt den Becher hinein und drückt den Knopf.', 3],
    ['ウィーン から の フライト は、 ドバイ で トランジット が ありました。', 'Der Flug aus Wien hatte einen Zwischenstopp in Dubai.', 3],
    ['この カフェ の パンケーキ と フルーツ パフェ は、 インスタ で ゆうめい です。', 'Die Pancakes und das Frucht-Parfait dieses Cafés sind auf Instagram berühmt.', 3],
    ['ラーメン の トッピング に、 チャーシュー と ネギ と メンマ を ついか します。', 'Als Topping für die Ramen nehme ich zusätzlich Schweinebraten, Frühlingszwiebeln und Bambussprossen.', 3],
    ['カレー の からさ は マイルド で、 ライス は スモール サイズ で おねがいします。', 'Das Curry bitte mild und den Reis in kleiner Portion.', 3],
    ['ハウスワイン の グラス を、 レッド と ホワイト ひとつ ずつ ください。', 'Je ein Glas Hauswein, rot und weiß, bitte.', 3],
    ['ディナー ビュッフェ の りょうきん に、 ソフトドリンク も はいって います か。', 'Sind beim Preis für das Abendbuffet auch alkoholfreie Getränke inbegriffen?', 3],
    ['ショッピングモール の フードコート で、 ラーメン と ギョーザ を たべました。', 'Im Food Court des Einkaufszentrums habe ich Ramen und Gyoza gegessen.', 3],
    ['チェックイン の とき、 ラウンジ で ウェルカム ドリンク が もらえます。', 'Beim Check-in bekommt man in der Lounge ein Begrüßungsgetränk.', 3],
    ['パスポート は ルーム の セーフティボックス に いれて ください。', 'Bitte legen Sie den Reisepass in den Zimmersafe.', 3],
    ['チェックイン カウンター で スーツケース を あずけて、 ボーディング パス を もらいました。', 'Am Check-in-Schalter habe ich den Koffer aufgegeben und die Bordkarte bekommen.', 3],
    ['セキュリティ チェック で ペットボトル の ドリンク を すてました。', 'Bei der Sicherheitskontrolle habe ich das Getränk in der PET-Flasche weggeworfen.', 3],
    ['モバイルバッテリー は、 スーツケース で は なく リュック に いれて ください。', 'Bitte packen Sie die Powerbank nicht in den Koffer, sondern in den Rucksack.', 3],
    ['オーストラリア じゃ なくて、 オーストリア です。 カンガルー は いません。', 'Nicht Australien, sondern Österreich. Kängurus gibt es bei uns nicht.', 3],
    ['ホテル の レストラン の ランチ ビュッフェ は、 ドリンク と デザート つき です。', 'Beim Mittagsbuffet im Hotelrestaurant sind Getränke und Dessert inbegriffen.', 3],
    ['アイスクリーム の フレーバー は、 バニラ と チョコ と ストロベリー から えらべます。', 'Beim Eis können Sie zwischen Vanille, Schokolade und Erdbeere wählen.', 3],
    ['ヨーロッパ の プラグ に つかえる コンセント アダプター は あります か。', 'Haben Sie einen Steckdosenadapter für europäische Stecker?', 3],
  ];

  // Katakana combinations for loanwords that the kana quiz does not cover.
  const EXTRA = {
    ウィ: ['wi'], ウェ: ['we'], ウォ: ['wo'],
    ティ: ['ti', 'thi'], ディ: ['di', 'dhi'], デュ: ['dyu'],
    ファ: ['fa'], フィ: ['fi'], フェ: ['fe'], フォ: ['fo'],
    シェ: ['she'], ジェ: ['je'], チェ: ['che'], ヴ: ['vu'],
  };
  const SMALL = /[ゃゅょぁぃぅぇぉャュョァィゥェォ]/;
  const PUNCT = new Set([...'。、！？「」・…']);
  const PARTICLES = { は: ['wa', 'ha'], へ: ['e', 'he'], を: ['o', 'wo'] };

  // 'h' = only hiragana, 'k' = at least half katakana, 'mixed' = mostly hiragana
  // with some katakana. Counted per character, so a long loanword weighs more.
  function scriptOf(text) {
    const chars = [...text];
    const kata = chars.filter((c) => /[ァ-ヺー]/.test(c)).length;
    const hira = chars.filter((c) => /[ぁ-ゖ]/.test(c)).length;
    if (!kata) return 'h';
    return kata >= hira ? 'k' : 'mixed';
  }

  function tokenize(text) {
    const words = [];
    for (const raw of text.trim().split(/\s+/)) {
      const chars = [...raw];
      const kanaChars = chars.filter((c) => !PUNCT.has(c) && c !== '^');
      const tokens = [];
      let particleNext = false;
      for (let i = 0; i < chars.length; i++) {
        let ch = chars[i];
        if (ch === '^') {
          particleNext = true;
          continue;
        }
        if (PUNCT.has(ch)) {
          tokens.push({ text: ch, kind: 'punct' });
          continue;
        }
        const pair = ch + (chars[i + 1] || '');
        if (SMALL.test(chars[i + 1] || '') && (KANA_BY_ID[pair] || EXTRA[pair])) {
          ch = pair;
          i++;
        }
        const standalone = kanaChars.length === 1;
        if ((particleNext || standalone) && PARTICLES[ch]) {
          tokens.push({ text: ch, kind: 'particle', accept: PARTICLES[ch], canonical: PARTICLES[ch][0] });
        } else if (ch === 'っ' || ch === 'ッ') {
          tokens.push({ text: ch, kind: 'sokuon' });
        } else if (ch === 'ー') {
          tokens.push({ text: ch, kind: 'choon' });
        } else if (KANA_BY_ID[ch]) {
          const k = KANA_BY_ID[ch];
          tokens.push({ text: ch, kind: 'kana', kanaId: k.id, accept: [...k.accept], canonical: k.romaji });
        } else if (EXTRA[ch]) {
          tokens.push({ text: ch, kind: 'kana', accept: EXTRA[ch], canonical: EXTRA[ch][0] });
        } else {
          throw new Error(`Unbekanntes Zeichen „${ch}“ in „${text}“`);
        }
        particleNext = false;
      }
      words.push(tokens);
    }

    // Second pass: readings that depend on the neighbouring kana.
    const flat = words.flat().filter((t) => t.kind !== 'punct');
    flat.forEach((t, i) => {
      const prev = flat[i - 1];
      const next = flat[i + 1];
      if (t.kind === 'sokuon') {
        // Doubles the next consonant: きっぷ → kippu, まっちゃ → matcha / maccha.
        const firsts = new Set((next?.accept || []).map((a) => a[0]).filter((c) => c && !'aiueon'.includes(c)));
        if (next?.canonical.startsWith('ch')) firsts.add('t');
        t.accept = [...firsts];
        t.canonical = next?.canonical.startsWith('ch') ? 't' : next?.canonical[0] || '';
      } else if (t.kind === 'choon') {
        const vowel = prev?.canonical.slice(-1) || '';
        t.accept = [vowel, '-'];
        t.canonical = vowel;
      } else if (t.text === 'ん' || t.text === 'ン') {
        if (next && /^[bpm]/.test(next.canonical)) t.accept.push('m');
      } else if (t.kind === 'kana' && prev) {
        // A macron is read as a doubled vowel (ō → oo), so とう also accepts "too"
        // and せい also accepts "see". Leaving the long vowel out stays an error.
        const last = prev.canonical.slice(-1);
        if (t.text === 'う' && last === 'o') t.accept.push('o');
        if (t.text === 'い' && last === 'e') t.accept.push('e');
      }
    });
    return words;
  }

  const LONG_VOWELS = { ā: 'aa', â: 'aa', ī: 'ii', î: 'ii', ū: 'uu', û: 'uu', ē: 'ee', ê: 'ee', ō: 'oo', ô: 'oo' };

  // Lower-case, spell out long-vowel marks (ō → oo) and drop separators.
  function normalizeInput(s) {
    return s
      .toLowerCase()
      .normalize('NFC')
      .replace(/[āâīîūûēêōô]/g, (c) => LONG_VOWELS[c])
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[\s'’`.,!?;:"„“«»()、。！？]/g, '');
  }

  // Align the typed string with the token sequence. Each token consumes a slice of
  // the input; a slice that is not one of its accepted readings costs one error.
  // The secondary cost keeps wrong slices short, so a left-out kana is blamed
  // instead of its neighbour (kohi → ー missing, not コ typed as "k").
  function grade(words, rawInput) {
    const tokens = words.flat().filter((t) => t.kind !== 'punct');
    const input = normalizeInput(rawInput);
    const n = tokens.length;
    const m = input.length;
    const MAX_SLICE = 6;
    const INF = Number.POSITIVE_INFINITY;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
    const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-1));
    dp[0][0] = 0;

    for (let i = 0; i < n; i++) {
      const t = tokens[i];
      for (let j = 0; j <= m; j++) {
        if (dp[i][j] === INF) continue;
        const maxLen = i === n - 1 ? m - j : Math.min(MAX_SLICE, m - j);
        for (let len = 0; len <= maxLen; len++) {
          const slice = input.slice(j, j + len);
          const ok = t.accept.includes(slice);
          const cost = ok ? 0 : 1000 + 10 * len + Math.abs(len - t.canonical.length);
          if (dp[i][j] + cost < dp[i + 1][j + len]) {
            dp[i + 1][j + len] = dp[i][j] + cost;
            back[i + 1][j + len] = j;
          }
        }
      }
    }

    const results = new Array(n);
    let j = m;
    for (let i = n; i > 0; i--) {
      const start = back[i][j];
      const typed = input.slice(start, j);
      results[i - 1] = { token: tokens[i - 1], typed, ok: tokens[i - 1].accept.includes(typed) };
      j = start;
    }
    return { results, ok: results.every((r) => r.ok), input };
  }

  const romajiOf = (words) =>
    words
      .map((w) => w.filter((t) => t.kind !== 'punct').map((t) => t.canonical).join(''))
      .filter(Boolean)
      .join(' ');

  const buildItems = (list, type) =>
    list.map(([jp, de, level = 1]) => {
      const words = tokenize(jp);
      return {
        id: `${type}:${jp}`,
        type,
        jp,
        text: jp.replace(/\^/g, ''),
        de,
        words,
        romaji: romajiOf(words),
        script: scriptOf(jp),
        level,
      };
    });

  const ITEMS = [...buildItems(WORDS, 'word'), ...buildItems(SENTENCES, 'sentence')];

  window.KanaSentences = { ITEMS, tokenize, grade, normalizeInput };
})();
