'use strict';

/**
 * Hướng dẫn Cốt truyện StoryGuide (SillyTavern UI Extension)
 * v0.9.8
 *
 * Mới: Tùy chỉnh mô-đun đầu ra (Tự do hơn)
 * - Bạn có thể tùy chỉnh "danh sách mô-đun đầu ra" và prompt riêng cho từng mô-đun.
 * - Bảng điều khiển cung cấp khu vực chỉnh sửa "Cấu hình mô-đun (JSON)": có thể thêm/xóa trường, đổi thứ tự, sửa prompt, kiểm soát việc hiển thị trong bảng điều khiển/tự động thêm.
 * - Tiện ích sẽ tự động tạo JSON Schema (trường động) dựa trên mô-đun và yêu cầu model xuất ra theo Schema đó.
 *
 * Tương thích: Vẫn giữ khả năng của v0.3.x "API độc lập đi qua proxy backend + Chống ghi đè cập nhật biến (tự động bù) + Nhấp để thu gọn".
 *
 * v0.8.2 Sửa lỗi: Tương thích trường hợp SlashCommand trả về [object Object] (tự động phân giải UID / xuất văn bản).
 * v0.8.3 Mới: Chức năng tóm tắt hỗ trợ tùy chỉnh prompt (mẫu system + user, hỗ trợ placeholder).
 * v0.8.6 Sửa lỗi: Ghi vào Worldbook không còn phụ thuộc vào JS để phân giải UID (chuyển sang truyền UID trong cùng một đoạn STscript pipeline bằng {{pipe}}), tránh báo lỗi sai "không thể phân giải UID".
 * v0.9.0 Sửa lỗi: Vấn đề đọc Worldbook Đèn Xanh (Blue Light) theo thời gian thực bị phân giải thành 0 mục trên một số phiên bản ST trả về trường bao bọc (như data là chuỗi JSON); và tăng cường khả năng tương thích đọc endpoint/tên tệp.
 * v0.9.1 Mới: "Nhật ký chỉ mục" của Chỉ mục Đèn Xanh → Kích hoạt Đèn Xanh Lá (hiển thị tên mục trúng/từ khóa được tiêm), thuận tiện cho việc kiểm tra hiệu quả kích hoạt.
 * v0.9.2 Sửa lỗi: Tiền tố tiêu đề mục (comment) hiện luôn được thêm vào đầu (ngay cả khi model xuất ra title tùy chỉnh cũng sẽ giữ lại tiền tố).
 * v0.9.4 Mới: "Từ khóa chính (key)" ghi vào Worldbook khi tóm tắt có thể chuyển sang "Số hiệu chỉ mục" (như A-001), chỉ ghi 1 từ khóa kích hoạt, kích hoạt chính xác hơn.
 * v0.9.5 Cải tiến: Khớp chỉ mục Đèn Xanh sẽ tổng hợp "N nội dung tin nhắn gần nhất + đầu vào người dùng hiện tại", thay vì chỉ xem nội dung chính gần đây (có thể tắt/điều chỉnh trọng số trong bảng điều khiển).
 * v0.9.6 Cải tiến: Hiển thị số phiên bản ở tiêu đề bảng điều khiển, thuận tiện xác nhận xem đã cập nhật chính xác lên phiên bản chứa cài đặt "trọng số đầu vào người dùng" hay chưa.
 * v0.9.9 Cải tiến: Tách "Hướng dẫn cốt truyện / Cài đặt tóm tắt / Cài đặt chỉ mục" thành ba trang (tab phân trang bên trái), giao diện rõ ràng hơn.
 * v0.9.8 Mới: Chọn thủ công phạm vi tầng tóm tắt (ví dụ 20-40) và nhấp tóm tắt ngay.
 * v0.10.0 Mới: Tóm tắt phạm vi tầng thủ công hỗ trợ "tách thành nhiều mục Worldbook theo mỗi N tầng" (ví dụ 1-80 và N=40 → 2 mục).
 */

const SG_VERSION = '0.10.0';

const MODULE_NAME = 'storyguide';

/**
 * Ví dụ định dạng cấu hình mô-đun (Mảng JSON):
 * [
 * {"key":"world_summary","title":"Giới thiệu thế giới","type":"text","prompt":"1~3 câu tóm tắt thế giới và cục diện","required":true,"panel":true,"inline":true},
 * {"key":"key_plot_points","title":"Điểm cốt truyện quan trọng","type":"list","prompt":"3~8 điểm cốt truyện then chốt (câu ngắn)","maxItems":8,"required":true,"panel":true,"inline":false}
 * ]
 *
 * Giải thích trường:
 * - key: Tên trường xuất JSON (duy nhất)
 * - title: Tiêu đề hiển thị trong báo cáo
 * - type: "text" hoặc "list" (list = string[])
 * - prompt: Prompt tạo sinh cho mô-đun này (sẽ ghi vào Output Fields)
 * - required: Có bắt buộc xuất trường này không
 * - panel: Có hiển thị trong "Báo cáo" không
 * - inline: Có hiển thị trong "Khung phân tích tự động thêm" không
 * - maxItems: Giới hạn số mục tối đa khi type=list (tùy chọn)
 */

const DEFAULT_MODULES = Object.freeze([
  { key: 'world_summary', title: 'Giới thiệu thế giới', type: 'text', prompt: '1~3 câu tóm tắt thế giới và cục diện', required: true, panel: true, inline: true, static: true },
  { key: 'key_plot_points', title: 'Điểm cốt truyện quan trọng', type: 'list', prompt: '3~8 điểm cốt truyện then chốt (câu ngắn)', maxItems: 8, required: true, panel: true, inline: false, static: true },
  { key: 'current_scene', title: 'Thời điểm hiện tại · Cốt truyện cụ thể', type: 'text', prompt: 'Mô tả những gì đang xảy ra (địa điểm/động cơ nhân vật/xung đột/nghi vấn)', required: true, panel: true, inline: true },
  { key: 'next_events', title: 'Sự kiện sắp xảy ra', type: 'list', prompt: 'Những sự việc có khả năng xảy ra nhất tiếp theo (dạng mục)', maxItems: 6, required: true, panel: true, inline: true },
  { key: 'protagonist_impact', title: 'Ảnh hưởng từ hành động của nhân vật chính', type: 'text', prompt: 'Thay đổi về cốt truyện/mối quan hệ/rủi ro do hành động của nhân vật chính gây ra', required: true, panel: true, inline: false },
  { key: 'tips', title: 'Gợi ý cho nhân vật chính (dựa trên diễn biến nguyên tác/đại cương)', type: 'list', prompt: 'Đưa ra gợi ý khả thi (càng cụ thể càng tốt)', maxItems: 4, required: true, panel: true, inline: true },
  { key: 'quick_actions', title: 'Tùy chọn nhanh', type: 'list', prompt: 'Dựa trên hướng đi của cốt truyện hiện tại, đưa ra 4~6 tùy chọn hành động cụ thể mà người chơi có thể gửi (mỗi mục 15~40 chữ, có thể dùng trực tiếp làm đầu vào đối thoại)', maxItems: 6, required: true, panel: true, inline: true },
]);

// ===== Giá trị mặc định Prompt tóm tắt (có thể tùy chỉnh trong bảng điều khiển) =====
const DEFAULT_SUMMARY_SYSTEM_PROMPT = `Bạn là một trợ lý "Tóm tắt cốt truyện/Ghi nhớ Worldbook".\n\nNhiệm vụ:\n1) Đọc đoạn đối thoại giữa người dùng và AI, tạo một đoạn tóm tắt ngắn gọn (Tiếng Việt, 150~400 chữ, cố gắng bao gồm: nhân vật chính/mục tiêu/xung đột/vật phẩm quan trọng/địa điểm/thay đổi mối quan hệ/nghi vấn chưa giải quyết).\n2) Trích xuất 6~14 từ khóa (ưu tiên Tiếng Việt, nhân vật/địa điểm/thế lực/vật phẩm/sự kiện/mối quan hệ...), dùng làm từ khóa kích hoạt mục Worldbook. Từ khóa cố gắng không trùng lặp, tránh quá chung chung (như "sau đó", "được rồi").`;

const DEFAULT_SUMMARY_USER_TEMPLATE = `【Phạm vi tầng】{{fromFloor}}-{{toFloor}}\n\n【Đoạn đối thoại】\n{{chunk}}`;

// Bất kể người dùng tùy chỉnh prompt thế nào, vẫn bắt buộc thêm yêu cầu cấu trúc đầu ra JSON để tránh thất bại khi ghi vào Worldbook
const SUMMARY_JSON_REQUIREMENT = `Yêu cầu đầu ra:\n- Chỉ xuất JSON nghiêm ngặt, không Markdown, không khối mã, không lời dẫn thừa.\n- Cấu trúc JSON phải là: {"title": string, "summary": string, "keywords": string[]}。\n- keywords là 6~14 từ/cụm từ, cố gắng không trùng lặp, tránh từ chung chung.`;


// ===== Giá trị mặc định Prompt chỉ mục (có thể tùy chỉnh trong bảng điều khiển; dùng cho chế độ "LLM phán đoán tổng hợp") =====
const DEFAULT_INDEX_SYSTEM_PROMPT = `Bạn là một trợ lý "Khớp chỉ mục cốt truyện".\n\nNhiệm vụ:\n- Đầu vào bao gồm: Chính văn cốt truyện gần đây (trích đoạn), đầu vào hiện tại của người dùng, và một số mục chỉ mục ứng viên (mỗi mục gồm tiêu đề/tóm tắt/từ khóa kích hoạt).\n- Mục tiêu của bạn là: Phán đoán tổng hợp xem những mục ứng viên nào liên quan nhất đến "cốt truyện hiện tại" (không chỉ khớp với một câu này của người dùng), và trả về id của các ứng viên đó.\n\nYêu cầu:\n- Ưu tiên chọn các mục liên quan đến tuyến chính cốt truyện hiện tại/nhân vật quan trọng/địa điểm quan trọng/vật phẩm quan trọng/nghi vấn chưa giải quyết.\n- Tránh chọn các mục rõ ràng không liên quan hoặc quá chung chung.\n- Số lượng mục trả về nên <= maxPick.`;

const DEFAULT_INDEX_USER_TEMPLATE = `【Đầu vào hiện tại của người dùng】\n{{userMessage}}\n\n【Cốt truyện gần đây (trích đoạn)】\n{{recentText}}\n\n【Mục chỉ mục ứng viên (JSON)】\n{{candidates}}\n\nVui lòng chọn ra các mục liên quan nhất đến cốt truyện hiện tại từ danh sách ứng viên (không quá {{maxPick}} mục), và chỉ xuất JSON.`;

const INDEX_JSON_REQUIREMENT = `Yêu cầu đầu ra:\n- Chỉ xuất JSON nghiêm ngặt, không Markdown, không khối mã, không lời dẫn thừa.\n- Cấu trúc JSON phải là: {"pickedIds": number[]}。\n- pickedIds phải là id trong danh sách ứng viên (số nguyên).\n- Số lượng pickedIds trả về <= maxPick.`;

// ===== Cấu hình mặc định Phán định ROLL =====
const DEFAULT_ROLL_ACTIONS = Object.freeze([
  { key: 'combat', label: 'Chiến đấu', keywords: ['chiến đấu', 'tấn công', 'ra tay', 'vung kiếm', 'bắn', 'đỡ đòn', 'né tránh', 'vật lộn', 'chém', 'giết', 'đánh', 'fight', 'attack', 'strike'] },
  { key: 'persuade', label: 'Thuyết phục', keywords: ['khuyên bảo', 'thuyết phục', 'đàm phán', 'giao thiệp', 'đe dọa', 'hăm dọa', 'lừa gạt', 'persuade', 'negotiate', 'intimidate', 'deceive'] },
  { key: 'learn', label: 'Học tập', keywords: ['học tập', 'tu luyện', 'luyện tập', 'nghiên cứu', 'nắm vững', 'học được', 'kỹ năng', 'learn', 'train', 'practice'] },
]);
const DEFAULT_ROLL_FORMULAS = Object.freeze({
  combat: '(PC.str + PC.dex + PC.atk + MOD.total + CTX.bonus + CTX.penalty) / 4',
  persuade: '(PC.cha + PC.int + MOD.total) / 3',
  learn: '(PC.int + PC.wis + MOD.total) / 3',
  default: 'MOD.total',
});
const DEFAULT_ROLL_MODIFIER_SOURCES = Object.freeze(['skill', 'talent', 'trait', 'buff', 'equipment']);
const DEFAULT_ROLL_SYSTEM_PROMPT = `Bạn là một trọng tài TRPG/ROLL điểm chuyên nghiệp.

【Nhiệm vụ】
- Thực hiện phán định hành động dựa trên hành vi người dùng và dữ liệu thuộc tính (statDataJson).
- Chế độ độ khó difficulty: simple (đơn giản) / normal (bình thường) / hard (khó) / hell (địa ngục).
- Thiết lập Ngưỡng thành công/DC (Difficulty Class):
  - normal: DC 15~20
  - hard: DC 20~25
  - hell: DC 25~30
  - Phán định thành công dựa trên margin (final - threshold):
    - margin >= 8 : critical_success (đại thành công)
    - margin 0 ~ 7 : success (thành công)
    - margin -1 ~ -7 : failure (thất bại)
    - margin <= -8 : fumble (đại thất bại)

【Gợi ý ánh xạ số liệu】
- Chuyển đổi mô tả cấp độ văn bản thành hiệu chỉnh số liệu (MOD):
  - F=0, E=+0.5, D=+1, C=+2, B=+3, A=+4, S=+6, SS=+8, SSS=+10
  - Nếu là số liệu (như Lv.5), thì lấy trực tiếp giá trị (như +5).
- Hiệu chỉnh phẩm cấp: Nếu trang bị/kỹ năng có phân chia độ hiếm, có thể tham khảo ánh xạ trên để cộng thêm giá trị.
- Buff/Debuff: Dựa vào ngữ cảnh để điều chỉnh tạm thời +/- 1~5.

【Tham khảo quy tắc D20】
- Công thức cốt lõi: d20 + hiệu chỉnh thuộc tính + độ thành thạo + hiệu chỉnh khác >= DC
- randomRoll (1~100) quy đổi thành d20 = ceil(randomRoll / 5).
- Đại thành công/Đại thất bại:
  - d20 = 20 (tức randomRoll 96~100) xem là "đại thành công" (bất kể số liệu, trừ khi DC cực cao).
  - d20 = 1 (tức randomRoll 1~5) xem là "đại thất bại".

【Quy trình tính toán】
1. Xác định action (loại hành động) và formula (công thức tính).
2. Tính base (giá trị cơ bản) và mods (tổng tất cả nguồn hiệu chỉnh).
3. Tính final = base + mods + yếu tố ngẫu nhiên.
4. So sánh final với threshold, đưa ra success (true/false) và outcomeTier.

【Yêu cầu đầu ra】
- Bắt buộc xuất định dạng JSON phù hợp với JSON Requirement.
- explanation: Mô tả ngắn gọn quá trình phán định và kết quả (1~2 câu).
- analysisSummary: Tổng hợp nguồn hiệu chỉnh và logic ánh xạ then chốt.
`;

const DEFAULT_ROLL_USER_TEMPLATE = `Hành động={{action}}\nCông thức={{formula}}\nrandomWeight={{randomWeight}}\ndifficulty={{difficulty}}\nrandomRoll={{randomRoll}}\nmodifierSources={{modifierSourcesJson}}\nstatDataJson={{statDataJson}}`;
const ROLL_JSON_REQUIREMENT = `Yêu cầu đầu ra (JSON nghiêm ngặt):\n{"action": string, "formula": string, "base": number, "mods": [{"source": string, "value": number}], "random": {"roll": number, "weight": number}, "final": number, "threshold": number, "success": boolean, "outcomeTier": string, "explanation": string, "analysisSummary"?: string}\n- analysisSummary tùy chọn, dùng để hiển thị nhật ký, gợi ý bao gồm hai đoạn "Tổng hợp nguồn hiệu chỉnh/Áp dụng ánh xạ"; explanation gợi ý 1~2 câu.`;
const ROLL_DECISION_JSON_REQUIREMENT = `Yêu cầu đầu ra (JSON nghiêm ngặt):\n- Nếu không cần phán định: Chỉ xuất {"needRoll": false}。\n- Nếu cần phán định: Xuất {"needRoll": true, "result": {action, formula, base, mods, random, final, threshold, success, outcomeTier, explanation, analysisSummary?}}。\n- Không Markdown, không khối mã, không lời dẫn thừa.`;

const DEFAULT_ROLL_DECISION_SYSTEM_PROMPT = `Bạn là một AI hỗ trợ phán định xem hành động có cần ROLL điểm hay không.

【Nhiệm vụ】
- Nhiệm vụ cốt lõi là phán đoán xem hành vi của người dùng có cần thực hiện phán định tính ngẫu nhiên (ROLL) hay không.
- Chỉ khi hành vi có tính không chắc chắn, thách thức hoặc đối kháng thì mới cần ROLL.
- Nếu needRoll=true, thì đồng thời thực hiện tính toán phán định.

【Nguyên tắc phán định (needRoll)】
- needRoll = false: 
  - Hành vi thường ngày (ăn uống/đi lại/tán gẫu).
  - Hành vi chắc chắn thành công (không có can nhiễu/độ khó cực thấp).
  - Biểu đạt cảm xúc hoặc hoạt động tâm lý thuần túy.
- needRoll = true:
  - Chiến đấu/Tấn công/Phòng thủ.
  - Cố gắng thuyết phục/lừa gạt/đe dọa người khác.
  - Hành động có rủi ro hoặc độ khó (cạy khóa/leo trèo/lén lút).
  - Kiểm định kiến thức/Kiểm định nhận thức (phát hiện manh mối ẩn).

【Nếu needRoll=true, tham khảo tính toán】
- Chế độ độ khó difficulty và Ngưỡng thành công/DC (simple/normal/hard/hell).
- Gợi ý ánh xạ số liệu: F=0, E=+0.5, D=+1, C=+2, B=+3, A=+4, S=+6, SS=+8, SSS=+10.
- Hiệu chỉnh phẩm cấp: Tham khảo phẩm cấp trang bị/kỹ năng.
- Phán định margin: >=8 đại thành công, 0~7 thành công, -1~-7 thất bại, <=-8 đại thất bại.

【Yêu cầu đầu ra】
- Nếu không cần phán định: {"needRoll": false}
- Nếu cần phán định: {"needRoll": true, "result": { ...quá trình tính toán đầy đủ... }}
- Tuân thủ nghiêm ngặt định dạng JSON Requirement, không xuất khối mã Markdown.
`;

const DEFAULT_ROLL_DECISION_USER_TEMPLATE = `Đầu vào người dùng={{userText}}\nrandomWeight={{randomWeight}}\ndifficulty={{difficulty}}\nrandomRoll={{randomRoll}}\nstatDataJson={{statDataJson}}`;

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,

  // Cắt đầu vào
  maxMessages: 40,
  maxCharsPerMessage: 1600,
  includeUser: true,
  includeAssistant: true,

  // Kiểm soát tạo sinh (vẫn giữ chống tiết lộ và temperature; phong cách khác có thể làm qua tùy chỉnh system/constraints)
  spoilerLevel: 'mild', // none | mild | full
  temperature: 0.4,

  // Tự động làm mới (báo cáo bảng điều khiển)
  autoRefresh: false,
  autoRefreshOn: 'received', // received | sent | both
  debounceMs: 1200,

  // Tự động thêm vào cuối chính văn
  autoAppendBox: true,
  appendMode: 'compact', // compact | standard
  appendDebounceMs: 700,

  // Khung tự động thêm hiển thị những mô-đun nào
  inlineModulesSource: 'inline', // inline | panel | all
  inlineShowEmpty: false,        // Có hiển thị chỗ giữ chỗ cho trường trống không

  // provider
  provider: 'st', // st | custom

  // custom API (Gợi ý điền "URL cơ sở API", như https://api.openai.com/v1 )
  customEndpoint: '',
  customApiKey: '',
  customModel: 'gpt-4o-mini',
  customModelsCache: [],
  customTopP: 0.95,
  customMaxTokens: 8192,
  customStream: false,

  // Nhập/Xuất cài đặt sẵn
  presetIncludeApiKey: false,

  // Nhập và tiêm Worldbook (World Info/Lorebook)
  worldbookEnabled: false,
  worldbookMode: 'active', // active | all
  worldbookMaxChars: 6000,
  worldbookWindowMessages: 18,
  worldbookJson: '',

  // ===== Chức năng tóm tắt (Cài đặt API độc lập với gợi ý cốt truyện) =====
  summaryEnabled: false,
  // Bao nhiêu "tầng" tóm tắt một lần (cách thống kê tầng xem summaryCountMode)
  summaryEvery: 20,
  // Tóm tắt phạm vi tầng thủ công: Có tách thành nhiều mục Worldbook theo "mỗi N tầng" không (N=summaryEvery)
  summaryManualSplit: false,
  // assistant: Chỉ thống kê trả lời của AI; all: Thống kê tất cả tin nhắn (người dùng+AI)
  summaryCountMode: 'assistant',
  // Khi tóm tắt tự động, mặc định chỉ tóm tắt nội dung "mới thêm sau lần tóm tắt trước"; lần đầu thì tóm tắt summaryEvery đoạn gần nhất
  summaryMaxCharsPerMessage: 4000,
  summaryMaxTotalChars: 24000,

  // Cách gọi tóm tắt: st=đi qua LLM hiện đang kết nối của SillyTavern; custom=API tương thích OpenAI độc lập
  summaryProvider: 'st',
  summaryTemperature: 0.4,

  // Tùy chỉnh prompt tóm tắt (tùy chọn)
  // - system: Quyết định phong cách/trọng tâm tóm tắt
  // - userTemplate: Quyết định cách đưa phạm vi tầng/đoạn đối thoại cho model (hỗ trợ placeholder)
  summarySystemPrompt: DEFAULT_SUMMARY_SYSTEM_PROMPT,
  summaryUserTemplate: DEFAULT_SUMMARY_USER_TEMPLATE,
  summaryCustomEndpoint: '',
  summaryCustomApiKey: '',
  summaryCustomModel: 'gpt-4o-mini',
  summaryCustomModelsCache: [],
  summaryCustomMaxTokens: 2048,
  summaryCustomStream: false,

  // Kết quả tóm tắt ghi vào Worldbook (Lorebook / World Info)
  // —— Worldbook Đèn Xanh Lá (Kích hoạt bằng từ khóa) ——
  summaryToWorldInfo: true,
  // chatbook=Ghi vào Worldbook liên kết với cuộc trò chuyện hiện tại; file=Ghi vào tên tệp Worldbook chỉ định
  summaryWorldInfoTarget: 'chatbook',
  summaryWorldInfoFile: '',
  summaryWorldInfoCommentPrefix: 'Tóm tắt cốt truyện',

  // Nguồn key (từ khóa kích hoạt) ghi vào Worldbook khi tóm tắt
  // - keywords: Sử dụng keywords do model xuất ra (mặc định)
  // - indexId: Sử dụng số hiệu chỉ mục tự động tạo (như A-001), chỉ viết 1 từ khóa kích hoạt, kích hoạt chính xác hơn
  summaryWorldInfoKeyMode: 'keywords',
  // Khi keyMode=indexId: Định dạng số hiệu chỉ mục
  summaryIndexPrefix: 'A-',
  summaryIndexPad: 3,
  summaryIndexStart: 1,
  // Có ghi số hiệu chỉ mục vào tiêu đề mục (comment) không, thuận tiện cho việc định vị trong danh sách Worldbook
  summaryIndexInComment: true,

  // —— Worldbook Đèn Xanh (Chỉ mục thường mở: Dùng cho plugin này để tìm kiếm) ——
  // Chú ý: Worldbook Đèn Xanh nên ghi vào "Tên tệp Worldbook chỉ định", vì chatbook thường chỉ có một.
  summaryToBlueWorldInfo: false,
  summaryBlueWorldInfoFile: '',
  summaryBlueWorldInfoCommentPrefix: 'Tóm tắt cốt truyện',

  // —— Tự động liên kết Worldbook (Mỗi cuộc trò chuyện tự động tạo Worldbook riêng) ——
  autoBindWorldInfo: false,
  autoBindWorldInfoPrefix: 'SG',

  // —— Chỉ mục Đèn Xanh → Kích hoạt Đèn Xanh Lá ——
  wiTriggerEnabled: false,

  // Cách khớp: local=Độ tương đồng cục bộ; llm=LLM phán đoán tổng hợp (có thể tùy chỉnh prompt & API độc lập)
  wiTriggerMatchMode: 'local',

  // —— LLM Chỉ mục (Bộ cấu hình thứ hai độc lập với API tóm tắt) ——
  wiIndexProvider: 'st',         // st | custom
  wiIndexTemperature: 0.2,
  wiIndexTopP: 0.95,
  wiIndexSystemPrompt: DEFAULT_INDEX_SYSTEM_PROMPT,
  wiIndexUserTemplate: DEFAULT_INDEX_USER_TEMPLATE,

  // Chế độ LLM: Dùng độ tương đồng cục bộ để lọc trước TopK, rồi giao cho model phán đoán tổng hợp (tiết kiệm tokens hơn)
  wiIndexPrefilterTopK: 24,
  // Cắt bớt ký tự mỗi tóm tắt ứng viên (kiểm soát tokens)
  wiIndexCandidateMaxChars: 420,

  // API tương thích OpenAI độc lập cho chỉ mục
  wiIndexCustomEndpoint: '',
  wiIndexCustomApiKey: '',
  wiIndexCustomModel: 'gpt-4o-mini',
  wiIndexCustomModelsCache: [],
  wiIndexCustomMaxTokens: 1024,
  wiIndexCustomStream: false,

  // Trước khi người dùng gửi tin nhắn (MESSAGE_SENT), đọc "N chính văn tin nhắn gần nhất" (không bao gồm tin hiện tại), chọn mục liên quan từ chỉ mục Đèn Xanh.
  wiTriggerLookbackMessages: 20,
  // Có đưa "đầu vào hiện tại của người dùng" vào khớp chỉ mục không (phán đoán tổng hợp).
  wiTriggerIncludeUserMessage: true,
  // Trọng số của đầu vào người dùng hiện tại trong vector độ tương đồng (càng lớn càng coi trọng đầu vào người dùng; 1=bằng trọng số chính văn gần đây)
  wiTriggerUserMessageWeight: 1.6,
  // Ít nhất đã có N câu trả lời của AI (tầng) mới bắt đầu kích hoạt chỉ mục; 0=ngay lập tức
  wiTriggerStartAfterAssistantMessages: 0,
  // Chọn tối đa bao nhiêu mục summary để kích hoạt
  wiTriggerMaxEntries: 4,
  // Ngưỡng độ liên quan (0~1, càng lớn càng nghiêm ngặt)
  wiTriggerMinScore: 0.08,
  // Tiêm tối đa bao nhiêu từ khóa kích hoạt (sau khi khử trùng lặp)
  wiTriggerMaxKeywords: 24,
  // Chế độ tiêm: appendToUser = Thêm vào cuối tin nhắn người dùng
  wiTriggerInjectMode: 'appendToUser',
  // Kiểu tiêm: hidden=Ẩn trong chú thích HTML; plain=Văn bản trực tiếp (ổn định hơn)
  wiTriggerInjectStyle: 'hidden',
  wiTriggerTag: 'SG_WI_TRIGGERS',
  wiTriggerDebugLog: false,

  // Phán định ROLL (Phán định hành động hiệp này)
  wiRollEnabled: false,
  wiRollStatSource: 'variable', // variable (tổng hợp nhiều nguồn) | template | latest
  wiRollStatVarName: 'stat_data',
  wiRollRandomWeight: 0.3,
  wiRollDifficulty: 'normal',
  wiRollInjectStyle: 'hidden',
  wiRollTag: 'SG_ROLL',
  wiRollDebugLog: false,
  wiRollStatParseMode: 'json', // json | kv
  wiRollProvider: 'custom', // custom | local
  wiRollSystemPrompt: DEFAULT_ROLL_SYSTEM_PROMPT,
  wiRollCustomEndpoint: '',
  wiRollCustomApiKey: '',
  wiRollCustomModel: 'gpt-4o-mini',
  wiRollCustomMaxTokens: 512,
  wiRollCustomTopP: 0.95,
  wiRollCustomTemperature: 0.2,
  wiRollCustomStream: false,

  // Cách đọc chỉ mục Đèn Xanh: Mặc định "Đọc thời gian thực tệp Worldbook Đèn Xanh"
  // - live: Mỗi lần kích hoạt sẽ kéo Worldbook Đèn Xanh theo nhu cầu (có bộ nhớ đệm/tiết chế)
  // - cache: Chỉ sử dụng summaryBlueIndex đã nhập/lưu trong bộ nhớ đệm
  wiBlueIndexMode: 'live',
  // Tên tệp Worldbook sử dụng khi đọc chỉ mục Đèn Xanh; để trống sẽ lùi về dùng summaryBlueWorldInfoFile
  wiBlueIndexFile: '',
  // Khoảng thời gian làm mới tối thiểu khi đọc thời gian thực (giây), tránh mỗi tin nhắn đều yêu cầu một lần
  wiBlueIndexMinRefreshSec: 20,

  // Bộ nhớ đệm chỉ mục Đèn Xanh (Tùy chọn: dùng để tìm kiếm; mỗi mục là {title, summary, keywords, range?})
  summaryBlueIndex: [],

  // Tùy chỉnh mô-đun (Chuỗi JSON + Sao lưu phân tích)
  modulesJson: '',
  // Khung prompt tùy chỉnh thêm
  customSystemPreamble: '',     // Gắn thêm sau system mặc định
  customConstraints: '',        // Gắn thêm sau constraints mặc định

  // ===== Chức năng tùy chọn nhanh =====
  quickOptionsEnabled: true,
  quickOptionsShowIn: 'inline', // inline | panel | both
  // Tùy chọn mặc định cài sẵn (Chuỗi JSON): [{label, prompt}]
  quickOptionsJson: JSON.stringify([
    { label: 'Tiếp tục', prompt: 'Tiếp tục diễn biến cốt truyện hiện tại' },
    { label: 'Chi tiết', prompt: 'Vui lòng mô tả chi tiết hơn về cảnh tượng hiện tại' },
    { label: 'Đối thoại', prompt: 'Để các nhân vật triển khai thêm đối thoại' },
    { label: 'Hành động', prompt: 'Mô tả hành động cụ thể tiếp theo' },
  ], null, 2),
});

const META_KEYS = Object.freeze({
  canon: 'storyguide_canon_outline',
  world: 'storyguide_world_setup',
  summaryMeta: 'storyguide_summary_meta',
  staticModulesCache: 'storyguide_static_modules_cache',
  boundGreenWI: 'storyguide_bound_green_wi',
  boundBlueWI: 'storyguide_bound_blue_wi',
  autoBindCreated: 'storyguide_auto_bind_created',
});

let lastReport = null;
let lastJsonText = '';
let lastSummary = null; // { title, summary, keywords, ... }
let lastSummaryText = '';
let refreshTimer = null;
let appendTimer = null;
let summaryTimer = null;
let isSummarizing = false;
let sgToastTimer = null;

// Bộ nhớ đệm "đọc thời gian thực" chỉ mục Đèn Xanh (tránh mỗi tin nhắn đều yêu cầu một lần)
let blueIndexLiveCache = { file: '', loadedAt: 0, entries: [], lastError: '' };

// ============== Quan trọng: Bộ nhớ đệm thêm DOM & Người quan sát (Chống render lại) ==============
/**
 * inlineCache: Map<mesKey, { htmlInner: string, collapsed: boolean, createdAt: number }>
 * mesKey ưu tiên dùng mesid của DOM (nếu không lấy được thì dùng chatIndex)
 */
const inlineCache = new Map();
const panelCache = new Map(); // <mesKey, { htmlInner, collapsed, createdAt }>
let chatDomObserver = null;
let bodyDomObserver = null;
let reapplyTimer = null;

// -------------------- ST request headers compatibility --------------------
function getCsrfTokenCompat() {
  const meta = document.querySelector('meta[name="csrf-token"], meta[name="csrf_token"], meta[name="csrfToken"]');
  if (meta && meta.content) return meta.content;
  const ctx = SillyTavern.getContext?.() ?? {};
  return ctx.csrfToken || ctx.csrf_token || globalThis.csrf_token || globalThis.csrfToken || '';
}

function getStRequestHeadersCompat() {
  const ctx = SillyTavern.getContext?.() ?? {};
  let h = {};
  try {
    if (typeof SillyTavern.getRequestHeaders === 'function') h = SillyTavern.getRequestHeaders();
    else if (typeof ctx.getRequestHeaders === 'function') h = ctx.getRequestHeaders();
    else if (typeof globalThis.getRequestHeaders === 'function') h = globalThis.getRequestHeaders();
  } catch { h = {}; }

  h = { ...(h || {}) };

  const token = getCsrfTokenCompat();
  if (token) {
    if (!('X-CSRF-Token' in h) && !('X-CSRF-TOKEN' in h) && !('x-csrf-token' in h)) {
      h['X-CSRF-Token'] = token;
    }
  }
  return h;
}

// -------------------- utils --------------------

function clone(obj) { try { return structuredClone(obj); } catch { return JSON.parse(JSON.stringify(obj)); } }

function ensureSettings() {
  const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
  if (!extensionSettings[MODULE_NAME]) {
    extensionSettings[MODULE_NAME] = clone(DEFAULT_SETTINGS);
    // Ghi modulesJson mặc định ban đầu
    extensionSettings[MODULE_NAME].modulesJson = JSON.stringify(DEFAULT_MODULES, null, 2);
    saveSettingsDebounced();
  } else {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (!Object.hasOwn(extensionSettings[MODULE_NAME], k)) extensionSettings[MODULE_NAME][k] = DEFAULT_SETTINGS[k];
    }
    // Tương thích bản cũ: Nếu modulesJson trống, bổ sung mặc định
    if (!extensionSettings[MODULE_NAME].modulesJson) {
      extensionSettings[MODULE_NAME].modulesJson = JSON.stringify(DEFAULT_MODULES, null, 2);
    }
  }
  if (typeof extensionSettings[MODULE_NAME].wiRollSystemPrompt === 'string') {
    const cur = extensionSettings[MODULE_NAME].wiRollSystemPrompt;
    const hasMojibake = /\?{5,}/.test(cur);
    if (hasMojibake) {
      extensionSettings[MODULE_NAME].wiRollSystemPrompt = DEFAULT_ROLL_SYSTEM_PROMPT;
      saveSettingsDebounced();
    }
  }
  if (typeof extensionSettings[MODULE_NAME].wiRollUserTemplate === 'string') {
    const curTpl = extensionSettings[MODULE_NAME].wiRollUserTemplate;
    if (curTpl.includes('{{threshold}}')) {
      extensionSettings[MODULE_NAME].wiRollUserTemplate = DEFAULT_ROLL_USER_TEMPLATE;
      saveSettingsDebounced();
    }
  }
  return extensionSettings[MODULE_NAME];
}

function saveSettings() {
  const ctx = SillyTavern.getContext();
  // Thử dùng hàm lưu ngay lập tức nếu có (saveSettings), nếu không thì dùng hàm chờ (Debounced)
  if (typeof ctx.saveSettings === 'function') {
    ctx.saveSettings();
    console.log('[StoryGuide] Đã yêu cầu lưu cài đặt NGAY LẬP TỨC.');
  } else {
    ctx.saveSettingsDebounced();
    console.log('[StoryGuide] Đã xếp hàng lưu cài đặt (Debounced).');
  }
}

function stripHtml(input) {
  if (!input) return '';
  return String(input).replace(/<[^>]*>/g, '').replace(/\s+\n/g, '\n').trim();
}

function escapeHtml(input) {
  const s = String(input ?? '');
  return s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function clampInt(v, min, max, fallback) {
  const n = Number.parseInt(v, 10);
  if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
  return fallback;
}
function clampFloat(v, min, max, fallback) {
  const n = Number.parseFloat(v);
  if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
  return fallback;
}

// Thay thế mẫu đơn giản: hỗ trợ các placeholder như {{fromFloor}} / {{toFloor}} / {{chunk}}
function renderTemplate(tpl, vars = {}) {
  const str = String(tpl ?? '');
  return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = vars?.[k];
    return v == null ? '' : String(v);
  });
}

function safeJsonParse(maybeJson) {
  if (!maybeJson) return null;
  let t = String(maybeJson).trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  try { return JSON.parse(t); } catch { return null; }
}

// ===== Chức năng tùy chọn nhanh =====

function getQuickOptions() {
  const s = ensureSettings();
  if (!s.quickOptionsEnabled) return [];

  const raw = String(s.quickOptionsJson || '').trim();
  if (!raw) return [];

  try {
    let arr = JSON.parse(raw);
    // Hỗ trợ hai định dạng [[label, prompt], ...] và [{label, prompt}, ...]
    if (!Array.isArray(arr)) return [];
    return arr.map((item, i) => {
      if (Array.isArray(item)) {
        return { label: String(item[0] || `Tùy chọn ${i + 1}`), prompt: String(item[1] || '') };
      }
      if (item && typeof item === 'object') {
        return { label: String(item.label || `Tùy chọn ${i + 1}`), prompt: String(item.prompt || '') };
      }
      return null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function injectToUserInput(text) {
  // Thử nhiều bộ chọn khung nhập liệu có thể
  const selectors = ['#send_textarea', 'textarea#send_textarea', '.send_textarea', 'textarea.send_textarea'];
  let textarea = null;

  for (const sel of selectors) {
    textarea = document.querySelector(sel);
    if (textarea) break;
  }

  if (!textarea) {
    console.warn('[StoryGuide] Không tìm thấy khung nhập liệu trò chuyện');
    return false;
  }

  // Thiết lập giá trị văn bản
  textarea.value = String(text || '');

  // Kích hoạt sự kiện input để thông báo cho SillyTavern
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  // Focus vào khung nhập liệu
  textarea.focus();

  // Di chuyển con trỏ đến cuối
  if (textarea.setSelectionRange) {
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  return true;
}

function renderQuickOptionsHtml(context = 'inline') {
  const s = ensureSettings();
  if (!s.quickOptionsEnabled) return '';

  const showIn = String(s.quickOptionsShowIn || 'inline');
  // Kiểm tra xem ngữ cảnh hiện tại có nên hiển thị không
  if (showIn !== 'both' && showIn !== context) return '';

  const options = getQuickOptions();
  if (!options.length) return '';

  const buttons = options.map((opt, i) => {
    const label = escapeHtml(opt.label || `Tùy chọn ${i + 1}`);
    const prompt = escapeHtml(opt.prompt || '');
    return `<button class="sg-quick-option" data-sg-prompt="${prompt}" title="${prompt}">${label}</button>`;
  }).join('');

  return `<div class="sg-quick-options">${buttons}</div>`;
}

// Hiển thị các tùy chọn nhanh động do AI tạo (tạo nút từ mảng quick_actions của kết quả phân tích, hiển thị trực tiếp nội dung tùy chọn)
function renderDynamicQuickActionsHtml(quickActions, context = 'inline') {
  const s = ensureSettings();

  // Nếu không có tùy chọn động, trả về rỗng
  if (!Array.isArray(quickActions) || !quickActions.length) {
    return '';
  }

  const buttons = quickActions.map((action, i) => {
    const text = String(action || '').trim();
    if (!text) return '';

    // Loại bỏ tiền tố đánh số có thể có như "【1】" hoặc "1."
    const cleaned = text.replace(/^【\d+】\s*/, '').replace(/^\d+[\.\)\:：]\s*/, '').trim();
    if (!cleaned) return '';

    const escapedText = escapeHtml(cleaned);
    // Nút hiển thị trực tiếp nội dung tùy chọn đầy đủ, nhấp vào để nhập vào khung trò chuyện
    return `<button class="sg-quick-option sg-dynamic-option" data-sg-prompt="${escapedText}" title="Nhấp để nhập vào khung trò chuyện">${escapedText}</button>`;
  }).filter(Boolean).join('');

  if (!buttons) return '';

  return `<div class="sg-quick-options sg-dynamic-options">
    <div class="sg-quick-options-title">💡 Tùy chọn nhanh (Nhấp để nhập)</div>
    ${buttons}
  </div>`;
}

function installQuickOptionsClickHandler() {
  if (window.__storyguide_quick_options_installed) return;
  window.__storyguide_quick_options_installed = true;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.sg-quick-option');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const prompt = btn.dataset.sgPrompt || '';
    if (prompt) {
      injectToUserInput(prompt);
    }
  }, true);
}

function renderMarkdownToHtml(markdown) {
  const { showdown, DOMPurify } = SillyTavern.libs;
  const converter = new showdown.Converter({ simplifiedAutoLink: true, strikethrough: true, tables: true });
  const html = converter.makeHtml(markdown || '');
  return DOMPurify.sanitize(html);
}

function renderMarkdownInto($el, markdown) { $el.html(renderMarkdownToHtml(markdown)); }

function getChatMetaValue(key) {
  const { chatMetadata } = SillyTavern.getContext();
  return chatMetadata?.[key] ?? '';
}
async function setChatMetaValue(key, value) {
  const ctx = SillyTavern.getContext();
  ctx.chatMetadata[key] = value;
  await ctx.saveMetadata();
}

// -------------------- summary meta (per chat) --------------------
function getDefaultSummaryMeta() {
  return {
    lastFloor: 0,
    lastChatLen: 0,
    // Bộ đếm tăng dần dùng cho "kích hoạt số hiệu chỉ mục" (A-001/A-002…) (lưu theo cuộc trò chuyện)
    nextIndex: 1,
    history: [], // [{title, summary, keywords, createdAt, range:{fromFloor,toFloor,fromIdx,toIdx}, worldInfo:{file,uid}}]
    wiTriggerLogs: [], // [{ts,userText,picked:[{title,score,keywordsPreview}], injectedKeywords, lookback, style, tag}]
    rollLogs: [], // [{ts, action, summary, final, success, userText}]
  };
}

function getSummaryMeta() {
  const raw = String(getChatMetaValue(META_KEYS.summaryMeta) || '').trim();
  if (!raw) return getDefaultSummaryMeta();
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return getDefaultSummaryMeta();
    return {
      ...getDefaultSummaryMeta(),
      ...data,
      history: Array.isArray(data.history) ? data.history : [],
      wiTriggerLogs: Array.isArray(data.wiTriggerLogs) ? data.wiTriggerLogs : [],
      rollLogs: Array.isArray(data.rollLogs) ? data.rollLogs : [],
    };
  } catch {
    return getDefaultSummaryMeta();
  }
}

async function setSummaryMeta(meta) {
  await setChatMetaValue(META_KEYS.summaryMeta, JSON.stringify(meta ?? getDefaultSummaryMeta()));
}

// ===== Bộ nhớ đệm mô-đun tĩnh (Kết quả mô-đun chỉ tạo lần đầu hoặc khi làm mới thủ công) =====
function getStaticModulesCache() {
  const raw = String(getChatMetaValue(META_KEYS.staticModulesCache) || '').trim();
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

async function setStaticModulesCache(cache) {
  await setChatMetaValue(META_KEYS.staticModulesCache, JSON.stringify(cache ?? {}));
}

// Hợp nhất bộ nhớ đệm mô-đun tĩnh vào kết quả phân tích
function mergeStaticModulesIntoResult(parsedJson, modules) {
  const cache = getStaticModulesCache();
  const result = { ...parsedJson };

  for (const m of modules) {
    if (m.static && cache[m.key] !== undefined) {
      // Dùng giá trị cache thay thế (nếu AI lần này không tạo hoặc chúng ta đã bỏ qua việc tạo)
      if (result[m.key] === undefined || result[m.key] === null || result[m.key] === '') {
        result[m.key] = cache[m.key];
      }
    }
  }

  return result;
}

// Cập nhật bộ nhớ đệm mô-đun tĩnh
async function updateStaticModulesCache(parsedJson, modules) {
  const cache = getStaticModulesCache();
  let changed = false;

  for (const m of modules) {
    if (m.static && parsedJson[m.key] !== undefined && parsedJson[m.key] !== null && parsedJson[m.key] !== '') {
      // Chỉ cập nhật cache khi tạo lần đầu hoặc giá trị có thay đổi
      if (cache[m.key] === undefined || JSON.stringify(cache[m.key]) !== JSON.stringify(parsedJson[m.key])) {
        cache[m.key] = parsedJson[m.key];
        changed = true;
      }
    }
  }

  if (changed) {
    await setStaticModulesCache(cache);
  }
}

// Xóa bộ nhớ đệm mô-đun tĩnh (dùng khi làm mới thủ công)
async function clearStaticModulesCache() {
  await setStaticModulesCache({});
}

// -------------------- Tự động liên kết Worldbook (Worldbook riêng cho mỗi cuộc trò chuyện) --------------------
// Tạo tên tệp Worldbook duy nhất
function generateBoundWorldInfoName(type) {
  const ctx = SillyTavern.getContext();
  const charName = String(ctx.characterId || ctx.name2 || ctx.name || 'UnknownChar')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '')
    .slice(0, 20);
  const ts = Date.now().toString(36);
  const prefix = ensureSettings().autoBindWorldInfoPrefix || 'SG';
  return `${prefix}_${charName}_${ts}_${type}`;
}

// Kiểm tra và đảm bảo cuộc trò chuyện hiện tại đã bật tự động liên kết (sử dụng chế độ chatbook)
async function ensureBoundWorldInfo(opts = {}) {
  const s = ensureSettings();
  if (!s.autoBindWorldInfo) return false;

  const alreadyApplied = !!getChatMetaValue(META_KEYS.autoBindCreated);

  // Nếu đã áp dụng rồi, chỉ cần áp dụng lại cài đặt
  if (alreadyApplied) {
    applyBoundWorldInfoToSettings();
    return false;
  }

  // Lần đầu kích hoạt: Đặt cờ và áp dụng
  await setChatMetaValue(META_KEYS.autoBindCreated, '1');

  // Hiển thị gợi ý cho người dùng
  showToast(`Đã bật tự động ghi vào Worldbook\nTóm tắt Đèn Xanh Lá sẽ ghi vào Worldbook liên kết với cuộc trò chuyện\n(Được SillyTavern tự động tạo và quản lý)`, {
    kind: 'ok', spinner: false, sticky: false, duration: 3500
  });

  // Áp dụng cài đặt
  applyBoundWorldInfoToSettings();
  return true;
}

// Tạo tệp Worldbook (Thử nhiều phương pháp)
async function createWorldInfoFile(fileName, initialContent = 'Mục khởi tạo') {
  if (!fileName) throw new Error('Tên tệp trống');

  console.log('[StoryGuide] Đang cố gắng tạo tệp Worldbook:', fileName);

  // Cách 1: Thử dùng mô-đun world_info nội bộ của SillyTavern
  try {
    const worldInfoModule = await import('/scripts/world-info.js');
    if (worldInfoModule && typeof worldInfoModule.createNewWorldInfo === 'function') {
      await worldInfoModule.createNewWorldInfo(fileName);
      console.log('[StoryGuide] Tạo thành công bằng mô-đun nội bộ:', fileName);
      return true;
    }
  } catch (e) {
    console.log('[StoryGuide] Phương pháp mô-đun nội bộ thất bại:', e?.message || e);
  }

  // Cách 2: Thử dùng API nhập (Giả lập tải tệp lên)
  try {
    const headers = getStRequestHeadersCompat();
    const worldInfoData = {
      entries: {
        0: {
          uid: 0,
          key: ['__SG_INIT__'],
          keysecondary: [],
          comment: 'Được StoryGuide tự động tạo',
          content: initialContent,
          constant: false,
          disable: false,
          order: 100,
          position: 0,
        }
      }
    };

    // Tạo một Blob làm tệp JSON
    const blob = new Blob([JSON.stringify(worldInfoData)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('avatar', blob, `${fileName}.json`);

    const res = await fetch('/api/worldinfo/import', {
      method: 'POST',
      headers: { ...headers },
      body: formData,
    });

    if (res.ok) {
      console.log('[StoryGuide] Tạo thành công bằng API nhập:', fileName);
      return true;
    }
    console.log('[StoryGuide] Phản hồi API nhập:', res.status);
  } catch (e) {
    console.log('[StoryGuide] Phương pháp API nhập thất bại:', e?.message || e);
  }

  // Cách 3: Thử POST trực tiếp đến /api/worldinfo/edit (Sửa/Tạo)
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...getStRequestHeadersCompat(),
    };

    const res = await fetch('/api/worldinfo/edit', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: fileName,
        data: {
          entries: {
            0: {
              uid: 0,
              key: ['__SG_INIT__'],
              content: initialContent,
              comment: 'Được StoryGuide tự động tạo',
            }
          }
        }
      }),
    });

    if (res.ok) {
      console.log('[StoryGuide] Tạo thành công bằng API edit:', fileName);
      return true;
    }
    console.log('[StoryGuide] Phản hồi API edit:', res.status);
  } catch (e) {
    console.log('[StoryGuide] Phương pháp API edit thất bại:', e?.message || e);
  }

  // Cách 4: Cuối cùng thử STscript (Có thể yêu cầu tệp đã tồn tại)
  try {
    const safeFileName = quoteSlashValue(fileName);
    const safeKey = quoteSlashValue('__SG_INIT__');
    const safeContent = quoteSlashValue(initialContent);
    const cmd = `/createentry file=${safeFileName} key=${safeKey} ${safeContent}`;
    await execSlash(cmd);
    console.log('[StoryGuide] Phương pháp STscript có thể đã thành công');
    return true;
  } catch (e) {
    console.log('[StoryGuide] Phương pháp STscript thất bại:', e?.message || e);
  }

  // Tất cả phương pháp đều thất bại - Hiển thị cảnh báo nhưng không chặn
  console.warn('[StoryGuide] Không thể tự động tạo tệp Worldbook, vui lòng tạo thủ công:', fileName);
  return false;
}

// Áp dụng Worldbook đã liên kết vào cài đặt
function applyBoundWorldInfoToSettings() {
  const s = ensureSettings();
  if (!s.autoBindWorldInfo) return;

  console.log('[StoryGuide] Áp dụng cài đặt tự động liên kết (dùng chế độ chatbook)');

  // Worldbook Đèn Xanh Lá: Sử dụng mục tiêu chatbook (/getchatbook sẽ tự động tạo Worldbook liên kết với cuộc trò chuyện)
  s.summaryToWorldInfo = true;
  s.summaryWorldInfoTarget = 'chatbook';
  console.log('[StoryGuide] Cài đặt Đèn Xanh Lá: chatbook (sẽ dùng Worldbook liên kết với cuộc trò chuyện)');

  // Worldbook Đèn Xanh: Tạm thời vô hiệu hóa (vì không thể tự động tạo tệp độc lập)
  // Nếu người dùng cần chức năng Đèn Xanh, cần tạo thủ công tệp Worldbook và chỉ định trong cài đặt
  s.summaryToBlueWorldInfo = false;
  console.log('[StoryGuide] Cài đặt Đèn Xanh: Vô hiệu hóa (không thể tự động tạo tệp độc lập)');

  // Cập nhật giao diện (nếu bảng điều khiển đang mở)
  updateAutoBindUI();
  saveSettings();
}

// Cập nhật hiển thị giao diện tự động liên kết
function updateAutoBindUI() {
  const s = ensureSettings();
  const $info = $('#sg_autoBindInfo');

  if ($info.length) {
    if (s.autoBindWorldInfo) {
      $info.html(`<span style="color: var(--SmartThemeQuoteColor)">✅ Đã bật: Tóm tắt sẽ ghi vào Worldbook liên kết với cuộc trò chuyện</span>`);
      $info.show();
    } else {
      $info.hide();
    }
  }
}

// Xử lý khi chuyển đổi cuộc trò chuyện (kèm gợi ý)
async function onChatSwitched() {
  const s = ensureSettings();

  console.log('[StoryGuide] onChatSwitched được gọi, autoBindWorldInfo =', s.autoBindWorldInfo);

  if (!s.autoBindWorldInfo) {
    console.log('[StoryGuide] autoBindWorldInfo chưa bật, bỏ qua tự động liên kết');
    return;
  }

  const greenWI = getChatMetaValue(META_KEYS.boundGreenWI);
  const blueWI = getChatMetaValue(META_KEYS.boundBlueWI);

  console.log('[StoryGuide] Worldbook liên kết với cuộc trò chuyện hiện tại:', { greenWI, blueWI });

  if (greenWI || blueWI) {
    applyBoundWorldInfoToSettings();
    showToast(`Đã chuyển sang Worldbook riêng của cuộc trò chuyện này\nĐèn Xanh Lá: ${greenWI || '(Không)'}\nĐèn Xanh: ${blueWI || '(Không)'}`, {
      kind: 'info', spinner: false, sticky: false, duration: 2500
    });
  } else {
    console.log('[StoryGuide] Cuộc trò chuyện mới, cần tạo liên kết');
    await ensureBoundWorldInfo();
  }
}

function setStatus(text, kind = '') {
  const $s = $('#sg_status');
  $s.removeClass('ok err warn').addClass(kind || '');
  $s.text(text || '');
}


function ensureToast() {
  if ($('#sg_toast').length) return;
  $('body').append(`
    <div id="sg_toast" class="sg-toast info" style="display:none" role="status" aria-live="polite">
      <div class="sg-toast-inner">
        <div class="sg-toast-spinner" aria-hidden="true"></div>
        <div class="sg-toast-text" id="sg_toast_text"></div>
      </div>
    </div>
  `);
}

function hideToast() {
  const $t = $('#sg_toast');
  if (!$t.length) return;
  $t.removeClass('visible spinner');
  // delay hide for transition
  setTimeout(() => { $t.hide(); }, 180);
}

function showToast(text, { kind = 'info', spinner = false, sticky = false, duration = 1700 } = {}) {
  ensureToast();
  const $t = $('#sg_toast');
  const $txt = $('#sg_toast_text');
  $txt.text(text || '');
  $t.removeClass('ok warn err info').addClass(kind || 'info');
  $t.toggleClass('spinner', !!spinner);
  $t.show(0);
  // trigger transition
  requestAnimationFrame(() => { $t.addClass('visible'); });

  if (sgToastTimer) { clearTimeout(sgToastTimer); sgToastTimer = null; }
  if (!sticky) {
    sgToastTimer = setTimeout(() => { hideToast(); }, clampInt(duration, 500, 10000, 1700));
  }
}


function updateButtonsEnabled() {
  const ok = Boolean(lastReport?.markdown);
  $('#sg_copyMd').prop('disabled', !ok);
  $('#sg_copyJson').prop('disabled', !Boolean(lastJsonText));
  $('#sg_injectTips').prop('disabled', !ok);
  $('#sg_copySum').prop('disabled', !Boolean(lastSummaryText));
}

function showPane(name) {
  $('#sg_modal .sg-tab').removeClass('active');
  $(`#sg_tab_${name}`).addClass('active');
  $('#sg_modal .sg-pane').removeClass('active');
  $(`#sg_pane_${name}`).addClass('active');
}

// -------------------- modules config --------------------

function validateAndNormalizeModules(raw) {
  const mods = Array.isArray(raw) ? raw : null;
  if (!mods) return { ok: false, error: 'Cấu hình mô-đun phải là mảng JSON.', modules: null };

  const seen = new Set();
  const normalized = [];

  for (const m of mods) {
    if (!m || typeof m !== 'object') continue;
    const key = String(m.key || '').trim();
    if (!key) continue;
    if (seen.has(key)) return { ok: false, error: `Key mô-đun trùng lặp: ${key}`, modules: null };
    seen.add(key);

    const type = String(m.type || 'text').trim();
    if (type !== 'text' && type !== 'list') return { ok: false, error: `Type của mô-đun ${key} phải là "text" hoặc "list"`, modules: null };

    const title = String(m.title || key).trim();
    const prompt = String(m.prompt || '').trim();

    const required = m.required !== false; // default true
    const panel = m.panel !== false;       // default true
    const inline = m.inline === true;      // default false unless explicitly true
    const isStatic = m.static === true;    // default false: Mô-đun tĩnh chỉ tạo khi lần đầu hoặc làm mới thủ công

    const maxItems = (type === 'list' && Number.isFinite(Number(m.maxItems))) ? clampInt(m.maxItems, 1, 50, 8) : undefined;

    normalized.push({ key, title, type, prompt, required, panel, inline, static: isStatic, ...(maxItems ? { maxItems } : {}) });
  }

  if (!normalized.length) return { ok: false, error: 'Cấu hình mô-đun trống: Cần ít nhất 1 mô-đun.', modules: null };
  return { ok: true, error: '', modules: normalized };
}



// -------------------- presets & worldbook --------------------

function downloadTextFile(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      input.remove();
      resolve(file);
    });
    input.click();
  });
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('FileReader error'));
    r.readAsText(file);
  });
}

// Cố gắng phân tích cú pháp JSON Worldbook xuất từ SillyTavern (cấu trúc có thể khác nhau tùy phiên bản)
// Trả về: [{ title, keys: string[], content: string }]
function parseWorldbookJson(rawText) {
  if (!rawText) return [];
  let data = null;
  try { data = JSON.parse(rawText); } catch { return []; }

  // Some exports embed JSON as a string field (double-encoded)
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { /* ignore */ }
  }
  // Some ST endpoints wrap the lorebook JSON inside a string field (e.g. { data: "<json>" }).
  // Try to unwrap a few common wrapper fields.
  for (let i = 0; i < 4; i++) {
    if (!data || typeof data !== 'object') break;
    const wrappers = ['data', 'world_info', 'worldInfo', 'lorebook', 'book', 'worldbook', 'worldBook', 'payload', 'result'];
    let changed = false;
    for (const k of wrappers) {
      const v = data?.[k];
      if (typeof v === 'string') {
        const t = v.trim();
        if (t && (t.startsWith('{') || t.startsWith('['))) {
          try { data = JSON.parse(t); changed = true; break; } catch { /* ignore */ }
        }
      } else if (v && typeof v === 'object') {
        // Sometimes the real file is nested under a wrapper object
        if (v.entries || v.world_info || v.worldInfo || v.lorebook || v.items) {
          data = v;
          changed = true;
          break;
        }
        // Or a nested string field again
        if (typeof v.data === 'string') {
          const t2 = String(v.data || '').trim();
          if (t2 && (t2.startsWith('{') || t2.startsWith('['))) {
            try { data = JSON.parse(t2); changed = true; break; } catch { /* ignore */ }
          }
        }
      }
    }
    if (!changed) break;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { break; }
    }
  }


  function toArray(maybe) {
    if (!maybe) return null;
    if (Array.isArray(maybe)) return maybe;
    if (typeof maybe === 'object') {
      // common: entries as map {uid: entry}
      const vals = Object.values(maybe);
      if (vals.length && vals.every(v => typeof v === 'object')) return vals;
    }
    return null;
  }

  // try to locate entries container (array or map)
  const candidates = [
    data?.entries,
    data?.world_info?.entries,
    data?.worldInfo?.entries,
    data?.lorebook?.entries,
    data?.data?.entries,
    data?.items,
    data?.world_info,
    data?.worldInfo,
    data?.lorebook,
    Array.isArray(data) ? data : null,
  ].filter(Boolean);

  let entries = null;
  for (const c of candidates) {
    const arr = toArray(c);
    if (arr && arr.length) { entries = arr; break; }
    // sometimes nested: { entries: {..} }
    if (c && typeof c === 'object') {
      const inner = toArray(c.entries);
      if (inner && inner.length) { entries = inner; break; }
    }
  }
  if (!entries) return [];

  function splitKeys(str) {
    return String(str || '')
      .split(/[\n,，;；\|]+/g)
      .map(s => s.trim())
      .filter(Boolean);
  }

  const norm = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;

    const title = String(e.title ?? e.name ?? e.comment ?? e.uid ?? e.id ?? '').trim();

    // keys can be stored in many variants in ST exports
    const kRaw =
      e.keys ??
      e.key ??
      e.keywords ??
      e.trigger ??
      e.triggers ??
      e.pattern ??
      e.match ??
      e.tags ??
      e.primary_key ??
      e.primaryKey ??
      e.keyprimary ??
      e.keyPrimary ??
      null;

    const k2Raw =
      e.keysecondary ??
      e.keySecondary ??
      e.secondary_keys ??
      e.secondaryKeys ??
      e.keys_secondary ??
      e.keysSecondary ??
      null;

    let keys = [];
    if (Array.isArray(kRaw)) keys = kRaw.map(x => String(x || '').trim()).filter(Boolean);
    else if (typeof kRaw === 'string') keys = splitKeys(kRaw);

    if (Array.isArray(k2Raw)) keys = keys.concat(k2Raw.map(x => String(x || '').trim()).filter(Boolean));
    else if (typeof k2Raw === 'string') keys = keys.concat(splitKeys(k2Raw));

    keys = Array.from(new Set(keys)).filter(Boolean);

    const content = String(
      e.content ?? e.entry ?? e.text ?? e.description ?? e.desc ?? e.body ?? e.value ?? e.prompt ?? ''
    ).trim();

    if (!content) continue;
    norm.push({ title: title || (keys[0] ? `Mục: ${keys[0]}` : 'Mục'), keys, content });
  }
  return norm;
}

// -------------------- Đọc thời gian thực Worldbook Đèn Xanh (World Info / Lorebook) --------------------

function pickBlueIndexFileName() {
  const s = ensureSettings();
  const explicit = String(s.wiBlueIndexFile || '').trim();
  if (explicit) return explicit;
  const fromBlueWrite = String(s.summaryBlueWorldInfoFile || '').trim();
  if (fromBlueWrite) return fromBlueWrite;
  // Cuối cùng dự phòng: Nếu người dùng xây dựng chỉ mục Đèn Xanh trong cùng tệp với Đèn Xanh Lá, cũng có thể đọc được (không khuyến khích, nhưng không chặn)
  const fromGreen = String(s.summaryWorldInfoFile || '').trim();
  return fromGreen;
}

async function fetchJsonCompat(url, options) {
  const headers = { ...getStRequestHeadersCompat(), ...(options?.headers || {}) };
  const res = await fetch(url, { ...(options || {}), headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} ${res.statusText}${text ? `\n${text}` : ''}`);
    err.status = res.status;
    throw err;
  }
  // some ST endpoints may return plain text
  const ct = String(res.headers.get('content-type') || '');
  if (ct.includes('application/json')) return await res.json();
  const t = await res.text().catch(() => '');
  try { return JSON.parse(t); } catch { return { text: t }; }
}

// Cố gắng đọc tệp Worldbook chỉ định từ backend ST (tên tham số/phương thức có thể khác nhau tùy phiên bản)
async function fetchWorldInfoFileJsonCompat(fileName) {
  const raw = String(fileName || '').trim();
  if (!raw) throw new Error('Tên tệp Worldbook Đèn Xanh trống');

  // Some ST versions store lorebook names with/without .json extension.
  const names = Array.from(new Set([
    raw,
    raw.endsWith('.json') ? raw.slice(0, -5) : (raw + '.json'),
  ].filter(Boolean)));

  const tryList = [];
  for (const name of names) {
    // POST JSON body
    tryList.push(
      { method: 'POST', url: '/api/worldinfo/get', body: { name } },
      { method: 'POST', url: '/api/worldinfo/get', body: { file: name } },
      { method: 'POST', url: '/api/worldinfo/get', body: { filename: name } },
      { method: 'POST', url: '/api/worldinfo/get', body: { world: name } },
      { method: 'POST', url: '/api/worldinfo/get', body: { lorebook: name } },
      // GET query
      { method: 'GET', url: `/api/worldinfo/get?name=${encodeURIComponent(name)}` },
      { method: 'GET', url: `/api/worldinfo/get?file=${encodeURIComponent(name)}` },
      { method: 'GET', url: `/api/worldinfo/get?filename=${encodeURIComponent(name)}` },

      // Some forks/versions use /read instead of /get
      { method: 'POST', url: '/api/worldinfo/read', body: { name } },
      { method: 'POST', url: '/api/worldinfo/read', body: { file: name } },
      { method: 'GET', url: `/api/worldinfo/read?name=${encodeURIComponent(name)}` },
      { method: 'GET', url: `/api/worldinfo/read?file=${encodeURIComponent(name)}` },

      // Rare: /load
      { method: 'POST', url: '/api/worldinfo/load', body: { name } },
      { method: 'GET', url: `/api/worldinfo/load?name=${encodeURIComponent(name)}` },
    );
  }

  let lastErr = null;
  for (const t of tryList) {
    try {
      if (t.method === 'POST') {
        const data = await fetchJsonCompat(t.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t.body),
        });
        if (data) return data;
      } else {
        const data = await fetchJsonCompat(t.url, { method: 'GET' });
        if (data) return data;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Đọc Worldbook thất bại');
}

function buildBlueIndexFromWorldInfoJson(worldInfoJson, prefixFilter = '') {
  // Tái sử dụng logic "phân tích tương thích" của parseWorldbookJson
  const parsed = parseWorldbookJson(JSON.stringify(worldInfoJson || {}));
  const prefix = String(prefixFilter || '').trim();

  const base = parsed.filter(e => e && e.content);

  // Ưu tiên dùng "tiền tố tóm tắt" để lọc (tránh nhồi nhét toàn bộ mục Worldbook khác vào chỉ mục)
  // Nhưng nếu do cấu trúc ST khác nhau dẫn đến title/comment không nhất quán mà lọc ra 0 mục, thì tự động lùi về toàn bộ mục, tránh "rõ ràng có nội dung nhưng hiển thị 0 mục".
  let picked = base;
  if (prefix) {
    picked = base.filter(e =>
      String(e.title || '').includes(prefix) ||
      String(e.content || '').includes(prefix)
    );
    if (!picked.length) picked = base;
  }

  const items = picked
    .map(e => ({
      title: String(e.title || '').trim() || (e.keys?.[0] ? `Mục: ${e.keys[0]}` : 'Mục'),
      summary: String(e.content || '').trim(),
      keywords: Array.isArray(e.keys) ? e.keys.slice(0, 120) : [],
      importedAt: Date.now(),
    }))
    .filter(x => x.summary);

  return items;
}

async function ensureBlueIndexLive(force = false) {
  const s = ensureSettings();
  const mode = String(s.wiBlueIndexMode || 'live');
  if (mode !== 'live') {
    const arr = Array.isArray(s.summaryBlueIndex) ? s.summaryBlueIndex : [];
    return arr;
  }

  const file = pickBlueIndexFileName();
  if (!file) return [];

  const minSec = clampInt(s.wiBlueIndexMinRefreshSec, 5, 600, 20);
  const now = Date.now();
  const ageMs = now - Number(blueIndexLiveCache.loadedAt || 0);
  const need = force || blueIndexLiveCache.file !== file || ageMs > (minSec * 1000);

  if (!need && Array.isArray(blueIndexLiveCache.entries) && blueIndexLiveCache.entries.length) {
    return blueIndexLiveCache.entries;
  }

  try {
    const json = await fetchWorldInfoFileJsonCompat(file);
    const prefix = String(s.summaryBlueWorldInfoCommentPrefix || '').trim();
    const entries = buildBlueIndexFromWorldInfoJson(json, prefix);

    blueIndexLiveCache = { file, loadedAt: now, entries, lastError: '' };

    // Đồng bộ vào cài đặt, thuận tiện cho hiển thị UI (đồng thời cũng là "bộ nhớ đệm" dự phòng)
    s.summaryBlueIndex = entries;
    saveSettings();
    updateBlueIndexInfoLabel();

    return entries;
  } catch (e) {
    blueIndexLiveCache.lastError = String(e?.message ?? e);
    // Đọc thất bại thì lùi về bộ nhớ đệm hiện có
    const fallback = Array.isArray(s.summaryBlueIndex) ? s.summaryBlueIndex : [];
    return fallback;
  }
}

function selectActiveWorldbookEntries(entries, recentText) {
  const text = String(recentText || '').toLowerCase();
  if (!text) return [];
  const picked = [];
  for (const e of entries) {
    const keys = Array.isArray(e.keys) ? e.keys : [];
    if (!keys.length) continue;
    const hit = keys.some(k => k && text.includes(String(k).toLowerCase()));
    if (hit) picked.push(e);
  }
  return picked;
}

function estimateTokens(text) {
  const s = String(text || '');
  // Try SillyTavern token counter if available
  try {
    const ctx = SillyTavern.getContext?.();
    if (ctx && typeof ctx.getTokenCount === 'function') {
      const n = ctx.getTokenCount(s);
      if (Number.isFinite(n)) return n;
    }
    if (typeof SillyTavern.getTokenCount === 'function') {
      const n = SillyTavern.getTokenCount(s);
      if (Number.isFinite(n)) return n;
    }
  } catch { /* ignore */ }

  // Fallback heuristic:
  // - CJK chars ~ 1 token each
  // - other chars ~ 1 token per 4 chars
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const rest = s.replace(/[\u4e00-\u9fff]/g, '').replace(/\s+/g, '');
  const other = rest.length;
  return cjk + Math.ceil(other / 4);
}

function computeWorldbookInjection() {
  const s = ensureSettings();
  const raw = String(s.worldbookJson || '').trim();
  const enabled = !!s.worldbookEnabled;

  const result = {
    enabled,
    importedEntries: 0,
    selectedEntries: 0,
    injectedEntries: 0,
    injectedChars: 0,
    injectedTokens: 0,
    mode: String(s.worldbookMode || 'active'),
    text: ''
  };

  if (!raw) return result;

  const entries = parseWorldbookJson(raw);
  result.importedEntries = entries.length;
  if (!entries.length) return result;

  // Nếu chưa bật tiêm: chỉ trả về "số lượng nhập", không tính toán nội dung tiêm (UI cũng có thể thấy nhập thành công)
  if (!enabled) return result;

  // recent window text for activation
  const ctx = SillyTavern.getContext();
  const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
  const win = clampInt(s.worldbookWindowMessages, 5, 80, 18);
  const pickedMsgs = [];
  for (let i = chat.length - 1; i >= 0 && pickedMsgs.length < win; i--) {
    const m = chat[i];
    if (!m) continue;
    const t = stripHtml(m.mes ?? m.message ?? '');
    if (t) pickedMsgs.push(t);
  }
  const recentText = pickedMsgs.reverse().join('\n');

  let use = entries;
  if (result.mode === 'active') {
    const act = selectActiveWorldbookEntries(entries, recentText);
    use = act.length ? act : [];
  }
  result.selectedEntries = use.length;

  if (!use.length) return result;

  const maxChars = clampInt(s.worldbookMaxChars, 500, 50000, 6000);
  let acc = '';
  let used = 0;

  for (const e of use) {
    const head = `- 【${e.title}】${(e.keys && e.keys.length) ? `（Kích hoạt: ${e.keys.slice(0, 6).join(' / ')}）` : ''}\n`;
    const body = e.content.trim() + '\n';
    const chunk = head + body + '\n';
    if ((acc.length + chunk.length) > maxChars) break;
    acc += chunk;
    used += 1;
  }

  result.injectedEntries = used;
  result.injectedChars = acc.length;
  result.injectedTokens = estimateTokens(acc);
  result.text = acc;

  return result;
}

let lastWorldbookStats = null;

function buildWorldbookBlock() {
  const info = computeWorldbookInjection();
  lastWorldbookStats = info;

  if (!info.enabled) return '';
  if (!info.text) return '';
  return `\n【Sách Thế Giới/World Info (Đã nhập: ${info.importedEntries} mục, Lần tiêm này: ${info.injectedEntries} mục, khoảng ${info.injectedTokens} tokens)】\n${info.text}\n`;
}
function getModules(mode /* panel|append */) {
  const s = ensureSettings();
  const rawText = String(s.modulesJson || '').trim();
  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch { parsed = null; }

  const v = validateAndNormalizeModules(parsed);
  const base = v.ok ? v.modules : clone(DEFAULT_MODULES);

  if (mode === 'append') {
    const src = String(s.inlineModulesSource || 'inline');
    if (src === 'all') return base;
    if (src === 'panel') return base.filter(m => m.panel);
    return base.filter(m => m.inline);
  }

  return base.filter(m => m.panel); // panel
}

// -------------------- prompt (database-like skeleton + modules) --------------------

function spoilerPolicyText(level) {
  switch (level) {
    case 'none': return `【Chiến lược Spoil】Nghiêm ngặt không spoil: Không tiết lộ sự kiện và chân tướng tương lai rõ ràng của nguyên tác; chỉ đưa ra "đề xuất hành động/cảnh báo rủi ro", tránh điểm tên các cú quay xe then chốt.`;
    case 'full': return `【Chiến lược Spoil】Cho phép spoil toàn bộ: Có thể chỉ rõ các sự kiện/chân tướng then chốt tiếp theo của nguyên tác, và giải thích ảnh hưởng thế nào đến tuyến hiện tại.`;
    case 'mild':
    default: return `【Chiến lược Spoil】Spoil nhẹ: Có thể dùng "gợi ý ẩn ý + điểm rủi ro then chốt", tránh phơi bày toàn bộ diễn biến nguyên tác; khi cần thiết có thể điểm qua loa.`;
  }
}

function buildSchemaFromModules(modules) {
  const properties = {};
  const required = [];

  for (const m of modules) {
    if (m.type === 'list') {
      properties[m.key] = {
        type: 'array',
        items: { type: 'string' },
        ...(m.maxItems ? { maxItems: m.maxItems } : {}),
        minItems: 0
      };
    } else {
      properties[m.key] = { type: 'string' };
    }
    if (m.required) required.push(m.key);
  }

  return {
    name: 'StoryGuideDynamicReport',
    description: 'Báo cáo động hướng dẫn cốt truyện (tạo theo cấu hình mô-đun)',
    strict: true,
    value: {
      '$schema': 'http://json-schema.org/draft-04/schema#',
      type: 'object',
      additionalProperties: false,
      properties,
      required
    }
  };
}

function buildOutputFieldsText(modules) {
  // Mỗi mô-đun một dòng: key: title — prompt
  const lines = [];
  for (const m of modules) {
    const p = m.prompt ? ` — ${m.prompt}` : '';
    const t = m.title ? `（${m.title}）` : '';
    if (m.type === 'list') {
      lines.push(`- ${m.key}${t}: string[]${m.maxItems ? ` (<=${m.maxItems})` : ''}${p}`);
    } else {
      lines.push(`- ${m.key}${t}: string${p}`);
    }
  }
  return lines.join('\n');
}

function buildPromptMessages(snapshotText, spoilerLevel, modules, mode /* panel|append */) {
  const s = ensureSettings();
  const compactHint = mode === 'append'
    ? `【Sở thích đầu ra】Tinh gọn hơn: Ít nói nhảm, ít dông dài, đưa thẳng thông tin then chốt.`
    : `【Sở thích đầu ra】Chi tiết vừa phải: Lấy "hướng dẫn khả thi" làm chủ đạo, không kể lể như sổ thu chi.`;

  const extraSystem = String(s.customSystemPreamble || '').trim();
  const extraConstraints = String(s.customConstraints || '').trim();

  const system = [
    `---BEGIN PROMPT---`,
    `[System]`,
    `Bạn là "Hướng dẫn cốt truyện/Cố vấn biên kịch" kiểu thực thi. Trích xuất cấu trúc từ "thế giới đang trải qua" (trò chuyện + thiết lập), và đưa ra hướng dẫn tiếp theo.`,
    spoilerPolicyText(spoilerLevel),
    compactHint,
    extraSystem ? `\n【Bổ sung System tùy chỉnh】\n${extraSystem}` : ``,
    ``,
    `[Constraints]`,
    `1) Không bịa đặt thế giới quan/nhân vật/địa điểm; không chắc chắn thì ghi "không rõ/chờ xác nhận".`,
    `2) Không kể lể dông dài; chỉ trích xuất mâu thuẫn then chốt, động cơ, rủi ro và hướng đi.`,
    `3) Đầu ra phải là đối tượng JSON (không Markdown, không khối mã, không giải thích thừa).`,
    `4) Chỉ xuất các trường được liệt kê bên dưới, không thêm trường thừa.`,
    extraConstraints ? `\n【Bổ sung Constraints tùy chỉnh】\n${extraConstraints}` : ``,
    ``,
    `[Output Fields]`,
    buildOutputFieldsText(modules),
    `---END PROMPT---`
  ].filter(Boolean).join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: snapshotText }
  ];
}

// -------------------- snapshot --------------------

function buildSnapshot() {
  const ctx = SillyTavern.getContext();
  const s = ensureSettings();

  const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
  const maxMessages = clampInt(s.maxMessages, 5, 200, DEFAULT_SETTINGS.maxMessages);
  const maxChars = clampInt(s.maxCharsPerMessage, 200, 8000, DEFAULT_SETTINGS.maxCharsPerMessage);

  let charBlock = '';
  try {
    if (ctx.characterId !== undefined && ctx.characterId !== null && Array.isArray(ctx.characters)) {
      const c = ctx.characters[ctx.characterId];
      if (c) {
        const name = c.name ?? '';
        const desc = c.description ?? c.desc ?? '';
        const personality = c.personality ?? '';
        const scenario = c.scenario ?? '';
        const first = c.first_mes ?? c.first_message ?? '';
        charBlock =
          `【Thẻ Nhân Vật】\n` +
          `- Tên: ${stripHtml(name)}\n` +
          `- Mô tả: ${stripHtml(desc)}\n` +
          `- Tính cách: ${stripHtml(personality)}\n` +
          `- Bối cảnh/Thiết lập: ${stripHtml(scenario)}\n` +
          (first ? `- Lời mở đầu: ${stripHtml(first)}\n` : '');
      }
    }
  } catch (e) { console.warn('[StoryGuide] character read failed:', e); }

  const canon = stripHtml(getChatMetaValue(META_KEYS.canon));
  const world = stripHtml(getChatMetaValue(META_KEYS.world));

  const picked = [];
  for (let i = chat.length - 1; i >= 0 && picked.length < maxMessages; i--) {
    const m = chat[i];
    if (!m) continue;

    const isUser = m.is_user === true;
    if (isUser && !s.includeUser) continue;
    if (!isUser && !s.includeAssistant) continue;

    const name = stripHtml(m.name || (isUser ? 'User' : 'Assistant'));
    let text = stripHtml(m.mes ?? m.message ?? '');
    if (!text) continue;
    if (text.length > maxChars) text = text.slice(0, maxChars) + '…(Cắt bớt)';
    picked.push(`【${name}】${text}`);
  }
  picked.reverse();

  const sourceSummary = {
    totalMessages: chat.length,
    usedMessages: picked.length,
    hasCanon: Boolean(canon),
    hasWorld: Boolean(world),
    characterSelected: ctx.characterId !== undefined && ctx.characterId !== null
  };

  const snapshotText = [
    `【Nhiệm vụ】Bạn là "Hướng dẫn cốt truyện". Dựa trên "thế giới đang trải qua" bên dưới (trò chuyện + thiết lập) để xuất báo cáo cấu trúc hóa.`,
    ``,
    charBlock ? charBlock : `【Thẻ Nhân Vật】(Chưa lấy được/Có thể là chat nhóm)`,
    ``,
    world ? `【Thế giới quan/Bổ sung thiết lập】\n${world}\n` : `【Thế giới quan/Bổ sung thiết lập】(Chưa cung cấp)\n`,
    canon ? `【Diễn biến tiếp theo nguyên tác/Đại cương】\n${canon}\n` : `【Diễn biến tiếp theo nguyên tác/Đại cương】(Chưa cung cấp)\n`,
    buildWorldbookBlock(),
    `【Lịch sử trò chuyện (${picked.length} tin gần nhất)】`,
    picked.length ? picked.join('\n\n') : '(Trống)'
  ].join('\n');

  return { snapshotText, sourceSummary };
}

// -------------------- provider=st --------------------

async function callViaSillyTavern(messages, schema, temperature) {
  const ctx = SillyTavern.getContext();
  if (typeof ctx.generateRaw === 'function') return await ctx.generateRaw({ prompt: messages, jsonSchema: schema, temperature });
  if (typeof ctx.generateQuietPrompt === 'function') return await ctx.generateQuietPrompt({ messages, jsonSchema: schema, temperature });
  if (globalThis.TavernHelper && typeof globalThis.TavernHelper.generateRaw === 'function') {
    const txt = await globalThis.TavernHelper.generateRaw({ ordered_prompts: messages, should_stream: false });
    return String(txt || '');
  }
  throw new Error('Không tìm thấy hàm tạo sinh khả dụng (generateRaw/generateQuietPrompt).');
}

async function fallbackAskJson(messages, temperature) {
  const ctx = SillyTavern.getContext();
  const retry = clone(messages);
  retry.unshift({ role: 'system', content: `Nhấn mạnh lại: Chỉ xuất đối tượng JSON, không thêm bất kỳ văn bản thừa nào.` });
  if (typeof ctx.generateRaw === 'function') return await ctx.generateRaw({ prompt: retry, temperature });
  if (typeof ctx.generateQuietPrompt === 'function') return await ctx.generateQuietPrompt({ messages: retry, temperature });
  throw new Error('fallback thất bại: thiếu generateRaw/generateQuietPrompt');
}

async function fallbackAskJsonCustom(apiBaseUrl, apiKey, model, messages, temperature, maxTokens, topP, stream) {
  const retry = clone(messages);
  retry.unshift({ role: 'system', content: `Nhấn mạnh lại: Chỉ xuất đối tượng JSON, không thêm bất kỳ văn bản thừa nào, không khối mã.` });
  return await callViaCustom(apiBaseUrl, apiKey, model, retry, temperature, maxTokens, topP, stream);
}

function hasAnyModuleKey(obj, modules) {
  if (!obj || typeof obj !== 'object') return false;
  for (const m of modules || []) {
    const k = m?.key;
    if (k && Object.prototype.hasOwnProperty.call(obj, k)) return true;
  }
  return false;
}



// -------------------- custom provider

// -------------------- custom provider (proxy-first) --------------------

function normalizeBaseUrl(input) {
  let u = String(input || '').trim();
  if (!u) return '';
  u = u.replace(/\/+$/, '');
  u = u.replace(/\/v1\/chat\/completions$/i, '');
  u = u.replace(/\/chat\/completions$/i, '');
  u = u.replace(/\/v1\/completions$/i, '');
  u = u.replace(/\/completions$/i, '');
  return u;
}
function deriveChatCompletionsUrl(base) {
  const u = normalizeBaseUrl(base);
  if (!u) return '';
  if (/\/v1$/.test(u)) return u + '/chat/completions';
  if (/\/v1\b/i.test(u)) return u.replace(/\/+$/, '') + '/chat/completions';
  return u + '/v1/chat/completions';
}


async function readStreamedChatCompletionToText(res) {
  const reader = res.body?.getReader?.();
  if (!reader) {
    // no stream body; fallback to normal
    const txt = await res.text().catch(() => '');
    return txt;
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let out = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // process line by line
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trimEnd();
      buffer = buffer.slice(idx + 1);

      const t = line.trim();
      if (!t) continue;

      // SSE: data: ...
      if (t.startsWith('data:')) {
        const payload = t.slice(5).trim();
        if (!payload) continue;
        if (payload === '[DONE]') return out;

        try {
          const j = JSON.parse(payload);
          const c0 = j?.choices?.[0];
          const delta = c0?.delta?.content;
          if (typeof delta === 'string') {
            out += delta;
            continue;
          }
          const msg = c0?.message?.content;
          if (typeof msg === 'string') {
            // some servers stream full message chunks as message.content
            out += msg;
            continue;
          }
          const txt = c0?.text;
          if (typeof txt === 'string') {
            out += txt;
            continue;
          }
          const c = j?.content;
          if (typeof c === 'string') {
            out += c;
            continue;
          }
        } catch {
          // ignore
        }
      } else {
        // NDJSON line
        try {
          const j = JSON.parse(t);
          const c0 = j?.choices?.[0];
          const delta = c0?.delta?.content;
          if (typeof delta === 'string') out += delta;
          else if (typeof c0?.message?.content === 'string') out += c0.message.content;
        } catch {
          // ignore
        }
      }
    }
  }

  // flush remaining (rare)
  const rest = buffer.trim();
  if (rest) {
    // try parse if json line
    try {
      const j = JSON.parse(rest);
      const c0 = j?.choices?.[0];
      const delta = c0?.delta?.content;
      if (typeof delta === 'string') out += delta;
      else if (typeof c0?.message?.content === 'string') out += c0.message.content;
    } catch { /* ignore */ }
  }

  return out;
}

async function callViaCustomBackendProxy(apiBaseUrl, apiKey, model, messages, temperature, maxTokens, topP, stream) {
  const url = '/api/backends/chat-completions/generate';

  const requestBody = {
    messages,
    model: String(model || '').replace(/^models\//, '') || 'gpt-4o-mini',
    max_tokens: maxTokens ?? 8192,
    temperature: temperature ?? 0.7,
    top_p: topP ?? 0.95,
    stream: !!stream,
    chat_completion_source: 'custom',
    reverse_proxy: apiBaseUrl,
    custom_url: apiBaseUrl,
    custom_include_headers: apiKey ? `Authorization: Bearer ${apiKey}` : '',
  };

  const headers = { ...getStRequestHeadersCompat(), 'Content-Type': 'application/json' };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(requestBody) });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Yêu cầu proxy backend thất bại: HTTP ${res.status} ${res.statusText}\n${text}`);
    err.status = res.status;
    throw err;
  }


  const ct = String(res.headers.get('content-type') || '');
  if (stream && (ct.includes('text/event-stream') || ct.includes('ndjson') || ct.includes('stream'))) {
    const streamed = await readStreamedChatCompletionToText(res);
    if (streamed) return String(streamed);
    // fall through
  }

  const data = await res.json().catch(() => ({}));
  if (data?.choices?.[0]?.message?.content) return String(data.choices[0].message.content);
  if (typeof data?.content === 'string') return data.content;
  return JSON.stringify(data ?? '');
}

async function callViaCustomBrowserDirect(apiBaseUrl, apiKey, model, messages, temperature, maxTokens, topP, stream) {
  const endpoint = deriveChatCompletionsUrl(apiBaseUrl);
  if (!endpoint) throw new Error('Chế độ custom: URL cơ sở API bị trống');

  const body = {
    model,
    messages,
    max_tokens: maxTokens ?? 8192,
    temperature: temperature ?? 0.7,
    top_p: topP ?? 0.95,
    stream: !!stream,
  };
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Yêu cầu trực tiếp thất bại: HTTP ${res.status} ${res.statusText}\n${text}`);
  }

  const ct = String(res.headers.get('content-type') || '');
  if (stream && (ct.includes('text/event-stream') || ct.includes('ndjson') || ct.includes('stream'))) {
    const streamed = await readStreamedChatCompletionToText(res);
    return String(streamed || '');
  }

  const json = await res.json();
  return String(json?.choices?.[0]?.message?.content ?? '');
}

async function callViaCustom(apiBaseUrl, apiKey, model, messages, temperature, maxTokens, topP, stream) {
  const base = normalizeBaseUrl(apiBaseUrl);
  if (!base) throw new Error('Chế độ custom cần điền URL cơ sở API');

  try {
    return await callViaCustomBackendProxy(base, apiKey, model, messages, temperature, maxTokens, topP, stream);
  } catch (e) {
    const status = e?.status;
    if (status === 404 || status === 405) {
      console.warn('[StoryGuide] backend proxy unavailable; fallback to browser direct');
      return await callViaCustomBrowserDirect(base, apiKey, model, messages, temperature, maxTokens, topP, stream);
    }
    throw e;
  }
}

// -------------------- render report from modules --------------------

function renderReportMarkdownFromModules(parsedJson, modules) {
  const lines = [];
  lines.push(`# Báo cáo Hướng dẫn Cốt truyện`);
  lines.push('');

  for (const m of modules) {
    const val = parsedJson?.[m.key];
    lines.push(`## ${m.title || m.key}`);

    if (m.type === 'list') {
      const arr = Array.isArray(val) ? val : [];
      if (!arr.length) {
        lines.push('(Trống)');
      } else {
        // tips use ordered list
        if (m.key === 'tips') {
          arr.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
        } else {
          arr.forEach(t => lines.push(`- ${t}`));
        }
      }
    } else {
      lines.push(val ? String(val) : '(Trống)');
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

// -------------------- panel analysis --------------------

async function runAnalysis() {
  const s = ensureSettings();
  if (!s.enabled) { setStatus('Tiện ích chưa được bật', 'warn'); return; }

  setStatus('Đang phân tích…', 'warn');
  $('#sg_analyze').prop('disabled', true);

  try {
    const { snapshotText, sourceSummary } = buildSnapshot();
    const modules = getModules('panel');
    const schema = buildSchemaFromModules(modules);
    const messages = buildPromptMessages(snapshotText, s.spoilerLevel, modules, 'panel');

    let jsonText = '';
    if (s.provider === 'custom') {
      jsonText = await callViaCustom(s.customEndpoint, s.customApiKey, s.customModel, messages, s.temperature, s.customMaxTokens, s.customTopP, s.customStream);
      const parsedTry = safeJsonParse(jsonText);
      if (!parsedTry || !hasAnyModuleKey(parsedTry, modules)) {
        try { jsonText = await fallbackAskJsonCustom(s.customEndpoint, s.customApiKey, s.customModel, messages, s.temperature, s.customMaxTokens, s.customTopP, s.customStream); }
        catch { /* ignore */ }
      }
    } else {
      jsonText = await callViaSillyTavern(messages, schema, s.temperature);
      if (typeof jsonText !== 'string') jsonText = JSON.stringify(jsonText ?? '');
      const parsedTry = safeJsonParse(jsonText);
      if (!parsedTry || Object.keys(parsedTry).length === 0) jsonText = await fallbackAskJson(messages, s.temperature);
    }

    const parsed = safeJsonParse(jsonText);
    lastJsonText = (parsed ? JSON.stringify(parsed, null, 2) : String(jsonText || ''));

    $('#sg_json').text(lastJsonText);
    $('#sg_src').text(JSON.stringify(sourceSummary, null, 2));

    if (!parsed) {
      // Đồng bộ văn bản gốc vào cuối cuộc trò chuyện (để không bị mất khi phân tích thất bại)
      try { syncPanelOutputToChat(String(jsonText || lastJsonText || ''), true); } catch { /* ignore */ }
      showPane('json');
      throw new Error('Đầu ra mô hình không thể phân tích thành JSON (đã chuyển sang tab JSON, hãy xem văn bản gốc)');
    }

    const md = renderReportMarkdownFromModules(parsed, modules);
    lastReport = { json: parsed, markdown: md, createdAt: Date.now(), sourceSummary };
    renderMarkdownInto($('#sg_md'), md);

    // Đồng bộ báo cáo bảng điều khiển vào cuối cuộc trò chuyện
    try { syncPanelOutputToChat(md, false); } catch { /* ignore */ }

    updateButtonsEnabled();
    showPane('md');
    setStatus('Hoàn thành ✅', 'ok');
  } catch (e) {
    console.error('[StoryGuide] analysis failed:', e);
    setStatus(`Phân tích thất bại: ${e?.message ?? e}`, 'err');
  } finally {
    $('#sg_analyze').prop('disabled', false);
  }
}

// -------------------- summary (auto + world info) --------------------

function isCountableMessage(m) {
  if (!m) return false;
  if (m.is_system === true) return false;
  if (m.is_hidden === true) return false;
  const txt = String(m.mes ?? '').trim();
  return Boolean(txt);
}

function isCountableAssistantMessage(m) {
  return isCountableMessage(m) && m.is_user !== true;
}

function computeFloorCount(chat, mode) {
  const arr = Array.isArray(chat) ? chat : [];
  let c = 0;
  for (const m of arr) {
    if (mode === 'assistant') {
      if (isCountableAssistantMessage(m)) c++;
    } else {
      if (isCountableMessage(m)) c++;
    }
  }
  return c;
}

function findStartIndexForLastNFloors(chat, mode, n) {
  const arr = Array.isArray(chat) ? chat : [];
  let remaining = Math.max(1, Number(n) || 1);
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr[i];
    const hit = (mode === 'assistant') ? isCountableAssistantMessage(m) : isCountableMessage(m);
    if (!hit) continue;
    remaining -= 1;
    if (remaining <= 0) return i;
  }
  return 0;
}

function buildSummaryChunkText(chat, startIdx, maxCharsPerMessage, maxTotalChars) {
  const arr = Array.isArray(chat) ? chat : [];
  const start = Math.max(0, Math.min(arr.length, Number(startIdx) || 0));
  const perMsg = clampInt(maxCharsPerMessage, 200, 8000, 4000);
  const totalMax = clampInt(maxTotalChars, 2000, 80000, 24000);

  const parts = [];
  let total = 0;
  for (let i = start; i < arr.length; i++) {
    const m = arr[i];
    if (!isCountableMessage(m)) continue;
    const who = m.is_user === true ? 'Người dùng' : (m.name || 'AI');
    let txt = stripHtml(m.mes || '');
    if (!txt) continue;
    if (txt.length > perMsg) txt = txt.slice(0, perMsg) + '…';
    const block = `【${who}】${txt}`;
    if (total + block.length + 2 > totalMax) break;
    parts.push(block);
    total += block.length + 2;
  }
  return parts.join('\n');
}

// Tóm tắt phạm vi tầng thủ công: định vị chỉ số trò chuyện theo số floor
function findChatIndexByFloor(chat, mode, floorNo) {
  const arr = Array.isArray(chat) ? chat : [];
  const target = Math.max(1, Number(floorNo) || 1);
  let c = 0;
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    const hit = (mode === 'assistant') ? isCountableAssistantMessage(m) : isCountableMessage(m);
    if (!hit) continue;
    c += 1;
    if (c === target) return i;
  }
  return -1;
}

function resolveChatRangeByFloors(chat, mode, fromFloor, toFloor) {
  const floorNow = computeFloorCount(chat, mode);
  if (floorNow <= 0) return null;
  let a = clampInt(fromFloor, 1, floorNow, 1);
  let b = clampInt(toFloor, 1, floorNow, floorNow);
  if (b < a) { const t = a; a = b; b = t; }

  let startIdx = findChatIndexByFloor(chat, mode, a);
  let endIdx = findChatIndexByFloor(chat, mode, b);
  if (startIdx < 0 || endIdx < 0) return null;

  // Trong chế độ assistant, để sát với "hiệp" hơn, đưa tin nhắn người dùng trước floor assistant bắt đầu vào (nếu có).
  if (mode === 'assistant' && startIdx > 0) {
    const prev = chat[startIdx - 1];
    if (prev && prev.is_user === true && isCountableMessage(prev)) startIdx -= 1;
  }

  if (startIdx > endIdx) { const t = startIdx; startIdx = endIdx; endIdx = t; }
  return { fromFloor: a, toFloor: b, startIdx, endIdx, floorNow };
}

function buildSummaryChunkTextRange(chat, startIdx, endIdx, maxCharsPerMessage, maxTotalChars) {
  const arr = Array.isArray(chat) ? chat : [];
  const start = Math.max(0, Math.min(arr.length - 1, Number(startIdx) || 0));
  const end = Math.max(start, Math.min(arr.length - 1, Number(endIdx) || 0));
  const perMsg = clampInt(maxCharsPerMessage, 200, 8000, 4000);
  const totalMax = clampInt(maxTotalChars, 2000, 80000, 24000);

  const parts = [];
  let total = 0;
  for (let i = start; i <= end; i++) {
    const m = arr[i];
    if (!isCountableMessage(m)) continue;
    const who = m.is_user === true ? 'Người dùng' : (m.name || 'AI');
    let txt = stripHtml(m.mes || '');
    if (!txt) continue;
    if (txt.length > perMsg) txt = txt.slice(0, perMsg) + '…';
    const block = `【${who}】${txt}`;
    if (total + block.length + 2 > totalMax) break;
    parts.push(block);
    total += block.length + 2;
  }
  return parts.join('\n');
}

function getSummarySchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      keywords: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'keywords'],
  };
}

function buildSummaryPromptMessages(chunkText, fromFloor, toFloor) {
  const s = ensureSettings();

  // system prompt
  let sys = String(s.summarySystemPrompt || '').trim();
  if (!sys) sys = DEFAULT_SUMMARY_SYSTEM_PROMPT;
  // Bắt buộc thêm yêu cầu cấu trúc JSON, tránh người dùng tùy chỉnh prompt làm hỏng phân tích
  sys = sys + '\n\n' + SUMMARY_JSON_REQUIREMENT;

  // user template (supports placeholders)
  let tpl = String(s.summaryUserTemplate || '').trim();
  if (!tpl) tpl = DEFAULT_SUMMARY_USER_TEMPLATE;
  let user = renderTemplate(tpl, {
    fromFloor: String(fromFloor),
    toFloor: String(toFloor),
    chunk: String(chunkText || ''),
  });
  // Nếu template người dùng không chứa chunk, bổ sung vào để tránh lỗi
  if (!/{{\s*chunk\s*}}/i.test(tpl) && !String(user).includes(String(chunkText || '').slice(0, 12))) {
    user = String(user || '').trim() + `\n\n【Đoạn đối thoại】\n${chunkText}`;
  }
  return [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ];
}

function sanitizeKeywords(kws) {
  const out = [];
  const seen = new Set();
  for (const k of (Array.isArray(kws) ? kws : [])) {
    let t = String(k ?? '').trim();
    if (!t) continue;
    t = t.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
    // split by common delimiters
    const split = t.split(/[,，、;；/|]+/g).map(x => x.trim()).filter(Boolean);
    for (const s of split) {
      if (s.length < 2) continue;
      if (s.length > 24) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
      if (out.length >= 16) return out;
    }
  }
  return out;
}

function appendToBlueIndexCache(rec) {
  const s = ensureSettings();
  const item = {
    title: String(rec?.title || '').trim(),
    summary: String(rec?.summary || '').trim(),
    keywords: sanitizeKeywords(rec?.keywords),
    createdAt: Number(rec?.createdAt) || Date.now(),
    range: rec?.range ?? undefined,
  };
  if (!item.summary) return;
  if (!item.title) item.title = item.keywords?.[0] ? `Mục: ${item.keywords[0]}` : 'Mục';
  const arr = Array.isArray(s.summaryBlueIndex) ? s.summaryBlueIndex : [];
  // de-dup (only check recent items)
  for (let i = arr.length - 1; i >= 0 && i >= arr.length - 10; i--) {
    const prev = arr[i];
    if (!prev) continue;
    if (String(prev.title || '') === item.title && String(prev.summary || '') === item.summary) {
      return;
    }
  }
  arr.push(item);
  // keep bounded
  if (arr.length > 600) arr.splice(0, arr.length - 600);
  s.summaryBlueIndex = arr;
  saveSettings();
  updateBlueIndexInfoLabel();
}

let cachedSlashExecutor = null;

async function getSlashExecutor() {
  if (cachedSlashExecutor) return cachedSlashExecutor;

  const ctx = SillyTavern.getContext?.();
  // SillyTavern has renamed / refactored slash command executors multiple times.
  // We support a broad set of known entry points (newest first), and then best-effort
  // call them with compatible signatures.
  const candidates = [
    // Newer ST versions expose this via getContext()
    ctx?.executeSlashCommandsWithOptions,
    ctx?.executeSlashCommands,
    ctx?.processChatSlashCommands,
    ctx?.executeSlashCommandsOnChatInput,

    // Some builds expose the parser/executor objects
    ctx?.SlashCommandParser?.executeSlashCommandsWithOptions,
    ctx?.SlashCommandParser?.execute,
    globalThis.SlashCommandParser?.executeSlashCommandsWithOptions,
    globalThis.SlashCommandParser?.execute,

    // Global fallbacks
    globalThis.executeSlashCommandsWithOptions,
    globalThis.executeSlashCommands,
    globalThis.processChatSlashCommands,
    globalThis.executeSlashCommandsOnChatInput,
  ].filter(fn => typeof fn === 'function');

  if (candidates.length) {
    cachedSlashExecutor = async (cmd) => {
      // best-effort signature compatibility
      for (const fn of candidates) {
        // common signatures:
        // - fn(text)
        // - fn(text, boolean)
        // - fn(text, { quiet, silent, execute, ... })
        // - fn({ input: text, ... })
        try { return await fn(cmd); } catch { /* try next */ }
        try { return await fn(cmd, true); } catch { /* try next */ }
        try { return await fn(cmd, { quiet: true, silent: true }); } catch { /* try next */ }
        try { return await fn(cmd, { shouldDisplayMessage: false, quiet: true, silent: true }); } catch { /* try next */ }
        try { return await fn({ input: cmd, quiet: true, silent: true }); } catch { /* try next */ }
        try { return await fn({ command: cmd, quiet: true, silent: true }); } catch { /* try next */ }
      }
      throw new Error('Slash command executor found but failed to run.');
    };
    return cachedSlashExecutor;
  }

  try {
    const mod = await import(/* webpackIgnore: true */ '/script.js');
    const modFns = [
      mod?.executeSlashCommandsWithOptions,
      mod?.executeSlashCommands,
      mod?.processChatSlashCommands,
      mod?.executeSlashCommandsOnChatInput,
    ].filter(fn => typeof fn === 'function');
    if (modFns.length) {
      cachedSlashExecutor = async (cmd) => {
        for (const fn of modFns) {
          try { return await fn(cmd); } catch { /* try next */ }
          try { return await fn(cmd, true); } catch { /* try next */ }
          try { return await fn(cmd, { quiet: true, silent: true }); } catch { /* try next */ }
        }
        throw new Error('Slash command executor from /script.js failed to run.');
      };
      return cachedSlashExecutor;
    }
  } catch {
    // ignore
  }

  cachedSlashExecutor = null;
  throw new Error('Không tìm thấy hàm thực thi STscript/SlashCommand khả dụng (không thể tự động ghi vào Sách Thế Giới).');
}

async function execSlash(cmd) {
  const exec = await getSlashExecutor();
  return await exec(String(cmd || '').trim());
}

function safeStringifyShort(v, maxLen = 260) {
  try {
    const s = (typeof v === 'string') ? v : JSON.stringify(v);
    if (!s) return '';
    return s.length > maxLen ? (s.slice(0, maxLen) + '...') : s;
  } catch {
    try {
      const s = String(v);
      if (!s) return '';
      return s.length > maxLen ? (s.slice(0, maxLen) + '...') : s;
    } catch {
      return '';
    }
  }
}

/**
 * Tương thích với các định dạng trả về của bộ thực thi SlashCommand ở các phiên bản khác nhau:
 * - string
 * - number/boolean
 * - array
 * - object（common fields: text/output/message/result/value/data/html...）
 */
function slashOutputToText(out, seen = new Set()) {
  if (out == null) return '';
  const t = typeof out;
  if (t === 'string') return out;
  if (t === 'number' || t === 'boolean') return String(out);

  if (Array.isArray(out)) {
    return out.map(x => slashOutputToText(x, seen)).filter(Boolean).join('\n');
  }

  if (t === 'object') {
    if (seen.has(out)) return '';
    seen.add(out);

    // common fields in different ST builds
    const common = ['text', 'output', 'message', 'content', 'result', 'value', 'data', 'html', 'return', 'payload', 'response'];
    for (const k of common) {
      if (Object.hasOwn(out, k)) {
        const s = slashOutputToText(out[k], seen);
        if (s) return s;
      }
    }

    // any non-empty string field
    for (const v of Object.values(out)) {
      if (typeof v === 'string' && v.trim()) return v;
    }

    return '';
  }

  try { return String(out); } catch { return ''; }
}

/**
 * Trích xuất UID mục Worldbook từ đầu ra SlashCommand
 * - Hỗ trợ nhiều dạng text / object / array
 * - Hỗ trợ uid=123, UID:123, cũng như uid nằm trực tiếp trong object trả về
 */
function extractUid(out, seen = new Set()) {
  if (out == null) return null;

  const t = typeof out;

  if (t === 'number') {
    const n = Math.trunc(out);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  if (t === 'string') {
    const s = out;
    const m1 = s.match(/\buid\s*[:=]\s*(\d{1,12})\b/i);
    if (m1) return Number.parseInt(m1[1], 10);
    const m2 = s.match(/\b(\d{1,12})\b/);
    if (m2) return Number.parseInt(m2[1], 10);
    return null;
  }

  if (Array.isArray(out)) {
    for (const it of out) {
      const r = extractUid(it, seen);
      if (r) return r;
    }
    return null;
  }

  if (t === 'object') {
    if (seen.has(out)) return null;
    seen.add(out);

    // direct uid/id fields
    const directKeys = ['uid', 'id', 'entryId', 'entry_id', 'worldInfoUid', 'worldinfoUid'];
    for (const k of directKeys) {
      if (Object.hasOwn(out, k)) {
        const n = Number(out[k]);
        if (Number.isFinite(n) && n > 0) return Math.trunc(n);
      }
    }

    // nested containers
    const nestedKeys = ['result', 'data', 'value', 'output', 'return', 'payload', 'response', 'entry'];
    for (const k of nestedKeys) {
      if (Object.hasOwn(out, k)) {
        const r = extractUid(out[k], seen);
        if (r) return r;
      }
    }

    // scan all values (shallow + recursion)
    for (const v of Object.values(out)) {
      const r = extractUid(v, seen);
      if (r) return r;
    }

    // fallback: parse from textified output
    const s = slashOutputToText(out, seen);
    if (s) return extractUid(s, seen);

    return null;
  }

  // fallback
  return extractUid(String(out), seen);
}

function quoteSlashValue(v) {
  const s = String(v ?? '').replace(/"/g, '\\"');
  return `"${s}"`;
}

async function writeSummaryToWorldInfoEntry(rec, meta, {
  target = 'file',
  file = '',
  commentPrefix = 'Tóm tắt cốt truyện',
  constant = 0,
} = {}) {
  const kws = sanitizeKeywords(rec.keywords);
  const range = rec?.range ? `${rec.range.fromFloor}-${rec.range.toFloor}` : '';
  const prefix = String(commentPrefix || 'Tóm tắt cốt truyện').trim() || 'Tóm tắt cốt truyện';
  const rawTitle = String(rec.title || '').trim();

  const s = ensureSettings();
  const keyMode = String(s.summaryWorldInfoKeyMode || 'keywords');
  const indexId = String(rec?.indexId || '').trim();
  const indexInComment = (keyMode === 'indexId') && !!s.summaryIndexInComment && !!indexId;
  // Trường comment thường là "tiêu đề" trong danh sách Sách Thế Giới. Ở đây đảm bảo prefix luôn ở đầu, tránh "thiết lập tiền tố vô hiệu".
  let commentTitle = rawTitle;
  if (prefix) {
    if (!commentTitle) commentTitle = prefix;
    else if (!commentTitle.startsWith(prefix)) commentTitle = `${prefix}｜${commentTitle}`;
  }
  // Nếu bật "Kích hoạt số hiệu chỉ mục": Ghi A-001 vào comment, thuận tiện định vị trong danh sách Sách Thế Giới.
  if (indexInComment) {
    if (!commentTitle.includes(indexId)) {
      if (commentTitle === prefix) commentTitle = `${prefix}｜${indexId}`;
      else if (commentTitle.startsWith(`${prefix}｜`)) commentTitle = commentTitle.replace(`${prefix}｜`, `${prefix}｜${indexId}｜`);
      else commentTitle = `${prefix}｜${indexId}｜${commentTitle}`;
      commentTitle = commentTitle.replace(/｜｜+/g, '｜');
    }
  }
  if (!commentTitle) commentTitle = 'Tóm tắt cốt truyện';
  const comment = `${commentTitle}${range ? `（${range}）` : ''}`;

  // normalize content and make it safe for slash parser (avoid accidental pipe split)
  const content = String(rec.summary || '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\|/g, '｜');

  const t = String(target || 'file');
  const f = String(file || '').trim();
  if (t === 'file' && !f) throw new Error('Khi mục tiêu WorldInfo là file, bắt buộc phải điền tên tệp Sách Thế Giới.');

  // We purposely avoid parsing UID in JS, because some ST builds return only a status object
  // (e.g. {pipe:"0", ...}) even when the command pipes the UID internally.
  // Instead, we build a single STscript pipeline that:
  // 1) resolves chatbook file name (if needed)
  // 2) creates the entry (UID goes into pipe)
  // 3) stores UID into a local var
  // 4) sets fields using the stored UID
  // This works regardless of whether JS can read the piped output.
  const uidVar = '__sg_summary_uid';
  const fileVar = '__sg_summary_wbfile';

  const keyValue = (kws.length ? kws.join(',') : prefix);
  const constantVal = (Number(constant) === 1) ? 1 : 0;

  const fileExpr = (t === 'chatbook') ? `{{getvar::${fileVar}}}` : f;

  const parts = [];
  if (t === 'chatbook') {
    parts.push('/getchatbook');
    parts.push(`/setvar key=${fileVar}`);
  }

  // create entry + capture uid
  parts.push(`/createentry file=${quoteSlashValue(fileExpr)} key=${quoteSlashValue(keyValue)} ${quoteSlashValue(content)}`);
  parts.push(`/setvar key=${uidVar}`);

  // update fields
  parts.push(`/setentryfield file=${quoteSlashValue(fileExpr)} uid={{getvar::${uidVar}}} field=content ${quoteSlashValue(content)}`);
  parts.push(`/setentryfield file=${quoteSlashValue(fileExpr)} uid={{getvar::${uidVar}}} field=key ${quoteSlashValue(keyValue)}`);
  parts.push(`/setentryfield file=${quoteSlashValue(fileExpr)} uid={{getvar::${uidVar}}} field=comment ${quoteSlashValue(comment)}`);
  parts.push(`/setentryfield file=${quoteSlashValue(fileExpr)} uid={{getvar::${uidVar}}} field=disable 0`);
  parts.push(`/setentryfield file=${quoteSlashValue(fileExpr)} uid={{getvar::${uidVar}}} field=constant ${constantVal}`);

  // cleanup temp vars
  parts.push(`/flushvar ${uidVar}`);
  if (t === 'chatbook') parts.push(`/flushvar ${fileVar}`);

  const script = parts.join(' | ');
  const out = await execSlash(script);
  if (out && typeof out === 'object' && (out.isError || out.isAborted || out.isQuietlyAborted)) {
    throw new Error(`Ghi vào Sách Thế Giới thất bại (Trả về: ${safeStringifyShort(out)})`);
  }

  // store link (UID is intentionally omitted because it may be inaccessible from JS in some ST builds)
  const keyName = (constantVal === 1) ? 'worldInfoBlue' : 'worldInfoGreen';
  rec[keyName] = { file: (t === 'file') ? f : 'chatbook', uid: null };
  if (meta && Array.isArray(meta.history) && meta.history.length) {
    meta.history[meta.history.length - 1] = rec;
    await setSummaryMeta(meta);
  }

  return { file: (t === 'file') ? f : 'chatbook', uid: null };
}

async function runSummary({ reason = 'manual', manualFromFloor = null, manualToFloor = null, manualSplit = null } = {}) {
  const s = ensureSettings();
  const ctx = SillyTavern.getContext();

  if (reason === 'auto' && !s.enabled) return;

  if (isSummarizing) return;
  isSummarizing = true;
  setStatus('Đang tóm tắt…', 'warn');
  showToast('Đang tóm tắt…', { kind: 'warn', spinner: true, sticky: true });

  try {
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const mode = String(s.summaryCountMode || 'assistant');
    const floorNow = computeFloorCount(chat, mode);

    let meta = getSummaryMeta();
    if (!meta || typeof meta !== 'object') meta = getDefaultSummaryMeta();
    // choose range(s)
    const every = clampInt(s.summaryEvery, 1, 200, 20);
    const segments = [];

    if (reason === 'manual_range') {
      const resolved0 = resolveChatRangeByFloors(chat, mode, manualFromFloor, manualToFloor);
      if (!resolved0) {
        setStatus('Phạm vi tầng thủ công không hợp lệ (hãy kiểm tra số tầng bắt đầu/kết thúc)', 'warn');
        showToast('Phạm vi tầng thủ công không hợp lệ (hãy kiểm tra số tầng bắt đầu/kết thúc)', { kind: 'warn', spinner: false, sticky: false, duration: 2200 });
        return;
      }

      const splitEnabled = (manualSplit === null || manualSplit === undefined)
        ? !!s.summaryManualSplit
        : !!manualSplit;

      if (splitEnabled && every > 0) {
        const a0 = resolved0.fromFloor;
        const b0 = resolved0.toFloor;
        for (let f = a0; f <= b0; f += every) {
          const g = Math.min(b0, f + every - 1);
          const r = resolveChatRangeByFloors(chat, mode, f, g);
          if (r) segments.push(r);
        }
        if (!segments.length) segments.push(resolved0);
      } else {
        segments.push(resolved0);
      }
    } else if (reason === 'auto' && meta.lastChatLen > 0 && meta.lastChatLen < chat.length) {
      const startIdx = meta.lastChatLen;
      const fromFloor = Math.max(1, Number(meta.lastFloor || 0) + 1);
      const toFloor = floorNow;
      const endIdx = Math.max(0, chat.length - 1);
      segments.push({ startIdx, endIdx, fromFloor, toFloor, floorNow });
    } else {
      const startIdx = findStartIndexForLastNFloors(chat, mode, every);
      const fromFloor = Math.max(1, floorNow - every + 1);
      const toFloor = floorNow;
      const endIdx = Math.max(0, chat.length - 1);
      segments.push({ startIdx, endIdx, fromFloor, toFloor, floorNow });
    }

    const totalSeg = segments.length;
    if (!totalSeg) {
      setStatus('Không có nội dung để tóm tắt (phạm vi trống)', 'warn');
      showToast('Không có nội dung để tóm tắt (phạm vi trống)', { kind: 'warn', spinner: false, sticky: false, duration: 2200 });
      return;
    }

    const affectsProgress = (reason !== 'manual_range');
    const keyMode = String(s.summaryWorldInfoKeyMode || 'keywords');

    let created = 0;
    let wroteGreenOk = 0;
    let wroteBlueOk = 0;
    const writeErrs = [];
    const runErrs = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const startIdx = seg.startIdx;
      const endIdx = seg.endIdx;
      const fromFloor = seg.fromFloor;
      const toFloor = seg.toFloor;

      if (totalSeg > 1) setStatus(`Đang tóm tắt phân đoạn thủ công…（${i + 1}/${totalSeg}｜${fromFloor}-${toFloor}）`, 'warn');
      else setStatus('Đang tóm tắt…', 'warn');

      const chunkText = buildSummaryChunkTextRange(chat, startIdx, endIdx, s.summaryMaxCharsPerMessage, s.summaryMaxTotalChars);
      if (!chunkText) {
        runErrs.push(`${fromFloor}-${toFloor}：Phân đoạn trống`);
        continue;
      }

      const messages = buildSummaryPromptMessages(chunkText, fromFloor, toFloor);
      const schema = getSummarySchema();

      let jsonText = '';
      if (String(s.summaryProvider || 'st') === 'custom') {
        jsonText = await callViaCustom(s.summaryCustomEndpoint, s.summaryCustomApiKey, s.summaryCustomModel, messages, s.summaryTemperature, s.summaryCustomMaxTokens, 0.95, s.summaryCustomStream);
        const parsedTry = safeJsonParse(jsonText);
        if (!parsedTry || !parsedTry.summary) {
          try { jsonText = await fallbackAskJsonCustom(s.summaryCustomEndpoint, s.summaryCustomApiKey, s.summaryCustomModel, messages, s.summaryTemperature, s.summaryCustomMaxTokens, 0.95, s.summaryCustomStream); }
          catch { /* ignore */ }
        }
      } else {
        jsonText = await callViaSillyTavern(messages, schema, s.summaryTemperature);
        if (typeof jsonText !== 'string') jsonText = JSON.stringify(jsonText ?? '');
        const parsedTry = safeJsonParse(jsonText);
        if (!parsedTry || !parsedTry.summary) jsonText = await fallbackAskJson(messages, s.summaryTemperature);
      }

      const parsed = safeJsonParse(jsonText);
      if (!parsed || !parsed.summary) {
        runErrs.push(`${fromFloor}-${toFloor}：Đầu ra tóm tắt không thể phân tích thành JSON`);
        continue;
      }

      const prefix = String(s.summaryWorldInfoCommentPrefix || 'Tóm tắt cốt truyện').trim() || 'Tóm tắt cốt truyện';
      const rawTitle = String(parsed.title || '').trim();
      const summary = String(parsed.summary || '').trim();
      const modelKeywords = sanitizeKeywords(parsed.keywords);
      let indexId = '';
      let keywords = modelKeywords;

      if (keyMode === 'indexId') {
        // init nextIndex
        if (!Number.isFinite(Number(meta.nextIndex))) {
          let maxN = 0;
          const pref = String(s.summaryIndexPrefix || 'A-');
          const re = new RegExp('^' + escapeRegExp(pref) + '(\\d+)$');
          for (const h of (Array.isArray(meta.history) ? meta.history : [])) {
            const id0 = String(h?.indexId || '').trim();
            const m = id0.match(re);
            if (m) maxN = Math.max(maxN, Number.parseInt(m[1], 10) || 0);
          }
          meta.nextIndex = Math.max(clampInt(s.summaryIndexStart, 1, 1000000, 1), maxN + 1);
        }

        const pref = String(s.summaryIndexPrefix || 'A-');
        const pad = clampInt(s.summaryIndexPad, 1, 12, 3);
        const n = clampInt(meta.nextIndex, 1, 100000000, 1);
        indexId = `${pref}${String(n).padStart(pad, '0')}`;
        keywords = [indexId];
      }

      const title = rawTitle || `${prefix}`;

      const rec = {
        title,
        summary,
        keywords,
        indexId: indexId || undefined,
        modelKeywords: (keyMode === 'indexId') ? modelKeywords : undefined,
        createdAt: Date.now(),
        range: { fromFloor, toFloor, fromIdx: startIdx, toIdx: endIdx },
      };

      if (keyMode === 'indexId') {
        meta.nextIndex = clampInt(Number(meta.nextIndex) + 1, 1, 1000000000, Number(meta.nextIndex) + 1);
      }

      meta.history = Array.isArray(meta.history) ? meta.history : [];
      meta.history.push(rec);
      if (meta.history.length > 120) meta.history = meta.history.slice(-120);
      if (affectsProgress) {
        meta.lastFloor = toFloor;
        meta.lastChatLen = chat.length;
      }
      await setSummaryMeta(meta);
      created += 1;

      // Đồng bộ vào bộ nhớ đệm chỉ mục Đèn Xanh (để khớp/lọc trước cục bộ)
      try { appendToBlueIndexCache(rec); } catch { /* ignore */ }

      // world info write
      if (s.summaryToWorldInfo || s.summaryToBlueWorldInfo) {
        if (s.summaryToWorldInfo) {
          try {
            await writeSummaryToWorldInfoEntry(rec, meta, {
              target: String(s.summaryWorldInfoTarget || 'chatbook'),
              file: String(s.summaryWorldInfoFile || ''),
              commentPrefix: String(s.summaryWorldInfoCommentPrefix || 'Tóm tắt cốt truyện'),
              constant: 0,
            });
            wroteGreenOk += 1;
          } catch (e) {
            console.warn('[StoryGuide] write green world info failed:', e);
            writeErrs.push(`${fromFloor}-${toFloor} Đèn Xanh Lá: ${e?.message ?? e}`);
          }
        }

        if (s.summaryToBlueWorldInfo) {
          try {
            await writeSummaryToWorldInfoEntry(rec, meta, {
              target: 'file',
              file: String(s.summaryBlueWorldInfoFile || ''),
              commentPrefix: String(s.summaryBlueWorldInfoCommentPrefix || s.summaryWorldInfoCommentPrefix || 'Tóm tắt cốt truyện'),
              constant: 1,
            });
            wroteBlueOk += 1;
          } catch (e) {
            console.warn('[StoryGuide] write blue world info failed:', e);
            writeErrs.push(`${fromFloor}-${toFloor} Đèn Xanh: ${e?.message ?? e}`);
          }
        }
      }
    }

    updateSummaryInfoLabel();
    renderSummaryPaneFromMeta();

    // Nếu bật đọc chỉ mục thời gian thực: Sau khi ghi thủ công vào Đèn Xanh, làm mới bộ nhớ đệm càng sớm càng tốt
    if (s.summaryToBlueWorldInfo && String(ensureSettings().wiBlueIndexMode || 'live') === 'live') {
      ensureBlueIndexLive(true).catch(() => void 0);
    }

    if (created <= 0) {
      setStatus(`Chưa tạo được tóm tắt nào（${runErrs.length ? runErrs[0] : 'Lỗi không xác định'}）`, 'warn');
      showToast(`Chưa tạo được tóm tắt nào（${runErrs.length ? runErrs[0] : 'Lỗi không xác định'}）`, { kind: 'warn', spinner: false, sticky: false, duration: 2600 });
      return;
    }

    // final status
    if (totalSeg > 1) {
      const parts = [`Đã tạo ${created} mục`];
      if (s.summaryToWorldInfo || s.summaryToBlueWorldInfo) {
        const wrote = [];
        if (s.summaryToWorldInfo) wrote.push(`Đèn Xanh Lá ${wroteGreenOk}/${created}`);
        if (s.summaryToBlueWorldInfo) wrote.push(`Đèn Xanh ${wroteBlueOk}/${created}`);
        if (wrote.length) parts.push(`Đã ghi: ${wrote.join('｜')}`);
      }
      const errCount = writeErrs.length + runErrs.length;
      if (errCount) {
        const sample = (writeErrs.concat(runErrs)).slice(0, 2).join('；');
        setStatus(`Hoàn thành tóm tắt phân đoạn thủ công ✅（${parts.join('｜')}｜Thất bại: ${errCount}｜${sample}${errCount > 2 ? '…' : ''}）`, 'warn');
      } else {
        setStatus(`Hoàn thành tóm tắt phân đoạn thủ công ✅（${parts.join('｜')}）`, 'ok');
      }
    } else {
      // single
      if (s.summaryToWorldInfo || s.summaryToBlueWorldInfo) {
        const ok = [];
        const err = [];
        if (s.summaryToWorldInfo) {
          if (wroteGreenOk >= 1) ok.push('Worldbook Đèn Xanh Lá');
          else if (writeErrs.find(x => x.includes('Đèn Xanh Lá'))) err.push(writeErrs.find(x => x.includes('Đèn Xanh Lá')));
        }
        if (s.summaryToBlueWorldInfo) {
          if (wroteBlueOk >= 1) ok.push('Worldbook Đèn Xanh');
          else if (writeErrs.find(x => x.includes('Đèn Xanh'))) err.push(writeErrs.find(x => x.includes('Đèn Xanh')));
        }
        if (!err.length) setStatus(`Tóm tắt hoàn thành ✅（Đã ghi: ${ok.join(' + ') || '（Không）'}）`, 'ok');
        else setStatus(`Tóm tắt hoàn thành ✅（Ghi thất bại: ${err.join('；')}）`, 'warn');
      } else {
        setStatus('Tóm tắt hoàn thành ✅', 'ok');
      }
    }

    // toast notify (non-blocking)
    try {
      const errCount = (writeErrs?.length || 0) + (runErrs?.length || 0);
      const kind = errCount ? 'warn' : 'ok';
      const text = (totalSeg > 1)
        ? (errCount ? 'Hoàn thành tóm tắt phân đoạn ⚠️' : 'Hoàn thành tóm tắt phân đoạn ✅')
        : (errCount ? 'Hoàn thành tóm tắt ⚠️' : 'Hoàn thành tóm tắt ✅');
      showToast(text, { kind, spinner: false, sticky: false, duration: errCount ? 2600 : 1700 });
    } catch { /* ignore toast errors */ }



  } catch (e) {
    console.error('[StoryGuide] Summary failed:', e);
    const msg = (e && (e.message || String(e))) ? (e.message || String(e)) : 'Lỗi không xác định';
    setStatus(`Tóm tắt thất bại ❌（${msg}）`, 'err');
    showToast(`Tóm tắt thất bại ❌（${msg}）`, { kind: 'err', spinner: false, sticky: false, duration: 3200 });
  } finally {

    isSummarizing = false;
    updateButtonsEnabled();
    // avoid stuck "正在总结" toast on unexpected exits
    try { if ($('#sg_toast').hasClass('spinner')) hideToast(); } catch { /* ignore */ }
  }
}

function scheduleAutoSummary(reason = '') {
  const s = ensureSettings();
  if (!s.enabled) return;
  if (!s.summaryEnabled) return;
  const delay = clampInt(s.debounceMs, 300, 10000, DEFAULT_SETTINGS.debounceMs);
  if (summaryTimer) clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => {
    summaryTimer = null;
    maybeAutoSummary(reason).catch(() => void 0);
  }, delay);
}

async function maybeAutoSummary(reason = '') {
  const s = ensureSettings();
  if (!s.enabled) return;
  if (!s.summaryEnabled) return;
  if (isSummarizing) return;

  const ctx = SillyTavern.getContext();
  const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
  const mode = String(s.summaryCountMode || 'assistant');
  const every = clampInt(s.summaryEvery, 1, 200, 20);
  const floorNow = computeFloorCount(chat, mode);
  if (floorNow <= 0) return;
  if (floorNow % every !== 0) return;

  const meta = getSummaryMeta();
  const last = Number(meta?.lastFloor || 0);
  if (floorNow <= last) return;

  await runSummary({ reason: 'auto' });
}

// -------------------- Chỉ mục Đèn Xanh → Kích hoạt Đèn Xanh Lá (Tiêm từ khóa kích hoạt khi gửi tin nhắn) --------------------

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTriggerInjection(text, tag = 'SG_WI_TRIGGERS') {
  const t = String(text || '');
  const et = escapeRegExp(tag);
  // remove all existing injections of this tag (safe)
  const reComment = new RegExp(`\\n?\\s*`, 'g');
  const rePlain = new RegExp(`\\n?\\s*\\[${et}\\][^\\n]*\\n?`, 'g');
  return t.replace(reComment, '').replace(rePlain, '').trimEnd();
}

function buildTriggerInjection(keywords, tag = 'SG_WI_TRIGGERS', style = 'hidden') {
  const kws = sanitizeKeywords(Array.isArray(keywords) ? keywords : []);
  if (!kws.length) return '';
  if (String(style || 'hidden') === 'plain') {
    // Visible but most reliable for world-info scan.
    return `\n\n[${tag}] ${kws.join(' ')}\n`;
  }
  // Hidden comment: put each keyword on its own line, so substring match is very likely to hit.
  const body = kws.join('\n');
  return `\n\n`;
}

// -------------------- Phán định ROLL --------------------
function rollDice(sides = 100) {
  const s = Math.max(2, Number(sides) || 100);
  return Math.floor(Math.random() * s) + 1;
}

function makeNumericProxy(obj) {
  const src = (obj && typeof obj === 'object') ? obj : {};
  return new Proxy(src, {
    get(target, prop) {
      if (prop === Symbol.toStringTag) return 'NumericProxy';
      if (prop in target) {
        const v = target[prop];
        if (v && typeof v === 'object') return makeNumericProxy(v);
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    },
  });
}

function detectRollAction(text, actions) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  const list = Array.isArray(actions) ? actions : DEFAULT_ROLL_ACTIONS;
  for (const a of list) {
    const kws = Array.isArray(a?.keywords) ? a.keywords : [];
    for (const kw of kws) {
      const k = String(kw || '').toLowerCase();
      if (k && t.includes(k)) return { key: String(a.key || ''), label: String(a.label || a.key || '') };
    }
  }
  return null;
}

function extractStatusBlock(text, tagName = 'status_current_variable') {
  const t = String(text || '');
  if (!t) return '';
  const re = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  let m = null;
  let last = '';
  while ((m = re.exec(t))) {
    if (m && m[1]) last = m[1];
  }
  return String(last || '').trim();
}

function parseStatData(text, mode = 'json') {
  const raw = String(text || '').trim();
  if (!raw) return null;

  if (String(mode || 'json') === 'kv') {
    const out = { pc: {}, mods: {}, context: {} };
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^([a-zA-Z0-9_.\[\]-]+)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)\s*$/);
      if (!m) continue;
      const path = m[1];
      const val = Number(m[2]);
      if (!Number.isFinite(val)) continue;
      if (path.startsWith('pc.')) {
        const k = path.slice(3);
        out.pc[k] = val;
      } else if (path.startsWith('mods.')) {
        const k = path.slice(5);
        out.mods[k] = val;
      } else if (path.startsWith('context.')) {
        const k = path.slice(8);
        out.context[k] = val;
      }
    }
    return out;
  }

  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed;
}

function normalizeStatData(data) {
  const obj = (data && typeof data === 'object') ? data : {};
  const pc = (obj.pc && typeof obj.pc === 'object') ? obj.pc : {};
  const mods = (obj.mods && typeof obj.mods === 'object') ? obj.mods : {};
  const context = (obj.context && typeof obj.context === 'object') ? obj.context : {};
  return { pc, mods, context };
}

function buildModifierBreakdown(mods, sources) {
  const srcList = Array.isArray(sources) && sources.length
    ? sources
    : DEFAULT_ROLL_MODIFIER_SOURCES;
  const out = [];
  for (const key of srcList) {
    const raw = mods?.[key];
    let v = 0;
    if (Number.isFinite(Number(raw))) {
      v = Number(raw);
    } else if (raw && typeof raw === 'object') {
      for (const val of Object.values(raw)) {
        const n = Number(val);
        if (Number.isFinite(n)) v += n;
      }
    }
    out.push({ source: String(key), value: Number.isFinite(v) ? v : 0 });
  }
  const total = out.reduce((acc, x) => acc + (Number.isFinite(x.value) ? x.value : 0), 0);
  return { list: out, total };
}

function evaluateRollFormula(formula, ctx) {
  const expr = String(formula || '').trim();
  if (!expr) return 0;
  try {
    const fn = new Function('ctx', 'with(ctx){ return (' + expr + '); }');
    const v = fn(ctx);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function computeRollLocal(actionKey, statData, settings) {
  const s = settings || ensureSettings();
  const { pc, mods, context } = normalizeStatData(statData);
  const modBreakdown = buildModifierBreakdown(mods, safeJsonParse(s.wiRollModifierSourcesJson) || null);

  const formulas = safeJsonParse(s.wiRollFormulaJson) || DEFAULT_ROLL_FORMULAS;
  const formula = String(formulas?.[actionKey] || formulas?.default || DEFAULT_ROLL_FORMULAS.default);

  const ctx = {
    PC: makeNumericProxy(pc),
    MOD: {
      total: modBreakdown.total,
      bySource: makeNumericProxy(modBreakdown.list.reduce((acc, x) => { acc[x.source] = x.value; return acc; }, {})),
    },
    CTX: makeNumericProxy(context),
    ACTION: String(actionKey || ''),
    CLAMP: (v, lo, hi) => clampFloat(v, lo, hi, v),
  };

  const base = evaluateRollFormula(formula, ctx);
  const randWeight = clampFloat(s.wiRollRandomWeight, 0, 1, 0.3);
  const roll = rollDice(100);
  const randFactor = (roll - 50) / 50;
  const final = base + base * randWeight * randFactor;
  const threshold = 50;
  const success = final >= threshold;

  return {
    action: String(actionKey || ''),
    formula,
    base,
    mods: modBreakdown.list,
    random: { roll, weight: randWeight },
    final,
    threshold,
    success,
  };
}

function normalizeRollMods(mods, sources) {
  const srcList = Array.isArray(sources) && sources.length ? sources : DEFAULT_ROLL_MODIFIER_SOURCES;
  const map = new Map();
  for (const m of (Array.isArray(mods) ? mods : [])) {
    const key = String(m?.source || '').trim();
    if (!key) continue;
    const v = Number(m?.value);
    map.set(key, Number.isFinite(v) ? v : 0);
  }
  return srcList.map(s => ({ source: String(s), value: map.has(s) ? map.get(s) : 0 }));
}

function getRollAnalysisSummary(res) {
  if (!res || typeof res !== 'object') return '';
  const raw = res.analysisSummary ?? res.analysis_summary ?? res.explanation ?? res.reason ?? '';
  if (raw && typeof raw === 'object') {
    const pick = raw.summary ?? raw.text ?? raw.message;
    if (pick != null) return String(pick).trim();
    try { return JSON.stringify(raw); } catch { return String(raw); }
  }
  return String(raw || '').trim();
}

function buildRollPromptMessages(actionKey, statData, settings, formula, randomWeight, randomRoll) {
  const s = settings || ensureSettings();
  const sys = String(s.wiRollSystemPrompt || DEFAULT_ROLL_SYSTEM_PROMPT).trim() || DEFAULT_ROLL_SYSTEM_PROMPT;
  const tmpl = String(s.wiRollUserTemplate || DEFAULT_ROLL_USER_TEMPLATE).trim() || DEFAULT_ROLL_USER_TEMPLATE;
  const difficulty = String(s.wiRollDifficulty || 'normal');
  const statDataJson = JSON.stringify(statData || {}, null, 0);
  const modifierSourcesJson = String(s.wiRollModifierSourcesJson || JSON.stringify(DEFAULT_ROLL_MODIFIER_SOURCES));
  const user = tmpl
    .replaceAll('{{action}}', String(actionKey || ''))
    .replaceAll('{{formula}}', String(formula || ''))
    .replaceAll('{{randomWeight}}', String(randomWeight))
    .replaceAll('{{difficulty}}', difficulty)
    .replaceAll('{{randomRoll}}', String(randomRoll))
    .replaceAll('{{modifierSourcesJson}}', modifierSourcesJson)
    .replaceAll('{{statDataJson}}', statDataJson);

  const enforced = user + `\n\n` + ROLL_JSON_REQUIREMENT;
  return [
    { role: 'system', content: sys },
    { role: 'user', content: enforced },
  ];
}

function buildRollDecisionPromptMessages(userText, statData, settings, randomRoll) {
  const s = settings || ensureSettings();
  const rawSys = String(s.wiRollSystemPrompt || '').trim();
  const sys = (rawSys && rawSys !== DEFAULT_ROLL_SYSTEM_PROMPT)
    ? rawSys
    : DEFAULT_ROLL_DECISION_SYSTEM_PROMPT;
  const randomWeight = clampFloat(s.wiRollRandomWeight, 0, 1, 0.3);
  const difficulty = String(s.wiRollDifficulty || 'normal');
  const statDataJson = JSON.stringify(statData || {}, null, 0);

  const user = DEFAULT_ROLL_DECISION_USER_TEMPLATE
    .replaceAll('{{userText}}', String(userText || ''))
    .replaceAll('{{randomWeight}}', String(randomWeight))
    .replaceAll('{{difficulty}}', difficulty)
    .replaceAll('{{randomRoll}}', String(randomRoll))
    .replaceAll('{{statDataJson}}', statDataJson);

  const enforced = user + `\n\n` + ROLL_DECISION_JSON_REQUIREMENT;
  return [
    { role: 'system', content: sys },
    { role: 'user', content: enforced },
  ];
}

async function computeRollViaCustomProvider(actionKey, statData, settings, randomRoll) {
  const s = settings || ensureSettings();
  const formulas = safeJsonParse(s.wiRollFormulaJson) || DEFAULT_ROLL_FORMULAS;
  const formula = String(formulas?.[actionKey] || formulas?.default || DEFAULT_ROLL_FORMULAS.default);
  const randomWeight = clampFloat(s.wiRollRandomWeight, 0, 1, 0.3);
  const messages = buildRollPromptMessages(actionKey, statData, s, formula, randomWeight, randomRoll);

  const jsonText = await callViaCustom(
    s.wiRollCustomEndpoint,
    s.wiRollCustomApiKey,
    s.wiRollCustomModel,
    messages,
    clampFloat(s.wiRollCustomTemperature, 0, 2, 0.2),
    clampInt(s.wiRollCustomMaxTokens, 128, 200000, 512),
    clampFloat(s.wiRollCustomTopP, 0, 1, 0.95),
    !!s.wiRollCustomStream
  );

  const parsed = safeJsonParse(jsonText);
  if (!parsed || typeof parsed !== 'object') return null;
  if (!Array.isArray(parsed.mods)) return null;

  if (!Array.isArray(parsed.mods)) parsed.mods = [];
  parsed.action = String(parsed.action || actionKey || '');
  parsed.formula = String(parsed.formula || formula || '');
  return parsed;
}

async function computeRollDecisionViaCustom(userText, statData, settings, randomRoll) {
  const s = settings || ensureSettings();
  const messages = buildRollDecisionPromptMessages(userText, statData, s, randomRoll);

  const jsonText = await callViaCustom(
    s.wiRollCustomEndpoint,
    s.wiRollCustomApiKey,
    s.wiRollCustomModel,
    messages,
    clampFloat(s.wiRollCustomTemperature, 0, 2, 0.2),
    clampInt(s.wiRollCustomMaxTokens, 128, 200000, 512),
    clampFloat(s.wiRollCustomTopP, 0, 1, 0.95),
    !!s.wiRollCustomStream
  );

  const parsed = safeJsonParse(jsonText);
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.needRoll === false) return { noRoll: true };

  const res = parsed.result && typeof parsed.result === 'object' ? parsed.result : parsed;
  if (!res || typeof res !== 'object') return null;

  return res;
}

function buildRollInjectionFromResult(res, tag = 'SG_ROLL', style = 'hidden') {
  if (!res) return '';
  const action = String(res.actionLabel || res.action || '').trim();
  const formula = String(res.formula || '').trim();
  const base = Number.isFinite(Number(res.base)) ? Number(res.base) : 0;
  const final = Number.isFinite(Number(res.final)) ? Number(res.final) : 0;
  const threshold = Number.isFinite(Number(res.threshold)) ? Number(res.threshold) : null;
  const success = res.success == null ? null : !!res.success;
  const roll = Number.isFinite(Number(res.random?.roll)) ? Number(res.random?.roll) : 0;
  const weight = Number.isFinite(Number(res.random?.weight)) ? Number(res.random?.weight) : 0;
  const mods = Array.isArray(res.mods) ? res.mods : [];
  const modLine = mods.map(m => `${m.source}:${Number(m.value) >= 0 ? '+' : ''}${Number(m.value) || 0}`).join(' | ');
  const outcome = String(res.outcomeTier || '').trim() || (success == null ? 'N/A' : (success ? 'Thành công' : 'Thất bại'));

  if (String(style || 'hidden') === 'plain') {
    return `\n\n[${tag}] Hành động=${action} | Kết quả=${outcome} | Cuối cùng=${final.toFixed(2)} | Ngưỡng>=${threshold == null ? 'N/A' : threshold} | Cơ bản=${base.toFixed(2)} | Ngẫu nhiên=1d100:${roll}*${weight} | Hiệu chỉnh=${modLine} | Công thức=${formula}\n`;
  }

  return `\n\n`;
}

function getLatestAssistantText(chat, strip = true) {
  const arr = Array.isArray(chat) ? chat : [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr[i];
    if (!m) continue;
    if (m.is_system === true) continue;
    if (m.is_user === true) continue;
    const raw = String(m.mes ?? m.message ?? '');
    return strip ? stripHtml(raw) : raw;
  }
  return '';
}

function resolveStatDataFromLatestAssistant(chat, settings) {
  const s = settings || ensureSettings();
  const lastText = getLatestAssistantText(chat, false);
  const block = extractStatusBlock(lastText);
  const parsed = parseStatData(block, s.wiRollStatParseMode || 'json');
  return { statData: parsed, rawText: block };
}

function resolveStatDataFromVariableStore(settings) {
  const s = settings || ensureSettings();
  const key = String(s.wiRollStatVarName || 'stat_data').trim();
  if (!key) return { statData: null, rawText: '' };
  const ctx = SillyTavern.getContext?.() ?? {};

  // Mở rộng tất cả các nguồn biến có thể, sắp xếp theo độ ưu tiên
  const sources = [
    // Ưu tiên lấy từ context (giá trị mới nhất)
    ctx?.variables,
    ctx?.chatMetadata?.variables,
    ctx?.chatMetadata,
    // Kho biến toàn cục
    globalThis?.SillyTavern?.chatVariables,
    globalThis?.SillyTavern?.variables,
    globalThis?.variables,
    globalThis?.chatVariables,
    // Biến có thể lưu trong extension_settings
    ctx?.extensionSettings?.variables,
    // Biến trên đối tượng window
    window?.variables,
    window?.chatVariables,
  ].filter(Boolean);

  let raw = null;
  for (const src of sources) {
    if (src && Object.prototype.hasOwnProperty.call(src, key)) {
      raw = src[key];
      break;
    }
  }

  // Nếu các nguồn trên đều không tìm thấy, thử đọc từ trường extra của tin nhắn cuối cùng trong mảng chat
  if (raw == null && Array.isArray(ctx?.chat)) {
    for (let i = ctx.chat.length - 1; i >= Math.max(0, ctx.chat.length - 5); i--) {
      const msg = ctx.chat[i];
      if (msg?.extra?.variables && Object.prototype.hasOwnProperty.call(msg.extra.variables, key)) {
        raw = msg.extra.variables[key];
        break;
      }
      if (msg?.variables && Object.prototype.hasOwnProperty.call(msg.variables, key)) {
        raw = msg.variables[key];
        break;
      }
    }
  }

  if (raw == null) return { statData: null, rawText: '' };
  if (typeof raw === 'string') {
    const parsed = parseStatData(raw, s.wiRollStatParseMode || 'json');
    return { statData: parsed, rawText: raw };
  }
  if (typeof raw === 'object') {
    return { statData: raw, rawText: JSON.stringify(raw) };
  }
  return { statData: null, rawText: '' };
}

async function resolveStatDataFromTemplate(settings) {
  const s = settings || ensureSettings();
  const tpl = `<status_current_variable>\n{{format_message_variable::stat_data}}\n</status_current_variable>`;
  const ctx = SillyTavern.getContext?.() ?? {};
  const fns = [
    ctx?.renderTemplateAsync,
    ctx?.renderTemplate,
    ctx?.formatMessageVariables,
    ctx?.replaceMacros,
    globalThis?.renderTemplate,
    globalThis?.formatMessageVariables,
    globalThis?.replaceMacros,
  ].filter(Boolean);
  let rendered = '';
  for (const fn of fns) {
    try {
      const out = await fn(tpl);
      if (typeof out === 'string' && out.trim()) {
        rendered = out;
        break;
      }
    } catch { /* ignore */ }
  }
  if (!rendered || rendered.includes('{{format_message_variable::stat_data}}')) {
    return { statData: null, rawText: '' };
  }
  const block = extractStatusBlock(rendered);
  const parsed = parseStatData(block, s.wiRollStatParseMode || 'json');
  return { statData: parsed, rawText: block };
}

/**
 * Cách đọc biến ổn định nhất: Đọc biến qua lệnh gạch chéo /getvar
 * Do hệ thống biến SillyTavern có thể tồn tại vấn đề bộ đệm hoặc không đồng bộ ngữ cảnh,
 * sử dụng slash command có thể đảm bảo đọc được giá trị biến mới nhất
 */
async function resolveStatDataViaSlashCommand(settings) {
  const s = settings || ensureSettings();
  const key = String(s.wiRollStatVarName || 'stat_data').trim();
  if (!key) return { statData: null, rawText: '' };

  try {
    // Thử dùng lệnh /getvar để đọc biến (cách ổn định nhất)
    const result = await execSlash(`/getvar ${key}`);
    const raw = slashOutputToText(result);

    if (!raw || raw.trim() === '' || raw.trim() === 'undefined' || raw.trim() === 'null') {
      return { statData: null, rawText: '' };
    }

    // Phân tích nội dung biến
    if (typeof raw === 'string') {
      // Thử phân tích JSON
      const parsed = parseStatData(raw, s.wiRollStatParseMode || 'json');
      if (parsed) {
        return { statData: parsed, rawText: raw };
      }
    }

    return { statData: null, rawText: raw };
  } catch (e) {
    // Khi lệnh /getvar thất bại thì xử lý im lặng, lùi về các phương pháp khác
    console.debug('[StoryGuide] resolveStatDataViaSlashCommand failed:', e);
    return { statData: null, rawText: '' };
  }
}

/**
 * Mở rộng đọc biến: Thử đọc biến từ tin nhắn mới nhất trong mảng chat (đọc trực tiếp DOM)
 * Làm phương án lùi bổ sung cho phương pháp lưu trữ biến và mẫu
 */
function resolveStatDataFromChatDOM(settings) {
  const s = settings || ensureSettings();
  const key = String(s.wiRollStatVarName || 'stat_data').trim();
  if (!key) return { statData: null, rawText: '' };

  try {
    // Thử tìm khối trạng thái gần nhất từ DOM
    const chatContainer = document.querySelector('#chat, .chat, [id*="chat"]');
    if (!chatContainer) return { statData: null, rawText: '' };

    // Tìm tất cả các khối tin nhắn
    const messages = chatContainer.querySelectorAll('.mes, [class*="message"]');
    if (!messages.length) return { statData: null, rawText: '' };

    // Tìm tin nhắn chứa dữ liệu trạng thái từ sau ra trước
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 10); i--) {
      const msg = messages[i];
      if (!msg) continue;

      // Bỏ qua tin nhắn người dùng
      const isUser = msg.classList.contains('user_mes') || msg.dataset.isUser === 'true';
      if (isUser) continue;

      const textEl = msg.querySelector('.mes_text, .message-text, [class*="mes_text"]');
      if (!textEl) continue;

      const text = textEl.innerText || textEl.textContent || '';
      if (!text) continue;

      // Thử trích xuất khối trạng thái
      const block = extractStatusBlock(text);
      if (block) {
        const parsed = parseStatData(block, s.wiRollStatParseMode || 'json');
        if (parsed) {
          return { statData: parsed, rawText: block };
        }
      }
    }

    return { statData: null, rawText: '' };
  } catch (e) {
    console.debug('[StoryGuide] resolveStatDataFromChatDOM failed:', e);
    return { statData: null, rawText: '' };
  }
}

/**
 * Tìm kiếm tổng hợp dữ liệu biến: Thử nhiều nguồn để đảm bảo đọc được dữ liệu mới nhất
 * Thử theo thứ tự ưu tiên:
 * 1. Lệnh gạch chéo /getvar (ổn định nhất)
 * 2. Đối tượng lưu trữ biến
 * 3. Kết xuất mẫu
 * 4. Đọc từ DOM
 * 5. Đọc từ phản hồi AI mới nhất
 */
async function resolveStatDataComprehensive(chat, settings) {
  const s = settings || ensureSettings();

  // Cách 1: Sử dụng lệnh gạch chéo /getvar (ổn định nhất)
  try {
    const { statData, rawText } = await resolveStatDataViaSlashCommand(s);
    if (statData) {
      console.debug('[StoryGuide] Variable loaded via /getvar slash command');
      return { statData, rawText, source: 'slashCommand' };
    }
  } catch { /* continue */ }

  // Cách 2: Đọc từ đối tượng lưu trữ biến
  try {
    const { statData, rawText } = resolveStatDataFromVariableStore(s);
    if (statData) {
      console.debug('[StoryGuide] Variable loaded via variable store');
      return { statData, rawText, source: 'variableStore' };
    }
  } catch { /* continue */ }

  // Cách 3: Đọc qua kết xuất mẫu
  try {
    const { statData, rawText } = await resolveStatDataFromTemplate(s);
    if (statData) {
      console.debug('[StoryGuide] Variable loaded via template rendering');
      return { statData, rawText, source: 'template' };
    }
  } catch { /* continue */ }

  // Cách 4: Đọc từ DOM
  try {
    const { statData, rawText } = resolveStatDataFromChatDOM(s);
    if (statData) {
      console.debug('[StoryGuide] Variable loaded via DOM');
      return { statData, rawText, source: 'dom' };
    }
  } catch { /* continue */ }

  // Cách 5: Đọc từ phản hồi AI mới nhất
  try {
    const { statData, rawText } = resolveStatDataFromLatestAssistant(chat, s);
    if (statData) {
      console.debug('[StoryGuide] Variable loaded via latest assistant message');
      return { statData, rawText, source: 'latestAssistant' };
    }
  } catch { /* continue */ }

  return { statData: null, rawText: '', source: null };
}

async function maybeInjectRollResult(reason = 'msg_sent') {
  const s = ensureSettings();
  if (!s.wiRollEnabled) return;

  const ctx = SillyTavern.getContext();
  const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
  if (!chat.length) return;

  const modalOpen = $('#sg_modal_backdrop').is(':visible');
  const shouldLog = modalOpen || s.wiRollDebugLog;
  const logStatus = (msg, kind = 'info') => {
    if (!shouldLog) return;
    if (modalOpen) setStatus(msg, kind);
    else showToast(msg, { kind, spinner: false, sticky: false, duration: 2200 });
  };

  const last = chat[chat.length - 1];
  if (!last || last.is_user !== true) return; // only on user send
  let lastText = String(last.mes ?? last.message ?? '').trim();
  if (!lastText || lastText.startsWith('/')) return;
  const rollTag = String(s.wiRollTag || 'SG_ROLL').trim() || 'SG_ROLL';
  if (lastText.includes(rollTag)) return;
  lastText = stripTriggerInjection(lastText, rollTag);

  const source = String(s.wiRollStatSource || 'variable');
  let statData = null;
  let varSource = '';
  if (source === 'latest') {
    ({ statData } = resolveStatDataFromLatestAssistant(chat, s));
    varSource = 'latest';
  } else if (source === 'template') {
    ({ statData } = await resolveStatDataFromTemplate(s));
    varSource = 'template';
    if (!statData) {
      ({ statData } = await resolveStatDataViaSlashCommand(s));
      varSource = 'slashCommand';
    }
    if (!statData) {
      ({ statData } = resolveStatDataFromVariableStore(s));
      varSource = 'variableStore';
    }
    if (!statData) {
      ({ statData } = resolveStatDataFromLatestAssistant(chat, s));
      varSource = 'latestAssistant';
    }
  } else {
    // Mặc định dùng phương pháp tổng hợp (ổn định nhất)
    const result = await resolveStatDataComprehensive(chat, s);
    statData = result.statData;
    varSource = result.source || '';
  }
  if (!statData) {
    const name = String(s.wiRollStatVarName || 'stat_data').trim() || 'stat_data';
    logStatus(`ROLL không kích hoạt: Không đọc được biến（${name}）`, 'warn');
    return;
  }
  if (s.wiRollDebugLog && varSource) {
    console.debug(`[StoryGuide] Nguồn đọc biến ROLL: ${varSource}`);
  }

  const randomRoll = rollDice(100);
  let res = null;
  const canUseCustom = String(s.wiRollProvider || 'custom') === 'custom' && String(s.wiRollCustomEndpoint || '').trim();
  if (canUseCustom) {
    try {
      res = await computeRollDecisionViaCustom(lastText, statData, s, randomRoll);
      if (res?.noRoll) {
        logStatus('ROLL không kích hoạt: AI phán định không cần phán định', 'info');
        return;
      }
    } catch (e) {
      console.warn('[StoryGuide] roll custom provider failed; fallback to local', e);
    }
  }
  if (!res) {
    logStatus('ROLL không kích hoạt: AI phán định thất bại hoặc không có kết quả', 'warn');
    return;
  }

  if (res) {
    if (!Array.isArray(res.mods)) res.mods = [];
    res.actionLabel = res.actionLabel || res.action || '';
    res.formula = res.formula || '';
    if (!res.random) res.random = { roll: randomRoll, weight: clampFloat(s.wiRollRandomWeight, 0, 1, 0.3) };
    if (res.final == null && Number.isFinite(Number(res.base))) {
      const randWeight = Number(res.random?.weight) || clampFloat(s.wiRollRandomWeight, 0, 1, 0.3);
      const randRoll = Number(res.random?.roll) || randomRoll;
      res.final = Number(res.base) + Number(res.base) * randWeight * ((randRoll - 50) / 50);
    }
    if (res.success == null && Number.isFinite(Number(res.final)) && Number.isFinite(Number(res.threshold))) {
      res.success = Number(res.final) >= Number(res.threshold);
    }
    const summary = getRollAnalysisSummary(res);
    if (summary) {
      appendRollLog({
        ts: Date.now(),
        action: res.actionLabel || res.action,
        outcomeTier: res.outcomeTier,
        summary,
        final: res.final,
        success: res.success,
        userText: lastText,
      });
    }
    const style = String(s.wiRollInjectStyle || 'hidden').trim() || 'hidden';
    const rollText = buildRollInjectionFromResult(res, rollTag, style);
    if (rollText) {
      const cleaned = stripTriggerInjection(last.mes ?? last.message ?? '', rollTag);
      last.mes = cleaned + rollText;
      logStatus('ROLL đã tiêm: Phán định hoàn tất', 'ok');
    }
  }

  // try save
  try {
    if (typeof ctx.saveChatDebounced === 'function') ctx.saveChatDebounced();
    else if (typeof ctx.saveChat === 'function') ctx.saveChat();
  } catch { /* ignore */ }
}

async function buildRollInjectionForText(userText, chat, settings, logStatus) {
  const s = settings || ensureSettings();
  const rollTag = String(s.wiRollTag || 'SG_ROLL').trim() || 'SG_ROLL';
  if (String(userText || '').includes(rollTag)) return null;
  const source = String(s.wiRollStatSource || 'variable');
  let statData = null;
  let varSource = '';
  if (source === 'latest') {
    ({ statData } = resolveStatDataFromLatestAssistant(chat, s));
    varSource = 'latest';
  } else if (source === 'template') {
    ({ statData } = await resolveStatDataFromTemplate(s));
    varSource = 'template';
    if (!statData) {
      ({ statData } = await resolveStatDataViaSlashCommand(s));
      varSource = 'slashCommand';
    }
    if (!statData) {
      ({ statData } = resolveStatDataFromVariableStore(s));
      varSource = 'variableStore';
    }
    if (!statData) {
      ({ statData } = resolveStatDataFromLatestAssistant(chat, s));
      varSource = 'latestAssistant';
    }
  } else {
    // Mặc định dùng phương pháp tổng hợp (ổn định nhất)
    const result = await resolveStatDataComprehensive(chat, s);
    statData = result.statData;
    varSource = result.source || '';
  }
  if (!statData) {
    const name = String(s.wiRollStatVarName || 'stat_data').trim() || 'stat_data';
    logStatus?.(`ROLL không kích hoạt: Không đọc được biến（${name}）`, 'warn');
    return null;
  }
  if (s.wiRollDebugLog && varSource) {
    console.debug(`[StoryGuide] buildRollInjectionForText Nguồn đọc biến: ${varSource}`);
  }

  const randomRoll = rollDice(100);
  let res = null;
  const canUseCustom = String(s.wiRollProvider || 'custom') === 'custom' && String(s.wiRollCustomEndpoint || '').trim();
  if (canUseCustom) {
    try {
      res = await computeRollDecisionViaCustom(userText, statData, s, randomRoll);
      if (res?.noRoll) {
        logStatus?.('ROLL không kích hoạt: AI phán định không cần phán định', 'info');
        return null;
      }
    } catch (e) {
      console.warn('[StoryGuide] roll custom provider failed; fallback to local', e);
    }
  }
  if (!res) {
    logStatus?.('ROLL không kích hoạt: AI phán định thất bại hoặc không có kết quả', 'warn');
    return null;
  }
  if (!res) return null;

  if (!Array.isArray(res.mods)) res.mods = [];
  res.actionLabel = res.actionLabel || res.action || '';
  res.formula = res.formula || '';
  if (!res.random) res.random = { roll: randomRoll, weight: clampFloat(s.wiRollRandomWeight, 0, 1, 0.3) };
  if (res.final == null && Number.isFinite(Number(res.base))) {
    const randWeight = Number(res.random?.weight) || clampFloat(s.wiRollRandomWeight, 0, 1, 0.3);
    const randRoll = Number(res.random?.roll) || randomRoll;
    res.final = Number(res.base) + Number(res.base) * randWeight * ((randRoll - 50) / 50);
  }
  if (res.success == null && Number.isFinite(Number(res.final)) && Number.isFinite(Number(res.threshold))) {
    res.success = Number(res.final) >= Number(res.threshold);
  }
  const summary = getRollAnalysisSummary(res);
  if (summary) {
    appendRollLog({
      ts: Date.now(),
      action: res.actionLabel || res.action,
      outcomeTier: res.outcomeTier,
      summary,
      final: res.final,
      success: res.success,
      userText: String(userText || ''),
    });
  }
  if (!res.random) res.random = { roll: randomRoll, weight: clampFloat(s.wiRollRandomWeight, 0, 1, 0.3) };
  const style = String(s.wiRollInjectStyle || 'hidden').trim() || 'hidden';
  const rollText = buildRollInjectionFromResult(res, rollTag, style);
  if (rollText) logStatus?.('ROLL đã tiêm: Phán định hoàn tất', 'ok');
  return rollText || null;
}

async function buildTriggerInjectionForText(userText, chat, settings, logStatus) {
  const s = settings || ensureSettings();
  if (!s.wiTriggerEnabled) return null;

  const startAfter = clampInt(s.wiTriggerStartAfterAssistantMessages, 0, 200000, 0);
  if (startAfter > 0) {
    const assistantFloors = computeFloorCount(chat, 'assistant');
    if (assistantFloors < startAfter) {
      logStatus?.(`Chỉ mục không kích hoạt: Số tầng AI chưa đủ ${assistantFloors}/${startAfter}`, 'info');
      return null;
    }
  }

  const lookback = clampInt(s.wiTriggerLookbackMessages, 5, 120, 20);
  const tagForStrip = String(s.wiTriggerTag || 'SG_WI_TRIGGERS').trim() || 'SG_WI_TRIGGERS';
  const rollTag = String(s.wiRollTag || 'SG_ROLL').trim() || 'SG_ROLL';
  const recentText = buildRecentChatText(chat, lookback, true, [tagForStrip, rollTag]);
  if (!recentText) return null;

  const candidates = collectBlueIndexCandidates();
  if (!candidates.length) return null;

  const maxEntries = clampInt(s.wiTriggerMaxEntries, 1, 20, 4);
  const minScore = clampFloat(s.wiTriggerMinScore, 0, 1, 0.08);
  const includeUser = !!s.wiTriggerIncludeUserMessage;
  const userWeight = clampFloat(s.wiTriggerUserMessageWeight, 0, 10, 1.6);
  const matchMode = String(s.wiTriggerMatchMode || 'local');

  let picked = [];
  if (matchMode === 'llm') {
    try {
      picked = await pickRelevantIndexEntriesLLM(recentText, userText, candidates, maxEntries, includeUser, userWeight);
    } catch (e) {
      console.warn('[StoryGuide] index LLM failed; fallback to local similarity', e);
      picked = pickRelevantIndexEntries(recentText, userText, candidates, maxEntries, minScore, includeUser, userWeight);
    }
  } else {
    picked = pickRelevantIndexEntries(recentText, userText, candidates, maxEntries, minScore, includeUser, userWeight);
  }
  if (!picked.length) return null;

  const maxKeywords = clampInt(s.wiTriggerMaxKeywords, 1, 200, 24);
  const kwSet = new Set();
  const pickedNames = [];
  for (const { e } of picked) {
    const name = String(e.title || '').trim() || 'Mục';
    pickedNames.push(name);
    for (const k of (Array.isArray(e.keywords) ? e.keywords : [])) {
      const kk = String(k || '').trim();
      if (!kk) continue;
      kwSet.add(kk);
      if (kwSet.size >= maxKeywords) break;
    }
    if (kwSet.size >= maxKeywords) break;
  }
  const keywords = Array.from(kwSet);
  if (!keywords.length) return null;

  const style = String(s.wiTriggerInjectStyle || 'hidden').trim() || 'hidden';
  const injected = buildTriggerInjection(keywords, tagForStrip, style);
  if (injected) logStatus?.(`Chỉ mục đã tiêm: ${pickedNames.slice(0, 4).join('、')}${pickedNames.length > 4 ? '…' : ''}`, 'ok');
  return injected || null;
}

function installRollPreSendHook() {
  if (window.__storyguide_roll_presend_installed) return;
  window.__storyguide_roll_presend_installed = true;
  let guard = false;
  let preSendPromise = null;

  function findTextarea() {
    return document.querySelector('#send_textarea, textarea#send_textarea, .send_textarea, textarea.send_textarea');
  }

  function findForm(textarea) {
    if (textarea && textarea.closest) {
      const f = textarea.closest('form');
      if (f) return f;
    }
    return document.getElementById('chat_input_form') || null;
  }

  function findSendButton(form) {
    if (form) {
      const btn = form.querySelector('button[type="submit"]');
      if (btn) return btn;
    }
    return document.querySelector('#send_button, #send_but, button.send_button, .send_button');
  }

  function buildPreSendLogger(s) {
    const modalOpen = $('#sg_modal_backdrop').is(':visible');
    const shouldLog = modalOpen || s.wiRollDebugLog || s.wiTriggerDebugLog;
    if (!shouldLog) return null;
    return (msg, kind = 'info') => {
      if (modalOpen) setStatus(msg, kind);
      else showToast(msg, { kind, spinner: false, sticky: false, duration: 2200 });
    };
  }

  async function applyPreSendInjectionsToText(raw, chat, s, logStatus) {
    const text = String(raw ?? '').trim();
    if (!text || text.startsWith('/')) return null;

    const rollText = s.wiRollEnabled ? await buildRollInjectionForText(text, chat, s, logStatus) : null;
    const triggerText = s.wiTriggerEnabled ? await buildTriggerInjectionForText(text, chat, s, logStatus) : null;
    if (!rollText && !triggerText) return null;

    let cleaned = stripTriggerInjection(text, String(s.wiRollTag || 'SG_ROLL').trim() || 'SG_ROLL');
    cleaned = stripTriggerInjection(cleaned, String(s.wiTriggerTag || 'SG_WI_TRIGGERS').trim() || 'SG_WI_TRIGGERS');
    return cleaned + (rollText || '') + (triggerText || '');
  }

  function findMessageArg(args) {
    if (!Array.isArray(args) || !args.length) return null;
    if (typeof args[0] === 'string') return { type: 'string', index: 0 };
    if (args[0] && typeof args[0] === 'object') {
      if (typeof args[0].mes === 'string') return { type: 'object', index: 0, key: 'mes' };
      if (typeof args[0].message === 'string') return { type: 'object', index: 0, key: 'message' };
    }
    if (typeof args[1] === 'string') return { type: 'string', index: 1 };
    return null;
  }

  async function applyPreSendInjectionsToArgs(args, chat, s, logStatus) {
    const msgArg = findMessageArg(args);
    if (!msgArg) return false;
    const raw = msgArg.type === 'string' ? args[msgArg.index] : args[msgArg.index]?.[msgArg.key];
    const injected = await applyPreSendInjectionsToText(raw, chat, s, logStatus);
    if (!injected) return false;
    if (msgArg.type === 'string') args[msgArg.index] = injected;
    else args[msgArg.index][msgArg.key] = injected;
    return true;
  }

  async function runPreSendInjections(textarea) {
    const s = ensureSettings();
    if (!s.wiRollEnabled && !s.wiTriggerEnabled) return false;
    const raw = String(textarea?.value ?? '');
    const logStatus = buildPreSendLogger(s);
    const ctx = SillyTavern.getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const injected = await applyPreSendInjectionsToText(raw, chat, s, logStatus);
    if (injected && textarea) {
      textarea.value = injected;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  async function ensurePreSend(textarea) {
    if (preSendPromise) return preSendPromise;
    preSendPromise = (async () => {
      await runPreSendInjections(textarea);
    })();
    try {
      await preSendPromise;
    } finally {
      preSendPromise = null;
    }
  }

  function triggerSend(form) {
    const btn = findSendButton(form);
    if (btn && typeof btn.click === 'function') {
      btn.click();
      return;
    }
    if (form && typeof form.requestSubmit === 'function') {
      form.requestSubmit();
      return;
    }
    if (form && typeof form.dispatchEvent === 'function') {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  }

  document.addEventListener('submit', async (e) => {
    const form = e.target;
    const textarea = findTextarea();
    if (!form || !textarea || !form.contains(textarea)) return;
    if (guard) return;
    const s = ensureSettings();
    if (!s.wiRollEnabled && !s.wiTriggerEnabled) return;

    e.preventDefault();
    e.stopPropagation();
    guard = true;

    try {
      await ensurePreSend(textarea);
    } finally {
      guard = false;
      window.__storyguide_presend_guard = true;
      try {
        triggerSend(form);
      } finally {
        window.__storyguide_presend_guard = false;
      }
    }
  }, true);

  document.addEventListener('keydown', async (e) => {
    const textarea = findTextarea();
    if (!textarea || e.target !== textarea) return;
    if (e.key !== 'Enter') return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    const s = ensureSettings();
    if (!s.wiRollEnabled && !s.wiTriggerEnabled) return;
    if (guard) return;

    e.preventDefault();
    e.stopPropagation();
    guard = true;

    try {
      await ensurePreSend(textarea);
    } finally {
      guard = false;
      const form = findForm(textarea);
      window.__storyguide_presend_guard = true;
      try {
        triggerSend(form);
      } finally {
        window.__storyguide_presend_guard = false;
      }
    }
  }, true);

  async function handleSendButtonEvent(e) {
    const btn = e.target && e.target.closest
      ? e.target.closest('#send_but, #send_button, button.send_button, .send_button')
      : null;
    if (!btn) return;
    if (guard || window.__storyguide_presend_guard) return;
    const s = ensureSettings();
    if (!s.wiRollEnabled && !s.wiTriggerEnabled) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    guard = true;

    try {
      const textarea = findTextarea();
      if (textarea) await ensurePreSend(textarea);
    } finally {
      guard = false;
      window.__storyguide_presend_guard = true;
      try {
        if (typeof btn.click === 'function') btn.click();
      } finally {
        window.__storyguide_presend_guard = false;
      }
    }
  }

  document.addEventListener('click', handleSendButtonEvent, true);

  function wrapSendFunction(obj, key) {
    if (!obj || typeof obj[key] !== 'function' || obj[key].__sg_wrapped) return;
    const original = obj[key];
    obj[key] = async function (...args) {
      if (window.__storyguide_presend_guard) return original.apply(this, args);
      const s = ensureSettings();
      if (!s.wiRollEnabled && !s.wiTriggerEnabled) return original.apply(this, args);
      const textarea = findTextarea();
      if (textarea) {
        await ensurePreSend(textarea);
      } else {
        const logStatus = buildPreSendLogger(s);
        const ctx = SillyTavern.getContext?.() ?? {};
        const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
        await applyPreSendInjectionsToArgs(args, chat, s, logStatus);
      }
      window.__storyguide_presend_guard = true;
      try {
        return await original.apply(this, args);
      } finally {
        window.__storyguide_presend_guard = false;
      }
    };
    obj[key].__sg_wrapped = true;
  }

  function installSendWrappers() {
    const ctx = SillyTavern.getContext?.() ?? {};
    const candidates = ['sendMessage', 'sendUserMessage', 'sendUserMessageInChat', 'submitUserMessage'];
    for (const k of candidates) wrapSendFunction(ctx, k);
    for (const k of candidates) wrapSendFunction(SillyTavern, k);
    for (const k of candidates) wrapSendFunction(globalThis, k);
  }

  installSendWrappers();
  setInterval(installSendWrappers, 2000);
}

function tokenizeForSimilarity(text) {
  const s = String(text || '').toLowerCase();
  const tokens = new Map();

  function add(tok, w = 1) {
    if (!tok) return;
    const k = String(tok).trim();
    if (!k) return;
    tokens.set(k, (tokens.get(k) || 0) + w);
  }

  // latin words
  const latin = s.match(/[a-z0-9_]{2,}/g) || [];
  for (const w of latin) add(w, 1);

  // CJK sequences -> bigrams (better than single-char)
  const cjkSeqs = s.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const seq of cjkSeqs) {
    // include short full seq for exact hits
    if (seq.length <= 6) add(seq, 2);
    for (let i = 0; i < seq.length - 1; i++) {
      add(seq.slice(i, i + 2), 1);
    }
  }

  return tokens;
}

function cosineSimilarity(mapA, mapB) {
  if (!mapA?.size || !mapB?.size) return 0;
  // iterate smaller
  const small = mapA.size <= mapB.size ? mapA : mapB;
  const large = mapA.size <= mapB.size ? mapB : mapA;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of mapA.values()) normA += v * v;
  for (const v of mapB.values()) normB += v * v;
  if (!normA || !normB) return 0;
  for (const [k, va] of small.entries()) {
    const vb = large.get(k);
    if (vb) dot += va * vb;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildRecentChatText(chat, lookback, excludeLast = true, stripTags = '') {
  const tags = Array.isArray(stripTags) ? stripTags : (stripTags ? [stripTags] : []);
  const msgs = [];
  const arr = Array.isArray(chat) ? chat : [];
  let i = arr.length - 1;
  if (excludeLast) i -= 1;
  for (; i >= 0 && msgs.length < lookback; i--) {
    const m = arr[i];
    if (!m) continue;
    if (m.is_system === true) continue;
    let t = stripHtml(m.mes ?? m.message ?? '');
    if (tags.length) {
      for (const tag of tags) {
        if (tag) t = stripTriggerInjection(t, tag);
      }
    }
    if (t) msgs.push(t);
  }
  return msgs.reverse().join('\n');
}

function getBlueIndexEntriesFast() {
  const s = ensureSettings();
  const mode = String(s.wiBlueIndexMode || 'live');
  if (mode !== 'live') return (Array.isArray(s.summaryBlueIndex) ? s.summaryBlueIndex : []);

  const file = pickBlueIndexFileName();
  if (!file) return (Array.isArray(s.summaryBlueIndex) ? s.summaryBlueIndex : []);

  const minSec = clampInt(s.wiBlueIndexMinRefreshSec, 5, 600, 20);
  const now = Date.now();
  const ageMs = now - Number(blueIndexLiveCache.loadedAt || 0);
  const need = (blueIndexLiveCache.file !== file) || ageMs > (minSec * 1000);

  // Lưu ý: Để tránh chặn MESSAGE_SENT nhiều nhất có thể (đảm bảo tiêm từ khóa kích hoạt hoàn tất trước khi tạo), ở đây không await.
  // Nếu cần làm mới, hãy kéo một lần ở chế độ nền, tin nhắn tiếp theo sẽ sử dụng chỉ mục mới nhất.
  if (need) {
    ensureBlueIndexLive(false).catch(() => void 0);
  }

  const live = Array.isArray(blueIndexLiveCache.entries) ? blueIndexLiveCache.entries : [];
  if (live.length) return live;
  return (Array.isArray(s.summaryBlueIndex) ? s.summaryBlueIndex : []);
}

function collectBlueIndexCandidates() {
  const s = ensureSettings();
  const meta = getSummaryMeta();
  const out = [];
  const seen = new Set();

  const fromMeta = Array.isArray(meta?.history) ? meta.history : [];
  for (const r of fromMeta) {
    const title = String(r?.title || '').trim();
    const summary = String(r?.summary || '').trim();
    const keywords = sanitizeKeywords(r?.keywords);
    if (!summary) continue;
    const key = `${title}__${summary.slice(0, 24)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: title || (keywords[0] ? `Mục: ${keywords[0]}` : 'Mục'), summary, keywords });
  }

  const fromImported = getBlueIndexEntriesFast();
  for (const r of fromImported) {
    const title = String(r?.title || '').trim();
    const summary = String(r?.summary || '').trim();
    const keywords = sanitizeKeywords(r?.keywords);
    if (!summary) continue;
    const key = `${title}__${summary.slice(0, 24)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: title || (keywords[0] ? `Mục: ${keywords[0]}` : 'Mục'), summary, keywords });
  }

  return out;
}

function pickRelevantIndexEntries(recentText, userText, candidates, maxEntries, minScore, includeUser = true, userWeight = 1.0) {
  const recentVec = tokenizeForSimilarity(recentText);
  if (includeUser && userText) {
    const uvec = tokenizeForSimilarity(userText);
    const w = Number(userWeight);
    const mul = Number.isFinite(w) ? Math.max(0, Math.min(10, w)) : 1;
    for (const [k, v] of uvec.entries()) {
      recentVec.set(k, (recentVec.get(k) || 0) + v * mul);
    }
  }
  const scored = [];
  for (const e of candidates) {
    const txt = `${e.title || ''}\n${e.summary || ''}\n${(Array.isArray(e.keywords) ? e.keywords.join(' ') : '')}`;
    const vec = tokenizeForSimilarity(txt);
    const score = cosineSimilarity(recentVec, vec);
    if (score >= minScore) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxEntries);
}

function buildIndexPromptMessages(recentText, userText, candidatesForModel, maxPick) {
  const s = ensureSettings();
  const sys = String(s.wiIndexSystemPrompt || DEFAULT_INDEX_SYSTEM_PROMPT).trim() || DEFAULT_INDEX_SYSTEM_PROMPT;
  const tmpl = String(s.wiIndexUserTemplate || DEFAULT_INDEX_USER_TEMPLATE).trim() || DEFAULT_INDEX_USER_TEMPLATE;

  const candidatesJson = JSON.stringify(candidatesForModel, null, 0);

  const user = tmpl
    .replaceAll('{{userMessage}}', String(userText || ''))
    .replaceAll('{{recentText}}', String(recentText || ''))
    .replaceAll('{{candidates}}', candidatesJson)
    .replaceAll('{{maxPick}}', String(maxPick));

  const enforced = user + `

` + INDEX_JSON_REQUIREMENT.replaceAll('maxPick', String(maxPick));

  return [
    { role: 'system', content: sys },
    { role: 'user', content: enforced },
  ];
}

async function pickRelevantIndexEntriesLLM(recentText, userText, candidates, maxEntries, includeUser, userWeight) {
  const s = ensureSettings();

  const topK = clampInt(s.wiIndexPrefilterTopK, 5, 80, 24);
  const candMaxChars = clampInt(s.wiIndexCandidateMaxChars, 120, 2000, 420);

  const pre = pickRelevantIndexEntries(
    recentText,
    userText,
    candidates,
    Math.max(topK, maxEntries),
    0,
    includeUser,
    userWeight
  );

  const shortlist = (pre.length ? pre : candidates.map(e => ({ e, score: 0 }))).slice(0, topK);

  const candidatesForModel = shortlist.map((x, i) => {
    const e = x.e || x;
    const title = String(e.title || '').trim();
    const summary0 = String(e.summary || '').trim();
    const summary = summary0.length > candMaxChars ? (summary0.slice(0, candMaxChars) + '…') : summary0;
    const kws = Array.isArray(e.keywords) ? e.keywords.slice(0, 24) : [];
    return { id: i, title: title || 'Mục', summary, keywords: kws };
  });

  const messages = buildIndexPromptMessages(recentText, userText, candidatesForModel, maxEntries);

  let jsonText = '';
  if (String(s.wiIndexProvider || 'st') === 'custom') {
    jsonText = await callViaCustom(
      s.wiIndexCustomEndpoint,
      s.wiIndexCustomApiKey,
      s.wiIndexCustomModel,
      messages,
      clampFloat(s.wiIndexTemperature, 0, 2, 0.2),
      clampInt(s.wiIndexCustomMaxTokens, 128, 200000, 1024),
      clampFloat(s.wiIndexTopP, 0, 1, 0.95),
      !!s.wiIndexCustomStream
    );
    const parsedTry = safeJsonParse(jsonText);
    if (!parsedTry || !Array.isArray(parsedTry?.pickedIds)) {
      try {
        jsonText = await fallbackAskJsonCustom(
          s.wiIndexCustomEndpoint,
          s.wiIndexCustomApiKey,
          s.wiIndexCustomModel,
          messages,
          clampFloat(s.wiIndexTemperature, 0, 2, 0.2),
          clampInt(s.wiIndexCustomMaxTokens, 128, 200000, 1024),
          clampFloat(s.wiIndexTopP, 0, 1, 0.95),
          !!s.wiIndexCustomStream
        );
      } catch { /* ignore */ }
    }
  } else {
    const schema = {
      type: 'object',
      properties: { pickedIds: { type: 'array', items: { type: 'integer' } } },
      required: ['pickedIds'],
    };
    jsonText = await callViaSillyTavern(messages, schema, clampFloat(s.wiIndexTemperature, 0, 2, 0.2));
    if (typeof jsonText !== 'string') jsonText = JSON.stringify(jsonText ?? '');
    const parsedTry = safeJsonParse(jsonText);
    if (!parsedTry || !Array.isArray(parsedTry?.pickedIds)) {
      jsonText = await fallbackAskJson(messages, clampFloat(s.wiIndexTemperature, 0, 2, 0.2));
    }
  }

  const parsed = safeJsonParse(jsonText);
  const pickedIds = Array.isArray(parsed?.pickedIds) ? parsed.pickedIds : [];
  const uniq = Array.from(new Set(pickedIds.map(x => Number(x)).filter(n => Number.isFinite(n))));

  const picked = [];
  for (const id of uniq) {
    const origin = shortlist[id]?.e || null;
    if (origin) picked.push({ e: origin, score: Number(shortlist[id]?.score || 0) });
    if (picked.length >= maxEntries) break;
  }
  return picked;
}


async function maybeInjectWorldInfoTriggers(reason = 'msg_sent') {
  const s = ensureSettings();
  if (!s.wiTriggerEnabled) return;

  const ctx = SillyTavern.getContext();
  const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
  if (!chat.length) return;

  const last = chat[chat.length - 1];
  if (!last || last.is_user !== true) return; // only on user send
  const lastText = String(last.mes ?? last.message ?? '').trim();
  if (!lastText || lastText.startsWith('/')) return;
  if (lastText.includes(String(s.wiTriggerTag || 'SG_WI_TRIGGERS'))) return;

  // Chỉ bắt đầu kích hoạt chỉ mục sau khi đạt số tầng AI chỉ định (tránh nhiễu/lãng phí giai đoạn đầu)
  const startAfter = clampInt(s.wiTriggerStartAfterAssistantMessages, 0, 200000, 0);
  if (startAfter > 0) {
    const assistantFloors = computeFloorCount(chat, 'assistant');
    if (assistantFloors < startAfter) {
      // log (optional)
      appendWiTriggerLog({
        ts: Date.now(),
        reason: String(reason || 'msg_sent'),
        userText: lastText,
        skipped: true,
        skippedReason: 'minAssistantFloors',
        assistantFloors,
        startAfter,
      });
      const modalOpen = $('#sg_modal_backdrop').is(':visible');
      if (modalOpen || s.wiTriggerDebugLog) {
        setStatus(`Chỉ mục chưa khởi động: Số tầng trả lời của AI ${assistantFloors}/${startAfter}`, 'info');
      }
      return;
    }
  }

  const lookback = clampInt(s.wiTriggerLookbackMessages, 5, 120, 20);
  // Chính văn gần đây (không bao gồm đầu vào người dùng lần này); để tránh "tiêm từ khóa kích hoạt" làm ô nhiễm độ tương đồng, loại bỏ trước các đoạn tiêm cùng tag.
  const tagForStrip = String(s.wiTriggerTag || 'SG_WI_TRIGGERS').trim() || 'SG_WI_TRIGGERS';
  lastText = stripTriggerInjection(lastText, tagForStrip);
  const recentText = buildRecentChatText(chat, lookback, true, [tagForStrip, rollTag]);
  if (!recentText) return;

  const candidates = collectBlueIndexCandidates();
  if (!candidates.length) return;

  const maxEntries = clampInt(s.wiTriggerMaxEntries, 1, 20, 4);
  const minScore = clampFloat(s.wiTriggerMinScore, 0, 1, 0.08);
  const includeUser = !!s.wiTriggerIncludeUserMessage;
  const userWeight = clampFloat(s.wiTriggerUserMessageWeight, 0, 10, 1.6);
  const matchMode = String(s.wiTriggerMatchMode || 'local');
  let picked = [];
  if (matchMode === 'llm') {
    try {
      picked = await pickRelevantIndexEntriesLLM(recentText, lastText, candidates, maxEntries, includeUser, userWeight);
    } catch (e) {
      console.warn('[StoryGuide] index LLM failed; fallback to local similarity', e);
      picked = pickRelevantIndexEntries(recentText, lastText, candidates, maxEntries, minScore, includeUser, userWeight);
    }
  } else {
    picked = pickRelevantIndexEntries(recentText, lastText, candidates, maxEntries, minScore, includeUser, userWeight);
  }
  if (!picked.length) return;

  const maxKeywords = clampInt(s.wiTriggerMaxKeywords, 1, 200, 24);
  const kwSet = new Set();
  const pickedTitles = []; // debug display with score
  const pickedNames = [];  // entry names (tên mục (tương đương với tên mục Đèn Xanh Lá sẽ kích hoạt))
  const pickedForLog = [];
  for (const { e, score } of picked) {
    const name = String(e.title || '').trim() || 'Mục';
    pickedNames.push(name);
    pickedTitles.push(`${name}（${score.toFixed(2)}）`);
    pickedForLog.push({
      title: name,
      score: Number(score),
      keywordsPreview: (Array.isArray(e.keywords) ? e.keywords.slice(0, 24) : []),
    });
    for (const k of (Array.isArray(e.keywords) ? e.keywords : [])) {
      const kk = String(k || '').trim();
      if (!kk) continue;
      kwSet.add(kk);
      if (kwSet.size >= maxKeywords) break;
    }
    if (kwSet.size >= maxKeywords) break;
  }
  const keywords = Array.from(kwSet);
  if (!keywords.length) return;

  const tag = tagForStrip;
  const style = String(s.wiTriggerInjectStyle || 'hidden').trim() || 'hidden';
  const cleaned = stripTriggerInjection(last.mes ?? last.message ?? '', tag);
  const injected = cleaned + buildTriggerInjection(keywords, tag, style);
  last.mes = injected;

  // append log (fire-and-forget)
  appendWiTriggerLog({
    ts: Date.now(),
    reason: String(reason || 'msg_sent'),
    userText: lastText,
    lookback,
    style,
    tag,
    picked: pickedForLog,
    injectedKeywords: keywords,
  });

  // try save
  try {
    if (typeof ctx.saveChatDebounced === 'function') ctx.saveChatDebounced();
    else if (typeof ctx.saveChat === 'function') ctx.saveChat();
  } catch { /* ignore */ }

  // debug status (only when pane open or explicitly enabled)
  const modalOpen = $('#sg_modal_backdrop').is(':visible');
  if (modalOpen || s.wiTriggerDebugLog) {
    setStatus(`Đã tiêm từ khóa kích hoạt: ${keywords.slice(0, 12).join('、')}${keywords.length > 12 ? '…' : ''}${s.wiTriggerDebugLog ? `｜Trúng: ${pickedTitles.join('；')}` : `｜Sẽ kích hoạt: ${pickedNames.slice(0, 4).join('；')}${pickedNames.length > 4 ? '…' : ''}`}`, 'ok');
  }
}

// -------------------- inline append (dynamic modules) --------------------

function indentForListItem(md) {
  const s = String(md || '');
  const pad = '    '; // 4 spaces to ensure nested blocks stay inside the module card
  if (!s) return pad + '（Trống）';
  return s.split('\n').map(line => pad + line).join('\n');
}

function normalizeNumberedHints(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const t = String(arr[i] ?? '').trim();
    if (!t) continue;
    // If the item already starts with 【n】, keep it; else prefix with 【i+1】
    if (/^【\d+】/.test(t)) out.push(t);
    else out.push(`【${i + 1}】 ${t}`);
  }
  return out;
}

function buildInlineMarkdownFromModules(parsedJson, modules, mode, showEmpty) {
  // mode: compact|standard
  const lines = [];
  lines.push(`**剧情指导**`);

  for (const m of modules) {
    // Mô-đun quick_actions không render trong Markdown, mà render riêng thành nút có thể nhấp
    if (m.key === 'quick_actions') continue;

    const hasKey = parsedJson && Object.hasOwn(parsedJson, m.key);
    const val = hasKey ? parsedJson[m.key] : undefined;
    const title = m.title || m.key;

    if (m.type === 'list') {
      const arr = Array.isArray(val) ? val : [];
      if (!arr.length) {
        if (showEmpty) lines.push(`- **${title}**\n${indentForListItem('（Trống）')}`);
        continue;
      }

      if (mode === 'compact') {
        const limit = Math.min(arr.length, 3);
        const picked = arr.slice(0, limit).map(x => String(x ?? '').trim()).filter(Boolean);
        lines.push(`- **${title}**
${indentForListItem(picked.join(' / '))}`);
      } else {
        // Chế độ tiêu chuẩn: Thụt lề nội dung vào trong list item, tránh danh sách/đánh số bên trong biến thành "thẻ cùng cấp"
        const normalized = normalizeNumberedHints(arr);
        const joined = normalized.join('\n\n');
        lines.push(`- **${title}**\n${indentForListItem(joined)}`);
      }
    } else {
      const text = (val !== undefined && val !== null) ? String(val).trim() : '';
      if (!text) {
        if (showEmpty) lines.push(`- **${title}**\n${indentForListItem('（Trống）')}`);
        continue;
      }

      if (mode === 'compact') {
        const short = (text.length > 140 ? text.slice(0, 140) + '…' : text);
        lines.push(`- **${title}**
${indentForListItem(short)}`);
      } else {
        // Chế độ tiêu chuẩn: Thụt lề nội dung vào trong list item, tránh danh sách/đánh số bên trong biến thành "thẻ cùng cấp"
        lines.push(`- **${title}**\n${indentForListItem(text)}`);
      }
    }
  }

  return lines.join('\n');
}

// -------------------- message locating & box creation --------------------

function getLastAssistantMessageRef() {
  const ctx = SillyTavern.getContext();
  const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
  for (let i = chat.length - 1; i >= 0; i--) {
    const m = chat[i];
    if (!m) continue;
    if (m.is_user === true) continue;
    if (m.is_system === true) continue;
    const mesid = (m.mesid ?? m.id ?? m.message_id ?? String(i));
    return { chatIndex: i, mesKey: String(mesid) };
  }
  return null;
}

function findMesElementByKey(mesKey) {
  if (!mesKey) return null;
  const selectors = [
    `.mes[mesid="${CSS.escape(String(mesKey))}"]`,
    `.mes[data-mesid="${CSS.escape(String(mesKey))}"]`,
    `.mes[data-mes-id="${CSS.escape(String(mesKey))}"]`,
    `.mes[data-id="${CSS.escape(String(mesKey))}"]`,
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  const all = Array.from(document.querySelectorAll('.mes')).filter(x => x && !x.classList.contains('mes_user'));
  return all.length ? all[all.length - 1] : null;
}

function setCollapsed(boxEl, collapsed) {
  if (!boxEl) return;
  boxEl.classList.toggle('collapsed', !!collapsed);
}


function attachToggleHandler(boxEl, mesKey) {
  if (!boxEl) return;

  const bind = (el, isFooter = false) => {
    if (!el) return;
    const flag = isFooter ? 'sgBoundFoot' : 'sgBound';
    if (el.dataset[flag] === '1') return;
    el.dataset[flag] = '1';

    el.addEventListener('click', (e) => {
      if (e.target && (e.target.closest('a'))) return;

      const cur = boxEl.classList.contains('collapsed');
      const next = !cur;
      setCollapsed(boxEl, next);

      const cached = inlineCache.get(String(mesKey));
      if (cached) {
        cached.collapsed = next;
        inlineCache.set(String(mesKey), cached);
      }

      // Nút chân trang: thu gọn sau đó cuộn trở lại chính văn tin nhắn
      if (isFooter && next) {
        const mesEl = boxEl.closest('.mes');
        (mesEl || boxEl).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  bind(boxEl.querySelector('.sg-inline-head'), false);
  bind(boxEl.querySelector('.sg-inline-foot'), true);
}


function createInlineBoxElement(mesKey, htmlInner, collapsed, quickActions) {
  const box = document.createElement('div');
  box.className = 'sg-inline-box';
  box.dataset.sgMesKey = String(mesKey);

  // Chỉ render các tùy chọn động do AI tạo (không còn sử dụng tùy chọn cấu hình tĩnh)
  let quickOptionsHtml = '';
  if (Array.isArray(quickActions) && quickActions.length) {
    quickOptionsHtml = renderDynamicQuickActionsHtml(quickActions, 'inline');
  }

  box.innerHTML = `
    <div class="sg-inline-head" title="Nhấp để thu gọn/mở rộng (không tự động tạo)">
      <span class="sg-inline-badge">📘</span>
      <span class="sg-inline-title">Hướng dẫn cốt truyện</span>
      <span class="sg-inline-sub">（Phân tích cốt truyện）</span>
      <span class="sg-inline-chevron">▾</span>
    </div>
    <div class="sg-inline-body">${htmlInner}</div>
    ${quickOptionsHtml}
    <div class="sg-inline-foot" title="Nhấp để thu gọn và quay lại chính văn">
      <span class="sg-inline-foot-icon">▴</span>
      <span class="sg-inline-foot-text">Thu gọn và quay lại chính văn</span>
      <span class="sg-inline-foot-icon">▴</span>
    </div>`.trim();

  setCollapsed(box, !!collapsed);
  attachToggleHandler(box, mesKey);
  return box;
}



function attachPanelToggleHandler(boxEl, mesKey) {
  if (!boxEl) return;

  const bind = (el, isFooter = false) => {
    if (!el) return;
    const flag = isFooter ? 'sgBoundFoot' : 'sgBound';
    if (el.dataset[flag] === '1') return;
    el.dataset[flag] = '1';

    el.addEventListener('click', (e) => {
      if (e.target && (e.target.closest('a'))) return;

      const cur = boxEl.classList.contains('collapsed');
      const next = !cur;
      setCollapsed(boxEl, next);

      const cached = panelCache.get(String(mesKey));
      if (cached) {
        cached.collapsed = next;
        panelCache.set(String(mesKey), cached);
      }

      if (isFooter && next) {
        const mesEl = boxEl.closest('.mes');
        (mesEl || boxEl).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  bind(boxEl.querySelector('.sg-panel-head'), false);
  bind(boxEl.querySelector('.sg-panel-foot'), true);
}


function createPanelBoxElement(mesKey, htmlInner, collapsed) {
  const box = document.createElement('div');
  box.className = 'sg-panel-box';
  box.dataset.sgMesKey = String(mesKey);

  // Chế độ panel tạm thời không hiển thị tùy chọn nhanh (chỉ hiển thị ở chế độ inline)
  const quickOptionsHtml = '';

  box.innerHTML = `
    <div class="sg-panel-head" title="Nhấp để thu gọn/mở rộng (kết quả phân tích bảng điều khiển)">
      <span class="sg-inline-badge">🧭</span>
      <span class="sg-inline-title">Hướng dẫn cốt truyện</span>
      <span class="sg-inline-sub">（Báo cáo bảng điều khiển）</span>
      <span class="sg-inline-chevron">▾</span>
    </div>
    <div class="sg-panel-body">${htmlInner}</div>
    ${quickOptionsHtml}
    <div class="sg-panel-foot" title="Nhấp để thu gọn và quay lại chính văn">
      <span class="sg-inline-foot-icon">▴</span>
      <span class="sg-inline-foot-text">Thu gọn và quay lại chính văn</span>
      <span class="sg-inline-foot-icon">▴</span>
    </div>`.trim();

  setCollapsed(box, !!collapsed);
  attachPanelToggleHandler(box, mesKey);
  return box;
}

function ensurePanelBoxPresent(mesKey) {
  const cached = panelCache.get(String(mesKey));
  if (!cached) return false;

  const mesEl = findMesElementByKey(mesKey);
  if (!mesEl) return false;

  const textEl = mesEl.querySelector('.mes_text');
  if (!textEl) return false;

  const existing = textEl.querySelector('.sg-panel-box');
  if (existing) {
    setCollapsed(existing, !!cached.collapsed);
    attachPanelToggleHandler(existing, mesKey);
    // Cập nhật body (đôi khi bị ghi đè thành vỏ rỗng)
    const body = existing.querySelector('.sg-panel-body');
    if (body && cached.htmlInner && body.innerHTML !== cached.htmlInner) body.innerHTML = cached.htmlInner;
    return true;
  }

  const box = createPanelBoxElement(mesKey, cached.htmlInner, cached.collapsed);
  textEl.appendChild(box);
  return true;
}


function syncPanelOutputToChat(markdownOrText, asCodeBlock = false) {
  const ref = getLastAssistantMessageRef();
  if (!ref) return false;

  const mesKey = ref.mesKey;

  let md = String(markdownOrText || '').trim();
  if (!md) return false;

  if (asCodeBlock) {
    // show raw output safely
    md = '```text\n' + md + '\n```';
  }

  const htmlInner = renderMarkdownToHtml(md);
  panelCache.set(String(mesKey), { htmlInner, collapsed: false, createdAt: Date.now() });

  requestAnimationFrame(() => { ensurePanelBoxPresent(mesKey); });

  // anti-overwrite reapply (same idea as inline)
  setTimeout(() => ensurePanelBoxPresent(mesKey), 800);
  setTimeout(() => ensurePanelBoxPresent(mesKey), 1800);
  setTimeout(() => ensurePanelBoxPresent(mesKey), 3500);
  setTimeout(() => ensurePanelBoxPresent(mesKey), 6500);

  return true;
}


function ensureInlineBoxPresent(mesKey) {
  const cached = inlineCache.get(String(mesKey));
  if (!cached) return false;

  const mesEl = findMesElementByKey(mesKey);
  if (!mesEl) return false;

  const textEl = mesEl.querySelector('.mes_text');
  if (!textEl) return false;

  const existing = textEl.querySelector('.sg-inline-box');
  if (existing) {
    setCollapsed(existing, !!cached.collapsed);
    attachToggleHandler(existing, mesKey);
    // Cập nhật body (đôi khi bị ghi đè thành vỏ rỗng)
    const body = existing.querySelector('.sg-inline-body');
    if (body && cached.htmlInner && body.innerHTML !== cached.htmlInner) body.innerHTML = cached.htmlInner;
    // Cập nhật tùy chọn động (nếu có thay đổi)
    const optionsContainer = existing.querySelector('.sg-dynamic-options');
    if (!optionsContainer && Array.isArray(cached.quickActions) && cached.quickActions.length) {
      const newOptionsHtml = renderDynamicQuickActionsHtml(cached.quickActions, 'inline');
      existing.querySelector('.sg-inline-body')?.insertAdjacentHTML('afterend', newOptionsHtml);
    }
    return true;
  }

  const box = createInlineBoxElement(mesKey, cached.htmlInner, cached.collapsed, cached.quickActions);
  textEl.appendChild(box);
  return true;
}

// -------------------- reapply (anti-overwrite) --------------------

function scheduleReapplyAll(reason = '') {
  if (reapplyTimer) clearTimeout(reapplyTimer);
  reapplyTimer = setTimeout(() => {
    reapplyTimer = null;
    reapplyAllInlineBoxes(reason);
  }, 260);
}

function reapplyAllInlineBoxes(reason = '') {
  const s = ensureSettings();
  if (!s.enabled) return;
  for (const [mesKey] of inlineCache.entries()) {
    ensureInlineBoxPresent(mesKey);
  }
  for (const [mesKey] of panelCache.entries()) {
    ensurePanelBoxPresent(mesKey);
  }
}

// -------------------- inline append generate & cache --------------------

async function runInlineAppendForLastMessage(opts = {}) {
  const s = ensureSettings();
  const force = !!opts.force;
  const allow = !!opts.allowWhenDisabled;
  if (!s.enabled) return;
  // Nút thủ công cho phép tạo ngay cả khi tắt "tự động thêm"
  if (!s.autoAppendBox && !allow) return;

  const ref = getLastAssistantMessageRef();
  if (!ref) return;

  const { mesKey } = ref;

  if (force) {
    inlineCache.delete(String(mesKey));
  }

  // Nếu đã được lưu vào bộ nhớ đệm: Không bắt buộc thì chỉ bù một lần; bắt buộc thì yêu cầu lại
  if (inlineCache.has(String(mesKey)) && !force) {
    ensureInlineBoxPresent(mesKey);
    return;
  }

  try {
    const { snapshotText } = buildSnapshot();

    const modules = getModules('append');
    // Schema trong append được tạo theo mô-đun inline; nếu người dùng tắt hết inline thì không tạo
    if (!modules.length) return;

    // Gợi ý một chút cho "compact/standard" (không bắt buộc), tránh việc prompt mô-đun người dùng quá dài không có tác dụng
    const modeHint = (s.appendMode === 'standard')
      ? `\n【Yêu cầu bổ sung】Đầu ra inline có thể ngắn hơn bảng điều khiển, nhưng đừng bỏ sót thông tin then chốt.\n`
      : `\n【Yêu cầu bổ sung】Đầu ra inline cố gắng ngắn gọn: Mỗi trường cố gắng trong vòng 1~2 câu/2 mục.\n`;

    const schema = buildSchemaFromModules(modules);
    const messages = buildPromptMessages(snapshotText + modeHint, s.spoilerLevel, modules, 'append');

    let jsonText = '';
    if (s.provider === 'custom') {
      jsonText = await callViaCustom(s.customEndpoint, s.customApiKey, s.customModel, messages, s.temperature, s.customMaxTokens, s.customTopP, s.customStream);
      const parsedTry = safeJsonParse(jsonText);
      if (!parsedTry || !hasAnyModuleKey(parsedTry, modules)) {
        try { jsonText = await fallbackAskJsonCustom(s.customEndpoint, s.customApiKey, s.customModel, messages, s.temperature, s.customMaxTokens, s.customTopP, s.customStream); }
        catch { /* ignore */ }
      }
    } else {
      jsonText = await callViaSillyTavern(messages, schema, s.temperature);
      if (typeof jsonText !== 'string') jsonText = JSON.stringify(jsonText ?? '');
      const parsedTry = safeJsonParse(jsonText);
      if (!parsedTry || Object.keys(parsedTry).length === 0) jsonText = await fallbackAskJson(messages, s.temperature);
    }

    const parsed = safeJsonParse(jsonText);
    if (!parsed) {
      // Phân tích thất bại: cũng thêm văn bản gốc vào cuối đoạn chat, tránh "có đầu ra nhưng không nhìn thấy"
      const raw = String(jsonText || '').trim();
      const rawMd = raw ? ('```text\n' + raw + '\n```') : '（Trống）';
      const mdFail = `**Hướng dẫn cốt truyện (Phân tích thất bại)**\n\n${rawMd}`;
      const htmlInnerFail = renderMarkdownToHtml(mdFail);

      inlineCache.set(String(mesKey), { htmlInner: htmlInnerFail, collapsed: false, createdAt: Date.now() });
      requestAnimationFrame(() => { ensureInlineBoxPresent(mesKey); });
      setTimeout(() => ensureInlineBoxPresent(mesKey), 800);
      setTimeout(() => ensureInlineBoxPresent(mesKey), 1800);
      setTimeout(() => ensureInlineBoxPresent(mesKey), 3500);
      setTimeout(() => ensureInlineBoxPresent(mesKey), 6500);
      return;
    }

    // Hợp nhất bộ nhớ đệm mô-đun tĩnh (sử dụng giá trị mô-đun tĩnh đã lưu trước đó)
    const mergedParsed = mergeStaticModulesIntoResult(parsed, modules);

    // Cập nhật bộ nhớ đệm mô-đun tĩnh (mô-đun tĩnh tạo lần đầu sẽ được lưu)
    updateStaticModulesCache(mergedParsed, modules).catch(() => void 0);

    const md = buildInlineMarkdownFromModules(mergedParsed, modules, s.appendMode, !!s.inlineShowEmpty);
    const htmlInner = renderMarkdownToHtml(md);

    // Trích xuất quick_actions để render động các nút có thể nhấp
    const quickActions = Array.isArray(mergedParsed.quick_actions) ? mergedParsed.quick_actions : [];

    inlineCache.set(String(mesKey), { htmlInner, collapsed: false, createdAt: Date.now(), quickActions });

    requestAnimationFrame(() => { ensureInlineBoxPresent(mesKey); });

    // Bù đắp thêm: Đối phó với việc ghi đè lần hai do "cập nhật biến đến muộn"
    setTimeout(() => ensureInlineBoxPresent(mesKey), 800);
    setTimeout(() => ensureInlineBoxPresent(mesKey), 1800);
    setTimeout(() => ensureInlineBoxPresent(mesKey), 3500);
    setTimeout(() => ensureInlineBoxPresent(mesKey), 6500);
  } catch (e) {
    console.warn('[StoryGuide] inline append failed:', e);
  }
}

function scheduleInlineAppend() {
  const s = ensureSettings();
  const delay = clampInt(s.appendDebounceMs, 150, 5000, DEFAULT_SETTINGS.appendDebounceMs);
  if (appendTimer) clearTimeout(appendTimer);
  appendTimer = setTimeout(() => {
    appendTimer = null;
    runInlineAppendForLastMessage().catch(() => void 0);
  }, delay);
}

// -------------------- models refresh (custom) --------------------

function fillModelSelect(modelIds, selected) {
  const $sel = $('#sg_modelSelect');
  if (!$sel.length) return;
  $sel.empty();
  $sel.append(`<option value="">（Chọn mô hình）</option>`);
  (modelIds || []).forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    if (selected && id === selected) opt.selected = true;
    $sel.append(opt);
  });
}


function fillSummaryModelSelect(modelIds, selected) {
  const $sel = $('#sg_summaryModelSelect');
  if (!$sel.length) return;
  $sel.empty();
  $sel.append(`<option value="">（Chọn mô hình）</option>`);
  (modelIds || []).forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    if (selected && id === selected) opt.selected = true;
    $sel.append(opt);
  });
}


function fillIndexModelSelect(modelIds, selected) {
  const $sel = $('#sg_wiIndexModelSelect');
  if (!$sel.length) return;
  $sel.empty();
  $sel.append(`<option value="">（Chọn mô hình）</option>`);
  (modelIds || []).forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    if (selected && id === selected) opt.selected = true;
    $sel.append(opt);
  });
}


async function refreshSummaryModels() {
  const s = ensureSettings();
  const raw = String($('#sg_summaryCustomEndpoint').val() || s.summaryCustomEndpoint || '').trim();
  const apiBase = normalizeBaseUrl(raw);
  if (!apiBase) { setStatus('Vui lòng điền "URL cơ sở API tóm tắt độc lập" trước khi làm mới mô hình', 'warn'); return; }

  setStatus('Đang làm mới danh sách mô hình "API tóm tắt độc lập"...', 'warn');

  const apiKey = String($('#sg_summaryCustomApiKey').val() || s.summaryCustomApiKey || '');
  const statusUrl = '/api/backends/chat-completions/status';

  const body = {
    reverse_proxy: apiBase,
    chat_completion_source: 'custom',
    custom_url: apiBase,
    custom_include_headers: apiKey ? `Authorization: Bearer ${apiKey}` : ''
  };

  // prefer backend status (tương thích proxy backend ST)
  try {
    const headers = { ...getStRequestHeadersCompat(), 'Content-Type': 'application/json' };
    const res = await fetch(statusUrl, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err = new Error(`Kiểm tra trạng thái thất bại: HTTP ${res.status} ${res.statusText}\n${txt}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json().catch(() => ({}));

    let modelsList = [];
    if (Array.isArray(data?.models)) modelsList = data.models;
    else if (Array.isArray(data?.data)) modelsList = data.data;
    else if (Array.isArray(data)) modelsList = data;

    let ids = [];
    if (modelsList.length) ids = modelsList.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean);

    ids = Array.from(new Set(ids)).sort((a, b) => String(a).localeCompare(String(b)));

    if (!ids.length) {
      setStatus('Làm mới thành công, nhưng không phân tích được danh sách mô hình (định dạng trả về không tương thích)', 'warn');
      return;
    }

    s.summaryCustomModelsCache = ids;
    saveSettings();
    fillSummaryModelSelect(ids, s.summaryCustomModel);
    setStatus(`Đã làm mới mô hình tóm tắt: ${ids.length} cái (Proxy backend)`, 'ok');
    return;
  } catch (e) {
    const status = e?.status;
    if (!(status === 404 || status === 405)) console.warn('[StoryGuide] summary status check failed; fallback to direct /models', e);
  }

  // fallback direct /models
  try {
    const modelsUrl = (function (base) {
      const u = normalizeBaseUrl(base);
      if (!u) return '';
      if (/\/v1$/.test(u)) return u + '/models';
      if (/\/v1\b/i.test(u)) return u.replace(/\/+$/, '') + '/models';
      return u + '/v1/models';
    })(apiBase);

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(modelsUrl, { method: 'GET', headers });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Kết nối trực tiếp /models thất bại: HTTP ${res.status} ${res.statusText}\n${txt}`);
    }
    const data = await res.json().catch(() => ({}));

    let modelsList = [];
    if (Array.isArray(data?.models)) modelsList = data.models;
    else if (Array.isArray(data?.data)) modelsList = data.data;
    else if (Array.isArray(data)) modelsList = data;

    let ids = [];
    if (modelsList.length) ids = modelsList.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean);

    ids = Array.from(new Set(ids)).sort((a, b) => String(a).localeCompare(String(b)));

    if (!ids.length) { setStatus('Làm mới trực tiếp thất bại: Không phân tích được danh sách mô hình', 'warn'); return; }

    s.summaryCustomModelsCache = ids;
    saveSettings();
    fillSummaryModelSelect(ids, s.summaryCustomModel);
    setStatus(`Đã làm mới mô hình tóm tắt: ${ids.length} cái (Fallback trực tiếp)`, 'ok');
  } catch (e) {
    setStatus(`Làm mới mô hình tóm tắt thất bại：${e?.message ?? e}`, 'err');
  }
}


async function refreshIndexModels() {
  const s = ensureSettings();
  const raw = String($('#sg_wiIndexCustomEndpoint').val() || s.wiIndexCustomEndpoint || '').trim();
  const apiBase = normalizeBaseUrl(raw);
  if (!apiBase) { setStatus('Vui lòng điền "URL cơ sở API chỉ mục độc lập" trước khi làm mới mô hình', 'warn'); return; }

  setStatus('Đang làm mới danh sách mô hình "API chỉ mục độc lập"...', 'warn');

  const apiKey = String($('#sg_wiIndexCustomApiKey').val() || s.wiIndexCustomApiKey || '');
  const statusUrl = '/api/backends/chat-completions/status';

  const body = {
    reverse_proxy: apiBase,
    chat_completion_source: 'custom',
    custom_url: apiBase,
    custom_include_headers: apiKey ? `Authorization: Bearer ${apiKey}` : ''
  };

  try {
    const headers = { ...getStRequestHeadersCompat(), 'Content-Type': 'application/json' };
    const res = await fetch(statusUrl, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err = new Error(`Kiểm tra trạng thái thất bại: HTTP ${res.status} ${res.statusText}\n${txt}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json().catch(() => ({}));

    let modelsList = [];
    if (Array.isArray(data?.models)) modelsList = data.models;
    else if (Array.isArray(data?.data)) modelsList = data.data;
    else if (Array.isArray(data)) modelsList = data;

    let ids = [];
    if (modelsList.length) ids = modelsList.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean);

    ids = Array.from(new Set(ids)).sort((a, b) => String(a).localeCompare(String(b)));

    if (!ids.length) {
      setStatus('Làm mới thành công, nhưng không phân tích được danh sách mô hình (định dạng trả về không tương thích)', 'warn');
      return;
    }

    s.wiIndexCustomModelsCache = ids;
    saveSettings();
    fillIndexModelSelect(ids, s.wiIndexCustomModel);
    setStatus(`Đã làm mới mô hình chỉ mục: ${ids.length} cái (Proxy backend)`, 'ok');
    return;
  } catch (e) {
    const status = e?.status;
    if (!(status === 404 || status === 405)) console.warn('[StoryGuide] index status check failed; fallback to direct /models', e);
  }

  try {
    const modelsUrl = (function (base) {
      const u = normalizeBaseUrl(base);
      if (!u) return '';
      if (/\/v1$/.test(u)) return u + '/models';
      if (/\/v1\b/i.test(u)) return u.replace(/\/+$/, '') + '/models';
      return u + '/v1/models';
    })(apiBase);

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(modelsUrl, { method: 'GET', headers });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Kết nối trực tiếp /models thất bại: HTTP ${res.status} ${res.statusText}\n${txt}`);
    }
    const data = await res.json().catch(() => ({}));

    let modelsList = [];
    if (Array.isArray(data?.models)) modelsList = data.models;
    else if (Array.isArray(data?.data)) modelsList = data.data;
    else if (Array.isArray(data)) modelsList = data;

    let ids = [];
    if (modelsList.length) ids = modelsList.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean);

    ids = Array.from(new Set(ids)).sort((a, b) => String(a).localeCompare(String(b)));

    if (!ids.length) { setStatus('Làm mới trực tiếp thất bại: Không phân tích được danh sách mô hình', 'warn'); return; }

    s.wiIndexCustomModelsCache = ids;
    saveSettings();
    fillIndexModelSelect(ids, s.wiIndexCustomModel);
    setStatus(`Đã làm mới mô hình chỉ mục: ${ids.length} cái (Fallback trực tiếp)`, 'ok');
  } catch (e) {
    setStatus(`Làm mới mô hình chỉ mục thất bại：${e?.message ?? e}`, 'err');
  }
}



async function refreshModels() {
  const s = ensureSettings();
  const raw = String($('#sg_customEndpoint').val() || s.customEndpoint || '').trim();
  const apiBase = normalizeBaseUrl(raw);
  if (!apiBase) { setStatus('Vui lòng điền URL cơ sở API trước khi làm mới mô hình', 'warn'); return; }

  setStatus('Đang làm mới danh sách mô hình...', 'warn');

  const apiKey = String($('#sg_customApiKey').val() || s.customApiKey || '');
  const statusUrl = '/api/backends/chat-completions/status';

  const body = {
    reverse_proxy: apiBase,
    chat_completion_source: 'custom',
    custom_url: apiBase,
    custom_include_headers: apiKey ? `Authorization: Bearer ${apiKey}` : ''
  };

  // prefer backend status
  try {
    const headers = { ...getStRequestHeadersCompat(), 'Content-Type': 'application/json' };
    const res = await fetch(statusUrl, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err = new Error(`Kiểm tra trạng thái thất bại: HTTP ${res.status} ${res.statusText}\n${txt}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json().catch(() => ({}));

    let modelsList = [];
    if (Array.isArray(data?.models)) modelsList = data.models;
    else if (Array.isArray(data?.data)) modelsList = data.data;
    else if (Array.isArray(data)) modelsList = data;

    let ids = [];
    if (modelsList.length) ids = modelsList.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean);

    ids = Array.from(new Set(ids)).sort((a, b) => String(a).localeCompare(String(b)));

    if (!ids.length) {
      setStatus('Làm mới thành công, nhưng không phân tích được danh sách mô hình (định dạng trả về không tương thích)', 'warn');
      return;
    }

    s.customModelsCache = ids;
    saveSettings();
    fillModelSelect(ids, s.customModel);
    setStatus(`Đã làm mới mô hình: ${ids.length} cái (Proxy backend)`, 'ok');
    return;
  } catch (e) {
    const status = e?.status;
    if (!(status === 404 || status === 405)) console.warn('[StoryGuide] status check failed; fallback to direct /models', e);
  }

  // fallback direct
  try {
    const modelsUrl = (function (base) {
      const u = normalizeBaseUrl(base);
      if (!u) return '';
      if (/\/v1$/.test(u)) return u + '/models';
      if (/\/v1\b/i.test(u)) return u.replace(/\/+$/, '') + '/models';
      return u + '/v1/models';
    })(apiBase);

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(modelsUrl, { method: 'GET', headers });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Kết nối trực tiếp /models thất bại: HTTP ${res.status} ${res.statusText}\n${txt}`);
    }
    const data = await res.json().catch(() => ({}));

    let modelsList = [];
    if (Array.isArray(data?.models)) modelsList = data.models;
    else if (Array.isArray(data?.data)) modelsList = data.data;
    else if (Array.isArray(data)) modelsList = data;

    let ids = [];
    if (modelsList.length) ids = modelsList.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean);

    ids = Array.from(new Set(ids)).sort((a, b) => String(a).localeCompare(String(b)));

    if (!ids.length) { setStatus('Làm mới trực tiếp thất bại: Không phân tích được danh sách mô hình', 'warn'); return; }

    s.customModelsCache = ids;
    saveSettings();
    fillModelSelect(ids, s.customModel);
    setStatus(`Đã làm mới mô hình: ${ids.length} cái (Fallback trực tiếp)`, 'ok');
  } catch (e) {
    setStatus(`Làm mới mô hình thất bại：${e?.message ?? e}`, 'err');
  }
}

// -------------------- UI --------------------

function findTopbarContainer() {
  const extBtn =
    document.querySelector('#extensions_button') ||
    document.querySelector('[data-i18n="Extensions"]') ||
    document.querySelector('button[title*="Extensions"]') ||
    document.querySelector('button[aria-label*="Extensions"]');
  if (extBtn && extBtn.parentElement) return extBtn.parentElement;

  const candidates = ['#top-bar', '#topbar', '#topbar_buttons', '#topbar-buttons', '.topbar', '.topbar_buttons', '.top-bar', '.top-bar-buttons', '#rightNav', '#top-right', '#toolbar'];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function createTopbarButton() {
  if (document.getElementById('sg_topbar_btn')) return;
  const container = findTopbarContainer();
  const btn = document.createElement('button');
  btn.id = 'sg_topbar_btn';
  btn.type = 'button';
  btn.className = 'sg-topbar-btn';
  btn.title = 'Hướng dẫn Cốt truyện StoryGuide';
  btn.innerHTML = '<span class="sg-topbar-icon">📘</span>';
  btn.addEventListener('click', () => openModal());

  if (container) {
    const sample = container.querySelector('button');
    if (sample && sample.className) btn.className = sample.className + ' sg-topbar-btn';
    container.appendChild(btn);
  } else {
    btn.className += ' sg-topbar-fallback';
    document.body.appendChild(btn);
  }
}


function findChatInputAnchor() {
  // Prefer send button as anchor
  const sendBtn =
    document.querySelector('#send_but') ||
    document.querySelector('#send_button') ||
    document.querySelector('button#send') ||
    document.querySelector('button[title*="Send"]') ||
    document.querySelector('button[aria-label*="Send"]') ||
    document.querySelector('button.menu_button#send_but') ||
    document.querySelector('.send_button') ||
    document.querySelector('button[type="submit"]');

  if (sendBtn) return sendBtn;

  // Fallback: textarea container
  const ta =
    document.querySelector('#send_textarea') ||
    document.querySelector('textarea[name="message"]') ||
    document.querySelector('textarea');

  return ta;
}

const SG_CHAT_POS_KEY = 'storyguide_chat_controls_pos_v1';
let sgChatPinnedLoaded = false;
let sgChatPinnedPos = null; // {left, top, pinned}
let sgChatPinned = false;

function loadPinnedChatPos() {
  if (sgChatPinnedLoaded) return;
  sgChatPinnedLoaded = true;
  try {
    const raw = localStorage.getItem(SG_CHAT_POS_KEY);
    if (!raw) return;
    const j = JSON.parse(raw);
    if (j && typeof j.left === 'number' && typeof j.top === 'number') {
      sgChatPinnedPos = { left: j.left, top: j.top, pinned: j.pinned !== false };
      sgChatPinned = sgChatPinnedPos.pinned;
    }
  } catch { /* ignore */ }
}

function savePinnedChatPos(left, top) {
  try {
    sgChatPinnedPos = { left: Number(left) || 0, top: Number(top) || 0, pinned: true };
    sgChatPinned = true;
    localStorage.setItem(SG_CHAT_POS_KEY, JSON.stringify(sgChatPinnedPos));
  } catch { /* ignore */ }
}

function clearPinnedChatPos() {
  try {
    sgChatPinnedPos = null;
    sgChatPinned = false;
    localStorage.removeItem(SG_CHAT_POS_KEY);
  } catch { /* ignore */ }
}

const SG_FLOATING_POS_KEY = 'storyguide_floating_panel_pos_v1';
let sgFloatingPinnedLoaded = false;
let sgFloatingPinnedPos = null;

function loadFloatingPanelPos() {
  if (sgFloatingPinnedLoaded) return;
  sgFloatingPinnedLoaded = true;
  try {
    const raw = localStorage.getItem(SG_FLOATING_POS_KEY);
    if (!raw) return;
    const j = JSON.parse(raw);
    if (j && typeof j.left === 'number' && typeof j.top === 'number') {
      sgFloatingPinnedPos = { left: j.left, top: j.top };
    }
  } catch { /* ignore */ }
}

function saveFloatingPanelPos(left, top) {
  try {
    sgFloatingPinnedPos = { left: Number(left) || 0, top: Number(top) || 0 };
    localStorage.setItem(SG_FLOATING_POS_KEY, JSON.stringify(sgFloatingPinnedPos));
  } catch { /* ignore */ }
}

function clearFloatingPanelPos() {
  try {
    sgFloatingPinnedPos = null;
    localStorage.removeItem(SG_FLOATING_POS_KEY);
  } catch { /* ignore */ }
}

function clampToViewport(left, top, w, h) {
  // Nới lỏng giới hạn biên: cho phép cửa sổ vượt biên 50% (tức là giữ lại ít nhất 50% hoặc thanh tiêu đề 40px hiển thị)
  const minVisibleRatio = 0.5; // Ít nhất 50% hiển thị (cho phép 50% còn lại ở ngoài màn hình)
  const minVisiblePx = 40;     // Hoặc ít nhất 40px (đảm bảo thanh tiêu đề có thể kéo lại được)

  // Tính chiều rộng tối thiểu cần giữ lại hiển thị theo chiều ngang
  const minVisibleW = Math.max(minVisiblePx, w * minVisibleRatio);
  // Tính chiều cao tối thiểu cần giữ lại hiển thị theo chiều dọc
  const minVisibleH = Math.max(minVisiblePx, h * minVisibleRatio);

  // Biên trái: cho phép giá trị âm, nhưng đảm bảo bên phải còn ít nhất minVisibleW trong màn hình
  // Tức là left + w >= minVisibleW → left >= minVisibleW - w
  const minLeft = minVisibleW - w;
  // Biên phải: Đảm bảo bên trái còn ít nhất minVisibleW trong màn hình
  // Tức là left + minVisibleW <= window.innerWidth → left <= window.innerWidth - minVisibleW
  const maxLeft = window.innerWidth - minVisibleW;

  // Biên trên: Nghiêm ngặt giới hạn >= 0, đảm bảo thanh tiêu đề không bị che khuất
  const minTop = 0;
  // Biên dưới: Đảm bảo phần trên còn ít nhất minVisibleH trong màn hình
  const maxTop = window.innerHeight - minVisibleH;

  const L = Math.max(minLeft, Math.min(left, maxLeft));
  const T = Math.max(minTop, Math.min(top, maxTop));
  return { left: L, top: T };
}

function measureWrap(wrap) {
  const prevVis = wrap.style.visibility;
  wrap.style.visibility = 'hidden';
  wrap.style.left = '0px';
  wrap.style.top = '0px';
  const w = wrap.offsetWidth || 220;
  const h = wrap.offsetHeight || 38;
  wrap.style.visibility = prevVis || 'visible';
  return { w, h };
}

function positionChatActionButtons() {
  const wrap = document.getElementById('sg_chat_controls');
  if (!wrap) return;

  loadPinnedChatPos();

  const { w, h } = measureWrap(wrap);

  // If user dragged & pinned position, keep it.
  if (sgChatPinned && sgChatPinnedPos) {
    const clamped = clampToViewport(sgChatPinnedPos.left, sgChatPinnedPos.top, w, h);
    wrap.style.left = `${Math.round(clamped.left)}px`;
    wrap.style.top = `${Math.round(clamped.top)}px`;
    return;
  }

  const sendBtn =
    document.querySelector('#send_but') ||
    document.querySelector('#send_button') ||
    document.querySelector('button#send') ||
    document.querySelector('button[title*="Send"]') ||
    document.querySelector('button[aria-label*="Send"]') ||
    document.querySelector('.send_button') ||
    document.querySelector('button[type="submit"]');

  if (!sendBtn) return;

  const rect = sendBtn.getBoundingClientRect();

  // place to the left of send button, vertically centered
  let left = rect.left - w - 10;
  let top = rect.top + (rect.height - h) / 2;

  const clamped = clampToViewport(left, top, w, h);
  wrap.style.left = `${Math.round(clamped.left)}px`;
  wrap.style.top = `${Math.round(clamped.top)}px`;
}

let sgChatPosTimer = null;
function schedulePositionChatButtons() {
  if (sgChatPosTimer) return;
  sgChatPosTimer = setTimeout(() => {
    sgChatPosTimer = null;
    try { positionChatActionButtons(); } catch { }
  }, 60);
}

// Removed: ensureChatActionButtons feature (Generate/Reroll buttons near input)
function ensureChatActionButtons() {
  // Feature disabled/removed as per user request.
  const el = document.getElementById('sg_chat_controls');
  if (el) el.remove();
}


// -------------------- card toggle (shrink/expand per module card) --------------------
function clearLegacyZoomArtifacts() {
  try {
    document.body.classList.remove('sg-zoom-lock');
    document.querySelectorAll('.sg-zoomed').forEach(el => el.classList.remove('sg-zoomed'));
    const ov = document.getElementById('sg_zoom_overlay');
    if (ov) ov.remove();
  } catch { /* ignore */ }
}

function installCardZoomDelegation() {
  if (window.__storyguide_card_toggle_installed) return;
  window.__storyguide_card_toggle_installed = true;

  clearLegacyZoomArtifacts();

  document.addEventListener('click', (e) => {
    const target = e.target;
    // don't hijack interactive elements
    if (target.closest('a, button, input, textarea, select, label')) return;

    // Handle Title Click -> Collapse Section
    // Target headers h1-h6 inside floating or inline body
    // We strictly look for headers that are direct children or wrapped in simple divs of the body
    const header = target.closest('.sg-floating-body h1, .sg-floating-body h2, .sg-floating-body h3, .sg-floating-body h4, .sg-floating-body h5, .sg-floating-body h6, .sg-inline-body h1, .sg-inline-body h2, .sg-inline-body h3, .sg-inline-body h4, .sg-inline-body h5, .sg-inline-body h6');

    if (header) {
      e.preventDefault();
      e.stopPropagation();

      // Find the next sibling that is usually the content (ul, p, or div)
      let next = header.nextElementSibling;
      let handled = false;

      // Toggle class on header for styling (arrow)
      header.classList.toggle('sg-section-collapsed');

      while (next) {
        // Stop if we hit another header of same or higher level, or if end of container
        const tag = next.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) break;

        // Toggle visibility
        if (next.style.display === 'none') {
          next.style.display = '';
        } else {
          next.style.display = 'none';
        }

        next = next.nextElementSibling;
        handled = true;
      }
      return;
    }

    // Fallback: If inline cards still need collapsing (optional, keeping for compatibility if user wants inline msg boxes to toggle)
    const card = target.closest('.sg-inline-body > ul > li');
    if (card) {
      // Check selection
      try {
        const sel = window.getSelection();
        if (sel && String(sel).trim().length > 0) return;
      } catch { /* ignore */ }

      e.preventDefault();
      e.stopPropagation();
      card.classList.toggle('sg-collapsed');
    }
  }, true);
}



function buildModalHtml() {
  return `
  <div id="sg_modal_backdrop" class="sg-backdrop" style="display:none;">
    <div id="sg_modal" class="sg-modal" role="dialog" aria-modal="true">
      <div class="sg-modal-head">
        <div class="sg-modal-title">
          <span class="sg-badge">📘</span>
          Hướng dẫn Cốt truyện <span class="sg-sub">StoryGuide v${SG_VERSION}</span>
        </div>
        <div class="sg-modal-actions" style="display: flex; gap: 10px;">
          <button class="menu_button sg-btn" id="sg_save_header" style="background: var(--SmartThemeQuoteColor); color: #fff;">💾 Lưu Cài Đặt</button>
          <button class="menu_button sg-btn" id="sg_close">Đóng</button>
        </div>
      </div>

      <div class="sg-modal-body">
        <div class="sg-left">
          <div class="sg-pagetabs">
            <button class="sg-pgtab active" id="sg_pgtab_guide">Hướng dẫn Cốt truyện</button>
            <button class="sg-pgtab" id="sg_pgtab_summary">Cài đặt Tóm tắt</button>
            <button class="sg-pgtab" id="sg_pgtab_index">Cài đặt Chỉ mục</button>
            <button class="sg-pgtab" id="sg_pgtab_roll">Cài đặt ROLL</button>
          </div>

          <div class="sg-page active" id="sg_page_guide">
          <div class="sg-card">
            <div class="sg-card-title">Cài đặt Tạo sinh</div>

            <div class="sg-grid2">
              <div class="sg-field">
                <label>Bật</label>
                <label class="sg-switch">
                  <input type="checkbox" id="sg_enabled">
                  <span class="sg-slider"></span>
                </label>
              </div>

              <div class="sg-field">
                <label>Mức độ Spoil</label>
                <select id="sg_spoiler">
                  <option value="none">Không spoil</option>
                  <option value="mild">Spoil nhẹ</option>
                  <option value="full">Spoil toàn bộ</option>
                </select>
              </div>

              <div class="sg-field">
                <label>Provider</label>
                <select id="sg_provider">
                  <option value="st">Sử dụng API SillyTavern hiện tại (Khuyên dùng)</option>
                  <option value="custom">API Độc lập (Qua proxy backend, giảm lỗi CORS)</option>
                </select>
              </div>

              <div class="sg-field">
                <label>temperature</label>
                <input id="sg_temperature" type="number" step="0.05" min="0" max="2">
              </div>
            </div>

            <div class="sg-grid2">
              <div class="sg-field">
                <label>Số tin nhắn gần đây</label>
                <input id="sg_maxMessages" type="number" min="5" max="200">
              </div>
              <div class="sg-field">
                <label>Ký tự tối đa mỗi tin</label>
                <input id="sg_maxChars" type="number" min="200" max="8000">
              </div>
            </div>

            <div class="sg-row">
              <label class="sg-check"><input type="checkbox" id="sg_includeUser">Bao gồm tin nhắn người dùng</label>
              <label class="sg-check"><input type="checkbox" id="sg_includeAssistant">Bao gồm tin nhắn AI</label>
            </div>

            <div class="sg-row sg-inline">
              <label class="sg-check"><input type="checkbox" id="sg_autoRefresh">Tự động làm mới báo cáo bảng điều khiển</label>
              <select id="sg_autoRefreshOn">
                <option value="received">Khi AI trả lời</option>
                <option value="sent">Khi người dùng gửi</option>
                <option value="both">Cả hai đều kích hoạt</option>
              </select>
            </div>

            <div class="sg-row sg-inline">
              <label class="sg-check"><input type="checkbox" id="sg_autoAppendBox">Bật khung phân tích (Tạo thủ công/Re-roll)</label>
              <select id="sg_appendMode">
                <option value="compact">Gọn</option>
                <option value="standard">Tiêu chuẩn</option>
              </select>
              <select id="sg_inlineModulesSource" title="Chọn nguồn mô-đun hiển thị ở khung thêm">
                <option value="inline">Chỉ mô-đun inline=true</option>
                <option value="panel">Theo bảng điều khiển (panel=true)</option>
                <option value="all">Hiển thị tất cả mô-đun</option>
              </select>
              <label class="sg-check" title="Hiển thị giữ chỗ (Trống) ngay cả khi mô hình không xuất trường này">
                <input type="checkbox" id="sg_inlineShowEmpty">Hiển thị trường trống
              </label>
              <span class="sg-hint">（Nhấp tiêu đề để thu gọn）</span>
            </div>

            <div id="sg_custom_block" class="sg-card sg-subcard" style="display:none;">
              <div class="sg-card-title">Cài đặt API Độc lập (Khuyên điền URL cơ sở API)</div>

              <div class="sg-field">
                <label>URL cơ sở API (Ví dụ https://api.openai.com/v1 )</label>
                <input id="sg_customEndpoint" type="text" placeholder="https://xxx.com/v1">
                <div class="sg-hint sg-warn">Ưu tiên đi qua proxy backend (/api/backends/...) để tránh lỗi CORS/kết nối hơn là trình duyệt đi trực tiếp.</div>
              </div>

              <div class="sg-grid2">
                <div class="sg-field">
                  <label>API Key (Tùy chọn)</label>
                  <input id="sg_customApiKey" type="password" placeholder="Có thể để trống">
                </div>

                <div class="sg-field">
                  <label>Mô hình (Có thể tự điền)</label>
                  <input id="sg_customModel" type="text" placeholder="gpt-4o-mini">
                </div>
              </div>

              <div class="sg-row sg-inline">
                <button class="menu_button sg-btn" id="sg_refreshModels">Kiểm tra/Làm mới mô hình</button>
                <select id="sg_modelSelect" class="sg-model-select">
                  <option value="">（Chọn mô hình）</option>
                </select>
              </div>

              <div class="sg-row">
                <div class="sg-field sg-field-full">
                  <label>Max response tokens</label>
                  <input id="sg_customMaxTokens" type="number" min="256" max="200000" step="1" placeholder="Ví dụ：60000">
                
                  <label class="sg-check" style="margin-top:8px;">
                    <input type="checkbox" id="sg_customStream"> Dùng phản hồi luồng (stream=true)
                  </label>
</div>
              </div>
            </div>

            <div class="sg-actions-row">
              <button class="menu_button sg-btn-primary" id="sg_saveSettings">Lưu cài đặt</button>
              <button class="menu_button sg-btn-primary" id="sg_analyze">Phân tích cốt truyện hiện tại</button>
            </div>
          </div>

          <div class="sg-card">
            <div class="sg-card-title">Tùy chọn nhanh</div>
            <div class="sg-hint">Nhấp vào tùy chọn để tự động nhập prompt vào khung chat. Có thể tùy chỉnh nội dung.</div>

            <div class="sg-row sg-inline">
              <label class="sg-check"><input type="checkbox" id="sg_quickOptionsEnabled">Bật tùy chọn nhanh</label>
              <select id="sg_quickOptionsShowIn">
                <option value="inline">Chỉ khung phân tích</option>
                <option value="panel">Chỉ bảng điều khiển</option>
                <option value="both">Hiển thị cả hai</option>
              </select>
            </div>

            <div class="sg-field" style="margin-top:10px;">
              <label>Cấu hình tùy chọn (JSON, định dạng: [{label, prompt}, ...])</label>
              <textarea id="sg_quickOptionsJson" rows="6" spellcheck="false" placeholder='[{"label": "Tiếp tục", "prompt": "Tiếp tục diễn biến cốt truyện hiện tại"}]'></textarea>
              <div class="sg-actions-row">
                <button class="menu_button sg-btn" id="sg_resetQuickOptions">Khôi phục mặc định</button>
                <button class="menu_button sg-btn" id="sg_applyQuickOptions">Áp dụng tùy chọn</button>
              </div>
            </div>
          </div>

          <div class="sg-card">
            <div class="sg-card-title">Mô-đun đầu ra (JSON, tùy chỉnh trường/prompt)</div>
            <div class="sg-hint">Bạn có thể thêm/xóa mô-đun, sửa key/title/type/prompt, kiểm soát panel/inline. Có thể nhấn "Kiểm tra" trước khi lưu.</div>

            <div class="sg-field">
              <textarea id="sg_modulesJson" rows="12" spellcheck="false"></textarea>
              <div class="sg-hint" style="margin-top:4px;">💡 Mô-đun có thể thêm <code>static: true</code> để biểu thị mô-đun tĩnh (chỉ cập nhật khi tạo lần đầu hoặc làm mới thủ công)</div>
              <div class="sg-actions-row">
                <button class="menu_button sg-btn" id="sg_validateModules">Kiểm tra</button>
                <button class="menu_button sg-btn" id="sg_resetModules">Khôi phục mặc định</button>
                <button class="menu_button sg-btn" id="sg_applyModules">Áp dụng vào cài đặt</button>
                <button class="menu_button sg-btn" id="sg_clearStaticCache">Làm mới mô-đun tĩnh</button>
              </div>
            </div>

            <div class="sg-field">
              <label>Bổ sung System tùy chỉnh (Tùy chọn)</label>
              <textarea id="sg_customSystemPreamble" rows="3" placeholder="Ví dụ: Thiên về hồi hộp, nhấn mạnh manh mối, tránh dài dòng..."></textarea>
            </div>
            <div class="sg-field">
              <label>Bổ sung Constraints tùy chỉnh (Tùy chọn)</label>
              <textarea id="sg_customConstraints" rows="3" placeholder="Ví dụ: Phải nhắc đến động cơ nhân vật chính, mỗi mục không quá 20 chữ..."></textarea>
            </div>
          </div>

          
          <div class="sg-card">
            <div class="sg-card-title">Cài đặt sẵn & Sách Thế Giới (Worldbook)</div>

            <div class="sg-row sg-inline">
              <button class="menu_button sg-btn" id="sg_exportPreset">Xuất cài đặt sẵn</button>
              <label class="sg-check"><input type="checkbox" id="sg_presetIncludeApiKey">Xuất kèm API Key</label>
              <button class="menu_button sg-btn" id="sg_importPreset">Nhập cài đặt sẵn</button>
            </div>

            <div class="sg-hint">Cài đặt sẵn bao gồm: Cài đặt tạo sinh / API độc lập / Mô-đun đầu ra / Cài đặt Worldbook / Khung prompt tùy chỉnh. Nhập sẽ ghi đè cấu hình hiện tại.</div>

            <hr class="sg-hr">

            <div class="sg-row sg-inline">
              <label class="sg-check"><input type="checkbox" id="sg_worldbookEnabled">Tiêm Worldbook vào đầu vào phân tích</label>
              <select id="sg_worldbookMode">
                <option value="active">Chỉ tiêm các mục "có thể kích hoạt" (Khuyên dùng)</option>
                <option value="all">Tiêm tất cả các mục</option>
              </select>
            </div>

            <div class="sg-grid2">
              <div class="sg-field">
                <label>Ký tự Worldbook tối đa</label>
                <input id="sg_worldbookMaxChars" type="number" min="500" max="50000">
              </div>
              <div class="sg-field">
                <label>Cửa sổ kiểm tra kích hoạt (Số tin nhắn gần đây)</label>
                <input id="sg_worldbookWindowMessages" type="number" min="5" max="80">
              </div>
            </div>

            <div class="sg-row sg-inline">
              <button class="menu_button sg-btn" id="sg_importWorldbook">Nhập JSON Worldbook</button>
              <button class="menu_button sg-btn" id="sg_clearWorldbook">Xóa Worldbook</button>
              <button class="menu_button sg-btn" id="sg_saveWorldbookSettings">Lưu cài đặt Worldbook</button>
            </div>

            <div class="sg-hint" id="sg_worldbookInfo">（Chưa nhập Worldbook）</div>
          </div>

          </div> <div class="sg-page" id="sg_page_summary">

          <div class="sg-card">
            <div class="sg-card-title">Tự động tóm tắt (Ghi vào Worldbook)</div>

            <div class="sg-row sg-inline">
              <label class="sg-check"><input type="checkbox" id="sg_summaryEnabled">Bật tự động tóm tắt</label>
              <span>Mỗi</span>
              <input id="sg_summaryEvery" type="number" min="1" max="200" style="width:90px">
              <span>tầng</span>
              <select id="sg_summaryCountMode">
                <option value="assistant">Đếm theo trả lời của AI</option>
                <option value="all">Đếm theo tất cả tin nhắn</option>
              </select>
            </div>

            <div class="sg-grid2">
              <div class="sg-field">
                <label>Tóm tắt Provider</label>
                <select id="sg_summaryProvider">
                  <option value="st">Dùng mô hình hiện tại của SillyTavern</option>
                  <option value="custom">Dùng API tương thích OpenAI độc lập</option>
                </select>
              </div>
              <div class="sg-field">
                <label>Tóm tắt Temperature</label>
                <input id="sg_summaryTemperature" type="number" min="0" max="2" step="0.1">
              </div>
            </div>

            <div class="sg-card sg-subcard">
              <div class="sg-field">
                <label>Prompt tóm tắt tùy chỉnh (System, Tùy chọn)</label>
                <textarea id="sg_summarySystemPrompt" rows="6" placeholder="Ví dụ: Nhấn mạnh manh mối/quan hệ/ghi chép theo lượt, hoặc yêu cầu tiếng Anh... (Vẫn cần xuất JSON)"></textarea>
              </div>
              <div class="sg-field">
                <label>Mẫu đoạn hội thoại (User, Tùy chọn)</label>
                <textarea id="sg_summaryUserTemplate" rows="4" placeholder="Hỗ trợ placeholder: {{fromFloor}} {{toFloor}} {{chunk}}"></textarea>
              </div>
              <div class="sg-row sg-inline">
                <button class="menu_button sg-btn" id="sg_summaryResetPrompt">Khôi phục prompt mặc định</button>
                <div class="sg-hint" style="margin-left:auto">Placeholder: {{fromFloor}} {{toFloor}} {{chunk}}。Tiện ích sẽ buộc xuất JSON: {title, summary, keywords[]}。</div>
              </div>
            </div>

            <div class="sg-card sg-subcard" id="sg_summary_custom_block" style="display:none">
              <div class="sg-grid2">
                <div class="sg-field">
                  <label>URL cơ sở API độc lập</label>
                  <input id="sg_summaryCustomEndpoint" type="text" placeholder="https://api.openai.com/v1">
                </div>
                <div class="sg-field">
                  <label>API Key</label>
                  <input id="sg_summaryCustomApiKey" type="password" placeholder="sk-...">
                </div>
              </div>
              <div class="sg-grid2">
                <div class="sg-field">
                  <label>ID Mô hình (Có thể tự điền)</label>
                  <input id="sg_summaryCustomModel" type="text" placeholder="gpt-4o-mini">
                  <div class="sg-row sg-inline" style="margin-top:6px;">
                    <button class="menu_button sg-btn" id="sg_refreshSummaryModels">Làm mới mô hình</button>
                    <select id="sg_summaryModelSelect" class="sg-model-select">
                      <option value="">（Chọn mô hình）</option>
                    </select>
                  </div>
                </div>
                <div class="sg-field">
                  <label>Max Tokens</label>
                  <input id="sg_summaryCustomMaxTokens" type="number" min="128" max="200000">
                </div>
              </div>
              <label class="sg-check"><input type="checkbox" id="sg_summaryCustomStream">stream (nếu hỗ trợ)</label>
            </div>

            <div class="sg-row sg-inline">
              <label class="sg-check"><input type="checkbox" id="sg_summaryToWorldInfo">Ghi vào Worldbook (Đèn Xanh Lá - Bật)</label>
              <select id="sg_summaryWorldInfoTarget">
                <option value="chatbook">Ghi vào Worldbook liên kết chat hiện tại</option>
                <option value="file">Ghi vào tên tệp Worldbook chỉ định</option>
              </select>
              <input id="sg_summaryWorldInfoFile" type="text" placeholder="Điền tên tệp khi Target=file" style="flex:1; min-width: 220px;">
            </div>

            <div class="sg-row sg-inline">
              <label class="sg-check"><input type="checkbox" id="sg_summaryToBlueWorldInfo">Đồng thời ghi vào Worldbook Đèn Xanh (Chỉ mục thường mở)</label>
              <input id="sg_summaryBlueWorldInfoFile" type="text" placeholder="Tên tệp Worldbook Đèn Xanh (Nên tạo riêng)" style="flex:1; min-width: 260px;">
            </div>

            <div class="sg-card sg-subcard" style="background: var(--SmartThemeBlurTintColor); margin-top: 8px;">
              <div class="sg-row sg-inline" style="align-items: center;">
                <label class="sg-check"><input type="checkbox" id="sg_autoBindWorldInfo">📒 Tự động liên kết Worldbook (Tạo Worldbook riêng cho mỗi chat)</label>
                <input id="sg_autoBindWorldInfoPrefix" type="text" placeholder="Tiền tố" style="width: 80px;" title="Tiền tố tên tệp Worldbook, mặc định SG">
              </div>
              <div class="sg-hint" style="margin-top: 4px;">Khi bật, mỗi cuộc trò chuyện sẽ tự động tạo Worldbook Đèn Xanh/Xanh Lá riêng, tự động tải khi chuyển chat.</div>
              <div id="sg_autoBindInfo" class="sg-hint" style="margin-top: 6px; display: none; font-size: 12px;"></div>
            </div>

            <div class="sg-grid2">
              <div class="sg-field">
                <label>Tiền tố tiêu đề mục (Ghi vào comment, luôn ở đầu)</label>
                <input id="sg_summaryWorldInfoCommentPrefix" type="text" placeholder="Tóm tắt cốt truyện">
              </div>
              <div class="sg-field">
                <label>Giới hạn: Ký tự tối đa mỗi tin / Tổng ký tự</label>
                <div class="sg-row" style="margin-top:0">
                  <input id="sg_summaryMaxChars" type="number" min="200" max="8000" style="width:110px">
                  <input id="sg_summaryMaxTotalChars" type="number" min="2000" max="80000" style="width:120px">
                </div>
              </div>
            </div>

            <div class="sg-grid2">
              <div class="sg-field">
                <label>Ghi từ khóa kích hoạt Worldbook vào key</label>
                <select id="sg_summaryWorldInfoKeyMode">
                  <option value="keywords">Dùng từ khóa mô hình xuất ra (6~14 từ)</option>
                  <option value="indexId">Dùng mã số chỉ mục (Chỉ 1 cái, vd A-001)</option>
                </select>
                <div class="sg-hint">Chọn "Mã số chỉ mục" nếu muốn từ khóa chính chỉ hiện A-001.</div>
              </div>
              <div class="sg-field" id="sg_summaryIndexFormat" style="display:none;">
                <label>Định dạng mã số chỉ mục (keyMode=indexId)</label>
                <div class="sg-row" style="margin-top:0; gap:8px; align-items:center;">
                  <input id="sg_summaryIndexPrefix" type="text" placeholder="A-" style="width:90px">
                  <span class="sg-hint">Số chữ số</span>
                  <input id="sg_summaryIndexPad" type="number" min="1" max="12" style="width:80px">
                  <span class="sg-hint">Bắt đầu</span>
                  <input id="sg_summaryIndexStart" type="number" min="1" max="1000000" style="width:100px">
                </div>
                <label class="sg-check" style="margin-top:6px;"><input type="checkbox" id="sg_summaryIndexInComment">Tiêu đề mục (comment) chứa mã số</label>
              </div>
            </div>

            <div class="sg-card sg-subcard">
              <div class="sg-row sg-inline">
                <label class="sg-check"><input type="checkbox" id="sg_wiTriggerEnabled">Bật "Chỉ mục Đèn Xanh → Kích hoạt Đèn Xanh Lá" (Tự động tiêm từ khóa trước khi gửi tin)</label>
              </div>
              <div class="sg-grid2">
                <div class="sg-field">
                  <label>Đọc N tin nhắn chính văn trước đó</label>
                  <input id="sg_wiTriggerLookbackMessages" type="number" min="5" max="120" placeholder="20">
                </div>
                <div class="sg-field">
                  <label>Số mục kích hoạt tối đa</label>
                  <input id="sg_wiTriggerMaxEntries" type="number" min="1" max="20" placeholder="4">
                </div>

<div class="sg-grid2">
  <div class="sg-field">
    <label>Phương thức khớp</label>
    <select id="sg_wiTriggerMatchMode">
      <option value="local">Độ tương đồng cục bộ (Nhanh)</option>
      <option value="llm">LLM phán đoán tổng hợp (Có thể tùy chỉnh prompt)</option>
    </select>
  </div>
  <div class="sg-field">
    <label>Lọc trước TopK (Chỉ chế độ LLM)</label>
    <input id="sg_wiIndexPrefilterTopK" type="number" min="5" max="80" placeholder="24">
    <div class="sg-hint">Dùng độ tương đồng chọn TopK trước, rồi để mô hình chọn ra các mục liên quan nhất (Tiết kiệm tokens).</div>
  </div>
</div>

<div class="sg-card sg-subcard" id="sg_index_llm_block" style="display:none; margin-top:10px;">
  <div class="sg-grid2">
    <div class="sg-field">
      <label>Provider Chỉ mục</label>
      <select id="sg_wiIndexProvider">
        <option value="st">Dùng mô hình hiện tại của SillyTavern</option>
        <option value="custom">Dùng API tương thích OpenAI độc lập</option>
      </select>
    </div>
    <div class="sg-field">
      <label>Chỉ mục Temperature</label>
      <input id="sg_wiIndexTemperature" type="number" min="0" max="2" step="0.1">
    </div>
  </div>

  <div class="sg-field">
    <label>Prompt chỉ mục tùy chỉnh (System, Tùy chọn)</label>
    <textarea id="sg_wiIndexSystemPrompt" rows="6" placeholder="Ví dụ: Nhấn mạnh quan hệ nhân vật/thu hồi manh mối/mục tiêu hiện tại; hoặc yêu cầu sàng lọc nghiêm ngặt hơn..."></textarea>
  </div>
  <div class="sg-field">
    <label>Mẫu chỉ mục (User, Tùy chọn)</label>
    <textarea id="sg_wiIndexUserTemplate" rows="6" placeholder="Hỗ trợ placeholder: {{userMessage}} {{recentText}} {{candidates}} {{maxPick}}"></textarea>
  </div>
  <div class="sg-row sg-inline">
    <button class="menu_button sg-btn" id="sg_wiIndexResetPrompt">Khôi phục prompt chỉ mục mặc định</button>
    <div class="sg-hint" style="margin-left:auto">Placeholder: {{userMessage}} {{recentText}} {{candidates}} {{maxPick}}。Tiện ích sẽ buộc xuất JSON: {pickedIds:number[]}。</div>
  </div>

  <div class="sg-card sg-subcard" id="sg_index_custom_block" style="display:none">
    <div class="sg-grid2">
      <div class="sg-field">
        <label>URL cơ sở API chỉ mục độc lập</label>
        <input id="sg_wiIndexCustomEndpoint" type="text" placeholder="https://api.openai.com/v1">
      </div>
      <div class="sg-field">
        <label>API Key</label>
        <input id="sg_wiIndexCustomApiKey" type="password" placeholder="sk-...">
      </div>
    </div>
    <div class="sg-grid2">
      <div class="sg-field">
        <label>ID Mô hình (Có thể tự điền)</label>
        <input id="sg_wiIndexCustomModel" type="text" placeholder="gpt-4o-mini">
        <div class="sg-row sg-inline" style="margin-top:6px;">
          <button class="menu_button sg-btn" id="sg_refreshIndexModels">Làm mới mô hình</button>
          <select id="sg_wiIndexModelSelect" class="sg-model-select">
            <option value="">（Chọn mô hình）</option>
          </select>
        </div>
      </div>
      <div class="sg-field">
        <label>Max Tokens</label>
        <input id="sg_wiIndexCustomMaxTokens" type="number" min="128" max="200000">
        <div class="sg-row sg-inline" style="margin-top:6px;">
          <span class="sg-hint">TopP</span>
          <input id="sg_wiIndexTopP" type="number" min="0" max="1" step="0.01" style="width:110px">
        </div>
      </div>
    </div>
    <label class="sg-check"><input type="checkbox" id="sg_wiIndexCustomStream">stream (nếu hỗ trợ)</label>
  </div>
</div>

              </div>
              <div class="sg-grid2">
                <div class="sg-field">
                  <label class="sg-check"><input type="checkbox" id="sg_wiTriggerIncludeUserMessage">Kết hợp đầu vào người dùng lần này (Phán đoán tổng hợp)</label>
                  <div class="sg-hint">Khi bật sẽ tổng hợp "N tin nhắn gần nhất + câu bạn đang nói" để quyết định mục liên quan nhất.</div>
                </div>
                <div class="sg-field">
                  <label>Trọng số đầu vào người dùng (0~10)</label>
                  <input id="sg_wiTriggerUserMessageWeight" type="number" min="0" max="10" step="0.1" placeholder="1.6">
                  <div class="sg-hint">Càng lớn càng coi trọng câu nói hiện tại; 1 = ngang với chính văn gần đây.</div>
                </div>
              </div>
              <div class="sg-grid2">
                <div class="sg-field">
                  <label>Ngưỡng độ liên quan (0~1)</label>
                  <input id="sg_wiTriggerMinScore" type="number" min="0" max="1" step="0.01" placeholder="0.08">
                </div>
                <div class="sg-field">
                  <label>Tiêm tối đa từ khóa</label>
                  <input id="sg_wiTriggerMaxKeywords" type="number" min="1" max="200" placeholder="24">
                </div>
              </div>
              <div class="sg-grid2">
                <div class="sg-field">
                  <label>Ít nhất có N trả lời từ AI mới bắt đầu chỉ mục (0=Ngay lập tức)</label>
                  <input id="sg_wiTriggerStartAfterAssistantMessages" type="number" min="0" max="200000" placeholder="0">
                </div>
                <div class="sg-field">
                  <label>Mô tả</label>
                  <div class="sg-hint" style="padding-top:8px;">(Chỉ tính số tầng AI trả lời; ví dụ điền 100 nghĩa là sau tầng 100 mới tiêm)</div>
                </div>
              </div>
              <div class="sg-row sg-inline">
                <label>Phương thức tiêm</label>
                <select id="sg_wiTriggerInjectStyle" style="min-width:200px">
                  <option value="hidden">Ẩn trong chú thích (Khuyên dùng)</option>
                  <option value="plain">Văn bản thường (Ổn định hơn)</option>
                </select>
              </div>
              <div class="sg-row sg-inline">
                <label>Chỉ mục Đèn Xanh</label>
                <select id="sg_wiBlueIndexMode" style="min-width:180px">
                  <option value="live">Đọc thời gian thực Worldbook Đèn Xanh</option>
                  <option value="cache">Sử dụng Nhập/Bộ nhớ đệm</option>
                </select>
                <input id="sg_wiBlueIndexFile" type="text" placeholder="Tên tệp Worldbook Đèn Xanh (Để trống = Dùng tên tệp ghi Đèn Xanh ở trên)" style="flex:1; min-width: 260px;">
                <button class="menu_button sg-btn" id="sg_refreshBlueIndexLive">Làm mới</button>
              </div>
              <div class="sg-row sg-inline">
                <label class="sg-check"><input type="checkbox" id="sg_wiTriggerDebugLog">Debug: Thanh trạng thái hiện mục trúng/từ khóa</label>
                <button class="menu_button sg-btn" id="sg_importBlueIndex">Nhập JSON Worldbook Đèn Xanh (Dự phòng)</button>
                <button class="menu_button sg-btn" id="sg_clearBlueIndex">Xóa chỉ mục Đèn Xanh</button>
                <div class="sg-hint" id="sg_blueIndexInfo" style="margin-left:auto">（Chỉ mục Đèn Xanh: 0 mục）</div>
              </div>
              <div class="sg-hint">
                Mô tả: Tính năng này sẽ dùng mỗi tóm tắt trong "Chỉ mục Đèn Xanh" (title/summary/keywords) để khớp độ tương đồng với <b>N tin nhắn gần nhất</b> (có thể cộng thêm <b>đầu vào người dùng hiện tại</b>), chọn ra các mục liên quan nhất, và thêm <b>keywords</b> của chúng vào cuối tin nhắn bạn vừa gửi (dạng chú thích ẩn/văn bản thường), từ đó kích hoạt mục tương ứng trong "Worldbook Đèn Xanh Lá".
              </div>

              <div class="sg-card sg-subcard" style="margin-top:10px;">
                <div class="sg-row sg-inline" style="margin-top:0;">
                  <div class="sg-hint">Cài đặt ROLL đã chuyển sang tab "Cài đặt ROLL" riêng.</div>
                  <div class="sg-spacer"></div>
                  <button class="menu_button sg-btn" id="sg_gotoRollPage">Mở Cài đặt ROLL</button>
                </div>
              </div>

              <div class="sg-card sg-subcard" style="margin-top:10px;">
                <div class="sg-row sg-inline" style="margin-top:0;">
                  <div class="sg-card-title" style="margin:0;">Nhật ký Chỉ mục</div>
                  <div class="sg-spacer"></div>
                  <button class="menu_button sg-btn" id="sg_clearWiLogs">Xóa</button>
                </div>
                <div class="sg-loglist" id="sg_wiLogs" style="margin-top:8px;">(Chưa có)</div>
                <div class="sg-hint" style="margin-top:8px;">Gợi ý: Nhật ký ghi lại "Gửi tin nhắn lần này đã trúng những mục chỉ mục nào (tương đương với mục Đèn Xanh Lá sẽ kích hoạt)" và đã tiêm những từ khóa nào.</div>
              </div>
            </div>

            <div class="sg-card sg-subcard" id="sg_indexMovedHint" style="margin-top:10px;">
              <div class="sg-row sg-inline" style="margin-top:0;">
                <div class="sg-hint">Cài đặt liên quan đến chỉ mục đã chuyển sang trang "Cài đặt Chỉ mục" ở trên.</div>
                <div class="sg-spacer"></div>
                <button class="menu_button sg-btn" id="sg_gotoIndexPage">Mở Cài đặt Chỉ mục</button>
              </div>
            </div>

            <div class="sg-row sg-inline">
              <label>Phạm vi tầng thủ công</label>
              <input id="sg_summaryManualFrom" type="number" min="1" style="width:110px" placeholder="Tầng bắt đầu">
              <span> - </span>
              <input id="sg_summaryManualTo" type="number" min="1" style="width:110px" placeholder="Tầng kết thúc">
              <button class="menu_button sg-btn" id="sg_summarizeRange">Tóm tắt phạm vi này ngay</button>
              <div class="sg-hint" id="sg_summaryManualHint" style="margin-left:auto">（Phạm vi tùy chọn：1-0）</div>
            </div>

            <div class="sg-row sg-inline" style="margin-top:6px;">
              <label class="sg-check" style="margin:0;"><input type="checkbox" id="sg_summaryManualSplit">Phạm vi thủ công tách thành nhiều mục theo mỗi N tầng (N = "Mỗi N tầng tóm tắt" ở trên)</label>
              <div class="sg-hint" style="margin-left:auto">Ví dụ 1-80 và N=40 → 2 mục</div>
            </div>

            <div class="sg-row sg-inline">
              <button class="menu_button sg-btn" id="sg_summarizeNow">Tóm tắt ngay</button>
              <button class="menu_button sg-btn" id="sg_resetSummaryState">Đặt lại tiến độ tóm tắt chat này</button>
              <div class="sg-hint" id="sg_summaryInfo" style="margin-left:auto">（Chưa tạo）</div>
            </div>

            <div class="sg-hint">
              Tự động tóm tắt sẽ kích hoạt theo "Mỗi N tầng"; mỗi lần xuất sẽ tạo <b>Tóm tắt</b> + <b>Từ khóa</b>, và có thể tự động tạo mục Worldbook (disable=0 Đèn Xanh Lá bật, từ khóa ghi vào key làm từ khóa kích hoạt).
            </div>
          </div>
          </div> <div class="sg-page" id="sg_page_index">
            <div class="sg-card">
              <div class="sg-card-title">Cài đặt Chỉ mục (Chỉ mục Đèn Xanh → Kích hoạt Đèn Xanh Lá)</div>
              <div class="sg-hint" style="margin-bottom:10px;">Chỉ mục sẽ chọn các mục tóm tắt liên quan nhất đến cốt truyện hiện tại từ "Worldbook Đèn Xanh", và tiêm từ khóa tương ứng vào cuối tin nhắn bạn gửi để kích hoạt mục Worldbook Đèn Xanh Lá.</div>
              <div id="sg_index_mount"></div>
            </div>
          </div> <div class="sg-page" id="sg_page_roll">
            <div class="sg-card">
              <div class="sg-card-title">Cài đặt ROLL (Phán định)</div>
              <div class="sg-hint" style="margin-bottom:10px;">Quy tắc tiêm và tính toán ROLL dùng cho phán định hành động. Mô-đun ROLL chạy độc lập, không phụ thuộc chức năng Tóm tắt hay Chỉ mục.</div>
              
              <label class="sg-check"><input type="checkbox" id="sg_wiRollEnabled">Bật ROLL (Phán định chiến đấu/thuyết phục/học tập...; tiêm cùng đầu vào người dùng)</label>
              <div class="sg-grid2">
                <div class="sg-field">
                  <label>Trọng số ngẫu nhiên (0~1)</label>
                  <input id="sg_wiRollRandomWeight" type="number" min="0" max="1" step="0.01" placeholder="0.3">
                </div>
                <div class="sg-field">
                  <label>Chế độ độ khó</label>
                  <select id="sg_wiRollDifficulty">
                    <option value="simple">Dễ</option>
                    <option value="normal">Bình thường</option>
                    <option value="hard">Khó</option>
                    <option value="hell">Địa ngục</option>
                  </select>
                </div>
              </div>
              <div class="sg-grid2">
                <div class="sg-field">
                  <label>Nguồn biến</label>
                  <select id="sg_wiRollStatSource">
                    <option value="variable">Tổng hợp đa nguồn (Ổn định nhất, khuyên dùng)</option>
                    <option value="template">Render mẫu (stat_data)</option>
                    <option value="latest">Cuối chính văn mới nhất</option>
                  </select>
                  <div class="sg-hint">Chế độ tổng hợp thử theo thứ tự: lệnh /getvar → Kho biến → Render mẫu → Đọc DOM → Phản hồi AI mới nhất</div>
                </div>
                <div class="sg-field">
                  <label>Chế độ phân tích biến</label>
                  <select id="sg_wiRollStatParseMode">
                    <option value="json">JSON</option>
                    <option value="kv">Dòng Key-Value (pc.atk=10)</option>
                  </select>
                </div>
              </div>
              <div class="sg-field">
                <label>Tên biến (Dùng cho nguồn "Kho biến")</label>
                <input id="sg_wiRollStatVarName" type="text" placeholder="stat_data">
              </div>
              <div class="sg-row sg-inline">
                <label>Phương thức tiêm</label>
                <select id="sg_wiRollInjectStyle">
                  <option value="hidden">Ẩn trong chú thích</option>
                  <option value="plain">Văn bản thường</option>
                </select>
              </div>
              <div class="sg-row sg-inline">
                <label class="sg-check" style="margin:0;"><input type="checkbox" id="sg_wiRollDebugLog">Debug: Thanh trạng thái hiện chi tiết phán định/lý do không kích hoạt</label>
              </div>
              <div class="sg-grid2">
                <div class="sg-field">
                  <label>ROLL Provider</label>
                  <select id="sg_wiRollProvider">
                    <option value="custom">API Độc lập</option>
                    <option value="local">Tính toán cục bộ</option>
                  </select>
                </div>
              </div>
              <div class="sg-card sg-subcard" id="sg_roll_custom_block" style="display:none; margin-top:8px;">
                <div class="sg-grid2">
                  <div class="sg-field">
                    <label>URL cơ sở API ROLL độc lập</label>
                    <input id="sg_wiRollCustomEndpoint" type="text" placeholder="https://api.openai.com/v1">
                  </div>
                  <div class="sg-field">
                    <label>API Key</label>
                    <input id="sg_wiRollCustomApiKey" type="password" placeholder="sk-...">
                  </div>
                </div>
                <div class="sg-grid2">
                  <div class="sg-field">
                    <label>ID Mô hình</label>
                    <input id="sg_wiRollCustomModel" type="text" placeholder="gpt-4o-mini">
                  </div>
                  <div class="sg-field">
                    <label>Max Tokens</label>
                    <input id="sg_wiRollCustomMaxTokens" type="number" min="128" max="200000">
                  </div>
                </div>
                <div class="sg-grid2">
                  <div class="sg-field">
                    <label>Temperature</label>
                    <input id="sg_wiRollCustomTemperature" type="number" min="0" max="2" step="0.1">
                  </div>
                  <div class="sg-field">
                    <label>TopP</label>
                    <input id="sg_wiRollCustomTopP" type="number" min="0" max="1" step="0.01">
                  </div>
                </div>
                <label class="sg-check"><input type="checkbox" id="sg_wiRollCustomStream">stream (nếu hỗ trợ)</label>
                <div class="sg-field" style="margin-top:8px;">
                  <label>Prompt hệ thống ROLL</label>
                  <textarea id="sg_wiRollSystemPrompt" rows="5"></textarea>
                </div>
              </div>
              <div class="sg-hint">AI sẽ phán đoán xem có cần phán định không trước, sau đó tính toán và tiêm kết quả. Chế độ "Tổng hợp đa nguồn" sẽ thử nhiều cách đọc biến để đảm bảo tương thích tốt nhất.</div>
            </div>
            <div class="sg-card sg-subcard" style="margin-top:10px;">
              <div class="sg-row sg-inline" style="margin-top:0;">
                <div class="sg-card-title" style="margin:0;">ROLL Nhật ký</div>
                <div class="sg-spacer"></div>
                <button class="menu_button sg-btn" id="sg_clearRollLogs">Xóa</button>
              </div>
              <div class="sg-loglist" id="sg_rollLogs" style="margin-top:8px;">(Chưa có)</div>
              <div class="sg-hint" style="margin-top:8px;">Gợi ý: Chỉ ghi lại tóm tắt tính toán vắn tắt do API ROLL trả về.</div>
            </div>
          </div> <div class="sg-status" id="sg_status"></div>
        </div>

        <div class="sg-right">
          <div class="sg-card">
            <div class="sg-card-title">Đầu ra</div>

            <div class="sg-tabs">
              <button class="sg-tab active" id="sg_tab_md">Báo cáo</button>
              <button class="sg-tab" id="sg_tab_json">JSON</button>
              <button class="sg-tab" id="sg_tab_src">Nguồn</button>
              <button class="sg-tab" id="sg_tab_sum">Tóm tắt</button>
              <div class="sg-spacer"></div>
              <button class="menu_button sg-btn" id="sg_copyMd" disabled>Sao chép MD</button>
              <button class="menu_button sg-btn" id="sg_copyJson" disabled>Sao chép JSON</button>
              <button class="menu_button sg-btn" id="sg_copySum" disabled>Sao chép Tóm tắt</button>
              <button class="menu_button sg-btn" id="sg_injectTips" disabled>Tiêm gợi ý</button>
            </div>

            <div class="sg-pane active" id="sg_pane_md"><div class="sg-md" id="sg_md">(Chưa tạo)</div></div>
            <div class="sg-pane" id="sg_pane_json"><pre class="sg-pre" id="sg_json"></pre></div>
            <div class="sg-pane" id="sg_pane_src"><pre class="sg-pre" id="sg_src"></pre></div>
            <div class="sg-pane" id="sg_pane_sum"><div class="sg-md" id="sg_sum">(Chưa tạo)</div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  `;
}

function ensureModal() {
  if (document.getElementById('sg_modal_backdrop')) return;
  document.body.insertAdjacentHTML('beforeend', buildModalHtml());

  // --- settings pages (Hướng dẫn cốt truyện / Cài đặt tóm tắt / Cài đặt chỉ mục / Cài đặt ROLL) ---
  setupSettingsPages();

  $('#sg_modal_backdrop').on('click', (e) => { if (e.target && e.target.id === 'sg_modal_backdrop') closeModal(); });
  $('#sg_close').on('click', closeModal);
  $('#sg_save_header').on('click', () => {
    try {
      console.log('[StoryGuide] Bắt đầu lưu...');
      pullUiToSettings(); // 1. Lấy dữ liệu từ giao diện
      saveSettings();     // 2. Ghi xuống file
      
      // 3. Thông báo thành công
      setStatus('✅ Đã lưu thành công! (Vui lòng đợi 3 giây trước khi F5)', 'ok');
      
      // Hiệu ứng nháy nút
      const btn = document.getElementById('sg_save_header');
      if(btn) {
          const oldText = btn.innerText;
          btn.innerText = "✅ Đã Ghi";
          setTimeout(() => btn.innerText = oldText, 2000);
      }
    } catch (e) {
      // 4. Nếu có lỗi, hiện đỏ lên để biết
      console.error('[StoryGuide] LỖI KHI LƯU:', e);
      setStatus('❌ LƯU THẤT BẠI: ' + e.message, 'err');
      alert('Lỗi khi lưu cài đặt: ' + e.message + '\nKiểm tra Console (F12) để xem chi tiết.');
    }
  });

  $('#sg_tab_md').on('click', () => showPane('md'));
  $('#sg_tab_json').on('click', () => showPane('json'));
  $('#sg_tab_src').on('click', () => showPane('src'));
  $('#sg_tab_sum').on('click', () => showPane('sum'));

  $('#sg_saveSettings').on('click', () => {
    pullUiToSettings();
    saveSettings();
    setStatus('Đã lưu cài đặt', 'ok');
  });

  $('#sg_analyze').on('click', async () => {
    pullUiToSettings();
    saveSettings();
    await runAnalysis();
  });

  $('#sg_saveWorld').on('click', async () => {
    try { await setChatMetaValue(META_KEYS.world, String($('#sg_worldText').val() || '')); setStatus('Đã lưu: Bổ sung Thế giới quan/Thiết lập (Chat này)', 'ok'); }
    catch (e) { setStatus(`Lưu thất bại: ${e?.message ?? e}`, 'err'); }
  });

  $('#sg_saveCanon').on('click', async () => {
    try { await setChatMetaValue(META_KEYS.canon, String($('#sg_canonText').val() || '')); setStatus('Đã lưu: Hậu bản Nguyên tác/Đại cương (Chat này)', 'ok'); }
    catch (e) { setStatus(`Lưu thất bại: ${e?.message ?? e}`, 'err'); }
  });

  $('#sg_copyMd').on('click', async () => {
    try { await navigator.clipboard.writeText(lastReport?.markdown ?? ''); setStatus('Đã sao chép: Báo cáo Markdown', 'ok'); }
    catch (e) { setStatus(`Sao chép thất bại: ${e?.message ?? e}`, 'err'); }
  });

  $('#sg_copyJson').on('click', async () => {
    try { await navigator.clipboard.writeText(lastJsonText || ''); setStatus('Đã sao chép: JSON', 'ok'); }
    catch (e) { setStatus(`Sao chép thất bại: ${e?.message ?? e}`, 'err'); }
  });

  $('#sg_copySum').on('click', async () => {
    try { await navigator.clipboard.writeText(lastSummaryText || ''); setStatus('Đã sao chép: Tóm tắt', 'ok'); }
    catch (e) { setStatus(`Sao chép thất bại: ${e?.message ?? e}`, 'err'); }
  });

  $('#sg_injectTips').on('click', () => {
    const tips = Array.isArray(lastReport?.json?.tips) ? lastReport.json.tips : [];
    const spoiler = ensureSettings().spoilerLevel;
    const text = tips.length
      ? `/sys 【Gợi ý Hướng dẫn Cốt truyện｜${spoiler}】\n` + tips.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : (lastReport?.markdown ?? '');

    const $ta = $('#send_textarea');
    if ($ta.length) { $ta.val(text).trigger('input'); setStatus('Đã đưa gợi ý vào khung nhập liệu (bạn có thể gửi thủ công)', 'ok'); }
    else setStatus('Không tìm thấy khung nhập liệu #send_textarea, không thể tiêm', 'err');
  });

  $('#sg_provider').on('change', () => {
    const provider = String($('#sg_provider').val());
    $('#sg_custom_block').toggle(provider === 'custom');
  });

  // summary provider toggle
  $('#sg_summaryProvider').on('change', () => {
    const p = String($('#sg_summaryProvider').val() || 'st');
    $('#sg_summary_custom_block').toggle(p === 'custom');
    pullUiToSettings(); saveSettings();
  });

  // roll provider toggle
  $('#sg_wiRollProvider').on('change', () => {
    const p = String($('#sg_wiRollProvider').val() || 'custom');
    $('#sg_roll_custom_block').toggle(p === 'custom');
    pullUiToSettings(); saveSettings();
  });


  // wiTrigger match mode toggle
  $('#sg_wiTriggerMatchMode').on('change', () => {
    const m = String($('#sg_wiTriggerMatchMode').val() || 'local');
    $('#sg_index_llm_block').toggle(m === 'llm');
    const p = String($('#sg_wiIndexProvider').val() || 'st');
    $('#sg_index_custom_block').toggle(m === 'llm' && p === 'custom');
    pullUiToSettings(); saveSettings();
  });

  // index provider toggle (only meaningful under LLM mode)
  $('#sg_wiIndexProvider').on('change', () => {
    const m = String($('#sg_wiTriggerMatchMode').val() || 'local');
    const p = String($('#sg_wiIndexProvider').val() || 'st');
    $('#sg_index_custom_block').toggle(m === 'llm' && p === 'custom');
    pullUiToSettings(); saveSettings();
  });

  // index prompt reset
  $('#sg_wiIndexResetPrompt').on('click', () => {
    $('#sg_wiIndexSystemPrompt').val(DEFAULT_INDEX_SYSTEM_PROMPT);
    $('#sg_wiIndexUserTemplate').val(DEFAULT_INDEX_USER_TEMPLATE);
    pullUiToSettings();
    saveSettings();
    setStatus('Đã khôi phục prompt chỉ mục mặc định ✅', 'ok');
  });

  $('#sg_summaryWorldInfoTarget').on('change', () => {
    const t = String($('#sg_summaryWorldInfoTarget').val() || 'chatbook');
    $('#sg_summaryWorldInfoFile').toggle(t === 'file');
    pullUiToSettings(); saveSettings();
  });

  $('#sg_summaryToBlueWorldInfo').on('change', () => {
    const checked = $('#sg_summaryToBlueWorldInfo').is(':checked');
    $('#sg_summaryBlueWorldInfoFile').toggle(!!checked);
    pullUiToSettings(); saveSettings();
    updateBlueIndexInfoLabel();
  });

  // summary key mode toggle (keywords vs indexId)
  $('#sg_summaryWorldInfoKeyMode').on('change', () => {
    const m = String($('#sg_summaryWorldInfoKeyMode').val() || 'keywords');
    $('#sg_summaryIndexFormat').toggle(m === 'indexId');
    pullUiToSettings();
    saveSettings();
  });

  // summary prompt reset
  $('#sg_summaryResetPrompt').on('click', () => {
    $('#sg_summarySystemPrompt').val(DEFAULT_SUMMARY_SYSTEM_PROMPT);
    $('#sg_summaryUserTemplate').val(DEFAULT_SUMMARY_USER_TEMPLATE);
    pullUiToSettings();
    saveSettings();
    setStatus('Đã khôi phục prompt tóm tắt mặc định ✅', 'ok');
  });

  // manual range split toggle & hint refresh
  $('#sg_summaryManualSplit').on('change', () => {
    pullUiToSettings();
    saveSettings();
    updateSummaryManualRangeHint(false);
  });
  $('#sg_summaryManualFrom, #sg_summaryManualTo, #sg_summaryEvery, #sg_summaryCountMode').on('input change', () => {
    // count mode / every affects the computed floor range and split pieces
    updateSummaryManualRangeHint(false);
  });

  // summary actions
  $('#sg_summarizeNow').on('click', async () => {
    try {
      pullUiToSettings();
      saveSettings();
      await runSummary({ reason: 'manual' });
    } catch (e) {
      setStatus(`Tóm tắt thất bại: ${e?.message ?? e}`, 'err');
    }
  });

  $('#sg_summarizeRange').on('click', async () => {
    try {
      pullUiToSettings();
      saveSettings();
      const from = clampInt($('#sg_summaryManualFrom').val(), 1, 200000, 1);
      const to = clampInt($('#sg_summaryManualTo').val(), 1, 200000, 1);
      await runSummary({ reason: 'manual_range', manualFromFloor: from, manualToFloor: to });
    } catch (e) {
      setStatus(`Tóm tắt phạm vi thủ công thất bại: ${e?.message ?? e}`, 'err');
    }
  });

  $('#sg_resetSummaryState').on('click', async () => {
    try {
      const meta = getDefaultSummaryMeta();
      await setSummaryMeta(meta);
      updateSummaryInfoLabel();
      renderSummaryPaneFromMeta();
      setStatus('Đã đặt lại tiến độ tóm tắt chat này ✅', 'ok');
    } catch (e) {
      setStatus(`Đặt lại thất bại: ${e?.message ?? e}`, 'err');
    }
  });

  // auto-save summary settings
  $('#sg_summaryEnabled, #sg_summaryEvery, #sg_summaryCountMode, #sg_summaryTemperature, #sg_summarySystemPrompt, #sg_summaryUserTemplate, #sg_summaryCustomEndpoint, #sg_summaryCustomApiKey, #sg_summaryCustomModel, #sg_summaryCustomMaxTokens, #sg_summaryCustomStream, #sg_summaryToWorldInfo, #sg_summaryWorldInfoFile, #sg_summaryWorldInfoCommentPrefix, #sg_summaryWorldInfoKeyMode, #sg_summaryIndexPrefix, #sg_summaryIndexPad, #sg_summaryIndexStart, #sg_summaryIndexInComment, #sg_summaryToBlueWorldInfo, #sg_summaryBlueWorldInfoFile, #sg_wiTriggerEnabled, #sg_wiTriggerLookbackMessages, #sg_wiTriggerIncludeUserMessage, #sg_wiTriggerUserMessageWeight, #sg_wiTriggerStartAfterAssistantMessages, #sg_wiTriggerMaxEntries, #sg_wiTriggerMinScore, #sg_wiTriggerMaxKeywords, #sg_wiTriggerInjectStyle, #sg_wiTriggerDebugLog, #sg_wiBlueIndexMode, #sg_wiBlueIndexFile, #sg_summaryMaxChars, #sg_summaryMaxTotalChars, #sg_wiTriggerMatchMode, #sg_wiIndexPrefilterTopK, #sg_wiIndexProvider, #sg_wiIndexTemperature, #sg_wiIndexSystemPrompt, #sg_wiIndexUserTemplate, #sg_wiIndexCustomEndpoint, #sg_wiIndexCustomApiKey, #sg_wiIndexCustomModel, #sg_wiIndexCustomMaxTokens, #sg_wiIndexTopP, #sg_wiIndexCustomStream, #sg_wiRollEnabled, #sg_wiRollStatSource, #sg_wiRollStatVarName, #sg_wiRollRandomWeight, #sg_wiRollDifficulty, #sg_wiRollInjectStyle, #sg_wiRollDebugLog, #sg_wiRollStatParseMode, #sg_wiRollProvider, #sg_wiRollCustomEndpoint, #sg_wiRollCustomApiKey, #sg_wiRollCustomModel, #sg_wiRollCustomMaxTokens, #sg_wiRollCustomTopP, #sg_wiRollCustomTemperature, #sg_wiRollCustomStream, #sg_wiRollSystemPrompt').on('change input', () => {
    pullUiToSettings();
    saveSettings();
    updateSummaryInfoLabel();
    updateBlueIndexInfoLabel();
    updateSummaryManualRangeHint(false);
  });

  $('#sg_refreshModels').on('click', async () => {
    pullUiToSettings(); saveSettings();
    await refreshModels();
  });

  $('#sg_refreshSummaryModels').on('click', async () => {
    pullUiToSettings(); saveSettings();
    await refreshSummaryModels();
  });


  $('#sg_refreshIndexModels').on('click', async () => {
    pullUiToSettings(); saveSettings();
    await refreshIndexModels();
  });

  $('#sg_modelSelect').on('change', () => {
    const id = String($('#sg_modelSelect').val() || '').trim();
    if (id) $('#sg_customModel').val(id);
  });

  $('#sg_summaryModelSelect').on('change', () => {
    const id = String($('#sg_summaryModelSelect').val() || '').trim();
    if (id) $('#sg_summaryCustomModel').val(id);
  });


  $('#sg_wiIndexModelSelect').on('change', () => {
    const id = String($('#sg_wiIndexModelSelect').val() || '').trim();
    if (id) $('#sg_wiIndexCustomModel').val(id);
  });

  // Blue Index import/clear
  $('#sg_refreshBlueIndexLive').on('click', async () => {
    try {
      pullUiToSettings();
      saveSettings();
      const s = ensureSettings();
      const mode = String(s.wiBlueIndexMode || 'live');
      if (mode !== 'live') {
        setStatus('Hiện tại là chế độ "Cache": Không đọc thời gian thực (Có thể chuyển sang "Đọc thời gian thực Worldbook Đèn Xanh")', 'warn');
        return;
      }
      const file = pickBlueIndexFileName();
      if (!file) {
        setStatus('Tên tệp Worldbook Đèn Xanh trống: Vui lòng điền tên tệp trong "Chỉ mục Đèn Xanh" hoặc trong "Đồng thời ghi vào Worldbook Đèn Xanh"', 'err');
        return;
      }
      const entries = await ensureBlueIndexLive(true);
      setStatus(`Đã đọc thời gian thực Worldbook Đèn Xanh ✅ (${entries.length} mục)`, entries.length ? 'ok' : 'warn');
    } catch (e) {
      setStatus(`Đọc thời gian thực Worldbook Đèn Xanh thất bại: ${e?.message ?? e}`, 'err');
    }
  });

  $('#sg_importBlueIndex').on('click', async () => {
    try {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      const txt = await readFileText(file);
      const entries = parseWorldbookJson(txt);
      const s = ensureSettings();
      // keep minimal fields
      s.summaryBlueIndex = entries.map(e => ({
        title: String(e.title || '').trim() || (e.keys?.[0] ? `Mục: ${e.keys[0]}` : 'Mục'),
        summary: String(e.content || '').trim(),
        keywords: Array.isArray(e.keys) ? e.keys.slice(0, 80) : [],
        importedAt: Date.now(),
      })).filter(x => x.summary);
      saveSettings();
      updateBlueIndexInfoLabel();
      setStatus(`Đã nhập chỉ mục Đèn Xanh ✅ (${s.summaryBlueIndex.length} mục)`, s.summaryBlueIndex.length ? 'ok' : 'warn');
    } catch (e) {
      setStatus(`Nhập chỉ mục Đèn Xanh thất bại: ${e?.message ?? e}`, 'err');
    }
  });

  $('#sg_clearBlueIndex').on('click', () => {
    const s = ensureSettings();
    s.summaryBlueIndex = [];
    saveSettings();
    updateBlueIndexInfoLabel();
    setStatus('Đã xóa chỉ mục Đèn Xanh', 'ok');
  });

  $('#sg_clearWiLogs').on('click', async () => {
    try {
      const meta = getSummaryMeta();
      meta.wiTriggerLogs = [];
      await setSummaryMeta(meta);
      renderWiTriggerLogs(meta);
      setStatus('Đã xóa nhật ký chỉ mục', 'ok');
    } catch (e) {
      setStatus(`Xóa nhật ký chỉ mục thất bại: ${e?.message ?? e}`, 'err');
    }
  });

  $('#sg_clearRollLogs').on('click', async () => {
    try {
      const meta = getSummaryMeta();
      meta.rollLogs = [];
      await setSummaryMeta(meta);
      renderRollLogs(meta);
      setStatus('Đã xóa nhật ký ROLL', 'ok');
    } catch (e) {
      setStatus(`Xóa nhật ký ROLL thất bại: ${e?.message ?? e}`, 'err');
    }
  });


  // presets actions
  $('#sg_exportPreset').on('click', () => {
    try {
      pullUiToSettings();
      const s = ensureSettings();
      const out = clone(s);

      const includeKey = $('#sg_presetIncludeApiKey').is(':checked');
      if (!includeKey) out.customApiKey = '';

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadTextFile(`storyguide-preset-${stamp}.json`, JSON.stringify(out, null, 2));
      setStatus('Đã xuất cài đặt sẵn ✅', 'ok');
    } catch (e) {
      setStatus(`Xuất thất bại: ${e?.message ?? e}`, 'err');
    }
  });

  $('#sg_importPreset').on('click', async () => {
    try {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      const txt = await readFileText(file);
      const data = JSON.parse(txt);

      if (!data || typeof data !== 'object') {
        setStatus('Nhập thất bại: Định dạng tệp cài đặt sẵn không đúng', 'err');
        return;
      }

      const s = ensureSettings();
      for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (Object.hasOwn(data, k)) s[k] = data[k];
      }

      if (!s.modulesJson) s.modulesJson = JSON.stringify(DEFAULT_MODULES, null, 2);

      saveSettings();
      pullSettingsToUi();
      setStatus('Đã nhập và áp dụng cài đặt sẵn ✅ (Khuyên bạn nên tải lại trang)', 'ok');

      scheduleReapplyAll('import_preset');
    } catch (e) {
      setStatus(`Nhập thất bại: ${e?.message ?? e}`, 'err');
    }
  });

  // worldbook actions
  $('#sg_importWorldbook').on('click', async () => {
    try {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      const txt = await readFileText(file);
      const entries = parseWorldbookJson(txt);

      const s = ensureSettings();
      s.worldbookJson = txt;
      saveSettings();

      updateWorldbookInfoLabel();
      setStatus('Đã nhập Worldbook ✅', entries.length ? 'ok' : 'warn');
    } catch (e) {
      setStatus(`Nhập Worldbook thất bại: ${e?.message ?? e}`, 'err');
    }
  });

  $('#sg_clearWorldbook').on('click', () => {
    const s = ensureSettings();
    s.worldbookJson = '';
    saveSettings();
    updateWorldbookInfoLabel();
    setStatus('Đã xóa Worldbook', 'ok');
  });

  $('#sg_saveWorldbookSettings').on('click', () => {
    try {
      pullUiToSettings();
      saveSettings();
      updateWorldbookInfoLabel();
      setStatus('Đã lưu cài đặt Worldbook ✅', 'ok');
    } catch (e) {
      setStatus(`Lưu cài đặt Worldbook thất bại: ${e?.message ?? e}`, 'err');
    }
  });

  // Auto save: worldbook related settings changes write immediately
  $('#sg_worldbookEnabled, #sg_worldbookMode').on('change', () => {
    pullUiToSettings();
    saveSettings();
    updateWorldbookInfoLabel();
  });
  $('#sg_worldbookMaxChars, #sg_worldbookWindowMessages').on('input', () => {
    pullUiToSettings();
    saveSettings();
    updateWorldbookInfoLabel();
  });

  // modules json actions
  $('#sg_validateModules').on('click', () => {
    const txt = String($('#sg_modulesJson').val() || '').trim();
    let parsed = null;
    try { parsed = JSON.parse(txt); } catch (e) {
      setStatus(`Phân tích JSON mô-đun thất bại: ${e?.message ?? e}`, 'err');
      return;
    }
    const v = validateAndNormalizeModules(parsed);
    if (!v.ok) {
      setStatus(`Kiểm tra mô-đun thất bại: ${v.error}`, 'err');
      return;
    }
    setStatus(`Kiểm tra mô-đun thành công ✅ (${v.modules.length} mô-đun)`, 'ok');
  });

  $('#sg_resetModules').on('click', () => {
    $('#sg_modulesJson').val(JSON.stringify(DEFAULT_MODULES, null, 2));
    setStatus('Đã khôi phục mô-đun mặc định (Chưa lưu, hãy nhấn "Áp dụng vào cài đặt")', 'warn');
  });

  $('#sg_applyModules').on('click', () => {
    const txt = String($('#sg_modulesJson').val() || '').trim();
    let parsed = null;
    try { parsed = JSON.parse(txt); } catch (e) {
      setStatus(`Phân tích JSON mô-đun thất bại: ${e?.message ?? e}`, 'err');
      return;
    }
    const v = validateAndNormalizeModules(parsed);
    if (!v.ok) { setStatus(`Kiểm tra mô-đun thất bại: ${v.error}`, 'err'); return; }

    const s = ensureSettings();
    s.modulesJson = JSON.stringify(v.modules, null, 2);
    saveSettings();
    $('#sg_modulesJson').val(s.modulesJson);
    setStatus('Đã áp dụng và lưu mô-đun ✅ (Lưu ý: Mô-đun hiển thị trong khung thêm được kiểm soát bởi "Nguồn mô-đun khung thêm")', 'ok');
  });

  // Refresh static modules cache
  $('#sg_clearStaticCache').on('click', async () => {
    try {
      await clearStaticModulesCache();
      setStatus('Đã xóa cache mô-đun tĩnh ✅ Lần phân tích tiếp theo sẽ tạo lại mô-đun tĩnh (như "Giới thiệu thế giới")', 'ok');
    } catch (e) {
      setStatus(`Xóa cache mô-đun tĩnh thất bại: ${e?.message ?? e}`, 'err');
    }
  });

  // Auto bind worldbook events
  $('#sg_autoBindWorldInfo').on('change', async () => {
    pullUiToSettings();
    saveSettings();
    const s = ensureSettings();
    if (s.autoBindWorldInfo) {
      await ensureBoundWorldInfo();
    }
    updateAutoBindUI();
  });

  $('#sg_autoBindWorldInfoPrefix').on('input', () => {
    pullUiToSettings();
    saveSettings();
  });

  // Quick options button events
  $('#sg_resetQuickOptions').on('click', () => {
    const defaultOptions = JSON.stringify([
      { label: 'Tiếp tục', prompt: 'Tiếp tục diễn biến cốt truyện hiện tại' },
      { label: 'Chi tiết', prompt: 'Vui lòng mô tả chi tiết hơn về cảnh tượng hiện tại' },
      { label: 'Đối thoại', prompt: 'Để các nhân vật triển khai thêm đối thoại' },
      { label: 'Hành động', prompt: 'Mô tả hành động cụ thể tiếp theo' },
    ], null, 2);
    $('#sg_quickOptionsJson').val(defaultOptions);
    const s = ensureSettings();
    s.quickOptionsJson = defaultOptions;
    saveSettings();
    setStatus('Đã khôi phục tùy chọn nhanh mặc định ✅', 'ok');
  });

  $('#sg_applyQuickOptions').on('click', () => {
    const txt = String($('#sg_quickOptionsJson').val() || '').trim();
    try {
      const arr = JSON.parse(txt || '[]');
      if (!Array.isArray(arr)) {
        setStatus('Lỗi định dạng tùy chọn nhanh: Phải là mảng JSON', 'err');
        return;
      }
      const s = ensureSettings();
      s.quickOptionsJson = JSON.stringify(arr, null, 2);
      saveSettings();
      $('#sg_quickOptionsJson').val(s.quickOptionsJson);
      setStatus('Đã áp dụng và lưu tùy chọn nhanh ✅', 'ok');
    } catch (e) {
      setStatus(`Phân tích JSON tùy chọn nhanh thất bại: ${e?.message ?? e}`, 'err');
    }
  });
}

function showSettingsPage(page) {
  const p = String(page || 'guide');
  $('#sg_pgtab_guide, #sg_pgtab_summary, #sg_pgtab_index, #sg_pgtab_roll').removeClass('active');
  $('#sg_page_guide, #sg_page_summary, #sg_page_index, #sg_page_roll').removeClass('active');

  if (p === 'summary') {
    $('#sg_pgtab_summary').addClass('active');
    $('#sg_page_summary').addClass('active');
  } else if (p === 'index') {
    $('#sg_pgtab_index').addClass('active');
    $('#sg_page_index').addClass('active');
  } else if (p === 'roll') {
    $('#sg_pgtab_roll').addClass('active');
    $('#sg_page_roll').addClass('active');
  } else {
    $('#sg_pgtab_guide').addClass('active');
    $('#sg_page_guide').addClass('active');
  }

  // Scroll to top after switching page to avoid "invisible settings"
  try { $('.sg-left').scrollTop(0); } catch { }
}

function setupSettingsPages() {
  // Move "Index Settings Block" from Summary page to Index page (preserve IDs, events still bind)
  try {
    const $mount = $('#sg_index_mount');
    const $idxWrapper = $('#sg_wiTriggerEnabled').closest('.sg-card.sg-subcard');
    if ($mount.length && $idxWrapper.length) {
      $mount.append($idxWrapper.children());
      $idxWrapper.remove();
    }
  } catch { /* ignore */ }

  // ROLL settings are already embedded in sg_page_roll, no move needed

  // tabs
  $('#sg_pgtab_guide').on('click', () => showSettingsPage('guide'));
  $('#sg_pgtab_summary').on('click', () => showSettingsPage('summary'));
  $('#sg_pgtab_index').on('click', () => showSettingsPage('index'));
  $('#sg_pgtab_roll').on('click', () => showSettingsPage('roll'));

  // quick jump
  $('#sg_gotoIndexPage').on('click', () => showSettingsPage('index'));
  $('#sg_gotoRollPage').on('click', () => showSettingsPage('roll'));
}

function pullSettingsToUi() {
  const s = ensureSettings();

  $('#sg_enabled').prop('checked', !!s.enabled);
  $('#sg_spoiler').val(s.spoilerLevel);
  $('#sg_provider').val(s.provider);
  $('#sg_temperature').val(s.temperature);

  $('#sg_maxMessages').val(s.maxMessages);
  $('#sg_maxChars').val(s.maxCharsPerMessage);

  $('#sg_includeUser').prop('checked', !!s.includeUser);
  $('#sg_includeAssistant').prop('checked', !!s.includeAssistant);

  $('#sg_autoRefresh').prop('checked', !!s.autoRefresh);
  $('#sg_autoRefreshOn').val(s.autoRefreshOn);

  $('#sg_autoAppendBox').prop('checked', !!s.autoAppendBox);
  $('#sg_appendMode').val(s.appendMode);

  $('#sg_inlineModulesSource').val(String(s.inlineModulesSource || 'inline'));
  $('#sg_inlineShowEmpty').prop('checked', !!s.inlineShowEmpty);

  $('#sg_customEndpoint').val(s.customEndpoint);
  $('#sg_customApiKey').val(s.customApiKey);
  $('#sg_customModel').val(s.customModel);

  fillModelSelect(Array.isArray(s.customModelsCache) ? s.customModelsCache : [], s.customModel);

  $('#sg_worldText').val(getChatMetaValue(META_KEYS.world));
  $('#sg_canonText').val(getChatMetaValue(META_KEYS.canon));

  $('#sg_modulesJson').val(String(s.modulesJson || JSON.stringify(DEFAULT_MODULES, null, 2)));
  $('#sg_customSystemPreamble').val(String(s.customSystemPreamble || ''));
  $('#sg_customConstraints').val(String(s.customConstraints || ''));

  // Quick options input
  $('#sg_quickOptionsEnabled').prop('checked', !!s.quickOptionsEnabled);
  $('#sg_quickOptionsShowIn').val(String(s.quickOptionsShowIn || 'inline'));
  $('#sg_quickOptionsJson').val(String(s.quickOptionsJson || '[]'));

  $('#sg_presetIncludeApiKey').prop('checked', !!s.presetIncludeApiKey);

  $('#sg_worldbookEnabled').prop('checked', !!s.worldbookEnabled);
  $('#sg_worldbookMode').val(String(s.worldbookMode || 'active'));
  $('#sg_worldbookMaxChars').val(s.worldbookMaxChars);
  $('#sg_worldbookWindowMessages').val(s.worldbookWindowMessages);

  updateWorldbookInfoLabel();

  try {
    const count = parseWorldbookJson(String(s.worldbookJson || '')).length;
    $('#sg_worldbookInfo').text(count ? `Đã nhập Worldbook: ${count} mục` : '（Chưa nhập Worldbook）');
  } catch {
    $('#sg_worldbookInfo').text('（Chưa nhập Worldbook）');
  }

  $('#sg_custom_block').toggle(s.provider === 'custom');

  // summary
  $('#sg_summaryEnabled').prop('checked', !!s.summaryEnabled);
  $('#sg_summaryEvery').val(s.summaryEvery);
  $('#sg_summaryManualSplit').prop('checked', !!s.summaryManualSplit);
  $('#sg_summaryCountMode').val(String(s.summaryCountMode || 'assistant'));
  $('#sg_summaryProvider').val(String(s.summaryProvider || 'st'));
  $('#sg_summaryTemperature').val(s.summaryTemperature);
  $('#sg_summarySystemPrompt').val(String(s.summarySystemPrompt || DEFAULT_SUMMARY_SYSTEM_PROMPT));
  $('#sg_summaryUserTemplate').val(String(s.summaryUserTemplate || DEFAULT_SUMMARY_USER_TEMPLATE));
  $('#sg_summaryCustomEndpoint').val(String(s.summaryCustomEndpoint || ''));
  $('#sg_summaryCustomApiKey').val(String(s.summaryCustomApiKey || ''));
  $('#sg_summaryCustomModel').val(String(s.summaryCustomModel || ''));
  fillSummaryModelSelect(Array.isArray(s.summaryCustomModelsCache) ? s.summaryCustomModelsCache : [], String(s.summaryCustomModel || ''));
  $('#sg_summaryCustomMaxTokens').val(s.summaryCustomMaxTokens || 2048);
  $('#sg_summaryCustomStream').prop('checked', !!s.summaryCustomStream);
  $('#sg_summaryToWorldInfo').prop('checked', !!s.summaryToWorldInfo);
  $('#sg_summaryWorldInfoTarget').val(String(s.summaryWorldInfoTarget || 'chatbook'));
  $('#sg_summaryWorldInfoFile').val(String(s.summaryWorldInfoFile || ''));
  $('#sg_summaryWorldInfoCommentPrefix').val(String(s.summaryWorldInfoCommentPrefix || 'Tóm tắt cốt truyện').trim() || 'Tóm tắt cốt truyện');
  $('#sg_summaryWorldInfoKeyMode').val(String(s.summaryWorldInfoKeyMode || 'keywords'));
  $('#sg_summaryIndexPrefix').val(String(s.summaryIndexPrefix || 'A-').trim() || 'A-');
  $('#sg_summaryIndexPad').val(s.summaryIndexPad ?? 3);
  $('#sg_summaryIndexStart').val(s.summaryIndexStart ?? 1);
  $('#sg_summaryIndexInComment').prop('checked', !!s.summaryIndexInComment);
  $('#sg_summaryToBlueWorldInfo').prop('checked', !!s.summaryToBlueWorldInfo);
  $('#sg_summaryBlueWorldInfoFile').val(String(s.summaryBlueWorldInfoFile || ''));

  // Auto bind worldbook
  $('#sg_autoBindWorldInfo').prop('checked', !!s.autoBindWorldInfo);
  $('#sg_autoBindWorldInfoPrefix').val(String(s.autoBindWorldInfoPrefix || 'SG').trim() || 'SG');

  s.wiTriggerEnabled = $('#sg_wiTriggerEnabled').is(':checked');
  s.wiTriggerLookbackMessages = clampInt($('#sg_wiTriggerLookbackMessages').val(), 5, 120, s.wiTriggerLookbackMessages || 20);
  s.wiTriggerIncludeUserMessage = $('#sg_wiTriggerIncludeUserMessage').is(':checked');
  s.wiTriggerUserMessageWeight = clampFloat($('#sg_wiTriggerUserMessageWeight').val(), 0, 10, s.wiTriggerUserMessageWeight ?? 1.6);
  s.wiTriggerStartAfterAssistantMessages = clampInt($('#sg_wiTriggerStartAfterAssistantMessages').val(), 0, 200000, s.wiTriggerStartAfterAssistantMessages || 0);
  s.wiTriggerMaxEntries = clampInt($('#sg_wiTriggerMaxEntries').val(), 1, 20, s.wiTriggerMaxEntries || 4);
  s.wiTriggerMinScore = clampFloat($('#sg_wiTriggerMinScore').val(), 0, 1, (s.wiTriggerMinScore ?? 0.08));
  s.wiTriggerMaxKeywords = clampInt($('#sg_wiTriggerMaxKeywords').val(), 1, 200, s.wiTriggerMaxKeywords || 24);
  s.wiTriggerInjectStyle = String($('#sg_wiTriggerInjectStyle').val() || s.wiTriggerInjectStyle || 'hidden');
  s.wiTriggerDebugLog = $('#sg_wiTriggerDebugLog').is(':checked');

  s.wiRollEnabled = $('#sg_wiRollEnabled').is(':checked');
  s.wiRollStatSource = String($('#sg_wiRollStatSource').val() || s.wiRollStatSource || 'variable');
  s.wiRollStatVarName = String($('#sg_wiRollStatVarName').val() || s.wiRollStatVarName || 'stat_data').trim();
  s.wiRollRandomWeight = clampFloat($('#sg_wiRollRandomWeight').val(), 0, 1, s.wiRollRandomWeight ?? 0.3);
  s.wiRollDifficulty = String($('#sg_wiRollDifficulty').val() || s.wiRollDifficulty || 'normal');
  s.wiRollInjectStyle = String($('#sg_wiRollInjectStyle').val() || s.wiRollInjectStyle || 'hidden');
  s.wiRollDebugLog = $('#sg_wiRollDebugLog').is(':checked');
  s.wiRollStatParseMode = String($('#sg_wiRollStatParseMode').val() || s.wiRollStatParseMode || 'json');
  s.wiRollProvider = String($('#sg_wiRollProvider').val() || s.wiRollProvider || 'custom');
  s.wiRollCustomEndpoint = String($('#sg_wiRollCustomEndpoint').val() || s.wiRollCustomEndpoint || '').trim();
  s.wiRollCustomApiKey = String($('#sg_wiRollCustomApiKey').val() || s.wiRollCustomApiKey || '');
  s.wiRollCustomModel = String($('#sg_wiRollCustomModel').val() || s.wiRollCustomModel || 'gpt-4o-mini');
  s.wiRollCustomMaxTokens = clampInt($('#sg_wiRollCustomMaxTokens').val(), 128, 200000, s.wiRollCustomMaxTokens || 512);
  s.wiRollCustomTopP = clampFloat($('#sg_wiRollCustomTopP').val(), 0, 1, s.wiRollCustomTopP ?? 0.95);
  s.wiRollCustomTemperature = clampFloat($('#sg_wiRollCustomTemperature').val(), 0, 2, s.wiRollCustomTemperature ?? 0.2);
  s.wiRollCustomStream = $('#sg_wiRollCustomStream').is(':checked');
  s.wiRollSystemPrompt = String($('#sg_wiRollSystemPrompt').val() || '').trim() || DEFAULT_ROLL_SYSTEM_PROMPT;

  s.wiTriggerMatchMode = String($('#sg_wiTriggerMatchMode').val() || s.wiTriggerMatchMode || 'local');
  s.wiIndexPrefilterTopK = clampInt($('#sg_wiIndexPrefilterTopK').val(), 5, 80, s.wiIndexPrefilterTopK ?? 24);
  s.wiIndexProvider = String($('#sg_wiIndexProvider').val() || s.wiIndexProvider || 'st');
  s.wiIndexTemperature = clampFloat($('#sg_wiIndexTemperature').val(), 0, 2, s.wiIndexTemperature ?? 0.2);
  s.wiIndexSystemPrompt = String($('#sg_wiIndexSystemPrompt').val() || s.wiIndexSystemPrompt || DEFAULT_INDEX_SYSTEM_PROMPT);
  s.wiIndexUserTemplate = String($('#sg_wiIndexUserTemplate').val() || s.wiIndexUserTemplate || DEFAULT_INDEX_USER_TEMPLATE);
  s.wiIndexCustomEndpoint = String($('#sg_wiIndexCustomEndpoint').val() || s.wiIndexCustomEndpoint || '');
  s.wiIndexCustomApiKey = String($('#sg_wiIndexCustomApiKey').val() || s.wiIndexCustomApiKey || '');
  s.wiIndexCustomModel = String($('#sg_wiIndexCustomModel').val() || s.wiIndexCustomModel || 'gpt-4o-mini');
  s.wiIndexCustomMaxTokens = clampInt($('#sg_wiIndexCustomMaxTokens').val(), 128, 200000, s.wiIndexCustomMaxTokens || 1024);
  s.wiIndexTopP = clampFloat($('#sg_wiIndexTopP').val(), 0, 1, s.wiIndexTopP ?? 0.95);
  s.wiIndexCustomStream = $('#sg_wiIndexCustomStream').is(':checked');

  s.wiBlueIndexMode = String($('#sg_wiBlueIndexMode').val() || s.wiBlueIndexMode || 'live');
  s.wiBlueIndexFile = String($('#sg_wiBlueIndexFile').val() || '').trim();
  s.summaryMaxCharsPerMessage = clampInt($('#sg_summaryMaxChars').val(), 200, 8000, s.summaryMaxCharsPerMessage || 4000);
  s.summaryMaxTotalChars = clampInt($('#sg_summaryMaxTotalChars').val(), 2000, 80000, s.summaryMaxTotalChars || 24000);

  $('#sg_summary_custom_block').toggle(String(s.summaryProvider || 'st') === 'custom');
  $('#sg_summaryWorldInfoFile').toggle(String(s.summaryWorldInfoTarget || 'chatbook') === 'file');
  $('#sg_summaryBlueWorldInfoFile').toggle(!!s.summaryToBlueWorldInfo);
  $('#sg_summaryIndexFormat').toggle(String(s.summaryWorldInfoKeyMode || 'keywords') === 'indexId');

  updateBlueIndexInfoLabel();

  updateSummaryInfoLabel();
  renderSummaryPaneFromMeta();
  renderWiTriggerLogs();
  renderRollLogs();

  updateButtonsEnabled();
}

function updateBlueIndexInfoLabel() {
  const $info = $('#sg_blueIndexInfo');
  if (!$info.length) return;
  const s = ensureSettings();
  const count = Array.isArray(s.summaryBlueIndex) ? s.summaryBlueIndex.length : 0;
  const mode = String(s.wiBlueIndexMode || 'live');
  if (mode === 'live') {
    const file = pickBlueIndexFileName();
    const ts = blueIndexLiveCache?.loadedAt ? new Date(Number(blueIndexLiveCache.loadedAt)).toLocaleTimeString() : '';
    const err = String(blueIndexLiveCache?.lastError || '').trim();
    const errShort = err ? err.replace(/\s+/g, ' ').slice(0, 60) + (err.length > 60 ? '…' : '') : '';
    $info.text(`（Chỉ mục Đèn Xanh: ${count} mục｜Thời gian thực: ${file || 'Chưa thiết lập'}${ts ? `｜Cập nhật: ${ts}` : ''}${errShort ? `｜Đọc thất bại: ${errShort}` : ''}）`);
  } else {
    $info.text(`（Chỉ mục Đèn Xanh: ${count} mục｜Cache）`);
  }
}

// -------------------- wiTrigger logs (per chat meta) --------------------

function formatTimeShort(ts) {
  try {
    const d = new Date(Number(ts) || Date.now());
    return d.toLocaleTimeString();
  } catch {
    return '';
  }
}

function renderWiTriggerLogs(metaOverride = null) {
  const $box = $('#sg_wiLogs');
  if (!$box.length) return;
  const meta = metaOverride || getSummaryMeta();
  const logs = Array.isArray(meta?.wiTriggerLogs) ? meta.wiTriggerLogs : [];
  if (!logs.length) {
    $box.html('<div class="sg-hint">(Chưa có)</div>');
    return;
  }

  const shown = logs.slice(0, 30);
  const html = shown.map((l) => {
    const ts = formatTimeShort(l.ts);
    const skipped = l.skipped === true;
    const picked = Array.isArray(l.picked) ? l.picked : [];
    const titles = picked.map(x => String(x?.title || '').trim()).filter(Boolean);
    const titleShort = titles.length
      ? (titles.slice(0, 4).join('；') + (titles.length > 4 ? '…' : ''))
      : '（Không có mục trúng）';
    const user = String(l.userText || '').replace(/\s+/g, ' ').trim();
    const userShort = user ? (user.slice(0, 120) + (user.length > 120 ? '…' : '')) : '';
    const kws = Array.isArray(l.injectedKeywords) ? l.injectedKeywords : [];
    const kwsShort = kws.length ? (kws.slice(0, 20).join('、') + (kws.length > 20 ? '…' : '')) : '';

    if (skipped) {
      const assistantFloors = Number(l.assistantFloors || 0);
      const startAfter = Number(l.startAfter || 0);
      const reasonKey = String(l.skippedReason || '').trim();
      const reasonText = reasonKey === 'minAssistantFloors'
        ? `Tầng trả lời của AI chưa đủ (${assistantFloors}/${startAfter})`
        : (reasonKey || 'Bỏ qua');
      const detailsLines = [];
      if (userShort) detailsLines.push(`<div><b>Đầu vào người dùng</b>：${escapeHtml(userShort)}</div>`);
      detailsLines.push(`<div><b>Chưa kích hoạt</b>：${escapeHtml(reasonText)}</div>`);
      return `
      <details>
        <summary>${escapeHtml(`${ts}｜Chưa kích hoạt：${reasonText}`)}</summary>
        <div class="sg-log-body">${detailsLines.join('')}</div>
      </details>
    `;
    }

    const detailsLines = [];
    if (userShort) detailsLines.push(`<div><b>Đầu vào người dùng</b>：${escapeHtml(userShort)}</div>`);
    detailsLines.push(`<div><b>Sẽ kích hoạt mục Đèn Xanh Lá</b>：${escapeHtml(titles.join('；') || '（Không）')}</div>`);
    detailsLines.push(`<div><b>Tiêm từ khóa kích hoạt</b>：${escapeHtml(kwsShort || '（Không）')}</div>`);
    if (picked.length) {
      const scored = picked.map(x => `${String(x.title || '').trim()}（${Number(x.score || 0).toFixed(2)}）`).join('；');
      detailsLines.push(`<div class="sg-hint">Độ tương đồng：${escapeHtml(scored)}</div>`);
    }
    return `
      <details>
        <summary>${escapeHtml(`${ts}｜Trúng ${titles.length} mục：${titleShort}`)}</summary>
        <div class="sg-log-body">${detailsLines.join('')}</div>
      </details>
    `;
  }).join('');

  $box.html(html);
}

function appendWiTriggerLog(log) {
  try {
    const meta = getSummaryMeta();
    const arr = Array.isArray(meta.wiTriggerLogs) ? meta.wiTriggerLogs : [];
    arr.unshift(log);
    meta.wiTriggerLogs = arr.slice(0, 50);
    // Don't await: avoid blocking MESSAGE_SENT
    setSummaryMeta(meta).catch(() => void 0);
    if ($('#sg_modal_backdrop').is(':visible')) renderWiTriggerLogs(meta);
  } catch { /* ignore */ }
}

function renderRollLogs(metaOverride = null) {
  const $box = $('#sg_rollLogs');
  if (!$box.length) return;
  const meta = metaOverride || getSummaryMeta();
  const logs = Array.isArray(meta?.rollLogs) ? meta.rollLogs : [];
  if (!logs.length) {
    $box.html('(Chưa có)');
    return;
  }
  const shown = logs.slice(0, 30);
  const html = shown.map((l) => {
    const ts = l?.ts ? new Date(l.ts).toLocaleString() : '';
    const action = String(l?.action || '').trim();
    const outcome = String(l?.outcomeTier || '').trim()
      || (l?.success == null ? 'N/A' : (l.success ? 'Thành công' : 'Thất bại'));
    const finalVal = Number.isFinite(Number(l?.final)) ? Number(l.final).toFixed(2) : '';
    let summary = '';
    if (l?.summary && typeof l.summary === 'object') {
      const pick = l.summary.summary ?? l.summary.text ?? l.summary.message;
      summary = String(pick || '').trim();
      if (!summary) {
        try { summary = JSON.stringify(l.summary); } catch { summary = String(l.summary); }
      }
    } else {
      summary = String(l?.summary || '').trim();
    }
    const userShort = String(l?.userText || '').trim().slice(0, 160);

    const detailsLines = [];
    if (userShort) detailsLines.push(`<div><b>Đầu vào người dùng</b>：${escapeHtml(userShort)}</div>`);
    if (summary) detailsLines.push(`<div><b>Tóm tắt</b>：${escapeHtml(summary)}</div>`);
    return `
      <details>
        <summary>${escapeHtml(`${ts}｜${action || 'ROLL'}｜${outcome}${finalVal ? `｜Cuối cùng=${finalVal}` : ''}`)}</summary>
        <div class="sg-log-body">${detailsLines.join('')}</div>
      </details>
    `;
  }).join('');
  $box.html(html);
}

function appendRollLog(log) {
  try {
    const meta = getSummaryMeta();
    const arr = Array.isArray(meta.rollLogs) ? meta.rollLogs : [];
    arr.unshift(log);
    meta.rollLogs = arr.slice(0, 50);
    setSummaryMeta(meta).catch(() => void 0);
    if ($('#sg_modal_backdrop').is(':visible')) renderRollLogs(meta);
  } catch { /* ignore */ }
}

function updateWorldbookInfoLabel() {
  const s = ensureSettings();
  const $info = $('#sg_worldbookInfo');
  if (!$info.length) return;

  try {
    if (!s.worldbookJson) {
      $info.text('（Chưa nhập Worldbook）');
      return;
    }
    const stats = computeWorldbookInjection();
    const base = `Đã nhập Worldbook: ${stats.importedEntries} mục`;
    if (!s.worldbookEnabled) {
      $info.text(`${base}（Chưa bật tiêm）`);
      return;
    }
    if (stats.mode === 'active' && stats.selectedEntries === 0) {
      $info.text(`${base}｜Chế độ: active｜Lần này không có mục trúng (0 mục)`);
      return;
    }
    $info.text(`${base}｜Chế độ: ${stats.mode}｜Lần này tiêm: ${stats.injectedEntries} mục｜Ký tự: ${stats.injectedChars}｜Khoảng tokens: ${stats.injectedTokens}`);
  } catch {
    $info.text('（Phân tích thông tin Worldbook thất bại）');
  }
}

function formatSummaryMetaHint(meta) {
  const last = Number(meta?.lastFloor || 0);
  const count = Array.isArray(meta?.history) ? meta.history.length : 0;
  if (!last && !count) return '（Chưa tạo）';
  return `Đã tạo ${count} lần｜Tầng kích hoạt lần trước: ${last}`;
}

function updateSummaryInfoLabel() {
  const $info = $('#sg_summaryInfo');
  if (!$info.length) return;
  try {
    const meta = getSummaryMeta();
    $info.text(formatSummaryMetaHint(meta));
  } catch {
    $info.text('（Phân tích trạng thái tóm tắt thất bại）');
  }
}


function updateSummaryManualRangeHint(setDefaults = false) {
  const $hint = $('#sg_summaryManualHint');
  if (!$hint.length) return;

  try {
    const s = ensureSettings();
    const ctx = SillyTavern.getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const mode = String(s.summaryCountMode || 'assistant');
    const floorNow = computeFloorCount(chat, mode);
    const every = clampInt(s.summaryEvery, 1, 200, 20);

    // Optional: show how many entries would be generated when manual split is enabled.
    const $from = $('#sg_summaryManualFrom');
    const $to = $('#sg_summaryManualTo');
    let extra = '';
    if (s.summaryManualSplit) {
      const fromVal0 = String($from.val() ?? '').trim();
      const toVal0 = String($to.val() ?? '').trim();
      const fromN = Number(fromVal0);
      const toN = Number(toVal0);
      if (Number.isFinite(fromN) && Number.isFinite(toN) && fromN > 0 && toN > 0 && floorNow > 0) {
        const a = clampInt(fromN, 1, floorNow, 1);
        const b = clampInt(toN, 1, floorNow, floorNow);
        const len = Math.abs(b - a) + 1;
        const pieces = Math.max(1, Math.ceil(len / every));
        extra = `｜Phân đoạn: ${pieces} mục (Mỗi ${every} tầng)`;
      } else {
        extra = `｜Phân đoạn: Mỗi ${every} tầng một mục`;
      }
    }

    $hint.text(`（Phạm vi tùy chọn: 1-${floorNow || 0}${extra}）`);
    if (!$from.length || !$to.length) return;

    const fromVal = String($from.val() ?? '').trim();
    const toVal = String($to.val() ?? '').trim();

    if (setDefaults && floorNow > 0 && (!fromVal || !toVal)) {
      const a = Math.max(1, floorNow - every + 1);
      $from.val(a);
      $to.val(floorNow);
    }
  } catch {
    $hint.text('（Phạm vi tùy chọn: ?）');
  }
}

function renderSummaryPaneFromMeta() {
  const $el = $('#sg_sum');
  if (!$el.length) return;

  const meta = getSummaryMeta();
  const hist = Array.isArray(meta.history) ? meta.history : [];

  if (!hist.length) {
    lastSummary = null;
    lastSummaryText = '';
    $el.html('(Chưa tạo)');
    updateButtonsEnabled();
    return;
  }

  const last = hist[hist.length - 1];
  lastSummary = last;
  lastSummaryText = String(last?.summary || '');

  const md = hist.slice(-12).reverse().map((h, idx) => {
    const title = String(h.title || `${ensureSettings().summaryWorldInfoCommentPrefix || 'Tóm tắt cốt truyện'} #${hist.length - idx}`);
    const kws = Array.isArray(h.keywords) ? h.keywords : [];
    const when = h.createdAt ? new Date(h.createdAt).toLocaleString() : '';
    const range = h?.range ? `（${h.range.fromFloor}-${h.range.toFloor}）` : '';
    return `### ${title} ${range}\n\n- Thời gian: ${when}\n- Từ khóa: ${kws.join('、') || '（Không）'}\n\n${h.summary || ''}`;
  }).join('\n\n---\n\n');

  renderMarkdownInto($el, md);
  updateButtonsEnabled();
}


function pullUiToSettings() {
  const s = ensureSettings();

  s.enabled = $('#sg_enabled').is(':checked');
  s.spoilerLevel = String($('#sg_spoiler').val());
  s.provider = String($('#sg_provider').val());
  s.temperature = clampFloat($('#sg_temperature').val(), 0, 2, s.temperature);

  s.maxMessages = clampInt($('#sg_maxMessages').val(), 5, 200, s.maxMessages);
  s.maxCharsPerMessage = clampInt($('#sg_maxChars').val(), 200, 8000, s.maxCharsPerMessage);

  s.includeUser = $('#sg_includeUser').is(':checked');
  s.includeAssistant = $('#sg_includeAssistant').is(':checked');

  s.autoRefresh = $('#sg_autoRefresh').is(':checked');
  s.autoRefreshOn = String($('#sg_autoRefreshOn').val());

  s.autoAppendBox = $('#sg_autoAppendBox').is(':checked');
  s.appendMode = String($('#sg_appendMode').val() || 'compact');

  s.inlineModulesSource = String($('#sg_inlineModulesSource').val() || 'inline');
  s.inlineShowEmpty = $('#sg_inlineShowEmpty').is(':checked');

  s.customEndpoint = String($('#sg_customEndpoint').val() || '').trim();
  s.customApiKey = String($('#sg_customApiKey').val() || '');
  s.customModel = String($('#sg_customModel').val() || '').trim();
  s.customMaxTokens = clampInt($('#sg_customMaxTokens').val(), 256, 200000, s.customMaxTokens || 8192);
  s.customStream = $('#sg_customStream').is(':checked');

  // modulesJson: Don't validate strictly here (allow user to save then validate), but will use default fallback before analysis
  s.modulesJson = String($('#sg_modulesJson').val() || '').trim() || JSON.stringify(DEFAULT_MODULES, null, 2);

  s.customSystemPreamble = String($('#sg_customSystemPreamble').val() || '');
  s.customConstraints = String($('#sg_customConstraints').val() || '');

  // Quick options write
  s.quickOptionsEnabled = $('#sg_quickOptionsEnabled').is(':checked');
  s.quickOptionsShowIn = String($('#sg_quickOptionsShowIn').val() || 'inline');
  s.quickOptionsJson = String($('#sg_quickOptionsJson').val() || '[]');

  s.presetIncludeApiKey = $('#sg_presetIncludeApiKey').is(':checked');

  s.worldbookEnabled = $('#sg_worldbookEnabled').is(':checked');
  s.worldbookMode = String($('#sg_worldbookMode').val() || 'active');
  s.worldbookMaxChars = clampInt($('#sg_worldbookMaxChars').val(), 500, 50000, s.worldbookMaxChars || 6000);
  s.worldbookWindowMessages = clampInt($('#sg_worldbookWindowMessages').val(), 5, 80, s.worldbookWindowMessages || 18);

  // summary
  s.summaryEnabled = $('#sg_summaryEnabled').is(':checked');
  s.summaryEvery = clampInt($('#sg_summaryEvery').val(), 1, 200, s.summaryEvery || 20);
  s.summaryManualSplit = $('#sg_summaryManualSplit').is(':checked');
  s.summaryCountMode = String($('#sg_summaryCountMode').val() || 'assistant');
  s.summaryProvider = String($('#sg_summaryProvider').val() || 'st');
  s.summaryTemperature = clampFloat($('#sg_summaryTemperature').val(), 0, 2, s.summaryTemperature || 0.4);
  s.summarySystemPrompt = String($('#sg_summarySystemPrompt').val() || '').trim() || DEFAULT_SUMMARY_SYSTEM_PROMPT;
  s.summaryUserTemplate = String($('#sg_summaryUserTemplate').val() || '').trim() || DEFAULT_SUMMARY_USER_TEMPLATE;
  s.summaryCustomEndpoint = String($('#sg_summaryCustomEndpoint').val() || '').trim();
  s.summaryCustomApiKey = String($('#sg_summaryCustomApiKey').val() || '');
  s.summaryCustomModel = String($('#sg_summaryCustomModel').val() || '').trim() || 'gpt-4o-mini';
  s.summaryCustomMaxTokens = clampInt($('#sg_summaryCustomMaxTokens').val(), 128, 200000, s.summaryCustomMaxTokens || 2048);
  s.summaryCustomStream = $('#sg_summaryCustomStream').is(':checked');
  s.summaryToWorldInfo = $('#sg_summaryToWorldInfo').is(':checked');
  s.summaryWorldInfoTarget = String($('#sg_summaryWorldInfoTarget').val() || 'chatbook');
  s.summaryWorldInfoFile = String($('#sg_summaryWorldInfoFile').val() || '').trim();
  s.summaryWorldInfoCommentPrefix = String($('#sg_summaryWorldInfoCommentPrefix').val() || 'Tóm tắt cốt truyện').trim() || 'Tóm tắt cốt truyện';
  s.summaryWorldInfoKeyMode = String($('#sg_summaryWorldInfoKeyMode').val() || 'keywords');
  s.summaryIndexPrefix = String($('#sg_summaryIndexPrefix').val() || 'A-').trim() || 'A-';
  s.summaryIndexPad = clampInt($('#sg_summaryIndexPad').val(), 1, 12, s.summaryIndexPad ?? 3);
  s.summaryIndexStart = clampInt($('#sg_summaryIndexStart').val(), 1, 1000000, s.summaryIndexStart ?? 1);
  s.summaryIndexInComment = $('#sg_summaryIndexInComment').is(':checked');
  s.summaryToBlueWorldInfo = $('#sg_summaryToBlueWorldInfo').is(':checked');
  s.summaryBlueWorldInfoFile = String($('#sg_summaryBlueWorldInfoFile').val() || '').trim();

  // Auto bind worldbook
  s.autoBindWorldInfo = $('#sg_autoBindWorldInfo').is(':checked');
  s.autoBindWorldInfoPrefix = String($('#sg_autoBindWorldInfoPrefix').val() || 'SG').trim() || 'SG';

  s.wiTriggerEnabled = $('#sg_wiTriggerEnabled').is(':checked');
  s.wiTriggerLookbackMessages = clampInt($('#sg_wiTriggerLookbackMessages').val(), 5, 120, s.wiTriggerLookbackMessages || 20);
  s.wiTriggerIncludeUserMessage = $('#sg_wiTriggerIncludeUserMessage').is(':checked');
  s.wiTriggerUserMessageWeight = clampFloat($('#sg_wiTriggerUserMessageWeight').val(), 0, 10, s.wiTriggerUserMessageWeight ?? 1.6);
  s.wiTriggerStartAfterAssistantMessages = clampInt($('#sg_wiTriggerStartAfterAssistantMessages').val(), 0, 200000, s.wiTriggerStartAfterAssistantMessages || 0);
  s.wiTriggerMaxEntries = clampInt($('#sg_wiTriggerMaxEntries').val(), 1, 20, s.wiTriggerMaxEntries || 4);
  s.wiTriggerMinScore = clampFloat($('#sg_wiTriggerMinScore').val(), 0, 1, (s.wiTriggerMinScore ?? 0.08));
  s.wiTriggerMaxKeywords = clampInt($('#sg_wiTriggerMaxKeywords').val(), 1, 200, s.wiTriggerMaxKeywords || 24);
  s.wiTriggerInjectStyle = String($('#sg_wiTriggerInjectStyle').val() || s.wiTriggerInjectStyle || 'hidden');
  s.wiTriggerDebugLog = $('#sg_wiTriggerDebugLog').is(':checked');

  s.wiRollEnabled = $('#sg_wiRollEnabled').is(':checked');
  s.wiRollStatSource = String($('#sg_wiRollStatSource').val() || s.wiRollStatSource || 'variable');
  s.wiRollStatVarName = String($('#sg_wiRollStatVarName').val() || s.wiRollStatVarName || 'stat_data').trim();
  s.wiRollRandomWeight = clampFloat($('#sg_wiRollRandomWeight').val(), 0, 1, s.wiRollRandomWeight ?? 0.3);
  s.wiRollDifficulty = String($('#sg_wiRollDifficulty').val() || s.wiRollDifficulty || 'normal');
  s.wiRollInjectStyle = String($('#sg_wiRollInjectStyle').val() || s.wiRollInjectStyle || 'hidden');
  s.wiRollDebugLog = $('#sg_wiRollDebugLog').is(':checked');
  s.wiRollStatParseMode = String($('#sg_wiRollStatParseMode').val() || s.wiRollStatParseMode || 'json');
  s.wiRollProvider = String($('#sg_wiRollProvider').val() || s.wiRollProvider || 'custom');
  s.wiRollCustomEndpoint = String($('#sg_wiRollCustomEndpoint').val() || s.wiRollCustomEndpoint || '').trim();
  s.wiRollCustomApiKey = String($('#sg_wiRollCustomApiKey').val() || s.wiRollCustomApiKey || '');
  s.wiRollCustomModel = String($('#sg_wiRollCustomModel').val() || s.wiRollCustomModel || 'gpt-4o-mini');
  s.wiRollCustomMaxTokens = clampInt($('#sg_wiRollCustomMaxTokens').val(), 128, 200000, s.wiRollCustomMaxTokens || 512);
  s.wiRollCustomTopP = clampFloat($('#sg_wiRollCustomTopP').val(), 0, 1, s.wiRollCustomTopP ?? 0.95);
  s.wiRollCustomTemperature = clampFloat($('#sg_wiRollCustomTemperature').val(), 0, 2, s.wiRollCustomTemperature ?? 0.2);
  s.wiRollCustomStream = $('#sg_wiRollCustomStream').is(':checked');
  s.wiRollSystemPrompt = String($('#sg_wiRollSystemPrompt').val() || '').trim() || DEFAULT_ROLL_SYSTEM_PROMPT;

  s.wiTriggerMatchMode = String($('#sg_wiTriggerMatchMode').val() || s.wiTriggerMatchMode || 'local');
  s.wiIndexPrefilterTopK = clampInt($('#sg_wiIndexPrefilterTopK').val(), 5, 80, s.wiIndexPrefilterTopK ?? 24);
  s.wiIndexProvider = String($('#sg_wiIndexProvider').val() || s.wiIndexProvider || 'st');
  s.wiIndexTemperature = clampFloat($('#sg_wiIndexTemperature').val(), 0, 2, s.wiIndexTemperature ?? 0.2);
  s.wiIndexSystemPrompt = String($('#sg_wiIndexSystemPrompt').val() || s.wiIndexSystemPrompt || DEFAULT_INDEX_SYSTEM_PROMPT);
  s.wiIndexUserTemplate = String($('#sg_wiIndexUserTemplate').val() || s.wiIndexUserTemplate || DEFAULT_INDEX_USER_TEMPLATE);
  s.wiIndexCustomEndpoint = String($('#sg_wiIndexCustomEndpoint').val() || s.wiIndexCustomEndpoint || '');
  s.wiIndexCustomApiKey = String($('#sg_wiIndexCustomApiKey').val() || s.wiIndexCustomApiKey || '');
  s.wiIndexCustomModel = String($('#sg_wiIndexCustomModel').val() || s.wiIndexCustomModel || 'gpt-4o-mini');
  s.wiIndexCustomMaxTokens = clampInt($('#sg_wiIndexCustomMaxTokens').val(), 128, 200000, s.wiIndexCustomMaxTokens || 1024);
  s.wiIndexTopP = clampFloat($('#sg_wiIndexTopP').val(), 0, 1, s.wiIndexTopP ?? 0.95);
  s.wiIndexCustomStream = $('#sg_wiIndexCustomStream').is(':checked');

  s.wiBlueIndexMode = String($('#sg_wiBlueIndexMode').val() || s.wiBlueIndexMode || 'live');
  s.wiBlueIndexFile = String($('#sg_wiBlueIndexFile').val() || '').trim();
  s.summaryMaxCharsPerMessage = clampInt($('#sg_summaryMaxChars').val(), 200, 8000, s.summaryMaxCharsPerMessage || 4000);
  s.summaryMaxTotalChars = clampInt($('#sg_summaryMaxTotalChars').val(), 2000, 80000, s.summaryMaxTotalChars || 24000);

  $('#sg_summary_custom_block').toggle(String(s.summaryProvider || 'st') === 'custom');
  $('#sg_summaryWorldInfoFile').toggle(String(s.summaryWorldInfoTarget || 'chatbook') === 'file');
  $('#sg_summaryBlueWorldInfoFile').toggle(!!s.summaryToBlueWorldInfo);
  $('#sg_summaryIndexFormat').toggle(String(s.summaryWorldInfoKeyMode || 'keywords') === 'indexId');

  updateBlueIndexInfoLabel();

  updateSummaryInfoLabel();
  renderSummaryPaneFromMeta();
  renderWiTriggerLogs();
  renderRollLogs();

  updateButtonsEnabled();
}

function openModal() {
  ensureModal();
  pullSettingsToUi();
  updateWorldbookInfoLabel();
  updateSummaryManualRangeHint(true);
  // 打开面板时尝试刷新一次蓝灯索引（不阻塞 UI）
  ensureBlueIndexLive(false).catch(() => void 0);
  setStatus('', '');
  $('#sg_modal_backdrop').show();
  showPane('md');
}
function closeModal() { $('#sg_modal_backdrop').hide(); }

function injectMinimalSettingsPanel() {
  const $root = $('#extensions_settings');
  if (!$root.length) return;
  if ($('#sg_settings_panel_min').length) return;

  $root.append(`
    <div class="sg-panel-min" id="sg_settings_panel_min">
      <div class="sg-min-row">
        <div class="sg-min-title">Hướng dẫn Cốt truyện StoryGuide <span class="sg-sub">v${SG_VERSION}</span></div>
        <button class="menu_button sg-btn" id="sg_open_from_settings">Mở bảng điều khiển</button>
      </div>
      <div class="sg-min-hint">Hỗ trợ tùy chỉnh mô-đun đầu ra (JSON), và khung tự động thêm sẽ cache + lắng nghe render lại, hạn chế bị cập nhật biến ghi đè.</div>
    </div>
  `);
  $('#sg_open_from_settings').on('click', () => openModal());
}

// auto refresh panel only when open
function scheduleAutoRefresh() {
  const s = ensureSettings();
  if (!s.enabled || !s.autoRefresh) return;
  const delay = clampInt(s.debounceMs, 300, 10000, DEFAULT_SETTINGS.debounceMs);

  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (document.getElementById('sg_modal_backdrop') && $('#sg_modal_backdrop').is(':visible')) runAnalysis().catch(() => void 0);
    refreshTimer = null;
  }, delay);
}

// -------------------- DOM observers (anti overwrite) --------------------

function findChatContainer() {
  const candidates = [
    '#chat',
    '#chat_history',
    '#chatHistory',
    '#chat_container',
    '#chatContainer',
    '#chat_wrapper',
    '#chatwrapper',
    '.chat',
    '.chat_history',
    '.chat-history',
    '#sheldon_chat',
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  const mes = document.querySelector('.mes');
  return mes ? mes.parentElement : null;
}

function startObservers() {
  const chatContainer = findChatContainer();
  if (chatContainer) {
    if (chatDomObserver) chatDomObserver.disconnect();
    chatDomObserver = new MutationObserver(() => scheduleReapplyAll('chat'));
    chatDomObserver.observe(chatContainer, { childList: true, subtree: true, characterData: true });
  }

  if (bodyDomObserver) bodyDomObserver.disconnect();
  bodyDomObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      const t = m.target;
      if (t && t.nodeType === 1) {
        const el = /** @type {Element} */ (t);
        if (el.classList?.contains('mes') || el.classList?.contains('mes_text') || el.querySelector?.('.mes') || el.querySelector?.('.mes_text')) {
          scheduleReapplyAll('body');
          break;
        }
      }
    }
  });
  bodyDomObserver.observe(document.body, { childList: true, subtree: true, characterData: false });

  ensureChatActionButtons();

  scheduleReapplyAll('start');
  installCardZoomDelegation();

  scheduleReapplyAll('start');
}

// -------------------- events --------------------

function setupEventListeners() {
  const ctx = SillyTavern.getContext();
  const { eventSource, event_types } = ctx;

  eventSource.on(event_types.APP_READY, () => {
    startObservers();

    // Làm nóng chỉ mục Đèn Xanh (chế độ đọc thời gian thực), cố gắng tránh việc lần đầu gửi tin chưa có chỉ mục
    ensureBlueIndexLive(true).catch(() => void 0);

    eventSource.on(event_types.CHAT_CHANGED, () => {
      inlineCache.clear();
      scheduleReapplyAll('chat_changed');
      ensureChatActionButtons();
      ensureBlueIndexLive(true).catch(() => void 0);
      if (document.getElementById('sg_modal_backdrop') && $('#sg_modal_backdrop').is(':visible')) {
        pullSettingsToUi();
        setStatus('Đã chuyển cuộc trò chuyện: Đã đồng bộ trường của cuộc trò chuyện này', 'ok');
      }
    });

    eventSource.on(event_types.MESSAGE_RECEIVED, () => {
      // Cấm tự động tạo: Không tự động phân tích/thêm khi nhận tin nhắn
      scheduleReapplyAll('msg_received');
      // Tự động tóm tắt (Chức năng độc lập)
      scheduleAutoSummary('msg_received');
    });

    eventSource.on(event_types.MESSAGE_SENT, () => {
      // Cấm tự động tạo: Không tự động làm mới bảng điều khiển khi gửi tin nhắn
      // ROLL Phán định (Cố gắng hoàn thành trước khi tạo)
      maybeInjectRollResult('msg_sent').catch(() => void 0);
      // Chỉ mục Đèn Xanh → Kích hoạt Đèn Xanh Lá (Cố gắng hoàn thành trước khi tạo)
      maybeInjectWorldInfoTriggers('msg_sent').catch(() => void 0);
      scheduleAutoSummary('msg_sent');
    });
  });
}

// -------------------- Nút nổi và Bảng điều khiển --------------------

let floatingPanelVisible = false;
let lastFloatingContent = null;
let sgFloatingResizeGuardBound = false;
let sgFloatingToggleLock = 0;

const SG_FLOATING_BTN_POS_KEY = 'storyguide_floating_btn_pos_v1';
let sgBtnPos = null;

function loadBtnPos() {
  try {
    const raw = localStorage.getItem(SG_FLOATING_BTN_POS_KEY);
    if (raw) sgBtnPos = JSON.parse(raw);
  } catch { }
}

function saveBtnPos(left, top) {
  try {
    sgBtnPos = { left, top };
    localStorage.setItem(SG_FLOATING_BTN_POS_KEY, JSON.stringify(sgBtnPos));
  } catch { }
}

// Sync CSS viewport units for mobile browsers with dynamic bars.
function updateSgVh() {
  const root = document.documentElement;
  if (!root) return;
  const h = window.visualViewport?.height || window.innerHeight || 0;
  if (!h) return;
  root.style.setProperty('--sg-vh', `${h * 0.01}px`);
}

updateSgVh();
window.addEventListener('resize', updateSgVh);
window.addEventListener('orientationchange', updateSgVh);
window.visualViewport?.addEventListener('resize', updateSgVh);

// Phát hiện chế độ màn hình dọc di động/máy tính bảng (Vô hiệu hóa định vị tùy chỉnh, sử dụng kiểu bật lên từ dưới CSS)
// Khớp truy vấn phương tiện CSS: (max-width: 768px), (max-aspect-ratio: 1/1)
function isMobilePortrait() {
  if (window.matchMedia) {
    return window.matchMedia('(max-width: 768px), (max-aspect-ratio: 1/1)').matches;
  }
  return window.innerWidth <= 768 || (window.innerHeight >= window.innerWidth);
}

function createFloatingButton() {
  if (document.getElementById('sg_floating_btn')) return;

  const btn = document.createElement('div');
  btn.id = 'sg_floating_btn';
  btn.className = 'sg-floating-btn';
  btn.innerHTML = '📘';
  btn.title = 'Hướng dẫn Cốt truyện';
  // Allow dragging but also clicking. We need to distinguish click from drag.
  btn.style.touchAction = 'none';

  document.body.appendChild(btn);

  // Restore position
  loadBtnPos();
  if (sgBtnPos) {
    const w = 50; // approx width
    const h = 50;
    const clamped = clampToViewport(sgBtnPos.left, sgBtnPos.top, w, h);
    btn.style.left = `${Math.round(clamped.left)}px`;
    btn.style.top = `${Math.round(clamped.top)}px`;
    btn.style.bottom = 'auto';
    btn.style.right = 'auto';
  } else {
    // Default safe position for mobile/desktop if never moved
    // Use top positioning to avoid bottom bar interference on mobile/desktop
    // Mobile browsers often have dynamic bottom bars, so "bottom" is risky.
    btn.style.top = '150px';
    btn.style.right = '16px';
    btn.style.bottom = 'auto'; // override CSS
    btn.style.left = 'auto';
  }

  // --- Unified Interaction Logic ---
  const isMobile = window.innerWidth < 1200;

  // Variables or drag
  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;
  let moved = false;
  let longPressTimer = null; // Legacy

  // Mobile: Simple Click Mode
  if (isMobile) {
    btn.style.cursor = 'pointer';
    btn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleFloatingPanel();
    };
    return; // SKIP desktop logic
  }
  // Desktop logic continues below...

  const onDown = (ev) => {
    dragging = true;
    moved = false;
    startX = ev.clientX;
    startY = ev.clientY;

    const rect = btn.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    btn.style.transition = 'none';
    btn.setPointerCapture(ev.pointerId);

    // If needed: Visual feedback for press
  };

  const onMove = (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    if (!moved && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      moved = true;
      btn.style.bottom = 'auto';
      btn.style.right = 'auto';
    }

    if (moved) {
      const newLeft = startLeft + dx;
      const newTop = startTop + dy;

      const w = btn.offsetWidth;
      const h = btn.offsetHeight;
      const clamped = clampToViewport(newLeft, newTop, w, h);

      btn.style.left = `${Math.round(clamped.left)}px`;
      btn.style.top = `${Math.round(clamped.top)}px`;
    }
  };

  const onUp = (ev) => {
    if (!dragging) return;
    dragging = false;
    btn.releasePointerCapture(ev.pointerId);
    btn.style.transition = '';

    if (moved) {
      const left = parseInt(btn.style.left || '0', 10);
      const top = parseInt(btn.style.top || '0', 10);
      saveBtnPos(left, top);
    }
  };

  btn.addEventListener('pointerdown', onDown);
  btn.addEventListener('pointermove', onMove);
  btn.addEventListener('pointerup', onUp);
  btn.addEventListener('pointercancel', onUp);

  // Robust click handler
  btn.addEventListener('click', (e) => {
    // If we just dragged, 'moved' might still be true
    if (moved) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    toggleFloatingPanel();
  });
}

function createFloatingPanel() {
  if (document.getElementById('sg_floating_panel')) return;

  const panel = document.createElement('div');
  panel.id = 'sg_floating_panel';
  panel.className = 'sg-floating-panel';
  panel.innerHTML = `
    <div class="sg-floating-header" style="cursor: move; touch-action: none;">
      <span class="sg-floating-title">📘 Hướng dẫn Cốt truyện</span>
      <div class="sg-floating-actions">
        <button class="sg-floating-action-btn" id="sg_floating_show_report" title="Xem phân tích">📖</button>
        <button class="sg-floating-action-btn" id="sg_floating_roll_logs" title="Nhật ký ROLL">🎲</button>
        <button class="sg-floating-action-btn" id="sg_floating_settings" title="Mở cài đặt">⚙️</button>
        <button class="sg-floating-action-btn" id="sg_floating_close" title="Đóng">✕</button>
      </div>
    </div>
    <div class="sg-floating-body" id="sg_floating_body">
      <div style="padding:20px; text-align:center; color:#aaa;">
        Nhấn <button class="sg-inner-refresh-btn" style="background:none; border:none; cursor:pointer; font-size:1.2em;">🔄</button> để tạo
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  // Restore position (Only on Desktop/Large screens, NOT in mobile portrait)
  // On mobile portrait, we rely on CSS defaults (bottom sheet style) to ensure visibility
  if (!isMobilePortrait() && window.innerWidth >= 1200) {
    loadFloatingPanelPos();
    if (sgFloatingPinnedPos) {
      const w = panel.offsetWidth || 300;
      const h = panel.offsetHeight || 400;
      // Use saved position but ensure it is on screen
      const clamped = clampToViewport(sgFloatingPinnedPos.left, sgFloatingPinnedPos.top, w, h);
      panel.style.left = `${Math.round(clamped.left)}px`;
      panel.style.top = `${Math.round(clamped.top)}px`;
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
    }
  }

  // Sự kiện ràng buộc
  $('#sg_floating_close').on('click', () => {
    hideFloatingPanel();
  });

  $('#sg_floating_show_report').on('click', () => {
    showFloatingReport();
  });

  // Delegate inner refresh click
  $(document).on('click', '.sg-inner-refresh-btn', async (e) => {
    // Only handle if inside our panel
    if (!$(e.target).closest('#sg_floating_panel').length) return;
    await refreshFloatingPanelContent();
  });

  $('#sg_floating_roll_logs').on('click', () => {
    showFloatingRollLogs();
  });

  $('#sg_floating_settings').on('click', () => {
    openModal();
    hideFloatingPanel();
  });

  // Drag logic
  const header = panel.querySelector('.sg-floating-header');
  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;
  let moved = false;

  const onDown = (ev) => {
    if (ev.target.closest('button')) return; // ignore buttons
    if (isMobilePortrait()) return; // Vô hiệu hóa kéo thả trên màn hình dọc di động, sử dụng CSS bật lên từ dưới

    dragging = true;
    startX = ev.clientX;
    startY = ev.clientY;

    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    moved = false;

    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    panel.style.transition = 'none'; // disable transition during drag

    header.setPointerCapture(ev.pointerId);
  };

  const onMove = (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    if (!moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) moved = true;

    const newLeft = startLeft + dx;
    const newTop = startTop + dy;

    // Constrain to viewport
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const clamped = clampToViewport(newLeft, newTop, w, h);

    panel.style.left = `${Math.round(clamped.left)}px`;
    panel.style.top = `${Math.round(clamped.top)}px`;
  };

  const onUp = (ev) => {
    if (!dragging) return;
    dragging = false;
    header.releasePointerCapture(ev.pointerId);
    panel.style.transition = ''; // restore transition

    if (moved) {
      const left = parseInt(panel.style.left || '0', 10);
      const top = parseInt(panel.style.top || '0', 10);
      saveFloatingPanelPos(left, top);
    }
  };

  header.addEventListener('pointerdown', onDown);
  header.addEventListener('pointermove', onMove);
  header.addEventListener('pointerup', onUp);
  header.addEventListener('pointercancel', onUp);

  // Double click to reset
  header.addEventListener('dblclick', (ev) => {
    if (ev.target.closest('button')) return; // ignore buttons
    clearFloatingPanelPos();
    panel.style.left = '';
    panel.style.top = '';
    panel.style.bottom = ''; // restore CSS default
    panel.style.right = '';  // restore CSS default
  });
}

function toggleFloatingPanel() {
  const now = Date.now();
  if (now - sgFloatingToggleLock < 280) return;
  sgFloatingToggleLock = now;
  if (floatingPanelVisible) {
    hideFloatingPanel();
  } else {
    showFloatingPanel();
  }
}


function shouldGuardFloatingPanelViewport() {
  // When the viewport is very small (mobile / narrow desktop window),
  // the panel may be pushed off-screen by fixed bottom offsets.
  return window.innerWidth < 560 || window.innerHeight < 520;
}

function ensureFloatingPanelInViewport(panel) {
  try {
    if (!panel || !panel.getBoundingClientRect) return;

    // Di động màn hình dọc sử dụng CSS bật lên từ dưới, không cần JS định vị
    if (isMobilePortrait()) return;

    // Remove viewport size guard to ensure panel is always kept reachable
    // if (!shouldGuardFloatingPanelViewport()) return;

    // Giữ nguyên logic biên giới hạn với clampToViewport (cho phép 50% vượt biên)
    const minVisibleRatio = 0.5;
    const minVisiblePx = 40;

    const rect = panel.getBoundingClientRect();
    const w = rect.width || panel.offsetWidth || 300;
    const h = rect.height || panel.offsetHeight || 400;

    const minVisibleW = Math.max(minVisiblePx, w * minVisibleRatio);
    const minVisibleH = Math.max(minVisiblePx, h * minVisibleRatio);

    // Ensure the panel itself never exceeds viewport bounds for max size
    panel.style.maxWidth = `calc(100vw - ${minVisiblePx}px)`;
    panel.style.maxHeight = `calc(100dvh - ${minVisiblePx}px)`;

    // Clamp current on-screen position into viewport.
    const clamped = clampToViewport(rect.left, rect.top, w, h);

    // Kiểm tra xem có cần điều chỉnh vị trí không (dùng logic biên giới hạn nới lỏng)
    // Nếu phần hiển thị ít hơn minVisible, thì cần điều chỉnh
    const visibleLeft = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(0, rect.left));
    const visibleTop = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(0, rect.top));

    if (visibleLeft < minVisibleW || visibleTop < minVisibleH || rect.top < 0) {
      panel.style.left = `${Math.round(clamped.left)}px`;
      panel.style.top = `${Math.round(clamped.top)}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
  } catch { /* ignore */ }
}

function bindFloatingPanelResizeGuard() {
  if (sgFloatingResizeGuardBound) return;
  sgFloatingResizeGuardBound = true;

  window.addEventListener('resize', () => {
    if (!floatingPanelVisible) return;
    const panel = document.getElementById('sg_floating_panel');
    if (!panel) return;
    requestAnimationFrame(() => ensureFloatingPanelInViewport(panel));
  });
}

function showFloatingPanel() {
  createFloatingPanel();
  const panel = document.getElementById('sg_floating_panel');
  if (panel) {
    // Di động/Máy tính bảng: Bắt buộc sử dụng kiểu bật lên từ dưới
    if (isMobilePortrait()) {
      panel.style.position = 'fixed';
      panel.style.top = '0';
      panel.style.bottom = '0';
      panel.style.left = '0';
      panel.style.right = '0';
      panel.style.width = '100%';
      panel.style.maxWidth = '100%';
      panel.style.height = 'calc(var(--sg-vh, 1vh) * 100)';
      panel.style.maxHeight = 'calc(var(--sg-vh, 1vh) * 100)';
      panel.style.borderRadius = '0';
      panel.style.resize = 'none';
      panel.style.transform = 'none';
      panel.style.transition = 'none';
      panel.style.opacity = '1';
      panel.style.visibility = 'visible';
      panel.style.display = 'flex';
    } else if (window.innerWidth < 1200) {
      // Máy tính để bàn cửa sổ nhỏ: Xóa các kiểu nội tuyến có thể có, sử dụng CSS
      panel.style.left = '';
      panel.style.top = '';
      panel.style.bottom = '';
      panel.style.right = '';
      panel.style.transform = '';
      panel.style.maxWidth = '';
      panel.style.maxHeight = '';
      panel.style.display = '';
      panel.style.height = '';
      panel.style.opacity = '';
      panel.style.visibility = '';
      panel.style.transition = '';
      panel.style.borderRadius = '';
    } else {
      panel.style.display = '';
    }

    panel.classList.add('visible');
    floatingPanelVisible = true;
    // Nếu có nội dung được lưu trong bộ nhớ đệm thì hiển thị
    if (lastFloatingContent) {
      updateFloatingPanelBody(lastFloatingContent);
    }

    // Chỉ chạy phát hiện khung nhìn trên các thiết bị không phải di động
    if (!isMobilePortrait()) {
      bindFloatingPanelResizeGuard();
      requestAnimationFrame(() => ensureFloatingPanelInViewport(panel));
    }
  }
}

function hideFloatingPanel() {
  const panel = document.getElementById('sg_floating_panel');
  if (panel) {
    panel.classList.remove('visible');
    floatingPanelVisible = false;
    if (isMobilePortrait()) {
      panel.style.display = 'none';
    }
  }
}

async function refreshFloatingPanelContent() {
  const $body = $('#sg_floating_body');
  if (!$body.length) return;

  $body.html('<div class="sg-floating-loading">Đang phân tích cốt truyện...</div>');

  try {
    const s = ensureSettings();
    const { snapshotText } = buildSnapshot();
    const modules = getModules('panel');

    if (!modules.length) {
      $body.html('<div class="sg-floating-loading">Không có mô-đun được cấu hình</div>');
      return;
    }

    const schema = buildSchemaFromModules(modules);
    const messages = buildPromptMessages(snapshotText, s.spoilerLevel, modules, 'panel');

    let jsonText = '';
    if (s.provider === 'custom') {
      jsonText = await callViaCustom(s.customEndpoint, s.customApiKey, s.customModel, messages, s.temperature, s.customMaxTokens, s.customTopP, s.customStream);
    } else {
      jsonText = await callViaSillyTavern(messages, schema, s.temperature);
      if (typeof jsonText !== 'string') jsonText = JSON.stringify(jsonText ?? '');
    }

    const parsed = safeJsonParse(jsonText);
    if (!parsed) {
      $body.html('<div class="sg-floating-loading">Phân tích thất bại</div>');
      return;
    }

    // Hợp nhất mô-đun tĩnh
    const mergedParsed = mergeStaticModulesIntoResult(parsed, modules);
    updateStaticModulesCache(mergedParsed, modules).catch(() => void 0);

    // Render nội dung
    // Filter out quick_actions from main Markdown body to avoid duplication
    const bodyModules = modules.filter(m => m.key !== 'quick_actions');
    const md = renderReportMarkdownFromModules(mergedParsed, bodyModules);
    const html = renderMarkdownToHtml(md);

    // Thêm tùy chọn nhanh
    const quickActions = Array.isArray(mergedParsed.quick_actions) ? mergedParsed.quick_actions : [];
    const optionsHtml = renderDynamicQuickActionsHtml(quickActions, 'panel');

    const refreshBtnHtml = `
      <div style="padding:2px 8px; border-bottom:1px solid rgba(128,128,128,0.2); margin-bottom:4px; text-align:right;">
        <button class="sg-inner-refresh-btn" title="Tạo lại phân tích" style="background:none; border:none; cursor:pointer; font-size:1.1em; opacity:0.8;">🔄</button>
      </div>
    `;

    const fullHtml = refreshBtnHtml + html + optionsHtml;
    lastFloatingContent = fullHtml;
    updateFloatingPanelBody(fullHtml);

  } catch (e) {
    console.warn('[StoryGuide] floating panel refresh failed:', e);
    $body.html(`<div class="sg-floating-loading">Phân tích thất bại: ${e?.message ?? e}</div>`);
  }
}

function updateFloatingPanelBody(html) {
  const $body = $('#sg_floating_body');
  if ($body.length) {
    $body.html(html);
  }
}

function showFloatingRollLogs() {
  const $body = $('#sg_floating_body');
  if (!$body.length) return;

  const meta = getSummaryMeta();
  const logs = Array.isArray(meta?.rollLogs) ? meta.rollLogs : [];

  if (!logs.length) {
    $body.html('<div class="sg-floating-loading">Tạm thời không có nhật ký ROLL</div>');
    return;
  }

  const html = logs.slice(0, 50).map((l) => {
    const ts = l?.ts ? new Date(l.ts).toLocaleString() : '';
    const action = String(l?.action || '').trim();
    const outcome = String(l?.outcomeTier || '').trim()
      || (l?.success == null ? 'N/A' : (l.success ? 'Thành công' : 'Thất bại'));
    const finalVal = Number.isFinite(Number(l?.final)) ? Number(l.final).toFixed(2) : '';
    let summary = '';
    if (l?.summary && typeof l.summary === 'object') {
      const pick = l.summary.summary ?? l.summary.text ?? l.summary.message;
      summary = String(pick || '').trim();
      if (!summary) {
        try { summary = JSON.stringify(l.summary); } catch { summary = String(l.summary); }
      }
    } else {
      summary = String(l?.summary || '').trim();
    }
    const userShort = String(l?.userText || '').trim().slice(0, 160);

    const detailsLines = [];
    if (userShort) detailsLines.push(`<div><b>Đầu vào người dùng</b>：${escapeHtml(userShort)}</div>`);
    if (summary) detailsLines.push(`<div><b>Tóm tắt</b>：${escapeHtml(summary)}</div>`);
    return `
      <details style="margin-bottom:4px; padding:4px; border-bottom:1px solid rgba(128,128,128,0.3);">
        <summary style="font-size:0.9em; cursor:pointer; outline:none;">${escapeHtml(`${ts}｜${action || 'ROLL'}｜${outcome}${finalVal ? `｜Cuối cùng=${finalVal}` : ''}`)}</summary>
        <div class="sg-log-body" style="padding-left:1em; opacity:0.9; font-size:0.85em; margin-top:4px;">${detailsLines.join('')}</div>
      </details>
    `;
  }).join('');

  $body.html(`<div style="padding:10px; overflow-y:auto; max-height:100%; box-sizing:border-box;">${html}</div>`);
}

function showFloatingReport() {
  const $body = $('#sg_floating_body');
  if (!$body.length) return;

  // Use last cached content if available, otherwise show empty state
  if (lastFloatingContent) {
    updateFloatingPanelBody(lastFloatingContent);
  } else {
    $body.html(`
      <div style="padding:20px; text-align:center; color:#aaa;">
        Nhấn <button class="sg-inner-refresh-btn" style="background:none; border:none; cursor:pointer; font-size:1.2em;">🔄</button> để tạo
      </div>
    `);
  }
}

// -------------------- init --------------------

// -------------------- fixed input button --------------------
// -------------------- fixed input button --------------------
function injectFixedInputButton() {
  if (document.getElementById('sg_fixed_input_btn')) return;

  const tryInject = () => {
    if (document.getElementById('sg_fixed_input_btn')) return true;

    // 1. Try standard extension/audit buttons container (desktop/standard themes)
    let container = document.getElementById('chat_input_audit_buttons');

    // 2. Try Quick Reply container (often where "Roll" macros live)
    if (!container) container = document.querySelector('.quick-reply-container');

    // 3. Try finding the "Roll" button specifically and use its parent
    if (!container) {
      const buttons = Array.from(document.querySelectorAll('button, .menu_button'));
      const rollBtn = buttons.find(b => b.textContent && (b.textContent.includes('ROLL') || b.textContent.includes('Roll')));
      if (rollBtn) container = rollBtn.parentElement;
    }

    // 4. Fallback: Insert before the input box wrapper
    if (!container) {
      const wrapper = document.getElementById('chat_input_form');
      if (wrapper) container = wrapper;
    }

    if (!container) return false;

    const btn = document.createElement('div');
    btn.id = 'sg_fixed_input_btn';
    btn.className = 'menu_button';
    btn.style.display = 'inline-block';
    btn.style.cursor = 'pointer';
    btn.style.marginRight = '5px';
    btn.style.padding = '5px 10px';
    btn.style.userSelect = 'none';
    btn.innerHTML = '📘 Cốt truyện';
    btn.title = 'Mở cửa sổ nổi Hướng dẫn Cốt truyện';
    // Ensure height consistency
    btn.style.height = 'var(--input-height, auto)';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleFloatingPanel();
    });

    // Check if we found 'chat_input_form' which is huge, we don't want to just appendChild
    if (container.id === 'chat_input_form') {
      container.insertBefore(btn, container.firstChild);
      return true;
    }

    // For button bars, prepend usually works best for visibility
    if (container.firstChild) {
      container.insertBefore(btn, container.firstChild);
    } else {
      container.appendChild(btn);
    }
    return true;
  };

  // Attempt immediately
  tryInject();

  // Watch for UI changes continuously (ST wipes DOM often)
  // We do NOT disconnect, so if the button is removed, it comes back.
  const observer = new MutationObserver((mutations) => {
    // Check if relevant nodes were added or removed
    let needsCheck = false;
    for (const m of mutations) {
      if (m.type === 'childList') {
        needsCheck = true;
        break;
      }
    }
    if (needsCheck) tryInject();
  });

  // observe body for new nodes
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

function init() {
  ensureSettings();
  setupEventListeners();

  const ctx = SillyTavern.getContext();
  const { eventSource, event_types } = ctx;

  eventSource.on(event_types.APP_READY, () => {
    // Không còn hiển thị nút 📘 trên thanh điều hướng nữa (tránh chiếm chỗ/trùng lặp lối vào)
    const oldBtn = document.getElementById('sg_topbar_btn');
    if (oldBtn) oldBtn.remove();

    injectMinimalSettingsPanel();
    ensureChatActionButtons();
    installCardZoomDelegation();
    installQuickOptionsClickHandler();
    createFloatingButton();
    injectFixedInputButton();
    installRollPreSendHook();
  });

  // Tự động liên kết Worldbook khi chuyển đổi cuộc trò chuyện
  eventSource.on(event_types.CHAT_CHANGED, async () => {
    console.log('[StoryGuide] CHAT_CHANGED sự kiện được kích hoạt');

    const ctx = SillyTavern.getContext();
    const hasChat = ctx.chat && Array.isArray(ctx.chat);
    const chatLength = hasChat ? ctx.chat.length : 0;

    console.log('[StoryGuide] Trạng thái cuộc trò chuyện:', { hasChat, chatLength, chatMetadata: !!ctx.chatMetadata });

    // Nới lỏng kiểm tra: Chỉ cần có chatMetadata thì thử chạy
    if (!ctx.chatMetadata) {
      console.log('[StoryGuide] Không có chatMetadata, bỏ qua tự động liên kết');
      return;
    }

    try {
      await onChatSwitched();
    } catch (e) {
      console.warn('[StoryGuide] Tự động liên kết Worldbook thất bại:', e);
    }
  });

  globalThis.StoryGuide = {
    open: openModal,
    close: closeModal,
    runAnalysis,
    runSummary,
    runInlineAppendForLastMessage,
    reapplyAllInlineBoxes,
    buildSnapshot: () => buildSnapshot(),
    getLastReport: () => lastReport,
    refreshModels,
    _inlineCache: inlineCache,
  };
}

init();


