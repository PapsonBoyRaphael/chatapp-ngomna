const express = require('express');
const { getLogin, postLogin, proceed } = require('../controllers/authController');

const router = express.Router();

router.get('/login', getLogin);
router.post('/login', postLogin);
router.get('/proceed', proceed); // Called from profile.ejs button

module.exports = router;