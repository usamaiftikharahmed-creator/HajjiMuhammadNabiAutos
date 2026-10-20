import express from 'express';
import ActivityLog from '../models/ActivityLog.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// 1. GET ALL ACTIVITY LOGS (Paginated + Filterable)
router.get('/', protect, authorize('owner'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 5));
    const skip = (page - 1) * limit;

    const { search, action, module: mod, startDate, endDate, user } = req.query;

    const query = {};

    if (action && action !== 'all') {
      query.action = action;
    }

    if (mod && mod !== 'all') {
      query.module = mod;
    }

    if (user && user !== 'all') {
      query.userName = { $regex: user, $options: 'i' };
    }

    if (search) {
      const s = search.trim();
      query.$or = [
        { details: { $regex: s, $options: 'i' } },
        { userName: { $regex: s, $options: 'i' } },
        { targetName: { $regex: s, $options: 'i' } },
        { action: { $regex: s, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const sDate = new Date(startDate);
        sDate.setHours(0, 0, 0, 0);
        query.createdAt.$gte = sDate;
      }
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = eDate;
      }
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(query)
    ]);

    res.json({
      success: true,
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. GET ACTIVITY STATS
router.get('/stats', protect, authorize('owner'), async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalLogs, todayLogs, topActions] = await Promise.all([
      ActivityLog.countDocuments(),
      ActivityLog.countDocuments({ createdAt: { $gte: startOfToday } }),
      ActivityLog.aggregate([
        { $group: { _id: '$module', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalLogs,
        todayLogs,
        moduleBreakdown: topActions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. CLEAR ALL LOGS (Owner Only)
router.delete('/clear', protect, authorize('owner'), async (req, res) => {
  try {
    await ActivityLog.deleteMany({});
    res.json({ success: true, message: 'All activity logs cleared.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
