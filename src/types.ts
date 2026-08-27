export type Faction = 'killer' | 'survivor';

export type MapType = 'ximending' | 'cathedral';

export type HealthState = 'healthy' | 'injured' | 'downed' | 'caged' | 'escaped' | 'dead';

export interface MapObject {
  id: string;
  name: string;
  type: 'generator' | 'cage' | 'exit_gate' | 'wall' | 'pillar' | 'pew' | 'altar' | 'tree' | 'cover';
  position: { x: number; y: number; z: number };
  size: { width: number; height: number; depth: number };
  rotation?: number;
  isCover?: boolean;
  isActiveGenerator?: boolean;
  isRepaired?: boolean;
  repairProgress?: number;
  color?: string;
}

export interface Character {
  id: string;
  name: string;
  role: 'survivor' | 'killer';
  characterId: string;
  health: HealthState;
  position: { x: number; z: number };
  rotation?: number;
  color?: string;
}

export interface GameMatchState {
  matchStatus: 'prep' | 'in_progress' | 'ended';
  generatorsCompleted: number;
  totalActiveGenerators: number;
  totalDecoyGenerators: number;
  exitGateState: 'locked' | 'powering' | 'open';
  exitGateProgress: number;
  survivorsEscapedCount: number;
  survivorsCagedCount: number;
  elapsedTime: number;
  killerTerrorRadius: number;
}

export interface MapMetrics {
  totalArea: number;
  coverDensityPercent: number;
  totalCoverObjects: number;
  generatorDistributionScore: number;
  prisonSeclusionScore: number;
  lineOfSightBlockagePercent: number;
}

export type PoseType = 'front' | 'left' | 'left1' | 'left2' | 'right' | 'right1' | 'right2' | 'ko' | 'back' | 'chase';

export interface CharacterInfo {
  id: string;
  name: string;
  title: string;
  faction: Faction;
  avatarColor: string;
  nationality: string;
  heightWeight: string;
  career: string;
  appearance: string;
  personality: string;
  backstory: string;
  skillName: string;
  skillKey: string;
  skillDescription: string;
  modelStyle: {
    bodyColor: number;
    accentColor: number;
    height: number;
    width: number;
  };
}

export interface PlayerState {
  id: string;
  characterId: string;
  name: string;
  faction: Faction;
  isHuman: boolean;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  health: HealthState;
  speed: number;
  isSprinting: boolean;
  attackCooldown?: number; // attack cooldown / recovery in seconds
  skillCooldown: number; // in seconds
  skillActiveTime: number; // in seconds
  cageTimer: number; // 90s countdown
  cageRemainingBefore: number; // tracked for +10s penalty rule
  cageCount: number; // times in cage
  hitBoostTime: number; // invulnerability / speed burst when hit
  frostbiteTime: number; // for Elena's ice curse (20s duration)
  elenaBuffTime: number; // Elena's 1.25x speed boost (20s duration)
  deepInjury: boolean; // for Gourmet's berserk hit
  berserkTime: number; // Gourmet's skill duration
  tariqStealthTime: number; // Tariq's stealth duration (10s)
  tariqSpeedBoostTime: number; // Tariq's speed boost duration (5s)
  betrayedTeammateId: string | null; // Teammate used as bait
  betrayedTeammateTime: number; // Duration of amplified aura/scratches for betrayed teammate (10s)
  jackBuffTime: number; // Jack's skill duration
  jackRescuedWindow?: number; // Time window after being rescued from cage to use skill
  wasRescuedFromCage?: boolean; // Flag marking Jack was rescued from cage
  vikingBuffTime: number; // Erik's skill duration
  erikSkillAvailable?: boolean; // Erik's skill availability flag (recharged upon being healed to healthy)
  satoBuffTime: number; // Sato's skill duration
  kentoFearScreamTime: number; // Duration of active fear scream panic state
  nextFearScreamTimer?: number; // Random interval between 30s and 60s for fear screams
  fearScreamRevealedToKiller?: boolean; // 50% chance survivor location is exposed to killer
  fearScreamRevealTimer?: number; // Duration of survivor location reveal to killer
  healProgress?: number; // 0 to 100% (takes 15s base from downed->injured or injured->healthy)
  healersCount?: number; // number of current survivors actively healing this player
  rescueProgress?: number; // 0 to 100% (takes 1.5s channel to rescue teammate from cage)
  cagingProgress?: number; // 0 to 100% (takes 5s channel to send downed survivor to cage)
  isBeingCaged?: boolean; // flag if killer is currently channeling cage on this player
  assignedCageId?: number | null; // ID of the cage this survivor is imprisoned in (guarantees 1 survivor per cage)
}

