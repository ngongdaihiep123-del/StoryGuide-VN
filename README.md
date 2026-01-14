# Hướng dẫn Cốt truyện StoryGuide (Extension SillyTavern)

## v0.9.5
- Cải tiến: Khớp chỉ mục Đèn Xanh sẽ tổng hợp "N tin nhắn chính văn gần nhất + đầu vào người dùng lần này" (có thể tắt hoặc điều chỉnh trọng số đầu vào người dùng trong bảng điều khiển).

## v0.9.3
- Mới: "Giới hạn tầng bắt đầu" kích hoạt chỉ mục Đèn Xanh (chỉ bắt đầu tiêm từ khóa kích hoạt sau khi đạt đến số tầng trả lời của AI được chỉ định).

## v0.8.9
- Tự động tóm tắt (API độc lập) hỗ trợ nút "Làm mới danh sách model" và menu thả xuống chọn model (/models).

## v0.8.5
- Sửa lỗi: Trên một số phiên bản SillyTavern, /createentry không trả về UID trực tiếp, dẫn đến báo sai "ghi thất bại nhưng thực tế đã ghi".
  - Hiện tại sẽ tra ngược UID qua /findentry sau khi tạo, rồi mới thiết lập các trường key/comment/constant (tránh việc mục Đèn Xanh không thể thiết lập thường trực).

## v0.8.4
- Tóm tắt ghi vào hỗ trợ "Song Worldbook":
  - Worldbook Đèn Xanh Lá (Kích hoạt bằng từ khóa, ghi vào Worldbook liên kết chat hiện tại hoặc tệp chỉ định)
  - Worldbook Đèn Xanh (Chỉ mục thường mở, chỉ hỗ trợ ghi vào tên tệp Worldbook chỉ định)
- Mới: Chức năng "Chỉ mục Đèn Xanh → Kích hoạt Đèn Xanh Lá":
  - Khi người dùng gửi tin nhắn, đọc N dòng chính văn trước đó, khớp độ tương đồng với chỉ mục Đèn Xanh
  - Tự động tiêm các từ khóa trúng đích dưới dạng chú thích ẩn vào cuối tin nhắn người dùng, dùng để kích hoạt mục Worldbook Đèn Xanh Lá
  - Hỗ trợ nhập JSON Worldbook Đèn Xanh vào bộ nhớ đệm chỉ mục (cũng sẽ tự động thêm tóm tắt mới vào bộ nhớ đệm)

## v0.8.3
- Chức năng tóm tắt hỗ trợ tùy chỉnh prompt
  - Prompt System (Kiểm soát phong cách/trọng tâm tóm tắt)
  - Mẫu User (Hỗ trợ placeholder: {{fromFloor}} {{toFloor}} {{chunk}})
  - Extension sẽ buộc yêu cầu xuất JSON: {title, summary, keywords[]}, tránh ghi vào Worldbook thất bại

## v0.8.0
- Mới: Chức năng "Tự động tóm tắt" (Cài đặt API độc lập với gợi ý cốt truyện)
  - Có thể tự động tóm tắt theo "Khoảng cách tầng" (Hỗ trợ đếm theo trả lời của AI/đếm theo tất cả tin nhắn)
  - Mỗi lần tóm tắt sẽ trích xuất từ khóa, có thể ghi vào mục Worldbook bằng một cú nhấp, và tự động bật (Đèn Xanh Lá)
- Bảng điều khiển thêm tab "Tóm tắt": Xem tóm tắt gần đây và sao chép bằng một cú nhấp

## v0.5.1：Nhập và tiêm Worldbook + Nhập/Xuất cài đặt sẵn (và sửa lỗi worldBookText)

### Tại sao lại xuất hiện `worldBookText is not defined`
Bản cũ chèn văn bản Worldbook dưới dạng biến `worldBookText` vào buildSnapshot, nhưng không khai báo biến đó, nên sau khi nhập vẫn báo lỗi.

v0.5.1 đã sửa thành: Sau khi nhập sẽ lưu vào `settings.worldbookJson`, và tạo văn bản cần tiêm thông qua `buildWorldbookBlock()` bên trong buildSnapshot.

### Sách Thế Giới (World Info / Lorebook)
- Nhập: Bảng điều khiển → "Cài đặt sẵn và Worldbook" → Nhập JSON Worldbook
- Tích chọn: Tiêm Worldbook vào đầu vào phân tích
- Chế độ:
  - active: Chỉ tiêm các mục có khả năng kích hoạt (Từ khóa khớp với tin nhắn gần đây)
  - all: Tiêm tất cả các mục

