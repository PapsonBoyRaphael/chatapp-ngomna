const express = require('express');
const verifyAgent = require('../../../application/useCases/verifyAgent');
const updateUnit = require('../../../application/useCases/updateUnit');

const router = express.Router();

router.get('/verify', (req, res) => {
  res.render('verify', { error: null });
});

router.post('/verify', async (req, res) => {
  const { matricule } = req.body;
  try {
    const agent = await verifyAgent.execute(matricule);
    res.render('updateUnit', { agent, error: null, roles: Object.keys(require('../../../config/roleHierarchy').ROLE_HIERARCHY) });
  } catch (error) {
    res.render('verify', { error: error.message });
  }
});

router.patch('/:matricule/unit', async (req, res) => {
  const { matricule } = req.params;
  const { unitId, role } = req.body;
  try {
    await updateUnit.execute(matricule, unitId, role);
    res.redirect('/agents/collaborators?matricule=' + matricule);
  } catch (error) {
    const agent = await verifyAgent.execute(matricule);
    res.render('updateUnit', { agent, error: error.message, roles: Object.keys(require('../../../config/roleHierarchy').ROLE_HIERARCHY) });
  }
});

router.get('/collaborators', (req, res) => {
  res.render('collaborators', { matricule: req.query.matricule });
});

module.exports = router;