export interface GeneratorState {
  id: number;
  x: number;
  z: number;
  isTargetGen: boolean; // 5 out of 10 are target generators required to be repaired to power gates
  progress: number; // 0 to 100
  isCompleted: boolean;
  repairingCount: number;
  sparkEffectTime?: number;
}

export interface ExitGateState {
  id: number;
  x: number;
  z: number;
  progress: number; // 0 to 100 (takes 30s)
  isOpen: boolean;
  openingUserId?: string;
}

export interface CageState {
  id: number;
  x: number;
  z: number;
  occupiedPlayerId: string | null;
}

export interface ScratchMark {
  id: string;
  x: number;
  z: number;
  rotation: number;
  opacity: number;
  createdAt: number;
}

export interface BloodTrail {
  id: string;
  x: number;
  z: number;
  opacity: number;
  createdAt: number;
}

export interface LoudNoisePing {
  id: string;
  x: number;
  z: number;
  label: string;
  createdAt: number;
}

export interface GameStats {
  gensCompleted: number;
  survivorsEscaped: number;
  survivorsKilled: number;
  survivorsCaged: number;
  killerBreakCharges: number;
  matchTime: number;
  winner: 'killer' | 'survivor' | 'draw' | null;
  winReason?: string;
}

export const KILLERS: CharacterInfo[] = [
  {
    id: 'elena',
    name: '【凍原祭司】艾琳娜',
    title: 'Elena, The Tundra Shaman',
    faction: 'killer',
    avatarColor: '#38bdf8',
    nationality: '俄羅斯帝國庫頁島 / 歐裔西伯利亞人',
    heightWeight: '200 公分 / 50 公斤 (極度不協調乾屍身形，四肢修長且扭曲，行動如巨大蜘蛛，具強烈心理壓迫感)',
    career: '凍原祭司 / 通古斯薩滿教繼承者',
    appearance: '【臉部】皮膚呈現死灰般的慘白，佈滿凍瘡疤痕與黑斑。雙眼完全變成混濁的白色，沒有瞳孔，透露出狂熱的瘋狂。\n【頭髮】灰白色的長髮雜亂不堪，糾結成團，沾滿了泥土與凝固的血塊。\n【服裝】披著一件用狼皮、鹿皮與人類頭髮編織而成的破爛神衣，上面留有深色乾枯的血跡與詭異的薩滿符號。\n【頭飾】佩戴著一對巨大的馴鹿角頭飾，頭骨部分用粗糙的皮繩綁在她的頭上，增添了野獸般的氣息。\n【武器】一把生鏽且沉重的捕鯨叉，尖端還掛著一條血淋淋的布條。',
    personality: '狂熱瘋狂、極度冷酷。遊走在現實與惡靈幻象之間，嘴裡哼唱著詭異的招魂曲，將誤入森林的獵物視為獻祭給凍原惡靈的祭品。',
    backstory: '艾琳娜出生於 19 世紀末俄羅斯帝國最東端的庫頁島流放地，她的父母是政治犯。在那個嚴酷的冰原上，為了生存，她的家族秘密地保留了古老的通古斯薩滿教儀式。\n\n然而，一場毀滅性的瘟疫席捲了聚落，奪走了所有人的生命，唯獨艾琳娜活了下來。為了復活親人，艾琳娜在飢餓與絕望中變得瘋狂，她開始接觸一種被禁忌的「冰封惡靈」信仰。她相信血祭能換來永恆的溫暖與重生。\n\n她不僅殺害了試圖救援的考察隊，還將他們的血肉製成神衣，並戴上象徵森林守護者的鹿角，成為了這片凍原上的「祭司」。她遊走在現實與惡靈的幻象之間，嘴裡哼唱著詭異的招魂曲，將誤入森林的獵物視為獻祭給凍原惡靈的祭品。',
    skillName: '冰封詛咒 (Curse of Permafrost)',
    skillKey: 'Shift 鍵 (特殊攻擊投射)',
    skillDescription: '艾琳娜擁有特殊攻擊，按下 Shift 鍵能向逃生者丟冰魔法攻擊（丟出特殊攻擊圖片）。擊中讓逃生者受傷並附加 20 秒「凍傷狀態」，且艾琳娜增加移動時間 20 秒 (移速提升 1.25x) 直至將該凍傷狀態逃生者擊倒。遵守原遊戲設定（健康→受傷→倒地，不可直接擊倒健康逃生者）；若特殊攻擊一次攻擊到多數逃生者，則被攻擊到的逃生者都會受傷！',
    modelStyle: {
      bodyColor: 0x38bdf8,
      accentColor: 0x0284c7,
      height: 2.2,
      width: 0.65,
    },
  },
  {
    id: 'gourmet',
    name: '陳家豪 (Chen, Chia-Hao)',
    title: '老饕 (The Gourmet)',
    faction: 'killer',
    avatarColor: '#ef4444',
    nationality: '台灣人，亞洲男性',
    heightWeight: '180 公分，60 公斤（身形消瘦、筋骨結實，常年勞動導致皮包骨般的緊繃感）',
    career: '暗巷鮮肉攤主 / 狂暴屠夫',
    appearance:
      '【面部 / 頭部】半禿的頭頂帶有零星黑色碎髮，面部常年被一張粗糙、透著油膩灰質的工業防塵面具（或遮面灰布）覆蓋，僅露出陰冷空洞的雙眼。\n' +
      '【服裝配件】沾滿凝固黑紅血漬、洗得發白的白色橡膠圍裙，內搭磨損嚴重的黑色工作服。\n' +
      '【武器】一把長柄、厚重的傳統台灣市場專用剁肉大砍刀（菜刀），刀刃上有經年累月砍擊骨骼造成的細密缺口，散發著一股洗不掉的鐵鏽與腥甜味。\n' +
      '【風格定位】寫實主義結合強烈的美式恐怖（結合了《德州電鋸殺人狂》的狂亂屠夫感與亞洲傳統市場陰暗潮濕的視覺衝擊）。',
    personality:
      '【風格定位】：寫實主義結合強烈的美式恐怖（結合了《德州電鋸殺人狂》的狂亂屠夫感與亞洲傳統市場陰暗潮濕的視覺衝擊）。\n' +
      '【核心性格】：極具暴發力與耐力，將「烹調」與「獵殺」視為同一種藝術。對食材與獵物有著冷酷殘忍的執念，在鮮血與切割的觸感中體驗病態的愉悅。',
    backstory:
      '在台灣某個老舊、人煙稀薄的傳統市場深處，有一間從不拉下鐵門休息、卻也從不見衛生局稽查的無名肉攤。攤主陳家豪總是笑臉迎人，切肉手法乾淨俐落，街坊鄰居總誇他老實、勤奮。\n\n' +
      '然而，沒人知道那些肉的來源。\n\n' +
      '早年因賭博欠下巨額高利貸的陳家豪，在走投無路之際，為了保命而殺了第一個來討債的債主。將屍體帶回肉攤分解的那個夜晚，他不僅發現了償還債務的「捷徑」，更在鮮血與切割的觸感中，徹底扭曲了心理。他開始將目光投向那些落單的遊民、外地移工，甚至是誤入舊市場的深夜遊客。\n\n' +
      '他的手法極其熟練，將「烹調」與「獵殺」視為同一種藝術。他那瘦弱的身軀下藏著令人膽寒的暴發力與耐力。直到某個暴雨夜，警方與倖存者終於破獲了那間肉舖，但當大門被撞開時，屋內空無一人——只有掛在肉勾上的殘肢，以及牆上用血寫下的神祕符號。\n\n' +
      '從那以後，陳家豪的身影便在迷霧籠罩的異空間中甦醒。他帶著他那柄永不生鏽的大砍刀，將所有試圖逃跑的倖存者，當作下一道送上砧板的優質食材。',
    skillName: '狂暴化模式 (Berserk Rage Mode)',
    skillKey: 'Shift 鍵 (進入狂暴化 30 秒)',
    skillDescription:
      '按下 Shift 鍵進入狂暴化模式 30 秒，被這狀態砍中逃生者進入深度受傷狀態，此狀態會大幅增加被治療時間直至完全恢復才解除。注意狂暴狀態並不是直接將對手擊倒，依舊要遵守擊中健康逃生者是優先讓對手進入受傷，受傷情況被擊中才是真的將逃生者擊倒。冷卻時間 15 秒。',
    modelStyle: {
      bodyColor: 0x991b1b,
      accentColor: 0x450a0a,
      height: 1.8,
      width: 0.65,
    },
  },
];

