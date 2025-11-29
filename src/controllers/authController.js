import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Joi from 'joi';

function signTokens(user) {
  const access = jwt.sign({ sub: user._id, role: user.role, plan: user.plan }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '15m' });
  const refresh = jwt.sign({ sub: user._id }, process.env.REFRESH_SECRET, { expiresIn: process.env.REFRESH_EXPIRES || '30d' });
  return { access, refresh };
}

export async function register(req, res) {
  const schema = Joi.object({
    name: Joi.string().min(2).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const exists = await User.findOne({ email: value.email });
  if (exists) return res.status(409).json({ error: 'Email already in use' });
  const user = new User({ name: value.name, email: value.email });
  await user.setPassword(value.password);
  await user.save();
  const tokens = signTokens(user);
  res.status(201).json({ user: { id: user._id, publicId: user.publicId, name: user.name, email: user.email, plan: user.plan }, ...tokens });
}

export async function login(req, res) {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const user = await User.findOne({ email: value.email });
  if (!user || !(await user.checkPassword(value.password))) return res.status(401).json({ error: 'Invalid credentials' });
  const tokens = signTokens(user);
  res.json({ user: { id: user._id, publicId: user.publicId, name: user.name, email: user.email, plan: user.plan }, ...tokens });
}

export async function changePassword(req, res) {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const user = await User.findById(req.user.id);
  if (!user || !(await user.checkPassword(value.currentPassword))) return res.status(400).json({ error: 'Current password incorrect' });
  await user.setPassword(value.newPassword);
  await user.save();
  res.json({ ok: true });
}
