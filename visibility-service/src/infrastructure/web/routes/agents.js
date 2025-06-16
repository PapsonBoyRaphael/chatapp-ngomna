const express = require('express');
const verifyAgent = require('../../../application/useCases/verifyAgent');

const router = express.Router();

router.get('/verify', (req, res) => {
  res.render('verify', { error: null });
});

router.post('/verify', async (req, res) => {
  const { matricule } = req.body;
  try {
    const agent = await verifyAgent.execute(matricule);
    res.render('updateUnit', { agent, error: null });
  } catch (error) {
    res.render('verify', { error: error.message });
  }
});

module.exports = router;