export const SURVIVORS: CharacterInfo[] = [
  {
    id: 'kento',
    name: '佐藤 健人 (Kento Sato)',
    title: '被加班吞噬的幽魂',
    faction: 'survivor',
    avatarColor: '#60a5fa',
    nationality: '日本 / 黃種人',
    heightWeight: '170 公分 / 70 公斤',
    career: '資深大型企業資深行銷主任（長期深陷無止境加班與職場壓力的典型日本社畜）',
    appearance:
      '【面部特徵】亞洲男性面孔，面部肌肉長期因慢性疲勞而緊繃。雙眼佈滿血絲，黑眼圈極深，眼神空洞且常帶有驚恐與麻木交織的神情。臉頰略顯凹陷，嘴唇乾裂，額頭上有因長期用手揉捏而留下的微紅壓痕。\n' +
      '【髮型】凌亂的黑髮，幾絲油膩的瀏海垂在額前，暗示他已經好幾天沒有好好梳洗或休息。\n' +
      '【服裝配色】身穿一套剪裁原本筆挺、如今卻皺巴巴的深藍色全套西裝。西裝外套沾滿了黑色的墨漬與灰燼，白襯衫的領口被粗魯地扯開，領帶歪斜地掛在胸前，甚至有一端不小心被咖啡漬染黑。\n' +
      '【細節配件】手腕上戴著一隻指針永遠停在「深夜 23:45」的機械手錶；肩膀上斜背著一個皮革已經磨損、塞滿過期文件與發票的公事包。',
    personality:
      '極度焦慮、疲憊不堪、對權威有本能的恐懼，但在絕境中卻意外展現出無比頑強的「社畜韌性」——既然連地獄般的公司都熬得過，這場惡夢或許也能咬牙撐過去。\n' +
      '【行為特徵】在安全時會習慣性地看手錶、喃喃自語：「趕不上末班車了……部長會殺了我……」；奔跑時姿勢有些笨拙且駝背，雙手死死護著公事包，彷彿那是他在這個殘酷世界裡唯一的護身符。',
    backstory:
      '佐藤健人在一家跨國企業擔任螺絲釘般的基層主管，無止境的加班、上司的苛責和龐大的房貸壓力讓他早已形同枯槁。\n\n' +
      '某天深夜，他在公司大樓準備搭乘深夜電梯返家時，電梯門打開卻沒有迎來熟悉的地下停車場，而是一片濃霧與血腥味的詭異荒蕪世界。起初，他以為這只是另一場過勞引起的噩夢，直到冰冷的追殺聲在耳邊響起，他才意識到——這場加班，永遠不會有打卡下班的一刻。',
    skillName: '恐懼應激 / 社畜絕境爆發 (Panic Work Surge)',
    skillKey: 'Shift 鍵 (發生因恐懼而尖叫的狀況時觸發)',
    skillDescription:
      '這個角色發生因恐懼而尖叫的狀況時按下 Shift 鍵增加修理電箱的速度 10%（持續 20 秒，冷卻 15 秒）。\n' +
      '【平衡規範】：嚴禁角色按下 Shift 鍵自己觸發尖叫。',
    modelStyle: {
      bodyColor: 0x1e3a8a,
      accentColor: 0xf8fafc,
      height: 1.7,
      width: 0.55,
    },
  },
  {
    id: 'jack',
    name: '傑克・米勒 (Jack Miller)',
    title: '二戰美軍步兵連下士 (Corporal)',
    faction: 'survivor',
    avatarColor: '#10b981',
    nationality: '人類（美國人）',
    heightWeight: '身高 180 公分，體重 80 公斤（精實、結實的戰鬥體格，長期承受高壓軍事訓練與戰場勞動，肌肉線條明顯但不顯笨重）',
    career: '第二次世界大戰美國陸軍步兵連下士（Corporal），在一次密林夜間遭遇戰中與部隊失散，隨後被捲入未知的詭異迷霧與恐怖禁區。',
    appearance:
      '【面部特徵】白人膚色，長期日曬與風吹雨淋帶有粗糙感。右側臉頰上有一條由刺刀或彈片劃開的明顯舊傷疤，眼神銳利且充滿戒備。\n' +
      '【髮型與髮色】經典的美軍短寸頭，金色的頭髮在塵土與血污中顯得有些黯淡。\n' +
      '【服裝與配色】\n' +
      '• 主色調：橄欖褐色（Olive Drab）與卡其色（Khaki）。\n' +
      '• 服裝細節：身穿破損且沾滿泥巴的 M41 野戰夾克，內搭卡其色羊毛衫。袖口和褲管紮在軍靴內，腰間繫著帶有彈藥袋與刺刀鞘的帆布腰帶。衣服多處有因爆炸或掙扎造成的焦黑與撕裂痕跡，散發濃厚的美式寫實軍事恐怖氛圍。',
    personality:
      '【核心特質】剛毅、勇猛、極度務實、臨危不亂。\n' +
      '【背景心理】經歷過血腥的諾曼第或太平洋島嶼戰役，見證過同袍的死亡。這讓他對「生存」有著超乎常人的執著，但也背負著戰場創傷後遺症（PTSD）。在面對超自然或非理性的恐怖時，他起初會試圖用軍事戰術去理解與對抗，隨後才會意識到傳統武器的無力。',
    backstory:
      '1944 年秋天，傑克所屬的步兵連在法國某處陰森的密林中執行夜間偵察任務。隨著濃重的血色霧氣漫山遍野地湧來，通訊設備徹底失效，四周響起了非人的低語與沉重而詭異的腳步聲。在隨後的混戰中，德軍的防線早已不重要，因為黑暗中爬出的是遠比戰爭更為恐怖、無法用子彈殺死的扭曲怪物。傑克的同袍一個接一個在迷霧中被拖走，而他在拼死反擊、用刺刀劃破某個怪物的軀體後，逃進了一處深不見底的迷霧裂隙中。當他再次醒來時，戰場的槍砲聲已然消失，取而代之的是永無止境的詭異廢墟與那令人窒息的追逐夢魘。',
    skillName: '戰術強韌 / 戰地救援與修復 (Battlefield Grit & Repair)',
    skillKey: 'Shift 鍵 (受傷狀態或從監獄獲救後觸發)',
    skillDescription:
      '當這角色進入受傷狀態或從監獄獲救後，按下 Shift 鍵增加治療隊友及修機速度 10%，時間為 30 秒（冷卻 15 秒）。\n' +
      '【使用限制】：若無達成受傷狀況或從監獄獲救的條件則 Shift 鍵無法使用（按了無反應）。',
    modelStyle: {
      bodyColor: 0x15803d,
      accentColor: 0xca8a04,
      height: 1.8,
      width: 0.6,
    },
  },
  {
    id: 'erik',
    name: '艾瑞克·「紅髮」托森 (Erik "The Red" Thorsson)',
    title: '維京狂戰士 (Úlfhéðnar Viking Berserker)',
    faction: 'survivor',
    avatarColor: '#f97316',
    nationality: '11世紀中葉古斯堪地那維亞人（瑞典維京人）',
    heightWeight: '185公分，90公斤（精壯、充滿爆發力的戰士體格，長期在極地與航海中鍛鍊出的紮實肌肉）',
    career: '西元11世紀中葉的古代維京狂戰士（Úlfhéðnar 信仰背景）',
    appearance:
      '【膚色與臉部】長期受北歐海風與烈日摧殘的白皙皮膚，但在顴骨和鼻樑處有明顯的日曬紅暈與密集的淡褐色雀斑。\n' +
      '【髮色與毛髮】如野火般耀眼的深紅色亂髮與編起短辮的落腮鬍，沾著微乾的血漬與泥土。\n' +
      '【服裝點綴】身穿粗糙耐磨的褐色亞麻長袖上衣，搭配寬鬆的羊毛寬褲，繫著一條磨損嚴重的皮革腰帶，上面掛著空無一物的劍鞘與幾個殘破的護身符皮袋。',
    personality:
      '【個性及身分】西元11世紀中葉的古代維京狂戰士（Úlfhéðnar 信仰背景），生性勇猛好戰、固執且極度具有戒心。\n' +
      '【心理狀態】面對超自然恐怖時，最初會試圖用凡人的武力與戰吼去對抗，但在見證無法理解的詭異力量後，內心深處正逐漸被恐懼與絕望侵蝕。',
    backstory:
      '【霧中瓦爾哈拉】\n' +
      '在西元1050年的深秋，艾瑞克所屬的長船艦隊在波羅的海遭遇了一場詭異的深海濃霧。那不是自然的霧氣，而是帶著腐爛海草與鐵鏽味的冰冷黑煙。當船隻撞擊上未知的黑色礁石時，船員們紛紛跳入冰冷的海水中求生。\n\n' +
      '然而，當艾瑞克從一座陰森、佈滿灰白泥濘與枯樹的海岸線上醒來時，他的同伴們已經不見了。取而代之的是空氣中揮之不去的低語聲，以及森林深處傳來、不屬於人類的骨骼碎裂聲。\n\n' +
      '他試圖用手中的戰斧劈開黑暗，但隨即發現這裡沒有榮耀的戰鬥，只有無盡的獵殺與扭曲的邪神幻影。這片被詛咒的迷霧領域將他視為獵物，而他那身曾在北歐戰場上令敵軍膽寒的勇猛，在此地化為了一場場血腥的噩夢。現在，他必須學會在這片充滿畸形恐怖的異空間中潛行、喘息，並在每一次心跳加速的追逐中尋找一線生機。',
    skillName: '狂怒疾馳 (Berserker Surge)',
    skillKey: 'Shift 鍵 (受傷時提升速度 20 秒)',
    skillDescription:
      '被殺手攻擊到受傷時，按下 Shift 鍵移動速度短暫提升 20 秒，之後要被重新治療才可再次使用技能。',
    modelStyle: {
      bodyColor: 0xc2410c,
      accentColor: 0x78350f,
      height: 1.85,
      width: 0.65,
    },
  },
  {
    id: 'tariq',
    name: '塔里克·阿爾-哈希姆 (Tariq Al-Hashim)',
    title: '潛伏的背叛者 (The Cunning Infiltrator)',
    faction: 'survivor',
    avatarColor: '#a855f7',
    nationality: '南非人（具備混合血統與中東生活背景）',
    heightWeight: '165公分，55公斤（身材精瘦、敏捷，擅長在狹窄空間中鑽動與躲藏）',
    career: '前極端組織 ISIS 內部負責敵後滲透與情報刺探的狡詐潛伏者 / 流亡海外的南非籍移工。',
    appearance:
      '【視覺配色】\n' +
      '• 臉頰與膚色：深棕色，帶有風沙吹拂與長期熬夜的粗糙質感。\n' +
      '• 頭髮：全黑色、凌亂且帶有油光的短髮。\n' +
      '• 服裝點綴：外罩一件中東傳統的黑白相間傳統長袍（Keffiyeh風格融合日常戰術服飾），長袍邊緣沾滿塵土、乾涸的血跡與撕裂的破口，在黑暗中能形成獨特的視覺剪影。\n' +
      '【細節表現】\n' +
      '• 眼神：眼神閃爍、多疑，時常呈現驚恐卻又帶著算計的冷酷。\n' +
      '• 動作語言：走路時習慣壓低身形、貼牆而行；受傷時會發出壓抑的喘息聲，但眼神仍死死盯著周遭的人。',
    personality:
      '【風格參考】：寫實主義 (Photorealistic)，帶有強烈的美式生存恐怖美學（如《絕命精神病院》Outlast 或《黎明死線》Dead by Daylight 的寫實壓抑風格）。\n' +
      '【核心性格】：在無數次殘酷的生存與追殺中磨練出極其冷血的求生本能。信奉「為達目的不擇手段」的極致生存哲學，在他眼中，其他的逃生者不是並肩作戰的夥伴，而是隨時可以犧牲的誘餌與擋箭牌。',
    backstory:
      '表面上，塔里克是一名流亡海外、尋求庇護的南非籍移工；實際上，他曾是極端組織 ISIS 內部負責敵後滲透與情報刺探的狡詐潛伏者。他在無數次殘酷的生存與追殺中磨練出極其冷血的求生本能。\n\n' +
      '當他被捲入這個超自然的恐怖異空間時，他那套「為達目的不擇手段」的生存哲學並未改變——在他眼中，其他的逃生者不是並肩作戰的夥伴，而是隨時可以犧牲的誘餌與擋箭牌。',
    skillName: '背叛之影 (Shadow of Betrayal)',
    skillKey: 'Shift 鍵 (雙人同時被追逐時解鎖)',
    skillDescription:
      '當你與另一名逃生者同時被殺手追逐時，按下 Shift 鍵消失自己的氣場及足跡且讓隊友的足跡或氣場更明顯 10 秒，而你獲得額外的移動速度加成 5 秒。\n' +
      '【使用限制】：若無達成「與另一名逃生者同時被殺手追逐」條件則 Shift 鍵無法使用（按了無反應）。冷卻時間 15 秒。',
    modelStyle: {
      bodyColor: 0x6b21a8,
      accentColor: 0xe2e8f0,
      height: 1.65,
      width: 0.48,
    },
  },
];
