import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export function auth(required = true) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      if (!required) return next();
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user exists and is active
      const user = await User.findById(payload.sub).select('status role plan');
      if (!user) return res.status(401).json({ error: 'User no longer exists' });
      
      if (user.status !== 'active') {
        return res.status(403).json({ error: `Your account is ${user.status}` });
      }

      req.user = { id: user._id, role: user.role, plan: user.plan };
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
