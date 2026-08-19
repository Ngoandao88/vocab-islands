// Vercel Serverless Function — /api/chat
// Nhận tin nhắn từ trình duyệt, gọi Gemini API bằng key giấu ở server
// (biến môi trường GEMINI_API_KEY), trả lời lại cho bé bằng tiếng Anh đơn giản.

const SYSTEM_PROMPT = `Bạn là "Cú Thông Thái" - một người bạn AI thân thiện giúp một em nhỏ Việt Nam (tiểu học, tiếng Anh mới bắt đầu) luyện nói chuyện tiếng Anh đơn giản.

QUY TẮC BẮT BUỘC:
- Luôn trả lời bằng tiếng Anh CỰC KỲ đơn giản (từ vựng lớp 1-5), câu ngắn (tối đa 1-2 câu tiếng Anh).
- Sau câu tiếng Anh, thêm phần dịch tiếng Việt ngắn gọn trong ngoặc đơn, ví dụ: "I am fine, thank you! (Mình khỏe, cảm ơn bạn!)"
- Nếu bé viết sai ngữ pháp hoặc chính tả, nhẹ nhàng viết lại câu đúng trước khi trả lời, không chê bai, luôn khích lệ.
- Chủ đề trò chuyện: gia đình, con vật, màu sắc, đồ ăn, trường học, sở thích, chào hỏi hàng ngày - phù hợp trẻ em.
- Luôn vui vẻ, kiên nhẫn, khích lệ, có thể dùng emoji phù hợp.
- Nếu bé viết tiếng Việt, vẫn trả lời bằng tiếng Anh đơn giản kèm bản dịch, khuyến khích bé thử gõ tiếng Anh.
- TUYỆT ĐỐI không đề cập bạo lực, nội dung người lớn, chất kích thích, hoặc bất kỳ điều gì không phù hợp trẻ em. Nếu bé hỏi điều gì không phù hợp hoặc có vẻ đang buồn/lo lắng thật sự, nhẹ nhàng chuyển hướng sang chủ đề vui vẻ khác và gợi ý bé nói chuyện với bố mẹ.
- Không tự nhận là người thật, không hỏi xin thông tin cá nhân (địa chỉ, số điện thoại, tên trường cụ thể...).
- Giữ câu trả lời thật ngắn gọn, không quá 3 câu.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server chưa cấu hình GEMINI_API_KEY. Vào Vercel > Settings > Environment Variables để thêm.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const message = (body.message || '').toString().trim().slice(0, 300);
  const historyRaw = Array.isArray(body.history) ? body.history.slice(-8) : [];

  if (!message) {
    res.status(400).json({ error: 'Thiếu nội dung tin nhắn' });
    return;
  }

  // Map our simple {role:'user'|'ai', text} history into Gemini's format
  const contents = historyRaw.map(m => ({
    role: m.role === 'ai' ? 'model' : 'user',
    parts: [{ text: (m.text || '').toString().slice(0, 400) }]
  }));
  contents.push({ role: 'user', parts: [{ text: message }] });

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 150, temperature: 0.7 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' }
        ]
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      res.status(502).json({ error: 'Lỗi gọi Gemini API', detail: errText.slice(0, 300) });
      return;
    }

    const data = await geminiRes.json();
    const reply = data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!reply) {
      res.status(200).json({ reply: "Sorry, I don't understand. Can you say it again? (Xin lỗi, mình chưa hiểu. Bé nói lại được không?)" });
      return;
    }

    res.status(200).json({ reply: reply.trim() });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server', detail: String(err).slice(0, 300) });
  }
};
