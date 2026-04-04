const express = require('express');
const router = express.Router();
const logger = require('../logger');

// GET /status — lets the frontend know if scanning is available
router.get('/status', (req, res) => {
  res.json({ available: !!process.env.ANTHROPIC_API_KEY });
});

// POST / — accepts a base64 image and returns identified game info
router.post('/', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured. Add it to your .env file.' });
  }

  const { image, mimeType } = req.body;
  if (!image || !mimeType) return res.status(400).json({ error: 'image and mimeType are required' });

  // Lazy-require so the server still starts without the SDK if the key isn't set
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch {
    return res.status(503).json({ error: '@anthropic-ai/sdk not installed. Run: npm install @anthropic-ai/sdk' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Identify the video game shown in this image. Look at the cover art, case, cartridge, or disc carefully.

Return ONLY a valid JSON object — no markdown, no explanation — with exactly these fields:
{
  "title": "exact game title as printed (string, or null if unidentifiable)",
  "platform": "gaming platform name e.g. PlayStation 4, Nintendo Switch, Xbox 360, Game Boy Advance (string, or null)",
  "region": "one of: NTSC (USA), PAL (Europe), NTSC-J (Japan), Multi-Region — or null if unclear",
  "edition": "special edition name if visible e.g. Steelbook Edition, Collector's Edition, GOTY — or null",
  "confidence": "high | medium | low",
  "notes": "one-sentence observation about what you see"
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } },
          { type: 'text', text: prompt }
        ]
      }]
    });

    const raw = response.content[0].text.trim();
    // Strip any accidental markdown code fences
    const clean = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
    const result = JSON.parse(clean);

    logger.info('scan', `Identified: "${result.title}" / "${result.platform}" (${result.confidence})`);
    res.json(result);
  } catch (err) {
    logger.error('scan', err.message);
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: 'Could not parse AI response. Try a clearer photo.' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
