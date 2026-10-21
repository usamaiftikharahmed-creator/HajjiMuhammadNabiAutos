import ActivityLog from '../models/ActivityLog.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const logActivity = async ({
  req,
  user,
  action,
  module = 'System',
  details,
  targetId = '',
  targetName = '',
  metadata = {}
}) => {
  try {
    let resolvedUser = user || req?.user;

    const JWT_SECRET = process.env.JWT_SECRET || 'hajji_mohammad_nabi_autos_secret_key_2026_secure';
    // If req has token but no req.user yet, decode token
    if (!resolvedUser && req) {
      let token = req.cookies?.jwt;
      if (!token && req.headers?.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
      }
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          if (decoded?.id) {
            resolvedUser = await User.findById(decoded.id).select('name role');
          }
        } catch (e) {
          // Ignore token decode error
        }
      }
    }

    const userName = resolvedUser?.name || (resolvedUser?.role === 'owner' ? 'Owner / Admin' : 'Admin');
    const userRole = resolvedUser?.role || 'owner';
    const userId = resolvedUser?._id || null;

    const ipAddress = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';

    await ActivityLog.create({
      user: userId,
      userName,
      userRole,
      action,
      module,
      details,
      targetId: String(targetId || ''),
      targetName: String(targetName || ''),
      metadata,
      ipAddress: String(ipAddress)
    });
  } catch (error) {
    console.error('❌ Failed to log activity:', error.message);
  }
};
