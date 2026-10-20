import express from 'express';
import { 
  loginUser, logoutUser, getMe, registerUser, 
  getAllUsers, toggleUserStatus, deleteUser,
  verifyAdminPassword
} from '../controllers/authController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.post('/verify-admin', verifyAdminPassword);
router.get('/me', protect, getMe);

// Owner Only Protected Routes
router.post('/register', protect, authorize('owner'), registerUser);
router.get('/users', protect, authorize('owner'), getAllUsers);
router.patch('/users/:id/status', protect, authorize('owner'), toggleUserStatus);
router.delete('/users/:id', protect, authorize('owner'), deleteUser);

export default router;