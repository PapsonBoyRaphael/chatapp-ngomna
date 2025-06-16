const Joi = require('joi');

const messageSchema = Joi.object({
  conversationId: Joi.string().required(),
  senderId: Joi.string().required(),
  content: Joi.string().max(10000).when('fileId', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required()
  }),
  type: Joi.string().valid('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'FILE').default('TEXT'),
  fileId: Joi.string().optional(),
  replyToId: Joi.string().optional(),
  metadata: Joi.object().optional()
});

const conversationSchema = Joi.object({
  title: Joi.string().max(100).optional(),
  type: Joi.string().valid('PRIVATE', 'GROUP', 'CHANNEL').default('PRIVATE'),
  participants: Joi.array().items(Joi.string()).min(1).required(),
  createdBy: Joi.string().required(),
  metadata: Joi.object().optional()
});

const fileUploadSchema = Joi.object({
  conversationId: Joi.string().required(),
  uploadedBy: Joi.string().required(),
  description: Joi.string().optional()
});

module.exports = {
  messageSchema,
  conversationSchema,
  fileUploadSchema
};
