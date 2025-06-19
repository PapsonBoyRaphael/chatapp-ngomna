const express = require('express');
const searchUnits = require('../../../application/useCases/searchUnits');

const router = express.Router();

router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }
  try {
    const units = await searchUnits.execute(q);
    res.json(units);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;