### Cài đặt sẵn
- Xuất cài đặt sẵn: Tùy chọn có bao gồm API Key hay không
- Nhập cài đặt sẵn: Ghi đè cài đặt extension hiện tại (Khuyên bạn nên làm mới trang một lần sau khi nhập)


## v0.7.4
- Tối ưu hóa bố cục nút bảng điều khiển (không còn xếp dọc)
- Xóa khối "Dành riêng cho chat này" (trùng lặp với prompt tùy chỉnh)


## v0.7.4
- Sửa lỗi nút bảng điều khiển xếp dọc (Lưu cài đặt/Phân tích/Làm mới model v.v.)
- Thu nhỏ kích thước nút "Mở bảng điều khiển" trong danh sách extension


## v0.7.4
- Sửa lỗi nút "Mở bảng điều khiển" ở trang extension vẫn xếp dọc/chiếm quá nhiều chỗ


## v0.7.4
- Xóa nút lối vào 📘 trên thanh điều hướng (Chỉ giữ lại "Mở bảng điều khiển" ở trang extension và nút Tạo/Re-Roll ở khu vực chat)


## v0.7.4
- Sửa lỗi hiển thị "Nội dung cùng một module bị tách thành nhiều thẻ/không nằm cùng một khung" (Danh sách/đánh số bên trong không còn bị coi là khối cùng cấp)


## v0.7.4
- Bảng điều khiển thêm khung nhập "Số token phản hồi tối đa" (API độc lập), hiển thị/thiết lập token tối đa cho API tùy chỉnh


## v0.7.4
- Sửa lỗi yêu cầu API độc lập cố định max_tokens là 4096: Hiện tại sẽ sử dụng "Số token phản hồi tối đa" bạn đã cài đặt
- Kết nối trực tiếp fallback cũng sẽ mang theo max_tokens/top_p


## v0.7.4
- Sửa lỗi module dạng danh sách (như gợi ý [1][2]) bị tách thành nhiều khối: Trong chế độ tiêu chuẩn sẽ gộp vào trong cùng một thẻ module
- Điều chỉnh thụt lề từ 2 dấu cách lên 4 dấu cách, đảm bảo đánh số/danh sách bên trong không bị chạy ra ngoài thẻ module


## v0.7.4
- Mỗi thẻ module hỗ trợ nhấp "Phóng to/Thu nhỏ" (ESC/Nhấp nền để đóng)


## v0.7.4
- API độc lập thêm tùy chọn stream (có thể chuyển đổi stream=true/false)
- Hỗ trợ phân tích phản hồi luồng OpenAI SSE phổ biến (bên trong vẫn sẽ đợi kết thúc rồi mới thêm khung phân tích)


## v0.7.4
- Bảng cài đặt tương thích với di động: Cột trái phải đổi thành cột đơn trên dưới, tránh tràn ngang; sử dụng vùng cuộn đơn


## v0.7.4
- Kết quả "Phân tích cốt truyện hiện tại" trên bảng điều khiển sẽ được đồng bộ thêm vào cuối đoạn chat (khung báo cáo bảng điều khiển), phân tích thất bại cũng sẽ thêm văn bản gốc
- Khi API độc lập xuất ra không phải JSON sẽ tự động thử lại một lần với gợi ý ép buộc JSON
- Khi phân tích inline thất bại cũng sẽ hiển thị văn bản gốc ở cuối đoạn chat, tránh việc "có đầu ra nhưng không nhìn thấy"


## v0.7.4
- Điều chỉnh hành vi nhấp thẻ: Từ "Phóng to popup" đổi thành "Thu phóng/Thu gọn (Thu lại/Mở ra tại chỗ)"


## v0.7.4
- Điều chỉnh kiểu thu gọn thẻ: Sau khi thu gọn chỉ hiện tiêu đề (ví dụ "Đối chiếu với nguyên tác · Ảnh hưởng sai lệch")


## v0.7.4
- Sửa lỗi thanh tiêu đề bảng điều khiển trên di động bị đẩy ra khỏi màn hình: Di động không còn căn giữa dọc, sử dụng 100dvh, và để thanh tiêu đề sticky


## v0.7.4
- Nút "Tạo/Re-Roll" khu vực chat hỗ trợ kéo thả: Kéo tay cầm ⋮⋮ để cố định vị trí; nhấp đúp tay cầm để khôi phục tự động dính gần nút gửi
